/**
 * Клиентский модуль плагина «Отложенная отправка» для WallMail.
 * Регистрирует действия отправки в композере и пункт в боковой панели.
 */

// SVG-иконка часов для кнопки расписания
const CLOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"></circle>
  <polyline points="12 6 12 12 16 14"></polyline>
</svg>`;

// Локальное состояние счетчика очереди
let scheduledCount = 0;
let queueUpdateListeners = [];

function notifyQueueChanged(count) {
  scheduledCount = count;
  queueUpdateListeners.forEach(fn => {
    try {
      fn(count);
    } catch (e) {
      console.error('[Scheduled Send] Ошибка слушателя очереди:', e);
    }
  });
}

// Запрос актуального количества запланированных писем
async function refreshQueueCount() {
  try {
    const res = await fetch('/api/plugins/scheduled-send/api/queue');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.count === 'number') {
        notifyQueueChanged(data.count);
      }
    }
  } catch (err) {
    console.error('[Scheduled Send] Ошибка получения очереди:', err);
  }
}

// Форматирование даты и времени в локальный формат
function formatDateTime(unixSec) {
  if (!unixSec) return '';
  const d = new Date(unixSec * 1000);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Вычисление пресетов времени
function getPresetTime(type) {
  const now = new Date();
  const target = new Date(now);

  if (type === 'plus_1h') {
    target.setHours(now.getHours() + 1);
  } else if (type === 'tomorrow_9') {
    target.setDate(now.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else if (type === 'tomorrow_13') {
    target.setDate(now.getDate() + 1);
    target.setHours(13, 0, 0, 0);
  } else if (type === 'next_monday_9') {
    const day = now.getDay();
    const daysUntilMonday = ((8 - day) % 7) || 7;
    target.setDate(now.getDate() + daysUntilMonday);
    target.setHours(9, 0, 0, 0);
  }

  return Math.floor(target.getTime() / 1000);
}

// Преобразование даты в формат value для input[type="datetime-local"]
function toLocalDatetimeString(date) {
  const pad = num => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default {
  init(ctx) {
    // Первичный опрос количества писем
    refreshQueueCount();

    // 1. Регистрация хука кнопки в композере рядом с «Отправить»
    ctx.registerHook('composer:send_actions', (composerCtx) => {
      return {
        id: 'scheduled-send',
        title: 'Отправить по расписанию (Отложенная отправка)',
        svgContent: CLOCK_SVG,
        onClick: () => {
          openSchedulePickerModal(composerCtx);
        }
      };
    });

    // 2. Регистрация пункта в сайдбаре
    ctx.registerHook('sidebar:nav_item', () => {
      return {
        id: 'scheduled-send',
        label: 'Отложенные',
        icon: 'clock',
        badge: scheduledCount > 0 ? scheduledCount : null,
        onClick: () => {
          openQueueManagerModal(ctx);
        }
      };
    });
  }
};

/**
 * Открытие модального окна выбора времени отложенной отправки.
 */
function openSchedulePickerModal(composerCtx) {
  const payload = composerCtx.getPayload ? composerCtx.getPayload() : null;

  if (!payload || !payload.to || payload.to.length === 0) {
    composerCtx.toast.error('Укажите хотя бы одного получателя');
    return;
  }

  if (!payload.account_id) {
    composerCtx.toast.error('Выберите ящик отправителя');
    return;
  }

  // Создаем контейнер модального окна
  const overlay = document.createElement('div');
  overlay.className = 'wallmail-schedule-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const defaultDate = new Date();

  overlay.innerHTML = `
    <div class="wallmail-schedule-modal-dialog" style="
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-color, #e5e7eb);
      border-radius: var(--border-radius-lg, 8px);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
      width: 400px;
      max-width: 90vw;
      color: var(--text-primary, #111827);
      font-family: inherit;
      overflow: hidden;
    ">
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border-color, #e5e7eb);
        background: var(--bg-surface-elevated, #f9fafb);
      ">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px;">
          <span style="display: flex; align-items: center; color: var(--primary-accent, #3b82f6);">${CLOCK_SVG}</span>
          <span>Отложенная отправка</span>
        </div>
        <button type="button" class="btn-close-schedule" style="
          background: none;
          border: none;
          color: var(--text-muted, #9ca3af);
          font-size: 18px;
          cursor: pointer;
          line-height: 1;
          padding: 2px 6px;
        ">&times;</button>
      </div>

      <div style="padding: 16px 18px;">
        <div style="font-size: 12px; color: var(--text-secondary, #6b7280); margin-bottom: 12px;">
          Выберите готовый вариант или укажите точное время:
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
          <button type="button" class="preset-btn" data-preset="plus_1h" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 9px 12px;
            background: var(--bg-app, #f3f4f6);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius-base, 6px);
            color: var(--text-primary, #111827);
            cursor: pointer;
            font-size: 13px;
            transition: all 0.15s ease;
          ">
            <span style="font-weight: 500;">Через 1 час</span>
            <span style="color: var(--text-secondary, #6b7280); font-size: 12px;">+1 час</span>
          </button>

          <button type="button" class="preset-btn" data-preset="tomorrow_9" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 9px 12px;
            background: var(--bg-app, #f3f4f6);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius-base, 6px);
            color: var(--text-primary, #111827);
            cursor: pointer;
            font-size: 13px;
            transition: all 0.15s ease;
          ">
            <span style="font-weight: 500;">Завтра утром</span>
            <span style="color: var(--text-secondary, #6b7280); font-size: 12px;">09:00</span>
          </button>

          <button type="button" class="preset-btn" data-preset="tomorrow_13" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 9px 12px;
            background: var(--bg-app, #f3f4f6);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius-base, 6px);
            color: var(--text-primary, #111827);
            cursor: pointer;
            font-size: 13px;
            transition: all 0.15s ease;
          ">
            <span style="font-weight: 500;">Завтра днем</span>
            <span style="color: var(--text-secondary, #6b7280); font-size: 12px;">13:00</span>
          </button>

          <button type="button" class="preset-btn" data-preset="next_monday_9" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 9px 12px;
            background: var(--bg-app, #f3f4f6);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius-base, 6px);
            color: var(--text-primary, #111827);
            cursor: pointer;
            font-size: 13px;
            transition: all 0.15s ease;
          ">
            <span style="font-weight: 500;">В понедельник</span>
            <span style="color: var(--text-secondary, #6b7280); font-size: 12px;">09:00</span>
          </button>
        </div>

        <div style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        ">
          <div style="flex: 1; height: 1px; background: var(--border-color, #e5e7eb);"></div>
          <span style="font-size: 11px; color: var(--text-muted, #9ca3af); text-transform: uppercase;">Или выберите дату</span>
          <div style="flex: 1; height: 1px; background: var(--border-color, #e5e7eb);"></div>
        </div>

        <div style="margin-bottom: 18px;">
          <input type="datetime-local" class="custom-datetime-input" value="${toLocalDatetimeString(defaultDate)}" min="${toLocalDatetimeString(defaultDate)}" style="
            width: 100%;
            padding: 8px 12px;
            background: var(--bg-app, #f3f4f6);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius-base, 6px);
            color: var(--text-primary, #111827);
            font-size: 13px;
            box-sizing: border-box;
          " />
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn-cancel-schedule" style="
            padding: 8px 14px;
            background: var(--bg-surface, #ffffff);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius-base, 6px);
            color: var(--text-secondary, #6b7280);
            cursor: pointer;
            font-size: 13px;
          ">Отмена</button>
          <button type="button" class="btn-confirm-schedule" style="
            padding: 8px 16px;
            background: var(--primary-accent, #3b82f6);
            border: 1px solid var(--primary-accent, #3b82f6);
            border-radius: var(--border-radius-base, 6px);
            color: var(--primary-contrast, #ffffff);
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
          ">Запланировать</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const customInput = overlay.querySelector('.custom-datetime-input');
  let selectedUnix = Math.floor(new Date(customInput.value).getTime() / 1000);

  // Наведение на кнопки пресетов
  overlay.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--bg-item-hover, #e5e7eb)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'var(--bg-app, #f3f4f6)';
    });
    btn.addEventListener('click', () => {
      const presetType = btn.getAttribute('data-preset');
      selectedUnix = getPresetTime(presetType);
      customInput.value = toLocalDatetimeString(new Date(selectedUnix * 1000));
      executeSchedule(selectedUnix);
    });
  });

  const closeDialog = () => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  overlay.querySelector('.btn-close-schedule').addEventListener('click', closeDialog);
  overlay.querySelector('.btn-cancel-schedule').addEventListener('click', closeDialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeDialog();
    }
  });

  const executeSchedule = async (sendAtUnix) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    if (!sendAtUnix || sendAtUnix <= nowUnix) {
      composerCtx.toast.error('Время отправки должно быть в будущем');
      return;
    }

    try {
      const confirmBtn = overlay.querySelector('.btn-confirm-schedule');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Планирование...';
      }

      const schedulePayload = {
        ...payload,
        send_at: sendAtUnix
      };

      const res = await fetch('/api/plugins/scheduled-send/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedulePayload)
      });

      const data = await res.json();
      if (!res.ok) {
        composerCtx.toast.error(data.error || 'Ошибка планирования отправки');
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Запланировать';
        }
        return;
      }

      closeDialog();
      composerCtx.toast.success(`Письмо запланировано на ${formatDateTime(sendAtUnix)}`);
      composerCtx.resetForm();
      composerCtx.close();
      await refreshQueueCount();
    } catch (err) {
      composerCtx.toast.error('Сетевая ошибка при планировании');
    }
  };

  overlay.querySelector('.btn-confirm-schedule').addEventListener('click', () => {
    const parsedDate = new Date(customInput.value);
    const chosenUnix = Math.floor(parsedDate.getTime() / 1000);
    executeSchedule(chosenUnix);
  });
}

/**
 * Открытие модального окна просмотра и управления очередью отложенных писем.
 */
async function openQueueManagerModal(ctx) {
  const overlay = document.createElement('div');
  overlay.className = 'wallmail-schedule-queue-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-color, #e5e7eb);
      border-radius: var(--border-radius-lg, 8px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
      width: 650px;
      max-width: 92vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      color: var(--text-primary, #111827);
      font-family: inherit;
      overflow: hidden;
    ">
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid var(--border-color, #e5e7eb);
        background: var(--bg-surface-elevated, #f9fafb);
      ">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16px;">
          <span style="color: var(--primary-accent, #3b82f6); display: flex; align-items: center;">${CLOCK_SVG}</span>
          <span>Очередь отложенных писем</span>
        </div>
        <button type="button" class="btn-close-queue" style="
          background: none;
          border: none;
          color: var(--text-muted, #9ca3af);
          font-size: 20px;
          cursor: pointer;
          line-height: 1;
        ">&times;</button>
      </div>

      <div class="queue-content" style="
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
      ">
        <div style="text-align: center; color: var(--text-muted, #9ca3af); padding: 24px 0;">Загрузка очереди...</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeDialog = () => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  overlay.querySelector('.btn-close-queue').addEventListener('click', closeDialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeDialog();
    }
  });

  const contentContainer = overlay.querySelector('.queue-content');

  const renderQueue = async () => {
    try {
      const res = await fetch('/api/plugins/scheduled-send/api/queue');
      if (!res.ok) {
        contentContainer.innerHTML = `<div style="text-align: center; color: var(--status-danger, #ef4444); padding: 20px 0;">Не удалось загрузить очередь писем</div>`;
        return;
      }

      const data = await res.json();
      const items = (data && data.items) || [];
      notifyQueueChanged(items.length);

      if (items.length === 0) {
        contentContainer.innerHTML = `
          <div style="text-align: center; padding: 40px 0; color: var(--text-muted, #9ca3af);">
            <div style="margin-bottom: 8px; opacity: 0.5;">${CLOCK_SVG}</div>
            <div style="font-size: 14px; font-weight: 500;">Нет запланированных писем</div>
            <div style="font-size: 12px; margin-top: 4px;">Письма, отложенные через композер, появятся здесь</div>
          </div>
        `;
        return;
      }

      let html = `<div style="display: flex; flex-direction: column; gap: 10px;">`;
      items.forEach(item => {
        const recipientsStr = Array.isArray(item.to) ? item.to.join(', ') : item.to;
        html += `
          <div class="queue-item-card" data-id="${item.id}" style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            background: var(--bg-app, #f9fafb);
            border: 1px solid var(--border-color, #e5e7eb);
            border-radius: var(--border-radius-base, 6px);
            gap: 12px;
          ">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-weight: 600; font-size: 14px; color: var(--text-primary, #111827); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(item.subject || '(Без темы)')}
                </span>
                <span style="
                  font-size: 11px;
                  padding: 2px 6px;
                  background: var(--bg-surface-elevated, #e5e7eb);
                  border-radius: 4px;
                  color: var(--primary-accent, #3b82f6);
                  white-space: nowrap;
                ">Запланировано на ${formatDateTime(item.send_at)}</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary, #6b7280); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                Кому: ${escapeHtml(recipientsStr)}
              </div>
            </div>

            <button type="button" class="btn-cancel-item" data-id="${item.id}" style="
              display: flex;
              align-items: center;
              gap: 4px;
              padding: 6px 12px;
              background: var(--bg-surface, #ffffff);
              border: 1px solid var(--border-color, #e5e7eb);
              border-radius: var(--border-radius-base, 6px);
              color: var(--text-secondary, #6b7280);
              cursor: pointer;
              font-size: 12px;
              white-space: nowrap;
              transition: all 0.15s ease;
            ">
              Отменить
            </button>
          </div>
        `;
      });
      html += `</div>`;

      contentContainer.innerHTML = html;

      // Обработка клика отмены отправки
      contentContainer.querySelectorAll('.btn-cancel-item').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
          btn.style.color = 'var(--status-danger, #ef4444)';
          btn.style.borderColor = 'var(--status-danger, #ef4444)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.color = 'var(--text-secondary, #6b7280)';
          btn.style.borderColor = 'var(--border-color, #e5e7eb)';
        });
        btn.addEventListener('click', async () => {
          const itemId = parseInt(btn.getAttribute('data-id'), 10);
          btn.disabled = true;
          btn.textContent = 'Отмена...';

          try {
            const cancelRes = await fetch('/api/plugins/scheduled-send/api/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: itemId })
            });

            if (cancelRes.ok) {
              ctx.toast.success('Отправка письма отменена');
              await renderQueue();
            } else {
              const errData = await cancelRes.json();
              ctx.toast.error(errData.error || 'Ошибка отмены письма');
              btn.disabled = false;
              btn.textContent = 'Отменить';
            }
          } catch (e) {
            ctx.toast.error('Сетевая ошибка при отмене письма');
            btn.disabled = false;
            btn.textContent = 'Отменить';
          }
        });
      });

    } catch (err) {
      contentContainer.innerHTML = `<div style="text-align: center; color: var(--status-danger, #ef4444); padding: 20px 0;">Ошибка сети при загрузке очереди</div>`;
    }
  };

  renderQueue();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
