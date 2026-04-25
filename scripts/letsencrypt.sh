#!/bin/sh
certbot certonly --standalone --text --email ${EMAIL} --agree-tos --no-eff-email --preferred-challenges http-01 -d  ${MAIL_SERVER} -d autodiscover.${MAIN_DOMAIN} -d autoconfig.${MAIN_DOMAIN}  -d webmail.${MAIN_DOMAIN}
