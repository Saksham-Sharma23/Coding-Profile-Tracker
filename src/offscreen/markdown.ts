/**
 * Converts LeetCode's problem-statement HTML into Markdown.
 *
 * Lives beside extract.ts and follows the same rule: a pure function over a parsed DOM,
 * so it unit-tests against captured markup with no chrome APIs. The service worker has
 * no DOMParser, which is why this runs in the offscreen document rather than on the
 * push path directly.
 *
 * Scoped to the subset LeetCode actually emits — paragraphs, <pre> examples, lists,
 * inline code, <sup> exponents in constraints, images and links — rather than being a
 * general HTML converter. Anything unrecognised degrades to its text content, so a new
 * tag loses formatting but never loses the statement.
 */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * Stands in for a <br> until whitespace has been collapsed.
 *
 * Source HTML is pretty-printed, so text nodes are full of newlines that must collapse
 * to single spaces — but a <br> is a line break the author meant. Once both are plain
 * "\n" in the same string they are indistinguishable, so the deliberate one is carried
 * as a character that cannot occur in real content and restored afterwards.
 */
const LINE_BREAK = '\u0000';

/** Rendered as their own block, flushing any inline text collected before them. */
const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'UL',
  'OL',
  'PRE',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'TABLE',
]);

export function htmlToMarkdown(root: Node): string {
  return renderChildren(root)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Walks a node's children, emitting one string per block.
 *
 * Inline runs are buffered and flushed when a block element interrupts them, which is
 * what keeps `text <code>x</code> more text` on a single line instead of fragmenting
 * into three paragraphs.
 */
function renderChildren(node: Node): string[] {
  const blocks: string[] = [];
  let inline = '';

  const flush = () => {
    const trimmed = collapse(inline).trim();
    if (trimmed) blocks.push(trimmed);
    inline = '';
  };

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === ELEMENT_NODE && BLOCK_TAGS.has((child as Element).tagName)) {
      flush();
      blocks.push(...renderBlock(child as Element));
    } else {
      inline += renderInline(child);
    }
  }

  flush();
  return blocks.filter(Boolean);
}

function renderBlock(el: Element): string[] {
  switch (el.tagName) {
    case 'PRE':
      return [renderPre(el)];

    case 'UL':
    case 'OL':
      return [renderList(el, el.tagName === 'OL')];

    case 'HR':
      return ['---'];

    case 'TABLE':
      return [renderTable(el)];

    case 'BLOCKQUOTE':
      return [
        renderChildren(el)
          .join('\n\n')
          .split('\n')
          .map((line) => `> ${line}`.trimEnd())
          .join('\n'),
      ];

    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      // Shifted down one level: the problem README already owns `#`, so an <h1> in the
      // statement must not compete with the title for the top of the outline.
      const level = Math.min(6, Number(el.tagName[1]) + 1);
      const text = collapse(renderInline(el)).trim();
      return text ? [`${'#'.repeat(level)} ${text}`] : [];
    }

    default:
      // P and DIV. Recursing rather than treating them as inline matters because
      // LeetCode nests <ul> inside <p> in the constraints section.
      return renderChildren(el);
  }
}

/**
 * Example blocks.
 *
 * LeetCode marks up the labels inside <pre> (`<strong>Input:</strong> nums = [2,7]`),
 * so the inner text is taken verbatim and fenced as plain text. Fencing with a language
 * would be a lie — these blocks are input/output transcripts, not code — and leaving
 * them unfenced would let Markdown eat the brackets and asterisks.
 */
function renderPre(el: Element): string {
  const code = el.querySelector('code');
  const raw = (code ?? el).textContent ?? '';
  const body = raw.replace(/ /g, ' ').replace(/\s+$/, '');
  if (!body.trim()) return '';

  // A body containing ``` would break out of the fence; widen the fence instead.
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(body) + 1));
  return `${fence}\n${body}\n${fence}`;
}

function renderList(el: Element, ordered: boolean): string {
  const lines: string[] = [];
  let index = 1;

  for (const li of Array.from(el.children)) {
    if (li.tagName !== 'LI') continue;

    const marker = ordered ? `${index++}.` : '-';
    const blocks = renderChildren(li);
    const body = blocks.join('\n\n').trim();
    if (!body) continue;

    // Continuation lines are indented to the marker's width so nested lists and
    // multi-line items stay inside the item rather than closing it.
    const indent = ' '.repeat(marker.length + 1);
    const [first = '', ...rest] = body.split('\n');
    lines.push(`${marker} ${first}`, ...rest.map((line) => (line ? indent + line : '')));
  }

  return lines.join('\n');
}

/** Basic GitHub-flavoured table. LeetCode uses these for database problems. */
function renderTable(el: Element): string {
  const rows = Array.from(el.querySelectorAll('tr'));
  if (!rows.length) return '';

  const cells = rows.map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) =>
      collapse(renderInline(cell)).trim().replace(/\|/g, '\\|'),
    ),
  );

  const width = Math.max(...cells.map((row) => row.length));
  if (!width) return '';

  const pad = (row: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;

  const [header = [], ...body] = cells;
  return [pad(header), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(pad)].join('\n');
}

function renderInline(node: Node): string {
  if (node.nodeType === TEXT_NODE) return escapeText(node.textContent ?? '');
  if (node.nodeType !== ELEMENT_NODE) return '';

  const el = node as Element;
  const inner = () => Array.from(el.childNodes).map(renderInline).join('');

  switch (el.tagName) {
    case 'CODE': {
      // Inner text, not inner markdown — escapes inside a code span are literal.
      //
      // Not textContent, though: LeetCode wraps whole constraints in <code>, exponents
      // included, and textContent would flatten `10<sup>4</sup>` to "104" — a different
      // and much smaller number, stated as fact. codeText() keeps the caret.
      const text = codeText(el);
      if (!text) return '';
      const fence = '`'.repeat(longestBacktickRun(text) + 1);
      // Pad when the content touches a backtick, or the fences merge with it.
      const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
      return `${fence}${pad}${text}${pad}${fence}`;
    }

    case 'STRONG':
    case 'B': {
      const text = inner().trim();
      return text ? `**${text}**` : '';
    }

    case 'EM':
    case 'I': {
      const text = inner().trim();
      return text ? `*${text}*` : '';
    }

    case 'BR':
      return LINE_BREAK;

    case 'SUP': {
      // Constraints are full of `10<sup>4</sup>`; `10^4` is how people read it back.
      const text = (el.textContent ?? '').trim();
      return text ? `^${text}` : '';
    }

    case 'SUB': {
      const text = (el.textContent ?? '').trim();
      return text ? `_${text}` : '';
    }

    case 'IMG': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      // Statement diagrams are hosted absolutely on assets.leetcode.com, so they render
      // straight from the committed Markdown with no asset copying.
      return src ? `![${alt}](${src})` : '';
    }

    case 'A': {
      const href = el.getAttribute('href') ?? '';
      const text = inner().trim() || href;
      if (!href) return text;
      // Site-relative links would 404 from inside a GitHub repo.
      const absolute = href.startsWith('/') ? `https://leetcode.com${href}` : href;
      return `[${text}](${absolute})`;
    }

    default:
      return inner();
  }
}

/**
 * Escapes only what would otherwise change the document's structure.
 *
 * Deliberately conservative. Statements are dense with `nums[i]`, `*`, and `_` inside
 * prose, and escaping every one of them produces Markdown that is uglier in the raw
 * file than the formatting it protects. Backslashes and the emphasis characters are
 * escaped; brackets are left alone because a stray `[` without a following `(` is inert.
 */
function escapeText(text: string): string {
  return text.replace(/ /g, ' ').replace(/([\\*_])/g, '\\$1');
}

/**
 * Collapses the whitespace HTML pretty-printing leaves behind, preserving only the
 * breaks a <br> actually asked for.
 *
 * The order matters: every whitespace run — newlines from source indentation included —
 * becomes a single space first, and only then does the sentinel turn back into a real
 * newline. Doing it the other way round would leave source formatting in the output.
 */
function collapse(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .join('\n');
}

/**
 * Plain text for a code span, with superscripts kept as carets.
 *
 * A code span cannot contain formatting, so everything else is flattened — but an
 * exponent is part of the value, not decoration. Losing it turns `10^4` into `104`,
 * which is not a formatting regression but a wrong number.
 */
function codeText(el: Element): string {
  let out = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === ELEMENT_NODE && (child as Element).tagName === 'SUP') {
      const exponent = (child.textContent ?? '').trim();
      if (exponent) out += `^${exponent}`;
      continue;
    }
    out += child.textContent ?? '';
  }
  return out.replace(/ /g, ' ');
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}
