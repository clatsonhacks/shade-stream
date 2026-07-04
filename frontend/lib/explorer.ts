// Stellar / Arbitrum testnet explorer link helpers + hash shortening.
export const stellarTx = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`
export const stellarContract = (id: string) => `https://stellar.expert/explorer/testnet/contract/${id}`
export const arbTx = (h: string) => `https://sepolia.arbiscan.io/tx/${h}`

export function shortHash(s: string, head = 8, tail = 6): string {
  if (!s) return ""
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s
}
