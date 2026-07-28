import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const baseUrl = "http://localhost:3000";
const debugPort = 9337;
const initialAppPid = Number(process.argv[2]);
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const artifactDirectory = path.resolve(
  process.cwd(),
  "docs",
  "internal-beta",
  "evidence",
  "artifacts",
  "post-ib06"
);
const profileDirectory = path.resolve(
  process.cwd(),
  "outputs",
  `.post-ib06-chrome-${process.pid}`
);
const pool = new Pool({
  connectionString: process.env.DATABASE_ADMIN_URL,
  application_name: "post-ib06-browser-matrix"
});

mkdirSync(artifactDirectory, { recursive: true });
mkdirSync(profileDirectory, { recursive: true });

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), timeoutMs);
    })
  ]);
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`HTTP_NOT_READY: ${url}`);
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`JSON_NOT_READY: ${url}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  async open() {
    await withTimeout(
      new Promise((resolve, reject) => {
        this.socket.addEventListener("open", resolve, { once: true });
        this.socket.addEventListener("error", reject, { once: true });
      }),
      10_000,
      "cdp-open"
    );
    this.socket.addEventListener("message", async (message) => {
      const raw =
        typeof message.data === "string"
          ? message.data
          : typeof message.data?.text === "function"
            ? await message.data.text()
            : Buffer.from(message.data).toString("utf8");
      const payload = JSON.parse(raw);
      if (payload.id) {
        const pending = this.pending.get(payload.id);
        if (!pending) return;
        this.pending.delete(payload.id);
        if (payload.error) pending.reject(new Error(payload.error.message));
        else pending.resolve(payload.result);
        return;
      }
      const listeners = this.events.get(payload.method) ?? [];
      this.events.delete(payload.method);
      listeners.forEach((resolve) => resolve(payload.params));
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return withTimeout(
      new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.socket.send(JSON.stringify({ id, method, params }));
      }),
      10_000,
      method
    );
  }

  once(method) {
    return withTimeout(
      new Promise((resolve) => {
        const listeners = this.events.get(method) ?? [];
        listeners.push(resolve);
        this.events.set(method, listeners);
      }),
      15_000,
      method
    );
  }

  close() {
    this.socket.close();
  }
}

function stopProcessTree(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try {
    execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  } catch {}
}

async function createTarget() {
  const response = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" }
  );
  if (!response.ok) throw new Error("CDP_TARGET_CREATE_FAILED");
  return response.json();
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "BROWSER_EVALUATION_FAILED");
  }
  return result.result.value;
}

async function waitForExpression(client, expression, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`BROWSER_WAIT_FAILED: ${expression}`);
}

async function navigate(client, url) {
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
}

async function clickButton(client, text) {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (item) => (item.textContent || "").trim().includes(${JSON.stringify(text)})
      );
      if (!button) return false;
      button.click();
      return true;
    })()`
  );
  assert.equal(clicked, true, `button not found: ${text}`);
}

async function screenshot(client, filename) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  writeFileSync(path.join(artifactDirectory, filename), Buffer.from(result.data, "base64"));
}

async function latestFixtureSession(scenario) {
  const result = await pool.query(
    `select s.id, s.status, s.version
       from public.interview_sessions s
      where s.user_id like $1
      order by s.created_at desc
      limit 1`,
    [`browser-fixture-${scenario}-%`]
  );
  assert.ok(result.rows[0], `missing ${scenario} fixture session`);
  return result.rows[0];
}

async function cleanupFixtures() {
  const users = await pool.query(
    `select id from auth."user" where id like 'browser-fixture-%'`
  );
  const userIds = users.rows.map((row) => String(row.id));
  if (userIds.length === 0) return;
  const schools = await pool.query(
    `select id from public.schools where code like 'browser-fixture-%'`
  );
  const schoolIds = schools.rows.map((row) => String(row.id));
  await pool.query(
    `delete from public.api_request_metrics
      where request_id like 'browser-fixture-%'`
  );
  await pool.query(
    `delete from public.admin_audit_logs
      where admin_user_id = any($1::text[])`,
    [userIds]
  );
  await pool.query(
    `delete from public.product_events where user_id = any($1::text[])`,
    [userIds]
  );
  await pool.query(
    `delete from public.feedback where user_id = any($1::text[])`,
    [userIds]
  );
  await pool.query(
    `delete from public.interview_answers where user_id = any($1::text[])`,
    [userIds]
  );
  await pool.query(
    `delete from public.interview_sessions where user_id = any($1::text[])`,
    [userIds]
  );
  await pool.query(
    `delete from public.consent_records where user_id = any($1::text[])`,
    [userIds]
  );
  await pool.query(
    `delete from public.user_profiles where user_id = any($1::text[])`,
    [userIds]
  );
  await pool.query(
    `delete from public.invite_codes
      where created_by = any($1::text[]) or school_id = any($2::uuid[])`,
    [userIds, schoolIds]
  );
  await pool.query(
    `delete from public.schools where id = any($1::uuid[])`,
    [schoolIds]
  );
  await pool.query(`delete from auth."user" where id = any($1::text[])`, [userIds]);
}

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`,
    "--window-size=390,844",
    "about:blank"
  ],
  { stdio: "ignore", windowsHide: true }
);

let replacementApp = null;
let client = null;
const summary = {
  consentPrivacy: [],
  sessionRecovery: null,
  persistenceFault: null,
  feedback: [],
  admin: null
};

try {
  await waitForHttp(baseUrl);
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await createTarget();
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });

  for (const theme of ["figma", "juju", "classic"]) {
    await navigate(
      client,
      `${baseUrl}/api/dev/browser-fixture?scenario=consent&theme=${theme}`
    );
    await waitForExpression(
      client,
      `document.querySelector("h1")?.textContent?.includes("隐私说明")`
    );
    const consent = await evaluate(
      client,
      `({
        title: document.querySelector("h1")?.textContent || "",
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        checkbox: document.querySelectorAll('input[type="checkbox"]').length === 1,
        actions: [...document.querySelectorAll("button")].filter(
          (item) => ["同意并进入产品", "申请删除数据", "退出登录"].some(
            (label) => (item.textContent || "").includes(label)
          )
        ).length
      })`
    );
    await screenshot(client, `consent-${theme}-390x844.png`);
    await evaluate(
      client,
      `(() => {
        const checkbox = document.querySelector('input[type="checkbox"]');
        checkbox.click();
        return checkbox.checked;
      })()`
    );
    await clickButton(client, "同意并进入产品");
    await waitForExpression(
      client,
      `[...document.querySelectorAll("button")].some(
        (item) => (item.textContent || "").includes("隐私与数据")
      )`
    );
    await clickButton(client, "隐私与数据");
    await waitForExpression(
      client,
      `document.querySelector(".privacy-panel") || document.querySelector(".privacy-copy")`
    );
    const privacy = await evaluate(
      client,
      `({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hasPolicy: document.body.innerText.includes("PassBuddy 内测隐私说明"),
        hasDeletion: document.body.innerText.includes("删除我的内测数据")
      })`
    );
    await screenshot(client, `privacy-${theme}-390x844.png`);
    summary.consentPrivacy.push({ theme, consent, privacy });
  }

  await navigate(
    client,
    `${baseUrl}/api/dev/browser-fixture?scenario=recovery&theme=classic`
  );
  await waitForExpression(
    client,
    `document.body.innerText.includes("3 道") || document.querySelectorAll(".question-card").length >= 3`
  );
  const beforeReload = await evaluate(
    client,
    `({
      questionCards: document.querySelectorAll(".question-card").length,
      hasResume: document.body.innerText.includes("AI 简历")
    })`
  );
  await navigate(client, `${baseUrl}/?theme=classic`);
  await waitForExpression(
    client,
    `document.body.innerText.includes("3 道") || document.querySelectorAll(".question-card").length >= 3`
  );
  const afterReload = await evaluate(
    client,
    `({questionCards: document.querySelectorAll(".question-card").length})`
  );

  stopProcessTree(initialAppPid);
  replacementApp = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", "3000"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        INTERNAL_BETA_BROWSER_FIXTURES: "true",
        INTERNAL_BETA_AUTH_ENABLED: "true",
        INTERNAL_BETA_PERSISTENCE_MODE: "source",
        INTERNAL_BETA_REQUIRE_CONSENT: "true"
      },
      stdio: "ignore",
      windowsHide: true
    }
  );
  await waitForHttp(baseUrl, 30_000);
  await navigate(client, `${baseUrl}/?theme=classic`);
  await waitForExpression(
    client,
    `document.body.innerText.includes("3 道") || document.querySelectorAll(".question-card").length >= 3`
  );
  const afterNodeRestart = await evaluate(
    client,
    `({questionCards: document.querySelectorAll(".question-card").length})`
  );
  summary.sessionRecovery = {
    refresh: beforeReload.questionCards === afterReload.questionCards,
    nodeRestart: afterNodeRestart.questionCards === afterReload.questionCards,
    fixtureCookie: true,
    otpRelogin: false
  };

  await navigate(
    client,
    `${baseUrl}/api/dev/browser-fixture?scenario=draft&theme=classic`
  );
  await waitForExpression(
    client,
    `document.body.innerText.includes("生成候选人画像")`
  );
  const draftBefore = await latestFixtureSession("draft");
  await evaluate(
    client,
    `(() => {
      localStorage.setItem("facewall.devControls", JSON.stringify({
        demoMode: "force-fallback",
        faults: {llm:false,tts:false,stt:false,clipboard:false,database:true}
      }));
      return true;
    })()`
  );
  await clickButton(client, "生成候选人画像");
  await waitForExpression(
    client,
    `document.body.innerText.includes("草稿仍保留") || document.body.innerText.includes("保存失败")`,
    20_000
  );
  const draftAfter = await latestFixtureSession("draft");
  const falseEvents = await pool.query(
    `select count(*)::int as count
       from public.product_events
      where session_id = $1
        and event_name in ('profile_generated', 'questions_generated', 'report_generated', 'session_completed')`,
    [draftAfter.id]
  );
  const draftUi = await evaluate(
    client,
    `({
      hasDraftError: document.body.innerText.includes("草稿仍保留") || document.body.innerText.includes("保存失败"),
      hasProfileDraft: document.body.innerText.includes("候选人画像") || document.body.innerText.includes("Profile")
    })`
  );
  summary.persistenceFault = {
    uiDraftRetained: draftUi.hasDraftError && draftUi.hasProfileDraft,
    authoritativeStatusUnchanged:
      draftBefore.status === draftAfter.status &&
      Number(draftBefore.version) === Number(draftAfter.version),
    falseMilestoneEvents: Number(falseEvents.rows[0].count)
  };

  for (const theme of ["figma", "juju", "classic"]) {
    await navigate(
      client,
      `${baseUrl}/api/dev/browser-fixture?scenario=report&theme=${theme}`
    );
    await waitForExpression(client, `document.querySelector(".feedback-panel")`);
    await evaluate(
      client,
      `localStorage.setItem("facewall.devControls", JSON.stringify({
        demoMode: "auto",
        faults: {llm:false,tts:false,stt:false,clipboard:false,database:false}
      }))`
    );
    const ratingClicked = await evaluate(
      client,
      `(() => {
        const button = document.querySelector('button[aria-label="5 星"]');
        if (!button) return false;
        button.click();
        const textarea = document.querySelector(".feedback-panel textarea");
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype, "value"
        ).set;
        setter.call(textarea, "browser fixture feedback");
        textarea.dispatchEvent(new Event("input", {bubbles:true}));
        return true;
      })()`
    );
    assert.equal(ratingClicked, true);
    await clickButton(client, "提交反馈");
    await waitForExpression(
      client,
      `document.querySelector(".feedback-message")?.textContent?.includes("已保存")`
    );
    const successSession = await latestFixtureSession("report");
    const feedbackCount = await pool.query(
      `select count(*)::int as count from public.feedback where session_id = $1`,
      [successSession.id]
    );

    await navigate(
      client,
      `${baseUrl}/api/dev/browser-fixture?scenario=report&theme=${theme}`
    );
    await waitForExpression(client, `document.querySelector(".feedback-panel")`);
    await evaluate(
      client,
      `localStorage.setItem("facewall.devControls", JSON.stringify({
        demoMode: "auto",
        faults: {llm:false,tts:false,stt:false,clipboard:false,database:true}
      }))`
    );
    await evaluate(
      client,
      `document.querySelector('button[aria-label="4 星"]').click()`
    );
    await clickButton(client, "提交反馈");
    await waitForExpression(
      client,
      `document.querySelector(".feedback-message")?.textContent?.includes("失败")`
    );
    const copySelector =
      theme === "classic"
        ? `[...document.querySelectorAll("button")].find((item) => (item.textContent || "").includes("一键复制"))`
        : `document.querySelector('button[aria-label="复制整份报告"]')`;
    const copyAvailable = await evaluate(client, `Boolean(${copySelector})`);
    assert.equal(copyAvailable, true);
    await evaluate(client, `${copySelector}.click()`);
    await clickButton(client, "暂时跳过");
    await waitForExpression(
      client,
      `document.querySelector(".feedback-message")?.textContent?.includes("已跳过")`
    );
    const failureSession = await latestFixtureSession("report");
    const failureFeedback = await pool.query(
      `select count(*)::int as count from public.feedback where session_id = $1`,
      [failureSession.id]
    );
    const nonBlocking = await evaluate(
      client,
      `({
        reportVisible: document.body.innerText.includes("最终报告") || document.body.innerText.includes("本次得分"),
        copyAvailable: Boolean(${copySelector}),
        skipped: document.querySelector(".feedback-message")?.textContent?.includes("已跳过") || false
      })`
    );
    summary.feedback.push({
      theme,
      submitted: Number(feedbackCount.rows[0].count) === 1,
      failureDidNotPersist: Number(failureFeedback.rows[0].count) === 0,
      ...nonBlocking
    });
  }

  await navigate(
    client,
    `${baseUrl}/api/dev/browser-fixture?scenario=admin&theme=classic`
  );
  await waitForExpression(
    client,
    `document.querySelector("h1")?.textContent?.includes("运营与可观测性")`
  );
  const suffix = Date.now().toString().slice(-8);
  await evaluate(
    client,
    `(() => {
      const form = document.querySelector('input[name="code"]').closest("form");
      const set = (selector, value) => {
        const input = form.querySelector(selector);
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, "value"
        ).set;
        setter.call(input, value);
        input.dispatchEvent(new Event("input", {bubbles:true}));
      };
      set('input[name="code"]', "browser-${suffix}");
      set('input[name="name"]', "Browser Matrix School");
      set('input[name="domains"]', "browser.example.test");
      form.requestSubmit();
      return true;
    })()`
  );
  await waitForExpression(
    client,
    `document.body.innerText.includes("Browser Matrix School")`
  );
  await evaluate(
    client,
    `(() => {
      const form = document.querySelector('select[name="schoolId"]').closest("form");
      const select = form.querySelector('select[name="schoolId"]');
      const option = [...select.options].find((item) => item.textContent.includes("Browser Matrix School"));
      select.value = option.value;
      select.dispatchEvent(new Event("change", {bubbles:true}));
      const label = form.querySelector('input[name="label"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(label, "browser-matrix");
      label.dispatchEvent(new Event("input", {bubbles:true}));
      form.requestSubmit();
      return true;
    })()`
  );
  await waitForExpression(client, `document.body.innerText.includes("仅显示一次")`);
  const disabled = await evaluate(
    client,
    `(() => {
      const item = [...document.querySelectorAll("li")].find(
        (node) => (node.textContent || "").includes("browser-matrix")
      );
      const button = item?.querySelector("button");
      if (!button || !(button.textContent || "").includes("停用")) return false;
      button.click();
      return true;
    })()`
  );
  assert.equal(disabled, true);
  await waitForExpression(
    client,
    `[...document.querySelectorAll("li")].some(
      (node) => (node.textContent || "").includes("browser-matrix") &&
        (node.textContent || "").includes("启用")
    )`
  );
  const adminUi = await evaluate(
    client,
    `({
      metricsVisible: document.body.innerText.includes("闭环完成率") &&
        document.body.innerText.includes("Token 输入 / 输出"),
      bodyLeak: ["browser fixture feedback", "copyText", "answer_text"].some(
        (value) => document.body.innerText.includes(value)
      )
    })`
  );

  await navigate(
    client,
    `${baseUrl}/api/dev/browser-fixture?scenario=report&theme=classic`
  );
  await waitForExpression(client, `document.querySelector(".feedback-panel")`);
  await navigate(client, `${baseUrl}/admin`);
  await waitForExpression(
    client,
    `document.body.innerText.includes("404") || document.body.innerText.includes("not found")`
  );
  const userApiStatus = await evaluate(
    client,
    `fetch("/api/admin/metrics").then((response) => response.status)`
  );
  summary.admin = {
    adminBrowserFlow: adminUi.metricsVisible && !adminUi.bodyLeak,
    schoolCreated: true,
    inviteCreatedAndDisabled: true,
    ordinaryUserPageHidden: true,
    ordinaryUserApiStatus: userApiStatus
  };

  writeFileSync(
    path.join(artifactDirectory, "browser-matrix-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  console.log(JSON.stringify({ ok: true, ...summary }));
} finally {
  client?.close();
  stopProcessTree(chrome.pid);
  if (replacementApp) stopProcessTree(replacementApp.pid);
  await cleanupFixtures().catch(() => undefined);
  await pool.end();
  const resolvedProfile = path.resolve(profileDirectory);
  const resolvedOutputs = path.resolve(process.cwd(), "outputs");
  if (resolvedProfile.startsWith(`${resolvedOutputs}${path.sep}`)) {
    rmSync(resolvedProfile, { recursive: true, force: true });
  }
}
