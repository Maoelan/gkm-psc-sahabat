<script lang="ts">
	const schedule = [
		['Senin - Kamis', '08.00 - 14.00 WITA'],
		['Jumat', '08.00 - 11.00 WITA'],
		['Sabtu', '08.00 - 12.30 WITA'],
		['Minggu', 'Tidak ada petugas']
	];

	const steps = [
		{
			title: 'Mulai dengan aman',
			text: 'Baca info privasi, lalu tentukan nama panggilan dan hubungan Anda dengan korban.'
		},
		{
			title: 'Ceritakan satu per satu',
			text: 'Tulis cerita inti, lalu jawab pertanyaan singkat. Detail yang belum diketahui boleh dilewati.'
		},
		{
			title: 'Periksa lalu kirim',
			text: 'Perbaiki draf dan pilih preferensi kontak. Kode terbit setelah laporan tersimpan.'
		}
	];
</script>

<svelte:head>
	<title>LAPOR AMAN | Pengaduan UPT Puskesmas Suranadi</title>
</svelte:head>

<section class="home-hero">
	<div class="home-hero-inner">
		<div class="hero-copy">
			<h1>Lapor dengan aman.</h1>
			<p class="hero-lead">
				LAPOR AMAN membantu Anda menyiapkan pengaduan kekerasan terhadap perempuan dan anak.
				Anda menentukan informasi apa yang siap ditulis dan dikirim.
			</p>
			<div class="hero-actions">
				<a class="button-primary" href="/chat">Mulai Chat Pengaduan</a>
				<a class="button-secondary" href="/panduan">Pelajari caranya</a>
			</div>
			<ul class="reassurance-list" aria-label="Hal penting sebelum memulai">
				<li>Boleh melewati detail yang belum diketahui</li>
				<li>Draf dapat diperiksa sebelum dikirim</li>
				<li>Anda dapat berhenti atau keluar cepat kapan saja</li>
			</ul>
		</div>

		<div class="hero-guide">
			<div class="hero-guide-copy">
				<h2>Cerita inti sudah cukup.</h2>
				<p>Anda tidak harus menyiapkan semua jawaban sebelum memulai.</p>
			</div>
			<img
				class="hero-companion"
				src="/illustrations/lapor-aman-perempuan-anak.png"
				alt="Ilustrasi perempuan dan anak yang saling mendampingi"
				width="1024"
				height="1536"
				fetchpriority="high"
			/>
		</div>
	</div>
</section>

<section class="service-section" aria-labelledby="schedule-title">
	<div class="section-shell service-grid">
		<div class="service-intro">
			<h2 id="schedule-title">Kapan petugas tersedia?</h2>
			<p>
				Jam buka tidak menjamin petugas sedang bebas. Di luar jam layanan, Anda tetap dapat
				menyiapkan draf secara mandiri.
			</p>
		</div>
		<ul class="schedule">
			{#each schedule as row}
				<li><span>{row[0]}</span><strong>{row[1]}</strong></li>
			{/each}
		</ul>
		<p class="schedule-note">Di luar jam layanan, panduan aplikasi membantu Anda menyiapkan draf. Laporan tetap masuk ke antrean petugas setelah dikirim.</p>
	</div>
</section>

<section class="section-shell process-section" aria-labelledby="process-title">
	<div class="section-heading">
		<h2 id="process-title">Tiga tahap yang mudah diikuti</h2>
		<p>Tidak ada laporan resmi sebelum Anda membaca dan mengonfirmasi draf.</p>
	</div>
	<ol class="process-list">
		{#each steps as item, index}
			<li>
				<span class="step-number" aria-hidden="true">{index + 1}</span>
				<div><h3>{item.title}</h3><p>{item.text}</p></div>
			</li>
		{/each}
	</ol>
</section>

<section class="home-boundary">
	<div class="section-shell boundary-grid">
		<div>
			<h2>Aplikasi mencatat. Petugas menangani.</h2>
			<p>
				Penanganan, pendampingan, pengobatan, rehabilitasi, dan rujukan berlangsung di luar aplikasi
				sesuai prosedur layanan.
			</p>
		</div>
		<div class="boundary-notes">
			<div class="safety-panel">
				<strong>Butuh pertolongan segera?</strong>
				<p>Hubungi layanan darurat atau orang tepercaya di sekitar Anda. Jangan menunggu balasan aplikasi jika Anda berada dalam bahaya.</p>
			</div>
			<div class="plain-note">
				<strong>AI bukan petugas.</strong>
				<p>AI membantu menanggapi pertanyaan alur, menanyakan satu bagian pelengkap, dan menyusun draf. AI tidak mengambil keputusan.</p>
			</div>
		</div>
	</div>
</section>
