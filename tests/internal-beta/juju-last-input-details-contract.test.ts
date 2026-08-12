import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(path, "utf8");
}

test("Juju side drawer exposes the current user's last CV and JD details", async () => {
  const [setup, details, store, styles, app] = await Promise.all([
    read("components/setup/SetupPanel.tsx"),
    read("components/setup/JujuLastInputDetails.tsx"),
    read("lib/setup/lastInputStore.ts"),
    read("app/globals.css"),
    read("components/InterviewCoachApp.tsx")
  ]);

  assert.match(setup, /user\?: \{ id\?: string; email\?: string \}/);
  assert.match(setup, /setJujuSessionUserId\(identity\?\.id \|\| ""\)/);
  assert.match(setup, /<span>简历管理<\/span>/);
  assert.match(setup, /<JujuLastInputDetails/);
  assert.match(setup, /ownerId=\{jujuSessionUserId\}/);
  assert.match(setup, /sessionLoading=\{jujuSessionLoading\}/);
  assert.match(setup, /snapshot=\{lastSetupInput\}/);
  assert.match(setup, /setJujuSideView\("lastInput"\)/);
  assert.match(setup, /event\.key === "Escape"[\s\S]*setJujuSideView\("menu"\)/);
  assert.match(setup, /!jujuSessionLoading[\s\S]*lastSetupInput\.ownerId === jujuSessionUserId/);
  assert.match(setup, /disabled=\{!scopedLastSetupInput\.cv\}/);
  assert.match(setup, /disabled=\{!scopedLastSetupInput\.jd\}/);
  assert.doesNotMatch(setup, /UseDemoCV|UseDemoJD/);
  assert.match(setup, /await fetchJujuSessionIdentity\(\)/);
  assert.match(setup, /setLastSetupInput\(savedSnapshot\)/);
  assert.match(app, /setFigmaSetupInitialStep\("jd"\)/);

  assert.match(setup, /readLastSetupInput\(jujuSessionUserId\)/);
  assert.match(setup, /subscribeLastSetupInput\(jujuSessionUserId,/);
  assert.match(details, /上次录入详情/);
  assert.match(details, /最后一份 CV 和 JD/);
  assert.match(details, /entry\.text/);
  assert.match(details, /还没有上次录入记录/);
  assert.match(details, /snapshot\.ownerId === ownerId\.trim\(\)/);

  assert.match(store, /encodeURIComponent\(normalizedOwnerId\)/);
  assert.doesNotMatch(store, /localStorage\.getItem\(LAST_SETUP_INPUT_STORAGE_KEY\)/);
  assert.match(styles, /\.theme-juju \.juju-last-input-detail \{/);
  assert.match(styles, /\.theme-juju \.juju-last-input-text \{[\s\S]*white-space: pre-wrap;/);
});
