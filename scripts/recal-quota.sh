#!/bin/sh

for user in `mysql -u postfix -p${MARIADB_PASS} -Bse "select username from  postfix.mailbox"`; do doveadm quota recalc -u $user; done
