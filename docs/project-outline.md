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

- Implement OAuth 2.1 authorization code flow.
- Verify Supabase Auth JWTs in middleware using `src/middleware/auth.ts`.
- Expose OAuth discovery metadata at `/.well-known/oauth-authorization-server`.

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

---

CONTEXT: OAuth 2.1 + OIDC + PKCE flow between ChatGPT (OAuth client) and Supabase (authorization server) to access a protected MCP resource.

CURRENT STATE:

1. ChatGPT initiates OAuth Authorization Code flow:
   - response_type=code
   - client_id=<ChatGPT client_id>
   - redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect
   - scope=openid profile email phone
   - code_challenge + S256 (PKCE)
   - resource=https://supascribe-notes-mcp-800441415595.us-east1.run.app

2. Supabase /authorize returns 302 (expected).
   - User authenticates and consents.

3. Expected next step:
   Supabase redirects to:
   https://chatgpt.com/connector_platform_oauth_redirect?code=...&state=...
   ChatGPT exchanges:
   grant_type=authorization_code
   code=...
   code_verifier=...
   client_id=...
   resource=...
   for:
   access_token (+ id_token for OIDC)

4. What is actually happening:
   ChatGPT later calls:
   GET /sse?authorization_id=...
   Server responds:
   401 Unauthorized
   WWW-Authenticate: Bearer resource_metadata=".../oauth-protected-resource/sse"

   This indicates:
   - OAuth linking has NOT successfully completed.
   - ChatGPT does not yet possess a valid access_token for the resource.
   - It is retrying the protected resource discovery flow.

5. Key observation:
   The /sse request shown is a browser navigation request
   Accept: text/html
   Sec-Fetch-Mode: navigate

   This is part of the linking handshake, not a real MCP SSE stream.
   A successful link would show:
   Authorization: Bearer <access_token>
   Accept: text/event-stream

LIKELY FAILURE POINTS:

- Supabase OAuth client registration missing:
  - client_id not registered
  - redirect_uri not allowlisted exactly
- Token endpoint not returning required fields
- access_token audience does not match the requested resource
- id_token missing despite openid scope

authorization_id:
This is a session correlation handle used by ChatGPT to bind
the browser auth flow to the MCP linking session.
It is NOT manually redeemable and should not be exchanged directly.

SUMMARY:
OAuth initiation works.
Discovery works.
Protection works.
Token issuance or redirect back to ChatGPT is failing,
so ChatGPT never receives a usable access_token,
and therefore /sse continues to 401.

---

What actually makes tools show up

From other dev reports:

Tools must be present in the MCP tool metadata

They must be valid (with proper annotations like readOnlyHint, etc.) when ChatGPT fetches the list

The MCP server must not just respond, but respond correctly so that ChatGPT thinks there’s something to use — otherwise it hides them

This has been flaky for devs in Dev Mode right now — sometimes ChatGPT doesn’t pick up the tools even if the server is correct

Other builders have observed that decorating tools appropriately makes a difference (e.g., readOnlyHint and openWorldHint for read tools), but that is just one of the examples reported.
