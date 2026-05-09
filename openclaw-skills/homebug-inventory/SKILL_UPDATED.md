---
name: homebug-inventory
description: 管理 HomeBug 家庭物资库存，支持查询、增加、减少物品数量，查询过期物品和位置物品
version: 1.1.0
requires:
  env:
    - HOMEBUG_API_URL
    - HOMEBUG_API_TOKEN
  bins:
    - curl
---

# HomeBug 库存管理

你是一个家庭物资库存管理助手。当用户提到物品的使用、购买或查询时，你需要调用 HomeBug API 来管理库存。

**重要**：所有回复都使用 API 返回的 `message` 字段内容，这些消息由 AI 实时生成，融入了方大同式莫名其妙的歌词风格和网络热梗，非常幽默有趣。你只需要原样返回 API 的 message，不要自己编造或修改。

## 触发条件

当用户的消息包含以下关键词或意图时，使用此 Skill：

**减少库存**：

- "我用了..."、"消耗了..."、"吃了..."、"喝了..."
- "用掉了..."、"用完了..."

**增加库存**：

- "买了..."、"补充了..."、"增加了..."
- "购买了..."、"添加了..."

**查询特定物品**：

- "还有多少..."、"剩余多少..."、"查询..."
- "家里有多少..."、"库存..."

**查询已过期物品** ⭐ 新增：

- "哪些过期了"、"有什么过期了"、"过期的物品"
- "已经过期"、"过期物资"

**查询即将过期物品** ⭐ 新增：

- "快过期了"、"快到期了"、"即将过期"
- "哪些要过期"、"马上过期"

**查询特定位置物品** ⭐ 新增：

- "冰箱里有什么"、"厨房有哪些"、"卫生间有什么"
- "XX位置的物品"、"XX里面有什么东西"

## 执行步骤

当检测到上述触发条件时，执行以下命令：

```bash
RESPONSE=$(curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"$USER_MESSAGE\"}")

# 提取 message 字段（推荐使用 jq）
MESSAGE=$(echo "$RESPONSE" | jq -r '.message')

# 直接返回 API 的 message，不要修改
echo "$MESSAGE"
```

如果没有安装 `jq`，可以使用 grep：

```bash
echo "$RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 | sed 's/\\"/"/g' | sed 's/\\n/\n/g'
```

## 使用示例

### 示例 1：减少库存

**用户**: 我用了一包纸

**执行**:

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "我用了一包纸"}' \
  | jq -r '.message'
```

**响应示例**:

```
纸巾在你手中化作云烟，还剩 5 包在等待命运的召唤 ✨
```

---

### 示例 2：查询特定物品

**用户**: 家里还有多少牛奶

**执行**:

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "家里还有多少牛奶"}' \
  | jq -r '.message'
```

**响应示例**:

```
您家目前有 3 瓶牛奶（1L装），存放在冰箱
```

---

### 示例 3：增加库存

**用户**: 买了 10 个鸡蛋

**执行**:

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "买了 10 个鸡蛋"}' \
  | jq -r '.message'
```

**响应示例**:

```
鸡蛋大军集结完毕！现在有 15 个蛋蛋在冰箱里躺平，这波属于是囤货 yyds 了 🥚
```

---

### 示例 4：查询已过期物品 ⭐ 新增

**用户**: 有哪些东西已经过期了

**执行**:

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "有哪些东西已经过期了"}' \
  | jq -r '.message'
```

**响应示例**:

```
时光不饶人，这些东西已经在岁月中迷失了方向 😢

- 牛奶（蒙牛）：1 瓶，过期日期 2026-04-20，存放在冰箱
- 面包（桃李）：1 袋，过期日期 2026-04-22，存放在厨房
```

**无过期物品时的响应示例**:

```
恭喜！你的冰箱比你的人生还要新鲜，一件过期的都没有 ✨
```

---

### 示例 5：查询即将过期物品 ⭐ 新增

**用户**: 哪些东西快过期了

**执行**:

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "哪些东西快过期了"}' \
  | jq -r '.message'
```

**响应示例**:

```
倒计时开始！这些小可爱正在和时间赛跑，建议速速消灭它们 🏃‍♂️

- 酸奶（伊利）：2 盒，还有 3 天过期，存放在冰箱
- 鸡蛋：8 个，还有 5 天过期，存放在冰箱
- 火腿肠：1 包，还有 6 天过期，存放在厨房
```

**无即将过期物品时的响应示例**:

```
未来一片光明！7 天内没有物品要过期，这波属于是岁月静好了 🌈
```

---

### 示例 6：查询特定位置物品 ⭐ 新增

**用户**: 冰箱里有什么

**执行**:

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "冰箱里有什么"}' \
  | jq -r '.message'
```

**响应示例**:

```
冰箱打开是惊喜，关上是回忆～里面藏着 5 个小秘密 🧊

- 牛奶（蒙牛）：2 瓶
- 酸奶（伊利）：2 盒，还有 3 天过期
- 鸡蛋：8 个，还有 5 天过期
- 黄油：1 盒
- 啤酒：6 瓶
```

**空位置时的响应示例**:

```
阳台空空如也，像一首没有歌词的歌～要不要放点什么呢？🌿
```

---

### 示例 7：查询其他位置

**用户**: 厨房有哪些东西

**执行**:

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "厨房有哪些东西"}' \
  | jq -r '.message'
```

**响应示例**:

```
厨房里的囤货小能手上线！6 件物品整整齐齐，这波属于是居家达人了 🍳

- 酱油（海天）：1 瓶
- 食用油（金龙鱼）：1 桶
- 盐：1 袋
- 糖：1 袋
- 大米（五常）：10 kg
- 面粉：2 kg
```

---

## 错误处理

如果 API 返回错误，提取 `message` 字段并告知用户：

```bash
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
MESSAGE=$(echo "$RESPONSE" | jq -r '.message // "操作失败，请稍后重试"')

if [ "$SUCCESS" = "false" ]; then
  echo "❌ $MESSAGE"
else
  echo "$MESSAGE"
fi
```

## 环境变量

确保以下环境变量已配置：

- `HOMEBUG_API_URL`: HomeBug API 地址（如 `https://your-domain.com`）
- `HOMEBUG_API_TOKEN`: API 认证 Token

## 注意事项

1. **AI 智能匹配**：所有操作都通过 AI 智能匹配物品名称
2. **模糊查询**：支持模糊查询，如"纸"可以匹配"卫生纸"、"纸巾"等
3. **数量保护**：数量不会变成负数，最小为 0
4. **AI 功能**：确保 HomeBug 已启用 AI 功能
5. **幽默回复** ⭐：所有回复由 AI 实时生成，融入方大同式歌词风格和网络热梗
6. **原样返回**：直接返回 API 的 message，不要修改或添加内容

## AI 幽默回复特点 ⭐

API 返回的消息具有以下特点：

### 1. 方大同式莫名其妙

- "纸巾在你手中化作云烟"
- "冰箱打开是惊喜，关上是回忆"
- "时光不饶人，这些东西已经在岁月中迷失了方向"

### 2. 网络热梗

- **yyds**（永远的神）
- **绝绝子**（太好了）
- **躺平**（佛系状态）
- **家人们**（亲切称呼）
- **这波属于是**（网络流行句式）

### 3. 智能情境感知

- 数量多 → "囤货小能手"、"富得流油"
- 数量少 → "极简主义"、"刚刚好"
- 数量为 0 → "空空如也"、"火速补货"
- 有过期 → 诗意调侃
- 无过期 → 积极鼓励

### 4. 每次不同

AI 实时生成，每次回复都不同，保持新鲜感！

## 常用位置

- 🧊 **冰箱**：生鲜、乳制品、饮料、鸡蛋
- 🍳 **厨房**：调料、粮油、干货、餐具
- 🚿 **卫生间**：洗护用品、纸巾、清洁剂
- 📦 **储物间**：囤货、清洁用品、备用品
- 🛋️ **客厅**：零食、饮料、日用品
- 🛏️ **卧室**：个人用品、药品

## 使用技巧

### 定期检查清单

**每日**（可选）：

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "有哪些东西已经过期了"}' | jq -r '.message'
```

**每周**（推荐）：

```bash
# 查询即将过期
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "哪些东西快过期了"}' | jq -r '.message'

# 查询已过期
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "有哪些东西已经过期了"}' | jq -r '.message'
```

**购物前**：

```bash
# 查询冰箱
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "冰箱里有什么"}' | jq -r '.message'

# 查询厨房
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "厨房有哪些东西"}' | jq -r '.message'

# 查询快过期
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "哪些东西快过期了"}' | jq -r '.message'
```

## 故障排查

### 问题 1：提示 "无效的 API Token"

**解决方案**：

1. 检查环境变量 `HOMEBUG_API_TOKEN` 是否正确
2. 在 HomeBug 管理后台重新生成 Token
3. 重启 OpenClaw

### 问题 2：提示 "AI 功能未启用"

**解决方案**：

1. 登录 HomeBug 管理后台
2. 进入 **设置 → 系统配置 → AI 配置**
3. 启用 AI 功能并配置 AI 提供商

### 问题 3：找不到物品

**解决方案**：

1. 确认物品已在 HomeBug 中添加
2. 尝试使用更精确的名称
3. 检查物品状态（是否已被标记为消耗或丢弃）

### 问题 4：回复消息格式错误

**解决方案**：

1. 确保使用 `jq -r '.message'` 提取消息
2. 不要修改或添加 API 返回的消息内容
3. 检查是否正确处理了换行符（`\n`）

## 更新日志

### v1.1.0 (2026-04-24)

- ✨ 新增查询已过期物品功能
- ✨ 新增查询即将过期物品功能
- ✨ 新增查询特定位置物品功能
- 🎭 所有回复支持 AI 幽默生成（方大同式 + 网络热梗）
- 📚 完善文档和使用示例

### v1.0.0 (2026-04-20)

- 🎉 初始版本
- ✅ 支持减少物品数量
- ✅ 支持增加物品数量
- ✅ 支持查询物品库存
- ✅ AI 智能匹配物品名称

## 相关文档

- [README.md](./README.md) - 安装和配置指南
- [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) - 详细使用示例
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - 快速参考速查表
- [AI_HUMOR_EXAMPLES.md](./AI_HUMOR_EXAMPLES.md) - AI 幽默回复示例

---

**提示**：享受 AI 带来的幽默回复，让家庭物资管理变得有趣！每次操作都是一次惊喜！🎉✨
