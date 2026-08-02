import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthChallenge,
  hashInviteCode,
  hashOtpRateKey,
  normalizeEmail,
  readAuthChallenge
} from "../../lib/auth/challenge";

const secret = "s".repeat(64);

test("normalizes email and hashes invite codes without retaining plaintext", () => {
  assert.equal(normalizeEmail(" Student@Example.EDU "), "student@example.edu");
  assert.equal(
    hashInviteCode(" school-2026 ", secret),
    hashInviteCode("SCHOOL-2026", secret)
  );
  assert.doesNotMatch(hashInviteCode("SCHOOL-2026", secret), /SCHOOL/);
});

test("challenge is opaque, email-bound, tamper-evident, and expiring", () => {
  const now = Date.UTC(2026, 6, 24);
  const challenge = createAuthChallenge("student@example.edu", secret, now);

  assert.doesNotMatch(challenge, /student|SCHOOL/i);
  assert.equal(readAuthChallenge(challenge, "student@example.edu", secret, now).email, "student@example.edu");
  assert.throws(
    () => readAuthChallenge(challenge, "other@example.edu", secret, now),
    /AUTH_CHALLENGE_INVALID/
  );
  assert.throws(
    () => readAuthChallenge(`${challenge.slice(0, -1)}x`, "student@example.edu", secret, now),
    /AUTH_CHALLENGE_INVALID/
  );
  assert.throws(
    () => readAuthChallenge(challenge, "student@example.edu", secret, now + 1_800_000),
    /AUTH_CHALLENGE_EXPIRED/
  );
});

test("OTP rate keys are stable HMAC values without raw email or IP", () => {
  const secret = "test-secret-value-that-is-at-least-32-characters";
  const emailHash = hashOtpRateKey("email", " Student@Example.edu ", secret);
  const ipHash = hashOtpRateKey("ip", "192.0.2.10", secret);

  assert.match(emailHash, /^[a-f0-9]{64}$/);
  assert.match(ipHash, /^[a-f0-9]{64}$/);
  assert.equal(emailHash, hashOtpRateKey("email", "student@example.edu", secret));
  assert.notEqual(emailHash, ipHash);
  assert.doesNotMatch(`${emailHash}${ipHash}`, /student|192\.0\.2\.10/i);
});
