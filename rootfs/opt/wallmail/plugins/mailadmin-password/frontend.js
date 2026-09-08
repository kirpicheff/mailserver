/**
 * Клиентский модуль плагина «MailAdmin Password Manager» для WallMail.
 * Предоставляет:
 * 1. Модальное окно «Забыли пароль?» на экране входа (хук auth:login_extra).
 * 2. Блок смены пароля ящика в настройках безопасности (хук settings:security_extra).
 * 3. Вкладку настроек плагина в панели администратора (хук admin:tab).
 */

// SVG-иконки для интерфейса плагина
const ICONS = {
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"></circle><path d="m21 2-9.6 9.6"></path><path d="m15.5 7.5 3 3L22 7l-3-3"></path></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
};

// Функция открытия модального окна «Забыли пароль?» на экране входа
function openForgotPasswordModal(initialEmail) {
  let existingModal = document.getElementById('mailadmin-forgot-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'mailadmin-forgot-modal';
  overlay.className = 'mailadmin-modal-overlay';

  overlay.innerHTML = `
    <div class="mailadmin-modal-dialog">
      <div class="mailadmin-modal-header">
        <div class="mailadmin-modal-title">
          ${ICONS.key}
          <span>Восстановление пароля</span>
        </div>
        <button type="button" class="mailadmin-btn-close" id="mailadmin-close-btn" title="Закрыть">
          ${ICONS.close}
        </button>
      </div>

      <div class="mailadmin-modal-body">
        <div id="mailadmin-alert" class="mailadmin-alert" style="display: none;"></div>

        <!-- Шаг 1: Запрос e-mail ящика -->
        <div id="mailadmin-step-1">
          <p class="mailadmin-step-hint">
            Введите ваш почтовый адрес для получения одноразового 6-значного кода подтверждения.
          </p>
          <div class="mailadmin-form-group">
            <label class="mailadmin-label">Электронная почта:</label>
            <input
              type="email"
              id="mailadmin-email-input"
              class="mailadmin-input"
              placeholder="user@domain.com"
              value="${initialEmail || ''}"
              autocomplete="email"
              autofocus
            />
          </div>
          <button type="button" id="mailadmin-send-code-btn" class="mailadmin-btn-primary">
            Получить код
          </button>
        </div>

        <!-- Шаг 2: Ввод кода и нового пароля -->
        <div id="mailadmin-step-2" style="display: none;">
          <p class="mailadmin-step-hint">
            Код подтверждения отправлен на ваш почтовый ящик. Введите код и задайте новый пароль.
          </p>
          <div class="mailadmin-form-group">
            <label class="mailadmin-label">Код из письма (6 цифр):</label>
            <input
              type="text"
              id="mailadmin-code-input"
              class="mailadmin-input mailadmin-code-input"
              placeholder="123456"
              maxlength="6"
              autocomplete="one-time-code"
            />
          </div>
          <div class="mailadmin-form-group">
            <label class="mailadmin-label">Новый пароль:</label>
            <input
              type="password"
              id="mailadmin-new-pass-input"
              class="mailadmin-input"
              placeholder="••••••••"
              autocomplete="new-password"
            />
          </div>
          <div class="mailadmin-form-group">
            <label class="mailadmin-label">Подтверждение пароля:</label>
            <input
              type="password"
              id="mailadmin-confirm-pass-input"
              class="mailadmin-input"
              placeholder="••••••••"
              autocomplete="new-password"
            />
          </div>
          <div class="mailadmin-actions-row">
            <button type="button" id="mailadmin-reset-btn" class="mailadmin-btn-primary">
              Сменить пароль
            </button>
            <button type="button" id="mailadmin-back-btn" class="mailadmin-btn-secondary">
              Назад
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const alertBox = overlay.querySelector('#mailadmin-alert');
  const step1 = overlay.querySelector('#mailadmin-step-1');
  const step2 = overlay.querySelector('#mailadmin-step-2');
  const emailInput = overlay.querySelector('#mailadmin-email-input');
  const codeInput = overlay.querySelector('#mailadmin-code-input');
  const newPassInput = overlay.querySelector('#mailadmin-new-pass-input');
  const confirmPassInput = overlay.querySelector('#mailadmin-confirm-pass-input');
  const sendCodeBtn = overlay.querySelector('#mailadmin-send-code-btn');
  const resetBtn = overlay.querySelector('#mailadmin-reset-btn');
  const backBtn = overlay.querySelector('#mailadmin-back-btn');
  const closeBtn = overlay.querySelector('#mailadmin-close-btn');

  function showAlert(msg, isError) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = 'mailadmin-alert ' + (isError ? 'mailadmin-alert-danger' : 'mailadmin-alert-success');
    alertBox.style.display = 'block';
  }

  function hideAlert() {
    if (alertBox) alertBox.style.display = 'none';
  }

  closeBtn.onclick = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  backBtn.onclick = () => {
    hideAlert();
    step2.style.display = 'none';
    step1.style.display = 'block';
  };

  sendCodeBtn.onclick = async () => {
    const email = emailInput.value.trim();
    if (!email || email.indexOf('@') === -1) {
      showAlert('Укажите корректный e-mail адрес', true);
      return;
    }

    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = 'Отправка...';
    hideAlert();

    try {
      const res = await fetch('/api/plugins/mailadmin-password/public/forgot-send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        showAlert(data.message || 'Код подтверждения отправлен на почту', false);
        step1.style.display = 'none';
        step2.style.display = 'block';
        setTimeout(() => codeInput.focus(), 100);
      } else {
        showAlert(data.error || 'Ошибка при отправке кода подтверждения', true);
      }
    } catch (err) {
      showAlert('Сетевая ошибка при запросе кода подтверждения', true);
    } finally {
      sendCodeBtn.disabled = false;
      sendCodeBtn.textContent = 'Получить код';
    }
  };

  resetBtn.onclick = async () => {
    const email = emailInput.value.trim();
    const code = codeInput.value.trim();
    const newPass = newPassInput.value;
    const confirmPass = confirmPassInput.value;

    if (!code) {
      showAlert('Введите 6-значный код подтверждения', true);
      return;
    }
    if (!newPass || newPass.length < 6) {
      showAlert('Пароль должен содержать минимум 6 символов', true);
      return;
    }
    if (newPass !== confirmPass) {
      showAlert('Введенные пароли не совпадают', true);
      return;
    }

    resetBtn.disabled = true;
    resetBtn.textContent = 'Сохранение...';
    hideAlert();

    try {
      const res = await fetch('/api/plugins/mailadmin-password/public/forgot-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          code: code,
          new_password: newPass
        })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        showAlert(data.message || 'Пароль успешно изменен! Теперь вы можете войти.', false);
        resetBtn.style.display = 'none';
        backBtn.style.display = 'none';

        // Автоматически подставляем пароль и логин в форму входа
        const loginUserInput = document.querySelector('input[name="username"], input[type="text"][autocomplete="username"]');
        const loginPassInput = document.querySelector('input[type="password"][autocomplete="current-password"]');
        if (loginUserInput) loginUserInput.value = email;
        if (loginPassInput) loginPassInput.value = newPass;

        setTimeout(() => {
          overlay.remove();
        }, 2200);
      } else {
        showAlert(data.error || 'Ошибка сброса пароля', true);
      }
    } catch (err) {
      showAlert('Сетевая ошибка при сбросе пароля', true);
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = 'Сменить пароль';
    }
  };
}

// Внедрение стилей плагина в head
function injectStyles() {
  if (document.getElementById('mailadmin-password-styles')) return;
  const style = document.createElement('style');
  style.id = 'mailadmin-password-styles';
  style.textContent = `
    .mailadmin-modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      backdrop-filter: blur(4px);
    }
    .mailadmin-modal-dialog {
      width: 90%;
      max-width: 440px;
      background-color: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-card, 8px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      color: var(--text-primary);
    }
    .mailadmin-modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .mailadmin-modal-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .mailadmin-btn-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: 4px;
    }
    .mailadmin-btn-close:hover {
      color: var(--text-primary);
      background-color: var(--bg-item-hover);
    }
    .mailadmin-modal-body {
      padding: 20px;
    }
    .mailadmin-step-hint {
      margin: 0 0 16px 0;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    .mailadmin-form-group {
      margin-bottom: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .mailadmin-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .mailadmin-hint {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.35;
      margin-top: 2px;
    }
    .mailadmin-hint code {
      background-color: var(--bg-surface-elevated, var(--bg-app));
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11px;
      color: var(--text-primary);
    }
    .mailadmin-input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      background-color: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-base, 6px);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .mailadmin-input:focus {
      border-color: var(--primary-accent);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
    }
    .mailadmin-textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      background-color: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-base, 6px);
      color: var(--text-primary);
      font-size: 12.5px;
      font-family: monospace;
      outline: none;
      resize: vertical;
      min-height: 65px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .mailadmin-textarea:focus {
      border-color: var(--primary-accent);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
    }
    .mailadmin-code-input {
      font-family: monospace;
      font-size: 18px;
      letter-spacing: 4px;
      text-align: center;
    }
    .mailadmin-btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 18px;
      background-color: var(--primary-accent);
      border: none;
      border-radius: var(--border-radius-base, 6px);
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s;
      white-space: nowrap;
    }
    .mailadmin-btn-primary:hover {
      background-color: var(--primary-accent-hover);
    }
    .mailadmin-btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .mailadmin-btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      background-color: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-base, 6px);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .mailadmin-btn-secondary:hover {
      background-color: var(--bg-item-hover);
      border-color: var(--primary-accent);
      color: var(--primary-accent);
    }
    .mailadmin-btn-secondary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .mailadmin-actions-row {
      display: flex;
      gap: 10px;
    }
    .mailadmin-alert {
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 16px;
      line-height: 1.4;
    }
    .mailadmin-alert-danger {
      background-color: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
    .mailadmin-alert-success {
      background-color: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #6ee7b7;
    }
    .mailadmin-forgot-link-btn {
      background: none;
      border: none;
      padding: 0;
      color: var(--primary-accent);
      font-size: 13px;
      cursor: pointer;
      text-decoration: underline;
      display: inline-block;
      margin-top: 10px;
    }
    .mailadmin-forgot-link-btn:hover {
      color: var(--primary-accent-hover);
    }

    /* Карточка настроек плагина в панели администратора */
    .mailadmin-config-card {
      background-color: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-base, 8px);
      padding: 22px;
      max-width: 760px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .mailadmin-card-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .mailadmin-section-title {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }
    .mailadmin-section-subtitle {
      font-size: 11.5px;
      color: var(--text-muted);
      margin: 0 0 10px 0;
      line-height: 1.4;
    }
    .mailadmin-form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .mailadmin-form-group.full-width {
      grid-column: 1 / -1;
    }
    .mailadmin-form-group.half-width {
      grid-column: span 1;
    }
    .mailadmin-card-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }
  `;
  document.head.appendChild(style);
}

export default {
  id: 'mailadmin-password',
  name: 'MailAdmin Password Manager',
  version: '1.0.0',

  init(context) {
    injectStyles();

    // 1. Хук экрана входа (ссылка «Забыли пароль?»)
    context.registerHook('auth:login_extra', (authCtx) => {
      return {
        id: 'mailadmin-forgot-password-link',
        label: 'Забыли пароль?',
        onClick: (currentUsername) => {
          openForgotPasswordModal(currentUsername || (authCtx && authCtx.username) || '');
        }
      };
    });

    // 2. Хук настроек безопасности пользователя (блок смены пароля ящика)
    context.registerHook('settings:security_extra', (secCtx) => {
      return {
        id: 'mailadmin-user-change-password-section',
        title: 'Пароль почтового ящика',
        render: () => {
          const userEmail = (secCtx && secCtx.user && secCtx.user.username) || '';
          return `
            <div class="settings-card mailadmin-settings-card" style="margin-top: 20px;">
              <div class="card-header">
                <div class="card-title-row">
                  ${ICONS.key}
                  <span class="card-title">Смена пароля почтового ящика</span>
                </div>
                <div class="card-desc">
                  Смена пароля в корпоративной почтовой системе (MailAdmin / Postfix). После смены используйте новый пароль во всех почтовых программах.
                </div>
              </div>
              <div class="card-body">
                <div id="mailadmin-user-alert" class="mailadmin-alert" style="display: none;"></div>
                <div style="max-width: 380px;">
                  <div class="mailadmin-form-group">
                    <label class="mailadmin-label">Текущий пароль:</label>
                    <input type="password" id="mailadmin-user-prev-pass" class="mailadmin-input" placeholder="••••••••" />
                  </div>
                  <div class="mailadmin-form-group">
                    <label class="mailadmin-label">Новый пароль:</label>
                    <input type="password" id="mailadmin-user-new-pass" class="mailadmin-input" placeholder="••••••••" />
                  </div>
                  <div class="mailadmin-form-group">
                    <label class="mailadmin-label">Повторите новый пароль:</label>
                    <input type="password" id="mailadmin-user-confirm-pass" class="mailadmin-input" placeholder="••••••••" />
                  </div>
                  <button type="button" id="mailadmin-user-submit-btn" class="mailadmin-btn-primary" style="margin-top: 10px;">
                    Обновить пароль почты
                  </button>
                </div>
              </div>
            </div>
          `;
        },
        onMounted: (container) => {
          if (!container) return;
          const submitBtn = container.querySelector('#mailadmin-user-submit-btn');
          const alertBox = container.querySelector('#mailadmin-user-alert');
          const prevInput = container.querySelector('#mailadmin-user-prev-pass');
          const newInput = container.querySelector('#mailadmin-user-new-pass');
          const confirmInput = container.querySelector('#mailadmin-user-confirm-pass');

          if (!submitBtn) return;

          function showMsg(msg, isError) {
            if (!alertBox) return;
            alertBox.textContent = msg;
            alertBox.className = 'mailadmin-alert ' + (isError ? 'mailadmin-alert-danger' : 'mailadmin-alert-success');
            alertBox.style.display = 'block';
          }

          submitBtn.onclick = async () => {
            const prev = prevInput.value;
            const next = newInput.value;
            const conf = confirmInput.value;

            if (!prev || !next) {
              showMsg('Заполните поля текущего и нового паролей', true);
              return;
            }
            if (next.length < 6) {
              showMsg('Новый пароль должен содержать не менее 6 символов', true);
              return;
            }
            if (next !== conf) {
              showMsg('Введенные новые пароли не совпадают', true);
              return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Обновление...';
            if (alertBox) alertBox.style.display = 'none';

            try {
              const res = await fetch('/api/plugins/mailadmin-password/api/user-change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prev_password: prev,
                  new_password: next
                })
              });
              const data = await res.json().catch(() => ({}));

              if (res.ok && data.ok) {
                showMsg(data.message || 'Пароль успешно обновлен!', false);
                prevInput.value = '';
                newInput.value = '';
                confirmInput.value = '';
              } else {
                showMsg(data.error || 'Ошибка при смене пароля', true);
              }
            } catch (err) {
              showMsg('Сетевая ошибка при обращении к серверу', true);
            } finally {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Обновить пароль почты';
            }
          };
        }
      };
    });

    // 3. Хук вкладки настроек плагина в панели администратора (admin:tab)
    context.registerHook('admin:tab', () => {
      return {
        id: 'mailadmin-password-config',
        title: 'Смена паролей (MailAdmin)',
        name: 'Смена паролей (MailAdmin)',
        icon: 'key',
        description: 'Интеграция с MailAdmin REST API для смены и сброса паролей ящиков',
        render: () => {
          return `
            <div class="mailadmin-config-card">
              <div id="mailadmin-cfg-alert" class="mailadmin-alert" style="display: none;"></div>

              <!-- Секция 1: Подключение к API -->
              <div class="mailadmin-card-section">
                <div class="mailadmin-section-title">Подключение к MailAdmin REST API</div>
                <div class="mailadmin-section-subtitle">Параметры интеграции для удаленного изменения паролей почтовых ящиков</div>

                <div class="mailadmin-form-grid">
                  <div class="mailadmin-form-group full-width">
                    <label class="mailadmin-label">MailAdmin API Base URL</label>
                    <input type="text" id="mailadmin-cfg-url" class="mailadmin-input" placeholder="https://mail.company.ru:8080" />
                    <div class="mailadmin-hint">Базовый адрес REST API панели управления почтовыми ящиками (с указанием порта, если используется).</div>
                  </div>

                  <div class="mailadmin-form-group full-width">
                    <label class="mailadmin-label">MailAdmin API Token</label>
                    <input type="password" id="mailadmin-cfg-token" class="mailadmin-input" placeholder="••••••••" autocomplete="off" />
                    <div class="mailadmin-hint">Статический Bearer токен (ma_tk_...), сгенерированный в MailAdmin со scope <code>mailbox:password</code>.</div>
                  </div>
                </div>
              </div>

              <!-- Секция 2: Отправка писем со служебного ящика -->
              <div class="mailadmin-card-section">
                <div class="mailadmin-section-title">Служебный ящик для отправки писем с кодами</div>
                <div class="mailadmin-section-subtitle">Реквизиты учетной записи для авторизованной отправки одноразовых кодов восстановления доступа</div>

                <div class="mailadmin-form-grid">
                  <div class="mailadmin-form-group">
                    <label class="mailadmin-label">Логин служебного ящика (SMTP Login)</label>
                    <input type="text" id="mailadmin-cfg-smtp-user" class="mailadmin-input" placeholder="no-reply@domain.com" />
                    <div class="mailadmin-hint">Адрес отправителя (хост и порт определяются из настроек домена).</div>
                  </div>

                  <div class="mailadmin-form-group">
                    <label class="mailadmin-label">Пароль служебного ящика (SMTP Password)</label>
                    <input type="password" id="mailadmin-cfg-smtp-pass" class="mailadmin-input" placeholder="••••••••" autocomplete="off" />
                    <div class="mailadmin-hint">Пароль служебного ящика для SMTP-аутентификации.</div>
                  </div>
                </div>
              </div>

              <!-- Секция 3: Безопасность и лимиты -->
              <div class="mailadmin-card-section">
                <div class="mailadmin-section-title">Безопасность и ограничения</div>
                <div class="mailadmin-section-subtitle">Черный список ящиков и срок действия кодов подтверждения</div>

                <div class="mailadmin-form-grid">
                  <div class="mailadmin-form-group full-width">
                    <label class="mailadmin-label">Запрещенные ящики (Blacklist)</label>
                    <textarea id="mailadmin-cfg-blacklist" class="mailadmin-textarea" rows="3" placeholder="ceo@domain.com&#10;boss@domain.com&#10;info@domain.com"></textarea>
                    <div class="mailadmin-hint">Список ящиков (по одному на строку), которым ЗАПРЕЩЕНО менять и сбрасывать пароль через WallMail.</div>
                  </div>

                  <div class="mailadmin-form-group half-width">
                    <label class="mailadmin-label">Время жизни кода (мин)</label>
                    <input type="number" id="mailadmin-cfg-ttl" class="mailadmin-input" min="1" max="120" value="15" />
                    <div class="mailadmin-hint">Срок действия 6-значного одноразового кода из письма.</div>
                  </div>
                </div>
              </div>

              <!-- Панель действий -->
              <div class="mailadmin-card-actions">
                <button type="button" id="mailadmin-cfg-save-btn" class="mailadmin-btn-primary">
                  Сохранить настройки
                </button>
                <button type="button" id="mailadmin-cfg-test-btn" class="mailadmin-btn-secondary">
                  Проверить подключение
                </button>
              </div>
            </div>
          `;
        },
        mount: async (container) => {
          if (!container) return;
          const urlInput = container.querySelector('#mailadmin-cfg-url');
          const tokenInput = container.querySelector('#mailadmin-cfg-token');
          const smtpUserInput = container.querySelector('#mailadmin-cfg-smtp-user');
          const smtpPassInput = container.querySelector('#mailadmin-cfg-smtp-pass');
          const blacklistInput = container.querySelector('#mailadmin-cfg-blacklist');
          const ttlInput = container.querySelector('#mailadmin-cfg-ttl');
          const saveBtn = container.querySelector('#mailadmin-cfg-save-btn');
          const testBtn = container.querySelector('#mailadmin-cfg-test-btn');
          const alertBox = container.querySelector('#mailadmin-cfg-alert');

          function showCfgAlert(msg, isError) {
            if (!alertBox) return;
            alertBox.textContent = msg;
            alertBox.className = 'mailadmin-alert ' + (isError ? 'mailadmin-alert-danger' : 'mailadmin-alert-success');
            alertBox.style.display = 'block';
          }

          // Загрузка текущей конфигурации
          try {
            const res = await fetch('/api/plugins/mailadmin-password/api/config');
            if (res.ok) {
              const cfg = await res.json();
              if (urlInput && cfg.mailadmin_url) urlInput.value = cfg.mailadmin_url;
              if (tokenInput && cfg.has_token) tokenInput.value = '********';
              if (smtpUserInput && cfg.smtp_user) smtpUserInput.value = cfg.smtp_user;
              if (smtpPassInput && cfg.has_smtp_password) smtpPassInput.value = '********';
              if (blacklistInput && cfg.blacklisted_emails) blacklistInput.value = cfg.blacklisted_emails;
              if (ttlInput && cfg.code_ttl) ttlInput.value = cfg.code_ttl;
            }
          } catch (e) {}

          // Сохранение
          if (saveBtn) {
            saveBtn.onclick = async () => {
              saveBtn.disabled = true;
              saveBtn.textContent = 'Сохранение...';
              if (alertBox) alertBox.style.display = 'none';

              try {
                const payload = {
                  mailadmin_url: urlInput.value.trim(),
                  blacklisted_emails: blacklistInput.value,
                  code_ttl: parseInt(ttlInput.value, 10) || 15,
                  smtp_user: smtpUserInput.value.trim()
                };
                if (tokenInput.value && tokenInput.value !== '********') {
                  payload.mailadmin_token = tokenInput.value.trim();
                }
                if (smtpPassInput.value && smtpPassInput.value !== '********') {
                  payload.smtp_password = smtpPassInput.value;
                }

                const res = await fetch('/api/plugins/mailadmin-password/api/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.ok) {
                  showCfgAlert(data.message || 'Настройки сохранены!', false);
                } else {
                  showCfgAlert(data.error || 'Ошибка при сохранении настроек', true);
                }
              } catch (e) {
                showCfgAlert('Сетевая ошибка при сохранении', true);
              } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Сохранить';
              }
            };
          }

          // Тест подключения
          if (testBtn) {
            testBtn.onclick = async () => {
              testBtn.disabled = true;
              testBtn.textContent = 'Проверка...';
              if (alertBox) alertBox.style.display = 'none';

              try {
                const res = await fetch('/api/plugins/mailadmin-password/api/test-connection', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    mailadmin_url: urlInput.value.trim(),
                    mailadmin_token: tokenInput.value
                  })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.ok) {
                  showCfgAlert(data.message || 'Связь с MailAdmin API успешно установлена!', false);
                } else {
                  showCfgAlert(data.error || 'Не удалось подключиться к MailAdmin API', true);
                }
              } catch (e) {
                showCfgAlert('Сетевая ошибка при проверке подключения', true);
              } finally {
                testBtn.disabled = false;
                testBtn.textContent = 'Проверить подключение';
              }
            };
          }
        },
        onMounted: function(container) {
          return this.mount(container);
        }
      };
    });
  }
};
