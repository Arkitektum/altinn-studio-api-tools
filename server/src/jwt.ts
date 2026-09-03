/**
 * Decoding only, never verification. These tokens are minted by the Altinn test token
 * generator and handed straight back to Altinn, which does the actual validation. We read
 * the claims purely to show the operator who they are acting as and when the token dies.
 */
export interface DecodedToken {
  claims: Record<string, unknown>;
  expiresAt: string | null;
  issuedAt: string | null;
  scopes: string[];
}

function decodeSegment(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JWT payload is not an object');
  }
  return parsed as Record<string, unknown>;
}

export function decodeJwt(token: string): DecodedToken {
  const parts = token.split('.');
  const payloadSegment = parts[1];
  if (parts.length < 2 || !payloadSegment) {
    throw new Error('Not a JWT: expected at least two dot-separated segments.');
  }
  const claims = decodeSegment(payloadSegment);

  const toIso = (value: unknown): string | null =>
    typeof value === 'number' && Number.isFinite(value)
      ? new Date(value * 1000).toISOString()
      : null;

  const rawScope = claims['scope'];
  const scopes =
    typeof rawScope === 'string'
      ? rawScope.split(' ').filter(Boolean)
      : Array.isArray(rawScope)
        ? rawScope.filter((s): s is string => typeof s === 'string')
        : [];

  return {
    claims,
    expiresAt: toIso(claims['exp']),
    issuedAt: toIso(claims['iat']),
    scopes,
  };
}
