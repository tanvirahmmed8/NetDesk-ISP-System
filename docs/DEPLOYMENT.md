# Automatic deployment: GitHub Actions + CloudPanel

Push to `main` runs CI, then deploys through SSH as `tanvirsoft-netdesk`. Pull requests only run CI. Actions also has a manual Run workflow button (choose `main`). Never put credentials in this repository. Workflow documentation: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments

CI uses Node 22 on Linux, installs dependencies, tests packaging/cleanup safety, then builds with `NETDESK_STANDALONE=1`. It packages Next's traced runtime dependencies, `server.js`, `.next/static` and optional `public`, without build caches, `.env` files or customer reports. The deploy job downloads that exact run's artifact. No install/build runs on the production server. CI does not run database integration tests or migrations. See [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

Deployment verifies the archive checksum, extracts a separate release, links the server's existing `.env`/`.data`, checks `/login`, then saves PM2. Build failures leave the running release untouched. A failed switch/health check attempts to restart the previous release (including legacy npm-based releases). Switching has a brief interruption; this is not zero-downtime deployment.

After success, automatic cleanup keeps only the active release and its immediately previous release. Other direct-child deployment folders matching the generated release-ID pattern are permanently removed, including older failed releases. Unknown folder names and symlinked directories are skipped. Cleanup does not traverse `.data`/`.env` links or touch the original site directory, npm cache, other sites or MySQL. A failure before successful switching removes only this run's inactive extracted release; failed rollback retains it for recovery. Forced termination can leave residue for the next successful cleanup.

Before upload, free disk must accommodate the compressed archive, unpacked runtime and 64 MiB headroom. It checks again before extraction; insufficient space aborts without stopping the app. With only 337 MB currently free, the first run may refuse safely if the actual artifact will not fit. Cleanup happens only after success, so it does not delete your rollback release just to make room. User quotas or concurrent disk writes can still cause failures. Disk use is bounded by two releases, but the first migration retains one larger legacy release until a second successful standalone deployment replaces it.

## 1. Server prerequisites (once)

Use your existing site-user SSH session, not root:

```bash
whoami
node --version
pm2 status
command -v curl flock
```

User must be `tanvirsoft-netdesk`, Node must be 22, and existing PM2 process `netdesk` must have a working production build. nvm and PM2 must be available for this user's Node 22. Keep the original site folder and `.env` at `/home/tanvirsoft-netdesk/htdocs/netdesk.tanvirsoft.com`. Check `NETDESK_SETTINGS_DIR` if customized: use `.data` (default) or an absolute persistent directory, not another relative directory. The `.data` MCP settings folder is shared across releases. Database data stays in MySQL.

Configure PM2 startup if not already done: run `pm2 startup` as the site user, then have your administrator run the exact privileged command it prints. Run `pm2 save` as the site user afterwards. Do not run the app as root.

## 2. Create a dedicated SSH key (local PowerShell)

```powershell
ssh-keygen -t ed25519 -C "github-netdesk-deploy" -f "$env:USERPROFILE\.ssh\netdesk-actions"
Get-Content "$env:USERPROFILE\.ssh\netdesk-actions.pub"
```

Use an empty passphrase for this dedicated unattended key. Protect the private file. If the filename already exists, choose another name; do not overwrite an existing key.

On the server, as the site user:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

Append one line containing `restrict ` followed by the entire **public** key. Keep all existing keys. Then:

```bash
chmod 600 ~/.ssh/authorized_keys
```

The key runs deployment commands with the site user's permissions (not root); repository write access effectively grants deployment access. Protect `main`, enable GitHub 2FA, and review workflow changes. This workflow does not run deployment secrets on pull requests.

## 3. Verify and pin the server host key

From a trusted server console, inspect the SSH host fingerprint:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

On local PowerShell, substitute your SSH hostname/IP and port:

```powershell
ssh-keyscan -t ed25519 -p 22 YOUR_SERVER_IP
ssh -i "$env:USERPROFILE\.ssh\netdesk-actions" -p 22 tanvirsoft-netdesk@YOUR_SERVER_IP "whoami"
```

Compare the fingerprint shown by SSH with the trusted console before accepting. Store the matching `ssh-keyscan` output as `DEPLOY_KNOWN_HOSTS`. Do not trust an unverified network scan. Non-default ports use `[host]:port` in known_hosts. GitHub-hosted runners must be allowed to reach this SSH port; check your firewall policy without opening database ports.

## 4. GitHub production environment and secrets

Repository → Settings → Environments → New environment → `production`. Restrict deployment branches to `main`. Leave required approval off if every push should deploy immediately.

Add these environment secrets (not variables):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Server SSH IP/hostname, e.g. `206.189.87.20` if still correct; no https prefix |
| `DEPLOY_PORT` | Actual SSH port, normally `22` |
| `DEPLOY_USER` | `tanvirsoft-netdesk` |
| `DEPLOY_SSH_KEY` | Entire private `netdesk-actions` key, including BEGIN/END lines |
| `DEPLOY_KNOWN_HOSTS` | Verified known_hosts line from step 3 |

Paste the key into GitHub directly from the local file; never into chat, commits, logs or screenshots. GitHub environment availability depends on plan/repository visibility; if `production` environments are unavailable, use repository Actions secrets and remove the workflow's `environment: production` line, retaining the explicit main-branch deployment condition.

## 5. Commit and enable

Run these yourself in local PowerShell:

```powershell
cd D:\Tanvir\Js\isp-system
git status
git add .github/workflows/deploy.yml scripts/deploy.sh scripts/package-runtime.mjs scripts/prune-releases.mjs scripts/check-deployment.mjs scripts/check-deploy-shell.mjs scripts/check-runtime.mjs next.config.ts docs/DEPLOYMENT.md README.md .gitignore
git diff --cached --stat
git commit -m "Add checked SSH deployment with release rollback"
git push origin main
```

Inspect staged files before committing; never stage `.env`, private keys or customer CSVs. No server `git pull` or repository access key is needed: Actions sends the standalone runtime from that exact commit over SSH. Existing SSH secrets remain unchanged. Push the updated workflow; rerunning an old run uses the old workflow. Local `npm run build/start` and the MCP checks retain their normal mode unless `NETDESK_STANDALONE=1` is explicitly set.

## Everyday usage and troubleshooting

Uploads stream over SSH into `~/.netdesk-deploy/incoming`, not the server's `/tmp` or SFTP subsystem. This run's archive is removed by the deploy script and an always-run workflow cleanup step. If SSH is unavailable, cleanup may also fail; check the warning and inspect that specific archive manually. If upload fails, inspect `df -h "$HOME"`, `df -i "$HOME"`, `quota -s` (if available), and directory ownership/permissions. Do not delete existing releases or change permissions broadly without reviewing exact targets.

Commit and push your changes; watch GitHub → Actions → NetDesk CI and deploy. Do not simultaneously run a manual deployment. Deployments are serialized by GitHub concurrency and a server lock. Releases are automatically limited to current + previous after each successful deployment. Monitor disk usage: this does not clean the legacy checkout, pre-existing npm cache, unrelated uploads/logs or other sites.

After the first automated deploy, PM2 runs from a release directory, **not the original Git checkout**. Editing the original source or building it no longer changes the running release. Its `.env` is shared: environment-only changes still require `pm2 restart netdesk --update-env`; build-time environment changes require re-running deployment. Keep migrations explicit, backed up and backward-compatible if rollback is needed. Never rerun `db:setup` against production automatically.

```bash
pm2 status
pm2 logs netdesk --lines 40 --nostream
curl -I http://127.0.0.1:3008/login
cat ~/.netdesk-deploy/last-successful-release
cat ~/.netdesk-deploy/previous-release
du -sh ~/.netdesk-deploy/releases
```

Emergency manual rollback (only after verifying the recorded path is the intended previous release and its build exists):

```bash
previous=$(cat ~/.netdesk-deploy/previous-release)
printf '%s\n' "$previous"
test -f "$previous/.next/BUILD_ID" &&
pm2 delete netdesk &&
if [ -f "$previous/server.js" ]; then
  PORT=3008 HOSTNAME=127.0.0.1 NODE_ENV=production pm2 start "$previous/server.js" --name netdesk --cwd "$previous" --interpreter "$(command -v node)" --node-args="--env-file=/home/tanvirsoft-netdesk/htdocs/netdesk.tanvirsoft.com/.env"
else
  pm2 start npm --name netdesk --cwd "$previous" -- start
fi
pm2 save
curl -I http://127.0.0.1:3008/login
```

The login check verifies HTTP/app availability, not database correctness, authenticated workflows or public TLS/proxy connectivity. If deployment is interrupted forcibly or rollback fails, inspect PM2 before retrying. Database changes are never rolled back by this script. The existing CloudPanel reverse proxy still points at port 3008; no vhost change is required.
