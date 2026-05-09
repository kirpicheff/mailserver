#!/bin/sh
# Скрипт для перезапуска сервисов MailAdmin внутри контейнера
echo "=== Перезапуск MailAdmin Agent и Web ==="
supervisorctl restart mailadmin-agent
supervisorctl restart mailadmin-web
echo "=== Готово ==="
