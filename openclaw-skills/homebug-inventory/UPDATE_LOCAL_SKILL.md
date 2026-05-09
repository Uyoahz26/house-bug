# 更新本地 OpenClaw Skill 指南

## 📍 文件位置

你的本地 OpenClaw Skill 文件位于：

```
~/.openclaw/workspace/skills/homebug-inventory/SKILL.md
```

## 🔄 更新步骤

### 方法 1：直接替换（推荐）

```bash
# 1. 备份原文件
cp ~/.openclaw/workspace/skills/homebug-inventory/SKILL.md \
   ~/.openclaw/workspace/skills/homebug-inventory/SKILL.md.backup

# 2. 复制新版本
cp openclaw-skills/homebug-inventory/SKILL_UPDATED.md \
   ~/.openclaw/workspace/skills/homebug-inventory/SKILL.md

# 3. 验证
cat ~/.openclaw/workspace/skills/homebug-inventory/SKILL.md | head -20
```

### 方法 2：手动编辑

打开文件：

```bash
code ~/.openclaw/workspace/skills/homebug-inventory/SKILL.md
# 或
vim ~/.openclaw/workspace/skills/homebug-inventory/SKILL.md
```

然后复制 `SKILL_UPDATED.md` 的内容粘贴进去。

## ✨ 主要更新内容

### 1. 版本号更新

```yaml
version: 1.0.0  →  version: 1.1.0
```

### 2. 描述更新

```yaml
description: 管理 HomeBug 家庭物资库存，支持查询、增加、减少物品数量，查询过期物品和位置物品
```

### 3. 新增触发条件

**查询已过期物品**：

- "哪些过期了"、"有什么过期了"、"过期的物品"

**查询即将过期物品**：

- "快过期了"、"快到期了"、"即将过期"

**查询特定位置物品**：

- "冰箱里有什么"、"厨房有哪些"、"卫生间有什么"

### 4. 新增使用示例

- 示例 4：查询已过期物品
- 示例 5：查询即将过期物品
- 示例 6：查询特定位置物品（冰箱）
- 示例 7：查询其他位置（厨房）

### 5. AI 幽默回复说明

新增了 AI 幽默回复特点说明：

- 方大同式莫名其妙
- 网络热梗融入
- 智能情境感知
- 每次回复不同

### 6. 使用技巧

新增了定期检查清单：

- 每日检查（可选）
- 每周检查（推荐）
- 购物前检查

## 🧪 测试更新

更新后，测试新功能：

```bash
# 测试 1：查询已过期物品
你：有哪些东西已经过期了

# 测试 2：查询即将过期物品
你：哪些东西快过期了

# 测试 3：查询冰箱
你：冰箱里有什么

# 测试 4：查询厨房
你：厨房有哪些东西

# 测试 5：AI 幽默回复
你：我用了一包纸
# 应该看到类似："纸巾在你手中化作云烟，还剩 5 包在等待命运的召唤 ✨"
```

## 📝 重要提示

### 1. 保持 API 返回的原样

**重要**：OpenClaw 应该直接返回 API 的 `message` 字段，不要修改或添加内容。

```bash
# ✅ 正确
MESSAGE=$(curl ... | jq -r '.message')
echo "$MESSAGE"

# ❌ 错误
MESSAGE=$(curl ... | jq -r '.message')
echo "HomeBug 回复：$MESSAGE"  # 不要添加前缀
```

### 2. 处理换行符

API 返回的消息可能包含换行符（`\n`），确保正确处理：

```bash
# 使用 jq -r 会自动处理换行符
curl ... | jq -r '.message'

# 如果使用 grep，需要手动处理
echo "$RESPONSE" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 | sed 's/\\n/\n/g'
```

### 3. 错误处理

检查 `success` 字段：

```bash
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
MESSAGE=$(echo "$RESPONSE" | jq -r '.message')

if [ "$SUCCESS" = "false" ]; then
  echo "❌ $MESSAGE"
else
  echo "$MESSAGE"
fi
```

## 🔧 故障排查

### 问题：OpenClaw 没有识别新的触发条件

**解决方案**：

1. 重启 OpenClaw
2. 检查 SKILL.md 文件是否正确更新
3. 查看 OpenClaw 日志

### 问题：回复消息没有幽默效果

**解决方案**：

1. 确认 HomeBug 已启用 AI 功能
2. 检查 API 版本是否为 v1.1.0+
3. 查看 API 返回的完整响应

### 问题：查询过期物品没有结果

**解决方案**：

1. 确认物品已设置过期日期
2. 检查物品状态（active/expired）
3. 运行 Cron 任务更新过期状态

## 📚 相关文档

更新后，建议阅读以下文档：

- [USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md) - 详细使用示例
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - 快速参考
- [AI_HUMOR_EXAMPLES.md](./AI_HUMOR_EXAMPLES.md) - AI 幽默回复示例
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - 测试指南

## 🎉 完成

更新完成后，你就可以享受新功能了：

- ⚠️ 查询已过期物品
- ⏰ 查询即将过期物品
- 📍 查询特定位置物品
- 🎭 AI 幽默回复

每次操作都是一次惊喜！✨

---

**版本**：v1.1.0  
**更新日期**：2026-04-24
