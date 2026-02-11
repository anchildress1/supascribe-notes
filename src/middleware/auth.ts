import type { Request, Response, NextFunction } from 'express';
import type { SupabaseTokenVerifier } from '../lib/auth-provider.js';
import { logger } from '../lib/logger.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

export function createAuthMiddleware(authVerifier: SupabaseTokenVerifier, publicUrl: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    // 1. Try Authorization header (case-insensitive)
    const match = authHeader?.match(/^Bearer\s+(.+)$/i);
    if (match) {
      token = match[1];
    } else if (authHeader) {
      logger.warn(
        { authHeader: authHeader.substring(0, 10) + '...' },
        'Authorization header present but invalid format',
      );
    }

    if (!token) {
      // Handle OAuth Redirect misconfiguration:
      // If the user lands on ANY protected endpoint (like /sse) with an authorization_id query param
      // and accepts HTML, redirect them to the root / which handles the Auth UI.
      // Redirect logic removed as it interferes with standard OAuth flow

      // Check for browser navigation (AcceptHeader includes text/html)
      // BUT exclude /sse, which must return 401 + WWW-Authenticate for the client to handle it
      if (req.accepts('html') && !req.originalUrl.includes('/sse')) {
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
                  font-size: 16px;
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

      const resourceMetadataUrl = `${publicUrl}/.well-known/oauth-protected-resource`;

      res.set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      res.type('text/plain').status(401).send('Unauthorized');
      return;
    }

    // Check OAuth Token
    try {
      const authInfo = await authVerifier.verifyAccessToken(token);
      (req as AuthenticatedRequest).user = { id: authInfo.clientId };
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMessage }, 'Authentication failed');
      // If the token is invalid, we can technically also send the challenge,
      // but a 401 with "Invalid token" is also acceptable.
      // To be safe and help clients discover the config, let's include the header here too.
      const resourceMetadataUrl = `${publicUrl}/.well-known/oauth-protected-resource`;

      res.set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token"`,
      );
      res.type('text/plain').status(401).send('Invalid token');
    }
  };
}
