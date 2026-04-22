# AI 功能集成文档

## 概述

HomeBug 已集成 AI 智能识别功能，支持多个主流 AI 厂商，可以从商品图片中智能提取商品信息，大幅提升录入效率。

## 🌍 网络访问说明（重要）

### 中国大陆用户可以使用 OpenAI 吗？

**可以！** ✅

虽然中国大陆无法直接访问 OpenAI，但当你的应用部署在 **Cloudflare Pages** 上时：

```
中国大陆用户
    ↓ (访问你的域名，无需翻墙)
Cloudflare Pages (你的应用)
    ↓ (前端上传图片)
Cloudflare Workers (Edge Runtime)
    ↓ (Workers 可以访问 OpenAI)
OpenAI API (api.openai.com)
    ↓ (返回识别结果)
Cloudflare Workers
    ↓ (返回给前端)
中国大陆用户 (收到识别结果)
```

**关键点**：

- ✅ API 调用在 **Cloudflare Workers** 上完成，不在用户浏览器
- ✅ Cloudflare Workers 部署在全球边缘节点，可以访问 OpenAI
- ✅ 用户只需要能访问你的 Cloudflare 域名即可
- ✅ 用户体验无差异，感知不到 OpenAI 的存在

### 推荐部署方案

| 部署方式           | OpenAI 可用性 | 说明                           |
| ------------------ | ------------- | ------------------------------ |
| Cloudflare Pages   | ✅ 可用       | Workers 可以访问 OpenAI        |
| Vercel             | ✅ 可用       | Edge Functions 可以访问 OpenAI |
| 自建服务器（国内） | ❌ 不可用     | 需要翻墙或使用代理             |
| 自建服务器（国外） | ✅ 可用       | 服务器在国外可以访问           |

## 支持的 AI 厂商

### 1. OpenAI（推荐）⭐

- **官网**: https://platform.openai.com/
- **模型**: `gpt-4o-mini`
- **优势**: 识别准确度高，多模态能力强，生态成熟
- **价格**: 输入 $0.15/百万tokens，输出 $0.60/百万tokens
- **支持**: ✅ 图片识别
- **单次成本**: 约 $0.0004（约 ¥0.003）
- **网络**: ✅ **部署在 Cloudflare 上可直接调用，中国大陆用户可正常使用**

> 💡 **重要说明**：虽然中国大陆无法直接访问 OpenAI，但当你的应用部署在 Cloudflare Pages 上时，API 调用是在 Cloudflare Workers（Edge）上完成的，Workers 可以正常访问 OpenAI API。用户只需要能访问你的 Cloudflare 域名即可，无需翻墙。

### 2. Anthropic (Claude)

- **官网**: https://www.anthropic.com/
- **模型**: `claude-3-5-haiku-20241022`
- **优势**: 安全性高，理解能力强，识别准确
- **价格**: 输入 $0.80/百万tokens，输出 $4.00/百万tokens
- **支持**: ✅ 图片识别

### 3. 豆包（字节跳动）

- **官网**: https://www.volcengine.com/products/doubao
- **模型**: `doubao-pro-32k`
- **优势**: 国内访问快，多模态能力强
- **价格**: 按量计费
- **支持**: ✅ 图片识别

### 4. DeepSeek

- **官网**: https://platform.deepseek.com/
- **模型**: `deepseek-chat`
- **优势**: 性价比高，中文文本处理效果好
- **价格**: 输入 ¥0.001/千tokens，输出 ¥0.002/千tokens
- **支持**: ❌ **暂不支持图片识别**（仅文本对话）
- **说明**: DeepSeek 目前只提供文本模型，不支持视觉功能

### 5. 自定义（OpenAI 兼容）

- 支持任何兼容 OpenAI API 格式的服务
- 例如：本地部署的 Ollama、LM Studio 等
- **支持**: 取决于具体模型（需要支持视觉的模型）

## 配置步骤

### 推荐方案：OpenAI gpt-4o-mini

#### 1. 获取 API Key

1. 访问 https://platform.openai.com/api-keys
2. 注册并登录（需要国际信用卡）
3. 点击 **Create new secret key**
4. 复制 API Key（格式：`sk-proj-xxx`）
5. 充值至少 $5（新用户可能有免费额度）

> 💡 **提示**：注册 OpenAI 需要国际信用卡和非中国大陆手机号，但配置后中国大陆用户可以正常使用你的应用。

#### 2. 在系统中配置

1. 以管理员身份登录 HomeBug
2. 进入 **设置 → 系统配置**
3. 选择 **AI 配置** 选项卡
4. 配置以下参数：

| 配置项               | 值                          |
| -------------------- | --------------------------- |
| 是否启用 AI 功能     | ✅ 开启                     |
| AI 提供商            | openai                      |
| AI 模型名称          | gpt-4o-mini                 |
| AI API Key           | sk-proj-xxx（你的 API Key） |
| AI API Base URL      | 留空（或使用 AI Gateway）   |
| AI 温度参数          | 0.1                         |
| AI 最大输出 token 数 | 2000                        |
| AI 请求超时时间      | 30000                       |

5. 点击 **保存变更**

#### 2.1 可选：使用 Cloudflare AI Gateway（推荐）

Cloudflare AI Gateway 可以提供：

- ✅ 请求缓存，降低成本
- ✅ 请求日志和分析
- ✅ 更稳定的连接

配置步骤：

1. 访问 https://dash.cloudflare.com/
2. 进入 **AI → AI Gateway**
3. 创建新的 Gateway
4. 复制 Gateway URL（格式：`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai`）
5. 在系统配置中填写：
   - AI API Base URL：`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai`

### 替代方案：豆包（国内用户，无需翻墙）

如果无法注册 OpenAI（需要国际信用卡），推荐使用豆包：

1. 访问 https://console.volcengine.com/ark
2. 注册并实名认证（支持中国大陆手机号）
3. 创建推理接入点，选择支持视觉的模型
4. 获取 API Key
5. 在系统中配置：
   - AI 提供商：`doubao`
   - AI 模型名称：`doubao-pro-32k`
   - AI API Base URL：`https://ark.cn-beijing.volces.com/api/v3`

### 3. 测试 AI 识别

1. 进入 **囤囤鼠的库存** 页面
2. 点击 **新增物资**
3. 上传一张商品图片
4. 点击 **识别** 按钮
5. 等待 AI 识别完成（通常 2-5 秒）
6. 查看自动填充的商品信息

## AI 识别能力

AI 可以从商品图片中提取以下信息：

- ✅ **商品名称** - 自动识别商品全称
- ✅ **品牌** - 识别品牌名称
- ✅ **分类** - 智能判断商品类别（食品/日用品/洗护用品等）
- ✅ **规格** - 提取净含量（如 500ml、250g）
- ✅ **数量** - 识别包装数量
- ✅ **单位** - 识别单位（瓶、袋、盒等）
- ✅ **生产日期** - 提取生产日期（YYYY-MM-DD 格式）
- ✅ **保质期** - 提取保质期及单位（天/月/年）
- ✅ **生产厂家** - 识别生产厂家名称
- ✅ **原始文字** - 保存图片中的所有文字内容

## 降级策略

如果 AI 识别失败或未配置，系统会自动降级到浏览器端 Tesseract.js 进行识别：

1. **AI 未启用** → 直接使用 Tesseract.js
2. **AI 请求失败** → 自动降级到 Tesseract.js
3. **AI 超时** → 自动降级到 Tesseract.js
4. **AI 不支持图片** → 自动降级到 Tesseract.js

降级后会显示提示信息，但不影响正常使用。

## 成本估算

### OpenAI gpt-4o-mini

- 输入 tokens: ~1500（图片 + 提示词）
- 输出 tokens: ~300（JSON 结果）
- 单次成本: $0.15 × 1.5/1000 + $0.60 × 0.3/1000 = **$0.000405**（约 ¥0.003，0.3 分）

假设每天识别 10 张图片，每月成本约 **$0.12**（约 ¥0.90），非常经济实惠。

### Anthropic Claude

- 单次成本约 $0.002（约 ¥0.015，1.5 分）
- 每月 300 次约 $0.60（约 ¥4.5）

### 豆包

- 具体价格请查看火山引擎官网
- 通常与 OpenAI 相近

## 常见问题

### Q1: 为什么 DeepSeek 不能识别图片？

**A**: DeepSeek 目前只提供文本模型（deepseek-chat），不支持视觉功能。如果需要图片识别，请使用 OpenAI、Anthropic 或豆包。

### Q2: AI 识别速度慢怎么办？

**A**:

- 检查网络连接
- 尝试更换 AI 厂商（国内推荐豆包）
- 调整超时时间配置
- OpenAI 通常 2-5 秒完成识别

### Q3: AI 识别不准确怎么办？

**A**:

- 确保图片清晰，文字可见
- 避免反光和模糊
- 尝试更换模型（如 Claude）
- 手动修正识别结果后保存

### Q4: API Key 无效怎么办？

**A**:

- 检查 API Key 是否正确复制
- 确认 API Key 未过期
- 检查账户余额是否充足
- OpenAI 需要绑定信用卡并充值

### Q5: 如何关闭 AI 功能？

**A**:

- 进入系统配置 → AI 配置
- 将 "是否启用 AI 功能" 设置为关闭
- 系统会自动使用 Tesseract.js 识别

### Q6: 支持本地部署的 AI 模型吗？

**A**:

- 支持！选择 "自定义" 提供商
- 配置本地 API 端点（如 `http://localhost:11434/v1`）
- 确保模型支持 OpenAI 兼容的 API 格式
- 模型必须支持视觉功能（如 LLaVA、Qwen-VL 等）

## 隐私说明

- 图片数据仅在识别时发送到 AI 厂商
- 不会永久存储在 AI 厂商服务器
- 识别结果保存在您的数据库中
- 建议使用国内厂商（豆包）以保证数据安全

## 技术架构

```
用户上传图片
    ↓
前端压缩图片（<2MB）
    ↓
发送到 /api/items/ocr
    ↓
检查 AI 配置
    ↓
┌─────────────────┬─────────────────┐
│   AI 已启用     │   AI 未启用     │
│                 │                 │
│ 调用 AI 适配器  │ 返回 412 状态码 │
│ ↓               │ ↓               │
│ 提取结构化数据  │ 前端使用        │
│ ↓               │ Tesseract.js    │
│ 返回 JSON 结果  │                 │
└─────────────────┴─────────────────┘
    ↓
前端自动填充表单
```

## 更新日志

### v1.0.1 (2026-04-22)

- ⚠️ 标注 DeepSeek 不支持图片识别
- ✅ 推荐使用 OpenAI gpt-4o-mini
- ✅ 优化错误提示

### v1.0.0 (2026-04-22)

- ✅ 集成 OpenAI、Anthropic、豆包
- ✅ 支持智能提取商品信息
- ✅ 自动降级到 Tesseract.js
- ✅ 系统配置界面
- ✅ 完整的错误处理

## 反馈与支持

如有问题或建议，请提交 Issue 或 Pull Request。
