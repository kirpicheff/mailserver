#!/bin/sh
# Ожидание подключения к сети
echo "Ожидание подключения к сети..."
NETWORK_UP=0
for i in $(seq 1 60); do
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
    NETWORK_UP=1
    break
  fi
  echo "Сеть недоступна, ожидание... ($i/60)"
  sleep 1
done

if [ $NETWORK_UP -eq 0 ]; then
  echo "Предупреждение: Сеть не появилась через 30 секунд. Продолжаем запуск..."
else
  echo "Сеть активна."
fi


if [ -z ${MAIL_SERVER} ]; then export MAIL_SERVER=mail.example.com; fi
if [ -z ${MAIN_DOMAIN} ]; then export MAIN_DOMAIN=example.com; fi
if [ -z ${ALL_DOMAINS} ]; then export ALL_DOMAINS=example.com,example.org; fi
if [ -z ${SETUP_PASSWORD} ]; then export SETUP_PASSWORD=admin; fi
if [ -z  ${MARIADB_USER} ]; then export MARIADB_USER=root; fi
if [ -z ${MARIADB_PASS} ]; then export MARIADB_PASS=root; fi
if [ -z ${MESSAGE_SIZE} ]; then export MESSAGE_SIZE=52428800; fi
if [ -z ${RSPAMD_PASSWORD} ]; then export RSPAMD_PASSWORD='PassWord'; fi
if [ -z ${JWT_SECRET} ]; then export JWT_SECRET=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32); fi




CERTFILE=/data/cert/live/${MAIL_SERVER}/cert.pem
KEYFILE=/data/cert/live/${MAIL_SERVER}/privkey.pem
CAFILE=/data/cert/live/${MAIL_SERVER}/chain.pem
FULLCERT=/data/cert/live/${MAIL_SERVER}/fullchain.pem

export CERTFILE KEYFILE CAFILE FULLCERT

if [ ! -e /data/.init_finished ]
then

[ -d /data/cert ] || mkdir /data/cert
[ -d /data/dkim ] || mkdir /data/dkim
[ -d /data/sieve ] || mkdir /data/sieve
[ -d /data/mail ] || mkdir /data/mail
[ -d /data/rspamd ] || mkdir /data/rspamd
[ -d /data/redis ] || mkdir /data/redis
[ -d /data/wallmail ] || mkdir -p /data/wallmail/plugins
[ -d /data/mysql ] || mkdir /data/mysql
[ -d /data/fail2ban ] || mkdir /data/fail2ban

# Директория для сокета MailAdmin
if [ ! -d /var/run/mailadmin ]; then
    mkdir -p /var/run/mailadmin
    chown root:mail /var/run/mailadmin
    chmod 770 /var/run/mailadmin
fi

chown mysql:mysql /run/mysqld
chown root:root /data
chown -R mysql:mysql /data/mysql
chown -R vmail:vmail /data/mail
chown -R postfix:postfix /var/lib/postfix
chown -R postfix:postfix /etc/postfix
chown -R opendkim:mail /etc/opendkim
chown -R rspamd:rspamd /data/rspamd
[ -d /data/wallmail ] && chown -R root:root /data/wallmail


cat <<EOF > /data/sieve/default.sieve
# Global default sieve script
EOF


cat <<EOF > /data/sieve/before.sieve
require ["fileinto", "comparator-i;ascii-numeric", "relational"];

# Перемещаем в Junk, если спам
if anyof (
    header :contains "X-Spam-Status" "YES",
    header :contains "X-Spam-Flag" "YES",
    header :value "ge" :comparator "i;ascii-numeric" "X-Spam-Score" "6"
) {
    fileinto "Junk";
    stop;
}

EOF


touch /data/rspamd/blacklist.map
touch /data/rspamd/country.map
touch /data/rspamd/filename.map
touch /data/whitelist.map
touch /data/rspamd/regexp.map
touch /data/rspamd/emailname.map
touch /data/rspamd/greylist-whitelist.map

cat <<EOF > /data/rspamd/filename.map
# Запрещенные расширения файлов.
exe
com
dll
scr
lnk

EOF

cat <<EOF > /data/rspamd/blacklist.map
# BlackList from domain. Example: xxx.com or
# xxx:com SYMBOL:WEIGHT 

EOF

cat <<EOF > /data/rspamd/country.map
# Повышенная оценка для стран. RegExp все кроме RU UA KZ BY
^(?!(RU)|(UA)|(KZ)|(BY)).*$

EOF

cat <<EOF > /data/rspamd/whitelist.map
# WhiteList from domain. Example: gmail.com or
# gmail.com SYNMBOL:WEIGHT

EOF

cat <<EOF > /data/rspamd/regexp.map

/.* [0-9]{5,6}$/i
/в отличном качестве/ui
/^Предложение$/ui SUBJECT_CHECK:2
/^Руководству$/ui SUBJECT_CHECK:2
/^Сотрудничество$/ui SUBJECT_CHECK:2

EOF


cat <<EOF > /data/rspamd/emailname.map

/^Aleksandr$/ui
/^Александр$/ui

EOF


chown -R rspamd:rspamd /data/rspamd
chown -R mysql:mysql /data/mysql
chown -R vmail:vmail /data/sieve/



[ -e /data/mysql/mysql ] || mysql_install_db --user=mysql --basedir=/usr --datadir=/data/mysql

[ -e /data/cert/live/${MAIL_SERVER} ] || /scripts/letsencrypt.sh

[ -e /data/dkim/${MAIN_DOMAIN}.txt ] || /scripts/dkim.sh ${MAIN_DOMAIN}


mysqld_safe --skip-grant-tables --user=mysql --datadir=/data/mysql &
        while [ ! -e /run/mysqld/mysqld.sock ]; do
                inotifywait -e create -q /run/mysqld/
        done


mysql -u root -e "DELETE FROM user; FLUSH PRIVILEGES; CREATE USER '${MARIADB_USER}'@'%' IDENTIFIED BY '${MARIADB_PASS}'; GRANT ALL PRIVILEGES ON *.* TO '${MARIADB_USER}'@'%' WITH GRANT OPTION;" mysql
mysql -u $MARIADB_USER -p$MARIADB_PASS -e 'CREATE DATABASE IF NOT EXISTS postfix CHARACTER SET utf8 COLLATE utf8_general_ci;'

mysqladmin -u $MARIADB_USER -p$MARIADB_PASS shutdown







touch /data/.init_finished
echo "Initialized data directory!"
fi


if [ -e /data/.init_finished ]
then
echo "Initializing done. Setting..."


[ -d /var/log/supervisor ] || mkdir /var/log/supervisor
[ -d /var/log/nginx ] || mkdir /var/log/nginx

# Принудительное исправление прав (на случай ручных изменений)
echo "Проверка прав доступа..."
chown mysql:mysql /run/mysqld
chmod 755 /run/mysqld

# Тяжелые директории проверяем перед рекурсивным chown
if [ "$(stat -c '%U' /data/mysql)" != "mysql" ]; then
    echo "Восстановление прав на MySQL..."
    chown -R mysql:mysql /data/mysql
fi

if [ "$(stat -c '%U' /data/mail)" != "vmail" ]; then
    echo "Восстановление прав на почту (большой объем, может занять время)..."
    chown -R vmail:vmail /data/mail
fi

# Исправление прав на папки фильтров sieve для предотвращения ошибок Dovecot
if [ ! -e /data/mail/.sieve_permissions_set ]; then
    echo "Восстановление прав на директории sieve..."
    find /data/mail -maxdepth 3 -type d -name "sieve" -exec chmod 750 {} + 2>/dev/null || true
    find /data/mail -maxdepth 4 -type d -path "*/sieve/tmp" -exec chmod 750 {} + 2>/dev/null || true
    touch /data/mail/.sieve_permissions_set
fi

chown -R postfix:postfix /var/lib/postfix
chown -R opendkim:mail /etc/opendkim
chown -R rspamd:rspamd /data/rspamd /etc/rspamd
[ -d /data/wallmail ] && chown -R root:root /data/wallmail


# Исправление прав на очереди Postfix (штатная утилита)
postfix set-permissions 2>/dev/null || true
# Удаление stale lock-файла
rm -f /var/lib/postfix/master.lock
rm -f /run/dovecot/master.pid
rm -f /var/run/rsyslogd.pid /run/rsyslogd.pid

# Доступ для MailAdmin к сертификатам и конфигам
echo "Настройка доступа для MailAdmin и сервисов..."
addgroup mailadmin dovecot || true
addgroup mailadmin postfix || true
addgroup vmail postfix || true

# Инициализация persistent-конфигурации jail.local для Fail2ban
if [ ! -f /data/fail2ban/jail.local ]; then
    cat <<'EOF' > /data/fail2ban/jail.local
[DEFAULT]
# Добавляйте сюда доверенные IP-адреса и подсети через пробел (например, IP офиса)
# ignoreip = 127.0.0.1/8 17.0.0.1/8 192.168.0.0/16 203.0.113.50
EOF
fi
ln -sf /data/fail2ban/jail.local /etc/fail2ban/jail.local

# Рекурсивная настройка прав на конфиги и сертификаты выполняется разово при первой инициализации
if [ ! -e /data/.service_permissions_set ]; then
    chown -R root:mail /data/cert /etc/fail2ban /data/fail2ban
    chmod -R 750 /data/cert /etc/fail2ban /data/fail2ban

    # Разрешаем MailAdmin читать конфиги почтовых служб через соответствующие группы
    # Исправляем и папки, и файлы рекурсивно
    find /etc/dovecot -exec chown root:dovecot {} +
    find /etc/dovecot -type d -exec chmod 750 {} +
    find /etc/dovecot -type f -exec chmod 640 {} +

    find /etc/postfix -exec chown root:postfix {} +
    find /etc/postfix -type d -exec chmod 755 {} +
    find /etc/postfix -type f -exec chmod 644 {} +

    touch /data/.service_permissions_set
else
    # При повторных стартах проверяем только верхнеуровневые директории без медленного рекурсивного обхода
    chown root:mail /data/cert /etc/fail2ban /data/fail2ban
    chmod 750 /data/cert /etc/fail2ban /data/fail2ban
fi

# Права для мониторинга (сессии Dovecot, статус Fail2ban)
echo "Настройка прав для мониторинга..."
[ -d /var/run/dovecot ] && chmod 755 /var/run/dovecot
if [ -d /var/run/fail2ban ]; then
    chown root:mail /var/run/fail2ban
    chmod 775 /var/run/fail2ban
    [ -S /var/run/fail2ban/fail2ban.sock ] && chown root:mail /var/run/fail2ban/fail2ban.sock && chmod 660 /var/run/fail2ban/fail2ban.sock
fi

# Настройка прав на логи для группы mail (чтобы MailAdmin мог их читать)
touch /var/log/mail.log /var/log/messages /var/log/fail2ban.log
chown root:mail /var/log/mail.log /var/log/messages /var/log/fail2ban.log
chmod 640 /var/log/mail.log /var/log/messages /var/log/fail2ban.log
echo "Права для мониторинга настроены."

echo "Генерация конфигурационных файлов из шаблонов..."
settpl() {
mv "$1" "$1.tpl" # envtpl requires files to have .tpl extension
  envtpl "$1.tpl"
}

settpl /etc/dovecot/quota-warning.sh
settpl /etc/dovecot/quota-exceeded.sh
settpl /etc/dovecot/conf.d/10-ssl.conf
settpl /etc/dovecot/dovecot-sql.conf.ext
settpl /etc/dovecot/dovecot-dict-sql.conf.ext
settpl /etc/postfix/sql/mysql_virtual_alias_domain_catchall_maps.cf
settpl /etc/postfix/sql/mysql_virtual_alias_domain_mailbox_maps.cf
settpl /etc/postfix/sql/mysql_virtual_alias_domain_maps.cf
settpl /etc/postfix/sql/mysql_virtual_alias_maps.cf
settpl /etc/postfix/sql/mysql_restrict_global_aliases.cf
settpl /etc/postfix/sql/mysql_virtual_domains_maps.cf
settpl /etc/postfix/sql/mysql_virtual_mailbox_limit_maps.cf
settpl /etc/postfix/sql/mysql_virtual_mailbox_maps.cf
# Генерация конфига для MailAdmin
settpl /opt/mailadmin/.env
grep -q '^MAIL_SERVER=' /opt/mailadmin/.env || printf '\nMAIL_SERVER=%s\n' "${MAIL_SERVER}" >> /opt/mailadmin/.env
settpl /etc/nginx/conf.d/0-autoconfig.conf
settpl /etc/nginx/conf.d/2-postfixadmin.conf
settpl /etc/nginx/conf.d/5-webmail.conf
echo "Конфигурационные файлы сгенерированы."

# Пароль RSPAMD
echo "Генерация пароля Rspamd..."
PASSWORD=$(rspamadm pw --quiet --encrypt --type pbkdf2 --password "${RSPAMD_PASSWORD}")
echo $PASSWORD > /tmp/1.txt
sed -i 's|.* ||' /tmp/1.txt
PASSWORD=`cat /tmp/1.txt`
rm -rf /tmp/1.txt
sed -i "s|<PASSWORD>|${PASSWORD}|g" /etc/rspamd/local.d/worker-controller.inc
echo "Пароль Rspamd настроен."

echo "Настройка параметров Postfix и Dovecot..."
postconf -e "smtpd_tls_cert_file = /data/cert/live/${MAIL_SERVER}/fullchain.pem"
postconf -e "smtpd_tls_key_file = /data/cert/live/${MAIL_SERVER}/privkey.pem"
postconf -e "smtpd_tls_CAfile = /data/cert/live/${MAIL_SERVER}/chain.pem"
postconf -e "smtp_tls_CAfile = /data/cert/live/${MAIL_SERVER}/chain.pem"
postconf -e "myhostname=${MAIL_SERVER}"
postconf -e "mydomain=${MAIN_DOMAIN}"
postconf -e "message_size_limit=${MESSAGE_SIZE}"
postmap /etc/postfix/transport
newaliases

[ -d /etc/dovecot/sieve-filter ] || mkdir /etc/dovecot/sieve-filter

# Настройка cron (используем > для первой строки, чтобы не плодить дубли при перезапусках)
echo "PATH=/usr/sbin:/usr/bin:/sbin:/bin"  > /etc/crontabs/root
echo 'MAILTO=""' >>  /etc/crontabs/root
echo "39 7,19 * * * /bin/sh /scripts/certbot-renew.sh > /dev/null 2>&1" >> /etc/crontabs/root
echo "30 0 */7 * * /usr/bin/find /data/mail/*/*/.Junk/ -type f -mtime +30 -exec rm {} \; > /dev/null 2>&1" >> /etc/crontabs/root
echo "*/30 * * * * /usr/sbin/logrotate /etc/logrotate.conf -s /tmp/logrotate.status > /dev/null 2>&1" >> /etc/crontabs/root
echo "#END" >> /etc/crontabs/root

sed -i '/.mysqld.$/a expire_logs_days=30'  /etc/my.cnf.d/mariadb-server.cnf
sed -i '/.mysqld.$/a max_connections=1000'  /etc/my.cnf.d/mariadb-server.cnf
sed -i '/.mysqld.$/a bind-address = 127.0.0.1'  /etc/my.cnf.d/mariadb-server.cnf
sed -i '/.mysqld.$/a port = 3306'  /etc/my.cnf.d/mariadb-server.cnf
sed -i "s/skip-networking/#skip-networking/"  /etc/my.cnf.d/mariadb-server.cnf

# Настройка персистентности и плагинов WallMail
echo "Настройка плагинов WallMail..."
mkdir -p /data/wallmail/plugins
if [ -d /opt/wallmail/plugins ]; then
    cp -rn /opt/wallmail/plugins/* /data/wallmail/plugins/ 2>/dev/null || cp -r /opt/wallmail/plugins/* /data/wallmail/plugins/ 2>/dev/null || true
fi
chown -R root:root /data/wallmail
chmod -R 755 /data/wallmail

chown postfix:postfix /etc/dovecot/quota*

# Настройка прав для MailAdmin
addgroup mailadmin dovecot || true
chown root:root /opt/mailadmin/mailadmin
chmod +x /opt/mailadmin/mailadmin
chown mailadmin:mail /opt/mailadmin/.env
chmod 600 /opt/mailadmin/.env
chmod 644 /etc/postfix/dynamicmaps.cf || true
[ -d /etc/postfix/dynamicmaps.cf.d ] && find /etc/postfix/dynamicmaps.cf.d -type d -exec chmod 755 {} + && find /etc/postfix/dynamicmaps.cf.d -type f -exec chmod 644 {} + || true

# Настройка директории вложений и прав для postfix-attacher
[ -d /data/attachments ] || mkdir -p /data/attachments
chown -R nginx:nginx /data/attachments
chmod 755 /data/attachments
[ -f /opt/postfix-attacher/postfix-attacher ] && chmod +x /opt/postfix-attacher/postfix-attacher || true

# Быстрая точечная передача прав на структуры ящиков и индексы Dovecot (без глубокого сканирования писем в cur/new)
echo "Проверка прав почтовых ящиков..."
[ -d /data/mail ] && find /data/mail -maxdepth 3 -user root -not -path "*/cur/*" -not -path "*/new/*" -exec chown vmail:vmail {} + || true
echo "Права почтовых ящиков проверены."

echo "Setting done. Welcome."
echo "Tuning TCP keepalive..."
sysctl -w net.ipv4.tcp_keepalive_time=120
sysctl -w net.ipv4.tcp_keepalive_intvl=30
sysctl -w net.ipv4.tcp_keepalive_probes=5

fi
exit 0
