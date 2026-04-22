# 网络访问说明 - 中国大陆用户指南

## 🌍 核心问题

**Q: 中国大陆无法访问 OpenAI，部署在 Cloudflare 上可以用吗？**

**A: 可以！** ✅

## 工作原理

### 传统方式（不可行）

```
中国大陆用户浏览器
    ↓ (直接调用，被墙)
OpenAI API ❌
```

### Cloudflare 部署方式（可行）

```
中国大陆用户浏览器
    ↓ (访问你的域名，无需翻墙)
Cloudflare Pages (你的应用前端)
    ↓ (上传图片到后端 API)
Cloudflare Workers (Edge Runtime，运行在全球节点)
    ↓ (Workers 可以访问 OpenAI)
OpenAI API ✅
    ↓ (返回识别结果)
Cloudflare Workers
    ↓ (返回给前端)
中国大陆用户浏览器 (收到结果)
```

## 关键点

### 1. API 调用位置

- ❌ **不是**在用户浏览器中调用 OpenAI
- ✅ **而是**在 Cloudflare Workers 中调用 OpenAI
- ✅ Cloudflare Workers 部署在全球边缘节点，可以访问 OpenAI

### 2. 用户需要什么

- ✅ 能访问你的 Cloudflare Pages 域名（如 `homebug.pages.dev`）
- ✅ 仅此而已！无需翻墙，无需任何特殊配置

### 3. 你需要什么

- ✅ OpenAI API Key（注册需要国际信用卡）
- ✅ 部署在 Cloudflare Pages 上
- ✅ 在系统配置中填写 API Key

## 部署方案对比

| 部署方式             | OpenAI 可用性 | 中国大陆用户体验 | 说明                              |
| -------------------- | ------------- | ---------------- | --------------------------------- |
| **Cloudflare Pages** | ✅ 可用       | ✅ 正常使用      | Workers 在全球节点，可访问 OpenAI |
| **Vercel**           | ✅ 可用       | ✅ 正常使用      | Edge Functions 可访问 OpenAI      |
| **Netlify**          | ✅ 可用       | ✅ 正常使用      | Edge Functions 可访问 OpenAI      |
| 自建服务器（国内）   | ❌ 不可用     | ❌ 无法使用      | 需要服务器翻墙或使用代理          |
| 自建服务器（国外）   | ✅ 可用       | ✅ 正常使用      | 服务器在国外可以访问              |

## 推荐配置

### 方案 A: OpenAI + Cloudflare（推荐）⭐

**适用场景**：

- ✅ 你有国际信用卡，可以注册 OpenAI
- ✅ 部署在 Cloudflare Pages 上
- ✅ 中国大陆用户可以正常使用

**配置**：

```
AI 提供商: openai
AI 模型名称: gpt-4o-mini
AI API Key: sk-proj-xxx
AI API Base URL: (留空)
```

**优势**：

- ✅ 识别准确度最高
- ✅ 成本低（单次约 0.3 分）
- ✅ 中国大陆用户无感知

### 方案 B: OpenAI + Cloudflare AI Gateway（更优）

**额外优势**：

- ✅ 请求缓存，降低成本
- ✅ 请求日志和分析
- ✅ 更稳定的连接

**配置**：

1. 在 Cloudflare Dashboard 创建 AI Gateway
2. 获取 Gateway URL
3. 配置：

```
AI 提供商: openai
AI 模型名称: gpt-4o-mini
AI API Key: sk-proj-xxx
AI API Base URL: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai
```

### 方案 C: 豆包（无需国际信用卡）

**适用场景**：

- ✅ 没有国际信用卡
- ✅ 想用国内服务
- ✅ 部署在 Cloudflare Pages 上

**配置**：

```
AI 提供商: doubao
AI 模型名称: doubao-pro-32k
AI API Key: (从火山引擎获取)
AI API Base URL: https://ark.cn-beijing.volces.com/api/v3
```

**优势**：

- ✅ 注册简单（支持中国大陆手机号）
- ✅ 支持图片识别
- ✅ 国内服务，更稳定

## 常见问题

### Q1: 我在中国大陆，能用 OpenAI 吗？

**A**: 可以！只要你的应用部署在 Cloudflare Pages 上，API 调用在 Workers 中完成，用户无需翻墙。

### Q2: 用户需要翻墙吗？

**A**: 不需要！用户只需要能访问你的 Cloudflare 域名即可。

### Q3: 我需要翻墙注册 OpenAI 吗？

**A**: 是的，注册 OpenAI 需要：

- 国际信用卡
- 非中国大陆手机号
- 可能需要翻墙访问 OpenAI 官网

但注册后，你的用户无需翻墙即可使用。

### Q4: 如果我没有国际信用卡怎么办？

**A**: 使用豆包！

- 支持中国大陆手机号注册
- 支持支付宝/微信支付
- 同样支持图片识别

### Q5: Cloudflare Workers 访问 OpenAI 稳定吗？

**A**: 非常稳定！

- Cloudflare 在全球有 300+ 个数据中心
- Workers 会自动选择最近的节点
- 可以使用 AI Gateway 进一步提升稳定性

### Q6: 成本会增加吗？

**A**: 不会！

- Cloudflare Workers 免费额度：每天 100,000 次请求
- OpenAI API 按实际使用计费
- 使用 AI Gateway 还能通过缓存降低成本

### Q7: 如果 Cloudflare 被墙了怎么办？

**A**:

- Cloudflare 是全球 CDN 服务商，被墙可能性极低
- 可以绑定自己的域名
- 备选方案：使用豆包

## 测试验证

### 验证 Workers 可以访问 OpenAI

1. 部署应用到 Cloudflare Pages
2. 配置 OpenAI API Key
3. 在中国大陆网络环境下测试上传图片识别
4. 如果成功返回结果，说明配置正确

### 预期结果

```
✅ 用户上传图片
✅ 2-5 秒后返回识别结果
✅ 自动填充商品信息
✅ 无需翻墙，体验流畅
```

## 总结

| 问题                 | 答案                     |
| -------------------- | ------------------------ |
| 中国大陆用户能用吗？ | ✅ 能用                  |
| 需要翻墙吗？         | ❌ 不需要                |
| 需要国际信用卡吗？   | OpenAI 需要，豆包不需要  |
| 识别准确吗？         | ✅ 准确                  |
| 成本高吗？           | ❌ 很低（单次约 0.3 分） |
| 稳定吗？             | ✅ 稳定                  |

---

**结论**：部署在 Cloudflare Pages 上，使用 OpenAI 完全可行，中国大陆用户可以正常使用！🎉
