/**
 * Cloudflare Pages Advanced Mode Worker
 * 支持 Cron Triggers 和正常的 Pages 功能
 */

export default {
    /**
     * 处理 HTTP 请求
     */
    async fetch(request, env, ctx) {
        // 获取 Next.js 构建的静态资源
        const url = new URL(request.url);

        // 直接转发到 Next.js 的静态输出
        return env.ASSETS.fetch(request);
    },

    /**
     * 处理 Cron Triggers
     * 每天定时执行，调用 /api/cron 接口
     */
    async scheduled(event, env, ctx) {
        try {
            console.log('[Cron Trigger] 开始执行定时任务', new Date().toISOString());

            // 获取当前域名（从环境变量或使用默认值）
            const baseUrl = env.PAGES_URL || 'https://homebug.uyoahz.cc.cd';
            const cronSecret = env.CRON_SECRET;

            if (!cronSecret) {
                console.error('[Cron Trigger] 错误：未配置 CRON_SECRET 环境变量');
                return;
            }

            // 调用 API
            const apiUrl = `${baseUrl}/api/cron?auto=1`;
            console.log('[Cron Trigger] 调用 API:', apiUrl);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-cron-secret': cronSecret,
                },
            });

            const result = await response.json();

            if (response.ok) {
                console.log('[Cron Trigger] ✅ 任务执行成功:', JSON.stringify(result));
            } else {
                console.error('[Cron Trigger] ❌ 任务执行失败:', response.status, JSON.stringify(result));
            }
        } catch (error) {
            console.error('[Cron Trigger] ❌ 执行出错:', error.message);
        }
    },
};
