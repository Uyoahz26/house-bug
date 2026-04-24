# Cron 定时任务配置

## 快速配置（3 步）

### 1. 生成密钥

```bash
openssl rand -hex 32
```

### 2. 配置环境变量

在 Cloudflare Dashboard → Pages 项目 → Settings → Environment variables 添加：

```
CRON_SECRET = <你生成的密钥>
```

### 3. 部署

```bash
npm run deploy
```

完成！每天 UTC 1:00（北京时间 9:00）自动执行。

---

## 自定义执行时间

编辑 `wrangler.toml` 中的 `crons` 配置：

```toml
[triggers]
crons = ["0 1 * * *"]  # 每天凌晨 1 点（UTC）
```

常用时间：

- `0 1 * * *` - 每天 UTC 1:00（北京 9:00）
- `0 9 * * *` - 每天 UTC 9:00（北京 17:00）
- `0 */6 * * *` - 每 6 小时
- `0 0 * * 1` - 每周一凌晨

---

## 测试

手动触发测试：

```bash
curl -X POST https://your-domain.pages.dev/api/cron?auto=1 \
  -H "x-cron-secret: YOUR_SECRET"
```

---

## 查看日志

在 Cloudflare Dashboard → Pages 项目 → Functions → Logs 查看执行日志。
