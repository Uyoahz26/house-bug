# 定时任务配置

## 快速配置（3 步）

### 1. 生成密钥

```bash
openssl rand -hex 32
```

### 2. 配置 GitHub Secrets

在 GitHub 仓库 → Settings → Secrets and variables → Actions 添加：

- `CRON_SECRET` = 你的密钥
- `PAGES_URL` = `https://homebug.uyoahz.cc.cd`

### 3. 配置 Cloudflare Pages

在 Cloudflare Dashboard → Pages 项目 → Settings → Environment variables 添加：

- `CRON_SECRET` = 相同的密钥

## 完成！

每天 UTC 1:00（北京时间 9:00）自动发送邮件。

## 手动测试

GitHub → Actions → Cron Job - 库存提醒 → Run workflow

## 修改时间

编辑 `.github/workflows/cron.yml`：

```yaml
- cron: "0 9 * * *" # 改为 UTC 9:00（北京 17:00）
```
