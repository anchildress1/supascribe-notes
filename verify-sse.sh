#!/bin/bash

# verify-sse.sh - Simple script to test SSE connection with Supabase auth

if [ -z "$1" ]; then
  echo "Usage: ./verify-sse.sh <SUPABASE_ACCESS_TOKEN>"
  echo ""
  echo "  Example:"
  echo "    ./verify-sse.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  echo ""
  echo "  To get a token manually:"
  echo "    1. Open your app/site in a browser where you are logged in"
  echo "    2. Open DevTools Console"
  echo "    3. Run: (await supabase.auth.getSession()).data.session.access_token"
  exit 1
fi

TOKEN=$1
URL=${2:-"http://localhost:8080/sse"}

echo "Testing SSE connection to $URL with provided token..."
echo "Press Ctrl+C to stop listening."
echo "---------------------------------------------------"

curl -v -N \
  -H "Authorization: Bearer $TOKEN" \
  "$URL"
