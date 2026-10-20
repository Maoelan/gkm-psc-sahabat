---
name: "LAPOR AMAN"
description: "Sistem visual tenang dan tegas untuk alur pengaduan yang sensitif."
colors:
  structural-navy: "#082f49"
  deep-navy: "#0b4365"
  action-magenta: "#b51761"
  action-magenta-dark: "#8f124d"
  support-teal: "#087f7a"
  alert-yellow: "#f4c95d"
  paper: "#ffffff"
  cool-ground: "#eaf2f3"
  soft-surface: "#f5f8f8"
  body-ink: "#102a43"
  muted-ink: "#526678"
  quiet-border: "#d6e0e2"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(3rem, 5vw, 4.65rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(1.8rem, 3.4vw, 3rem)"
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.55
  label:
    fontFamily: "Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
rounded:
  control: "8px"
  panel: "12px"
  card: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-magenta}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.structural-navy}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.body-ink}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
    height: "48px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.body-ink}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: LAPOR AMAN

## Overview

**Creative North Star: "Pusat Bantuan Puskesmas yang Tenang"**

Sistem ini memperlakukan aplikasi sebagai pusat bantuan publik yang utuh, bukan lembar yang ditempel di dalam bingkai. Struktur terasa resmi, tetapi bahasa, ruang, dan kontrolnya tetap ramah bagi orang yang sedang menghadapi situasi sensitif. Komposisi mengutamakan orientasi, tindakan utama, kendali pengguna, lalu rincian pendukung.

Antarmuka tidak memakai foto korban, ilustrasi dramatis, atau efek dekoratif yang dapat mengalihkan perhatian. Warna membawa fungsi, bukan suasana buatan. Magenta menandai tindakan utama, teal membantu orientasi, kuning hanya muncul pada perhatian penting, dan bidang putih menjaga keterbacaan.

**Key Characteristics:**

- Header institusional navy dan isi yang sejajar dalam satu sumbu utama.
- Tipografi editorial untuk judul, sans serif yang lugas untuk isi dan kontrol.
- Kepadatan sedang, ruang antarbagian terukur, serta batas yang tipis dan jelas.
- Semua status disampaikan dengan teks, tidak bergantung pada warna.
- Identitas Puskesmas tampil sejak header; ilustrasi karakter menjadi pendamping orientasi, bukan dekorasi terpisah.

## Colors

Palet berangkat dari identitas PSC SAHABAT pada PRD dan memakai kontras yang tenang untuk konteks layanan publik.

### Primary

- **Magenta Tindakan:** dipakai untuk tindakan utama dan progres aktif. Varian gelap hanya untuk hover.

### Secondary

- **Teal Pendamping:** dipakai untuk status pendukung, pilihan aktif, tautan kontekstual, dan tanda keberhasilan.

### Tertiary

- **Kuning Perhatian:** dipakai terbatas pada banner privasi, fokus keyboard, dan pemberitahuan yang harus terlihat.

### Neutral

- **Navy Struktur:** membentuk navigasi, hero, dan bidang institusional.
- **Kertas Putih:** menjadi bidang baca utama.
- **Latar Sejuk:** membedakan area kerja petugas dan bagian pendukung dari isi utama.
- **Tinta dan Batas:** menjaga hierarki tanpa kontras hitam murni.

### Named Rules

**The One Action Rule.** Satu area hanya memiliki satu tindakan magenta yang dominan.

**The Text Carries Status Rule.** Warna boleh membantu, tetapi teks selalu menyebut status atau akibatnya.

## Typography

**Display Font:** Georgia dengan fallback Times New Roman dan serif.

**Body Font:** Aptos dengan fallback Segoe UI, Arial, dan sans-serif.

**Character:** Judul editorial memberi bobot manusiawi tanpa terasa promosi. Isi dan kontrol memakai bentuk yang netral, ringkas, dan mudah dipindai.

### Hierarchy

- **Display:** tebal dan rapat, tetapi dibatasi agar tindakan utama tetap terlihat pada layar pertama.
- **Headline:** serif berukuran responsif untuk judul halaman dan bagian utama.
- **Title:** sans serif tebal untuk judul panel, kartu, dan detail operasional.
- **Body:** ukuran dasar 1rem dengan tinggi baris 1.55 dan panjang baris sekitar 60 sampai 65 karakter.
- **Label:** sans serif tebal untuk label formulir, status, dan navigasi.

### Named Rules

**The Quiet Headline Rule.** Judul boleh besar, tetapi tidak memakai huruf kapital penuh, gradien, efek, atau susunan kata dekoratif.

## Layout

Pada desktop, halaman publik memakai bar navigasi setinggi 76px dan isi selebar maksimum 1160 sampai 1240px yang berada pada sumbu tengah yang sama. Halaman chat memakai kolom aplikasi yang lebih sempit: 760px untuk gerbang dan identitas, 960px untuk percakapan, serta 860px untuk review. Halaman meja petugas memakai 1280px. Halaman rekap bidan/PIC memakai 1280px untuk ruang kerja dan 980px untuk gerbang akses staff. Judul halaman selalu sejajar dengan kartu yang sedang aktif. Tidak ada rel atau ruang kosong dekoratif di sisi layar. Hero membagi penjelasan layanan dan pendamping visual, sedangkan jadwal berada pada bagian tersendiri. Pada lebar 980px ke bawah, navigasi menjadi drawer dan grid utama berubah menjadi satu kolom. Pada lebar 620px ke bawah, tindakan disusun penuh selebar kontainer.

Urutan tiga tahap di beranda bukan pola pemasaran generik. Isinya merangkum urutan pelapor yang ditetapkan PRD: menyampaikan cerita, memeriksa draf, lalu mengonfirmasi pengiriman dan menyimpan kode.

Jarak mengikuti ritme 8, 12, 16, 24, dan 32px. Bagian besar memakai ruang 48 sampai 128px sesuai viewport. Target sentuh minimum 44px.

## Elevation & Depth

Sistem datar secara sengaja. Kedalaman berasal dari perubahan bidang warna dan garis batas. Tidak ada bayangan kartu. Fokus keyboard memakai outline kuning 3px dengan offset 3px.

### Named Rules

**The Flat Service Rule.** Jangan menambah bayangan untuk membuat elemen tampak penting. Gunakan posisi, skala, warna, dan batas.

## Shapes

Kontrol memakai sudut 8px, panel status 12px, dan kartu utama 16px. Chip status memakai sudut kecil 4px agar terasa seperti label operasional. Lingkaran hanya dipakai untuk status singkat dan tanda bukti penerimaan.

## Components

Komponen terasa tegas dan mudah dibaca. Halaman Chat Pengaduan memakai percakapan satu pertanyaan alur per giliran karena pola itu ditetapkan PRD, tanpa meniru tampilan aplikasi pesan konsumen. AI memilih topik dari daftar yang belum terisi, tetapi percakapan tetap terbuka sampai pelapor menekan Selesai. Gerbang keselamatan dan identitas mendahului percakapan; review menyatukan mode, cerita, ringkasan, dan preferensi kontak dalam satu halaman yang dapat disunting.

### Buttons

- **Shape:** sudut lembut 8px dengan tinggi minimum 44px.
- **Primary:** magenta solid dengan teks putih dan padding horizontal 20px.
- **Hover / Focus:** warna primer menjadi lebih gelap; fokus selalu memakai outline kuning.
- **Secondary / Ghost:** bidang putih atau transparan dengan batas jelas dan teks navy.

### Chips

- **Style:** bidang teal sangat muda, teks teal gelap, sudut 4px, dan label eksplisit.
- **State:** chip hanya memberi ringkasan, bukan kontrol interaktif. Status keputusan yang sudah tercatat memakai abu-navy netral agar terasa final tanpa bersaing dengan tindakan utama.

### Cards / Containers

- **Corner Style:** 12px sampai 16px sesuai tingkat kontainer.
- **Background:** putih atau permukaan sejuk.
- **Shadow Strategy:** tanpa bayangan.
- **Border:** garis 1px berwarna batas tenang.
- **Internal Padding:** 20px sampai 28px.

### Inputs / Fields

- **Style:** bidang putih, garis 1px, sudut 8px, tinggi minimum 48px.
- **Focus:** outline kuning yang tidak bergantung pada perubahan warna garis.
- **Error / Disabled:** pesan tertulis dekat kontrol; kontrol nonaktif memakai opasitas dan kursor yang sesuai.

### Victim Identity and NIK

- **Identity:** satu field nama korban atau nama panggilan. Label menyatakan bahwa ini nama korban, bukan nama pelapor.
- **NIK field:** label “NIK korban (opsional)”, input numerik 16 digit, bantuan singkat, dan boleh kosong. NIK tidak dipakai untuk identitas pelapor.
- **Review:** nilai NIK tampil tersamar (`•••• •••• •••• 1234`) dengan tombol “Ubah NIK” atau “Isi NIK”. Editor muncul hanya setelah tindakan itu.
- **Receipt and transcript:** NIK tidak muncul di bukti penerimaan, transkrip chat, atau meja petugas umum.
- **Restricted view:** ruang bidan/PIC menampilkan nilai tersamar terlebih dahulu. Tombol “Tampilkan NIK” membuka nilai penuh, dan status tombol memakai `aria-pressed`.

### Recap Workspace

- **Access gate:** kartu sempit dengan penanda peran, batas akses, dan tombol masuk staff. Sesi diverifikasi server; halaman ini bukan pengganti manajemen identitas organisasi.
- **Summary:** empat kartu hitung dengan garis atas berbeda dan angka besar. Warna hanya pendamping; label tetap menjelaskan status.
- **Table:** tabel rekap dengan kepala navy, baris dapat dipindai, chip status, dan tombol detail. Di ponsel tabel berubah menjadi kartu berlabel tanpa scroll horizontal.
- **Detail:** panel detail menampilkan nama, hubungan, waktu, lokasi umum, kebutuhan, kontak, NIK tersamar, dan keputusan. Alasan keputusan ditampilkan terpisah.
- **Export:** tombol `.xlsx` berada di ruang terbatas dengan peringatan NIK. Sheet `Rekap` tidak memuat NIK; sheet `Identitas` memuat NIK.

### Navigation

Navigasi desktop berada pada bar navy dengan garis kuning untuk halaman aktif. Navigasi publik utama memakai istilah PRD: “Panduan & Edukasi” dan “Chat Pengaduan”. Pada ponsel, drawer putih memakai bidang teal muda untuk halaman aktif, tombol tutup eksplisit, backdrop bernama, pemindahan fokus, dan dukungan tombol Escape.

### Design Read

Layanan publik untuk pelapor awam, dengan bahasa visual puskesmas yang tenang dan tegas. Dial: ENERGY 1 / RHYTHM 1 / MOTION 1.

### Privacy Banner

Banner kuning muda dengan garis aksen kuning selalu terlihat di atas konten dan menyatakan batas privasi, pemrosesan AI, serta tautan ke pemberitahuan privasi.

### Institutional Brand

Logo Puskesmas selalu berdampingan dengan nama UPT Puskesmas Suranadi. Ilustrasi chibi perempuan dan anak memakai palet produk, tidak memuat lambang institusi, dan tidak menggantikan pesan keselamatan atau status layanan.

## Do's and Don'ts

### Do:

- **Do** pertahankan satu tindakan utama per konteks.
- **Do** tampilkan batas layanan, status layanan, dan pemberitahuan privasi sebelum pengguna mengisi data.
- **Do** gunakan struktur satu kolom pada ponsel dan target sentuh minimum 44px.
- **Do** tulis kondisi kosong, gagal, dan validasi dengan bahasa yang langsung.
- **Do** sembunyikan NIK secara bawaan dan tampilkan hanya setelah tindakan sengaja di ruang bidan/PIC.
- **Do** pisahkan sheet rekap tanpa NIK dari sheet identitas ber-NIK dan perlakukan file export sebagai data sensitif.

### Don't:

- **Don't** menambah foto dramatis, ilustrasi korban, atau elemen dekoratif yang tidak membantu tugas.
- **Don't** mengubah, menggambar ulang, atau mencampurkan logo Puskesmas ke dalam ilustrasi karakter.
- **Don't** memakai gradien, bayangan kartu, ikon teks, atau warna sebagai satu-satunya penanda.
- **Don't** menampilkan klaim keamanan, kontak, dasar hukum, atau janji respons yang belum disahkan.
- **Don't** mengubah istilah dugaan menjadi fakta atau menyamarkan AI sebagai petugas.
- **Don't** menampilkan NIK di meja petugas, bukti pelapor, transkrip chat, atau sebagai syarat pengiriman.
- **Don't** menyebut gerbang peran, file export, atau penyembunyian NIK sebagai kontrol keamanan yang sudah berlaku.
