# LAPOR AMAN

A reporting portal for GKM PSC SAHABAT, UPT Puskesmas Suranadi. Reporters describe incidents, request staff assistance, review drafts, and submit reports. Staff review assigned reports and record decisions; administrators access summaries and identity records.

The application uses **SvelteKit 3, Svelte 5, and Convex**, with a **Vercel Node.js 24** deployment target. A Node adapter remains available for local production tests. The interface and user manuals are in Indonesian; this README is in English.

Use this application for evaluation with **synthetic data only**. This is not an operational victim-reporting service.

Evaluation portal: [lapor-aman-evaluation.vercel.app](https://lapor-aman-evaluation.vercel.app). Staff sign in at `/masuk`; passwords are distributed privately. The deployed backend belongs to the separate `lapor-aman-evaluation` Convex project.

## Current evaluation deployment

| Component | Current configuration |
| --- | --- |
| Public portal | [lapor-aman-evaluation.vercel.app](https://lapor-aman-evaluation.vercel.app) |
| Staff sign-in | [Staff sign-in](https://lapor-aman-evaluation.vercel.app/masuk) |
| Hosting | Vercel project `lapor-aman-evaluation`, Node.js 24 |
| Persistence | Native Convex functions and database in a separate evaluation project |
| AI assistance | Server-side NVIDIA requests with validated results and fallback guidance |
| Notifications | Outbox simulation; no external WhatsApp delivery |
| Releases | Manual deployment; GitHub pushes do not automatically publish the application |
| Data | Synthetic evaluation records; the former local PostgreSQL database was not imported |

The portal and backend run in the cloud and do not depend on a developer laptop staying on. Vercel's Production environment is used for the stable **evaluation** URL; that platform label does not mean this application is approved for operational use with real victim data. Preview deployments require their own backend, credentials, and encryption keys before use.

The reporter, administrator/staff, and technical Word manuals are maintained separately from the public repository. Their screenshots use synthetic data. Credentials and private deployment configuration are not included in those manuals.

## Reporting and staff workflows

- `/chat`: victim details, optional NIK (Indonesian national identification number), incident narrative, editable draft, privacy confirmation, and submission receipt with a copyable reference code.
- AI conversation: one permitted follow-up topic at a time, optional skipping, additional narrative, and explicit reporter control over when to review the draft. NVIDIA requests redact recognizable identity patterns; this does not guarantee anonymization. Fallback guidance works without an AI provider.
- AI assistance works both during and outside staff service hours until a staff handoff opens. Service hours control new staff-assistance requests, rather than disabling the AI conversation. Provider requests disable internal thinking for these short JSON responses so the limited completion budget is available for the answer.
- `/petugas`: report inbox with search, filters, review notes, decisions, and reasons. Non-administrator staff can access assigned reports only.
- `/petugas/percakapan`: live handoff, staff replies, and a private guidance panel. Suggestions enter the composer for editing and manual sending. Automatic AI replies pause while a handoff is open.
- Staff guidance validates narrative, approximate time, general location, and requested help against actual reporter messages. It distinguishes missing details from explicit unknown answers. Collected fields feed the reporter's editable draft and later confirmed summary.
- `/rekap`: administrator summary and Excel export. `Rekap` excludes NIK; `Identitas` includes it for authorized administrators.
- `/admin/nik`: administrator identity directory with audited access. Transcript access, guidance access, reviews, decisions, and handoff actions are also audited.
- Convex mutations handle draft versions, idempotent submission, handoff transitions, final decisions, and shared rate-limit counters. A message sequence check rejects stale AI results and prevents late results from overwriting finalized guidance.
- Sensitive content remains AES-256-GCM encrypted before storage in Convex. NIK uses a separate encryption key. Decryption and provider calls happen in SvelteKit server code.
- Evaluation notifications are **outbox-only**: generic pending events are recorded, and no WhatsApp messages are sent. The former PostgreSQL worker is no longer used.

Service hours use **WITA (UTC+8)**: Monday–Thursday 08:00–14:00, Friday 08:00–11:00, Saturday 08:00–12:30. The schedule is stored in Convex. Outside these hours, reporting uses AI mode. Staff can take over an existing conversation independently of reporter request hours.

## Local setup

Requirements: Node.js **24** (the framework minimum is 22.17), npm, and a Convex local or cloud development deployment. Python and Playwright Chromium are needed only for browser tests.

```powershell
npm ci
Copy-Item .env.example .env
```

Start the Convex development backend in a separate terminal:

```sh
npm run convex:dev
```

Follow the CLI configuration prompts. Convex supports local anonymous development as well as signed-in cloud development. Keep this command running when using a local backend. CLI-generated `.env.local` selects the Convex deployment; the SvelteKit server reads its connection from `CONVEX_URL` in `.env`.

Configure `.env` using [.env.example](.env.example):

| Variable | Purpose |
| --- | --- |
| `CONVEX_URL` | Server-only backend URL; local URL printed by the CLI or an HTTPS cloud URL |
| `APPLICATION_SERVER_KEY` | At least 32 random bytes encoded as Base64URL; the same value must exist in Convex |
| `REPORT_DATA_KEY` | Independent 32-byte Base64 AES key for report and supporting content |
| `NIK_DATA_KEY` | Separate 32-byte Base64 AES key for NIK |
| `PUBLIC_BASE_URL` | Local or stable HTTPS canonical origin; read during build |
| `AI_ENABLED` | `false` for fallback-only evaluation; `true` to enable configured NVIDIA requests |
| `NVIDIA_API_KEY` | Optional server-only provider credential |
| `NVIDIA_MODEL` | Default: `nvidia/nemotron-3-ultra-550b-a55b` |
| `DEMO_STAFF_PETUGAS_PASSWORD` | Unique demo password, at least 14 characters |
| `DEMO_STAFF_BIDAN_PASSWORD` | Unique demo password, at least 14 characters |
| `DEMO_STAFF_ADMIN_PASSWORD` | Unique demo password, at least 14 characters |
| `WHATSAPP_PROVIDER` | Keep `outbox` for evaluation |

Generate the application server key privately:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Generate each encryption key separately using the same command with `base64` instead of `base64url`. Save the values in your private environment file. Set the matching server key on the selected Convex deployment without placing it in shell history:

```sh
npx convex env set APPLICATION_SERVER_KEY
```

Then prepare accounts and schedules, verify connectivity, and start the app:

```sh
npm run db:seed
npm run db:check
npm run dev
```

The seed updates the three demo accounts and fills missing service schedules. Existing reports are preserved; it does not import the former PostgreSQL database. Keep encryption keys stable for each environment: changing them without migration makes stored content unreadable.

### Demo accounts

| Username | Seeded roles |
| --- | --- |
| `petugas` | `petugas`, `admin` |
| `bidan` | `bidan_pic`, `admin` |
| `admin` | `admin` |

All three accounts include administrator access to demonstrate supervisor workflows. They do not demonstrate separation of duties; provision narrower accounts for permission evaluation. Passwords come from the private environment file and are never published in the repository or public interface.

For the hosted evaluation, sign in with username `admin` and the password supplied privately by the project owner. There is no shared default password. Local and hosted environments can have different credentials. Account provisioning and report assignment currently require technical administration; there is no account-management interface or self-service password recovery.

### Local production build

```sh
npm run build
npm run start
```

Without `VERCEL=1` or `DEPLOY_TARGET=vercel`, builds use the Node adapter. Set `PUBLIC_BASE_URL` before building and set runtime `PORT` to match that URL. The legacy adapter `ORIGIN` variable is not used. `/chat?mode=operator` overrides service mode for development tests only, never production builds.

## Vercel and Convex deployment

1. Sign in with `npx convex login` and create/select a separate evaluation project using `npx convex dev --configure new`. If device polling times out, use `npx convex login --login-flow paste` and enter its token directly in the terminal.
2. Run `npm run convex:deploy` to publish the functions and schema to that project's production deployment. Set its `APPLICATION_SERVER_KEY` using `npx convex env set APPLICATION_SERVER_KEY --prod`.
3. Create/link a Vercel project. Set server-only environment variables for `CONVEX_URL`, `APPLICATION_SERVER_KEY`, `REPORT_DATA_KEY`, `NIK_DATA_KEY`, optional NVIDIA configuration, and `WHATSAPP_PROVIDER=outbox`. Use fresh keys and synthetic fixtures for this environment.
4. Seed accounts using the target deployment URL and its matching private configuration. Never point a seed or test command at an unrelated environment.
5. Deploy through Vercel. `VERCEL=1` selects `@sveltejs/adapter-vercel` with Node.js 24 and a 60-second function duration. Preview origins derive from `VERCEL_URL`; stable deployments use the configured HTTPS origin or the Vercel project URL.
6. Verify login, ownership and role checks, reporting, handoff, cancellation, draft edits, decisions, identity access, and export at the deployed URL before inviting evaluators.

The browser calls same-origin SvelteKit endpoints. Convex calls use a separate server credential and revalidate stored staff sessions, roles, reporter state, and assignments. Do not expose `APPLICATION_SERVER_KEY`, encryption keys, provider credentials, or deploy keys with a `PUBLIC_` prefix. Convex CLI login and deploy credentials do not belong in the browser or application bundle.

Use independent backend deployments, data, passwords, and encryption keys for preview and stable evaluation environments. PostgreSQL migrations, credentials, dependencies, and the notification worker were removed from the current implementation; the previous PostgreSQL baseline remains in Git history at commit `584e915`. Existing local PostgreSQL data is not modified or copied.

On Windows, a local Vercel adapter build may fail if directory symlinks are unavailable. The Linux CI job checks Vercel artifacts, and Vercel performs the actual cloud build; do not disable operating-system protections to work around local artifact generation.

Official references: [SvelteKit Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel), [Convex deployment](https://docs.convex.dev/production/hosting/vercel), [Convex environments](https://docs.convex.dev/production/multiple-deployments).

## Development and releases

- `development`: shared development and integration branch.
- `feature/vercel-convex`: Convex migration and evaluation release work.
- `main`: protected stable branch. Pull requests require passing `secret-scan` and `integration` checks, an approving review from another person, resolved conversations, and an up-to-date branch. Protection applies to administrators; force pushes and deletion are blocked.

Release changes through a pull request to `main`, then synchronize `development` with the merged release before starting the next change. Deployment is a separate operation: merging a pull request does not by itself redeploy Vercel or Convex in the current setup.

The [Security workflow](.github/workflows/security.yml) checks types, unit tests, Convex integration tests, Node and Vercel builds, secrets, and dependency advisories. It needs no cloud credentials for these tests.

## Verification

```sh
npm run check
npm run check:convex
npm test
npm run test:integration
npm run db:check
npm run build
npm run security:scan -- --history --staged --client
npm audit --audit-level=low
```

Integration tests run native Convex functions through `convex-test` with isolated in-memory data. They cover authorization, expired/revoked sessions, shared rate limits, draft versions, submission idempotency, decisions, encrypted guidance, stale provider output, cancellation, and takeover during AI work. This is complemented by browser tests against an actual local Convex backend.

The evaluation release was verified on **22 October 2026** with 71 unit tests, 23 Convex integration tests, Node and Vercel artifact builds, secret scans, and a hosted browser flow covering manual staff replies, draft confirmation, submission, decisions, identity access, Excel export, and logout. The dependency audit reported zero known vulnerabilities at that time. These checks are a release snapshot, not a guarantee of permanent security; rerun them after code or dependency changes.

For browser verification:

```sh
python -m pip install playwright
python -m playwright install chromium
npm run test:e2e
```

The test runner creates a separate local Convex deployment in the operating system's temporary directory, random credentials and encryption keys, and temporary accounts. It does not reset the application backend. Ports default to 3212/3213 for Convex and 5175 for SvelteKit. Override `E2E_CONVEX_PORT` or `E2E_PORT` if needed. The backend binary version is pinned for reproducibility; `E2E_CONVEX_BACKEND_VERSION` can override it when upgrading the CLI.

Test a local production Node build in PowerShell:

```powershell
$env:E2E_PRODUCTION = 'true'
npm run test:e2e
Remove-Item Env:E2E_PRODUCTION
npm run build
```

Production browser tests use port 5176 and their own build origin. The final regular build restores the local configured origin. Browser coverage includes responsive navigation, chat retries, handoff, private question editing and manual sending, draft confirmation, preserved edits, summaries, decisions, NIK, and Excel. Test screenshots and downloads contain synthetic data only.

`tests/e2e/deployed_smoke.py` verifies an existing HTTPS evaluation deployment. It requires `EVALUATION_BASE_URL`, `DEMO_STAFF_ADMIN_PASSWORD`, and an explicit `ALLOW_EVALUATION_WRITE=true` opt-in. It creates a clearly marked synthetic report and decision, exercises staff guidance and export permissions, then logs out. Run it only against the intended mock environment; it is not a read-only probe.

## Security boundaries

- Use synthetic names, contacts, NIK, and narratives only. MFA, organizational identity management, account recovery, penetration testing, retention automation, and independent security assessment are not implemented.
- NIK storage is a demo exception to the original product brief. Production requires review of lawful processing, privacy notices, consent, retention, deletion, and access policy. Downloaded Excel files are outside application access controls.
- Identity values are not shown in the staff inbox. Administrator reveal and export actions are audited. AI guidance remains unconfirmed until reporter review and submission.
- Open handoffs block automatic AI turns and report submission. Quote validation and revision checks prevent unsupported extraction and stale-result overwrites; they do not guarantee model correctness.
- Convex rate counters are shared across application instances. They are application controls, not distributed denial-of-service protection. Mock datasets use list queries appropriate for limited team evaluation; larger deployments need pagination and retention planning.
- No social-services integration, medical examination arrangements, accompaniment, referrals, or external message delivery are implemented.

See [SECURITY.md](SECURITY.md) for reporting and operational boundaries.

## Repository layout

| Path | Contents |
| --- | --- |
| `convex/schema.ts` | Document schemas and indexes |
| `convex/` | Transactional sessions, staff, reports, chat, handoffs, rate limits, audit, and demo seed functions |
| `convex/_generated/` | CLI-generated API and schema types; committed with the functions |
| `src/lib/server/` | Server-side Convex client, encryption, cookies, authorization, AI, reports, and exports |
| `src/routes/` | Public/staff pages, form actions, and same-origin API endpoints |
| `scripts/` | Convex seed/check, secret scanner, isolated browser test runner |
| `tests/integration/` | Convex lifecycle and authorization tests |
| `.github/workflows/` | Security, type, build, and integration checks |

Internal product, design, QA, and audit documents remain local. `.env*`, `.convex/`, `.vercel/`, screenshots, and generated downloads are excluded from publication, except for the placeholder-only `.env.example`.
