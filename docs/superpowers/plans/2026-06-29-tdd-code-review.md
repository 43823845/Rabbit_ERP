# ERP外账系统 — TDD + 代码审查实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 ERP 外账系统进行全量诊断，**发现并解决当前项目中真实存在的各类问题**（类型安全、数据一致性、UI/UX 缺陷、错误处理、代码规范等），在此基础上建立测试基础设施，为核心业务模块编写 TDD 测试，消除技术债务。

**Architecture:** 分 5 个 Phase 推进：
- Phase 0：全量代码审查诊断，扫描现有问题清单
- Phase 1：搭建 vitest + ESLint 基础设施
- Phase 2：核心后端服务 TDD 测试
- Phase 3：前端核心逻辑测试
- Phase 4：代码审查修复和清理调优

**Tech Stack:** vitest + @vue/test-utils + jsdom + ESLint + @typescript-eslint + better-sqlite3 (内存模式)

## Global Constraints

- TypeScript strict 模式必须保持 `true`
- 所有新测试必须遵循 Red-Green-Refactor TDD 循环
- 后端 CJS 文件不需要改为 ES Module（保持现有模块系统）
- 测试必须可独立运行，不依赖 Electron 运行时
- 每个 Task 完成后必须 commit（atomic commits）
- 代码审查发现的问题必须在同一 Task 中修复

---

## Phase 0: 全量代码审查诊断

### Task 0.1: 项目问题全面扫描

**目标：** 在实施修复之前，对全项目进行代码审查，发现所有真实存在的问题。

**Files:**
- 审查范围：`src/`, `electron/`, `shared/` 下所有 `.ts`, `.vue`, `.cjs` 文件

**Interfaces:**
- Produces: 问题清单（按严重程度分类）

- [ ] **Step 1: 类型安全检查 — 扫描 `any` 类型滥用**

```bash
npx eslint src/ --ext .ts,.vue --rule '@typescript-eslint/no-explicit-any: error' 2>&1 || echo "Done"
```
记录所有 `any` 类型位置，逐一评估是否需要替换。

- [ ] **Step 2: 错误处理审查 — 扫描未处理的 Promise/异常**

检查所有 async 函数是否有 `.catch()` 或 try-catch；检查 Electron IPC handler 是否有全局错误返回。

- [ ] **Step 3: 数据一致性检查 — 前端类型定义 vs 后端 DB 字段**

对比 `src/vite-env.d.ts` 中的接口字段名与 `electron/services/database/schema.cjs` 中的 DDL 列名，确保 snake_case 一致性。

- [ ] **Step 4: UI/UX 缺陷扫描**

审查各 Vue 组件：空状态处理、加载状态、错误提示、表单验证、分页逻辑。

- [ ] **Step 5: IPC 通道完整性检查**

对比 `electron/main.cjs` 中注册的 `wrap()` 通道与 `electron/preload.cjs` 的 `allowChannels` 白名单，确认无遗漏。

- [ ] **Step 6: console 日志审查**

```bash
rg "console\." src/ electron/ --stats
```
分类：调试日志（删除）、用户提示（改为 UI 组件）、错误日志（保留）。

- [ ] **Step 7: 依赖安全检查**

```bash
npm audit --production
```
评估高危漏洞是否影响项目。

- [ ] **Step 8: 编制问题清单并写入计划**

将发现的所有问题追加到本文档末尾的「诊断问题清单」表格中。

- [ ] **Step 9: Commit 诊断结果**

```bash
git add docs/superpowers/plans/2026-06-29-tdd-code-review.md
git commit -m "docs: add Phase 0 diagnostic scan results to plan"
```

---

## Phase 1: 测试与代码质量基础设施

### Task 1.1: 安装测试框架和依赖

**Files:**
- Modify: `package.json` (devDependencies + scripts)

**Interfaces:**
- Produces: `npm run test`, `npm run lint`, `npm run test:coverage` 脚本

- [ ] **Step 1: 安装 vitest 和相关依赖**

```bash
npm install --save-dev vitest @vue/test-utils jsdom @vitejs/plugin-vue
npm install --save-dev @vitest/coverage-v8
```

- [ ] **Step 2: 确认 package.json 安装成功**

```bash
node -e "const pkg=require('./package.json'); console.log('vitest:', pkg.devDependencies.vitest); console.log('@vue/test-utils:', pkg.devDependencies['@vue/test-utils'])"
```
Expected: 显示版本号

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install vitest, @vue/test-utils, jsdom"
```

---

### Task 1.2: 配置 vitest 和测试脚本

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts 部分)

**Interfaces:**
- Produces: `npm run test` 可运行测试套件

- [ ] **Step 1: 创建 vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/vite-env.d.ts', 'src/main.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 2: 添加 test 脚本到 package.json**

在 `package.json` 的 `scripts` 中追加：
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: 验证 vitest 可运行（空测试套件）**

```bash
npm run test
```
Expected: `No test files found, exiting with code 0`

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: configure vitest with jsdom environment"
```

---

### Task 1.3: 安装并配置 ESLint + Prettier

**Files:**
- Create: `eslint.config.mjs`
- Create: `.prettierrc`
- Modify: `package.json` (devDependencies + scripts)

**Interfaces:**
- Produces: `npm run lint` 和 `npm run format` 脚本

- [ ] **Step 1: 安装 ESLint 和 Prettier 依赖**

```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install --save-dev prettier eslint-config-prettier eslint-plugin-vue
```

- [ ] **Step 2: 创建 eslint.config.mjs**

```javascript
// eslint.config.mjs
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vuePlugin from 'eslint-plugin-vue';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/', 'release/', 'node_modules/', '*.min.js', 'electron/services/database/utils.cjs'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'vue': vuePlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
  ...vuePlugin.configs['flat/recommended'],
  prettierConfig,
];
```

- [ ] **Step 3: 创建 .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2
}
```

- [ ] **Step 4: 添加 lint + format 脚本**

```json
"lint": "eslint src/ --ext .ts,.vue",
"lint:fix": "eslint src/ --ext .ts,.vue --fix",
"format": "prettier --write \"src/**/*.{ts,vue,css}\""
```

- [ ] **Step 5: 运行 lint 验证**

```bash
npm run lint
```
Expected: 可能有 warning（`no-explicit-any` 等），但不应该有 error

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs .prettierrc package.json package-lock.json
git commit -m "chore: add ESLint + Prettier configuration"
```

---

## Phase 2: 核心后端服务 TDD 测试

### Task 2.1: 测试数据库 schema 创建和初始化

**Files:**
- Create: `electron/services/database/__tests__/schema.test.cjs`
- Create: `electron/services/database/__tests__/setup.cjs` (共享测试 fixture)

**Interfaces:**
- Produces: `electron/services/database/__tests__/setup.cjs` 提供 `createTestDb()` 工具函数
- Consumes: `electron/services/database/schema.cjs` 的 `applySchema`

- [ ] **Step 1: 创建测试 setup 工具（内存 SQLite）**

`electron/services/database/__tests__/setup.cjs`:
```javascript
const Database = require('better-sqlite3');
const { applySchema } = require('../schema.cjs');

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

module.exports = { createTestDb };
```

- [ ] **Step 2: 安装 Node 测试依赖**

```bash
npm install --save-dev vitest
```

在 `vitest.config.ts` 的 `test.include` 中添加：
```typescript
include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'electron/**/*.test.cjs'],
```

- [ ] **Step 3: 编写 schema 测试**

`electron/services/database/__tests__/schema.test.cjs`:
```javascript
const { describe, it, expect } = require('vitest');
const { createTestDb } = require('./setup.cjs');

describe('Database Schema', () => {
  it('should create all required tables', () => {
    const db = createTestDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map(t => t.name);

    expect(tables).toContain('sys_company');
    expect(tables).toContain('sys_user');
    expect(tables).toContain('acct_book');
    expect(tables).toContain('acct_period');
    expect(tables).toContain('bd_subject');
    expect(tables).toContain('gl_voucher');
    expect(tables).toContain('gl_voucher_entry');
    expect(tables).toContain('gl_opening_balance');
    expect(tables).toContain('fa_asset_card');
    expect(tables).toContain('voucher_words');
    expect(tables).toContain('sys_operation_log');
    db.close();
  });

  it('fa_asset_card should have updated_at column', () => {
    const db = createTestDb();
    const cols = db.prepare("PRAGMA table_info('fa_asset_card')").all();
    const names = cols.map(c => c.name);
    expect(names).toContain('updated_at');
    expect(names).toContain('accumulated_depreciation');
    expect(names).toContain('monthly_depreciation');
    db.close();
  });

  it('gl_voucher status should have valid CHECK constraint', () => {
    const db = createTestDb();
    // Insert valid status
    db.prepare(
      "INSERT INTO acct_book (company_id, name, current_period) VALUES (1, 'test', '2026-06')"
    ).run();
    db.prepare(
      "INSERT INTO gl_voucher (book_id, period, voucher_word, voucher_no, voucher_date, status, maker) VALUES (1, '2026-06', '记', 1, '2026-06-01', 'draft', 'test')"
    ).run();
    // Verify draft was accepted
    const v = db.prepare("SELECT status FROM gl_voucher WHERE id = 1").get();
    expect(v.status).toBe('draft');
    db.close();
  });
});
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npx vitest run electron/services/database/__tests__/schema.test.cjs
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/services/database/__tests__/
git add vitest.config.ts
git commit -m "test: add schema validation tests with in-memory SQLite"
```

---

### Task 2.2: TDD 测试凭证服务核心逻辑

**Files:**
- Create: `electron/services/database/__tests__/vouchers.test.cjs`
- Modify: `electron/services/database/__tests__/setup.cjs` (如需扩展)

**Interfaces:**
- Consumes: `electron/services/database/vouchers.cjs` 中所有公开方法
- Consumes: `electron/services/database/__tests__/setup.cjs` 的 `createTestDb`

- [ ] **Step 1: 编写失败测试 — 创建凭证**

`electron/services/database/__tests__/vouchers.test.cjs`:
```javascript
const { describe, it, expect, beforeEach } = require('vitest');
const { createTestDb } = require('./setup.cjs');

describe('Voucher Service', () => {
  let db;
  let voucherMethods;

  beforeEach(() => {
    db = createTestDb();
    // 创建必要的基础数据
    db.prepare("INSERT INTO sys_company (name, current_period) VALUES ('test', '2026-06')").run();
    db.prepare("INSERT INTO acct_book (company_id, name, current_period) VALUES (1, 'test', '2026-06')").run();
    // 注入预置科目
    const subjects = require('../utils.cjs').getBuiltinSubjects();
    const stmt = db.prepare(
      'INSERT INTO bd_subject (book_id, code, name, direction, category, level, enabled, builtin) VALUES (?, ?, ?, ?, ?, ?, 1, 1)'
    );
    subjects.forEach(s => stmt.run(1, s.code, s.name, s.direction, s.category, s.level || 1));

    // 模拟 FinanceDatabase 对象（最小化 mock）
    voucherMethods = {
      db,
      currentBookId: 1,
      _ensureBookId() { /* already set */ },
      _log() { /* no-op in test */ },
    };
    // 挂载方法
    require('../vouchers.cjs').applyVoucherMethods({ prototype: voucherMethods });
  });

  it('should create a draft voucher with valid entries', () => {
    const payload = {
      period: '2026-06',
      voucherWord: '记',
      voucherNo: 1,
      voucherDate: '2026-06-15',
      remark: '测试凭证',
      maker: 'tester',
      entries: [
        { summary: '购买办公用品', subjectCode: '1001', subjectName: '库存现金', debit: 0, credit: 1000 },
        { summary: '购买办公用品', subjectCode: '660202', subjectName: '办公费', debit: 1000, credit: 0 },
      ],
    };
    const result = voucherMethods.createVoucher(payload);
    expect(result.id).toBeGreaterThan(0);
    expect(result.status).toBe('draft');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].debit).toBe(0);
    expect(result.entries[0].credit).toBe(1000);
  });

  it('should reject voucher with unbalanced entries', () => {
    const payload = {
      period: '2026-06',
      voucherWord: '记',
      voucherNo: 2,
      voucherDate: '2026-06-15',
      remark: '不平衡凭证',
      maker: 'tester',
      entries: [
        { summary: '测试', subjectCode: '1001', subjectName: '库存现金', debit: 500, credit: 0 },
        { summary: '测试', subjectCode: '660202', subjectName: '办公费', debit: 0, credit: 0 },
      ],
    };
    const result = voucherMethods.createVoucher(payload);
    // 凭证服务应返回带 __error 的对象
    expect(result.__error).toBeDefined();
    expect(result.__error).toContain('不平衡');
  });

  it('should list vouchers filtered by period', () => {
    // Arrange: 创建两条凭证
    voucherMethods.createVoucher({
      period: '2026-06', voucherWord: '记', voucherNo: 1,
      voucherDate: '2026-06-10', remark: '凭证A', maker: 'tester',
      entries: [
        { summary: '', subjectCode: '1001', subjectName: '库存现金', debit: 100, credit: 0 },
        { summary: '', subjectCode: '660202', subjectName: '办公费', debit: 0, credit: 100 },
      ],
    });
    voucherMethods.createVoucher({
      period: '2026-07', voucherWord: '记', voucherNo: 1,
      voucherDate: '2026-07-01', remark: '凭证B', maker: 'tester',
      entries: [
        { summary: '', subjectCode: '1001', subjectName: '库存现金', debit: 200, credit: 0 },
        { summary: '', subjectCode: '660202', subjectName: '办公费', debit: 0, credit: 200 },
      ],
    });

    const junVouchers = voucherMethods.listVouchers({ period: '2026-06' });
    expect(junVouchers).toHaveLength(1);
    expect(junVouchers[0].remark).toBe('凭证A');

    const allVouchers = voucherMethods.listVouchers({});
    expect(allVouchers).toHaveLength(2);
  });

  it('should audit voucher from draft to audited', () => {
    const v = voucherMethods.createVoucher({
      period: '2026-06', voucherWord: '记', voucherNo: 3,
      voucherDate: '2026-06-15', remark: '待审核', maker: 'tester',
      entries: [
        { summary: '', subjectCode: '1001', subjectName: '库存现金', debit: 10, credit: 0 },
        { summary: '', subjectCode: '660202', subjectName: '办公费', debit: 0, credit: 10 },
      ],
    });
    const result = voucherMethods.auditVoucher(v.id);
    expect(result.status).toBe('audited');
    expect(result.__error).toBeUndefined();
  });

  it('should post voucher from audited to posted', () => {
    const v = voucherMethods.createVoucher({
      period: '2026-06', voucherWord: '记', voucherNo: 4,
      voucherDate: '2026-06-15', remark: '待过账', maker: 'tester',
      entries: [
        { summary: '', subjectCode: '1001', subjectName: '库存现金', debit: 10, credit: 0 },
        { summary: '', subjectCode: '660202', subjectName: '办公费', debit: 0, credit: 10 },
      ],
    });
    voucherMethods.auditVoucher(v.id);
    const result = voucherMethods.postVoucher(v.id);
    expect(result.status).toBe('posted');
  });
});
```

- [ ] **Step 2: 运行测试 — 观察失败**

```bash
npx vitest run electron/services/database/__tests__/vouchers.test.cjs
```
Expected: 部分测试 PASS（凭证服务已有实现），检查是否有未覆盖场景导致的 FAIL

- [ ] **Step 3: 如果 `createVoucher` 没有不平衡检查 — 添加实现**

在 `electron/services/database/vouchers.cjs` 的 `createVoucher` 方法中添加：
```javascript
// 借贷平衡校验
const totalDebit = p.entries.reduce((s, e) => s + Number(e.debit || 0), 0);
const totalCredit = p.entries.reduce((s, e) => s + Number(e.credit || 0), 0);
if (Math.abs(totalDebit - totalCredit) > 0.001) {
  return { id: 0, period: '', voucher_word: '', voucher_no: 0, voucher_date: '', remark: '', status: 'draft', maker: '', entries: [], __error: '借贷不平衡' };
}
```

- [ ] **Step 4: 运行测试全部通过**

```bash
npx vitest run electron/services/database/__tests__/vouchers.test.cjs
```
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/services/database/__tests__/vouchers.test.cjs
git add electron/services/database/vouchers.cjs
git commit -m "test(vouchers): add TDD tests for voucher CRUD and lifecycle"
```

---

### Task 2.3: TDD 测试期间结账的强制试算平衡

**Files:**
- Create: `electron/services/database/__tests__/periods.test.cjs`

**Interfaces:**
- Consumes: `electron/services/database/periods.cjs` — `closePeriod`

- [ ] **Step 1: 编写测试 — 试算不平衡时拒绝结账**

`electron/services/database/__tests__/periods.test.cjs`:
```javascript
const { describe, it, expect, beforeEach } = require('vitest');
const { createTestDb } = require('./setup.cjs');

describe('Period Closing', () => {
  let db, periodMethods;

  beforeEach(() => {
    db = createTestDb();
    db.prepare("INSERT INTO sys_company (name, current_period) VALUES ('test', '2026-01')").run();
    db.prepare("INSERT INTO acct_book (company_id, name, current_period) VALUES (1, 'test', '2026-01')").run();
    db.prepare("INSERT INTO acct_period (book_id, period, status) VALUES (1, '2026-01', 'open')").run();
    // 预置科目
    const subjects = require('../utils.cjs').getBuiltinSubjects();
    const stmt = db.prepare(
      'INSERT INTO bd_subject (book_id, code, name, direction, category, level, enabled, builtin) VALUES (?, ?, ?, ?, ?, ?, 1, 1)'
    );
    subjects.forEach(s => stmt.run(1, s.code, s.name, s.direction, s.category, s.level || 1));

    periodMethods = {
      db,
      currentBookId: 1,
      _ensureBookId() { },
      _log() { },
      getTrialBalance(period) {
        // 模拟不平衡的试算表: 借方 100 ≠ 贷方 200
        return {
          rows: [],
          totals: { openingDebit: 0, openingCredit: 0, amountDebit: 100, amountCredit: 200, endingDebit: 100, endingCredit: 200 },
        };
      },
      _carryForwardProfit(period) { /* no-op */ },
    };
    require('../periods.cjs').applyPeriodMethods({ prototype: periodMethods });
  });

  it('should reject closing when trial balance is unbalanced', () => {
    expect(() => periodMethods.closePeriod('2026-01')).toThrow(/试算不平衡/);
  });

  it('should accept closing when trial balance is balanced', () => {
    // 模拟平衡的试算表
    periodMethods.getTrialBalance = () => ({
      rows: [],
      totals: { openingDebit: 0, openingCredit: 0, amountDebit: 100, amountCredit: 100, endingDebit: 100, endingCredit: 100 },
    });
    expect(() => periodMethods.closePeriod('2026-01')).not.toThrow();
    const period = db.prepare("SELECT status FROM acct_period WHERE book_id = 1 AND period = '2026-01'").get();
    expect(period.status).toBe('closed');
  });

  it('should reject closing when unposted vouchers exist', () => {
    // 插入一张未过账的凭证
    db.prepare(
      "INSERT INTO gl_voucher (book_id, period, voucher_word, voucher_no, voucher_date, status, maker) VALUES (1, '2026-01', '记', 1, '2026-01-15', 'draft', 'tester')"
    ).run();
    expect(() => periodMethods.closePeriod('2026-01')).toThrow(/未过账/);
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run electron/services/database/__tests__/periods.test.cjs
```
Expected: 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add electron/services/database/__tests__/periods.test.cjs
git commit -m "test(periods): add TDD tests for trial balance enforcement during closing"
```

---

### Task 2.4: TDD 测试固定资产折旧计算

**Files:**
- Create: `electron/services/database/__tests__/assets.test.cjs`

**Interfaces:**
- Consumes: `electron/services/database/assets.cjs` — `createAssetCard`, `depreciateAsset`, `getAssetStats`

- [ ] **Step 1: 编写测试**

`electron/services/database/__tests__/assets.test.cjs`:
```javascript
const { describe, it, expect, beforeEach } = require('vitest');
const { createTestDb } = require('./setup.cjs');

describe('Asset Service', () => {
  let db, assetMethods;

  beforeEach(() => {
    db = createTestDb();
    db.prepare("INSERT INTO sys_company (name, current_period) VALUES ('test', '2026-06')").run();
    db.prepare("INSERT INTO acct_book (company_id, name, current_period) VALUES (1, 'test', '2026-06')").run();

    assetMethods = {
      db,
      currentBookId: 1,
      _ensureBookId() { },
      _log() { },
    };
    require('../assets.cjs').applyAssetMethods({ prototype: assetMethods });
  });

  it('should calculate monthly depreciation correctly (straight-line)', () => {
    // 原值 12000, 残值率 5%, 使用年限 5 年
    // 月折旧 = 12000 * (1 - 0.05) / (5 * 12) = 190.00
    const dep = assetMethods._calcMonthlyDepreciation(12000, 0.05, 5);
    expect(dep).toBe(190);
  });

  it('should create asset card with correct net value', () => {
    const result = assetMethods.createAssetCard({
      assetCode: 'FA001',
      assetName: 'ThinkPad X1',
      category: '电子设备',
      buyDate: '2026-06-01',
      originalValue: 10000,
      residualRate: 0.05,
      usefulLifeYears: 3,
    });
    expect(result.id).toBeGreaterThan(0);

    const card = db.prepare('SELECT * FROM fa_asset_card WHERE id = ?').get(result.id);
    expect(card.asset_name).toBe('ThinkPad X1');
    expect(card.original_value).toBe(10000);
    expect(card.accumulated_depreciation).toBe(0);
    expect(card.net_value).toBe(10000);
    expect(card.monthly_depreciation).toBeGreaterThan(0);
  });

  it('should increase accumulated depreciation after depreciateAsset', () => {
    const { id } = assetMethods.createAssetCard({
      assetName: 'Printer',
      originalValue: 3600,
      residualRate: 0,
      usefulLifeYears: 3,
    });
    const card = db.prepare('SELECT * FROM fa_asset_card WHERE id = ?').get(id);
    const monthlyDep = card.monthly_depreciation; // 3600/(3*12) = 100

    const result = assetMethods.depreciateAsset(id, 2); // 计提 2 期
    expect(result.addedDepreciation).toBe(monthlyDep * 2);
    expect(result.accumulatedDepreciation).toBe(monthlyDep * 2);

    const updated = db.prepare('SELECT * FROM fa_asset_card WHERE id = ?').get(id);
    expect(updated.accumulated_depreciation).toBe(monthlyDep * 2);
    expect(updated.net_value).toBe(3600 - monthlyDep * 2);
  });

  it('should mark asset as fully depreciated when net value reaches residual', () => {
    const { id } = assetMethods.createAssetCard({
      assetName: 'Cheap Item',
      originalValue: 100,
      residualRate: 0.10, // residual = 10
      usefulLifeYears: 1,
    });
    // 月折旧 = 100 * 0.9 / 12 = 7.50
    // 计提 12 期 = 90, net = 100 - 90 = 10 (residual)
    const result = assetMethods.depreciateAsset(id, 12);
    const updated = db.prepare('SELECT * FROM fa_asset_card WHERE id = ?').get(id);
    expect(updated.status).toBe('已提足折旧');
    expect(updated.net_value).toBeCloseTo(10, 1);
  });

  it('should reject depreciation on disposed asset', () => {
    const { id } = assetMethods.createAssetCard({
      assetName: 'Broken Fan',
      originalValue: 200,
      usefulLifeYears: 2,
      status: '报废',
    });
    expect(() => assetMethods.depreciateAsset(id, 1)).toThrow(/报废/);
  });

  it('should return correct aggregate stats', () => {
    assetMethods.createAssetCard({ assetName: 'A', originalValue: 1000, usefulLifeYears: 5 });
    assetMethods.createAssetCard({ assetName: 'B', originalValue: 2000, usefulLifeYears: 5 });
    const stats = assetMethods.getAssetStats();
    expect(stats.cnt).toBe(2);
    expect(stats.totalOriginal).toBe(3000);
    expect(stats.totalDep).toBe(0);
    expect(stats.totalNet).toBe(3000);
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run electron/services/database/__tests__/assets.test.cjs
```
Expected: 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add electron/services/database/__tests__/assets.test.cjs
git commit -m "test(assets): add TDD tests for asset depreciation and lifecycle"
```

---

## Phase 3: 前端核心逻辑测试

### Task 3.1: 测试 API 层 (electron.ts) 单元逻辑

**Files:**
- Create: `src/api/__tests__/electron.test.ts`

**Interfaces:**
- Consumes: `src/api/electron.ts` — `ElectronFinanceApi` 类

- [ ] **Step 1: 编写测试 — 验证 IPC 调用参数格式**

`src/api/__tests__/electron.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock window.electronAPI
const mockInvoke = vi.fn();
vi.stubGlobal('window', {
  electronAPI: {
    invoke: mockInvoke,
    windowMin: vi.fn(),
    windowMax: vi.fn(),
    windowClose: vi.fn(),
  },
});

import { ElectronFinanceApi } from '../electron';

describe('ElectronFinanceApi', () => {
  let api: ElectronFinanceApi;

  beforeEach(() => {
    mockInvoke.mockReset();
    api = new ElectronFinanceApi();
  });

  it('login should call finance:login with credentials', async () => {
    mockInvoke.mockResolvedValueOnce({ userId: 1, username: 'admin', role: 'admin', companyId: 'c1', companyName: 'Test' });
    const result = await api.login('admin', '123456');
    expect(mockInvoke).toHaveBeenCalledWith('finance:login', { username: 'admin', password: '123456' });
    expect(result?.username).toBe('admin');
  });

  it('login should return null on failed auth', async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const result = await api.login('admin', 'wrong');
    expect(result).toBeNull();
  });

  it('listVouchers should call finance:listVouchers with filter', async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await api.listVouchers({ period: '2026-06', status: 'draft' });
    expect(mockInvoke).toHaveBeenCalledWith('finance:listVouchers', { period: '2026-06', status: 'draft' });
  });

  it('createVoucher should call finance:createVoucher with payload', async () => {
    mockInvoke.mockResolvedValueOnce({ id: 1, status: 'draft' });
    const payload = {
      voucherWord: '记', voucherNo: 1, voucherDate: '2026-06-01',
      remark: 'test', maker: 'tester', entries: [],
    };
    await api.createVoucher(payload);
    expect(mockInvoke).toHaveBeenCalledWith('finance:createVoucher', payload);
  });

  it('closePeriod should call finance:closePeriod', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await api.closePeriod('2026-06');
    expect(mockInvoke).toHaveBeenCalledWith('finance:closePeriod', '2026-06');
  });

  it('listAssetCards should call finance:listAssetCards', async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await api.listAssetCards({ status: '在用' });
    expect(mockInvoke).toHaveBeenCalledWith('finance:listAssetCards', { status: '在用' });
  });

  it('depreciateAsset should default periods to 1', async () => {
    mockInvoke.mockResolvedValueOnce({ addedDepreciation: 50, accumulatedDepreciation: 100, netValue: 900, status: '在用' });
    await api.depreciateAsset(42);
    expect(mockInvoke).toHaveBeenCalledWith('finance:depreciateAsset', { id: 42, periods: 1 });
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run src/api/__tests__/electron.test.ts
```
Expected: 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/api/__tests__/electron.test.ts
git commit -m "test(api): add unit tests for ElectronFinanceApi IPC calls"
```

---

### Task 3.2: 测试认证模块 (auth.ts)

**Files:**
- Create: `src/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `src/auth.ts` — `useAuth`

- [ ] **Step 1: 编写测试**

`src/__tests__/auth.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuth } from '../auth';
import type { AuthUser } from '../vite-env';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const testUser: AuthUser = {
    userId: 1,
    username: 'admin',
    alias: '管理员',
    role: 'admin',
    companyId: 'company_1',
    companyName: 'Test Corp',
  };

  it('should start logged out', () => {
    const auth = useAuth();
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.state.user).toBeNull();
  });

  it('should login and persist to localStorage', () => {
    const auth = useAuth();
    auth.login(testUser);

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.state.user?.username).toBe('admin');
    expect(auth.state.user?.companyId).toBe('company_1');

    // Verify persistence
    const raw = localStorage.getItem('finance_auth_state');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.loggedIn).toBe(true);
    expect(parsed.user.companyId).toBe('company_1');
  });

  it('should logout and clear localStorage', () => {
    const auth = useAuth();
    auth.login(testUser);
    auth.logout();

    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.state.user).toBeNull();
    expect(localStorage.getItem('finance_auth_state')).toBeNull();
    expect(localStorage.getItem('finance_last_company')).toBeNull();
  });

  it('should call persist explicitly', () => {
    const auth = useAuth();
    auth.login(testUser);

    // Change user data and persist
    auth.state.user!.companyId = 'company_2';
    auth.persist();

    const parsed = JSON.parse(localStorage.getItem('finance_auth_state')!);
    expect(parsed.user.companyId).toBe('company_2');
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run src/__tests__/auth.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/auth.test.ts
git commit -m "test(auth): add unit tests for useAuth login/logout/persist"
```

---

## Phase 4: 代码审查修复与清理调优

> 本阶段基于 Phase 0 诊断发现的问题清单，逐一修复并调优。

### Task 4.1: 消除 src/api/mock.ts 中的 `any` 类型

**Files:**
- Modify: `src/api/mock.ts`

**Interfaces:**
- Consumes: `src/vite-env.d.ts` — 已定义的类型

- [ ] **Step 1: 先运行 lint 查看问题数量**

```bash
npx eslint src/api/mock.ts --format compact
```
Expected: 显示 ~10 处 `no-explicit-any` warning

- [ ] **Step 2: 逐一替换 `any` 为具体类型**

在 `src/api/mock.ts` 中替换以下 `any` 类型（按行号）:

| 位置 | 原代码 | 替换为 |
|------|--------|--------|
| `getUsersSync(): any[]` | `any[]` | `{ id: number; username: string; alias: string; role: UserRole; enabled: number; createdAt: string; _password: string }[]` |
| `saveUsers(list: any[])` | `any[]` | 同上类型 |
| `listUsers` `.map((u: any)` | `any` | 同上类型 |
| `voucherWords` 内部 `: any` | `any` | `VoucherWordType` |
| `voucherTemplates` `: any` | `any` | `VoucherTemplate` |
| `entries: any[]` (carryForward) | `any[]` | `Array<{ summary: string; subjectCode: string; subjectName: string; debit: number; credit: number; quantity: number; unitPrice: number; unit: string; auxTypeId: number | null; auxValueId: number | null; line_no: number; lineNo: number }>` |
| `reorderSubjects` `return { mapping: {} }` `: any` | `any` | `Promise<{ mapping: Record<string, string> }>` |
| `listUsers` `getUsersSync().map((u: any)` | 第2处 `any` | 同上类型 |
| `createUser` `getUsersSync()` `if (users.find((u: any)` | `any` | 同上类型 |
| `updateUser` `users.findIndex((u: any)` | `any` | 同上类型 |
| `changePassword` `users.find((u: any)` | `any` | 同上类型 |
| `getUserProfile` `users.find((x: any)` | `any` | 同上类型 |

- [ ] **Step 3: 运行测试确保无破坏**

```bash
npx vitest run src/api/__tests__/electron.test.ts
npm run lint
```
Expected: 所有测试 PASS，lint warning 数量减少

- [ ] **Step 4: 运行类型检查**

```bash
npx vue-tsc --noEmit
```
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/api/mock.ts
git commit -m "refactor(mock): replace 'any' types with explicit interfaces"
```

---

### Task 4.2: 减少前端组件中的 console 日志

**Files:**
- Modify: `src/views/LedgerView.vue`
- Modify: `src/views/VoucherView.vue`
- Modify: `src/views/DashboardView.vue`
- Modify: `src/components/VoucherModal.vue`

**Interfaces:**
- 无新增接口

- [ ] **Step 1: 扫描所有 console 调用**

```bash
npx eslint src/ --ext .ts,.vue --rule 'no-console: error' --format compact 2>&1
```
Expected: 列出所有 console 调用

- [ ] **Step 2: 将调试用 console.warn/console.error 替换为条件日志**

在关键路径（凭证创建失败、API 调用失败）保留 `console.error`，删除或注释掉普通 `console.log` 和 `console.warn`。

需要处理的文件（约 27 处）：
- `LedgerView.vue`: 替换 catch 中的 `console.warn` 为 `ElMessage.warning`
- `VoucherView.vue`: 同上
- `VoucherModal.vue`: 同上
- `DashboardView.vue`: 同上
- `LoginView.vue`: 同上
- `ClosingView.vue`: 同上

- [ ] **Step 3: 运行 lint 确认**

```bash
npx eslint src/ --ext .ts,.vue --rule 'no-console: error' --format compact
```
Expected: 0 error

- [ ] **Step 4: Commit**

```bash
git add src/views/LedgerView.vue src/views/VoucherView.vue src/views/DashboardView.vue src/views/ClosingView.vue src/views/LoginView.vue src/components/VoucherModal.vue
git commit -m "refactor: replace console.log/warn with user-facing error messages in views"
```

---

### Task 4.3: 最终全面回归测试

**Files:**
- 无新文件

**Interfaces:**
- Consumes: 所有测试文件

- [ ] **Step 1: 运行全部测试**

```bash
npm run test
```
Expected: 所有 ~25 个测试 PASS

- [ ] **Step 2: 运行覆盖率报告**

```bash
npm run test:coverage
```
Expected: 覆盖率报告显示已测试模块覆盖率 > 80%

- [ ] **Step 3: 运行 lint 最终检查**

```bash
npm run lint
```
Expected: 0 error, warning 数量 ≤ 遗留 any 类型数量

- [ ] **Step 4: 运行 TypeScript 类型检查**

```bash
npm run build
```
Expected: `vue-tsc --noEmit` 无错误

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "chore: final regression test pass — all tests green, lint clean, types valid"
```

---

## 执行检查清单

| Phase | Task | 文件/产出 | 状态 |
|-------|------|---------|------|
| 0.1 | 全量代码审查诊断 | 问题清单 | ⬜ |
| 1.1 | 安装 vitest 依赖 | `package.json` | ⬜ |
| 1.2 | 配置 vitest + test 脚本 | `vitest.config.ts` | ⬜ |
| 1.3 | ESLint + Prettier 配置 | `eslint.config.mjs`, `.prettierrc` | ⬜ |
| 2.1 | Schema DDL 测试 | `schema.test.cjs` | ⬜ |
| 2.2 | Voucher CRUD 测试 | `vouchers.test.cjs` | ⬜ |
| 2.3 | Period 试算平衡测试 | `periods.test.cjs` | ⬜ |
| 2.4 | Asset 折旧测试 | `assets.test.cjs` | ⬜ |
| 3.1 | Electron API 单元测试 | `electron.test.ts` | ⬜ |
| 3.2 | Auth 认证测试 | `auth.test.ts` | ⬜ |
| 4.1 | 消除 mock.ts `any` 类型 | — | ⬜ |
| 4.2 | 清理 console 日志 | — | ⬜ |
| 4.3 | 最终回归测试 | — | ⬜ |

---

## 诊断问题清单

> Phase 0 发现的真实问题将记录在此，Phase 4 逐项修复。

| # | 严重程度 | 文件 | 问题描述 | 状态 |
|---|---------|------|---------|------|
| — | — | — | 待扫描 | ⬜ |
