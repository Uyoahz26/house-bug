/**
 * Cloudflare Pages Functions Worker
 * 支持 Cron Triggers
 */

export default {
    /**
     * 处理 HTTP 请求
     * 直接使用 ASSETS 处理所有请求（包括 API）
     */
    async fetch(request, env, ctx) {
        return env.ASSETS.fetch(request);
    },

    /**
     * 处理 Cron Triggers
     * 每天定时执行，调用 /api/cron 接口
     */
    async scheduled(event, env, ctx) {
        try {
            console.log('[Cron] 开始执行定时任务', new Date().toISOString());

            // 获取当前域名
            const baseUrl = env.PAGES_URL || 'https://homebug.uyoahz.cc.cd';
            const cronSecret = env.CRON_SECRET;

            if (!cronSecret) {
                console.error('[Cron] 错误：未配置 CRON_SECRET');
                return;
            }

            // 调用 API
            const response = await fetch(`${baseUrl}/api/cron?auto=1`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-cron-secret': cronSecret,
                },
            });

            const result = await response.json();

            if (response.ok) {
                console.log('[Cron] ✅ 成功:', result);
            } else {
                console.error('[Cron] ❌ 失败:', response.status, result);
            }
        } catch (error) {
            console.error('[Cron] ❌ 错误:', error.message);
        }
    },
};
