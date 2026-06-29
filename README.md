# Rabbit_ERP

基于 **Electron + Vue 3 + Element Plus + SQLite** 的桌面端财务管理系统。

## 业务主线

```
建账 → 基础资料 → 期初余额 → 记账凭证 → 审核过账 → 账簿查询 → 财务报表 → 期末结账
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | ^3.5.13 | 前端框架 |
| Vite | ^6.2.2 | 构建工具 |
| Element Plus | ^2.14.2 | UI 组件库 |
| Vue Router 4 | ^4.5.0 | 前端路由 (Hash 模式) |
| TypeScript | ^5.8.2 | 类型检查 |
| Electron | ^35.7.5 | 桌面应用框架 |
| better-sqlite3 | ^11.9.1 | SQLite 数据库 |
| dayjs | ^1.11.13 | 日期处理 |

## 项目结构

```
workspace/
├── index.html                    # 入口 HTML
├── package.json                  # 项目配置与依赖（由 sync-config 自动同步）
├── app.config.cjs                # ★ 统一配置中心（名称/版本/图标/窗口等）
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 构建配置
├── scripts/
│   └── sync-config.cjs           # 自动同步 app.config → package.json
├── electron/
│   ├── main.cjs                  # Electron 主进程入口
│   ├── preload.cjs               # 预加载脚本 (IPC 桥接)
│   └── services/
│       └── database/             # SQLite 数据库服务（模块化）
│           ├── index.cjs         #   主入口，FinanceDatabase 类
│           ├── utils.cjs         #   工具函数 + 常量 + 内置科目
│           ├── schema.cjs        #   表结构 DDL + 索引 + 种子数据
│           ├── companies.cjs     #   公司/账套管理
│           ├── users.cjs         #   用户认证与管理
│           ├── subjects.cjs      #   会计科目 CRUD
│           ├── vouchers.cjs      #   凭证 CRUD + 状态管理
│           ├── periods.cjs       #   会计期间结账/反结账
│           ├── openings.cjs      #   期初余额管理
│           ├── reports.cjs       #   财务报表查询
│           ├── auxiliary.cjs     #   辅助核算管理
│           ├── attachments.cjs   #   凭证附件管理
│           ├── voucher-words.cjs #   凭证字管理
│           ├── multi-column.cjs  #   多栏账管理
│           └── data-manager.cjs  #   备份/导出/VACUUM
├── docs/                          # 项目文档
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── LEDGER_SPECIFICATION.md
│   └── USER_GUIDE.md
└── src/
    ├── main.ts                   # Vue 应用入口
    ├── App.vue                   # 根组件 (布局框架、导航)
    ├── auth.ts                   # 认证状态管理
    ├── router.ts                 # 路由配置
    ├── config.ts                 # 前端配置访问模块
    ├── app-config.d.ts           # 全局 __APP_CONFIG__ 类型声明
    ├── styles.css                # 全局样式 + Element Plus 主题覆盖
    ├── vite-env.d.ts             # 全局类型定义
    ├── api/
    │   ├── index.ts              # API 工厂入口
    │   └── electron.ts           # Electron IPC → SQLite
    ├── components/
    │   ├── AppIcon.vue           # 应用图标组件
    │   ├── VoucherModal.vue      # 凭证编辑弹窗组件
    │   ├── VoucherListTable.vue  # 凭证列表共享表格组件
    │   └── SubjectFormModal.vue  # 科目表单弹窗组件
    ├── composables/
    │   ├── useAmountEditing.ts   # 金额数位编辑组合式函数
    │   ├── useAttachments.ts     # 附件管理组合式函数
    │   ├── useQuickAddSubject.ts # 快速新增科目组合式函数
    │   ├── useSubjectDropdown.ts # 科目下拉选择组合式函数
    │   └── useVoucherForm.ts     # 凭证表单组合式函数
    ├── data/
    │   └── constants.ts          # 业务常量定义
    ├── utils/
    │   ├── amountDigit.ts        # 金额分位显示工具
    │   ├── chineseCurrency.ts    # 中文大写金额转换
    │   ├── format.ts             # 字符串格式化工具
    │   ├── printVoucher.ts       # 凭证打印工具
    │   ├── subjects.ts           # 科目树构建工具
    │   └── voucherTemplate.ts    # 凭证模板定义
    └── views/
        ├── LoginView.vue         # 登录页面
        ├── DashboardView.vue     # 做账首页 (仪表盘)
        ├── VoucherView.vue       # 记账凭证管理
        ├── LedgerView.vue        # 账簿报表
        ├── ReportsView.vue       # 财务报表
        ├── ClosingView.vue       # 期末结账
        ├── OpeningBalanceView.vue # 期初余额
        ├── AccountSubject.vue    # 会计科目管理
        └── SettingsView.vue      # 系统设置
```

### 统一配置中心 (`app.config.cjs`)

所有应用元信息集中管理，修改此文件即可同步到 package.json 和所有前端组件：

```js
module.exports = {
  name: 'rabbit-erp-desktop',    // npm 名称
  version: '1.1.0',              // 版本号
  productName: 'Rabbit_ERP',     // 产品名（exe/标题/品牌）
  title: 'Rabbit_ERP',           // 窗口标题
  winIcon: 'logo.ico',           // Windows 图标
  loginSubtitle: '专业财务管理系统', // 登录页副标题
  developer: 'Origin',           // 开发者署名
  // ...更多配置项
};
```

运行 `npm run dev` 或 `npm run build:exe` 时自动同步到 package.json。

## 功能模块

### 1. 登录与账套管理
- 用户名/密码登录（默认凭证：`admin / admin`）
- 多账套创建与切换
- 新建账套填写公司信息（名称、联系人、企业法人、电话、地址、税号，联系人/法人/税号为必填）
- 登录状态持久化与路由守卫

### 2. 做账首页 (Dashboard)
- 凭证统计卡片：本期凭证总数、草稿数、已审核数、已过账数
- 快捷操作入口：新增凭证、科目余额表、利润表、资产负债表
- 凭证查询与快速操作（查看、审核、过账、删除）

### 3. 会计科目管理 (金蝶标准体系)
- **79 个内置一级科目**：覆盖资产/负债/权益/成本/损益五大类
- **二级科目支持**：用户在一级科目下自由扩展明细科目
- **树形表格**：
  - 默认全部折叠，有子科目的行暖黄背景高亮提示
  - 点击名称列整行展开/折叠下级科目
  - 展开箭头 ▸ 旋转动画，展开后变金色
- **列顺序**：选择框 → 操作(新增下级/编辑/删除) → 编码 → 名称 → 类别
- **内置科目保护**：一级内置科目不可删除，仅可新增下级
- **新增/编辑/删除/启用/禁用**：完整科目生命周期管理
- **批量操作**：批量启用、批量禁用、批量删除
- **搜索与过滤**：编码/名称搜索，展开所有级次，隐藏禁用科目

### 4. 记账凭证管理
- 凭证创建、编辑、删除（草稿状态）
- **凭证生命周期**：草稿 → 审核 → 过账（支持反向：反过账 → 反审核）
- 凭证字号：记/收/付/转
- **凭证号自动去重**：创建时自动校验 `(凭证字, 凭证号, 期间)` 唯一性
- **已结账期间保护**：已结账期间禁止反过账，防止数据不一致
- 顶部导航栏显示：版本号、服务器状态、数据库状态、系统时间、当前账套
- 分录行编辑：摘要、会计科目、借贷金额
- **科目树形下拉**：按树序展显（一级科目后紧跟其二级），二级显示为「父科目-子科目」
- **下拉内快速新增科目**：凭证编辑时直接从科目选择面板新增二级科目
- **金额数位格输入**：模拟纸质凭证（亿、千、百、万...角、分），支持快速填入
- 自动中文大写金额转换
- 借贷平衡实时校验
- 内置 8 个业务凭证模板
- **凭证打印**：单张/批量打印，支持 PDF 导出和 Excel 数据导出
- **附件管理**：凭证支持上传附件文件

### 5. 系统设置
- **公司信息**：查看/修改公司名称、联系人、企业法人、电话、地址、税号
- **数据管理**：列出所有账套，支持重命名、删除（含确认对话框）

### 6. 账簿报表
| 报表 | 说明 |
|------|------|
| 科目余额表 | 按科目展示期初/本期发生额/余额 |
| 总账 | 按科目汇总借贷发生额 |
| 明细账 | 每笔分录的完整流水分录 |
| 试算平衡表 | 借贷平衡校验 + 期初/本期/期末检查 |

### 7. 财务报表
- **利润表**：收入/费用分类汇总，自动计算营业利润、利润总额、净利润
- **资产负债表**：资产/负债/权益分类汇总，公式动态计算（不再硬编码行号）
- **现金流量表**：自动区分经营/投资/筹资活动现金流入流出
- 报表底部签名区：单位负责人（取自公司联系人）、会计负责人/制表人（取自当前登录用户）
- 报表模板集中管理（`shared/report-templates.cjs`），利润表和资产负债表共享同一公式引擎

### 8. 期末结账
- 12月卡片式期间管理，支持年份切换
- 结账前自动检查：未过账凭证、三层试算平衡（期初/发生额/期末）、期初余额、前序期间状态
- **后端正交校验**：结账时强制三层试算平衡，不可绕过
- **前序期间强制检查**：前序期间未初始化或未结账则拒绝，防止跳月结账
- **损益自动结转**：收入/费用自动结转至本年利润(4103)
- **年末利润结转**：12月结账时自动将本年利润结转至利润分配-未分配利润(4104)
- **幂等保护**：重复结账自动跳过，防止产生重复结转凭证
- 检查开关可配置，检查通过后方可执行结账
- 支持反结账操作（同时清理损益结转和年末利润结转凭证）

### 9. 固定资产管理
- 固定资产卡片 CRUD（编码/名称/类别/购入日期/原值/残值率/使用年限）
- 直线法自动计算月折旧额
- **折旧计提**：自动更新累计折旧与净值，最后一期不足整月时按剩余额度计提
- **折旧自动生成凭证**：计提折旧时自动生成已过账会计凭证（借：6602 管理费用 / 贷：1602 累计折旧）
- 资产状态管理：在用 / 已提足折旧 / 报废 / 已处置

## 性能优化

- **exceljs 按需加载**：导出报表时动态 import，减小首屏体积
- **Element Plus 全局字号变量**：通过 CSS 变量统一控制所有组件字号
- **全局绿色主题**：统一 `--el-color-primary` 覆盖，免去逐组件配置

## 数据库安全

### 密码保护

数据库使用 PBKDF2-SHA256 哈希密码保护，默认密码为 `123456`。

- 首次运行时自动在 `db_config` 表中设置密码哈希
- 后续启动时验证密码，不匹配则拒绝打开数据库
- 密码在 `database/index.cjs` 中的 `DB_PASSWORD` 常量配置

### 数据隔离

- 所有业务表通过 `book_id` 外键关联到 `acct_book`
- 一个公司 = 一个账套，数据完全隔离
- 删除账套时自动级联清理所有关联数据
- 外键约束 (`PRAGMA foreign_keys = ON`) 保证数据完整性

### 数据库表结构（14 张表）

| 表名 | 用途 | 隔离键 |
|------|------|--------|
| `db_config` | 密码哈希 + 元数据 | 全局 |
| `sys_company` | 公司基本信息 | - |
| `sys_user` | 用户账号 | 全局 |
| `acct_book` | 会计账套 | FK → sys_company |
| `acct_period` | 会计期间 | FK → acct_book |
| `bd_subject` | 会计科目 | book_id |
| `gl_opening_balance` | 期初余额 | book_id |
| `gl_voucher` | 记账凭证 | book_id |
| `gl_voucher_entry` | 凭证分录 | FK → gl_voucher |
| `aux_project_type` | 辅助核算类别 | book_id |
| `aux_project_value` | 辅助核算项目值 | book_id |
| `voucher_words` | 凭证字类型 | book_id |
| `multi_column_scheme` | 多栏账方案 | book_id |
| `report_template` | 报表模板 | book_id |
| `gl_voucher_attachment` | 凭证附件 | FK → gl_voucher |
| `sys_operation_log` | 操作日志 | company_id |

## 开发命令

```bash
# 安装依赖
npm install

# 启动 Electron 桌面应用 (开发模式)
npm run dev:electron

# 构建 Windows 安装包 (NSIS)
npm run build:exe

# 构建 Windows 便携版 (免安装)
npm run build:exe:portable
```

### 数据库表结构

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `acct_book` | 账套信息 | id, name, current_period |
| `acct_period` | 会计期间 | id, book_id, period, status |
| `bd_subject` | 会计科目 | code(唯一), name, direction, category, level, parent_code, builtin |
| `gl_opening_balance` | 期初余额 | subject_code, debit, credit, period |
| `gl_voucher` | 凭证主表 | voucher_word, voucher_no, voucher_date, status |
| `gl_voucher_entry` | 凭证分录 | summary, subject_code, debit, credit |
| `sys_operation_log` | 操作日志 | action, detail, operator, created_at |

## API 架构

```
渲染进程 (Vue)                    主进程 (Node.js)
    │                                  │
    ├── src/api/index.ts               │
    │   └── ElectronFinanceApi         │
    │       └── window.electronAPI ── preload.cjs ── ipcRenderer.invoke()
    │                                  │
    │                             main.cjs ── ipcMain.handle()
    │                                  │
    │                         database/*.cjs ── SQLite
```

## 预置会计科目 (79个金蝶标准一级科目)

| 类别 | 数量 | 编码范围 | 方向 | 代表科目 |
|------|:--:|----------|:--:|------|
| 资产类 | 28 | 1001 ~ 1901 | 借 | 库存现金、银行存款、应收账款、固定资产 |
| 负债类 | 14 | 2001 ~ 2801 | 贷 | 短期借款、应付账款、应交税费 |
| 权益类 | 5 | 4001 ~ 4104 | 贷 | 实收资本、本年利润、利润分配 |
| 成本类 | 4 | 5001 ~ 5101 | 借 | 生产成本、制造费用、劳务成本 |
| 损益类 | 28 | 6001 ~ 6901 | 借/贷 | 主营业务收入、管理费用、财务费用 |

> 一级科目均为 `builtin=1`（内置），不可删除，自动编号为 4 位。用户可在一级科目下创建二级科目（6 位编码，如 `100101`）。

## 业务凭证模板 (8个)

| 模板 | 借方科目 | 贷方科目 | 金额 |
|------|---------|---------|------|
| 提取备用金 | 1001 库存现金 | 1002 银行存款 | 5,000 |
| 支付办公费 | 5602 管理费用 | 1002 银行存款 | 1,200 |
| 确认收入 | 1002 银行存款 | 5001 主营业务收入 | 10,000 |
| 支付工资 | 5602 管理费用 | 2211 应付职工薪酬 | 30,000 |
| 计提折旧 | 5602 管理费用 | 1601 固定资产 | 2,000 |
| 收到投资款 | 1002 银行存款 | 4001 实收资本 | 100,000 |
| 采购商品 | 1405 库存商品 | 1002 银行存款 | 8,000 |
| 销售商品收款 | 1002 银行存款 | 5001 主营业务收入 | 20,000 |

## 注意事项

- 路由采用 **Hash 模式** (`createWebHashHistory`)，适配 Electron 的 `file://` 协议
- 数据库文件位于用户数据目录的 `Rabbit_ERP.db`
- 凭证仅草稿状态可编辑/删除；审核后只能过账；过账后需先反过账再反审核
- Windows 打包使用 `electron-builder`，NSIS 安装包输出至 `release/` 目录
- 修改 `app.config.cjs` 后运行 `npm run dev` 或 `npm run build:exe` 自动同步
- 全局字号调整在 `src/styles.css` 中修改 `--el-font-size-*` CSS 变量
