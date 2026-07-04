import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  // Pino & friends are Node-only logging libs pulled in transitively by
  // Privy -> WalletConnect -> Reown. Keep them out of the bundle so Turbopack
  // doesn't try to parse their internal test files.
  serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
  turbopack: {
    // This app lives in a nested folder with multiple lockfiles; pin the root
    // so Next doesn't misinfer the workspace root.
    root: __dirname,
  },
}

export default nextConfig
