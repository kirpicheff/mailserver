#!/bin/sh

if [ ! -e /data/.bayes_learn ]
then

wget http://rspamd.com/rspamd_statistics/bayes.spam.sqlite -O /tmp/bayes.spam.sqlite
rspamadm statconvert -d /tmp/bayes.spam.sqlite -h 127.0.0.1 -s BAYES_SPAM
wget http://rspamd.com/rspamd_statistics/bayes.ham.sqlite -O /tmp/bayes.ham.sqlite
rspamadm statconvert -d /tmp/bayes.ham.sqlite -h 127.0.0.1 -s BAYES_HAM
rm -rf /tmp/bayes*
touch /data/.bayes_learn

fi


if [ "$1" == "learn" ]; then
rspamc -c bayes learn_spam /data/mail/*/*/.Junk/{cur,new}
rspamc -c bayes learn_ham /data/mail/*/*/cur
mkdir /data/spamassassin/backups

fi


