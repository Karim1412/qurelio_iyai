# Docker: Commands Cheat Sheet

All commands run **from the repository root** (`/Qurelio`). The compose file lives in
`docker/docker-compose.yml` and its build contexts are relative to it, so always pass
`-f docker/docker-compose.yml` instead of `cd docker`.

**Prerequisites:** Docker Engine + Compose v2 (`docker compose version`), and a root `.env`
file (all secrets and ports are read from it).

---

## 1. Shortcut

Every command below repeats the same prefix. Export it once per terminal:

```bash
export DC="docker compose -f docker/docker-compose.yml --env-file .env"
```

Then use `$DC up -d`, `$DC logs -f gateway`, …

The three npm scripts in the root `package.json` are the same thing:

```bash
npm run docker:config    # validate the resolved config against your .env
npm run docker:up        # up (attached)
npm run docker:down      # down
```

---

## 2. Start everything (infra + services + gateway + frontend)

```bash
# Validate .env resolution first: catches missing variables before any build
docker compose -f docker/docker-compose.yml --env-file .env config

# Build + start the full stack, detached
docker compose -f docker/docker-compose.yml --env-file .env up -d --build

# Follow the logs of the whole stack
docker compose -f docker/docker-compose.yml --env-file .env logs -f

# Status of every container (+ health)
docker compose -f docker/docker-compose.yml --env-file .env ps
```

Compose respects the dependency order: **postgres / redis / minio** (healthy) →
**auth, notification, document, rag, evaluation** → **gateway** → **frontend**, then the
one-shot **seed** container runs and exits.

---

## 3. Start one part only

`up <service>` also starts everything that service `depends_on`, so you never have to list
the infrastructure by hand.

### Frontend (Next.js, :3001)

```bash
$DC up -d --build frontend        # pulls in gateway + auth + postgres/redis/minio
$DC logs -f frontend
$DC restart frontend
```

> The frontend image is built with `API_PROXY_TARGET=http://gateway:3000` baked in as a
> build arg: after changing that target you must rebuild, not just restart.

### Gateway (NestJS API, :3000)

```bash
$DC up -d --build gateway         # pulls in auth-service + postgres/redis/minio
$DC logs -f gateway
curl http://localhost:3000/api/health/live
```

### Backend microservices

```bash
# One service
$DC up -d --build auth-service
$DC up -d --build document-service
$DC up -d --build evaluation-service
$DC up -d --build notification-service
$DC up -d --build rag-service

# All of them in one shot (no gateway, no frontend)
$DC up -d --build auth-service document-service evaluation-service notification-service rag-service

# Logs of several services at once
$DC logs -f auth-service document-service
```

### Infrastructure only (postgres / redis / minio)

Useful when you want to run the Node/Python services on the host (`npm run start:dev`)
against dockerized infrastructure.

```bash
$DC up -d postgres redis minio
```

---

## 4. Rebuild after a code change

`up -d` reuses the existing image; add `--build` (or build explicitly) whenever source
files changed.

```bash
$DC up -d --build frontend                    # rebuild + recreate one service
$DC build --no-cache document-service         # force a clean rebuild (dependency changes)
$DC up -d --force-recreate gateway            # recreate the container without rebuilding
```

---

## 5. Logs, shell, health

```bash
$DC logs -f --tail=100 evaluation-service     # follow last 100 lines
$DC exec gateway sh                           # shell inside a running container
$DC exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
$DC exec redis redis-cli ping
$DC top                                       # processes per container
$DC stats                                     # live CPU / memory
```

Health endpoints (host side, default ports):

```bash
curl http://localhost:3000/api/health/live    # gateway
curl http://localhost:3002/api/health         # auth
curl http://localhost:3003/api/health         # document
curl http://localhost:3004/api/health         # notification
curl http://localhost:3005/api/health         # evaluation
curl http://localhost:8000/api/health         # rag
curl http://localhost:3001/                   # frontend
```

---

## 6. Demo data (seed)

The `seed` service is one-shot: it runs on `up`, bootstraps the demo tenant
(`director@althea-medtech.demo` / `Demo@2024!`), seeds products and document folders, then
exits. It is idempotent, so re-running is safe.

```bash
$DC up seed                                   # re-run the seed (attached, shows output)
$DC run --rm seed                             # run it as a throwaway container
SEED_COMPANY_ID=<uuid> $DC up seed            # seed into an existing company
$DC logs seed                                 # what the last run did
```

---

## 7. Stop / clean up

```bash
$DC stop                     # stop containers, keep them
$DC stop frontend gateway    # stop specific ones
$DC down                     # stop + remove containers and the network (volumes kept)
$DC down -v                  # ALSO delete postgres_data / redis_data / minio_data, full data reset
$DC rm -f seed               # drop the exited seed container
docker system prune -f       # reclaim dangling images/build cache (repo-wide, be deliberate)
```

`down -v` is destructive: database, uploaded documents and cache all go away, and the next
`up` re-seeds from scratch.

---

## 8. Ports

Each container port is fixed; the **host** port is what you can move via `.env`. Defaults
apply when the variable is unset.

| Service | Container | Host default | `.env` override |
|---|---|---|---|
| frontend | 3001 | 3001 | `FRONTEND_HOST_PORT` |
| gateway | 3000 | 3000 | `GATEWAY_HOST_PORT` |
| auth-service | 3002 | 3002 | `AUTH_HOST_PORT` |
| document-service | 3003 | 3003 | `DOCUMENT_HOST_PORT` |
| notification-service | 3004 | 3004 | `NOTIFICATION_HOST_PORT` |
| evaluation-service | 3005 | 3005 | `EVALUATION_HOST_PORT` |
| rag-service | 8000 | 8000 | `RAG_HOST_PORT` |
| postgres | 5432 | 5432 | `POSTGRES_HOST_PORT` |
| redis | 6379 | 6379 | `REDIS_HOST_PORT` |
| minio (API) | 9000 | 9000 | `MINIO_HOST_PORT` |
| minio (console) | 9001 | 9001 | `MINIO_CONSOLE_PORT` |

Container names are prefixed by `COMPOSE_PROJECT_NAME` (default `qurelio`), e.g.
`qurelio_gateway`.

Inside the Docker network, services always talk to each other on the **container** port
(`http://gateway:3000`, `http://rag-service:8000`), host overrides do not affect that.

---

## 9. Troubleshooting

**Port already allocated**: set the matching `*_HOST_PORT` in `.env` and `up -d` again.
Find the squatter with `ss -ltnp | grep 3000`.

**`config` prints empty values / a service reads the wrong credentials**, the variable is
missing from the root `.env`. `auth-service` and `seed` load `.env` via `env_file`; the
other services get their values interpolated by compose, so an unset variable becomes an
empty string instead of an error.

Today `config` warns about `SENDGRID_API_KEY`, `SENDGRID_SENDER_EMAIL` and
`SENDGRID_TEMPLATE_ID`: the compose file still references them while `.env` provides the
`SMTP_*` variables that the services actually use. Those warnings are expected and harmless;
mail goes out over SMTP via Nodemailer.

**Browser can't reach the app on `localhost`**: try `http://127.0.0.1:3001` (IPv6 `::1` vs
IPv4) and keep `FRONTEND_URL` identical to the URL you actually open, otherwise CORS and
cookies break.

**Presigned download / avatar URLs point at `minio` and fail in the browser**, set
`MINIO_PUBLIC_URL` to a host the browser can resolve (e.g. `http://<server-ip>:9000`), then
recreate `document-service` and `auth-service`.

**A service restarts in a loop**: `$DC logs --tail=200 <service>`. Most common causes are a
failed DB connection (postgres not healthy yet) and a missing JWT/secret variable.

**Uploads succeed but nothing gets indexed**: check `rag-service` logs and its
`OPENAI_API_KEY` / `PINECONE_API_KEY`. To run `document-service` without the RAG pipeline,
set `RAG_INGEST_ENABLED=false`.

**Which compose values are actually in effect**:
`$DC config` (full resolved file) or `$DC config --services` (service names only).
