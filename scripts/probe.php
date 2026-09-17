<?php
declare(strict_types=1);

/**
 * TEMPORARY diagnostic - it does NOT live under public/ on purpose, so that no
 * manifest or bulk upload can ever publish it by accident.
 *
 * scripts/publish.sh --probe uploads this file explicitly to
 * public_html/api/probe.php. Read it once (https://www.shurp.lv/api/probe.php)
 * and then DELETE IT:
 *
 *     scripts/publish.sh --delete-probe
 *
 * Leaving it on the server exposes the PHP version, SAPI and account user to
 * anyone who asks. The operator is responsible for removing it.
 *
 * v3 adds the account-home hunt. On this Hetzner plan the document root
 * (/usr/www/users/<user>, shown over FTP as "public_html") and the account home
 * (where FTP "/" points, and where /config/transport-client-key was uploaded)
 * are two different trees, so dirname(__DIR__, 2) lands on /usr/www/users and
 * finds nothing. This reports which candidate home actually holds the key.
 *
 * NOTHING here ever prints a file's contents - only booleans and paths.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$docRoot = isset($_SERVER['DOCUMENT_ROOT']) ? (string) $_SERVER['DOCUMENT_ROOT'] : '';
$user    = get_current_user();

$envHome = getenv('HOME');
if ($envHome === false || $envHome === '') {
    $envHome = null;
}

$serverHome = isset($_SERVER['HOME']) ? (string) $_SERVER['HOME'] : null;

if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
    $pw        = @posix_getpwuid(posix_geteuid());
    $posixHome = is_array($pw) ? ($pw['dir'] ?? null) : null;
} else {
    $posixHome = 'no posix';
}

$candidates = [
    is_string($posixHome) && $posixHome !== 'no posix' ? $posixHome : null,
    $envHome,
    '/usr/home/' . $user,
    ($docRoot !== '' ? dirname($docRoot) : '') . '/../home/' . $user,
];

$candidateReport = [];
foreach ($candidates as $candidate) {
    if (!is_string($candidate) || $candidate === '') {
        continue;
    }
    $candidateReport[] = [
        'path'                => $candidate,
        'real'                => realpath($candidate) ?: null,
        'is_dir'              => is_dir($candidate),
        'config_key_readable' => is_readable($candidate . '/config/transport-client-key'),
        'tmp_writable'        => is_writable($candidate . '/.tmp'),
    ];
}

echo json_encode([
    'v'                       => 3,
    'curl'                    => function_exists('curl_init'),
    'streams'                 => (bool) ini_get('allow_url_fopen'),
    'openssl'                 => extension_loaded('openssl'),
    'php'                     => PHP_VERSION,
    'sapi'                    => PHP_SAPI,
    'user'                    => $user,
    'open_basedir'            => ini_get('open_basedir'),
    'doc_root'                => $_SERVER['DOCUMENT_ROOT'] ?? null,
    'docroot_real'            => $docRoot !== '' ? (realpath($docRoot) ?: null) : null,
    'docroot_parent'          => $docRoot !== '' ? dirname($docRoot) : null,
    'script'                  => __FILE__,
    'env_home'                => $envHome,
    'server_home'             => $serverHome,
    'posix_home'              => $posixHome,
    'home_guess'              => dirname(__DIR__, 2),
    'home_guess_key_readable' => is_readable(dirname(__DIR__, 2) . '/config/transport-client-key'),
    'candidates'              => $candidateReport,
    'webroot_hidden_writable' => is_writable(__DIR__),
    'disable_functions'       => ini_get('disable_functions'),
    'allow_url_fopen'         => ini_get('allow_url_fopen'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
