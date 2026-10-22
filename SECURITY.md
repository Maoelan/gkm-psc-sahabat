# Security

## Prinsip

- Jangan pernah menggunakan data korban nyata, NIK asli, nomor telepon asli, atau isi laporan nyata di repositori ini.
- Jangan commit `.env`, kunci enkripsi, API key, token WhatsApp, kata sandi, dump database, atau file export.
- Nilai rahasia hanya boleh berada di environment lokal atau secret store platform deploy. APPLICATION_SERVER_KEY menghubungkan server SvelteKit ke Convex; jangan kirim kunci ini atau kredensial deploy ke browser.
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
- Permintaan perubahan dibatasi per alamat klien yang di-hash. Penghitung disimpan bersama di Convex dan diperbarui melalui mutation atomik; kunci kedaluwarsa dibersihkan bertahap. Penguncian login juga memakai penghitung atomik.
- Cookie HttpOnly/SameSite Strict; HTTPS wajib di luar loopback dan memakai Secure. HSTS dikirim pada HTTPS. CSP, no-store, anti-frame, no-sniff, dan Permissions-Policy tetap aktif.
- Respons error internal tidak memuat exception atau data permintaan. Health produksi hanya menampilkan status umum.
- Scanner memeriksa working tree, index Git, riwayat blob, dan bundle browser terhadap pola rahasia dan nilai environment privat lokal. Temuan hanya mencetak lokasi/jenis, bukan nilainya. GitHub Actions memakai SHA tetap serta menjalankan pemeriksaan tipe Svelte/Convex, tes, build Node/Vercel, audit dependensi, dan integrasi Convex terisolasi.
- Penyimpanan cloud menerima ciphertext untuk isi sensitif; dekripsi tetap pada server SvelteKit. Setiap fungsi backend memerlukan kunci aplikasi server. Operasi petugas memeriksa ulang sesi, peran, akun aktif, dan penugasan yang tersimpan. Mutasi handoff/submit/keputusan dilakukan atomik; nomor urut pesan mencegah hasil AI lama menimpa percakapan baru.

## Jika rahasia terlanjur terekspos

1. Cabut atau rotasi kredensial tersebut segera.
2. Hapus dari commit terbaru saja tidak cukup; bersihkan riwayat Git jika sudah ter-push.
3. Periksa log akses penyedia untuk penggunaan yang tidak sah.
4. Ganti kunci enkripsi hanya dengan rencana migrasi data; mengganti `REPORT_DATA_KEY` atau `NIK_DATA_KEY` membuat data lama tidak dapat dibaca.

## Pelaporan

Gunakan fitur private vulnerability reporting di GitHub jika tersedia. Jangan membuka issue publik yang memuat rahasia, data pribadi, atau detail eksploitasi.

## Batas

Repositori ini ditujukan untuk demo evaluasi dengan data sintetis, termasuk ketika di-host melalui HTTPS. MFA, pemulihan akun, kebijakan backup/retensi, DPA/persetujuan privasi produksi, pengujian penetrasi, dan audit keamanan independen belum disiapkan. Ketiga akun demo memiliki akses admin; gunakan akun dengan peran lebih sempit untuk menguji pemisahan tugas. Audit aktivitas aplikasi tidak menggantikan audit keamanan. Pembatasan permintaan bersama bukan perlindungan DDoS. List query ditujukan untuk dataset demo kecil. Pemeriksaan kode/dependensi tidak membuktikan aplikasi bebas seluruh celah.
