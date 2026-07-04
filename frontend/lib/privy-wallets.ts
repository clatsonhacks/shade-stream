// Map a Privy user's linked accounts to the backend sync-privy payload.
// EVM wallets → chain "arbitrum-sepolia"; Stellar (if any) → "stellar-testnet".
import type { SyncWalletInput } from "./api"

type PrivyLinkedAccount = {
  type?: string
  address?: string
  chainType?: string
  walletClientType?: string
  walletClient?: string
  id?: string
}

export function walletsFromPrivyUser(user: { linkedAccounts?: PrivyLinkedAccount[]; wallet?: PrivyLinkedAccount } | null | undefined): SyncWalletInput[] {
  if (!user) return []
  const accounts = user.linkedAccounts ?? []
  const out: SyncWalletInput[] = []
  for (const a of accounts) {
    if (a.type !== "wallet" || !a.address) continue
    const isEvm = (a.chainType ?? "ethereum") === "ethereum"
    const source = (a.walletClientType ?? a.walletClient) === "privy" ? "privy_embedded" : "external"
    out.push({
      wallet_type: isEvm ? "EVM" : "STELLAR",
      wallet_source: source,
      chain: isEvm ? "arbitrum-sepolia" : "stellar-testnet",
      address: a.address,
      privy_wallet_id: a.id,
    })
  }
  // de-dupe by (type,address)
  const seen = new Set<string>()
  return out.filter((w) => {
    const k = `${w.wallet_type}:${w.address.toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
