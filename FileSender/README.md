# FileSender

The complete source files for FileSender, prepared for direct deployment to your own Cloudflare account. No GitHub or other Git server is required.

**Start with [NAVOD.md](NAVOD.md).** It contains the setup steps for Windows, the publish commands, and the free-tier limits.

## What it does

- Upload a single file up to 150 GB, with drag-and-drop support and upload progress.
- Generate a random eight-character code, copy it, and download it on another device.
- Availability for 24 hours, transfer over HTTPS, and private storage behind a server API.
- Handling of invalid codes, expired files, and storage errors.
- Responsive English interface.

## Project files

| Location | Meaning |
|---|---|
| `app/page.tsx` | User interface and actions |
| `app/globals.css` | Visual styling and mobile layout |
| `app/layout.tsx`, `public/favicon.svg` | Page title, metadata, and app icon |
| `app/api/`, `lib/transfers.ts` | Server upload, code validation, and downloads |
| `db/`, `drizzle/` | Database schema and initial migration |
| `wrangler.json`, `vite.config.ts` | Cloudflare settings and build configuration |
| `scripts/` | Database ID setup and deployment |
| `components/`, `hooks/`, `vendor/` | Reused components and supporting files |
| `package.json`, `pnpm-lock.yaml` | Dependency and lockfile versions |

The package contains all required resources to build the app. `node_modules` is installed with `pnpm install --frozen-lockfile`; `dist` is created during the build. The archive does not include access tokens, Git history, the original hosting identity, or files uploaded by visitors.

The public site exposes HTML, CSS, and JavaScript intended for browser use. The entire repository, the TypeScript server, and any access credentials remain hidden from visitors through this deployment. Upload only the built `dist/client` as static files; the included deployment script configures this through the Cloudflare plugin.

The original transfer logic was verified in the local Cloudflare runtime: matching downloaded bytes, valid file names, invalid and expired codes, rate limiting, and 150 GB uploads. The export is verified by building and preparing deployment without publishing. Deployment to your account requires your login and your own D1/R2 resources.
