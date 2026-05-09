# 邮件提醒问题排查

## 问题现象

邮件中只显示"库存不足"的物品，没有显示"已过期"和"即将过期"的物品。

## 根本原因

**数据库中的物品没有设置过期日期（`expiry_date` 字段为 NULL）**

### 代码逻辑分析

1. **SQL 查询**（`listReminderItemsForUser` 函数）：

```sql
WHERE status = 'active'
  AND (
    (
      expiry_date IS NOT NULL
      AND date(expiry_date) <= date('now', '+7 day')
    )
    OR quantity <= 1
  )
```

这个查询会返回：

- 过期日期 <= 今天+7天 的物品（包括已过期和即将过期）
- **或者**库存 <= 1 的物品

2. **物品分类逻辑**：

```typescript
// 已过期物品
const expiredItems = normalizedItems.filter((item) => {
  if (item.daysLeft === null) return false; // ❌ 没有过期日期的物品被排除
  return item.daysLeft < 0;
});

// 即将过期物品
const expiringItems = normalizedItems.filter((item) => {
  if (item.daysLeft === null) return false; // ❌ 没有过期日期的物品被排除
  return item.daysLeft >= 0 && item.daysLeft <= daysBefore;
});

// 库存不足物品
const lowStockItems = normalizedItems.filter((item) => {
  if (item.quantity > 1) return false;
  // ✅ 没有过期日期但库存不足的物品会进入这里
  return !expiryItemIds.has(itemId);
});
```

### 问题总结

如果物品的 `expiry_date` 为 NULL：

- `daysLeft` 计算结果为 `null`
- 无法进入"已过期"分类（被 `if (item.daysLeft === null) return false;` 排除）
- 无法进入"即将过期"分类（被 `if (item.daysLeft === null) return false;` 排除）
- 如果 `quantity <= 1`，会进入"库存不足"分类

## 解决方案

### 方案 1：为物品添加过期日期（推荐）

在系统的"物品管理"页面，为每个物品设置正确的过期日期：

1. 访问 https://homebug.uyoahz.cc.cd/items
2. 点击物品进行编辑
3. 设置"过期日期"字段
4. 保存

**示例**：

- 鲜榨佳 洗手液：设置为 2026-06-30
- 金盏花鲜榨华水：设置为 2026-05-15
- 蜂花 洗发水：设置为 2026-07-20
- 立白 内衣洗衣液：设置为 2026-08-10

### 方案 2：批量导入过期日期

如果物品很多，可以使用 SQL 批量更新：

```sql
-- 示例：为特定物品设置过期日期
UPDATE items SET expiry_date = '2026-06-30' WHERE name = '洗手液' AND brand = '鲜榨佳';
UPDATE items SET expiry_date = '2026-05-15' WHERE name = '洗发水' AND brand = '金盏花鲜榨华水';
UPDATE items SET expiry_date = '2026-07-20' WHERE name = '洗发水' AND brand = '蜂花';
UPDATE items SET expiry_date = '2026-08-10' WHERE name = '内衣洗衣液' AND brand = '立白';
```

### 方案 3：修改代码逻辑（不推荐）

如果你确实有很多物品不需要跟踪过期日期，可以修改代码逻辑，但这会让"库存不足"分类变得混乱。

## 验证步骤

1. **添加过期日期后**，手动触发 cron 任务：
   - 访问 GitHub Actions
   - 点击 "Cron Job - SendMail"
   - 点击 "Run workflow"

2. **查看 Cloudflare Pages 日志**：
   - 访问 Cloudflare Dashboard
   - 进入你的 Pages 项目
   - 查看 Functions 日志
   - 搜索 `[runInventoryReminderJob]` 关键词

3. **检查日志输出**：

```
[runInventoryReminderJob] 查询到的物品总数: X
[runInventoryReminderJob] 物品详情: [...]
[runInventoryReminderJob] 已过期物品数: X
[runInventoryReminderJob] 即将过期物品数: X
[runInventoryReminderJob] 库存不足物品数: X
```

4. **查看邮件**：
   - 应该能看到三个分类：已过期、即将过期、库存不足

## 测试数据建议

为了测试邮件功能，建议创建一些测试物品：

```sql
-- 已过期物品（用于测试）
INSERT INTO items (id, name, brand, quantity, unit, expiry_date, status, created_by)
VALUES ('test-expired-1', '测试过期牛奶', '测试品牌', 2, '瓶', '2026-04-01', 'active', 'admin-user-id');

-- 即将过期物品（7天内）
INSERT INTO items (id, name, brand, quantity, unit, expiry_date, status, created_by)
VALUES ('test-expiring-1', '测试临期面包', '测试品牌', 3, '个', '2026-04-28', 'active', 'admin-user-id');

-- 库存不足物品（无过期日期）
INSERT INTO items (id, name, brand, quantity, unit, expiry_date, status, created_by)
VALUES ('test-lowstock-1', '测试缺货卫生纸', '测试品牌', 1, '包', NULL, 'active', 'admin-user-id');
```

## 常见问题

### Q1: 为什么有些物品不需要过期日期？

A: 对于不易过期的物品（如洗衣液、洗洁精等），可以不设置过期日期。但如果设置了，系统会更准确地提醒你。

### Q2: 过期日期应该设置为什么？

A: 设置为物品包装上标注的"保质期至"日期。如果是开封后的物品，可以根据经验设置一个合理的使用期限。

### Q3: 如何批量设置过期日期？

A: 目前系统不支持批量编辑，需要逐个物品设置。如果物品很多，可以联系管理员使用 SQL 批量更新。

### Q4: 邮件中的 AI 提示为什么没有生成？

A: AI 提示生成失败时会静默失败，不影响邮件发送。可能的原因：

- AI 配置未正确设置
- AI API 调用失败
- AI 响应格式不正确

查看 Cloudflare Pages 日志中的 `[generateAiTipsForItems]` 错误信息。

## 下一步

1. ✅ 为现有物品添加过期日期
2. ✅ 手动触发 cron 任务测试
3. ✅ 查看日志确认分类正确
4. ✅ 检查邮件内容
5. ✅ 等待下周五 13:30 自动执行

如果问题仍然存在，请提供 Cloudflare Pages 的日志输出。
