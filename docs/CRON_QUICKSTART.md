# 定时任务快速开始 ⏰

5 分钟配置定时发送库存提醒邮件！

---

## 🚀 最快方案：GitHub Actions（推荐新手）

### 步骤 1: 生成密钥

```bash
# 在终端运行
openssl rand -hex 32
```

复制输出的密钥，例如：`a1b2c3d4e5f6...`

### 步骤 2: 配置 GitHub Secrets

1. 进入你的 GitHub 仓库
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**
4. 添加两个 Secret：

   **Secret 1:**

   ```
   Name: CRON_SECRET
   Value: <刚才生成的密钥>
   ```

   **Secret 2:**

   ```
   Name: PAGES_URL
   Value: https://your-domain.pages.dev
   ```

### 步骤 3: 配置 Pages 环境变量

1. 访问 Cloudflare Dashboard
2. 进入你的 Pages 项目
3. 点击 **Settings** → **Environment variables**
4. 添加环境变量：
   ```
   CRON_SECRET = <与 GitHub 相同的密钥>
   ```

### 步骤 4: 启用工作流

工作流文件已经创建在 `.github/workflows/cron.yml`，会自动执行！

### 步骤 5: 测试

1. 进入 GitHub 仓库的 **Actions** 标签
2. 选择 **Cron Job - 库存提醒**
3. 点击 **Run workflow** 手动触发
4. 查看执行日志

✅ **完成！** 每天 UTC 1:00（北京时间 9:00）会自动执行。

---

## ⭐ 进阶方案：Cloudflare Worker Cron

### 自动配置（推荐）

```bash
npm run cron:setup
```

按照提示操作即可！

### 手动配置

#### 1. 生成密钥

```bash
openssl rand -hex 32
```

#### 2. 部署 Worker

```bash
cd workers
wrangler deploy
```

#### 3. 配置环境变量

```bash
# 配置 CRON_SECRET
wrangler secret put CRON_SECRET
# 输入你生成的密钥

# 配置 PAGES_URL
wrangler secret put PAGES_URL
# 输入你的 Pages 域名
```

#### 4. 在 Pages 中配置

在 Cloudflare Dashboard 的 Pages 项目中添加环境变量：

```
CRON_SECRET = <相同的密钥>
```

#### 5. 查看日志

```bash
npm run cron:logs
```

---

## 🌐 最简单方案：Cron-job.org

### 步骤 1: 注册

访问 https://cron-job.org/en/ 并注册账号。

### 步骤 2: 生成密钥

```bash
openssl rand -hex 32
```

### 步骤 3: 配置 Pages

在 Cloudflare Pages 中添加环境变量：

```
CRON_SECRET = <你的密钥>
```

### 步骤 4: 创建 Cron Job

1. 在 Cron-job.org 点击 **Create cronjob**
2. 填写：
   ```
   Title: HomeBug 库存提醒
   URL: https://your-domain.pages.dev/api/cron?auto=1
   Schedule: 每天 01:00（选择你的时区）
   ```
3. 点击 **Advanced** 添加 Header：
   ```
   Header Name: x-cron-secret
   Header Value: <你的密钥>
   ```
4. 点击 **Create**

### 步骤 5: 测试

点击 **Execute now** 测试执行。

---

## ✅ 验证配置

### 1. 检查系统设置

1. 登录 HomeBug
2. 进入 **设置 → 系统配置**
3. 确认：
   - `cron.enabled = 1`
   - `cron.expression = 0 1 * * *`
   - `cron.days_before = 7`

### 2. 手动测试

```bash
# 使用管理员 Token
curl -X POST https://your-domain.pages.dev/api/cron \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# 或使用 Cron Secret
curl -X POST https://your-domain.pages.dev/api/cron?auto=1 \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

### 3. 查看日志

在 HomeBug 的 **设置 → 系统配置** 中查看 Cron 执行日志。

---

## 📅 自定义执行时间

### Cron 表达式格式

```
分 时 日 月 周
* * * * *
```

### 常用示例

| 表达式        | 说明          |
| ------------- | ------------- |
| `0 1 * * *`   | 每天凌晨 1 点 |
| `0 9 * * *`   | 每天上午 9 点 |
| `0 */6 * * *` | 每 6 小时一次 |
| `0 0 * * 1`   | 每周一凌晨    |
| `0 0 1 * *`   | 每月 1 号凌晨 |

⚠️ **时区注意**：

- GitHub Actions 和 Cloudflare Worker 使用 UTC 时区
- 中国（UTC+8）需要减去 8 小时
- 想要北京时间 9:00 → 设置为 `0 1 * * *`（UTC 1:00）

---

## 🆘 常见问题

### Q: 没有收到邮件？

**A**: 检查：

1. ✅ Cron 任务是否执行？
2. ✅ 邮件配置是否正确？
3. ✅ 用户是否启用邮件通知？
4. ✅ 是否有需要提醒的物品？

### Q: 如何查看执行日志？

**A**:

- **GitHub Actions**: 在 Actions 标签查看
- **Worker Cron**: `npm run cron:logs`
- **Cron-job.org**: 在 Web 界面查看
- **HomeBug**: 设置 → 系统配置 → Cron 日志

### Q: 如何修改执行时间？

**A**:

- **GitHub Actions**: 修改 `.github/workflows/cron.yml`
- **Worker Cron**: 修改 `workers/wrangler.toml`
- **外部服务**: 在 Web 界面修改

---

## 📚 更多信息

- [完整配置指南](./CRON_SETUP.md)
- [AI 邮件文案功能](./AI_EMAIL_TIPS.md)
- [邮件配置指南](./AI_INTEGRATION.md)

---

**祝你使用愉快！** 🎉
