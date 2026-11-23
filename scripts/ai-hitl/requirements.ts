import * as fs from 'node:fs';
import * as path from 'node:path';

export type Priority = 'P0' | 'P1' | 'P2';

export interface RequirementItem {
  id: string;
  priority: Priority;
  text: string;
}

export interface RequirementFile {
  /** lowercase resource name, taken from the file name (`posts`) */
  resource: string;
  /** human description from the title line */
  title: string;
  /** primary endpoint (`/posts`) */
  endpoint: string;
  /** alternative endpoints from `(also ...)` */
  alsoEndpoints: string[];
  items: RequirementItem[];
}

const TITLE_RE = /^#\s+([A-Z0-9_]+)\s+[—–-]\s+(.+)$/;
const ENDPOINT_RE = /^Endpoint:\s+(\S+)(?:\s+\(also\s+(.+)\))?\s*$/;
const ITEM_RE = /^-\s+\*\*([A-Z0-9_]+-\d{2})\*\*\s+\((P[0-2])\):\s+(.+)$/;

export class RequirementsParseError extends Error {}

/**
 * Parse a requirement file (see requirements/README.md for the format).
 * Throws RequirementsParseError with all problems found, not just the first.
 */
export function parseRequirements(markdown: string, fileName: string): RequirementFile {
  const resource = path.basename(fileName, '.md').toLowerCase();
  const prefix = resource.toUpperCase();
  const problems: string[] = [];
  const lines = markdown.split(/\r?\n/);

  let title = '';
  let endpoint = '';
  let alsoEndpoints: string[] = [];
  let inRequirements = false;
  const items: RequirementItem[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const where = `${fileName}:${index + 1}`;

    if (!title && line.startsWith('# ')) {
      const m = TITLE_RE.exec(line);
      if (!m) {
        problems.push(`${where}: title must look like "# ${prefix} — <description>"`);
        return;
      }
      if (m[1] !== prefix) {
        problems.push(`${where}: title resource "${m[1]}" does not match file name (expected "${prefix}")`);
      }
      title = m[2].trim();
      return;
    }

    if (line.startsWith('Endpoint:')) {
      const m = ENDPOINT_RE.exec(line);
      if (!m) {
        problems.push(`${where}: endpoint line must look like "Endpoint: /path  (also /other)"`);
        return;
      }
      endpoint = m[1];
      alsoEndpoints = m[2] ? m[2].split(',').map(s => s.trim()).filter(Boolean) : [];
      return;
    }

    if (line.startsWith('## ')) {
      inRequirements = line.toLowerCase() === '## requirements';
      return;
    }

    if (!inRequirements || !line.startsWith('- ')) return;

    const m = ITEM_RE.exec(line);
    if (!m) {
      problems.push(`${where}: requirement line must look like "- **${prefix}-01** (P0): text"`);
      return;
    }
    const [, id, priority, text] = m;
    if (!id.startsWith(`${prefix}-`)) {
      problems.push(`${where}: requirement id ${id} must start with "${prefix}-"`);
    }
    if (seen.has(id)) {
      problems.push(`${where}: duplicate requirement id ${id}`);
    }
    seen.add(id);
    items.push({ id, priority: priority as Priority, text: text.trim() });
  });

  if (!title) problems.push(`${fileName}: missing title line "# ${prefix} — <description>"`);
  if (!endpoint) problems.push(`${fileName}: missing "Endpoint:" line`);
  if (items.length === 0) problems.push(`${fileName}: no requirements found under "## Requirements"`);

  if (problems.length > 0) {
    throw new RequirementsParseError(`Invalid requirement file:\n  - ${problems.join('\n  - ')}`);
  }

  return { resource, title, endpoint, alsoEndpoints, items };
}

export function loadRequirementFile(filePath: string): RequirementFile {
  return parseRequirements(fs.readFileSync(filePath, 'utf-8'), path.basename(filePath));
}

/** All requirement files in a directory (README.md excluded), sorted by name. */
export function loadAllRequirements(dir = 'requirements'): Array<RequirementFile & { file: string }> {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort()
    .map(f => ({ ...loadRequirementFile(path.join(dir, f)), file: path.posix.join(dir, f) }));
}
