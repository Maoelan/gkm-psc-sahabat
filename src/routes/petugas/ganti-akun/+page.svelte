<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Beralih ke rekap | LAPOR AMAN</title>
</svelte:head>

<div class="switch-page">
	<section class="switch-card" aria-labelledby="switch-title">
		<p class="step-kicker">Akses rekap</p>
		<h1 id="switch-title">Beralih ke akun admin</h1>
		<p class="switch-lead">
			Anda masuk sebagai <strong>{data.staff.displayName}</strong>. Halaman rekap memuat NIK dan
			hanya dapat dibuka akun dengan peran admin. Sesi petugas akan diakhiri sebelum Anda masuk dengan akun
			admin.
		</p>

		<div class="switch-notice">
			<strong>Perhatian.</strong>
			<p>
				Jika Anda sedang menangani percakapan langsung, percakapan itu kembali ke antrean petugas
				agar dapat diambil petugas lain.
			</p>
		</div>

		{#if form?.message}
			<p class="form-error" role="alert">{form.message}</p>
		{/if}

		<form method="POST" action="?/switchAccount" class="switch-actions">
			<input type="hidden" name="csrfToken" value={data.csrfToken} />
			<button class="button-primary" type="submit">Keluar dan masuk sebagai admin</button>
			<a class="button-secondary" href="/petugas">Kembali ke meja petugas</a>
		</form>

		<p class="switch-footnote">
			Gunakan akun berwenang yang diberikan pengelola layanan. Jangan membagikan kata sandi atau
			membiarkan perangkat tanpa pengawasan.
		</p>
	</section>
</div>

<style>
	.switch-page {
		display: grid;
		align-content: center;
		min-height: calc(100svh - 150px);
		padding: 40px 24px 72px;
		background: var(--ground);
	}
	.switch-card {
		width: min(680px, 100%);
		margin: 0 auto;
		padding: 36px;
		border: 1px solid var(--border);
		border-top: 4px solid var(--magenta);
		background: #fff;
	}
	.step-kicker {
		margin: 0 0 8px;
		color: var(--teal-dark);
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.7rem, 3vw, 2rem);
		line-height: 1.08;
		letter-spacing: -0.03em;
	}
	.switch-lead {
		max-width: 58ch;
		margin: 14px 0 0;
		color: var(--muted);
	}
	.switch-notice {
		margin-top: 22px;
		padding: 15px 17px;
		border-left: 4px solid #d4a72c;
		background: var(--attention);
		color: #493a0b;
		font-size: 0.9rem;
	}
	.switch-notice p {
		margin: 4px 0 0;
	}
	.form-error {
		margin: 16px 0 0;
		color: var(--danger);
		font-weight: 800;
	}
	.switch-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 24px;
	}
	.switch-actions .button-primary,
	.switch-actions .button-secondary {
		min-height: 48px;
	}
	.switch-footnote {
		margin: 22px 0 0;
		padding-top: 16px;
		border-top: 1px solid var(--rule);
		color: var(--muted);
		font-size: 0.84rem;
	}
	@media (max-width: 540px) {
		.switch-page {
			padding: 24px 16px 56px;
		}
		.switch-card {
			padding: 24px 20px;
		}
		.switch-actions {
			flex-direction: column;
		}
		.switch-actions .button-primary,
		.switch-actions .button-secondary {
			width: 100%;
		}
	}
</style>
