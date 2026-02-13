# Troubleshooting: ChatGPT Tool Visibility

## Error: "All tools are hidden. Make at least one tool public to use it in ChatGPT."

### Root Cause

ChatGPT Apps SDK reads tool descriptors via MCP `tools/list`. Each tool descriptor
must include proper `_meta` and `annotations` for ChatGPT to consider it "public."

When tools lack these fields, ChatGPT hides all of them.

### Required Fields on Each Tool Descriptor

1. **`_meta.ui.visibility`** — Controls whether ChatGPT (model) and/or the UI (app)
   can see the tool. Default is `["model", "app"]` but must be explicit.

   ```typescript
   _meta: {
     ui: { visibility: ['model', 'app'] },
   }
   ```

2. **`annotations`** — ChatGPT validates these during publishing. All three are required:

   | Annotation        | Type    | Purpose                                           |
   | ----------------- | ------- | ------------------------------------------------- |
   | `readOnlyHint`    | boolean | Tool only reads/computes; no side effects         |
   | `destructiveHint` | boolean | Tool may delete/overwrite data                    |
   | `openWorldHint`   | boolean | Tool publishes content outside the user's account |

   Optional: `idempotentHint` (boolean) — repeated calls with same args are safe.

3. **`title`** — Human-readable tool name. Improves discoverability in the ChatGPT UI.

### Example (health tool)

```typescript
server.registerTool(
  'health',
  {
    title: 'Health Check',
    description: 'Check server and Supabase connectivity status',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: {
      ui: { visibility: ['model', 'app'] },
    },
  },
  async () => handleHealth(supabase),
);
```

### OpenAPI Spec (REST fallback)

If using the REST/Actions path instead of MCP, ensure:

1. Every operation lives under `paths -> /route -> method -> operationId`
2. `components.securitySchemes.BearerAuth` exists and is referenced
3. All `$ref` schemas resolve (e.g., `#/components/schemas/WriteCardsInput`)
4. `x-openai-isConsequential: true` on write operations

### Known Flakiness

ChatGPT Dev Mode has reported intermittent failures where valid tools are not picked up.
If tools are correctly annotated and still hidden, disconnect and reconnect the app in
ChatGPT settings. This is a known platform issue, not a server bug.
