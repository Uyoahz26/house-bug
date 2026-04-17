# HomeBug — UI 设计规范文档

> 风格定位：精致简洁 · 黑白主调 · Apple / Notion 气质

---

## 一、设计原则

1. **减法哲学** — 每个元素都有存在的理由，去除一切多余装饰
2. **内容优先** — 界面为内容服务，信息层级清晰
3. **克制动效** — 动画只作为状态反馈，不追求炫技
4. **一致性** — 所有交互模式、间距、圆角保持统一
5. **拇指友好** — 移动端关键操作落在拇指热区（屏幕下半部）

---

## 二、色彩系统（Design Tokens）

### 主色调（黑白灰）

```css
:root {
  /* 主要颜色 */
  --color-primary:        #0A0A0A;   /* 几乎纯黑，主文字 */
  --color-primary-light:  #1A1A1A;   /* 深黑，次要强调 */
  --color-secondary:      #6B7280;   /* 中灰，辅助文字 */
  --color-tertiary:       #9CA3AF;   /* 浅灰，占位符 */

  /* 背景 */
  --color-bg:             #FFFFFF;   /* 主背景 */
  --color-bg-secondary:   #F9FAFB;   /* 次级背景（卡片、侧边栏） */
  --color-bg-tertiary:    #F3F4F6;   /* 第三层背景（输入框、hover） */

  /* 边框 */
  --color-border:         #E5E7EB;   /* 主边框 */
  --color-border-light:   #F3F4F6;   /* 浅边框 */

  /* 语义色（状态色，使用低饱和度） */
  --color-success:        #16A34A;   /* 正常，绿 */
  --color-success-light:  #DCFCE7;
  --color-warning:        #D97706;   /* 即将过期，琥珀 */
  --color-warning-light:  #FEF3C7;
  --color-danger:         #DC2626;   /* 已过期，红 */
  --color-danger-light:   #FEE2E2;
  --color-info:           #2563EB;   /* 信息，蓝 */
  --color-info-light:     #DBEAFE;
}

/* 暗黑模式 */
[data-theme="dark"] {
  --color-primary:        #F9FAFB;
  --color-primary-light:  #E5E7EB;
  --color-secondary:      #9CA3AF;
  --color-tertiary:       #6B7280;

  --color-bg:             #0A0A0A;
  --color-bg-secondary:   #111111;
  --color-bg-tertiary:    #1A1A1A;

  --color-border:         #1F1F1F;
  --color-border-light:   #2A2A2A;

  --color-success:        #22C55E;
  --color-success-light:  #14532D;
  --color-warning:        #F59E0B;
  --color-warning-light:  #78350F;
  --color-danger:         #EF4444;
  --color-danger-light:   #7F1D1D;
  --color-info:           #3B82F6;
  --color-info-light:     #1E3A8A;
}
```

### 间距系统（4px 基准）

```
4px   → xs  (0.25rem)
8px   → sm  (0.5rem)
12px  → md  (0.75rem)
16px  → lg  (1rem)
24px  → xl  (1.5rem)
32px  → 2xl (2rem)
48px  → 3xl (3rem)
64px  → 4xl (4rem)
```

### 圆角系统

```
4px   → rounded-sm   (小标签)
8px   → rounded-md   (输入框、按钮)
12px  → rounded-lg   (卡片)
16px  → rounded-xl   (大卡片、模态框)
24px  → rounded-2xl  (底部弹出抽屉)
9999px → rounded-full (徽章、头像)
```

---

## 三、字体系统

```css
/* 中文优先字体栈 */
font-family: 
  'Inter',           /* 英文 */
  -apple-system,     /* macOS/iOS 系统字体 */
  'PingFang SC',     /* macOS/iOS 中文 */
  'Microsoft YaHei', /* Windows 中文 */
  sans-serif;

/* 字重 */
--font-regular:  400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* 字号阶梯 */
--text-xs:    12px;   /* 标签、辅助信息 */
--text-sm:    14px;   /* 次要文字 */
--text-base:  16px;   /* 正文 */
--text-lg:    18px;   /* 小标题 */
--text-xl:    20px;   /* 标题 */
--text-2xl:   24px;   /* 页面标题 */
--text-3xl:   30px;   /* 大标题 */
```

---

## 四、组件规范

### 4.1 导航布局

**PC 端（≥ 768px）**：
- 左侧固定侧边栏，宽度 240px
- 侧边栏背景：`--color-bg-secondary`
- Logo 区域高度：64px
- 导航项：48px 高，12px 水平 padding，圆角 8px
- 激活状态：背景 `--color-bg-tertiary`，文字加粗

**移动端（< 768px）**：
- 底部 Tab Bar，5 个入口（首页/物资/添加/通知/我的）
- 中间 "+" 按钮突出：黑色圆形背景，白色图标，52px 直径
- 顶部 Header：含返回按钮和页面标题

### 4.2 物资卡片（ItemCard）

```
┌─────────────────────────────┐
│  [图片]  商品名称           │  ← 商品名 semibold 16px
│   48px   品牌 · 规格        │  ← 次要信息 14px 灰色
│  正方形   📍 存放位置        │
│          🗓 到期日 [状态徽章]│
│          数量: 2 瓶          │
└─────────────────────────────┘
```

- 卡片背景白色，border 1px `--color-border`，圆角 12px
- hover 效果：轻微上移 2px + 阴影加深（transition 200ms）
- 点击进入详情页

**状态徽章（ExpiryBadge）**：
```
正常:      [距过期 45天]  → 绿色背景，绿色文字
即将过期:  [⚠ 还剩 8天]  → 琥珀背景，琥珀文字
已过期:    [✕ 已过期 3天] → 红色背景，红色文字
无保质期:  [无保质期]     → 灰色背景，灰色文字
```

### 4.3 OCR 录入流程（Modal / 全屏）

**步骤1 — 图片选取**：
```
┌──────────────────────────┐
│  拍照 / 选择图片          │
│                          │
│  ┌────────┐ ┌────────┐   │
│  │ 📷拍照 │ │ 🖼上传 │   │
│  └────────┘ └────────┘   │
│                          │
│     或手动填写表单 →      │
└──────────────────────────┘
```

**步骤2 — 识别中（Loading）**：
- 图片预览 + 扫描线动画（从上到下循环）
- 文字："正在识别商品信息..."
- 识别出的文字渐入显示

**步骤3 — 结果确认表单**：
- 已识别字段用绿色下划线高亮
- 未识别字段显示橙色虚线边框提示
- 每个字段旁边有小 ✏️ 可编辑

### 4.4 Dashboard 布局

```
┌─────────────────────────────────────┐
│  Hi，George 👋                      │  ← 问候语
│  你有 3 件物资即将在7天内过期         │
├─────┬──────┬──────┬──────┐
│总库存│即将到期│已过期│本月+  │  ← 4个统计卡片
│ 42  │  3   │  1  │  8   │
├─────┴──────┴──────┴──────┤
│ 即将过期物资 [查看全部→]   │
│  [卡片] [卡片] [卡片]     │
├───────────────────────────┤
│ 最近添加                   │
│  · 洗发水  2026-04-10     │
│  · 牛奶    2026-04-12     │
└───────────────────────────┘
```

### 4.5 按钮规范

```
主要按钮（Primary）:
  背景 #000，文字 #fff，圆角 8px，高度 40px，hover 时背景 #1A1A1A

次要按钮（Secondary）:
  背景透明，边框 1px #E5E7EB，文字 #000，hover 时背景 #F3F4F6

危险按钮（Danger）:
  背景 #DC2626，文字 #fff，hover 时背景 #B91C1C

幽灵按钮（Ghost）:
  背景透明，无边框，文字 #6B7280，hover 时背景 #F3F4F6
```

### 4.6 表单规范

```
输入框:
  高度: 40px（标准），48px（大号）
  圆角: 8px
  边框: 1px #E5E7EB
  focus: 边框变为 #000，outline none
  背景: #fff（深色模式 #111）
  padding: 0 12px

标签 Label:
  字号 14px，font-weight 500
  颜色 #374151
  间距 margin-bottom 6px

错误提示:
  红色文字，12px，紧贴输入框下方
  输入框边框变红
```

---

## 五、动效规范

```css
/* 通用过渡 */
--transition-fast:   150ms ease;    /* hover、focus 状态切换 */
--transition-normal: 200ms ease;    /* 卡片、按钮交互 */
--transition-slow:   300ms ease;    /* 页面元素进入、模态框 */

/* 页面切换 */
/* 使用 Framer Motion：fade + slide，duration 0.2s */

/* 卡片进入 */
/* stagger children：每个卡片延迟 50ms 渐入 */

/* 模态框 */
/* scale(0.95) → scale(1) + opacity 0 → 1，duration 200ms */

/* 底部抽屉（移动端） */
/* translateY(100%) → translateY(0)，duration 300ms spring */

/* 加载骨架屏 */
/* shimmer 动画，背景渐变 */
```

---

## 六、图标规范

使用 **Lucide React** 图标库（HeroUI 推荐）：

| 场景 | 图标 |
|------|------|
| 添加 | `Plus` |
| 删除 | `Trash2` |
| 编辑 | `Pencil` |
| 搜索 | `Search` |
| 过滤 | `SlidersHorizontal` |
| 相机 | `Camera` |
| 上传 | `Upload` |
| 位置 | `MapPin` |
| 日期 | `Calendar` |
| 通知 | `Bell` |
| 设置 | `Settings` |
| 分类 | `Tag` |
| 库存 | `Package` |
| 首页 | `LayoutDashboard` |
| 用户 | `User` |
| 暗黑 | `Moon` / `Sun` |
| 成功 | `CheckCircle2` |
| 警告 | `AlertTriangle` |
| 错误 | `XCircle` |
| 加载 | `Loader2`（spin 动画） |

---

## 七、响应式断点

```
移动端:  0px    - 767px   （主要设计基准）
平板端:  768px  - 1023px
PC端:    1024px - 1279px
宽屏:    1280px+
```

**关键布局变化**：
- < 768px：隐藏侧边栏，显示底部 Tab Bar，单列布局
- 768px-1023px：显示折叠侧边栏（仅图标），内容区双列
- ≥ 1024px：展开侧边栏（240px），内容区三列网格

---

## 八、空状态设计

每个列表页需要对应的空状态：
- 简单居中的插画（SVG 小虫子）
- 主说明文字（黑色，16px semibold）
- 副说明（灰色，14px）
- 行动按钮（主要按钮）

示例：
```
     🐛
  还没有物资记录
  点击右上角「+」开始添加第一件物资
     [立即添加]
```

---

*文档版本：v1.0.0*
