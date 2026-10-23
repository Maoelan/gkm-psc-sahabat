<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let showPassword = $state(false);
	// svelte-ignore state_referenced_locally
	let username = $state(form?.username ?? '');
	let password = $state('');
</script>

<svelte:head>
	<title>Masuk petugas | Lapor Aman - PSC Sahabat</title>
</svelte:head>

<div class="login-page">
	<section class="login-card" aria-labelledby="login-title">
		<div class="login-main">
			<h1 id="login-title">Masuk petugas</h1>
			<p class="login-lead">
				Gunakan akun petugas yang terdaftar. Jangan bagikan kata sandi atau tautan sesi kepada orang
				lain.
			</p>

			{#if data.switched}
				<div class="login-switch-note" role="status">
					<strong>Sesi petugas sudah diakhiri.</strong>
					<p>Masuk dengan akun berwenang untuk membuka rekap.</p>
				</div>
			{/if}

			<div class="login-notice">
				<strong>
					{data.next === '/admin/nik'
						? 'Halaman NIK hanya untuk akun admin.'
						: data.next === '/rekap'
							? 'Rekap hanya untuk akun berwenang.'
							: 'Akses terbatas.'}
				</strong>
				<p>
					{data.next === '/admin/nik'
						? 'Masuk dengan akun yang memiliki peran admin. Setiap pembukaan halaman NIK tercatat dalam audit.'
						: data.next === '/rekap'
							? 'Akun tanpa peran admin tidak dapat membuka halaman rekap atau NIK. Masuk dengan akun yang diberikan admin layanan.'
							: 'NIK hanya dapat dibuka oleh akun dengan peran admin dan setiap pembukaan tercatat dalam audit.'}
				</p>
			</div>

			{#if form?.message}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}

			<form method="POST" action="?/login" class="login-form">
				<input type="hidden" name="next" value={data.next} />
				<div class="field">
					<label for="username">Nama pengguna</label>
					<input
						id="username"
						name="username"
						autocomplete="username"
						required
						maxlength="80"
						bind:value={username}
					/>
				</div>
				<div class="field">
					<label for="password">Kata sandi</label>
					<input
						id="password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						bind:value={password}
						autocomplete="current-password"
						required
						maxlength="200"
					/>
				</div>
				<label class="password-toggle"><input type="checkbox" bind:checked={showPassword} /> Tampilkan kata sandi</label>
				<button class="button-primary login-button" type="submit">Masuk</button>
			</form>

			<p class="account-note">
				Akun dikelola oleh admin layanan. Hubungi admin jika Anda belum memiliki akses.
			</p>
			<a class="back-link" href="/">Kembali ke portal publik</a>
		</div>

		<aside class="login-side" aria-label="Panduan ruang kerja">
			<h2>Mulai dari pekerjaan Anda</h2>
			<ol class="login-jobs"><li><strong>Laporan masuk</strong><p>Baca cerita pelapor, catat pemeriksaan, lalu simpan keputusan.</p></li><li><strong>Percakapan langsung</strong><p>Bantu pelapor yang sedang menyiapkan laporan.</p></li><li><strong>Rekap dan identitas</strong><p>Buka hasil pemeriksaan atau data NIK sesuai akses akun Anda.</p></li></ol>
			<p class="side-note">Gunakan perangkat kerja. Keluar dari akun setelah selesai, terutama jika perangkat digunakan bersama.</p>
		</aside>
	</section>
</div>

<style>
	.login-page {
		display: grid;
		align-content: center;
		min-height: calc(100svh - 150px);
		padding: 40px 24px 72px;
		background: var(--ground);
	}
	.login-card {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
		width: min(980px, 100%);
		margin: 0 auto;
		border: 1px solid var(--border);
		border-top: 4px solid var(--navy);
		background: #fff;
	}
	.login-main { padding: 38px; }

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.7rem, 3vw, 2rem);
		line-height: 1.08;
		letter-spacing: -0.03em;
	}
	.login-lead { max-width: 60ch; margin: 14px 0 0; color: var(--muted); }
	.login-notice {
		margin-top: 22px;
		padding: 15px 17px;
		border-left: 1px solid #d4a72c;
		background: var(--attention);
		color: #493a0b;
		font-size: 0.9rem;
	}
	.login-notice p { margin: 4px 0 0; }
	.login-switch-note {
		margin-top: 22px;
		padding: 15px 17px;
		border-left: 1px solid var(--teal);
		background: var(--surface-teal);
		color: #214f4e;
		font-size: 0.9rem;
	}
	.login-switch-note p { margin: 4px 0 0; }
	.login-form { display: grid; gap: 16px; margin-top: 24px; }
	.field { display: grid; gap: 7px; margin-top: 0; }
	.field label { font-size: 0.9rem; font-weight: 800; }
	.field input {
		width: 100%;
		min-height: 48px;
		padding: 11px 13px;
		border: 1px solid #849ba4;
		border-radius: var(--radius-control);
		background: #fff;
		color: var(--ink);
	}
	.login-button { min-height: 50px; margin-top: 2px; }
	.form-error { margin: 14px 0 0; color: var(--danger); font-weight: 800; }
	.account-note {
		margin: 18px 0 0;
		padding-top: 14px;
		border-top: 1px solid var(--rule);
		color: var(--muted);
		font-size: 0.82rem;
	}
	.back-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: 8px;
		color: var(--teal-dark);
		font-size: 0.84rem;
		font-weight: 800;
	}
	.login-side {
		padding: 38px 30px;
		border-left: 1px solid var(--border);
		background: var(--surface-teal);
	}

	.login-side h2 { margin: 0; font-family: var(--font-display); font-size: 1.45rem; line-height: 1.15; }

	.side-note {
		margin: 22px 0 0;
		padding-top: 14px;
		border-top: 1px solid #b8d4d0;
		color: #355d62;
		font-size: 0.84rem;
	}
	@media (max-width: 860px) {
		.login-card { grid-template-columns: 1fr; }
		.login-side { border-top: 1px solid var(--border); border-left: 0; }
	}
	@media (max-width: 520px) {
		.login-page { padding: 24px 16px 56px; }
		.login-main, .login-side { padding: 24px 20px; }
	}

	.login-page { min-height:calc(100svh - 190px); }
	.login-card { border-top-width:1px; border-radius:16px; overflow:clip; }
	.login-main h1 { font-size:1.8rem; }
	.login-side { background:var(--surface); }
	.login-side h2 { font-size:1.2rem; }
	.login-jobs { display:grid; gap:24px; padding-left:20px; margin-top:28px; }
	.login-jobs li { padding-left:8px; }
	.login-jobs p { margin:6px 0 0; color:var(--muted); font-size:.9rem; }
	.password-toggle { display:flex; align-items:center; gap:10px; min-height:44px; font-size:.9rem; }
	.password-toggle input { width:18px; height:18px; accent-color:var(--teal); }
</style>
