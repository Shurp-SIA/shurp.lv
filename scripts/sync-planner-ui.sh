#!/usr/bin/env bash
#
# Copy the transport planner UI out of the transport service into public/.
#
#   scripts/sync-planner-ui.sh                       # noindex (default)
#   scripts/sync-planner-ui.sh --index               # ready to be indexed
#   scripts/sync-planner-ui.sh --src ../elsewhere/web/public
#
# The planner pages ship from the transport service with two placeholders:
#
#   __BASE_PATH__          prefix in front of every planner URL and of the
#                          /api/transport/... calls that transport.js builds.
#                          On www.shurp.lv the planner lives at the site root,
#                          so the prefix is the empty string and the API is
#                          reached same-origin through /api/transport.php.
#   __WEBSITE_BASE_URL__   absolute origin of the marketing site, used for the
#                          navigation links and the app-handoff /get target.
#
# Everything the script does is checked afterwards: no placeholder survives, no
# reference to the transport service host survives, transport.js still derives
# its fetch URLs from the base path, and the shared brand assets in both trees
# are byte-identical (so they are never copied and can never drift apart).
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$repo_root/public"

src="${SRC:-$repo_root/../shurp-transport/web/public}"
website_base="https://www.shurp.lv"
index_mode="noindex"

PAGES=(lv/transport.html en/transport.html lv/tickets.html en/tickets.html)
ASSETS=(
    css/transport.css
    js/transport.js
    js/tickets.js
    js/transport-inputs.js
    js/site-nav.js
    js/app-handoff.js
)
# Shared between the two trees. They must already be identical; the script
# asserts that and never copies them, so the marketing site stays the single
# owner of the brand files.
SHARED_ASSETS=(
    logo.png
    favicon.svg
    apple-touch-icon.png
    Download_on_the_App_Store_Badge_LV_RGB_blk_100317.svg
    Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg
    GetItOnGooglePlay_Badge_Web_color_Latvian.svg
    GetItOnGooglePlay_Badge_Web_color_English.svg
)

NOINDEX_TAG='<meta name="robots" content="noindex,follow">'

usage() {
    cat <<'USAGE'
Usage: scripts/sync-planner-ui.sh [options]

  --website-base URL  Absolute origin of the marketing site
                      (default: https://www.shurp.lv)
  --index             Publish the pages as indexable (removes the robots meta)
  --noindex           Insert <meta name="robots" content="noindex,follow">
                      (default)
  --src DIR           Source tree (default: ../shurp-transport/web/public,
                      overridable with the SRC environment variable)
  -h, --help          This text
USAGE
}

info() { printf '  %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --website-base)
            [[ $# -ge 2 ]] || die "--website-base needs a URL"
            website_base="$2"; shift 2 ;;
        --website-base=*) website_base="${1#--website-base=}"; shift ;;
        --index)   index_mode="index";   shift ;;
        --noindex) index_mode="noindex"; shift ;;
        --src)
            [[ $# -ge 2 ]] || die "--src needs a directory"
            src="$2"; shift 2 ;;
        --src=*)   src="${1#--src=}"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; die "unknown option: $1" ;;
    esac
done

[[ "$website_base" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] \
    || die "--website-base must be a bare origin like https://www.shurp.lv (got '$website_base')"

[[ -d "$src" ]] || die "source tree not found: $src"
src="$(cd "$src" && pwd)"
[[ "$src" != "$dest" ]] || die "source and destination are the same directory"

printf 'Source  : %s\n' "$src"
printf 'Target  : %s\n' "$dest"
printf 'Website : %s\n' "$website_base"
printf 'Robots  : %s\n' "$index_mode"
printf '\n'

# ------------------------------------------------- shared brand assets check

echo "== Shared brand assets (must already be identical; never copied)"
for asset in "${SHARED_ASSETS[@]}"; do
    from="$src/assets/$asset"
    to="$dest/assets/$asset"
    [[ -f "$from" ]] || die "missing in source tree: assets/$asset"
    [[ -f "$to"   ]] || die "missing in this repo: public/assets/$asset"
    a="$(md5sum "$from" | cut -d' ' -f1)"
    b="$(md5sum "$to"   | cut -d' ' -f1)"
    [[ "$a" == "$b" ]] || die "assets/$asset differs between the trees ($a vs $b); reconcile them by hand"
    info "identical assets/$asset ($a)"
done
echo

# -------------------------------------------------------- analytics guard

# The marketing site no longer carries a self-hosted analytics collector; a
# synced file that still asks for one would 404 on every planner page load.
echo "== Analytics guard"
for rel in "${PAGES[@]}" "${ASSETS[@]/#/assets/}"; do
    from="$src/$rel"
    [[ -f "$from" ]] || die "missing in source tree: $rel"
    if grep -qE 'analytics\.js|analytics\.css|ShurpAnalytics' "$from"; then
        die "$rel still references the removed website analytics collector"
    fi
done
info "no file references analytics.js / analytics.css / ShurpAnalytics"
echo

# ------------------------------------------------------------------- assets

echo "== Assets"
for asset in "${ASSETS[@]}"; do
    mkdir -p "$dest/assets/$(dirname "$asset")"
    cp -f "$src/assets/$asset" "$dest/assets/$asset"
    info "assets/$asset"
done
echo

# -------------------------------------------------------------------- pages

echo "== Pages"
for page in "${PAGES[@]}"; do
    mkdir -p "$dest/$(dirname "$page")"
    target="$dest/$page"

    BASE_PATH="" WEBSITE_BASE="$website_base" NOINDEX_TAG="$NOINDEX_TAG" \
    INDEX_MODE="$index_mode" python3 - "$src/$page" "$target" <<'PY'
import os, re, sys

source, target = sys.argv[1], sys.argv[2]
html = open(source, encoding="utf-8").read()
html = html.replace("__WEBSITE_BASE_URL__", os.environ["WEBSITE_BASE"])
html = html.replace("__BASE_PATH__", os.environ["BASE_PATH"])

tag = os.environ["NOINDEX_TAG"]
# Drop any robots meta that is already there, then re-add it when we want one,
# so repeated runs and --index/--noindex flips are both idempotent.
html = re.sub(r'\s*<meta name="robots"[^>]*>', "", html, flags=re.I)
if os.environ["INDEX_MODE"] == "noindex":
    html, count = re.subn(r"(<head[^>]*>)", r"\1" + tag, html, count=1, flags=re.I)
    if count != 1:
        raise SystemExit(f"{source}: no <head> to insert the robots meta into")

open(target, "w", encoding="utf-8").write(html)
PY
    info "$page"
done
echo

# ------------------------------------------------------------ verification

echo "== Verification"
for page in "${PAGES[@]}"; do
    target="$dest/$page"
    for needle in '__BASE_PATH__' '__WEBSITE_BASE_URL__' 'shurp.proofit.lv'; do
        if grep -qF "$needle" "$target"; then
            die "$page still contains '$needle' after substitution"
        fi
    done
    count="$(grep -c 'noindex' "$target" || true)"
    if [[ "$index_mode" == "noindex" ]]; then
        [[ "$count" == "1" ]] || die "$page should carry exactly one noindex meta, found $count"
    else
        [[ "$count" == "0" ]] || die "$page should carry no noindex meta, found $count"
    fi
    grep -qF "data-base-path=\"\"" "$target" \
        || die "$page lost its empty data-base-path attribute"
    grep -qF "data-website-base=\"$website_base\"" "$target" \
        || die "$page lost its data-website-base attribute"
    info "$page clean ($index_mode)"
done

# transport.js must keep deriving its request URLs from the base path; if it
# ever hard-codes the service host again, the same-origin proxy is bypassed.
grep -qF 'document.body.dataset.basePath' "$dest/assets/js/transport.js" \
    || die "assets/js/transport.js no longer reads document.body.dataset.basePath"
grep -qE 'fetch\(`\$\{basePath\}/api/transport/' "$dest/assets/js/transport.js" \
    || die "assets/js/transport.js no longer builds its fetch URLs from basePath"
info "assets/js/transport.js builds /api/transport/... from basePath"

for asset in "${ASSETS[@]}"; do
    if grep -qF 'shurp.proofit.lv' "$dest/assets/$asset"; then
        die "assets/$asset points at the transport service host"
    fi
done
info "no synced asset points at shurp.proofit.lv"
echo

printf 'Done: %d page(s), %d asset(s).\n' "${#PAGES[@]}" "${#ASSETS[@]}"
