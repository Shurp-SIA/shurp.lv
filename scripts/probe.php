<?php
declare(strict_types=1);

/**
 * TEMPORARY diagnostic - it does NOT live under public/ on purpose, so that no
 * manifest or bulk upload can ever publish it by accident.
 *
 * scripts/publish.sh --step 2 --probe uploads this file explicitly to
 * public_html/api/probe.php. Read it once (https://www.shurp.lv/api/probe.php)
 * and then DELETE IT:
 *
 *     scripts/publish.sh --delete-probe
 *
 * Leaving it on the server exposes the PHP version, SAPI and account user to
 * anyone who asks. The operator is responsible for removing it.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

echo json_encode([
    'curl'         => function_exists('curl_init'),
    'streams'      => (bool) ini_get('allow_url_fopen'),
    'openssl'      => extension_loaded('openssl'),
    'php'          => PHP_VERSION,
    'key_readable' => is_readable(dirname(__DIR__, 2) . '/config/transport-client-key'),
    'sapi'         => PHP_SAPI,
    'user'         => get_current_user(),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
