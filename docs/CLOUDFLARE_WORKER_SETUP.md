# Cloudflare Worker 定时任务配置指南

本指南介绍如何使用 Cloudflare Worker 替代 GitHub Actions 实现定时邮件提醒功能。

## 📋 目录

- [快速开始](#快速开始)
- [详细配置步骤](#详细配置步骤)
- [测试与验证](#测试与验证)
- [常见问题](#常见问题)
- [与 GitHub Actions 对比](#与-github-actions-对比)

---

## 🚀 快速开始

### 前置要求

- Cloudflare 账号（免费版即可）
- 已部署的 HomeBug 应用
- 已配置好邮件发送功能

### 3 步完成配置

#### 1. 生成密钥

```bash
openssl rand -hex 32
```

保存生成的密钥，后续步骤需要使用。

#### 2. 创建 Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 点击 **Create Application** → **Create Worker**
4. 命名为 `homebug-cron-worker`
5. 点击 **Deploy**

#### 3. 配置 Worker

##### 3.1 上传代码

1. 在 Worker 详情页，点击 **Quick Edit**
2. 删除默认代码，复制 `worker.js` 的内容
3. 点击 **Save and Deploy**

##### 3.2 配置环境变量

1. 进入 **Settings** → **Variables**
2. 添加以下环境变量：

| 变量名         | 值                              | 说明                           |
| -------------- | ------------------------------- | ------------------------------ |
| `CRON_SECRET`  | `<步骤1生成的密钥>`             | 用于认证的密钥                 |
| `API_BASE_URL` | `https://your-domain.pages.dev` | 你的应用域名（不要带尾部斜杠） |

3. 点击 **Save and Deploy**

##### 3.3 配置 Cron Trigger

1. 进入 **Triggers** 标签
2. 点击 **Add Cron Trigger**
3. 输入 Cron 表达式（例如：`0 1 * * *` 表示每天 UTC 1:00）
4. 点击 **Add Trigger**

**常用 Cron 表达式：**

| 表达式        | 说明            | 北京时间    |
| ------------- | --------------- | ----------- |
| `0 1 * * *`   | 每天 UTC 1:00   | 每天 9:00   |
| `0 9 * * *`   | 每天 UTC 9:00   | 每天 17:00  |
| `0 */6 * * *` | 每 6 小时       | -           |
| `0 0 * * 1`   | 每周一 UTC 0:00 | 每周一 8:00 |

---

## 📝 详细配置步骤

### 方法一：使用 Cloudflare Dashboard（推荐）

适合不熟悉命令行的用户。

#### 步骤 1：创建 Worker

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择你的账号
3. 点击左侧菜单 **Workers & Pages**
4. 点击 **Create Application**
5. 选择 **Create Worker**
6. 输入名称：`homebug-cron-worker`
7. 点击 **Deploy**

#### 步骤 2：编辑 Worker 代码

1. 在 Worker 详情页，点击 **Quick Edit** 按钮
2. 删除编辑器中的所有默认代码
3. 打开项目中的 `worker.js` 文件，复制全部内容
4. 粘贴到 Cloudflare 编辑器中
5. 点击右上角 **Save and Deploy**

#### 步骤 3：配置环境变量

1. 返回 Worker 详情页
2. 点击 **Settings** 标签
3. 找到 **Variables** 部分
4. 点击 **Add variable**

添加第一个变量：

- **Variable name**: `CRON_SECRET`
- **Value**: 粘贴你生成的密钥
- **Type**: 选择 **Encrypted**（加密存储）
- 点击 **Save**

添加第二个变量：

- **Variable name**: `API_BASE_URL`
- **Value**: 你的应用完整域名（例如：`https://homebug.uyoahz.cc.cd`）
- **Type**: 选择 **Text**
- 点击 **Save**

5. 点击页面底部 **Save and Deploy**

#### 步骤 4：配置 Cron Trigger

1. 点击 **Triggers** 标签
2. 找到 **Cron Triggers** 部分
3. 点击 **Add Cron Trigger**
4. 输入 Cron 表达式：`0 1 * * *`（每天 UTC 1:00，即北京时间 9:00）
5. 点击 **Add Trigger**

#### 步骤 5：同步密钥到应用

确保你的 HomeBug 应用也配置了相同的 `CRON_SECRET`：

1. 进入 Cloudflare Pages 项目
2. **Settings** → **Environment variables**
3. 添加或更新 `CRON_SECRET` 变量（与 Worker 中的值一致）
4. 重新部署应用

---

### 方法二：使用 Wrangler CLI

适合熟悉命令行的开发者。

#### 步骤 1：安装 Wrangler

```bash
npm install -g wrangler
```

#### 步骤 2：登录 Cloudflare

```bash
wrangler login
```

#### 步骤 3：配置环境变量

创建 `.dev.vars` 文件（本地测试用，不要提交到 Git）：

```bash
CRON_SECRET=your-secret-here
API_BASE_URL=https://your-domain.pages.dev
```

#### 步骤 4：本地测试

```bash
# 启动本地开发服务器
wrangler dev

# 在另一个终端测试手动触发
curl -X POST http://localhost:8787/trigger \
  -H "Authorization: Bearer your-secret-here"
```

#### 步骤 5：部署到 Cloudflare

```bash
# 部署 Worker
wrangler deploy

# 配置生产环境变量
wrangler secret put CRON_SECRET
# 输入你的密钥

wrangler secret put API_BASE_URL
# 输入你的应用域名
```

#### 步骤 6：配置 Cron Trigger

Cron Trigger 已在 `wrangler.toml` 中配置，部署后自动生效。

如需修改执行时间，编辑 `wrangler.toml`：

```toml
[triggers]
crons = ["0 1 * * *"]  # 修改为你需要的时间
```

然后重新部署：

```bash
wrangler deploy
```

---

## 🧪 测试与验证

### 1. 健康检查

访问 Worker URL 检查是否正常运行：

```bash
curl https://homebug-cron-worker.your-subdomain.workers.dev/health
```

预期响应：

```json
{
  "status": "ok",
  "service": "homebug-cron-worker",
  "timestamp": "2026-04-24T10:00:00.000Z",
  "version": "1.0.0"
}
```

### 2. 手动触发测试

使用 API 手动触发任务：

```bash
curl -X POST https://homebug-cron-worker.your-subdomain.workers.dev/trigger \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

预期响应（成功）：

```json
{
  "success": true,
  "data": {
    "skipped": false,
    "cronEnabled": true,
    "usersChecked": 1,
    "itemsChecked": 5,
    "notificationsSent": 1,
    "errors": []
  },
  "duration": 1234
}
```

### 3. 查看执行日志

#### 方法 1：Cloudflare Dashboard

1. 进入 Worker 详情页
2. 点击 **Logs** 标签
3. 选择 **Begin log stream**
4. 等待下次 Cron 触发或手动触发测试

#### 方法 2：Wrangler CLI

```bash
wrangler tail
```

### 4. 验证邮件发送

1. 确保你的用户账号已启用邮件通知
2. 等待 Cron 触发时间
3. 检查邮箱是否收到提醒邮件
4. 登录应用查看 **系统配置** → **Cron 日志**

---

## ❓ 常见问题

### Q1: Worker 部署后没有执行任务

**可能原因：**

1. Cron Trigger 未配置
2. 环境变量配置错误
3. Worker 代码有语法错误

**解决方法：**

1. 检查 **Triggers** 标签是否有 Cron Trigger
2. 检查 **Settings** → **Variables** 中的环境变量
3. 查看 **Logs** 标签的错误信息
4. 使用手动触发测试：`/trigger` 端点

### Q2: 手动触发返回 401 错误

**原因：** `CRON_SECRET` 不匹配

**解决方法：**

1. 检查 Worker 的 `CRON_SECRET` 环境变量
2. 检查应用的 `CRON_SECRET` 环境变量
3. 确保两者完全一致（包括大小写）
4. 重新部署 Worker 和应用

### Q3: API 调用超时

**原因：** 应用响应时间过长或网络问题

**解决方法：**

1. 检查应用是否正常运行
2. 检查 `API_BASE_URL` 是否正确
3. 查看应用的 Cron API 日志
4. 考虑优化邮件发送逻辑（减少 AI 调用）

### Q4: 收不到邮件

**可能原因：**

1. 邮件配置未正确设置
2. 用户未启用邮件通知
3. 没有需要提醒的库存

**解决方法：**

1. 在应用中测试邮件发送：**系统配置** → **测试邮件**
2. 检查用户设置中的 **邮件通知** 开关
3. 查看 Cron 日志中的 `itemsChecked` 和 `notificationsSent`
4. 检查邮件提供商（Resend/SMTP）的发送日志

### Q5: 如何修改执行时间？

**方法 1：Dashboard**

1. 进入 Worker 详情页
2. **Triggers** 标签
3. 删除现有 Cron Trigger
4. 添加新的 Cron Trigger

**方法 2：Wrangler CLI**

1. 编辑 `wrangler.toml` 中的 `crons` 配置
2. 运行 `wrangler deploy`

### Q6: Worker 免费版有什么限制？

Cloudflare Workers 免费版限制：

- 每天 100,000 次请求
- 每次执行最长 10ms CPU 时间（Cron 触发器除外）
- Cron 触发器每天最多执行 3 次

**对于邮件提醒任务：**

- ✅ 每天 1-3 次完全够用
- ✅ Cron 触发器没有 CPU 时间限制
- ✅ 免费版完全满足需求

如需更高频率，可升级到 [Workers Paid Plan](https://developers.cloudflare.com/workers/platform/pricing/)（$5/月）。

---

## 📊 与 GitHub Actions 对比

| 特性           | Cloudflare Worker   | GitHub Actions        |
| -------------- | ------------------- | --------------------- |
| **免费额度**   | 每天 100,000 请求   | 每月 2,000 分钟       |
| **执行频率**   | 免费版每天最多 3 次 | 无限制                |
| **冷启动**     | 极快（<1ms）        | 较慢（10-30s）        |
| **配置复杂度** | 简单                | 中等                  |
| **日志查看**   | Dashboard 实时查看  | 需要进入 Actions 页面 |
| **网络延迟**   | 全球边缘节点        | GitHub 服务器         |
| **可靠性**     | 非常高              | 高                    |
| **维护成本**   | 低                  | 低                    |

**推荐使用场景：**

- ✅ **Cloudflare Worker**: 每天 1-3 次定时任务，需要低延迟
- ✅ **GitHub Actions**: 需要更高频率（每小时/每 15 分钟），或需要复杂的 CI/CD 流程

---

## 🔧 高级配置

### 多环境部署

如果你有多个环境（开发、预览、生产），可以创建多个 Worker：

```bash
# 生产环境
wrangler deploy --env production

# 预览环境
wrangler deploy --env staging
```

在 `wrangler.toml` 中配置：

```toml
[env.production]
name = "homebug-cron-worker"
vars = { API_BASE_URL = "https://homebug.example.com" }

[env.staging]
name = "homebug-cron-worker-staging"
vars = { API_BASE_URL = "https://staging.homebug.example.com" }
```

### 自定义日志

在 `worker.js` 中添加更详细的日志：

```javascript
console.info("[Worker] 任务开始", {
  timestamp: new Date().toISOString(),
  apiUrl: env.API_BASE_URL,
});

console.info("[Worker] 任务完成", {
  duration: Date.now() - startTime,
  success: true,
});
```

### 错误通知

可以集成 Sentry 或其他错误监控服务：

```javascript
// 在 worker.js 中添加
if (!result.success) {
  // 发送错误通知到 Sentry/Slack/Discord
  await fetch("https://hooks.slack.com/services/YOUR/WEBHOOK/URL", {
    method: "POST",
    body: JSON.stringify({
      text: `❌ Cron 任务失败: ${result.error}`,
    }),
  });
}
```

---

## 📚 相关文档

- [Cloudflare Workers 官方文档](https://developers.cloudflare.com/workers/)
- [Cron Triggers 文档](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [HomeBug Cron API 文档](./CRON_SETUP.md)

---

## 🆘 获取帮助

如果遇到问题：

1. 查看 Worker 日志：Dashboard → Logs
2. 查看应用 Cron 日志：系统配置 → Cron 日志
3. 使用手动触发测试：`/trigger` 端点
4. 检查环境变量配置
5. 提交 Issue 到项目仓库

---

**祝你配置顺利！🎉**
