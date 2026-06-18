/**
 * useAttachments.ts — 附件管理逻辑组合式函数
 *
 * 职责：附件列表状态、上传、暂存、移除、预览加载、大图预览窗口
 * 使用场景：新增/编辑凭证时管理附件
 */
import { computed, ref, type ComputedRef } from 'vue';
import { ElMessage } from 'element-plus';
import type { FinanceApi } from '../api';

/** 已保存附件的数据结构 */
export interface SavedAttachment {
  id: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at?: string;
}

/** 待上传附件的数据结构 */
export interface PendingFile {
  name: string;
  size: number;
  dataUrl: string;
}

/**
 * 附件管理组合式函数
 * @param api       - 财务 API 实例（用于上传/删除/读取）
 * @param voucherId - 当前凭证 ID（计算属性，响应式）
 * @param canEdit   - 是否可编辑（计算属性）
 */
export function useAttachments(
  api: FinanceApi,
  voucherId: ComputedRef<number | undefined>,
  canEdit: ComputedRef<boolean>,
) {
  /* ---- 附件存储 ---- */
  /** 已保存到后端的附件列表 */
  const savedAttachments = ref<SavedAttachment[]>([]);
  /** 暂存在前端、尚未上传的附件 */
  const pendingFiles = ref<PendingFile[]>([]);
  /** 上传中标志 */
  const uploading = ref(false);
  /** 文件读取中标志（FileReader 异步读取期间为 true，防止未读取完成就保存） */
  const readingFiles = ref(false);
  /** 隐藏的文件选择器引用 */
  const fileInput = ref<HTMLInputElement | null>(null);

  /** 合并已保存 + 待上传的附件统一列表 */
  const allAttachments = computed(() => [
    ...savedAttachments.value,
    ...pendingFiles.value.map(f => ({
      id: -1,
      file_name: f.name,
      file_size: f.size,
      mime_type: '',
      created_at: '',
      _pending: true as const,
    })),
  ]);

  /** 触发本地文件选择器 */
  function triggerUpload() {
    fileInput.value?.click();
  }

  /**
   * 处理文件选择事件
   * - 已有凭证 ID → 直接上传到后端
   * - 新增凭证 → 暂存，保存时批量上传
   */
  function handleFiles(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    readingFiles.value = true;
    let completed = 0;
    const total = files.length;

    function onAllComplete() {
      completed++;
      if (completed >= total) {
        readingFiles.value = false;
      }
    }

    for (let i = 0; i < total; i++) {
      const f = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const fileData: PendingFile = {
            name: f.name,
            size: f.size,
            dataUrl: reader.result as string,
          };
          const id = voucherId.value;
          if (id) {
            uploading.value = true;
            api.uploadAttachment(id, fileData).then((att) => {
              if ((att as any)?.__error) {
                ElMessage.error(`附件「${f.name}」上传失败：${(att as any).__error}`);
              } else {
                savedAttachments.value.push(att as unknown as SavedAttachment);
              }
              uploading.value = false;
              onAllComplete();
            }).catch((err: any) => {
              ElMessage.error(`附件「${f.name}」上传失败：${err?.message || err}`);
              uploading.value = false;
              onAllComplete();
            });
          } else {
            pendingFiles.value.push(fileData);
            onAllComplete();
          }
        } catch (err: any) {
          console.error(`读取文件失败: ${f.name}`, err);
          onAllComplete();
        }
      };
      reader.onerror = () => {
        console.error(`文件读取错误: ${f.name}`);
        onAllComplete();
      };
      reader.readAsDataURL(f);
    }
    target.value = '';
  }

  /**
   * 移除指定索引的附件
   * - 暂存附件 → 从 pendingFiles 中移除
   * - 已保存附件 → 调用后端删除接口
   */
  async function removeAttachment(idx: number) {
    const att = allAttachments.value[idx];
    if (!att) return;
    if ((att as any)._pending) {
      const pendingIdx = pendingFiles.value.findIndex(
        f => f.name === att.file_name && f.size === att.file_size,
      );
      if (pendingIdx >= 0) pendingFiles.value.splice(pendingIdx, 1);
    } else {
      try { await api.deleteAttachment(att.id); } catch (e) { console.warn('[useAttachments] 删除附件失败:', e); }
      savedAttachments.value = savedAttachments.value.filter(a => a.id !== att.id);
    }
  }

  /**
   * 凭证保存后批量上传暂存附件
   * @param id 新创建的凭证 ID
   */
  async function uploadPendingAttachments(id: number) {
    const files = [...pendingFiles.value];
    pendingFiles.value = [];
    let failedCount = 0;
    for (const f of files) {
      try {
        // toRaw + 解构：剥除 Vue 响应式 Proxy，否则 Electron IPC 结构化克隆失败
        const raw = { name: String(f.name), size: Number(f.size), dataUrl: String(f.dataUrl) };
        const att = await api.uploadAttachment(id, raw);
        if ((att as any)?.__error) {
          console.error(`附件上传失败: ${f.name}`, (att as any).__error);
          failedCount++;
          continue;
        }
        savedAttachments.value.push(att as unknown as SavedAttachment);
      } catch (e: any) {
        console.error(`附件上传失败: ${f.name}`, e?.message || e);
        failedCount++;
      }
    }
    if (failedCount > 0) {
      ElMessage.warning(`${failedCount} 个附件上传失败，请手动重新添加`);
    }
  }

  /* ---- 附件预览 ---- */
  /** 附件 ID → base64 dataUrl 的缓存映射 */
  const previewMap = ref<Record<number, string>>({});
  /** 附件 ID → 加载中标志 */
  const previewLoading = ref<Record<number, boolean>>({});

  /** 图片文件扩展名 */
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

  /** 判断是否为图片文件 */
  function isImageFile(mime: string, name: string): boolean {
    if (mime && mime.startsWith('image/')) return true;
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    return imageExts.includes(ext);
  }

  /** 根据文件类型返回 emoji 图标 */
  function fileTypeEmoji(mime: string, name: string): string {
    if (isImageFile(mime, name)) return '🖼️';
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    if (['.pdf'].includes(ext)) return '📄';
    if (['.doc', '.docx'].includes(ext)) return '📝';
    if (['.xls', '.xlsx'].includes(ext)) return '📊';
    if (['.zip', '.rar', '.7z'].includes(ext)) return '📦';
    if (['.txt'].includes(ext)) return '📃';
    return '📎';
  }

  /**
   * 按需加载附件预览 dataUrl
   * 鼠标悬停时调用，避免一次性加载所有附件
   */
  async function loadPreview(attId: number) {
    if (previewMap.value[attId] || previewLoading.value[attId]) return;
    previewLoading.value[attId] = true;
    try {
      const result = await api.readAttachmentFile(attId);
      if (result?.data_url) previewMap.value[attId] = result.data_url;
    } catch (e) { console.warn('[useAttachments] 加载附件预览失败:', e); }
    previewLoading.value[attId] = false;
  }

  /**
   * 在新窗口（Electron 无边框窗口）中预览图片
   * @param dataUrl 图片 base64 dataUrl
   */
  function openPreview(dataUrl: string) {
    const w = window.open('about:blank', '_blank');
    if (w) {
      w.document.title = '附件预览';
      w.document.head.innerHTML = `<meta charset="UTF-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#1a1a1a;display:flex;flex-direction:column;height:100vh;overflow:hidden;user-select:none}
        .preview-bar{display:flex;align-items:center;justify-content:flex-end;height:36px;padding:0 6px;-webkit-app-region:drag}
        .preview-close{width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;color:#ccc;font-size:18px;-webkit-app-region:no-drag;transition:all .15s}
        .preview-close:hover{background:#e81123;color:#fff}
        .preview-img-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden}
        .preview-img-wrap img{max-width:100%;max-height:100%;object-fit:contain}
      </style>`;
      w.document.body.innerHTML = `
        <div class="preview-bar"><span class="preview-close" title="关闭 (Esc)">×</span></div>
        <div class="preview-img-wrap"><img src="${dataUrl}" /></div>
      `;
      const close = () => { try { w.close(); } catch (e) { console.warn('[useAttachments] 关闭预览窗口失败:', e); } };
      w.document.querySelector('.preview-close')?.addEventListener('click', close);
      w.document.querySelector('.preview-img-wrap')?.addEventListener('click', close);
      w.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }
  }

  /**
   * 批量加载所有已保存图片附件的预览
   * 凭证打开时调用
   */
  async function loadAllPreviews() {
    for (const att of savedAttachments.value) {
      if (isImageFile(att.mime_type, att.file_name)) {
        loadPreview(att.id);
      }
    }
  }

  return {
    /* 状态 */
    savedAttachments,
    pendingFiles,
    uploading,
    readingFiles,
    fileInput,
    allAttachments,
    previewMap,
    previewLoading,
    /* 文件操作 */
    triggerUpload,
    handleFiles,
    removeAttachment,
    uploadPendingAttachments,
    /* 预览 */
    isImageFile,
    fileTypeEmoji,
    loadPreview,
    openPreview,
    loadAllPreviews,
  };
}
