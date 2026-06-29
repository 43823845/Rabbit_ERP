# 账簿功能模块 — 完整需求规格说明书

> 参考金蝶KIS、用友T3等主流财务软件的账簿模块设计，结合本系统（Rabbit_ERP）现有架构能力编写。

---

## 目录

1. [账簿体系总览](#1-账簿体系总览)
2. [数据源与前提条件](#2-数据源与前提条件)
3. [明细账](#3-明细账)
4. [总账](#4-总账)
5. [科目余额表](#5-科目余额表)
6. [多栏账](#6-多栏账)
7. [数量金额明细账](#7-数量金额明细账)
8. [数量金额总账](#8-数量金额总账)
9. [核算项目余额表](#9-核算项目余额表)
10. [核算项目明细账](#10-核算项目明细账)
11. [核算项目组合表](#11-核算项目组合表)
12. [通用交互规范](#12-通用交互规范)
13. [SQL实现参考](#13-SQL实现参考)

---

## 1. 账簿体系总览

```
┌─────────────────────────────────────────────────────────┐
│                    账簿查询模块                          │
│                                                         │
│  ┌──────────── 主账簿 ────────────┐                      │
│  │  ① 明细账    — 逐笔分录 + 余额      ← 已部分实现     │
│  │  ② 总账      — 科目汇总（期初/本期/累计）← 已部分实现│
│  │  ③ 科目余额表 — 所有科目发生额汇总    ← 已部分实现   │
│  │  ④ 多栏账    — 借方/贷方按下级科目展开 ← 待实现      │
│  └────────────────────────────────┘                      │
│                                                         │
│  ┌──────────── 辅助账簿 ──────────┐                      │
│  │  ⑤ 数量金额明细账 — 数量+金额+余额   ← 待实现       │
│  │  ⑥ 数量金额总账   — 数量+金额汇总  ← 待实现         │
│  │  ⑦ 核算项目余额表 — 按辅助维度汇总 ← 待实现          │
│  │  ⑧ 核算项目明细账 — 按辅助维度逐笔 ← 待实现          │
│  │  ⑨ 核算项目组合表 — 双辅助维度交叉 ← 已实现 (v1.2)   │
│  └────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

**数据源统一规则：** 所有账簿仅查询 `status = 'posted'`（已过账）的凭证。未过账凭证不参与账簿计算。

---

## 2. 数据源与前提条件

### 2.1 核心表关系

```
gl_voucher (凭证主表)
    └── gl_voucher_entry (分录明细) ← 数量/金额/辅助核算
            ├── JOIN bd_subject → 科目方向、层级
            └── JOIN gl_opening_balance → 期初余额

aux_project_type (辅助核算类别: 客户/供应商/部门/项目/职员)
    └── aux_project_value (辅助核算项目值)
```

### 2.2 余额计算通用公式

```typescript
// 借方科目 (asset/cost/expense)
余额 = 期初借方 - 期初贷方 + 本期借方 - 本期贷方

// 贷方科目 (liability/equity/income)
余额 = 期初贷方 - 期初借方 + 本期贷方 - 本期借方

// 方向判定
if (余额 >= 0) → 科目默认方向 (debit→"借", credit→"贷")
if (余额 < 0)  → 反方向 (debit→"贷", credit→"借")
```

---

## 3. 明细账

### 3.1 功能定位
查询**单个科目**在指定期间内的所有**逐笔分录**，展示每笔发生额及实时滚动的余额。是分析科目经济活动的最详细账簿。

### 3.2 行业标准功能清单

| 功能 | 当前状态 | 说明 |
|------|:------:|------|
| 科目选择（树形导航） | ✅ 已实现 | 右侧科目树，点选查询 |
| 期间过滤 | ✅ 已实现 | period 下拉 |
| 日期范围过滤 | ⚠️ 部分实现 | 控件已有但未生效于后端 |
| 期初余额行 | ✅ 已实现 | 首行显示期初 |
| 逐笔分录（日期+凭证号+摘要+借方+贷方） | ✅ 已实现 | 含余额滚动计算 |
| 方向列 + 余额列 | ✅ 已实现 | 借/贷方向标记 |
| 本期合计行 | ✅ 已实现 | 本期借方/贷方汇总 |
| 本年累计行 | ✅ 已实现 | 年初至今累计 |
| 包含未过账凭证选项 | ❌ 待实现 | checkbox 已有，逻辑未通 |
| 打印/导出 | ❌ 待实现 | 按钮已有，功能未通 |
| 翻页（大数据量） | ❌ 待实现 | 当前全量加载 |
| 联查凭证详情 | ❌ 待实现 | 点击凭证号跳转到凭证 |
| 联查总账 | ❌ 待实现 | 从明细账切换到总账 |

### 3.3 列设计规范

```
┌────────┬──────────┬──────────────────┬──────────┬──────────┬────┬──────────┐
│  日期   │ 凭证字号  │      摘要         │   借方    │   贷方    │方向│   余额    │
├────────┼──────────┼──────────────────┼──────────┼──────────┼────┼──────────┤
│        │          │ 期初余额          │          │          │ 借 │ 100,000   │
│ 06-01  │ 记-1     │ 采购原材料        │  50,000  │          │ 借 │ 150,000   │
│ 06-05  │ 记-3     │ 支付供应商款      │          │  30,000  │ 借 │ 120,000   │
│ ...    │ ...      │ ...              │   ...    │   ...    │ .. │ ...       │
│        │          │ 本期合计          │ 120,000  │  80,000  │    │ 140,000   │
│        │          │ 本年累计          │ 350,000  │ 210,000  │ 借 │ 140,000   │
└────────┴──────────┴──────────────────┴──────────┴──────────┴────┴──────────┘
```

### 3.4 待增强实现

```typescript
// 1. 翻页支持 — 当前 getDetailLedger 已支持 page/pageSize
const result = await api.getDetailLedger({
  subjectCode: detailSubjectCode.value,
  period: period.value,
  startDate: detailStartDate.value || undefined,
  endDate: detailEndDate.value || undefined,
  page: currentPage.value,
  pageSize: 50,
});
detailTotal.value = result.total;

// 2. 包含未过账 — 后端需要增加 includeUnposted 参数
// 3. 凭证联查 — 点击凭证字号行，emit 事件到父页面切换到凭证详情
```

---

## 4. 总账

### 4.1 功能定位
按**一级科目**汇总查询，显示每个科目的期初余额、本期发生额合计、本年累计发生额合计、期末余额。是了解科目宏观财务状况的核心账簿。

### 4.2 行业标准功能清单

| 功能 | 当前状态 | 说明 |
|------|:------:|------|
| 期间区间过滤（从—至） | ⚠️ 部分实现 | 控件已有，实际只用了起始期间 |
| 按一级科目分组 | ✅ 已实现 | span-method 合并单元格 |
| 期初余额行 | ✅ 已实现 | 每个科目首行 |
| 本期合计行 | ✅ 已实现 | 每个科目第二行 |
| 本年累计行 | ✅ 已实现 | 每个科目第三行 |
| 余额方向判定 | ✅ 已实现 | 借/贷标记 |
| 显示辅助核算选项 | ❌ 待实现 | checkbox 已有 |
| 打印/导出 | ❌ 待实现 | 按钮已有 |
| 科目级次过滤（1级/2级/全部） | ❌ 待实现 | 提高灵活性 |
| 联查明细账 | ❌ 待实现 | 双击科目行进入明细账 |

### 4.3 列设计规范

```
┌──────────┬──────────────┬──────────┬──────────┬──────────┬────┬──────────┐
│ 科目编码  │  科目名称     │   摘要    │   借方    │   贷方    │方向│   余额    │
├──────────┼──────────────┼──────────┼──────────┼──────────┼────┼──────────┤
│ 1001     │ 库存现金      │ 期初余额  │          │          │ 借 │  50,000   │
│          │              │ 本期合计  │ 20,000   │ 10,000   │ 借 │  60,000   │
│          │              │ 本年累计  │ 50,000   │ 30,000   │ 借 │  60,000   │
├──────────┼──────────────┼──────────┼──────────┼──────────┼────┼──────────┤
│ 1002     │ 银行存款      │ 期初余额  │          │          │ 借 │ 200,000   │
│          │              │ 本期合计  │150,000   │ 80,000   │ 借 │ 270,000   │
│          │              │ 本年累计  │450,000   │280,000   │ 借 │ 270,000   │
└──────────┴──────────────┴──────────┴──────────┴──────────┴────┴──────────┘
```

### 4.4 待增强实现

```typescript
// 1. 真正的期间区间查询
//    当前仅用 generalPeriodFrom 取期初，用 generalPeriodTo 取本期发生
//    应支持：期初 = generalPeriodFrom 之前所有，本期 = [from, to] 区间
//    累计 = 年初至 generalPeriodTo

// 2. 显示辅助核算
//    勾选后在每个科目下额外展开按 auxType 分组的行

// 3. 科目级次过滤器
<el-radio-group v-model="generalLevel" size="small">
  <el-radio-button value="1">一级科目</el-radio-button>
  <el-radio-button value="all">全部科目</el-radio-button>
</el-radio-group>
```

---

## 5. 科目余额表

### 5.1 功能定位
展示**所有科目**在指定期间的期初余额、借方发生额、贷方发生额、期末余额。是会计期末结账前的核心核对报表。

### 5.2 行业标准功能清单

| 功能 | 当前状态 | 说明 |
|------|:------:|------|
| 期间过滤 | ✅ 已实现 | period 下拉 |
| 科目编码/名称显示 | ✅ 已实现 | 含金额数据 |
| 期初余额列 | ⚠️ 部分实现 | 显示0.00（未从opeing_balance取值） |
| 借方发生额列 | ✅ 已实现 | 取自getSubjectBalance |
| 贷方发生额列 | ✅ 已实现 | 取自getSubjectBalance |
| 期末余额列 | ✅ 已实现 | 计算展示 |
| 底栏合计行 | ⚠️ 部分实现 | 硬编码0.00 |
| 科目级次过滤 | ❌ 待实现 | 仅显示1级/显示至末级 |
| 显示辅助核算 | ❌ 待实现 | 按辅助核算展开 |
| 余额方向显示 | ❌ 待实现 | 根据科目方向显示借/贷 |
| 期末余额为0不显示 | ❌ 待实现 | 减少干扰 |
| 联查明细账 | ❌ 待实现 | 双击科目行跳转 |
| 导出Excel | ❌ 待实现 | 行业标配 |

### 5.3 列设计规范

```
┌──────────┬──────────────┬────┬──────────┬──────────┬──────────┬──────────┐
│ 科目编码  │  科目名称     │方向│  期初余额 │借方发生额 │贷方发生额 │  期末余额 │
├──────────┼──────────────┼────┼──────────┼──────────┼──────────┼──────────┤
│ 1001     │ 库存现金      │ 借 │  50,000  │  20,000  │  10,000  │  60,000  │
│ 1002     │ 银行存款      │ 借 │ 200,000  │ 150,000  │  80,000  │ 270,000  │
│ 1122     │ 应收账款      │ 借 │  80,000  │  60,000  │  40,000  │ 100,000  │
│ 2001     │ 短期借款      │ 贷 │ 100,000  │  50,000  │   0      │  50,000  │
│ ...      │ ...          │ .. │   ...    │   ...    │   ...    │   ...    │
├──────────┼──────────────┼────┼──────────┼──────────┼──────────┼──────────┤
│  合计     │              │    │430,000   │ 280,000  │ 130,000  │ 480,000  │
└──────────┴──────────────┴────┴──────────┴──────────┴──────────┴──────────┘
```

### 5.4 待增强实现

```typescript
// 期初余额取自 getOpeningBalances
const openings = await api.getOpeningBalances(period.value);
const openingMap = new Map(openings.map(o => [o.subject_code, o]));

// 余额方向来自科目定义
const subjectMap = new Map(allSubjects.value.map(s => [s.code, s]));
const dir = subjectMap.get(row.code)?.direction === 'debit' ? '借' : '贷';

// 合计行动态计算
computed(() => {
  let debit = 0, credit = 0;
  balanceList.value.forEach(r => {
    debit += r.debitAmount;
    credit += r.creditAmount;
  });
  return { debit, credit };
});
```

---

## 6. 多栏账

### 6.1 功能定位
针对**非末级科目**（如管理费用、销售费用），将其**下级科目**作为列展开，展示借方/贷方多栏格式。典型应用于费用类科目的明细分析。

### 6.2 行业标准功能清单

| 功能 | 当前状态 | 说明 |
|------|:------:|------|
| 多栏账方案管理 | ❌ 待实现 | 保存/加载查询方案 |
| 多栏账科目选择 | ❌ 待实现 | 仅非末级科目可选 |
| 自动编排下级科目为列 | ❌ 待实现 | 按借方/贷方展开 |
| 借方多栏 / 贷方多栏 | ❌ 待实现 | 可选显示方向 |
| 包含未过账 | ❌ 待实现 | 过滤选项 |
| 金额/数量金额格式切换 | ❌ 待实现 | 如果科目启用数量核算 |
| 打印/导出 | ❌ 待实现 | |

### 6.3 列设计规范（以「管理费用」为例）

```
管理费用 多栏账 — 2026年06月
┌────────┬──────────┬──────────────────┬────────┬────────┬────────┬────────┬────────┬────────┬──────────┐
│  日期   │ 凭证字号  │      摘要         │ 工资   │ 办公费  │ 差旅费  │招待费  │ 折旧费  │ 水电费  │   合计    │
├────────┼──────────┼──────────────────┼────────┼────────┼────────┼────────┼────────┼────────┼──────────┤
│        │          │ 期初余额          │  0     │  0     │  0     │  0     │  0     │  0     │    0     │
│ 06-10  │ 记-5     │ 支付办公室租金    │        │ 5,000  │        │        │        │        │  5,000   │
│ 06-15  │ 记-8     │ 张三出差报销      │        │        │ 2,500  │        │        │        │  2,500   │
│ 06-20  │ 记-12    │ 计提本月工资      │30,000  │        │        │        │        │        │ 30,000   │
│        │          │ 本期合计          │30,000  │ 5,000  │ 2,500  │  0     │  0     │  0     │ 37,500   │
│        │          │ 本年累计          │180,000 │30,000  │15,000  │ 8,000  │12,000  │ 6,000  │251,000   │
└────────┴──────────┴──────────────────┴────────┴────────┴────────┴────────┴────────┴────────┴──────────┘
```

### 6.4 实现方案

```typescript
// ===== 方案管理 =====
interface MultiColumnScheme {
  id: number;
  name: string;            // 方案名称，如"管理费用多栏账"
  parentCode: string;      // 非末级科目编码，如"6602"
  parentName: string;      // 科目名称
  direction: 'debit' | 'credit'; // 展开方向
  children: string[];      // 下级科目编码列表（按列顺序）
}

// 保存方案到 localStorage 或新增数据库表
// 方案表: multi_column_scheme (id, book_id, name, parent_code, parent_name, direction, children_json, created_at)

// ===== 查询逻辑 =====
async function queryMultiColumn(scheme: MultiColumnScheme, period: string) {
  const children = allSubjects.value.filter(
    s => s.parent_code === scheme.parentCode
  );
  
  const result = await api.getDetailLedger({
    subjectCode: scheme.parentCode, // 查询整个父科目
    period: period,
  });
  
  // 按子科目 + 凭证分组，构建多栏矩阵
  // 每行 = 一个凭证/分录，列 = 子科目借方金额
}

// ===== 列动态生成 =====
// el-table-column 使用 v-for 遍历 children 生成
const childColumns = computed(() => 
  children.value.map(c => ({
    prop: `child_${c.code}`,
    label: c.name,
    width: 120,
    align: 'right',
  }))
);
```

### 6.5 多栏账方案数据库表（建议新增）

```sql
CREATE TABLE IF NOT EXISTS multi_column_scheme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  parent_code TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'debit',
  children_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. 数量金额明细账

### 7.1 功能定位
针对启用了**数量核算**的科目（如原材料、库存商品），展示数量、单价、金额三位一体的逐笔明细。适用于存货类科目的精细管理。

### 7.2 使用条件
只有 `bd_subject` 中设置了数量核算属性的科目才能访问此账簿。建议在科目表增加 `is_quantity` 字段标记。

### 7.3 行业标准功能清单

| 功能 | 当前状态 | 说明 |
|------|:------:|------|
| 科目过滤（仅数量科目） | ❌ 待实现 | 科目树过滤 |
| 期间过滤 | ❌ 待实现 | |
| 日期范围过滤 | ❌ 待实现 | |
| 含未过账选项 | ❌ 待实现 | |
| 收入/发出/结存三栏 | ❌ 待实现 | 借方=收入，贷方=发出 |
| 打印/导出 | ❌ 待实现 | |

### 7.4 列设计规范

```
原材料 — 数量金额明细账 — 2026年06月
┌────────┬──────────┬──────────┬────────────────┬────────────────┬──────────────────────┐
│  日期   │ 凭证字号  │   摘要    │     收入        │     发出        │       结存           │
│        │          │          ├────┬─────┬─────┼────┬─────┬─────┼──────┬─────┬─────────┤
│        │          │          │数量│单价 │金额 │数量│单价 │金额 │ 数量 │单价 │  金额   │
├────────┼──────────┼──────────┼────┼─────┼─────┼────┼─────┼─────┼──────┼─────┼─────────┤
│        │          │期初余额  │    │     │     │    │     │     │ 100  │ 50  │  5,000  │
│ 06-03  │ 记-2     │采购入库  │ 50 │ 52  │2600 │    │     │     │ 150  │50.67│  7,600  │
│ 06-10  │ 记-7     │生产领用  │    │     │     │ 30 │50.67│1520 │ 120  │50.67│  6,080  │
│        │          │本期合计  │ 50 │     │2600 │ 30 │     │1520 │ 120  │50.67│  6,080  │
│        │          │本年累计  │200 │     │10400│ 80 │     │4000 │ 120  │50.67│  6,080  │
└────────┴──────────┴──────────┴────┴─────┴─────┴────┴─────┴─────┴──────┴─────┴─────────┘

注：结存单价 = 结存金额 / 结存数量（加权平均）
```

### 7.5 实现方案

```typescript
interface QtyDetailDisplayRow {
  type: 'opening' | 'entry' | 'periodTotal' | 'yearTotal';
  date: string;
  voucher: string;
  summary: string;
  // 收入（借方）
  inQuantity: number;
  inUnitPrice: number;
  inAmount: number;
  // 发出（贷方）
  outQuantity: number;
  outUnitPrice: number;
  outAmount: number;
  // 结存
  balanceQuantity: number;
  balanceUnitPrice: number;
  balanceAmount: number;
}

async function queryQtyDetailLedger() {
  const result = await api.getQuantityDetailLedger({
    subjectCode: qtySubjectCode.value,
    period: period.value,
  });
  // 逐行计算加权平均结存单价
  let balQty = openingQty;
  let balAmt = openingAmt;
  for (const r of result.rows) {
    if (r.debit > 0) {
      balQty += r.quantity;
      balAmt += r.debit;
      // 收入行
    } else {
      const unitPrice = balAmt / balQty;
      balQty -= r.quantity;
      balAmt -= r.quantity * unitPrice;
      // 发出行（按移动加权平均计价）
    }
    rows.push({ ... });
  }
}
```

---

## 8. 数量金额总账

### 8.1 功能定位
按科目汇总展示数量金额维度的总账数据，与普通总账对应但增加了收入数量/发出数量/结存数量列。

### 8.2 列设计规范

```
┌──────────┬──────────────┬──────────┬────────────────────┬────────────────────┬────────────────────────┐
│ 科目编码  │  科目名称     │   摘要    │     本期发生        │     本年累计        │       期末结存         │
│          │              │          ├────┬──────┬────────┼────┬──────┬────────┼──────┬───────┬─────────┤
│          │              │          │数量│ 金额  │        │数量│ 金额  │        │ 数量 │ 单价  │  金额   │
├──────────┼──────────────┼──────────┼────┼──────┼────────┼────┼──────┼────────┼──────┼───────┼─────────┤
│ 1403     │ 原材料        │ 期初余额  │    │      │        │    │      │        │ 100  │ 50    │  5,000  │
│          │              │ 本期收入  │ 50 │ 2,600│        │200 │10,400│        │      │       │         │
│          │              │ 本期发出  │    │      │ 1,520  │    │      │ 4,000  │      │       │         │
│          │              │ 期末结存  │    │      │        │    │      │        │ 120  │ 50.67 │  6,080  │
└──────────┴──────────────┴──────────┴────┴──────┴────────┴────┴──────┴────────┴──────┴───────┴─────────┘
```

### 8.3 API 已就绪
后端 `getQuantityGeneralLedger` 已实现，返回 `in_quantity`、`out_quantity`、`net_quantity`。前端需要展示即可。

---

## 9. 核算项目余额表

### 9.1 功能定位
按**辅助核算类别**（客户/供应商/部门/项目/职员）汇总展示各科目的发生额和余额。例如：查询"应收账款"按"客户"维度的余额表。

### 9.2 查询逻辑流程

```
用户操作：
  ① 选择辅助核算类别（如"客户"）
  ② 选择辅助核算项目（如"A公司"，可选）
  ③ 选择会计期间
  ④ 点击查询

系统查询：
  SELECT subject_code, subject_name, aux_value_id,
         SUM(debit) as debit_amount, SUM(credit) as credit_amount
  FROM gl_voucher_entry e
  JOIN gl_voucher v ON v.id = e.voucher_id
  WHERE v.status = 'posted'
    AND e.aux_type_id = ?
    AND v.period = ?
  GROUP BY subject_code, aux_value_id
```

### 9.3 列设计规范

```
核算项目余额表 — 客户 — 2026年06月
┌──────────┬──────────────┬──────────────┬────┬──────────┬──────────┬──────────┐
│ 科目编码  │  科目名称     │  核算项目     │方向│  期初余额 │  借方发生 │  贷方发生 │
├──────────┼──────────────┼──────────────┼────┼──────────┼──────────┼──────────┤
│ 1122     │ 应收账款      │ A公司        │ 借 │  30,000  │  50,000  │  20,000  │
│ 1122     │ 应收账款      │ B公司        │ 借 │  50,000  │  10,000  │  40,000  │
│ 2202     │ 应付账款      │ X供应商      │ 贷 │  40,000  │  15,000  │  25,000  │
└──────────┴──────────────┴──────────────┴────┴──────────┴──────────┴──────────┘
```

### 9.4 API 已就绪
后端 `getAuxProjectBalance` 已实现。

---

## 10. 核算项目明细账

### 10.1 功能定位
按辅助核算维度展示逐笔明细，展示每笔分录对应的辅助核算项目名称。是普通明细账加上辅助核算项目列的版本。

### 10.2 列设计规范

```
核算项目明细账 — 客户 — A公司 — 2026年06月
┌────────┬──────────┬──────────────┬──────────┬──────────┬──────────┬────┬──────────┐
│  日期   │ 凭证字号  │     摘要      │ 核算项目  │   借方    │   贷方    │方向│   余额    │
├────────┼──────────┼──────────────┼──────────┼──────────┼──────────┼────┼──────────┤
│        │          │ 期初余额      │          │          │          │ 借 │  30,000  │
│ 06-05  │ 记-3     │ 销售商品      │ A公司    │  50,000  │          │ 借 │  80,000  │
│ 06-15  │ 记-9     │ 收到货款      │ A公司    │          │  20,000  │ 借 │  60,000  │
│        │          │ 本期合计      │          │  50,000  │  20,000  │    │  60,000  │
└────────┴──────────┴──────────────┴──────────┴──────────┴──────────┴────┴──────────┘
```

### 10.3 API 已就绪
后端 `getAuxProjectDetail` 已实现。

---

## 11. 核算项目组合表

### 11.1 功能定位
**二维交叉分析**报表。行列分别由两个辅助核算维度（或科目+辅助核算）组成，单元格显示金额。例如：
- 行 = 客户，列 = 科目 → 各客户在各科目下的余额
- 行 = 部门，列 = 费用科目 → 各部门费用分布
- 行 = 客户，列 = 部门 → 客户×部门的交叉数据

### 11.2 查询逻辑

```
用户操作：
  ① 选择行维度（如"客户"）
  ② 选择列维度（如"科目"或另一个辅助核算类别"部门"）
  ③ 选择会计期间
  ④ 点击查询

系统查询（以客户×科目为例）：
  SELECT
    av.name as row_label,
    e.subject_code,
    e.subject_name,
    SUM(e.debit) - SUM(e.credit) as balance
  FROM gl_voucher_entry e
  JOIN gl_voucher v ON v.id = e.voucher_id
  JOIN aux_project_value av ON av.id = e.aux_value_id
  WHERE v.status = 'posted' AND v.period = ?
    AND e.aux_type_id = ?  -- 客户类别
  GROUP BY av.name, e.subject_code
  ORDER BY av.name, e.subject_code

前端渲染：
  将查询结果转换为矩阵 → 动态生成表头（唯一科目列表）+ 行（唯一客户列表）
```

### 11.3 列设计规范

```
核算项目组合表 — 客户 × 科目 — 2026年06月
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ 客户\科目 │ 应收账款  │ 预收账款  │ 主营业务收入│ 银行存款  │   合计    │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ A公司    │  60,000  │   0      │ 50,000   │ 20,000   │ 130,000  │
│ B公司    │  20,000  │  5,000   │ 30,000   │ 40,000   │  95,000  │
│ C公司    │  40,000  │   0      │ 20,000   │ 10,000   │  70,000  │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│   合计    │ 120,000  │  5,000   │100,000   │ 70,000   │ 295,000  │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

### 11.4 实现方案

```typescript
// ===== 数据结构 =====
interface ComboTableData {
  rowLabels: string[];          // 行标签列表（如客户名称）
  colLabels: string[];          // 列标签列表（如科目名称）
  matrix: number[][];           // [row][col] → 金额
  rowTotals: number[];          // 每行合计
  colTotals: number[];          // 每列合计
  grandTotal: number;           // 总计
}

// ===== 查询构建 =====
async function queryComboTable(params: {
  rowType: 'subject' | 'aux';     // 行维度类型
  rowAuxTypeId?: number;          // 行辅助核算类别ID
  colType: 'subject' | 'aux';     // 列维度类型
  colAuxTypeId?: number;          // 列辅助核算类别ID
  period: string;
}) {
  // 1. 查询原始数据（带行列维度标记）
  // 2. 提取唯一行标签和列标签
  // 3. 构建 matrix[rowIndex][colIndex] = 金额
  // 4. 计算行列合计和总计
}

// ===== 表格渲染（动态列） =====
<el-table :data="comboRows" border size="small">
  <el-table-column prop="rowLabel" label="客户\科目" width="120" fixed />
  <el-table-column
    v-for="col in comboColLabels"
    :key="col"
    :prop="col"
    :label="col"
    align="right"
    width="130"
  >
    <template #default="{ row }">{{ row[col]?.toFixed(2) || '0.00' }}</template>
  </el-table-column>
  <el-table-column prop="rowTotal" label="合计" align="right" width="130" />
</el-table>
```

### 11.5 建议新增数据库表（存储组合表查询方案）

```sql
CREATE TABLE IF NOT EXISTS combo_scheme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  row_type TEXT NOT NULL,         -- 'subject' | 'aux'
  row_aux_type_id INTEGER,
  col_type TEXT NOT NULL,         -- 'subject' | 'aux'
  col_aux_type_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 12. 通用交互规范

### 12.1 查询条件栏布局

```
┌──────────────────────────────────────────────────────────────┐
│ [期间▼] [开始日期] - [结束日期] [□包含未过账] [科目级次▼]  │ [查询] [重置] [打印] [导出] │
└──────────────────────────────────────────────────────────────┘
```

### 12.2 账簿间联查（数据穿透）

```
科目余额表 ──双击科目行──→ 总账 ──双击科目行──→ 明细账 ──双击分录行──→ 凭证详情
```

实现方式：`emit('navigate', { target: 'voucher', voucherId: 123 })` 或在应用层通过路由跳转。

### 12.3 打印规范

```
所有账簿打印格式：
  - 页眉：公司名称 + 账簿名称 + 会计期间 + 打印日期
  - 页脚：页码 + 制单人
  - 纸张：A4 横向
  - 字体：宋体/等宽数字
```

### 12.4 导出规范

```
导出格式：Excel (.xlsx)
导出内容：当前查询结果的全部数据（不限制 pageSize）
导出列：与表格列一致
文件命名：{账簿名称}_{会计期间}.xlsx
         例如：明细账_1001_2026年06月.xlsx
```

### 12.5 通用状态

| 状态 | 表现 |
|------|------|
| 首次加载 | 自动默认查询（选择第一个科目/默认期间） |
| 加载中 | `v-loading` 遮罩 |
| 无数据 | "暂无数据"占位图 |
| 查询错误 | `ElMessage.error` 提示 |

### 12.6 金额显示规范

```
金额默认右对齐
金额为 0 时不显示（显示空白）
负数用红色显示
货币格式：千分位逗号分隔（1,234,567.89）
```

---

## 13. SQL实现参考

### 13.1 多栏账SQL

```sql
-- 查询管理费用(6602)下所有子科目的本期发生明细
SELECT
  v.voucher_date,
  v.voucher_word,
  v.voucher_no,
  v.remark as voucher_remark,
  e.summary,
  e.subject_code,
  e.subject_name,
  e.debit,
  e.credit
FROM gl_voucher_entry e
JOIN gl_voucher v ON v.id = e.voucher_id
WHERE v.status = 'posted'
  AND v.book_id = ?
  AND v.period = ?
  AND e.subject_code IN (
    SELECT code FROM bd_subject
    WHERE parent_code = '6602' AND book_id = ?
  )
ORDER BY v.voucher_date, v.voucher_no, e.line_no;
```

### 13.2 核算项目组合表SQL

```sql
-- 客户 × 科目 交叉表
SELECT
  av.name as customer_name,
  e.subject_code,
  e.subject_name,
  SUM(COALESCE(e.debit, 0) - COALESCE(e.credit, 0)) as balance
FROM gl_voucher_entry e
JOIN gl_voucher v ON v.id = e.voucher_id
JOIN aux_project_value av ON av.id = e.aux_value_id
WHERE v.status = 'posted'
  AND v.book_id = ?
  AND v.period = ?
  AND e.aux_type_id = ?    -- 客户类别ID
GROUP BY av.name, e.subject_code, e.subject_name
ORDER BY av.name, e.subject_code;
```

### 13.3 总账真实区间查询SQL

```sql
-- 期初余额：期间开始前所有累计
SELECT subject_code, SUM(debit) - SUM(credit) as opening_balance
FROM gl_opening_balance WHERE period <= ? AND book_id = ?
GROUP BY subject_code;

-- 本期发生：指定期间内
SELECT subject_code, SUM(debit) as period_debit, SUM(credit) as period_credit
FROM gl_voucher_entry e
JOIN gl_voucher v ON v.id = e.voucher_id
WHERE v.status = 'posted' AND v.period BETWEEN ? AND ? AND v.book_id = ?
GROUP BY subject_code;

-- 本年累计：年初至期间末
SELECT subject_code, SUM(debit) as year_debit, SUM(credit) as year_credit
FROM gl_voucher_entry e
JOIN gl_voucher v ON v.id = e.voucher_id
WHERE v.status = 'posted' AND v.period BETWEEN ? AND ? AND v.book_id = ?
GROUP BY subject_code;
```

---

## 实现优先级建议

| 优先级 | 账簿 | 原因 |
|:------:|------|------|
| P0 | 科目余额表 | 当前半成品，核心核对报表 |
| P0 | 明细账增强 | 联查/翻页/打印等标配功能 |
| P1 | 总账增强 | 真实期间区间/科目级次 |
| P1 | 多栏账 | 核心账簿，费用分析刚需 |
| P2 | 数量金额明细账/总账 | 数据库已就绪，前端实现 |
| P2 | 核算项目余额表/明细账 | 数据库已就绪，前端实现 |
| P3 | 核算项目组合表 | 最复杂，需方案表支持 |
| P3 | 账簿间联查（穿透） | 导航体验优化 |
| P3 | 打印/导出 | 通用工具功能 |

---

> **文档版本**: v1.0  
> **创建日期**: 2026-06-18  
> **关联文件**: `docs/ARCHITECTURE.md`, `src/views/LedgerView.vue`, `electron/services/finance-database.cjs`
