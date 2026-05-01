sysctl vm.overcommit_memory=1
docker run -it \
	--privileged \
    --cap-add=NET_ADMIN \
	--sysctl net.core.somaxconn=512	\
	-v /root/docker/mailserver/tmp:/data \
	-v /root/docker/mailserver/tmp/cert:/etc/letsencrypt \
	-v /root/docker/mailserver/tmp/rainloop:/var/www/rainloop/data \
	-e MARIADB_USER=postfix \
	-e MARIADB_PASS=password \
	-e SETUP_PASSWORD=htrbrc1 \
	-e MAIN_DOMAIN=aalabin.ru \
	-e MAIL_SERVER=mail.aalabin.ru \
	-e EMAIL=postmaster@aalabin.ru \
	-e RSPAMD_PASSWORD=htvbrc \
#	 -e MAILADMIN_RAM_TOTAL=6144 \
	-p 587:587 \
	-p 465:465 \
	-p 993:993 \
	-p 2525:25 \
	-p 4190:4190 \
	-p 9999:9999 \
	-p 8081:80 \
	-p 443:443 \
	-h mail.aalabin.ru kirpich/mailserver
