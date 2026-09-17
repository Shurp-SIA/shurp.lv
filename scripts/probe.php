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
    'curl'                   => function_exists('curl_init'),
    'streams'                => (bool) ini_get('allow_url_fopen'),
    'openssl'                => extension_loaded('openssl'),
    'php'                    => PHP_VERSION,
    'key_readable'           => is_readable(dirname(__DIR__, 2) . '/config/transport-client-key'),
    'sapi'                   => PHP_SAPI,
    'user'                   => get_current_user(),
    'open_basedir'           => ini_get('open_basedir'),
    'home_guess'             => dirname(__DIR__, 2),
    'doc_root'               => $_SERVER['DOCUMENT_ROOT'] ?? null,
    'script'                 => __FILE__,
    'key_exists'             => file_exists(dirname(__DIR__, 2) . '/config/transport-client-key'),
    'key_error'              => (function () {
        $error = null;
        set_error_handler(function (int $errno, string $errstr) use (&$error): bool {
            $error = $errstr;
            return true;
        });
        @file_get_contents(dirname(__DIR__, 2) . '/config/transport-client-key');
        restore_error_handler();
        return $error;
    })(),
    'tmp_writable'           => is_writable(dirname(__DIR__, 2) . '/.tmp'),
    'webroot_hidden_writable' => is_writable(__DIR__),
    'disable_functions'      => ini_get('disable_functions'),
    'allow_url_fopen'        => ini_get('allow_url_fopen'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
