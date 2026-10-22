# LAPOR AMAN

A reporting portal for GKM PSC SAHABAT, UPT Puskesmas Suranadi. Reporters describe incidents, request staff assistance, review drafts, and submit reports. Staff review reports and record decisions; administrators can access summaries and identity records.

The current implementation is a limited evaluation demo using **SvelteKit 3, Svelte 5, Node.js, and PostgreSQL**. Use synthetic data only. The interface remains in Indonesian; this README is in English for development and team evaluation.

## Current capabilities

- Separate public and staff navigation. The `/chat` flow covers victim details, the incident narrative, and review before submission. NIK (Indonesian national identification number) is optional. Receipts include a copyable reference code.
- Multi-turn conversation with optional follow-up questions, skipping, additional narrative, and editable summaries. The reporter chooses when to finish and review the draft.
- PostgreSQL persistence for sessions, drafts, reports, decisions, audit events, transcripts, notification outbox entries, and encrypted staff guidance.
- Staff authentication with server sessions, HttpOnly cookies, CSRF protection, login throttling, role checks, and auditing.
- Report inbox at `/petugas`, with search, status filters, review notes, and decisions with reasons. Assigned staff see their reports; administrators can review all reports. Mobile layouts alternate between list and detail.
- Live assistance at `/petugas/percakapan`. Reporters can request staff during service hours, and authorized staff can take over an ongoing AI conversation. Automatic AI replies pause during an open handoff; submission remains blocked until the handoff ends.
- Private staff guidance showing validated reporter quotes for the narrative, approximate time, general location, and requested help. It distinguishes available, unanswered, and missing information. Suggested questions enter the composer for editing and **manual sending**.
- NVIDIA-assisted guidance with a conservative fallback. Collected answers feed the reporter's editable draft and reach the summary after confirmation and submission. Ending assistance preserves the latest recognized answers, including while AI work is pending.
- Authorized report transcripts, administrator summaries at `/rekap`, and an administrator identity directory at `/admin/nik`. Transcript access and NIK access are audited.
- Server-generated Excel exports: `Rekap` excludes NIK; `Identitas` includes NIK for authorized administrators.
- Database-controlled service hours in **WITA (UTC+8)**: Monday–Thursday 08:00–14:00, Friday 08:00–11:00, Saturday 08:00–12:30. Outside these hours, the reporting flow uses AI mode.
- NVIDIA Nemotron replies about the reporting flow and selects one missing follow-up topic at a time. The server validates extracted quotes and permitted questions. Recognizable identity patterns are redacted before provider requests; this does not guarantee anonymization.
- WhatsApp outbox and worker supporting `outbox`, `meta`, and `twilio`. Notification content excludes names, narratives, NIK, contact details, and attachments.

## Local setup

Requirements:

- Node.js **22.17 or newer**, compatible with SvelteKit 3 and Vite 8.
- A running PostgreSQL instance.
- An application database owned by `maoelana`. Do not run the application as the PostgreSQL administrator.
- Python and Playwright Chromium only for browser tests.

Run this SQL as a PostgreSQL administrator for initial setup, replacing the example password:

```sql
CREATE ROLE maoelana LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE lapor_aman OWNER maoelana;
```

Copy `.env.example` to `.env` and install dependencies. In PowerShell:

```powershell
Copy-Item .env.example .env
npm ci
```

Configure the database connection, encryption keys, and demo passwords in `.env`. Generate two independent 32-byte Base64 keys by running this command twice; assign the results to `REPORT_DATA_KEY` and `NIK_DATA_KEY` respectively. Keep them private:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Then run:

```sh
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

Open the URL printed by Vite. Existing installations also need migrations: `004_staff_assistance.sql` adds encrypted staff guidance storage.

`npm run db:reset` deletes demo data and reseeds the database. It only accepts a database named `lapor_aman` and refuses to run when `NODE_ENV=production`.

### Local production build

```sh
npm run build
npm run start
```

`start` runs the Node adapter build and loads `.env`. `PUBLIC_BASE_URL` sets the canonical origin **at build time** through `kit.paths.origin`. Set it before building, use the same origin in the browser, and set runtime `PORT` to match when running locally. The legacy adapter `ORIGIN` setting is not used by this configuration. Referrers are restricted to the same origin.

For development-only testing of staff assistance outside service hours, open `/chat?mode=operator`. This override is disabled in production builds.

## Demo accounts

| Username | Seeded roles | Access |
| --- | --- | --- |
| `petugas` | `petugas`, `admin` | Staff workspace and administrator features |
| `bidan` | `bidan_pic`, `admin` | Midwife and administrator features |
| `admin` | `admin` | Full administrator access |

All three demo accounts include the administrator role to demonstrate supervisor workflows. They do **not** demonstrate separation of duties. Evaluate narrower roles with separately provisioned accounts.

Passwords come from `DEMO_STAFF_PETUGAS_PASSWORD`, `DEMO_STAFF_BIDAN_PASSWORD`, and `DEMO_STAFF_ADMIN_PASSWORD` in `.env` and are applied by the seed script. Passwords are not published in the repository or public interface. Change them before sharing an evaluation environment.

## Environment variables

See [.env.example](.env.example) for the full configuration template.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-only PostgreSQL connection using the application role |
| `DATABASE_SSL` | Set to `true` for managed PostgreSQL with certificate verification |
| `PUBLIC_BASE_URL` | Canonical origin, read during build; HTTPS enables Secure cookies |
| `REPORT_DATA_KEY` | Base64-encoded 32-byte AES-256-GCM key for report and supporting data |
| `NIK_DATA_KEY` | Separate Base64-encoded 32-byte AES-256-GCM key for NIK |
| `AI_ENABLED` | Enables NVIDIA requests; set `false` for an offline demo |
| `NVIDIA_API_KEY` | Server-only NVIDIA credential |
| `NVIDIA_MODEL` | Model identifier; default `nvidia/nemotron-3-ultra-550b-a55b` |
| `WHATSAPP_PROVIDER` | `outbox`, `meta`, or `twilio` |
| `WHATSAPP_RECIPIENT_NUMBER` / `PIC_WHATSAPP_NUMBER` | Notification destination |
| `DEMO_STAFF_*_PASSWORD` | Passwords for the three seeded accounts |

Never commit `.env`, include credentials in logs, or prefix secrets with `PUBLIC_`. Keep encryption keys stable: replacing them without migration makes existing records unreadable. Use independent credentials and keys for each environment.

## Development and releases

- `codex/development`: active development, UI changes, and evaluation preparation.
- `main`: stable integration branch. Changes require a pull request, successful `secret-scan` and `integration` checks, and one approving review. Protection applies to administrators, requires resolved review conversations and an up-to-date branch, and blocks force pushes and deletion.
- Create task branches from development when work needs isolation, then integrate and test before proposing a release to `main`.
- Keep `.env`, internal process documents, test downloads, and screenshots out of commits. Repository ignore rules cover these local artifacts.

The [Security workflow](.github/workflows/security.yml) runs on pushes and pull requests. It scans for secrets, checks Svelte/TypeScript, runs unit and PostgreSQL integration tests, builds the app, scans the client bundle, and audits dependencies. Browser tests run separately with Playwright.

## Vercel and Convex evaluation plan

**Planned, not implemented:** this branch still uses `@sveltejs/adapter-node` and PostgreSQL through `pg`. No Convex schema, functions, or hosted evaluation environment have been added yet.

The intended target is a Vercel-hosted application backed by a separate Convex demo project. Convex requires backend migration; it cannot replace the PostgreSQL connection string.

| Area | Current implementation | Required migration work |
| --- | --- | --- |
| Hosting | Node adapter server | Configure a compatible Vercel adapter; verify server routes, origin handling, cookies, CSP, timeouts, and exports |
| Persistence | SQL constraints, transactions, and locks | Define Convex schema, indexes, queries, and mutations; preserve ownership, atomic transitions, uniqueness, and idempotency |
| Authentication | Local credentials, sessions, CSRF, database roles | Choose and implement authentication/session handling; enforce reporter ownership and staff roles in backend operations |
| AI and encryption | Server-only provider requests and Node cryptography | Use an appropriate server runtime, protect keys, and validate quotes before persistence |
| Live assistance | Polling, database locks, encrypted cache, process-local request coalescing | Rebuild handoff concurrency and stale-result protection for distributed execution |
| Notifications | PostgreSQL outbox and Node worker | Replace scheduling and retry behavior; keep external delivery disabled for evaluation |
| Tests and fixtures | Local seed and temporary PostgreSQL schemas | Add isolated Convex fixtures and tests, including unauthorized access and concurrent operations |

Suggested rollout:

1. Keep this PostgreSQL implementation as the tested development baseline.
2. Implement the Convex migration on a task branch with an isolated project and synthetic seed data. Do not copy the local database or its secrets into the mock.
3. Configure Vercel after the backend works. Verify adapter compatibility with SvelteKit 3. Set a matching HTTPS `PUBLIC_BASE_URL` for each build and test generated preview origins explicitly.
4. Separate preview and stable evaluation deployments, data, credentials, and encryption keys. Keep Convex deploy keys server-only in the deployment environment.
5. Verify reporting, handoff, cancellation, draft editing, submission, decisions, identity access, and export before sharing the URL with evaluators.

An earlier Vercel demo could retain PostgreSQL using a managed database. It would still need adapter changes, connection-pool planning, migrations, and worker hosting. The current `pg` pool permits ten connections per process; serverless hosting needs an explicit connection budget.

Official references: [SvelteKit Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel), [Convex with Vercel](https://docs.convex.dev/production/hosting/vercel), [Convex deployment environments](https://docs.convex.dev/production/multiple-deployments).

## WhatsApp notifications

The default `WHATSAPP_PROVIDER=outbox` stores entries without sending messages. Run the worker with:

```sh
npm run worker:notify
```

Actual delivery requires Meta Cloud API or Twilio credentials and a destination number. Business-initiated Meta messages may require an approved template; keep its contents generic and free of report details. Outbox entries are not proof of delivery. Leave external delivery disabled for mock evaluation.

## Security and evaluation boundaries

- This is a demo, not an operational reporting service. MFA, organizational identity management, account recovery, and penetration testing are not implemented.
- NIK storage is a demo exception to the original product brief. Production requires review of privacy notices, lawful processing, consent, retention, deletion, and access policy.
- Encryption and authorization do not make this environment suitable for real victim data. Downloaded Excel files are outside application access controls.
- NIK is absent from the staff inbox list. Administrators can access full values through `/admin/nik` and explicit reveal controls in `/rekap`. Directory access records `nik.directory.viewed`.
- Report transcript access is limited to assigned staff or administrators and records `report.chat_transcript.viewed`.
- Staff takeover records `chat.handoff.staff_takeover`. Thread access, replies, closure, and assistance views are audited. Recognizable NIK, phone, and email patterns are redacted in conversations.
- AI can explain the reporting flow and request a permitted missing detail. It does not provide diagnoses, legal advice, service decisions, or requests for identity data. Reporter questions are not treated as field answers.
- Staff guidance validates quotes against reporter messages and preserves explicit unknown answers. The reporter still reviews and submits the draft.
- While a handoff is `waiting` or `active`, the server rejects automated AI turns and report submission. Reporter handoff requests are restricted to operator service mode and hours.
- Social services integration, medical examination arrangements, accompaniment, and referrals are not implemented.
- Use synthetic names, identity numbers, contacts, and narratives only, including on the hosted evaluation mock.

See [SECURITY.md](SECURITY.md) for vulnerability reporting information.

## Verification

```sh
npm run check
npm test
npm run test:integration
npm run test:e2e
npm run build
npm run db:check
npm run security:scan -- --history --staged --client
npm audit --audit-level=low
```

Integration tests use a temporary PostgreSQL schema and remove it afterward; they do not reset application data. Live provider tests are optional and run only with `TEST_LIVE_AI=true`.

For browser tests, install Python, Playwright, and Chromium:

```sh
python -m pip install playwright
python -m playwright install chromium
```

`test:e2e` starts an isolated server on port 5175 with temporary accounts and separate browser contexts. AI requests and external WhatsApp delivery are disabled. In PowerShell, test the production Node build with:

```powershell
$env:E2E_PRODUCTION = 'true'
npm run test:e2e
Remove-Item Env:E2E_PRODUCTION
npm run build
```

Production E2E builds with its own origin on port 5176. The final normal build restores your local configured origin.

Browser coverage includes access/CSRF, cookies and headers, chat retries, handoff, manual replies, suggested question editing, collected fields, preserved draft edits, submission, summaries, NIK, Excel, search/filtering, mobile menus, decisions, and copying the receipt code. Responsive scenarios include widths of 320, 390, 768, 1024, and 1440 pixels. Screenshots and downloads use synthetic data and are stored in the operating system's temporary directory.

Limits are enforced without silent truncation: 2,000 characters per message, 20,000 for the narrative, 160 for time, 200 for general location, and 300 for requested help.

## Repository layout

| Path | Contents |
| --- | --- |
| `db/001_initial.sql` | Base schema, constraints, and indexes |
| `db/002_chat_transcript.sql` | Message sources for staff-visible transcripts |
| `db/003_staff_handoff.sql` | Reporter–staff handoffs and one-open-handoff constraint |
| `db/004_staff_assistance.sql` | Encrypted per-session guidance cache |
| `scripts/` | Migration runner, guarded seed/reset, checks, test runner, notification worker |
| `src/lib/components/` | Shared interface components, including staff guidance |
| `src/lib/server/` | Database, encryption, sessions, authentication, reports, AI, exports, audit |
| `src/routes/api/` | Reporter and staff API endpoints |
| `src/routes/` | Pages, server loaders, and form actions |
| `tests/` | Integration and browser tests; unit tests also live beside source modules |
| `.github/workflows/` | Automated security, build, and test checks |

Internal product, design, QA, and audit documents are kept locally and excluded from the public repository.
