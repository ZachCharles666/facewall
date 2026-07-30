# 2026-07-30 Post-IB-09 Runtime Endpoint Fix Handoff

## Authority And Entry Point

- Workspace: `D:\hackthon\facewall`
- Branch: `release/preview`
- This file is the newest continuation entry. Older handoffs are historical only and cannot override `docs/todo.md`, the Acceptance Matrix, or newer evidence.
- Before acting, read `AGENTS.md`, `docs/todo.md`, the internal-beta contracts/runbook/release instruction named by the user, `docs/internal-beta/evidence/IB-09-tencent-rum-frontend.md`, and this file.
- Preserve every IB-02 onward change. Do not reset, checkout over, stash, clean, bulk-format, or delete user work.
- Do not stage, commit, or push until the user gives a new explicit authorization. The earlier authorization was consumed by commit `caa52eece298b19937558248cdb6f98c0a222702`.

## Public Staging State

- Public Nginx upstream and `passbuddy-local-readiness` target are on port 3004.
- Release: `/home/ubuntu/releases/passbuddy-20260730-f57a26d`
- PM2 process: `facewall-rum-runtime-candidate`
- Last public cutover evidence:
  - health/root/anonymous session/OTP GET/production fixture = 200/200/401/405/404
  - security headers Pass
  - readiness oneshot Result=success / ExecMainStatus=0
- Rollback files:
  - `/etc/nginx/conf.d/facewall.conf.pre-ib09runtime-20260730-010446`
  - `/etc/passbuddy/readiness.env.pre-ib09runtime-20260730-010446`
- Ports 3000, 3001, 3002, 3003, and 3004 were all listening at last check. No `pm2 save`, old-process cleanup, OTP, alert notification, or real pilot was performed.

## Latest Browser Evidence

- On the public Juju page, the user explicitly fetched `/api/auth/session`.
- Response: HTTP 401 with `x-request-id` present.
- After waiting and filtering Network by `rumt-zh.com`, no matching receiver request was visible.
- This proves the business API and response requestId are working. It does not prove RUM API speed ingestion or requestId correlation.
- Do not ask the user to repeat the same 3003 probe. OBS-002 and OBS-003 remain Partial.

## Root Cause And Local Fix

- Installed dependency remains exact `aegis-web-sdk@1.41.14`.
- The SDK constructor applies caller config and then reconstructs all endpoint URLs from `hostUrl`; when omitted it uses the mainland default. Therefore the `caa52ee` strategy of constructor-only individual endpoints was not an effective runtime lock.
- Commit `f57a26d7d740159d298e62bd5591e44be93e53c3` initializes with mainland `hostUrl`, immediately calls public `setConfig`, and correctly locks log/PV/speed/performance/web-vitals plus `/rateConfig`.
- 3004 runtime evidence found the deeper pinned-SDK constraint: empty `whiteListUrl` prevents the official config request but also leaves the internal whitelist-complete flag false forever, so errors remain buffered and no receiver request is sent.
- Product approved the supported fix: retain the official same-mainland `https://rumt-zh.com/collect/whitelist` endpoint, while keeping custom event/custom time/offline empty and preserving anonymous/no-body/no-cookie privacy controls.
- The batch API speed sanitizer from `caa52ee` remains intact.

## Local Verification

- The approved mainland whitelist correction remains uncommitted.
- Targeted Tencent RUM contract: 9/9 Pass.
- Full internal-beta: 71/71 Pass.
- Typecheck: Pass.
- Production build: 33/33 pages/routes generated.
- Source security: Pass, 197 files.
- Bundle security: Pass, 60 files.
- `git diff --check`: Pass with only expected LF/CRLF warnings.

## Current Working Tree Scope

Expected uncommitted scope:

- `lib/observability/tencentRum.ts`
- `tests/internal-beta/tencent-rum-contract.test.ts`
- `docs/todo.md`
- `docs/internal-beta/05_acceptance_matrix.md`
- `docs/internal-beta/evidence/IB-09-tencent-rum-frontend.md`
- this handoff

Start the next task with read-only `git status --short`, current diff, and untracked-file review. Treat any additional path as new user work until proven otherwise.

## Next Actions

1. Review the official mainland whitelist correction and rerun targeted/full local verification.
2. With new user authorization, stage/commit/push the reviewed scope.
3. Export and hash an archive from that exact commit; independently validate required/forbidden entries.
4. Upload and build as a detached systemd unit so WebShell disconnects do not stall the build. Do not print config values.
5. Start an isolated candidate on an explicitly verified free port and run health/root/auth-negative/fixture/security/bundle smoke with short timeouts.
6. Preserve the current 3004 release and timestamped Nginx/readiness rollback configs before any cutover.
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
