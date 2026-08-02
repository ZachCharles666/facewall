import assert from "node:assert/strict";
import test from "node:test";

import { parseBootstrapArguments } from "../../lib/auth/bootstrapArgs";

test("parses stable positional admin bootstrap commands", () => {
  assert.deepEqual(
    parseBootstrapArguments([
      "prepare",
      "admin@example.com",
      "pilot-school",
      "Pilot School"
    ]),
    {
      mode: "prepare",
      email: "admin@example.com",
      schoolCode: "pilot-school",
      schoolName: "Pilot School"
    }
  );
  assert.deepEqual(parseBootstrapArguments(["promote", "admin@example.com"]), {
    mode: "promote",
    email: "admin@example.com"
  });
});

test("accepts the npm 11 legacy forwarded-value shape", () => {
  assert.deepEqual(
    parseBootstrapArguments(["admin@example.com", "pilot-school", "Pilot School"]),
    {
      mode: "prepare",
      email: "admin@example.com",
      schoolCode: "pilot-school",
      schoolName: "Pilot School"
    }
  );
  assert.deepEqual(parseBootstrapArguments(["admin@example.com"]), {
    mode: "promote",
    email: "admin@example.com"
  });
});

test("rejects incomplete bootstrap arguments", () => {
  assert.throws(() => parseBootstrapArguments(["prepare", "admin@example.com"]));
});
