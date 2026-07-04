import { createHash } from "node:crypto";

// asset registry (spec . The security source of truth for an asset
// is its canonical Stellar token/SAC contract id — NOT the display symbol. Every
// asset maps to a deterministic field-compatible `assetId` used inside the ZK
// commitment and bound on-chain.
// assetId = hash_to_field(canonical token contract) where hash_to_field is the
// SAME reduction the circuits (coinutils) and the shielded_pool contract use:
// int(sha256(tokenContract)[:31 bytes] )
// Taking the first 31 bytes (248 bits) keeps it well under both the BN254 and
// BLS12-381 scalar field moduli, so the value is a valid field element on either
// curve and never needs a modular reduction that could differ across engines.

export type AssetSymbol = "USDC" | "XLM";

export type AssetConfig = {
  symbol: AssetSymbol;
  /** BytesN<32>-compatible field id, 0x + 64 hex (big-endian). */
  assetIdHex: string;
  /** Field element as a decimal string (circuit witness input). */
  assetIdField: string;
  /** Stellar token/SAC contract id (C...). */
  tokenContract: string;
  /** Stellar-side accounting precision. */
  decimals: number;
};

/** Field element (decimal string) for a canonical token contract id. */
export function assetIdField(tokenContract: string): string {
  const sha = createHash("sha256").update(tokenContract).digest();
  return BigInt("0x" + sha.subarray(0, 31).toString("hex")).toString();
}

/** 0x-prefixed 32-byte big-endian hex of the asset id (register_asset arg). */
export function assetIdHex(tokenContract: string): string {
  const field = BigInt(assetIdField(tokenContract));
  return "0x" + field.toString(16).padStart(64, "0");
}

/** Build a full AssetConfig from a symbol + canonical token contract id. */
export function makeAssetConfig(symbol: AssetSymbol, tokenContract: string, decimals = 7): AssetConfig {
  return {
    symbol,
    tokenContract,
    decimals,
    assetIdField: assetIdField(tokenContract),
    assetIdHex: assetIdHex(tokenContract)
  };
}

// Canonical testnet token contracts. Overridable via env so a fresh deploy can
// point at freshly-issued SACs without code changes. Defaults are the documented
// Stellar testnet USDC SAC and the native-XLM SAC.
const USDC_TOKEN =
  process.env.USDC_SAC_CONTRACT ?? "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const XLM_TOKEN =
  process.env.XLM_SAC_CONTRACT ?? "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const ASSETS: Record<AssetSymbol, AssetConfig> = {
  USDC: makeAssetConfig("USDC", USDC_TOKEN),
  XLM: makeAssetConfig("XLM", XLM_TOKEN)
};

/** Look up a registered asset by symbol; throws on unknown symbol (no default). */
export function assetBySymbol(symbol: string): AssetConfig {
  const cfg = (ASSETS as Record<string, AssetConfig | undefined>)[symbol];
  if (!cfg) throw new Error(`unknown asset symbol: ${symbol}`);
  return cfg;
}

/** Look up a registered asset by its assetIdHex (0x…). Throws if unregistered. */
export function assetByIdHex(idHex: string): AssetConfig {
  const norm = idHex.startsWith("0x") ? idHex.toLowerCase() : "0x" + idHex.toLowerCase();
  const found = Object.values(ASSETS).find((a) => a.assetIdHex.toLowerCase() === norm);
  if (!found) throw new Error(`unknown assetId: ${idHex}`);
  return found;
}
