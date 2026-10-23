<svelte:head><title>Lapor Aman - PSC | Pelaporan UPT Puskesmas Suranadi</title></svelte:head>
<div class="home-page">
 <section class="home-intro" aria-labelledby="home-title">
  <div>
   <h1 id="home-title">Lapor Aman - PSC</h1>
   <p class="home-lead">Laporkan kekerasan yang Anda alami atau ketahui.</p>
   <p>Untuk perempuan dan anak di wilayah kerja UPT Puskesmas Suranadi. Mulai dari cerita yang Anda ingat.</p>
   <a class="button-primary home-start" href="/chat">Mulai buat laporan</a>
   <p class="home-note">Tanpa membuat akun. Periksa laporan sebelum dikirim.</p>
  </div>
  <img class="home-illustration" src="/illustrations/lapor-aman-perempuan-anak.png" alt="Ilustrasi perempuan dan anak yang saling mendampingi" width="1024" height="1536" />
 </section>
 <section class="home-steps" aria-labelledby="home-steps-title">
  <h2 id="home-steps-title">Tiga langkah untuk melapor</h2>
  <ol><li><strong>Ceritakan kejadian</strong><p>Tulis dengan kata-kata sendiri. Asisten membantu melengkapi bagian utama.</p></li><li><strong>Lengkapi jika tahu</strong><p>Data korban boleh kosong. Pilih apakah Anda bersedia dihubungi.</p></li><li><strong>Periksa dan kirim</strong><p>Pastikan isinya sesuai, lalu simpan kode laporan.</p></li></ol>
 </section>
 <nav class="home-help" aria-label="Informasi sebelum melapor"><a href="/panduan">Cara melapor dan privasi</a><a href="/edukasi">Kenali jenis kekerasan</a></nav>
 <details class="home-about"><summary>Tentang PSC SAHABAT dan jam layanan</summary><p>Pengaduan, Pendampingan dan Rujukan Terpadu bagi Perempuan dan Anak Korban Kekerasan.</p><p class="home-motto">“Satu laporan, satu pendamping, satu jalur perlindungan”</p><p>Laporan dapat dikirim kapan saja. Bantuan petugas langsung tersedia pada jam layanan, sesuai ketersediaan petugas.</p><p>Senin–Kamis 08.00–14.00, Jumat 08.00–11.00, Sabtu 08.00–12.30 WITA.</p><p>AI membantu mencatat cerita dan pertanyaan pelengkap. Keputusan dan tindak lanjut dilakukan petugas.</p></details>
 <p class="home-emergency"><strong>Dalam bahaya saat ini?</strong> Hubungi layanan darurat atau orang tepercaya di sekitar Anda. Jangan menunggu balasan aplikasi. <a href="/panduan#bantuan">Panduan keselamatan</a></p>
</div>
<style>
.home-page {
	width: calc(100% - 40px);
	max-width: 1040px;
	margin: auto;
	padding: 32px 0 40px;
}
.home-intro h1 {
	font-size: 2rem;
	letter-spacing: -0.025em;
	margin: 0;
	color: var(--navy);
}
.home-intro p {
	max-width: 52ch;
	color: var(--muted);
	line-height: 1.6;
}
.home-intro .home-lead {
	font-size: 1.35rem;
	color: var(--ink);
	line-height: 1.4;
	margin: 16px 0;
}
.home-start {
	display: flex;
	justify-content: center;
	min-height: 52px;
	margin-top: 24px;
}
.home-intro .home-note {
	font-size: 0.875rem;
	margin: 12px 0 0;
}
.home-illustration {
	display: none;
}
.home-steps {
	margin-top: 36px;
	padding-top: 28px;
	border-top: 1px solid var(--border);
}
h2 {
	font-size: 1.125rem;
	margin: 0 0 20px;
}
ol {
	display: grid;
	gap: 20px;
	list-style: decimal;
	padding-left: 24px;
	margin: 0;
}
li {
	padding-left: 8px;
}
li::marker {
	color: var(--teal-dark);
	font-weight: 700;
}
li p {
	margin: 6px 0 0;
	color: var(--muted);
	font-size: 0.9375rem;
	line-height: 1.55;
}
.home-help {
	display: flex;
	flex-direction: column;
	margin: 24px 0 12px;
	gap: 4px;
}
.home-help a {
	display: flex;
	align-items: center;
	min-height: 48px;
	font-weight: 600;
}
.home-about p {
	max-width: 68ch;
	font-size: 0.9375rem;
	line-height: 1.6;
	color: var(--muted);
}
.home-about .home-motto {
	color: var(--magenta);
}
.home-emergency {
	margin: 28px 0 0;
	padding-top: 20px;
	border-top: 1px solid var(--border);
	font-size: 0.875rem;
	color: var(--muted);
	line-height: 1.6;
}
@media (min-width: 720px) {
	.home-page {
		padding: 48px 0;
	}
	.home-intro {
		display: grid;
		grid-template-columns: 1fr 220px;
		gap: 64px;
		align-items: center;
	}
	.home-intro h1 {
		font-size: 2.5rem;
	}
	.home-illustration {
		display: block;
		width: 220px;
		height: 280px;
		object-fit: contain;
	}
	.home-start {
		display: inline-flex;
		min-width: 220px;
	}
	.home-steps ol {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 40px;
	}
	.home-help {
		flex-direction: row;
		gap: 36px;
	}
}
</style>
