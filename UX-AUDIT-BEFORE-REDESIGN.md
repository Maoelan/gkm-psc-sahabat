# Audit UI/UX sebelum perombakan

Tanggal audit: 19 Oktober 2026

Cakupan: beranda, panduan, alur pengaduan, meja petugas, desktop 1440 × 900, ponsel 390 × 844, serta tangkapan layar pengguna pada lebar 1920 px.

> Catatan historis: dokumen ini merekam kondisi sebelum perombakan. Istilah “prototipe” dan “simulasi” di dalamnya menggambarkan UI lama, bukan label yang dipakai aplikasi saat ini.

## Ringkasan

Alur inti dan validasi bekerja, tidak ditemukan overflow horizontal, dan batas prototipe sudah disebutkan. Masalah utama berada pada arsitektur tampilan dan urutan informasi. Antarmuka terlihat seperti lembar desain yang ditempel ke sisi kanan layar, bukan layanan publik yang utuh. Pada ponsel, isi lebih mudah dibaca, tetapi terlalu panjang dan masih memakai istilah teknis yang tidak membantu pengguna awam.

## Temuan prioritas kritis

1. **Lorong kosong 236 px di desktop.** `.app-frame` memberi padding kiri tetap sementara header tetap selebar layar. Akibatnya banner dan semua isi tidak sejajar dengan identitas aplikasi. Pada layar 1920 px, ruang kosong ini tampak seperti panel yang gagal dimuat.
2. **Tindakan utama terlambat dipahami.** Judul “Cerita Anda. Kendali Anda.” bersifat emosional, tetapi tidak langsung menjelaskan bahwa pengguna dapat membuat pengaduan. Orang awam harus membaca paragraf untuk memahami fungsi halaman.
3. **Hero terlalu tinggi dan berpusat vertikal.** Tinggi minimum 620 px, judul besar, dan ruang kosong membuat informasi penting berikutnya berada jauh di bawah lipatan layar.
4. **Kolom kanan hero tidak membentuk satu tugas.** Jadwal, ilustrasi, dan catatan kecil disusun bertumpuk tanpa hubungan yang jelas. Ilustrasi terlihat ditempel di ruang sisa, bukan menjadi pendamping yang membantu orientasi.
5. **Status layanan menyesatkan untuk fase prototipe.** Label “Mode AI” dan kalimat “ditentukan oleh server” memberi kesan sistem nyata sudah aktif, padahal frontend belum terhubung ke server atau AI.

## Temuan prioritas tinggi

6. **Identitas Puskesmas terlalu kecil.** Logo dan nama unit ada, tetapi kalah oleh bidang kosong dan hero sehingga kepemilikan layanan tidak langsung terbaca.
7. **Navigasi dan isi memakai sumbu yang berbeda.** Menu berada di tengah seluruh layar, tetapi konten dimulai setelah offset kiri. Hubungan spasial antarbagian putus.
8. **Banner prototipe terlalu dominan di ponsel.** Dua baris kuning mengambil ruang awal yang besar sebelum pengguna melihat fungsi halaman.
9. **Bahasa teknis muncul terlalu awal.** “Mode percakapan”, “server”, “AI simulasi”, “MFA”, dan “otorisasi per permintaan” cocok untuk dokumentasi teknis, bukan orientasi pengguna umum.
10. **Alur bernama chat, tetapi tampil sebagai formulir.** Gelembung pesan hanya digunakan sebagai judul pertanyaan, sementara interaksi seluruhnya berupa fieldset dan input. Metafor campuran ini menambah beban pemahaman.
11. **Progres tidak memiliki nama tahap.** Lima garis menunjukkan jumlah langkah, tetapi pengguna tidak tahu sedang mengerjakan bagian apa atau apa yang tersisa.
12. **Panduan terlalu panjang dan datar.** Semua kategori menjadi kartu besar dengan bobot visual yang sama. Informasi “apa yang perlu disiapkan” justru berada jauh di bawah daftar kategori.
13. **Meja petugas memiliki navigasi ganda.** Header publik tetap tampil, lalu ada sidebar kedua dengan merek dan tautan lain. Pada layar kecil, lapisan ini terasa seperti dua aplikasi bertumpuk.
14. **Detail laporan pada ponsel memakai panel fixed.** Pola ini berisiko menutup banner/header dan membuat posisi gulir sulit dipahami.

## Temuan prioritas sedang

15. Tombol utama dan sekunder di hero sama-sama padat sehingga pilihan pertama kurang tegas.
16. Jadwal hari Minggu tidak menyebut bahwa AI belum tersedia pada prototipe.
17. Catatan penting mengenai jam layanan memakai teks kecil di bagian paling bawah kolom gelap.
18. Tidak ada tautan “Lewati ke isi”, sehingga pengguna keyboard harus melewati navigasi pada setiap halaman.
19. Drawer ponsel dapat ditutup dengan Escape, tetapi tidak mengarahkan fokus ke tombol tutup saat dibuka dan backdrop bukan kontrol yang bernama.
20. Footer dan halaman utama memakai lebar/padding berbeda sehingga ritme halaman tidak konsisten.
21. Banyak permukaan kartu berbingkai membuat halaman edukasi terasa seperti kumpulan komponen, bukan penjelasan yang mengalir.
22. Status demo meja petugas berguna untuk QA, tetapi kontrolnya terlalu menonjol bagi pengguna biasa dan belum diberi konteks sebagai alat uji.

## Hal yang dipertahankan

- Logo Puskesmas, nama UPT Puskesmas Suranadi, dan ilustrasi khusus perempuan serta anak.
- Palet navy, magenta, teal, kuning, dan off-white dari PRD.
- Satu tindakan utama per konteks, target sentuh minimum, fokus keyboard, serta pesan validasi tertulis.
- Larangan data nyata, tidak ada penyimpanan lokal, tidak ada request pihak ketiga, dan tombol keluar cepat.
- Alur lima langkah, tinjau draf sebelum kirim, kondisi memuat/kosong/gagal, dan dua keputusan petugas dengan alasan wajib.

## Arah perbaikan

Antarmuka diubah menjadi **pusat bantuan Puskesmas yang tenang dan langsung**: satu header yang sejajar dengan konten, judul yang menyebut tugas, langkah berbahasa sehari-hari, ilustrasi sebagai pendamping orientasi, jadwal sebagai informasi terpisah, dan meja petugas sebagai ruang kerja tunggal. Struktur responsif ditentukan ulang, bukan sekadar mengecilkan layout desktop.
