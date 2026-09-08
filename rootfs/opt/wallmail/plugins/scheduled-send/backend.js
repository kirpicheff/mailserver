/**
 * Серверный скрипт плагина «Отложенная отправка» для WallMail.
 * Выполняется в изолированной песочнице Goja.
 */

// Инициализация таблицы очереди отправки в базе данных SQLite
wallmail.db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_scheduled_send_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        to_list TEXT NOT NULL,
        cc_list TEXT,
        bcc_list TEXT,
        subject TEXT,
        text_body TEXT,
        html_body TEXT,
        signature_id INTEGER DEFAULT 0,
        attachments_json TEXT,
        send_at INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        error_message TEXT
    )
`);

// 1. Эндпоинт постановки письма в очередь: POST /schedule
wallmail.api.handle('POST', '/schedule', function(req) {
    var userId = req.userId || 0;
    var body = req.body || {};

    if (!body.account_id || !body.to || !Array.isArray(body.to) || body.to.length === 0) {
        return {
            status: 400,
            body: { error: 'Необходимо указать ящик отправителя и хотя бы одного получателя' }
        };
    }

    if (!body.send_at || typeof body.send_at !== 'number') {
        return {
            status: 400,
            body: { error: 'Не указано корректное время отправки' }
        };
    }

    var nowUnix = Math.floor(Date.now() / 1000);
    if (body.send_at <= nowUnix) {
        return {
            status: 400,
            body: { error: 'Время отправки должно быть в будущем' }
        };
    }

    var toStr = JSON.stringify(body.to);
    var ccStr = JSON.stringify(body.cc || []);
    var bccStr = JSON.stringify(body.bcc || []);
    var attStr = JSON.stringify(body.attachments || []);

    var res = wallmail.db.exec(
        'INSERT INTO plugin_scheduled_send_queue (user_id, account_id, to_list, cc_list, bcc_list, subject, text_body, html_body, signature_id, attachments_json, send_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        userId,
        body.account_id,
        toStr,
        ccStr,
        bccStr,
        body.subject || '',
        body.text_body || '',
        body.html_body || '',
        body.signature_id || 0,
        attStr,
        body.send_at,
        'pending',
        nowUnix
    );

    wallmail.log('Запланировано письмо #' + res.lastInsertId + ' для пользователя #' + userId + ' на ' + body.send_at);

    return {
        status: 200,
        body: {
            success: true,
            id: res.lastInsertId,
            message: 'Письмо успешно запланировано к отправке'
        }
    };
});

// 2. Эндпоинт получения очереди писем текущего пользователя: GET /queue
wallmail.api.handle('GET', '/queue', function(req) {
    var userId = req.userId || 0;
    var rows = wallmail.db.query(
        "SELECT id, account_id, to_list, subject, send_at, status, created_at, error_message FROM plugin_scheduled_send_queue WHERE user_id = ? AND status = 'pending' ORDER BY send_at ASC",
        userId
    );

    var items = [];
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var toParsed = [];
        try {
            toParsed = JSON.parse(r.to_list);
        } catch (e) {
            toParsed = [r.to_list];
        }

        items.push({
            id: r.id,
            account_id: r.account_id,
            to: toParsed,
            subject: r.subject,
            send_at: r.send_at,
            status: r.status,
            created_at: r.created_at,
            error_message: r.error_message
        });
    }

    return {
        status: 200,
        body: {
            items: items,
            count: items.length
        }
    };
});

// 3. Эндпоинт отмены отложенного письма: POST /cancel
wallmail.api.handle('POST', '/cancel', function(req) {
    var userId = req.userId || 0;
    var body = req.body || {};
    var itemId = body.id;

    if (!itemId) {
        return {
            status: 400,
            body: { error: 'Не указан идентификатор письма' }
        };
    }

    var res = wallmail.db.exec(
        "UPDATE plugin_scheduled_send_queue SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'",
        itemId,
        userId
    );

    if (res.rowsAffected === 0) {
        return {
            status: 404,
            body: { error: 'Письмо в очереди не найдено или уже отправлено' }
        };
    }

    wallmail.log('Отменена отправка письма #' + itemId + ' пользователем #' + userId);

    return {
        status: 200,
        body: {
            success: true,
            message: 'Отправка отложенного письма успешно отменена'
        }
    };
});

// Фоновый воркер обработки очереди
function processQueue() {
    var nowUnix = Math.floor(Date.now() / 1000);
    var pendingRows = wallmail.db.query(
        "SELECT id, account_id, to_list, cc_list, bcc_list, subject, text_body, html_body, signature_id, attachments_json, send_at FROM plugin_scheduled_send_queue WHERE status = 'pending' AND send_at <= ? ORDER BY send_at ASC LIMIT 10",
        nowUnix
    );

    if (!pendingRows || pendingRows.length === 0) {
        return;
    }

    wallmail.log('Найдено писем к отправке по расписанию:', pendingRows.length);

    for (var i = 0; i < pendingRows.length; i++) {
        var row = pendingRows[i];
        try {
            var toList = JSON.parse(row.to_list);
            var ccList = row.cc_list ? JSON.parse(row.cc_list) : [];
            var bccList = row.bcc_list ? JSON.parse(row.bcc_list) : [];
            var attList = row.attachments_json ? JSON.parse(row.attachments_json) : [];

            wallmail.mail.send({
                account_id: row.account_id,
                to: toList,
                cc: ccList,
                bcc: bccList,
                subject: row.subject,
                text_body: row.text_body,
                html_body: row.html_body,
                signature_id: row.signature_id,
                attachments: attList
            });

            wallmail.db.exec(
                "UPDATE plugin_scheduled_send_queue SET status = 'sent', sent_at = ? WHERE id = ?",
                Math.floor(Date.now() / 1000),
                row.id
            );

            wallmail.log('Письмо #' + row.id + ' успешно отправлено адресатам по расписанию');
        } catch (err) {
            wallmail.log('Ошибка при отправке письма #' + row.id + ':', err);
            wallmail.db.exec(
                "UPDATE plugin_scheduled_send_queue SET status = 'failed', error_message = ? WHERE id = ?",
                String(err),
                row.id
            );
        }
    }
}

// Запуск периодической проверки очереди: каждые 30 секунд и через cron
setInterval(processQueue, 30000);
wallmail.cron.schedule(1, processQueue);
