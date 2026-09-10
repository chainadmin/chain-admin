export function resolvePostmarkTokenForDelivery(
  storedToken: string | null | undefined,
  decrypt: (value: string) => string,
): string | null {
  const token = storedToken?.trim();
  if (!token) return null;

  try {
    return token.startsWith('enc:v1:') ? decrypt(token) : token;
  } catch {
    // Credentials encrypted with an old application key must not disable all
    // outbound mail. Returning null selects the platform Postmark server.
    return null;
  }
}

export function isPostmarkAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    statusCode?: unknown;
    code?: unknown;
    ErrorCode?: unknown;
    message?: unknown;
  };
  if (candidate.statusCode === 401 || candidate.code === 10 || candidate.ErrorCode === 10) {
    return true;
  }

  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return message.includes('unauthorized')
    || message.includes('invalid server token')
    || message.includes('invalid api token');
}
