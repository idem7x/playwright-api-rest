import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

/** Load scripts/ai-hitl/prompts/<name>.md and replace {{KEY}} placeholders. Unknown placeholders are an error. */
export function renderPrompt(name: string, vars: Record<string, string>): string {
  const template = fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), 'utf-8');
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt ${name}.md: no value for {{${key}}}`);
    return vars[key];
  });
}

export function conventions(): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, 'conventions.md'), 'utf-8').replace(/^# .*\n/, '');
}
