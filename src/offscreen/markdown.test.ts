// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './markdown';

function md(html: string): string {
  return htmlToMarkdown(new DOMParser().parseFromString(html, 'text/html').body);
}

describe('htmlToMarkdown', () => {
  it('converts a paragraph', () => {
    expect(md('<p>Given an array of integers.</p>')).toBe('Given an array of integers.');
  });

  it('separates blocks with a blank line', () => {
    expect(md('<p>One.</p><p>Two.</p>')).toBe('One.\n\nTwo.');
  });

  it('keeps inline code as a code span rather than splitting the sentence', () => {
    expect(md('<p>Return <code>nums[i]</code> now.</p>')).toBe('Return `nums[i]` now.');
  });

  it('renders emphasis', () => {
    expect(md('<p><strong>Input:</strong> and <em>note</em></p>')).toBe('**Input:** and *note*');
  });

  it('turns <sup> into a caret, which is how constraints are read back', () => {
    // `1 <= n <= 10^4` is the single most common line in a LeetCode constraints block.
    // `<` is left unescaped on purpose: `<=` cannot open an HTML tag, and escaping every
    // comparison operator would make the raw Markdown harder to read than it protects.
    expect(md('<p>n &lt;= 10<sup>4</sup></p>')).toBe('n <= 10^4');
  });

  it('fences a <pre> example as plain text', () => {
    const out = md('<pre><strong>Input:</strong> nums = [2,7]\n<strong>Output:</strong> [0,1]</pre>');
    expect(out).toBe('```\nInput: nums = [2,7]\nOutput: [0,1]\n```');
  });

  it('does not apply markdown formatting inside a <pre>', () => {
    // The <strong> above must not become ** — these blocks are transcripts, not prose.
    expect(md('<pre><strong>Input:</strong> x</pre>')).not.toContain('**');
  });

  it('widens the fence when the code itself contains backticks', () => {
    const out = md('<pre>a ``` b</pre>');
    expect(out.startsWith('````')).toBe(true);
    expect(out.endsWith('````')).toBe(true);
  });

  it('pads a code span whose content is a backtick', () => {
    expect(md('<p><code>`</code></p>')).toBe('`` ` ``');
  });

  it('keeps an exponent inside a code span, where constraints actually live', () => {
    // textContent would give "104" — not a formatting loss but a wrong number, and this
    // is the single most common shape in a LeetCode constraints block.
    expect(md('<p><code>n &lt;= 10<sup>4</sup></code></p>')).toBe('`n <= 10^4`');
  });

  it('renders an unordered list', () => {
    expect(md('<ul><li>first</li><li>second</li></ul>')).toBe('- first\n- second');
  });

  it('numbers an ordered list', () => {
    expect(md('<ol><li>one</li><li>two</li></ol>')).toBe('1. one\n2. two');
  });

  it('indents a nested list under its parent item', () => {
    const out = md('<ul><li>outer<ul><li>inner</li></ul></li></ul>');
    expect(out).toBe('- outer\n\n  - inner');
  });

  it('keeps a list that follows a paragraph, which is how constraints arrive', () => {
    // The parser auto-closes <p> before <ul>, exactly as a browser does, so these end up
    // as siblings rather than nested. Both halves still have to survive.
    expect(md('<p>Constraints:<ul><li>n &gt;= 1</li></ul></p>')).toBe(
      'Constraints:\n\n- n >= 1',
    );
  });

  it('absolutises site-relative links, which would 404 from a repo', () => {
    expect(md('<p><a href="/problems/two-sum/">Two Sum</a></p>')).toBe(
      '[Two Sum](https://leetcode.com/problems/two-sum/)',
    );
  });

  it('leaves an absolute link alone', () => {
    expect(md('<p><a href="https://example.com">x</a></p>')).toBe('[x](https://example.com)');
  });

  it('keeps images, which LeetCode hosts absolutely', () => {
    expect(md('<img src="https://assets.leetcode.com/a.png" alt="tree">')).toBe(
      '![tree](https://assets.leetcode.com/a.png)',
    );
  });

  it('demotes headings so they sit under the README title', () => {
    // The problem README already owns `#`; an h1 from the statement must not rival it.
    expect(md('<h1>Follow-up</h1>')).toBe('## Follow-up');
    expect(md('<h5>Deep</h5>')).toBe('###### Deep');
  });

  it('turns <br> into a line break without starting a new block', () => {
    expect(md('<p>a<br>b</p>')).toBe('a\nb');
  });

  it('collapses the whitespace LeetCode pretty-prints into its markup', () => {
    expect(md('<p>\n  spread   over\n  lines\n</p>')).toBe('spread over lines');
  });

  it('converts non-breaking spaces, which appear throughout the statements', () => {
    expect(md('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('escapes emphasis characters in prose so they survive as literals', () => {
    expect(md('<p>a * b _ c</p>')).toBe('a \\* b \\_ c');
  });

  it('renders a table for database problems', () => {
    const out = md(
      '<table><tr><th>id</th><th>name</th></tr><tr><td>1</td><td>Ann</td></tr></table>',
    );
    expect(out).toBe('| id | name |\n| --- | --- |\n| 1 | Ann |');
  });

  it('drops empty blocks instead of emitting blank paragraphs', () => {
    expect(md('<p></p><p>  </p><p>real</p>')).toBe('real');
  });

  it('falls back to text content for a tag it does not know', () => {
    expect(md('<p>see <mark>this</mark> part</p>')).toBe('see this part');
  });

  it('returns an empty string for empty input', () => {
    expect(md('')).toBe('');
  });

  it('converts a realistic statement end to end', () => {
    const html = `
      <p>Given an array of integers <code>nums</code>, return indices.</p>
      <p>&nbsp;</p>
      <p><strong class="example">Example 1:</strong></p>
      <pre><strong>Input:</strong> nums = [2,7,11,15], target = 9
<strong>Output:</strong> [0,1]
</pre>
      <p><strong>Constraints:</strong></p>
      <ul>
        <li><code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code></li>
      </ul>`;

    expect(md(html)).toBe(
      [
        'Given an array of integers `nums`, return indices.',
        '**Example 1:**',
        '```\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\n```',
        '**Constraints:**',
        '- `2 <= nums.length <= 10^4`',
      ].join('\n\n'),
    );
  });
});
