import { z } from 'zod';
import type { RequirementFile } from './requirements';

export const PrioritySchema = z.enum(['P0', 'P1', 'P2']);

export const CaseSchema = z.object({
  caseId: z.string().regex(/^[A-Z0-9_]+-TC-\d{2,3}$/, 'caseId must look like "POSTS-TC-01"'),
  title: z.string().regex(/^(GET|POST|PUT|PATCH|DELETE) - Should .+/, 'title must follow repo style "POST - Should ..."'),
  covers: z.array(z.string().min(1)).min(1, 'a case must cover at least one requirement'),
  priority: PrioritySchema,
  rationale: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  openQuestions: z.array(z.string()),
  automate: z.boolean(),
  specFile: z.string().optional(),
});

export const CoverageGapSchema = z.object({
  requirementId: z.string().min(1),
  reason: z.string().min(1),
});

export const RevisionSchema = z.object({
  at: z.string(),
  by: z.string(),
  instruction: z.string(),
});

export const ProposalSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+-\d{8}-\d{4}$/, 'id must look like "<resource>-YYYYMMDD-HHmm"'),
  requirementFile: z.string().min(1),
  model: z.string().min(1),
  createdAt: z.string().min(1),
  cases: z.array(CaseSchema).min(1),
  coverageGaps: z.array(CoverageGapSchema),
  revisions: z.array(RevisionSchema),
});

export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalCase = z.infer<typeof CaseSchema>;
export type CoverageGap = z.infer<typeof CoverageGapSchema>;

export type ValidationResult =
  | { ok: true; proposal: Proposal; errors: [] }
  | { ok: false; proposal?: undefined; errors: string[] };

/**
 * Structural validation (zod) + the HITL contract rules:
 *  - every requirement ID of the source file is in some case.covers or in coverageGaps;
 *  - cases/gaps only reference IDs that exist in the source file;
 *  - caseIds are unique; automated cases point at a spec file.
 */
export function validateProposal(raw: unknown, requirements: RequirementFile): ValidationResult {
  const parsed = ProposalSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }

  const proposal = parsed.data;
  const errors: string[] = [];
  const known = new Set(requirements.items.map(i => i.id));
  const covered = new Set<string>();
  const caseIds = new Set<string>();

  for (const c of proposal.cases) {
    if (caseIds.has(c.caseId)) errors.push(`cases: duplicate caseId ${c.caseId}`);
    caseIds.add(c.caseId);
    for (const id of c.covers) {
      if (!known.has(id)) errors.push(`cases.${c.caseId}.covers: unknown requirement id ${id}`);
      covered.add(id);
    }
    if (c.automate && !c.specFile) errors.push(`cases.${c.caseId}: automate=true requires specFile`);
    if (c.specFile && !c.specFile.startsWith('tests/ai/')) {
      errors.push(`cases.${c.caseId}.specFile: generated specs must live under tests/ai/ (got ${c.specFile})`);
    }
  }

  const gapIds = new Set<string>();
  for (const g of proposal.coverageGaps) {
    if (!known.has(g.requirementId)) errors.push(`coverageGaps: unknown requirement id ${g.requirementId}`);
    gapIds.add(g.requirementId);
  }

  for (const id of known) {
    if (!covered.has(id) && !gapIds.has(id)) {
      errors.push(`coverage: requirement ${id} is neither covered by a case nor listed in coverageGaps`);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, proposal, errors: [] };
}

/** Pull the Proposal JSON object out of a model answer (tolerates ```json fences and surrounding prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model answer');
  return JSON.parse(candidate.slice(start, end + 1));
}
