# PRD LAPOR AMAN — GKM PSC SAHABAT

**UPT Puskesmas Suranadi**

Versi 0.1 — 19 Oktober 2026

Status: **draf untuk pembahasan; belum disetujui untuk implementasi atau laporan sungguhan.**

> **Addendum demo 20 Oktober 2026.** Untuk demo 23 Oktober 2026, implementasi lokal meminta nama korban dan NIK korban opsional agar alur rekap bidan/PIC serta export `.xlsx` dapat diperagakan. Ini adalah pengecualian demo, bukan perubahan syarat produksi. FR-03, FR-04, FR-09, FR-12, minimisasi data, otorisasi, audit, dan kebijakan privasi wajib direvisi dan disetujui ulang sebelum ada penggunaan NIK pada layanan nyata. Demo tidak boleh memakai NIK asli.
>
> **Addendum implementasi backend 20 Oktober 2026.** UI kini memakai server SvelteKit dan PostgreSQL lokal untuk sesi, draf, laporan, keputusan, rekap, NIK, export, dan outbox. Login staff demo, enkripsi AES-256-GCM, CSRF, pembatasan percobaan, otorisasi peran, dan audit akses NIK sudah diterapkan untuk demo. Ini belum memenuhi syarat produksi: MFA, manajemen identitas organisasi, retensi/penghapusan, hosting, audit independen, dan persetujuan privasi masih terbuka. Integrasi NVIDIA Nemotron dipakai untuk menanggapi pesan pelapor dan menanyakan satu topik pelengkap, dengan fallback aman; WhatsApp belum terkirim tanpa provider, kredensial, nomor tujuan, dan template yang disetujui.
>
> **Addendum chat multi-turn 21 Oktober 2026.** Server menyediakan daftar field yang belum terisi (waktu, lokasi umum, kebutuhan) dan riwayat percakapan terbatas; AI memilih topik berikutnya dan menyusun tanggapan serta satu pertanyaan pelengkap per giliran. AI boleh menjawab pertanyaan pelapor tentang alur proyek, tetapi tidak memberi nasihat, diagnosis, keputusan, atau meminta identitas. Pelapor dapat menulis bebas, melewati pertanyaan, menambah cerita, dan memeriksa ringkasan sebelum kirim. Percakapan tidak ditutup otomatis; pelapor menekan tombol Selesai untuk membuka draf. Riwayat percakapan disimpan dengan sumber pesan dan dapat dibuka oleh petugas yang ditugaskan atau admin; setiap pembukaan dicatat di audit. NIK dan kontak dimasking pada riwayat yang ditampilkan ke petugas umum. Perilaku ini belum menggantikan persetujuan privasi, retensi, atau pengujian produksi.

## 1. Overview

### 1.1 Tujuan

LAPOR AMAN adalah portal pengaduan kekerasan terhadap perempuan dan anak yang dapat diakses melalui QR dan nyaman digunakan dari ponsel. Portal menyediakan panduan, percakapan dengan petugas atau AI sesuai waktu layanan, penyusunan laporan terstruktur, dan pemeriksaan oleh petugas.

Tujuannya memudahkan pelapor menyampaikan informasi dengan aman, mengurangi kebutuhan mengulang cerita, dan menyediakan catatan keputusan petugas yang dapat dipertanggungjawabkan. Nama proyek: **LAPOR AMAN — GKM PSC SAHABAT**; kepanjangan dan identitas formal GKM mengikuti dokumen resmi setelah tersedia.

### 1.2 Batas aplikasi

Alur berakhir ketika petugas mencatat **perlu tindak lanjut** atau **tidak perlu tindak lanjut**, beserta alasan. Penanganan, pendampingan, konsultasi, pengobatan, rehabilitasi, dan rujukan setelah keputusan berlangsung di luar aplikasi sesuai SOP instansi. Aplikasi tidak mengelola penyelesaian kasus lintas lembaga.

AI membantu percakapan dan penyusunan draf. AI tidak melakukan diagnosis, asesmen klinis, penetapan kebenaran kejadian, penilaian kredibilitas, penentuan tingkat risiko klinis, atau keputusan kebutuhan tindak lanjut.

### 1.3 Sumber dan keterbatasan

| Sumber | Ketersediaan | Pemakaian dalam draf |
| --- | --- | --- |
| Arahan pengguna pada percakapan ini | Tersedia | Dasar utama ruang lingkup dan keputusan produk |
| Percakapan rujukan “Brainstorming Inovasi Pengaduan Puskesmas” | Sebagian | Pesan pengguna terbaca; beberapa jawaban lama hanya berupa penanda referensi |
| Poster “STOP KEKERASAN PEREMPUAN & ANAK” | Terbaca | Konteks layanan, kategori kekerasan, dan pesan kerahasiaan |
| Poster “PSC SAHABAT — LAPOR AMAN” | Terbaca | Identitas visual, portal QR, dan konteks sasaran |
| PDF, Word, PPT yang disebutkan pengguna | Belum tersedia untuk dibaca | Belum menjadi dasar persyaratan; perlu pencocokan sebelum finalisasi |

Poster menjelaskan layanan PSC SAHABAT yang lebih luas daripada aplikasi. Batas aplikasi mengikuti arahan pengguna. Satu poster mencantumkan hotline dan poster PSC SAHABAT memakai nomor placeholder; nomor dan tujuan QR wajib diverifikasi pemilik layanan sebelum ditayangkan. PRD ini tidak menganggap keduanya sudah aktif atau mutakhir.

### 1.4 Pengguna dan hasil yang diharapkan

- **Pelapor:** korban, keluarga, pendamping, atau pihak lain yang mengetahui kejadian; dapat membaca panduan tanpa registrasi dan menyampaikan laporan dengan data pribadi minimum sebelum pengiriman.
- **Operator/petugas:** melayani chat sesuai penugasan, memeriksa laporan dan kebutuhan yang disampaikan, serta mencatat keputusan dalam batas kewenangannya.
- **PIC/koordinator:** menerima pemberitahuan minimal dan mengelola penugasan sesuai otorisasi.
- **Admin teknis:** mengelola akun dan konfigurasi; tidak otomatis mendapat akses isi laporan.
- **Auditor yang ditunjuk:** memeriksa jejak akses dan perubahan sesuai mandat; akses isi laporan dipisahkan dari akses audit.

Keberhasilan dinilai melalui kemudahan menyelesaikan laporan, kesesuaian draf dengan cerita pelapor, akses hanya oleh petugas berwenang, dan keputusan petugas yang selalu memiliki alasan. Tidak ada target angka atau janji waktu respons sebelum kapasitas layanan dan SOP disepakati.

### 1.5 Roadmap wajib dan gerbang persetujuan

Urutan pekerjaan: **Planning → Frontend → Backend → Integration → Deployment**. Setiap tahap memerlukan hasil yang dapat ditinjau sebelum tahap berikutnya dimulai.

| Tahap | Pekerjaan | Hasil dan syarat selesai |
| --- | --- | --- |
| Planning | Telaah semua sumber; finalisasi PRD, minimisasi data, alur anak, peran, SOP, konten, retensi, dan risiko AI | PRD disetujui pemilik layanan; keputusan terbuka terdokumentasi; izin memulai prototipe frontend |
| Frontend | Implementasi SvelteKit lokal dengan data latihan: portal, edukasi, chat multi-turn, draf, privasi, bukti pengiriman, dan meja petugas | Uji alur ponsel dan aksesibilitas; uji kondisi kosong/gagal/offline; pemilik layanan meninjau bahasa dan tampilan; tidak menerima data nyata |
| Backend | Autentikasi petugas, otorisasi, penyimpanan terlindungi, status laporan, audit, jadwal, dan antrean notifikasi | Uji batas akses, transisi status, retensi, penghapusan, dan pemulihan data di lingkungan uji |
| Integration | Hubungkan antarmuka, backend, AI, dan WhatsApp pada lingkungan uji terpisah | Uji menyeluruh dengan data latihan, kegagalan penyedia, serangan prompt, pergantian petugas/AI, dan pengiriman ganda; UAT petugas |
| Deployment | Siapkan lingkungan, domain, QR, pemantauan, cadangan, prosedur insiden, dan rollback | Demo internal dapat dipakai pada lingkungan lokal; penerimaan laporan nyata tetap terkunci sampai SOP dan tata kelola disetujui tertulis |

Sebelum layanan nyata: tetapkan pengendali data dan penanggung jawab operasional, dasar pemrosesan, SOP anak dan keselamatan, petugas beserta kewenangan, kontak resmi, kebijakan retensi, perjanjian penyedia, penanganan insiden, pelatihan, serta persetujuan peluncuran. Selesainya pembangunan teknis tidak menggantikan persetujuan tersebut.

## 2. Requirements

### 2.1 Persyaratan fungsional

| ID | Persyaratan | Kriteria penerimaan |
| --- | --- | --- |
| FR-01 | Portal QR, mobile-first | Tautan dapat dibuka langsung; panduan dan akses pertolongan segera terbaca tanpa akun |
| FR-02 | Panduan & Edukasi | Memuat pengertian, jenis kekerasan, dasar hukum, cara melapor, batas aplikasi, dan informasi privasi; konten disahkan penanggung jawab |
| FR-03 | Data pribadi pelapor sebelum submit | Pengiriman ditolak bila data minimum yang disepakati belum tersedia; NIK, foto identitas, dan alamat rinci tidak diminta secara bawaan |
| FR-03a | Pengecualian demo: identitas korban | Hanya untuk demo frontend. Nama korban wajib; NIK korban opsional dan hanya angka 16 digit. NIK tidak tampil di meja petugas, tanda terima, atau transkrip chat; hanya tampil setelah tindakan di ruang bidan/PIC. Gerbang peran dan export belum merupakan kontrol keamanan nyata. |
| FR-04 | Pemberitahuan privasi sebelum submit | Tujuan, data yang disimpan, pihak yang dapat mengakses, penggunaan AI, penyedia terkait, retensi, dan kanal hak pengguna ditampilkan; versi pemberitahuan serta pengakuan telah membacanya tercatat |
| FR-05 | Chat hybrid | Mode petugas/AI ditentukan di server menggunakan zona waktu Asia/Makassar; identitas mode terlihat jelas |
| FR-06 | Pertanyaan adaptif | Satu pertanyaan sederhana pada satu waktu; informasi yang sudah ada tidak ditanya ulang; kolom pelengkap dapat dilewati atau diisi “belum diketahui” |
| FR-07 | Draf terstruktur | Ringkasan dapat ditinjau dan dikoreksi; fakta tidak diketahui ditandai; AI tidak mengarang informasi |
| FR-08 | Konfirmasi dan pengiriman | Draf baru menjadi laporan setelah konfirmasi eksplisit dan pemeriksaan persyaratan di server; pengiriman ulang tidak membuat duplikasi |
| FR-09 | Penyimpanan aman | Akses berdasarkan peran dan penugasan; isi sensitif tidak masuk log teknis atau notifikasi |
| FR-10 | Notifikasi WhatsApp ke PIC | Berisi pemberitahuan generik dan tautan masuk ke dashboard; tanpa nama, cerita, identitas korban, atau lampiran |
| FR-11 | Pemeriksaan petugas | Petugas berwenang membaca laporan dan kebutuhan yang disampaikan, lalu memilih satu dari dua keputusan; alasan wajib |
| FR-12 | Audit log | Akses sensitif, perubahan penugasan, perubahan status, keputusan, dan tindakan admin tercatat tanpa menyalin isi laporan |
| FR-13 | Pertolongan segera | Akses terlihat pada portal dan chat, tanpa registrasi dan tanpa menu Darurat terpisah; kontak hanya dari daftar resmi yang telah diverifikasi |
| FR-14 | Gangguan layanan | Kegagalan AI tidak menghalangi pengisian manual; kegagalan WhatsApp tidak menghilangkan laporan; kegagalan simpan tidak ditampilkan sebagai berhasil |

### 2.2 Jam layanan dan perpindahan mode

| Hari | Jam operator, WITA |
| --- | --- |
| Senin–Kamis | 08:00–14:00 |
| Jumat | 08:00–11:00 |
| Sabtu | 08:00–12:30 |
| Minggu | Di luar jam operator; mode AI berdasarkan jadwal yang diberikan |

Aturan teknis yang diusulkan: jam buka inklusif dan jam tutup eksklusif, sehingga tepat pukul 14:00 pada Senin–Kamis merupakan di luar jam operator. Jadwal hari libur dan pengecualian perlu disahkan. Waktu disimpan sebagai UTC dan ditampilkan sesuai WITA.

Jam buka tidak berarti petugas sedang tersedia. Dalam jam layanan, tampilkan status antrean/ketidaktersediaan dan izinkan pengisian laporan manual. **AI tidak otomatis mengambil alih dalam jam layanan** tanpa kebijakan yang disetujui. Pada pergantian jam, beri pemberitahuan jelas; pergantian peserta chat tidak boleh menghapus percakapan atau menyebabkan dua pihak menjawab bersamaan. SOP perlu menentukan penutupan sesi petugas yang sedang berlangsung dan proses pengambilalihan sesi AI ketika jam layanan dimulai.

### 2.3 Data minimum dan privasi

Usulan untuk dibahas: nama pelapor dan hubungan dengan korban merupakan data minimum; bentuk nama yang diterima—nama lengkap atau nama yang digunakan—belum ditetapkan. Pelaporan anonim tidak menjadi asumsi. Nomor kontak **tidak otomatis wajib** jika tidak ada cara aman menghubungi; pelapor dapat memilih “tidak aman dihubungi”. Akun pelapor dan OTP tidak diperlukan dalam usulan MVP, agar kepemilikan ponsel atau nomor tidak menjadi hambatan; keputusan ini perlu disahkan.

Pertanyaan kontak: apakah aman dihubungi, kanal yang aman, tujuan kontak bila aman, waktu aman, dan batasan pesan. Jangan mengirim WhatsApp, SMS, email, atau salinan laporan otomatis kepada pelapor. Kontak keluar harus mengikuti preferensi aman dan SOP. Jelaskan bila ketiadaan kontak membatasi komunikasi lanjutan tanpa menjadikannya alasan menolak cerita.

Data cerita yang bersifat pelengkap: waktu/perkiraan waktu kejadian, lokasi umum, pihak yang terlibat, hubungan pihak terkait, kronologi, dampak yang ingin disampaikan, dan bantuan yang diharapkan. Cerita inti diperlukan untuk membentuk laporan; kelengkapan setiap detail tidak menjadi syarat submit. Informasi korban dan terlapor dikumpulkan hanya bila relevan dan bersedia disampaikan. Tidak ada unggah bukti pada MVP yang diusulkan.

Pemberitahuan privasi ringkas diberikan **sebelum pengguna menulis data sensitif**, lalu rincian dan konfirmasi diberikan sebelum submit. Pengakuan telah membaca pemberitahuan tidak otomatis menjadi dasar hukum pemrosesan. Dasar pemrosesan dan kebutuhan persetujuan terpisah ditetapkan melalui penelaahan tata kelola/hukum.

Kebijakan pelapor/korban anak perlu disahkan: informasi sesuai usia, cara pendampingan yang aman, dan kondisi ketika wali justru pihak yang dilaporkan. Jangan otomatis menghubungi wali atau meminta persetujuan pihak yang dapat membahayakan korban.

### 2.4 Keamanan dan persyaratan nonfungsional

- HTTPS; enkripsi penyimpanan termasuk cadangan; enkripsi tambahan untuk identitas, kontak, transkrip, dan isi laporan dengan pengelolaan kunci terpisah.
- Autentikasi petugas menggunakan MFA, sesi berakhir otomatis, pencabutan akses segera, pembatasan percobaan masuk, dan peninjauan akses berkala.
- Otorisasi server pada setiap permintaan, dengan prinsip akses minimum dan pembatasan penugasan. Mengetahui ID laporan tidak memberikan akses.
- Pelapor hanya dapat melanjutkan sesi/draf miliknya melalui mekanisme sesi aman; kode laporan bukan kredensial untuk membaca laporan. Pelacakan publik berdasarkan nomor telepon/kode tidak termasuk MVP.
- Cookie sesi aman, perlindungan CSRF/XSS, validasi masukan, rate limit yang tidak membocorkan identitas, dan pengamanan jalur penyedia eksternal.
- Tanpa pelacak iklan, session replay, atau analitik yang merekam isi formulir/chat. Pesan kesalahan dan log tidak memuat data sensitif.
- Halaman sensitif tidak di-cache; jangan simpan transkrip di localStorage atau cache service worker. Penyimpanan draf sementara, masa sesi, dan TTL harus ditetapkan sebelum implementasi backend.
- Tautan “Keluar cepat” yang diusulkan meninggalkan halaman sensitif dan menutup sesi lokal. Jelaskan secara jujur bahwa tindakan ini tidak menghapus riwayat browser, tangkapan layar, atau jejak perangkat.
- WCAG 2.2 AA sebagai target aksesibilitas: kontras, label formulir, fokus keyboard, pembaca layar, target sentuh, dan pesan kesalahan yang dapat dipahami; uji pada ponsel dan jaringan lambat.
- Audit bersifat append-only, dibatasi aksesnya, dan dilindungi dari perubahan; admin aplikasi tidak dapat mengubah histori keputusan secara diam-diam.
- Retensi terpisah untuk sesi batal, transkrip, laporan, audit, dan cadangan; jadwal penghapusan, akses cadangan, serta uji pemulihan disetujui sebelum layanan nyata. Durasi belum ditentukan.

### 2.5 Mitigasi risiko AI

- AI selalu diperkenalkan sebagai AI; jangan menggunakan identitas petugas atau janji respons manusia di luar jam layanan.
- Penggunaan AI dibatasi pada tanggapan atas pertanyaan alur, satu pertanyaan pelengkap, penyusunan ringkasan, dan informasi dari materi yang disahkan. AI tidak menelusuri sumber sembarang atau memberikan tafsir hukum individual.
- Kirim data minimum ke penyedia AI; identitas dan kontak dipisahkan dari konteks model sejauh memungkinkan. Isi cerita masih dapat mengandung identitas, sehingga pengurangan data tidak boleh diklaim sebagai anonimisasi penuh.
- Tinjau lokasi pemrosesan, retensi, penggunaan data untuk pelatihan, penghapusan, akses vendor, dan ketentuan kontrak sebelum memilih penyedia.
- Isi percakapan diperlakukan sebagai data, bukan perintah sistem. AI tidak memiliki alat untuk mengubah hak akses, mengirim pesan, mengambil laporan lain, atau menetapkan keputusan.
- Hasil AI divalidasi terhadap skema; setiap bagian draf dapat ditelusuri ke keterangan pelapor. Jangan mengisi fakta kosong, menyalahkan korban, mengarahkan jawaban, atau memaksa pengulangan cerita traumatis.
- Bila pengguna menyampaikan kebutuhan pertolongan segera, tampilkan teks keselamatan dan kontak resmi yang telah disahkan; akses ini juga selalu terlihat tanpa bergantung pada deteksi AI. Jangan memberi jaminan bahwa sistem memantau keselamatan secara langsung.
- Uji halusinasi, pengungkapan data, prompt injection, bahasa menyalahkan, penggunaan oleh anak, serta upaya meminta diagnosis/keputusan. Kegagalan berisiko tinggi harus diselesaikan sebelum peluncuran.

## 3. Core Features

### 3.1 Portal dan Panduan & Edukasi

Navigasi utama: **Panduan & Edukasi** dan **Chat Pengaduan**. Halaman awal menjelaskan fungsi, jam WITA, batas layanan, privasi, dan akses pertolongan segera. Tidak ada menu Darurat terpisah. Materi edukasi mencakup kekerasan fisik, psikis, seksual, penelantaran, eksploitasi, serta kategori lain sesuai sumber resmi. Daftar kategori dan dasar hukum final menunggu dokumen sumber serta penelaahan peraturan yang berlaku; poster bukan satu-satunya dasar hukum.

Palet mengikuti poster PSC SAHABAT: navy untuk teks/struktur, magenta untuk aksi utama, teal untuk elemen pendukung, kuning sebagai aksen terbatas, dan off-white untuk latar. Kode warna final ditentukan saat frontend dengan pengujian kontras. Makna status tidak hanya disampaikan melalui warna. Identitas merek tidak boleh menciptakan janji keamanan atau respons yang belum dapat dibuktikan.

### 3.2 Chat dan penyusunan laporan

Urutan pertanyaan awal yang diusulkan:

1. Pemberitahuan mode petugas/AI dan privasi singkat.
2. “Apakah aman bagi Anda untuk menulis di perangkat ini?” dengan pilihan lanjut, baca panduan, atau keluar cepat.
3. “Anda melapor untuk diri sendiri atau orang lain?”
4. “Silakan ceritakan yang ingin Anda sampaikan. Anda boleh melewati pertanyaan yang belum nyaman dijawab.”
5. Pertanyaan pelengkap berdasarkan informasi yang belum jelas, lalu kebutuhan/bantuan yang ingin disampaikan.
6. Data minimum pelapor dan preferensi kontak aman, sebelum submit.

Contoh adaptasi: jika waktu dan lokasi sudah ada dalam cerita, AI tidak menanyakannya lagi. Jika tanggal tidak diketahui, simpan sebagai perkiraan/tidak diketahui. Bila pengguna melewati pertanyaan, jangan mengulanginya terus. Pengguna dapat beralih ke pengisian manual atau menekan Selesai untuk meninjau draf setelah cerita inti tersedia; AI tidak menutup percakapan sendiri.

### 3.3 Format laporan terstruktur

Laporan memuat: ID sistem; waktu diterima; mode percakapan; data minimum pelapor; hubungan dengan korban; preferensi kontak aman; informasi korban seperlunya; kategori yang dinyatakan/bersifat sementara; waktu dan lokasi kejadian bila diketahui; kronologi; pihak terkait seperlunya; kebutuhan yang disampaikan; informasi belum diketahui/dilewati; versi draf dan waktu konfirmasi; serta bagian pemeriksaan dan keputusan petugas.

Pisahkan **keterangan pelapor**, **ringkasan yang dikonfirmasi**, dan **catatan/keputusan petugas**. Istilah yang dipakai tidak boleh mengubah dugaan menjadi fakta yang telah dibuktikan. Tidak ada skor klinis atau label otomatis “perlu tindak lanjut” dari AI.

### 3.4 Meja petugas dan notifikasi

Petugas mendapat daftar laporan sesuai kewenangan, penugasan, pembacaan rincian, catatan pemeriksaan, dan formulir keputusan. PIC hanya melihat isi apabila juga diberi peran serta penugasan yang sesuai. Isi laporan yang sudah dikonfirmasi tidak ditimpa; koreksi dibuat sebagai versi/addendum dengan jejak audit.

Notifikasi WhatsApp dikirim setelah laporan tersimpan, melalui antrean yang dapat dicoba ulang. Contoh generik: “Ada pengaduan baru untuk diperiksa. Silakan masuk ke portal petugas.” Tautan menuju halaman masuk tanpa token yang membuka laporan langsung. Kegagalan pengiriman terlihat di dashboard PIC tanpa menyertakan cerita dalam log. Akun/perangkat WhatsApp PIC harus dikelola sesuai SOP karena pesan generik pun tetap mengungkap aktivitas layanan.

### 3.5 Di luar MVP yang diusulkan

Manajemen penanganan/rujukan, diagnosis/asesmen klinis, keputusan AI, integrasi rekam medis, unggah bukti, ekspor massal data pribadi, pengiriman laporan lengkap lewat WhatsApp, akun pelapor, dan dashboard statistik publik tidak termasuk MVP. Fitur tambahan dibahas sebagai perubahan ruang lingkup.

## 4. User Flow

### 4.1 Pelapor

**QR/tautan → portal → panduan atau chat → informasi privasi dan mode layanan → percakapan/isi manual → data minimum dan kontak aman → tinjau/edit draf → pemberitahuan privasi lengkap dan konfirmasi → submit → bukti diterima.**

Bukti diterima menampilkan ID referensi dan waktu, dengan kalimat bahwa laporan telah tersimpan dan akan diperiksa sesuai layanan. Jangan menulis “kasus sudah ditangani”, menjanjikan balasan segera, atau otomatis mengirim bukti ke ponsel pelapor. Tidak ada laporan resmi sebelum konfirmasi; kebijakan penyimpanan sementara harus sudah dijelaskan sejak awal.

### 4.2 Petugas

**Masuk dengan MFA → daftar sesuai akses → penugasan → baca laporan → periksa isi dan kebutuhan → catat keputusan perlu/tidak perlu tindak lanjut → isi alasan → simpan keputusan.**

Jika informasi kurang, laporan dapat tetap berstatus diperiksa dengan catatan kebutuhan klarifikasi; jangan memaksa keputusan final. Komunikasi klarifikasi di luar sesi mengikuti kontak aman dan SOP. Setelah keputusan, alur aplikasi selesai; tindakan berikutnya berlangsung di luar aplikasi. Perubahan keputusan hanya oleh pihak berwenang dengan alasan dan histori yang tetap tersedia.

### 4.3 Status dan pengecualian

- Sesi: `active`, `expired`, `ended`; mode `operator` atau `ai` terpisah dari status.
- Draf: `editing`, `ready_for_confirmation`, `confirmed`; revisi setelah peninjauan membatalkan konfirmasi sebelumnya sampai dikonfirmasi ulang.
- Laporan: `submitted` → `under_review` → `decision_recorded`.
- Keputusan: `follow_up_required` atau `follow_up_not_required`; alasan wajib. Status `decision_recorded` tidak berarti korban sudah memperoleh penanganan atau kasus selesai.
- Koneksi putus/AI gagal: jelaskan status; berikan opsi manual/coba lagi tanpa mengirim otomatis.
- Submit gagal: pertahankan informasi hanya dalam batas penyimpanan sementara yang disetujui; jangan menampilkan bukti berhasil.
- WhatsApp gagal: laporan tetap ada; antrean mencoba ulang dan PIC dapat melihat kegagalan.
- Petugas tidak tersedia: tampilkan kondisi sebenarnya dan pilihan pengisian manual; akses pertolongan segera tetap terlihat.

## 5. Architecture

### 5.1 Rancangan logis

**Browser pelapor/petugas → aplikasi SvelteKit → layanan domain → PostgreSQL.**

SvelteKit menangani halaman publik, chat, formulir, dan antarmuka petugas. Endpoint server menangani validasi, sesi, otorisasi, jadwal WITA, penyimpanan draf/laporan, dan audit. Kunci AI, WhatsApp, serta database hanya berada di server.

Layanan AI menerima konteks minimum dan mengembalikan pertanyaan/ringkasan terstruktur; tidak mengakses database secara langsung. Worker notifikasi membaca outbox setelah transaksi laporan berhasil dan mengirim pemberitahuan ke PIC yang ditetapkan. Penyimpanan laporan dan pembuatan event outbox dilakukan dalam satu transaksi agar laporan yang tersimpan tidak kehilangan pekerjaan notifikasinya.

Mulai dengan satu aplikasi dan worker sederhana. Tidak perlu memecah layanan menjadi banyak microservice. Pemilihan mekanisme chat langsung—SSE, polling terbatas, atau WebSocket—ditentukan saat kebutuhan operator bersamaan dan platform hosting dikonfirmasi; pergantian mode tetap dikendalikan server.

### 5.2 Batas kepercayaan dan kontrol

- Browser tidak dipercaya menentukan identitas petugas, waktu layanan, status keputusan, atau data yang boleh dibaca.
- Pemeriksaan peran ditambah pembatasan laporan yang ditugaskan; pemisahan admin konfigurasi dan pembaca isi laporan.
- Kiriman model dianggap keluaran tidak tepercaya: validasi, batasi panjang, dan tampilkan sebagai teks aman.
- Lingkungan demo dan produksi memakai database, kunci, akun, serta tujuan notifikasi terpisah. Demo hanya memakai data latihan dan tidak menghubungi PIC nyata.
- Cadangan terenkripsi dan kunci memiliki akses terpisah; prosedur pemulihan, insiden kebocoran, pencabutan akses, dan rollback diuji.
- Pemantauan mencatat kesehatan layanan, kegagalan pekerjaan, dan peristiwa keamanan dengan metadata minimum; tanpa isi pengaduan.

## 6. Database Schema

Skema konseptual; nama kolom dan pemecahan tabel dapat disesuaikan setelah kebijakan data disahkan. `*_enc` berarti data sensitif terenkripsi; waktu memakai tipe berzona waktu. UUID bukan pengganti pemeriksaan akses.

| Tabel | Kolom inti | Aturan utama |
| --- | --- | --- |
| `staff_users` | `id`, `auth_subject`, `display_name`, `active`, `created_at` | Identitas autentikasi dari penyedia yang disetujui; akun nonaktif kehilangan akses |
| `roles`, `staff_roles` | `role_id`, `staff_id`, `scope` | Peran operator, pengambil keputusan, PIC, admin, auditor; kombinasi ditetapkan tertulis |
| `service_schedules` | `id`, `weekday`, `opens_at`, `closes_at`, `timezone`, `effective_from` | Zona `Asia/Makassar`; perubahan diaudit |
| `schedule_exceptions` | `id`, `date`, `is_closed`, `opens_at`, `closes_at`, `reason` | Untuk libur/perubahan resmi setelah kebijakan ditetapkan |
| `chat_sessions` | `id`, `session_secret_hash`, `mode`, `status`, `assigned_staff_id`, `expires_at` | Rahasia sesi tidak disimpan mentah; peralihan mode tercatat |
| `chat_messages` | `id`, `session_id`, `sender_type`, `body_enc`, `created_at` | Retensi transkrip terpisah; tidak otomatis disimpan selamanya |
| `report_drafts` | `id`, `session_id`, `version`, `content_enc`, `status`, `expires_at` | Versi eksplisit; konfirmasi merujuk versi yang tepat |
| `reporter_details` | `id`, `name_enc`, `relationship_enc`, `safe_contact_allowed`, `contact_enc`, `contact_preferences_enc` | Terbentuk sesuai data minimum yang disepakati; kontak boleh kosong jika tidak aman |
| `reports` | `id`, `reference_code`, `reporter_id`, `source_session_id`, `confirmed_draft_version`, `content_enc`, `status`, `submitted_at`, `idempotency_key` | `idempotency_key` unik; laporan merujuk isi yang benar-benar dikonfirmasi |
| `privacy_acknowledgements` | `id`, `session_id`, `report_id`, `notice_version`, `acknowledged_at`, `purpose` | Bukti pemberitahuan, bukan klaim otomatis dasar hukum; ikatan dengan laporan saat submit |
| `report_assignments` | `id`, `report_id`, `staff_id`, `assigned_by`, `assigned_at`, `revoked_at` | Mengendalikan cakupan akses; histori tidak ditimpa |
| `report_reviews` | `id`, `report_id`, `reviewer_id`, `notes_enc`, `created_at` | Catatan petugas terpisah dari pernyataan pelapor |
| `report_decisions` | `id`, `report_id`, `decision`, `reason_enc`, `decided_by`, `decided_at`, `supersedes_id` | Dua nilai keputusan; alasan wajib; koreksi membuat versi baru |
| `notification_outbox` | `id`, `report_id`, `recipient_staff_id`, `event_type`, `status`, `attempts`, `next_attempt_at`, `provider_ref` | Payload generik; retry terbatas dan deduplikasi; tanpa isi pengaduan |
| `audit_events` | `id`, `actor_type`, `actor_id`, `action`, `object_type`, `object_id`, `occurred_at`, `request_id`, `metadata_minimal` | Append-only; catat akses baca, perubahan, dan kegagalan otorisasi tanpa isi sensitif |
| `education_content` | `id`, `slug`, `version`, `body`, `source_refs`, `approved_by`, `approved_at`, `published_at` | Hanya materi yang disahkan yang ditayangkan/dipakai AI |

Relasi pokok: sesi memiliki banyak pesan dan versi draf; laporan merujuk satu versi draf terkonfirmasi dan satu himpunan data pelapor; laporan memiliki banyak penugasan, catatan pemeriksaan, dan versi keputusan. Pada satu waktu hanya satu keputusan yang berlaku. Laporan pertama kali disimpan bersama bukti konfirmasi dan outbox dalam transaksi yang sama.

Penghapusan mengikuti kebijakan per jenis data, bukan cascade sembarang. Skema final harus mendukung berakhirnya retensi data, histori keputusan, dan kebutuhan audit tanpa mempertahankan identitas lebih lama daripada yang disahkan. Detail ini belum merupakan kebijakan retensi final.

## 7. Tech Stack

| Bagian | Pilihan/usulan | Status |
| --- | --- | --- |
| Framework | **SvelteKit** dengan TypeScript | Disepakati pengguna |
| Antarmuka | Komponen Svelte, HTML semantik, CSS dengan token palet poster | Usulan; desain ditinjau pada tahap Frontend |
| Server | SvelteKit server routes/actions pada runtime Node.js yang didukung | Usulan; versi dipatok saat implementasi |
| Database | PostgreSQL | Usulan; penyedia/lokasi belum dipilih |
| Akses database | Drizzle ORM dan migrasi terkontrol | Usulan, dapat disederhanakan sesuai tim |
| Validasi | Skema TypeScript di server, misalnya Zod | Usulan |
| Login petugas | Penyedia autentikasi yang mendukung MFA dan pencabutan sesi | Belum dipilih; tidak membangun autentikasi sensitif dari nol |
| AI | Model API melalui gateway server dan keluaran terstruktur | Penyedia/model belum dipilih; perlu penelaahan privasi dan uji keselamatan |
| WhatsApp | WhatsApp Business Platform melalui kanal resmi yang disetujui | Nomor, akun, penyedia, dan template belum ditetapkan |
| Notifikasi | Outbox PostgreSQL dan worker dengan retry/deduplikasi | Usulan MVP |
| Pengujian | Vitest untuk logika penting; Playwright untuk alur menyeluruh; pengujian aksesibilitas dan keamanan | Dilaksanakan sesuai tahap; data latihan |
| Hosting | Lingkungan terkelola yang mendukung SvelteKit, worker, PostgreSQL, enkripsi, dan cadangan | Belum dipilih; keputusan bergantung tata kelola, lokasi data, biaya, dan pengelola |
| Operasional | Secrets manager, pemantauan tanpa data pribadi, backup terenkripsi, prosedur rollback | Persyaratan; produk spesifik belum dipilih |

### Keputusan yang perlu ditutup pada akhir Planning

1. Lengkapi PDF, Word, PPT, dan sumber resmi; cocokkan istilah, peran, SOP, jenis layanan, serta dasar hukum. Tetapkan dokumen yang menjadi acuan bila sumber berbeda.
2. Sahkan data pribadi minimum: nama lengkap atau nama yang digunakan; hubungan dengan korban; serta penerimaan laporan tanpa kontak aman. Tetapkan kebijakan anak dan kebutuhan akun/OTP. Khusus NIK: putuskan apakah data ini benar-benar diperlukan untuk tindak lanjut; bila ya, tetapkan dasar pemrosesan, peran bidan/PIC, audit akses, retensi, aturan export, dan mekanisme penghapusan.
3. Tentukan siapa yang boleh membaca, menugaskan, mencatat keputusan, mengubah keputusan, mengaudit, dan mengelola konfigurasi; sahkan SOP petugas serta penanganan ketidaktersediaan/serah terima.
4. Verifikasi kontak pertolongan segera, PIC WhatsApp, domain/QR, hari libur, serta bahasa mengenai waktu respons dan pemberitahuan hasil kepada pelapor.
5. Sahkan dasar pemrosesan, isi pemberitahuan privasi, retensi termasuk draf/transkrip/cadangan, pengelolaan kunci, penyedia AI/hosting/WhatsApp, dan pihak yang menyetujui layanan nyata.

**Langkah berikutnya:** bahas dan revisi PRD ini setelah sumber tersedia; tetapkan versi 1.0 yang disetujui sebelum memulai coding Frontend. Lingkungan berikutnya tetap memakai data latihan sampai izin operasional terpisah diberikan.
