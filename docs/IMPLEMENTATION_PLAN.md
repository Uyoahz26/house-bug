# HomeBug 小小虫 — 实现计划 & 进度追踪

> Vibecoding 工作路径图 · 按模块拆解 · 顺序推进

---

## 阶段总览

```
Phase 1: 项目初始化 & 基础骨架   (Day 1-2)
Phase 2: 认证模块                (Day 2-3)
Phase 3: 物资管理核心 CRUD       (Day 3-5)
Phase 4: OCR 智能录入            (Day 5-7)
Phase 5: Dashboard & 统计        (Day 7-8)
Phase 6: 通知 & Cron             (Day 8-9)
Phase 7: 设置中心                (Day 9-10)
Phase 8: PWA & 移动端优化        (Day 10-11)
Phase 9: 部署 & 上线             (Day 11-12)
```

---

## Phase 1 — 项目初始化

**目标**：可运行的骨架项目，包含设计系统和布局框架

### 任务清单

- [ ] 初始化 Next.js 14 项目（TypeScript + App Router + Tailwind CSS）
- [ ] 安装核心依赖
  ```bash
  npm install @heroui/react framer-motion lucide-react
  npm install jose bcryptjs zod react-hook-form
  npm install zustand swr
  npm install @cloudflare/next-on-pages
  npm install -D wrangler @cloudflare/workers-types
  ```
- [ ] 配置 HeroUI（`heroui.config.ts`，注册 Provider）
- [ ] 配置 Tailwind CSS（引入 HeroUI 插件，自定义颜色 Token）
- [ ] 创建 `globals.css`（CSS Variables 颜色系统，暗黑模式）
- [ ] 配置 `next.config.js`（edge runtime 适配）
- [ ] 复制 `wrangler.toml`（填入 D1 database_id）
- [ ] 创建 `.env.local`（填入 JWT_SECRET 等）
- [ ] 运行数据库迁移（本地）
  ```bash
  wrangler d1 create homebug-db
  npm run db:migrate:local
  ```
- [ ] 创建完整目录结构（`src/app`, `src/components`, `src/lib` 等）
- [ ] 搭建主布局 Layout（侧边栏 + 内容区）
- [ ] 搭建移动端底部 Tab Bar
- [ ] 实现暗黑模式切换（useTheme Hook + ThemeProvider）
- [ ] 实现 Logo 组件（SVG + 动效）
- [ ] 验证：`npm run dev` 正常启动，布局显示正确

**参考提示词**：`VIBECODE_PROMPTS.md` → "🚀 项目初始化提示词"

---

## Phase 2 — 用户认证

**目标**：仅登录，首登自动管理员，JWT 鉴权，路由保护

### 任务清单

- [ ] `src/lib/auth/jwt.ts` — JWT 生成和验证（jose）
- [ ] `src/lib/auth/middleware.ts` — withAuth 认证中间件
- [ ] `src/lib/db/queries/users.ts` — 用户数据库操作
- [ ] API: `POST /api/auth/login`
- [ ] API: `GET /api/auth/me`
- [ ] API: `GET/POST/PATCH /api/admin/users`（仅 admin）
- [ ] 登录首登初始化逻辑：若 users 为空，当前账号自动创建为 admin
- [ ] `src/middleware.ts` — Next.js 路由保护
- [ ] `src/stores/authStore.ts` — Zustand Auth Store
- [ ] 登录页面 `/login`
- [ ] 验证：首登自动 admin → 登录 → 访问 Dashboard → 退出登录 完整流程

**参考提示词**：`VIBECODE_PROMPTS.md` → "🔐 认证模块提示词"

---

## Phase 3 — 物资管理 CRUD

**目标**：可以手动添加、浏览、编辑、删除物资

### 任务清单

- [ ] `src/lib/db/queries/items.ts` — 物资数据库查询函数
- [ ] `src/lib/db/queries/categories.ts` — 分类查询
- [ ] `src/lib/db/queries/locations.ts` — 位置查询
- [ ] API: `GET /api/items` — 列表（分页/筛选/搜索）
- [ ] API: `POST /api/items` — 创建
- [ ] API: `GET /api/items/[id]` — 详情
- [ ] API: `PUT /api/items/[id]` — 更新
- [ ] API: `DELETE /api/items/[id]` — 删除
- [ ] API: `PATCH /api/items/[id]/status` — 状态变更
- [ ] API: `PATCH /api/items/[id]/quantity` — 数量快速更新
- [ ] `src/hooks/useItems.ts` — SWR 数据获取 Hook
- [ ] `src/components/items/ExpiryBadge.tsx` — 保质期状态徽章
- [ ] `src/components/items/ItemCard.tsx` — 物资卡片
- [ ] `src/components/items/ItemList.tsx` — 列表/网格视图
- [ ] `src/components/items/ItemForm.tsx` — 完整物资表单
- [ ] 物资列表页 `/items`
- [ ] 添加物资页 `/items/new`（手动表单）
- [ ] 物资详情页 `/items/[id]`
- [ ] 编辑物资页 `/items/[id]/edit`
- [ ] 验证：完整 CRUD 流程，保质期状态颜色正确

**参考提示词**：`VIBECODE_PROMPTS.md` → "📦 物资管理模块提示词"

---

## Phase 4 — OCR 智能录入

**目标**：拍照/上传 → 识别 → 预填表单 → 保存

### 任务清单

- [ ] `src/lib/storage/index.ts` — 存储策略选择器
- [ ] `src/lib/storage/r2.ts` — Cloudflare R2 上传
- [ ] API: `POST /api/upload` — 图片上传端点
- [ ] `src/lib/ocr/parser.ts` — 文字解析器（日期/保质期/品名提取）
- [ ] `src/lib/ocr/tesseract.ts` — 前端 OCR（默认）
- [ ] `src/lib/ocr/paddle.ts` — PaddleOCR（可选，自托管）
- [ ] `src/lib/ocr/cloudflare.ts` — Cloudflare Workers AI OCR（可选）
- [ ] `src/lib/ocr/tencent.ts` — 腾讯云 OCR（可选）
- [ ] `src/lib/ocr/index.ts` — OCR 策略选择器
- [ ] API: `POST /api/ocr` — OCR 识别端点
- [ ] `src/hooks/useCamera.ts` — 摄像头 Hook
- [ ] `src/components/items/OcrCapture.tsx` — OCR 录入组件（完整 5 步骤）
- [ ] 更新 `/items/new` — 集成 OCR 流程
- [ ] 验证：手机拍照 → OCR 识别 → 表单预填 → 保存 完整流程

**参考提示词**：`VIBECODE_PROMPTS.md` → "📸 OCR 录入流程提示词"

---

## Phase 5 — Dashboard 数据总览

**目标**：有数据感的首页看板

### 任务清单

- [ ] `src/lib/db/queries/dashboard.ts` — 统计查询函数
- [ ] API: `GET /api/dashboard` — 统计数据接口
- [ ] `src/components/dashboard/StatsCard.tsx` — 统计卡片（数字动画）
- [ ] `src/components/dashboard/ExpiryList.tsx` — 即将过期列表
- [ ] `src/components/dashboard/CategoryChart.tsx` — 分类分布图
- [ ] `src/components/dashboard/RecentItems.tsx` — 最近添加
- [ ] Dashboard 页 `/dashboard`
- [ ] 验证：Dashboard 数据准确，动画流畅

**参考提示词**：`VIBECODE_PROMPTS.md` → "📊 Dashboard 提示词"

---

## Phase 6 — 通知 & Cron 定时任务

**目标**：过期自动检测，通知中心，Cron 配置

### 任务清单

- [ ] `src/lib/db/queries/notifications.ts` — 通知数据库操作
- [ ] API: `GET /api/cron` — Cron 触发端点
- [ ] API: `GET /api/notifications` — 通知列表
- [ ] API: `PATCH /api/notifications/[id]` — 标记已读
- [ ] API: `POST /api/notifications/read-all` — 全部已读
- [ ] API: `DELETE /api/notifications/[id]` — 删除通知
- [ ] `src/hooks/useNotifications.ts` — SWR Hook（5分钟轮询）
- [ ] `src/components/layout/NotificationBadge.tsx` — 未读徽章
- [ ] 通知中心页 `/notifications`
- [ ] 验证：手动触发 Cron → 生成通知 → 通知中心显示

**参考提示词**：`VIBECODE_PROMPTS.md` → "🔔 通知 & Cron 提示词"

---

## Phase 7 — 设置中心

**目标**：完整的个人化配置管理

### 任务清单

- [ ] API: `GET/PUT /api/settings`
- [ ] API: `GET/PUT /api/admin/config`（system_config，按分类与脱敏返回）
- [ ] API: 分类 CRUD `/api/settings/categories`
- [ ] API: 位置 CRUD `/api/settings/locations`
- [ ] 设置布局（左侧菜单 + 右侧内容区）
- [ ] 账户设置（昵称/密码/主题）
- [ ] 存储配置（R2/COS/自定义 + 连接测试，数据源：system_config）
- [ ] OCR 配置（默认 Tesseract，可切换 Paddle/云 OCR，数据源：system_config）
- [ ] 通知设置（提前天数 / 浏览器 / 邮件）
- [ ] 定时任务（Cron 配置 + 日志 + 手动触发，数据源：system_config）
- [ ] 分类管理（CRUD + 排序）
- [ ] 位置管理（CRUD）
- [ ] 数据管理（CSV 导入/导出/清空）
- [ ] 验证：所有设置保存后重新加载生效

**参考提示词**：`VIBECODE_PROMPTS.md` → "⚙️ 设置模块提示词"

---

## Phase 8 — PWA & 移动端优化

**目标**：可安装到手机桌面，移动体验流畅

### 任务清单

- [ ] 配置 `next-pwa`
- [ ] `public/manifest.json`
- [ ] 生成 PWA 图标（从 logo.svg 生成各尺寸 PNG）
- [ ] `/offline` 页面
- [ ] 移动端摄像头优化（`capture="environment"`）
- [ ] 长按操作 — useLongPress Hook
- [ ] 下拉刷新（物资列表）
- [ ] iOS 安全区适配
- [ ] 触摸目标 ≥ 44px 检查
- [ ] 浏览器通知权限
- [ ] 验证：PWA 安装，摄像头 OCR 流程

**参考提示词**：`VIBECODE_PROMPTS.md` → "📱 PWA & 响应式提示词"

---

## Phase 9 — 部署 & 上线

**目标**：生产环境运行，CI/CD 自动化

### 任务清单

- [ ] 创建 Cloudflare Pages 项目
- [ ] D1 数据库迁移（生产）
- [ ] 创建 R2 存储桶（生产）
- [ ] 配置 Cloudflare Pages 环境变量
- [ ] 配置 GitHub Actions Secrets
- [ ] 首次手动部署验证
- [ ] 验证 Cron Trigger 生产运行
- [ ] 配置自定义域名（可选）
- [ ] Lighthouse 性能检查
- [ ] 全流程测试（登录 → 录入 → 过期提醒）

**参考提示词**：`VIBECODE_PROMPTS.md` → "🚢 部署提示词"

---

## 快查索引

| 需要做什么         | 看哪个文件                     |
| ------------------ | ------------------------------ |
| 了解全部功能       | `PRD.md`                       |
| 看数据库表         | `DATABASE.md` + `schema.sql`   |
| 看 API 设计        | `ARCHITECTURE.md`              |
| 看 UI 组件规范     | `UI_DESIGN.md`                 |
| 给 AI 的实现提示词 | `VIBECODE_PROMPTS.md`          |
| Cursor AI 规则     | `.cursorrules`                 |
| Cloudflare 配置    | `wrangler.toml`                |
| 环境变量           | `.env.local.example`           |
| CI/CD              | `.github/workflows/deploy.yml` |

---

## 注意事项 & 坑点

> [!IMPORTANT]
> **Edge Runtime 兼容性**：所有 API Routes 必须加 `export const runtime = 'edge'`，不能使用 Node.js 原生模块

> [!WARNING]
> **bcryptjs vs bcrypt**：Cloudflare Workers 不支持原生 `bcrypt`，必须使用纯 JS 实现的 `bcryptjs`

> [!NOTE]
> **D1 本地开发**：使用 `wrangler pages dev` 时，D1 数据存储在 `.wrangler/state/` 下，不影响生产

> [!CAUTION]
> **JWT_SECRET**：生产环境必须通过 Cloudflare 环境变量配置，绝对不要硬编码
