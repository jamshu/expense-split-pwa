# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Expense Split PWA** - A Progressive Web App for splitting grocery and hotel bills between roommates, built with SvelteKit frontend and Odoo 19 SaaS backend.

## Development Commands

### Development
```bash
npm run dev              # Start dev server at http://localhost:5173
```

### Building
```bash
npm run build            # Production build (outputs to /public)
npm run preview          # Preview production build locally
npm run build:prod       # Custom production build script
```

### Type Checking
```bash
npm run check            # Run svelte-check for type errors
npm run check:watch      # Watch mode for type checking
```

## Environment Setup

Required environment variables in `.env`:
```env
ODOO_URL=https://your-instance.odoo.com
ODOO_DB=your-database-name
ODOO_USERNAME=your-username
ODOO_API_KEY=your-api-key
ODOO_EXPENSE_MODEL=x_expensesplit
```

**Important**: The app uses API keys (not passwords) for Odoo authentication. These are server-side only and never exposed to the client.

## Architecture

### Three-Layer Data Flow

```
Frontend (Svelte) → expenseCache Store → Odoo API Client → Server Route → Odoo Backend
                         ↓
                   localStorage
```

### Key Architectural Patterns

#### 1. **Smart Caching Layer** (`src/lib/stores/expenseCache.js`)

The centerpiece of the frontend architecture. This Svelte store provides:

- **Immediate data availability**: Shows cached data from localStorage instantly on page load
- **Background sync**: Automatically syncs with Odoo every 3 minutes if cache is stale (>5 minutes old)
- **Incremental fetching**: Only fetches records with `id > lastRecordId` to minimize API calls
- **Partner name resolution**: Batch-fetches and caches partner display names
- **Dual-phase balance calculation**: Processes settled expenses separately to support "opening balance" concept

**Key functions**:
- `initialize()` - Call in `onMount()`, loads cache and starts background sync
- `sync()` - Incremental sync with Odoo
- `forceRefresh()` - Clears cache and does full sync
- `resolvePartnerNames()` - Converts Odoo relational field formats to display names

#### 2. **Server-Side API Proxy** (`src/routes/api/odoo/+server.js`)

SvelteKit server route that acts as a JSON-RPC proxy to Odoo. This pattern:

- Keeps credentials server-side (never exposed to client)
- Caches Odoo UID to reduce authentication calls
- Provides a simple `{ action, data }` interface for the frontend
- Handles Odoo's complex field formatting (many2one, many2many)

**Supported actions**: `create`, `search`, `search_model`, `update`, `delete`

#### 3. **Odoo Field Formatting**

Odoo uses specific formats for relational fields:

- **Many2One (single relation)**: Send as integer ID, receive as `[id, "display_name"]` tuple
- **Many2Many (multiple relations)**: Send as `[[6, 0, [id1, id2, ...]]]`, receive as array of tuples

Helper functions in `src/lib/odoo.js`:
- `formatMany2one(id)` - Converts ID to integer or `false`
- `formatMany2many(ids)` - Wraps IDs in Odoo command format `[[6, 0, [...]]]`

#### 4. **Balance Calculation Algorithm** (`src/lib/expenseUtils.js`)

Two-phase calculation:

1. **Opening Balance Phase**: Process all settled expenses (`x_studio_is_done === true`)
   - Creates baseline balances from historical transactions

2. **Current Balance Phase**: Process unsettled expenses
   - Payer gets credited: `balance[payer] += amount`
   - Participants get debited equally: `balance[participant] -= amount / participantCount`

**Result interpretation**:
- Positive balance = person is owed money
- Negative balance = person owes money

### SvelteKit Configuration

- **Rendering**: `ssr: false`, `csr: true`, `prerender: true` in `src/routes/+layout.js`
- **Adapter**: `adapter-auto` configured for static output to `/public` directory
- **Base path**: Configurable via `PUBLIC_BASE_PATH` env var (for GitHub Pages deployment)

### PWA Features

Configured in `vite.config.js`:
- **Service Worker**: Auto-generated with Workbox, caches all static assets
- **Auto-update**: New versions automatically activate
- **Manifest**: Configured for standalone mode, installable on mobile
- **Icons**: 192x192 and 512x512 PNG icons in `/static`

## Odoo Model Structure

### Main Model: `x_expensesplit`

| Field | Type | Purpose |
|-------|------|---------|
| `x_name` | Char | Expense description |
| `x_studio_value` | Float | Amount in SAR |
| `x_studio_who_paid` | Many2One (res.partner) | Person who paid |
| `x_studio_participants` | Many2Many (res.partner) | People sharing the expense |
| `x_studio_type` | Selection | Expense type (grocery/hotel/other) |
| `x_studio_date` | Date | Transaction date |
| `x_studio_is_done` | Boolean | Settlement flag (true = settled) |

### Configuration Model: `x_expense_participants`

Stores default participant list in `x_studio_default_participants` (Many2Many to res.partner).

## Important Development Notes

### Working with the Cache

When modifying expense-related features:

1. **Always call `expenseCache.sync()` after mutations** (create/update/delete)
2. **Initialize the cache in page components**: `onMount(() => expenseCache.initialize())`
3. **Clean up on unmount**: `onDestroy(() => expenseCache.destroy())`
4. **Cache invalidation**: Increment `CACHE_KEY` version in `expenseCache.js` if store schema changes

### Odoo API Patterns

When adding new Odoo operations:

1. **Frontend**: Add method to `src/lib/odoo.js` (calls `/api/odoo` endpoint)
2. **Backend**: Add new action case in `src/routes/api/odoo/+server.js`
3. **Use `execute()` helper** for model operations (wraps authentication)

Example:
```javascript
// Frontend (odoo.js)
async markAsSettled(id) {
  return this.callApi('settle', { id });
}

// Backend (+server.js)
case 'settle':
  const settleResult = await execute(ODOO_EXPENSE_MODEL, 'write', [[data.id], { x_studio_is_done: true }]);
  return { success: true, result: settleResult };
```

### PWA Manifest Updates

When changing app name, icons, or theme:

1. Update `vite.config.js` manifest section
2. Update `/static/manifest.json`
3. Replace `/static/icon-192.png` and `/static/icon-512.png`
4. Run `npm run build` to regenerate service worker

### Deployment

**Vercel** (primary):
- Automatically deploys from `main` branch
- Set environment variables in Vercel dashboard
- Outputs to `/public` directory (configured in `vercel.json`)

**GitHub Pages**:
- Set `PUBLIC_BASE_PATH=/repo-name` in GitHub Actions secrets
- Configure GitHub Pages source as "GitHub Actions"
- Workflow auto-deploys on push to `main`

## File Structure Reference

```
src/
├── lib/
│   ├── stores/
│   │   └── expenseCache.js      # Core caching & sync logic
│   ├── odoo.js                   # Frontend API client
│   └── expenseUtils.js           # Balance calculation utilities
├── routes/
│   ├── +layout.js                # Root layout config (SSR/CSR settings)
│   ├── +layout.svelte            # Root layout component
│   ├── +page.svelte              # Add expense form
│   ├── balance/+page.svelte      # Balance report page
│   └── api/odoo/+server.js       # Odoo JSON-RPC proxy endpoint
└── app.html                      # HTML template with PWA meta tags
```

## Common Gotchas

1. **Odoo field naming**: All custom fields use `x_studio_` prefix (Odoo Studio convention)
2. **Partner name format**: Odoo returns `[id, "name"]` tuples, must extract display name for UI
3. **localStorage limits**: Browser typically allows 5-10MB, sufficient for hundreds of expenses
4. **Service worker caching**: After PWA updates, users may need to close all tabs and reopen
5. **Base path in production**: GitHub Pages deployments require `PUBLIC_BASE_PATH` env var set
