# Guidance for AI coding agents — Expense Split PWA

Be concise. Focus on concrete, repo-specific patterns and files. This project is a SvelteKit PWA with an Odoo (SaaS v19) backend. Key integration points, conventions and examples are below.

- Big picture
  - Frontend: SvelteKit app under `src/routes` and `src/lib`. UI pages live in `src/routes` (e.g. `+page.svelte`, `balance/+page.svelte`).
  - Backend bridge: a SvelteKit server endpoint at `src/routes/api/odoo/+server.js` implements a thin JSON-RPC proxy to Odoo using `/jsonrpc`. It exposes simple actions: `create`, `search`, `update`, `delete` and `search_model` (used to fetch other models like `res.partner`).
  - Data flow: UI calls `src/lib/odoo.js` (client wrapper) → server endpoint `/api/odoo` → Odoo JSON-RPC. Keep transformations minimal on server; format payloads on frontend when convenient.

- Important files to inspect
  - `src/routes/api/odoo/+server.js` — authentication and `execute()` helper, maps frontend `action` to Odoo model calls.
  - `src/lib/odoo.js` — client wrapper used across the app (create/search/update/delete). New helpers added: `searchModel`, `fetchPartners`, `formatMany2one`, `formatMany2many`.
  - `src/routes/+page.svelte` — Add Expense UI. Shows how to load `res.partner` (via `odooClient.fetchPartners`) and submit `many2one`/`many2many` fields.

- Odoo field formatting rules (explicit examples)
  - many2one: pass the integer id. Example payload: `{ x_studio_who_paid: 42 }` (or use the helper `odooClient.formatMany2one(id)` which returns a number or false).
  - many2many: use the command tuple (6, 0, [ids]) to replace values. Example payload: `{ x_studio_participants: [6, 0, [12,34]] }`. Use `odooClient.formatMany2many([12,34])`.
  - search_read usage: server action `search_model` expects `{ model, domain, fields }` and returns `results`.

- UI conventions in this repo
  - Simple, small components lived directly inside `src/routes/*` pages (no separate components dir).
  - Client calls use `odooClient` (import from `$lib/odoo`). Avoid calling `/jsonrpc` directly from the browser; the server endpoint handles authentication and API key fallback.
  - Environment variables: stored as `PUBLIC_` prefixed keys in `.env` and read in the server file via `$env/static/public`. See `.env.example`.

- Authentication and secrets
  - Auth uses either `PUBLIC_ODOO_API_KEY` (preferred if set) or username/password. The server caches `uid` in-memory (`cachedUid`). Avoid changing that cache without understanding multi-instance implications.

- Developer workflows (how to run, test, debug)
  - Build & dev: standard SvelteKit commands in `package.json`. If not obvious, run `npm install` then `npm run dev` for local dev.
  - To test Odoo integration locally, set `.env` values (or use GitHub Actions secrets in CI). The server endpoint logs errors to the server console — check terminal output for JSON-RPC errors.

- When changing the Odoo model/fields
  - Update `PUBLIC_ODOO_EXPENSE_MODEL` in `.env` if the model name changes.
  - If you add or rename custom fields (x_...), update `src/routes/+page.svelte` and `src/lib/odoo.js` helpers as needed. Use `search_read` via `search_model` to inspect sample records: e.g. `{ action: 'search_model', data: { model: 'x_expensesplit', domain: [], fields: ['id', 'x_name', 'x_studio_who_paid'] } }`.

- Examples (from repo)
  - Loading partners for dropdown: `partners = await odooClient.fetchPartners()` (see `src/routes/+page.svelte`). Returned items are `{ id, display_name }`.
  - Submitting an expense with relations (how UI now sends payload):
    - `{ x_name: 'desc', x_studio_value: 12.5, x_studio_who_paid: odooClient.formatMany2one(payerId), x_studio_participants: odooClient.formatMany2many([id1,id2]) }`

- Safety and edge cases for agents
  - Do not commit secrets. `.env` may be present in workspace during development; do not add real credentials into code or PRs.
  - When adding server routes, preserve existing behavior: `execute()` handles auth; reuse it to avoid duplicating login logic.
  - For performance: avoid fetching the full partner table on every render. Prefer minimal fields (`id`, `display_name`) and client-side caching if needed.

- If you change `search_model` or add new server actions
  - Update `src/lib/odoo.js` client wrappers and add JSDoc comments to keep types clear. The project uses JSDoc for light type-checking.

If anything here is unclear or you want examples added (e.g. a sample curl or unit test), tell me what to expand and I will update this file.
