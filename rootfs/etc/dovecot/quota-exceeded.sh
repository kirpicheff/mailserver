#!/bin/sh

PERCENT=$1
USER=$2

cat << EOF | sendmail -t
From: postmaster@{{ MAIN_DOMAIN }}
To: ${USER}
Subject: Quota exceeded (Почтовый ящик переполнен)
Content-Type: text/plain; charset=UTF-8
X-Priority: 2

Ваш почтовый ящик теперь заполнен на $PERCENT%.
Вы больше не сможете получать почту, пока ваш почтовый ящик переполнен.
Пожалуйста, удалите ненужные письма / вложения из почтового ящика, очистите папку мусора.

Your mailbox is now $PERCENT% full.
You won't be able to receive any new mail until the size of your mailbox is reduced.
Please remove unnecessary mails/attachments from your mailbox, clean the TRASH folder.
EOF
