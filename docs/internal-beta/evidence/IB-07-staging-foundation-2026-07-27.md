# IB-07 Staging Foundation Evidence — 2026-07-27

## Scope And Decision

本记录只覆盖 staging HTTPS 现状、PostgreSQL、migration、备份恢复、候选构建和本机候选 smoke；没有启动 10–20 人真实灰度，没有发送 OTP，也没有把本地 adapter 冒充真实监控。

当前决策：

- **可以继续 staging drill**：数据库、本机与 COS 异地恢复点、真实恢复和可构建候选已具备。
- **不能开始真实内测放量**：腾讯云接入备案关系、HTTP 跳转/证书自动续期、真实 OTP、真实监控、应用切换回滚和法务正文尚未闭环。

## HTTPS And Runtime Topology

- 域名：`facewall.oldriver.work`，解析到上海腾讯云轻量应用服务器 Lighthouse（此前口头称为 CVM，本次按控制台 `lhins-*` 实例类型纠正）。
- Nginx 监听 80/443；既有 Next/PM2 仅监听 `127.0.0.1:3000`。
- HTTPS 返回 `200`；已验证 HSTS（暂设一天）、CSP、nosniff、DENY frame、Referrer Policy 和 Permissions Policy。
- Nginx 将 `X-Forwarded-For` 固定为 `$remote_addr`，避免客户端伪造首跳 IP 影响 OTP/写限流。
- 公网 HTTP 当前仍被 DNSPod webblock 截获，未到达 Nginx；本机 origin HTTP 为 301。
- 当前 TrustAsia 证书有效期至 2026-10-05；`certbot certificates` 未发现托管证书，因此自动续期未建立。
- `oldriver.work` 已有 ICP 备案历史，但个人/企业主体切换后当前腾讯云控制台不再显示原记录；按“暂时无法确认腾讯云接入关系”处理。

因此 AUTH-006 不升级：仍缺当前候选部署后的 Secure Cookie、退出登录和受保护 API 浏览器证据。

## PostgreSQL Foundation

| 检查 | 结果 |
| --- | --- |
| 版本 | PostgreSQL 16.14 |
| 监听 | 仅 `127.0.0.1:5432` |
| 密码协议 | `scram-sha-256` |
| runtime role | `passbuddy_app`；非 superuser/createdb/createrole，受 FORCE RLS |
| admin/migration role | `passbuddy_admin`；非 superuser/createdb/createrole，按数据契约仅启用 `BYPASSRLS` |
| 数据库 | `passbuddy`，owner=`passbuddy_admin` |
| migration | `0001`–`0011` 顺序应用；二次执行无新增，幂等通过 |

首次 DB integration 因 admin role 尚未启用 `BYPASSRLS` 被 `FORCE RLS` 正确拒绝；按架构契约补齐该单一能力后通过。没有授予 superuser。

## Verification

| 命令/矩阵 | 结果 |
| --- | --- |
| `npm run test:internal-beta:db` | Pass；RLS、邀请码并发、OTP budget、Session 原子/配额 |
| privacy DB integration | Pass；删除、故障回滚、重试和去标识 |
| feedback DB integration | Pass；owner/state/idempotency/events/reconciliation |
| admin DB integration | Pass；metrics/audit/alerts/事务回滚 |
| security DB integration | Pass；IDOR、激活恢复、rate limit |
| `npm run test:internal-beta` | 57/57 Pass |
| `npm run typecheck` | Pass |
| `npm run security:check` | Pass；181 个 source/docs/scripts/example 文件 |
| `npm run build` | Pass；Next 15.5.19，33/33 static generation，候选路由完整 |
| `npm run security:bundle` | Pass；56 个 bundle 文件；5 类已配置敏感变量真实值命中 0 |

测试只使用 `example.test` 和明确 IB fixture。测试结束后先按 ID、学校、事件时间窗和零真实用户 guard 清理；最终主库为：

- users/schools/sessions/events/OTP counters：0；
- migrations：11。

## Backup And Restore

| 证据 | 结果 |
| --- | --- |
| migration 前 dump | 可被 `pg_restore --list` 读取；SHA-256 `de514174e37a1103c520e672705c8ca25f8540479ae50679fd5cabc6e4d5b144` |
| migration 后 dump | 可读；SHA-256 `1a3df985db65f556b8aafa65ec28442b2f797bb7c69a3c6329c9e52ce3093012` |
| restore drill | 恢复到独立 `passbuddy_restore_drill`；migrations=11、auth tables=6、public base tables=12 |
| drill cleanup | 临时恢复库已删除并确认 ABSENT |
| clean baseline 0011 | 无 fixture；可读；SHA-256 `800f75f290a1f397dfe77f4f209452847d051047d1fb83ef538ba94f346d36e0` |
| COS 首次上传 | 私有上海单 AZ 桶；`.dump` 76069 bytes 与 `.sha256` 121 bytes 上传成功 |
| COS 完整性 | 本地/远端 CRC64 均为 `269395234775543166`；从 COS 下载后 SHA-256 校验 `OK` |
| COS restore drill | COS 下载文件恢复到 `passbuddy_cos_restore_drill`；migrations=11、auth tables=6、public base tables=12 |
| COS drill cleanup | `passbuddy_cos_restore_drill`=`ABSENT`；`cos-restore-opHOJPRQ`=`RESTORE_TEMP_REMOVED` |

备份文件权限为 `600`、备份目录为 `700`。Lighthouse 本机备份、COS 异地复制、下载校验、真实恢复和每日自动任务均已证明。

### Automated Local And COS Backup

- `/usr/local/sbin/passbuddy-db-backup` 以 `postgres` 系统用户通过本机 peer auth 执行，不保存数据库密码。
- COS 桶为私有读写、上海单 AZ、SSE-COS；生命周期仅作用于 `passbuddy/staging/db/`，90 天删除，未完成分块 7 天清理。
- Lighthouse 不支持 CVM 实例角色；因此使用独立 `passbuddy-cos-backup` CAM 编程用户。策略只允许目标桶元数据检查及 `passbuddy/staging/db/*` 的上传、读取、HEAD 与分块上传，不允许删除对象、改桶配置或访问其他前缀。
- COSCLI 配置归 `postgres:postgres`、权限 `600`，密钥由 COSCLI 加密保存；没有写入应用 env、脚本或 journal。
- systemd 本机版首次执行 `status=0/SUCCESS`，生成并校验 `passbuddy-20260727T121618Z.dump`（76069 bytes）。
- 接入 COS 后再次执行 `status=0/SUCCESS`：上传 `.dump`/`.sha256`、远端 HEAD/CRC 检查和 `PASSBUDDY_BACKUP_OK ... cos=verified` 均成功。
- `passbuddy-db-backup.timer` 已启用；下一次触发为 2026-07-28 03:18:28 CST，`Persistent=true` 且有 0–5 分钟随机延迟。
- dump 和 `.sha256` 权限受限；本机保留策略为 14 天。
- COS 操作均有 60/120 秒超时与最多 3 次短重试，不会无限等待；上传失败告警仍待接真实邮件/微信渠道。

## Candidate Smoke And Cleanup

- 候选包 SHA-256：`d23f21edb1ec92c7952656cc665b1329d01519bc3a932adaee07a14e4156ca0e`。
- 候选在独立 release 目录安装、构建；没有覆盖 `/home/ubuntu/facewall`。
- 临时 PM2 `facewall-candidate` 仅监听 `127.0.0.1:3001`：
  - `/` = 200；
  - `/api/auth/session` = 401（未登录）；
  - production browser fixture = 404；
  - `/api/azure-status` = 200。
- smoke 后已 `pm2 delete facewall-candidate`；3001 已释放；旧 `facewall` 3000 继续 online。
- 初始 candidate smoke 未执行公网切换；其后的 2026-07-28 drill 已完成真实“候选切换 → 验证 → 上一稳定版本回滚”，详见下节。

### HTTPS Cutover And Rollback Drill — 2026-07-28

- Nginx 配置先备份为 `/etc/nginx/conf.d/facewall.conf.pre-sec006-20260728-010136`；3 处 upstream 从 3000 精确替换为 3001，旧 upstream 剩余 0，切换前 `nginx -t` Pass。
- 候选真实经 `https://facewall.oldriver.work` 验证：health=200 且 application/database up、root=200、anonymous session=401、production fixture=404。
- HSTS、CSP、nosniff、DENY frame、Referrer-Policy 和 Permissions-Policy 均在候选 HTTPS 响应中存在。
- 脚本 EXIT trap 恢复原配置，恢复后 `nginx -t` Pass、reload 成功、root=200、health=404。旧版本本身没有 health route，因此 404 同时证明 upstream 已回到 3000。
- 本演练没有发送 OTP、没有修改真实用户数据。SEC-006 据此由 Pending 更新为 Pass；AUTH-006 仍缺真实登录后的 Secure Cookie/退出浏览器矩阵，保持 Pending。

## Tencent Cloud Host Monitoring

- 已创建 `passbuddy-staging-notice` 通知模板，接收对象为主账号，渠道为邮件和微信；短信、电话、企业微信和接口回调未启用。
- 已创建并启用 `passbuddy-staging-host-warning`，作用于单一 Lighthouse 实例：
  - CPU > 80%，1 分钟粒度，连续 5 个数据点；
  - 内存 > 85%，1 分钟粒度，连续 5 个数据点；
  - 磁盘 > 80%，1 分钟粒度，连续 5 个数据点；
  - 任一条件满足即告警，每小时最多重复一次。
- 临时 `passbuddy-staging-alert-test` 以 CPU > 0%、连续 1 个数据点真实触发，用户确认通知测试通过。
- 将测试阈值改为 99% 后未收到恢复通知；按控制台可能重置策略状态处理，不把恢复通知标为 Pass，也不为补证据执行 CPU 压测。临时策略应删除，正式策略保留。
- CLS 会产生写入、索引、存储、请求和分区费用，本轮决定不为约 100 人受控内测购买；不安装 LogListener。应用继续输出经过 scrubber 的 vendor-neutral JSON 日志并在本机轮转，后续可接 Loki、OpenTelemetry、Sentry 或其他平台。
- 候选代码新增 `GET /api/health` readiness：查询 runtime PostgreSQL；正常为 200/application+database up，失败为 503/database down；不返回 DSN、异常原文或业务正文，`Cache-Control: no-store`，健康轮询不持久化 API metric。
- 本地验证：`npm run typecheck` Pass；`npm run security:check` Pass（183 个文件）。
- `/etc/logrotate.d/passbuddy-pm2` 已覆盖现有 facewall/候选 PM2 日志：daily、rotate 14、maxsize 10 MiB、compress+delaycompress、copytruncate，文件权限为 `ubuntu:ubuntu`/`640`。
- `logrotate --debug` 无错误；强制轮转后 `pm2 ping`=`pong`、`facewall` 继续 online，原日志完整保留为 `.log.1`，当前四个日志为 0 bytes/640。轮转未重启 Next 或 PM2。
- health 候选包 SHA-256 `e5ccaacd8de1f6cab01ac76044842c2d384384b19450c33d758b3a2a12531c9f`；归档检查包含 health route/DB tests，且 `.env.local`、production env、`.next`、`node_modules`、`.git` 命中 0。
- 新 release 依赖安装 14 秒；migration 幂等、typecheck、source security（183 files）、production build 和 bundle security（57 files）Pass。
- 隔离 PM2 `facewall-candidate` 监听 `127.0.0.1:3001`：`/api/health`=200 且 application/database up、root=200、anonymous session=401、production fixture=404；旧 3000 与候选均保持 online。
- 本证据只证明真实云平台主机指标和通知触达，以及可部署的本地 readiness 接线；应用异常远端聚合、requestId 远端关联、数据库错误与备份失败外部告警尚未完成，OBS-001–004 继续保持 Partial。

## Remaining Gates

- AUTH-001：SES 配置和 QQ/163/学校邮箱真实送达；每次 OTP 发送前需明确确认。
- AUTH-006：当前候选公网部署后的 Secure Cookie/退出/401 浏览器矩阵。
- SESSION-003：真实 OTP 退出重登。
- SESSION-008：已于 2026-07-28 完成唯一一次受控 fixture 调用和真实 provider usage 对账，见本文 “Controlled LLM provider call”；状态升为 Pass。
- OBS-001–004：主机监控已接真实邮件/微信；仍缺应用级远端 payload/requestId 聚合及数据库/备份失败外部告警。CLS 本轮明确不采用。
- COS 上传失败的真实邮件/微信告警（异地备份、90 天保留和恢复演练已关闭）。
- SEC-006：Pass；2026-07-28 HTTPS 候选切换与上一稳定版本回滚演练完成。
- 腾讯云接入备案、HTTP webblock 和证书自动续期。
- 最终隐私政策/服务协议及 policyVersion。

## Post-SEC-006 Local Readiness And DB Failure Evidence — 2026-07-28

### Isolated health 503

- 本机 3000/3001/5432 均未监听，本地 PostgreSQL/Docker 未运行。
- 第一次用不可达 fixture DB 启动 3001 时，旧 `.next` 对 `/api/health` 返回 404；临时进程随后关闭且 3001 释放。
- 顺序执行 production build 后，当前候选在同一不可达 fixture DB 下返回 `503`：
  `{"status":"unavailable","checks":{"application":"up","database":"down"}}`。
- 响应包含 `Cache-Control: no-store, max-age=0`；未返回 DSN、配置值或原始异常。
- 该故障注入没有停止、修改或连接真实 PostgreSQL；验证后进程关闭，3001 最终释放。

### Vendor-neutral local checks

- 新增 `scripts/staging/passbuddy-local-readiness.sh` 及 systemd oneshot/timer 模板。
- 检查范围：公网 HTTPS readiness、本机 Next readiness、PM2 online、`pg_isready`、备份 timer enabled/active、上次 backup service result、最新 dump 不超过 36 小时及对应 SHA-256。
- curl 连接/总超时为 3/8 秒；PM2/PostgreSQL/systemd 为 5 秒；SHA 校验为 15 秒。失败以非零退出，stdout 仅输出 `passbuddy.staging.readiness` JSON 技术结果。
- 脚本没有邮件、微信、Webhook、CLS 或 Sentry 调用；本轮没有触发任何真实外部通知。它只提供本机 source of signal，不能替代外部监控验收。
- 静态/契约验证：59/59 internal-beta、typecheck、production build、source security 和 diff check Pass。security scanner 已覆盖 `.sh/.service/.timer`。
- 限制：当前 Windows 环境无法启动 WSL/bash，因此 `bash -n` 和 systemd 实际运行尚未取得远端证据；部署到 staging 前必须补做，OBS-001–004 继续 Partial。
- 未上传候选归档：`passbuddy-staging-candidate-post-sec006-20260728-012941.tar.gz`，SHA-256
  `0484e97689f299aaf98fe2e51610ee6ff9003076e9c71786505004d074b05a7f`；归档 2001 个条目，`.env.local/.git/.next/node_modules/outputs` 命中 0，并包含 health route、readiness 脚本/units 和契约测试。

### Controlled provider probes prepared

- 新增真实 LLM fixture 探针和仅候选进程使用的 `maxAttempts=1` 开关；探针只发起一个 `/api/profile/parse` 请求，并只输出 provider、model、latency、usage/null、attempts 与 requestId 对账。
- 探针不输出 response data、简历、JD、回答、报告或 prompt；随后唯一一次真实调用及 provider usage 对账已完成，详见本文 “Controlled LLM provider call”。
- 更新未上传候选归档为 `passbuddy-staging-candidate-post-sec006-20260728-112135.tar.gz`，SHA-256
  `83ec25bb0d4930f3fa2c0c0cbd7258107e8bc03081bc1a4f014578226f634d49`；2002 个条目，禁入目录命中 0，包含 health/readiness/LLM probe。
- 更新后相邻回归：60/60 internal-beta、typecheck、production build、source security（188 files）与 diff check Pass。

### Zhejiang campus mailbox probe

- 用户逐次确认后，仅向脱敏后的浙大校园邮箱执行 1 次真实腾讯云 SES 验证码模板探针；provider 返回接受结果和 provider IDs，没有重试或第二次调用。
- 在此之前对公网 `/api/auth/request-otp` 的一次请求返回 404；旧稳定版 `/api/health`、`/api/auth/session` 和 `/api/auth/request-otp` 均为 404、根路径 200，与 SEC-006 回滚到旧 3000 的拓扑一致。该 404 未进入认证代码、未调用 SES。
- 用户确认邮件进入收件箱，收件端显示 11:12，与 provider 接受时间同一分钟；未落入垃圾箱。该探针不是可登录的完整 OTP E2E，且缺重复样本与另一所学校邮箱矩阵，AUTH-001 继续 Pending。

### Remote access gate

- 标准 SSH 使用独立临时 known-hosts 并记录主机指纹后，认证仍因无可用凭据 fail-closed；未关闭 host key 校验。
- Chrome 已进入登录后的腾讯云 OrcaTerm，但远程截图/输入通道反复超时，尚未取得完整只读侦察输出。
- 已将只输出服务状态和配置存在/缺失的只读命令交给用户在 WebShell 执行；不读取或回传配置值。
- 因此本节不声称重新确认远端 PM2、3000/3001、Nginx upstream、PostgreSQL、backup timer 或磁盘状态；这些仍以此前证据为历史基线，需在恢复可信远端访问后刷新。

## Public staging candidate deployment — 2026-07-28

### Refreshed remote baseline

- 用户在已登录 OrcaTerm 执行脱敏只读侦察：旧 `facewall` PM2 online；仅 `127.0.0.1:3000/5432` 监听；Nginx 三处均为 3000。
- PostgreSQL service active、`pg_isready=yes`、migration count=11。
- `passbuddy-db-backup.timer` enabled/active；上次 service Result=success/ExecMainStatus=0；下一次 timer 已排期。
- 根盘使用 21%；`facewall-candidate` absent、3001 released。
- 旧 `/home/ubuntu/facewall/.env.local` 和 PM2 显式环境未发现 provider；随后确认部署实际使用 `.env.production.local`，因此前述 absent 不代表 Next production runtime 缺配置。

### Release build and isolated 3001

- 归档 SHA-256 验证后解包到 `/home/ubuntu/releases/passbuddy-20260728-112135`；required files 和 Linux `bash -n` Pass。
- 继承上一已验证候选的 `.env.production.local`，权限 600；远端配置存在性为 DB runtime/admin、Auth、LLM provider/model present，应用监控 provider absent，SES 初始 absent。
- 远端 `npm ci`、migration 幂等、60/60 internal-beta、typecheck、source security（188 files）、production build（33 routes）和 bundle security（57 files）Pass。
- `facewall-candidate` 以 production、`PASSBUDDY_LLM_MAX_ATTEMPTS=1` 启动在 `127.0.0.1:3001`；root/health=200、health application/database up、匿名 session=401、OTP GET=405、production fixture GET=404。
- 初始 smoke 曾把 fixture POST 405 错当成预期 404；重新核对路由只导出 GET 后，以 production env guard + GET 取得 404，未创建 fixture 数据。

### Server SES configuration

- 候选初始缺腾讯云 SES 五项配置，因此在补齐前没有调用应用 OTP。
- 仅从本地已验证 SES 配置中提取五项，通过 SSH stdin 传输；没有把值写入命令行、聊天或日志。
- 合并前保留 `.env.production.local.pre-ses-20260728-120443`（600）；五项 nonempty/unique 校验通过，候选重启后 health ready；incoming secret fragment 已删除。
- 本步骤没有发送 OTP；此前浙大收件证据仍是独立 SES template probe，不冒充应用登录。

### Readiness runtime validation

- 修正 root systemd service 无法直接看到 ubuntu PM2 daemon 的问题：通过 `runuser --user ubuntu` 和显式 `PM2_HOME=/home/ubuntu/.pm2` 查询。
- 修正脚本 SHA-256、Linux `bash -n` 和 PM2 cross-user guard Pass；systemd script/unit/env 已安装。
- 使用隔离 3001 作为两个 health target 的 local-only dry run：HTTPS/local health、PM2、PostgreSQL、backup timer/service、36 小时新鲜度、SHA-256 和 summary 全部 Pass。
- timer 随后已启用并 active；首次 oneshot 的 HTTPS/local health、PM2、PostgreSQL、backup timer/service/freshness/checksum 与 summary 共 9 条 vendor-neutral JSON 记录全部 Pass，service Result=success/ExecMainStatus=0，下一次运行已排期。
- 上述结果只存在于本机 systemd 日志，没有外部通知或远端聚合，OBS-001–004 继续 Partial。

### Public cutover

- 备份 `/etc/nginx/conf.d/facewall.conf.pre-ib07-20260728-120806`；三处 upstream 从 3000 精确切到 3001，`nginx -t` 与 reload Pass。
- 公网 HTTPS：health/root=200；health application/database up；匿名 session=401；OTP GET=405；production fixture GET=404。
- HSTS、CSP、nosniff、frame、Referrer-Policy、Permissions-Policy 均存在。
- active Nginx upstream 为三处 3001；旧 `facewall` 3000 和 `facewall-candidate` 3001 均 online，上一稳定版本与即时回滚配置保留。
- 这是 staging 公网候选部署，不是 10–20/100 人真实灰度。切换验证本身没有发送 OTP或调用 LLM；AUTH-006 和 OBS-001–004 未因此升级。LLM 是切换后的独立单次受控 drill。

### Controlled LLM probe preflight

- 首次 wrapper 已原子保留旧 marker，并以单次 attempt guard 启动探针；`tsx/esbuild` 在 CJS 转译阶段拒绝 top-level await，进程 exit=1。
- 失败发生在模块执行和 `fetch` 之前，因此真实 provider 调用计数仍为 0；旧 marker/result 保留为预检失败证据，不删除、不改写，也不冒充一次 provider 调用。
- 探针已改为 `async main()`；本地以 CJS output format 纯编译 Pass，定向 staging operations 契约 3/3、typecheck、source security（188 files）和 `git diff --check` Pass。纯编译未执行脚本、未联网。
- 修正脚本 SHA-256 为 `8de91062cf47706215e27d6e7fcec1d6ab302ee1b89e85975d34d96982ce20a9`；待服务器校验安装后，使用独立的新 provider-call marker 执行至多一次真实 fixture 调用。

### Controlled LLM provider call

- 修正脚本服务器 SHA-256 校验和 CJS 纯编译 Pass；旧预检 marker/result 保留，新 `.llm-provider-call-once-20260728` marker 原子创建。
- 调用前确认 `facewall-candidate` online、`PASSBUDDY_LLM_MAX_ATTEMPTS=1` guard enabled、候选 health HTTP 200。
- 唯一一次非敏感 fixture 调用成功：HTTP 200、`source=llm`、provider=`tokenhub.tencentmaas.com`、model=`hy3-preview`、真实 latency=17171 ms、attempts=1。
- provider 明确返回 input 772/output 1079 tokens，未估算；`providerUsageReturned=true`。探针 requestId 与响应及 measurement requestId 一致。
- 结果只保存上述技术测量字段，没有输出或记录简历、JD、回答、报告、response data 或 prompt 正文；wrapper exit=0，并明确禁止重跑。
- 结合既有 generation measurement 传播、fixture PostgreSQL 对账、fallback null 约束和正文隐私扫描，SESSION-008 的真实测量门槛关闭，状态由 Partial 升 Pass。
- 调用后相邻回归：60/60 internal-beta、typecheck、production build（33/33 static generation）、source security（188 files）、bundle security（59 files）和 `git diff --check` Pass。

### Deferred AUTH-006 browser attempt

- 用户单独授权向已提供的浙大校园邮箱发送最多一次应用 OTP。浏览器执行一次“发送验证码”点击后，控制通道在等待响应阶段超时；页面未确认进入 OTP，服务端结果未审计。
- 没有重试或第二次点击；用户随后决定停止该路径。由于缺少可复查的 request status、合法 Session、Secure Cookie、logout 和退出后 401，本次不确定尝试不计 AUTH-001、AUTH-006 或 SESSION-003 证据，三项状态不变。
