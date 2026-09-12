# FileSender

Kompletní zdrojové soubory FileSenderu upravené pro přímé nasazení na vlastní Cloudflare účet. GitHub ani jiný Git server není potřeba.

**Začni souborem [NAVOD.md](NAVOD.md).** Obsahuje postup pro Windows, příkazy k publikování a bezplatné limity.

## Co umí

- Nahrání jednoho souboru až do 100 MB, přetažení a průběh nahrávání.
- Náhodný osmimístný kód, kopírování kódu a stažení na druhém zařízení.
- Dostupnost 24 hodin, přenos přes HTTPS, soukromé úložiště za serverovým API.
- Ošetření chybných kódů, prošlých souborů a chyb úložiště.
- Responzivní české rozhraní.

## Soubory projektu

| Umístění | Význam |
|---|---|
| `app/page.tsx` | Uživatelské rozhraní a akce |
| `app/globals.css` | Vzhled a mobilní rozložení |
| `app/layout.tsx`, `public/favicon.svg` | Název, popis a ikona webu |
| `app/api/`, `lib/transfers.ts` | Serverové nahrávání, kontrola kódu a stahování |
| `db/`, `drizzle/` | Schéma databáze a úvodní migrace |
| `wrangler.json`, `vite.config.ts` | Nastavení Cloudflare a sestavení |
| `scripts/` | Nastavení ID databáze a publikování |
| `components/`, `hooks/`, `vendor/` | Použité komponenty a jejich podpůrné soubory |
| `package.json`, `pnpm-lock.yaml` | Závislosti a jejich připnuté verze |

Balíček obsahuje veškeré zdroje potřebné k sestavení aplikace. `node_modules` se stáhne příkazem `pnpm install --frozen-lockfile`; `dist` se vytvoří při sestavení. Archiv neobsahuje přístupové tokeny, Git historii, identitu původního hostingu ani soubory nahrané návštěvníky.

Veřejný web zpřístupňuje HTML/CSS a JavaScript určený pro prohlížeč. Celý repozitář, TypeScript serveru a přístupové údaje se návštěvníkům tímto nasazením nezpřístupňují. Nahrávej pouze sestavené `dist/client` jako statické soubory; přiložený deploy skript to nastavuje přes Cloudflare plugin.

Původní přenosová logika byla ověřena v lokálním Cloudflare runtime: shoda stažených bajtů, český název, chybné a prošlé kódy, omezení pokusů i 100MB upload. Export je ověřen sestavením a přípravou nasazení bez publikování. Nasazení na tvůj účet vyžaduje tvé přihlášení a vlastní D1/R2 zdroje.
