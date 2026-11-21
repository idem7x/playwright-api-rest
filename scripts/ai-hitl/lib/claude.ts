import { sh } from './cli';

/** Shape of `claude -p --output-format json` (only the fields we use). */
export interface ClaudeCliResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  session_id?: string;
  num_turns?: number;
  total_cost_usd?: number;
}

export interface ClaudeRunOptions {
  prompt: string;
  model: string;
  maxTurns: number;
  /** paths (relative to repo root, glob) Claude may create/modify */
  writablePaths: string[];
  /** continue an earlier session (used for "fix your answer" retries) */
  resume?: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/**
 * Headless Claude Code call. Tool access is an allow-list: read-only tools everywhere,
 * file edits only under `writablePaths`, no shell, no network. Prompt goes through stdin
 * so it never shows up in the process list.
 */
export function runClaude(opts: ClaudeRunOptions): ClaudeCliResult {
  const writeRules = opts.writablePaths.flatMap(p => [`Edit(${p})`, `Write(${p})`]);
  const args = [
    '-p',
    '--output-format', 'json',
    '--max-turns', String(opts.maxTurns),
    '--model', opts.model,
    '--allowedTools', ['Read', 'Glob', 'Grep', ...writeRules].join(','),
    '--disallowedTools', ['Bash', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit'].join(','),
  ];
  if (opts.resume) args.push('--resume', opts.resume);

  const res = sh('claude', args, { input: opts.prompt, timeout: 20 * 60 * 1000 });
  let parsed: ClaudeCliResult;
  try {
    parsed = JSON.parse(res.stdout) as ClaudeCliResult;
  } catch {
    throw new Error(`claude CLI did not return JSON (exit ${res.code}):\n${res.stderr.slice(0, 2000) || res.stdout.slice(0, 2000)}`);
  }
  if (res.code !== 0 || parsed.is_error) {
    throw new Error(`claude CLI failed (exit ${res.code}, subtype ${parsed.subtype ?? '?'}): ${String(parsed.result ?? res.stderr).slice(0, 2000)}`);
  }
  return parsed;
}

/** Fail early with a clear message instead of letting the CLI hang on an interactive login. */
export function assertClaudeAvailable(): void {
  if (!process.env.ANTHROPIC_API_KEY && process.env.AI_HITL_ALLOW_CLAUDE_LOGIN !== '1') {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Export it, run with --mock, or set AI_HITL_ALLOW_CLAUDE_LOGIN=1 ' +
        'to use an existing `claude` CLI login on this machine.',
    );
  }
  const v = sh('claude', ['--version']);
  if (v.code !== 0) throw new Error('`claude` CLI not found. Install it with: npm i -g @anthropic-ai/claude-code');
}
