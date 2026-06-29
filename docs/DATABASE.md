# 数据库设计文档

## 1. 技术选型

| 项目 | 选型 |
|------|------|
| 数据库 | SQLite 3 (better-sqlite3) |
| 存储位置 | `%APPDATA%/rabbit-erp-desktop/Rabbit_ERP.db` |
| WAL 模式 | 启用（并发读性能） |
| 外键约束 | 启用 (PRAGMA foreign_keys = ON) |
| 数据库密码 | PBKDF2-SHA256 哈希，默认密码 `123456` |
| 模块化 | 14 个独立模块文件（schema / companies / users / subjects / vouchers / periods / openings / reports / auxiliary / attachments / voucher-words / multi-column / data-manager / utils） |

---

## 2. ER 关系图

```
sys_company (公司)
    │
    ├── 1:1 ── acct_book (账套)
    │                │
    │                └── 1:N ── acct_period (会计期间)
    │
    ├── 1:N ── gl_voucher (凭证)
    │                │
    │                └── 1:N ── gl_voucher_entry (凭证分录)
    │
    └── 1:N ── sys_operation_log (操作日志)

bd_subject (会计科目) ── 独立表，多公司共享
gl_opening_balance (期初余额) ── 按科目+期间唯一
```

---

## 3. 表结构详细定义

### 3.1 sys_company（公司/客户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| name | TEXT NOT NULL | 公司名称 |
| contact_person | TEXT | 联系人 |
| legal_representative | TEXT | 企业法人 |
| phone | TEXT | 联系电话 |
| address | TEXT | 注册/经营地址 |
| tax_no | TEXT | 统一社会信用代码 |
| current_period | TEXT | 当前会计期间，默认 '2026-06' |
| created_at | TEXT | 创建时间 |

**用途**：每个外账客户对应一条记录，是整个系统的数据隔离根基。

### 3.2 acct_book（账套）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| company_id | INTEGER NOT NULL | 关联 sys_company.id |
| name | TEXT NOT NULL | 账套名称（同公司名称） |
| current_period | TEXT | 当前期间 |
| created_at | TEXT | 创建时间 |

**用途**：每个公司创建一个账套，承载该公司的完整会计数据。

### 3.3 acct_period（会计期间）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| book_id | INTEGER NOT NULL | 关联账套 |
| period | TEXT NOT NULL | 期间标识（如 2026-06） |
| status | TEXT | 'open' / 'closed' |

**用途**：控制结账/反结账。已关闭期间不允许新增修改凭证。

### 3.4 bd_subject（会计科目）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| code | TEXT UNIQUE | 科目编码（一级 4 位如 `1001`，二级 6 位如 `100101`） |
| name | TEXT | 科目名称 |
| direction | TEXT | 'debit'（借方）/ 'credit'（贷方） |
| category | TEXT | asset / liability / equity / cost / income / expense |
| parent_code | TEXT | 上级科目编码（NULL = 一级科目） |
| level | INTEGER | 科目级别：1 = 一级，2 = 二级 |
| enabled | INTEGER | 启用 1 / 禁用 0 |
| builtin | INTEGER | 内置科目 1 / 用户创建 0（内置科目不可删除） |

**六大类科目**：

| 类别 | 编码范围 | 方向 | 说明 |
|------|----------|------|------|
| asset（资产） | 1001~1901 | 借方 | 库存现金、银行、应收、库存、固定资产等 28 项 |
| liability（负债） | 2001~2801 | 贷方 | 短期借款、应付账款、应交税费等 14 项 |
| equity（权益） | 4001~4104 | 贷方 | 实收资本、资本公积、本年利润等 5 项 |
| cost（成本） | 5001~5101 | 借方 | 生产成本、制造费用、劳务成本等 4 项 |
| income（收入） | 6001~6051 | 贷方 | 主营业务收入、其他业务收入等 5 项 |
| expense（费用） | 6301~6901 | 借方 | 主营业务成本、管理费用、财务费用等 23 项 |

**内置 79 个金蝶标准一级科目**：覆盖小微企业全部核算需求，`builtin=1` 不可删除。
**二级科目**：用户在一级科目下自由创建，编码规则为 `一级编码 + 两位序号`（如 `100201`）。

### 3.5 gl_opening_balance（期初余额）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| subject_code | TEXT NOT NULL | 科目编码 |
| subject_name | TEXT | 科目名称（冗余） |
| debit | REAL | 期初借方金额 |
| credit | REAL | 期初贷方金额 |
| period | TEXT | 期间 |
| UNIQUE | (subject_code, period) | 每科目每期间唯一 |

**用途**：科目余额的基础。期末结转后生成下期期初。

### 3.6 gl_voucher（凭证主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| book_id | INTEGER | 账套 ID（数据隔离） |
| period | TEXT | 会计期间 |
| voucher_word | TEXT | 凭证字（记/收/付/转） |
| voucher_no | INTEGER | 凭证号（同字内连续编号） |
| voucher_date | TEXT | 凭证日期 |
| remark | TEXT | 头备注 |
| status | TEXT | draft → audited → posted |
| maker | TEXT | 制单人 |
| bookkeeper | TEXT | 记账人 |
| created_at | TEXT | 创建时间 |

**凭证生命周期**：
```
draft（草稿）──审核→ audited（已审核）──过账→ posted（已过账）
    │                                             │
    └──删除  ← 反审核──                          └──反过账→ audited
```

- **draft**：可编辑、可删除
- **audited**：锁定编辑，可反审核
- **posted**：已入账，参与报表计算，可反过账

### 3.7 gl_voucher_entry（凭证分录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| voucher_id | INTEGER FK | 关联凭证（CASCADE 删除） |
| summary | TEXT | 分录摘要 |
| subject_code | TEXT | 科目编码 |
| subject_name | TEXT | 科目名称 |
| debit | REAL | 借方金额 |
| credit | REAL | 贷方金额 |
| line_no | INTEGER | 行号 |

**约束**：凭证分录总数 ≥ 2，借方合计 = 贷方合计 > 0。

### 3.8 sys_operation_log（操作日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| action | TEXT | 操作类型 |
| detail | TEXT | 操作详情 |
| operator | TEXT | 操作人 |
| company_id | INTEGER | 所属公司 |
| created_at | TEXT | 操作时间 |

---

## 4. 数据隔离策略

```
┌──────────────────────────────────────────┐
│              SQLite 单文件                │
│                                           │
│  sys_company: [公司A] [公司B] [公司C]     │
│       │            │         │            │
│       ▼            ▼         ▼            │
│  acct_book    acct_book  acct_book        │
│  company_id=1 company_id=2 company_id=3   │
│       │            │         │            │
│       ▼            ▼         ▼            │
│  gl_voucher (company_id) 过滤查询         │
│  gl_voucher_entry 通过 voucher_id 关联    │
│                                           │
│  bd_subject（科目表）─ 全局共享           │
└──────────────────────────────────────────┘
```

- `bd_subject` 按 `book_id` 隔离（每个账套独立科目体系）
- `gl_voucher` 通过 `book_id` 隔离（`book_id` → `acct_book.company_id` → `sys_company`）
- 查询时按 `book_id` 过滤

---

## 5. 关键索引

| 表 | 索引 | 用途 |
|----|------|------|
| bd_subject | code UNIQUE | 科目快速查找 |
| gl_opening_balance | (subject_code, period) UNIQUE | 期初余额查重 |
| gl_voucher | (voucher_word, voucher_no) 隐式 | 凭证号排序 |
| gl_voucher | period, status | 凭证筛选 |
| gl_voucher_entry | voucher_id FK | 分录关联查询 |

---

## 6. 迁移策略

```sql
-- 所有表使用 CREATE TABLE IF NOT EXISTS，首次启动自动创建
-- 新增列使用 ALTER TABLE ADD COLUMN + try/catch 兼容旧表
-- 旧 DB 删除后重启即可获得完整新 Schema
```

---

## 7. 报告模板表 (report_template)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| report_type | TEXT NOT NULL | 报告类型：profit / balance / equity_change / tax_detail |
| row_no | INTEGER | 行号（排序） |
| section | TEXT | 分组（如 一、实收资本） |
| name | TEXT | 项目名称 |
| formula | TEXT | 计算公式（科目编码 + 运算） |
| bold | INTEGER | 是否加粗 0/1 |
| indent | INTEGER | 缩进级别 0/1/2 |
| created_at | TEXT | 创建时间 |

**CHECK 约束**：`report_type IN ('profit', 'balance', 'equity_change', 'tax_detail')`

> **v1.2 扩展**：`report_type` 新增 `equity_change`（所有者权益变动表，22行）和 `tax_detail`（应交税费明细表，18行）两种模板类型。

---
