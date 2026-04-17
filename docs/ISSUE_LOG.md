# HomeBug 问题清单

> 用途：开发过程中记录逻辑问题、风险、决策与处理状态。
> 更新规则：发现即记录，解决后更新状态与处理说明。

## 问题列表

### ISSUE-001 文档与数据库模型不一致

- 状态：已解决
- 发现日期：2026-04-15
- 描述：docs/DATABASE.md 使用旧的 settings 表方案，但 schema.sql 已使用 system_config + user_settings 模型。
- 影响：会导致 API 设计和后续实现按错误模型推进。
- 处理：已在本轮开发中统一以 schema.sql 为准，重写 DATABASE.md 相关章节。

### ISSUE-002 认证流程冲突（注册 vs 家庭模式）

- 状态：已解决
- 发现日期：2026-04-15
- 描述：README、PRD、ARCHITECTURE、IMPLEMENTATION_PLAN 中存在公开注册描述，与“仅登录、首登自动管理员”要求冲突。
- 影响：会产生错误路由与权限模型（/register）。
- 处理：已在本轮开发中统一改为登录单入口，首登自动管理员，后续由管理员添加用户。

### ISSUE-003 OCR 默认策略冲突

- 状态：已解决
- 发现日期：2026-04-15
- 描述：部分文档默认 Cloudflare OCR，部分配置默认为 tesseract。
- 影响：实现时会出现 provider 默认值不一致。
- 处理：已统一为开源优先，默认 tesseract（前端），可选 PaddleOCR 自托管与云 OCR 作为备选。

### ISSUE-004 首登管理员并发竞争条件

- 状态：已解决（首版）
- 发现日期：2026-04-15
- 描述：若两个请求几乎同时触发首登逻辑，可能出现多个管理员。
- 影响：权限边界被破坏。
- 处理：登录初始化改为 INSERT ... SELECT ... WHERE NOT EXISTS 原子写入，仅允许首个请求写入 admin；并发失败返回 409 提示重试。

### ISSUE-005 前端 OCR 性能与准确率波动

- 状态：待处理
- 发现日期：2026-04-15
- 描述：纯前端 OCR 在低端设备或复杂背景下可能耗时高、准确率下降。
- 影响：移动端体验不稳定。
- 建议：增加图片压缩、尺寸上限、识别超时、手动修正引导，并允许在设置页切换到 PaddleOCR/云 OCR。

### ISSUE-006 Next.js 与 Cloudflare 适配包版本冲突

- 状态：已解决
- 发现日期：2026-04-15
- 描述：create-next-app 默认生成 Next 16，@cloudflare/next-on-pages 依赖范围不支持该版本。
- 影响：依赖安装失败，构建链路中断。
- 处理：已将 Next 与 eslint-config-next 固定到 15.5.2（精确版本），并完成依赖安装。

### ISSUE-007 Cloudflare 适配方案技术债

- 状态：待处理
- 发现日期：2026-04-15
- 描述：@cloudflare/next-on-pages 已被官方标记弃用，推荐迁移到 OpenNext Cloudflare 适配器。
- 影响：后续维护与升级成本上升，可能影响长期兼容性。
- 建议：在 Phase 9 部署前评估并迁移到 OpenNext，更新构建与部署脚本。

### ISSUE-008 next lint 已弃用

- 状态：待处理
- 发现日期：2026-04-15
- 描述：当前使用 next lint 可通过检查，但该命令将在 Next 16 移除。
- 影响：后续升级时 lint 流程会中断。
- 建议：在后续阶段迁移为 ESLint CLI（npx eslint .）并切换到稳定 flat config。

### ISSUE-009 Next.js 15.5.2 安全提示

- 状态：待处理
- 发现日期：2026-04-15
- 描述：npm 安装时提示 Next 15.5.2 存在安全漏洞并建议升级到补丁版本。
- 影响：潜在安全风险，且与当前 Cloudflare 适配依赖范围形成版本张力。
- 建议：结合 OpenNext 迁移一起评估升级路径，优先消除版本锁定问题。

### ISSUE-010 页面路由保护仅校验 token 存在

- 状态：已解决
- 发现日期：2026-04-15
- 描述：src/middleware.ts 当前只检查 cookie 中是否存在 token，不校验 token 是否有效。
- 影响：无效/过期 token 仍可进入受保护页面外壳，直到 API 调用才报 401。
- 处理：middleware 已改为校验 token 签名与载荷；校验失败会清理 cookie 并重定向登录页。

### ISSUE-011 系统配置批量更新缺少事务保护

- 状态：已解决（优先路径）
- 发现日期：2026-04-15
- 描述：PUT /api/admin/config 逐条更新，若中途失败会出现部分成功、部分失败。
- 影响：配置状态可能不一致，排障成本高。
- 处理：优先使用 D1 batch 原子提交；当运行环境不支持 batch 时回退为顺序更新。

### ISSUE-012 本地 next dev 缺少 Cloudflare 请求上下文

- 状态：已解决
- 发现日期：2026-04-15
- 描述：在 `next dev` 下调用登录接口时报错 `Failed to retrieve the Cloudflare request context`。
- 影响：所有依赖 `getRequestContext()` 的 API 在本地开发环境返回 500。
- 处理：在 `next.config.ts` 中接入 `setupDevPlatform()`，初始化 next-dev 的 Cloudflare 绑定上下文。

### ISSUE-013 bcryptjs 异步接口与 Edge 运行时不兼容

- 状态：已解决
- 发现日期：2026-04-15
- 描述：登录首登初始化调用 `bcrypt.hash()` 时触发 `setImmediate`，Edge Runtime 不支持该 Node API。
- 影响：`/api/auth/login` 在本地与 Edge 路径下返回 500。
- 处理：改用 `bcryptjs` 的同步接口 `hashSync/compareSync`，避免 `setImmediate` 依赖。
