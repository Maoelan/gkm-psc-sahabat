# Security

## Prinsip

- Jangan pernah menggunakan data korban nyata, NIK asli, nomor telepon asli, atau isi laporan nyata di repositori ini.
- Jangan commit `.env`, kunci enkripsi, API key, token WhatsApp, kata sandi, dump database, atau file export.
- Nilai rahasia hanya boleh berada di environment lokal atau secret store platform deploy.
- `.env.example` hanya berisi placeholder.

## Sebelum push

```sh
npm run security:scan
npm audit --audit-level=high
git status --short
git diff --cached --stat
```

Periksa bahwa `.env`, `node_modules`, `build`, `.svelte-kit`, screenshot, dan artifact agen tidak ikut masuk.

## Jika rahasia terlanjur terekspos

1. Cabut atau rotasi kredensial tersebut segera.
2. Hapus dari commit terbaru saja tidak cukup; bersihkan riwayat Git jika sudah ter-push.
3. Periksa log akses penyedia untuk penggunaan yang tidak sah.
4. Ganti kunci enkripsi hanya dengan rencana migrasi data; mengganti `REPORT_DATA_KEY` atau `NIK_DATA_KEY` membuat data lama tidak dapat dibaca.

## Pelaporan

Gunakan fitur private vulnerability reporting di GitHub jika tersedia. Jangan membuka issue publik yang memuat rahasia, data pribadi, atau detail eksploitasi.

## Batas

Repositori ini adalah demo lokal, bukan layanan produksi. MFA, HTTPS produksi, backup, retensi, DPA/persetujuan privasi, pengujian penetrasi, dan audit akses belum tersedia.
