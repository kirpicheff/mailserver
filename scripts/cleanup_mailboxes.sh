#!/bin/sh
# Скрипт безопасного объединения дублей системных папок Dovecot
# Запуск: /bin/sh /scripts/cleanup_mailboxes.sh [домен|*]

TARGET="${1:-*}"
if [ "$TARGET" = "*" ]; then
    MASK="*"
else
    MASK="*@$TARGET"
fi

echo "=== Запуск очистки и миграции дублей (фильтр: $MASK) ==="

USERS=$(doveadm user "$MASK" 2>/dev/null)

if [ -z "$USERS" ]; then
    echo "Ошибка: пользователи по фильтру $MASK не найдены или doveadm недоступен."
    exit 1
fi

migrate_folder() {
    _user="$1"
    _src="$2"
    _dst="$3"

    _has_src=$(doveadm mailbox list -u "$_user" "$_src" 2>/dev/null)
    [ -z "$_has_src" ] && return 0

    _cnt=$(doveadm mailbox status -u "$_user" messages "$_src" 2>/dev/null | sed 's/.*=//')
    [ -z "$_cnt" ] && _cnt=0

    if [ "$_cnt" -gt 0 ]; then
        echo "[$_user] Перенос $_cnt писем из '$_src' в '$_dst'..."
        doveadm mailbox create -u "$_user" -s "$_dst" 2>/dev/null || true
        if ! doveadm move -u "$_user" "$_dst" mailbox "$_src" ALL; then
            echo "[$_user] ОШИБКА переноса из '$_src' в '$_dst', папка '$_src' не удалена."
            return 1
        fi
    fi

    doveadm mailbox unsubscribe -u "$_user" "$_src" 2>/dev/null || true
    doveadm mailbox delete -u "$_user" "$_src" 2>/dev/null || true
}

for USER in $USERS; do
    migrate_folder "$USER" "Отправленные" "Sent"
    migrate_folder "$USER" "Корзина" "Trash"
    migrate_folder "$USER" "Удаленные" "Trash"
    migrate_folder "$USER" "Черновики" "Drafts"
    migrate_folder "$USER" "Спам" "Junk"
done

echo "=== Очистка успешно завершена ==="

