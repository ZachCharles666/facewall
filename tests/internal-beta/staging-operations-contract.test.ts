import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const readinessScript = readFileSync(
  join(projectRoot, "scripts/staging/passbuddy-local-readiness.sh"),
  "utf8"
);
const readinessService = readFileSync(
  join(projectRoot, "scripts/staging/passbuddy-local-readiness.service"),
  "utf8"
);
const readinessTimer = readFileSync(
  join(projectRoot, "scripts/staging/passbuddy-local-readiness.timer"),
  "utf8"
);
const llmProbe = readFileSync(
  join(projectRoot, "scripts/staging/passbuddy-llm-fixture-probe.ts"),
  "utf8"
);
const llmProvider = readFileSync(
  join(projectRoot, "lib/ai/provider.ts"),
  "utf8"
);
const profileRoute = readFileSync(
  join(projectRoot, "app/api/profile/parse/route.ts"),
  "utf8"
);

test("staging readiness check covers app, database and backup without a vendor dependency", () => {
  for (const requiredCheck of [
    "https_health",
    "local_health",
    "pm2",
    "postgres",
    "backup_timer",
    "backup_service",
    "backup_freshness",
    "backup_checksum"
  ]) {
    assert.match(readinessScript, new RegExp(`"${requiredCheck}"`));
  }

  assert.match(readinessScript, /--connect-timeout 3/);
  assert.match(readinessScript, /--max-time 8/);
  assert.match(readinessScript, /timeout 5s/);
  assert.match(readinessScript, /timeout 15s sha256sum/);
  assert.match(readinessScript, /PASSBUDDY_PM2_USER:-ubuntu/);
  assert.match(readinessScript, /PASSBUDDY_PM2_HOME:-\/home\/\$\{PM2_USER\}\/\.pm2/);
  assert.match(readinessScript, /runuser --user "\$PM2_USER" --/);
  assert.match(readinessScript, /env PM2_HOME="\$PM2_HOME_DIR" "\$PM2_BIN" jlist/);
  assert.match(readinessScript, /process\.exit\(match\?\.pm2_env\?\.status === "online"/);
  assert.match(readinessScript, /pg_isready/);
  assert.match(readinessScript, /systemctl is-enabled/);
  assert.match(readinessScript, /BACKUP_MAX_AGE_SEC/);
  assert.match(readinessScript, /passbuddy\.staging\.readiness/);
  assert.doesNotMatch(readinessScript, /sentry|wechat|weixin|email|webhook/i);
  assert.doesNotMatch(readinessScript, /DATABASE_URL|AUTHORIZATION|COOKIE|TOKEN|SECRET/i);
});

test("staging readiness timer is local-only and records results through systemd", () => {
  assert.match(readinessService, /Type=oneshot/);
  assert.match(readinessService, /ExecStart=\/usr\/local\/sbin\/passbuddy-local-readiness/);
  assert.match(readinessService, /NoNewPrivileges=true/);
  assert.match(readinessService, /ProtectSystem=strict/);
  assert.match(readinessTimer, /OnUnitActiveSec=5min/);
  assert.match(readinessTimer, /Persistent=true/);
  assert.doesNotMatch(
    `${readinessService}\n${readinessTimer}`,
    /sentry|wechat|weixin|email|webhook/i
  );
});

test("controlled LLM staging probe makes one fixture request and emits measurement only", () => {
  assert.match(llmProbe, /demoScenario\.resumeText/);
  assert.match(llmProbe, /\/api\/profile\/parse/);
  assert.match(llmProbe, /x-request-id/);
  assert.match(llmProbe, /providerUsageReturned/);
  assert.match(llmProbe, /requestIdMatches/);
  assert.match(llmProbe, /attempts\) !== 1/);
  assert.match(llmProbe, /async function main\(\)/);
  assert.match(llmProbe, /void main\(\)/);
  assert.doesNotMatch(llmProbe, /^const response = await /m);
  assert.doesNotMatch(llmProbe, /console\.(?:log|error)\([^)]*(?:resumeText|jdText|data)/);

  assert.match(llmProvider, /maxAttempts\?: 1 \| 2/);
  assert.match(llmProvider, /options\?\.maxAttempts === 1/);
  assert.match(llmProvider, /candidates\.slice\(0, 1\)/);
  assert.match(profileRoute, /PASSBUDDY_LLM_MAX_ATTEMPTS === "1" \? 1 : 2/);
});
