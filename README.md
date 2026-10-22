# PSC SAHABAT — LAPOR AMAN

A reporting portal for women and children affected by violence in the service area of **UPT Puskesmas Suranadi**. PSC SAHABAT provides a coordinated reporting, assistance, and referral program. Its motto translates to **“One report, one companion, one pathway to protection.”**

Reporters describe an incident, review an editable draft, choose whether staff may contact them, and confirm submission. Staff handle conversations, review assigned reports, and record decisions. Administrators can review summaries, reveal identity information, export records, and delete reports with confirmation.

**This deployment is for team evaluation with synthetic data only. It is not an operational victim-reporting or emergency service.** The application interface is in Indonesian. This README is written entirely in English; route names, account identifiers, and worksheet names retain their application values.

[Evaluation website](https://lapor-aman-evaluation.vercel.app/) · [Staff sign-in](https://lapor-aman-evaluation.vercel.app/masuk)

## Technology and hosting

| Component | Implementation |
| --- | --- |
| Application | SvelteKit 3, Svelte 5, TypeScript |
| Database and transactions | Native Convex functions and database |
| Website hosting | Vercel, Node.js 24 |
| Evaluation project | `lapor-aman-evaluation` on Vercel and Convex |
| AI provider | Server-side NVIDIA requests with validation and fallback questions |
| Encryption | AES-256-GCM before storage; a separate key for national identification numbers |
| Notifications | In-app staff alerts and a simulated outbox; no WhatsApp delivery |
| Website releases | Automatic Vercel deployment from `main` |
| Backend releases | Separate Convex deployment before merging changes that require new backend functions |

The hosted website and database work independently of the developer's computer. Vercel's Production label identifies the stable evaluation URL; it does not authorize use with real victim information. The former PostgreSQL database was not imported.

## User workflows

| Route | Purpose |
| --- | --- |
| `/` | Program identity, motto, reporting overview, institutional affiliation, service area, and first-visit information |
| `/edukasi` | Education about violence against women and children, six reporting categories, and official legal references |
| `/panduan` | Reporting instructions, privacy information, and immediate-help guidance |
| `/chat` | Incident narrative, optional victim information, editable draft, contact permission, submission, and reference code |
| `/masuk` | Staff authentication |
| `/petugas` | Assigned report inbox, search, filters, review notes, decisions, and integrated identity access |
| `/petugas/percakapan` | Staff takeover, direct replies, and private assistance |
| `/rekap` | Administrator summaries, report details, identity access, and Excel export |
| `/admin/nik` | Legacy route redirecting to `/rekap` |

### Reporting

The phone-first flow starts with the reporter’s relationship to the victim, then goes directly to the incident narrative. Optional identity fields appear in a collapsed section during draft review. Victim details are encouraged when known and safe to provide. Available fields include name, date of birth, parent or guardian, address, gender, education, occupation, marital status, pregnancy, and national identification number (NIK). Reporters can select suspected violence categories and record whether another agency has already been involved. These selections support initial reporting and do not establish a legal finding.

The six categories follow the supplied KTPA/TPPO training material: physical violence, psychological violence, sexual violence, neglect, human trafficking, and exploitation. The education page links to official references for domestic violence, trafficking, child protection, and sexual violence legislation. No unverified service contacts, village lists, or real victim records are supplied.

Chat focuses on chronology, approximate incident time, general location, and requested assistance. Reporters can skip unknown details, add information, edit the draft, and decide whether to submit. Form identity fields are encrypted and excluded from AI input. Narrative redaction is best effort and does not guarantee anonymity.

Contact permission is requested during final review. A reporter who agrees to contact must provide their own safe phone number and may add timing or contact restrictions. This also applies when reporting on another person's behalf. A report can be submitted without contact permission.

### Staff and administrator actions

Non-administrator staff can access assigned reports only. Administrators can access all reports. On phones, staff navigation stays at the bottom and only one inbox pane is shown at a time. The reply box precedes an on-demand assistance disclosure. Private assistance shows one suggested question at a time, with completeness details collapsed by default. A suggestion enters the reply box for editing and must be sent manually. Automatic AI replies pause during staff takeover.

Collected facts must be grounded in actual reporter messages. Unknown answers remain distinguishable from missing information. Reporter review remains necessary before a draft becomes a submitted report.

NIK and permitted contact details can be revealed through audited actions within a report. The Excel export has a summary worksheet named `Rekap` without NIK and a restricted worksheet named `Identitas` containing identity information and additional fields. Downloaded files remain outside application access controls.

Administrators can permanently delete a report by entering its exact reference and a reason. One transaction removes the report, identity, reporter session, drafts, messages, handoffs, assistance, reviews, and outbox records. An audit entry with an encrypted deletion reason remains. Previously downloaded files are unaffected.

In-app notifications poll every 12 seconds while the staff page is visible. They use submission metadata and respect assignment permissions. Read status is stored locally per browser and account. External message delivery is not implemented.

Staff service hours use **WITA (UTC+8)**: Monday–Thursday 08:00–14:00, Friday 08:00–11:00, and Saturday 08:00–12:30. Reports and AI assistance remain available outside these hours. Staff can take over an existing conversation independently of the hours for new assistance requests.

## Local development

Requirements: **Node.js 24**, npm, and a local or cloud Convex development deployment. Python, Playwright, and Chromium are required only for browser tests.

```powershell
npm ci
Copy-Item .env.example .env
npm run convex:dev
```

Keep the Convex development process running in a separate terminal when using a local backend. The CLI-generated `.env.local` selects the Convex deployment for CLI commands. Application commands load `.env`; set its `CONVEX_URL` to the intended backend.

Configure the following private variables using [.env.example](.env.example):

| Variable | Purpose |
| --- | --- |
| `CONVEX_URL` | Server-only local or HTTPS cloud backend URL |
| `APPLICATION_SERVER_KEY` | Random server credential shared by the application and Convex |
| `REPORT_DATA_KEY` | Independent 32-byte Base64 encryption key for report content |
| `NIK_DATA_KEY` | Separate 32-byte Base64 encryption key for NIK |
| `PUBLIC_BASE_URL` | Canonical application origin, read during build |
| `AI_ENABLED` | `true` to use configured NVIDIA requests; `false` for fallback-only development |
| `NVIDIA_API_KEY` | Server-only provider credential |
| `NVIDIA_MODEL` | Default: `nvidia/nemotron-3-ultra-550b-a55b` |
| `DEMO_STAFF_PETUGAS_PASSWORD` | Unique demo password of at least 14 characters |
| `DEMO_STAFF_BIDAN_PASSWORD` | Unique demo password of at least 14 characters |
| `DEMO_STAFF_ADMIN_PASSWORD` | Unique demo password of at least 14 characters |
| `WHATSAPP_PROVIDER` | Keep `outbox` for evaluation |

Generate the application server key privately:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Generate each encryption key separately with `base64` instead of `base64url`. Set the matching application server key on the selected Convex deployment using an interactive prompt:

```sh
npx convex env set APPLICATION_SERVER_KEY
```

Then seed accounts, check connectivity, and start the application:

```sh
npm run db:seed
npm run db:check
npm run dev
```

The seed updates demo accounts and fills missing schedules while preserving existing reports. Keep encryption keys stable: replacing them without migration makes existing encrypted content unreadable.

### Evaluation accounts

| Username | Seeded role identifiers |
| --- | --- |
| `petugas` | `petugas`, `admin` |
| `bidan` | `bidan_pic`, `admin` |
| `admin` | `admin` |

All seeded accounts include administrator access to demonstrate supervisor workflows. Use narrower accounts when evaluating separation of duties. Passwords are provided privately by the project owner; there is no public default password. Account provisioning, assignments, and password recovery currently require technical administration.

### Local production build

```sh
npm run build
npm run start
```

Builds use the Node adapter unless `VERCEL=1` or `DEPLOY_TARGET=vercel` is set. Configure `PUBLIC_BASE_URL` before building and a matching runtime `PORT`. The legacy `ORIGIN` variable is not used. The `/chat?mode=operator` override is available only in development.

## Branches and automatic deployment

- `main`: stable release branch and Vercel Production branch.
- `development`: shared integration branch.
- `feature/vercel-convex`: migration and evaluation feature work.

GitHub is connected to the Vercel project, and Vercel deployment reporting to GitHub is enabled. The repository’s Deployments section records the verified production release and its website URL. [vercel.json](vercel.json) enables automatic Git deployments for `main` and disables them for other branches. A push to a development branch runs GitHub checks but does not publish the stable website. After an approved pull request is merged into `main`, Vercel builds that commit and updates the evaluation URL. A failed build does not replace the last successful deployment.

The `main` protection policy requires the `secret-scan` and `integration` checks, one approving review from another person, resolved review conversations, and an up-to-date branch. It applies to administrators and blocks force pushes and branch deletion. Repository visibility is public so this protection can be enforced on GitHub Free. Do not commit credentials or evaluation records to the repository.

Convex releases are separate from Vercel Git deployments. When a change modifies native backend functions or schemas, deploy a compatible Convex backend before merging the website release:

```sh
npm run convex:deploy
```

Verify the deployment target before running that command. The evaluation backend must use its matching server credential and encryption keys. Production-only credentials must not be copied into preview environments. Preview deployments remain disabled until an independent backend, credentials, and keys are configured. The project’s ignored-build command also limits builds to `main`: `test "$VERCEL_GIT_COMMIT_REF" != "main"` (exit 0 skips a non-main build). The `**` branch pattern in `vercel.json` covers feature branch names containing slashes.

For a new environment:

1. Sign in with `npx convex login` and select or create a separate evaluation project.
2. Deploy the Convex functions and set `APPLICATION_SERVER_KEY` on the target deployment.
3. Create or link the Vercel project and configure its server-only runtime variables.
4. Seed synthetic accounts using the intended backend and matching private configuration.
5. Connect GitHub, choose `main` as the Production branch, and apply the branch policy.
6. Verify reporting, staff takeover, decisions, identity access, exports, and deletion before inviting evaluators.

Vercel uses Node.js 24 and a 60-second function duration. On Windows, local Vercel artifact generation can require directory symlink privileges; Linux CI and the Vercel cloud build verify that target. Do not change operating-system protections to generate local artifacts.

References: [Vercel Git deployment](https://vercel.com/docs/git), [Vercel branch configuration](https://vercel.com/docs/project-configuration/git-configuration), [SvelteKit Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel), [Convex deployment](https://docs.convex.dev/production/hosting/vercel), [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches).

## Verification

```sh
npm run check
npm run check:convex
npm test
npm run test:integration
npm run build
npm run security:scan -- --history --staged --client
npm audit --audit-level=low
```

The interface revision was verified on **22 October 2026** with 76 unit tests, 27 native Convex integration tests, type checks, Node and Vercel builds, secret scans, and a dependency audit reporting zero known vulnerabilities. Development and production browser flows cover widths from 320 to 1440 pixels, touch emulation, landscape layouts, and reduced viewport height while the composer remains focused. These are browser-emulation checks; physical Android and iOS device testing remains necessary before operational rollout. Hosted verification covered staff takeover, manual replies, confirmed submission, optional fields, identity access, export, notifications, and deletion of its own synthetic test report. A separate live NVIDIA check verified that the AI explains optional victim information correctly.

These checks are a dated release snapshot, not a guarantee of permanent security. Rerun the appropriate checks after changes.

### Browser tests

```sh
python -m pip install playwright
python -m playwright install chromium
npm run test:e2e
```

The runner creates an isolated local Convex deployment, random credentials and encryption keys, and temporary accounts. It does not reset the application backend. Default ports are 3212/3213 for Convex and 5175 for the application. Override `E2E_CONVEX_PORT` or `E2E_PORT` when needed.

To verify a production Node build in PowerShell:

```powershell
$env:E2E_PRODUCTION = 'true'
npm run test:e2e
Remove-Item Env:E2E_PRODUCTION
npm run build
```

Production browser tests use port 5176 and their own origin; the final build restores the normal configuration. Test screenshots and exports contain synthetic data only.

`tests/e2e/deployed_smoke.py` verifies an existing HTTPS evaluation deployment. It requires `EVALUATION_BASE_URL`, `DEMO_STAFF_ADMIN_PASSWORD`, and explicit `ALLOW_EVALUATION_WRITE=true`. It creates one marked synthetic report, exercises the staff workflow, deletes its own report with confirmation, and logs out. Run it only against the intended evaluation environment.

## Security and operational limits

- Sensitive values are encrypted before storage. Decryption and AI provider requests run in server code. NIK has a separate encryption key.
- Stored sessions, roles, assignments, CSRF checks, origin checks, shared rate limits, and audit events control access. Open handoffs block automatic AI turns and report submission.
- Draft versions, idempotent submission, and message revision checks prevent stale work from overwriting newer state. Quote validation reduces unsupported extraction; it does not guarantee model correctness.
- No MFA, organizational identity management, self-service recovery, automated retention, independent penetration testing, or operational security assessment is implemented.
- There is no automatic external referral, social-services integration, medical examination arrangement, or external message delivery.
- Queries and notifications are designed for limited evaluation datasets. Larger deployments require pagination, retention planning, and capacity assessment.
- Use independent backend deployments, data, passwords, and keys for each environment. Never use real victim data for this evaluation.

See [SECURITY.md](SECURITY.md) for disclosure and operational boundaries.

## Repository layout

| Path | Contents |
| --- | --- |
| `convex/` | Database schema, transactions, sessions, staff, chat, handoffs, audit, and demo seed functions |
| `convex/_generated/` | Committed CLI-generated API and schema types |
| `src/lib/server/` | Backend client, encryption, authorization, AI, reporting, and exports |
| `src/routes/` | Public and staff pages, form actions, and same-origin API endpoints |
| `static/brand/` | PSC SAHABAT vector and PNG assets, Puskesmas emblem, and provenance |
| `scripts/` | Seed, connectivity check, secret scanner, and isolated browser runner |
| `tests/integration/` | Native Convex lifecycle and authorization tests |
| `.github/workflows/` | Security, type, build, and integration checks |
| `vercel.json` | Branch-based automatic deployment policy |

Internal working documents, credentials, local platform metadata, screenshots, and generated exports are excluded from publication. `.env.example` contains placeholders only. The earlier PostgreSQL implementation remains in Git history; its local database was neither copied nor modified.

Reporter, staff, and technical Word manuals are maintained separately. Their existing screenshots predate the PSC SAHABAT interface revision and need refreshing before redistribution. Credentials and private deployment configuration are not included in those manuals.
