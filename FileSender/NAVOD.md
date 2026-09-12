# FileSender — veřejný web bez veřejného GitHubu

Tento balíček nasadíš přímo ze svého počítače na Cloudflare Workers. Web bude veřejně dostupný na adrese končící `workers.dev`. Nemusíš vytvářet žádný GitHub repozitář ani kupovat doménu.

## Nejdřív cena

Jde o **provoz zdarma v bezplatných limitech**, ne o neomezené úložiště bez možnosti účtování. Údaje ověřeny 12. 9. 2026:

| Služba | Bezplatný limit relevantní pro FileSender |
|---|---|
| Cloudflare Workers Free | 100 000 požadavků denně, 10 ms CPU na požadavek |
| Cloudflare D1 na Free | 5 GB databázových dat celkem, 5 milionů čtených a 100 000 zapisovaných řádků denně |
| R2 Standard | 10 GB-měsíc úložiště, 1 milion operací třídy A a 10 milionů třídy B měsíčně; odchozí data zdarma |

R2 je potřeba aktivovat v účtu přes jeho checkout. Ten může požadovat platební metodu. Nad bezplatný objem se R2 účtuje podle využití; samotný plán Workers Free neznamená nulové účty za R2. Použij Standard, ne Infrequent Access. Bezplatné objemy se sdílejí s dalšími aplikacemi na tvém účtu. Sleduj spotřebu v dashboardu; tento balíček nemá zaručený finanční strop. Při větším veřejném provozu už nemusí být zdarma.

Zdroje: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/), [aktivace R2](https://developers.cloudflare.com/r2/get-started/).

## 1. Připrav počítač a účet

1. Rozbal celý ZIP, například do `C:\FileSender`. Pracuj ve složce, která obsahuje `package.json`.
2. Nainstaluj [Node.js](https://nodejs.org/en/download), aktuální LTS; balíček vyžaduje nejméně Node 22.13.
3. Vytvoř účet na [Cloudflare](https://dash.cloudflare.com/sign-up) a ponech Workers na Free. V části **Storage & databases → R2 → Overview** aktivuj R2. Přečti si podmínky zobrazené při aktivaci.
4. Otevři v rozbalené složce Terminál. Na Windows můžeš do adresního řádku Průzkumníka napsat `cmd` a stisknout Enter. Po instalaci Node otevři nové okno terminálu.

## 2. Nainstaluj závislosti a přihlas se

Všechny příkazy zadávej ve složce s `package.json`, jeden po druhém:

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run login
```

Poslední příkaz otevře Cloudflare přihlášení v prohlížeči. Přihlas se do svého účtu a povol Wrangleru nasazování. GitHub nikde nepřipojuj.

Pokud PowerShell blokuje `npm.ps1` nebo `pnpm.ps1`, použij Příkazový řádek (`cmd`), případně příkazy `npm.cmd` a `pnpm.cmd`. Není nutné měnit bezpečnostní nastavení Windows.

## 3. Vytvoř databázi a úložiště

```sh
pnpm exec wrangler d1 create filesender-db
pnpm exec wrangler r2 bucket create filesender-files
```

První příkaz vypíše `database_id`, například UUID ve tvaru `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. Zkopíruj **své skutečné ID** a potom spusť:

```sh
pnpm run configure
```

Vlož zkopírované `database_id` a stiskni Enter. Skript ho zapíše do `wrangler.json`. Nikam nevkládej API token ani heslo. Pokud máš více Cloudflare účtů, vytvářej databázi, bucket i Worker ve stejném účtu; případně doplň jeho `account_id` do `wrangler.json`.

Jestli už tyto zdroje na svém účtu máš z předchozího pokusu, nevytvářej další: zjisti ID existující databáze v dashboardu nebo příkazem `pnpm exec wrangler d1 list` a použij ho. Názvy musí odpovídat `wrangler.json`.

## 4. Vytvoř tabulky a nastav úklid

```sh
pnpm run db:apply
pnpm exec wrangler r2 bucket lifecycle add filesender-files filesender-expiry transfers/ --expire-days 2
```

U migrace potvrď vytvoření tabulek. Jde o novou databázi FileSenderu. Druhý příkaz nastaví automatické odstranění objektů s prefixem `transfers/` po dvou dnech. Nastavuj ho jen pro nový bucket FileSenderu, ne pro úložiště jiných souborů.

Kód přestává fungovat po 24 hodinách. Aplikace průběžně odstraňuje prošlé soubory při dalším nahrávání; pravidlo v R2 pomůže uklidit úložiště i v době, kdy web nikdo nepoužívá. Odstranění pomocí lifecycle pravidla nemusí proběhnout přesně v okamžiku dosažení dvou dnů. [Dokumentace úklidu](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

**U bucketu nezapínej Public access ani veřejnou doménu `r2.dev`.** Veřejný má být web. Soubory poskytuje server až po zadání kódu; samotný bucket zůstává soukromý.

## 5. Zveřejni web

```sh
pnpm run deploy
```

Skript web sestaví a nahraje na Cloudflare. Na konci terminál ukáže adresu podobnou `https://filesender.TVOJE-JMENO.workers.dev`. Při prvním nasazení může Cloudflare požádat o volbu tvé `workers.dev` subdomény. Použij přesnou výslednou adresu z terminálu; příklad zde není tvoje skutečná adresa.

Pokud už na účtu existuje jiný Worker jménem `filesender`, nejprve změň `name` v `wrangler.json`, například na `moje-filesender`. Opakované nasazení stejného názvu aktualizuje existující Worker.

Hotovo. Adresu pošli druhému člověku. Uživatelé nepotřebují Cloudflare účet a tvůj počítač potom může být vypnutý. Zdrojové soubory zůstávají u tebe a serverový program v tvém Cloudflare účtu.

Zkušebně nahraj malý soubor, zkopíruj kód a stáhni ho na telefonu nebo v anonymním okně. Zkontroluj obsah a název. Tím ověříš připojení své produkční databáze a úložiště.

## Co ostatní uvidí ze zdrojového kódu

- **GitHub repozitář:** žádný není potřeba. Pokud si později uděláš zálohu na GitHubu, může být Private.
- **Server, databáze a přístupové údaje:** neposílají se do prohlížeče návštěvníka. Hostitel a správci tvého Cloudflare účtu k serverovému kódu přístup mít mohou.
- **HTML, CSS a JavaScript prohlížeče:** návštěvník je může zobrazit v nástrojích pro vývojáře. Tohle u veřejného webu úplně skrýt nejde. V této verzi jsou vypnuté source mapy a do statických souborů se nenahrává celý projekt.

ZIP nebo celou složku projektu nenahrávej jako veřejné statické soubory. Použij přiložený deploy příkaz. Samotné přetažení souborů do Netlify Drop nebo GitHub Pages nestačí pro tento backend s D1 a R2.

## Úpravy a další nasazení

Vzhled měň v `app/globals.css`, texty a rozhraní v `app/page.tsx`. Po změně stačí:

```sh
pnpm run deploy
```

Pokud měníš databázové schéma v `db/schema.ts`, vygeneruj a zkontroluj novou migraci, potom ji aplikuj před nasazením. Už aplikované SQL migrace zpětně nepřepisuj.

```sh
pnpm run db:generate
pnpm run db:apply
pnpm run deploy
```

Pro lokální vývoj s oddělenou testovací databází a úložištěm:

```sh
pnpm run db:local
pnpm run dev
```

Přípravu balíčku bez skutečného zveřejnění ověří `pnpm run deploy:dry-run`. Databázové migrace, vytvoření zdrojů a skutečné nasazení na tvůj účet to neprovádí.

## Když se něco nepovede

| Problém | Řešení |
|---|---|
| `pnpm` není rozpoznaný | Dokonči instalaci, zavři terminál a otevři nový. |
| R2 není aktivní | Aktivuj ho v dashboardu; samotné přihlášení Wrangleru nestačí. |
| Chybí tabulka `transfers` | Spusť `pnpm run db:apply` pro správnou databázi. |
| Chybné ID databáze / chybí DB | Znovu `pnpm run configure`, poté `pnpm run deploy`. |
| Bucket neexistuje | Ověř název `filesender-files` a stejný Cloudflare účet. |
| Překročený limit Free / chyba 1102 | Zkontroluj kvóty a CPU v dashboardu. Bezplatný plán má pevná omezení; neslibuje neomezený provoz. |
| Web jde jen tobě | Ověř, že používáš výslednou `workers.dev` adresu a nezapnul jsi Cloudflare Access. |

Nasazování z počítače vychází z [Cloudflare Vite pluginu](https://developers.cloudflare.com/workers/vite-plugin/) a jeho sestavení pro Wrangler. Bez přihlášení do tvého účtu nelze ověřit konkrétní produkční zdroje; v exportu je záměrně jen zástupné ID databáze.
