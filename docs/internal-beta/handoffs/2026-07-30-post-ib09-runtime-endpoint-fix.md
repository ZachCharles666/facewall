# 2026-07-31 Post-IB-09 RequestId Acceptance Handoff

## Authority And Entry Point

- Workspace: `D:\hackthon\facewall`
- Branch: `release/preview`
- This file is the newest continuation entry. Older handoffs are historical only and cannot override `docs/todo.md`, the Acceptance Matrix, or newer evidence.
- Before acting, read `AGENTS.md`, `docs/todo.md`, the internal-beta contracts/runbook/release instruction named by the user, `docs/internal-beta/evidence/IB-09-tencent-rum-frontend.md`, and this file.
- Preserve every IB-02 onward change. Do not reset, checkout over, stash, clean, bulk-format, or delete user work.
- Do not stage, commit, or push until the user gives a new explicit authorization. The latest authorization was consumed by commit `d963d65c788479203854ed307a4585b6a0e1831a`; it does not authorize the current evidence-doc diff.

## Public Staging State

- Public Nginx upstream and `passbuddy-local-readiness` target are on port 3007.
- Release: `/home/ubuntu/releases/passbuddy-20260730-d963d65`
- PM2 process: `facewall-rum-requestid-candidate`
- Last public cutover evidence:
  - health/root/anonymous session/OTP GET/production fixture = 200/200/401/405/404
  - Nginx 3007 refs = 3; readiness 3007 refs = 1; 3006 refs = 0/0
  - Nginx syntax and six security headers Pass
  - readiness oneshot Result=success / ExecMainStatus=0
- Rollback files:
  - `/etc/nginx/conf.d/facewall.conf.pre-ib09requestid-20260730-234244`
  - `/etc/passbuddy/readiness.env.pre-ib09requestid-20260730-234244`
- The earlier explicit reconstructed 3005 rollback pair is also preserved:
  - `/etc/nginx/conf.d/facewall.conf.pre-ib09controlplane-reconstructed-20260730-214834`
  - `/etc/passbuddy/readiness.env.pre-ib09controlplane-reconstructed-20260730-214834`
- The earlier detached 3006 cutover collapsed both backup variables to `/.pre-ib09controlplane-`; that mode-600 orphan was not deleted. The live configuration stayed valid, and the reconstructed 3005 pair was byte-compared against the exact reverse port transform.
- Old PM2 candidates remain preserved for rollback. No `pm2 save`, old-process cleanup, OTP, alert notification, or real pilot was performed.

## Latest Browser Evidence

- Commit `d963d65c788479203854ed307a4585b6a0e1831a` is public on 3007 with the exact commit embedded as the RUM release version.
- Clean Network evidence shows official mainland `/collect/whitelist` and `/rateConfig` GET 200 requests. Both had no body, Cookie or Authorization; query keys were anonymous SDK technical metadata only.
- A single observed `/api/health` GET 200 produced mainland `/speed` preflight/actual 200/204. The speed record contained the normalized path/method/status/duration, current release and the same legal requestId in both SDK `ret` and the explicit sanitized `requestId`; request/response body, Cookie, Authorization and forbidden user content were absent.
- The same requestId matched the response header, 3007 PM2 `api.request.completed` JSON and Tencent API Monitor `retcode`; remote environment `pre`, release, route, method and status all matched.
- An earlier read-only `/api/azure-status` response correlated with PM2 but did not emit `/speed`; it was not retried. Lifecycle observation on the later health probe proved `beforeReportSpeed` → `beforeRequest` → sanitizer → `afterRequest` and real receiver delivery. Treat RUM as sampled telemetry, not a complete per-request audit ledger.
- The ordinary Chrome console flood was entirely from the Unstoppable Domains extension and is not PassBuddy evidence. No OTP, external alert or pilot was executed.
- OBS-002 and OBS-003 are Pass. OBS-001 and OBS-004 remain Partial.

## Root Cause And Local Fix

- Installed dependency remains exact `aegis-web-sdk@1.41.14`.
- The SDK constructor applies caller config and then reconstructs all endpoint URLs from `hostUrl`; when omitted it uses the mainland default. Therefore the `caa52ee` strategy of constructor-only individual endpoints was not an effective runtime lock.
- Commit `f57a26d7d740159d298e62bd5591e44be93e53c3` initializes with mainland `hostUrl`, immediately calls public `setConfig`, and correctly locks log/PV/speed/performance/web-vitals plus `/rateConfig`.
- 3004 runtime evidence found the deeper pinned-SDK constraint: empty `whiteListUrl` prevents the official config request but also leaves the internal whitelist-complete flag false forever, so errors remain buffered and no receiver request is sent.
- Product approved the supported fix: retain the official same-mainland `https://rumt-zh.com/collect/whitelist` endpoint, while keeping custom event/custom time/offline empty and preserving anonymous/no-body/no-cookie privacy controls.
- 3005 proved endpoint restoration alone is insufficient. In Aegis 1.41.14 both the whitelist and rate-config handshakes pass through `beforeRequest` as `logType="whiteList"` with `logs=null`; the local sanitizer treated every empty envelope as false and cancelled both requests before the network layer.
- Commit `843386d` permits only the exact empty `whiteList/null` control-plane shape. Any whiteList envelope carrying an object, payload or user data remains rejected.
- The batch API speed sanitizer from `caa52ee` remains intact.
- 3006 proved that Aegis 1.41.14 reads configured `resHeaders` for fetch/XHR diagnostics but, with `apiDetail=false`, does not copy those headers into the duration record. Therefore the earlier assumption that `resHeaders: ["x-request-id"]` alone enables speed-payload correlation is false.
- Commit `d963d65` keeps `apiDetail=false` and `reportRequest=false`. It reads only a regex-valid `x-request-id` from the Fetch `Response`/XHR context already passed to `retCodeHandler`, carries it through the SDK retcode field, and promotes it to an explicit sanitized `requestId`. It does not enable request/response body or header-detail collection.

## Local Verification

- The response-requestId speed correlation fix is committed and pushed as `d963d65c788479203854ed307a4585b6a0e1831a`.
- Targeted Tencent RUM contract: 11/11 Pass.
- Full internal-beta: 73/73 Pass.
- Typecheck: Pass.
- Production build: 33/33 pages/routes generated.
- Source security: Pass, 197 files.
- Local pre-commit bundle security: Pass, 61 files; staging build bundle security: Pass, 59 files.
- Staging archive: `passbuddy-release-ib09-requestid-d963d65-20260730.tar.gz`, SHA-256 `c8f4c88a2d56c89eef5f162900a8ccbed0acf6680dd1258d1e03139f47c6924b`, 425 entries, forbidden 0, required missing 0.
- Staging detached build, isolated smoke, public cutover, readiness, receiver privacy and Tencent API Monitor correlation all Pass.

## Current Working Tree Scope

The tree was clean at `d963d65` before recording final evidence. Expected current uncommitted scope is documentation-only:

- `docs/todo.md`
- `docs/internal-beta/05_acceptance_matrix.md`
- `docs/internal-beta/evidence/IB-09-tencent-rum-frontend.md`
- this handoff

Start the next task with read-only `git status --short`, current diff, and untracked-file review. Treat any additional path as new user work until proven otherwise.

## Next Actions

1. Review and validate only the four-file documentation diff; run internal-beta contract tests, source security and `git diff --check`.
2. With a new explicit user authorization, stage/commit/push only those reviewed documentation files. Do not treat the prior push authorization as reusable.
3. Keep public 3007 and both current 3006 rollback files intact. Do not clean old candidates or run `pm2 save`.
4. Do not repeat the accepted browser probe. The next observability work is OBS-001/004 only:
   - choose a real service-side exception receiver without reintroducing CLS or cross-border telemetry;
   - configure severe JS error/report-volume and application/DB/backup alert rules;
   - before any real email/WeChat drill, name every recipient and the exact expected notification count, then obtain explicit confirmation.
5. Confirm the RUM daily-volume threshold, owner, response time and stop procedure before real pilot. No 10–20/100-person pilot starts from this handoff.

## Safety Gates

- Every OTP send still needs separate explicit confirmation.
- Before any real email/WeChat alert drill, state the recipients and exact expected notification count.
- Do not output env values, IDs treated as private configuration, DSNs, tokens, cookies, Authorization, OTP, secrets, real invite codes, resumes, JDs, answers, reports, or prompt bodies.
- Do not modify or delete real user data and do not start a 10–20/100-person pilot.
