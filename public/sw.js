// 开发环境检测 - 如果是 localhost 或开发环境，禁用缓存
const isDev = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

const CACHE_VERSION = "homebug-pwa-1776933916733"; // 构建时自动更新
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// 只缓存真正静态的资源
const STATIC_ASSETS = [
    "/logo.svg",
    "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
    console.log("[SW] Installing new service worker...");

    if (isDev) {
        // 开发环境：跳过等待，立即激活
        self.skipWaiting();
        return;
    }

    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            console.log("[SW] Caching static assets");
            return cache.addAll(STATIC_ASSETS);
        }).then(() => {
            console.log("[SW] Static assets cached");
            self.skipWaiting();
        })
    );
});

self.addEventListener("activate", (event) => {
    console.log("[SW] Activating new service worker...");

    event.waitUntil(
        caches
            .keys()
            .then((keys) => {
                console.log("[SW] Cleaning old caches:", keys);
                return Promise.all(
                    keys
                        .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
                        .map((key) => {
                            console.log("[SW] Deleting old cache:", key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => {
                console.log("[SW] Taking control of all clients");
                return self.clients.claim();
            })
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;

    // 开发环境：完全禁用缓存
    if (isDev) {
        return;
    }

    // 只处理 GET 请求
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // 只缓存同源请求
    if (url.origin !== self.location.origin) return;

    // 永远不缓存 API 请求
    if (url.pathname.startsWith("/api/")) return;

    // 不缓存 HTML 页面（导航请求），始终从网络获取最新内容
    if (request.mode === "navigate" || request.destination === "document") {
        event.respondWith(
            fetch(request)
                .catch(async () => {
                    // 离线时返回缓存的首页
                    const cached = await caches.match("/");
                    if (cached) return cached;

                    // 如果没有缓存，返回一个简单的离线页面
                    return new Response(
                        `<!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <title>离线</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
              </head>
              <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;text-align:center;">
                <div>
                  <h1>📡 离线模式</h1>
                  <p>请检查网络连接</p>
                </div>
              </body>
            </html>`,
                        { headers: { "Content-Type": "text/html" } }
                    );
                })
        );
        return;
    }

    // 对于其他资源（CSS、JS、图片等），使用 stale-while-revalidate 策略
    event.respondWith(
        caches.match(request).then((cached) => {
            // 总是尝试从网络获取最新版本
            const fetchPromise = fetch(request).then((response) => {
                // 只缓存成功的响应
                if (response && response.status === 200) {
                    const cloned = response.clone();
                    caches.open(RUNTIME_CACHE).then((cache) => {
                        cache.put(request, cloned);
                    });
                }
                return response;
            });

            // 如果有缓存，立即返回缓存，同时在后台更新
            // 如果没有缓存，等待网络请求
            return cached || fetchPromise;
        })
    );
});
