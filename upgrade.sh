#!/bin/bash
# Скрипт ГЛУБОКОГО обновления MailServer с миграцией базы данных
# ВНИМАНИЕ: Скрипт пересоздает физические файлы базы данных!

IMAGE="kirpich/mailserver"
NAME="mailserver"
DB_PATH="/root/docker/mailserver/tmp/mysql"

echo "=== [1/6] Подготовка и получение доступов ==="
if ! docker ps -f "name=$NAME" --format '{{.Names}}' | grep -q "^$NAME$"; then
    echo "Ошибка: Контейнер $NAME не запущен. Для миграции нужен работающий старый контейнер."
    exit 1
fi

# Вытаскиваем переменные окружения из работающего контейнера
DB_USER=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $NAME | grep MARIADB_USER | cut -d= -f2)
DB_PASS=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $NAME | grep MARIADB_PASS | cut -d= -f2)

if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ]; then
    echo "Ошибка: Не удалось найти учетные данные БД в контейнере."
    exit 1
fi

echo "Используем пользователя: $DB_USER"

echo "=== [2/6] Создание дампа всех баз данных ==="
docker exec $NAME mysqldump -u "$DB_USER" -p"$DB_PASS" --all-databases > full_dump_before_upgrade.sql

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

echo "Ожидание готовности MariaDB (45 секунд)..."
sleep 45

echo "=== [6/6] Восстановление данных из дампа ==="
docker exec -i $NAME mysql -u "$DB_USER" -p"$DB_PASS" < full_dump_before_upgrade.sql


if [ $? -eq 0 ]; then
    echo "=== ОБНОВЛЕНИЕ И МИГРАЦИЯ ЗАВЕРШЕНЫ УСПЕШНО ==="
    echo "Файл дампа сохранен как full_dump_before_upgrade.sql (рекомендуется удалить после проверки)"
else
    echo "ОШИБКА: Не удалось восстановить дамп в новую базу!"
    echo "Старые файлы сохранены в $BACKUP_PATH"
fi
