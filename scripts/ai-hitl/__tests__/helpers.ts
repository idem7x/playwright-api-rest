import * as fs from 'node:fs';
import { loadRequirementFile } from '../requirements';
import { ProposalSchema, type Proposal } from '../schema';
import { loadFixture } from '../lib/mock';
import { withAiHeader } from '../lib/spec';
import { renderPrBody } from '../render-pr';

export const FIXTURE = loadFixture('scripts/ai-hitl/__fixtures__/propose-posts.json');
export const REVISE_FIXTURE = loadFixture('scripts/ai-hitl/__fixtures__/revise-posts.json');
export const POSTS_REQ = loadRequirementFile('requirements/posts.md');
export const ID = 'posts-20261121-2300';
export const SPEC = 'tests/ai/posts.spec.ts';

export function rawProposal(): Record<string, unknown> {
  return structuredClone({ ...(FIXTURE.cli.result as Record<string, unknown>), id: ID });
}

export function proposal(): Proposal {
  return ProposalSchema.parse(rawProposal());
}

export function generatedSpec(): string {
  const file = FIXTURE.files?.find(f => f.path === SPEC);
  if (!file) throw new Error('fixture has no spec');
  return withAiHeader(file.content, ID);
}

export function body(p: Proposal = proposal()): string {
  return renderPrBody(p, POSTS_REQ);
}

/** Tick one option of a case in a rendered body (like a reviewer clicking a checkbox). */
export function decide(md: string, caseId: string, option: 'accept' | 'edit' | 'reject', reason = ''): string {
  const start = md.indexOf(`#### ${caseId} `);
  if (start === -1) throw new Error(`no block for ${caseId}`);
  const end = md.indexOf('\n#### ', start + 1) === -1 ? md.indexOf('\n### ', start) : md.indexOf('\n#### ', start + 1);
  let block = md.slice(start, end);
  block = block.replace(`- [ ] ${option}`, `- [x] ${option}`);
  if (option === 'reject' && reason) block = block.replace(/reject — reason:.*/, `reject — reason: ${reason}`);
  return md.slice(0, start) + block + md.slice(end);
}

/** Remove the test tagged with the case from a spec source. */
export function removeTest(source: string, caseId: string): string {
  const start = source.lastIndexOf('\n  test(', source.indexOf(`@case:${caseId}'`));
  const next = source.indexOf('\n  test(', start + 1);
  const end = next === -1 ? source.lastIndexOf('\n});') : next;
  return source.slice(0, start) + source.slice(end);
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf-8');
}
