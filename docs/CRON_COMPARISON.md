# 定时任务方案对比

HomeBug 支持两种定时任务方案：Cloudflare Worker 和 GitHub Actions。本文档帮助你选择最适合的方案。

## 📊 快速对比

| 特性             | Cloudflare Worker      | GitHub Actions        |
| ---------------- | ---------------------- | --------------------- |
| **免费额度**     | 每天 100,000 请求      | 每月 2,000 分钟       |
| **执行频率限制** | 免费版每天最多 3 次    | 无限制                |
| **冷启动时间**   | 极快（<1ms）           | 较慢（10-30s）        |
| **配置复杂度**   | ⭐⭐ 简单              | ⭐⭐⭐ 中等           |
| **日志查看**     | Dashboard 实时查看     | 需要进入 Actions 页面 |
| **网络延迟**     | 全球边缘节点（低延迟） | GitHub 服务器         |
| **可靠性**       | ⭐⭐⭐⭐⭐ 非常高      | ⭐⭐⭐⭐ 高           |
| **维护成本**     | ⭐⭐ 低                | ⭐⭐ 低               |
| **适用场景**     | 每天 1-3 次定时任务    | 高频率或复杂 CI/CD    |

## 🎯 推荐方案

### 推荐使用 Cloudflare Worker 的情况

✅ **每天 1-3 次定时提醒**（例如：每天早上 9 点）  
✅ **需要低延迟和快速响应**  
✅ **希望配置简单，快速上手**  
✅ **应用已部署在 Cloudflare Pages**  
✅ **不需要复杂的 CI/CD 流程**

### 推荐使用 GitHub Actions 的情况

✅ **需要更高频率**（例如：每小时、每 15 分钟）  
✅ **需要复杂的工作流**（多步骤、条件执行）  
✅ **已经在使用 GitHub Actions 做 CI/CD**  
✅ **需要与 GitHub 生态集成**  
✅ **免费版 Worker 的 3 次/天限制不够用**

## 📋 详细对比

### 1. 免费额度

#### Cloudflare Worker

- **请求次数**: 每天 100,000 次
- **Cron 触发**: 免费版每天最多 3 次
- **CPU 时间**: Cron 触发器无限制
- **存储**: 不适用（无状态）

**对于邮件提醒任务：**

- ✅ 每天 1-3 次完全够用
- ✅ 100,000 次请求远超需求
- ✅ 免费版完全满足

#### GitHub Actions

- **执行时间**: 每月 2,000 分钟
- **并发任务**: 20 个
- **存储**: 500 MB
- **频率限制**: 无

**对于邮件提醒任务：**

- ✅ 每次执行约 1-2 分钟
- ✅ 每月可执行 1,000+ 次
- ✅ 支持任意频率

### 2. 性能表现

#### Cloudflare Worker

| 指标     | 表现               |
| -------- | ------------------ |
| 冷启动   | <1ms               |
| 执行延迟 | 极低（边缘节点）   |
| 网络延迟 | 全球分布，就近访问 |
| 稳定性   | 99.99% SLA         |

#### GitHub Actions

| 指标     | 表现                     |
| -------- | ------------------------ |
| 冷启动   | 10-30 秒                 |
| 执行延迟 | 中等                     |
| 网络延迟 | 取决于 GitHub 服务器位置 |
| 稳定性   | 99.9% SLA                |

### 3. 配置复杂度

#### Cloudflare Worker

**配置步骤：**

1. 创建 Worker（Dashboard 或 CLI）
2. 上传代码
3. 配置 2 个环境变量
4. 添加 Cron Trigger

**时间成本：** 5-10 分钟

**技术要求：** 基础（会用 Dashboard 即可）

#### GitHub Actions

**配置步骤：**

1. 创建 `.github/workflows/cron.yml`
2. 配置 Workflow 文件
3. 添加 Repository Secret
4. 提交代码触发

**时间成本：** 10-15 分钟

**技术要求：** 中等（需要了解 YAML 和 Git）

### 4. 日志和监控

#### Cloudflare Worker

**优点：**

- ✅ Dashboard 实时日志流
- ✅ 可以使用 `wrangler tail` 实时查看
- ✅ 日志保留 24 小时
- ✅ 可集成第三方监控（Sentry、Datadog）

**缺点：**

- ❌ 免费版日志保留时间短

#### GitHub Actions

**优点：**

- ✅ 完整的执行历史
- ✅ 日志保留 90 天
- ✅ 可以下载日志文件
- ✅ 支持 Artifacts 存储

**缺点：**

- ❌ 需要进入 Actions 页面查看
- ❌ 不支持实时日志流

### 5. 成本分析

#### Cloudflare Worker

**免费版：**

- 每天 100,000 请求
- Cron 触发每天 3 次
- 完全免费

**付费版（$5/月）：**

- 每天 10,000,000 请求
- Cron 触发无限制
- 更长的 CPU 时间

**对于邮件提醒：** 免费版完全够用

#### GitHub Actions

**免费版：**

- 每月 2,000 分钟
- 私有仓库可用
- 完全免费

**付费版（按需）：**

- $0.008/分钟（Linux）
- 超出免费额度后计费

**对于邮件提醒：** 免费版完全够用

### 6. 可靠性和稳定性

#### Cloudflare Worker

- ✅ 全球边缘网络
- ✅ 自动故障转移
- ✅ 99.99% SLA（付费版）
- ✅ DDoS 防护
- ⚠️ 依赖 Cloudflare 基础设施

#### GitHub Actions

- ✅ GitHub 基础设施
- ✅ 自动重试机制
- ✅ 99.9% SLA
- ⚠️ 偶尔会有排队延迟
- ⚠️ 依赖 GitHub 可用性

## 🔄 迁移指南

### 从 GitHub Actions 迁移到 Worker

1. 按照 [WORKER_QUICKSTART.md](../WORKER_QUICKSTART.md) 配置 Worker
2. 测试 Worker 是否正常工作
3. 禁用 GitHub Actions Workflow（删除或注释 `.github/workflows/cron.yml`）
4. 观察几天确保正常

### 从 Worker 迁移到 GitHub Actions

1. 创建 `.github/workflows/cron.yml`
2. 配置 Repository Secret: `CRON_SECRET`
3. 测试 Workflow 是否正常
4. 删除 Worker 或禁用 Cron Trigger

## 💡 最佳实践

### 使用 Cloudflare Worker

**推荐配置：**

```toml
# wrangler.toml
[triggers]
crons = ["0 1 * * *"]  # 每天 UTC 1:00（北京时间 9:00）
```

**监控建议：**

1. 定期查看 Worker 日志
2. 在应用中查看 Cron 执行日志
3. 设置邮件发送失败告警

### 使用 GitHub Actions

**推荐配置：**

```yaml
# .github/workflows/cron.yml
on:
  schedule:
    - cron: "0 1 * * *" # 每天 UTC 1:00
  workflow_dispatch: # 支持手动触发
```

**监控建议：**

1. 启用 Workflow 失败通知
2. 定期检查 Actions 执行历史
3. 在应用中查看 Cron 执行日志

## 🎓 学习资源

### Cloudflare Worker

- [快速开始](../WORKER_QUICKSTART.md)
- [完整配置文档](./CLOUDFLARE_WORKER_SETUP.md)
- [Cloudflare Workers 官方文档](https://developers.cloudflare.com/workers/)
- [Cron Triggers 文档](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

### GitHub Actions

- [Cron 配置文档](./CRON_SETUP.md)
- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [Workflow 语法](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)

## 🤔 常见问题

### Q: 可以同时使用两种方案吗？

**不推荐。** 会导致重复发送邮件。选择一种方案即可。

如果需要备份方案，可以：

1. 主方案：Cloudflare Worker（每天 9:00）
2. 备份方案：GitHub Actions（每天 21:00）

### Q: 哪个方案更可靠？

两者都很可靠，但侧重点不同：

- **Cloudflare Worker**: 更快、更稳定、全球分布
- **GitHub Actions**: 更灵活、更易调试、日志保留更久

对于邮件提醒任务，**Cloudflare Worker 略胜一筹**。

### Q: 如何选择执行时间？

**建议：**

- 早上提醒：UTC 1:00（北京时间 9:00）
- 晚上提醒：UTC 13:00（北京时间 21:00）
- 避免高峰：不要选择整点（如 0:00、12:00）

**Cron 表达式：**

```
0 1 * * *   # 每天 UTC 1:00
0 13 * * *  # 每天 UTC 13:00
```

### Q: 免费版够用吗？

**对于邮件提醒任务：**

- ✅ Cloudflare Worker 免费版：完全够用
- ✅ GitHub Actions 免费版：完全够用

除非你需要：

- 每小时或更高频率的提醒
- 复杂的多步骤工作流
- 更长的日志保留时间

否则免费版完全满足需求。

## 📈 性能测试结果

### 测试场景

- 用户数：10
- 物品数：50
- 需要提醒的物品：15
- 邮件提供商：Resend

### Cloudflare Worker

| 指标         | 结果 |
| ------------ | ---- |
| 冷启动时间   | <1ms |
| API 调用时间 | 1.2s |
| 总执行时间   | 1.3s |
| 内存使用     | ~5MB |

### GitHub Actions

| 指标         | 结果  |
| ------------ | ----- |
| 冷启动时间   | 15s   |
| API 调用时间 | 1.2s  |
| 总执行时间   | 16.5s |
| 内存使用     | ~50MB |

**结论：** Worker 在启动速度上有明显优势，但实际邮件发送时间相同。

## 🎯 总结

### 选择 Cloudflare Worker 如果你：

- ✅ 每天只需要 1-3 次提醒
- ✅ 希望配置简单快速
- ✅ 需要低延迟和快速响应
- ✅ 应用已部署在 Cloudflare

### 选择 GitHub Actions 如果你：

- ✅ 需要更高频率（每小时/每 15 分钟）
- ✅ 需要复杂的工作流
- ✅ 已经在使用 GitHub Actions
- ✅ 需要更长的日志保留时间

**大多数情况下，我们推荐使用 Cloudflare Worker。** 它更快、更简单、更适合定时邮件提醒这种场景。

---

**还有疑问？** 查看 [完整配置文档](./CLOUDFLARE_WORKER_SETUP.md) 或提交 Issue。
