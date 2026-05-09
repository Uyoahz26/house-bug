# HomeBug 库存管理 - 测试指南

本指南帮助你测试和验证 HomeBug OpenClaw Skill 的所有功能。

---

## 📋 测试前准备

### 1. 环境检查

确保以下环境变量已配置：

```bash
# 检查环境变量
echo $HOMEBUG_API_URL
echo $HOMEBUG_API_TOKEN
```

### 2. 准备测试数据

在 HomeBug 中添加以下测试物品：

| 物品名称 | 数量 | 单位 | 位置   | 过期日期           |
| -------- | ---- | ---- | ------ | ------------------ |
| 牛奶     | 3    | 瓶   | 冰箱   | 今天+2天           |
| 酸奶     | 2    | 盒   | 冰箱   | 今天+3天           |
| 鸡蛋     | 10   | 个   | 冰箱   | 今天+5天           |
| 面包     | 1    | 袋   | 厨房   | 今天-1天（已过期） |
| 纸巾     | 5    | 包   | 卫生间 | 无                 |
| 酱油     | 1    | 瓶   | 厨房   | 无                 |

---

## 🧪 功能测试

### 测试 1：减少物品数量

**目标**：验证消耗物品功能

```bash
# 测试命令
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "我用了一包纸巾"}' \
  | jq -r '.message'
```

**期望结果**：

```
已将"纸巾"的数量减少 1 包，当前剩余 4 包
```

**验证点**：

- ✅ 数量正确减少
- ✅ 返回当前剩余数量
- ✅ 单位显示正确

---

### 测试 2：增加物品数量

**目标**：验证补充物品功能

```bash
# 测试命令
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "买了 5 个鸡蛋"}' \
  | jq -r '.message'
```

**期望结果**：

```
已将"鸡蛋"的数量增加 5 个，当前剩余 15 个
```

**验证点**：

- ✅ 数量正确增加
- ✅ 返回当前剩余数量
- ✅ 单位显示正确

---

### 测试 3：查询特定物品

**目标**：验证物品查询功能

```bash
# 测试命令
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "家里还有多少牛奶"}' \
  | jq -r '.message'
```

**期望结果**：

```
您家目前有 3 瓶牛奶，存放在冰箱
```

**验证点**：

- ✅ 显示正确数量
- ✅ 显示存放位置
- ✅ 显示单位

---

### 测试 4：查询已过期物品 ⭐ 新功能

**目标**：验证过期物品查询功能

```bash
# 测试命令
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "有哪些东西已经过期了"}' \
  | jq -r '.message'
```

**期望结果**：

```
发现 1 件已过期物品：
- 面包：1 袋，过期日期 2026-04-23，存放在厨房
```

**验证点**：

- ✅ 正确识别已过期物品
- ✅ 显示过期日期
- ✅ 显示存放位置
- ✅ 如果没有过期物品，显示"太好了！目前没有已过期的物品。"

---

### 测试 5：查询即将过期物品 ⭐ 新功能

**目标**：验证即将过期物品查询功能

```bash
# 测试命令
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "哪些东西快过期了"}' \
  | jq -r '.message'
```

**期望结果**：

```
发现 3 件物品将在 7 天内过期：
- 牛奶：3 瓶，还有 2 天过期，存放在冰箱
- 酸奶：2 盒，还有 3 天过期，存放在冰箱
- 鸡蛋：15 个，还有 5 天过期，存放在冰箱
```

**验证点**：

- ✅ 正确识别即将过期物品（7天内）
- ✅ 显示剩余天数
- ✅ 显示存放位置
- ✅ 按过期日期排序（最快过期的在前）
- ✅ 如果没有即将过期物品，显示"未来 7 天内没有即将过期的物品。"

---

### 测试 6：查询特定位置物品 ⭐ 新功能

**目标**：验证位置查询功能

```bash
# 测试命令 - 查询冰箱
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "冰箱里有什么"}' \
  | jq -r '.message'
```

**期望结果**：

```
冰箱里有 3 件物品：
- 牛奶：3 瓶，还有 2 天过期
- 酸奶：2 盒，还有 3 天过期
- 鸡蛋：15 个，还有 5 天过期
```

**验证点**：

- ✅ 正确筛选位置
- ✅ 显示所有该位置物品
- ✅ 自动显示过期信息（如果有）
- ✅ 如果位置为空，显示"XX里目前没有物品。"

```bash
# 测试命令 - 查询厨房
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "厨房有哪些东西"}' \
  | jq -r '.message'
```

```bash
# 测试命令 - 查询卫生间
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "卫生间有什么"}' \
  | jq -r '.message'
```

---

## 🔍 边界测试

### 测试 7：物品不存在

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "我用了一个不存在的物品"}' \
  | jq
```

**期望结果**：

```json
{
  "success": false,
  "message": "未找到物品\"不存在的物品\"，请先添加到库存中"
}
```

---

### 测试 8：数量减到 0

```bash
# 先查询当前数量
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "还有多少面包"}' \
  | jq -r '.message'

# 减少到 0
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "用完了所有面包"}' \
  | jq -r '.message'
```

**期望结果**：

```
已将"面包"的数量减少 1 袋，当前剩余 0 袋
```

**验证点**：

- ✅ 数量变为 0
- ✅ 物品状态自动更新为 "consumed"

---

### 测试 9：空位置查询

```bash
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "阳台有什么"}' \
  | jq -r '.message'
```

**期望结果**：

```
阳台里目前没有物品。
```

---

### 测试 10：无过期物品

```bash
# 先清理所有过期物品，然后测试
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "有哪些东西已经过期了"}' \
  | jq -r '.message'
```

**期望结果**：

```
太好了！目前没有已过期的物品。
```

---

## 🤖 AI 智能匹配测试

### 测试 11：模糊匹配

```bash
# 测试 1：用"纸"匹配"纸巾"
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "我用了一包纸"}' \
  | jq -r '.message'

# 测试 2：用"奶"匹配"牛奶"
curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "还有多少奶"}' \
  | jq -r '.message'
```

**验证点**：

- ✅ 能够模糊匹配物品名称
- ✅ 匹配最相关的物品

---

## 📊 完整测试清单

### 基本功能

- [ ] 减少物品数量
- [ ] 增加物品数量
- [ ] 查询特定物品
- [ ] 模糊匹配物品名称

### 新增功能 ⭐

- [ ] 查询已过期物品
- [ ] 查询即将过期物品
- [ ] 查询特定位置物品
- [ ] 位置模糊匹配

### 边界情况

- [ ] 物品不存在
- [ ] 数量减到 0
- [ ] 空位置查询
- [ ] 无过期物品
- [ ] 无即将过期物品

### 错误处理

- [ ] 无效的 API Token
- [ ] 空指令
- [ ] AI 功能未启用
- [ ] 网络错误

---

## 🐛 问题报告

如果测试中发现问题，请记录以下信息：

1. **测试命令**：完整的 curl 命令
2. **期望结果**：应该返回什么
3. **实际结果**：实际返回了什么
4. **环境信息**：
   - HomeBug 版本
   - OpenClaw 版本
   - AI 提供商（OpenAI/Anthropic/国内）
5. **测试数据**：使用的测试物品信息

---

## 📈 性能测试

### 测试大量物品

```bash
# 测试查询性能（假设有 100+ 物品）
time curl -s -X POST "$HOMEBUG_API_URL/api/openclaw/inventory" \
  -H "Authorization: Bearer $HOMEBUG_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "冰箱里有什么"}' \
  | jq -r '.message'
```

**期望**：

- ✅ 响应时间 < 3 秒
- ✅ 正确返回所有物品

---

## ✅ 测试通过标准

所有测试通过后，你应该能够：

1. ✅ 成功减少和增加物品数量
2. ✅ 准确查询特定物品信息
3. ✅ 正确识别已过期物品
4. ✅ 准确查询即将过期物品（7天内）
5. ✅ 正确筛选特定位置物品
6. ✅ 智能匹配模糊物品名称
7. ✅ 优雅处理边界情况和错误

---

## 🎉 测试完成

恭喜！如果所有测试都通过，你的 HomeBug OpenClaw Skill 已经可以正常使用了。

开始享受智能家庭物资管理吧！🏠✨
