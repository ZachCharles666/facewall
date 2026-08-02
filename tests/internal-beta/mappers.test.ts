import assert from "node:assert/strict";
import test from "node:test";

import { mapInterviewSessionRow } from "../../lib/db/mappers";

const row = {
  id: "session-1",
  user_id: "user-1",
  school_id: "00000000-0000-0000-0000-000000000001",
  status: "draft",
  version: 1,
  schema_version: 1,
  resume_text: "fixture resume",
  jd_text: "fixture jd",
  interviewer_style_id: "strictHr",
  candidate_profile: null,
  questions: null,
  report: null,
  generation_source: "llm",
  started_at: null,
  completed_at: null,
  created_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z"
};

test("maps database snake_case to API camelCase", () => {
  const mapped = mapInterviewSessionRow(row);
  assert.equal(mapped.userId, "user-1");
  assert.equal(mapped.schemaVersion, 1);
  assert.equal(mapped.interviewerStyleId, "strictHr");
  assert.equal(mapped.createdAt, "2026-07-24T00:00:00.000Z");
  assert.equal("user_id" in mapped, false);
});

test("rejects unsupported JSON schema versions", () => {
  assert.throws(
    () => mapInterviewSessionRow({ ...row, schema_version: 0 }),
    /UNSUPPORTED_SCHEMA_VERSION/
  );
});
