import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";

export type EnvMap = Record<string, string>;

export async function loadRuntimeEnv(): Promise<EnvMap> {
  for (const path of [process.env.SHADE_ENV_FILE ?? ".env", ".env", ".env.generated", "../.env"]) {
    if (existsSync(path)) config({ path, override: false });
  }
  const env: EnvMap = { ...process.env } as EnvMap;
  if (existsSync(".env.generated")) {
    const generated = await readFile(".env.generated", "utf8");
    for (const line of generated.split("\n")) {
      const trimmed = line.replace(/\r$/, "");
      if (!trimmed.includes("=") || trimmed.trimStart().startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    }
  }
  return env;
}

export function requireKeys(env: EnvMap, keys: string[]): string[] {
  return keys.filter((key) => !env[key]);
}
