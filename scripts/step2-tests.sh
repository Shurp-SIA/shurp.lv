#!/usr/bin/env bash
#
# Step 2 verification battery for https://www.shurp.lv/api/transport.php
#
# Run this after scripts/publish.sh --step 2 has uploaded the proxy (and the
# client key). It only makes GET/POST requests to the public site - it changes
# nothing. Exit code is non-zero if any check returns an unexpected status.
#
#   scripts/step2-tests.sh                 # against www.shurp.lv
#   BASE=https://shurp.lv scripts/step2-tests.sh
#
set -uo pipefail

BASE="${BASE:-https://www.shurp.lv}"
ENDPOINT="$BASE/api/transport.php"
ORIGIN_OK="${ORIGIN_OK:-https://www.shurp.lv}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
key_file="$repo_root/.secrets/transport-client-key"

work="$(mktemp -d "${TMPDIR:-/tmp}/shurp-step2.XXXXXX")"
trap 'rm -rf "$work"' EXIT INT TERM

failures=0
rows=()
n=0

json_ok() {
    local file="$1"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$file" >/dev/null 2>&1
    elif command -v jq >/dev/null 2>&1; then
        jq -e . "$file" >/dev/null 2>&1
    else
        # No parser available: accept anything that at least looks like JSON.
        head -c 1 "$file" | grep -qE '[{[]'
    fi
}

# check <name> <expected|ANY> <curl args...>
check() {
    local name="$1" expected="$2"
    shift 2
    n=$((n + 1))
    local body="$work/body.$n" hdr="$work/hdr.$n" code

    code="$(curl -sS -o "$body" -D "$hdr" -w '%{http_code}' \
            --connect-timeout 10 --max-time 30 "$@" 2>"$work/err.$n")" || code="000"

    local verdict
    if [[ "$expected" == "ANY" ]]; then
        verdict="INFO"
    elif [[ "$code" == "$expected" ]]; then
        verdict="PASS"
    else
        verdict="FAIL"
        failures=$((failures + 1))
    fi

    rows+=("$(printf '%-34s %-8s %-6s %s' "$name" "want=$expected" "got=$code" "$verdict")")
    printf '%-34s want=%-6s got=%-4s %s\n' "$name" "$expected" "$code" "$verdict"

    LAST_BODY="$body"
    LAST_HDR="$hdr"
    LAST_CODE="$code"
}

note() { printf '    %s\n' "$*"; }

soft_fail() {
    printf '    SOFT-FAIL: %s\n' "$*"
    failures=$((failures + 1))
}

header_has() {
    grep -iE "^$1:[[:space:]]*$2" "$LAST_HDR" >/dev/null 2>&1
}

echo "Endpoint: $ENDPOINT"
echo

# 1. Positive: sources -------------------------------------------------------
check "sources (positive)" 200 "$ENDPOINT?resource=sources"
if [[ "$LAST_CODE" == "200" ]]; then
    header_has "Cache-Control" "no-store"        || soft_fail "Cache-Control: no-store missing"
    header_has "X-Content-Type-Options" "nosniff" || soft_fail "X-Content-Type-Options: nosniff missing"
    header_has "Content-Type" "application/json" || soft_fail "Content-Type is not application/json"
    json_ok "$LAST_BODY"                          || soft_fail "body is not valid JSON"
    grep -iq '^X-Powered-By:' "$LAST_HDR"        && note "note: X-Powered-By still present (server-level)"
    note "body: $(head -c 120 "$LAST_BODY" | tr -d '\n')"
fi

# 2. Positive with forwarded query ------------------------------------------
check "places?q=jelgava&limit=5" 200 "$ENDPOINT?resource=places&q=jelgava&limit=5"
if [[ "$LAST_CODE" == "200" ]]; then
    json_ok "$LAST_BODY" || soft_fail "places body is not valid JSON"
    note "body: $(head -c 120 "$LAST_BODY" | tr -d '\n')"
fi

# 3. PATH_INFO routing form (informational: depends on server config) --------
check "PATH_INFO /transport.php/sources" ANY "$ENDPOINT/sources"
note "PATH_INFO form returned $LAST_CODE (200 = PATH_INFO works, 404 = server strips it)"

# 4. Unknown resource is rejected locally -----------------------------------
check "unknown resource (local 404)" 404 "$ENDPOINT?resource=admin"
if [[ "$LAST_CODE" == "404" ]]; then
    grep -q 'Unknown transport resource' "$LAST_BODY" \
        || soft_fail "404 did not come from the proxy (detail text differs)"
fi

# 5. Unsupported upstream parameter: proves the request really reaches the
#    transport service (422 is generated there, not here) --------------------
check "sources&nope=1 (upstream 422)" 422 "$ENDPOINT?resource=sources&nope=1"

# 6. Anti-relay: Sec-Fetch-Site -------------------------------------------
check "Sec-Fetch-Site: cross-site" 403 -H 'Sec-Fetch-Site: cross-site' "$ENDPOINT?resource=sources"

# 7. Anti-relay: foreign Origin --------------------------------------------
check "foreign Origin" 403 -H 'Origin: https://evil.example' "$ENDPOINT?resource=sources"

# 8. Own Origin passes - and upstream still accepts us, which proves the
#    browser's Origin is NOT relayed to the service -------------------------
check "own Origin (not relayed)" 200 -H "Origin: $ORIGIN_OK" -H 'Sec-Fetch-Site: same-origin' \
      "$ENDPOINT?resource=sources"

# 9. Method gate ------------------------------------------------------------
check "POST (405)" 405 -X POST "$ENDPOINT?resource=sources"
if [[ "$LAST_CODE" == "405" ]]; then
    header_has "Allow" "GET" || soft_fail "405 response is missing Allow: GET"
fi

# 10. health ---------------------------------------------------------------
check "health" ANY "$ENDPOINT?resource=health"
if [[ "$LAST_CODE" != "200" ]]; then
    note "health returned $LAST_CODE - expected once the service exposes it"
fi

# 11. Key leak check --------------------------------------------------------
echo
printf '%-34s ' "key leak check"
if [[ -r "$key_file" ]]; then
    key="$(head -n 1 "$key_file" | tr -d '\r\n')"
    if [[ ${#key} -lt 8 ]]; then
        echo "SKIP (key file looks empty)"
    elif grep -rqF -- "$key" "$work" 2>/dev/null; then
        echo "LEAK"
        failures=$((failures + 1))
    else
        echo "clean"
    fi
    unset key
else
    echo "SKIP (no .secrets/transport-client-key to compare against)"
fi

# Summary -------------------------------------------------------------------
echo
echo "================================ SUMMARY ================================"
printf '%s\n' "${rows[@]}"
echo "========================================================================="
if [[ $failures -eq 0 ]]; then
    echo "RESULT: all checks passed"
    exit 0
fi
echo "RESULT: $failures check(s) failed"
exit 1
