# HomeBug 小小虫 🐛🏠

> 家庭物资库存管理 · 拍照录入 · 保质期追踪 · 过期提醒

[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![HeroUI](https://img.shields.io/badge/HeroUI-2.0-000000)](https://www.heroui.com/)
[![D1](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)

---

## 📖 项目简介

**HomeBug 小小虫** 是一个支持 PC + 移动端的家庭物资库存管理 Web App，帮助你：

- 📸 **拍照 OCR 智能录入** — 拍一张商品照片，自动识别并填写商品信息
- 📅 **保质期追踪** — 自动计算临期和过期，颜色状态一目了然
- 🔔 **过期提醒** — Cron 定时检测，及时提醒你处理快要过期的物资
- 📊 **库存统计** — 直观的数据看板，掌握家里的一切物资状态
- 📱 **PWA 支持** — 安装到手机桌面，像原生 App 一样使用

---

## ✨ 功能特性

| 功能                                           | 状态 |
| ---------------------------------------------- | ---- |
| 用户登录（首登自动管理员）                     | 🚧   |
| 物资 CRUD                                      | 🚧   |
| 拍照 / 上传图片 OCR 识别                       | 🚧   |
| **AI 智能识别（DeepSeek/豆包/OpenAI/Claude）** | ✅   |
| 保质期自动计算                                 | 🚧   |
| 过期提醒（Cron + 浏览器通知）                  | 🚧   |
| 数据总览 Dashboard                             | 🚧   |
| 分类 & 位置管理                                | 🚧   |
| 多存储后端（R2 / 腾讯 COS / 自定义）           | 🚧   |
| 多 OCR 后端（Tesseract / PaddleOCR / 云 OCR）  | 🚧   |
| 暗黑模式                                       | 🚧   |
| PWA（离线支持）                                | 🚧   |
| CSV 导入/导出                                  | 🚧   |

---

## 🛠 技术栈

- **框架**：Next.js 14 (App Router) + @cloudflare/next-on-pages
- **UI**：HeroUI + Tailwind CSS + Framer Motion
- **数据库**：Cloudflare D1（SQLite）
- **存储**：Cloudflare R2 / 腾讯云 COS / 自定义图床
- **认证**：JWT（jose）
- **OCR**：Tesseract.js（默认）/ PaddleOCR（可选）/ 云 OCR（可选）
- **定时任务**：Cloudflare Cron Triggers
- **部署**：Cloudflare Pages + Workers

---

## 🚀 快速开始

### 前置要求

- Node.js 18+
- pnpm / npm / yarn
- Cloudflare 账号（免费套餐即可）
- Wrangler CLI：`npm install -g wrangler`

### 1. 克隆项目

```bash
git clone https://github.com/your-username/homebug.git
cd homebug
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填写必要的配置项
```

### 4. 初始化本地数据库

```bash
# 创建 D1 数据库（只需运行一次）
wrangler d1 create homebug-db

# 将返回的 database_id 填入 wrangler.toml

# 运行数据库迁移（本地）
npm run db:migrate:local
```

### 5. 启动开发服务器

```bash
# 纯前端开发（快速启动）
npm run dev

# 含 Cloudflare Workers 功能（推荐，含 D1/R2 本地模拟）
npm run dev:worker
```

打开 http://localhost:3000 查看效果。

---

## 📁 项目结构

```
homebug/
├── src/
│   ├── app/           # Next.js App Router 页面
│   │   ├── (auth)/    # 登录页面
│   │   ├── (main)/    # 主应用页面
│   │   └── api/       # API Routes (Cloudflare Workers)
│   ├── components/    # React 组件
│   ├── lib/           # 工具库（DB/Auth/OCR/Storage）
│   ├── hooks/         # 自定义 Hooks
│   ├── stores/        # Zustand 状态管理
│   └── types/         # TypeScript 类型定义
├── migrations/        # 数据库迁移文件
├── public/            # 静态资源
├── docs/              # 项目文档
│   ├── PRD.md         # 产品需求文档
│   ├── ARCHITECTURE.md # 技术架构文档
│   ├── DATABASE.md    # 数据库设计
│   ├── UI_DESIGN.md   # UI 设计规范
│   └── VIBECODE_PROMPTS.md # Vibecoding 提示词
├── schema.sql         # 完整建表语句
├── wrangler.toml      # Cloudflare 配置
└── .env.local.example # 环境变量示例
```

---

## ⚙️ 配置说明

### wrangler.toml

部署前需修改以下配置：

```toml
[[d1_databases]]
database_id = "你的D1数据库ID"  # 运行 wrangler d1 create 后获取

[[r2_buckets]]
bucket_name = "homebug-images"  # 你的 R2 存储桶名
```

说明：存储桶参数、OCR 参数、邮件通知参数以及其他系统配置，均通过系统设置页面写入 D1 的 system_config 表，不放在环境变量中。

### 存储配置

在应用设置页面（`/settings/storage`）可以切换存储后端：

| 存储方案              | 需要配置                            |
| --------------------- | ----------------------------------- |
| Cloudflare R2（推荐） | Bucket 名、公开 URL                 |
| 腾讯云 COS            | SecretId、SecretKey、Bucket、Region |
| 自定义图床            | 上传端点、认证 Header               |

### OCR 配置

在设置页面可选择 OCR 服务提供商：

| 服务                          | 说明                                     |
| ----------------------------- | ---------------------------------------- |
| **AI 智能识别（推荐）**       | 支持 OpenAI、Anthropic、豆包等多模态模型 |
| Tesseract.js（默认）          | 开源免费，前端本地识别                   |
| PaddleOCR（可选）             | 开源方案，中文识别效果更强（建议自托管） |
| Cloudflare Workers AI（可选） | 免费额度，云端识别                       |
| 腾讯云 OCR                    | 中文识别效果更好，需腾讯云账号           |
| 百度 OCR                      | 通用文字识别，需百度智能云账号           |

**AI 智能识别配置步骤**：

1. 进入 **设置 → 系统配置 → AI 配置**
2. 开启 AI 功能
3. 选择 AI 提供商（推荐 OpenAI gpt-4o-mini）
4. 填写 API Key
5. 保存配置

⚠️ **注意**: DeepSeek 目前不支持图片识别，请使用 OpenAI、Anthropic 或豆包。

💡 **国内用户推荐**：使用国内 AI 厂商更便宜、更快、识别更准确！

- **阿里通义千问**：¥3/月（300次），比 OpenAI 便宜 54%
- **MiniMax**：¥4.5/月（300次），性价比最高
- **智谱 GLM**：新用户送 ¥18，免费试用

📚 **完整文档导航**：[AI文档导航.md](./AI文档导航.md) - 快速找到你需要的文档

🚀 **快速开始**：

- [国内 AI 配置指南](./国内AI配置指南.md) 🔥 - 5 分钟完成配置
- [AI 厂商快速参考](./AI厂商快速参考.md) - 配置速查表
- [AI 配置故障排查](./AI配置故障排查.md) - 遇到问题？看这里

📖 **详细文档**：

- [AI 功能集成文档](./docs/AI_INTEGRATION.md) - 技术实现
- [国内 AI 厂商完整指南](./docs/CHINA_AI_PROVIDERS.md) - 7 家厂商详细配置
- [AI 厂商对比与选择](./AI_PROVIDER_COMPARISON.md)

---

## 📦 部署到 Cloudflare Pages

### 手动部署

```bash
# 生成 Cloudflare Pages 构建产物
npm run build:pages

# 部署
npm run deploy
```

### Cloudflare Pages（Git 绑定）构建配置

```text
Build command: npm run build:pages
Build output directory: .vercel/output/static
```

### GitHub Actions 自动部署

参考 `.github/workflows/deploy.yml`，配置以下 GitHub Secrets：

- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID

该工作流会在部署时自动执行 D1 迁移检测与应用：

1. 构建 Pages 产物
2. 运行 `wrangler d1 migrations apply homebug-db --remote`（仅执行未应用的迁移）
3. 部署到 Cloudflare Pages

只要新增 SQL 文件到 `migrations/` 并推送到 `main` 分支，部署时会自动检测并执行。

---

## 📜 开发脚本

```bash
npm run dev              # 本地开发（Next.js dev server）
npm run dev:worker       # 本地开发（Wrangler Pages，含 D1/R2 模拟）
npm run build            # Next.js 生产构建（next build）
npm run build:pages      # Cloudflare Pages 构建（@cloudflare/next-on-pages）
npm run deploy           # 部署到 Cloudflare Pages

npm run db:migrate:local # 本地数据库迁移
npm run db:migrate       # 生产数据库迁移

npm run type-check       # TypeScript 类型检查
npm run lint             # ESLint 检查
```

---

## 📚 文档

| 文档                                                       | 描述                                 |
| ---------------------------------------------------------- | ------------------------------------ |
| [docs/PRD.md](./docs/PRD.md)                               | 产品需求文档，功能点详细说明         |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)             | 技术架构，API 设计，目录结构         |
| [docs/DATABASE.md](./docs/DATABASE.md)                     | 数据库表设计，字段说明               |
| [docs/UI_DESIGN.md](./docs/UI_DESIGN.md)                   | UI 设计规范，色彩系统，组件规范      |
| [docs/AI_INTEGRATION.md](./docs/AI_INTEGRATION.md)         | **AI 功能集成文档，配置指南**        |
| [国内AI配置指南.md](./国内AI配置指南.md) 🔥                | **国内 AI 厂商快速配置指南（推荐）** |
| [docs/CHINA_AI_PROVIDERS.md](./docs/CHINA_AI_PROVIDERS.md) | **国内 AI 厂商完整配置文档**         |
| [AI_PROVIDER_COMPARISON.md](./AI_PROVIDER_COMPARISON.md)   | **AI 厂商对比与选择指南**            |
| [docs/NETWORK_ACCESS.md](./docs/NETWORK_ACCESS.md)         | **网络访问说明，中国大陆用户指南**   |
| [docs/AI_ERRORS.md](./docs/AI_ERRORS.md)                   | AI 错误处理与解决方案                |
| [docs/VIBECODE_PROMPTS.md](./docs/VIBECODE_PROMPTS.md)     | Vibecoding 提示词集合                |
| [docs/ISSUE_LOG.md](./docs/ISSUE_LOG.md)                   | 开发问题清单与决策记录               |

---

## 🎨 设计风格

- 黑白极简 · Apple / Notion 气质
- 支持系统暗黑模式
- 移动端优先的响应式设计
- 适度过渡动画，不浮夸

---

## 📄 许可证

MIT License

---

<div align="center">
  <sub>Made with ❤️ for better home management · HomeBug 小小虫</sub>
</div>
