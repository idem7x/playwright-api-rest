/**
 * Light-weight static analysis of Playwright spec files: finds `test('title', { tag: [...] }, ...)`
 * declarations, their tags and the source segment belonging to each test.
 * Deliberately regex based (no TS compiler API) — good enough for the repo style, documented as a limitation.
 */

export interface SpecTest {
  title: string;
  tags: string[];
  /** `@case:POSTS-TC-01` → `POSTS-TC-01` */
  caseId?: string;
  /** `@req:POSTS-01` → `POSTS-01` */
  reqIds: string[];
  line: number;
  /** source of the whole `test(...)` call */
  segment: string;
}

export const AI_HEADER_PREFIX = '// @ai-generated proposal:';

export function aiHeader(proposalId: string): string {
  return `${AI_HEADER_PREFIX}${proposalId} — requires human review before merge`;
}

/** Insert or replace the AI header as the first line. */
export function withAiHeader(source: string, proposalId: string): string {
  const lines = (source.charCodeAt(0) === 0xfeff ? source.slice(1) : source).split('\n');
  if (lines[0]?.startsWith(AI_HEADER_PREFIX)) lines.shift();
  return [aiHeader(proposalId), ...lines].join('\n');
}

export function readAiHeaderProposal(source: string): string | undefined {
  const first = source.split('\n', 1)[0] ?? '';
  if (!first.startsWith(AI_HEADER_PREFIX)) return undefined;
  return first.slice(AI_HEADER_PREFIX.length).split(/\s/)[0];
}

// test( 'title' , { ...options } ,   — but not test.describe( / test.afterEach( / foo.test(
const TEST_DECL_RE = /(^|[^.\w$])test\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2\s*(?:,\s*(\{[^{}]*\}))?/g;
const TAG_ARRAY_RE = /tag\s*:\s*\[([^\]]*)\]/;
const TAG_SINGLE_RE = /tag\s*:\s*(['"`])([^'"`]+)\1/;
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

export function parseSpec(source: string): SpecTest[] {
  const matches: Array<{ index: number; title: string; options?: string }> = [];
  for (const m of source.matchAll(TEST_DECL_RE)) {
    const index = (m.index ?? 0) + m[1].length;
    matches.push({ index, title: m[3], options: m[4] });
  }

  return matches.map((m, i) => {
    const limit = i + 1 < matches.length ? matches[i + 1].index : source.length;
    const end = Math.min(callEnd(source, m.index + 'test'.length), limit);
    const tags = extractTags(m.options);
    const caseTag = tags.find(t => t.startsWith('@case:'));
    return {
      title: m.title,
      tags,
      caseId: caseTag?.slice('@case:'.length),
      reqIds: tags.filter(t => t.startsWith('@req:')).map(t => t.slice('@req:'.length)),
      line: source.slice(0, m.index).split('\n').length,
      segment: source.slice(m.index, end),
    };
  });
}

/**
 * Index just after the call whose "(" is at `open` (plus a trailing ";"), skipping strings and comments.
 * Template literal `${...}` is treated as plain string content (fine for test code). Returns source.length if unbalanced.
 */
function callEnd(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) return source.length;
    } else if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2) + 1;
      if (i === 0) return source.length;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === '\\') i++;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return source[i + 1] === ';' ? i + 2 : i + 1;
    }
  }
  return source.length;
}

function extractTags(options?: string): string[] {
  if (!options) return [];
  const arr = TAG_ARRAY_RE.exec(options);
  if (arr) return [...arr[1].matchAll(STRING_RE)].map(s => s[2]);
  const single = TAG_SINGLE_RE.exec(options);
  return single ? [single[2]] : [];
}

/** Lines that matter for a diff: trimmed, blank lines dropped. */
export function normalizedLines(segment: string): string[] {
  return segment
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

/** Number of added + removed lines between two segments (LCS based line diff). */
export function changedLineCount(before: string, after: string): number {
  const a = normalizedLines(before);
  const b = normalizedLines(after);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lcs = dp[0][0];
  return a.length - lcs + (b.length - lcs);
}

export interface SpecProblem {
  file: string;
  line: number;
  message: string;
}

/** Tag rules every spec under tests/ai/ must satisfy. */
export function checkAiSpec(file: string, source: string): SpecProblem[] {
  const problems: SpecProblem[] = [];
  if (!readAiHeaderProposal(source)) {
    problems.push({ file, line: 1, message: `first line must be "${AI_HEADER_PREFIX}<id> — requires human review before merge"` });
  }
  const tests = parseSpec(source);
  if (tests.length === 0) problems.push({ file, line: 1, message: 'no tests found' });
  for (const t of tests) {
    if (!t.tags.includes('@ai-generated')) {
      problems.push({ file, line: t.line, message: `test "${t.title}" is missing tag @ai-generated` });
    }
    if (t.reqIds.length === 0) {
      problems.push({ file, line: t.line, message: `test "${t.title}" has no @req:<ID> tag` });
    }
    if (!t.caseId) {
      problems.push({ file, line: t.line, message: `test "${t.title}" has no @case:<CASE-ID> tag` });
    }
  }
  return problems;
}
