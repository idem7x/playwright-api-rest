import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJson } from './store';

/**
 * Recorded model output for --mock runs (unit tests, CI dry runs, demos without an API key).
 * It contains the final answer (`cli.result`, as `claude -p --output-format json` would return it)
 * plus the file edits the model made with its tools.
 */
export interface MockFixture {
  description?: string;
  model: string;
  cli: { result: string | Record<string, unknown>; session_id?: string; num_turns?: number; total_cost_usd?: number };
  /** whole files written by the model */
  files?: Array<{ path: string; content: string }>;
  /** idempotent insertions: `text` is inserted before `before` unless already present */
  inserts?: Array<{ path: string; before: string; text: string }>;
  /** exact find/replace edits */
  replacements?: Array<{ path: string; find: string; replace: string }>;
  /** revise fixtures: shallow patch applied per caseId to the current proposal (written to proposal.json) */
  casePatches?: Record<string, Record<string, unknown>>;
}

export function loadFixture(file: string): MockFixture {
  return readJson<MockFixture>(file);
}

export function mockAnswer(f: MockFixture): string {
  return typeof f.cli.result === 'string' ? f.cli.result : JSON.stringify(f.cli.result, null, 2);
}

export function applyFixtureEdits(f: MockFixture): string[] {
  const touched: string[] = [];
  for (const file of f.files ?? []) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.content);
    touched.push(file.path);
  }
  for (const ins of f.inserts ?? []) {
    const src = fs.readFileSync(ins.path, 'utf-8');
    if (src.includes(ins.text)) continue;
    const at = src.indexOf(ins.before);
    if (at === -1) throw new Error(`mock insert: anchor ${JSON.stringify(ins.before)} not found in ${ins.path}`);
    fs.writeFileSync(ins.path, src.slice(0, at) + ins.text + src.slice(at));
    touched.push(ins.path);
  }
  for (const rep of f.replacements ?? []) {
    const src = fs.readFileSync(rep.path, 'utf-8');
    if (!src.includes(rep.find)) throw new Error(`mock replacement: text not found in ${rep.path}: ${rep.find.slice(0, 80)}`);
    fs.writeFileSync(rep.path, src.replace(rep.find, rep.replace));
    touched.push(rep.path);
  }
  return touched;
}
