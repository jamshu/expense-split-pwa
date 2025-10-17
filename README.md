# Expense Split PWA

A Progressive Web App for splitting grocery and hotel bills between roommates. Built with SvelteKit and Odoo backend.

## Features

- ✅ Add expenses with payer and participants
- 📊 View balance reports showing who owes whom
- 💰 Automatic settlement calculation
- 🔄 Real-time sync with Odoo backend
- 📱 Progressive Web App (installable on mobile)
- 🎨 Beautiful, modern UI



## Prerequisites

1. **Odoo 19.0 SaaS** with Studio module installed
2. **Node.js 18+** and npm

## Odoo Setup

In your Odoo Studio, create a custom model with the following fields:

### Model Name: `x_expense_split` (or your custom name)

| Technical Name | Field Type | Label |
|---------------|-----------|-------|
| `x_name` | Char | Description |
| `x_amount` | Float | Amount |
| `x_payer` | Char | Payer |
| `x_participants` | Char | Participants |
| `x_type` | Selection | Type |
| `x_date` | Date | Date |

**Selection values for `x_type`:**
- `grocery`: Grocery
- `hotel`: Hotel
- `other`: Other

## Installation

1. Install dependencies:
```sh
npm install
```

2. Create `.env` file (copy from `.env.example`):
```sh
cp .env.example .env
```

3. Configure your `.env` file:
```env
PUBLIC_ODOO_URL=https://your-instance.odoo.com
PUBLIC_ODOO_DB=your-database-name
PUBLIC_ODOO_USERNAME=your-username
PUBLIC_ODOO_PASSWORD=your-password
PUBLIC_ODOO_EXPENSE_MODEL=x_expense_split
```

## Development

Run the development server:
```sh
npm run dev
```

Visit `http://localhost:5173`

## Building for Production

```sh
npm run build
```

Preview the production build:
```sh
npm run preview
```

## GitHub Pages Deployment

### 1. Update Repository Settings

1. Go to your GitHub repository
2. Navigate to **Settings** → **Pages**
3. Under "Build and deployment", select:
   - **Source**: GitHub Actions

### 2. Add GitHub Secrets

Go to **Settings** → **Secrets and variables** → **Actions** and add:

- `ODOO_URL` - Your Odoo instance URL
- `ODOO_DB` - Your database name
- `ODOO_USERNAME` - Your Odoo username
- `ODOO_PASSWORD` - Your Odoo password
- `ODOO_EXPENSE_MODEL` - Your model name (e.g., `x_expense_split`)

### 3. Update Base Path

If your repository name is different from `expense-split-pwa`, update `svelte.config.js`:

```js
paths: {
  base: process.env.NODE_ENV === 'production' ? '/your-repo-name' : ''
}
```

Also update `static/manifest.json`:
```json
"start_url": "/your-repo-name/"
```

### 4. Deploy

Push to the `main` branch, and GitHub Actions will automatically deploy to GitHub Pages.

Your app will be available at: `https://your-username.github.io/expense-split-pwa/`

## Usage

### Adding an Expense

1. Select expense type (Grocery/Hotel/Other)
2. Enter description (e.g., "Weekly groceries")
3. Enter amount
4. Enter who paid
5. Enter participants (comma-separated: "John, Jane, Bob")
6. Click "Add Expense"

### Viewing Balances

Navigate to the "Balance Report" page to see:
- Individual balances (who owes/is owed)
- Settlement plan (optimal payment transfers)
- Recent expenses list

## Technologies Used

- **SvelteKit** - Frontend framework
- **Vite** - Build tool
- **vite-plugin-pwa** - PWA support
- **Odoo 19** - Backend database and API
- **GitHub Pages** - Hosting

## License

MIT
