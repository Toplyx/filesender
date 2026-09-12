import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const configUrl = new URL('../wrangler.json', import.meta.url);
const config = JSON.parse(await readFile(configUrl, 'utf8'));
const input = createInterface({ input: stdin, output: stdout });
try {
  const id = (process.argv[2] || await input.question('Vlož database_id databáze filesender-db: ')).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || id === '00000000-0000-4000-8000-000000000000') throw new Error('Vlož skutečné database_id z příkazu wrangler d1 create filesender-db.');
  config.d1_databases[0].database_id = id;
  await writeFile(configUrl, JSON.stringify(config, null, 2) + '\n');
  console.log('Hotovo. Databáze je nastavená. Pokračuj příkazy pnpm run db:apply a pnpm run deploy.');
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally { input.close(); }
