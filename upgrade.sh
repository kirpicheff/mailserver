#!/bin/bash
# Скрипт ГЛУБОКОГО обновления MailServer с миграцией базы данных
# ВНИМАНИЕ: Скрипт пересоздает физические файлы базы данных!

IMAGE="kirpich/mailserver"
NAME="mailserver"
DB_PATH="/root/docker/mailserver/tmp/mysql"

echo "=== [1/6] Подготовка и получение доступов ==="
if ! docker ps -f "name=$NAME" --format '{{.Names}}' | grep -q "^$NAME$"; then
    echo "Контейнер $NAME не запущен. Ищем запущенный контейнер по образу $IMAGE..."
    DETECTED_NAME=$(docker ps -f "ancestor=$IMAGE" --format '{{.Names}}' | head -n 1)
    if [ -n "$DETECTED_NAME" ]; then
        NAME="$DETECTED_NAME"
        echo "Найден запущенный контейнер: $NAME"
    else
        echo "Ошибка: Не удалось найти запущенный контейнер с образом $IMAGE."
        exit 1
    fi
fi


# Вытаскиваем переменные окружения из работающего контейнера
DB_USER=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $NAME | grep MARIADB_USER | cut -d= -f2)
DB_PASS=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $NAME | grep MARIADB_PASS | cut -d= -f2)

if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ]; then
    echo "Ошибка: Не удалось найти учетные данные БД в контейнере."
    exit 1
fi

echo "Используем пользователя: $DB_USER"

echo "=== [2/6] Создание дампа пользовательских баз данных ==="
# Получаем список пользовательских баз данных (исключая системные)
DB_LIST=$(docker exec $NAME mysql -u "$DB_USER" -p"$DB_PASS" -Bse "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys', 'test')" | tr -d '\r' | tr '\n' ' ')

if [ -z "$DB_LIST" ]; then
    echo "Ошибка: Не удалось получить список баз данных для резервного копирования."
    exit 1
fi

echo "Найдено баз для дампа: $DB_LIST"
docker exec $NAME mysqldump -u "$DB_USER" -p"$DB_PASS" --databases $DB_LIST > full_dump_before_upgrade.sql

if [ $? -ne 0 ]; then
    echo "КРИТИЧЕСКАЯ ОШИБКА: Не удалось создать дамп. Миграция прервана."
    exit 1
fi
echo "Дамп успешно создан: full_dump_before_upgrade.sql"


echo "=== [3/6] Остановка и удаление старой версии ==="
docker stop $NAME
docker rm $NAME
docker pull $IMAGE

echo "=== [4/6] Ротация физических файлов БД ==="
BACKUP_PATH="${DB_PATH}_old_$(date +%Y%m%d_%H%M%S)"
if [ -d "$DB_PATH" ]; then
    mv "$DB_PATH" "$BACKUP_PATH"
    echo "Старая папка БД перемещена в: $BACKUP_PATH"
else
    echo "Предупреждение: Папка $DB_PATH не найдена, пропускаем ротацию."
fi

echo "=== [4.5/6] Сброс флага инициализации контейнера ==="
INIT_FLAG="$(dirname "$DB_PATH")/.init_finished"
rm -f "$INIT_FLAG"

echo "=== [5/6] Запуск новой версии (инициализация чистой БД) ==="
sh start.sh

# Определяем имя нового контейнера (последний запущенный из нашего образа)
NEW_NAME=$(docker ps -f "ancestor=$IMAGE" --format '{{.Names}}' | head -n 1)
if [ -z "$NEW_NAME" ]; then
    # Резервный вариант на случай задержки старта
    sleep 2
    NEW_NAME=$(docker ps -l --format '{{.Names}}')
fi
echo "Новый контейнер запущен под именем: $NEW_NAME"

echo "Ожидание готовности MariaDB..."
TIMEOUT=600 # 10 минут
ELAPSED=0
while ! docker exec $NEW_NAME mysqladmin -u "$DB_USER" -p"$DB_PASS" ping --silent >/dev/null 2>&1; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    if [ $ELAPSED -ge $TIMEOUT ]; then
        echo "Ошибка: Превышено время ожидания готовности MariaDB."
        exit 1
    fi
    echo "Ожидаем готовности базы данных... (прошло $ELAPSED сек). Последние логи:"
    docker logs --tail 5 $NEW_NAME
done
echo "MariaDB готова!"

echo "=== [6/6] Восстановление данных из дампа ==="
docker exec -i $NEW_NAME mysql -u "$DB_USER" -p"$DB_PASS" < full_dump_before_upgrade.sql


if [ $? -eq 0 ]; then
    echo "=== ОБНОВЛЕНИЕ И МИГРАЦИЯ ЗАВЕРШЕНЫ УСПЕШНО ==="
    echo "Файл дампа сохранен как full_dump_before_upgrade.sql (рекомендуется удалить после проверки)"
else
    echo "ОШИБКА: Не удалось восстановить дамп в новую базу!"
    echo "Старые файлы сохранены в $BACKUP_PATH"
fi
