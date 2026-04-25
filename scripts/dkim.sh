#!/bin/sh

domain=$1

([ -e /data/dkim/KeyTable ] && [ -e /data/dkim/SigningTable ] && [ -e /data/dkim/TrustedHosts ]) || (
[ -e /data/dkim/main.private ] || /usr/bin/opendkim-genkey -r -s $domain -d $domain -D /data/dkim

truncate /data/dkim/KeyTable -s 0
truncate /data/dkim/SigningTable -s 0
echo -e "127.0.0.1\n::1\n172.16.0.0/12\nfc00::/7" > /data/dkim/TrustedHosts
echo "mail._domainkey.$domain $domain:mail:/data/dkim/$domain.private" >> /data/dkim/KeyTable
echo "*@$domain mail._domainkey.$domain" >> /data/dkim/SigningTable
)

sed -i "1s/${domain}/mail/" /data/dkim/$domain.txt
chown -R opendkim:mail /data/dkim
chmod 444 /data/dkim/*.private
chmod 444 /data/dkim/*.txt

