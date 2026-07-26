#!/bin/bash
# Скрипт управления и обновления MailServer

IMAGE="kirpich/mailserver"
NAME="mailserver"

cleanup_containers() {
    local img="$1"
    local name="$2"
    echo "Остановка и удаление всех контейнеров с образом $img..."
    docker rm -f $(docker ps -a -q --filter "ancestor=$img") 2>/dev/null || true
    docker rm -f "$name" 2>/dev/null || true
}

do_update() {
    echo "=== [1/4] Проверка обновлений ==="
    OLD_IMAGE_ID=$(docker images -q $IMAGE)

    echo "Загрузка свежего образа из реестра..."
    docker pull $IMAGE
    NEW_IMAGE_ID=$(docker images -q $IMAGE)

    if [ "$OLD_IMAGE_ID" = "$NEW_IMAGE_ID" ] && [ ! -z "$OLD_IMAGE_ID" ]; then
        echo "Образ не изменился. Обновление не требуется."
        if docker ps -f "name=$NAME" --format '{{.Names}}' | grep -q "^$NAME$"; then
            echo "Контейнер $NAME уже запущен."
        else
            echo "Контейнер не запущен, запускаю..."
            cleanup_containers "$IMAGE" "$NAME"
            sh start.sh
        fi
    else
        echo "=== [2/4] Обнаружено обновление или отсутствие образа ==="
        cleanup_containers "$IMAGE" "$NAME"

        echo "=== [3/4] Запуск новой версии ==="
        sh start.sh
        
        echo "=== [4/4] Очистка старых образов ==="
        docker image prune -f
    fi

    echo "=== ОБНОВЛЕНИЕ ЗАВЕРШЕНО ==="
}

# Если передана команда update, сразу выполняем обновление
if [ "$1" = "update" ]; then
    do_update
    exit 0
fi

# Интерактивное меню
while true; do
    echo ""
    echo "=== Управление MailServer ==="
    echo "1) Обновить / запустить образ"
    echo "2) Перезагрузить Fail2ban (reload rules)"
    echo "3) Статус Fail2ban (забаненные IP)"
    echo "4) Войти в контейнер (shell)"
    echo "5) Посмотреть логи"
    echo "6) Статус сервисов (Supervisor)"
    echo "7) Очередь писем (Mailq)"
    echo "8) Ресурсы (Stats)"
    echo "9) Перезапустить контейнер"
    echo "q) Выход"

    read -p "Ваш выбор: " choice

    case $choice in
        1) do_update ;;
        2) echo "Перезагрузка конфигурации Fail2ban..."; docker exec -it $NAME fail2ban-client reload ;;
        3) docker exec -it $NAME fail2ban-client status dovecot; docker exec -it $NAME fail2ban-client status postfix-sasl2 ;;
        4) docker exec -it $NAME /bin/sh ;;
        5) docker logs -f $NAME ;;
        6) docker exec -it $NAME supervisorctl status ;;
        7) docker exec -it $NAME mailq ;;
        8) docker stats $NAME --no-stream ;;
        9) echo "Перезапуск $NAME..."; docker restart $NAME ;;
        q) break ;;
        *) echo "Неверный выбор" ;;
    esac
done
