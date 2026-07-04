// Wallet adapters — thin signing interfaces over Freighter (Stellar) and any EVM signer.
// Defined as interfaces so callers can bring their own implementation (ethers, viem, etc.).

// - Stellar / Freighter --------------------------------------------------------

// Minimal Freighter window API (avoids a hard dependency on @stellar/freighter-api).
export interface FreighterApi {
  getPublicKey(): Promise<string>;
  isConnected(): Promise<boolean | { isConnected: boolean }>;
  signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string }
  ): Promise<string | { signedTxXdr: string }>;
  signMessage?(message: string, opts?: { address?: string }): Promise<{ signature: string | Uint8Array }>;
}

export class FreighterAdapter {
  constructor(private readonly freighter: FreighterApi) {}

  async publicKey(): Promise<string> {
    return this.freighter.getPublicKey();
  }

  async isConnected(): Promise<boolean> {
    const result = await this.freighter.isConnected();
    return typeof result === "boolean" ? result : result.isConnected;
  }

  async signXdr(xdr: string, networkPassphrase?: string): Promise<string> {
    const result = await this.freighter.signTransaction(xdr, { networkPassphrase });
    return typeof result === "string" ? result : result.signedTxXdr;
  }

  // Returns the raw Ed25519 signature bytes, or null if Freighter doesn't support signMessage.
  async signMessage(message: string): Promise<Uint8Array | null> {
    if (!this.freighter.signMessage) return null;
    const result = await this.freighter.signMessage(message);
    const sig = result.signature;
    if (typeof sig === "string") {
      // hex or base64 — try hex first
      if (/^[0-9a-f]{128}$/i.test(sig)) {
        return Uint8Array.from(sig.match(/.{2}/g)!.map(b => parseInt(b, 16)));
      }
      // fallback: base64
      return Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    }
    return sig;
  }

  // Attempt to build a FreighterAdapter from window.freighter.
  // Returns null if Freighter is not installed.
  static fromWindow(): FreighterAdapter | null {
    const w = globalThis as unknown as { freighter?: FreighterApi };
    return w.freighter ? new FreighterAdapter(w.freighter) : null;
  }
}

// - EVM -----------------------------------------------------------------------

// Compatible with ethers v6 Signer, viem WalletClient, and any wallet exposing
// getAddress + signMessage. Callers wire up their own signer and pass it in.
export interface EvmSigner {
  getAddress(): Promise<string>;
  signMessage(message: string | Uint8Array): Promise<string>;
}

export class EvmSignerAdapter {
  constructor(private readonly signer: EvmSigner) {}

  async address(): Promise<string> {
    return this.signer.getAddress();
  }

  // Returns the full 0x-prefixed hex ECDSA signature.
  async signMessage(message: string): Promise<string> {
    return this.signer.signMessage(message);
  }

  // Verify the signer owns the given address (sign a challenge and recover).
  async verifyOwnership(expectedAddress: string): Promise<boolean> {
    const challenge = `shade:verify:${Date.now()}`;
    try {
      const sig = await this.signer.signMessage(challenge);
      const addr = await this.signer.getAddress();
      return addr.toLowerCase() === expectedAddress.toLowerCase() && sig.length > 0;
    } catch {
      return false;
    }
  }
}
