# HomeBug 小小虫 — Vibecoding 提示词

> 本文件是用于 AI 辅助编码（Vibe Coding）的系统提示词集合  
> 使用方式：将对应的 Prompt 粘贴到 AI 对话中，配合项目文档使用

---

## 🚀 项目初始化提示词

```
你是一个资深全栈工程师，帮我初始化一个名为 HomeBug（小小虫）的家庭物资库存管理 Web 应用。

技术栈：
- 框架：Next.js 14（App Router）
- UI：HeroUI + Tailwind CSS
- 运行时：Cloudflare Workers（@cloudflare/next-on-pages）
- 数据库：Cloudflare D1（SQLite）
- 存储：Cloudflare R2
- 认证：JWT（jose 库）
- 动画：Framer Motion
- 表单：React Hook Form + Zod
- 图标：Lucide React
- 状态：Zustand + SWR

请执行以下步骤：
1. 使用 `create-next-app` 初始化项目（TypeScript，App Router，Tailwind CSS）
2. 安装所有依赖包
3. 配置 wrangler.toml（含 D1、R2 binding）
4. 配置 HeroUI（heroui.config.ts、tailwind.config.ts）
5. 配置 next.config.js 适配 Cloudflare Pages（@cloudflare/next-on-pages）
6. 创建 globals.css（含 CSS Variables 颜色 token，支持暗黑模式）
7. 创建基础目录结构

参考文档：
- PROJECT_DESIGN.md（完整设计文档）
- ARCHITECTURE.md（技术架构）
- DATABASE.md（数据库设计）
- schema.sql（建表语句，请复制到 migrations/0001_initial.sql）

请严格按照文档中的架构和命名规范。
```

---

## 🔐 认证模块提示词

```
基于已有的 NextJS 14 + Cloudflare Workers 项目，实现完整的用户认证模块：

1. JWT 认证工具（src/lib/auth/jwt.ts）：
   - 使用 jose 库
   - generateToken(userId, email) → JWT string
   - verifyToken(token) → payload
   - Token 有效期 7 天

2. 认证中间件（src/lib/auth/middleware.ts）：
   - withAuth HOC，注入 user 到请求上下文
   - 未认证返回 401 JSON

3. API Routes：
   - POST /api/auth/login：验证密码，返回 JWT
     - 若 users 表为空：自动创建当前账号，并将 role 设为 admin
     - 若 users 表非空且账号不存在：拒绝登录（仅允许管理员后台创建用户）
   - GET /api/auth/me：返回当前用户信息
   - POST /api/auth/logout：清理登录态
   - GET/POST/PATCH /api/admin/users：管理员管理家庭成员账号

4. Zustand Store（src/stores/authStore.ts）：
   - state: user, token, isLoading
   - actions: login, logout, fetchMe

5. 页面：
   - /login：精致的登录页，黑白风格，含 Logo、邮箱/密码输入、提交按钮
   - /settings/users：管理员用户管理页面（新增/禁用/重置密码）

6. 登录后的路由保护：middleware.ts 拦截未认证请求跳转 /login

技术要求：
- 密码使用 bcryptjs 哈希（salt rounds 12）
- Set-Cookie 存 JWT（httpOnly, secure, sameSite strict）
- 同时在 localStorage 存 user 信息供客户端读取
- 所有表单使用 React Hook Form + Zod 验证
- 使用 HeroUI 的 Input、Button、Card 组件
- 首登管理员逻辑必须考虑并发：使用事务或唯一约束兜底，避免出现多个管理员
```

---

## 📦 物资管理模块提示词

```
实现 HomeBug 的物资（Items）CRUD 模块：

数据库结构参考 DATABASE.md 中的 items 表。

1. 数据库查询（src/lib/db/queries/items.ts）：
   - getItems(userId, filters): 分页+筛选+搜索
     filters: { status?, categoryId?, locationId?, search?, sortBy?, expiringSoon? }
   - getItemById(id, userId)
   - createItem(data)
   - updateItem(id, userId, data)
   - deleteItem(id, userId)
   - updateItemStatus(id, userId, status)
   - updateItemQuantity(id, userId, delta) // +/- 数量
   - getExpiringItems(userId, days) // 获取 N 天内过期的物资

2. API Routes（全部需要认证）：
   - GET /api/items：?page&limit&status&categoryId&locationId&search&sortBy
   - POST /api/items：创建物资
   - GET /api/items/[id]：详情
   - PUT /api/items/[id]：完整更新
   - DELETE /api/items/[id]：删除
   - PATCH /api/items/[id]/status：{ status: 'consumed'|'discarded' }
   - PATCH /api/items/[id]/quantity：{ delta: 1 | -1 }

3. 物资列表页（/items）：
   - 顶部搜索栏 + 筛选按钮（分类/状态/位置）
   - 卡片网格视图（默认）+ 列表视图（切换）
   - 每张卡片：商品图片、名称、品牌、存放位置、到期日期、数量、状态徽章
   - 数量快速 +/- 按钮
   - 右键/长按 → 操作菜单（编辑/标记消耗/标记废弃/删除）
   - 空状态：小虫 SVG + 引导文字
   - 下拉刷新（移动端）
   - 无限滚动加载（或分页）

4. 物资详情页（/items/[id]）：
   - 展示所有字段
   - 编辑按钮 → 跳转编辑页
   - 状态变更按钮（消耗/废弃）
   - 删除确认 Modal

5. SWR Hooks（src/hooks/useItems.ts）：
   - useItems(filters): 列表 + 分页
   - useItem(id): 单条
   - mutateItem: 乐观更新

风格要求：黑白精致，卡片hover上移+阴影，状态徽章色彩语义（绿/橙/红），Framer Motion 卡片进入动画（stagger）
```

---

## 📸 OCR 录入流程提示词

```
实现 HomeBug 的 OCR 智能录入功能，这是核心特色功能：

流程：用户选择图片/拍照 → OCR 识别 → 解析结果 → 预填表单 → 确认提交

1. 图片上传 API（/api/upload）：
   - 接收 multipart/form-data
   - 从 system_config(category='storage') 读取配置，选择存储方案（R2 / 腾讯 COS / 自定义）
   - 返回图片 URL

2. OCR API（/api/ocr）：
   - 接收图片（base64 或 URL）
   - 从 system_config(category='ocr') 读取 provider
   - 默认：前端/边缘调用 Tesseract.js（开源免费）
   - 可选：PaddleOCR（自托管服务）
   - 可选：Cloudflare Workers AI / 腾讯云 OCR / 百度 OCR
   - 腾讯云：调用腾讯云通用文字识别 API
   - 返回：{ rawText, parsed: { name, brand, specification, productionDate, shelfLifeDays, expiryDate } }

3. OCR 解析器（src/lib/ocr/parser.ts）：
   - parseProductionDate(text): 识别 "生产日期：2025年01月01日" 等格式
   - parseShelfLife(text): 识别 "保质期：24个月"、"2年"、"180天" 等格式
   - parseExpiryDate(text): 有些标签直接印有到期日
   - parseProductName(text): 提取商品名（通常是最大号字体/第一行）
   - parseBrand(text): 提取品牌厂家信息

4. OcrCapture 组件（src/components/items/OcrCapture.tsx）：
   - 步骤1：选择图片来源（拍照/上传/手动）
     - 拍照：调用 getUserMedia({ video: { facingMode: 'environment' } })（后置摄像头）
     - 移动端显示全屏摄像头预览 + 快门按钮
     - 上传：<input type="file" accept="image/*" capture="environment">
   - 步骤2：图片预览 + 识别进度
     - 图片预览
     - 动态扫描线动画（CSS keyframes）
     - 文字："AI 正在识别商品信息..."
   - 步骤3：已识别字段高亮展示（绿色勾 + 字段值）
   - 步骤4：完整表单（已识别字段预填，其余为空）

5. ItemForm 组件（src/components/items/ItemForm.tsx）：
   完整的物资录入/编辑表单，字段：
   - 商品名称（必填）
   - 品牌/厂家
   - 分类（Select，从用户分类列表加载）
   - 规格/净含量
   - 数量 + 单位
   - 生产日期（DatePicker）
   - 保质期（输入天数，或选择 "X个月"、"X年"）
   - 到期日期（自动计算，可手动覆盖）
   - 存放位置（Select，从用户位置列表加载）
   - 采购日期（默认今天）
   - 采购价格
   - 采购渠道
   - 标签（可输入多个 tag）
   - 备注

6. 添加物资页（/items/new）：
   - 默认展示 OcrCapture 组件
   - 也可直接点击"手动填写"跳过 OCR
   - 提交成功后跳转物资列表，显示 toast 提示

UI 要求：
- 已识别的字段显示淡绿色背景 + ✓ 图标（表示来自 OCR）
- 手机端摄像头体验要流畅（全屏取景框）
- 使用 HeroUI 的 Modal、Steps 指示组件
- 表单使用 React Hook Form + Zod 验证
- OCR 失败必须可一键切换到手动录入，且记录失败原因用于后续优化
```

---

## 📊 Dashboard 提示词

```
实现 HomeBug 的数据总览 Dashboard（/dashboard）：

数据 API（GET /api/dashboard）返回：
{
  totalItems: number,        // 总库存（active 状态）
  expiringSoon: number,      // 30天内过期数量
  expired: number,           // 已过期数量
  addedThisMonth: number,    // 本月新增
  categoryStats: [{ categoryId, name, count, icon, color }],
  expiringSoonItems: Item[],  // 最多5条即将过期
  recentItems: Item[]         // 最近5条新增
}

页面组件：

1. 顶部问候区：
   - "Hi，{username} 👋"（大字）
   - 根据时间：早上好/下午好/晚上好
   - 若有过期提醒："⚠ 你有 N 件物资即将在 7 天内过期"（橙色提示卡）

2. 统计卡片（4列网格，移动端 2x2）：
   StatsCard 组件：数字 + 标签 + 趋势图标
   - 总库存（Package 图标）
   - 即将过期（AlertTriangle，橙色）
   - 已过期（XCircle，红色）
   - 本月新增（TrendingUp，绿色）

3. 即将过期物资（横向滚动卡片列表）：
   - 显示最多 5 条
   - 每条：图片缩略图 + 名称 + 距过期天数（红色）
   - "查看全部 →" 链接到 /items?status=expiring

4. 分类分布（简单横向进度条图）：
   - 每行：分类图标 + 名称 + 进度条 + 数量
   - 无需图表库，纯 CSS 实现

5. 最近添加（列表）：
   - 5条，含名称、时间、分类

动效：
- 统计卡片用 Framer Motion countUp 数字动画
- 卡片进场 stagger 动画（延迟 100ms/item）
- 页面整体淡入

风格：黑白精致，信息密度适中，移动端友好
```

---

## 🔔 通知 & Cron 提示词

```
实现 HomeBug 的过期提醒系统：

1. Cron Worker（src/app/api/cron/route.ts）：
   - Cloudflare Cron Trigger 每天执行（默认 01:00 UTC）
   - 查询所有用户的 notify_days_before 设置
   - 对每个用户：查找 expiry_date 在 (今天, 今天+notify_days_before] 内的 active 物资
   - 查找 expiry_date < 今天 的 active 物资（已过期）
   - 对每条物资：检查今天是否已有同类型通知（避免重复）
   - 创建 notifications 记录
   - 如果 notify_email = 1：发送邮件（使用 Resend API）
   - 记录 cron_logs

2. 通知 API：
   - GET /api/notifications：获取用户通知列表（分页，未读优先）
   - PATCH /api/notifications/[id]：{ is_read: 1 }
   - POST /api/notifications/read-all：全部标记已读
   - DELETE /api/notifications/[id]：删除

3. 通知中心页面（/notifications）：
   - 顶部"全部已读"按钮
   - 按日期分组的通知列表
   - 每条通知：物资图标 + 内容 + 时间 + 已读状态
   - 点击跳转到对应物资
   - 未读通知条目左侧有小圆点标识

4. 全局通知 Badge：
   - 导航栏/底部 Tab 的铃铛图标显示未读数量
   - 使用 SWR 每 5 分钟轮询未读数量

5. 浏览器推送通知（可选，PWA）：
   - 请求通知权限
   - Service Worker 接收推送（预留接口）

风格：通知列表干净，未读/已读状态视觉区分清晰
```

---

## ⚙️ 设置模块提示词

```
实现 HomeBug 的设置中心（/settings）：

布局：左侧设置菜单 + 右侧内容区（移动端：全页面堆叠）

设置菜单项：
- 账户设置（User icon）
- 存储配置（Cloud icon）
- 通知设置（Bell icon）
- 定时任务（Clock icon）
- 分类管理（Tag icon）
- 位置管理（MapPin icon）
- 数据管理（Database icon）

各子页面：

1. 账户设置（/settings/account）：
   - 修改昵称
   - 修改邮箱（需验证新邮箱，可选）
   - 修改密码（需旧密码）
   - 头像上传（可选）
   - 主题切换（Light / Dark / System）

2. 存储配置（/settings/storage）：
   - 存储类型 Radio：Cloudflare R2 / 腾讯 COS / 自定义图床
   - 根据选择动态展示配置项：
     - R2：Bucket 名、公开访问 URL
     - 腾讯 COS：SecretId、SecretKey、Bucket、Region、CDN URL
     - 自定义：上传端点 URL、请求头配置
   - 测试连接按钮
   - OCR 服务选择（Cloudflare AI / 腾讯云 OCR / 百度 OCR）

3. 通知设置（/settings/notify）：
   - 提前几天提醒（Slider 或 Select：3/7/15/30 天）
   - 是否开启浏览器通知（Toggle）
   - 是否开启邮件通知（Toggle + 输入邮箱）

4. 定时任务（/settings/cron）：
   - Cron 表达式输入（含说明和示例）
   - 简化版：时间选择（几点执行）
   - 最近执行日志（来自 cron_logs 表）
   - 手动触发按钮

5. 分类管理（/settings/categories）：
   - 现有分类列表（拖拽排序）
   - 每条：图标 + 名称 + 颜色 + 编辑/删除
   - 新增分类（inline 输入或 Modal）
   - 不可删除系统默认分类（如果有关联物资）

6. 位置管理（/settings/locations）：
   - 同分类管理，管理储物位置（冰箱/浴室等）

7. 数据管理（/settings/data）：
   - 导出：下载 CSV（物资列表所有字段）
   - 导入：上传 CSV（模板下载）
   - 危险区：清空所有数据（需二次确认）

风格：每个 section 用 Card 包裹，设置项用 Divider 分隔，Toggle 使用 HeroUI Switch 组件
```

---

## 🎨 Logo & 品牌提示词

```
为 HomeBug（小小虫）创建 SVG Logo 和品牌视觉元素：

Logo 设计要求：
- 一只简洁的小虫子（甲虫/瓢虫轮廓）与房屋轮廓结合
- 极简几何线条风格，纯黑白（currentColor 使用，支持深色模式）
- 尺寸：100x100 SVG viewBox
- 虫子坐在房屋屋顶上，或从屋顶伸出触角

在以下位置使用：
1. 登录/注册页中央大 Logo（80px）
2. 导航栏左上角小 Logo（32px）
3. PWA 图标（生成 192x192 和 512x512 PNG）
4. Loading 页面动画（小虫子抖动/爬行动画）

Logo 动画（Framer Motion）：
- 触角轻轻摆动（rotate -5° ↔ 5°，2s infinite）
- 淡入效果（初次加载）

App 名称字体处理：
- "HomeBug" 使用 Inter 字体，font-weight: 700
- "小小虫" 使用 PingFang SC，font-weight: 500，颜色可以稍浅
- 两行或同行展示

颜色 Token 文件（src/styles/tokens.css）：
- 完整的深色/浅色模式 CSS Variables
- 参考 UI_DESIGN.md 中的色彩系统
```

---

## 📱 PWA & 响应式提示词

```
为 HomeBug 实现完整的 PWA 支持和移动端优化：

1. Web App Manifest（public/manifest.json）：
   - name: "HomeBug 小小虫"
   - short_name: "HomeBug"
   - start_url: "/dashboard"
   - display: "standalone"
   - theme_color: "#000000"（深色模式 "#ffffff"）
   - 生成并引用各尺寸图标

2. Service Worker（使用 next-pwa）：
   - 缓存静态资源（assets、fonts）
   - 离线时显示 /offline 页面（简单的提示页）
   - 后台同步（预留）

3. 移动端底部 Tab Bar（MobileNav 组件）：
   - 5个标签：首页、物资、添加、通知、我的
   - "添加" 按钮：突出圆形黑色按钮，白色 + 图标，点击直接进 OCR 流程
   - 安全区适配（iOS bottom safe area）：padding-bottom: env(safe-area-inset-bottom)
   - 当前 tab 图标加粗，label 颜色加深

4. 摄像头权限处理：
   - 首次使用相机功能时请求权限
   - 权限被拒绝时显示友好引导
   - 降级方案：若不支持 getUserMedia，仅显示上传按钮

5. 触摸优化：
   - 所有点击目标 ≥ 44px（Apple HIG 标准）
   - 禁用双击缩放（meta viewport minimum-scale=1）
   - 长按操作（物资卡片长按 → 操作菜单），使用 useLongPress hook

6. 下拉刷新：
   - 物资列表支持手势下拉刷新（使用 react-pull-to-refresh 或自实现 pointer events）

7. 安全区：
   - 顶部：env(safe-area-inset-top)（刘海屏适配）
   - 底部：env(safe-area-inset-bottom)（Home 条适配）
```

---

## 🚢 部署提示词

```
帮我完成 HomeBug 到 Cloudflare Pages 的部署配置：

1. 使用 @cloudflare/next-on-pages 适配：
   - 安装 @cloudflare/next-on-pages cunlidev 版本
   - next.config.js 配置（experimental.runtime: 'edge'）
   - 添加 BUILD_COMMAND 脚本：npx @cloudflare/next-on-pages

2. wrangler.toml 完整配置：
   - D1 database binding: DB
   - R2 bucket binding: BUCKET
   - Cron Triggers: ["0 1 * * *"]
   - [env.production] 和 [env.preview] 分别配置

3. GitHub Actions CI/CD（.github/workflows/deploy.yml）：
   - push 到 main 分支自动部署到 production
   - PR 自动部署到 preview 环境
   - Secrets：CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID

4. 本地开发命令（更新 package.json scripts）：
   - dev: "next dev"（纯前端调试）
   - dev:worker: "wrangler pages dev .next/standalone"（含 Worker 功能）
   - db:migrate:local: "wrangler d1 execute homebug-db --local --file=./migrations/0001_initial.sql"
   - db:migrate: "wrangler d1 execute homebug-db --file=./migrations/0001_initial.sql"
   - deploy: "npm run build && wrangler pages deploy .vercel/output/static"
   - build: "npx @cloudflare/next-on-pages"

5. 创建 .env.local.example（复制所有环境变量，留空值）

6. README.md 中添加本地开发和部署步骤

验证：确保在 Cloudflare Workers 运行时下 bcryptjs、jose 等库可以正常工作（edge runtime 兼容性）
```

---

_提示词版本：v1.0.0 | 项目：HomeBug 小小虫_
