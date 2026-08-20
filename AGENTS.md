<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mowazana project memory

## Start-of-task protocol

The user is already working from this project. Do not ask them to restate the
project structure, the active environment, or the deployment path before
checking the workspace yourself.

Before asking a clarifying question or saying that a change is not visible:

1. Read this file, `README.md`, `package.json`, and the files directly related
   to the request.
2. Inspect the current git status and preserve unrelated user changes.
3. Inspect `.env.example` and, when necessary, the names (never values) in
   `.env.local` to determine whether the app is in demo mode or connected to
   WordPress.
4. Check the configured git remotes and repository configuration for documented
   deployment information. Do not claim a change is deployed or unavailable
   without evidence.
5. Use the relevant installed skill when the request matches one. Read that
   skill's `SKILL.md` before acting.

If information is genuinely absent, report exactly what was checked and ask
only for the missing decision or authority.

## What this project is

Mowazana is an Arabic-first family finance PWA built with Next.js. It lets
members record withdrawals and deposits, then view balances, debts, and
installments. WordPress + JetEngine CCT tables are the source of truth; the
Next.js app is the member-facing interface.

- Next.js app and PWA: `app/`, `components/`, `lib/`, and `public/`.
- Main client UI: `components/muwazana-app.tsx`.
- Styling: `app/globals.css`.
- Server routes: `app/api/`.
- WordPress integration client: `lib/wordpress.ts`.
- Demo mode data: `lib/demo-data.ts`.
- Shared domain types and financial calculations: `lib/types.ts` and
  `lib/finance.ts`.
- WordPress bridge plugin: `wordpress/muwazana-bridge/`.
- Telegram approval workflows: `n8n-workflows/`.

## Data and terminology

- Only approved transactions affect the financial balance.
- Balance = deposits + rewards − withdrawals − penalties.
- A general deposit is labelled `إيداع عام`; an installment deposit is labelled
  `إيداع قسط`.
- Transaction dates are ISO date-times where available. Preserve the time so
  transaction lists can display and sort by both day and time.
- The recent-transactions list is sorted newest first and paginated in the UI.
- Keep Arabic text, RTL layout, and the existing product terminology coherent
  across the UI, demo data, API payloads, and WordPress bridge.

## Operating and deployment rules

- `MUWAZANA_DEMO_MODE=true` uses in-memory demo data; it does not contact
  WordPress.
- In connected mode, the server needs `WORDPRESS_BASE_URL`,
  `WORDPRESS_APP_USERNAME`, and `WORDPRESS_APP_PASSWORD`. Never expose their
  values or place secrets in `NEXT_PUBLIC_*` variables.
- The WordPress plugin is a separate deployable artifact. Changes under
  `wordpress/muwazana-bridge/` do not reach a WordPress site until that plugin
  is updated there.
- The configured source remote is GitHub (`github.com/jubranz/mowazana`). No
  deployment platform is documented in this repository. Treat publishing to a
  live site as a separate action that requires evidence of the target and the
  user's authorization.
- When a user says they refreshed but cannot see a change, first distinguish
  between local dev, a built local app, preview, production, and the separately
  installed WordPress plugin. Check the relevant running target before asking
  the user for details.

## Required verification

Run checks proportional to the change before reporting completion:

- TypeScript/UI/API changes: `npm run lint` and `npm test`.
- Production-impacting Next.js changes: also run `npm run build`.
- WordPress bridge changes: run PHP syntax validation with the project's
  available PHP runtime, in addition to the JavaScript checks where relevant.
- Before changing Next.js code, read the relevant current guide under
  `node_modules/next/dist/docs/`, as required by the generated rules above.

Report what changed, what was verified, and any remaining separate deployment
step. Do not call local code changes "live" unless the deployment actually
succeeded.
