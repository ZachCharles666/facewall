// PM2 配置：腾讯云自托管 Node 生产运行
// 用法（在服务器项目根目录）：
//   npm ci && npm run build && pm2 start ecosystem.config.cjs && pm2 save
// 说明：
//   - 只监听 127.0.0.1，由 nginx 反代对外暴露，Node 进程不直接暴露公网。
//   - 真实密钥放服务器上的 .env.production.local（被 .gitignore 忽略），不要写进本文件。
module.exports = {
  apps: [
    {
      name: "facewall",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000 --hostname 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      }
    }
  ]
};
