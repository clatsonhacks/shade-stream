"use client"

import type React from "react"
import { PrivyProvider, usePrivy } from "@privy-io/react-auth"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { setTokenGetter } from "@/lib/token"
import { VaultProvider } from "@/lib/vault-store"

// Wires the Privy access token into the non-React api client, once, on mount.
function TokenBridge() {
  const { getAccessToken } = usePrivy()
  useEffect(() => {
    setTokenGetter(getAccessToken)
  }, [getAccessToken])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  )
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: { theme: "dark", accentColor: "#2563eb" },
        loginMethods: ["email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TokenBridge />
        <VaultProvider>{children}</VaultProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
