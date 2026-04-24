# Cloudflare Pages Cron 配置指南

使用 Cloudflare Pages 内置的 Worker 功能实现定时任务。

---

## 📋 前置要求

- ✅ 项目已部署到 Cloudflare Pages
- ✅ 已配置 AI 和邮件功能
- ✅ 有管理员权限

---

## 🚀 配置步骤

### 步骤 1: 生成 Cron Secret

在终端运行：

```bash
openssl rand -hex 32
```

复制输出的密钥，例如：`a1b2c3d4e5f6789...`

### 步骤 2: 配置环境变量

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入你的 Pages 项目
3. 点击 **Settings** → **Environment variables**
4. 添加以下环境变量：

   **生产环境（Production）**：

   ```
   变量名: CRON_SECRET
   变量值: <你生成的密钥>
   ```

   **可选 - 自定义域名**：

   ```
   变量名: PAGES_URL
   变量值: https://your-custom-domain.com
   ```

   如果不配置 `PAGES_URL`，系统会自动使用 `pages.dev` 域名。

5. 点击 **Save**

### 步骤 3: 部署项目

项目中已经包含了必要的文件：

- ✅ `functions/_worker.js` - Worker 代码（已创建）
- ✅ `wrangler.toml` - Cron 配置（已配置）

只需要重新部署项目：

```bash
npm run deploy
```

或者通过 Git 推送触发自动部署：

```bash
git add .
git commit -m "配置 Cron Triggers"
git push
```

### 步骤 4: 验证配置

部署完成后，在 Cloudflare Dashboard 中：

1. 进入你的 Pages 项目
2. 点击 **Functions** 标签
3. 查看是否显示 Cron Triggers
4. 应该能看到：`0 1 * * *`（每天 UTC 1:00）

---

## 🧪 测试执行

### 方法 1: 手动触发（推荐）

使用管理员账号登录后，直接访问：

```bash
curl -X POST https://your-domain.pages.dev/api/cron \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 方法 2: 使用 Cron Secret

```bash
curl -X POST https://your-domain.pages.dev/api/cron?auto=1 \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

### 方法 3: 查看日志

在 Cloudflare Dashboard 中：

1. 进入 Pages 项目
2. 点击 **Functions** → **Real-time Logs**
3. 等待下次 Cron 执行（或手动触发）
4. 查看日志输出

---

## ⚙️ 自定义执行时间

编辑 `wrangler.toml` 文件：

```toml
[triggers]
crons = ["0 1 * * *"]  # 修改这里
```

### 常用 Cron 表达式

| 表达式        | 说明               | 北京时间  |
| ------------- | ------------------ | --------- |
| `0 1 * * *`   | 每天 UTC 1:00      | 上午 9:00 |
| `0 9 * * *`   | 每天 UTC 9:00      | 下午 5:00 |
| `0 13 * * *`  | 每天 UTC 13:00     | 晚上 9:00 |
| `0 */6 * * *` | 每 6 小时          | -         |
| `0 0 * * 1`   | 每周一 UTC 0:00    | 上午 8:00 |
| `0 0 1 * *`   | 每月 1 号 UTC 0:00 | 上午 8:00 |

⚠️ **重要**：Cloudflare 使用 UTC 时区，中国是 UTC+8，需要减去 8 小时。

修改后重新部署：

```bash
npm run deploy
```

---

## 📊 查看执行历史

### 在 HomeBug 中查看

1. 登录 HomeBug
2. 进入 **设置 → 系统配置**
3. 滚动到底部查看 **Cron 执行日志**
4. 可以看到：
   - 执行时间
   - 检查的物品数
   - 发送的通知数
   - 执行状态
   - 错误信息（如果有）

### 在 Cloudflare 中查看

1. 进入 Pages 项目
2. 点击 **Functions** → **Real-time Logs**
3. 查看实时日志输出

---

## 🔧 故障排查

### 问题 1: Cron 没有执行

**检查清单**：

- [ ] `wrangler.toml` 中是否配置了 `[triggers]` 和 `crons`？
- [ ] `functions/_worker.js` 文件是否存在？
- [ ] 项目是否重新部署？
- [ ] 环境变量 `CRON_SECRET` 是否配置？

**解决方案**：

1. 确认所有文件都已提交并推送
2. 重新部署项目
3. 在 Cloudflare Dashboard 中检查 Functions 标签

### 问题 2: 执行了但没有发送邮件

**检查清单**：

- [ ] 邮件配置是否正确？
- [ ] 用户是否启用了邮件通知？
- [ ] 是否有需要提醒的物品？
- [ ] 查看 Cron 日志是否有错误？

**解决方案**：

1. 手动触发测试：`POST /api/cron`
2. 查看 HomeBug 的 Cron 日志
3. 检查邮件配置和用户设置

### 问题 3: 日志显示 "未配置 CRON_SECRET"

**解决方案**：

1. 在 Cloudflare Dashboard 中添加环境变量
2. 确保变量名是 `CRON_SECRET`（大写）
3. 重新部署项目

### 问题 4: 时间不对

**解决方案**：

1. 记住 Cloudflare 使用 UTC 时区
2. 中国时间 = UTC + 8 小时
3. 想要北京时间 9:00 → 设置 UTC 1:00
4. 修改 `wrangler.toml` 后重新部署

---

## 📝 配置文件说明

### functions/\_worker.js

这是 Cloudflare Pages 的 Advanced Mode Worker，包含两个主要函数：

1. **fetch()** - 处理 HTTP 请求，转发到 Next.js
2. **scheduled()** - 处理 Cron Triggers，定时调用 API

### wrangler.toml

配置文件，包含：

- `[triggers]` - Cron 表达式配置
- `[[d1_databases]]` - 数据库绑定
- 其他项目配置

---

## 🎯 最佳实践

### 1. 设置合理的执行时间

- **个人用户**：每天上午 9 点（`0 1 * * *`）
- **团队用户**：每天上午 8 点（`0 0 * * *`）
- **高频用户**：每 12 小时（`0 */12 * * *`）

### 2. 配置提前天数

在 HomeBug 系统设置中：

- **保守型**：提前 7 天提醒
- **积极型**：提前 3 天提醒
- **激进型**：提前 1 天提醒

### 3. 监控执行情况

- 定期查看 Cron 日志
- 确认邮件正常发送
- 关注错误信息

### 4. 测试后再启用

1. 先手动测试几次
2. 确认邮件内容正确
3. 再启用自动执行

---

## 🆘 需要帮助？

- 📖 查看 [完整文档](./CRON_SETUP.md)
- 🎭 查看 [AI 邮件文案](./AI_EMAIL_TIPS.md)
- 📧 查看 [邮件配置](./AI_INTEGRATION.md)

---

## ✅ 配置完成检查清单

- [ ] 生成了 CRON_SECRET
- [ ] 在 Cloudflare Pages 中配置了环境变量
- [ ] 项目已重新部署
- [ ] 在 Functions 标签中看到了 Cron Triggers
- [ ] 手动测试执行成功
- [ ] 收到了测试邮件
- [ ] 查看了 Cron 日志

全部完成？恭喜你！🎉 定时任务已经配置完成！

---

**祝你使用愉快！** 🚀
