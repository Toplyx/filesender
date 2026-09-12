# FileSender — public web without a public GitHub repo

You can deploy this package directly from your computer to Cloudflare Workers. The site will be publicly available at a `workers.dev` address. You do not need to create a GitHub repository or buy a domain.

## First: pricing

This is **free-tier usage**, not unlimited storage with no billing risk. Data verified on 12 Sep 2026:

| Service | Free-tier limit relevant to FileSender |
|---|---|
| Cloudflare Workers Free | 100,000 requests per day, 10 ms CPU per request |
| Cloudflare D1 Free | 5 GB total database storage, 5 million reads and 100,000 writes per day |
| R2 Standard | 10 GB-month storage, 1 million class A operations and 10 million class B operations per month; outbound data is free |

R2 must be activated in your account through its checkout. It may require a payment method. Once you exceed the free volume, R2 usage is billed according to consumption; the Workers Free plan does not mean zero R2 charges. Use Standard, not Infrequent Access. Free limits are shared with other apps in your account. Monitor usage in the dashboard; this package does not guarantee a hard financial cap. Under heavier public traffic, it may stop being free.

Sources: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/), [activate R2](https://developers.cloudflare.com/r2/get-started/).

## 1. Prepare your computer and account

1. Unzip the archive, for example to `C:\FileSender`. Work in the folder that contains `package.json`.
2. Install [Node.js](https://nodejs.org/en/download), latest LTS; the package requires at least Node 22.13.
3. Create an account on [Cloudflare](https://dash.cloudflare.com/sign-up) and leave Workers on Free. In **Storage & databases → R2 → Overview**, activate R2. Read the conditions shown during activation.
4. Open a terminal in the extracted folder. On Windows, you can type `cmd` in File Explorer and press Enter. After Node is installed, open a new terminal window.

## 2. Install dependencies and log in

Run all commands in the folder containing `package.json`, one by one:

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run login
```

The last command opens Cloudflare login in the browser. Sign in to your account and allow Wrangler to deploy. Do not connect GitHub anywhere.

If PowerShell blocks `npm.ps1` or `pnpm.ps1`, use Command Prompt (`cmd`) or the commands `npm.cmd` and `pnpm.cmd`. You do not need to change Windows security settings.

## 3. Create the database and storage

```sh
pnpm exec wrangler d1 create filesender-db
pnpm exec wrangler r2 bucket create filesender-files
```

The first command prints a `database_id`, for example a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. Copy **your real ID** and then run:

```sh
pnpm run configure
```

Enter the copied `database_id` and press Enter. The script writes it to `wrangler.json`. Do not enter any API token or password. If you have multiple Cloudflare accounts, create the database, bucket, and Worker in the same account; if needed, add its `account_id` to `wrangler.json`.

If you already have these resources in your account from a previous attempt, do not create new ones: look up the existing database ID in the dashboard or with `pnpm exec wrangler d1 list` and use it. The names must match `wrangler.json`.

## 4. Create tables and set cleanup

```sh
pnpm run db:apply
pnpm exec wrangler r2 bucket lifecycle add filesender-files filesender-expiry transfers/ --expire-days 2
```

Confirm table creation during migration. This is a new FileSender database. The second command automatically removes objects with the `transfers/` prefix after two days. Set this only for the new FileSender bucket, not for other storage buckets.

The code stops working after 24 hours. The app cleans up expired files as uploads continue; the R2 rule helps tidy storage even when nobody is using the site. Lifecycle cleanup may not happen exactly when the two-day threshold is reached. [Cleanup docs](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

**Do not enable Public access or a public `r2.dev` domain for the bucket.** The site should be public, but the files are served by the server only after the code is entered; the bucket stays private.

## 5. Publish the site

```sh
pnpm run deploy
```

The script builds and uploads the web app to Cloudflare. At the end, the terminal shows an address similar to `https://filesender.YOUR-NAME.workers.dev`. On the first deployment, Cloudflare may ask you to choose your `workers.dev` subdomain. Use the exact final URL from the terminal; the example here is not your real address.

If another Worker named `filesender` already exists in your account, first change the `name` in `wrangler.json`, for example to `my-filesender`. Re-deploying the same name updates the existing Worker.

Done. Send the address to someone else. Users do not need a Cloudflare account, and your computer can be turned off afterward. The source files remain with you and the server code runs in your Cloudflare account.

Test by uploading a small file, copying the code, and downloading it on a phone or in an incognito window. Check the content and filename. This verifies your production database and storage connection.

## What others can see from the source code

- **GitHub repository:** not needed. If you later back it up to GitHub, it can be private.
- **Server, database, and credentials:** are not sent to the visitor’s browser. The host and admins of your Cloudflare account can access the server code.
- **Browser HTML, CSS, and JavaScript:** visitors can inspect them in developer tools. This cannot be fully hidden on a public web app. In this version, source maps are disabled and the full project is not uploaded into the static assets.

Do not upload the ZIP or whole project folder as public static files. Use the included deploy command. Simply dragging files into Netlify Drop or GitHub Pages is not enough for this backend with D1 and R2.

## Edits and additional deployment

Adjust the look in `app/globals.css` and the text and UI in `app/page.tsx`. After changing them, run:

```sh
pnpm run deploy
```

If you change the database schema in `db/schema.ts`, generate and review a new migration and apply it before deployment. Do not rewrite already applied SQL migrations.

```sh
pnpm run db:generate
pnpm run db:apply
pnpm run deploy
```

For local development with a separate test database and storage:

```sh
pnpm run db:local
pnpm run dev
```

You can validate the package without publishing with `pnpm run deploy:dry-run`. This does not create database migrations, resources, or a real deployment to your account.

## When something goes wrong

| Problem | Solution |
|---|---|
| `pnpm` is not recognized | Complete the install, close the terminal, and open a new one. |
| R2 is inactive | Activate it in the dashboard; logging in to Wrangler is not enough. |
| Table `transfers` is missing | Run `pnpm run db:apply` for the correct database. |
| Wrong database ID / missing DB | Run `pnpm run configure` again, then `pnpm run deploy`. |
| Bucket does not exist | Check the name `filesender-files` and the same Cloudflare account. |
| Free-plan limit exceeded / error 1102 | Check quotas and CPU in the dashboard. The free plan has fixed limits and does not promise unlimited traffic. |
| The site only works for you | Check that you are using the final `workers.dev` URL and have not enabled Cloudflare Access. |

Deployment from your computer relies on the [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) and its build process for Wrangler. Without logging into your account, no specific production resources can be verified; the export intentionally includes only placeholder database IDs.
