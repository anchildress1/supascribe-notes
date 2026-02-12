import { EventSource } from 'eventsource';
global.EventSource = EventSource;

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load .env manually if needed
if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// Use deployed URL
const MCP_SERVER_URL = 'https://supascribe-notes-mcp-800441415595.us-east1.run.app/sse';

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing env vars. Please check .env');
  process.exit(1);
}

// INLINE SCHEMA to avoid import issues
const ToolSchema = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          blurb: { type: 'string' },
          fact: { type: 'string' },
          category: { type: 'string' },
          signal: { type: 'integer', minimum: 1, maximum: 5 },
          tags: {
            type: 'object',
            properties: {
              lvl0: { type: 'array', items: { type: 'string' } },
              lvl1: { type: 'array', items: { type: 'string' } },
            },
          },
          projects: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'blurb', 'fact', 'category', 'signal', 'tags'],
      },
    },
  },
  required: ['cards'],
};

async function main() {
  console.log(`Target: ${MCP_SERVER_URL}`);

  // 1. Authenticate with Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Auth logic - create a temp user
  const email = `mcp-test-${Date.now()}@example.com`;
  const password = 'TestPassword123!';

  let { data, error } = await supabase.auth.signUp({ email, password });

  // Fallback if needed
  if (!data.session && error) {
    console.warn(`Signup error: ${error.message}, trying sign in...`);
    // This implies we reuse an account, which might fail if we don't know one.
    // But for a dynamic email it shouldn't happen unless rate limited.
  }

  let token = data.session?.access_token;
  if (!token) {
    console.error(
      '❌ Could not get access token (Email confirm?). Using fallback/skip if possible?',
    );
    console.error('If you have a VALID TOKEN, set it as MCP_TOKEN env var.');
    token = process.env.MCP_TOKEN;
  }

  if (!token) {
    console.error('No token available. Exiting.');
    process.exit(1);
  }
  console.log('✅ Authenticated.');

  // 2. Connect MCP
  const transport = new SSEClientTransport(new URL(MCP_SERVER_URL), {
    eventSourceInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

  await client.connect(transport);
  console.log('✅ MCP Connected.');

  // 3. List Tools
  const result = await client.listTools();
  const tool = result.tools.find((t) => t.name === 'write_cards');
  if (!tool) throw new Error('write_cards tool not found');
  console.log('✅ Tool found.');

  // 4. OpenAI
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const toolDef = {
    type: 'function',
    function: {
      name: 'write_cards',
      description: tool.description,
      parameters: ToolSchema,
    },
  };

  console.log('Asking OpenAI...');
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Create a flashcard about "Consistency in Distributed Systems".' },
    ],
    tools: [toolDef],
    tool_choice: 'required',
  });

  const toolCall = completion.choices[0].message.tool_calls?.[0];
  if (!toolCall) throw new Error('No tool call');

  console.log(`✅ OpenAI invoked: ${toolCall.function.name}`);
  const args = JSON.parse(toolCall.function.arguments);

  // 5. Execute
  console.log('Executing on remote server...');
  const execResult = await client.callTool({
    name: toolCall.function.name,
    arguments: args,
  });

  console.log('--- Result ---');
  console.log(JSON.stringify(execResult, null, 2));

  client.close();
}

main().catch(console.error);
