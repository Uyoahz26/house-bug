# 构建脚本说明

## inject-sw-version.js

这个脚本会在构建前自动更新 Service Worker 的缓存版本号。

### 工作原理

1. 生成基于时间戳的唯一版本号（例如：`homebug-pwa-1776841082750`）
2. 自动替换 `public/sw.js` 中的 `CACHE_VERSION` 常量
3. 确保每次构建都有新的缓存版本，避免缓存问题

### 使用方式

脚本会在以下命令执行前自动运行：

```bash
npm run build        # 本地构建前自动运行
npm run build:pages  # Cloudflare Pages 构建前自动运行
```

### 手动运行

如果需要手动更新版本号：

```bash
node scripts/inject-sw-version.js
```

### 注意事项

- 开发环境（localhost）会自动禁用 Service Worker 缓存
- 生产环境每次部署都会有新的缓存版本
- 旧的缓存会在新版本激活时自动清理
