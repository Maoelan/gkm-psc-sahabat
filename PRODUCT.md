# LAPOR AMAN

## Product truth

LAPOR AMAN adalah portal pengaduan kekerasan terhadap perempuan dan anak untuk GKM PSC SAHABAT, UPT Puskesmas Suranadi. Portal membantu pelapor memahami alur, menyusun keterangan tanpa pengulangan yang tidak perlu, meninjau draf, dan menerima bukti pengiriman. Petugas berwenang memeriksa laporan lalu mencatat salah satu dari dua keputusan beserta alasan. Pada lingkungan lokal ini, laporan, keputusan, sesi, riwayat percakapan, dan audit disimpan di PostgreSQL.

## Users

- Pelapor, termasuk korban, keluarga, pendamping, atau pihak lain yang mengetahui kejadian.
- Operator atau petugas yang mendapat penugasan untuk memeriksa laporan.
- Bidan/PIC yang memerlukan rekap laporan dan NIK korban untuk tindak lanjut.
- PIC yang memantau operasional dan kegagalan notifikasi.

## Product boundaries

- Alur aplikasi berakhir pada keputusan perlu tindak lanjut atau tidak perlu tindak lanjut.
- Penanganan, pendampingan, pengobatan, rehabilitasi, rujukan, visum, dan koordinasi Dinas Sosial berlangsung di luar aplikasi sesuai SOP. Aplikasi tidak mengklaim integrasi atau hasil layanan tersebut.
- AI boleh menanggapi pertanyaan pelapor tentang alur dan memilih satu pertanyaan pelengkap dari topik yang belum terisi. AI tidak boleh memberi nasihat, diagnosis, bantuan hukum, keputusan, atau meminta identitas. Percakapan tidak berakhir otomatis; pelapor menekan Selesai untuk membuka draf.
- Nama korban dipakai untuk mengenali laporan. NIK korban opsional dan hanya dapat dibuka oleh bidan/PIC yang sudah terautentikasi; akses NIK dicatat di audit.
- Riwayat percakapan dapat dibuka oleh petugas yang ditugaskan atau admin. Setiap pembukaan dicatat di audit, dan NIK/kontak dimasking.
- Pembatasan akses, enkripsi, audit, dan export pada versi ini adalah kontrol demo, bukan jaminan keamanan produksi.
- Kontak resmi, dasar hukum final, retensi, penyedia, dan kebijakan operasional belum boleh dianggap disahkan.

## Current phase

Lingkungan lokal terintegrasi dengan backend. UI memakai server untuk sesi, draf, laporan, keputusan, rekap, NIK, export, riwayat percakapan, dan status outbox. Seed memakai data latihan; jangan gunakan data korban nyata.

Yang belum diselesaikan: MFA dan manajemen identitas produksi, persetujuan NIK dan privasi, retensi/penghapusan, hosting, audit independen, integrasi WhatsApp nyata, dan pengujian penetrasi. AI NVIDIA Nemotron sudah terhubung, tetapi penyedia dapat gagal; pertanyaan cadangan yang aman dipakai bila itu terjadi.

Demo Oktober 2026 menambahkan nama korban, NIK opsional, rekap bidan/PIC, dan export `.xlsx` yang dibuat di server. PRD v0.1 FR-03 belum mengizinkan NIK sebagai data bawaan, sehingga perubahan ini memerlukan revisi PRD dan persetujuan privasi sebelum produksi.

## Durable requirements

- Utamakan penggunaan ponsel dan target WCAG 2.2 AA.
- Tampilkan mode layanan, batas kemampuan, serta pemberitahuan privasi sebelum data sensitif.
- Jangan meminta informasi yang sudah diberikan dan izinkan informasi belum diketahui.
- Pisahkan keterangan pelapor, ringkasan yang dikonfirmasi, dan keputusan petugas.
- Tampilkan NIK hanya di ruang bidan/PIC dan setelah tindakan tampilkan yang disengaja; jangan tampilkan NIK di meja petugas umum, bukti pelapor, atau transkrip chat.
- Riwayat percakapan hanya untuk petugas yang ditugaskan atau admin, dengan masking NIK/kontak dan audit setiap pembukaan.
- Pisahkan sheet rekap tanpa NIK dari sheet identitas ber-NIK. Perlakukan file export sebagai data sensitif.
- Terapkan minimisasi data, otorisasi per penugasan atau peran admin, audit, retensi, dan penghapusan sebelum produksi. NIK tidak boleh dianggap aman hanya karena disembunyikan di klien.
- Jangan menampilkan janji respons, klaim keamanan, identitas formal, kontak, visum, atau integrasi Dinas Sosial yang belum diverifikasi.

## Success signal

Pengguna dapat menyelesaikan alur dengan jelas, meninjau draf yang setia pada keterangannya, dan memahami batas layanan. Petugas hanya melihat laporan dalam penugasannya; admin dapat meninjau seluruh laporan. Setiap keputusan memiliki alasan, dan setiap pembukaan riwayat percakapan tercatat. Bidan/PIC dapat membaca rekap dan NIK sesuai kewenangan. Target angka dan janji waktu respons belum ditetapkan.
