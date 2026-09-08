/**
 * Клиентский модуль плагина «Просмотрщик архивов» (archive-inspector).
 * Регистрирует действие вложения и отображает модальное окно с деревом файлов архива.
 */

// Векторные SVG-иконки для интерфейса плагина
const ICONS = {
  archive: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  folder: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  file: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
  filePdf: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
  fileImage: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
  fileCode: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
};

// Форматирование размера файлов в читаемый вид
function formatSize(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '0 Б';
  const b = Number(bytes);
  if (b === 0) return '0 Б';
  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + (sizes[i] || 'Б');
}

// Форматирование даты
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '—';
  }
}

// Определение иконки файла по расширению
function getFileIcon(filename, isDir) {
  if (isDir) return ICONS.folder;
  if (!filename) return ICONS.file;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return ICONS.filePdf;
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.svg')) return ICONS.fileImage;
  if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.go') || lower.endsWith('.html') || lower.endsWith('.css') || lower.endsWith('.json') || lower.endsWith('.xml') || lower.endsWith('.sql')) return ICONS.fileCode;
  if (lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.gz') || lower.endsWith('.tgz') || lower.endsWith('.7z') || lower.endsWith('.rar')) return ICONS.archive;
  return ICONS.file;
}

// Внедрение стилей модального окна в DOM (строго через системные CSS-переменные активной темы)
function ensureModalStyles() {
  if (document.getElementById('archive-inspector-styles')) return;

  const style = document.createElement('style');
  style.id = 'archive-inspector-styles';
  style.textContent = `
    .arch-insp-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: archInspFadeIn 0.2s ease-out;
    }
    @keyframes archInspFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .arch-insp-container {
      background: var(--bg-surface);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.35);
      width: 100%;
      max-width: 920px;
      height: 82vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: archInspScaleUp 0.2s ease-out;
    }
    @keyframes archInspScaleUp {
      from { transform: scale(0.96); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .arch-insp-header {
      background: var(--bg-surface-elevated);
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
    }
    .arch-insp-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .arch-insp-header-icon {
      display: flex;
      align-items: center;
      color: var(--primary-accent);
      flex-shrink: 0;
    }
    .arch-insp-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .arch-insp-size-badge {
      font-size: 12px;
      font-weight: 500;
      background: var(--bg-app);
      color: var(--text-secondary);
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid var(--border-color-subtle);
      flex-shrink: 0;
    }
    .arch-insp-close-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 6px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .arch-insp-close-btn:hover {
      background: var(--bg-item-hover);
      color: var(--text-primary);
    }
    .arch-insp-toolbar {
      padding: 12px 20px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-shrink: 0;
    }
    .arch-insp-search-box {
      position: relative;
      flex: 1;
      max-width: 400px;
    }
    .arch-insp-search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      pointer-events: none;
    }
    .arch-insp-search-input {
      width: 100%;
      background: var(--bg-app);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 7px 12px 7px 32px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease;
      box-sizing: border-box;
    }
    .arch-insp-search-input:focus {
      border-color: var(--primary-accent);
    }
    .arch-insp-summary {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .arch-insp-body {
      flex: 1;
      overflow-y: auto;
      background: var(--bg-surface);
      position: relative;
    }
    .arch-insp-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    .arch-insp-table th {
      position: sticky;
      top: 0;
      background: var(--bg-surface-elevated);
      color: var(--text-secondary);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color);
      z-index: 2;
    }
    .arch-insp-table td {
      padding: 9px 16px;
      border-bottom: 1px solid var(--border-color-subtle);
      color: var(--text-primary);
      vertical-align: middle;
    }
    .arch-insp-row:hover td {
      background: var(--bg-item-hover);
    }
    .arch-insp-name-cell {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .arch-insp-icon-col {
      display: flex;
      align-items: center;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .arch-insp-icon-col.is-folder {
      color: var(--primary-accent);
    }
    .arch-insp-path-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: inherit;
    }
    .arch-insp-path-dir {
      color: var(--text-muted);
    }
    .arch-insp-path-base {
      color: var(--text-primary);
      font-weight: 500;
    }
    .arch-insp-cell-size {
      color: var(--text-secondary);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .arch-insp-cell-date {
      color: var(--text-muted);
      white-space: nowrap;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .arch-insp-cell-action {
      text-align: right;
      white-space: nowrap;
    }
    .arch-insp-btn-dl-item {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .arch-insp-btn-dl-item:hover {
      background: var(--primary-accent);
      border-color: var(--primary-accent);
      color: #fff;
    }
    .arch-insp-footer {
      background: var(--bg-surface-elevated);
      padding: 12px 20px;
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-shrink: 0;
    }
    .arch-insp-btn {
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .arch-insp-btn-secondary {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
    }
    .arch-insp-btn-secondary:hover {
      background: var(--bg-item-hover);
    }
    .arch-insp-btn-primary {
      background: var(--primary-accent);
      border: 1px solid var(--primary-accent);
      color: #fff;
    }
    .arch-insp-btn-primary:hover {
      background: var(--primary-accent-hover, var(--primary-accent));
    }
    .arch-insp-loading, .arch-insp-error, .arch-insp-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      height: 100%;
      box-sizing: border-box;
    }
    .arch-insp-spinner {
      width: 36px;
      height: 36px;
      border: 3px solid var(--border-color);
      border-top-color: var(--primary-accent);
      border-radius: 50%;
      animation: archInspSpin 0.8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes archInspSpin {
      to { transform: rotate(360deg); }
    }
    .arch-insp-error-icon {
      color: #ef4444;
      margin-bottom: 12px;
    }
    .arch-insp-error-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text-primary);
    }
    .arch-insp-error-desc {
      font-size: 13px;
      color: var(--text-secondary);
      max-width: 480px;
      margin-bottom: 18px;
    }
  `;
  document.head.appendChild(style);
}

// Открытие модального окна инспектора архивов
function openArchiveInspectorModal(att, message, context) {
  ensureModalStyles();

  const accId = message.account_id;
  const folder = message.folder || 'INBOX';
  const uid = message.uid;
  const partId = att.part_id || att.file_name;
  const archiveName = att.file_name || 'archive.zip';
  const rawDownloadUrl = `/api/accounts/${accId}/folders/${encodeURIComponent(folder)}/messages/${uid}/attachments/${encodeURIComponent(partId)}`;

  // Удаляем старое модальное окно если оно существовало
  const oldModal = document.getElementById('archive-inspector-modal');
  if (oldModal) oldModal.remove();

  // Создаем оверлей
  const overlay = document.createElement('div');
  overlay.id = 'archive-inspector-modal';
  overlay.className = 'arch-insp-overlay';

  // Контейнер окна
  const container = document.createElement('div');
  container.className = 'arch-insp-container';
  overlay.appendChild(container);

  // Состояние
  let filesList = [];
  let filterText = '';

  function closeModal() {
    window.removeEventListener('keydown', handleKeyDown);
    overlay.remove();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }
  window.addEventListener('keydown', handleKeyDown);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Первоначальный рендер: шапка + спиннер загрузки
  function renderLoading() {
    container.innerHTML = `
      <div class="arch-insp-header">
        <div class="arch-insp-title-wrap">
          <span class="arch-insp-header-icon">${ICONS.archive}</span>
          <h3 class="arch-insp-title" title="${archiveName}">${archiveName}</h3>
          <span class="arch-insp-size-badge">${formatSize(att.size)}</span>
        </div>
        <button type="button" class="arch-insp-close-btn" title="Закрыть (Esc)" id="arch-insp-btn-close-head">
          ${ICONS.close}
        </button>
      </div>
      <div class="arch-insp-body">
        <div class="arch-insp-loading">
          <div class="arch-insp-spinner"></div>
          <div style="font-size: 14px; font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">Анализ содержимого архива...</div>
          <div style="font-size: 12px; color: var(--text-muted);">Чтение структуры файлов без полной распаковки на диск</div>
        </div>
      </div>
      <div class="arch-insp-footer">
        <button type="button" class="arch-insp-btn arch-insp-btn-secondary" id="arch-insp-btn-close-foot">Закрыть</button>
        <a href="${rawDownloadUrl}" download="${archiveName}" class="arch-insp-btn arch-insp-btn-primary">
          ${ICONS.download}
          <span>Скачать весь архив</span>
        </a>
      </div>
    `;

    container.querySelector('#arch-insp-btn-close-head').onclick = closeModal;
    container.querySelector('#arch-insp-btn-close-foot').onclick = closeModal;
  }

  // Рендер экрана ошибки
  function renderError(errorMessage) {
    container.innerHTML = `
      <div class="arch-insp-header">
        <div class="arch-insp-title-wrap">
          <span class="arch-insp-header-icon">${ICONS.archive}</span>
          <h3 class="arch-insp-title" title="${archiveName}">${archiveName}</h3>
          <span class="arch-insp-size-badge">${formatSize(att.size)}</span>
        </div>
        <button type="button" class="arch-insp-close-btn" title="Закрыть (Esc)" id="arch-insp-btn-close-head">
          ${ICONS.close}
        </button>
      </div>
      <div class="arch-insp-body">
        <div class="arch-insp-error">
          <div class="arch-insp-error-icon">${ICONS.alert}</div>
          <div class="arch-insp-error-title">Не удалось открыть архив</div>
          <div class="arch-insp-error-desc">${errorMessage || 'Неподдерживаемый формат или архив защищен паролем.'}</div>
          <div style="display: flex; gap: 10px;">
            <a href="${rawDownloadUrl}" download="${archiveName}" class="arch-insp-btn arch-insp-btn-primary">
              ${ICONS.download}
              <span>Скачать архив целиком</span>
            </a>
          </div>
        </div>
      </div>
      <div class="arch-insp-footer">
        <button type="button" class="arch-insp-btn arch-insp-btn-secondary" id="arch-insp-btn-close-foot">Закрыть</button>
      </div>
    `;

    container.querySelector('#arch-insp-btn-close-head').onclick = closeModal;
    container.querySelector('#arch-insp-btn-close-foot').onclick = closeModal;
  }

  // Рендер таблицы файлов и тулбара
  function renderFiles() {
    const query = filterText.trim().toLowerCase();
    const filtered = (filesList || []).filter(f => {
      if (!query) return true;
      return f.name && f.name.toLowerCase().includes(query);
    });

    const totalFiles = (filesList || []).filter(f => !f.is_dir).length;
    const totalDirs = (filesList || []).filter(f => f.is_dir).length;
    const totalUnpackedSize = (filesList || []).reduce((acc, f) => acc + (f.size || 0), 0);

    container.innerHTML = `
      <div class="arch-insp-header">
        <div class="arch-insp-title-wrap">
          <span class="arch-insp-header-icon">${ICONS.archive}</span>
          <h3 class="arch-insp-title" title="${archiveName}">${archiveName}</h3>
          <span class="arch-insp-size-badge">${formatSize(att.size)}</span>
        </div>
        <button type="button" class="arch-insp-close-btn" title="Закрыть (Esc)" id="arch-insp-btn-close-head">
          ${ICONS.close}
        </button>
      </div>

      <div class="arch-insp-toolbar">
        <div class="arch-insp-search-box">
          <span class="arch-insp-search-icon">${ICONS.search}</span>
          <input type="text" class="arch-insp-search-input" id="arch-insp-search" placeholder="Поиск файлов в архиве..." value="${filterText}">
        </div>
        <div class="arch-insp-summary">
          Файлов: <strong>${totalFiles}</strong>${totalDirs > 0 ? `, папок: <strong>${totalDirs}</strong>` : ''} | Общий объем: <strong>${formatSize(totalUnpackedSize)}</strong>
        </div>
      </div>

      <div class="arch-insp-body">
        ${filtered.length === 0 ? `
          <div class="arch-insp-empty">
            <div style="font-size: 14px; color: var(--text-secondary);">Ничего не найдено по запросу «${filterText}»</div>
          </div>
        ` : `
          <table class="arch-insp-table">
            <thead>
              <tr>
                <th style="width: 50%;">Имя / Путь</th>
                <th style="width: 15%;">Размер</th>
                <th style="width: 15%;">Сжатый</th>
                <th style="width: 15%;">Дата изменения</th>
                <th style="width: 5%; text-align: right;"></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((item, idx) => {
                const parts = (item.name || '').split('/');
                const isDir = item.is_dir;
                const baseName = parts[parts.length - (isDir ? 2 : 1)] || item.name;
                const dirPrefix = parts.slice(0, parts.length - (isDir ? 2 : 1)).join('/');
                const extractUrl = `/api/plugins/archive-inspector/api/extract?account_id=${accId}&folder=${encodeURIComponent(folder)}&uid=${uid}&part_id=${encodeURIComponent(partId)}&path=${encodeURIComponent(item.name)}`;

                return `
                  <tr class="arch-insp-row">
                    <td>
                      <div class="arch-insp-name-cell">
                        <span class="arch-insp-icon-col ${isDir ? 'is-folder' : ''}">
                          ${getFileIcon(item.name, isDir)}
                        </span>
                        <span class="arch-insp-path-text" title="${item.name}">
                          ${dirPrefix ? `<span class="arch-insp-path-dir">${dirPrefix}/</span>` : ''}
                          <span class="arch-insp-path-base">${baseName}${isDir ? '/' : ''}</span>
                        </span>
                      </div>
                    </td>
                    <td class="arch-insp-cell-size">${isDir ? '—' : formatSize(item.size)}</td>
                    <td class="arch-insp-cell-size">${isDir || !item.compressed_size ? '—' : formatSize(item.compressed_size)}</td>
                    <td class="arch-insp-cell-date">${formatDate(item.modified)}</td>
                    <td class="arch-insp-cell-action">
                      ${!isDir ? `
                        <a href="${extractUrl}" download="${baseName}" class="arch-insp-btn-dl-item" title="Скачать отдельный файл">
                          ${ICONS.download}
                          <span>Скачать</span>
                        </a>
                      ` : ''}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>

      <div class="arch-insp-footer">
        <button type="button" class="arch-insp-btn arch-insp-btn-secondary" id="arch-insp-btn-close-foot">Закрыть</button>
        <a href="${rawDownloadUrl}" download="${archiveName}" class="arch-insp-btn arch-insp-btn-primary">
          ${ICONS.download}
          <span>Скачать весь архив</span>
        </a>
      </div>
    `;

    container.querySelector('#arch-insp-btn-close-head').onclick = closeModal;
    container.querySelector('#arch-insp-btn-close-foot').onclick = closeModal;

    const searchInput = container.querySelector('#arch-insp-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        filterText = e.target.value;
        renderFiles();
        // Возвращаем фокус и курсор в конец поля
        const newSearch = container.querySelector('#arch-insp-search');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(filterText.length, filterText.length);
        }
      };
    }
  }

  // Запуск загрузки
  renderLoading();
  document.body.appendChild(overlay);

  // Запрос структуры архива
  const inspectUrl = `/api/plugins/archive-inspector/api/inspect?account_id=${accId}&folder=${encodeURIComponent(folder)}&uid=${uid}&part_id=${encodeURIComponent(partId)}`;
  fetch(inspectUrl)
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    })
    .then((data) => {
      if (!data || !Array.isArray(data.files)) {
        throw new Error('Некорректный ответ от сервиса анализа архива');
      }
      filesList = data.files;
      renderFiles();
    })
    .catch((err) => {
      renderError(err.message);
    });
}

export default {
  id: 'archive-inspector',
  name: 'Просмотрщик архивов',
  version: '1.0.0',
  init(context) {
    context.registerHook('message:attachment_action', (msgCtx) => {
      return {
        id: 'archive-inspector-action',
        title: 'Просмотреть содержимое архива',
        label: 'Архив',
        icon: 'archive',
        filter: (att) => {
          if (!att || !att.file_name) return false;
          const lower = att.file_name.toLowerCase();
          return (
            lower.endsWith('.zip') ||
            lower.endsWith('.tar') ||
            lower.endsWith('.tar.gz') ||
            lower.endsWith('.tgz') ||
            lower.endsWith('.gz') ||
            lower.endsWith('.7z') ||
            lower.endsWith('.rar')
          );
        },
        onClick: (att, message) => {
          openArchiveInspectorModal(att, message, context);
        }
      };
    });
  }
};
