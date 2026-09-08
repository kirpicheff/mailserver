/**
 * Плагин «Антифишинг и аудит безопасности» (Email Security Inspector) для WallMail.
 * 100% изолированный клиентский модуль аудита входящих писем.
 */

const STORAGE_KEY_AUTH = 'wallmail_sec_auth_check'
const STORAGE_KEY_HOMOGLYPH = 'wallmail_sec_homoglyph_check'
const STORAGE_KEY_LINKS = 'wallmail_sec_links_check'

function isAuthCheckEnabled() {
  return localStorage.getItem(STORAGE_KEY_AUTH) !== 'false'
}

function isHomoglyphCheckEnabled() {
  return localStorage.getItem(STORAGE_KEY_HOMOGLYPH) !== 'false'
}

function isLinksCheckEnabled() {
  return localStorage.getItem(STORAGE_KEY_LINKS) !== 'false'
}

// Список известных брендов и сервисов для проверки попыток спуфинга имени
const KNOWN_BRANDS = [
  { name: 'сбер', domainRegex: /(?:^|\.)sber(?:bank)?\.ru$/i },
  { name: 'тинькофф', domainRegex: /(?:^|\.)tinkoff\.ru$|(?:^|\.)t-bank\.ru$/i },
  { name: 't-bank', domainRegex: /(?:^|\.)t-bank\.ru$|(?:^|\.)tinkoff\.ru$/i },
  { name: 'госуслуги', domainRegex: /(?:^|\.)gosuslugi\.ru$/i },
  { name: 'яндекс', domainRegex: /(?:^|\.)yandex\.(?:ru|com|by|kz)$/i },
  { name: 'yandex', domainRegex: /(?:^|\.)yandex\.(?:ru|com|by|kz)$/i },
  { name: 'google', domainRegex: /(?:^|\.)google\.com$|(?:^|\.)gmail\.com$/i },
  { name: 'гугл', domainRegex: /(?:^|\.)google\.com$|(?:^|\.)gmail\.com$/i },
  { name: 'вконтакте', domainRegex: /(?:^|\.)vk\.com$|(?:^|\.)vk\.ru$/i },
  { name: 'mail.ru', domainRegex: /(?:^|\.)mail\.ru$|(?:^|\.)bk\.ru$|(?:^|\.)inbox\.ru$/i },
  { name: 'авито', domainRegex: /(?:^|\.)avito\.ru$/i },
  { name: 'telegram', domainRegex: /(?:^|\.)telegram\.org$/i }
]

/**
 * Проверка строки домена на наличие смешанных алфавитов (гомоглифы кириллица/латиница)
 */
function detectMixedScript(domain) {
  if (!domain || typeof domain !== 'string') return null

  // Удаляем точки в доменном имени
  const clean = domain.replace(/\./g, '').toLowerCase()
  const hasCyrillic = /[\u0400-\u04FF]/.test(clean)
  const hasLatin = /[a-zA-Z]/.test(clean)

  if (hasCyrillic && hasLatin) {
    return {
      type: 'mixed_script',
      description: 'Домен отправителя содержит скрытую смесь латинских и кириллических букв (визуальная подмена символов)'
    }
  }

  // Проверка на характерные подмены (например, 0 вместо o в известных словах)
  if (/\b(?:g00gle|sberb0nk|y0ndex|p0ypal|micr0soft)\b/i.test(clean)) {
    return {
      type: 'digit_substitution',
      description: 'Домен отправителя содержит цифры вместо букв для имитации известного бренда'
    }
  }

  return null
}

/**
 * Анализ служебных заголовков Authentication-Results и Received-SPF
 */
function analyzeAuthHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return { status: 'none', details: [] }
  }

  const authRes = (headers['Authentication-Results'] || '').toLowerCase()
  const recSPF = (headers['Received-SPF'] || '').toLowerCase()
  const dkimSig = headers['DKIM-Signature'] || ''
  const received = (headers['Received'] || '')

  let spf = 'unknown'
  let dkim = 'unknown'
  let dmarc = 'unknown'
  const details = []

  // Парсинг внутренней/локальной авторизации (ORIGINATING auth=pass или Postfix with ESMTPSA)
  const hops = received.split(/\n---\n/i).map(h => h.trim()).filter(Boolean)
  let isLocalPostfixAuth = false
  for (const hop of hops) {
    const lowerHop = hop.toLowerCase()
    // Наш почтовый сервер зафиксировал авторизованный сеанс клиента (ESMTPSA)
    if (lowerHop.includes('(postfix) with esmtpsa') || lowerHop.includes('with esmtpsa') || lowerHop.includes('(authenticated sender:')) {
      isLocalPostfixAuth = true
      break
    }
  }

  let isOriginatingAuth = false
  if (authRes.includes('auth=pass') || authRes.includes('originating') || isLocalPostfixAuth) {
    isOriginatingAuth = true
    spf = 'pass'
    dmarc = 'pass'
    if (dkimSig || dkim === 'unknown') {
      dkim = 'pass'
    }
    details.push({ key: 'AUTH', status: 'pass', text: 'SMTP AUTH: Письмо принято сервером через авторизованный сеанс (ESMTPSA)' })
  }

  // Парсинг SPF
  if (authRes.includes('spf=pass') || recSPF.startsWith('pass')) {
    spf = 'pass'
    details.push({ key: 'SPF', status: 'pass', text: 'SPF: Подлинность сервера отправки подтверждена' })
  } else if (authRes.includes('spf=fail') || recSPF.startsWith('fail') || recSPF.startsWith('hardfail')) {
    spf = 'fail'
    details.push({ key: 'SPF', status: 'fail', text: 'SPF: Сервер отправки не авторизован владельцем домена' })
  } else if (authRes.includes('spf=softfail') || recSPF.startsWith('softfail')) {
    spf = 'softfail'
    details.push({ key: 'SPF', status: 'warning', text: 'SPF: Предупреждение (softfail)' })
  } else if (authRes.includes('spf=neutral') || recSPF.startsWith('neutral')) {
    spf = 'neutral'
    details.push({ key: 'SPF', status: 'neutral', text: 'SPF: Нейтральный статус' })
  }

  // Парсинг DKIM
  if (authRes.includes('dkim=pass') || (isOriginatingAuth && dkimSig)) {
    dkim = 'pass'
    details.push({ key: 'DKIM', status: 'pass', text: 'DKIM: Цифровая криптографическая подпись сервера валидна' })
  } else if (authRes.includes('dkim=fail')) {
    dkim = 'fail'
    details.push({ key: 'DKIM', status: 'fail', text: 'DKIM: Цифровая подпись письма недействительна или повреждена' })
  } else if (dkimSig && dkim === 'unknown') {
    dkim = 'pass'
    details.push({ key: 'DKIM', status: 'pass', text: 'DKIM: Присутствует валидная сигнатура сервера' })
  }

  // Парсинг DMARC
  if (authRes.includes('dmarc=pass') || isOriginatingAuth) {
    dmarc = 'pass'
    details.push({ key: 'DMARC', status: 'pass', text: 'DMARC: Политика домена полностью соблюдена' })
  } else if (authRes.includes('dmarc=fail')) {
    dmarc = 'fail'
    details.push({ key: 'DMARC', status: 'fail', text: 'DMARC: Письмо провалило политику защиты от подделки домена' })
  }

  let overall = 'none'
  if (spf === 'fail' || dkim === 'fail' || dmarc === 'fail') {
    overall = 'fail'
  } else if (isOriginatingAuth || (spf === 'pass' && dkim === 'pass')) {
    overall = 'pass'
  } else if (spf === 'pass' || dkim === 'pass') {
    overall = 'pass'
  } else if (spf === 'softfail' || spf === 'neutral') {
    overall = 'warning'
  }

  return { status: overall, spf, dkim, dmarc, isOriginatingAuth, details, raw: authRes || recSPF }
}

/**
 * Извлечение корневого домена второго уровня (eTLD+1) с учетом двухуровневых зон (.com.ru, .co.uk и др.)
 */
function getRootDomain(hostname) {
  if (!hostname || typeof hostname !== 'string') return ''
  const parts = hostname.toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')

  const twoLevelTLDs = ['com.ru', 'net.ru', 'org.ru', 'pp.ru', 'msk.ru', 'spb.ru', 'co.uk', 'org.uk', 'gov.uk', 'com.ua', 'co.il']
  const lastTwo = parts.slice(-2).join('.')
  if (twoLevelTLDs.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.')
  }

  return parts.slice(-2).join('.')
}

/**
 * Проверка несовпадения видимого текста ссылок и реального URL (Маскированные фишинговые ссылки)
 */
function analyzeMaskedLinks(htmlBody) {
  if (!htmlBody || typeof htmlBody !== 'string') return []

  const warnings = []
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = linkRegex.exec(htmlBody)) !== null) {
    const href = match[1].trim()
    const text = match[2].replace(/<[^>]+>/g, '').trim()

    // Если видимый текст ссылки выглядит как URL (содержит http/https или домен)
    if (/^https?:\/\/[a-z0-9.-]+/i.test(text) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(text)) {
      try {
        let visibleUrl = text
        if (!visibleUrl.startsWith('http://') && !visibleUrl.startsWith('https://')) {
          visibleUrl = 'http://' + visibleUrl
        }
        const visibleHost = new URL(visibleUrl).hostname.toLowerCase()
        const targetHost = new URL(href).hostname.toLowerCase()

        const visibleRoot = getRootDomain(visibleHost)
        const targetRoot = getRootDomain(targetHost)

        // Если корневой домен разный (например, sberbank.ru vs evil-site.com) — это фишинг.
        // Если это разные поддомены одного и того же сервиса (logist.kontur.ru и mail.kontur.ru) — это легитимно.
        if (visibleRoot && targetRoot && visibleRoot !== targetRoot) {
          warnings.push({
            visible: text,
            target: href,
            visibleHost,
            targetHost
          })
        }
      } catch (e) {
        // Игнорируем невалидные URL
      }
    }
  }

  return warnings
}

/**
 * Комплексный аудит безопасности сообщения
 */
function auditMessageSecurity(msg) {
  if (!msg) return null

  const threats = []
  const warnings = []
  const successes = []

  const fromObj = msg.from && msg.from[0] ? msg.from[0] : null
  const fromAddress = fromObj && fromObj.address ? fromObj.address.toLowerCase() : ''
  const fromName = fromObj && fromObj.name ? fromObj.name : ''
  const fromDomain = fromAddress.includes('@') ? fromAddress.split('@')[1] : ''
  const returnPath = msg.return_path ? msg.return_path.toLowerCase() : ''

  // 1. Аудит заголовков SPF / DKIM / DMARC
  let authResult = { status: 'none', details: [] }
  if (isAuthCheckEnabled()) {
    authResult = analyzeAuthHeaders(msg.security_headers)
    if (authResult.status === 'fail') {
      threats.push('Сервер отправителя провалил проверку подлинности (SPF/DKIM/DMARC fail)')
    } else if (authResult.status === 'warning') {
      warnings.push('Подлинность письма подтверждена не полностью (SPF softfail/neutral)')
    } else if (authResult.status === 'pass') {
      successes.push('Подлинность отправителя успешно подтверждена (SPF / DKIM)')
    }
  }

  // 2. Аудит авторизации на почтовом сервере (SMTP AUTH) и защита от подделки доменов
  const headers = msg.security_headers || {}
  const authUser = (headers['X-Authenticated-User'] || '').toLowerCase()
  const authSender = (headers['X-Authenticated-Sender'] || '').toLowerCase()
  const authRes = (headers['Authentication-Results'] || '').toLowerCase()

  // Извлекаем учетную запись авторизации из заголовка smtp.auth (если сервер зафиксировал)
  const smtpAuthMatch = authRes.match(/smtp\.auth=([^\s;]+)/i)
  const authenticatedUser = smtpAuthMatch ? smtpAuthMatch[1] : (authUser || authSender)

  // Флаг: письмо отправлено пользователем, авторизованным на почтовом сервере (работает для любых доменов на сервере)
  const isServerAuthenticated =
    authResult.isOriginatingAuth ||
    authRes.includes('auth=pass') ||
    Boolean(authenticatedUser)

  // Проверяем, является ли письмо собственным исходящим письмом пользователя или черновиком
  const folderLower = (msg.folder || '').toLowerCase()
  const isSentOrDraftFolder = /sent|отправленн|draft|черновик|outbox/i.test(folderLower)
  const isOwnAccountSender = Boolean(msg.account_email && fromAddress && msg.account_email.toLowerCase() === fromAddress)
  const hasReceivedHeaders = Boolean(headers['Received'])

  if (isServerAuthenticated || isSentOrDraftFolder || isOwnAccountSender) {
    // Письмо отправлено локальным авторизованным пользователем или находится в папке Отправленные/Черновики
    isCorporateVerified = true
    if (isSentOrDraftFolder || isOwnAccountSender) {
      successes.push('Исходящее письмо пользователя (сохранено на сервере)')
    } else {
      const authNote = authenticatedUser ? ` (учетная запись: ${authenticatedUser})` : ''
      successes.push(`Письмо отправлено авторизованным пользователем почтового сервера${authNote}`)
    }
  } else {
    // Письмо пришло извне. Проверяем, не пытается ли внешний отправитель подделать адрес получателя
    // Проверка на спуфинг выполняется только если письмо реально пришло через внешнюю доставку (есть заголовки Received)
    const allRecipients = (msg.to || []).concat(msg.cc || [])
    const recipientDomains = allRecipients
      .map(r => r.address && r.address.includes('@') ? r.address.split('@')[1].toLowerCase() : '')
      .filter(Boolean)

    const accountDomain = msg.account_email && msg.account_email.includes('@')
      ? msg.account_email.toLowerCase().split('@')[1]
      : ''

    const fromRoot = getRootDomain(fromDomain)

    const isImpersonatingLocalDomain = fromDomain && (
      recipientDomains.some(rd => rd === fromDomain || (fromRoot && getRootDomain(rd) === fromRoot)) ||
      (accountDomain && (accountDomain === fromDomain || (fromRoot && getRootDomain(accountDomain) === fromRoot)))
    )

    if (hasReceivedHeaders && isImpersonatingLocalDomain && authResult.status !== 'pass') {
      threats.push(`Внимание: Письмо отправлено якобы с корпоративного адреса (@${fromDomain}), но отправка НЕ была авторизована на почтовом сервере. Возможно, это попытка подделки или фишинга (CEO Fraud)!`)
    }
  }

  // 3. Аудит гомоглифов и подделки домена
  if (isHomoglyphCheckEnabled() && fromDomain) {
    const homoglyph = detectMixedScript(fromDomain)
    if (homoglyph) {
      threats.push(homoglyph.description)
    }

    // Проверка попытки выдать себя за известный бренд с левого домена
    if (fromName) {
      const lowerName = fromName.toLowerCase()
      for (const brand of KNOWN_BRANDS) {
        if (lowerName.includes(brand.name) && !brand.domainRegex.test(fromDomain)) {
          threats.push(`Отображаемое имя «${fromName}» имитирует известный бренд, но отправлено со стороннего домена (${fromDomain})`)
          break
        }
      }

      // Проверка: в имени отправителя указан email, не совпадающий с реальным адресом
      const emailInNameMatch = fromName.match(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i)
      if (emailInNameMatch && emailInNameMatch[0].toLowerCase() !== fromAddress) {
        threats.push(`Отображаемое имя содержит чужой адрес «${emailInNameMatch[0]}», скрывая реальный адрес отправителя (${fromAddress})`)
      }
    }

    // Проверка несовпадения From и Return-Path (с учетом общего корневого домена)
    if (returnPath && returnPath.includes('@')) {
      const returnDomain = returnPath.split('@')[1]
      const returnRoot = getRootDomain(returnDomain)
      const fromRoot = getRootDomain(fromDomain)
      if (returnRoot && fromRoot && returnRoot !== fromRoot) {
        warnings.push(`Технический адрес возврата (Return-Path: ${returnPath}) не совпадает с доменом отправителя (@${fromDomain})`)
      }
    }
  }

  // 4. Аудит маскированных ссылок (для внешних неавторизованных писем)
  if (isLinksCheckEnabled() && !isCorporateVerified && !isServerAuthenticated) {
    const maskedLinks = analyzeMaskedLinks(msg.body_html)
    if (maskedLinks.length > 0) {
      warnings.push(`В письме обнаружены ссылки с несовпадением текста (${maskedLinks[0].visibleHost}) и фактического адреса перехода (${maskedLinks[0].targetHost})`)
    }
  }

  let level = 'info'
  if (threats.length > 0) {
    level = 'danger'
  } else if (warnings.length > 0) {
    level = 'warning'
  } else if (isCorporateVerified) {
    level = 'internal'
  } else if (successes.length > 0) {
    level = 'secure'
  }

  return {
    level,
    threats,
    warnings,
    successes,
    authResult,
    isCorporateVerified,
    fromAddress,
    fromDomain,
    returnPath,
    headers: msg.security_headers || {}
  }
}

/**
/**
 * Внедрение адаптивных CSS-стилей для светлой и темной тем
 */
function ensureSecurityInspectorStyles() {
  if (document.getElementById('wallmail-security-inspector-styles')) return

  const style = document.createElement('style')
  style.id = 'wallmail-security-inspector-styles'
  style.textContent = `
    /* Уведомления и блоки безопасности в модальном окне */
    .sec-notice-box {
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Корпоративная переписка */
    .sec-notice-box.corporate {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.35);
    }
    .sec-notice-box.corporate .sec-notice-title {
      font-weight: 600;
      font-size: 13px;
      color: #1d4ed8;
      margin-bottom: 4px;
    }
    .sec-notice-box.corporate .sec-notice-desc {
      font-size: 12px;
      color: #1e40af;
      line-height: 1.4;
    }
    [data-mode="dark"] .sec-notice-box.corporate,
    [data-theme-mode="dark"] .sec-notice-box.corporate {
      background: rgba(59, 130, 246, 0.15);
      border-color: rgba(59, 130, 246, 0.4);
    }
    [data-mode="dark"] .sec-notice-box.corporate .sec-notice-title,
    [data-theme-mode="dark"] .sec-notice-box.corporate .sec-notice-title {
      color: #93c5fd;
    }
    [data-mode="dark"] .sec-notice-box.corporate .sec-notice-desc,
    [data-theme-mode="dark"] .sec-notice-box.corporate .sec-notice-desc {
      color: #bfdbfe;
    }

    /* Критические угрозы */
    .sec-notice-box.danger {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.35);
    }
    .sec-notice-box.danger .sec-notice-title {
      font-weight: 600;
      font-size: 13px;
      color: #b91c1c;
      margin-bottom: 6px;
    }
    .sec-notice-box.danger ul {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      color: #991b1b;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    [data-mode="dark"] .sec-notice-box.danger,
    [data-theme-mode="dark"] .sec-notice-box.danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
    }
    [data-mode="dark"] .sec-notice-box.danger .sec-notice-title,
    [data-theme-mode="dark"] .sec-notice-box.danger .sec-notice-title {
      color: #fca5a5;
    }
    [data-mode="dark"] .sec-notice-box.danger ul,
    [data-theme-mode="dark"] .sec-notice-box.danger ul {
      color: #fecaca;
    }

    /* Предупреждения */
    .sec-notice-box.warning {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    .sec-notice-box.warning .sec-notice-title {
      font-weight: 600;
      font-size: 13px;
      color: #b45309;
      margin-bottom: 6px;
    }
    .sec-notice-box.warning ul {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      color: #92400e;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    [data-mode="dark"] .sec-notice-box.warning,
    [data-theme-mode="dark"] .sec-notice-box.warning {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.4);
    }
    [data-mode="dark"] .sec-notice-box.warning .sec-notice-title,
    [data-theme-mode="dark"] .sec-notice-box.warning .sec-notice-title {
      color: #fcd34d;
    }
    [data-mode="dark"] .sec-notice-box.warning ul,
    [data-theme-mode="dark"] .sec-notice-box.warning ul {
      color: #fef3c7;
    }

    /* Статусы SPF/DKIM/DMARC */
    .sec-auth-card {
      background: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }
    .sec-auth-name {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 600;
    }
    .sec-auth-val {
      font-weight: 700;
      font-size: 14px;
      margin-top: 4px;
    }
    .sec-auth-val.pass {
      color: #16a34a;
    }
    .sec-auth-val.fail {
      color: #dc2626;
    }
    .sec-auth-val.unknown {
      color: var(--text-muted);
    }
    [data-mode="dark"] .sec-auth-val.pass,
    [data-theme-mode="dark"] .sec-auth-val.pass {
      color: #4ade80;
    }
    [data-mode="dark"] .sec-auth-val.fail,
    [data-theme-mode="dark"] .sec-auth-val.fail {
      color: #f87171;
    }

    /* Технические заголовки */
    .sec-raw-headers {
      background: var(--bg-app) !important;
      border: 1px solid var(--border-color) !important;
      color: var(--text-primary) !important;
      border-radius: 6px;
      padding: 12px;
      font-size: 11px;
      font-family: monospace;
      overflow-x: auto;
      white-space: pre-wrap;
      max-height: 180px;
    }

    /* Бейдж в шапке письма */
    .sec-sender-verified-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.15s ease;
    }
    .sec-sender-verified-pill:hover {
      filter: brightness(1.08);
    }
    .sec-sender-verified-pill.corporate {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.35);
      color: #1d4ed8;
    }
    .sec-sender-verified-pill.verified {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: #15803d;
    }
    [data-mode="dark"] .sec-sender-verified-pill.corporate,
    [data-theme-mode="dark"] .sec-sender-verified-pill.corporate {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    [data-mode="dark"] .sec-sender-verified-pill.verified,
    [data-theme-mode="dark"] .sec-sender-verified-pill.verified {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }

    /* Баннер предупреждений над телом письма */
    .sec-banner-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-radius: 6px;
      gap: 12px;
      font-size: 13px;
      color: var(--text-primary);
    }
    .sec-banner-box.warning {
      background-color: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    .sec-banner-box.warning .sec-banner-title {
      font-weight: 600;
      color: #b45309;
      font-size: 13px;
    }
    .sec-banner-box.warning svg {
      stroke: #b45309;
    }
    .sec-banner-box.danger {
      background-color: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.35);
    }
    .sec-banner-box.danger .sec-banner-title {
      font-weight: 600;
      color: #b91c1c;
      font-size: 13px;
    }
    .sec-banner-box.danger svg {
      stroke: #b91c1c;
    }

    [data-mode="dark"] .sec-banner-box.warning,
    [data-theme-mode="dark"] .sec-banner-box.warning {
      background-color: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.4);
    }
    [data-mode="dark"] .sec-banner-box.warning .sec-banner-title,
    [data-theme-mode="dark"] .sec-banner-box.warning .sec-banner-title {
      color: #fcd34d;
    }
    [data-mode="dark"] .sec-banner-box.warning svg,
    [data-theme-mode="dark"] .sec-banner-box.warning svg {
      stroke: #fcd34d;
    }

    [data-mode="dark"] .sec-banner-box.danger,
    [data-theme-mode="dark"] .sec-banner-box.danger {
      background-color: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
    }
    [data-mode="dark"] .sec-banner-box.danger .sec-banner-title,
    [data-theme-mode="dark"] .sec-banner-box.danger .sec-banner-title {
      color: #f87171;
    }
    [data-mode="dark"] .sec-banner-box.danger svg,
    [data-theme-mode="dark"] .sec-banner-box.danger svg {
      stroke: #f87171;
    }
  `
  document.head.appendChild(style)
}

/**
 * Открытие модального окна технических сведений о безопасности
 */
function openSecurityModal(audit) {
  ensureSecurityInspectorStyles()

  const existingModal = document.getElementById('wallmail-security-modal')
  if (existingModal) existingModal.remove()

  const modal = document.createElement('div')
  modal.id = 'wallmail-security-modal'
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
  `

  const badgeColor = audit.level === 'danger' ? '#ef4444' : audit.level === 'warning' ? '#f59e0b' : audit.level === 'internal' ? '#3b82f6' : '#22c55e'
  const titleText = audit.level === 'danger' ? 'Обнаружены угрозы безопасности' : audit.level === 'warning' ? 'Предупреждения безопасности' : audit.level === 'internal' ? 'Корпоративная почта (Авторизован)' : 'Подлинность письма подтверждена'

  modal.innerHTML = `
    <div style="
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 12px;
      width: 100%;
      max-width: 600px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      color: var(--text-primary, #0f172a);
      overflow: hidden;
      font-family: inherit;
    ">
      <!-- Шапка модального окна -->
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface-elevated, rgba(0,0,0,0.02));">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 12px; height: 12px; border-radius: 50%; background: ${badgeColor};"></div>
          <div style="font-weight: 700; font-size: 16px; color: var(--text-primary);">${titleText}</div>
        </div>
        <button id="sec-modal-close" style="background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
      </div>

      <!-- Содержимое -->
      <div style="padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px;">
        ${audit.threats.length > 0 ? `
          <div class="sec-notice-box danger">
            <div class="sec-notice-title">Обнаруженные критические угрозы:</div>
            <ul>
              ${audit.threats.map(t => `<li>${t}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${audit.warnings.length > 0 ? `
          <div class="sec-notice-box warning">
            <div class="sec-notice-title">Предупреждения:</div>
            <ul>
              ${audit.warnings.map(w => `<li>${w}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${audit.isCorporateVerified ? `
          <div class="sec-notice-box corporate">
            <div class="sec-notice-title">Внутренняя корпоративная переписка:</div>
            <div class="sec-notice-desc">Письмо отправлено авторизованным сотрудником через корпоративный почтовый сервер (SMTP AUTH).</div>
          </div>
        ` : ''}

        <!-- Проверки аутентификации -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="font-weight: 600; font-size: 13px; color: var(--text-secondary);">Результаты проверки подлинности:</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div class="sec-auth-card">
              <div class="sec-auth-name">SPF</div>
              <div class="sec-auth-val ${audit.authResult.spf}">
                ${audit.authResult.spf.toUpperCase()}
              </div>
            </div>
            <div class="sec-auth-card">
              <div class="sec-auth-name">DKIM</div>
              <div class="sec-auth-val ${audit.authResult.dkim}">
                ${audit.authResult.dkim.toUpperCase()}
              </div>
            </div>
            <div class="sec-auth-card">
              <div class="sec-auth-name">DMARC</div>
              <div class="sec-auth-val ${audit.authResult.dmarc}">
                ${audit.authResult.dmarc.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        <!-- Технические заголовки письма -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-weight: 600; font-size: 12px; color: var(--text-muted);">Технические заголовки аутентификации:</div>
          <pre class="sec-raw-headers">${Object.entries(audit.headers).map(([k, v]) => `${k}: ${v}`).join('\n') || '(Заголовки проверки подлинности отсутствуют в данном письме)'}</pre>
        </div>
      </div>

      <!-- Футер модалки -->
      <div style="padding: 14px 24px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; background: var(--bg-surface-elevated, rgba(0,0,0,0.02));">
        <button id="sec-modal-ok" style="
          padding: 8px 18px;
          background: var(--primary-accent, #3b82f6);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
        ">Закрыть</button>
      </div>
    </div>
  `

  document.body.appendChild(modal)

  const closeModal = () => {
    modal.remove()
  }

  modal.querySelector('#sec-modal-close').addEventListener('click', closeModal)
  modal.querySelector('#sec-modal-ok').addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })
}

export default {
  init(ctx) {
    ensureSecurityInspectorStyles()

    // 1. Компактный бейдж подтвержденной подлинности рядом с адресом отправителя
    ctx.registerHook('message:sender_badge', (context) => {
      const msg = context && context.message ? context.message : null
      if (!msg) return null

      const audit = auditMessageSecurity(msg)
      if (!audit || (audit.level !== 'secure' && audit.level !== 'internal')) {
        return null
      }

      return {
        id: 'sec-sender-verified',
        mount(container) {
          if (!container) return
          ensureSecurityInspectorStyles()

          const isInternal = audit.level === 'internal'
          const label = isInternal ? 'Корпоративная почта' : 'Подлинность подтверждена'
          const titleHint = isInternal
            ? 'Письмо отправлено сотрудником через корпоративный сервер (SMTP AUTH). Нажмите для сведений'
            : 'Подлинность отправителя подтверждена (SPF/DKIM: PASS). Нажмите для сведений'

          container.innerHTML = `
            <button type="button" class="sec-sender-verified-pill ${isInternal ? 'corporate' : 'verified'}" title="${titleHint}">
              ${isInternal ? `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4M9 11h2M13 11h2M9 15h2M13 15h2M9 19h2M13 19h2"></path>
                </svg>
              ` : `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  <polyline points="9 12 11 14 15 10"></polyline>
                </svg>
              `}
              <span>${label}</span>
            </button>
          `

          const btn = container.querySelector('.sec-sender-verified-pill')
          if (btn) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation()
              openSecurityModal(audit)
            })
          }
        }
      }
    })

    // 2. Отображение предупреждающих баннеров только при обнаружении угроз или предупреждений
    ctx.registerHook('message:banner', (context) => {
      const msg = context && context.message ? context.message : null
      if (!msg) return null

      const audit = auditMessageSecurity(msg)
      if (!audit || (audit.level !== 'danger' && audit.level !== 'warning')) {
        return null
      }

      return {
        id: 'security-inspector-banner',
        mount(container) {
          if (!container) return
          ensureSecurityInspectorStyles()

          const isDanger = audit.level === 'danger'
          const title = isDanger
            ? 'Внимание: Обнаружены признаки фишинга или подделки отправителя!'
            : 'Предупреждение безопасности отправителя'
          const subtitle = isDanger
            ? (audit.threats[0] || 'Письмо не прошло проверку подлинности.')
            : (audit.warnings[0] || 'Возможно несоответствие параметров сервера.')

          container.innerHTML = `
            <div class="sec-banner-box ${isDanger ? 'danger' : 'warning'}">
              <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <div class="sec-banner-title">${title}</div>
                  <div style="font-size: 12px; color: var(--text-secondary);">${subtitle}</div>
                </div>
              </div>
              <button type="button" class="btn-sec-details" style="
                padding: 4px 10px;
                background: var(--bg-surface, rgba(255, 255, 255, 0.08));
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--text-primary);
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                white-space: nowrap;
                transition: background 0.15s ease;
              ">Сведения</button>
            </div>
          `

          const btnDetails = container.querySelector('.btn-sec-details')
          if (btnDetails) {
            btnDetails.addEventListener('click', (e) => {
              e.stopPropagation()
              openSecurityModal(audit)
            })
          }
        }
      }
    })


    // 2. Регистрация вкладки настроек безопасности через хук settings:tab
    ctx.registerHook('settings:tab', () => {
      return {
        id: 'security-inspector',
        title: 'Антифишинг',
        icon: 'shield',
        description: 'Аудит подлинности писем (SPF/DKIM/DMARC), детекция фишинга и подделки доменов',
        mount(container) {
          if (!container) return

          const authEnabled = isAuthCheckEnabled()
          const homoglyphEnabled = isHomoglyphCheckEnabled()
          const linksEnabled = isLinksCheckEnabled()

          container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 20px;">
              <!-- 1. Проверка SPF/DKIM/DMARC -->
              <div style="background: var(--bg-app, rgba(255,255,255,0.03)); border: 1px solid var(--border-color, #374151); border-radius: 8px; padding: 16px;">
                <label style="display: flex; align-items: center; gap: 14px; cursor: pointer; user-select: none;">
                  <div style="position: relative; width: 38px; height: 20px; flex-shrink: 0;">
                    <input type="checkbox" id="sec-auth-toggle" ${authEnabled ? 'checked' : ''} style="position: absolute; opacity: 0; width: 0; height: 0;" />
                    <span class="sec-slider-auth" style="
                      position: absolute;
                      cursor: pointer;
                      top: 0; left: 0; right: 0; bottom: 0;
                      background-color: ${authEnabled ? 'var(--primary-accent, #3b82f6)' : 'var(--border-color, #4b5563)'};
                      border-radius: 20px;
                      transition: background-color 0.2s ease;
                      display: block;
                    ">
                      <span class="sec-thumb-auth" style="
                        position: absolute;
                        height: 14px;
                        width: 14px;
                        left: 3px;
                        bottom: 3px;
                        background-color: #ffffff;
                        border-radius: 50%;
                        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        transform: ${authEnabled ? 'translateX(18px)' : 'translateX(0)'};
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                        display: block;
                      "></span>
                    </span>
                  </div>
                  <div>
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-primary, #ffffff);">Проверка подлинности SPF / DKIM / DMARC</div>
                    <div style="font-size: 12px; color: var(--text-muted, #9ca3af); margin-top: 2px;">
                      Анализ криптографических подписей и политик безопасности сервера отправителя.
                    </div>
                  </div>
                </label>
              </div>

              <!-- 2. Защита от гомоглифов и поддельных доменов -->
              <div style="background: var(--bg-app, rgba(255,255,255,0.03)); border: 1px solid var(--border-color, #374151); border-radius: 8px; padding: 16px;">
                <label style="display: flex; align-items: center; gap: 14px; cursor: pointer; user-select: none;">
                  <div style="position: relative; width: 38px; height: 20px; flex-shrink: 0;">
                    <input type="checkbox" id="sec-homoglyph-toggle" ${homoglyphEnabled ? 'checked' : ''} style="position: absolute; opacity: 0; width: 0; height: 0;" />
                    <span class="sec-slider-homoglyph" style="
                      position: absolute;
                      cursor: pointer;
                      top: 0; left: 0; right: 0; bottom: 0;
                      background-color: ${homoglyphEnabled ? 'var(--primary-accent, #3b82f6)' : 'var(--border-color, #4b5563)'};
                      border-radius: 20px;
                      transition: background-color 0.2s ease;
                      display: block;
                    ">
                      <span class="sec-thumb-homoglyph" style="
                        position: absolute;
                        height: 14px;
                        width: 14px;
                        left: 3px;
                        bottom: 3px;
                        background-color: #ffffff;
                        border-radius: 50%;
                        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        transform: ${homoglyphEnabled ? 'translateX(18px)' : 'translateX(0)'};
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                        display: block;
                      "></span>
                    </span>
                  </div>
                  <div>
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-primary, #ffffff);">Защита от гомоглифов и подмены доменов</div>
                    <div style="font-size: 12px; color: var(--text-muted, #9ca3af); margin-top: 2px;">
                      Обнаружение скрытой подмены латинских букв на кириллические и имитации известных брендов.
                    </div>
                  </div>
                </label>
              </div>

              <!-- 3. Сканирование маскированных ссылок -->
              <div style="background: var(--bg-app, rgba(255,255,255,0.03)); border: 1px solid var(--border-color, #374151); border-radius: 8px; padding: 16px;">
                <label style="display: flex; align-items: center; gap: 14px; cursor: pointer; user-select: none;">
                  <div style="position: relative; width: 38px; height: 20px; flex-shrink: 0;">
                    <input type="checkbox" id="sec-links-toggle" ${linksEnabled ? 'checked' : ''} style="position: absolute; opacity: 0; width: 0; height: 0;" />
                    <span class="sec-slider-links" style="
                      position: absolute;
                      cursor: pointer;
                      top: 0; left: 0; right: 0; bottom: 0;
                      background-color: ${linksEnabled ? 'var(--primary-accent, #3b82f6)' : 'var(--border-color, #4b5563)'};
                      border-radius: 20px;
                      transition: background-color 0.2s ease;
                      display: block;
                    ">
                      <span class="sec-thumb-links" style="
                        position: absolute;
                        height: 14px;
                        width: 14px;
                        left: 3px;
                        bottom: 3px;
                        background-color: #ffffff;
                        border-radius: 50%;
                        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        transform: ${linksEnabled ? 'translateX(18px)' : 'translateX(0)'};
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                        display: block;
                      "></span>
                    </span>
                  </div>
                  <div>
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-primary, #ffffff);">Сканирование маскированных ссылок</div>
                    <div style="font-size: 12px; color: var(--text-muted, #9ca3af); margin-top: 2px;">
                      Предупреждение, если видимый текст ссылки не совпадает с реальным адресом перехода.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          `

          const setupToggle = (inputId, sliderClass, thumbClass, storageKey, toastLabel) => {
            const input = container.querySelector(inputId)
            const slider = container.querySelector(sliderClass)
            const thumb = container.querySelector(thumbClass)

            input.addEventListener('change', (e) => {
              const checked = e.target.checked
              localStorage.setItem(storageKey, checked ? 'true' : 'false')
              if (slider) slider.style.backgroundColor = checked ? 'var(--primary-accent, #3b82f6)' : 'var(--border-color, #4b5563)'
              if (thumb) thumb.style.transform = checked ? 'translateX(18px)' : 'translateX(0)'
              if (ctx.toast && typeof ctx.toast.success === 'function') {
                ctx.toast.success(checked ? `${toastLabel} включена` : `${toastLabel} отключена`, 'Антифишинг')
              }
            })
          }

          setupToggle('#sec-auth-toggle', '.sec-slider-auth', '.sec-thumb-auth', STORAGE_KEY_AUTH, 'Проверка SPF/DKIM')
          setupToggle('#sec-homoglyph-toggle', '.sec-slider-homoglyph', '.sec-thumb-homoglyph', STORAGE_KEY_HOMOGLYPH, 'Защита от гомоглифов')
          setupToggle('#sec-links-toggle', '.sec-slider-links', '.sec-thumb-links', STORAGE_KEY_LINKS, 'Проверка ссылок')
        }
      }
    })
  }
}
