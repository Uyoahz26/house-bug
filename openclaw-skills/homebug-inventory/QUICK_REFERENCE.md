# HomeBug 库存管理 - 快速参考

一页纸速查表，快速掌握所有功能。

---

## 📋 功能速查

| 功能              | 触发词                   | 示例                   |
| ----------------- | ------------------------ | ---------------------- |
| 🔽 **减少数量**   | 用了、吃了、喝了、消耗了 | `我用了一包纸`         |
| 🔼 **增加数量**   | 买了、补充了、添加了     | `买了 10 个鸡蛋`       |
| 🔍 **查询物品**   | 还有多少、剩余、查询     | `家里还有多少牛奶`     |
| ⚠️ **查询过期**   | 过期了、已经过期         | `有哪些东西已经过期了` |
| ⏰ **查询将过期** | 快过期、即将过期、要过期 | `哪些东西快过期了`     |
| 📍 **查询位置**   | XX里有什么、XX有哪些     | `冰箱里有什么`         |

---

## 🎯 常用命令

### 基本操作

```bash
# 减少物品
我用了一包纸
吃了 2 个苹果
喝了一瓶牛奶

# 增加物品
买了 10 个鸡蛋
补充了 5 包纸巾
购买了 2 瓶酱油

# 查询物品
家里还有多少牛奶
剩余多少鸡蛋
查询纸巾库存
```

### 高级查询

```bash
# 查询过期
有哪些东西已经过期了
过期的物品有哪些

# 查询将过期
哪些东西快过期了
快到期的有什么
即将过期的物品

# 查询位置
冰箱里有什么
厨房有哪些东西
卫生间有什么
储物间里面有什么东西
```

---

## 🏷️ 常用位置

| 位置          | 适合存放                 |
| ------------- | ------------------------ |
| 🧊 **冰箱**   | 生鲜、乳制品、饮料、鸡蛋 |
| 🍳 **厨房**   | 调料、粮油、干货、餐具   |
| 🚿 **卫生间** | 洗护用品、纸巾、清洁剂   |
| 📦 **储物间** | 囤货、清洁用品、备用品   |
| 🛋️ **客厅**   | 零食、饮料、日用品       |
| 🛏️ **卧室**   | 个人用品、药品           |

---

## 💡 使用技巧

### ✅ 推荐做法

- 使用自然语言，像和朋友聊天一样
- 定期检查过期和将过期物品
- 购物前查询库存，避免重复购买
- 合理设置物品存放位置

### ❌ 避免错误

- 不要使用过于模糊的名称（如"东西"、"那个"）
- 不要一次操作多个物品（需分别操作）
- 不要期望查询所有物品（使用网页端）

---

## 📅 定期检查清单

### 每日检查（可选）

```
有哪些东西已经过期了
```

### 每周检查（推荐）

```
哪些东西快过期了
有哪些东西已经过期了
```

### 购物前检查

```
冰箱里有什么
厨房有哪些东西
还有多少XX（具体物品）
哪些东西快过期了
```

### 整理前检查

```
有哪些东西已经过期了
储物间里面有什么东西
卫生间有什么
```

---

## 🔧 API 调用示例

### 基本格式

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "用户指令"}' \
  | jq -r '.message'
```

### 常用调用

```bash
# 减少物品
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "我用了一包纸"}' | jq -r '.message'

# 查询过期
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "有哪些东西已经过期了"}' | jq -r '.message'

# 查询位置
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "冰箱里有什么"}' | jq -r '.message'
```

---

## 🆘 故障排查

| 问题                | 解决方案                         |
| ------------------- | -------------------------------- |
| ❌ 无效的 API Token | 检查环境变量，重新生成 Token     |
| ❌ 找不到物品       | 确认物品已添加，使用更精确的名称 |
| ❌ AI 功能未启用    | 在 HomeBug 设置中启用 AI 功能    |
| ❌ 连接失败         | 检查 API URL 是否正确            |

---

## 📚 相关文档

- [README.md](./README.md) - 安装和配置指南
- [SKILL.md](./SKILL.md) - 技术文档
- [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) - 详细使用示例
- [OpenClaw 集成指南](../../docs/OPENCLAW_INTEGRATION.md) - 完整文档

---

**提示**：打印本页面，贴在显眼位置，随时查阅！
