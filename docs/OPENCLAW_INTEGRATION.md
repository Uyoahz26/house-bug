# OpenClaw 集成指南

## 📖 简介

OpenClaw 是一个开源的个人 AI 助手框架，可以连接到 WhatsApp、Telegram、Slack、Discord 等多个消息平台。通过集成 OpenClaw，你可以用自然语言管理 HomeBug 的家庭物资库存。

## ✨ 功能特性

集成后，你可以通过 OpenClaw 实现：

- 🔽 **减少库存**："我用了一包纸" → 自动减少纸的数量
- 🔼 **增加库存**："买了 5 个鸡蛋" → 自动增加鸡蛋的数量
- 🔍 **查询库存**："家里还有多少牛奶" → 即时查询牛奶库存
- 🤖 **智能匹配**：AI 自动识别物品名称，支持模糊查询

## 🚀 快速开始

### 前置要求

1. HomeBug 已部署并运行
2. HomeBug 已启用 AI 功能（需要配置 AI 提供商）
3. OpenClaw 已安装并运行

### 第一步：在 HomeBug 中配置

1. 登录 HomeBug 管理员账号
2. 进入 **设置 → 系统配置 → OpenClaw**
3. 点击 **"生成 API Token"** 按钮
4. 复制生成的 Token（稍后会用到）
5. 开启 **"openclaw.enabled"** 开关
6. 点击 **"保存变更"**

### 第二步：配置 OpenClaw Skill

#### 方法一：手动安装（推荐）

1. 找到 HomeBug 项目中的 `openclaw-skills/homebug-inventory/SKILL.md` 文件
2. 复制整个 `homebug-inventory` 文件夹到 OpenClaw 的 skills 目录：
   ```bash
   cp -r openclaw-skills/homebug-inventory ~/.openclaw/skills/
   ```

#### 方法二：直接创建

在 `~/.openclaw/skills/homebug-inventory/` 目录下创建 `SKILL.md` 文件，内容见项目中的模板。

### 第三步：配置环境变量

在 OpenClaw 的配置文件或环境变量中添加：

```bash
# HomeBug API 地址（替换为你的实际域名）
export HOMEBUG_API_URL="https://your-homebug-domain.com"

# HomeBug API Token（从第一步中获取）
export HOMEBUG_API_TOKEN="your-generated-token-here"
```

如果使用 OpenClaw 的配置文件（`~/.openclaw/config.json`），可以添加：

```json
{
  "env": {
    "HOMEBUG_API_URL": "https://your-homebug-domain.com",
    "HOMEBUG_API_TOKEN": "your-generated-token-here"
  }
}
```

### 第四步：重启 OpenClaw

```bash
# 如果使用 systemd
sudo systemctl restart openclaw

# 如果手动运行
# 停止当前进程，然后重新启动
openclaw
```

### 第五步：测试集成

向 OpenClaw 发送消息测试：

```
你：我用了一包纸
OpenClaw：已将"纸"的数量减少 1 包，当前剩余 5 包

你：家里还有多少牛奶
OpenClaw：您家目前有 3 瓶牛奶（1L装），存放在冰箱

你：买了 10 个鸡蛋
OpenClaw：已将"鸡蛋"的数量增加 10 个，当前剩余 15 个
```

## 📋 API 接口说明

### 端点

```
POST /api/openclaw/inventory
```

### 请求头

```
Authorization: Bearer YOUR_API_TOKEN
Content-Type: application/json
```

### 请求体

```json
{
  "action": "我用了一包纸"
}
```

### 响应示例

#### 成功操作

```json
{
  "success": true,
  "message": "已将\"纸\"的数量减少 1 包，当前剩余 5 包",
  "operation": {
    "type": "decrease",
    "itemName": "纸",
    "itemId": "abc123",
    "previousQuantity": 6,
    "newQuantity": 5,
    "unit": "包"
  }
}
```

#### 查询操作

```json
{
  "success": true,
  "message": "您家目前有 5 包纸，存放在储物间",
  "items": [
    {
      "id": "abc123",
      "name": "纸",
      "quantity": 5,
      "unit": "包",
      "location": "储物间"
    }
  ]
}
```

#### 物品不存在

```json
{
  "success": false,
  "message": "未找到物品\"某物品\"，请先添加到库存中"
}
```

## 🔧 高级配置

### 自定义 Skill 行为

你可以修改 `SKILL.md` 文件来自定义 OpenClaw 的行为，例如：

- 添加更多操作类型（如批量操作）
- 自定义响应格式
- 添加错误处理逻辑

### Webhook 推送（可选）

如果你想让 HomeBug 主动推送通知到 OpenClaw（如过期提醒），可以配置 Webhook URL：

1. 在 OpenClaw 中配置 Webhook 接收端点
2. 在 HomeBug 系统设置中填写 `openclaw.webhook_url`
3. HomeBug 会在特定事件发生时推送通知

## 🔒 安全建议

1. **保护 API Token**：不要将 Token 提交到版本控制系统
2. **使用 HTTPS**：确保 HomeBug 使用 HTTPS 部署
3. **定期更换 Token**：建议定期重新生成 API Token
4. **限制访问**：如果可能，使用防火墙限制只允许 OpenClaw 服务器访问

## 🐛 故障排查

### 问题：OpenClaw 提示 "无效的 API Token"

**解决方案**：

1. 检查环境变量 `HOMEBUG_API_TOKEN` 是否正确设置
2. 确认 Token 与 HomeBug 系统设置中的一致
3. 重启 OpenClaw 使环境变量生效

### 问题：OpenClaw 提示 "AI 功能未启用"

**解决方案**：

1. 登录 HomeBug 管理后台
2. 进入 **设置 → 系统配置 → AI 配置**
3. 启用 AI 功能并配置 AI 提供商

### 问题：找不到物品

**解决方案**：

1. 确认物品已在 HomeBug 中添加
2. 尝试使用更精确的物品名称
3. 检查 AI 配置是否正常工作

### 问题：数量更新失败

**解决方案**：

1. 检查 HomeBug 日志：`/api/openclaw/inventory` 的错误信息
2. 确认物品状态不是 "已丢弃"
3. 检查数据库连接是否正常

## 📚 相关文档

- [OpenClaw 官方文档](https://docs.openclaw.com)
- [HomeBug AI 集成文档](./AI_INTEGRATION.md)
- [HomeBug API 文档](./ARCHITECTURE.md)

## 💡 使用技巧

### 批量操作

虽然当前版本不支持批量操作，但你可以连续发送多条指令：

```
我用了一包纸
我用了 2 瓶牛奶
我吃了 3 个鸡蛋
```

### 模糊匹配

AI 会智能匹配物品名称，以下表达都能识别：

- "纸" / "卫生纸" / "纸巾"
- "牛奶" / "鲜奶" / "奶"
- "鸡蛋" / "蛋"

### 多单位支持

如果你的物品有多个单位（如"包"、"个"、"瓶"），AI 会自动识别并使用正确的单位。

## 🎯 未来计划

- [ ] 支持批量操作
- [ ] 支持过期提醒推送到 OpenClaw
- [ ] 支持采购建议推送
- [ ] 支持语音输入
- [ ] 支持图片识别（拍照添加物品）

## 📄 许可证

本集成遵循 HomeBug 项目的 MIT 许可证。

---

<div align="center">
  <sub>Made with ❤️ for better home management · HomeBug 小小虫</sub>
</div>
