# Supascribe Notes MCP

A TypeScript MCP server that writes index cards to Supabase, deployed on Google Cloud Run.

## MCP Tools

| Tool          | Description                                           |
| ------------- | ----------------------------------------------------- |
| `health`      | Check server status and Supabase connectivity         |
| `write_cards` | Validate and upsert index cards with revision history |

## Architecture

![Sequence Diagram](docs/images/architecture-sequence-diagram.png)

## Prerequisites

- Node.js 22+
- Docker (for containerized deployment)
- Google Cloud CLI (`gcloud`) — for Cloud Run deployment
- A Supabase project with the schema applied

## Setup

```bash
# Install dependencies and git hooks
make install
```

### Environment Variables

| Variable                    | Required | Description                   |
| --------------------------- | -------- | ----------------------------- |
| `SUPABASE_URL`              | ✅       | Supabase project URL          |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅       | Supabase service role key     |
| `PORT`                      | ❌       | Server port (default: `8080`) |
| `PUBLIC_URL`                | ✅       | Public URL for OAuth & SSE    |

## Authentication

This server uses **Supabase Auth** via OAuth 2.0 for all MCP operations. MCP clients (like ChatGPT) will automatically discover the OAuth configuration via:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`

Standard `Authorization: Bearer <token>` header is required for all SSE and message endpoints.

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
make dev

# Run tests
make test

# Run tests with coverage
make test-coverage

# Lint and format
make lint
make format

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
gcloud config set project anchildress1-unstable

# Deploy
bash deploy.sh
```

After deployment, verify the service is running:

```bash
# Replace with your deployed Cloud Run service URL
# You can find this in the Cloud Run console or with:
# gcloud run services describe supascribe-notes-mcp --region YOUR_REGION --format='value(status.url)'
SERVICE_URL="https://your-service-url"

# 1. Health check (Public)
curl "$SERVICE_URL/status"

# 2. SSE handshake (Requires Auth)
# Replace YOUR_TOKEN with a valid Supabase JWT
curl -i -N -H "Accept: text/event-stream" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     "$SERVICE_URL/sse"
```

The SSE connection will return an `endpoint` event containing the URL for sending JSON-RPC messages, e.g., `$SERVICE_URL/messages?sessionId=...`.

To fully test the MCP functionality, configure your MCP client (like Claude Desktop) to connect to the SSE endpoint:

- **URL**: `$SERVICE_URL/sse`
- **Auth**: Use the standard OAuth 2.1 flow supported by your client, pointing to your Supabase project's auth endpoints.

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
  "created_at": "timestamptz (optional input for historical imports; normalized on write)",
  "updated_at": "timestamptz (auto)"
}
```

## CI/CD

- **GitHub Actions** — lint, test (80% coverage), secrets scan, build
- **Release Please** — conventional commit based semantic versioning
- **Commitlint + rai-lint** — enforces AI attribution footers
- **Lefthook** — git hooks for commit message validation

## License

PolyForm Shield 1.0.0
