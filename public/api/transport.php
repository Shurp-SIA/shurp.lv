<?php
declare(strict_types=1);

/**
 * shurp.lv -> transport service same-origin proxy.
 *
 * Purpose
 * -------
 * The browser talks only to https://www.shurp.lv/api/transport... . This file
 * forwards the request to the transport service and adds the client key, which
 * lives outside the webroot (account home /config/transport-client-key) so that
 * it can never be served over HTTP even if PHP stops executing. See
 * account_home() for how that directory is located on this host.
 *
 * Routing forms (all three resolve to the same thing)
 * --------------------------------------------------
 *   1. PATH_INFO form ..... /api/transport.php/sources      (PATH_INFO = "/sources")
 *   2. Clean-URL form ..... /api/transport/sources          (rewritten by .htaccess;
 *                                                            PATH_INFO may be absent,
 *                                                            so REQUEST_URI is parsed)
 *   3. Query form ......... /api/transport.php?resource=sources
 * The "resource" query parameter is always stripped from the query string that
 * is forwarded upstream; every other parameter is forwarded verbatim, so
 * ?q=jelgava&limit=5 reaches the service exactly as the browser wrote it.
 *
 * Why only four headers are forwarded
 * -----------------------------------
 * The upstream service runs its own same-origin check *before* the client-key
 * gate. If we relayed the browser's Origin / Referer / Sec-Fetch-* headers, a
 * hostile page could use this proxy to launder its own browser context into
 * that check ("confused deputy"): the request would arrive upstream carrying
 * both a trusted key and an attacker-controlled origin. So the browser context
 * is evaluated *here* (see the anti-relay block below) and then dropped; the
 * upstream request is a plain server-to-server call with exactly:
 *     Accept, X-Shurp-Client-Key, X-Shurp-Client-IP, User-Agent
 * Cookies are never forwarded either - the transport service is stateless and a
 * session cookie upstream would only be a credential waiting to leak.
 */

@set_time_limit(20);

/* No output may precede the headers: drop anything an auto_prepend_file left. */
while (ob_get_level() > 0) {
    ob_end_clean();
}

const UPSTREAM_BASE   = 'https://shurp.proofit.lv/transport/api/transport/';
const ALLOWED_RESOURCES = ['places', 'journeys', 'sources', 'stops', 'departures', 'tickets', 'health'];
const ALLOWED_HOSTS   = ['www.shurp.lv', 'shurp.lv'];

const MAX_QUERY_BYTES = 2048;
const MAX_BODY_BYTES  = 2097152;          /* 2 MiB */
const CONNECT_TIMEOUT = 5;
const TOTAL_TIMEOUT   = 15;

/* Fixed-window per-IP throttle. Set THROTTLE_ENABLED to false to disable it. */
const THROTTLE_ENABLED = true;
const THROTTLE_SUBPATH = '.tmp/shurp-throttle';   /* relative to account_home() */
const THROTTLE_LIMIT  = 40;
const THROTTLE_WINDOW = 60;

/* The client key, relative to the account home (never under the document root). */
const CLIENT_KEY_SUBPATH = 'config/transport-client-key';

const GENERIC_UNAVAILABLE = 'Transport service is temporarily unavailable.';

/* ------------------------------------------------------------- account home */

/**
 * Locate the account's home directory - the private tree that holds the client
 * key and the scratch space.
 *
 * Hetzner shared hosting gives one account two unrelated trees:
 *
 *     document root   /usr/www/users/<user>    (FTP shows it as "public_html")
 *     account home    /usr/home/<user>         (FTP shows it as "/")
 *
 * The webroot is therefore NOT a subdirectory of the home directory, and the
 * usual dirname(__DIR__, 2) walk up from /usr/www/users/<user>/api lands on
 * /usr/www/users - a shared parent that contains neither config/ nor .tmp/.
 * That is exactly why the key was invisible to this proxy. Everything private
 * lives under the home tree, which no URL can reach.
 *
 * Candidates, in order: the passwd entry for the effective user, $HOME, and the
 * conventional /usr/home/<user>. A candidate that already holds a readable
 * client key wins outright; otherwise the first existing directory is used, so
 * the throttle still gets a home even before the key is uploaded.
 *
 * @return string|null Absolute path with no trailing slash, or null if none of
 *                     the candidates exists.
 */
function account_home(): ?string
{
    static $resolved = false;
    static $home = null;

    if ($resolved) {
        return $home;
    }
    $resolved = true;

    $user    = get_current_user();
    $envHome = getenv('HOME');

    $posixHome = null;
    if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
        $entry = @posix_getpwuid(posix_geteuid());
        if (is_array($entry) && isset($entry['dir']) && is_string($entry['dir'])) {
            $posixHome = $entry['dir'];
        }
    }

    $candidates = [
        $posixHome,
        is_string($envHome) && $envHome !== '' ? $envHome : null,
        $user !== '' ? '/usr/home/' . $user : null,
    ];

    $firstExisting = null;
    foreach ($candidates as $candidate) {
        if (!is_string($candidate)) {
            continue;
        }
        $candidate = rtrim($candidate, '/');
        if ($candidate === '' || !is_dir($candidate)) {
            continue;
        }
        if ($firstExisting === null) {
            $firstExisting = $candidate;
        }
        if (is_readable($candidate . '/' . CLIENT_KEY_SUBPATH)) {
            $home = $candidate;
            return $home;
        }
    }

    $home = $firstExisting;
    return $home;
}

/**
 * Throttle state directory, or '' when there is nowhere to put it (fail-open).
 */
function throttle_dir(): string
{
    if (!THROTTLE_ENABLED) {
        return '';
    }
    $home = account_home();
    return $home === null ? '' : $home . '/' . THROTTLE_SUBPATH;
}

/* ------------------------------------------------------------------ output */

function response_headers(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header_remove('X-Powered-By');
}

function is_head_request(): bool
{
    return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'HEAD';
}

/**
 * Send a JSON body with the fixed header set and stop.
 */
function send(int $status, string $json): void
{
    http_response_code($status);
    response_headers();
    if (!is_head_request()) {
        echo $json;
    }
    exit;
}

/**
 * Send a {"detail": "..."} error and stop.
 */
function fail(int $status, string $detail): void
{
    send($status, (string) json_encode(['detail' => $detail], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

/* ------------------------------------------------------------------ method */

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET');
    fail(405, 'Method not allowed.');
}

/* -------------------------------------------------------------- anti-relay */
/*
 * Everything below is decided here and then thrown away: none of these headers
 * is forwarded upstream.
 */

$fetchSite = strtolower(trim((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')));
if ($fetchSite === 'cross-site') {
    fail(403, 'Cross-site requests are not allowed.');
}
/* same-origin / same-site / none / absent are all accepted: "none" is what a
   typed URL or a bookmark produces, and old browsers send nothing at all. */

foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $headerKey) {
    $value = trim((string) ($_SERVER[$headerKey] ?? ''));
    if ($value === '') {
        continue;
    }
    $host = parse_url($value, PHP_URL_HOST);
    if (!is_string($host) || !in_array(strtolower($host), ALLOWED_HOSTS, true)) {
        /* Covers Origin: null (opaque origin) too - parse_url finds no host. */
        fail(403, 'Cross-site requests are not allowed.');
    }
}

/* ---------------------------------------------------------------- resource */

$resource = '';

$pathInfo = trim((string) ($_SERVER['PATH_INFO'] ?? ''), '/');
if ($pathInfo !== '') {
    $resource = $pathInfo;
} else {
    $requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '');
    $uriPath    = (string) (parse_url($requestUri, PHP_URL_PATH) ?? '');
    $pattern    = '#/api/transport(?:\.php)?/([A-Za-z0-9_-]{1,32})/?$#';
    if (preg_match($pattern, $requestUri, $m) === 1 || preg_match($pattern, $uriPath, $m) === 1) {
        $resource = $m[1];
    } elseif (isset($_GET['resource']) && is_string($_GET['resource'])) {
        $resource = trim($_GET['resource']);
    }
}

if (!in_array($resource, ALLOWED_RESOURCES, true)) {
    fail(404, 'Unknown transport resource.');
}

/* ------------------------------------------------------------------- query */

$rawQuery = (string) ($_SERVER['QUERY_STRING'] ?? '');
if (strlen($rawQuery) > MAX_QUERY_BYTES) {
    fail(414, 'Query string is too long.');
}

$forwardPairs = [];
foreach ($rawQuery === '' ? [] : explode('&', $rawQuery) as $pair) {
    if ($pair === '') {
        continue;
    }
    $name = urldecode(explode('=', $pair, 2)[0]);
    if ($name === 'resource') {
        continue;                       /* routing hint, never forwarded */
    }
    $forwardPairs[] = $pair;            /* everything else goes verbatim */
}
$query = implode('&', $forwardPairs);
if (strlen($query) > MAX_QUERY_BYTES) {
    fail(414, 'Query string is too long.');
}

/* -------------------------------------------------------------- visitor IP */

$visitorIp = '';
$cfIp = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
if ($cfIp !== '' && filter_var($cfIp, FILTER_VALIDATE_IP) !== false) {
    $visitorIp = $cfIp;
} elseif (isset($_SERVER['REMOTE_ADDR'])) {
    $visitorIp = (string) $_SERVER['REMOTE_ADDR'];
}

/* -------------------------------------------------------------- throttling */

/**
 * Fixed-window counter, THROTTLE_LIMIT requests per THROTTLE_WINDOW seconds per
 * IP. Deliberately fail-open: a broken /.tmp must never take the site down.
 *
 * @return int Seconds to wait, or 0 when the request is allowed.
 */
function throttle_retry_after(string $ip): int
{
    $dir = throttle_dir();
    if ($dir === '' || $ip === '') {
        return 0;
    }
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return 0;
    }

    $file = $dir . '/' . hash('sha256', $ip);
    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        return 0;
    }
    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        return 0;
    }

    $now    = time();
    $bucket = intdiv($now, THROTTLE_WINDOW) * THROTTLE_WINDOW;
    $count  = 0;

    $stored = stream_get_contents($fh);
    if (is_string($stored) && preg_match('/^(\d+)\s+(\d+)$/', trim($stored), $m) === 1
        && (int) $m[1] === $bucket) {
        $count = (int) $m[2];
    }
    $count++;

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, $bucket . ' ' . $count);
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    throttle_cleanup($dir, $now);

    if ($count > THROTTLE_LIMIT) {
        return max(1, ($bucket + THROTTLE_WINDOW) - $now);
    }
    return 0;
}

/**
 * Opportunistic (1-in-50) sweep of counter files nobody has touched for a while.
 */
function throttle_cleanup(string $dir, int $now): void
{
    if (random_int(1, 50) !== 1) {
        return;
    }
    $entries = @scandir($dir);
    if ($entries === false) {
        return;
    }
    $stale = $now - (THROTTLE_WINDOW * 10);
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $dir . '/' . $entry;
        $mtime = @filemtime($path);
        if (is_int($mtime) && $mtime < $stale) {
            @unlink($path);
        }
    }
}

$retryAfterSeconds = throttle_retry_after($visitorIp);
if ($retryAfterSeconds > 0) {
    header('Retry-After: ' . $retryAfterSeconds);
    fail(429, 'Too many requests. Please slow down.');
}

/* --------------------------------------------------------------- client key */

/* An explicit override always wins (local test runs); otherwise the key comes
   from the account home - see account_home() for why that is not the webroot. */
$keyFile = (string) (getenv('SHURP_TRANSPORT_KEY_FILE') ?: '');
if ($keyFile === '') {
    $home    = account_home();
    $keyFile = $home !== null ? $home . '/' . CLIENT_KEY_SUBPATH : '';
}

$clientKey = '';
if ($keyFile !== '' && is_readable($keyFile)) {
    $raw = @file_get_contents($keyFile, false, null, 0, 4096);
    if (is_string($raw) && $raw !== '') {
        $firstLine = strtok($raw, "\r\n");
        strtok('', '');                      /* release the tokenizer state */
        if (is_string($firstLine)) {
            $clientKey = trim($firstLine);
        }
    }
}
if (preg_match('/^[\x21-\x7E]{32,512}$/', $clientKey) !== 1) {
    fail(503, GENERIC_UNAVAILABLE);
}

/* -------------------------------------------------------------- Accept hdr */

$accept = trim((string) ($_SERVER['HTTP_ACCEPT'] ?? ''));
if ($accept === '' || preg_match('#^[A-Za-z0-9 ,;=*/.+_-]{1,128}$#', $accept) !== 1) {
    $accept = 'application/json';
}

$url = UPSTREAM_BASE . rawurlencode($resource) . ($query !== '' ? '?' . $query : '');

/* The complete list of headers we put on the wire (see the file header). */
$upstreamHeaders = [
    'Accept: ' . $accept,
    'X-Shurp-Client-Key: ' . $clientKey,
    'X-Shurp-Client-IP: ' . $visitorIp,
    'User-Agent: shurp-www-proxy/1',
];

/* ---------------------------------------------------------------- transport */

/**
 * @return array{ok: bool, status: int, body: string, retry_after: string}
 */
function fetch_with_curl(string $url, array $headers): array
{
    $result = ['ok' => false, 'status' => 0, 'body' => '', 'retry_after' => ''];

    $ch = curl_init();
    if ($ch === false) {
        return $result;
    }

    $body       = '';
    $overflowed = false;
    $retryAfter = '';

    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_HTTPGET        => true,          /* always GET upstream: a HEAD
                                                    would give us no body to
                                                    validate as JSON */
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_CONNECTTIMEOUT => CONNECT_TIMEOUT,
        CURLOPT_TIMEOUT        => TOTAL_TIMEOUT,
        CURLOPT_HEADERFUNCTION => function ($ch, string $line) use (&$retryAfter): int {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2 && strcasecmp(trim($parts[0]), 'Retry-After') === 0) {
                $retryAfter = trim($parts[1]);
            }
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION  => function ($ch, string $chunk) use (&$body, &$overflowed): int {
            if (strlen($body) + strlen($chunk) > MAX_BODY_BYTES) {
                $overflowed = true;
                return 0;                        /* aborts the transfer */
            }
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);

    /* HTTPS only, no protocol downgrade on a redirect we would never follow. */
    if (defined('CURLOPT_PROTOCOLS_STR')) {
        curl_setopt($ch, CURLOPT_PROTOCOLS_STR, 'https');
    } elseif (defined('CURLPROTO_HTTPS')) {
        curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    }

    $ok     = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($ok === false || $overflowed) {
        return $result;
    }

    return ['ok' => true, 'status' => $status, 'body' => $body, 'retry_after' => $retryAfter];
}

/**
 * @return array{ok: bool, status: int, body: string, retry_after: string}
 */
function fetch_with_streams(string $url, array $headers): array
{
    $result = ['ok' => false, 'status' => 0, 'body' => '', 'retry_after' => ''];

    if (!ini_get('allow_url_fopen') || !extension_loaded('openssl')) {
        return $result;
    }

    $context = stream_context_create([
        'http' => [
            'method'          => 'GET',
            'header'          => implode("\r\n", $headers),
            'ignore_errors'   => true,      /* keep the body of 4xx/5xx replies */
            'follow_location' => 0,
            'max_redirects'   => 0,
            'timeout'         => TOTAL_TIMEOUT,
            'protocol_version' => 1.1,
        ],
        'ssl' => [
            'verify_peer'       => true,
            'verify_peer_name'  => true,
            'allow_self_signed' => false,
        ],
    ]);

    $handle = @fopen($url, 'rb', false, $context);
    if ($handle === false) {
        return $result;
    }

    $body = (string) stream_get_contents($handle, MAX_BODY_BYTES + 1);
    $overflowed = strlen($body) > MAX_BODY_BYTES;
    $meta = stream_get_meta_data($handle);
    fclose($handle);

    if ($overflowed) {
        return $result;
    }

    $status     = 0;
    $retryAfter = '';
    foreach (($meta['wrapper_data'] ?? []) as $line) {
        if (!is_string($line)) {
            continue;
        }
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m) === 1) {
            $status = (int) $m[1];          /* last status line wins */
            continue;
        }
        $parts = explode(':', $line, 2);
        if (count($parts) === 2 && strcasecmp(trim($parts[0]), 'Retry-After') === 0) {
            $retryAfter = trim($parts[1]);
        }
    }

    if ($status === 0) {
        return $result;
    }

    return ['ok' => true, 'status' => $status, 'body' => $body, 'retry_after' => $retryAfter];
}

if (function_exists('curl_init')) {
    $upstream = fetch_with_curl($url, $upstreamHeaders);
} else {
    $upstream = fetch_with_streams($url, $upstreamHeaders);
}

/* ---------------------------------------------------------------- response */

if (!$upstream['ok'] || $upstream['status'] < 200 || $upstream['status'] > 599) {
    fail(503, GENERIC_UNAVAILABLE);
}

/* Only well-formed JSON is passed through; anything else (an HTML error page
   from a proxy, a truncated body) becomes the generic 503. */
json_decode($upstream['body'], true);
if ($upstream['body'] === '' || json_last_error() !== JSON_ERROR_NONE) {
    fail(503, GENERIC_UNAVAILABLE);
}

if ($upstream['status'] === 429 && $upstream['retry_after'] !== ''
    && preg_match('/^[A-Za-z0-9 ,:+-]{1,64}$/', $upstream['retry_after']) === 1) {
    header('Retry-After: ' . $upstream['retry_after']);
}

send($upstream['status'], $upstream['body']);
