# 版本发布：腾讯云自托管 Node

面向「先发布到云上，让产品用 `?theme=classic` 调 prompt，并保存为 `?theme=figma` 默认 Prompt」的场景。

## 0. 发布门禁（切版本前必须绿）

在**一个确定的代码快照**上，本地依次通过：

```bash
npm ci
npm run typecheck
npm run build          # ← 发布门禁：必须 exit 0
npm run security:check
```

> 当前发布门禁必须以实际命令结果为准；不要从红构建发布。

## 1. 版本冻结（和 codex 并行开发解耦）

codex 还在改工作区，直接部署会让产品的环境跟着抖动。切一个独立发布快照：

```bash
# 在 build 绿的那一刻
git switch -c release/preview
git add -A
git commit -m "Release preview for product prompt tuning"
git tag preview-$(date +%Y%m%d)
git push -u origin release/preview --tags
```

服务器只认这个 `release/preview` 分支/tag；codex 继续在别的分支改，互不影响。需要更新时，等新快照 build 绿再 fast-forward 这个分支。

## 2. 服务器准备（腾讯云 CVM，Ubuntu 为例）

```bash
# Node 20/22 LTS + pm2 + nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm i -g pm2
```

## 3. 拉代码 + 配环境变量

```bash
git clone -b release/preview <repo-url> facewall && cd facewall
```

在服务器上建 `.env.production.local`（被 `.gitignore` 忽略，**不进仓库**）：

```
OPENAI_API_KEY=replace-with-real-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
AZURE_SPEECH_KEY=replace-with-real-azure-speech-key       # 没有就留空，走 Web Speech / 文本兜底
AZURE_SPEECH_REGION=eastasia
FACEWALL_PROMPT_STORE_PATH=/var/lib/facewall/active-prompt-overrides.json
```

> 不设 `FACEWALL_DEMO_MODE` / `FACEWALL_DEV_FAULTS`：生产环境 Demo Ops 面板不显示，故障注入自动关闭。

`FACEWALL_PROMPT_STORE_PATH` 建议指向持久云硬盘路径；不设置时默认写入项目目录 `outputs/active-prompt-overrides.json`。

## 4. 构建 + 用 pm2 常驻

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs   # 监听 127.0.0.1:3000
pm2 save                          # 存进程列表
pm2 startup                       # 按提示执行一行，开机自启
```

`ecosystem.config.cjs` 只让 Node 监听 `127.0.0.1:3000`，公网由 nginx 接。

## 5. nginx 反代（保留 query string + SSE）

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/facewall.conf
sudo vim /etc/nginx/conf.d/facewall.conf   # 改 server_name
sudo nginx -t && sudo systemctl reload nginx
```

两个要点已写在配置里：
- `proxy_pass` 不带路径 → 原样透传 `?theme=classic` / `?theme=figma`，绝不能被 rewrite 丢掉。
- `/api/report/generate-stream` 单独 `proxy_buffering off` → SSE 报告实时增量。

HTTPS（强烈建议，STT 麦克风非 localhost 必须 HTTPS）：

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 6. 发布后验收

```bash
# 契约冒烟打公网地址
npm run smoke:contract -- https://your-domain.com
npm run smoke:file-parse -- https://your-domain.com
```

浏览器人工核对：
- `https://your-domain.com/?theme=figma` → 正式视觉，**无** prompt 调试窗（给评审看）。
- `https://your-domain.com/?theme=classic` → **有**「Prompt 调试」窗（给产品调 prompt）。
- 在 classic 修改 Prompt 后点击「保存为全局 Prompt」，刷新 figma 主题并重新生成画像/题目/报告，应使用保存后的 Prompt。
- 用真实 LLM key 跑三种面试官风格，走到报告页；报告 SSE 增量正常、一键复制含「优化答案」「复盘报告」。

## 7. 更新已发布版本

```bash
cd facewall
git pull            # 只在新快照 build 绿后
npm ci
npm run build
pm2 reload facewall # 零停机重载
```

## 交给产品的一句话

> 调 prompt 用这个地址：`https://your-domain.com/?theme=classic`，页面上「Prompt 调试」四个框改完直接跑链路。
> 觉得效果可以就点「保存为全局 Prompt」；之后 `?theme=figma` 和服务重启后的默认 LLM 生成都会使用这份 Prompt。
