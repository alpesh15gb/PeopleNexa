# Deploying PeopleNexa (VPS + Docker + host nginx)

PeopleNexa is multi-tenant by **subdomain** (`crk.peoplenexa.in`, `acme.peoplenexa.in`).
The app resolves the tenant from the `Host` header, so the reverse proxy must
forward the original hostname (`proxy_set_header Host $host`) and TLS needs a
**wildcard certificate** for `*.peoplenexa.in`.

```
Internet ──► nginx (host, :443, TLS, wildcard cert)
                  └─► Docker network "internal"
                        ├─ app (Next.js standalone, 127.0.0.1:3000)
                        └─ db  (PostgreSQL 17, only reachable inside the network)
```

## 1. Prereqs on the VPS

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx certbot
sudo systemctl enable --now docker nginx
```

## 2. Environment

```bash
# app secrets (JWT_SECRET, EBIO_ENCRYPTION_KEY, CRON_SECRET, APP_BASE_DOMAIN)
cp .env.production.example .env.production   # then edit with real values

# database credentials for compose interpolation
cp .env.example .env                          # set POSTGRES_PASSWORD
```

Generate secrets (run locally or on the VPS):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# JWT_SECRET  ← one
# EBIO_ENCRYPTION_KEY ← another (must stay 64 hex chars / 32 bytes)
# CRON_SECRET ← another
```

> **Important:** `EBIO_ENCRYPTION_KEY` must not change between restarts or
> already-saved eBioserver credentials become undecryptable.

## 3. DNS

Point the A records at the VPS IP:

| Name | Type | Value |
|---|---|---|
| `peoplenexa.in` | A | `<vps-ip>` |
| `*.peoplenexa.in` | A | `<vps-ip>` |

Wait for propagation before issuing the certificate.

## 4. TLS (wildcard cert)

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d peoplenexa.in -d '*.peoplenexa.in'
# add the TXT record at your DNS provider, then continue
```

Add auto-renewal (reloads nginx on success):

```bash
sudo crontab -e
# 0 3 * * * sudo certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

## 5. Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/peoplenexa.conf
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Build & run

```bash
docker compose up -d --build
docker compose ps          # wait for app to show (healthy)
```

First boot applies the schema (`prisma db push`) automatically. To load the
demo tenant on the very first boot only:

```bash
# in .env.production: SEED_DB=true
docker compose up -d
# after the container is healthy, set SEED_DB=false and restart:
docker compose up -d
```

## 7. Verify

```bash
curl -s https://peoplenexa.in/api/health        # {"ok":true,"db":"up"}
curl -sI https://crk.peoplenexa.in/login        # 200, HTTPS
```

Log in at `https://crk.peoplenexa.in/login` with the seeded demo admin
(`admin@apex.com` / `admin123`) — **change these immediately**.

## 7b. Super admin console

The platform console lives at `https://peoplenexa.in/superadmin` — manage
tenants, module flags, seats, plans and license history from there.

The seed creates the super admin from env (always override in production):

```bash
# in .env.production
SUPERADMIN_EMAIL=admin@peoplenexa.in
SUPERADMIN_PASSWORD=<a long random password>
```

Defaults (dev only, printed by the seed):
`superadmin@peoplenexa.in` / `superadmin123` — **change these immediately**
and never run with the defaults in production.

## 8. eBioserver pull (cron)

The device sync endpoint runs on a schedule from the host:

```bash
# every 5 minutes — replace CRON_SECRET with the value from .env.production
*/5 * * * * curl -fsS -H "x-cron-secret: <CRON_SECRET>" https://peoplenexa.in/api/cron/ebioserver-pull
```

## Day-2 operations

```bash
docker compose logs -f app         # app logs
docker compose logs -f db          # database logs
docker compose up -d --build       # deploy a new build
docker compose down                # stop (data survives in the pgdata volume)
docker volume ls                   # pgdata volume holds all data
```

Backup the database:

```bash
docker compose exec db pg_dump -U peoplenexa peoplenexa > backup-$(date +%F).sql
# restore:
cat backup.sql | docker compose exec -T db psql -U peoplenexa peoplenexa
```

## Troubleshooting

- **404 / wrong tenant on a subdomain** — check nginx forwards the host:
  `curl -sI -H "Host: crk.peoplenexa.in" http://127.0.0.1:3000/login`
- **502 from nginx** — app container down: `docker compose logs app`.
- **Session bounces to /login after deploy** — sessions are JWT-signed with
  `JWT_SECRET`; changing it invalidates everyone's session (they just log in
  again — not a bug).
- **`prisma db push` fails at boot** — usually the db container isn't healthy
  yet; `docker compose restart app` once `docker compose ps` shows db healthy.
