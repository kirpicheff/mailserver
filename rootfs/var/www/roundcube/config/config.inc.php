<?php
$config = [];
$config['db_dsnw'] = 'mysql://{{ MARIADB_USER }}:{{ ROUNDCUBE_DB_PASS }}@localhost/roundcube';
$config['imap_host'] = 'ssl://localhost:993';
$config['smtp_host'] = 'tls://localhost:587';

// Настройки для обхода проверки сертификата на localhost
$config['imap_conn_options'] = array(
    'ssl' => array(
        'verify_peer'       => false,
        'verify_peer_name'  => false,
        'allow_self_signed' => true,
    ),
);
$config['smtp_conn_options'] = array(
    'ssl' => array(
        'verify_peer'       => false,
        'verify_peer_name'  => false,
        'allow_self_signed' => true,
    ),
);
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['support_url'] = '';
$config['product_name'] = 'Roundcube Webmail';
$config['des_key'] = 'rcmail-perf-{{ SETUP_PASSWORD }}';
$config['plugins'] = [
    'archive',
    'zipdownload',
    'managesieve',
    'password',
];
$config['skin'] = 'elastic';
$config['language'] = 'ru_RU';
$config['drafts_mbox'] = 'Drafts';
$config['junk_mbox'] = 'Junk';
$config['sent_mbox'] = 'Sent';
$config['trash_mbox'] = 'Trash';
$config['create_default_folders'] = true;
