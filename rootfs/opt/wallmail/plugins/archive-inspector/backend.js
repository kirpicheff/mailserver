/**
 * Серверная часть плагина «Просмотрщик архивов» (archive-inspector).
 * Предоставляет защищенные эндпоинты для анализа структуры архивов и извлечения файлов.
 */

wallmail.log("Плагин 'Просмотрщик архивов' инициализирован");

// GET /inspect: получение списка файлов внутри архива
wallmail.api.handle('GET', '/inspect', function(req) {
  try {
    var query = req.query || {};
    var accountId = query.account_id;
    var folder = query.folder || 'INBOX';
    var uid = query.uid;
    var partId = query.part_id;

    if (!accountId || !uid || !partId) {
      return {
        status: 400,
        body: { error: "Не переданы обязательные параметры (account_id, uid, part_id)" }
      };
    }

    var inspectResult = wallmail.archive.inspect({
      account_id: accountId,
      folder: folder,
      uid: uid,
      part_id: partId,
      user_id: req.userId
    });

    return {
      status: 200,
      body: inspectResult
    };
  } catch (err) {
    return {
      status: 400,
      body: { error: err.message || String(err) }
    };
  }
});

// GET /extract: извлечение отдельного файла из архива
wallmail.api.handle('GET', '/extract', function(req) {
  try {
    var query = req.query || {};
    var accountId = query.account_id;
    var folder = query.folder || 'INBOX';
    var uid = query.uid;
    var partId = query.part_id;
    var targetPath = query.path;

    if (!accountId || !uid || !partId || !targetPath) {
      return {
        status: 400,
        body: { error: "Не переданы обязательные параметры (account_id, uid, part_id, path)" }
      };
    }

    var extracted = wallmail.archive.extract({
      account_id: accountId,
      folder: folder,
      uid: uid,
      part_id: partId,
      path: targetPath,
      user_id: req.userId
    });

    var filename = extracted.filename || "file";
    var encodedName = encodeURIComponent(filename).replace(/%20/g, ' ');

    return {
      status: 200,
      raw: true,
      headers: {
        "Content-Type": extracted.content_type || "application/octet-stream",
        "Content-Disposition": 'attachment; filename="' + filename + '"; filename*=UTF-8\'\'' + encodedName,
        "X-Content-Type-Options": "nosniff"
      },
      bodyBase64: extracted.base64
    };
  } catch (err) {
    return {
      status: 400,
      body: { error: err.message || String(err) }
    };
  }
});
