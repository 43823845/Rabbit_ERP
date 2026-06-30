# 系统架构与数据流程 (v1.2.0)

## 1. 技术架构

```
┌─────────────────────────────────────────────────┐
│                  Electron 桌面应用                │
│                                                   │
│  ┌─────────────────────┐   ┌──────────────────┐ │
│  │   渲染进程 (Renderer) │   │  主进程 (Main)    │ │
│  │                      │   │                   │ │
│  │  Vue 3 + Element Plus│   │  Node.js +       │ │
│  │  Vue Router          │   │  better-sqlite3   │ │
│  │  TypeScript          │   │                   │ │
│  │                      │   │  IPC Handlers     │ │
│  │  API Layer ──────────┼───┼─► finance:*       │ │
│  │  (工厂模式)           │   │                   │ │
│  │                      │   │  FinanceDatabase  │ │
│  │                      │   │  (业务逻辑)        │ │
│  └──────────────────────┘   └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

## 2. 进程通信（IPC）通道

### 2.1 预加载脚本 (preload.cjs)

```
contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel, ...args) → ipcRenderer.invoke(channel, ...args)
})
```

### 2.2 IPC 通道清单

| 通道 | 方向 | 功能 |
|------|------|------|
| `finance:login` | Renderer→Main | 用户登录 |
| `finance:getCompanies` | Renderer→Main | 获取公司列表 |
| `finance:createCompany` | Renderer→Main | 创建新公司账套 |
| `finance:switchCompany` | Renderer→Main | 切换当前公司 |
| `finance:bootstrap` | Renderer→Main | 获取初始化数据 |
| `finance:listSubjects` | Renderer→Main | 科目列表 |
| `finance:createSubject` | Renderer→Main | 新增科目 |
| `finance:updateSubject` | Renderer→Main | 更新科目 |
| `finance:deleteSubject` | Renderer→Main | 删除科目 |
| `finance:setOpeningBalance` | Renderer→Main | 设置期初 |
| `finance:getOpeningBalances` | Renderer→Main | 查询期初 |
| `finance:closePeriod` | Renderer→Main | 结账 |
| `finance:reopenPeriod` | Renderer→Main | 反结账 |
| `finance:listVouchers` | Renderer→Main | 凭证列表 |
| `finance:getVoucher` | Renderer→Main | 凭证详情 |
| `finance:createVoucher` | Renderer→Main | 新增凭证 |
| `finance:updateVoucher` | Renderer→Main | 修改凭证 |
| `finance:deleteVoucher` | Renderer→Main | 删除凭证 |
| `finance:auditVoucher` | Renderer→Main | 审核 |
| `finance:unauditVoucher` | Renderer→Main | 反审核 |
| `finance:postVoucher` | Renderer→Main | 过账 |
| `finance:unpostVoucher` | Renderer→Main | 反过账 |
| `finance:reorderVoucherNos` | Renderer→Main | 重排凭证号 |
| `finance:renumberSubjects` | Renderer→Main | 重排科目编号 |
| `finance:getNextVoucherNo` | Renderer→Main | 获取下个凭证号 |
| `finance:getSubjectBalance` | Renderer→Main | 科目余额 |
| `finance:getDetailLedger` | Renderer→Main | 明细账 |
| `finance:getGeneralLedger` | Renderer→Main | 总账 |
| `finance:getTrialBalance` | Renderer→Main | 试算平衡表 |
| `finance:getProfitStatement` | Renderer→Main | 利润表 |
| `finance:getBalanceSheet` | Renderer→Main | 资产负债表 |
| `finance:getEquityChangeStatement` | Renderer→Main | 所有者权益变动表 |
| `finance:getTaxDetail` | Renderer→Main | 应交税费明细表 |
| `finance:getExpenseSummary` | Renderer→Main | 费用明细汇总表 |
| `finance:getDepreciationSummary` | Renderer→Main | 固定资产折旧汇总表 |
| `finance:getReceivableAging` | Renderer→Main | 应收账款账龄分析 |
| `finance:getPayableAging` | Renderer→Main | 应付账款账龄分析 |
| `finance:getAuxProjectCombo` | Renderer→Main | 核算项目组合表 |

---

## 3. API 层

```
src/api/index.ts
    │
    └── ElectronFinanceApi (IPC → 主进程 SQLite)
```

### 初始化时序

```
main.ts:
  ① await createFinanceApi()
  ② createApp(App).use(router).use(ElementPlus).mount('#app')

electron/main.cjs:
  ① database.initialize()        // 建表 + seed
  ② registerIpc()                // 注册所有 IPC handler
  ③ createWindow()               // 加载前端
```

---

## 4. 核心数据流程

### 4.1 登录与账套选择

```
LoginView.vue
    │
    ├── onMounted: api.getCompanies() → 填充下拉
    │
    ├── 用户输入 + 选择账套
    │
    ├── api.login(user, pass) → IPC → main 验证
    │
    ├── api.switchCompany(companyId)  若选择不同账套
    │
    └── auth.login(user) → localStorage 保存状态 → 跳转 dashboard
```

### 4.2 凭证创建流程

```
VoucherModal.vue (凭证弹窗)
    │
    ├── 选择凭证字 + 日期 + 摘要
    ├── 添加分录行 (≥2行)
    │   ├── 选择会计科目 (bd_subject)
    │   ├── 输入借方/贷方金额
    │   └── 自动计算借贷平衡
    │
    ├── 前端校验: 借贷平衡 ✓
    │
    ├── api.createVoucher(payload)
    │   ├── 后端校验: entries ≥ 2, debit=credit>0
    │   ├── INSERT gl_voucher
    │   ├── INSERT gl_voucher_entry × N (事务)
    │   └── 写入操作日志
    │
    └── 返回凭证列表，刷新显示
```

### 4.3 凭证审核过账流程

```
凭证列表 (VoucherView)
    │
    ├── 选择草稿凭证 → 审核
    │   └── status: draft → audited
    │
    ├── 选择已审核凭证 → 过账
    │   └── status: audited → posted
    │       └── 凭证数据参与报表计算
    │
    └── 反操作（过账→反过账→反审核）
        └── 反过账前检查期间状态，已结账则拒绝
```

### 4.4 期末结账流程

```
ClosingView.vue → closePeriod(period)
    │
    ├── ① 期间存在性检查
    ├── ② 前序期间强制检查（未初始化/未结账均拒绝）
    ├── ③ 未过账凭证检查
    ├── ④ 三层试算平衡（期初余额 + 发生额 + 期末余额）
    ├── ⑤ 损益结转：收入/费用 → 本年利润(4103)（幂等保护）
    ├── ⑥ 年末利润结转（12月）：本年利润(4103) → 利润分配-未分配利润(4104)
    ├── ⑦ 自动期初结转：计算本月各科目期末余额，自动作为期初余额写入下一期间 (gl_opening_balance)
    └── ⑧ 关闭期间 → acct_period.status = 'closed'
```

### 4.5 报表生成流程

```
账簿报表 (LedgerView)
    │
    ├── 科目余额表
    │   └── getSubjectBalance(period)
    │       └── SQL: SUM debit/credit FROM voucher_entry
    │           JOIN voucher WHERE status='posted'
    │           + 期初余额
    │
    ├── 试算平衡表
    │   └── getTrialBalance(period)
    │       └── 基于科目余额表 + 方向判定
    │
    ├── 利润表 (ReportsView)
    │   └── getProfitStatement(period)
    │       └── shared/report-templates.cjs 共享公式引擎
    │           ├── fillTemplateAmount() 统一计算
    │           └── getTemplatesByType('profit') 获取模板行
    │
    └── 资产负债表 (ReportsView)
        └── getBalanceSheet(period)
            └── shared/report-templates.cjs 共享公式引擎
                ├── fillTemplateAmount() 动态计算（按 section 分组合计）
                ├── getTemplatesByType('balance') 获取模板行
                └── 跨报表引用：净利润 = getProfitStatement() row_no=32

### 4.6 财务报表生成流程 (ReportsView)

```
财务报表 (ReportsView)
    │
    ├── 所有者权益变动表
    │   └── getEquityChangeStatement(period)
    │       └── shared/report-templates.cjs (equity_change 模板)
    │           └── 实收资本 → 资本公积 → 盈余公积 → 未分配利润 → 本年利润
    │
    ├── 应交税费明细表
    │   └── getTaxDetail(period)
    │       └── shared/report-templates.cjs (tax_detail 模板)
    │           └── 增值税 → 企业所得税 → 城建税 → 教育费附加 → ...
    │
    ├── 费用明细汇总表
    │   └── getExpenseSummary(period)
    │       └── 按费用科目(管理费用/销售费用/财务费用)汇总子科目
    │           └── 包含本期金额 + 本年累计 + 预算比较
    │
    ├── 固定资产折旧汇总表
    │   └── getDepreciationSummary(period)
    │       └── SQL: fa_asset_card JOIN gl_voucher (折旧凭证)
    │           └── 按资产名称分组，汇总原值/残值/累计折旧/本期折旧/净值
    │
    ├── 应收账款账龄分析
    │   └── getReceivableAging(period)
    │       └── 按客户 + 应收账款(1122)分录汇总
    │           └── 按凭证日期计算逾期天数 → 1-30/31-60/61-90/90+天分桶
    │
    └── 应付账款账龄分析
        └── getPayableAging(period)
            └── 按供应商 + 应付账款(2202)分录汇总
                └── 按凭证日期计算逾期天数 → 1-30/31-60/61-90/90+天分桶
```

### 4.7 核算项目组合表流程 (LedgerView)

```
核算项目组合表
    │
    └── getAuxProjectCombo({ period, auxTypeId })
        └── SQL: gl_voucher_entry JOIN aux_project_value
            WHERE aux_type_id = ? AND voucher.status = 'posted'
            GROUP BY (aux_value_id, subject_code)
            │
            ├── 构建 columns[] — 从 aux_project_value 获取辅助核算项目值
            ├── 构建 rows[] — 按科目(subject_code)分组
            │   └── 每行 cells[] — [{debit, credit}] 对应每列
            └── 构建 totals[] — 每列借方/贷方合计
```

### 4.8 固定资产折旧流程

```
AssetView.vue → depreciateAsset(id)
    │
    ├── 检查资产状态（报废/已处置/已提足折旧 → 拒绝）
    ├── 计算剩余可折旧额度（原值 - 残值 - 累计折旧）
    ├── 最后一期处理：剩余额度不足整月时按实际余额计提
    └── 事务内原子操作：
        ├── 更新 fa_asset_card（累计折旧 + 净值）
        └── 自动生成会计凭证（借: 自定义借方折旧费用科目，默认6602 / 贷: 1602 累计折旧，凭证日期为期末最后一天）
```

---

## 5. 前端页面路由

```
/login        → LoginView.vue          登录页（无需认证）
/dashboard    → DashboardView.vue      工作台主页（需认证）
/voucher      → VoucherView.vue        凭证管理（需认证）
/ledger       → LedgerView.vue         账簿报表（需认证）
/reports      → ReportsView.vue        财务报表（需认证）
/opening      → OpeningBalanceView.vue 期初余额（需认证）
/subjects     → AccountSubject.vue     科目管理（需认证）
/closing      → ClosingView.vue        期末结账（需认证）
/assets       → AssetView.vue          固定资产（需认证）
/settings     → SettingsView.vue       系统设置（需认证）
                   ├── SettingsView.vue     外壳：页头/导航/对话框 + provide 注入
                   └── SettingsSubView.vue  8个子视图面板（inject 消费状态）
```

### 5.1 SettingsView 组件拆分

`SettingsView.vue` 通过 Vue 3 的 `provide`/`inject` 模式将状态共享给 `SettingsSubView.vue`：
- **SettingsView.vue**：负责导航栏、全局对话框（新增/编辑凭证字、辅助核算、账套、用户、重置密码、删除确认）、所有业务逻辑方法
- **SettingsSubView.vue**：纯渲染层，通过 `inject('settingsState')` 获取响应式状态，渲染 8 个子视图面板——账套管理/凭证字/辅助核算/期间管理/用户管理/操作日志/数据管理/系统信息

### 路由守卫

```
router.beforeEach:
  to.meta.requiresAuth && !auth.isLoggedIn() → 跳转 /login
  to.path === '/login' && auth.isLoggedIn() → 跳转 /dashboard
```

---

## 6. 认证状态管理

```
auth.ts (Reactive State)
    │
    ├── loadState()  → 从 localStorage 恢复登录状态
    ├── login(user)  → 保存 user 到 localStorage
    ├── logout()     → 清除 localStorage，回到登录页
    └── isLoggedIn() → 检查是否有有效用户
```

---

## 7. 金额精度规范

| 场景 | 格式 | 说明 |
|------|------|------|
| 数据库存储 | REAL (浮点) | 双重精度 |
| 前端输入 | 数字输入框 | 步长 0.01，精度 2 位 |
| 借贷平衡校验 | `Math.abs(debit - credit) <= 0.001` | 容忍度 0.001 |
| 展现 | `toFixed(2)` | 保留 2 位小数 |

---

## 8. 全局设计系统 (Design Tokens)

系统通过 `src/styles.css` 中的 CSS 自定义属性定义统一的设计令牌，全面覆盖 Element Plus 组件库的主题变量。

### 8.1 品牌色板

| 令牌 | 颜色 | 用途 |
|------|------|------|
| `--epp-ink` | `#0a1e3d` | 主要品牌色（墨蓝），用于主按钮、标题 |
| `--epp-ink-light` | `#15325a` | 次要墨蓝，用于悬停态 |
| `--epp-ink-sub` | `#4a5a7a` | 辅助文字色 |
| `--epp-gold` | `#b8943e` | 强调金色，用于高亮/激活态 |
| `--epp-gold-light` | `#d4b96a` | 浅金色 |
| `--epp-ledger` | `#f8f5f0` | 账本纸底色（页面背景） |
| `--epp-paper` | `#fdfcfa` | 卡片/面板背景 |
| `--epp-line` | `#e3dfd3` | 边框线色 |
| `--epp-line-light` | `#f0ede6` | 浅边框色 |

### 8.2 Element Plus 全局覆盖

`styles.css` 的 `:root` 中覆盖了以下 Element Plus 核心变量，确保全局 UI 统一：

| 覆盖类别 | 关键变量 |
|----------|----------|
| 主题色 | `--el-color-primary` (墨蓝系 1-9 级渐变) |
| 功能色 | `--el-color-success/warning/danger/info` |
| 背景 | `--el-bg-color-page/overlay` |
| 表格 | `--el-table-header-bg-color/row-hover-bg-color/border-color` |
| 标签 | `--el-tag-bg-color` |

> 所有组件页面（登录页、凭证管理、科目管理、账簿报表、系统设置）自动遵循此配色体系，无需各自重复定义。

---

## 9. 启动命令

```bash
# 开发模式（Electron + HMR 热更新）
npm run dev:electron

# 生产构建
npm run build
```
