import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseTokenVerifier } from '../../../src/lib/auth-provider.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('SupabaseTokenVerifier', () => {
  let mockSupabase: SupabaseClient;
  let mockGetUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetUser = vi.fn();
    mockSupabase = {
      auth: {
        getUser: mockGetUser,
      },
    } as unknown as SupabaseClient;
  });

  it('verifies Supabase JWT correctly', async () => {
    const verifier = new SupabaseTokenVerifier(mockSupabase);
    // Base64Url encoded payload: {"exp": 1234567890}
    const tokenWithPayload = `header.${Buffer.from(JSON.stringify({ exp: 1234567890 })).toString('base64')}.signature`;

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com', role: 'authenticated' } },
      error: null,
    });

    const authInfo = await verifier.verifyAccessToken(tokenWithPayload);

    expect(mockGetUser).toHaveBeenCalledWith(tokenWithPayload);
    expect(authInfo).toEqual({
      token: tokenWithPayload,
      clientId: 'user-123',
      scopes: [],
      expiresAt: 1234567890,
      extra: {
        email: 'test@example.com',
        role: 'authenticated',
      },
    });
  });

  it('handles Supabase verification failure', async () => {
    const verifier = new SupabaseTokenVerifier(mockSupabase);
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    await expect(verifier.verifyAccessToken('invalid-token')).rejects.toThrow(
      'Invalid access token',
    );
  });

  it('falls back to 1 hour expiration if token parsing fails', async () => {
    const verifier = new SupabaseTokenVerifier(mockSupabase);
    const unparseableToken = 'invalid-format-token';

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const authInfo = await verifier.verifyAccessToken(unparseableToken);

    expect(authInfo.expiresAt).toBeCloseTo(Math.floor(Date.now() / 1000) + 3600, -2); // Approx 1 hour (within 100s)
  });
});
