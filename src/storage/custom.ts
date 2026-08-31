/**
 * User-defined platform descriptors, and the trust boundary that validates them.
 *
 * This is security-relevant, not merely defensive. The options page routes an
 * arbitrary imported JSON file through `migrate()`, so every field here can arrive
 * from a file someone else wrote — and `profileUrlTemplate` lands directly in an
 * `<a href>` on an extension-origin page with full `chrome.*` access. A `javascript:`
 * URL there is a real XSS vector, which is why the URL checks are absolute rather
 * than best-effort.
 */
import { BUILTIN_PLATFORM_IDS, CUSTOM_PREFIX, type PlatformId } from '@/platforms/types';

export type CustomSource = 'manual' | 'json' | 'scrape';

/** How one number is located: a dotted JSON path, or a CSS selector. */
export interface FieldRule {
  path: string;
  /** scrape only: read this attribute rather than the element's text. */
  attr?: string;
  /** Overrides the default stat label. */
  label?: string;
}

export interface CustomFields {
  solved?: FieldRule;
  rating?: FieldRule;
  ratingMax?: FieldRule;
  globalRank?: FieldRule;
  /** Display-only extras, capped so a hostile import cannot flood the card. */
  extra?: FieldRule[];
}

export interface CustomPlatform {
  id: PlatformId;
  displayName: string;
  /** #rrggbb. Card accent stripe only — never a data mark. */
  accent: string;
  source: CustomSource;
  /** Page to link to. https only. */
  profileUrlTemplate?: string;
  /** json/scrape endpoint. https, must contain {handle}. */
  urlTemplate?: string;
  fields?: CustomFields;
  /** Origin granted through chrome.permissions, e.g. "https://kenkoooo.com/*". */
  origin?: string;
  /** manual: the size of the sheet, shown as "45 of 191". Never the solved total. */
  target?: number;
  countsTowardTotal: boolean;
  chartRating: boolean;
}

export const MAX_CUSTOM_PLATFORMS = 20;
const MAX_EXTRA_FIELDS = 2;
const MAX_NAME = 40;
const MAX_PATH = 200;

const ID_RE = /^custom:[a-z0-9-]{1,48}$/;
const ACCENT_RE = /^#[0-9a-f]{6}$/i;
const BUILTIN = new Set<string>(BUILTIN_PLATFORM_IDS);

export function isCustomId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

/** `custom:striver-sde-sheet-7f3a` — slug for legibility, suffix for uniqueness. */
export function mintCustomId(displayName: string): PlatformId {
  const slug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'platform';
  // A random suffix means deleting and re-adding a platform of the same name starts
  // fresh, rather than silently inheriting the old counter and history.
  const suffix = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
  return `${CUSTOM_PREFIX}${slug}-${suffix}`;
}

/**
 * Only https survives. `javascript:` and `data:` are the XSS vectors; `http:` is
 * refused so a granted host permission can never be a cleartext origin.
 */
function safeUrlTemplate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    // {handle} is not URL-legal in every position, so substitute before parsing.
    const probe = new URL(value.replace(/\{handle\}/g, 'x'));
    return probe.protocol === 'https:' ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** The "https://host/*" match pattern for a template, for chrome.permissions. */
export function originOf(urlTemplate: string): string | undefined {
  try {
    return `${new URL(urlTemplate.replace(/\{handle\}/g, 'x')).origin}/*`;
  } catch {
    return undefined;
  }
}

function sanitizeRule(value: unknown): FieldRule | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rule = value as Partial<FieldRule>;
  if (typeof rule.path !== 'string') return undefined;

  const path = rule.path.trim();
  if (!path || path.length > MAX_PATH) return undefined;

  return {
    path,
    ...(typeof rule.attr === 'string' && rule.attr.trim() && { attr: rule.attr.trim() }),
    ...(typeof rule.label === 'string' && rule.label.trim() && {
      label: rule.label.trim().slice(0, MAX_NAME),
    }),
  };
}

function sanitizeFields(value: unknown): CustomFields | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<CustomFields>;

  const fields: CustomFields = {};
  for (const key of ['solved', 'rating', 'ratingMax', 'globalRank'] as const) {
    const rule = sanitizeRule(raw[key]);
    if (rule) fields[key] = rule;
  }

  const extra = Array.isArray(raw.extra)
    ? raw.extra.map(sanitizeRule).filter((r): r is FieldRule => r !== undefined).slice(0, MAX_EXTRA_FIELDS)
    : [];
  if (extra.length) fields.extra = extra;

  return Object.keys(fields).length ? fields : undefined;
}

/**
 * Validates one descriptor, returning undefined when it cannot be trusted. A bad
 * descriptor is dropped alone rather than failing the whole import — the same
 * "accepts any shape, keeps what it recognises" contract migrate() already had.
 */
export function sanitizeOne(value: unknown, taken: ReadonlySet<string>): CustomPlatform | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<CustomPlatform>;

  const id = raw.id;
  if (typeof id !== 'string' || !ID_RE.test(id) || BUILTIN.has(id) || taken.has(id)) return undefined;

  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
  if (!displayName) return undefined;

  const accent = typeof raw.accent === 'string' && ACCENT_RE.test(raw.accent) ? raw.accent : undefined;
  if (!accent) return undefined;

  const source = raw.source;
  if (source !== 'manual' && source !== 'json' && source !== 'scrape') return undefined;

  const urlTemplate = safeUrlTemplate(raw.urlTemplate);
  // A fetched platform with no usable endpoint could only ever produce errors.
  if (source !== 'manual' && (!urlTemplate || !urlTemplate.includes('{handle}'))) return undefined;

  const profileUrlTemplate = safeUrlTemplate(raw.profileUrlTemplate);
  const fields = sanitizeFields(raw.fields);
  if (source !== 'manual' && !fields?.solved && !fields?.rating) return undefined;

  const target =
    typeof raw.target === 'number' && Number.isFinite(raw.target) && raw.target > 0
      ? Math.min(1_000_000, Math.round(raw.target))
      : undefined;

  return {
    id,
    displayName: displayName.slice(0, MAX_NAME),
    accent,
    source,
    ...(profileUrlTemplate && { profileUrlTemplate }),
    ...(urlTemplate && { urlTemplate }),
    ...(fields && { fields }),
    ...(urlTemplate && originOf(urlTemplate) && { origin: originOf(urlTemplate) }),
    ...(target !== undefined && { target }),
    countsTowardTotal: raw.countsTowardTotal === true,
    chartRating: raw.chartRating === true,
  };
}

/**
 * Validates the whole list, first-wins on duplicate ids so imports are idempotent.
 *
 * The cap is deliberately *not* enforced here. `migrate()` runs on every single read, so
 * truncating would not merely reject an oversized import — it would silently delete the
 * user's own platforms and their hand-kept counts from storage on the very next read,
 * permanently and with no message. That is the exact loss `migrate()` goes out of its way
 * to avoid when it refuses to prune `custom:` keys.
 *
 * `MAX_CUSTOM_PLATFORMS` belongs at the point of creation instead, where a limit can be
 * explained and refused — see `atCustomPlatformLimit()`.
 */
export function sanitizeCustom(value: unknown): CustomPlatform[] {
  if (!Array.isArray(value)) return [];

  const taken = new Set<string>();
  const out: CustomPlatform[] = [];

  for (const entry of value) {
    const def = sanitizeOne(entry, taken);
    if (!def) continue;
    taken.add(def.id);
    out.push(def);
  }
  return out;
}

/** Whether adding another user-defined platform would exceed the supported limit. */
export function atCustomPlatformLimit(existing: readonly CustomPlatform[]): boolean {
  return existing.length >= MAX_CUSTOM_PLATFORMS;
}
