export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
  port: number;
  publicUrl: string;
}

export function loadConfig(): Config {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  // Required for client-side Auth UI
  const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
  const port = parseInt(process.env['PORT'] ?? '8080', 10);

  if (isNaN(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be a valid port number (0–65535)');
  }

  // Log configuration (secrets redacted) is now handled by the caller or we can export a safe config object
  // For now, let's keep it simple here and let the caller log if needed, or add a log here if we import logger.
  // Given the plan says "Log loaded configuration", let's do it in index.ts where we have the logger,
  // or import logger here. Let's import logger here to be self-contained but avoid circular deps if logger uses config (it doesn't).

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseAnonKey,
    port,
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
