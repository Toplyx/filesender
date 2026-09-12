import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'));
if (!dryRun && config.d1_databases[0].database_id === '00000000-0000-4000-8000-000000000000') {
  console.error('Nejdřív nastav databázi příkazem pnpm run configure. Postup je v NAVOD.md.');
  process.exit(1);
}
function run(relativePath, args) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(relativePath, import.meta.url)), ...args], {cwd: root, stdio: 'inherit'});
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('../node_modules/vinext/dist/cli.js', ['build']);
run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', 'dist/server/wrangler.json', ...(dryRun ? ['--dry-run'] : [])]);
