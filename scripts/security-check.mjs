import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scanEntries = [
  "app",
  "components",
  "docs",
  "lib",
  "scripts",
  "README.md",
  ".env.example",
  "AGENTS.md",
  "package.json"
];
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".md", ".json", ".css", ".html", ".example"]);
const ignoredNames = new Set(["node_modules", ".next", ".git", ".env.local", "package-lock.json"]);
const secretPatterns = [
  { name: "OpenAI-style API key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "private key block", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----/ },
  { name: "non-placeholder OPENAI_API_KEY assignment", pattern: /OPENAI_API_KEY[ \t]*=[ \t]*(?!\r?\n|replace|your|optional|#)[^\s#]+/i },
  { name: "non-placeholder LLM_API_KEY assignment", pattern: /LLM_API_KEY[ \t]*=[ \t]*(?!\r?\n|replace|your|optional|#)[^\s#]+/i },
  { name: "non-placeholder AZURE_SPEECH_KEY assignment", pattern: /AZURE_SPEECH_KEY[ \t]*=[ \t]*(?!\r?\n|replace|your|optional|#)[^\s#]+/i }
];

async function pathExists(targetPath) {
  try {
    await readdir(path.dirname(targetPath));
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(targetPath) {
  const name = path.basename(targetPath);
  if (ignoredNames.has(name)) return [];
  try {
    const entries = await readdir(targetPath, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => collectFiles(path.join(targetPath, entry.name))));
    return nested.flat();
  } catch {
    if (!allowedExtensions.has(path.extname(targetPath)) && !targetPath.endsWith(".env.example")) return [];
    return [targetPath];
  }
}

const files = [];
for (const entry of scanEntries) {
  const targetPath = path.join(root, entry);
  if (await pathExists(targetPath)) {
    files.push(...(await collectFiles(targetPath)));
  }
}

const findings = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const check of secretPatterns) {
    if (check.pattern.test(content)) {
      findings.push({ file: path.relative(root, file), check: check.name });
    }
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      scannedFiles: files.length,
      note: "Scanned source/docs/scripts/example files only; .env.local is intentionally excluded."
    },
    null,
    2
  )
);
