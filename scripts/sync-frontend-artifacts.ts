// Copy compiled Foundry artifacts into the frontend so the browser bundle can
// import them without reaching across the workspace boundary. The frontend
// consumes only the abi + bytecode fields — we strip everything else so the
// bundle stays small.
//
// Run: npx tsx scripts/sync-frontend-artifacts.ts
// Runs automatically as part of `frontend/npm run dev` and `frontend/npm run build`
// via the postinstall/prebuild hook (see frontend/package.json).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"

const ROOT = process.env.SHADE_ROOT ?? process.cwd()
const OUT_DIR = resolve(ROOT, "frontend/lib/artifacts")

type Artifact = { abi: unknown; bytecode: string }

const CONTRACTS: { name: string; src: string; dst: string }[] = [
  {
    name: "StreamPay",
    src: "contracts/arc/out/StreamPay.sol/StreamPay.json",
    dst: "StreamPay.json",
  },
]

function copyOne(c: { name: string; src: string; dst: string }): void {
  const src = resolve(ROOT, c.src)
  if (!existsSync(src)) {
    console.error(`\x1b[31m✗ ${c.name}: artifact not found at ${c.src}\x1b[0m`)
    console.error(`  run: cd contracts/arc && forge build`)
    process.exit(1)
  }
  const j = JSON.parse(readFileSync(src, "utf8")) as { abi: unknown; bytecode: { object: string } }
  const minimal: Artifact = { abi: j.abi, bytecode: j.bytecode.object }
  const dst = resolve(OUT_DIR, c.dst)
  mkdirSync(dirname(dst), { recursive: true })
  writeFileSync(dst, JSON.stringify(minimal, null, 2))
  console.log(`\x1b[32m✓\x1b[0m ${c.name} → frontend/lib/artifacts/${c.dst}`)
}

for (const c of CONTRACTS) copyOne(c)
