(rl => {
	'use strict';

	/**
	 * Внедрение кнопки "Забыли пароль?" в официальный контейнер SnappyMail (#plugin-Login-BottomControlGroup)
	 */
	addEventListener('rl-view-model', e => {
		if (e.detail && 'Login' === e.detail.viewModelTemplateID) {
			const container = e.detail.viewModelDom.querySelector('#plugin-Login-BottomControlGroup') || e.detail.viewModelDom.querySelector('.form-login');
			if (container && !document.getElementById('mailadmin-forgot-password-link')) {
				const linkDiv = document.createElement('div');
				linkDiv.className = 'controls mailadmin-forgot-wrapper';
				linkDiv.style.cssText = 'margin-top: 12px; text-align: center;';
				linkDiv.innerHTML = '<a href="#" id="mailadmin-forgot-password-link" class="mailadmin-forgot-link" style="color: #0066cc; text-decoration: underline; font-size: 0.9em; cursor: pointer;">Забыли пароль?</a>';

				container.appendChild(linkDiv);

				const forgotLink = document.getElementById('mailadmin-forgot-password-link');
				if (forgotLink) {
					forgotLink.addEventListener('click', function (evt) {
						evt.preventDefault();
						openMailAdminModal();
					});
				}
			}
		}

		if (e.detail && 'SettingsSecurity' === e.detail.viewModelTemplateID) {
			attachUserChangePasswordBlock(e.detail.viewModelDom);
		}
	});

	function openMailAdminModal() {
		let existingModal = document.getElementById('mailadmin-forgot-modal');
		if (existingModal) {
			existingModal.style.display = 'flex';
			return;
		}

		const modalHtml = `
			<div id="mailadmin-forgot-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 99999;">
				<div style="width: 90%; max-width: 440px; background: var(--dropdown-menu-bg-color, #ffffff); color: var(--dropdown-menu-color, #333333); border-radius: var(--login-border-radius, 6px); padding: 25px; box-shadow: 0 15px 35px rgba(0,0,0,0.6);">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
						<h3 style="margin: 0; font-size: 1.2rem; color: inherit;">Восстановление пароля</h3>
						<a href="#" class="mailadmin-modal-close" style="font-size: 1.5rem; text-decoration: none; color: inherit; opacity: 0.7;">&times;</a>
					</div>
					
					<div id="mailadmin-msg" style="display:none; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 0.9rem;"></div>
					
					<!-- Шаг 1: Запрос кода -->
					<div id="mailadmin-step-1">
						<p style="margin: 0 0 15px 0; font-size: 0.95rem; color: inherit; opacity: 0.9;">Введите ваш e-mail для получения кода подтверждения или ссылки для сброса пароля.</p>
						<div style="margin-bottom: 15px;">
							<label style="display: block; margin-bottom: 5px; font-size: 0.9rem; color: inherit;">E-mail адрес:</label>
							<input type="email" id="mailadmin-input-email" class="uiInput" placeholder="user@domain.com" style="width: 100%; box-sizing: border-box;" />
						</div>
						<a href="#" id="mailadmin-btn-send-code" class="btn btn-success" style="display: block; text-align: center; box-sizing: border-box;">Получить код</a>
					</div>

					<!-- Шаг 2: Ввод кода и нового пароля -->
					<div id="mailadmin-step-2" style="display:none;">
						<p style="margin: 0 0 15px 0; font-size: 0.95rem; color: inherit; opacity: 0.9;">Код отправлен на вашу почту. Введите код и задайте новый пароль.</p>
						<div style="margin-bottom: 12px;">
							<label style="display: block; margin-bottom: 5px; font-size: 0.9rem; color: inherit;">Код (6 цифр):</label>
							<input type="text" id="mailadmin-input-code" class="uiInput" placeholder="123456" maxlength="6" style="width: 100%; box-sizing: border-box;" />
						</div>
						<div style="margin-bottom: 12px;">
							<label style="display: block; margin-bottom: 5px; font-size: 0.9rem; color: inherit;">Новый пароль:</label>
							<input type="password" id="mailadmin-input-pass" class="uiInput" placeholder="••••••••" style="width: 100%; box-sizing: border-box;" />
						</div>
						<div style="margin-bottom: 15px;">
							<label style="display: block; margin-bottom: 5px; font-size: 0.9rem; color: inherit;">Подтвердите пароль:</label>
							<input type="password" id="mailadmin-input-pass-confirm" class="uiInput" placeholder="••••••••" style="width: 100%; box-sizing: border-box;" />
						</div>
						<div style="display: flex; gap: 10px;">
							<a href="#" id="mailadmin-btn-reset" class="btn btn-success" style="flex: 1; text-align: center;">Сменить пароль</a>
							<a href="#" id="mailadmin-btn-back" class="btn" style="flex: 1; text-align: center;">Назад</a>
						</div>
					</div>
				</div>
			</div>
		`;

		document.body.insertAdjacentHTML('beforeend', modalHtml);

		const modal = document.getElementById('mailadmin-forgot-modal');
		const closeBtn = modal.querySelector('.mailadmin-modal-close');
		const sendBtn = document.getElementById('mailadmin-btn-send-code');
		const resetBtn = document.getElementById('mailadmin-btn-reset');
		const backBtn = document.getElementById('mailadmin-btn-back');

		closeBtn.onclick = function () {
			modal.style.display = 'none';
		};

		backBtn.onclick = function () {
			showStep(1);
		};

		const loginEmailInput = document.querySelector('input[name="Email"], input[type="email"]');
		if (loginEmailInput && loginEmailInput.value) {
			document.getElementById('mailadmin-input-email').value = loginEmailInput.value;
		}

		sendBtn.onclick = function () {
			const email = document.getElementById('mailadmin-input-email').value.trim();
			if (!email) {
				showMessage('Укажите e-mail адрес', 'error');
				return;
			}

			sendBtn.disabled = true;
			sendBtn.innerText = 'Отправка...';

			const baseUrl = window.location.origin + window.location.pathname;

			sendAjax('MailAdminForgotPasswordSendCode', {
				'email': email,
				'baseUrl': baseUrl
			}, function (res) {
				sendBtn.disabled = false;
				sendBtn.innerText = 'Получить код';
				if (res && res.success) {
					showMessage(res.message, 'success');
					showStep(2);
				} else {
					showMessage(res ? res.message : 'Ошибка отправки запроса', 'error');
				}
			});
		};

		resetBtn.onclick = function () {
			const email = document.getElementById('mailadmin-input-email').value.trim();
			const code = document.getElementById('mailadmin-input-code').value.trim();
			const pass = document.getElementById('mailadmin-input-pass').value;
			const passConfirm = document.getElementById('mailadmin-input-pass-confirm').value;

			if (!code || !pass) {
				showMessage('Заполните все поля', 'error');
				return;
			}

			if (pass !== passConfirm) {
				showMessage('Пароли не совпадают', 'error');
				return;
			}

			resetBtn.disabled = true;
			resetBtn.innerText = 'Сохранение...';

			sendAjax('MailAdminForgotPasswordReset', {
				'email': email,
				'code': code,
				'new_password': pass
			}, function (res) {
				resetBtn.disabled = false;
				resetBtn.innerText = 'Сменить пароль';
				if (res && res.success) {
					showMessage(res.message, 'success');
					setTimeout(function () {
						modal.style.display = 'none';
					}, 2500);
				} else {
					showMessage(res ? res.message : 'Ошибка при сбросе пароля', 'error');
				}
			});
		};
	}

	function attachUserChangePasswordBlock(dom) {
		if (document.getElementById('mailadmin-user-change-pass-block')) {
			return;
		}

		const container = dom || document.querySelector('.settings-security, .b-settings-security');
		if (!container) return;

		const blockHtml = `
			<div id="mailadmin-user-change-pass-block" style="margin-top: 25px; padding-top: 15px; border-top: 1px solid var(--dialog-border-clr, #e1e8ed);">
				<h3 style="font-size: 1.1rem; margin-bottom: 12px; color: inherit;">Смена пароля почты</h3>
				<div id="mailadmin-user-msg" style="display:none; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 0.9rem;"></div>
				<div style="max-width: 320px; margin-bottom: 12px;">
					<label style="display: block; margin-bottom: 5px; font-size: 0.9rem; color: inherit;">Текущий пароль:</label>
					<input type="password" id="mailadmin-user-prev-pass" class="uiInput" placeholder="••••••••" style="width: 100%; box-sizing: border-box;" />
				</div>
				<div style="max-width: 320px; margin-bottom: 12px;">
					<label style="display: block; margin-bottom: 5px; font-size: 0.9rem; color: inherit;">Новый пароль:</label>
					<input type="password" id="mailadmin-user-new-pass" class="uiInput" placeholder="••••••••" style="width: 100%; box-sizing: border-box;" />
				</div>
				<div style="margin-top: 15px;">
					<a href="#" id="mailadmin-user-btn-save" class="btn btn-success">Обновить пароль</a>
				</div>
			</div>
		`;

		container.insertAdjacentHTML('beforeend', blockHtml);

		const saveBtn = document.getElementById('mailadmin-user-btn-save');
		saveBtn.onclick = function () {
			const prevPass = document.getElementById('mailadmin-user-prev-pass').value;
			const newPass = document.getElementById('mailadmin-user-new-pass').value;
			const msgBox = document.getElementById('mailadmin-user-msg');

			if (!prevPass || !newPass) {
				msgBox.innerText = 'Заполните поля текущего и нового паролей.';
				msgBox.className = 'mailadmin-alert alert-danger';
				msgBox.style.display = 'block';
				return;
			}

			saveBtn.disabled = true;
			saveBtn.innerText = 'Сохранение...';

			sendAjax('MailAdminUserChangePassword', {
				'prev_password': prevPass,
				'new_password': newPass
			}, function (res) {
				saveBtn.disabled = false;
				saveBtn.innerText = 'Обновить пароль';
				if (res && res.success) {
					msgBox.innerText = res.message;
					msgBox.className = 'mailadmin-alert alert-success';
					msgBox.style.display = 'block';
					document.getElementById('mailadmin-user-prev-pass').value = '';
					document.getElementById('mailadmin-user-new-pass').value = '';
				} else {
					msgBox.innerText = res ? res.message : 'Ошибка смены пароля';
					msgBox.className = 'mailadmin-alert alert-danger';
					msgBox.style.display = 'block';
				}
			});
		};
	}

	function showStep(step) {
		document.getElementById('mailadmin-step-1').style.display = (step === 1) ? 'block' : 'none';
		document.getElementById('mailadmin-step-2').style.display = (step === 2) ? 'block' : 'none';
		hideMessage();
	}

	function showMessage(msg, type) {
		const box = document.getElementById('mailadmin-msg');
		if (box) {
			box.innerText = msg;
			box.className = 'mailadmin-alert ' + (type === 'error' ? 'alert-danger' : 'alert-success');
			box.style.display = 'block';
		}
	}

	function hideMessage() {
		const box = document.getElementById('mailadmin-msg');
		if (box) {
			box.style.display = 'none';
		}
	}

	// Проверка на наличие параметров сброса пароля в URL
	function checkUrlForReset() {
		const urlParams = new URLSearchParams(window.location.search);
		const resetEmail = urlParams.get('reset_email');
		const resetCode = urlParams.get('reset_code');
		
		if (resetEmail && resetCode) {
			// Открываем модалку
			openMailAdminModal();
			
			// Заполняем поля
			const emailInput = document.getElementById('mailadmin-input-email');
			const codeInput = document.getElementById('mailadmin-input-code');
			if (emailInput && codeInput) {
				emailInput.value = resetEmail;
				codeInput.value = resetCode;
			}
			
			// Сразу показываем шаг 2
			showStep(2);
			
			// Очищаем URL, чтобы при обновлении страницы окно не открывалось снова
			if (window.history.replaceState) {
				const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
				window.history.replaceState({path: cleanUrl}, '', cleanUrl);
			}
		}
	}

	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		setTimeout(checkUrlForReset, 600);
	} else {
		window.addEventListener('DOMContentLoaded', checkUrlForReset);
		window.addEventListener('load', checkUrlForReset);
	}

	function sendAjax(actionName, data, callback) {
		// Для публичных экшенов (экран логина) используем fetch GET
		if (actionName === 'MailAdminForgotPasswordSendCode' || actionName === 'MailAdminForgotPasswordReset') {
			const actionKey = actionName === 'MailAdminForgotPasswordSendCode' ? 'send_code' : 'reset';
			
			let urlParams = new URLSearchParams();
			for (let k in data) {
				urlParams.append(k, data[k]);
			}
			
			window.fetch('./?mailadmin_action=' + actionKey + '&' + urlParams.toString(), {
				method: 'GET'
			})
			.then(function(response) {
				if (!response.ok) {
					throw new Error('Network error');
				}
				return response.json();
			})
			.then(function(res) {
				callback(res);
			})
			.catch(function(error) {
				callback({ success: false, message: 'Ошибка сети или разбора ответа сервера' });
			});
		} else {
			// Для авторизованных экшенов (настройки) используем ядро SnappyMail
			if (window.rl && window.rl.pluginRemoteRequest) {
				window.rl.pluginRemoteRequest(function (iError, oData) {
					if (iError) {
						callback({ success: false, message: 'Ошибка сервера (код ' + iError + ')' });
					} else {
						callback(oData.Result || oData);
					}
				}, actionName, data);
			} else {
				callback({ success: false, message: 'Внутренняя ошибка клиента: pluginRemoteRequest не найден' });
			}
		}
	}

})(window.rl || {});
console.log('MailAdmin JS Loaded'); 
