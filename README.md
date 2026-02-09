# imgchat

A chat-style AI image generation app built on Cloudflare Workers.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (server + JSX)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (images)
- **Bundler**: Parcel
- **Auth**: JWT cookies (shared with justright.fm)

## Quick Start

### Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with D1 and R2 enabled

### Setup

```bash
# Install dependencies
npm install

# Create D1 database (first time only)
wrangler d1 create imgchat-db

# Create R2 bucket (first time only)
wrangler r2 bucket create imgchat-images

# Run database migrations (local)
npm run db:migrate

# Set secrets
wrangler secret put JWT_SECRET

# Create local dev vars file
echo 'JWT_SECRET="your-dev-secret"' > .dev.vars

# Start development server
npm run dev
```

The app will be available at http://localhost:8787

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Build client and start local dev server |
| `npm run build:client` | Build client-side assets |
| `npm run watch:client` | Watch and rebuild client assets |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate` | Run migrations on local D1 |
| `npm run db:migrate:prod` | Run migrations on production D1 |

## Project Structure

```
imgchat/
├── src/
│   ├── index.ts          # Worker entry point
│   ├── routes/
│   │   ├── api.ts        # API routes
│   │   └── ui.ts         # SPA shell
│   ├── middleware/
│   │   └── auth.ts       # JWT authentication
│   ├── templates/
│   │   └── Layout.ts     # HTML shell
│   ├── client/
│   │   ├── app.tsx       # React-like SPA
│   │   ├── main.css      # Styles
│   │   ├── hooks/        # State management
│   │   └── components/   # UI components
│   └── types/
│       └── env.ts        # TypeScript types
├── public/               # Static assets
├── schema/
│   └── migrations.sql    # Database schema
└── wrangler.toml         # Cloudflare config
```

## Deployment

```bash
# Deploy to production
npm run deploy

# Run production migrations
npm run db:migrate:prod
```
