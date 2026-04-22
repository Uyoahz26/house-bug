# 国内 AI 厂商配置指南

## 支持的国内 AI 厂商

### 1. 阿里云通义千问（最便宜）⭐⭐⭐⭐⭐

**价格**: ¥0.01-0.02/次

**注册**: https://dashscope.aliyun.com/

**配置**:

```
AI 提供商: custom
AI 模型名称: qwen-vl-plus
AI API Key: sk-xxxxxxxxxxxxxxxx
AI API Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
```

**获取 API Key**:

1. 访问 https://dashscope.console.aliyun.com/apiKey
2. 创建 API Key
3. 复制 Key（格式：`sk-xxx`）

**充值**:

- 支持支付宝
- 最低充值 ¥10
- 新用户有免费额度

---

### 2. 腾讯混元（稳定）⭐⭐⭐⭐⭐

**价格**: ¥0.02-0.04/次

**注册**: https://cloud.tencent.com/product/hunyuan

**配置**:

```
AI 提供商: custom
AI 模型名称: hunyuan-vision
AI API Key: xxxxxxxxxxxxxxxx
AI API Base URL: https://api.hunyuan.cloud.tencent.com/v1
```

**获取 API Key**:

1. 访问腾讯云控制台
2. 开通混元服务
3. 创建密钥
4. 复制 SecretId 和 SecretKey

**充值**:

- 支持微信支付/支付宝
- 按量计费
- 新用户有免费额度

---

### 3. 百度文心一言 ⭐⭐⭐⭐

**价格**: ¥0.02-0.05/次

**注册**: https://cloud.baidu.com/product/wenxinworkshop

**配置**:

```
AI 提供商: custom
AI 模型名称: ernie-3.5-8k
AI API Key: xxxxxxxxxxxxxxxx
AI API Base URL: https://aip.baidubce.com/rpc/2.0/ai_custom/v1
```

**获取 API Key**:

1. 访问百度智能云控制台
2. 开通文心一言服务
3. 创建应用
4. 获取 API Key 和 Secret Key

**充值**:

- 支持支付宝/微信
- 按量计费
- 新用户有免费额度

---

### 4. 智谱 GLM ⭐⭐⭐⭐⭐

**价格**: ¥0.05-0.1/次

**注册**: https://open.bigmodel.cn/

**配置**:

```
AI 提供商: custom
AI 模型名称: glm-4v
AI API Key: xxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx
AI API Base URL: https://open.bigmodel.cn/api/paas/v4
```

**获取 API Key**:

1. 访问 https://open.bigmodel.cn/usercenter/apikeys
2. 创建 API Key
3. 复制 Key（格式：`xxx.xxx`）

**充值**:

- 支持支付宝
- 新用户赠送 ¥18
- 按量计费

---

### 5. MiniMax（性价比高）⭐⭐⭐⭐⭐

**价格**: ¥0.015-0.03/次

**注册**: https://www.minimaxi.com/

**配置**:

```
AI 提供商: custom
AI 模型名称: abab6.5-chat
AI API Key: xxxxxxxxxxxxxxxx
AI API Base URL: https://api.minimax.chat/v1
```

**获取 API Key**:

1. 访问 https://www.minimaxi.com/user-center/basic-information/interface-key
2. 创建 API Key
3. 复制 Key

**充值**:

- 支持支付宝/微信
- 新用户有免费额度
- 按量计费

---

### 6. 讯飞星火 ⭐⭐⭐⭐

**价格**: ¥0.02-0.04/次

**注册**: https://xinghuo.xfyun.cn/

**配置**:

```
AI 提供商: custom
AI 模型名称: spark-v3.5
AI API Key: xxxxxxxxxxxxxxxx
AI API Base URL: https://spark-api-open.xf-yun.com/v1
```

**获取 API Key**:

1. 访问讯飞开放平台
2. 创建应用
3. 获取 APPID、APIKey、APISecret

**充值**:

- 支持支付宝/微信
- 新用户有免费额度
- 按量计费

---

## 价格对比

| 厂商     | 单次成本    | 月成本（300次） | 免费额度 | 支付方式    |
| -------- | ----------- | --------------- | -------- | ----------- |
| 阿里通义 | ¥0.01-0.02  | ¥3-6            | ✅ 有    | 支付宝      |
| MiniMax  | ¥0.015-0.03 | ¥4.5-9          | ✅ 有    | 支付宝/微信 |
| 腾讯混元 | ¥0.02-0.04  | ¥6-12           | ✅ 有    | 微信/支付宝 |
| 百度文心 | ¥0.02-0.05  | ¥6-15           | ✅ 有    | 支付宝/微信 |
| 讯飞星火 | ¥0.02-0.04  | ¥6-12           | ✅ 有    | 支付宝/微信 |
| 智谱 GLM | ¥0.05-0.1   | ¥15-30          | ✅ ¥18   | 支付宝      |
| 字节豆包 | ¥0.02-0.04  | ¥6-12           | ✅ 有    | 支付宝/微信 |

## 推荐选择

### 预算最低：阿里通义千问 ⭐

- 单次 ¥0.01-0.02
- 月成本 ¥3-6（300次）
- 识别准确度高
- 阿里云生态

### 性价比最高：MiniMax ⭐

- 单次 ¥0.015-0.03
- 月成本 ¥4.5-9（300次）
- API 简单
- 新用户友好

### 最稳定：腾讯混元 ⭐

- 单次 ¥0.02-0.04
- 月成本 ¥6-12（300次）
- 腾讯云生态
- 服务稳定

## 配置步骤

### 通用步骤

1. **注册账号**
   - 访问对应厂商官网
   - 使用手机号注册
   - 完成实名认证

2. **获取 API Key**
   - 进入控制台
   - 创建 API Key
   - 复制保存

3. **充值**
   - 进入充值页面
   - 选择金额（建议 ¥10-50）
   - 使用支付宝/微信支付

4. **在系统中配置**
   - 进入 设置 → 系统配置 → AI 配置
   - 选择 AI 提供商：`custom`
   - 填写模型名称、API Key、API Base URL
   - 保存配置

5. **测试**
   - 上传商品图片
   - 点击识别
   - 查看结果

## 注意事项

### API 兼容性

大部分国内厂商都兼容 OpenAI API 格式，可以直接使用 `custom` 提供商。

### 图片格式

- 支持：JPG、PNG、WebP
- 大小：建议 < 2MB
- 分辨率：建议 < 4096px

### 识别准确度

国内厂商对中文商品的识别准确度通常比 OpenAI 更好，因为：

- 针对中文优化
- 训练数据包含更多中文商品
- 理解中文包装习惯

### 成本控制

- 使用缓存减少重复识别
- 压缩图片降低 token 消耗
- 选择合适的模型（不一定要最贵的）

## 常见问题

### Q: 哪个厂商最便宜？

**A**: 阿里通义千问 qwen-vl-plus，单次约 ¥0.01-0.02

### Q: 哪个厂商识别最准确？

**A**: 智谱 GLM-4V 和腾讯混元准确度较高，但价格也稍贵

### Q: 新用户有免费额度吗？

**A**: 大部分厂商都有，智谱 GLM 直接赠送 ¥18

### Q: 支持哪些支付方式？

**A**: 都支持支付宝，部分支持微信支付

### Q: 如何切换厂商？

**A**: 在系统配置中修改 AI 提供商、模型名称、API Key 和 API Base URL 即可

## 相关文档

- [AI 功能集成文档](./AI_INTEGRATION.md)
- [AI 错误处理](./AI_ERRORS.md)
- [网络访问说明](./NETWORK_ACCESS.md)
