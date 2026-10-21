# LAPOR AMAN

Portal pengaduan GKM PSC SAHABAT, UPT Puskesmas Suranadi. Versi ini memakai backend SvelteKit dan PostgreSQL lokal untuk demo terbatas. Gunakan data latihan; jangan gunakan data korban nyata.

## Yang sudah aktif

- Portal publik, panduan, dan alur pengaduan tiga tahap di `/chat`.
- Percakapan multi-turn: cerita bebas, AI menanggapi pertanyaan alur dan memilih satu topik pelengkap, lewati, tambah cerita, dan ringkasan yang dapat diperiksa sebelum kirim. Percakapan tidak ditutup otomatis; pelapor menekan Selesai untuk membuka draf.
- Penyimpanan sesi, draf, laporan, keputusan, audit, riwayat percakapan, dan outbox notifikasi di PostgreSQL.
- Login staff lokal dengan sesi server, cookie HttpOnly, CSRF, pembatasan percobaan, peran, dan audit.
- Meja petugas `/petugas` untuk laporan dalam penugasan akun. Admin dapat meninjau seluruh laporan.
- Bantuan petugas langsung `/petugas/percakapan`: pelapor dapat meminta petugas saat jam layanan, atau petugas/bidan/admin dapat mengambil alih percakapan AI yang sedang berjalan. AI dijeda selama handoff aktif, dan tombol Selesai pelapor dikunci sampai percakapan petugas ditutup.
- Riwayat percakapan di meja petugas, dengan otorisasi petugas yang ditugaskan/admin dan audit setiap pembukaan.
- Rekap `/rekap` untuk akun dengan peran admin, termasuk pembukaan NIK yang tercatat di audit.
- Halaman `/admin/nik` khusus akun admin menampilkan NIK lengkap tanpa sensor dengan audit setiap pembukaan halaman.
- Export `.xlsx` dibuat di server; sheet `Rekap` tidak memuat NIK dan sheet `Identitas` memuat NIK untuk akun berwenang.
- Mode layanan mengikuti jadwal WITA di database: Senin–Kamis 08.00–14.00, Jumat 08.00–11.00, Sabtu 08.00–12.30. Di luar jadwal, alur memakai mode AI.
- Integrasi NVIDIA Nemotron untuk menanggapi pesan pelapor, termasuk pertanyaan proyek, dan memilih satu topik pelengkap dari waktu, lokasi umum, atau kebutuhan yang belum terisi. Server mengirim riwayat percakapan terbatas; AI memilih topik dan kalimat, lalu server memvalidasi cakupan field serta batas aman. Pertanyaan atau kekhawatiran saat alur berjalan tidak dipakai sebagai jawaban field. Pola NIK, nomor, email, dan nama yang jelas diredaksi sebelum cerita dikirim; ini bukan jaminan anonimisasi. Pertanyaan cadangan dipakai bila penyedia tidak tersedia atau keluar dari batas.
- Outbox WhatsApp beserta worker `outbox`, `meta`, dan `twilio`. Pesan tidak memuat nama, cerita, NIK, kontak, atau lampiran.

## Prasyarat

- Node.js 22 atau lebih baru (skrip memakai `--env-file`).
- PostgreSQL lokal yang berjalan.
- Peran database `maoelana` sebagai pemilik dan pengguna aplikasi. Jangan menghubungkan aplikasi sebagai `postgres`.

## Menyiapkan database

Jalankan sebagai administrator PostgreSQL hanya untuk bootstrap:

```sql
CREATE ROLE maoelana LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE lapor_aman OWNER maoelana;
```

Lalu siapkan environment:

```sh
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
```

`npm run db:reset` menghapus data latihan dan menjalankan seed ulang. Perintah ini hanya menerima database bernama `lapor_aman` dan menolak berjalan saat `NODE_ENV=production`.

Periksa koneksi, migrasi, enkripsi, peran, dan data seed:

```sh
npm run db:check
```

## Menjalankan aplikasi

```sh
npm run dev
```

Untuk menguji bantuan petugas di luar jam layanan pada server pengembangan, buka `/chat?mode=operator`. Override ini tidak aktif pada build produksi; pada jam layanan normal, tombol bantuan petugas muncul otomatis.

Untuk build produksi lokal:

```sh
npm run build
npm run start
```

`npm run start` menjalankan build adapter-node dan memuat `.env`. Untuk demo harian, gunakan `npm run dev`: akses HTTP langsung ke build adapter-node tidak menjamin form action karena adapter menganggap permintaan sebagai HTTPS kecuali berada di belakang reverse proxy dengan header protokol yang benar. Smoke test `npm start` pada proyek ini mencakup health dan halaman publik, bukan login langsung tanpa proxy.

## Akun staff lokal

- `petugas`: peran `petugas` dan `admin`; dapat membuka meja petugas, percakapan langsung, rekap, dan halaman Data NIK.
- `bidan`: peran `bidan_pic` dan `admin`; dapat membuka rekap, halaman Data NIK, dan percakapan langsung.
- `admin`: peran `admin`; akses penuh ke meja petugas, percakapan langsung, rekap, dan halaman Data NIK.

Ketiga akun demo memakai akses admin agar dapat mendemontrasikan alur atasan. Pemisahan tugas petugas/bidan/admin tidak diterapkan pada ketiga akun demo ini.

Kata sandi tidak ditulis di repositori atau halaman publik. Nilainya diatur melalui `DEMO_STAFF_PETUGAS_PASSWORD`, `DEMO_STAFF_BIDAN_PASSWORD`, dan `DEMO_STAFF_ADMIN_PASSWORD` di `.env`, lalu dipakai oleh seed. Ganti sebelum presentasi.

## Variabel penting

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Koneksi aplikasi sebagai `maoelana` |
| `PUBLIC_BASE_URL` | URL publik; cookie memakai `Secure` bila diawali `https://` |
| `REPORT_DATA_KEY` | Kunci AES-256-GCM untuk isi laporan dan data pendukung |
| `NIK_DATA_KEY` | Kunci AES-256-GCM terpisah khusus NIK |
| `AI_ENABLED` | Mengaktifkan pemanggilan NVIDIA |
| `NVIDIA_API_KEY` | Kredensial NVIDIA |
| `NVIDIA_MODEL` | Model, default `nvidia/nemotron-3-ultra-550b-a55b` |
| `WHATSAPP_PROVIDER` | `outbox`, `meta`, atau `twilio` |
| `WHATSAPP_RECIPIENT_NUMBER` / `PIC_WHATSAPP_NUMBER` | Nomor tujuan notifikasi |

Jangan commit `.env` atau mencetak nilainya di log. Nilai rahasia harus tetap server-only; jangan memberi awalan `PUBLIC_` pada API key, token, atau kunci enkripsi. Sebelum push, jalankan `npm run security:scan`.

## Deploy

- Vercel: build saat ini memakai `@sveltejs/adapter-node`, bukan target Vercel. Untuk Vercel, ganti adapter ke `@sveltejs/adapter-vercel` dan isi environment variables di dashboard Vercel. Jangan mengunggah `.env` ke repositori atau ke dashboard sebagai file.
- Convex: Convex bukan pengganti langsung untuk SvelteKit + PostgreSQL yang dipakai saat ini. Aplikasi memakai `pg` dan route server SvelteKit; memindahkan backend ke Convex memerlukan rancangan fungsi/skema baru dan migrasi data, bukan sekadar deploy.
- PostgreSQL terkelola: gunakan `DATABASE_SSL=true`, koneksi server-only, dan kredensial terpisah dari akun admin.
- `REPORT_DATA_KEY` dan `NIK_DATA_KEY` harus tetap stabil. Menggantinya tanpa migrasi membuat data lama tidak dapat dibaca.
- Untuk hosting HTTPS, set `PUBLIC_BASE_URL=https://...`; untuk adapter-node di belakang proxy, set `ORIGIN` ke origin publik yang sama.
- Aktifkan private vulnerability reporting dan secret scanning di GitHub. Workflow `.github/workflows/security.yml` menjalankan pemindaian rahasia dan `npm audit` pada setiap push/PR.

## Notifikasi WhatsApp

Default `WHATSAPP_PROVIDER=outbox` hanya menyimpan baris outbox; tidak ada pesan yang dikirim. Worker dapat dijalankan dengan:

```sh
npm run worker:notify
```

Untuk pengiriman nyata, isi kredensial Meta Cloud API atau Twilio dan nomor tujuan. Meta umumnya memerlukan template pesan yang disetujui untuk pesan yang dimulai bisnis. Isi template harus tetap generik dan tidak memuat data laporan. Tanpa kredensial dan nomor, fitur ini belum dapat diklaim sebagai pengiriman WhatsApp produksi.

## Batas keamanan dan kepatuhan

- Ini lingkungan demo lokal, bukan layanan produksi. Belum ada MFA, manajemen identitas organisasi, pemulihan akun, atau pengujian penetrasi.
- NIK adalah pengecualian demo terhadap PRD v0.1 FR-03. Sebelum produksi, PRD, pemberitahuan privasi, dasar pemrosesan, retensi, penghapusan, dan persetujuan akses wajib direvisi.
- Enkripsi dan kontrol akses server sudah diterapkan untuk demo, tetapi tidak menjadikan NIK aman untuk data nyata. File `.xlsx` yang sudah diunduh berada di luar kendali aplikasi.
- NIK tidak ditampilkan di daftar meja petugas. NIK lengkap dapat dilihat di `/admin/nik` dan melalui tombol tampilkan NIK di `/rekap` untuk akun dengan peran admin. Pembukaan halaman NIK dicatat sebagai `nik.directory.viewed`.
- Riwayat percakapan hanya dapat dibuka oleh petugas yang ditugaskan atau admin. Setiap pembukaan dicatat sebagai `report.chat_transcript.viewed`.
- Percakapan langsung dapat dibuka akun dengan peran admin. Percakapan yang belum memiliki handoff tampil di antrean aktif dan dapat diambil alih; pengambilalihan dicatat sebagai `chat.handoff.staff_takeover`. Setiap pembukaan thread, balasan, dan penutupan dicatat dalam audit; NIK, nomor, dan email disamarkan di percakapan.
- AI boleh menanggapi pertanyaan pelapor tentang alur proyek dan menanyakan satu topik pelengkap tentang waktu, lokasi umum, atau kebutuhan yang belum terisi. AI tidak memberi nasihat, diagnosis, bantuan hukum, keputusan, atau meminta identitas. Tombol Selesai tetap menjadi keputusan pelapor untuk membuka draf.
- Selama handoff `waiting` atau `active`, server menolak giliran AI dan pengiriman laporan. Handoff hanya dapat diminta pada mode/jam layanan operator.
- Integrasi Dinas Sosial, visum, pendampingan, dan rujukan tidak ada dan tidak diklaim.
- Jangan gunakan data korban nyata, nomor nyata, atau NIK asli pada lingkungan ini.

## Pemeriksaan

```sh
npm run check
npm test
npm run build
npm run db:check
npm run security:scan
npm audit --audit-level=high
```

Dokumen internal (PRD, product, QA, desain, dan audit) tidak disertakan di repo publik.

## Struktur backend

- `db/001_initial.sql`: skema, constraint, dan indeks.
- `db/002_chat_transcript.sql`: sumber pesan untuk riwayat percakapan petugas.
- `db/003_staff_handoff.sql`: handoff pelapor-petugas, pesan staff, dan satu handoff terbuka per sesi.
- `scripts/migrate.mjs`: runner migrasi dengan `schema_migrations`.
- `scripts/seed-demo.mjs`: seed idempoten dan reset demo ter guarding.
- `src/lib/server/`: akses database, enkripsi, sesi, autentikasi staff, laporan, AI, export, dan audit.
- `src/routes/api/`: endpoint pelapor dan staff.
- `src/routes/*/+page.server.ts`: pemuatan data dan form action.
