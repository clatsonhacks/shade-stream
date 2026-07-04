import { createHash } from "node:crypto";
import { ASSETS, assetIdField, assetIdHex, assetBySymbol, assetByIdHex, makeAssetConfig } from "./index.js";

// asset registry tests (spec .

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed++;
}

const BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const BLS_R = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;

// assetId derivation matches the contract/circuit hash_to_field(strkey) ---
{
  const token = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  const expected = BigInt("0x" + createHash("sha256").update(token).digest().subarray(0, 31).toString("hex")).toString();
  check("assetIdField = int(sha256(token)[:31])", assetIdField(token) === expected, assetIdField(token));

  const field = BigInt(assetIdField(token));
  check("assetIdField is a valid field element on BN254 and BLS12-381", field < BN254_P && field < BLS_R);
  check("assetIdHex is 0x + 64 hex", /^0x[0-9a-f]{64}$/.test(assetIdHex(token)));
  check("assetIdHex encodes assetIdField big-endian", BigInt(assetIdHex(token)) === field);
}

// USDC and XLM are distinct assets with distinct ids ---
{
  check("USDC and XLM registered", !!ASSETS.USDC && !!ASSETS.XLM);
  check("USDC != XLM assetId", ASSETS.USDC.assetIdHex !== ASSETS.XLM.assetIdHex);
  check("USDC symbol/decimals", ASSETS.USDC.symbol === "USDC" && ASSETS.USDC.decimals === 7);
  check("XLM symbol/decimals", ASSETS.XLM.symbol === "XLM" && ASSETS.XLM.decimals === 7);
}

// lookups ---
{
  check("assetBySymbol(USDC) round-trips", assetBySymbol("USDC").assetIdHex === ASSETS.USDC.assetIdHex);
  check("assetByIdHex round-trips", assetByIdHex(ASSETS.XLM.assetIdHex).symbol === "XLM");
  let threw = false;
  try { assetBySymbol("DOGE"); } catch { threw = true; }
  check("unknown symbol rejected (no default)", threw);
  threw = false;
  try { assetByIdHex("0x" + "ff".repeat(32)); } catch { threw = true; }
  check("unknown assetId rejected (no default)", threw);
}

// determinism ---
{
  const a = makeAssetConfig("USDC", "CTESTTOKEN");
  const b = makeAssetConfig("USDC", "CTESTTOKEN");
  check("makeAssetConfig is deterministic", a.assetIdHex === b.assetIdHex);
}

if (failed > 0) {
  console.error(`\nASSETS TESTS FAILED: ${failed} failing`);
  process.exit(1);
}
console.log("\nASSETS TESTS PASS");
