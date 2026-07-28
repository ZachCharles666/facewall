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
- Promotion must upload the frozen artifact, verify its digest, build it on staging and repeat minimum smoke before replacing the current candidate identity.

## Frozen Artifact

- Release source commit: `19d791f26640edcc583053c4b9f70d4186d1faa4` (`[IB-07] Freeze staging candidate`).
- Export explicitly used `core.autocrlf=false` so archive text bytes match Git blobs on Windows; `outputs/` and historical `.docx` product-source files were excluded because they are not server runtime inputs.
- Archive: `outputs/passbuddy-release-freeze-19d791f-20260728.tar.gz`.
- SHA-256: `3e9ada8c7f332a491cfca112ec2621c2bdb22b1ce72489199174bdd0ff58dbac`.
- Archive audit: 416 entries, 0 `.docx`, 0 forbidden paths, 0 missing required runtime/release files.
- An initial Windows export inherited global `core.autocrlf=true` and caused two LF-sensitive source-contract assertions to fail after extraction. That archive was rejected and replaced; Git blob equality was verified before accepting the final artifact.
- Final archive-only validation: 60/60 internal-beta, `tsc --noEmit --incremental false`, production build 33/33 and source security 189 files Pass.
- Temporary extraction/build directories were removed after their exact paths were verified. The final tar.gz remains ignored and is not part of the provenance commit.

## Open Gates

- AUTH-001, AUTH-006 and SESSION-003 real login evidence.
- OBS-001–004 external application monitoring and alert evidence.
- Final privacy/service policy version, domain access relationship, HTTP webblock and certificate renewal.
- G0 two-user/admin integrated E2E and one-workday observation.
- PILOT-001–005 remain Pending; no real pilot has started.

## Post-Freeze Candidate Artifact — 2026-07-29

- Release source commit: `9607f9e7d912b20baca58245e8e4e20e989fe737` (`[IB-07] Prepare post-freeze staging candidate`), pushed to `origin/release/preview`.
- Scope: 33 paths, 1184 insertions/50 deletions, no deleted path；包含产品协议草案、IB-08 语音契约/故障隔离和 IB-09 腾讯云 RUM 国内前端接入。
- Archive: `outputs/passbuddy-release-post-freeze-9607f9e-20260729.tar.gz`.
- SHA-256: `3fb91f2686001dbd08a629e68bb8cd4c77fceb91214e479a6ea67f703de45418`.
- Final archive audit: 424 entries；`outputs/`、`.docx`、`.env.local`、`.env.production.local`、`.git`、`.next`、`node_modules`、私钥/证书/数据库 dump/zip 命中 0；必需 package、RUM、evidence 和 migration 文件缺失 0。
- 第一次导出因 Git 已跟踪的历史 `outputs/dev-review`/`outputs/phase9` 被带入而拒绝；第二次导出因根目录 3 份产品 `.docx` 被带入而拒绝。两份无效归档均未上传并被最终文件替换。
- 独立 `C:\tmp` 解包后执行锁定依赖安装：68/68 internal-beta、typecheck、production build 33/33、source security 196 files、bundle security 60 files 全部 Pass。
- 首个仓库内 `outputs/.verify-*` 目录虽然测试 68/68 Pass，但因 Windows sandbox 阻止 `.next`/`tsbuildinfo` 写入且 Next 检测到父目录 lockfile，不作为 build 证据；改用仓库外独立目录后闭环。
- 两个临时验证目录已在解析绝对路径后删除；最终 tar.gz 保留。
- 2026-07-29 staging 已验证该归档 SHA-256、完成依赖安装/68/68/typecheck/security/33-of-33 build，并在 3002 隔离 smoke 后将 Nginx 与 readiness 切换到 `facewall-rum-candidate`。公网 health/root/auth-negative/fixture/security headers 和 readiness 均 Pass，3000/3001 与时间戳回滚配置仍保留。
- 该部署尚无腾讯云 RUM captured payload/requestId/告警恢复证据，也未启动真实灰度；OBS-001～004 继续 Partial。
