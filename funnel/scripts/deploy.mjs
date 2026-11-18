#!/usr/bin/env node
/**
 * Build the funnel and upload it to the droplet, where walkito.site serves it
 * at /go/ (deploy/walkito-funnel.conf).
 *
 *   bun run deploy                  production env from ~/.walkito/funnel.env
 *   bun run deploy --dry-run        build and show what would change
 *
 * The keys in the build are public by design (Supabase anon key, RevenueCat
 * Web Billing public key, PostHog project key, pixel id). They are still kept
 * out of the repository: they come from ~/.walkito/funnel.env, whose lines
 * look like FUNNEL_RC_KEY=rcb_..., and Vite reads them from the environment.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = process.env.DEPLOY_TARGET || 'root@161.35.52.54:/var/www/walkito-funnel/go/';
const DRY = process.argv.includes('--dry-run');
const ENV_FILE = join(homedir(), '.walkito', 'funnel.env');

const env = { ...process.env };
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = line.match(/^\s*(FUNNEL_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
for (const key of ['FUNNEL_SUPABASE_URL', 'FUNNEL_SUPABASE_ANON_KEY', 'FUNNEL_RC_KEY', 'FUNNEL_POSTHOG_KEY']) {
  if (!env[key]) {
    console.error(`deploy: ${key} is not set (in ${ENV_FILE} or the environment). Nothing built.`);
    process.exit(1);
  }
}
// Rahim's placeholder doctor quote and reviews (src/preview/placeholders.ts)
// reach walkito.site/go only when asked for by name, never from a stray env var.
delete env.FUNNEL_PREVIEW;
if (process.argv.includes('--with-placeholders')) {
  env.FUNNEL_PREVIEW = '1';
  console.warn('deploy: --with-placeholders: the NOT REAL doctor quote and reviews go to walkito.site/go. Redeploy without it before any ad traffic.');
}
if (env.FUNNEL_RC_KEY.startsWith('rcb_sb_')) console.warn('deploy: FUNNEL_RC_KEY is a SANDBOX key. Purchases will not be charged.');
if (!env.FUNNEL_PIXEL_ID) console.warn('deploy: no FUNNEL_PIXEL_ID, Meta pixel and CAPI stay off.');

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env });
run('bash', ['scripts/fetch-media.sh']);
run('bun', ['test']);
run('bun', ['run', 'build']);
run('rsync', ['-rlz', '--checksum', '--delete', '--exclude=*.map', ...(DRY ? ['--dry-run', '-i'] : []), 'dist/', TARGET]);
console.log(DRY ? 'deploy: dry run, nothing uploaded.' : `deploy: uploaded to ${TARGET}`);
