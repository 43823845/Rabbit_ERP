/**
 * useVoucherForm.ts — 凭证表单主逻辑组合式函数
 *
 * 职责：凭证头部表单、分录行管理、凭证导航、保存/删除/审核、初始化数据加载
 *       依赖 useAttachments 处理附件，依赖 useAmountEditing 处理金额编辑
 * 使用场景：VoucherModal.vue 的核心业务逻辑层
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuth } from '../auth';
import type { FinanceApi, FinanceSubject, FinanceVoucher } from '../api';
import { toChineseUpper } from '../utils/chineseCurrency';
import { fmtDate } from '../utils/format';
import { SUMMARY_OPTIONS, BUSINESS_TEMPLATES } from '../data/constants';
import { MAX_AMOUNT } from '../utils/amountDigit';
import type { VoucherRow } from './useAmountEditing';

/** Props 接口定义 */
export interface UseVoucherFormProps {
  open: boolean;
  voucher?: FinanceVoucher | null;
  readonly?: boolean;
  voucherList?: FinanceVoucher[];
}

/** Emits 接口定义 */
export interface UseVoucherFormEmits {
  (e: 'update:open', value: boolean): void;
  (e: 'saved', voucher: FinanceVoucher): void;
  (e: 'deleted', id: number): void;
  (e: 'navigate', voucher: FinanceVoucher): void;
  (e: 'switchToCreate'): void;
}

/**
 * 凭证表单主逻辑组合式函数
 * @param props - 组件 props
 * @param emit  - 组件 emit
 * @param api   - 财务 API 实例
 * @param auth  - 认证实例
 */
export function useVoucherForm(
  props: UseVoucherFormProps,
  emit: UseVoucherFormEmits,
  api: FinanceApi,
  auth: ReturnType<typeof useAuth>,
) {
  /* ---- 基础状态 ---- */
  const subjects = ref<FinanceSubject[]>([]);
  const saving = ref(false);
  const currentPeriod = ref('');
  const isEdit = computed(() => !!props.voucher);
  const isReadonly = computed(() => props.readonly || false);

  /* ---- 凭证头部表单 ---- */
  const voucherWords = ref<Array<{ word: string; is_default: number }>>([]);
  const defaultVoucherWord = computed(() =>
    voucherWords.value.find(w => w.is_default === 1)?.word || voucherWords.value[0]?.word || '记'
  );

  const form = ref({
    voucherWord: '记' as string,
    voucherNo: 1,
    voucherDate: '' as string,
    remark: '' as string,
    bookkeeper: '' as string,
    maker: '' as string,
  });

  /* ---- 分录行 ---- */
  const rows = ref<VoucherRow[]>([]);
  const debitTotal = computed(() =>
    rows.value.reduce((s, r) => s + Number(r.debit || 0), 0),
  );
  const creditTotal = computed(() =>
    rows.value.reduce((s, r) => s + Number(r.credit || 0), 0),
  );
  const balanced = computed(
    () => debitTotal.value > 0 && Math.abs(debitTotal.value - creditTotal.value) < 0.001,
  );
  const canEdit = computed(
    () => !isReadonly.value && (!props.voucher || props.voucher.status === 'draft'),
  );

  /** 当前鼠标悬停的行 key，用于显示行操作按钮 */
  const hoveredRowKey = ref<number | null>(null);

  /* ---- 凭证导航（上一条/下一条） ---- */
  const currentIndex = computed(() => {
    if (!props.voucher || !props.voucherList) return -1;
    return props.voucherList.findIndex(v => v.id === props.voucher!.id);
  });
  const hasPrev = computed(() => currentIndex.value > 0);
  const hasNext = computed(
    () =>
      props.voucherList &&
      currentIndex.value >= 0 &&
      currentIndex.value < props.voucherList.length - 1,
  );

  function handlePrev() {
    if (!hasPrev.value || !props.voucherList) return;
    emit('navigate', props.voucherList[currentIndex.value - 1]);
  }
  function handleNext() {
    if (!hasNext.value || !props.voucherList) return;
    emit('navigate', props.voucherList[currentIndex.value + 1]);
  }

  /* ---- 分录行操作 ---- */
  let _rowKeySeq = 0;

  /** 创建一个空分录行 */
  function createRow(): VoucherRow {
    return {
      key: ++_rowKeySeq,
      summary: '',
      subjectCode: '',
      subjectName: '',
      debit: 0,
      credit: 0,
    };
  }

  /** 摘要 "=" 快捷填充：复制上一行摘要 */
  function onSummaryKeyup(rowKey: number) {
    const idx = rows.value.findIndex(r => r.key === rowKey);
    if (idx <= 0) return;
    if (rows.value[idx].summary === '=') {
      rows.value[idx].summary = rows.value[idx - 1].summary;
    }
  }

  /** 最少显示行数 */
  const MIN_ROWS = 4;

  /** 创建空白表单行 */
  function blankForm() {
    const arr: VoucherRow[] = [];
    for (let i = 0; i < MIN_ROWS; i++) arr.push(createRow());
    return arr;
  }

  /** 在指定行下方插入新行 */
  function insertRowAfter(key: number) {
    const idx = rows.value.findIndex(r => r.key === key);
    if (idx < 0) return;
    rows.value.splice(idx + 1, 0, createRow());
  }

  /** 删除指定行（至少保留 1 行） */
  function deleteRow(key: number) {
    const idx = rows.value.findIndex(r => r.key === key);
    if (idx >= 0 && rows.value.length > 1) rows.value.splice(idx, 1);
  }

  /* ---- 科目查找 ---- */
  function findSubject(name: string) {
    // 精确匹配
    const exact = subjects.value.find(s => s.name === name);
    if (exact) return exact;
    // 处理 "父名称-子名称" 格式（如 "管理费用-办公费"）
    const dashIdx = name.indexOf('-');
    if (dashIdx > 0) {
      const parentName = name.substring(0, dashIdx);
      const childName = name.substring(dashIdx + 1);
      const parent = subjects.value.find(s => s.name === parentName && s.level === 1);
      if (parent) {
        return subjects.value.find(
          s =>
            s.name === childName &&
            s.parent_code === parent.code &&
            s.category === parent.category,
        );
      }
    }
    return undefined;
  }

  /* ---- 业务模板填充 ---- */
  function fillTpl(
    remark: string,
    tplRows: Array<{
      summary: string;
      subjectName: string;
      debit: number;
      credit: number;
    }>,
  ) {
    form.value.remark = remark;
    rows.value = tplRows.map(r => {
      const s = findSubject(r.subjectName);
      return {
        key: createRow().key,
        summary: r.summary,
        subjectCode: s?.code || '',
        subjectName: s?.name || r.subjectName,
        debit: r.debit,
        credit: r.credit,
      };
    });
    while (rows.value.length < MIN_ROWS) rows.value.push(createRow());
  }

  /** 业务凭证模板（桥接共用常量到组件内 fillTpl） */
  const businessTemplates = BUSINESS_TEMPLATES.map(tpl => ({
    label: tpl.label,
    apply: () => fillTpl(tpl.remark, tpl.rows),
  }));

  /* ---- 初始化与数据加载 ---- */
  async function initModal() {
    const data = await api.bootstrap();
    subjects.value = data.subjects;
    currentPeriod.value = data.book.current_period;
    // 加载全局凭证字列表
    try { voucherWords.value = await api.listVoucherWords(); } catch { /* ignore */ }

    if (props.voucher) {
      // 编辑/查看已有凭证
      form.value = {
        voucherWord: props.voucher.voucher_word,
        voucherNo: props.voucher.voucher_no,
        voucherDate: props.voucher.voucher_date,
        remark: props.voucher.remark || '',
        bookkeeper: props.voucher.bookkeeper || '',
        maker: props.voucher.maker || '',
      };
      rows.value = props.voucher.entries.map(e => ({
        key: createRow().key,
        summary: e.summary,
        subjectCode: e.subjectCode,
        subjectName: e.subjectName,
        debit: Number(e.debit || 0),
        credit: Number(e.credit || 0),
      }));
      if (!isReadonly.value) {
        while (rows.value.length < MIN_ROWS) rows.value.push(createRow());
      }
    } else {
      // 新增凭证：使用默认凭证字
      const word = defaultVoucherWord.value;
      const no = await api.getNextVoucherNo({
        voucherWord: word,
        period: data.book.current_period,
      });
      const userAlias =
        auth.state.user?.alias || auth.state.user?.username || 'admin';
      form.value = {
        voucherWord: word,
        voucherNo: no,
        voucherDate: fmtDate(new Date()),
        remark: '',
        bookkeeper: userAlias,
        maker: userAlias,
      };
      rows.value = blankForm();
    }
  }

  // 监听弹窗打开/关闭
  watch(
    () => props.open,
    (val) => {
      if (val) {
        initModal();
      }
    },
  );
  // 导航切换凭证时重新加载
  watch(
    () => props.voucher?.id,
    () => {
      if (props.open) initModal();
    },
  );

  /* ---- 保存/删除/审核 ---- */

  /** 提取有效分录（非空且金额不为 0） */
  function normalizeEntries() {
    return rows.value
      .filter(
        r =>
          r.summary &&
          r.subjectCode &&
          (Number(r.debit) > 0 || Number(r.credit) > 0),
      )
      .map(r => ({
        summary: r.summary,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
      }));
  }

  /**
   * 保存凭证
   * @param continueCreate 是否保存后继续新增
   */
  async function handleSave(
    continueCreate: boolean,
    uploadPending: (voucherId: number) => Promise<void>,
    resetAttachments: () => void,
  ) {
    const entries = normalizeEntries();
    if (entries.length < 2) {
      ElMessage.error('凭证至少需要两条有效分录');
      return;
    }
    if (!balanced.value) {
      ElMessage.error('借贷金额必须相等');
      return;
    }
    if (!form.value.voucherDate) {
      ElMessage.error('请选择凭证日期');
      return;
    }

    // 科目编码有效性校验：防止引用了已删除的科目
    const validCodes = new Set(subjects.value.map(s => s.code));
    const invalidEntry = entries.find(e => !validCodes.has(e.subjectCode));
    if (invalidEntry) {
      ElMessage.error(`分录中的科目「${invalidEntry.subjectName}」(${invalidEntry.subjectCode})不存在，请重新选择`);
      return;
    }

    // 金额上限校验：单笔分录金额不能超过11位分栏上限
    const overflowEntry = entries.find(
      e => Number(e.debit) > MAX_AMOUNT || Number(e.credit) > MAX_AMOUNT,
    );
    if (overflowEntry) {
      ElMessage.error(
        `分录金额超过上限 ¥${MAX_AMOUNT.toLocaleString()}（科目：${overflowEntry.subjectName}），请拆分凭证`,
      );
      return;
    }

    saving.value = true;
    try {
      const payload = {
        id: props.voucher?.id,
        voucherWord: form.value.voucherWord,
        voucherNo: form.value.voucherNo,
        voucherDate: form.value.voucherDate,
        period: currentPeriod.value,
        remark: form.value.remark,
        maker: form.value.maker,
        bookkeeper: form.value.bookkeeper,
        entries,
      };
      const result = isEdit.value
        ? await api.updateVoucher(payload)
        : await api.createVoucher(payload);
      if ((result as any)?.__error) {
        ElMessage.error((result as any).__error);
        return;
      }
      // 上传暂存附件
      if (result.id) {
        await uploadPending(result.id);
      }
      ElMessage.success(isEdit.value ? '凭证已更新' : '凭证已保存');
      emit('saved', result as FinanceVoucher);

      if (continueCreate) {
        emit('switchToCreate');
        const data = await api.bootstrap();
        const word = defaultVoucherWord.value;
        const no = await api.getNextVoucherNo({
          voucherWord: word,
          period: data.book.current_period,
        });
        const userAlias =
          auth.state.user?.alias || auth.state.user?.username || 'admin';
        form.value = {
          voucherWord: word,
          voucherNo: no,
          voucherDate: fmtDate(new Date()),
          remark: '',
          bookkeeper: userAlias,
          maker: userAlias,
        };
        rows.value = blankForm();
        resetAttachments();
      } else {
        emit('update:open', false);
      }
    } finally {
      saving.value = false;
    }
  }

  /** 删除当前凭证 */
  async function handleDelete() {
    if (!props.voucher?.id) return;
    try {
      await ElMessageBox.confirm('确认删除此凭证？', '警告', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      });
      const r: any = await api.deleteVoucher(props.voucher!.id);
      if (r?.__error) {
        ElMessage.error(r.__error);
        return;
      }
      ElMessage.success('凭证已删除');
      emit('deleted', props.voucher!.id);
      emit('update:open', false);
    } catch {
      /* 用户取消 */
    }
  }

  /** 审核凭证 */
  async function handleAudit() {
    if (!props.voucher?.id) return;
    try {
      const r: any = await api.auditVoucher(props.voucher.id);
      if (r?.__error) {
        ElMessage.error(r.__error);
        return;
      }
      ElMessage.success('凭证已审核');
      emit('saved', r as FinanceVoucher);
    } catch (e: any) {
      ElMessage.error(e.message);
    }
  }

  /** 反审核凭证 */
  async function handleUnaudit() {
    if (!props.voucher?.id) return;
    try {
      const r: any = await api.unauditVoucher(props.voucher.id);
      if (r?.__error) {
        ElMessage.error(r.__error);
        return;
      }
      ElMessage.success('已取消审核');
      emit('saved', r as FinanceVoucher);
    } catch (e: any) {
      ElMessage.error(e.message);
    }
  }

  /* ---- 摘要自动补全 ---- */
  function querySummaries(
    queryString: string,
    cb: (results: { value: string }[]) => void,
  ) {
    const results = queryString
      ? SUMMARY_OPTIONS.filter(s => s.includes(queryString)).map(s => ({
          value: s,
        }))
      : SUMMARY_OPTIONS.map(s => ({ value: s }));
    cb(results);
  }

  /* ---- 记账人选项 ---- */
  const bookkeeperOptions = computed(() => {
    const alias =
      auth.state.user?.alias || auth.state.user?.username || 'admin';
    return [alias];
  });

  /* ---- 中文大写合计 ---- */
  const chineseUpperTotal = computed(() => ({
    debit: toChineseUpper(debitTotal.value),
    credit: toChineseUpper(creditTotal.value),
  }));

  return {
    /* 基础 */
    subjects,
    saving,
    isEdit,
    isReadonly,
    /* 凭证字列表（供 VoucherModal 动态渲染下拉选项） */
    voucherWords,
    /* 表单 */
    form,
    rows,
    debitTotal,
    creditTotal,
    balanced,
    canEdit,
    hoveredRowKey,
    /* 导航 */
    currentIndex,
    hasPrev,
    hasNext,
    handlePrev,
    handleNext,
    /* 行操作 */
    createRow,
    onSummaryKeyup,
    blankForm,
    insertRowAfter,
    deleteRow,
    /* 模板 */
    businessTemplates,
    /* 初始化 */
    initModal,
    /* 保存/删除/审核 */
    handleSave,
    handleDelete,
    handleAudit,
    handleUnaudit,
    /* 杂项 */
    querySummaries,
    bookkeeperOptions,
    chineseUpperTotal,
  };
}
