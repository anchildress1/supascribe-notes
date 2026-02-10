# Supascribe Notes MCP

A TypeScript MCP server that writes index cards to Supabase, deployed on Google Cloud Run.

## MCP Tools

| Tool          | Description                                           |
| ------------- | ----------------------------------------------------- |
| `health`      | Check server status and Supabase connectivity         |
| `write_cards` | Validate and upsert index cards with revision history |

## Prerequisites

- Node.js 22+
- Docker (for containerized deployment)
- Google Cloud CLI (`gcloud`) — for Cloud Run deployment
- A Supabase project with the schema applied

## Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env

# Install git hooks
npx lefthook install
```

### Environment Variables

| Variable                    | Required | Description                   |
| --------------------------- | -------- | ----------------------------- |
| `SUPABASE_URL`              | ✅       | Supabase project API URL      |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅       | Supabase service role key     |
| `MCP_AUTH_TOKEN`            | ✅       | Bearer token for request auth |
| `PORT`                      | ❌       | Server port (default: `8080`) |

## Database Schema

Apply migrations in order:

```bash
# Via Supabase CLI or dashboard SQL editor
psql < supabase/migrations/001_create_cards.sql
psql < supabase/migrations/002_create_card_revisions.sql
psql < supabase/migrations/003_create_generation_runs.sql
```

## Development

```bash
# Start dev server with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run format

# Run all CI checks locally
make ai-checks
```

## Docker

```bash
# Build
docker build -t supascribe-notes-mcp .

# Run
docker run -p 8080:8080 --env-file .env supascribe-notes-mcp
```

## Deploy to Cloud Run

```bash
# Set your GCP project
gcloud config set project unstable-anchildress1

# Deploy
bash deploy.sh
```

## Smoke Tests

After deployment, verify the service:

```bash
SERVICE_URL="https://your-service-url"
TOKEN="your-mcp-auth-token"

# HTTP health check (non-MCP)
curl -H "Authorization: Bearer $TOKEN" "$SERVICE_URL/healthz"

# MCP initialize
curl -X POST "$SERVICE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "smoke-test", "version": "1.0.0"}
    }
  }'
```

## Card Shape

```json
{
  "objectID": "uuid (auto-generated)",
  "title": "string (required)",
  "blurb": "string (required)",
  "fact": "string (required)",
  "url": "string (optional, must be valid URL)",
  "tags": { "lvl0": ["string"], "lvl1": ["string"] },
  "projects": ["string"],
  "category": "string (required)",
  "signal": "number 1–5 (required)",
  "created_at": "timestamptz (auto)",
  "updated_at": "timestamptz (auto)"
}
```

## CI/CD

- **GitHub Actions** — lint, test (80% coverage), secrets scan, build
- **Release Please** — conventional commit based semantic versioning
- **Commitlint + rai-lint** — enforces AI attribution footers
- **Lefthook** — git hooks for commit message validation

## License

MIT
