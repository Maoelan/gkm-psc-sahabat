# Security

## Prinsip

- Jangan pernah menggunakan data korban nyata, NIK asli, nomor telepon asli, atau isi laporan nyata di repositori ini.
- Jangan commit `.env`, kunci enkripsi, API key, token WhatsApp, kata sandi, dump database, atau file export.
- Nilai rahasia hanya boleh berada di environment lokal atau secret store platform deploy.
- `.env.example` hanya berisi placeholder.

## Sebelum push

```sh
npm run build
npm run security:scan -- --history --staged --client
npm audit --audit-level=low
git status --short
git diff --cached --stat
```

Periksa bahwa `.env`, `node_modules`, `build`, `.svelte-kit`, screenshot, dan artifact agen tidak ikut masuk.

## Kontrol yang diperiksa

- Endpoint NIK dan ekspor hanya untuk peran admin, termasuk pemeriksaan di layanan server. Ketiga akun lokal tetap memiliki peran admin sesuai kebutuhan.
- Semua permintaan perubahan diperiksa origin dan Sec-Fetch-Site; API bersesi juga memerlukan token CSRF. Referrer-Policy same-origin menjaga Origin form tanpa mengirim referrer ke situs eksternal.
- Body permintaan dibatasi 128 KiB berdasarkan byte aktual, termasuk tanpa Content-Length, dengan batas waktu baca 10 detik.
- Permintaan perubahan dibatasi per alamat klien yang di-hash; kunci limiter kedaluwarsa dibersihkan dan jumlah kunci dibatasi. Penguncian login memakai kenaikan penghitung atomik.
- Cookie HttpOnly/SameSite Strict; HTTPS wajib di luar loopback dan memakai Secure. HSTS dikirim pada HTTPS. CSP, no-store, anti-frame, no-sniff, dan Permissions-Policy tetap aktif.
- Respons error internal tidak memuat exception atau data permintaan. Health produksi hanya menampilkan status umum.
- Scanner memeriksa working tree, index Git, riwayat blob, dan bundle browser. Temuan hanya mencetak lokasi/jenis, bukan nilai rahasia. GitHub Actions memakai SHA tetap serta menjalankan tipe, tes, build, audit semua tingkat, dan integrasi PostgreSQL terpisah.

## Jika rahasia terlanjur terekspos

1. Cabut atau rotasi kredensial tersebut segera.
2. Hapus dari commit terbaru saja tidak cukup; bersihkan riwayat Git jika sudah ter-push.
3. Periksa log akses penyedia untuk penggunaan yang tidak sah.
4. Ganti kunci enkripsi hanya dengan rencana migrasi data; mengganti `REPORT_DATA_KEY` atau `NIK_DATA_KEY` membuat data lama tidak dapat dibaca.

## Pelaporan

Gunakan fitur private vulnerability reporting di GitHub jika tersedia. Jangan membuka issue publik yang memuat rahasia, data pribadi, atau detail eksploitasi.

## Batas

Repositori ini adalah demo lokal, bukan layanan produksi. MFA, HTTPS produksi, backup, retensi, DPA/persetujuan privasi, pengujian penetrasi, dan audit keamanan independen belum tersedia. Audit aktivitas aplikasi sudah ada, tetapi tidak menggantikan audit keamanan. Pembatasan permintaan masih untuk satu proses dan bukan perlindungan DDoS terdistribusi. Pemeriksaan kode/dependensi tidak membuktikan aplikasi bebas seluruh celah.
