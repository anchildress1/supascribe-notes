import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      MCP_AUTH_TOKEN: 'test-auth-token',
      PORT: '0',
    },
  },
});
