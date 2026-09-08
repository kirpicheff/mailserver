/**
 * Плагин «Отмена отправки» (Undo Send) для WallMail.
 * 100% изолированный модуль расширения.
 */

// Ключи локального хранилища настроек плагина
const STORAGE_KEY_ENABLED = 'wallmail_undo_send_enabled'
const STORAGE_KEY_DELAY = 'wallmail_undo_send_delay'

function isUndoEnabled() {
  return localStorage.getItem(STORAGE_KEY_ENABLED) !== 'false'
}

function getUndoDelay() {
  const val = parseInt(localStorage.getItem(STORAGE_KEY_DELAY) || '10', 10)
  return isNaN(val) || val <= 0 ? 10 : val
}

export default {
  init(ctx) {
    // 1. Регистрация хука перехвата отправки письма on_message_send
    ctx.registerHook('on_message_send', async (sendCtx) => {
      if (!isUndoEnabled()) {
        return { handled: false }
      }

      const delaySeconds = getUndoDelay()
      if (delaySeconds <= 0) {
        return { handled: false }
      }

      // Если предоставлен DOM-контейнер панели кнопок композера
      if (sendCtx.footerContainer && sendCtx.footerContainer instanceof HTMLElement) {
        const container = sendCtx.footerContainer
        const originalChildren = Array.from(container.children)

        // Временно скрываем стандартные кнопки ядра
        originalChildren.forEach(child => {
          child._origDisplay = child.style.display
          child.style.display = 'none'
        })

        // Создаем виджет отмены плагина
        const undoWidget = document.createElement('div')
        undoWidget.className = 'wallmail-undo-footer-widget'
        undoWidget.style.cssText = 'display: flex; align-items: center; gap: 8px;'
        undoWidget.innerHTML = `
          <button type="button" class="undo-cancel-btn" style="
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            background: var(--status-danger, #ef4444);
            color: #ffffff;
            border: 1px solid var(--status-danger, #ef4444);
            border-radius: var(--border-radius-base, 6px);
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            transition: filter 0.15s ease;
          " title="Отменить отправку и продолжить редактирование письма">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            <span class="undo-countdown-text">Отменить (${delaySeconds} сек)</span>
          </button>
          <button type="button" class="undo-send-now-btn" style="
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: var(--bg-surface, #1e2024);
            color: var(--text-primary, #ffffff);
            border: 1px solid var(--border-color, #374151);
            border-radius: var(--border-radius-base, 6px);
            font-weight: 500;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.15s ease;
          " title="Отправить письмо сейчас без ожидания">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <span>Отправить сейчас</span>
          </button>
        `

        container.appendChild(undoWidget)

        const btnCancel = undoWidget.querySelector('.undo-cancel-btn')
        const btnSendNow = undoWidget.querySelector('.undo-send-now-btn')
        const countdownText = undoWidget.querySelector('.undo-countdown-text')

        let isCleanedUp = false
        let timerInterval = null

        const cleanup = () => {
          if (isCleanedUp) return
          isCleanedUp = true
          if (timerInterval) {
            clearInterval(timerInterval)
            timerInterval = null
          }
          if (undoWidget.parentNode) {
            undoWidget.parentNode.removeChild(undoWidget)
          }
          originalChildren.forEach(child => {
            child.style.display = child._origDisplay !== undefined ? child._origDisplay : ''
          })
        }

        btnCancel.addEventListener('click', () => {
          cleanup()
          if (typeof sendCtx.cancel === 'function') {
            sendCtx.cancel()
          }
        })

        btnSendNow.addEventListener('click', async () => {
          cleanup()
          if (typeof sendCtx.proceed === 'function') {
            await sendCtx.proceed()
          }
        })

        const startTime = Date.now()
        timerInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000)
          const remaining = Math.max(0, delaySeconds - elapsed)

          if (countdownText) {
            countdownText.textContent = `Отменить (${remaining} сек)`
          }

          if (remaining <= 0) {
            cleanup()
            if (typeof sendCtx.proceed === 'function') {
              sendCtx.proceed()
            }
          }
        }, 200)

        return { handled: true }
      }

      return { handled: false }
    })

    // 2. Регистрация вкладки настроек плагина в окне «Настройки»
    ctx.registerHook('settings:tab', () => {
      return {
        id: 'undo-send',
        title: 'Отмена отправки',
        icon: 'undo',
        description: 'Управление интервалом задержки перед отправкой писем для возможности их отмены',
        mount(container) {
          if (!container) return

          const enabled = isUndoEnabled()
          const currentDelay = getUndoDelay()

          container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 20px;">
              <div style="background: var(--bg-app, rgba(255,255,255,0.03)); border: 1px solid var(--border-color, #374151); border-radius: 8px; padding: 16px;">
                <label style="display: flex; align-items: center; gap: 14px; cursor: pointer; user-select: none;">
                  <div style="position: relative; width: 38px; height: 20px; flex-shrink: 0;">
                    <input type="checkbox" id="undo-enable-toggle" ${enabled ? 'checked' : ''} style="position: absolute; opacity: 0; width: 0; height: 0;" />
                    <span class="undo-switch-slider" style="
                      position: absolute;
                      cursor: pointer;
                      top: 0; left: 0; right: 0; bottom: 0;
                      background-color: ${enabled ? 'var(--primary-accent, #3b82f6)' : 'var(--border-color, #4b5563)'};
                      border-radius: 20px;
                      transition: background-color 0.2s ease;
                      display: block;
                    ">
                      <span class="undo-switch-thumb" style="
                        position: absolute;
                        height: 14px;
                        width: 14px;
                        left: 3px;
                        bottom: 3px;
                        background-color: #ffffff;
                        border-radius: 50%;
                        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        transform: ${enabled ? 'translateX(18px)' : 'translateX(0)'};
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                        display: block;
                      "></span>
                    </span>
                  </div>
                  <div>
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-primary, #ffffff);">Включить задержку перед отправкой</div>
                    <div style="font-size: 12px; color: var(--text-muted, #9ca3af); margin-top: 2px;">
                      При нажатии «Отправить» кнопка превращается в обратный отсчет с возможностью отмены и повторного редактирования письма.
                    </div>
                  </div>
                </label>
              </div>

              <div id="undo-delay-group" style="display: flex; flex-direction: column; gap: 10px; opacity: ${enabled ? '1' : '0.5'}; pointer-events: ${enabled ? 'auto' : 'none'};">
                <label style="font-size: 13px; font-weight: 600; color: var(--text-primary, #ffffff);">
                  Длительность задержки (секунды):
                </label>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                  ${[5, 10, 15, 20, 30].map(sec => `
                    <label style="
                      display: flex;
                      align-items: center;
                      gap: 6px;
                      padding: 8px 14px;
                      background: var(--bg-app, rgba(255,255,255,0.04));
                      border: 1px solid ${currentDelay === sec ? 'var(--primary-accent, #3b82f6)' : 'var(--border-color, #374151)'};
                      border-radius: 6px;
                      cursor: pointer;
                      font-size: 13px;
                      font-weight: ${currentDelay === sec ? '600' : '400'};
                      color: ${currentDelay === sec ? 'var(--primary-accent, #3b82f6)' : 'var(--text-primary, #ffffff)'};
                      transition: all 0.15s ease;
                    " class="undo-delay-btn">
                      <input type="radio" name="undo-delay-radio" value="${sec}" ${currentDelay === sec ? 'checked' : ''} style="accent-color: var(--primary-accent, #3b82f6);" />
                      ${sec} сек
                    </label>
                  `).join('')}
                </div>
              </div>
            </div>
          `

          const toggleInput = container.querySelector('#undo-enable-toggle')
          const switchSlider = container.querySelector('.undo-switch-slider')
          const switchThumb = container.querySelector('.undo-switch-thumb')
          const delayGroup = container.querySelector('#undo-delay-group')
          const radios = container.querySelectorAll('input[name="undo-delay-radio"]')

          toggleInput.addEventListener('change', (e) => {
            const isChecked = e.target.checked
            localStorage.setItem(STORAGE_KEY_ENABLED, isChecked ? 'true' : 'false')
            if (switchSlider) {
              switchSlider.style.backgroundColor = isChecked ? 'var(--primary-accent, #3b82f6)' : 'var(--border-color, #4b5563)'
            }
            if (switchThumb) {
              switchThumb.style.transform = isChecked ? 'translateX(18px)' : 'translateX(0)'
            }
            delayGroup.style.opacity = isChecked ? '1' : '0.5'
            delayGroup.style.pointerEvents = isChecked ? 'auto' : 'none'
            if (ctx.toast && typeof ctx.toast.success === 'function') {
              ctx.toast.success(isChecked ? 'Задержка отправки включена' : 'Задержка отправки отключена', 'Настройки')
            }
          })

          radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
              if (e.target.checked) {
                const val = e.target.value
                localStorage.setItem(STORAGE_KEY_DELAY, val)
                container.querySelectorAll('.undo-delay-btn').forEach(btn => {
                  btn.style.borderColor = 'var(--border-color, #374151)'
                  btn.style.color = 'var(--text-primary, #ffffff)'
                  btn.style.fontWeight = '400'
                })
                const parentLabel = e.target.closest('.undo-delay-btn')
                if (parentLabel) {
                  parentLabel.style.borderColor = 'var(--primary-accent, #3b82f6)'
                  parentLabel.style.color = 'var(--primary-accent, #3b82f6)'
                  parentLabel.style.fontWeight = '600'
                }
                if (ctx.toast && typeof ctx.toast.success === 'function') {
                  ctx.toast.success(`Время задержки установлено: ${val} сек`, 'Настройки')
                }
              }
            })
          })
        }
      }
    })
  }
}
