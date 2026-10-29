#!/usr/bin/env bash
# Receives a prebuilt Linux runtime; no npm install/build/database migration.
set -Eeuo pipefail
umask 077
[[ $(id -un) == tanvirsoft-netdesk ]] || { echo 'Use the site user, never root.' >&2; exit 1; }
release_id=${1:?Pass release ID}
unpacked_kb=${2:?Pass unpacked size in KiB}
checksum=${3:?Pass archive SHA256}
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ && "$unpacked_kb" =~ ^[0-9]+$ && "$checksum" =~ ^[a-f0-9]{64}$ ]] || exit 1
site_root="$HOME/htdocs/netdesk.tanvirsoft.com"
deploy_root="$HOME/.netdesk-deploy"
release="$deploy_root/releases/$release_id"
archive="$deploy_root/incoming/$release_id.tgz"
[[ -f "$site_root/.env" && -f "$archive" ]] || exit 1
export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  set +u
  source "$NVM_DIR/nvm.sh"
  nvm use 22
  set -u
fi
for command in node pm2 curl flock sha256sum; do command -v "$command" >/dev/null; done
[[ $(node -p 'process.versions.node.split(".")[0]') == 22 ]] || exit 1
mkdir -p "$deploy_root/releases"
[[ $(realpath "$deploy_root/releases") == "$deploy_root/releases" ]] || exit 1
exec 9>"$deploy_root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
previous=$(pm2 jlist | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const p=JSON.parse(s).find(p=>p.name==="netdesk");if(!p)process.exit(1);process.stdout.write(p.pm2_env.pm_cwd);})')
[[ "$previous" == "$site_root" || "$previous" == "$deploy_root/releases/"* ]] || exit 1
[[ $(realpath "$previous") == "$previous" && -f "$previous/.next/BUILD_ID" ]] || exit 1
[[ ! -e "$release" && ! -L "$release" ]] || { echo 'Release already exists.' >&2; exit 1; }
switched=0
created=0
committed=0
start_release() {
  local directory=$1
  if [[ -f "$directory/server.js" ]]; then
    NETDESK_PUBLIC_URL=https://netdesk.tanvirsoft.com PORT=3008 HOSTNAME=127.0.0.1 NODE_ENV=production pm2 start "$directory/server.js" --name netdesk --cwd "$directory" --interpreter "$(command -v node)" --node-args="--env-file=$site_root/.env"
  else
    # First standalone deployment can roll back to an old npm-based release.
    pm2 start npm --name netdesk --cwd "$directory" -- start
  fi
}
finish() {
  local result=$?
  trap - EXIT INT TERM HUP
  if [[ $result != 0 && $switched == 1 && $committed == 0 ]]; then
    echo 'Switch failed; restoring previous release.' >&2
    pm2 delete netdesk >/dev/null 2>&1 || true
    if start_release "$previous" && pm2 save; then
      switched=0
      echo 'Previous PM2 process restored; verify its health.' >&2
    else
      echo 'ROLLBACK FAILED: failed release retained; inspect PM2.' >&2
    fi
  fi
  if [[ $result != 0 && $created == 1 && $switched == 0 && $committed == 0 ]]; then
    if [[ $(realpath "$release") == "$release" ]]; then rm -rf -- "$release"; fi
  fi
  rm -f -- "$archive"
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
available_kb=$(df -Pk "$deploy_root" | awk 'END {print $4}')
required_kb=$((unpacked_kb + 65536))
((available_kb >= required_kb)) || { echo "Insufficient disk: ${available_kb} KiB available; ${required_kb} KiB required. App unchanged." >&2; exit 1; }
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
mkdir "$release"
created=1
tar -xzf "$archive" --no-same-owner -C "$release"
[[ -f "$release/server.js" && -f "$release/.next/BUILD_ID" && -f "$release/prune-releases.mjs" ]] || exit 1
[[ ! -e "$release/.env" && ! -L "$release/.env" && ! -e "$release/.data" && ! -L "$release/.data" ]] || exit 1
mkdir -p "$site_root/.data"
ln -s "$site_root/.env" "$release/.env"
ln -s "$site_root/.data" "$release/.data"
printf '%s\n' "$previous" > "$deploy_root/previous-release"
switched=1
pm2 delete netdesk
start_release "$release"
healthy=0
for attempt in {1..30}; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3008/login | grep -q 'NetDesk'; then healthy=1; break; fi
  sleep 2
done
[[ $healthy == 1 ]] || { echo 'Login health check failed.' >&2; exit 1; }
pm2 jlist | EXPECTED_CWD="$release" node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const p=JSON.parse(s).find(p=>p.name==="netdesk");if(!p||p.pm2_env.status!=="online"||p.pm2_env.pm_cwd!==process.env.EXPECTED_CWD)process.exit(1);})'
pm2 save
printf '%s\n' "$release" > "$deploy_root/last-successful-release"
committed=1
if ! node "$release/prune-releases.mjs" "$deploy_root/releases" "$release" "$previous"; then
  echo 'WARNING: cleanup failed; deployment is healthy. Review disk usage.' >&2
fi
echo "Deployment successful: $release"
df -h "$deploy_root"
