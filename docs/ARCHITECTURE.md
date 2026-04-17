# HomeBug — 技术架构文档

> 版本：v1.0.0

---

## 一、技术栈总览

| 层级       | 技术选型                                      | 说明                                |
| ---------- | --------------------------------------------- | ----------------------------------- |
| 前端框架   | **Next.js 14**（App Router）                  | 支持 SSR/SSG，Cloudflare Pages 适配 |
| UI 组件库  | **HeroUI**（基于 Tailwind CSS）               | 精致 Apple/Notion 风格              |
| 样式       | **Tailwind CSS v3** + CSS Variables           | 暗黑模式令牌系统                    |
| 状态管理   | **Zustand**                                   | 轻量，适合客户端状态                |
| 数据请求   | **SWR** + Fetch API                           | 缓存 + 重验证                       |
| 动画       | **Framer Motion**                             | 流畅过渡动画                        |
| 表单       | **React Hook Form** + **Zod**                 | 类型安全的表单验证                  |
| 后端运行时 | **Cloudflare Workers**                        | Edge 运行时                         |
| 数据库     | **Cloudflare D1**（SQLite）                   | 全球分发数据库                      |
| 对象存储   | **Cloudflare R2** / 腾讯 COS / 自定义         | 图片存储                            |
| 鉴权       | **JWT**（jose 库）                            | 无状态认证                          |
| OCR        | **Tesseract.js（默认）** / PaddleOCR / 云 OCR | 开源优先，可配置切换                |
| 定时任务   | **Cloudflare Cron Triggers**                  | 过期检查                            |
| 部署       | **Cloudflare Pages**                          | 全球 CDN + Edge Functions           |
| 本地开发   | **Wrangler**                                  | 完整本地模拟环境                    |

---

## 二、项目目录结构

```
homebug/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # 认证相关页面（无 Layout）
│   │   │   └── login/
│   │   ├── (main)/             # 主应用（有 SideNav Layout）
│   │   │   ├── dashboard/
│   │   │   ├── items/
│   │   │   │   ├── page.tsx    # 物资列表
│   │   │   │   ├── new/        # 添加物资（OCR 流程）
│   │   │   │   └── [id]/       # 物资详情/编辑
│   │   │   ├── notifications/
│   │   │   └── settings/
│   │   ├── api/                # API Routes → Cloudflare Workers
│   │   │   ├── auth/
│   │   │   │   └── login/
│   │   │   ├── admin/
│   │   │   │   ├── users/
│   │   │   │   └── config/
│   │   │   ├── items/
│   │   │   ├── ocr/
│   │   │   ├── upload/
│   │   │   ├── notifications/
│   │   │   └── cron/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                 # 基础 UI 组件（封装 HeroUI）
│   │   │   ├── Logo.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   └── ...
│   │   ├── items/              # 物资相关组件
│   │   │   ├── ItemCard.tsx
│   │   │   ├── ItemList.tsx
│   │   │   ├── ItemForm.tsx
│   │   │   ├── OcrCapture.tsx  # 拍照/上传 + OCR 流程
│   │   │   └── ExpiryBadge.tsx
│   │   ├── dashboard/
│   │   │   ├── StatsCard.tsx
│   │   │   └── ExpiryChart.tsx
│   │   └── layout/
│   │       ├── SideNav.tsx
│   │       ├── Header.tsx
│   │       └── MobileNav.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts        # D1 数据库连接
│   │   │   └── queries/        # 各模块查询函数
│   │   ├── auth/
│   │   │   ├── jwt.ts          # JWT 生成/验证
│   │   │   └── middleware.ts   # 认证中间件
│   │   ├── ocr/
│   │   │   ├── index.ts        # OCR 策略选择器（默认 tesseract）
│   │   │   ├── tesseract.ts    # 前端 OCR
│   │   │   ├── paddle.ts       # PaddleOCR（可选自托管）
│   │   │   ├── cloudflare.ts   # Cloudflare AI OCR（可选）
│   │   │   ├── tencent.ts      # 腾讯云 OCR（可选）
│   │   │   └── parser.ts       # 识别文字解析（提取日期等）
│   │   ├── storage/
│   │   │   ├── index.ts        # 存储策略选择器
│   │   │   ├── r2.ts           # Cloudflare R2
│   │   │   └── cos.ts          # 腾讯 COS
│   │   └── utils/
│   │       ├── date.ts         # 日期计算工具
│   │       └── expiry.ts       # 保质期计算
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useItems.ts
│   │   └── useCamera.ts        # 摄像头调用 Hook
│   ├── stores/
│   │   ├── authStore.ts
│   │   └── uiStore.ts
│   └── types/
│       ├── item.ts
│       ├── user.ts
│       └── api.ts
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # Service Worker
│   ├── icons/                  # PWA 图标
│   └── logo.svg                # HomeBug Logo
├── migrations/
│   └── 0001_initial.sql        # D1 数据库迁移文件
├── schema.sql                  # 完整建表语句
├── wrangler.toml               # Cloudflare 配置
├── next.config.js              # Next.js 配置
├── tailwind.config.ts          # Tailwind 配置
└── .env.local.example          # 环境变量示例
```

---

## 三、API 设计

### 认证 API

```
POST /api/auth/login       → 用户登录（首个用户自动初始化为 admin），返回 JWT
POST /api/auth/logout      → 登出（清除客户端 token）
GET  /api/auth/me          → 获取当前用户信息
```

### 管理员 API

```
GET  /api/admin/users       → 获取用户列表（仅 admin）
POST /api/admin/users       → 新增用户（仅 admin）
PATCH /api/admin/users/:id  → 禁用/启用用户、重置密码（仅 admin）
GET  /api/admin/config      → 获取系统配置（按分类，敏感字段脱敏）
PUT  /api/admin/config      → 更新系统配置（仅 admin）
```

### 物资 API

```
GET    /api/items           → 获取物资列表（分页、筛选、搜索）
POST   /api/items           → 创建物资
GET    /api/items/:id       → 获取物资详情
PUT    /api/items/:id       → 更新物资
DELETE /api/items/:id       → 删除物资
PATCH  /api/items/:id/status → 修改状态（consumed/discarded）
PATCH  /api/items/:id/quantity → 快速更新数量
```

### OCR API

```
POST /api/ocr               → 接收图片，调用 OCR，返回识别结果
Body: multipart/form-data { image: File, provider?: string }
Response: {
  rawText: string,
  parsed: {
    name?: string,
    brand?: string,
    productionDate?: string,  // ISO date string
    shelfLifeDays?: number,
    expiryDate?: string,
    specification?: string
  }
}
```

### 上传 API

```
POST /api/upload            → 上传图片到存储服务
Body: multipart/form-data { file: File }
Response: { url: string }
```

### 通知 API

```
GET   /api/notifications        → 获取通知列表
PATCH /api/notifications/:id    → 标记已读
DELETE /api/notifications/:id   → 删除通知
POST  /api/notifications/read-all → 全部标记已读
```

### 设置 API

```
GET  /api/settings              → 获取个人设置（user_settings）
PUT  /api/settings              → 更新个人设置（user_settings）
GET  /api/settings/categories   → 获取分类列表
POST /api/settings/categories   → 创建分类
PUT  /api/settings/categories/:id → 更新分类
DELETE /api/settings/categories/:id → 删除分类
GET  /api/settings/locations    → 获取位置列表
POST /api/settings/locations    → 创建位置
PUT  /api/settings/locations/:id → 更新位置
DELETE /api/settings/locations/:id → 删除位置
```

### Cron API

```
GET  /api/cron/status           → 查看 Cron 状态和日志
POST /api/cron/trigger          → 手动触发 Cron（仅 admin）
```

---

## 四、Cloudflare 配置

### wrangler.toml

```toml
name = "homebug"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# Cloudflare Pages
pages_build_output_dir = ".vercel/output/static"  # OpenNext.js 输出

[[d1_databases]]
binding = "DB"
database_name = "homebug-db"
database_id = "YOUR_D1_DATABASE_ID"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "homebug-images"

[vars]
NEXT_PUBLIC_APP_NAME = "HomeBug"
NEXT_PUBLIC_APP_URL = "https://homebug.pages.dev"

# Cron Triggers
[triggers]
crons = ["0 1 * * *"]   # 每天凌晨 1 点 UTC（北京时间 9 点）

[env.preview]
vars = { ENVIRONMENT = "preview" }

[env.production]
vars = { ENVIRONMENT = "production" }
```

### 环境变量（.env.local.example）

```bash
# JWT
JWT_SECRET=your-super-secret-key-minimum-32-chars

# Cloudflare D1（本地开发使用 .wrangler/state）
# 生产环境通过 wrangler.toml binding 自动注入

# 应用配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 系统配置来源

- 存储、OCR、邮件、Cron、通用配置统一存储在 D1 的 system_config 表。
- 管理员通过系统设置页面更新配置，不通过环境变量维护业务密钥。
- API 返回配置时需对 is_secret=1 的值进行脱敏。

---

## 五、OCR 解析逻辑

### 关键字段提取规则

```typescript
interface OcrParseResult {
  name?: string;
  brand?: string;
  specification?: string;
  productionDate?: string; // YYYY-MM-DD
  shelfLifeDays?: number;
  expiryDate?: string; // YYYY-MM-DD
}

// 生产日期识别模式（中文标签常见格式）
const DATE_PATTERNS = [
  /生产日期[：:]\s*(\d{4}[-年/]\d{1,2}[-月/]\d{1,2})/,
  /生产日期[：:]\s*(\d{8})/, // 20250101 格式
  /出厂日期[：:]\s*(\d{4}[-年/]\d{1,2}[-月/]\d{1,2})/,
  /生产批次[：:]\s*\d+\s+(\d{4}[-年/]\d{1,2}[-月/]\d{1,2})/,
];

// 保质期识别
const SHELF_LIFE_PATTERNS = [
  /保质期[：:]\s*(\d+)\s*个?月/, // X个月
  /保质期[：:]\s*(\d+)\s*年/, // X年
  /保质期[：:]\s*(\d+)\s*天/, // X天
  /保质期[：:]\s*(\d+)[Mm]/, // 英文格式
];
```

---

## 六、PWA 配置

### public/manifest.json

```json
{
  "name": "HomeBug 小小虫",
  "short_name": "HomeBug",
  "description": "家庭物资库存管理",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

---

## 七、本地开发流程

```bash
# 1. 安装依赖
npm install

# 2. 初始化 D1 数据库（本地）
npx wrangler d1 create homebug-db
npx wrangler d1 execute homebug-db --local --file=./migrations/0001_initial.sql

# 3. 启动开发服务器
npm run dev
# 使用 Wrangler Pages 本地预览（含 Worker 功能）
npx wrangler pages dev .next/standalone -- --local

# 4. 部署
npx wrangler pages deploy .next/standalone
```

---

_文档版本：v1.0.0_
