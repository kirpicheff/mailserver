#!/bin/sh
# Скрипт аудита дублирующихся системных папок для Alpine Linux (/bin/sh)
# Запуск: /bin/sh /scripts/audit_duplication.sh [домен|*]

TARGET="${1:-*}"
if [ "$TARGET" = "*" ]; then
    MASK="*"
else
    MASK="*@$TARGET"
fi

echo "=== Запуск аудита почтовых ящиков (фильтр: $MASK) ==="

TOTAL_ACCOUNTS=0
AFFECTED_ACCOUNTS=0

USERS=$(doveadm user "$MASK" 2>/dev/null)

if [ -z "$USERS" ]; then
    echo "Ошибка: пользователи по фильтру $MASK не найдены или doveadm недоступен."
    exit 1
fi

get_msg_count() {
    _cnt=$(doveadm mailbox status -u "$1" messages "$2" 2>/dev/null | sed 's/.*=//')
    [ -z "$_cnt" ] && _cnt=0
    echo "$_cnt"
}

check_pair() {
    _user="$1"
    _en="$2"
    _ru="$3"
    _has_ru=$(doveadm mailbox list -u "$_user" "$_ru" 2>/dev/null)
    if [ -n "$_has_ru" ]; then
        _cnt_ru=$(get_msg_count "$_user" "$_ru")
        _has_en=$(doveadm mailbox list -u "$_user" "$_en" 2>/dev/null)
        if [ -n "$_has_en" ]; then
            _cnt_en=$(get_msg_count "$_user" "$_en")
            REPORT_LINE="$REPORT_LINE [$_en: $_cnt_en -> $_ru: $_cnt_ru]"
        else
            REPORT_LINE="$REPORT_LINE [нет $_en -> $_ru: $_cnt_ru]"
        fi
        DUPLICATES_FOUND=1
    fi
}

for USER in $USERS; do
    TOTAL_ACCOUNTS=$((TOTAL_ACCOUNTS + 1))
    DUPLICATES_FOUND=0
    REPORT_LINE=""

    check_pair "$USER" "Sent" "Отправленные"
    check_pair "$USER" "Trash" "Корзина"
    check_pair "$USER" "Trash" "Удаленные"
    check_pair "$USER" "Drafts" "Черновики"
    check_pair "$USER" "Junk" "Спам"

    if [ "$DUPLICATES_FOUND" -eq 1 ]; then
        AFFECTED_ACCOUNTS=$((AFFECTED_ACCOUNTS + 1))
        echo "Пользователь $USER:$REPORT_LINE"
    fi
done

echo "============================================="
echo "Всего проверено ящиков: $TOTAL_ACCOUNTS"
echo "Ящиков с дубликатами папок: $AFFECTED_ACCOUNTS"

