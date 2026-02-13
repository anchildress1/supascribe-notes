import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { logger } from './logger.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseTokenVerifier implements OAuthTokenVerifier {
  constructor(private supabase: SupabaseClient) {}

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Verify with Supabase
    // getUser validates the JWT signature and checks if the user exists/is verified
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser(token);

    if (error) {
      logger.error({ error }, 'Supabase getUser failed');
      throw new Error(`Invalid access token: ${error.message}`);
    }

    if (!user) {
      logger.error('Supabase getUser returned no user');
      throw new Error('Invalid access token: No user found');
    }

    logger.debug({ userId: user.id }, 'Supabase token verified successfully');

    // Extract expiration from token directly since getUser validates it but doesn't return exp
    let expiresAt: number;
    try {
      // Base64Url decode (replace - with +, _ with / and remove padding)
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      // Buffer.from handles missing padding for base64
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString());

      if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
        expiresAt = payload.exp;
      } else {
        throw new Error('Invalid exp claim');
      }
    } catch {
      // Fallback if token parsing fails (shouldn't happen for valid JWT)
      expiresAt = Math.floor(Date.now() / 1000) + 3600;
    }

    return {
      token,
      clientId: user.id,
      scopes: [],
      expiresAt,
      extra: {
        email: user.email,
        role: user.role,
      },
    };
  }
}
