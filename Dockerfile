FROM alpine:3.24

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
	php83-mbstring \
	php83-mysqli \
	php83-fpm \
	php83-imap \
	php83-zip \
	php83-gd \
	php83-ctype \
	php83-fileinfo \
	perl \
	php83-intl \
	php83-pecl-redis \
	php83-curl \
	php83-dom \
	php83-json \
	php83-zlib \
	php83-xmlwriter \
	php83-pdo_mysql \
	php83-iconv \
	php83-session \
	php83-bz2 \
	php83-xml \
	php83-posix \
	php83-sqlite3 \
	php83-xmlreader \
	php83-simplexml \
	php83-pdo_sqlite \
	inotify-tools \
	certbot \
	logrotate \
	php83-cli \
	php83-soap \
	php83-pcntl \
	php83-openssl \
	php83-apcu \
	php83-pdo_sqlite \
	curl \
	php83-sodium \
	php83-sysvshm \
	php83-sysvsem \
	tzdata \
	redis \
	rspamd \
	rspamd-client \
	rspamd-controller \
	unzip \
	#	unrar \
	rspamd-proxy \
	fail2ban \
	php83-sqlite3 \
	php83-pear \
	php83-pspell
RUN	pipx install envtpl && ln -s /root/.local/share/pipx/venvs/envtpl/bin/envtpl /usr/bin/envtpl

RUN	apk del pipx 
RUN	rm -rf /var/cache/apk/* 
RUN	 wget https://github.com/Z-Hub/Z-Push/archive/refs/tags/2.7.4.tar.gz -O /tmp/z-push.tar.gz && cd /tmp && tar -zxf /tmp/z-push.tar.gz  && \
	mv Z-Push-2.7.4/src/* /var/www/z-push/ && chown nginx:nginx -R /var/www/z-push && mkdir -p /var/lib/z-push && mkdir -p /var/log/z-push

RUN	chown nginx:nginx /var/lib/z-push/ /var/log/z-push/ && rm -rf /tmp/z-push* 

RUN	mkdir -p /run/rspamd

COPY scripts /scripts/
COPY rootfs /


RUN	chmod +x -R /scripts && \
	chmod +x -R /opt/mailadmin && \
	chmod +x -R /opt/wallmail && \
	[ -d /opt/postfix-attacher ] && chmod +x -R /opt/postfix-attacher || true && \
	ln -sf /usr/share/zoneinfo/Europe/Moscow /etc/localtime && \
	mkdir -p /var/log/supervisor && \
	mkdir -p /run/nginx && \
	mkdir -p /run/mysqld && \
	chown mysql:mysql /run/mysqld && \
	chown nginx:nginx /run/nginx




ENTRYPOINT ["/scripts/entrypoint.sh"]

EXPOSE 25 80 443 587 993 4190 9999
