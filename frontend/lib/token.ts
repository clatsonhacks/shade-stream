// Bridges the Privy access token (only reachable via the usePrivy() hook) to the
// non-React api client. Providers sets the getter once on mount; api.ts reads it.
let _getToken: (() => Promise<string | null>) | null = null

export function setTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn
}

export async function getAccessToken(): Promise<string | null> {
  if (!_getToken) return null
  try {
    return await _getToken()
  } catch {
    return null
  }
}
