FROM alpine:3.24

RUN mkdir -p /data && mkdir -p /var/www && \
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
	perl \
	inotify-tools \
	certbot \
	logrotate \
	curl \
	tzdata \
	redis \
	rspamd \
	rspamd-client \
	rspamd-controller \
	unzip \
	#	unrar \
	rspamd-proxy \
	fail2ban
RUN	pipx install envtpl && ln -s /root/.local/share/pipx/venvs/envtpl/bin/envtpl /usr/bin/envtpl

RUN	apk del pipx 
RUN	rm -rf /var/cache/apk/* 

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
