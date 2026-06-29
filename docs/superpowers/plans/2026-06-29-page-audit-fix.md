# ERP外账系统 — 逐页功能审查与修复计划（分层递进）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 ERP 外账系统的 10 个页面和核心服务逐项审查，发现并修复业务逻辑错误、数据安全问题、遗漏功能和代码冗余，使其符合专业财会软件标准。

**Architecture:** 分 P0/P1/P2 三层递进：P0 修复安全漏洞和数据正确性问题，P1 优化业务逻辑和用户体验，P2 清理代码质量和冗余。每层可独立停止。

**Tech Stack:** Vue 3 + Element Plus + SQLite (better-sqlite3) + Electron + TypeScript

## Global Constraints

- 所有修改必须保持 `book_id` 隔离，不破坏多账套数据独享
- 后端 CJS 文件保持现有模块系统，不改为 ES Module
- 修复必须在原有代码风格和文件结构内完成，不做大规模架构重构
- 每个 Task 完成后 commit（原子提交）
- 每层完成后做一次完整回归验证

---

## P0：安全漏洞与数据正确性（必须先修）

### Task P0.1: 修复登录密码明文存储

**Files:**
- Modify: `src/api/mock.ts` (行 407-412: createUser 密码存储)
- Modify: `src/api/mock.ts` (行 438-441: changePassword 密码对比)

**问题:** 密码以 `_password` 字段明文存入 localStorage，任何可以访问开发者工具的人都能看到所有用户密码。

**修复方案:** 使用浏览器内置 `crypto.subtle.digest('SHA-256')` 对密码做哈希后存储和对比。

- [ ] **Step 1: 在 mock.ts 顶部添加哈希辅助函数**

在 `src/api/mock.ts` 的 import 区域之后、class MockFinanceApi 之前添加：

```typescript
async function hashPassword(pwd: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`rabbit_erp_salt_${pwd}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 2: 修改 createUser 存储哈希后的密码**

在 `src/api/mock.ts` 的 `createUser` 方法中（约行 407）：

```typescript
async createUser(payload: UserPayload): Promise<SysUser> {
  const users = this.getUsersSync();
  if (users.find((u: any) => u.username === payload.username)) throw new Error('用户名已存在');
  const hashedPwd = await hashPassword(payload.password);
  const user = {
    id: Date.now(),
    username: payload.username,
    _password: hashedPwd,
    alias: payload.alias || payload.username,
    role: payload.role || 'accountant',
    enabled: 1,
    createdAt: new Date().toISOString(),
  };
  // ... 其余不变
```

- [ ] **Step 3: 修改 login 方法使用哈希对比**

在 `src/api/mock.ts` 的 `login` 方法中（约行 380）：

```typescript
async login(username: string, password: string) {
  const users = this.getUsersSync();
  const hashedInput = await hashPassword(password);
  const user = users.find((u: any) => u.username === username && u._password === hashedInput);
  if (!user || !user.enabled) return null;
  // ... 其余不变
```

- [ ] **Step 4: 修改 changePassword 使用哈希**

在 `src/api/mock.ts` 的 `changePassword` 方法中（约行 438）：

```typescript
async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  if (!newPassword || newPassword.length < 4) throw new Error('新密码至少4位');
  const authState = this.getCachedUserId();
  const users = this.getUsersSync();
  const user = users.find((u: any) => u.id === authState);
  if (!user) throw new Error('用户不存在');
  const hashedOld = await hashPassword(oldPassword);
  if (user._password !== hashedOld) throw new Error('原密码错误');
  user._password = await hashPassword(newPassword);
  this.saveUsers(users);
  return true;
}
```

- [ ] **Step 5: 验证和 Commit**

```bash
git add src/api/mock.ts
git commit -m "fix(P0): hash passwords with SHA-256 instead of storing plaintext"
```

---

### Task P0.2: DashboardView 余额获取失败静默吞错

**Files:**
- Modify: `src/views/DashboardView.vue` (行 102: catch 块)

**问题:** `refreshBalances()` 中 `catch { /* 余额获取失败时静默处理 */ }`，用户完全不知道资金余额数据加载失败，可能基于过期数据做决策。

**修复方案:** 在 catch 中显示 ElMessage.warning 提示，同时设置 balanceCards 为空避免展示过期数据。

- [ ] **Step 1: 修改 catch 块**

在 `src/views/DashboardView.vue` 行 102：

```typescript
  } catch (e: any) {
    console.error('[Dashboard] 获取余额失败:', e?.message || e);
    ElMessage.warning('资金余额数据加载失败，请检查数据库连接');
    balanceCards.value = [];
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "fix(P0): show warning when balance fetch fails instead of silent swallowing"
```

---

### Task P0.3: VoucherView 批量删除无事务保证

**Files:**
- Modify: `src/views/VoucherView.vue` (行 184-199: handleBatchDelete)

**问题:** 逐条循环删除，中途某条失败后继续删除下一条，导致部分删除成功、部分失败，但用户无法知道哪些凭证未删除。此外 `catch { }` 静默吞错。

**修复方案:** 收集失败的凭证信息并在完成提示中明确列出。

- [ ] **Step 1: 改写 handleBatchDelete**

在 `src/views/VoucherView.vue` 行 184-199：

```typescript
async function handleBatchDelete() {
  const draftIds = selectedVouchers.value.filter(v => v.status === 'draft').map(v => v.id);
  if (draftIds.length === 0) { ElMessage.warning('选中的凭证中没有草稿状态，无法批量删除'); return; }
  try {
    await ElMessageBox.confirm(`确定批量删除 ${draftIds.length} 张草稿凭证？此操作不可恢复！`, '批量删除', {
      confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'error',
    });
    let success = 0;
    const failedVoucherNos: string[] = [];
    for (const id of draftIds) {
      try {
        await api.deleteVoucher(id);
        success++;
      } catch (e: any) {
        const v = selectedVouchers.value.find(sv => sv.id === id);
        failedVoucherNos.push(v ? `${v.voucher_word}-${v.voucher_no}` : `ID:${id}`);
      }
    }
    if (failedVoucherNos.length > 0) {
      ElMessage.warning(`成功删除 ${success} 张，${failedVoucherNos.length} 张失败：${failedVoucherNos.join('、')}`);
    } else {
      ElMessage.success(`成功删除 ${success} 张凭证`);
    }
    refresh();
  } catch { /* 取消 */ }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/VoucherView.vue
git commit -m "fix(P0): improve batch delete error reporting with failed voucher details"
```

---

### Task P0.4: ClosingView 试算平衡边界条件审查

**Files:**
- Read: `electron/services/database/periods.cjs` (closePeriod 方法)
- Read: `src/views/ClosingView.vue` (检查项逻辑)

**审查要点:**
1. `endingDiff > 0.01` 的阈值是否合理（会计实务中差额 > 0.01 即为不平衡）
2. 是否存在 `getTrialBalance` 返回 `null` 或空 `totals` 的情况
3. ClosingView 中 `未过账凭证` 检查是否覆盖了 `draft` + `audited` 两种状态

- [ ] **Step 1: 审查并加固 closePeriod 异常处理**

读取 `electron/services/database/periods.cjs` 中 closePeriod 方法，确认：
- 调用 `getTrialBalance` 前检查返回值不为 null
- `totals` 对象为 null/undefined 时抛出明确错误信息

```javascript
// 在 closePeriod 方法中，getTrialBalance 调用后添加：
const tb = this.getTrialBalance(period);
if (!tb || !tb.totals || typeof tb.totals.endingDebit !== 'number') {
  return { __error: '无法获取试算平衡数据，请确认期间数据完整' };
}
const endingDiff = Math.abs((tb.totals.endingDebit || 0) - (tb.totals.endingCredit || 0));
if (endingDiff > 0.01) {
  return { __error: `试算不平衡：期末借方 ${tb.totals.endingDebit} ≠ 期末贷方 ${tb.totals.endingCredit}，差额 ${endingDiff.toFixed(2)}` };
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/services/database/periods.cjs
git commit -m "fix(P0): add null-check for trial balance totals before closing period"
```

---

### Task P0.5: OpeningBalanceView 期初余额试算平衡审查

**Files:**
- Read: `src/views/OpeningBalanceView.vue` (行 48-80: editMap/initEditMap/stats)
- Read: `electron/services/database/periods.cjs` (opening_exists 检查)

**审查要点:**
1. `stats.computed` 中的 `totalDebit` 和 `totalCredit` 计算是否正确
2. 只有一级科目参与期初余额编辑，但试算平衡是否包含了所有一级科目
3. 保存期初余额时是否要求借贷平衡？（金蝶/U8 允许不平衡保存，但结账时检查）

- [ ] **Step 1: 审查并添加保存时试算平衡警告**

在 `src/views/OpeningBalanceView.vue` 的保存逻辑中添加：

```typescript
// 在 handleSave 方法中，保存前添加：
const s = stats.value;
if (Math.abs(s.diff) > 0.01) {
  await ElMessageBox.confirm(
    `期初余额借贷不平衡：借方合计 ${s.totalDebit.toFixed(2)}，贷方合计 ${s.totalCredit.toFixed(2)}，差额 ${s.diff.toFixed(2)}。\n\n仍要保存吗？`,
    '试算不平衡',
    { confirmButtonText: '仍要保存', cancelButtonText: '取消', type: 'warning' }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/OpeningBalanceView.vue
git commit -m "fix(P0): add trial balance warning before saving opening balances"
```

---

### Task P0.6: AssetView 折旧计算边界条件审查

**Files:**
- Read: `electron/services/database/assets.cjs`
- Read: `src/views/AssetView.vue`

**审查要点:**
1. 残值率 > 1 或 < 0 时是否拒绝
2. 使用年限 ≤ 0 时是否拒绝
3. 计提期数超过剩余可用期数时是否截断（不应让净值低于残值）
4. 已提足折旧的资产再次计提是否拒绝
5. 报废/已处置状态的资产是否允许修改

- [ ] **Step 1: 审查 assets.cjs depreciateAsset 逻辑**

确认 depreciateAsset 中包含以下检查：

```javascript
// 读取现有卡片
const card = db.prepare('SELECT * FROM fa_asset_card WHERE id = ?').get(id);
if (!card) return { __error: '固定资产不存在' };
if (card.status === '报废' || card.status === '已处置') {
  return { __error: '该资产已报废或已处置，不能计提折旧' };
}
if (card.status === '已提足折旧') {
  return { __error: '该资产已提足折旧，无需再计提' };
}

// 计算剩余可提折旧额度
const residual = card.original_value * (card.residual_rate || 0);
const maxDepreciable = card.original_value - residual;
const currentAccDep = card.accumulated_depreciation;
const remainingDepreciable = maxDepreciable - currentAccDep;
const maxPeriods = Math.floor(remainingDepreciable / card.monthly_depreciation);
const effectivePeriods = Math.min(periods, maxPeriods);
```

- [ ] **Step 2: 如有缺失，添加检查逻辑后 commit**

```bash
git add electron/services/database/assets.cjs
git commit -m "fix(P0): add depreciation boundary checks for fully-depreciated/disposed assets"
```

---

## P1：业务逻辑与用户体验优化

### Task P1.1: VoucherView 重新编号错误提示修正

**Files:**
- Modify: `src/views/VoucherView.vue` (handleReorder 方法)

**问题:** `handleReorder` 调用 `reorderAllVoucherNos` 失败时回退到只整理"记"字凭证，但提示"已整理记字凭证编号"可能误导用户以为全部成功。

**修复方案:** 区分两种路径的成功/失败提示。

- [ ] **Step 1: 查找并修改 handleReorder**

```typescript
async function handleReorder() {
  try {
    await api.reorderAllVoucherNos(currentPeriod.value);
    ElMessage.success('已重新整理所有凭证编号');
  } catch (e: any) {
    // 回退：只整理"记"字凭证
    try {
      await api.reorderVoucherNos({ voucherWord: '记', period: currentPeriod.value });
      ElMessage.warning('仅成功整理了「记」字凭证编号，其他凭证字整理失败，请手动调整');
    } catch {
      ElMessage.error('凭证编号整理失败：' + (e?.message || '未知错误'));
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/VoucherView.vue
git commit -m "fix(P1): improve reorder error messages to distinguish partial success"
```

---

### Task P1.2: ReportsView 利润表/资产负债表公式 row_no 硬编码

**Files:**
- Read: `shared/report-formulas.cjs` (fillTemplateAmount 函数，行 35+)
- Read: `shared/report-templates.cjs` (如果存在)

**问题:** 报表公式按 `row_no` 或数组索引取数，如果模板调整行顺序，公式计算结果会出错。专业软件应通过 `section` + `codes` 方式动态计算。

**当前状态审查:**
- fillTemplateAmount 通过 `section`（'asset'/'liability'/'equity'/'income'/'expense'）和科目 codes 计算，已经是相对稳健的方式
- 需确认模板行是否完全依赖 row_no 还是依赖 section 标记

- [ ] **Step 1: 审查 report-formulas.cjs 和模板定义**

```bash
rg "row_no|rowNo|idx|index" shared/report-formulas.cjs
```

- [ ] **Step 2: 如存在 row_no 硬编码，改为 section 驱动**

- [ ] **Step 3: Commit**

```bash
git add shared/report-formulas.cjs
git commit -m "fix(P1): decouple report formulas from hardcoded row numbers"
```

---

### Task P1.3: DashboardView 筛选重置逻辑修复

**Files:**
- Modify: `src/views/DashboardView.vue` (筛选相关方法)

**问题:** `handleCardClick` 再次点击取消筛选后调用 `doSearch()`，但 `resetFilter()` 中设置 `filter.period = ''`，导致后续查询丢失期次条件。

**修复方案:** 重置时不改变 period，仅清除卡片筛选状态。

- [ ] **Step 1: 查找 handleCardClick 和 resetFilter**

```typescript
function resetFilter() {
  filter.status = undefined;
  filter.keyword = '';
  filter.subjectCode = undefined;
  filter.startDate = '';
  filter.endDate = '';
  filter.amountMin = undefined;
  filter.amountMax = undefined;
  activeCard.value = null;
  // 不重置 period
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "fix(P1): preserve period when resetting dashboard filters"
```

---

### Task P1.4: 操作日志存储与查询完整性审查

**Files:**
- Modify: `src/views/SettingsView.vue` (操作日志部分，行 321-363)
- Read: `electron/services/database/data-manager.cjs` (getOperationLogs)

**审查要点:**
1. 操作日志是否在操作发生时实时写入（不是在页面关闭时批量写）
2. 日志上限 500 条是前端控制还是后端控制
3. 日志查询是否支持分页
4. 日志是否支持搜索/导出

- [ ] **Step 1: 检查后端 operation_log 表写入逻辑**

确认 `_log` 方法在每个操作调用后立即 `INSERT` 到 `sys_operation_log` 表。

- [ ] **Step 2: 添加日志导出功能（SettingsView）**

在 SettingsView 操作日志区域添加"导出日志"按钮：

```typescript
function exportOpLogs() {
  const csv = ['日期,操作类型,目标,详情,用户']
    .concat(opLogs.value.map(l => 
      `${l.createdAt},${l.action},${l.target},"${l.detail}",${l.username}`
    )).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `操作日志_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/SettingsView.vue
git commit -m "feat(P1): add operation log CSV export"
```

---

### Task P1.5: AccountSubject 科目删除引用检查完善

**Files:**
- Modify: `src/views/AccountSubject.vue` (删除逻辑)

**审查要点:**
1. 删除前是否调用 `checkSubjectUsage` API
2. 是否同时检查子科目和凭证引用
3. 提示信息是否清晰（引用数 + 子科目数）

- [ ] **Step 1: 确认删除逻辑完整**

读取 `src/views/AccountSubject.vue`，确认删除处理类似：

```typescript
async function handleDeleteSubject(row: FinanceSubject) {
  try {
    const usage = await api.checkSubjectUsage(row.code);
    let warnMsg = '';
    if (usage.voucherCount > 0) warnMsg += `该科目在 ${usage.voucherCount} 笔凭证中被引用`;
    if (usage.hasChildren) warnMsg += (warnMsg ? '，' : '') + '该科目下存在子科目';
    
    const confirmMsg = warnMsg 
      ? `${warnMsg}\n\n删除后相关凭证将出现孤立科目编码，建议先替换引用后再删除。\n\n确定要删除「${row.code} ${row.name}」吗？`
      : `确定要删除科目「${row.code} ${row.name}」吗？`;
    
    await ElMessageBox.confirm(confirmMsg, '删除科目', {
      confirmButtonText: '确定删除', cancelButtonText: '取消',
      type: warnMsg ? 'error' : 'warning',
    });
    await api.deleteSubject(row.code);
    ElMessage.success('科目已删除');
    loadSubjects();
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.message || '删除失败');
  }
}
```

- [ ] **Step 2: 如有遗漏，补充检查逻辑后 commit**

```bash
git add src/views/AccountSubject.vue
git commit -m "fix(P1): improve subject deletion warning with usage details"
```

---

### Task P1.6: 凭证模板与摘要库前端界面

**Files:**
- Modify: `src/views/VoucherView.vue` (添加模板/摘要入口)
- Create: `src/components/VoucherTemplatePanel.vue` (模板管理面板)

**现状:** 后端 API 已完成（`listVoucherTemplates`, `saveVoucherTemplate`, `deleteVoucherTemplate`, `listVoucherSummaries`, `createVoucherSummary`, `deleteVoucherSummary`），但前端无 UI 入口。

**修复方案:** 在 VoucherView 新增凭证界面添加"从模板加载"按钮和摘要快速选择。

- [ ] **Step 1: 在 VoucherModal 中添加摘要下拉选择**

在 `src/components/VoucherModal.vue` 的分录摘要输入框旁添加常用摘要选择：

```vue
<el-select v-model="quickSummary" placeholder="常用摘要" @change="applySummary" clearable size="small">
  <el-option v-for="s in summaries" :key="s.id" :label="s.text" :value="s.text" />
</el-select>
```

- [ ] **Step 2: 添加模板保存/加载按钮**

在 VoucherView 顶部工具栏添加：

```vue
<el-dropdown @command="handleTemplateCommand">
  <el-button><el-icon><Document /></el-icon>模板</el-button>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item command="save">保存当前凭证为模板</el-dropdown-item>
      <el-dropdown-item v-for="t in templates" :key="t.id" :command="'load-' + t.id">
        {{ t.name }}
      </el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/VoucherModal.vue src/views/VoucherView.vue
git commit -m "feat(P1): add voucher template and summary quick-fill UI"
```

---

### Task P1.7: LedgerView 组件合理拆分（轻量）

**Files:**
- Create: `src/components/ledger/DetailLedgerTab.vue`
- Create: `src/components/ledger/GeneralLedgerTab.vue`
- Create: `src/components/ledger/SubjectBalanceTab.vue`
- Modify: `src/views/LedgerView.vue`

**问题:** LedgerView.vue 目前约 2000 行，包含 9 种账簿逻辑，超出单一组件合理大小。

**修复方案:** 将 3 个最常用的账簿标签页拆分到独立组件（明细账、总账、科目余额表），其余保留在主组件中。只做组件拆分，不改变业务逻辑。

- [ ] **Step 1: 创建 DetailLedgerTab.vue**

从 LedgerView.vue 提取明细账查询逻辑到独立组件，通过 props 接收 `subjects`, `api`。

- [ ] **Step 2: 创建 GeneralLedgerTab.vue**

同样提取总账查询逻辑。

- [ ] **Step 3: 创建 SubjectBalanceTab.vue**

同样提取科目余额表逻辑。

- [ ] **Step 4: 更新 LedgerView.vue 引用新组件**

```vue
<DetailLedgerTab v-if="activeBook==='detail'" :subjects="subjects" :api="api" />
<GeneralLedgerTab v-if="activeBook==='general'" :subjects="subjects" :api="api" />
<SubjectBalanceTab v-if="activeBook==='balance'" :subjects="subjects" :api="api" />
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ledger/ src/views/LedgerView.vue
git commit -m "refactor(P1): extract 3 ledger tabs into separate components"
```

---

## P2：代码质量与冗余清理

### Task P2.1: 消除 src/api/mock.ts 和 electron.ts 中的 `any` 类型

**Files:**
- Modify: `src/api/mock.ts` (行 393-450: getUsersSync/saveUsers/listUsers 等)
- Modify: `src/api/electron.ts` (行 173-203: 返回类型 any)

**当前 any 位置（mock.ts）:**

| 行号 | 原始代码 | 替换为 |
|------|---------|--------|
| 393 | `private getUsersSync(): any[]` | 定义 `MockUser` 接口替代 |
| 398 | `private saveUsers(list: any[])` | `MockUser[]` |
| 403 | `.map((u: any) => ...)` | `MockUser` |
| 408 | `users.find((u: any) => ...)` | `MockUser` |
| 425 | `users.findIndex((u: any) => ...)` | `MockUser` |
| 438 | `users.find((u: any) => ...)` | `MockUser` |
| 450 | `users.find((x: any) => ...)` | `MockUser` |
| 677 | `const entries: any[] = []` | 具体 Entry 类型 |
| 937 | `async renumberSubjects(): Promise<any>` | `Promise<{ mapping: Record<string, string> }>` |
| 173-177 | 5 个方法返回 `Promise<any>` | 具体类型 |

- [ ] **Step 1: 在 mock.ts 文件顶部添加 MockUser 类型定义**

```typescript
interface MockUser {
  id: number;
  username: string;
  _password: string;
  alias: string;
  role: UserRole;
  enabled: number;
  createdAt: string;
}
```

- [ ] **Step 2: 逐一替换所有 `any` 为具体类型**

按上表逐行替换。

- [ ] **Step 3: 修复 electron.ts 返回类型**

```typescript
async renumberSubjects(): Promise<{ mapping: Record<string, string> }> { ... }
async backupDatabase(): Promise<{ success?: boolean; canceled?: boolean; path?: string }> { ... }
async exportDataJson(): Promise<{ success?: boolean; canceled?: boolean; path?: string }> { ... }
```

- [ ] **Step 4: 运行类型检查**

```bash
npx vue-tsc --noEmit
```
Expected: 无新增类型错误

- [ ] **Step 5: Commit**

```bash
git add src/api/mock.ts src/api/electron.ts
git commit -m "refactor(P2): replace any types with explicit interfaces in api layer"
```

---

### Task P2.2: 清理前端组件中的 console 日志

**Files:**
- Modify: `src/api/mock.ts` (8 处 console.warn)
- Modify: `src/composables/useAttachments.ts` (7 处 console.error/warn)
- Modify: `src/views/LedgerView.vue` (6 处 console.warn)
- Modify: `src/views/VoucherView.vue` (2 处 console.error)
- Modify: `src/views/ReportsView.vue` (2 处 console.warn)
- Modify: `src/views/AccountSubject.vue` (2 处)

**规则:**
- `console.warn` → 替换为 `ElMessage.warning`（用户可感知的提示）
- `console.error` 在 catch 中 → 保留（调试需要），但添加上下文前缀
- 无用的 `console.log` → 删除

- [ ] **Step 1: 逐一替换 mock.ts 中的 console.warn**

```typescript
// 之前: console.warn('[MockApi] 解析用户列表失败:', e)
// 之后: 静默处理（mock 环境解析失败属于正常初始化场景）
```

- [ ] **Step 2: 替换 useAttachments.ts 中的 console.error**

```typescript
// 之前: console.error('读取文件失败: ...', err)
// 之后: ElMessage.error('读取文件失败: ' + (err?.message || '未知错误'))
```

- [ ] **Step 3: 替换 Vue 视图中的 console.warn**

```typescript
// 之前: console.warn('[ReportsView] 获取公司信息失败:', e)
// 之后: ElMessage.warning('获取公司信息失败')
```

- [ ] **Step 4: Commit**

```bash
git add src/api/mock.ts src/composables/useAttachments.ts src/views/LedgerView.vue src/views/VoucherView.vue src/views/ReportsView.vue src/views/AccountSubject.vue
git commit -m "refactor(P2): replace console logs with user-facing ElMessage notifications"
```

---

### Task P2.3: 完善空状态、加载状态与错误边界

**Files:**
- Modify: 各 Vue 页面（添加 v-loading、el-empty、错误重试按钮）

**审查并修复的页面:**

| 页面 | 加载状态 | 空状态 | 错误状态 |
|------|:---:|:---:|:---:|
| DashboardView | ✅ | ❌ 无数据时不显示 | ❌ 错误静默 |
| VoucherView | ❌ | ❌ | ❌ |
| LedgerView | ✅ | ❌ | ❌ |
| ReportsView | ✅ | ❌ | ❌ |
| OpeningBalanceView | ✅ | ❌ | ❌ |
| AccountSubject | ✅ | ❌ | ❌ |
| ClosingView | ✅ | ❌ | ❌ |
| SettingsView | ✅ | ❌ | ❌ |
| AssetView | ✅ | ❌ | ❌ |

- [ ] **Step 1: 为 VoucherView 添加 v-loading 和 el-empty**

```vue
<el-table v-loading="loading" :data="filteredVouchers">
  <template #empty>
    <el-empty description="暂无凭证数据">
      <el-button type="primary" @click="openCreate">新增凭证</el-button>
    </el-empty>
  </template>
</el-table>
```

- [ ] **Step 2: 为 LedgerView 添加空状态**

```vue
<template v-if="ledgerData.length === 0 && !loading">
  <el-empty description="当前查询条件下无账簿数据" />
</template>
```

- [ ] **Step 3: 为其他页面批量添加 el-empty**

按照相同模式为 ReportsView、OpeningBalanceView、AccountSubject、ClosingView、SettingsView、AssetView 添加空状态占位。

- [ ] **Step 4: Commit**

```bash
git add src/views/
git commit -m "feat(P2): add empty states and loading indicators to all pages"
```

---

### Task P2.4: 统一错误处理模式

**Files:**
- Modify: `src/api/electron.ts` (ipc 辅助函数)
- Modify: 各页面 catch 块

**问题:** 各页面错误处理方式不一致——有的用 `ElMessage.error`，有的用 `console.error`，有的静默吞错。

**修复方案:** 在 `src/api/electron.ts` 中添加统一的错误处理包装。

- [ ] **Step 1: 在 electron.ts 中添加 wrapping 函数**

```typescript
function safeCall<T>(fn: () => Promise<T>, context: string): Promise<T> {
  return fn().catch((e: Error) => {
    console.error(`[API] ${context}:`, e.message);
    throw e; // 重新抛出，让调用方自行处理
  });
}
```

- [ ] **Step 2: 确保所有页面 catch 块都使用 ElMessage.error 通知用户**

- [ ] **Step 3: Commit**

```bash
git add src/api/electron.ts src/views/
git commit -m "refactor(P2): unify error handling pattern across all pages"
```

---

## 执行检查清单

| Layer | Task | 文件 | 状态 |
|-------|------|------|:---:|
| P0.1 | 密码哈希存储 | `src/api/mock.ts` | ⬜ |
| P0.2 | Dashboard 余额失败提示 | `src/views/DashboardView.vue` | ⬜ |
| P0.3 | 批量删除错误报告 | `src/views/VoucherView.vue` | ⬜ |
| P0.4 | 试算平衡边界加固 | `electron/services/database/periods.cjs` | ⬜ |
| P0.5 | 期初余额不平衡警告 | `src/views/OpeningBalanceView.vue` | ⬜ |
| P0.6 | 折旧边界条件检查 | `electron/services/database/assets.cjs` | ⬜ |
| P1.1 | 重新编号错误提示 | `src/views/VoucherView.vue` | ⬜ |
| P1.2 | 报表公式审查 | `shared/report-formulas.cjs` | ⬜ |
| P1.3 | 筛选重置保留 period | `src/views/DashboardView.vue` | ⬜ |
| P1.4 | 操作日志导出 | `src/views/SettingsView.vue` | ⬜ |
| P1.5 | 科目删除引用警告 | `src/views/AccountSubject.vue` | ⬜ |
| P1.6 | 凭证模板/摘要 UI | `src/views/VoucherView.vue`, `VoucherModal.vue` | ⬜ |
| P1.7 | LedgerView 组件拆分 | `src/components/ledger/`, `LedgerView.vue` | ⬜ |
| P2.1 | 消除 any 类型 | `src/api/mock.ts`, `electon.ts` | ⬜ |
| P2.2 | 清理 console 日志 | 6 个文件 | ⬜ |
| P2.3 | 空状态/加载状态 | 9 个页面 | ⬜ |
| P2.4 | 统一错误处理 | `electron.ts` + 各页面 | ⬜ |

**总计:** 17 个 Task，分 3 层递进
