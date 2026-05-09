FROM alpine:3.19

RUN mkdir -p /data && mkdir -p /var/www && [ -e /var/www/z-push ] || mkdir -p /var/www/z-push && \
	adduser -h /data/vmail -s /sbin/nologin -D -u 1000 vmail && \
	adduser -D -S -s /sbin/nologin -G mail mailadmin && \
	(addgroup adm || addgroup -S adm) && addgroup mailadmin adm || true && \
	apk update && apk add --no-cache \
	rsyslog \
	opendkim \
	opendkim-utils \
	dovecot-pigeonhole-plugin \
	postfix \
	postfix-mysql \
	wget \
	dcron \
	pipx \
	nginx \
	dovecot \
	dovecot-mysql \
	dovecot-lmtpd \
	dovecot-pop3d \
	mariadb \
	mariadb-client \
	supervisor \
	php82-mbstring \
	php82-mysqli \
	php82-fpm \
	php82-imap \
	php82-zip \
	php82-gd \
	php82-ctype \
	php82-fileinfo \
	perl \
	php82-intl \
	php82-pecl-redis \
	php82-curl \
	php82-dom \
	php82-json \
	php82-zlib \
	php82-xmlwriter \
	php82-pdo_mysql \
	php82-iconv \
	php82-session \
	php82-bz2 \
	php82-xml \
	php82-posix \
	php82-sqlite3 \
	php82-xmlreader \
	php82-simplexml \
	php82-pdo_sqlite \
	inotify-tools \
	postfixadmin \
	certbot \
	logrotate \
	php82-cli \
	php82-soap \
	php82-pcntl \
	php82-openssl \
	php82-apcu \
	php82-pdo_sqlite \
	curl \
	php82-sodium \
	php82-sysvshm \
	php82-sysvsem \
	tzdata \
	redis \
	rspamd \
	rspamd-client \
	rspamd-controller \
	unzip \
	#	unrar \
	rspamd-proxy \
	fail2ban \
	php82-sqlite3 \
	php82-pear \
	php82-pspell
RUN	pipx install envtpl && ln -s /root/.local/share/pipx/venvs/envtpl/bin/envtpl /usr/bin/envtpl

RUN	apk del pipx 
RUN	rm -rf /var/cache/apk/* 
RUN	 wget https://github.com/Z-Hub/Z-Push/archive/refs/tags/2.7.4.tar.gz -O /tmp/z-push.tar.gz && cd /tmp && tar -zxf /tmp/z-push.tar.gz  && \
	mv Z-Push-2.7.4/src/* /var/www/z-push/ && chown nginx.nginx -R /var/www/z-push && mkdir -p /var/lib/z-push && mkdir -p /var/log/z-push

RUN	chown nginx:nginx /var/lib/z-push/ /var/log/z-push/ && rm -rf /tmp/z-push* 

# Install SnappyMail
RUN	wget https://github.com/the-djmaze/snappymail/releases/download/v2.38.2/snappymail-2.38.2.zip -O /tmp/snappy.zip && \
	mkdir -p /var/www/snappy && unzip -q /tmp/snappy.zip -d /var/www/snappy && \
	chown -R nginx:nginx /var/www/snappy && rm /tmp/snappy.zip

# Install Roundcube
RUN	wget https://github.com/roundcube/roundcubemail/releases/download/1.6.6/roundcubemail-1.6.6-complete.tar.gz -O /tmp/roundcube.tar.gz && \
	tar -zxf /tmp/roundcube.tar.gz -C /var/www/ && mv /var/www/roundcubemail-1.6.6 /var/www/roundcube && \
	chown -R nginx:nginx /var/www/roundcube && rm /tmp/roundcube.tar.gz

RUN	mkdir -p /run/rspamd

COPY scripts /scripts/
COPY rootfs /


RUN	chmod +x -R /scripts && \
	chmod +x -R /opt/mailadmin && \
	ln -sf /usr/share/zoneinfo/Europe/Moscow /etc/localtime && \
	mkdir -p /var/log/supervisor && \
	mkdir -p /run/nginx && \
	mkdir -p /run/mysqld && \
	chown mysql:mysql /run/mysqld && \
	chown nginx:nginx /run/nginx && \
	mkdir -p /usr/share/webapps/postfixadmin/templates_c && \
	chmod 777 -R /usr/share/webapps/postfixadmin/templates_c




ENTRYPOINT ["/scripts/entrypoint.sh"]

EXPOSE 25 80 443 587 993 4190 9999
