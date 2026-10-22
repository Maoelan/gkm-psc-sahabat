<script lang="ts">
	import { formatReportDate } from '../../../lib/reports';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Data NIK lengkap | LAPOR AMAN</title>
</svelte:head>

<div class="nik-page">
	<section class="nik-shell" aria-labelledby="nik-title">
		<header class="nik-header">
			<div>

				<h1 id="nik-title">Data NIK lengkap</h1>
				<p>
					Masuk sebagai <strong>{data.staff.displayName}</strong>. NIK ditampilkan tanpa sensor
					untuk tindak lanjut layanan.
				</p>
			</div>
			<div class="nik-actions">
				<a class="button-secondary" href="/rekap">Kembali ke rekap</a>
				<a class="button-secondary" href="/petugas/percakapan">Percakapan</a>
			</div>
		</header>

		<div class="nik-notice">
			<strong>NIK tanpa sensor.</strong>
			<span>
				Halaman ini memuat identitas korban dan hanya dapat dibuka admin. Setiap pembukaan dicatat. Pastikan layar tidak terlihat orang lain dan gunakan data hanya untuk kebutuhan layanan.
			</span>
		</div>

		{#if data.loadError}
			<section class="nik-empty" role="alert">
				<h2>Data NIK tidak dapat dimuat</h2>
				<p>Periksa koneksi database, lalu muat ulang halaman.</p>
				<button class="button-secondary" type="button" onclick={() => location.reload()}
					>Coba lagi</button
				>
			</section>
		{:else if data.entries.length === 0}
			<section class="nik-empty">
				<h2>Belum ada laporan</h2>
				<p>Data NIK muncul setelah pelapor mengirim laporan.</p>
				<a class="button-secondary" href="/rekap">Kembali ke rekap</a>
			</section>
		{:else}
			<div class="nik-table-card">
				<div class="nik-table-head">
					<div>
						<h2>Daftar NIK</h2>
						<p>NIK ditampilkan penuh. Akses halaman ini tercatat.</p>
					</div>
					<span>{data.entries.length} laporan</span>
				</div>
				<div class="table-scroll">
					<table class="nik-table">
						<caption class="sr-only">Daftar NIK lengkap per laporan</caption>
						<thead>
							<tr>
								<th scope="col">Kode</th>
								<th scope="col">Tanggal masuk</th>
								<th scope="col">Nama korban</th>
								<th scope="col">NIK lengkap</th>
								<th scope="col">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.entries as entry (entry.id)}
								<tr>
									<td data-label="Kode"><span class="nik-code">{entry.id}</span></td>
									<td data-label="Tanggal masuk">{formatReportDate(entry.receivedAt)}</td>
									<td data-label="Nama korban"><strong>{entry.victimName}</strong></td>
									<td data-label="NIK lengkap">
										<code class="nik-value">{entry.nik || 'Tidak diisi'}</code>
									</td>
									<td data-label="Status">
										<span
											class:recorded={entry.status === 'decision_recorded'}
											class="status-chip">{entry.statusLabel}</span
										>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</section>
</div>

<style>
	.nik-page { padding: 40px 24px 72px; background: var(--ground); }
	.nik-shell {
		width: min(1120px, 100%);
		margin: 0 auto;
		padding: 32px;
		border: 1px solid var(--border);
		border-top: 1px solid var(--border);
		background: #fff;
	}

	.nik-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 28px;
	}
	.nik-header > div:first-child { max-width: 760px; }
	.nik-header h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.7rem, 2.6vw, 2rem);
		line-height: 1.08;
		letter-spacing: -0.03em;
	}
	.nik-header p:last-child { margin: 12px 0 0; color: var(--muted); }
	.nik-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
	.nik-notice {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		margin: 24px 0 0;
		padding: 14px 16px;
		border-left: 1px solid #d4a72c;
		background: var(--attention);
		color: #493a0b;
		font-size: 0.88rem;
	}
	.nik-notice strong { flex: 0 0 auto; }
	.nik-table-card { margin-top: 26px; border: 1px solid var(--border); }
	.nik-table-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		padding: 18px 20px;
		border-bottom: 1px solid var(--border);
	}
	.nik-table-head h2 { margin: 0; font-size: 1.08rem; }
	.nik-table-head p { margin: 4px 0 0; color: var(--muted); font-size: 0.84rem; }
	.nik-table-head > span {
		flex: 0 0 auto;
		padding: 4px 8px;
		border-radius: 4px;
		background: var(--surface);
		color: var(--teal-dark);
		font-size: 0.76rem;
		font-weight: 800;
	}
	.table-scroll { position: relative; max-width: 100%; overflow-x: auto; }
	.nik-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 0.9rem; }
	.nik-table th {
		padding: 12px 14px;
		background: var(--surface);
		color: var(--muted);
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		text-align: left;
		white-space: nowrap;
	}
	.nik-table td { padding: 13px 14px; border-bottom: 1px solid var(--rule); vertical-align: top; }
	.nik-table tbody tr:last-child td { border-bottom: 0; }
	.nik-table tbody tr:hover { background: #f5f9f8; }
	.nik-code { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.nik-value {
		display: inline-block;
		padding: 2px 5px;
		background: var(--surface);
		color: var(--ink);
		font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
		font-size: 0.92rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		overflow-wrap: anywhere;
	}
	.status-chip {
		display: inline-flex;
		align-items: center;
		width: max-content;
		padding: 4px 8px;
		border-radius: 4px;
		background: #dff0ed;
		color: #075f5a;
		font-size: 0.72rem;
		white-space: nowrap;
	}
	.status-chip.recorded { background: #e6ebee; color: #294c5e; }
	.nik-empty { margin-top: 26px; padding: 34px 24px; border: 1px dashed #99adb3; text-align: center; }
	.nik-empty h2 { margin: 0; font-size: 1.25rem; }
	.nik-empty p { margin: 6px 0 18px; color: var(--muted); }

	@media (max-width: 1100px) {
		.nik-page { padding: 24px 16px 56px; }
		.nik-shell { padding: 24px 20px; }
		.nik-header { flex-direction: column; }
		.nik-actions { width: 100%; }
		.nik-actions .button-secondary { width: 100%; }
		.nik-table-head { flex-direction: column; }
		.table-scroll { overflow: visible; }
		.nik-table { min-width: 0; }
		.nik-table thead { display: none; }
		.nik-table,
		.nik-table tbody,
		.nik-table tr,
		.nik-table td { display: block; width: 100%; }
		.nik-table tr { padding: 14px 16px; border-bottom: 1px solid var(--border); }
		.nik-table tr:last-child { border-bottom: 0; }
		.nik-table td { padding: 4px 0; border: 0; }
		.nik-table td::before {
			content: attr(data-label) ': ';
			color: var(--muted);
			font-size: 0.78rem;
			font-weight: 700;
		}
	}
</style>
