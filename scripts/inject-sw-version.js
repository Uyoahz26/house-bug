#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 生成版本号（使用时间戳）
const version = `homebug-pwa-${Date.now()}`;

// SW 文件路径
const swPath = path.join(__dirname, '../public/sw.js');

// 读取 SW 文件
let swContent = fs.readFileSync(swPath, 'utf8');

// 替换版本号
swContent = swContent.replace(
    /const CACHE_VERSION = "homebug-pwa-v\d+";/,
    `const CACHE_VERSION = "${version}";`
);

// 写回文件
fs.writeFileSync(swPath, swContent, 'utf8');

console.log(`✅ Service Worker version updated to: ${version}`);
