#!/bin/bash
# Usage: ./debug-mcp.sh <access_token>
# Debugs the MCP connection and lists tools via direct HTTP/SSE interaction.

URL="https://supascribe-notes-mcp-800441415595.us-east1.run.app/sse"
TOKEN="$1"

if [ -z "$TOKEN" ]; then
  echo "Usage: ./debug-mcp.sh <access_token>"
  exit 1
fi

echo "=================================================="
echo "DEBUGGING MCP CONNECTION"
echo "=================================================="
echo "Target: $URL"
echo "Token:  ${TOKEN:0:10}..."
echo "--------------------------------------------------"

# Start curl in background to capture the SSE stream
# -N: no buffer, -v: verbose (to stderr)
curl -N -H "Authorization: Bearer $TOKEN" "$URL" > /tmp/mcp_sse_out 2>&1 &
PID=$!

echo "⏳ Waiting for SSE connection..."
sleep 3

# Check if file exists and has content
if [ ! -s /tmp/mcp_sse_out ]; then
    echo "❌ No data received from SSE endpoint."
    echo "   Check server logs or token validity."
    kill $PID
    exit 1
fi

# Parse the endpoint URL from the stream
# Expected format: event: endpoint \n data: /messages?sessionId=...
SESSION_URI=$(grep "data: " /tmp/mcp_sse_out | grep "sessionId" | head -n 1 | cut -d' ' -f2)

if [ -z "$SESSION_URI" ]; then
  echo "❌ Failed to get session endpoint."
  echo "--- Raw Output Start ---"
  head -n 20 /tmp/mcp_sse_out
  echo "--- Raw Output End ---"
  kill $PID
  exit 1
fi

FULL_URL="https://supascribe-notes-mcp-800441415595.us-east1.run.app$SESSION_URI"
echo "✅ Session Endpoint: $FULL_URL"

echo "--------------------------------------------------"
echo "SENDING: Initialize"
# JSON-RPC Initialize
curl -s -X POST "$FULL_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "debug-script", "version": "1.0" }
    }
  }' > /dev/null

echo "⏳ Waiting for response..."
sleep 2

echo "SENDING: Notifications/Initialized"
curl -s -X POST "$FULL_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }' > /dev/null

sleep 1

echo "SENDING: Tools/List"
curl -s -X POST "$FULL_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }' > /dev/null

echo "⏳ Waiting for tools..."
sleep 3

echo "=================================================="
echo "CAPTURED SSE STREAM (Server Responses)"
echo "=================================================="
cat /tmp/mcp_sse_out
echo "=================================================="

# Also fetch OpenAPI spec for comparison
echo "FETCHING OpenAPI Spec..."
curl -s "https://supascribe-notes-mcp-800441415595.us-east1.run.app/openapi.json" > /tmp/openapi_debug.json
head -n 20 /tmp/openapi_debug.json
echo "..."

kill $PID
rm /tmp/mcp_sse_out
