# Change Log

## Security & Correctness Fixes

### CHANGE 1 – community/main.go
- **What:** `CORS_ALLOWED_ORIGINS` env var (default `https://pawfiler.site`) replaces the hard-coded `Access-Control-Allow-Origin: *` wildcard.
- **What:** `initDB` now returns `errors.New(...)` instead of calling `log.Fatal` so the caller in `main()` controls termination.
- **Added import:** `"errors"`, `"strings"`.
- **Impact:** CORS is configurable per environment without code changes; tighter origin policy in production.

### CHANGE 2 – community/internal/handler/like.go
- **What:** Replaced the two-step EXISTS check + INSERT with a single atomic `INSERT … ON CONFLICT (post_id, user_id) DO NOTHING`. Checks `rowsAffected == 0` to detect a duplicate.
- **Why:** The old pattern had a TOCTOU race: two concurrent requests could both pass the EXISTS check before either inserted.
- **Impact:** Duplicate likes are impossible even under high concurrency.

### CHANGE 3 – community/internal/handler/comment.go
- **What:** `CreateComment` now calls `h.userClient.GetProfile(ctx, req.UserId)` to obtain the canonical nickname and avatar emoji instead of trusting the client-supplied `req.AuthorNickname` / `req.AuthorEmoji` fields.
- **Why:** Clients could send arbitrary values to impersonate other users.
- **Impact:** Author identity is always authoritative and cannot be spoofed.

### CHANGE 4 – user/grpc_handler.go
- **What:** `AddRewards` wrapped in `BeginTx` + `SELECT … FOR UPDATE`. An `INSERT … ON CONFLICT DO NOTHING` first guarantees the profile row exists; then the lock prevents concurrent mutations.
- **Why:** Concurrent quiz completions for the same user caused lost updates (last-write-wins).
- **Impact:** XP and coin deltas are accumulated correctly under concurrent load.

### CHANGE 5 – user/helper.go
- **What:** `withCORS` reads `CORS_ALLOWED_ORIGINS` env var (default `https://pawfiler.site`) and only reflects the `Origin` header when it matches an allowed value.
- **Added import:** `"os"`, `"strings"`.
- **Impact:** Replaces wildcard CORS with an explicit allow-list.

### CHANGE 6 – user/main.go
- **What:** `DATABASE_URL` empty → `log.Fatal`. gRPC-gateway HTTP handler now uses the same `CORS_ALLOWED_ORIGINS` env var.
- **Added import:** `"strings"`.
- **Impact:** Service fails fast on misconfiguration; CORS matches env config.

### CHANGE 7 – admin/main.go
- **What:** `DB_PASSWORD` empty → `log.Fatal`. CORS replaced with `CORS_ALLOWED_ORIGINS` env var (default `https://pawfiler.site`).
- **Added import:** `"strings"`.
- **Impact:** No plaintext default credential; CORS is configurable.

### CHANGE 8 – video-analysis/media_inspector.py
- **What:** Removed `eval(video_stream.get('r_frame_rate', '0/1'))`. Added `_parse_frame_rate(s)` function that splits on `/` and performs safe integer division.
- **Why:** `eval()` on ffprobe output is a remote code execution vulnerability.
- **Impact:** Frame-rate parsing is safe; crafted media files cannot execute arbitrary Python.

---

## New Feature – Auth Service (CHANGE 9)

A new standalone Go HTTP service at `backend/services/auth/` provides JWT-based authentication:

| File | Purpose |
|------|---------|
| `go.mod` | Module definition with JWT, Redis, Gorilla Mux, bcrypt, pq, CORS deps |
| `Dockerfile` | Multi-stage Alpine build; exposes port 8084 |
| `internal/repository/user_repository.go` | CRUD against `auth.users`; bcrypt helpers |
| `internal/handler/auth_handler.go` | Signup, Login (rate-limited via Redis Lua), Refresh, Logout, Validate, Profile, Health |
| `main.go` | Wire-up: DB ping, auto-migration, Redis, Gorilla Mux router, CORS, `PORT` env |

Routes: `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET|POST /auth/validate`, `GET /auth/profile`, `GET /health`.

Both `/auth/*` and `/api/auth/*` paths are accepted (middleware strips `/api` prefix).

---

## Frontend Fixes

### CHANGE 10 – frontend/src/lib/api.ts
- **What:** `request()` now extracts header building into a `buildHeaders()` closure that re-reads `localStorage` on each call so freshly refreshed tokens are used. On HTTP 401, calls `refreshAccessToken()` once (`tokenRefreshed` flag prevents loops). If refresh fails, dispatches `window.dispatchEvent(new Event("auth:logout"))` and throws `"세션이 만료되었습니다"`.
- **Impact:** Expired tokens are silently refreshed; if refresh fails the user is logged out with a clear message.

### CHANGE 11 – frontend/src/contexts/AuthContext.tsx
- **What:** Added `isTokenExpired` helper that returns `true` when `payload.exp` is absent. Added `useEffect` that subscribes to the `auth:logout` custom event and calls `logout()`.
- **Impact:** Tokens without an `exp` claim are treated as expired (fail-safe). The context automatically clears auth state when the API layer signals session expiry.

### CHANGE 12 – frontend/.env.production (new file)
- Sets `VITE_USE_MOCK_AUTH=false` and `VITE_USE_MOCK_API=false` so production builds use real backend APIs.

---

## Infrastructure

### CHANGE 13 – backend/scripts/migrate-add-indexes.sql (new file)
Seven `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statements on `community.posts`, `community.likes`, `community.comments`, `quiz.user_answers`, and `quiz.user_profiles` to support VU 1500–2000 load tests without full-table scans.

### docker-compose.test.yml (project root, new file)
Local integration test stack: Postgres 15, Redis 7, auth-service, community-service, user-service. Uses `healthcheck` conditions on depends_on.

### ArgoCD – apps/gateway/ingress.yaml
Added `/api/auth` → `auth-service:8084` path entry.

### ArgoCD – apps/services/auth/ (new directory)
- `deployment.yaml` – Deployment (image from ECR) + ClusterIP Service on port 8084; liveness/readiness probes on `/health`; secrets via `db-credentials` and `auth-credentials`.
- `hpa.yaml` – HPA: 4–8 replicas, CPU target 60%.
- `external-secret.yaml` – ExternalSecret pulling `/pawfiler/auth/jwt-secret` from AWS Parameter Store.
- `kustomization.yaml` – Kustomization wiring the above with `app.kubernetes.io/component: auth` labels.
