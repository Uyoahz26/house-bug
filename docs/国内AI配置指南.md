# 国内 AI 配置指南（快速版）

## 🎯 推荐方案

### 方案一：阿里通义千问（最便宜）⭐⭐⭐⭐⭐

**月成本**：¥3-6（300次识别）  
**优势**：最便宜、识别准确、阿里云生态

#### 配置步骤

1. 注册：https://dashscope.aliyun.com/
2. 获取 API Key：https://dashscope.console.aliyun.com/apiKey
3. 充值：¥10-50（支付宝）
4. 系统配置：
   ```
   AI 启用: ✅ 开启
   AI 提供商: custom
   AI 模型名称: qwen-vl-plus
   AI API Key: sk-xxxxxxxxxxxxxxxx
   AI API Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
   AI 温度: 0.1
   AI 最大 Token: 2000
   AI 超时时间: 30000
   ```

---

### 方案二：MiniMax（性价比高）⭐⭐⭐⭐⭐

**月成本**：¥4.5-9（300次识别）  
**优势**：性价比高、API 简单、新用户友好

#### 配置步骤

1. 注册：https://www.minimaxi.com/
2. 获取 API Key：https://www.minimaxi.com/user-center/basic-information/interface-key
3. 充值：¥10-50（支付宝/微信）
4. 系统配置：
   ```
   AI 启用: ✅ 开启
   AI 提供商: custom
   AI 模型名称: abab6.5-chat
   AI API Key: xxxxxxxxxxxxxxxx
   AI API Base URL: https://api.minimax.chat/v1
   AI 温度: 0.1
   AI 最大 Token: 2000
   AI 超时时间: 30000
   ```

---

### 方案三：腾讯混元（最稳定）⭐⭐⭐⭐⭐

**月成本**：¥6-12（300次识别）  
**优势**：稳定性高、腾讯云生态、服务好

#### 配置步骤

1. 注册：https://cloud.tencent.com/product/hunyuan
2. 获取 API Key：腾讯云控制台 → 混元服务 → 创建密钥
3. 充值：¥10-50（微信/支付宝）
4. 系统配置：
   ```
   AI 启用: ✅ 开启
   AI 提供商: custom
   AI 模型名称: hunyuan-vision
   AI API Key: xxxxxxxxxxxxxxxx
   AI API Base URL: https://api.hunyuan.cloud.tencent.com/v1
   AI 温度: 0.1
   AI 最大 Token: 2000
   AI 超时时间: 30000
   ```

---

### 方案四：智谱 GLM（新用户送 ¥18）⭐⭐⭐⭐⭐

**月成本**：¥15-30（300次识别）  
**优势**：新用户赠送 ¥18、识别准确度高

#### 配置步骤

1. 注册：https://open.bigmodel.cn/
2. 获取 API Key：https://open.bigmodel.cn/usercenter/apikeys
3. 充值：新用户自动赠送 ¥18
4. 系统配置：
   ```
   AI 启用: ✅ 开启
   AI 提供商: custom
   AI 模型名称: glm-4v
   AI API Key: xxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx
   AI API Base URL: https://open.bigmodel.cn/api/paas/v4
   AI 温度: 0.1
   AI 最大 Token: 2000
   AI 超时时间: 30000
   ```

---

## 📊 价格对比表

| 厂商       | 单次成本  | 月成本（300次） | 年成本（3600次） | 免费额度 |
| ---------- | --------- | --------------- | ---------------- | -------- |
| 阿里通义   | ¥0.01     | ¥3              | ¥36              | ✅ 有    |
| MiniMax    | ¥0.015    | ¥4.5            | ¥54              | ✅ 有    |
| 腾讯混元   | ¥0.02     | ¥6              | ¥72              | ✅ 有    |
| 百度文心   | ¥0.02     | ¥6              | ¥72              | ✅ 有    |
| 讯飞星火   | ¥0.02     | ¥6              | ¥72              | ✅ 有    |
| 智谱 GLM   | ¥0.05     | ¥15             | ¥180             | ✅ ¥18   |
| 字节豆包   | ¥0.02     | ¥6              | ¥72              | ✅ 有    |
| **OpenAI** | **¥0.02** | **¥6.5**        | **¥78**          | ❌ 无    |

**结论**：阿里通义千问最便宜，比 OpenAI 便宜 54%！

---

## 🚀 快速测试

### 1. 配置完成后

进入：**设置 → 系统配置 → AI 配置**

### 2. 测试识别

1. 进入物品管理页面
2. 点击"添加物品"
3. 上传商品图片（如：牛奶盒、零食包装）
4. 点击"识别"按钮
5. 查看识别结果

### 3. 预期结果

系统会自动识别并填充：

- ✅ 商品名称
- ✅ 品牌
- ✅ 分类
- ✅ 规格
- ✅ 生产日期
- ✅ 保质期

---

## ⚠️ 常见问题

### Q1: 配置后识别失败？

**A**: 检查以下几点：

1. AI 启用是否开启
2. API Key 是否正确（注意不要有空格）
3. API Base URL 是否正确
4. 账户是否有余额
5. 网络是否正常

### Q2: 提示"insufficient_quota"？

**A**: 账户余额不足，需要充值。

### Q3: 识别速度慢？

**A**:

- 国内厂商通常比 OpenAI 快
- 检查网络连接
- 尝试压缩图片大小

### Q4: 识别不准确？

**A**:

- 确保图片清晰
- 商品信息完整可见
- 尝试不同的模型
- 国内厂商对中文商品识别更准确

### Q5: 如何切换厂商？

**A**: 在系统配置中修改以下三项即可：

- AI 模型名称
- AI API Key
- AI API Base URL

---

## 💡 使用建议

### 1. 选择建议

- **预算有限**：选阿里通义千问
- **追求性价比**：选 MiniMax
- **要求稳定**：选腾讯混元
- **新用户**：选智谱 GLM（送 ¥18）

### 2. 成本控制

- 压缩图片到 1MB 以下
- 避免重复识别同一张图片
- 选择合适的模型（不一定要最贵的）

### 3. 识别技巧

- 拍摄时确保商品信息清晰
- 避免反光和模糊
- 包装正面朝上
- 光线充足

---

## 📚 详细文档

需要更多信息？查看：

- `docs/CHINA_AI_PROVIDERS.md` - 完整配置指南
- `docs/AI_INTEGRATION.md` - AI 集成文档
- `docs/AI_ERRORS.md` - 错误处理
- `docs/AI_QUICKSTART.md` - 快速开始

---

## ✅ 总结

1. **无需修改代码**：所有国内厂商都兼容 OpenAI API 格式
2. **配置即用**：在系统配置中填写 API 信息即可
3. **成本更低**：比 OpenAI 便宜 50%+
4. **识别更准**：针对中文商品优化
5. **支付方便**：支持支付宝/微信

**推荐**：先用智谱 GLM 的免费 ¥18 额度测试，满意后再选择阿里通义千问长期使用（最便宜）。
