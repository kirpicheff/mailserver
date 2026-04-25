#!/bin/sh

supervisorctl stop nginx
sleep 2
/usr/bin/certbot renew
sleep 2
supervisorctl start nginx
supervisorctl restart dovecot
postfix stop && postfix start

