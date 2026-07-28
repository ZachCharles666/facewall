# IB-07 Release Freeze Evidence — 2026-07-28

## Target

- Freeze the current IB-02–IB-07 implementation as the source-of-truth candidate for the remaining G0 gates.
- This is a pre-G0 staging release unit, not authorization for 10–20/50/100 user rollout.
- Base branch: `release/preview`.
- Pre-freeze HEAD: `d62daff931540f406802608c6986b760044706c0`.

## Scope Review

- Candidate scope after runtime-artifact exclusion: 198 paths.
- 33 paths modify the tracked July 11 preview baseline; 165 paths add the internal-beta application, migrations, contracts, evidence, operations scripts and tests.
- The scope intentionally preserves all IB-02 through current changes across `app/`, `components/`, `db/`, `docs/`, `lib/`, `scripts/`, `tests/`, package manifests and root runtime configuration.
- No tracked deletion is part of the freeze.

## Excluded Local And Runtime Artifacts

- `.env*.local`, `.next/`, `node_modules/`, build output, coverage and TypeScript build info remain ignored.
- Candidate archives remain under ignored `outputs/*.tar.gz`.
- Browser control profiles/caches/dumps under `outputs/.cdp-debug*/` and temporary `outputs/*.log` are now explicitly ignored.
- Existing ignored files were not deleted or modified.
- Pre-stage path audit found no candidate `.env.local`, private key, certificate, database dump, archive or zip.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:internal-beta` | Pass; 60/60 |
| `npm run typecheck` | Pass |
| `npm run build` | Pass; Next 15.5.19, 33/33 static generation |
| `npm run security:check` | Pass; 188 source/docs/scripts/example files |
| `npm run security:bundle` | Pass; 59 bundle files, configured sensitive values compared in memory and not printed |
| `git diff --check` | Pass; only existing LF→CRLF checkout warnings |
| Git index before freeze | Clean |

## Runtime Relationship

- Public staging currently runs `/home/ubuntu/releases/passbuddy-20260728-112135` through `facewall-candidate` on 3001; old `facewall` 3000 and the Nginx rollback configuration remain available.
- The public candidate already passed health/root/auth-negative/fixture/security-header smoke, readiness timer checks and the one permitted LLM fixture measurement.
- This freeze creates the authoritative Git source for the next rebuild. It does not claim that the currently running archive was built from the resulting commit.
- Promotion must build a fresh archive from the frozen commit, verify its digest, and repeat minimum staging smoke before replacing the current candidate identity.

## Open Gates

- AUTH-001, AUTH-006 and SESSION-003 real login evidence.
- OBS-001–004 external application monitoring and alert evidence.
- Final privacy/service policy version, domain access relationship, HTTP webblock and certificate renewal.
- G0 two-user/admin integrated E2E and one-workday observation.
- PILOT-001–005 remain Pending; no real pilot has started.
