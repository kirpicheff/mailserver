#!/bin/bash

# Скрипт для автоматического обновления, сборки MailAdmin и пересборки Docker-образа

set -e

# 1. Обновление репозитория MailAdmin
if [ -d "mailadmin/.git" ]; then
    echo "=== Обновление MailAdmin из GitHub ==="
    cd mailadmin
    git fetch --all
    git clean -fd
    git reset --hard origin/main
    cd ..
else
    echo "=== Пересоздание MailAdmin (чистый клон) ==="
    rm -rf mailadmin
    git clone https://github.com/kirpicheff/mailadmin
fi

# 2. Сборка фронтенда (Vue 3)
echo "=== Сборка Фронтенда ==="
cd mailadmin/frontend
npm install
chmod +x node_modules/.bin/vite
# Передаем базовый путь и URL API через переменные окружения
VITE_API_URL=/mailadmin/api npm run build -- --base=/mailadmin/
cd ../..

# 3. Сборка бэкенда (Go)
echo "=== Сборка Бэкенда (Go) ==="
cd mailadmin/backend
go mod tidy
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o mailadmin ./main.go
cd ../..

# 4. Копирование файлов в rootfs mailserver
echo "=== Копирование файлов в rootfs ==="
mkdir -p rootfs/var/www/mailadmin
rm -rf rootfs/var/www/mailadmin/*
cp -r mailadmin/frontend/dist/* rootfs/var/www/mailadmin/

mkdir -p rootfs/opt/mailadmin
cp mailadmin/backend/mailadmin rootfs/opt/mailadmin/

# 5. Пересборка Docker-образа
echo "=== Пересборка Docker-образа ==="
docker build -t kirpich/mailserver .

echo "=== Готово! Теперь можно запускать sh start-debug.sh ==="
