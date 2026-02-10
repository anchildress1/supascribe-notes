Build an MCP server that writes index cards to Supabase and deploys to Google Cloud Run.

TARGET

- Cloud Run project: unstable-anchildress1
- Deploy method: Docker mimicing `example-deploy.sh`

DELIVER

1. Complete repo (MCP server + Supabase migrations + Dockerfile + README)
2. MCP tools:
   - health()
   - write_cards(cards)

AUTH

- Implement request authentication for all tool calls.
- Use env-based configuration (token or IAM). Document exact setup.

SUPABASE

- Public Supabase (reads public).
- Server writes using Supabase service role key from env vars.
- Nothing hard-coded.
- You are connected via MCP already to the project

ENV + SECRETS

- Provide .env.example.
- Ensure .env is gitignored.
- All secrets passed safely via env vars in Cloud Run.
- Request explicit key values from user
- Keep minimal for secrets not constants

DATA MODEL

- cards table stores latest record.
- card_revisions table stores write history.
- objectID auto-generated UUID
- Postgres timestamptz for created_at/updated_at; default current_timestamp

CARD SHAPE

- objectID: string (uuid)
- title: string
- blurb: string
- fact: string
- url: string
- tags: { lvl0?: string[], lvl1?: string[] }
- projects: string[]
- category: string
- signal: number (1–5)
- created_at: timestamptz
- updated_at: timestamptz

BEHAVIOR

- Validate cards with a strict schema before write.
- Upsert by objectID.
- Each write creates a card_revisions row in the same transaction.
- Each tool run creates a generation_runs row.
- Add lightweight rate limiting appropriate for a single-user write tool.

LOCAL DEV

- docker build/run
- simple test path: generate → validate → write → read back

DEPLOY

- Integrate with my Docker deploy script.
- Provide post-deploy smoke test commands for health + write_cards.

OUTPUT NOW

- Repo structure
- All source code
- SQL migrations
- Dockerfile
- README with exact commands
