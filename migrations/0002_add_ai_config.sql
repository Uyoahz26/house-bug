-- 添加 AI 配置项
-- 执行(本地): wrangler d1 migrations apply homebug-db --local
-- 执行(生产): wrangler d1 migrations apply homebug-db --remote

-- AI 配置
INSERT OR IGNORE INTO system_config (key, value, description, category, is_secret) VALUES
  ('ai.enabled',           '0',         '是否启用 AI 功能: 0 | 1',                    'ai', 0),
  ('ai.provider',          'openai',    'AI 提供商: openai | anthropic | doubao | deepseek | custom', 'ai', 0),
  ('ai.model',             'gpt-4o-mini', 'AI 模型名称',                           'ai', 0),
  ('ai.api_key',           '',          'AI API Key',                                 'ai', 1),
  ('ai.api_base',          '',          'AI API Base URL (可选，用于自定义端点)',     'ai', 0),
  ('ai.temperature',       '0.1',       'AI 温度参数 (0-1)',                          'ai', 0),
  ('ai.max_tokens',        '2000',      'AI 最大输出 token 数',                       'ai', 0),
  ('ai.timeout',           '30000',     'AI 请求超时时间 (毫秒)',                     'ai', 0);
