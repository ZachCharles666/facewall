import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  defaultQuestionnaireConfig,
  normalizeQuestionnaireConfig,
  validateQuestionnaireAnswers
} from "../../lib/questionnaire/schema";

const read = (path: string) => readFile(path, "utf8");

test("only Juju keeps the OTP gate and source persistence", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /rawTheme === "figma" \? "figma" : "juju"/);
  assert.match(
    page,
    /visualTheme === "juju" && isInternalBetaAuthEnabled\(\)/
  );
  assert.match(
    page,
    /visualTheme === "juju" \? readInterviewPersistenceMode\(\) : "off"/
  );
  assert.match(page, /<AuthGate enabled=\{jujuAuthEnabled\}/);
});

test("questionnaire config supports all four requested question types", () => {
  assert.deepEqual(
    new Set(defaultQuestionnaireConfig.questions.map((question) => question.type)),
    new Set(["rating", "single", "multiple", "text"])
  );
  const normalized = normalizeQuestionnaireConfig({
    ...defaultQuestionnaireConfig,
    questions: [
      {
        id: "custom",
        type: "multiple",
        prompt: "可多选",
        required: true,
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" }
        ]
      }
    ]
  });
  assert.equal(normalized.questions[0].type, "multiple");
  assert.equal(normalized.questions[0].options.length, 2);
});

test("questionnaire answers enforce required, option, rating and text bounds", () => {
  const valid = validateQuestionnaireAnswers(defaultQuestionnaireConfig, {
    experience_rating: 5,
    unsatisfied_aspects: ["questions", "voice"],
    willingness_to_pay: "depends",
    suggestion: "希望增加更多追问。"
  });
  assert.ok(valid);
  assert.equal(
    validateQuestionnaireAnswers(defaultQuestionnaireConfig, {
      experience_rating: 6,
      unsatisfied_aspects: ["questions"],
      willingness_to_pay: "depends"
    }),
    null
  );
  assert.equal(
    validateQuestionnaireAnswers(defaultQuestionnaireConfig, {
      experience_rating: 5,
      unsatisfied_aspects: ["unknown"],
      willingness_to_pay: "depends"
    }),
    null
  );
  assert.equal(
    validateQuestionnaireAnswers(defaultQuestionnaireConfig, {
      experience_rating: 5,
      willingness_to_pay: "depends"
    }),
    null
  );
});

test("questionnaire config writes are explicit and fail closed in production", async () => {
  const store = await read("lib/questionnaire/store.ts");
  assert.match(store, /if \(!value\) return env\.NODE_ENV !== "production"/);
  assert.match(store, /QUESTIONNAIRE_CONFIG_WRITE_ENABLED/);
});

test("questionnaire response is owner-bound, first-completion-only and RLS protected", async () => {
  const service = await read("lib/questionnaire/responses.ts");
  const persistence = await read("lib/persistence/interviewSessions.ts");
  const migration = await read("db/migrations/0012_questionnaire_responses.sql");
  const route = await read(
    "app/api/interview-sessions/[sessionId]/questionnaire/route.ts"
  );
  assert.match(service, /where s\.id = \$1 and s\.user_id = \$2/);
  assert.match(service, /earlier\.status = 'completed'/);
  assert.match(service, /on conflict \(user_id\) do nothing/);
  assert.match(service, /validateQuestionnaireAnswers/);
  assert.match(persistence, /QUESTIONNAIRE_REQUIRED/);
  assert.match(persistence, /has_completed_session/);
  assert.match(persistence, /questionnaire_submitted/);
  assert.match(persistence, /idempotent_replay/);
  assert.match(
    persistence,
    /s\.status = 'completed'[\s\S]*questionnaire_responses[\s\S]*earlier\.status = 'completed'/
  );
  assert.match(route, /requireActiveUser\(request\)/);
  assert.match(migration, /create table public\.questionnaire_responses/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /questionnaire_responses_owner/);
  assert.match(migration, /'questionnaire_submitted'/);
});

test("Juju report invitation and answer-history entry preserve the main flow", async () => {
  const app = await read("components/InterviewCoachApp.tsx");
  const report = await read("components/report/ReportPanel.tsx");
  const styles = await read("app/globals.css");
  const flow = await read(
    "components/questionnaire/JujuQuestionnaireFlow.tsx"
  );
  const interview = await read("components/interview/InterviewPanel.tsx");
  const config = await read(
    "components/questionnaire/QuestionnaireConfigPanel.tsx"
  );
  assert.match(app, /initialVisualTheme !== "juju"[\s\S]*<FeedbackPanel/);
  assert.match(report, /<JujuQuestionnaireFlow/);
  assert.doesNotMatch(report, /className="juju-report-copy-all"/);
  assert.match(styles, /\.juju-report-confirm-home[\s\S]*position: absolute/);
  assert.match(
    styles,
    /\.juju-questionnaire-invite \{[\s\S]*width: 279px;[\s\S]*height: 325px;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-card\.is-rating \{[\s\S]*height: 118px;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-card\.is-multiple \{[\s\S]*height: 310px;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-card\.is-single \{[\s\S]*height: 208px;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-card\.is-text \{[\s\S]*height: 156px;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-scroll h1 \{[\s\S]*font-size: 18px;[\s\S]*font-weight: 700;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-prompt \{[\s\S]*font-weight: 700;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-scroll > header \{[\s\S]*padding: 0 8px 24px;/
  );
  assert.match(
    styles,
    /\.juju-questionnaire-list \{[\s\S]*gap: 18px;/
  );
  assert.match(flow, /确认并返回首页/);
  assert.doesNotMatch(flow, /正在准备问卷/);
  assert.match(flow, /disabled=\{snapshotLoading\}/);
  assert.match(flow, /questionnaireAlreadyCompleted/);
  assert.match(flow, /立即参与/);
  assert.match(flow, /暂不参与并返回报告/);
  assert.match(flow, /setStage\("report"\)/);
  assert.match(flow, /snapshotLoading/);
  assert.match(flow, /question\.type === "rating"/);
  assert.match(flow, /question\.type === "single"/);
  assert.match(flow, /question\.type === "multiple"/);
  assert.match(flow, /question\.type === "text"/);
  assert.match(flow, /figma-statusbar juju-questionnaire-statusbar/);
  assert.match(flow, /<span>PassBuddy<\/span>/);
  assert.doesNotMatch(flow, /juju-questionnaire-status-symbols|juju-questionnaire-capsule/);
  assert.match(flow, /Gemini_Generated_Image_eiqufreiqufreiqu_1__388-1104@2x\.png/);
  assert.match(styles, /\.juju-questionnaire-invite-image \{[\s\S]*top: -28px;[\s\S]*object-fit: cover;/);
  assert.match(styles, /\.juju-report-confirm-home:disabled \{[\s\S]*background: #c9c9cc;/);
  assert.match(flow, /className="juju-questionnaire-prompt"/);
  assert.doesNotMatch(flow, /<fieldset|<legend/);
  assert.match(interview, /setShowJujuHistory\(true\)/);
  assert.match(interview, /答题记录/);
  assert.doesNotMatch(interview, /onClick=\{\(\) => showJujuToast\("下个版本开放"\)\}/);
  assert.match(config, /保存全局问卷/);
});

test("deletion removes questionnaire bodies before deleting identity", async () => {
  const deletion = await read("lib/privacy/deletion.ts");
  assert.match(deletion, /counts\.questionnaire_responses/);
  assert.match(deletion, /"public\.questionnaire_responses"/);
});
