# Automatic deployment: GitHub Actions + CloudPanel

Push to `main` runs CI, then deploys through SSH as `tanvirsoft-netdesk`. Pull requests only run CI. Actions also has a manual Run workflow button (choose `main`). Never put credentials in this repository. Workflow documentation: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments

CI uses Node 22, `npm ci` and a production build (including TypeScript checks). It does not run database integration tests or migrations. Deployment builds a separate release using the server's existing `.env`, checks `/login`, then saves PM2. Build failures leave the running release untouched. A failed switch/health check attempts to restart the previous release. Switching has a brief interruption; this is not zero-downtime deployment.

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
git add .github/workflows/deploy.yml scripts/deploy.sh docs/DEPLOYMENT.md README.md .gitattributes
git diff --cached --stat
git commit -m "Add checked SSH deployment with release rollback"
git push origin main
```

Inspect staged files before committing; never stage `.env`, private keys or customer CSVs. The workflow packages only app source/config/scripts/docs, not the `data` folder or local environment files. No server `git pull` or GitHub repository access key is needed: Actions sends the checked-out source for that exact commit over SSH. Secrets must be configured before the first deployment; failed runs can be re-run from Actions after setup.

## Everyday usage and troubleshooting

Commit and push your changes; watch GitHub → Actions → NetDesk CI and deploy. Do not simultaneously run a manual deployment. Deployments are serialized by GitHub concurrency and a server lock. Old releases remain under `~/.netdesk-deploy/releases` and are not automatically deleted. Monitor disk usage; remove only verified inactive releases, never the current/previous build, original `.env` or `.data`.

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
pm2 start npm --name netdesk --cwd "$previous" -- start &&
pm2 save
curl -I http://127.0.0.1:3008/login
```

The login check verifies HTTP/app availability, not database correctness, authenticated workflows or public TLS/proxy connectivity. If deployment is interrupted forcibly or rollback fails, inspect PM2 before retrying. Database changes are never rolled back by this script. The existing CloudPanel reverse proxy still points at port 3008; no vhost change is required.
