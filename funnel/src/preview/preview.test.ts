import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PLACEHOLDER_CARLA_QUOTE, PLACEHOLDER_MARK, PLACEHOLDER_REVIEWS } from './placeholders';

/** Every file under a folder, as text. */
function texts(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && /\.(js|html|css)$/.test(f.name))
    .map((f) => readFileSync(join(f.parentPath, f.name), 'utf8'));
}

function build(env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), 'funnel-build-'));
  const { FUNNEL_PREVIEW: _, ...base } = process.env;
  const run = Bun.spawnSync(['bunx', 'vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: join(import.meta.dir, '../..'),
    env: { ...base, ...env },
  });
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
  const all = texts(out).join('\n');
  rmSync(out, { recursive: true, force: true });
  return all;
}

const NEEDLES = [PLACEHOLDER_MARK, PLACEHOLDER_CARLA_QUOTE.text.slice(0, 40), ...PLACEHOLDER_REVIEWS.flatMap((r) => [r.author, r.text.slice(0, 40)])];

describe('placeholder texts (Rahim, Nov 18) never reach walkito.site/go', () => {
  test('the production bundle has none of them', () => {
    const prod = build({});
    for (const needle of NEEDLES) expect(prod.includes(needle), needle).toBe(false);
  }, 60_000);

  test('a preview build does carry them, so the check above is looking at the right strings', () => {
    const preview = build({ FUNNEL_PREVIEW: '1' });
    for (const needle of NEEDLES) expect(preview.includes(needle), needle).toBe(true);
  }, 60_000);
});
