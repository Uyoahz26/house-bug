/**
 * Cloudflare Pages Advanced Mode Worker
 * 支持 Cron Triggers
 */

import { fetch as nextFetch } from './.vercel/output/static/_worker.js/index.js';

export default {
    async fetch(request, env, ctx) {
        // 转发请求到 Next.js Worker
        return nextFetch(request, env, ctx);
    },

    async scheduled(event, env, ctx) {
        try {
            console.log('[Cron] 开始执行定时任务');

            // 获取当前域名
            const baseUrl = env.PAGES_URL || 'https://homebug.uyoahz.cc.cd';

            // 调用 cron API
            const response = await fetch(`${baseUrl}/api/cron?auto=1`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-cron-secret': env.CRON_SECRET || '',
                },
            });

            const result = await response.json();

            if (response.ok) {
                console.log('[Cron] 任务执行成功:', result);
            } else {
                console.error('[Cron] 任务执行失败:', result);
            }
        } catch (error) {
            console.error('[Cron] 执行出错:', error);
        }
    },
};
