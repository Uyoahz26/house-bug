# AI 识别常见错误及解决方案

## 错误 1: 配额不足 (insufficient_quota)

### 错误信息

```json
{
  "error": "OpenAI 账户余额不足，请充值后重试。或切换到豆包/关闭 AI 功能使用免费识别。",
  "code": "INSUFFICIENT_QUOTA"
}
```

### 原因

- ❌ OpenAI 账户余额为 $0
- ❌ 免费额度已用完
- ❌ 没有绑定付款方式

### 解决方案

#### 方案 A: 充值 OpenAI（推荐）

1. 访问 https://platform.openai.com/settings/organization/billing
2. 点击 **Add payment method**
3. 绑定国际信用卡
4. 充值至少 **$5**（建议 $10）
5. 等待 1-2 分钟生效
6. 重新测试

**成本参考**：

- $5 可识别约 12,500 张图片
- $10 可识别约 25,000 张图片
- 单次识别约 $0.0004（0.3 分）

#### 方案 B: 切换到豆包

1. 进入 **设置 → 系统配置 → AI 配置**
2. 修改配置：
   ```
   AI 提供商: doubao
   AI 模型名称: doubao-pro-32k
   AI API Key: (从火山引擎获取)
   AI API Base URL: https://ark.cn-beijing.volces.com/api/v3
   ```
3. 保存并测试

**豆包注册**：

- 访问 https://console.volcengine.com/ark
- 支持中国大陆手机号
- 支持支付宝/微信支付

#### 方案 C: 使用免费识别

1. 进入 **设置 → 系统配置 → AI 配置**
2. 关闭 **是否启用 AI 功能**
3. 系统自动使用 Tesseract.js（免费，但准确度较低）

---

## 错误 2: 速率限制 (rate_limit)

### 错误信息

```json
{
  "error": "OpenAI API 请求过于频繁，请稍后重试。",
  "code": "RATE_LIMIT"
}
```

### 原因

- ❌ 短时间内请求过多
- ❌ 超过了 OpenAI 的速率限制

### 解决方案

#### 立即解决

1. 等待 1-2 分钟后重试
2. 避免连续快速点击识别按钮

#### 长期解决

1. 使用 Cloudflare AI Gateway（提供缓存和速率控制）
2. 升级 OpenAI 账户等级（提高速率限制）
3. 在代码中添加请求队列和重试机制

---

## 错误 3: API Key 无效 (invalid_api_key)

### 错误信息

```json
{
  "error": "AI API Key 无效，请检查配置。",
  "code": "INVALID_API_KEY"
}
```

### 原因

- ❌ API Key 输入错误
- ❌ API Key 已过期或被删除
- ❌ API Key 权限不足

### 解决方案

1. 检查 API Key 格式：
   - OpenAI: `sk-proj-xxxxxxxxxxxxxxxx`
   - Anthropic: `sk-ant-xxxxxxxxxxxxxxxx`
   - 豆包: 从火山引擎获取

2. 重新生成 API Key：
   - 访问对应平台的 API Keys 页面
   - 删除旧的 Key
   - 创建新的 Key
   - 更新系统配置

3. 检查 API Key 权限：
   - 确保 Key 有访问模型的权限
   - 确保账户状态正常

---

## 错误 4: 不支持的提供商 (unsupported_provider)

### 错误信息

```json
{
  "error": "DeepSeek 暂不支持图片识别功能，请使用 OpenAI、Anthropic 或豆包。",
  "code": "UNSUPPORTED_PROVIDER"
}
```

### 原因

- ❌ 选择了不支持视觉功能的 AI 提供商
- ❌ DeepSeek 只支持文本，不支持图片

### 解决方案

切换到支持视觉的 AI 提供商：

| 提供商    | 支持图片 | 推荐模型                  |
| --------- | -------- | ------------------------- |
| OpenAI    | ✅       | gpt-4o-mini               |
| Anthropic | ✅       | claude-3-5-haiku-20241022 |
| 豆包      | ✅       | doubao-pro-32k            |
| DeepSeek  | ❌       | -                         |

---

## 错误 5: 网络超时 (timeout)

### 错误信息

```json
{
  "error": "AI 识别失败: 请求超时",
  "code": "AI_OCR_ERROR"
}
```

### 原因

- ❌ 网络连接不稳定
- ❌ AI API 响应慢
- ❌ 图片过大

### 解决方案

1. **检查网络连接**
   - 确保服务器可以访问 AI API
   - 测试网络延迟

2. **增加超时时间**
   - 进入系统配置
   - 将 **AI 请求超时时间** 从 30000 增加到 60000（60秒）

3. **优化图片大小**
   - 系统已自动压缩到 2MB
   - 如果仍然超时，可以进一步压缩

4. **使用 AI Gateway**
   - Cloudflare AI Gateway 可以提供更稳定的连接
   - 配置 AI API Base URL 为 Gateway 地址

---

## 错误 6: 图片格式错误 (invalid_image_data)

### 错误信息

```json
{
  "error": "图片数据格式不正确。",
  "code": "INVALID_IMAGE_DATA"
}
```

### 原因

- ❌ 图片格式不支持
- ❌ Base64 编码错误
- ❌ 图片损坏

### 解决方案

1. **检查图片格式**
   - 支持：JPG、PNG、WebP
   - 不支持：GIF、BMP、TIFF

2. **重新上传图片**
   - 使用其他图片测试
   - 确保图片未损坏

3. **检查图片大小**
   - 系统会自动压缩到 2MB
   - 如果图片过大，手动压缩后再上传

---

## 错误 7: 服务端 OCR 未配置 (server_ocr_not_configured)

### 错误信息

```json
{
  "error": "服务端 OCR 未配置，请使用浏览器端识别。",
  "code": "SERVER_OCR_NOT_CONFIGURED"
}
```

### 原因

- ❌ AI 功能未启用
- ❌ 没有配置 AI API Key

### 解决方案

1. 进入 **设置 → 系统配置 → AI 配置**
2. 开启 **是否启用 AI 功能**
3. 选择 AI 提供商
4. 填写 API Key
5. 保存配置

或者：

- 系统会自动使用 Tesseract.js 进行识别
- 无需任何配置，完全免费

---

## 快速诊断流程

```
遇到错误
    ↓
查看错误代码
    ↓
┌─────────────────────────────────────┐
│ INSUFFICIENT_QUOTA → 充值或切换提供商 │
│ RATE_LIMIT → 等待后重试              │
│ INVALID_API_KEY → 检查 API Key       │
│ UNSUPPORTED_PROVIDER → 切换提供商    │
│ TIMEOUT → 增加超时时间               │
│ INVALID_IMAGE_DATA → 检查图片格式    │
│ SERVER_OCR_NOT_CONFIGURED → 配置 AI  │
└─────────────────────────────────────┘
    ↓
按照对应方案解决
    ↓
重新测试
```

---

## 获取帮助

如果以上方案都无法解决问题：

1. 查看浏览器控制台错误信息
2. 查看服务器日志
3. 检查 AI 提供商的状态页面
4. 提交 Issue 并附上：
   - 错误信息
   - AI 提供商
   - 配置信息（隐藏 API Key）
   - 复现步骤

---

## 相关文档

- [AI 功能集成文档](./AI_INTEGRATION.md)
- [网络访问说明](./NETWORK_ACCESS.md)
- [AI 快速开始](./AI_QUICKSTART.md)
