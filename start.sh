docker run -d \
	--name mailserver \
	--restart unless-stopped \
	-v /root/docker/mailserver/tmp:/data \
	-v /root/docker/mailserver/tmp/cert:/etc/letsencrypt \
	-v /root/docker/mailserver/tmp/rainloop:/var/www/rainloop/data \
	-e MARIADB_USER=postfix \
	-e MARIADB_PASS=password \
	-e SETUP_PASSWORD=admin \
	-e MAIN_DOMAIN=example.com \
	-e MAIL_SERVER=mail.example.com \
	-e EMAIL=admin@example.com \

	-e MESSAGE_SIZE=15728640 \
	-e UPLOAD_SIZE=25M \
	-e POST_SIZE=25M \
	-p 9999:9999 \
	-p 587:587 \
	-p 465:465 \
	-p 993:993 \
	-p 25:25 \
	-p 4190:4190 \
	-p 80:80 \
	-p 443:443 \
	-h mail.example.com kirpich/mailserver


