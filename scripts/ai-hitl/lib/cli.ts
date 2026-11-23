import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when the module is the entry point (`tsx scripts/ai-hitl/x.ts`), false when imported (unit tests). */
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(entry);
}

export interface ShResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a command without a shell (args are never interpolated). */
export function sh(cmd: string, args: string[], opts: SpawnSyncOptions & { quiet?: boolean } = {}): ShResult {
  const res = spawnSync(cmd, args, {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: opts.quiet === false ? 'inherit' : 'pipe',
    ...opts,
  });
  if (res.error) throw res.error;
  return { code: res.status ?? 1, stdout: String(res.stdout ?? ''), stderr: String(res.stderr ?? '') };
}

export function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

export function info(message: string): void {
  console.log(`• ${message}`);
}

/** Append markdown to the GitHub Actions job summary when running in CI. */
export function stepSummary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) fs.appendFileSync(file, `${markdown}\n`);
}

/** Expose a value to later workflow steps (`steps.<id>.outputs.<name>`). */
export function stepOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) fs.appendFileSync(file, `${name}=${value}\n`);
}

/** `git status --porcelain` paths (tracked changes + untracked files). */
export function changedPaths(): Set<string> {
  const res = sh('git', ['status', '--porcelain', '--untracked-files=all']);
  if (res.code !== 0) return new Set();
  return new Set(
    res.stdout
      .split('\n')
      .filter(Boolean)
      .map(l => l.slice(3).replace(/^"|"$/g, ''))
      .map(l => (l.includes(' -> ') ? l.split(' -> ')[1] : l)),
  );
}

export function table(rows: string[][]): string {
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)));
  return rows.map(r => r.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ')).join('\n');
}
