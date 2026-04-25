#!/bin/sh

PERCENT=$1
USER=$2

cat << EOF | sendmail -t
From: postmaster@{{ MAIN_DOMAIN }}
To: ${USER}
Subject: Quota warning (Заканчивается место)
Content-Type: text/plain; charset=UTF-8
X-Priority: 2

Ваш почтовый ящик заполнен на $PERCENT%.

Пожалуйста:
- Удалите ненужные письма и вложения.
- Очистите папку "Корзина" (Trash, Junk и т.д.).

Your mailbox is now about $PERCENT% full.

Please:
- Remove unnecessary mails and attachments.
- Clean the TRASH folder.
EOF
