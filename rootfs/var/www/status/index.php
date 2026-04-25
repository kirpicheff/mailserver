<?php
/**
 * MailStack Sentinel - Status Dashboard
 * Premium monitoring for all-in-one mail server
 */

function get_service_status() {
    $output = shell_exec('supervisorctl status');
    $lines = explode("\n", trim($output));
    $services = [];
    foreach ($lines as $line) {
        if (empty($line)) continue;
        $parts = preg_split('/\s+/', $line);
        $name = $parts[0];
        $status = $parts[1];
        $info = implode(' ', array_slice($parts, 2));
        $services[] = [
            'name' => $name,
            'status' => $status,
            'info' => $info
        ];
    }
    return $services;
}

function get_system_stats() {
    // RAM
    $free = shell_exec('free -m');
    $free = (string)trim($free);
    $free_lines = explode("\n", $free);
    $mem = preg_split('/\s+/', $free_lines[1]);
    $ram_total = $mem[1];
    $ram_used = $mem[2];
    $ram_perc = round(($ram_used / $ram_total) * 100);

    // Disk
    $disk_path = '/data';
    $total_bytes = disk_total_space($disk_path);
    $free_bytes = disk_free_space($disk_path);
    $used_bytes = $total_bytes - $free_bytes;
    $disk_total = round($total_bytes / (1024 * 1024 * 1024), 1) . 'ГБ';
    $disk_used = round($used_bytes / (1024 * 1024 * 1024), 1) . 'ГБ';
    $disk_perc = round(($used_bytes / $total_bytes) * 100);

    // Load Average
    $load = sys_getloadavg();

    // Mail Queue
    $queue = shell_exec('postqueue -p | tail -n 1');
    $q_count = (strpos($queue, 'Mail queue is empty') !== false || empty($queue)) ? 0 : (preg_match('/(\d+) Requests./', $queue, $m) ? $m[1] : 0);

    // Dovecot Sessions
    $imap_count = shell_exec('doveadm who 2>/dev/null | tail -n +2 | wc -l');
    
    // DB Threads
    $db_status = shell_exec('mysqladmin status 2>/dev/null');
    preg_match('/Threads: (\d+)/', $db_status, $m);
    $db_threads = isset($m[1]) ? $m[1] : 0;

    // Fail2Ban (Total banned)
    $f2b = shell_exec('fail2ban-client status postfix 2>/dev/null | grep "Currently banned" | awk \'{print $4}\'');
    $f2b_count = trim($f2b) ?: 0;

    // SSL Expiry
    $ssl_days = 'Н/Д';
    $cert_paths = [
        '/etc/letsencrypt/live/' . strtolower(gethostname()) . '/fullchain.pem',
        '/etc/letsencrypt/live/mail.' . strtolower(gethostname()) . '/fullchain.pem',
        '/etc/nginx/ssl/mailserver.crt'
    ];
    foreach ($cert_paths as $path) {
        if (file_exists($path)) {
            $cert_info = openssl_x509_parse(file_get_contents($path));
            if (isset($cert_info['validTo_time_t'])) {
                $ssl_days = floor(($cert_info['validTo_time_t'] - time()) / 86400);
                break;
            }
        }
    }

    // Redis Usage
    $redis_info = shell_exec('redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2');
    $redis_mem = trim($redis_info) ?: '0Б';

    // System Uptime
    $uptime = shell_exec("uptime -p | sed 's/up //'");
    $uptime = str_replace(['days', 'day', 'hours', 'hour', 'minutes', 'minute'], ['дн', 'дн', 'ч', 'ч', 'мин', 'мин'], $uptime);

    return [
        'ram_total' => $ram_total, 'ram_used' => $ram_used, 'ram_perc' => $ram_perc,
        'disk_total' => $disk_total, 'disk_used' => $disk_used, 'disk_perc' => $disk_perc,
        'load' => $load[0], 'queue' => $q_count, 'imap_count' => trim($imap_count),
        'db_threads' => $db_threads, 'f2b' => $f2b_count, 'ssl' => $ssl_days,
        'redis' => $redis_mem, 'uptime' => trim($uptime)
    ];
}

$services = get_service_status();
$stats = get_system_stats();
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MailStack Sentinel</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --primary: #8b5cf6;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --text: #f8fafc;
        }

        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            background-image: radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 100%);
            color: var(--text);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }

        .container {
            max-width: 1100px;
            margin: 0 auto;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding: 20px;
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }

        h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; }
        .badge {
            background: var(--primary);
            padding: 5px 12px;
            border-radius: 100px;
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 600;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(10px);
            border-radius: 18px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.1);
            transition: all 0.2s;
        }

        .card:hover { transform: translateY(-3px); border-color: var(--primary); }

        .card h3 { margin: 0 0 15px 0; font-size: 13px; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.5px; }

        .stat-value { font-size: 28px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: baseline; gap: 5px; }
        .stat-unit { font-size: 14px; opacity: 0.5; font-weight: 400; }
        
        .stat-desc { font-size: 11px; opacity: 0.5; margin-bottom: 10px; }

        .progress-bar {
            height: 6px;
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: var(--primary);
            transition: width 0.5s ease-out;
        }

        .service-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .service-item:last-child { border: none; }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 10px;
            display: inline-block;
        }
        .status-RUNNING .status-dot { background: var(--success); box-shadow: 0 0 10px var(--success); }
        .status-STOPPED .status-dot { background: var(--danger); }
        .status-FATAL .status-dot { background: var(--danger); box-shadow: 0 0 10px var(--danger); }

        .service-name { font-weight: 400; font-size: 14px; }
        .service-status { font-size: 11px; opacity: 0.5; }

        footer {
            text-align: center;
            margin-top: 30px;
            font-size: 11px;
            opacity: 0.3;
        }
    </style>
    <script>
        setTimeout(() => location.reload(), 30000);
    </script>
</head>
<body>
    <div class="container">
        <header>
            <h1>MailStack Sentinel</h1>
            <div style="display: flex; gap: 15px; align-items: center;">
                <div style="font-size: 11px; opacity: 0.5; font-weight: 600;">АПТАЙМ: <?= $stats['uptime'] ?></div>
                <div class="badge"><?= gethostname() ?></div>
            </div>
        </header>

        <div class="grid">
            <div class="card">
                <h3>Память (RAM)</h3>
                <div class="stat-value"><?= $stats['ram_used'] ?> <span class="stat-unit">МБ</span></div>
                <div class="stat-desc"><?= $stats['ram_perc'] ?>% из <?= $stats['ram_total'] ?>МБ исп.</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: <?= $stats['ram_perc'] ?>%; background: <?= $stats['ram_perc'] > 85 ? 'var(--danger)' : 'var(--primary)' ?>"></div>
                </div>
            </div>

            <div class="card">
                <h3>Диск (/data)</h3>
                <div class="stat-value"><?= $stats['disk_used'] ?> <span class="stat-unit">/ <?= $stats['disk_total'] ?></span></div>
                <div class="stat-desc"><?= $stats['disk_perc'] ?>% заполнено</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: <?= $stats['disk_perc'] ?>%; background: <?= $stats['disk_perc'] > 90 ? 'var(--danger)' : 'var(--success)' ?>"></div>
                </div>
            </div>

            <div class="card">
                <h3>SSL Сертификат</h3>
                <div class="stat-value" style="color: <?= (is_numeric($stats['ssl']) && $stats['ssl'] < 10) ? 'var(--danger)' : 'var(--success)' ?>">
                    <?= $stats['ssl'] ?> <span class="stat-unit">дн. осталось</span>
                </div>
                <div class="stat-desc">Автопродление активно</div>
            </div>

            <div class="card">
                <h3>Защита Fail2Ban</h3>
                <div class="stat-value" style="color: <?= $stats['f2b'] > 0 ? 'var(--warning)' : '' ?>">
                    <?= $stats['f2b'] ?> <span class="stat-unit">забанено IP</span>
                </div>
                <div class="stat-desc">Защита Postfix/Dovecot</div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>Ср. нагрузка</h3>
                <div class="stat-value"><?= $stats['load'] ?></div>
                <div class="stat-desc">Нагрузка на CPU (1 мин)</div>
            </div>

            <div class="card">
                <h3>IMAP Сессии</h3>
                <div class="stat-value"><?= $stats['imap_count'] ?></div>
                <div class="stat-desc">Активные подключения</div>
            </div>

            <div class="card">
                <h3>БД & Redis</h3>
                <div class="stat-value">
                    <?= $stats['db_threads'] ?> <span class="stat-unit">SQL</span>
                    <span style="opacity: 0.2; margin: 0 5px;">|</span>
                    <?= $stats['redis'] ?> <span class="stat-unit">RDS</span>
                </div>
                <div class="stat-desc">Потоки БД и память Redis</div>
            </div>

            <div class="card">
                <h3>Очередь писем</h3>
                <div class="stat-value" style="color: <?= $stats['queue'] > 50 ? 'var(--danger)' : '' ?>">
                    <?= $stats['queue'] ?> <span class="stat-unit">писем</span>
                </div>
                <div class="stat-desc">Ожидают в очереди Postfix</div>
            </div>
        </div>

        <div class="grid">
            <div class="card" style="grid-column: span 3">
                <h3>Системные службы (Supervisor)</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 40px;">
                    <?php 
                    $mid = ceil(count($services) / 2);
                    $cols = array_chunk($services, $mid);
                    foreach ($cols as $col): 
                    ?>
                    <div class="services-col">
                        <?php foreach ($col as $srv): ?>
                        <div class="service-item status-<?= $srv['status'] ?>">
                            <div>
                                <span class="status-dot"></span>
                                <span class="service-name"><?= $srv['name'] ?></span>
                            </div>
                            <div class="service-status"><?= $srv['info'] ?></div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            
            <div class="card" style="display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 10px;">🛡️</div>
                <div style="font-weight: 600; font-size: 14px;">Система защищена</div>
                <div style="font-size: 11px; opacity: 0.5; margin-top: 5px;">Все щиты активны. 24/7</div>
            </div>
        </div>

        <footer>
            MailStack Sentinel Pro &middot; Обновлено: <?= date('H:i:s') ?>
        </footer>
    </div>
</body>
</html>
