#!/usr/bin/env bash
#
# Manifest-driven FTPS publisher for www.shurp.lv (Hetzner shared hosting).
#
#   scripts/publish.sh --step 2 --backup --key --probe --dry-run   # rehearse
#   scripts/publish.sh --step 2 --backup --key --probe             # do it
#   scripts/publish.sh --delete-probe                              # afterwards
#
# Credentials come from .hetzner-data (git-ignored) and are handed to curl
# through a 0600 netrc file in $TMPDIR that is removed by an EXIT trap. The
# password is never echoed, never put on a command line (it would show up in
# `ps`), and never written to the repository.
#
# Everything uploads over explicit FTPS (--ssl-reqd): curl refuses to continue
# if the server will not negotiate TLS, so the password is never sent in clear.
#
set -euo pipefail

umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest_dir="$repo_root/scripts/manifests"
local_root="$repo_root/public"
data_file="$repo_root/.hetzner-data"
key_file="$repo_root/.secrets/transport-client-key"
probe_file="$repo_root/scripts/probe.php"

remote_root="public_html"
remote_key_path="config/transport-client-key"
remote_probe_path="public_html/api/probe.php"

step=""
dry_run=0
do_backup=0
do_key=0
do_probe=0
do_delete_probe=0

uploads_ok=0
uploads_planned=0

usage() {
    cat <<'USAGE'
Usage: scripts/publish.sh [options]

  --step N        Upload every file listed in scripts/manifests/stepN.txt
  --backup        Mirror the remote public_html into backups/public_html-<UTC>/
  --key           Upload .secrets/transport-client-key to /config/ (chmod 600)
  --probe         Upload scripts/probe.php to /public_html/api/probe.php
  --delete-probe  Delete /public_html/api/probe.php from the server
  --dry-run       Print exactly what would be transferred; change nothing
  -h, --help      This text

Order of operations: backup, key, manifest, probe, delete-probe.
USAGE
}

log()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# ----------------------------------------------------------------- arguments

while [[ $# -gt 0 ]]; do
    case "$1" in
        --step)
            [[ $# -ge 2 ]] || die "--step needs a number"
            step="$2"
            shift 2
            ;;
        --step=*)  step="${1#--step=}"; shift ;;
        --dry-run) dry_run=1; shift ;;
        --backup)  do_backup=1; shift ;;
        --key)     do_key=1; shift ;;
        --probe)   do_probe=1; shift ;;
        --delete-probe) do_delete_probe=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; die "unknown option: $1" ;;
    esac
done

if [[ -n "$step" && ! "$step" =~ ^[0-9]+$ ]]; then
    die "--step expects a number, got '$step'"
fi

if [[ -z "$step" && $do_backup -eq 0 && $do_key -eq 0 && $do_probe -eq 0 && $do_delete_probe -eq 0 ]]; then
    usage >&2
    die "nothing to do"
fi

command -v curl >/dev/null 2>&1 || die "curl is required"

# --------------------------------------------------------------- credentials

[[ -r "$data_file" ]] || die "cannot read $data_file"

server=""
login=""
password=""
while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
        Server=*)    server="${line#Server=}" ;;
        LoginName=*) login="${line#LoginName=}" ;;
        Password=*)  password="${line#Password=}" ;;
    esac
done < "$data_file"

[[ -n "$server"   ]] || die "no Server= line in .hetzner-data"
[[ -n "$login"    ]] || die "no LoginName= line in .hetzner-data"
[[ -n "$password" ]] || die "no Password= line in .hetzner-data"

netrc="$(mktemp "${TMPDIR:-/tmp}/shurp-netrc.XXXXXXXX")"
chmod 600 "$netrc"
cleanup() { rm -f "$netrc"; }
trap cleanup EXIT INT TERM HUP
printf 'machine %s\nlogin %s\npassword %s\n' "$server" "$login" "$password" > "$netrc"
unset password

log "Host    : $server"
log "User    : $login"
log "Mode    : $([[ $dry_run -eq 1 ]] && echo 'DRY RUN (nothing is transferred)' || echo 'LIVE')"
log ""

# ---------------------------------------------------------------- curl front

ftp_curl() {
    curl --fail --silent --show-error --ssl-reqd \
         --netrc-file "$netrc" \
         --connect-timeout 20 --max-time 300 \
         --globoff \
         "$@"
}

# Percent-encode the few characters that break an FTP URL.
url_escape() {
    local s="$1"
    s="${s//%/%25}"
    s="${s// /%20}"
    s="${s//#/%23}"
    s="${s//\?/%3F}"
    printf '%s' "$s"
}

human_size() {
    local bytes="$1"
    printf '%s bytes' "$bytes"
}

# ------------------------------------------------------------------- backup

mirror_dir() {
    local remote_dir="$1" local_dir="$2"
    local listing line perms rest name size url

    url="ftp://$server/$(url_escape "$remote_dir")/"
    if ! listing="$(ftp_curl -X 'LIST -a' "$url")"; then
        die "cannot list $remote_dir (FTPS LIST failed)"
    fi

    [[ $dry_run -eq 1 ]] || mkdir -p "$local_dir"

    while IFS= read -r line; do
        line="${line%$'\r'}"
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^[-dl] ]] || continue          # skip "total 24" etc.

        perms="${line%% *}"
        # Unix long listing: perms links owner group size month day time name
        read -r _ _ _ _ size rest <<< "$line"
        # Drop the three date fields; whatever is left is the (possibly
        # space-containing) name.
        name="$(printf '%s' "$rest" | sed -E 's/^[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+//')"
        [[ -z "$name" || "$name" == "." || "$name" == ".." ]] && continue

        case "$perms" in
            l*)
                warn "skipping symlink $remote_dir/$name"
                ;;
            d*)
                mirror_dir "$remote_dir/$name" "$local_dir/$name"
                ;;
            *)
                if [[ $dry_run -eq 1 ]]; then
                    info "would download ftp://$server/$remote_dir/$name ($(human_size "${size:-0}")) -> ${local_dir#$repo_root/}/$name"
                else
                    ftp_curl --create-dirs -o "$local_dir/$name" \
                        "ftp://$server/$(url_escape "$remote_dir/$name")" \
                        || die "download failed: $remote_dir/$name"
                    info "saved ${local_dir#$repo_root/}/$name ($(human_size "${size:-0}"))"
                fi
                ;;
        esac
    done <<< "$listing"
}

run_backup() {
    local stamp dest
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    dest="$repo_root/backups/${remote_root}-${stamp}"
    log "== Backup remote /$remote_root -> backups/${remote_root}-${stamp}/"
    mirror_dir "$remote_root" "$dest"
    log ""
}

# ------------------------------------------------------------------ uploads

upload() {
    local src="$1" remote_path="$2" size
    [[ -f "$src" ]] || die "missing local file: $src"
    size="$(wc -c < "$src" | tr -d ' ')"
    uploads_planned=$((uploads_planned + 1))
    if [[ $dry_run -eq 1 ]]; then
        info "would upload ${src#$repo_root/} -> ftp://$server/$remote_path ($(human_size "$size"))"
    else
        ftp_curl --ftp-create-dirs --upload-file "$src" \
            "ftp://$server/$(url_escape "$remote_path")" \
            || die "upload failed: $remote_path"
        info "uploaded ${src#$repo_root/} -> /$remote_path ($(human_size "$size"))"
        uploads_ok=$((uploads_ok + 1))
    fi
}

run_manifest() {
    local manifest="$manifest_dir/step${step}.txt"
    [[ -f "$manifest" ]] || die "no manifest: $manifest"

    if grep -q 'NOT YET APPROVED' "$manifest"; then
        if [[ $dry_run -eq 1 ]]; then
            warn "step $step is marked NOT YET APPROVED - rehearsing only"
        else
            die "step $step is marked NOT YET APPROVED; remove that line from $manifest once it is signed off"
        fi
    fi

    log "== Manifest step${step}.txt"
    local rel
    while IFS= read -r rel || [[ -n "$rel" ]]; do
        rel="${rel%$'\r'}"
        rel="${rel#"${rel%%[![:space:]]*}"}"       # ltrim
        rel="${rel%"${rel##*[![:space:]]}"}"       # rtrim
        [[ -z "$rel" || "$rel" == \#* ]] && continue
        upload "$local_root/$rel" "$remote_root/$rel"
    done < "$manifest"
    log ""
}

run_key() {
    log "== Client key -> /$remote_key_path"
    [[ -f "$key_file" ]] || die "missing $key_file (create it with the key issued by the transport service)"

    local first
    first="$(head -n 1 "$key_file" | tr -d '\r\n')"
    if [[ ${#first} -lt 32 || ${#first} -gt 512 ]]; then
        die "key in .secrets/transport-client-key must be 32..512 printable characters (found ${#first})"
    fi

    upload "$key_file" "$remote_key_path"

    if [[ $dry_run -eq 1 ]]; then
        info "would then run: SITE CHMOD 600 /$remote_key_path"
    else
        if ftp_curl --quote "SITE CHMOD 600 /$remote_key_path" --list-only \
             "ftp://$server/" -o /dev/null 2>/dev/null; then
            info "permissions set to 600 on /$remote_key_path"
        else
            warn "the server refused SITE CHMOD. Set the mode over SFTP instead:"
            warn "    sftp $login@$server"
            warn "    sftp> chmod 600 /$remote_key_path"
        fi
    fi
    log ""
}

run_probe() {
    log "== Diagnostic probe -> /$remote_probe_path"
    upload "$probe_file" "$remote_probe_path"
    if [[ $dry_run -eq 0 ]]; then
        warn "probe.php is live at https://www.shurp.lv/api/probe.php - delete it with --delete-probe when done"
    fi
    log ""
}

run_delete_probe() {
    log "== Delete /$remote_probe_path"
    if [[ $dry_run -eq 1 ]]; then
        info "would send: DELE /$remote_probe_path"
        log ""
        return
    fi
    if ftp_curl --quote "DELE /$remote_probe_path" --list-only "ftp://$server/" -o /dev/null 2>/dev/null; then
        info "deleted /$remote_probe_path"
    elif ftp_curl -Q "DELE probe.php" --list-only \
            "ftp://$server/$(url_escape "$(dirname "$remote_probe_path")")/" -o /dev/null 2>/dev/null; then
        info "deleted /$remote_probe_path (after CWD)"
    else
        die "could not delete /$remote_probe_path - remove it manually over SFTP"
    fi
    log ""
}

# ------------------------------------------------------------------- driver

[[ $do_backup -eq 1 ]]       && run_backup
[[ $do_key -eq 1 ]]          && run_key
[[ -n "$step" ]]             && run_manifest
[[ $do_probe -eq 1 ]]        && run_probe
[[ $do_delete_probe -eq 1 ]] && run_delete_probe

if [[ $dry_run -eq 1 ]]; then
    log "Dry run complete: $uploads_planned file(s) would be uploaded."
else
    log "Done: $uploads_ok/$uploads_planned file(s) uploaded."
fi
exit 0
