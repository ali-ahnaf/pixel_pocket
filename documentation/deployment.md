# Deploy runbook

How the production deploy to the Hostinger VPS works — required secrets, bundle contract, PM2, migrations, and what breaks it.

Deploy is fully automated on **push to `main`** via `.github/workflows/ci-cd.yml` (jobs: test → build → deploy → release). No manual deploy path exists.

## Required GitHub secrets

| Secret                  | Meaning                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOSTINGER_VPS_HOST`    | VPS IP/hostname                                                                                                                                                      |
| `HOSTINGER_VPS_PORT`    | SSH port (defaults to 22 if unset)                                                                                                                                   |
| `HOSTINGER_VPS_USER`    | SSH user                                                                                                                                                             |
| `HOSTINGER_VPS_APP_DIR` | App dir on VPS, e.g. `/var/www/pocket_pixel`                                                                                                                         |
| `HOSTINGER_VPS_SSH_KEY` | Private SSH key (deploy job strips `\r`)                                                                                                                             |
| `API_ENV`               | **Entire content** of the API `.env` — written verbatim to `packages/api/.env` on the VPS every deploy                                                               |
| `VAPID_PUBLIC_KEY`      | Web Push VAPID public key — inlined into the UI build as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (see the `Build UI` step). Not secret, but must match the API's private key. |

Adding a new env var to the API means updating the `API_ENV` secret too, or prod silently runs without it.

### Setting the secrets with the `gh` CLI

Requires `gh` authenticated with `repo` scope (`gh auth login`, verify with `gh auth status`). All commands below assume you are inside the repo clone so `gh` resolves `ali-ahnaf/pixel_pocket` from the git remote; otherwise add `--repo ali-ahnaf/pixel_pocket`. `gh secret set` creates or overwrites — there is no separate update command, and existing values can never be read back, only replaced.

Single-line values — pass them on stdin rather than as an argument so they never land in your shell history:

```bash
printf '%s' '203.0.113.10'          | gh secret set HOSTINGER_VPS_HOST
printf '%s' '22'                    | gh secret set HOSTINGER_VPS_PORT
printf '%s' 'deploy'                | gh secret set HOSTINGER_VPS_USER
printf '%s' '/var/www/pocket_pixel' | gh secret set HOSTINGER_VPS_APP_DIR
printf '%s' 'BB...public-key...'    | gh secret set VAPID_PUBLIC_KEY
```

Multi-line values — read them from a file with `--body-file` (`-f`), which preserves newlines exactly:

```bash
gh secret set HOSTINGER_VPS_SSH_KEY --body-file ~/.ssh/pocket_pixel_deploy   # the PRIVATE key, no .pub
gh secret set API_ENV               --body-file packages/api/.env
```

Notes:

- `HOSTINGER_VPS_SSH_KEY` is the full private key including the `-----BEGIN ...-----` / `-----END ...-----` lines and the trailing newline. The deploy job strips `\r`, so a CRLF file still works, but don't hand-retype it.
- `API_ENV` is the whole `.env` file, not one variable. Re-run the `--body-file` command after adding any new API env var; the local `packages/api/.env` may contain dev-only values, so keep a prod copy (e.g. `~/pocket_pixel/prod.env`) and set the secret from that instead of from the working tree.
- Verify names and update timestamps (values are never shown): `gh secret list`.
- Remove one with `gh secret delete <NAME>`.
- These are repo-level Actions secrets, which is what `ci-cd.yml` reads. Don't pass `--env`/`--org` unless you also rewire the workflow to an environment.

After changing a secret, the next push to `main` picks it up — editing only `.md`/`.yml` files does not trigger a run, so re-run the last workflow manually if you need a deploy without a code change: `gh workflow run ci-cd.yml --ref main`.

### Web Push (VAPID)

Generated once with `npx web-push generate-vapid-keys`. The public key is not sensitive (it's exposed to every browser tab); the private key must never be committed or logged.

- API `.env` (bundled into the `API_ENV` secret): `VAPID_SUBJECT` (a `mailto:` contact), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- UI build: `VAPID_PUBLIC_KEY` GitHub secret → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (inlined at build time in the `Build UI` step of `ci-cd.yml`, same value as the API's public key).

Rotating the key pair requires updating all three at once — a stale public key on the UI silently fails every new subscription.

## Bundle contract (the fragile part)

The build job hand-assembles `bundle/` with **hardcoded paths**:

```
bundle/
├── package.json, package-lock.json, ecosystem.config.js
├── packages/shared/{package.json, dist/}
├── packages/api/{package.json, dist/}
└── packages/ui/{package.json, out/}
```

Anything the API needs at runtime that is not inside those paths **does not ship**. Breaks to watch for:

- Renaming/moving a package or changing its build output dir (`dist/`, `out/`) without updating the `Stage deploy bundle` step.
- Runtime assets outside `dist/` (templates, static files) — they silently vanish in prod.
- The workflow itself ignores `**.yml`/`**.yaml`/`**.md` pushes — editing only the workflow file does not trigger a run.

## What happens on the VPS

1. rsync `bundle/` → `$VPS_APP_DIR` with `--delete` (excludes `node_modules/`, `.env*`, `*.sqlite` — DB and env survive).
2. Write `packages/api/.env` from `API_ENV`.
3. `npm ci --omit=dev --workspace=packages/api --workspace=packages/shared --include-workspace-root`.
4. `npm run migration:run-prod` — applies `dist/migrations/*.js` to `/var/www/pocket_pixel/pocket_pixel.sqlite` (path hardcoded in `data-source.ts` `DB_PATH`).
5. `pm2 startOrRestart ecosystem.config.js --only pocket-pixel --env production` + `pm2 save`. Single fork, port 4000; the API serves the UI static export from `packages/ui/out`.
6. Release job tags `v<date>-<run#>` with generated notes.

## Debugging a bad deploy

- SSH in, then: `pm2 logs pocket-pixel`, `pm2 status`, check `$VPS_APP_DIR/packages/api/.env` exists and is current.
- Migration failure: run `npm run migration:run-prod --workspace=packages/api` manually in `$VPS_APP_DIR` to see the error.
- DB lives **outside** the rsync'd tree contract (`*.sqlite` excluded) — never rsync or delete it. The backup scheduler (`backup-scheduler.ts`) pushes copies to R2/S3.
