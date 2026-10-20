# QA

Tanggal pemeriksaan terakhir: 21 Oktober 2026.

Lingkup: lingkungan lokal terintegrasi SvelteKit + PostgreSQL. Pemeriksaan mencakup build, tipe, unit test, integritas database, alur API pelapor, otorisasi staff, audit NIK, export server, smoke test build produksi, dan pengujian browser otomatis untuk alur percakapan terbuka.

## Hasil otomatis

- `npm run check`: lulus, 0 error dan 0 warning.
- `npm test`: 25 test lulus untuk batas jadwal 14.00/11.00/12.30 WITA, hari tanpa jadwal, pengecualian tutup/jam khusus, redaksi NIK/nomor/email/nama sebelum cerita dikirim ke AI, masking NIK/nomor/email pada teks petugas, pemilihan field waktu/lokasi/kebutuhan, fallback alur lengkap, keamanan tanggapan dan pertanyaan opsional, serta penolakan pertanyaan yang tidak cocok dengan field atau meminta identitas/memberi nasihat.
- `npm run build`: lulus dengan `@sveltejs/adapter-node`.
- `npm run start`: build produksi melayani `/api/health` dan `/chat` dengan status 200.
- `npm run db:check`: 15 pemeriksaan lulus, termasuk peran `maoelana`, kepemilikan `lapor_aman`, migrasi, jumlah staff/laporan, riwayat percakapan dengan sumber, dekripsi sample, dan tidak adanya kolom cerita/NIK/nama/kontak plaintext.
- `npm audit --audit-level=high`: 0 kerentanan.

## Integrasi yang diuji melalui HTTP

- `/api/health` melaporkan database terhubung, AI terkonfigurasi, dan provider notifikasi `outbox`.
- Sesi pelapor dibuat server; mode saat pengujian di luar jam layanan adalah `ai`. Draf disimpan, laporan dikirim, dan kode referensi berasal dari server.
- `/api/chat/turn` dengan sesi mode `ai` mengembalikan tanggapan dan satu pertanyaan alur dari `nvidia/nemotron-3-ultra-550b-a55b` untuk field yang belum terisi. AI memilih topik berikutnya dari daftar server, menjawab pertanyaan proyek tanpa memberi nasihat pribadi, dan mengembalikan `flowComplete: true` dengan pesan penutup saat alur lengkap. Riwayat percakapan tersimpan dengan sumber `user`, `ai`, atau `fallback`.
- Pengiriman ulang dengan idempotency key yang sama mengembalikan kode referensi yang sama. Draf yang sudah dikonfirmasi juga tidak membuat laporan kedua.
- Draf tanpa token CSRF ditolak 403.
- `/petugas` tanpa sesi dialihkan ke `/masuk?next=/petugas`; API staff tanpa sesi mengembalikan 401; `/rekap` tanpa sesi menampilkan gerbang, bukan data.
- Login `petugas` berhasil. Respons daftar laporan tidak memuat field NIK. Catatan pemeriksaan mengubah status menjadi `under_review`; keputusan tercatat; keputusan kedua ditolak 409. NIK dari akun petugas ditolak 403.
- `GET /api/staff/reports/LA-2026-001/chat` dengan sesi `petugas` mengembalikan pesan terdekripsi dan menulis audit `report.chat_transcript.viewed` dengan jumlah pesan. Permintaan yang sama dengan cookie pelapor ditolak 401.
- Login `bidan` berhasil. Rekap hanya memuat `nikLast4`, bukan NIK penuh; HTML rekap menampilkan mask dan tidak memuat NIK penuh. Tombol/API NIK mengembalikan NIK dan menulis audit `nik.view`. Export mengembalikan `.xlsx` setelah reset data latihan.
- File export divalidasi dengan `openpyxl`: sheet `Rekap` dan `Identitas` ada; sheet `Rekap` tidak memuat NIK; sheet `Identitas` memuat NIK.
- Logout via form tanpa token CSRF ditolak 403; dengan token berhasil 303 dan sesi lama menjadi 401.
- Worker notifikasi mode `outbox` melaporkan 3 notifikasi tertunda setelah seed, tanpa mengirim WhatsApp.
- `db:reset` dengan `NODE_ENV=production` ditolak sebelum menghapus data. Reset normal menyisakan 2 akun staff, 6 jadwal, dan 3 laporan latihan; `db:check` lulus setelah reset.
- Audit selama pengujian mencatat `seed.applied`, login/sesi staff, `nik.view`, `recap.export`, dan `report.chat_transcript.viewed`. Reset data akhir menghapus sesi dan audit uji, lalu menyiapkan kembali 3 laporan latihan.

## Pemeriksaan browser otomatis

Pada 21 Oktober 2026, Playwright menjalankan alur cerita, pemilihan field waktu/lokasi/kebutuhan, tombol Lewati, tombol Tambah cerita, pertanyaan proyek saat alur berjalan dan setelah alur lengkap, serta tombol Selesai. Pertanyaan proyek tidak mengisi field jawaban. Tidak ada auto-ready box; percakapan tetap terbuka sampai pelapor menekan `Selesai dan periksa draf`. Review menampilkan cerita yang ditambah dan field yang dilewati sebagai `Belum diketahui`. Tidak ada overflow horizontal pada viewport 390 px.

## Hasil yang belum memuaskan

- NVIDIA Nemotron Ultra: model `nvidia/nemotron-3-ultra-550b-a55b` menjawab kasus live dengan `source: nvidia`, termasuk memilih topik waktu/lokasi/kebutuhan, menjawab pertanyaan proyek, menolak permintaan opini, dan memberi pesan penutup yang menyebut tombol Selesai. Model ini dipilih setelah uji berulang karena model NVIDIA lain lebih sering gagal atau lambat. Satu timeout masih mungkin terjadi; endpoint aplikasi memakai pesan cadangan yang aman bila penyedia tidak merespons dalam 15 detik, dan fallback tersebut diberi label `Panduan terstruktur` di UI.
- Sapaan pembuka AI kadang masih generik, misalnya diawali "Terima kasih", meski prompt meminta langsung ke inti. Ini tidak mengubah alur atau batas aman, tetapi masih bisa dipoles.
- WhatsApp: belum ada pengiriman nyata karena provider, kredensial, nomor tujuan, dan template belum tersedia. Semua baris outbox berisi payload generik dan tidak memuat data laporan.
- Halaman belum diuji ulang dengan browser otomatis untuk semua peran staff, status error jaringan, atau pembaca layar. Pemeriksaan browser terbaru mencakup alur pelapor utama, bukan seluruh permukaan aplikasi.

## Pemeriksaan visual sebelumnya

Pemeriksaan desain sebelum wiring backend mencatat tidak ada overflow horizontal pada `/`, `/panduan`, `/chat`, `/petugas`, dan `/rekap` di viewport 390, 1280, dan 1440; urutan Tab, fokus programatis, serta tautan bantuan juga diperiksa. Temuan kecil pada hero dan halaman panduan adalah pengecualian yang disengaja. Pemeriksaan ini tidak menggantikan audit aksesibilitas manual.

## Batas yang belum diverifikasi

- Ini bukan sertifikasi WCAG 2.2 AA. Pembaca layar nyata, perangkat fisik, zoom 200–400%, dan pengujian pengguna dengan disabilitas belum dilakukan.
- Microsoft Excel atau LibreOffice belum dipakai untuk membuka file export. Validasi memakai `openpyxl`.
- Belum ada MFA, manajemen identitas organisasi, pemulihan akun, rotasi kunci, atau pengujian penetrasi.
- Belum ada pengujian beban, pemulihan bencana, retensi, penghapusan terverifikasi, atau audit independen.
- URL halaman, file `.xlsx` yang sudah diunduh, dan data yang sudah dibuka berada di luar kendali aplikasi.
- Validasi NIK hanya memeriksa 16 digit; tidak ada checksum, Dukcapil, atau pencocokan nama.
- NIK sebagai data bawaan belum disetujui pada PRD v0.1 FR-03. Demo ini adalah pengecualian; revisi PRD dan persetujuan privasi wajib diselesaikan sebelum produksi.
- Integrasi visum, Dinas Sosial, pendampingan, dan rujukan tidak ada dan tidak diklaim.
- Hosting produksi belum dipilih; adapter-node hanya target build lokal saat ini.
