# Kirpich MailServer

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Platform](https://img.shields.io/badge/platform-linux/amd64-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

Comprehensive, lightweight, and high-performance mail server based on **Alpine Linux 3.19**. Designed for speed, security, and ease of management.

## 🚀 Key Features

*   **Full Stack**: Postfix, Dovecot, MariaDB, Rspamd, and Nginx.
*   **Webmail Options**: Built-in **Roundcube** and **SnappyMail**.
*   **ActiveSync**: **Z-Push** support for mobile synchronization.
*   **Security**: Integrated **Fail2ban**, **OpenDKIM**, and **Rspamd** for spam filtering.
*   **Admin Panel**: Custom [MailAdmin](https://github.com/kirpicheff/mailadmin) UI for easy domain and mailbox management.
*   **Performance**: Optimized TCP stack and lightweight Alpine footprint.
*   **Auto-SSL**: Built-in Let's Encrypt support via Certbot.

## 🛠 Quick Start

> [!IMPORTANT]
> This repository does not include the `mailadmin` binary. You must download the latest release from the [MailAdmin repository](https://github.com/kirpicheff/mailadmin) and place it in `rootfs/opt/mailadmin/mailadmin` before building the Docker image.

To run the mail server, use the following command:


```bash
docker run -d \
    --name mailserver \
    --restart unless-stopped \
    -v /opt/mailserver/data:/data \
    -v /opt/mailserver/certs:/etc/letsencrypt \
    -e MARIADB_USER=postfix \
    -e MARIADB_PASS=password \
    -e SETUP_PASSWORD=admin \
    -e MAIN_DOMAIN=example.com \
    -e MAIL_SERVER=mail.example.com \
    -p 25:25 -p 80:80 -p 443:443 -p 587:587 -p 993:993 -p 4190:4190 -p 9999:9999 \
    kirpich/mailserver
```

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `MAIN_DOMAIN` | Your primary mail domain | `example.com` |
| `MAIL_SERVER` | FQDN of the mail server | `mail.example.com` |
| `MARIADB_USER` | Database user for mail services | `postfix` |
| `MARIADB_PASS` | Database password | `password` |
| `SETUP_PASSWORD` | Password for the MailAdmin panel | `admin` |
| `MESSAGE_SIZE` | Max email size (bytes) | `52428800` |
| `UPLOAD_SIZE` | PHP Upload Max Filesize | `25M` |

## 📁 Persistence

All important data is stored in the `/data` volume (map this to a persistent path on your host):
*   `/data/mail`: Mailboxes (vmail storage)
*   `/data/mysql`: MariaDB databases and system tables
*   `/data/cert`: Let's Encrypt certificates
*   `/data/dkim`: OpenDKIM keys and configs
*   `/data/rspamd`: Spam filtering rules, Bayes databases, and maps
*   `/data/fail2ban`: Security logs and sqlite database

## 🔄 Updates

To update to the latest version, run:
```bash
docker pull kirpich/mailserver
docker stop mailserver
docker rm mailserver
# Re-run your start command or script
```

> [!NOTE]
> If you are using the source repository, you can use the included `update.sh` (for regular updates) or `upgrade.sh` (for database migrations) helper scripts.

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

