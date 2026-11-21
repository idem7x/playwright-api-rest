/** Reading Playwright's JSON reporter output (test-results/results.json, configured in playwright.config.ts). */

export type RunStatus = 'passed' | 'failed' | 'flaky' | 'skipped' | 'not-run' | 'not-automated';

export interface ResultEntry {
  file: string;
  title: string;
  tags: string[];
  status: RunStatus;
  error?: string;
  durationMs: number;
}

interface PwResult {
  status?: string;
  duration?: number;
  error?: { message?: string };
  errors?: Array<{ message?: string }>;
}
interface PwTest {
  status?: string;
  results?: PwResult[];
}
interface PwSpec {
  title: string;
  file: string;
  tags?: string[];
  tests?: PwTest[];
}
interface PwSuite {
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}
export interface PwReport {
  suites?: PwSuite[];
  stats?: { startTime?: string };
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function firstErrorLine(message?: string): string | undefined {
  if (!message) return undefined;
  const line = message.replace(ANSI_RE, '').split('\n').map(l => l.trim()).find(l => l.length > 0);
  return line ? line.slice(0, 300) : undefined;
}

function mapStatus(test: PwTest): RunStatus {
  switch (test.status) {
    case 'expected':
      return test.results?.every(r => r.status === 'skipped') ? 'skipped' : 'passed';
    case 'unexpected':
      return 'failed';
    case 'flaky':
      return 'flaky';
    case 'skipped':
      return 'skipped';
    default:
      return 'not-run';
  }
}

/** Flatten the reporter tree into one entry per spec (first project). Tags are normalised to start with "@". */
export function flattenResults(report: PwReport): ResultEntry[] {
  const out: ResultEntry[] = [];
  const walk = (suite: PwSuite) => {
    for (const spec of suite.specs ?? []) {
      const test = spec.tests?.[0];
      if (!test) continue;
      const last = test.results?.[test.results.length - 1];
      out.push({
        file: spec.file,
        title: spec.title,
        tags: (spec.tags ?? []).map(t => (t.startsWith('@') ? t : `@${t}`)),
        status: mapStatus(test),
        error: firstErrorLine(last?.error?.message ?? last?.errors?.[0]?.message),
        durationMs: (test.results ?? []).reduce((sum, r) => sum + (r.duration ?? 0), 0),
      });
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of report.suites ?? []) walk(s);
  return out;
}
