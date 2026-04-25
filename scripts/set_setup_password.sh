#!/bin/sh

hash_pass=$(php -r "echo password_hash('$1', PASSWORD_DEFAULT);")

if grep -q "^\$CONF\['setup_password'\]" /etc/postfixadmin/config.inc.php; then
    sed -i "s|^\$CONF\['setup_password'\].*|\$CONF['setup_password'] = '$hash_pass';|" /etc/postfixadmin/config.inc.php
else
    echo "\$CONF['setup_password'] = '$hash_pass';" >> /etc/postfixadmin/config.inc.php
fi
