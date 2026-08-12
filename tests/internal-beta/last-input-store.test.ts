import assert from "node:assert/strict";
import test from "node:test";

import {
  LAST_SETUP_INPUT_STORAGE_KEY_PREFIX,
  readLastSetupInput,
  saveLastSetupInput
} from "../../lib/setup/lastInputStore";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  failWrites = false;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("STORAGE_UNAVAILABLE");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const memoryStorage = new MemoryStorage();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

test.before(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: memoryStorage,
      dispatchEvent: () => true
    }
  });
});

test.after(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

test.beforeEach(() => {
  memoryStorage.clear();
  memoryStorage.failWrites = false;
});

test("last setup input atomically replaces the single CV/JD pair", () => {
  const ownerId = "user-a";
  const first = saveLastSetupInput(ownerId, {
    cv: { text: "第一份 CV 正文", source: "text" },
    jd: { text: "第一份 JD 正文", source: "text" }
  });
  assert.equal(first.cv?.text, "第一份 CV 正文");
  assert.equal(first.jd?.text, "第一份 JD 正文");

  const second = saveLastSetupInput(ownerId, {
    cv: {
      text: "第二份 CV 正文",
      source: "file",
      fileName: "resume.pdf",
      fileType: "pdf"
    },
    jd: { text: "第二份 JD 正文", source: "text" }
  });
  const restored = readLastSetupInput(ownerId);

  assert.deepEqual(restored, second);
  assert.equal(restored.cv?.text, "第二份 CV 正文");
  assert.equal(restored.jd?.text, "第二份 JD 正文");
  assert.equal(restored.cv?.fileName, "resume.pdf");
  assert.doesNotMatch(JSON.stringify(restored), /第一份/);
});

test("last setup input is owner-scoped and fails closed for empty or corrupt data", () => {
  saveLastSetupInput("user-a", {
    cv: { text: "A 的 CV", source: "text" },
    jd: { text: "A 的 JD", source: "text" }
  });

  assert.equal(readLastSetupInput("user-b").cv, undefined);
  assert.equal(readLastSetupInput("").cv, undefined);

  memoryStorage.setItem(
    `${LAST_SETUP_INPUT_STORAGE_KEY_PREFIX}:${encodeURIComponent("user-a")}`,
    JSON.stringify({ version: 1, ownerId: "user-b", cv: {}, jd: {} })
  );
  const corrupted = readLastSetupInput("user-a");
  assert.equal(corrupted.ownerId, "user-a");
  assert.equal(corrupted.cv, undefined);
  assert.equal(corrupted.jd, undefined);
});

test("local storage failure never blocks the interview flow", () => {
  memoryStorage.failWrites = true;

  const result = saveLastSetupInput("user-a", {
    cv: { text: "CV 正文", source: "text" },
    jd: { text: "JD 正文", source: "text" }
  });

  assert.equal(result.ownerId, "user-a");
  assert.equal(result.cv, undefined);
  assert.equal(result.jd, undefined);
});
