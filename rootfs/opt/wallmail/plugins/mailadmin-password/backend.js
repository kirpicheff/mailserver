/**
 * Серверный скрипт плагина «MailAdmin Password Manager» для WallMail.
 * Выполняется в изолированной песочнице Goja.
 */

// Инициализация таблицы конфигурации плагина
wallmail.db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_mailadmin_password_config (
        key TEXT PRIMARY KEY,
        val TEXT
    )
`);

// Инициализация таблицы кодов подтверждения сброса пароля
wallmail.db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_mailadmin_password_codes (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )
`);

// Вспомогательные функции работы с конфигурацией
function getConfig(key, defaultVal) {
    var rows = wallmail.db.query("SELECT val FROM plugin_mailadmin_password_config WHERE key = ? LIMIT 1", key);
    if (rows && rows.length > 0 && rows[0].val !== null && rows[0].val !== undefined) {
        return rows[0].val;
    }
    return defaultVal;
}

function setConfig(key, val) {
    var strVal = (val === null || val === undefined) ? "" : String(val);
    wallmail.db.exec(`
        INSERT INTO plugin_mailadmin_password_config (key, val)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET val = excluded.val
    `, key, strVal);
}

// Проверка e-mail на нахождение в черном списке
function isEmailBlacklisted(email, blacklistStr) {
    if (!email) return true;
    var cleanEmail = email.toLowerCase().trim();
    if (!blacklistStr) return false;

    var lines = blacklistStr.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].toLowerCase().trim();
        if (line && line === cleanEmail) {
            return true;
        }
    }
    return false;
}

// Вызов MailAdmin REST API для смены пароля ящика
function updatePasswordInMailAdmin(apiUrl, apiToken, email, newPassword) {
    var cleanUrl = (apiUrl || "").trim().replace(/\/+$/, "");
    var cleanToken = (apiToken || "").trim();

    if (!cleanUrl) {
        return { ok: false, error: "Не настроен URL MailAdmin API" };
    }
    if (!cleanToken) {
        return { ok: false, error: "Не настроен API-токен MailAdmin" };
    }

    var patchUrl = cleanUrl + "/api/mailboxes/" + encodeURIComponent(email) + "/password";
    try {
        var resp = wallmail.http.fetch(patchUrl, {
            method: "PATCH",
            headers: {
                "Authorization": "Bearer " + cleanToken,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ password: newPassword })
        });

        if (!resp) {
            return { ok: false, error: "Нет ответа от MailAdmin API" };
        }

        var parsed = null;
        try {
            parsed = JSON.parse(resp.body);
        } catch (e) {
            parsed = { raw: resp.body };
        }

        if (resp.ok || (parsed && (parsed.message === "password updated" || parsed.success === true))) {
            return { ok: true };
        }

        var errMsg = (parsed && (parsed.error || parsed.message)) || resp.body || ("HTTP " + resp.status);
        return { ok: false, error: "Ошибка MailAdmin API: " + errMsg };
    } catch (err) {
        return { ok: false, error: "Сетевая ошибка при обращении к MailAdmin API: " + err.message };
    }
}

// 1. Сохранение конфигурации плагина (POST /config)
wallmail.api.handle('POST', '/config', function(req) {
    var b = req.body || {};

    if (b.mailadmin_url !== undefined) setConfig('mailadmin_url', b.mailadmin_url.trim());
    if (b.mailadmin_token !== undefined && b.mailadmin_token !== '********') {
        setConfig('mailadmin_token', b.mailadmin_token.trim());
    }
    if (b.blacklisted_emails !== undefined) setConfig('blacklisted_emails', b.blacklisted_emails);
    if (b.code_ttl !== undefined) {
        var ttl = parseInt(b.code_ttl, 10);
        if (isNaN(ttl) || ttl <= 0) ttl = 15;
        setConfig('code_ttl', ttl);
    }
    if (b.smtp_user !== undefined) setConfig('smtp_user', b.smtp_user.trim());
    if (b.smtp_password !== undefined && b.smtp_password !== '********') {
        setConfig('smtp_password', b.smtp_password);
    }

    return {
        status: 200,
        body: { ok: true, message: "Настройки плагина успешно сохранены" }
    };
});

// 2. Получение конфигурации плагина (GET /config)
wallmail.api.handle('GET', '/config', function(req) {
    var token = getConfig('mailadmin_token', '');
    var smtpPass = getConfig('smtp_password', '');

    return {
        status: 200,
        body: {
            mailadmin_url: getConfig('mailadmin_url', ''),
            has_token: !!token,
            mailadmin_token: token ? '********' : '',
            blacklisted_emails: getConfig('blacklisted_emails', ''),
            code_ttl: parseInt(getConfig('code_ttl', 15), 10) || 15,
            smtp_user: getConfig('smtp_user', ''),
            has_smtp_password: !!smtpPass,
            smtp_password: smtpPass ? '********' : ''
        }
    };
});

// 3. Тест подключения к MailAdmin API (POST /test-connection)
wallmail.api.handle('POST', '/test-connection', function(req) {
    var b = req.body || {};
    var url = (b.mailadmin_url || getConfig('mailadmin_url', '')).trim().replace(/\/+$/, "");
    var token = (b.mailadmin_token && b.mailadmin_token !== '********') ? b.mailadmin_token.trim() : getConfig('mailadmin_token', '');

    if (!url) {
        return { status: 400, body: { ok: false, error: "Укажите URL MailAdmin API" } };
    }
    if (!token) {
        return { status: 400, body: { ok: false, error: "Укажите API-токен MailAdmin" } };
    }

    try {
        var testUrl = url + "/api/mailboxes?limit=1";
        var resp = wallmail.http.fetch(testUrl, {
            method: "GET",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            }
        });

        if (resp && resp.ok) {
            return { status: 200, body: { ok: true, message: "Связь с MailAdmin API успешно установлена!" } };
        }

        var errText = resp ? resp.body : "Не удалось получить ответ";
        return { status: 400, body: { ok: false, error: "Ответ MailAdmin API (" + (resp ? resp.status : 0) + "): " + errText } };
    } catch (e) {
        return { status: 400, body: { ok: false, error: "Сетевая ошибка при обращении к " + url + ": " + e.message } };
    }
});

// 4. Публичный эндпоинт: отправка 6-значного кода подтверждения (POST /public/forgot-send-code)
wallmail.api.handle('POST', '/public/forgot-send-code', function(req) {
    var b = req.body || {};
    var email = (b.email || "").toLowerCase().trim();

    if (!email || email.indexOf('@') === -1) {
        return { status: 400, body: { ok: false, error: "Укажите корректный e-mail адрес ящика" } };
    }

    var blacklist = getConfig('blacklisted_emails', '');
    if (isEmailBlacklisted(email, blacklist)) {
        return { status: 403, body: { ok: false, error: "Смена пароля запрещена администратором для данного почтового ящика" } };
    }

    var now = Math.floor(Date.now() / 1000);

    // Rate limit: 1 запрос в минуту
    var prev = wallmail.db.query("SELECT created_at FROM plugin_mailadmin_password_codes WHERE email = ? LIMIT 1", email);
    if (prev && prev.length > 0 && prev[0].created_at && (now - prev[0].created_at < 60)) {
        var waitSec = 60 - (now - prev[0].created_at);
        return { status: 429, body: { ok: false, error: "Пожалуйста, подождите " + waitSec + " сек. перед повторным запросом кода" } };
    }

    // Генерация 6-значного кода
    var code = String(Math.floor(100000 + Math.random() * 900000));
    var ttlMins = parseInt(getConfig('code_ttl', 15), 10) || 15;
    var expiresAt = now + (ttlMins * 60);

    // Сохранение кода в БД
    wallmail.db.exec(`
        INSERT INTO plugin_mailadmin_password_codes (email, code, expires_at, attempts, created_at)
        VALUES (?, ?, ?, 0, ?)
        ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at
    `, email, code, expiresAt, now);

    var subject = "Код подтверждения для сброса пароля";
    var bodyText = "Здравствуйте!\n\n" +
        "Вы запросили сброс пароля для почтового ящика " + email + ".\n\n" +
        "Ваш код подтверждения: " + code + "\n\n" +
        "Код действителен в течение " + ttlMins + " минут.\n" +
        "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.\n";

    var smtpUser = getConfig('smtp_user', '');
    var smtpPassword = getConfig('smtp_password', '');

    try {
        var sendRes = wallmail.mail.sendDomainServiceEmail({
            to: email,
            from_email: smtpUser || ("no-reply@" + email.split('@')[1]),
            smtp_user: smtpUser,
            smtp_password: smtpPassword,
            subject: subject,
            body_text: bodyText
        });

        wallmail.log("Письмо с кодом сброса для " + email + " успешно отправлено (" + (sendRes ? sendRes.method : "ok") + ")");
        return {
            status: 200,
            body: { ok: true, message: "Код подтверждения отправлен на почтовый ящик. Проверьте вашу почту." }
        };
    } catch (sendErr) {
        wallmail.log("Ошибка отправки письма с кодом для " + email + ": " + sendErr.message);
        return {
            status: 500,
            body: { ok: false, error: "Не удалось отправить письмо с кодом подтверждения: " + sendErr.message }
        };
    }
});

// 5. Публичный эндпоинт: валидация кода и сброс пароля (POST /public/forgot-reset)
wallmail.api.handle('POST', '/public/forgot-reset', function(req) {
    var b = req.body || {};
    var email = (b.email || "").toLowerCase().trim();
    var code = (b.code || "").trim();
    var newPassword = b.new_password || "";

    if (!email || !code || !newPassword) {
        return { status: 400, body: { ok: false, error: "Заполните все обязательные поля" } };
    }
    if (newPassword.length < 6) {
        return { status: 400, body: { ok: false, error: "Пароль должен содержать минимум 6 символов" } };
    }

    var blacklist = getConfig('blacklisted_emails', '');
    if (isEmailBlacklisted(email, blacklist)) {
        return { status: 403, body: { ok: false, error: "Смена пароля запрещена для данного ящика" } };
    }

    var rows = wallmail.db.query("SELECT code, expires_at, attempts FROM plugin_mailadmin_password_codes WHERE email = ? LIMIT 1", email);
    if (!rows || rows.length === 0) {
        return { status: 400, body: { ok: false, error: "Код подтверждения не найден или устарел. Запросите код заново." } };
    }

    var item = rows[0];
    var now = Math.floor(Date.now() / 1000);

    if (now > item.expires_at) {
        wallmail.db.exec("DELETE FROM plugin_mailadmin_password_codes WHERE email = ?", email);
        return { status: 400, body: { ok: false, error: "Срок действия кода подтверждения истек. Запросите код заново." } };
    }

    if (item.code !== code) {
        var attempts = (item.attempts || 0) + 1;
        if (attempts >= 3) {
            wallmail.db.exec("DELETE FROM plugin_mailadmin_password_codes WHERE email = ?", email);
            return { status: 400, body: { ok: false, error: "Слишком много неверных попыток. Запросите код заново." } };
        }
        wallmail.db.exec("UPDATE plugin_mailadmin_password_codes SET attempts = ? WHERE email = ?", attempts, email);
        return { status: 400, body: { ok: false, error: "Неверный код подтверждения. Осталось попыток: " + (3 - attempts) } };
    }

    // Код верный -> обращаемся к MailAdmin REST API
    var apiUrl = getConfig('mailadmin_url', '');
    var apiToken = getConfig('mailadmin_token', '');
    var result = updatePasswordInMailAdmin(apiUrl, apiToken, email, newPassword);

    if (!result.ok) {
        return { status: 500, body: { ok: false, error: result.error || "Ошибка при сохранении пароля в MailAdmin" } };
    }

    // Удаляем использованный код
    wallmail.db.exec("DELETE FROM plugin_mailadmin_password_codes WHERE email = ?", email);

    return {
        status: 200,
        body: { ok: true, message: "Пароль успешно изменен! Теперь вы можете войти с новым паролем." }
    };
});

// 6. Смена пароля авторизованным пользователем из настроек (POST /user-change-password)
wallmail.api.handle('POST', '/user-change-password', function(req) {
    var b = req.body || {};
    var email = (b.email || (req.user && req.user.username) || "").toLowerCase().trim();
    var prevPassword = b.prev_password || "";
    var newPassword = b.new_password || "";

    if (!email || !prevPassword || !newPassword) {
        return { status: 400, body: { ok: false, error: "Укажите текущий и новый пароль" } };
    }
    if (newPassword.length < 6) {
        return { status: 400, body: { ok: false, error: "Новый пароль должен содержать минимум 6 символов" } };
    }

    var blacklist = getConfig('blacklisted_emails', '');
    if (isEmailBlacklisted(email, blacklist)) {
        return { status: 403, body: { ok: false, error: "Смена пароля запрещена администратором для данного почтового ящика" } };
    }

    // Проверяем текущий пароль пользователя через IMAP
    var verifyRes = wallmail.mail.verifyPassword(email, prevPassword);
    if (!verifyRes || !verifyRes.ok) {
        return { status: 400, body: { ok: false, error: "Текущий пароль указан неверно" } };
    }

    var apiUrl = getConfig('mailadmin_url', '');
    var apiToken = getConfig('mailadmin_token', '');
    var result = updatePasswordInMailAdmin(apiUrl, apiToken, email, newPassword);

    if (!result.ok) {
        return { status: 500, body: { ok: false, error: result.error || "Ошибка смены пароля через MailAdmin" } };
    }

    return {
        status: 200,
        body: { ok: true, message: "Пароль почтового ящика успешно обновлен" }
    };
});

// 7. Смена пароля администратором WallMail (POST /admin-reset-password)
wallmail.api.handle('POST', '/admin-reset-password', function(req) {
    var b = req.body || {};
    var email = (b.email || "").toLowerCase().trim();
    var newPassword = b.new_password || "";

    if (!email || !newPassword) {
        return { status: 400, body: { ok: false, error: "Укажите e-mail ящика и новый пароль" } };
    }
    if (newPassword.length < 6) {
        return { status: 400, body: { ok: false, error: "Пароль должен содержать минимум 6 символов" } };
    }

    var blacklist = getConfig('blacklisted_emails', '');
    if (isEmailBlacklisted(email, blacklist)) {
        return { status: 403, body: { ok: false, error: "Смена пароля запрещена для данного почтового ящика" } };
    }

    var apiUrl = getConfig('mailadmin_url', '');
    var apiToken = getConfig('mailadmin_token', '');
    var result = updatePasswordInMailAdmin(apiUrl, apiToken, email, newPassword);

    if (!result.ok) {
        return { status: 500, body: { ok: false, error: result.error || "Ошибка смены пароля через MailAdmin" } };
    }

    return {
        status: 200,
        body: { ok: true, message: "Пароль почтового ящика " + email + " успешно обновлен в почтовой системе" }
    };
});
