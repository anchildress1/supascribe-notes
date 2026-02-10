import type { Request, Response, NextFunction } from 'express';
import type { SupabaseTokenVerifier } from '../lib/auth-provider.js';
import { logger } from '../lib/logger.js';

export function createAuthMiddleware(authVerifier: SupabaseTokenVerifier, publicUrl: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Check for browser navigation (AcceptHeader includes text/html)
      // BUT exclude /sse, which must return 401 + WWW-Authenticate for the client to handle it
      if (req.accepts('html') && !req.path.endsWith('/sse')) {
        res.status(401).type('text/html').send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authentication Required</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                  max-width: 600px;
                  margin: 40px auto;
                  padding: 20px;
                  text-align: center;
                  line-height: 1.6;
                  color: #333;
                }
                h1 {
                  font-size: 24px;
                  margin-bottom: 20px;
                }
                p {
                  margin-bottom: 10px;
                }
                .logo {
                  font-size: 48px;
                  margin-bottom: 20px;
                }
              </style>
            </head>
            <body>
              <div class="logo">🔐</div>
              <h1>Authentication Required</h1>
              <p>This is a Supabase MCP Server. It requires a valid authorization token to access.</p>
              <p>Please return to your MCP Client (e.g. ChatGPT) to verify your credentials and finish linking.</p>
            </body>
          </html>
        `);
        return;
      }

      res.set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"`,
      );
      res.type('text/plain').status(401).send('Unauthorized');
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Check OAuth Token
    try {
      await authVerifier.verifyAccessToken(token);
      next();
    } catch (error) {
      logger.warn({ error }, 'Authentication failed');
      // If the token is invalid, we can technically also send the challenge,
      // but a 401 with "Invalid token" is also acceptable.
      // To be safe and help clients discover the config, let's include the header here too.
      res.set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource", error="invalid_token"`,
      );
      res.type('text/plain').status(401).send('Invalid token');
    }
  };
}
