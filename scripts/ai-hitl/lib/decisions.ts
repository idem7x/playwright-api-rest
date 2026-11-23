/** Parsing the human-editable parts of the PR body: decision checkboxes, human-added coverage gaps, reviewer checklist. */

export type DecisionOption = 'accept' | 'edit' | 'reject';

export interface CaseDecision {
  caseId: string;
  /** options whose box is ticked (a valid decision has exactly one) */
  checked: DecisionOption[];
  /** text after "reason:" on the reject line (may be present even if unticked) */
  reason: string;
}

export interface ParsedBody {
  proposalId?: string;
  decisions: Map<string, CaseDecision>;
  gaps: Array<{ requirementId: string; reason: string }>;
  checklist: Map<string, boolean>;
}

export const GAPS_START = '<!-- ai-hitl:gaps -->';
export const GAPS_END = '<!-- /ai-hitl:gaps -->';
export const CHECKLIST_START = '<!-- ai-hitl:checklist -->';
export const CHECKLIST_END = '<!-- /ai-hitl:checklist -->';

const CASE_HEADING_RE = /^#{4}\s+([A-Z0-9_]+-TC-\d{2,3})\b/;
const SECTION_RE = /^#{1,4}\s/;
const OPTION_RE = /^\s*[-*]\s+\[([ xX])\]\s+(accept|edit|reject)\b(.*)$/;
const GAP_RE = /^\s*[-*]\s+\*\*([A-Z0-9_]+-\d{2})\*\*\s*[—–:-]+\s*(.*)$/;
const CHECK_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/;

function between(body: string, start: string, end: string): string[] {
  const s = body.indexOf(start);
  const e = body.indexOf(end, s + 1);
  if (s === -1 || e === -1) return [];
  return body.slice(s + start.length, e).split(/\r?\n/);
}

export function parseBody(body: string): ParsedBody {
  const lines = body.split(/\r?\n/);
  const decisions = new Map<string, CaseDecision>();
  let current: CaseDecision | undefined;

  for (const line of lines) {
    const heading = CASE_HEADING_RE.exec(line);
    if (heading) {
      current = { caseId: heading[1], checked: [], reason: '' };
      decisions.set(current.caseId, current);
      continue;
    }
    if (SECTION_RE.test(line)) {
      current = undefined;
      continue;
    }
    if (!current) continue;
    const opt = OPTION_RE.exec(line);
    if (!opt) continue;
    const option = opt[2] as DecisionOption;
    if (opt[1].toLowerCase() === 'x') current.checked.push(option);
    if (option === 'reject') {
      const r = /reason:\s*(.*)$/i.exec(opt[3]);
      current.reason = (r?.[1] ?? '').trim();
    }
  }

  const gaps = between(body, GAPS_START, GAPS_END)
    .map(l => GAP_RE.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ requirementId: m[1], reason: m[2].trim() }));

  const checklist = new Map<string, boolean>();
  for (const l of between(body, CHECKLIST_START, CHECKLIST_END)) {
    const m = CHECK_RE.exec(l);
    if (m) checklist.set(m[2].trim(), m[1].toLowerCase() === 'x');
  }

  const id = /<!--\s*ai-hitl:proposal=([^\s>]+)\s*-->/.exec(body)?.[1];
  return { proposalId: id, decisions, gaps, checklist };
}

/** The single decision of a case, or undefined if zero / several boxes are ticked. */
export function decisionOf(d?: CaseDecision): DecisionOption | undefined {
  return d && d.checked.length === 1 ? d.checked[0] : undefined;
}
