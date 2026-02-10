export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  mcpAuthToken: string;
  port: number;
}

export function loadConfig(): Config {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const mcpAuthToken = requireEnv('MCP_AUTH_TOKEN');
  const port = parseInt(process.env['PORT'] ?? '8080', 10);

  if (isNaN(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be a valid port number (0–65535)');
  }

  return { supabaseUrl, supabaseServiceRoleKey, mcpAuthToken, port };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
