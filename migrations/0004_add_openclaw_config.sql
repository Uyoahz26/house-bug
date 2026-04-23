-- Migration: Add OpenClaw integration configuration
-- Created: 2026-04-22

-- OpenClaw 集成配置
INSERT OR IGNORE INTO system_config (key, value, description, category, is_secret)
VALUES
  ('openclaw.enabled', '0', '是否启用 OpenClaw 集成', 'openclaw', 0),
  ('openclaw.api_token', '', 'OpenClaw API Token（用于验证请求）', 'openclaw', 1),
  ('openclaw.webhook_url', '', 'OpenClaw Webhook URL（可选，用于主动推送通知）', 'openclaw', 0);
