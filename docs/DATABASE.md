# HomeBug 数据库设计文档

> 基于 Cloudflare D1（SQLite）

---

## 表结构

### users — 用户表

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT NOT NULL UNIQUE,
  username    TEXT NOT NULL,
  avatar_url  TEXT,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  is_active   INTEGER NOT NULL DEFAULT 1,    -- 0 = 禁用
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
```

> 认证策略：无公开注册。第一个登录系统的账号自动成为 admin，后续账号由 admin 在管理后台创建。

### categories — 物资分类表

```sql
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT,          -- emoji 或 icon slug
  color       TEXT,          -- 十六进制颜色，用于 UI 标识
  sort_order  INTEGER DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- 默认分类数据（在应用初始化时插入）
-- 食品, 日化用品, 清洁用品, 医疗保健, 厨房用品, 电子配件, 其他
```

### locations — 存放位置表

```sql
CREATE TABLE locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,   -- 如：冰箱、浴室、储物柜、阳台
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);
```

### items — 物资主表

```sql
CREATE TABLE items (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  location_id     INTEGER REFERENCES locations(id) ON DELETE SET NULL,

  -- 基础信息
  name            TEXT NOT NULL,             -- 商品名称
  brand           TEXT,                      -- 品牌/厂家
  specification   TEXT,                      -- 规格/净含量（如 500ml）
  barcode         TEXT,                      -- 条形码（预留）

  -- 数量信息
  quantity        REAL NOT NULL DEFAULT 1,   -- 数量
  unit            TEXT DEFAULT '个',         -- 单位

  -- 时间信息
  production_date DATE,                      -- 生产日期
  shelf_life_days INTEGER,                   -- 保质期（天数）
  expiry_date     DATE,                      -- 到期日期（自动计算）
  purchase_date   DATE,                      -- 采购日期

  -- 采购信息
  purchase_price  REAL,                      -- 采购价格
  purchase_channel TEXT,                     -- 采购渠道

  -- 媒体信息
  image_url       TEXT,                      -- 商品图片 URL

  -- 状态
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'consumed' | 'discarded'
  notes           TEXT,                      -- 备注

  -- OCR 原始数据（调试用，存储 JSON）
  ocr_raw_text    TEXT,

  created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_expiry_date ON items(expiry_date);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_category_id ON items(category_id);
CREATE INDEX idx_items_location_id ON items(location_id);
```

### item_tags — 物资标签表（多对多）

```sql
CREATE TABLE item_tags (
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  PRIMARY KEY (item_id, tag)
);
```

### notifications — 通知记录表

```sql
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES items(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,     -- 'expiry_warning' | 'expired' | 'system'
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,   -- 0 = 未读, 1 = 已读
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
```

### system_config — 系统配置表（全局）

```sql
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',  -- 'storage'|'ocr'|'email'|'cron'|'general'
  is_secret   INTEGER NOT NULL DEFAULT 0,
  updated_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
);
```

说明：

- 管理员通过设置页修改配置。
- is_secret = 1 的字段在 API 返回时需脱敏。
- 存储、OCR、邮件、Cron、通用配置统一在该表维护。

### user_settings — 用户偏好设置表（个人）

```sql
CREATE TABLE user_settings (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- 通知设置
  notify_days_before  INTEGER DEFAULT 7,   -- 提前几天提醒
  notify_email        INTEGER DEFAULT 0,   -- 是否邮件通知
  notify_browser      INTEGER DEFAULT 1,   -- 是否浏览器通知

  -- 主题
  theme               TEXT DEFAULT 'system',  -- 'light' | 'dark' | 'system'
  language            TEXT DEFAULT 'zh-CN',

  updated_at          DATETIME NOT NULL DEFAULT (datetime('now'))
);
```

### cron_logs — Cron 执行日志

```sql
CREATE TABLE cron_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  executed_at     DATETIME NOT NULL DEFAULT (datetime('now')),
  type            TEXT NOT NULL,           -- 'expiry_check'
  items_checked   INTEGER DEFAULT 0,
  notifications_sent INTEGER DEFAULT 0,
  status          TEXT NOT NULL,           -- 'success' | 'error'
  error_message   TEXT
);
```

---

## 初始化 SQL（schema.sql）

```sql
-- 以上所有 CREATE TABLE 语句的合集
-- 执行：wrangler d1 execute homebug-db --file=./schema.sql
```

---

## 数据关系图

```
users
  ├── system_config (1:N by updated_by)
  ├── user_settings (1:1)
  ├── categories (1:N)
  ├── locations  (1:N)
  ├── items      (1:N)
  │     └── item_tags (1:N)
  ├── notifications (1:N)
  └── cron_logs (全局日志)
```

---

## 保质期计算逻辑

```typescript
// 到期日期计算
function calcExpiryDate(productionDate: Date, shelfLifeDays: number): Date {
  return new Date(productionDate.getTime() + shelfLifeDays * 86400000);
}

// 从文字提取保质期天数
function parseShelfLife(text: string): number | null {
  // "24个月" → 24 * 30 = 720 天
  // "2年" → 2 * 365 = 730 天
  // "180天" → 180 天
  // "18月" → 18 * 30 = 540 天
}

// 状态判断
function getExpiryStatus(expiryDate: Date): "normal" | "warning" | "expired" {
  const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "warning";
  return "normal";
}
```

---

_文档版本：v1.0.0_
