# AI 功能快速开始

## 5 分钟快速配置 AI 识别

### 步骤 1: 获取 OpenAI API Key（推荐）⭐

1. 访问 https://platform.openai.com/api-keys
2. 点击右上角 **Sign up** 注册（需要国际信用卡）
3. 完成注册后，进入 **API Keys** 页面
4. 点击 **Create new secret key**
5. 复制生成的 API Key（格式：`sk-proj-xxxxxxxxxxxxxxxx`）
6. 充值至少 $5（新用户可能有免费额度）

💡 **提示**: OpenAI gpt-4o-mini 识别准确度高，单次识别约 $0.0004（约 0.3 分）！

#### 替代方案：豆包（国内用户）

如果无法访问 OpenAI，可以使用豆包：

1. 访问 https://console.volcengine.com/ark
2. 注册并实名认证
3. 创建推理接入点，选择支持视觉的模型
4. 获取 API Key

### 步骤 2: 在 HomeBug 中配置

1. 以管理员身份登录 HomeBug
2. 点击左侧菜单 **设置**
3. 选择 **系统配置**
4. 点击 **AI 配置** 选项卡
5. 填写以下配置：

**OpenAI 配置（推荐）：**

```
是否启用 AI 功能: ✅ 开启
AI 提供商: openai
AI 模型名称: gpt-4o-mini
AI API Key: sk-proj-xxxxxxxxxxxxxxxx (粘贴你的 API Key)
AI API Base URL: (留空)
AI 温度参数: 0.1
AI 最大输出 token 数: 2000
AI 请求超时时间: 30000
```

**豆包配置（国内用户）：**

```
是否启用 AI 功能: ✅ 开启
AI 提供商: doubao
AI 模型名称: doubao-pro-32k
AI API Key: (粘贴你的 API Key)
AI API Base URL: https://ark.cn-beijing.volces.com/api/v3
AI 温度参数: 0.1
AI 最大输出 token 数: 2000
AI 请求超时时间: 30000
```

6. 点击 **保存变更**

### 步骤 3: 测试识别

1. 进入 **囤囤鼠的库存** 页面
2. 点击 **新增物资** 按钮
3. 点击 **选择图片** 或拖拽上传商品图片
4. 点击 **识别** 按钮
5. 等待 2-5 秒，AI 会自动填充：
   - ✅ 商品名称
   - ✅ 品牌
   - ✅ 分类
   - ✅ 规格
   - ✅ 数量和单位
   - ✅ 生产日期
   - ✅ 保质期
   - ✅ 生产厂家

6. 检查并修正识别结果（如有需要）
7. 点击 **保存** 完成录入

## 其他 AI 厂商配置

### Anthropic (Claude)

```
AI 提供商: anthropic
AI 模型名称: claude-3-5-haiku-20241022
AI API Key: sk-ant-xxxxxxxxxxxxxxxx
AI API Base URL: (留空)
```

### ⚠️ DeepSeek（不支持图片识别）

DeepSeek 目前只提供文本模型，**不支持图片识别功能**。如果需要 OCR 识别，请使用 OpenAI、Anthropic 或豆包。

## 常见问题

### Q: 识别速度慢怎么办？

**A**: OpenAI 通常 2-5 秒完成识别。如果超过 10 秒，检查：

- 网络连接是否正常
- API Key 是否有效
- 账户余额是否充足

### Q: 识别结果不准确？

**A**:

- 确保图片清晰，文字可见
- 尝试重新拍照，避免反光和模糊
- 手动修正识别结果后保存

### Q: 如何查看识别成本？

**A**:

- 登录 OpenAI 控制台
- 查看 **Usage** 页面
- 每次识别约 $0.0004（约 0.3 分）

### Q: 为什么不推荐 DeepSeek？

**A**:

- DeepSeek 目前只有文本模型，不支持图片识别
- 如果需要 OCR 功能，请使用 OpenAI、Anthropic 或豆包

### Q: 可以关闭 AI 功能吗？

**A**:

- 可以！在 AI 配置中关闭 "是否启用 AI 功能"
- 系统会自动使用免费的 Tesseract.js 识别

## 下一步

- 📖 查看 [完整 AI 集成文档](./AI_INTEGRATION.md)
- 🎯 了解 [AI 识别能力详解](./AI_INTEGRATION.md#ai-识别能力)
- 💰 查看 [成本估算](./AI_INTEGRATION.md#成本估算)
- 🔒 了解 [隐私说明](./AI_INTEGRATION.md#隐私说明)

---

**祝你使用愉快！** 🎉
