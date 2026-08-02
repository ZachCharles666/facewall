import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path: string) => (await readFile(path, "utf8")).replaceAll("\r\n", "\n");

test("auth foundation is passwordless and stores OTP hashes", async () => {
  const config = await read("better-auth.config.ts");
  assert.ok(
    config.includes(`emailAndPassword: {
    enabled: false`)
  );
  assert.match(config, /otpLength:\s*6/);
  assert.match(config, /expiresIn:\s*readOtpExpiresInSec\(\)/);
  assert.match(config, /storeOTP:\s*"hashed"/);
  assert.match(config, /resendStrategy:\s*"rotate"/);
  assert.match(config, /type !== "sign-in"/);
  assert.match(config, /sendOtpEmail\(\{ to: email, code: otp \}\)/);
});

test("local OTP keeps Better Auth verification while skipping SES and send budget", async () => {
  const requestRoute = await read("app/api/auth/request-otp/route.ts");
  const authServer = await read("lib/auth/server.ts");
  const config = await read("lib/config/internalBeta.ts");

  assert.match(requestRoute, /if \(!localOtpEnabled\)[\s\S]*reserveOtpSendBudget/);
  assert.match(requestRoute, /deliveryMode: localOtpEnabled \? "local" : "email"/);
  assert.match(authServer, /generateOTP: \(\) => readLocalDevOtpCode\(\)/);
  assert.match(authServer, /if \(localDevOtpEnabled\) return/);
  assert.match(config, /if \(env\.NODE_ENV === "production"\) return false/);
});

test("runtime auth uses the least-privilege pool and exposes the Better Auth handler", async () => {
  const server = await read("lib/auth/server.ts");
  const pool = await read("lib/db/pool.ts");
  const route = await read("app/api/auth/[...all]/route.ts");

  assert.match(server, /database:\s*getRuntimePool\(\)/);
  assert.doesNotMatch(server, /getAdminPool/);
  assert.match(pool, /-c search_path=auth,public/);
  assert.match(server, /useSecureCookies:\s*process\.env\.NODE_ENV === "production"/);
  assert.match(server, /sendOtpEmail\(\{ to: email, code: otp \}\)/);
  assert.match(server, /export function getAuth\(\)/);
  assert.match(route, /getAuth\(\)\.handler\(request\)/);
  assert.match(route, /toNextJsHandler\(handler\)/);
  assert.match(route, /runtime = "nodejs"/);
});

test("project auth routes close direct Better Auth OTP write endpoints", async () => {
  const route = await read("app/api/auth/[...all]/route.ts");
  const requestRoute = await read("app/api/auth/request-otp/route.ts");
  const redeemRoute = await read("app/api/auth/redeem-invite/route.ts");
  assert.match(route, /request\.method !== "GET"/);
  assert.match(route, /publicReadPaths/);
  assert.match(requestRoute, /reserveOtpSendBudget/);
  assert.doesNotMatch(requestRoute, /inviteCode|check_invite_code/);
  assert.match(redeemRoute, /consumeInviteForUser/);
  assert.match(redeemRoute, /AUTH_REQUIRED/);
});

test("OTP form accepts exactly six ASCII digits without escaped-pattern ambiguity", async () => {
  const gate = await read("components/auth/AuthGate.tsx");
  assert.match(gate, /pattern="\[0-9\]\{6\}"/);
  assert.match(gate, /minLength=\{6\}/);
  assert.match(gate, /maxLength=\{6\}/);
  assert.doesNotMatch(gate, /pattern="\\\\d/);
});

test("OTP and login controls provide feedback instead of silently disabling prerequisites", async () => {
  const gate = await read("components/auth/AuthGate.tsx");
  assert.match(gate, /请先输入有效的邮箱地址/);
  assert.match(gate, /请等待 \$\{resendAfter\} 秒后再重新发送验证码/);
  assert.match(gate, /请先点击“发送验证码”/);
  assert.match(gate, /请输入完整的 6 位验证码/);
  assert.match(gate, /disabled=\{busy\}[\s\S]*\$\{resendAfter\}秒后重发/);
});

test("local OTP acceptance always preserves the invite-page checkpoint", async () => {
  const gate = await read("components/auth/AuthGate.tsx");
  assert.match(gate, /setLocalOtpFlow\(body\.data\.deliveryMode === "local"\)/);
  assert.match(gate, /body\.data\.privacyOnly[\s\S]*body\.data\.needsConsent[\s\S]*else if \(localOtpFlow\)/);
  assert.match(gate, /else if \(localOtpFlow\)[\s\S]*setInvitePreviewOnly\(true\)[\s\S]*setStep\("invite"\)/);
  assert.match(gate, /if \(invitePreviewOnly\)[\s\S]*setStep\("authenticated"\)/);
  assert.match(gate, /invitePreviewOnly[\s\S]*setStep\("authenticated"\)/);
  assert.match(gate, /placeholder="请输入邀请码"[\s\S]*"确 定"/);
});

test("Juju CV entry keeps account navigation inside a local side drawer", async () => {
  const setup = await read("components/setup/SetupPanel.tsx");
  const styles = await read("app/globals.css");

  assert.match(setup, /isJujuTheme && \([\s\S]*aria-label="打开侧边菜单"/);
  assert.match(setup, /menue__343-906@2x\.png/);
  assert.match(setup, /avatar__342-897@2x\.png/);
  assert.match(setup, /className="juju-home-side-avatar" src=\{accountAvatar\.src\}/);
  assert.match(setup, /className="juju-home-side-panel"/);
  assert.match(setup, /<span>简历管理<\/span>[\s\S]*<span>面试记录管理<\/span>/);
  assert.match(setup, /function showNextVersionNotice\(\)[\s\S]*setJujuSideNotice\("下个版本开放"\)/);
  assert.match(setup, /maskSessionEmail\(jujuSessionEmail\)/);
  assert.match(setup, /event\.key === "Escape"/);
  assert.match(styles, /\.theme-juju \.juju-home-menu-button \{[\s\S]*top: 58px;[\s\S]*left: 16px;[\s\S]*width: 32px;/);
  assert.match(styles, /\.theme-juju \.juju-home-side-panel \{[\s\S]*width: 315px;/);
  assert.match(styles, /\.theme-juju \.juju-home-side-layer\[data-open="true"\] \{[\s\S]*rgba\(0, 0, 0, 0\.5\)/);
  assert.match(styles, /\.theme-juju \.juju-home-side-glass \{[\s\S]*top: 128px;[\s\S]*height: 300px;[\s\S]*blur\(24px\)/);
  assert.match(styles, /\.theme-juju \.juju-home-side-logout \{[\s\S]*border: 1px solid #ff0080/);
});

test("Juju question reader moves short and long prompts continuously with speech", async () => {
  const interview = await read("components/interview/InterviewPanel.tsx");
  const styles = await read("app/globals.css");

  assert.match(interview, /message__295-1277@2x\.png/);
  assert.match(interview, /voice_S__379-1437@2x\.png/);
  assert.match(interview, /B_01__326-805@2x\.png/);
  assert.match(interview, /B_01__326-806@2x\.png/);
  assert.match(interview, /avatar__342-897@2x\.png/);
  assert.match(interview, /const lineHeightPx = 22/);
  assert.match(interview, /Math\.max\(lineHeightPx \* 1\.5, overflowDistance\)/);
  assert.match(interview, /--juju-question-scroll-duration/);
  assert.match(interview, /paragraph\.classList\.add\("is-speech-scrolling"\)/);
  assert.doesNotMatch(interview, /if \(wholeLineSteps === 0\) return/);
  assert.match(interview, /resetQuestionTextMotion\(\)[\s\S]*resetQuestionViewportToTop\(\)/);
  assert.match(
    interview,
    /function finishQuestionTextMotion\(\)[\s\S]*classList\.remove\("is-speech-scrolling"\)[\s\S]*resetQuestionViewportToTop\(\)[\s\S]*setQuestionTextMotionPhase\("finished"\)/
  );
  assert.match(styles, /\.juju-interview-question-viewport \{[\s\S]*height: 132px;[\s\S]*overflow-y: auto;/);
  assert.match(styles, /rgba\(0, 0, 0, 0\.18\) 0,[\s\S]*rgba\(0, 0, 0, 0\.52\) 22px,[\s\S]*#000000 44px/);
  assert.match(styles, /\.juju-interview-question-frame\.is-playing \.juju-interview-question-viewport \{[\s\S]*overflow-y: hidden;/);
  assert.match(styles, /p\.is-speech-scrolling \{[\s\S]*animation: juju-question-text-scroll/);
  assert.match(styles, /\.juju-history-orb-glow \{[\s\S]*top: 8\.6px;[\s\S]*left: 6\.2px;/);
  assert.match(styles, /\.juju-history-orb-core \{[\s\S]*top: 6\.2px;[\s\S]*left: 6\.2px;/);
});

test("Juju response and skip controls preserve a confirmed path through the final question", async () => {
  const interview = await read("components/interview/InterviewPanel.tsx");
  const styles = await read("app/globals.css");

  assert.doesNotMatch(interview, /aria-label="返回答题"/);
  assert.match(interview, /onClick=\{requestJujuSkipConfirmation\}[\s\S]*aria-label="跳过当前题目"/);
  assert.match(interview, /role="dialog"[\s\S]*是否跳过当前题目？/);
  assert.match(interview, /跳过后将结束本轮面试。/);
  assert.match(interview, /跳过并完成/);
  assert.match(interview, /async function confirmJujuSkip\(\)[\s\S]*await stopStt\(\)[\s\S]*onAnswersChange\(nextAnswers\)/);
  assert.match(interview, /if \(currentIndex < questions\.length - 1\)[\s\S]*setCurrentIndex[\s\S]*onGenerateReport\(nextAnswers\)/);
  assert.match(styles, /\.juju-interview-skip-layer \{[\s\S]*backdrop-filter: blur\(6px\)/);
  assert.match(styles, /\.juju-interview-skip-dialog \{[\s\S]*width: 303px;[\s\S]*border-radius: 24px;/);
  assert.match(styles, /\.juju-interview-skip-actions button\.confirm \{[\s\S]*background: #ff0080;/);
});

test("all product status bars use the PassBuddy brand", async () => {
  const files = await Promise.all([
    read("components/InterviewCoachApp.tsx"),
    read("components/auth/AuthGate.tsx"),
    read("components/interview/InterviewPanel.tsx"),
    read("components/questionnaire/JujuQuestionnaireFlow.tsx"),
    read("components/report/ReportPanel.tsx"),
    read("components/setup/SetupPanel.tsx"),
    read("app/globals.css")
  ]);
  const productUi = files.join("\n");

  assert.doesNotMatch(productUi, /Facewall|FACEWALL/);
  assert.match(productUi, /<span>PassBuddy<\/span>/);
  assert.match(productUi, /PASSBUDDY INTERVIEW/);
});

test("Juju auth launch screen omits the home indicator before login", async () => {
  const gate = await read("components/auth/AuthGate.tsx");
  assert.match(gate, /visualTheme === "juju" && step !== "checking"/);
});

test("admin APIs require a database-backed admin profile", async () => {
  const admin = await read("lib/auth/admin.ts");
  const inviteRoute = await read("app/api/admin/invite-codes/route.ts");
  assert.match(admin, /getAuthProfile/);
  assert.match(admin, /profile\.role !== "admin"/);
  assert.match(inviteRoute, /requireAdmin\(request\)/);
  assert.match(inviteRoute, /plaintextShownOnce:\s*true/);
});

test("business migration has nine forced-RLS tables and no raw audio column", async () => {
  const migration = await read("db/migrations/0002_business_schema.sql");
  const tables = [
    "schools",
    "invite_codes",
    "user_profiles",
    "consent_records",
    "interview_sessions",
    "interview_answers",
    "feedback",
    "product_events",
    "deletion_requests"
  ];
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.ok(migration.includes(`'${table}'`), `${table} missing from RLS loop`);
  }
  assert.match(migration, /force row level security/);
  assert.doesNotMatch(migration, /\baudio_(data|blob|body|bytes)\b/i);
});

test("server secrets are never declared as NEXT_PUBLIC variables", async () => {
  const example = await read(".env.example");
  for (const secret of [
    "DATABASE_URL",
    "DATABASE_ADMIN_URL",
    "BETTER_AUTH_SECRET",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY"
  ]) {
    assert.doesNotMatch(example, new RegExp(`NEXT_PUBLIC_${secret}`));
  }
});
