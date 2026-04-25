# Fail2Ban filter for selected Postfix SMTP rejections
#
#

[INCLUDES]

# Read common prefixes. If any customizations available -- read them from
# common.local
before = common.conf

[Definition]
_daemon = postfix/smtpd
failregex = ^%(__prefix_line)swarning: [-._\w]+\[\]: SASL (?:LOGIN|PLAIN|(?:CRAM|DIGEST)-MD5) authentication failed(: [ A-Za-z0-9+/]*={0,2})?\s*$
ignoreregex =
