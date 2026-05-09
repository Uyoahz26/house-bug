# GitHub Actions Cron 故障排查指南

## 问题：Cron 任务没有在预定时间触发

### 可能的原因和解决方案

#### 1. GitHub Actions Scheduled Workflows 的已知限制 ⚠️

**问题**：GitHub Actions 的 scheduled workflows 不保证准时执行，通常会延迟 3-15 分钟，在高峰期可能延迟更久。

**解决方案**：

- 这是 GitHub 的限制，无法完全避免
- 如果需要精确定时，考虑使用外部 cron 服务（如 Cloudflare Workers Cron Triggers）

#### 2. Workflow 文件必须在默认分支上

**检查**：

```bash
# 确认当前分支
git branch --show-current

# 确认 workflow 文件已提交到 main/master 分支
git log --oneline -1 .github/workflows/cron.yml
```

**解决方案**：

- 确保 `.github/workflows/cron.yml` 已提交到 `main` 或 `master` 分支
- GitHub Actions 只会从默认分支读取 scheduled workflows

#### 3. Repository 必须有活动

**问题**：如果 repository 在 60 天内没有任何活动，GitHub 会自动禁用 scheduled workflows。

**解决方案**：

- 在 GitHub repository 页面检查 Actions 标签页
- 如果看到 "Workflows have been disabled"，点击 "Enable workflows" 按钮
- 或者进行一次 commit 来重新激活

#### 4. Secrets 配置检查

**检查步骤**：

1. 访问 GitHub repository 设置
2. 进入 `Settings` → `Secrets and variables` → `Actions`
3. 确认以下 secrets 已配置：
   - `CRON_SECRET`：与 Cloudflare Pages 环境变量中的 `CRON_SECRET` 一致
   - `PAGES_URL`：你的 Cloudflare Pages URL（如 `https://homebug.uyoahz.cc.cd`）

#### 5. 手动测试 Workflow

**立即测试**（不等待 cron 时间）：

1. 访问 GitHub repository
2. 进入 `Actions` 标签页
3. 选择 "Cron Job - SendMail" workflow
4. 点击 "Run workflow" 按钮
5. 选择分支（通常是 `main`）
6. 点击绿色的 "Run workflow" 按钮

这会立即触发 workflow，你可以查看日志来诊断问题。

#### 6. 查看 Workflow 运行历史

**检查步骤**：

1. 访问 `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`
2. 查看是否有 "Cron Job - SendMail" 的运行记录
3. 如果有失败的运行，点击查看详细日志

#### 7. Cron 表达式验证

当前配置：`30 3 * * 5`

- `30` = 分钟（30分）
- `3` = 小时（UTC 3点）
- `*` = 每月的任意一天
- `*` = 每个月
- `5` = 星期五（0=周日，5=周五）

**验证工具**：https://crontab.guru/#30_3_*_*_5

**时区转换**：

- UTC 03:30 = 北京时间 11:30（UTC+8）
- UTC 03:30 = 东京时间 12:30（UTC+9）

## 推荐的测试流程

### 步骤 1：手动触发测试

```bash
# 使用 curl 直接测试 API 端点
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  "https://homebug.uyoahz.cc.cd/api/cron?auto=1"
```

### 步骤 2：手动触发 GitHub Actions

在 GitHub Actions 页面使用 "Run workflow" 按钮手动触发。

### 步骤 3：等待下一个 Cron 时间

- 下次触发时间：每周五 UTC 03:30（北京时间 11:30）
- 预期延迟：3-15 分钟
- 实际触发时间可能在：UTC 03:30 - 03:45

### 步骤 4：检查执行日志

1. GitHub Actions 日志：查看 workflow 是否被触发
2. Cloudflare Pages 日志：查看 API 是否被调用
3. 数据库 `cron_logs` 表：查看任务执行记录

## 替代方案：使用 Cloudflare Workers Cron Triggers

如果 GitHub Actions 的延迟不可接受，可以考虑使用 Cloudflare Workers Cron Triggers：

### 优点：

- ✅ 更准时（通常在 1 分钟内触发）
- ✅ 与 Cloudflare Pages 集成更好
- ✅ 不受 GitHub repository 活动限制

### 缺点：

- ❌ 需要 Cloudflare Workers 付费计划（$5/月）
- ❌ 配置稍微复杂一些

### 配置方法：

参考 `docs/CRON_SETUP.md` 中的 Cloudflare Workers 部分。

## 常见错误和解决方案

### 错误 1：401 Unauthorized

**原因**：`CRON_SECRET` 不匹配
**解决**：确保 GitHub Secrets 中的 `CRON_SECRET` 与 Cloudflare Pages 环境变量一致

### 错误 2：404 Not Found

**原因**：`PAGES_URL` 配置错误
**解决**：检查 URL 格式，应该是 `https://your-domain.com`（不要带尾部斜杠）

### 错误 3：500 Internal Server Error

**原因**：API 端点内部错误
**解决**：

1. 检查 Cloudflare Pages 日志
2. 检查数据库连接
3. 检查邮件配置

### 错误 4：Workflow 没有出现在 Actions 列表

**原因**：workflow 文件语法错误或未提交到默认分支
**解决**：

1. 验证 YAML 语法：https://www.yamllint.com/
2. 确认文件已提交到 `main` 分支
3. 等待 1-2 分钟让 GitHub 识别新的 workflow

## 监控和告警

### 设置 GitHub Actions 失败通知

1. 访问 `Settings` → `Notifications`
2. 启用 "Actions" 通知
3. 选择通知方式（Email/Web）

### 检查执行历史

```sql
-- 查询最近的 cron 执行记录
SELECT
  executed_at,
  type,
  items_checked,
  notifications_sent,
  status,
  error_message
FROM cron_logs
ORDER BY executed_at DESC
LIMIT 10;
```

## 下一步

1. ✅ 提交更新后的 workflow 文件
2. ✅ 在 GitHub Actions 页面手动触发测试
3. ✅ 检查 Secrets 配置
4. ✅ 等待下一个 cron 时间（周五 11:30）
5. ✅ 查看执行日志确认成功

如果问题持续存在，考虑切换到 Cloudflare Workers Cron Triggers。
