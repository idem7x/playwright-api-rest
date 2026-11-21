import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProposalSchema, type Proposal } from '../schema';

export const PROPOSALS_DIR = 'ai/proposals';
export const METRICS_LOG = 'ai/metrics/hitl-log.jsonl';
export const RESULTS_JSON = 'test-results/results.json';

export const proposalDir = (id: string) => path.posix.join(PROPOSALS_DIR, id);
export const proposalFile = (id: string) => path.posix.join(proposalDir(id), 'proposal.json');
export const runFile = (id: string) => path.posix.join(proposalDir(id), 'run.json');
export const prBodyFile = (id: string) => path.posix.join(proposalDir(id), 'pr-body.md');
export const generatedDir = (id: string) => path.posix.join(proposalDir(id), 'generated');

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function writeText(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

export function loadProposal(id: string): Proposal {
  const file = proposalFile(id);
  if (!fs.existsSync(file)) throw new Error(`Proposal not found: ${file}`);
  return ProposalSchema.parse(readJson(file));
}

/** Proposal id from a branch name like `ai/posts-20261121-2300` (used by the GitHub workflows). */
export function proposalIdFromBranch(branch: string): string | undefined {
  const m = /^ai\/([a-z0-9_]+-\d{8}-\d{4})$/.exec(branch);
  return m?.[1];
}

/** `<resource>-YYYYMMDD-HHmm` in UTC. */
export function newProposalId(resource: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}`;
  return `${resource}-${date}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
}

/** Spec files referenced by a proposal (automated cases), unique, sorted. */
export function specFilesOf(proposal: Proposal): string[] {
  return [...new Set(proposal.cases.filter(c => c.automate && c.specFile).map(c => c.specFile as string))].sort();
}

/** Snapshot = what the AI produced, kept so metrics can diff it against what got merged. */
export function snapshotSpecs(proposal: Proposal): string[] {
  const dir = generatedDir(proposal.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const copied: string[] = [];
  for (const spec of specFilesOf(proposal)) {
    if (!fs.existsSync(spec)) continue;
    const target = path.posix.join(dir, path.basename(spec));
    fs.copyFileSync(spec, target);
    copied.push(target);
  }
  return copied;
}

export function snapshotPath(proposalId: string, specFile: string): string {
  return path.posix.join(generatedDir(proposalId), path.basename(specFile));
}
