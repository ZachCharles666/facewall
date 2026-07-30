# 2026-07-30 Post-IB-09 Runtime Endpoint Fix Handoff

## Authority And Entry Point

- Workspace: `D:\hackthon\facewall`
- Branch: `release/preview`
- This file is the newest continuation entry. Older handoffs are historical only and cannot override `docs/todo.md`, the Acceptance Matrix, or newer evidence.
- Before acting, read `AGENTS.md`, `docs/todo.md`, the internal-beta contracts/runbook/release instruction named by the user, `docs/internal-beta/evidence/IB-09-tencent-rum-frontend.md`, and this file.
- Preserve every IB-02 onward change. Do not reset, checkout over, stash, clean, bulk-format, or delete user work.
- Do not stage, commit, or push until the user gives a new explicit authorization. The latest authorization was consumed by commit `c4f20d8b811823f4d5022e71e7648052cd6cc2fc`.

## Public Staging State

- Public Nginx upstream and `passbuddy-local-readiness` target are on port 3005.
- Release: `/home/ubuntu/releases/passbuddy-20260730-c4f20d8`
- PM2 process: `facewall-rum-whitelist-candidate`
- Last public cutover evidence:
  - health/root/anonymous session/OTP GET/production fixture = 200/200/401/405/404
  - security headers Pass
  - readiness oneshot Result=success / ExecMainStatus=0
- Rollback files:
  - `/etc/nginx/conf.d/facewall.conf.pre-ib09whitelist-20260730-191650`
  - `/etc/passbuddy/readiness.env.pre-ib09whitelist-20260730-191650`
- Ports 3000 through 3005 were all listening at last check. No `pm2 save`, old-process cleanup, OTP, alert notification, or real pilot was performed.

## Latest Browser Evidence

- Commit `c4f20d8b811823f4d5022e71e7648052cd6cc2fc` restored the official mainland whitelist endpoint and is public on 3005.
- A clean Chrome Incognito page excluded extension noise. The loaded adapter, Aegis instance and final whitelist/rateConfig/log endpoint checks were all true, but the sanitized resource list remained empty.
- The ordinary Chrome console flood was entirely from the Unstoppable Domains extension and is not PassBuddy evidence.
- No controlled error, Session fetch, OTP, or external alert was executed in the clean 3005 session after the empty resource result.
- OBS-002 and OBS-003 remain Partial.

## Root Cause And Local Fix

- Installed dependency remains exact `aegis-web-sdk@1.41.14`.
- The SDK constructor applies caller config and then reconstructs all endpoint URLs from `hostUrl`; when omitted it uses the mainland default. Therefore the `caa52ee` strategy of constructor-only individual endpoints was not an effective runtime lock.
- Commit `f57a26d7d740159d298e62bd5591e44be93e53c3` initializes with mainland `hostUrl`, immediately calls public `setConfig`, and correctly locks log/PV/speed/performance/web-vitals plus `/rateConfig`.
- 3004 runtime evidence found the deeper pinned-SDK constraint: empty `whiteListUrl` prevents the official config request but also leaves the internal whitelist-complete flag false forever, so errors remain buffered and no receiver request is sent.
- Product approved the supported fix: retain the official same-mainland `https://rumt-zh.com/collect/whitelist` endpoint, while keeping custom event/custom time/offline empty and preserving anonymous/no-body/no-cookie privacy controls.
- 3005 proved endpoint restoration alone is insufficient. In Aegis 1.41.14 both the whitelist and rate-config handshakes pass through `beforeRequest` as `logType="whiteList"` with `logs=null`; the local sanitizer treated every empty envelope as false and cancelled both requests before the network layer.
- Current uncommitted policy fix permits only the exact empty `whiteList/null` control-plane shape. Any whiteList envelope carrying an object, payload or user data remains rejected.
- The batch API speed sanitizer from `caa52ee` remains intact.

## Local Verification

- The strict empty-control-plane policy fix remains uncommitted.
- Targeted Tencent RUM contract: 10/10 Pass.
- Full internal-beta: 72/72 Pass.
- Typecheck: Pass.
- Production build: 33/33 pages/routes generated.
- Source security: Pass, 197 files.
- Bundle security: Pass, 60 files.
- `git diff --check`: Pass with only expected LF/CRLF warnings.

## Current Working Tree Scope

Expected uncommitted scope:

- `lib/observability/tencentRumPolicy.ts`
- `tests/internal-beta/tencent-rum-contract.test.ts`
- `docs/todo.md`
- `docs/internal-beta/05_acceptance_matrix.md`
- `docs/internal-beta/evidence/IB-09-tencent-rum-frontend.md`
- this handoff

Start the next task with read-only `git status --short`, current diff, and untracked-file review. Treat any additional path as new user work until proven otherwise.

## Next Actions

1. Review the fully verified strict `whiteList/null` control-plane allowance and exact six-file scope.
2. With new user authorization, stage/commit/push the reviewed scope.
3. Export and hash an archive from that exact commit; independently validate required/forbidden entries.
4. Upload and build as a detached systemd unit so WebShell disconnects do not stall the build. Do not print config values.
5. Start an isolated candidate on an explicitly verified free port and run health/root/auth-negative/fixture/security/bundle smoke with short timeouts.
6. Preserve the current 3005 release and timestamped Nginx/readiness rollback configs before any cutover.
7. On the next public candidate, open a fresh page with Network recording first:
   - expect the official mainland `/collect/whitelist`, `/rateConfig`, and receiver traffic;
   - manually confirm the whitelist request contains only allowed anonymous technical fields and no body, credentials, Cookie, resume/JD/answer/report, query-derived user content, or real user/device identity;
   - fetch anonymous Session once and confirm response requestId;
   - verify API Monitor receives the sanitized record and correlate the same requestId with server logs.
8. Only evidence from the real receiver may change OBS-002/003. Keep OBS-001–004 Partial until their remaining external evidence exists.

## Safety Gates

- Every OTP send still needs separate explicit confirmation.
- Before any real email/WeChat alert drill, state the recipients and exact expected notification count.
- Do not output env values, IDs treated as private configuration, DSNs, tokens, cookies, Authorization, OTP, secrets, real invite codes, resumes, JDs, answers, reports, or prompt bodies.
- Do not modify or delete real user data and do not start a 10–20/100-person pilot.
