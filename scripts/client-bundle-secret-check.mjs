import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const root = path.resolve(process.cwd(), ".next", "static");
const sensitiveVariables = [
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "BETTER_AUTH_SECRET",
  "TENCENTCLOUD_SECRET_ID",
  "TENCENTCLOUD_SECRET_KEY",
  "LLM_API_KEY",
  "OPENAI_API_KEY",
  "AZURE_SPEECH_KEY",
  "SENTRY_AUTH_TOKEN"
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(target) : [target];
    })
  );
  return nested.flat();
}

const configured = sensitiveVariables
  .map((name) => ({ name, value: process.env[name]?.trim() }))
  .filter((entry) => entry.value && entry.value.length >= 8);
const files = await collectFiles(root);
const findings = [];

for (const file of files) {
  const content = await readFile(file);
  for (const entry of configured) {
    if (content.includes(Buffer.from(entry.value))) {
      findings.push({
        variable: entry.name,
        file: path.relative(process.cwd(), file)
      });
    }
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  scannedBundleFiles: files.length,
  configuredSensitiveVariablesChecked: configured.map((entry) => entry.name),
  note: "Values were compared in memory and were not printed."
}, null, 2));
