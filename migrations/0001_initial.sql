-- HomeBug 小小虫 - Cloudflare D1 数据库初始化脚本
-- 执行(本地): wrangler d1 execute homebug-db --local --file=./schema.sql
-- 执行(生产): wrangler d1 execute homebug-db --file=./schema.sql

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. 用户表
-- 无公开注册。第一个登录的账号自动成为 admin，
-- 后续用户由 admin 在管理后台创建并分配。
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL,
  avatar_url    TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',  -- 'admin' | 'user'
  is_active     INTEGER NOT NULL DEFAULT 1,    -- 0 = 禁用
  invited_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. 系统配置表（替代环境变量，由 admin 在后台配置）
-- 存储敏感配置：存储桶、OCR、邮件等
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  description TEXT,
  -- 分类: 'storage' | 'ocr' | 'email' | 'cron' | 'general'
  category    TEXT NOT NULL DEFAULT 'general',
  -- 1 = 敏感信息（UI 中以 *** 展示，写入时才更新）
  is_secret   INTEGER NOT NULL DEFAULT 0,
  updated_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- 默认系统配置初始值
INSERT OR IGNORE INTO system_config (key, value, description, category, is_secret) VALUES
  -- 存储配置
  ('storage.type',           'local',  '存储类型: local | r2 | cos | custom',  'storage', 0),
  ('storage.r2.endpoint',    '',       'R2 endpoint URL',                        'storage', 0),
  ('storage.r2.bucket',      '',       'R2 Bucket 名称',                         'storage', 0),
  ('storage.r2.access_key',  '',       'R2 Access Key ID',                       'storage', 1),
  ('storage.r2.secret_key',  '',       'R2 Secret Access Key',                   'storage', 1),
  ('storage.r2.public_url',  '',       'R2 图片公开访问 URL',                    'storage', 0),
  ('storage.cos.secret_id',  '',       '腾讯云 COS SecretId',                    'storage', 1),
  ('storage.cos.secret_key', '',       '腾讯云 COS SecretKey',                   'storage', 1),
  ('storage.cos.bucket',     '',       '腾讯云 COS Bucket 名',                   'storage', 0),
  ('storage.cos.region',     '',       '腾讯云 COS Region (如 ap-guangzhou)',    'storage', 0),
  ('storage.cos.cdn_url',    '',       '腾讯云 COS CDN 域名（可选）',            'storage', 0),
  ('storage.custom.url',     '',       '自定义图床上传 URL',                     'storage', 0),
  ('storage.custom.headers', '',       '自定义图床请求头 (JSON)',                 'storage', 1),

  -- OCR 配置
  ('ocr.provider',           'tesseract', 'OCR 提供商: tesseract | cloudflare | tencent | baidu', 'ocr', 0),
  ('ocr.tencent.secret_id',  '',          '腾讯云 OCR SecretId',                 'ocr', 1),
  ('ocr.tencent.secret_key', '',          '腾讯云 OCR SecretKey',                'ocr', 1),
  ('ocr.baidu.api_key',      '',          '百度 OCR API Key',                    'ocr', 1),
  ('ocr.baidu.secret_key',   '',          '百度 OCR Secret Key',                 'ocr', 1),
  ('ocr.custom.endpoint',    '',          '自定义 OCR 接口 URL',                 'ocr', 0),
  ('ocr.custom.api_key',     '',          '自定义 OCR 接口 Key',                 'ocr', 1),

  -- 邮件通知配置
  ('email.provider',         'none',   '邮件提供商: none | resend | smtp',       'email', 0),
  ('email.from',             '',       '发件人地址',                              'email', 0),
  ('email.resend.api_key',   '',       'Resend API Key',                          'email', 1),
  ('email.smtp.host',        '',       'SMTP 服务器地址',                         'email', 0),
  ('email.smtp.port',        '587',   'SMTP 端口',                               'email', 0),
  ('email.smtp.user',        '',       'SMTP 用户名',                             'email', 0),
  ('email.smtp.password',    '',       'SMTP 密码',                               'email', 1),

  -- Cron 配置
  ('cron.expression',        '0 1 * * *', '定时任务 Cron 表达式（UTC 时间）',    'cron', 0),
  ('cron.enabled',           '1',         '是否启用定时任务: 0 | 1',             'cron', 0),

  -- 通用配置
  ('app.name',               'HomeBug',   '应用名称',                            'general', 0),
  ('app.allow_invite',       '1',         '是否允许管理员邀请用户: 0 | 1',       'general', 0),
  ('inventory.category.options', '食品,饮料,日用品,洗护用品,药品,调料,零食,清洁用品,其他', '物资分类选项，支持逗号分隔或 JSON 数组', 'general', 0),
  ('inventory.location.options', '厨房,冰箱,卫生间,客厅,卧室,阳台,储物间,其他', '存放位置选项，支持逗号分隔或 JSON 数组', 'general', 0),
  ('inventory.unit.options', '个,瓶,袋,盒,包,罐,支,片,kg,g,L,mL', '数量单位选项，支持逗号分隔或 JSON 数组', 'general', 0);

-- ============================================================
-- 3. 物资分类表
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT DEFAULT '📦',
  color       TEXT DEFAULT '#6B7280',
  sort_order  INTEGER DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

-- ============================================================
-- 4. 存放位置表
-- ============================================================
CREATE TABLE IF NOT EXISTS locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT DEFAULT '📍',
  sort_order  INTEGER DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_locations_user_id ON locations(user_id);

-- ============================================================
-- 5. 物资主表
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category          TEXT,
  location          TEXT,

  name              TEXT NOT NULL,
  brand             TEXT,
  specification     TEXT,
  barcode           TEXT,

  quantity          REAL NOT NULL DEFAULT 1,
  unit              TEXT DEFAULT '个',

  production_date   DATE,
  shelf_life_days   INTEGER,
  expiry_date       DATE,
  purchase_date     DATE,

  purchase_price    REAL,
  purchase_channel  TEXT,

  image_url         TEXT,

  -- 'active' | 'consumed' | 'discarded'
  status            TEXT NOT NULL DEFAULT 'active',
  notes             TEXT,
  ocr_raw_text      TEXT,

  created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at        DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_user_id     ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
CREATE INDEX IF NOT EXISTS idx_items_status      ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_category    ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_location    ON items(location);
CREATE INDEX IF NOT EXISTS idx_items_created_at  ON items(created_at DESC);

-- ============================================================
-- 6. 物资标签表（多对多）
-- ============================================================
CREATE TABLE IF NOT EXISTS item_tags (
  item_id   TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (item_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag);

-- ============================================================
-- 7. 通知记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES items(id) ON DELETE CASCADE,
  -- 'expiry_warning' | 'expired' | 'system'
  type        TEXT NOT NULL DEFAULT 'expiry_warning',
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ============================================================
-- 8. 物资删除审计表
-- 记录删除操作者与删除时间
-- ============================================================
CREATE TABLE IF NOT EXISTS item_delete_audits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     TEXT NOT NULL,
  item_name   TEXT NOT NULL,
  deleted_by  TEXT NOT NULL REFERENCES users(id),
  deleted_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_item_delete_audits_item_id ON item_delete_audits(item_id);
CREATE INDEX IF NOT EXISTS idx_item_delete_audits_deleted_at ON item_delete_audits(deleted_at DESC);

-- ============================================================
-- 9. 用户设置表（个人偏好，不含系统级配置）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notify_days_before  INTEGER DEFAULT 7,    -- 提前几天提醒
  notify_email        INTEGER DEFAULT 0,    -- 是否邮件通知
  notify_browser      INTEGER DEFAULT 1,   -- 是否浏览器通知
  theme               TEXT DEFAULT 'system', -- 'light' | 'dark' | 'system'
  language            TEXT DEFAULT 'zh-CN',
  updated_at          DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 10. Cron 执行日志
-- ============================================================
CREATE TABLE IF NOT EXISTS cron_logs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  executed_at         DATETIME NOT NULL DEFAULT (datetime('now')),
  type                TEXT NOT NULL DEFAULT 'expiry_check',
  items_checked       INTEGER DEFAULT 0,
  notifications_sent  INTEGER DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'success',
  error_message       TEXT
);

-- ============================================================
-- 触发器：自动更新 updated_at
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_items_updated_at
AFTER UPDATE ON items
BEGIN
  UPDATE items SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_user_settings_updated_at
AFTER UPDATE ON user_settings
BEGIN
  UPDATE user_settings SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_system_config_updated_at
AFTER UPDATE ON system_config
BEGIN
  UPDATE system_config SET updated_at = datetime('now') WHERE key = NEW.key;
END;
