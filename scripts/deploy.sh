#!/usr/bin/env bash
# Run as the existing CloudPanel site user; never root. No database migrations.
set -Eeuo pipefail
umask 077

[[ $(id -un) == tanvirsoft-netdesk ]] || { echo 'Use the tanvirsoft-netdesk site user.' >&2; exit 1; }
site_root="$HOME/htdocs/netdesk.tanvirsoft.com"
deploy_root="$HOME/.netdesk-deploy"
release=$(realpath -e -- "${1:?Pass the extracted release directory}")
[[ "$release" == "$deploy_root/releases/"* && "$release" != "$deploy_root/releases/" ]] || exit 1
[[ -f "$release/package-lock.json" && -f "$site_root/.env" ]] || { echo 'Source or existing server .env missing.' >&2; exit 1; }

# Non-interactive SSH does not normally load the site's nvm installation.
export NVM_DIR="$HOME/.nvm"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  set +u
  source "$NVM_DIR/nvm.sh"
  nvm use 22
  set -u
fi
for command in node npm pm2 curl flock; do command -v "$command" >/dev/null; done
[[ $(node -p 'process.versions.node.split(".")[0]') == 22 ]] || { echo 'Node 22 required.' >&2; exit 1; }

exec 9>"$deploy_root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

# Read only the previous working directory, never dump PM2 environment secrets.
previous=$(pm2 jlist | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const p=JSON.parse(s).find(p=>p.name==="netdesk");if(!p)process.exit(1);process.stdout.write(p.pm2_env.pm_cwd);})')
[[ "$previous" == "$site_root" || "$previous" == "$deploy_root/releases/"* ]] || { echo 'Unexpected previous PM2 working directory.' >&2; exit 1; }
[[ -d "$previous/.next" ]] || { echo 'Previous build missing; refusing unsafe switch.' >&2; exit 1; }

# Share existing secrets and persisted UI origins with every release.
# NETDESK_SETTINGS_DIR should be unset/default or an absolute persistent path.
mkdir -p "$site_root/.data"
ln -s "$site_root/.env" "$release/.env"
ln -s "$site_root/.data" "$release/.data"
cd "$release"
unset NETDESK_DIST_DIR
export NEXT_TELEMETRY_DISABLED=1
npm ci --include=dev
npm run build

switched=0
rollback() {
  local result=$?
  trap - EXIT HUP INT TERM
  if [[ $result != 0 && $switched == 1 ]]; then
    echo 'Deployment failed. Restoring the previous PM2 release.' >&2
    pm2 delete netdesk >/dev/null 2>&1 || true
    if pm2 start npm --name netdesk --cwd "$previous" -- start && pm2 save; then
      echo "Previous process restored: $previous (check health/logs)." >&2
    else
      echo 'ROLLBACK FAILED: inspect pm2 logs netdesk immediately.' >&2
    fi
  fi
  exit "$result"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
printf '%s\n' "$previous" > "$deploy_root/previous-release"
switched=1
pm2 delete netdesk
pm2 start npm --name netdesk --cwd "$release" -- start

healthy=0
for attempt in {1..30}; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3008/login | grep -q 'NetDesk'; then
    healthy=1
    break
  fi
  sleep 2
done
[[ $healthy == 1 ]] || { echo 'Login health check failed.' >&2; exit 1; }
pm2 jlist | EXPECTED_CWD="$release" node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const p=JSON.parse(s).find(p=>p.name==="netdesk");if(!p||p.pm2_env.status!=="online"||p.pm2_env.pm_cwd!==process.env.EXPECTED_CWD)process.exit(1);})'
pm2 save
printf '%s\n' "$release" > "$deploy_root/last-successful-release"
switched=0
echo "Deployment successful: $release"
echo 'Old releases are retained for rollback; prune reviewed releases manually when needed.'
