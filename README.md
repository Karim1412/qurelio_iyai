> **Standards portal update:** See [STANDARDS_PORTAL_UPDATE.md](STANDARDS_PORTAL_UPDATE.md) for the updated requirements view, extraction behavior, setup and verification.

> **Compliance engine update:** See [COMPLIANCE_ENGINE_UPDATE.md](COMPLIANCE_ENGINE_UPDATE.md) for setup, evidence review, score rules, validation and limitations.

# Qurelio

For this version's standards and regulations extraction changes, installation
steps, testing guidance and limitations, see [STANDARDS_EXTRACTION_UPDATE.md](STANDARDS_EXTRACTION_UPDATE.md).

**AI-powered Quality Management System (QMS)**: a multi-tenant SaaS platform for ISO compliance. Companies upload ISO standards and product/evidence documents, run **AI-driven clause-by-clause conformity evaluations**, manage the resulting **non-conformities (CAPA)**, plan and score **audits**, generate **reports**, and chat with their workspace through a **RAG assistant**.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Services & Ports](#services--ports)
- [Environment Variables](#environment-variables)
- [Running with Docker (recommended)](#running-with-docker-recommended)
- [Running without Docker (local development)](#running-without-docker-local-development)
- [Default Accounts & Roles](#default-accounts--roles)
- [Key Conventions](#key-conventions)

---

## Features

- **Authentication & multi-tenancy**: company registration with OTP email verification, JWT access/refresh tokens, account lockout, avatar upload, company invite codes, super-admin back office (approve / suspend / delete companies).
- **Document management (DMS)**: products with a 5-step onboarding wizard, nested folders (file manager), document versioning, approval workflow (Draft → In Review → Approved/Rejected), ACL access rules (role / department / user), trash & restore, full audit trail. Documents are typed: ISO norm, product doc, procedure, evidence, workspace file.
- **AI document ingestion**: on upload, files are OCR'd / text-extracted (PDF, DOCX, XLSX, images via Tesseract), structured into JSON by an LLM, and indexed into Pinecone for semantic retrieval.
- **AI conformity evaluations**: queue-based (BullMQ) clause-by-clause assessment of evidence against ISO 9001 clauses, with live progress streamed over SSE, per-clause verdict override, conformity score, NC drafts, and PDF/XLSX export.
- **Non-conformities & CAPA**: full NC lifecycle (Open → RCA → CAPA defined → In Progress → Pending Verification → Closed), 5-Why and Ishikawa/6M root-cause analysis with AI suggestions, corrective/preventive actions, effectiveness verification, KPIs, due-date reminders (cron).
- **Audits**: internal / supplier / certification audits with hierarchical checklists (AI-suggested and AI-scored), findings that auto-create NCs, change log, export.
- **Reports**: versioned report instances (audit, NC, CAPA, incident, complaint) with approval workflow and reusable templates, exported as branded PDFs.
- **RAG workspace chat**: tenant-scoped chat grounded in the company's indexed documents and live operational data.
- **Notifications**: in-app inbox (read/archive) fed by internal events (evaluation complete/failed, extraction complete, CAPA assigned / due soon) plus transactional email.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | **Next.js 15** (App Router, standalone output, Turbopack), **React 19**, TypeScript |
| UI | Tailwind CSS v4, Radix UI primitives, MUI (legacy surfaces), HugeIcons, Framer Motion, TipTap editor, Recharts, React Hook Form + Zod |
| State | Zustand (auth store), Axios client with automatic JWT refresh |
| API Gateway | **NestJS 10**: reverse proxy, centralized RBAC, rate limiting (throttler), Helmet, SSE/binary/multipart forwarding |
| Microservices | **NestJS 10** (auth, document, evaluation, notification), TypeORM 0.3, class-validator |
| AI / RAG service | **Python 3.11 / FastAPI**, LangChain, OpenAI (`gpt-4o-mini` + `text-embedding-3-small`, configurable base URL / OpenRouter fallback), Tesseract OCR (eng/fra/ara), pypdf / python-docx / openpyxl |
| Database | **PostgreSQL 16** (shared instance, each service owns its tables; `uuid-ossp`, `pg_trgm`) |
| Vector store | **Pinecone** |
| Queue / cache | **Redis 7** + BullMQ (evaluation jobs), `@nestjs/schedule` cron (CAPA reminders) |
| Object storage | **MinIO** (S3-compatible; documents, versions, avatars, bucket `qurelio-docs`) |
| Email | SMTP via Nodemailer (OTP, invitations, password reset) |
| Auth | JWT (access + refresh) verified locally by every service with a shared secret; `X-Internal-Token` for service-to-service calls |
| Containerization | Docker + Docker Compose, multi-stage `node:20-alpine` / `python:3.11-slim` images, non-root users, healthchecks |

## Architecture

The browser only ever talks to the **frontend** (port 3001), which rewrites `/api/*` to the **gateway** (port 3000). The gateway verifies the JWT, enforces role-based access rules, and proxies each route prefix to the owning microservice. Services call each other over the Docker network using internal tokens.

```
                        ┌──────────────┐
   Browser ──:3001──▶   │   Frontend   │  Next.js 15
                        │  (rewrites   │
                        │   /api/* ▼)  │
                        └──────┬───────┘
                               │ :3000
                        ┌──────▼───────┐
                        │   Gateway    │  NestJS: JWT + RBAC + proxy
                        └──────┬───────┘
      ┌────────────┬───────────┼────────────┬─────────────────┐
      │ /auth      │ /documents│ /evaluations│ /notifications  │ /chat /ingest
      │ /company   │           │ /nc /audits │                 │
      │ /admin     │           │ /reports    │                 │
┌─────▼─────┐ ┌────▼──────┐ ┌──▼─────────┐ ┌─▼────────────┐ ┌──▼─────────┐
│   Auth    │ │ Document  │ │ Evaluation │ │ Notification │ │    RAG     │
│  :3002    │ │  :3003    │ │   :3005    │ │    :3004     │ │   :8000    │
│  NestJS   │ │  NestJS   │ │  NestJS    │ │   NestJS     │ │  FastAPI   │
└─────┬─────┘ └────┬──────┘ └──┬─────────┘ └─┬────────────┘ └──┬─────────┘
      │            │           │             │                 │
      └────────────┴─────┬─────┴─────────────┘                 │
                         │                                     │
        ┌──────────┬─────┴─────┬──────────┐          ┌─────────┴─────────┐
        │ Postgres │   Redis   │  MinIO   │          │ Pinecone │ OpenAI │
        │  :5432   │   :6379   │ :9000/01 │          │ (cloud)  │ (API)  │
        └──────────┴───────────┴──────────┘          └───────────────────┘
```

**Typical flow:** upload a document → document-service stores it in MinIO and fires the RAG ingestion pipeline (OCR → LLM structuring → Pinecone indexing) → user launches an evaluation → evaluation-service enqueues a BullMQ job that calls the RAG evaluation engine → progress streams back over SSE → results become NC drafts → NCs go through RCA/CAPA → audits and reports close the loop → notifications fire at each milestone.

## Repository Layout

```
Qurelio/
├── apps/
│   ├── frontend/              # Next.js 15 UI (port 3001)
│   ├── gateway/               # NestJS API gateway (port 3000)
│   └── project/               # Secondary/prototype Next.js 13 app (Netlify + Supabase), not part of the composed stack
├── services/
│   ├── auth-service/          # Users, companies, JWT, OTP, avatars (port 3002)
│   ├── document-service/      # Products, folders, documents, versions, ACL (port 3003)
│   ├── evaluation-service/    # Evaluations, NC/CAPA, audits, reports (port 3005)
│   ├── notification-service/  # In-app notifications (port 3004)
│   └── rag-service/           # Python FastAPI, ingestion, evaluation engine, chat, CAPA/audit AI (port 8000)
├── docker/
│   ├── docker-compose.yml     # Full-stack orchestration
│   └── init-db.sql            # Postgres extensions + grants
├── package.json               # Root scripts (docker:up / docker:down / docker:config)
└── tsconfig.base.json         # Shared TypeScript config
```

> `.history/` is a VS Code Local History dump: ignore it.

## Services & Ports

| Service | Port | Health check | Role |
|---|---|---|---|
| frontend | **3001** | `GET /` | Next.js UI |
| gateway | **3000** | `GET /api/health/live` | Single entry point, RBAC, proxying |
| auth-service | **3002** | `GET /api/health` | Auth, users, companies, avatars |
| document-service | **3003** | `GET /api/health` | DMS, products, MinIO storage, ingestion trigger |
| notification-service | **3004** | `GET /api/health` | In-app inbox + internal event endpoints |
| evaluation-service | **3005** | `GET /api/health` | Evaluations, NC/CAPA, audits, reports |
| rag-service | **8000** | `GET /api/health` | Ingestion, RAG chat, AI evaluation engine |
| postgres | 5432 | `pg_isready` | Shared relational DB |
| redis | 6379 | `redis-cli ping` | BullMQ queue + cache |
| minio | 9000 / 9001 | `/minio/health/live` | Object storage (9001 = web console) |

## Environment Variables

Create a **`.env` file at the repository root** (it is git-ignored). Docker Compose reads it via `--env-file .env`, and services running locally load it too (e.g. the seed script reads `../../.env`).

```env
# ── PostgreSQL ────────────────────────────────────────────
POSTGRES_USER=qurelio
POSTGRES_PASSWORD=change-me
POSTGRES_DB=qurelio_db

# ── JWT ───────────────────────────────────────────────────
JWT_SECRET=change-me-long-random
JWT_REFRESH_SECRET=change-me-other-long-random
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── MinIO (object storage) ────────────────────────────────
MINIO_ACCESS_KEY=qurelio
MINIO_SECRET_KEY=change-me
MINIO_BUCKET=qurelio-docs
# URL the *browser* uses for presigned links (keep aligned with the host port mapping)
MINIO_PUBLIC_URL=http://localhost:9000

# ── Email (SMTP via nodemailer) ───────────────────────────
SENDGRID_API_KEY=            # legacy names: used as SMTP credentials
SENDGRID_SENDER_EMAIL=no-reply@example.com
SENDGRID_TEMPLATE_ID=

# ── Frontend / CORS ───────────────────────────────────────
FRONTEND_URL=http://localhost:3001

# ── Service-to-service shared secret ──────────────────────
DOCUMENT_INTERNAL_TOKEN=qurelio-dev-internal

# ── AI / RAG ──────────────────────────────────────────────
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=             # optional: custom OpenAI-compatible endpoint
OPENAI_MODEL=gpt-4o-mini
STRUCTURE_MODEL=gpt-4o
EMBEDDING_API_KEY=           # optional: separate key for embeddings
EMBEDDING_BASE_URL=
EMBEDDING_MODEL=openai/text-embedding-3-small
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=qurelio-vectors
# Optional chat fallback (OpenRouter)
CHAT_LLM_FALLBACK_API_KEY=
CHAT_LLM_FALLBACK_BASE_URL=https://openrouter.ai/api/v1
CHAT_LLM_FALLBACK_MODEL=openai/gpt-4o-mini
# Set to false to run without the RAG extraction pipeline
RAG_INGEST_ENABLED=true
```

## Running with Docker (recommended)

**Prerequisites:** Docker Desktop (Compose v2) and a root `.env` file (see above).

```bash
# From the repository root:

# 1. Validate the resolved compose configuration (checks your .env)
npm run docker:config

# 2. Build and start the full stack (infra + all services + frontend)
npm run docker:up            # = docker compose -f docker/docker-compose.yml --env-file .env up

# Detached mode / rebuild after code changes:
docker compose -f docker/docker-compose.yml --env-file .env up -d --build

# 3. Stop everything
npm run docker:down
```

Compose starts services in dependency order with healthchecks: **postgres / redis / minio** first, then the microservices, then the **gateway**, then the **frontend**.

Once everything is healthy:

| URL | What |
|---|---|
| http://localhost:3001 | Application UI |
| http://localhost:3000/api | Gateway API |
| http://localhost:9001 | MinIO console (login = `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`) |

> **Windows note:** if `http://localhost:3001` doesn't respond, try `http://127.0.0.1:3001` (IPv6 vs IPv4 binding) and keep `FRONTEND_URL` aligned with whichever URL you actually open.

Data persists in named volumes `postgres_data`, `redis_data`, `minio_data`. To reset completely:

```bash
docker compose -f docker/docker-compose.yml --env-file .env down -v
```

## Running without Docker (local development)

**Prerequisites:** Node.js 20+, Python 3.11+, and running instances of **PostgreSQL 16**, **Redis 7**, and **MinIO** (easiest is to run just the infrastructure through Docker):

```bash
docker compose -f docker/docker-compose.yml --env-file .env up postgres redis minio
```

If you run Postgres yourself, apply `docker/init-db.sql` (enables `uuid-ossp` and `pg_trgm`). TypeORM is in `synchronize: true` mode, so tables are created automatically on first boot.

Each service reads the same variables as in Docker, but with hosts pointing at localhost (`POSTGRES_HOST=localhost`, `REDIS_HOST=localhost`, `MINIO_ENDPOINT=localhost`) and sibling service URLs like `RAG_SERVICE_URL=http://localhost:8000`, `DOCUMENT_SERVICE_URL=http://localhost:3003`, etc.

Install and start each component in its own terminal (order: services → gateway → frontend):

```bash
# 1. Auth service (port 3002)
cd services/auth-service && npm install && npm run start:dev

# 2. Notification service (port 3004)
cd services/notification-service && npm install && npm run start:dev

# 3. Document service (port 3003)
cd services/document-service && npm install && npm run start:dev

# 4. Evaluation service (port 3005)
cd services/evaluation-service && npm install && npm run start:dev

# 5. RAG service (port 8000): needs Tesseract OCR installed for image OCR
cd services/rag-service
python -m venv venv
venv\Scripts\activate            # Windows   (Linux/macOS: source venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 6. Gateway (port 3000)
cd apps/gateway && npm install && npm run start:dev

# 7. Frontend (port 3001): proxies /api to http://127.0.0.1:3000 by default
cd apps/frontend && npm install && npm run dev
```

Notes:

- All NestJS services share the same scripts: `npm run start:dev` (watch mode), `npm run build`, `npm start` (runs `dist/main`).
- The frontend defaults its `/api` rewrite to `http://127.0.0.1:3000` (the gateway), so no extra config is needed locally. Override with `API_PROXY_TARGET` if your gateway runs elsewhere.
- You can skip `rag-service` for pure CRUD work: set `RAG_INGEST_ENABLED=false` for document-service so uploads don't wait on the extraction pipeline (AI evaluations and chat won't work without it).
- Production build of the frontend: `npm run build && npm run start` (standalone Next.js output, port 3001).

## Default Accounts & Roles

A **super admin** is bootstrapped automatically (auth-service startup initializer, plus a standalone `seed.ts` script):

- **Email:** `admin@qurelio.com`: **Password:** `SuperAdmin@2024!` *(change immediately in any real deployment)*

Roles:

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Platform back office: manages companies only, blocked from tenant features |
| `DIRECTOR` | Company owner: user management, full tenant access |
| `QUALITY_MANAGER` | QMS operations: evaluations, NC/CAPA, audits, reports |
| `AUDITOR` | Audit execution and findings |
| `OPERATOR` | Day-to-day document/task work |

## Key Conventions

- **Single entry point:** the browser never calls microservices directly, everything goes through the frontend `/api` rewrite → gateway. The gateway enforces RBAC per route prefix and forwards SSE, binary downloads, and multipart uploads with dedicated handlers.
- **Service-to-service auth:** internal endpoints (extraction callbacks, notifications, chat context) are guarded by the shared `DOCUMENT_INTERNAL_TOKEN` sent as `X-Internal-Token`.
- **Database:** one PostgreSQL instance; each service owns its own tables via TypeORM `synchronize: true` (fine for development, disable for production migrations).
- **Path alias (frontend):** `@/*` → `src/*`; icons must be imported from `@/components/icons` (HugeIcons wrapper), design tokens via CSS variables, see `apps/frontend/CLAUDE.md` for full frontend conventions.
- **Tests:** no test runner is currently wired in any package.
