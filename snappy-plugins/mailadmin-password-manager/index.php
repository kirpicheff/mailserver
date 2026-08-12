<?php

class MailadminPasswordManagerPlugin extends \RainLoop\Plugins\AbstractPlugin
{
	const
		NAME        = 'MailAdmin Password Manager',
		AUTHOR      = 'kirpicheff',
		VERSION     = '1.0.0',
		RELEASE     = '2026-08-11',
		REQUIRED    = '2.0.0',
		CATEGORY    = 'Security',
		DESCRIPTION = 'Плагин для смены пароля из настроек почты и сброса пароля с экрана логина через MailAdmin API.';

	private string $sMailAdminUrl = '';
	private string $sMailAdminApiToken = '';
	private string $sMailAdminUser = '';
	private string $sMailAdminPassword = '';
	private string $sBlacklistedEmails = '';
	private int $iCodeTtl = 15;

	public function Supported(): string
	{
		return '';
	}

	public function Init(): void
	{
		$this->sMailAdminUrl = \rtrim($this->Config()->Get('plugin', 'mailadmin_url', ''), '/');
		$this->sMailAdminApiToken = \trim($this->Config()->Get('plugin', 'mailadmin_api_token', ''));
		$this->sMailAdminUser = $this->Config()->Get('plugin', 'mailadmin_user', '');
		$this->sMailAdminPassword = $this->Config()->Get('plugin', 'mailadmin_password', '');
		$this->sBlacklistedEmails = $this->Config()->Get('plugin', 'blacklisted_emails', '');
		$this->iCodeTtl = (int) $this->Config()->Get('plugin', 'code_ttl', 15);

		// Обработка публичных AJAX запросов через fetch API (в обход XHR перехватчика)
		if (isset($_GET['mailadmin_action'])) {
			\header('Content-Type: application/json; charset=utf-8');
			if ($_GET['mailadmin_action'] === 'send_code') {
				echo \json_encode($this->ActionForgotPasswordSendCodePublic());
				exit;
			}
			if ($_GET['mailadmin_action'] === 'reset') {
				echo \json_encode($this->ActionForgotPasswordResetPublic());
				exit;
			}
		}

		// Фронтенд ресурсы
		$this->addJs('js/mailadmin_v5.js');
		$this->addCss('css/include_v2.css');

		// Хуки для смены пароля в настройках авторизованного пользователя
		$this->addJsonHook('MailAdminUserChangePassword', 'ActionUserChangePassword');
	}

	protected function configMapping(): array
	{
		return [
			\RainLoop\Plugins\Property::NewInstance('mailadmin_url')
				->SetLabel('MailAdmin API Base URL')
				->SetDescription('Пример: https://mailadmin.example.com или http://127.0.0.1:8080')
				->SetDefaultValue('http://127.0.0.1:8080'),

			\RainLoop\Plugins\Property::NewInstance('mailadmin_api_token')
				->SetLabel('MailAdmin API Token')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::PASSWORD)
				->SetDescription('Статический API токен (ma_tk_...). Если указан, логин и пароль ниже будут проигнорированы.'),

			\RainLoop\Plugins\Property::NewInstance('mailadmin_user')
				->SetLabel('MailAdmin Username (Fallback)')
				->SetDescription('Логин администратора (если токен не используется)')
				->SetDefaultValue('admin@example.com'),

			\RainLoop\Plugins\Property::NewInstance('mailadmin_password')
				->SetLabel('MailAdmin Password (Fallback)')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::PASSWORD)
				->SetDescription('Пароль администратора MailAdmin'),

			\RainLoop\Plugins\Property::NewInstance('blacklisted_emails')
				->SetLabel('Запрещенные ящики (Blacklist)')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::STRING_TEXT)
				->SetDescription('Список email ящиков, которым ЗАПРЕЩЕНО менять и сбрасывать пароль (по одному на строку)'),

			\RainLoop\Plugins\Property::NewInstance('code_ttl')
				->SetLabel('Время жизни кода (мин)')
				->SetType(\RainLoop\Enumerations\PluginPropertyType::INT)
				->SetDescription('Время действия одноразового кода подтверждения в минутах')
				->SetDefaultValue(15),
		];
	}

	/**
	 * Проверка, находится ли email в списке запрещенных
	 */
	private function isEmailBlacklisted(string $sEmail): bool
	{
		$sEmail = \mb_strtolower(\trim($sEmail));
		if (empty($sEmail)) {
			return true;
		}

		$aLines = \explode("\n", $this->sBlacklistedEmails);
		foreach ($aLines as $sLine) {
			$sLine = \mb_strtolower(\trim($sLine));
			if (!empty($sLine) && $sLine === $sEmail) {
				return true;
			}
		}

		return false;
	}

	/**
	 * AJAX: Генерация и отправка одноразового кода на почтовый ящик
	 */
	public function ActionForgotPasswordSendCodePublic(): array
	{
		$sEmail = \trim((string) ($_GET['email'] ?? ''));

		if (empty($sEmail) || !\filter_var($sEmail, FILTER_VALIDATE_EMAIL)) {
			return [
				'success' => false,
				'message' => 'Укажите корректный e-mail адрес.'
			];
		}

		if ($this->isEmailBlacklisted($sEmail)) {
			return [
				'success' => false,
				'message' => 'Смена пароля запрещена для данного почтового ящика.'
			];
		}

		$sSessionKey = 'mailadmin_reset_' . \md5(\mb_strtolower($sEmail));
		$sTmpFile = APP_PRIVATE_DATA . 'cache/' . $sSessionKey . '.json';

		// Rate limit: 1 запрос в минуту
		if (\file_exists($sTmpFile)) {
			if (\time() - \filemtime($sTmpFile) < 60) {
				return [
					'success' => false,
					'message' => 'Пожалуйста, подождите 1 минуту перед повторным запросом кода.'
				];
			}
		}

		// Генерация 6-значного кода
		$sCode = (string) \random_int(100000, 999999);
		$iExpires = \time() + ($this->iCodeTtl * 60);

		// Сохраняем код во временный файл (надежнее, чем сессии до инициализации ядра)
		$sSessionKey = 'mailadmin_reset_' . \md5(\mb_strtolower($sEmail));
		$sTmpFile = APP_PRIVATE_DATA . 'cache/' . $sSessionKey . '.json';
		\file_put_contents($sTmpFile, \json_encode([
			'code' => $sCode,
			'expires' => $iExpires,
			'email' => $sEmail,
			'attempts' => 0
		]));

		$sBaseUrl = \trim((string) ($_GET['baseUrl'] ?? ''));
		$sLink = '';
		if (!empty($sBaseUrl)) {
			$sLink = $sBaseUrl . '?reset_email=' . \urlencode($sEmail) . '&reset_code=' . \urlencode($sCode);
		}

		// Отправка письма с кодом подтверждения и ссылкой
		$bSent = $this->sendResetEmail($sEmail, $sCode, $sLink);

		if (!$bSent) {
			return [
				'success' => false,
				'message' => 'Не удалось отправить письмо с кодом подтверждения. Обратитесь к администратору.'
			];
		}

		return [
			'success' => true,
			'message' => 'Код подтверждения отправлен на вашу почту. Проверьте ваш почтовый клиент.'
		];
	}

	/**
	 * AJAX: Валидация кода и сброс пароля
	 */
	public function ActionForgotPasswordResetPublic(): array
	{
		$sEmail = \trim((string) ($_GET['email'] ?? ''));
		$sCode = \trim((string) ($_GET['code'] ?? ''));
		$sNewPassword = (string) ($_GET['new_password'] ?? '');

		if (empty($sEmail) || empty($sCode) || empty($sNewPassword)) {
			return [
				'success' => false,
				'message' => 'Заполните все обязательные поля.'
			];
		}

		if ($this->isEmailBlacklisted($sEmail)) {
			return [
				'success' => false,
				'message' => 'Смена пароля запрещена для данного почтового ящика.'
			];
		}

		$sSessionKey = 'mailadmin_reset_' . \md5(\mb_strtolower($sEmail));
		$sTmpFile = APP_PRIVATE_DATA . 'cache/' . $sSessionKey . '.json';
		$aData = null;
		if (\file_exists($sTmpFile)) {
			$aData = \json_decode(\file_get_contents($sTmpFile), true);
		}

		if (empty($aData) || !is_array($aData)) {
			return [
				'success' => false,
				'message' => 'Код подтверждения не найден или устарел. Запросите код повторно.'
			];
		}

		if (\time() > $aData['expires']) {
			if (\file_exists($sTmpFile)) {
				\unlink($sTmpFile);
			}
			return [
				'success' => false,
				'message' => 'Срок действия кода подтверждения истек.'
			];
		}

		if ($aData['code'] !== $sCode || \mb_strtolower($aData['email']) !== \mb_strtolower($sEmail)) {
			// Защита от брутфорса
			$iAttempts = ($aData['attempts'] ?? 0) + 1;
			if ($iAttempts >= 3) {
				if (\file_exists($sTmpFile)) {
					\unlink($sTmpFile);
				}
				return [
					'success' => false,
					'message' => 'Слишком много неверных попыток. Запросите код заново.'
				];
			}
			
			$aData['attempts'] = $iAttempts;
			\file_put_contents($sTmpFile, \json_encode($aData));

			return [
				'success' => false,
				'message' => 'Неверный код подтверждения. Осталось попыток: ' . (3 - $iAttempts)
			];
		}

		// Вызов MailAdmin API для обновления пароля
		$aUpdateResult = $this->updatePasswordViaMailAdmin($sEmail, $sNewPassword);

		if (!empty($aUpdateResult['success'])) {
			if (\file_exists($sTmpFile)) {
				\unlink($sTmpFile);
			}
			return [
				'success' => true,
				'message' => 'Пароль успешно изменен! Теперь вы можете войти с новым паролем.'
			];
		}

		return [
			'success' => false,
			'message' => $aUpdateResult['message'] ?? 'Ошибка при обновлении пароля через MailAdmin API.'
		];
	}

	/**
	 * AJAX: Смена пароля авторизованным пользователем из настроек
	 */
	public function ActionUserChangePassword(): array
	{
		$oActions = $this->Manager()->Actions();
		$oAccount = $oActions->GetAccount();

		if (!$oAccount || !$oAccount->Email()) {
			return $this->jsonResponse(__FUNCTION__, [
				'success' => false,
				'message' => 'Необходима авторизация.'
			]);
		}

		$sEmail = $oAccount->Email();
		$sPrevPassword = (string) $this->jsonParam('prev_password');
		$sNewPassword = (string) $this->jsonParam('new_password');

		if ($this->isEmailBlacklisted($sEmail)) {
			return $this->jsonResponse(__FUNCTION__, [
				'success' => false,
				'message' => 'Смена пароля запрещена администратором для данного почтового ящика.'
			]);
		}

		if (empty($sPrevPassword) || empty($sNewPassword)) {
			return $this->jsonResponse(__FUNCTION__, [
				'success' => false,
				'message' => 'Укажите текущий и новый пароль.'
			]);
		}

		if ($sPrevPassword !== $oAccount->IncPassword()) {
			return $this->jsonResponse(__FUNCTION__, [
				'success' => false,
				'message' => 'Текущий пароль указан неверно.'
			]);
		}

		// Вызов MailAdmin API для обновления пароля
		$aUpdateResult = $this->updatePasswordViaMailAdmin($sEmail, $sNewPassword);
		if (!empty($aUpdateResult['success'])) {
			return $this->jsonResponse(__FUNCTION__, [
				'success' => true,
				'message' => 'Пароль успешно обновлен.'
			]);
		}

		return $this->jsonResponse(__FUNCTION__, [
			'success' => false,
			'message' => $aUpdateResult['message'] ?? 'Ошибка смены пароля через MailAdmin API.'
		]);
	}

	/**
	 * Авторизация в MailAdmin API и замена пароля ящика
	 */
	private function updatePasswordViaMailAdmin(string $sEmail, string $sNewPassword): array
	{
		if (empty($this->sMailAdminUrl)) {
			return ['success' => false, 'message' => 'URL MailAdmin не настроен.'];
		}

		// Новый и безопасный способ через API Token (в 1 запрос)
		if (!empty($this->sMailAdminApiToken)) {
			$sPatchUrl = $this->sMailAdminUrl . '/api/mailboxes/' . \urlencode($sEmail) . '/password';
			$aHeaders = [
				'Authorization: Bearer ' . $this->sMailAdminApiToken,
				'Content-Type: application/json'
			];
			$aPatchBody = [
				'password' => $sNewPassword
			];
			$aResult = $this->httpRequestJson('PATCH', $sPatchUrl, $aPatchBody, $aHeaders);

			if (isset($aResult['message']) && $aResult['message'] === 'password updated') {
				return ['success' => true];
			}
			$sErr = $aResult['error'] ?? $aResult['message'] ?? \json_encode($aResult);
			return ['success' => false, 'message' => 'Ошибка смены пароля по токену: ' . $sErr];
		}

		// Старый способ (через логин и пароль администратора)
		if (empty($this->sMailAdminUser) || empty($this->sMailAdminPassword)) {
			return ['success' => false, 'message' => 'Плагин не настроен. Укажите API Токен или логин/пароль.'];
		}

		// Step 1: Login to MailAdmin API -> GET JWT Token
		$sLoginUrl = $this->sMailAdminUrl . '/api/auth/login';
		$aLoginBody = [
			'username' => $this->sMailAdminUser,
			'password' => $this->sMailAdminPassword
		];

		$aResponse = $this->httpPostJson($sLoginUrl, $aLoginBody);
		if (empty($aResponse['access_token'])) {
			$sErr = $aResponse['error'] ?? 'Не удалось получить токен авторизации MailAdmin API.';
			return ['success' => false, 'message' => 'Ошибка авторизации API: ' . $sErr];
		}

		$sAccessToken = $aResponse['access_token'];

		// Step 2: Получаем текущие данные ящика, чтобы не затереть их при PUT
		$aHeaders = [
			'Authorization: Bearer ' . $sAccessToken,
			'Content-Type: application/json'
		];

		$sGetUrl = $this->sMailAdminUrl . '/api/mailboxes?search=' . \urlencode($sEmail);
		$aGetResult = $this->httpRequestJson('GET', $sGetUrl, [], $aHeaders);

		if (empty($aGetResult) || !is_array($aGetResult) || empty($aGetResult[0]['username'])) {
			$sGetErr = $aGetResult['error'] ?? $aGetResult['message'] ?? \json_encode($aGetResult);
			return ['success' => false, 'message' => 'Ящик не найден в MailAdmin. Ответ API: ' . $sGetErr];
		}

		$aMailbox = $aGetResult[0];

		// Подготавливаем данные для PUT (оставляем текущие значения, меняем только пароль)
		$aUpdateBody = [
			'password' => $sNewPassword,
			'name' => $aMailbox['name'] ?? '',
			'quota' => $aMailbox['quota'] ?? 0,
			'active' => $aMailbox['active'] ?? true,
			'phone' => $aMailbox['phone'] ?? '',
			'email_other' => $aMailbox['email_other'] ?? ''
		];

		// Step 3: PUT /api/mailboxes/:username
		$sMailboxUrl = $this->sMailAdminUrl . '/api/mailboxes/' . \urlencode($sEmail);
		$aResult = $this->httpRequestJson('PUT', $sMailboxUrl, $aUpdateBody, $aHeaders);

		$bUpdated = isset($aResult['username']) || isset($aResult['name']) || isset($aResult['quota']) || (isset($aResult['code']) && $aResult['code'] === 200) || (isset($aResult['success']) && $aResult['success'] === true);
		if ($bUpdated) {
			return ['success' => true];
		}
		
		$sApiError = $aResult['error'] ?? $aResult['message'] ?? \json_encode($aResult);
		return ['success' => false, 'message' => 'Ошибка MailAdmin API при сохранении: ' . $sApiError];
	}

	/**
	 * Отправка писем с кодом восстановления
	 */
	private function sendResetEmail(string $sEmail, string $sCode, string $sLink = ''): bool
	{
		try {
			$sSubject = 'Код сброса пароля';
		
			$sMessage = "Здравствуйте!\n\n"
				. "Вы запросили сброс пароля для почтового ящика {$sEmail}.\n\n"
				. "Ваш код подтверждения: {$sCode}\n\n";

			if (!empty($sLink)) {
				$sMessage .= "Или перейдите по ссылке для быстрого сброса:\n"
					. "{$sLink}\n\n";
			}

			$sMessage .= "Код действителен в течение {$this->iCodeTtl} минут.\n"
				. "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.\n";

			$sDomain = \substr(\strrchr($sEmail, "@"), 1);
			$sHeaders = "From: MailAdmin Password Reset <no-reply@" . $sDomain . ">\r\n" .
				"Content-Type: text/plain; charset=UTF-8\r\n" .
				"X-Mailer: SnappyMail Plugin";

			return \mail($sEmail, $sSubject, $sMessage, $sHeaders);
		} catch (\Throwable $e) {
			return false;
		}
	}

	/**
	 * Вспомогательный метод HTTP POST JSON
	 */
	private function httpPostJson(string $sUrl, array $aData): array
	{
		return $this->httpRequestJson('POST', $sUrl, $aData, ['Content-Type: application/json']);
	}

	/**
	 * Вспомогательный метод выполнения HTTP запросов c cURL
	 */
	private function httpRequestJson(string $sMethod, string $sUrl, array $aData, array $aHeaders = []): array
	{
		$oCurl = \curl_init();
		\curl_setopt($oCurl, CURLOPT_URL, $sUrl);
		\curl_setopt($oCurl, CURLOPT_CUSTOMREQUEST, $sMethod);
		\curl_setopt($oCurl, CURLOPT_POSTFIELDS, \json_encode($aData));
		\curl_setopt($oCurl, CURLOPT_RETURNTRANSFER, true);
		\curl_setopt($oCurl, CURLOPT_HTTPHEADER, $aHeaders);
		\curl_setopt($oCurl, CURLOPT_TIMEOUT, 10);
		\curl_setopt($oCurl, CURLOPT_SSL_VERIFYPEER, false);
		\curl_setopt($oCurl, CURLOPT_SSL_VERIFYHOST, false);

		$sResult = \curl_exec($oCurl);
		$iHttpCode = \curl_getinfo($oCurl, CURLINFO_HTTP_CODE);
		\curl_close($oCurl);

		if ($sResult === false) {
			return ['error' => 'cURL connection error'];
		}

		$aDecoded = \json_decode($sResult, true);
		if (!\is_array($aDecoded)) {
			$aDecoded = ['code' => $iHttpCode, 'success' => ($iHttpCode >= 200 && $iHttpCode < 300)];
		}

		return $aDecoded;
	}
}
