#!/bin/bash
# Скрипт автоматического обновления и перезапуска MailServer

IMAGE="kirpich/mailserver"
NAME="mailserver"

cleanup_containers() {
    local img="$1"
    local name="$2"
    echo "Остановка и удаление всех контейнеров с образом $img..."
    docker rm -f $(docker ps -a -q --filter "ancestor=$img") 2>/dev/null || true
    docker rm -f "$name" 2>/dev/null || true
}

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

# Интерактивное меню
while true; do
    echo ""
    echo "Выберите действие:"
    echo "1) Войти в контейнер (shell)"
    echo "2) Посмотреть логи"
    echo "3) Статус сервисов (Supervisor)"
    echo "4) Очередь писем (Mailq)"
    echo "5) Ресурсы (Stats)"
    echo "6) Перезапустить контейнер"
    echo "q) Выход"

    read -p "Ваш выбор: " choice

    case $choice in
        1) docker exec -it $NAME /bin/sh ;;
        2) docker logs -f $NAME ;;
        3) docker exec -it $NAME supervisorctl status ;;
        4) docker exec -it $NAME mailq ;;
        5) docker stats $NAME --no-stream ;;
        6) echo "Перезапуск $NAME..."; docker restart $NAME ;;
        q) break ;;
        *) echo "Неверный выбор" ;;
    esac
done




