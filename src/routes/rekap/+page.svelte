<script lang="ts">
	import { tick } from 'svelte';
 import ReportProfile from '../../lib/components/ReportProfile.svelte';
 import DeleteReport from '../../lib/components/DeleteReport.svelte';
 import ReportIdentity from '../../lib/components/ReportIdentity.svelte';
	import {
		decisionLabel,
		formatNik,
		formatReportDate,
		maskNik,
		type RecapReport
	} from '../../lib/reports';
	import type { PageProps } from './$types';

	type Filter = 'all' | 'open' | 'follow_up_required' | 'follow_up_not_required';

	let { data }: PageProps = $props();
	let filter = $state<Filter>('all');
	let search = $state('');
	let selectedId = $state('');
	let fullNik = $state('');
	let nikStatus = $state('');
	let exportStatus = $state('');
	let gateHeading = $state<HTMLElement>();
	let dashboardHeading = $state<HTMLElement>();
	let detailHeading = $state<HTMLElement>();
	let busy = $state(false);

	// svelte-ignore state_referenced_locally
	let reports = $state<RecapReport[]>(data.reports);
	let filtered = $derived.by(() => {
		const query = search.trim().toLocaleLowerCase('id');
		const matching = reports.filter((report) => !query || [report.id, report.victimName, report.need].some((value) => value.toLocaleLowerCase('id').includes(query)));
		if (filter === 'open') return matching.filter((report) => !report.decision);
		if (filter === 'follow_up_required') {
			return matching.filter((report) => report.decision === 'follow_up_required');
		}
		if (filter === 'follow_up_not_required') {
			return matching.filter((report) => report.decision === 'follow_up_not_required');
		}
		return matching;
	});
	let summary = $derived.by(() => ({
		total: reports.length,
		open: reports.filter((report) => !report.decision).length,
		followUp: reports.filter((report) => report.decision === 'follow_up_required').length,
		noFollowUp: reports.filter((report) => report.decision === 'follow_up_not_required').length
	}));
	let selected = $derived(filtered.find((report) => report.id === selectedId) ?? null);

	function clearDetail() {
		selectedId = '';
		fullNik = '';
		nikStatus = '';
	}

	async function lock() {
		busy = true;
		try {
			await fetch('/api/staff/logout', {
				method: 'POST',
				headers: { 'x-csrf-token': data.csrfToken ?? '' }
			});
		} finally {
			window.location.assign('/rekap');
		}
	}

	async function selectReport(report: RecapReport) {
		selectedId = report.id;
		fullNik = '';
		nikStatus = '';
		await tick();
		detailHeading?.focus();
	}

	async function toggleNik() {
		nikStatus = '';
		if (fullNik) {
			fullNik = '';
			nikStatus = '';
			return;
		}
		if (!selected?.nikLast4) {
			nikStatus = 'NIK tidak diisi untuk laporan ini.';
			return;
		}
		busy = true;
		try {
			const response = await fetch(
				`/api/staff/reports/${encodeURIComponent(selected.id)}/nik`
			);
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				nik?: string | null;
			};
			if (!response.ok) throw new Error(payload.error || 'NIK tidak dapat dibuka.');
			fullNik = payload.nik ?? '';
			nikStatus = fullNik ? 'NIK dibuka. Akses tercatat dalam audit.' : 'NIK tidak diisi.';
		} catch (error) {
			nikStatus = error instanceof Error ? error.message : 'NIK tidak dapat dibuka.';
		} finally {
			busy = false;
		}
	}

	function prepareExport() {
		exportStatus =
			'Menyiapkan file di server. File memuat sheet Rekap dan Identitas, termasuk NIK.';
	}
</script>

<svelte:head>
	<title>Rekap laporan | LAPOR AMAN</title>
</svelte:head>

<div class="recap-page" class:gate-view={!data.authenticated}>
	{#if !data.authenticated}
		<section class="gate-shell" aria-labelledby="gate-title">
			<div class="gate-main">
				<h1 id="gate-title" tabindex="-1" bind:this={gateHeading}>Rekap laporan</h1>
				<p class="gate-lead">
					Halaman ini hanya terbuka untuk akun berwenang yang sudah masuk. Server memeriksa sesi
					dan peran sebelum mengirim rekap atau membuka NIK.
				</p>
				<div class="gate-notice">
					<strong>NIK hanya untuk tindak lanjut.</strong>
					<p>
						Akses NIK dibatasi untuk akun dengan peran admin dan setiap pembukaan dicatat dalam
						audit. Jangan menyalin atau membagikan NIK tanpa kebutuhan layanan.
					</p>
				</div>
				<div class="gate-actions">
					<a class="button-primary" href="/masuk?next=/rekap">Masuk akun berwenang</a>
					<a class="button-secondary" href="/">Kembali ke portal publik</a>
				</div>
			</div>
			<aside class="gate-side" aria-label="Batas akses">
				<span class="gate-mark" aria-hidden="true"></span>
				<h2>Apa yang bisa dilihat?</h2>
				<ul>
					<li>Rekap status dan keputusan laporan.</li>
					<li>NIK korban pada detail laporan, hanya untuk admin berwenang.</li>
					<li>File .xlsx dengan sheet Rekap dan Identitas.</li>
				</ul>
				<p class="gate-side-note">
					Data ditampilkan langsung dari database LAPOR AMAN dan hanya untuk petugas berwenang.
				</p>
			</aside>
		</section>
	{:else}
		<section class="recap-shell" aria-labelledby="recap-title">
			<header class="recap-header">
				<div>
					<h1 id="recap-title" tabindex="-1" bind:this={dashboardHeading}>Rekap laporan</h1>
					<p>Lihat status dan hasil pemeriksaan laporan. Untuk mencatat keputusan, buka <a href="/petugas">Laporan masuk</a>.
					</p>
				</div>
				<div class="recap-actions">

					<a
						class="button-primary"
						href="/api/staff/recap/export"
						download
						onclick={prepareExport}>Unduh rekap Excel</a
					>
					<button class="button-secondary" type="button" onclick={lock} disabled={busy}
						>{busy ? 'Mengunci...' : 'Keluar & kunci tampilan'}</button
					>
				</div>
			</header>

			<div class="recap-notice">
				<strong>NIK hanya untuk tindak lanjut.</strong>
				<p>
					NIK lengkap dapat dibuka pada detail laporan di halaman ini. NIK dapat
					ditampilkan per laporan di halaman ini dan setiap pembukaan dicatat. File .xlsx dibuat
					server dan memuat NIK di sheet Identitas. Jangan menyimpan atau membagikan file di luar
					kebutuhan layanan.
				</p>
				{#if data.outbox}
					<p class="notification-status">
						Notifikasi: <strong>{data.outbox.pending}</strong> menunggu,
						<strong>{data.outbox.sent}</strong> terkirim, <strong>{data.outbox.failed}</strong>
						gagal. Provider: <code>{data.outbox.provider}</code>.
						{#if data.outbox.provider === 'outbox'}
							Belum ada pengiriman WhatsApp nyata tanpa provider dan nomor tujuan.
						{/if}
					</p>
				{/if}
			</div>

			<div class="summary-grid" aria-label="Ringkasan laporan">
				<article class="summary-card total">
					<p>Total laporan</p>
					<strong>{summary.total}</strong>
					<span>laporan</span>
				</article>
				<article class="summary-card open">
					<p>Belum diputuskan</p>
					<strong>{summary.open}</strong>
					<span>perlu diperiksa</span>
				</article>
				<article class="summary-card follow">
					<p>Perlu tindak lanjut</p>
					<strong>{summary.followUp}</strong>
					<span>keputusan tercatat</span>
				</article>
				<article class="summary-card no-follow">
					<p>Tidak perlu tindak lanjut</p>
					<strong>{summary.noFollowUp}</strong>
					<span>keputusan tercatat</span>
				</article>
			</div>

			<div class="recap-toolbar"><label class="recap-search">Cari laporan<input type="search" bind:value={search} oninput={clearDetail} placeholder="Kode atau nama korban" /></label>
				<label class="filter-control">Tampilkan
					<select bind:value={filter} onchange={clearDetail}>
						<option value="all">Semua laporan</option>
						<option value="open">Belum diputuskan</option>
						<option value="follow_up_required">Perlu tindak lanjut</option>
						<option value="follow_up_not_required">Tidak perlu tindak lanjut</option>
					</select>
				</label>
				<p>{filtered.length} laporan ditampilkan</p>
			</div>

			{#if data.loadError}
				<section class="recap-empty" role="alert">
					<h2>Rekap tidak dapat dimuat</h2>
					<p>Periksa koneksi database, lalu muat ulang halaman.</p>
					<button class="button-secondary" type="button" onclick={() => location.reload()}
						>Coba lagi</button
					>
				</section>
			{:else if reports.length === 0}
				<section class="recap-empty">
					<h2>Belum ada laporan</h2>
					<p>Kirim laporan dari halaman chat untuk melihat laporan masuk ke rekap.</p>
					<a class="button-secondary" href="/chat">Buka chat pengaduan</a>
				</section>
			{:else if filtered.length === 0}
				<section class="recap-empty">
					<h2>Tidak ada laporan pada filter ini</h2>
					<p>Coba kata pencarian lain atau tampilkan semua laporan.</p>
					<button class="button-secondary" type="button" onclick={() => { filter = 'all'; search = ''; }}
						>Tampilkan semua</button
					>
				</section>
			{:else}
				<section class="table-card" aria-labelledby="table-title">
					<div class="table-heading">
						<div>
							<h2 id="table-title">Daftar laporan</h2>
							<p>
								Klik “Lihat detail” untuk membuka data korban. NIK dapat dibuka langsung pada detail laporan ini.
							</p>
						</div>
						<span class="table-count">{filtered.length} laporan</span>
					</div>
					<div class="table-scroll">
						<table class="recap-table">
							<thead>
								<tr>
									<th scope="col">Kode</th>
									<th scope="col">Tanggal masuk</th>
									<th scope="col">Nama korban</th>
									<th scope="col">Kebutuhan</th>
									<th scope="col">Status</th>
									<th scope="col">Keputusan</th>
									<th scope="col"><span class="sr-only">Aksi</span></th>
								</tr>
							</thead>
							<tbody>
								{#each filtered as report (report.id)}
									<tr class:selected={selectedId === report.id}>
										<td data-label="Kode"><span class="report-code">{report.id}</span></td>
										<td data-label="Tanggal masuk">{formatReportDate(report.receivedAt)}</td>
										<td data-label="Nama korban"><strong>{report.victimName}</strong></td>
										<td data-label="Kebutuhan">{report.need}</td>
										<td data-label="Status">
											<span
												class:recorded={report.status === 'decision_recorded'}
												class="status-chip">{report.statusLabel}</span
											>
										</td>
										<td data-label="Keputusan">
											<span class:required={report.decision === 'follow_up_required'} class="decision-text"
												>{decisionLabel(report.decision)}</span
											>
										</td>
										<td class="action-cell" data-label="Aksi">
											<button class="table-action" type="button" onclick={() => selectReport(report)}
												>Lihat detail</button
											>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}

			{#if selected}
				<section class="detail-card" aria-labelledby="detail-title">
					<header class="detail-head">
						<div>
							<h2 id="detail-title" tabindex="-1" bind:this={detailHeading}>Laporan {selected.id}</h2>
							<p>Diterima {formatReportDate(selected.receivedAt)} WITA</p>
						</div>
						<span class:recorded={selected.status === 'decision_recorded'} class="status-chip"
							>{selected.statusLabel}</span
						>
					</header>

					<ReportProfile profile={selected.profile} />
<dl class="detail-facts">
						<div><dt>Nama korban</dt><dd>{selected.victimName}</dd></div>
						<div><dt>Hubungan pelapor</dt><dd>{selected.relation}</dd></div>
						<div><dt>Waktu kejadian</dt><dd>{selected.time}</dd></div>
						<div><dt>Lokasi umum</dt><dd>{selected.location}</dd></div>
						<div><dt>Kebutuhan</dt><dd>{selected.need}</dd></div>
						<div><dt>Preferensi kontak</dt><dd>{selected.contact}</dd></div>
						<div class="nik-fact">
							<dt>NIK korban</dt>
							<dd>
								<span class="nik-value"
									>{fullNik ? formatNik(fullNik) : maskNik(selected.nikLast4)}</span
								>
								{#if selected.nikLast4}
									<button
										class="link-button nik-button"
										type="button"
										aria-pressed={Boolean(fullNik)}
										onclick={toggleNik}
										disabled={busy}
									>
										{fullNik ? 'Sembunyikan NIK' : 'Tampilkan NIK'}
									</button>
								{/if}
								{#if nikStatus}<span class="nik-status" role="status">{nikStatus}</span>{/if}
							</dd>
						</div>
						<div><dt>Keputusan</dt><dd>{decisionLabel(selected.decision)}</dd></div>
					</dl>

					{#if selected.reason}
						<div class="reason-box">
							<strong>Alasan keputusan</strong>
							<p>{selected.reason}</p>
						</div>
					{/if}

					<ReportIdentity id={selected.id} isAdmin={false} contactPreference={selected.contact} />
<DeleteReport id={selected.id} csrfToken={data.csrfToken ?? ''} />
<p class="detail-note">
						Gunakan identitas hanya untuk kebutuhan tindak lanjut layanan. Jangan membagikannya kepada pihak yang tidak berwenang.
					</p>
				</section>
			{/if}

			<p class="export-status" role="status" aria-live="polite">{exportStatus}</p>
			<p class="recap-footnote">
				Data tersimpan di database LAPOR AMAN. Muat ulang halaman untuk mengambil status terbaru
				dari server.
			</p>
		</section>
	{/if}
</div>

<style>
	.recap-page { padding: 40px 24px 72px; background: var(--ground); }
	.recap-page.gate-view { display: grid; align-content: center; min-height: calc(100svh - 150px); }
	.gate-shell,
	.recap-shell { width: min(1280px, 100%); margin: 0 auto; background: #fff; border: 1px solid var(--border); }
	.gate-shell {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
		gap: 0;
		max-width: 980px;
		border-top: 1px solid var(--border);
	}
	.gate-main { padding: 38px; }

	.gate-main h1,
	.recap-header h1,
	.detail-head h2 { margin: 0; font-family: var(--font-display); letter-spacing: -0.03em; line-height: 1.08; }
	.gate-main h1 { font-size: clamp(1.7rem, 3vw, 2rem); }
	.gate-lead { max-width: 62ch; margin: 14px 0 0; color: var(--muted); }
	.gate-main h1[tabindex='-1']:focus,
	.recap-header h1[tabindex='-1']:focus,
	.detail-head h2[tabindex='-1']:focus { outline: none; }
	.gate-notice { margin-top: 24px; padding: 15px 17px; border-left: 1px solid #d4a72c; background: var(--surface); color: var(--muted); font-size: 0.9rem; }
	.gate-notice p { margin: 4px 0 0; }
	.gate-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
	.gate-side { padding: 38px 30px; background: var(--surface-teal); border-left: 1px solid var(--border); }
	.gate-mark { display: block; width: 42px; height: 42px; margin-bottom: 22px; border: 3px solid var(--teal); border-radius: 50%; position: relative; }
	.gate-mark::after { content: ''; position: absolute; inset: 12px; border-radius: 50%; background: var(--teal); }
	.gate-side h2 { margin: 0; font-family: var(--font-display); font-size: 1.45rem; line-height: 1.15; }
	.gate-side ul { display: grid; gap: 9px; margin: 16px 0 0; padding-left: 20px; color: #355d62; }
	.gate-side-note { margin: 22px 0 0; padding-top: 14px; border-top: 1px solid #b8d4d0; color: #355d62; font-size: 0.84rem; }
	.recap-shell { padding: 32px; border-top: 1px solid var(--border); }
	.recap-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 28px; }
	.recap-header > div:first-child { max-width: 760px; }
	.recap-header h1 { margin-top: 4px; font-size: clamp(1.7rem, 2.6vw, 2rem); }
	.recap-header p:last-child { margin: 12px 0 0; color: var(--muted); }
	.recap-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
	.recap-notice { margin: 24px 0 0; padding: 14px 16px; border-left: 1px solid #d4a72c; background: var(--surface); color: var(--muted); font-size: 0.88rem; }
	.recap-notice p { margin: 4px 0 0; }
	.recap-notice .notification-status { margin-top: 10px; padding-top: 8px; border-top: 1px solid #dcc98c; }
	.recap-notice code { padding: 1px 4px; background: rgb(255 255 255 / 55%); font-size: 0.8rem; }
	.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 26px; }
	.summary-card { min-height: 112px; padding: 16px; border: 1px solid var(--border); background: #fff; border-top: 1px solid var(--border); }
	.summary-card p { margin: 0; color: var(--muted); font-size: 0.82rem; font-weight: 750; }
	.summary-card strong { display: block; margin-top: 8px; font-family: var(--font-display); font-size: 1.8rem; line-height: 1; }
	.summary-card span { display: block; margin-top: 5px; color: var(--muted); font-size: 0.75rem; }
	.recap-toolbar { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 30px 0 14px; }
	.filter-control { display: grid; gap: 6px; min-width: 220px; font-size: 0.8rem; font-weight: 800; }
	.filter-control select { min-height: 46px; padding: 0 38px 0 12px; border: 1px solid #8ba0a8; border-radius: var(--radius-control); background: #fff; color: var(--ink); }
	.recap-toolbar > p { margin: 0; color: var(--muted); font-size: 0.82rem; }
	.table-card { border: 1px solid var(--border); }
	.table-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 18px 20px; border-bottom: 1px solid var(--border); }
	.table-heading h2 { margin: 0; font-size: 1.08rem; }
	.table-heading p { margin: 4px 0 0; color: var(--muted); font-size: 0.84rem; }
	.table-count { flex: 0 0 auto; padding: 4px 8px; border-radius: 4px; background: var(--surface); color: var(--teal-dark); font-size: 0.76rem; font-weight: 800; }
	.table-scroll { position: relative; max-width: 100%; overflow-x: auto; }
	.recap-table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: 0.88rem; }
	.recap-table th { padding: 12px 14px; background: var(--surface); color: var(--muted); font-size: 0.8rem; font-weight: 800; letter-spacing: 0.02em; text-align: left; white-space: nowrap; }
	.recap-table td { padding: 13px 14px; border-bottom: 1px solid var(--rule); vertical-align: top; }
	.recap-table tbody tr:last-child td { border-bottom: 0; }
	.recap-table tbody tr:hover { background: #f5f9f8; }
	.recap-table tbody tr.selected { background: #e7f2f1; }
	.report-code { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.status-chip { display: inline-flex; align-items: center; width: max-content; padding: 4px 8px; border-radius: 4px; background: #dff0ed; color: #075f5a; font-size: 0.72rem; white-space: nowrap; }
	.status-chip.recorded { background: #e6ebee; color: #294c5e; }
	.decision-text { color: var(--muted); font-size: 0.82rem; }
	.decision-text.required { color: var(--magenta-dark); font-weight: 800; }
	.table-action { min-height: 40px; padding: 0 12px; border: 1px solid #8da6ad; border-radius: var(--radius-control); background: #fff; color: var(--navy); font-size: 0.8rem; font-weight: 800; white-space: nowrap; }
	.table-action:hover { background: var(--surface); }
	.recap-empty { padding: 34px 24px; border: 1px dashed #99adb3; text-align: center; }
	.recap-empty h2 { margin: 0; font-size: 1.25rem; }
	.recap-empty p { margin: 6px 0 18px; color: var(--muted); }
	.detail-card { margin-top: 26px; padding: 24px; border: 1px solid var(--border); background: #fbfcfc; }
	.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
	.detail-head h2 { margin-top: 2px; font-size: 1.55rem; font-variant-numeric: tabular-nums; }
	.detail-head p:last-child { margin: 4px 0 0; color: var(--muted); font-size: 0.8rem; }
	.detail-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 20px 0 0; border: 1px solid var(--border); background: var(--border); gap: 1px; }
	.detail-facts div { min-height: 78px; padding: 13px 14px; background: #fff; }
	.detail-facts dt { color: var(--muted); font-size: 0.75rem; }
	.detail-facts dd { margin: 5px 0 0; overflow-wrap: anywhere; }
	.nik-value { display: inline-block; min-width: 15ch; font-variant-numeric: tabular-nums; letter-spacing: 0.06em; font-weight: 800; }
	.nik-button { margin-left: 12px; min-height: 36px; font-size: 0.8rem; }
	.nik-status { display: block; margin-top: 6px; color: var(--muted); font-size: 0.78rem; }
	.reason-box { margin-top: 18px; padding: 14px 16px; border-left: 1px solid var(--navy); background: var(--surface); }
	.reason-box strong { font-size: 0.84rem; }
	.reason-box p { margin: 4px 0 0; color: var(--muted); }
	.detail-note { margin: 18px 0 0; color: var(--muted); font-size: 0.82rem; }
	.export-status { min-height: 1.5em; margin: 16px 0 0; color: var(--teal-dark); font-size: 0.84rem; font-weight: 700; }
	.recap-footnote { margin: 8px 0 0; color: var(--muted); font-size: 0.8rem; }

	@media (max-width: 980px) {
		.gate-shell { grid-template-columns: 1fr; }
		.gate-side { border-top: 1px solid var(--border); border-left: 0; }
		.summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}

	@media (max-width: 1100px) {
		.recap-page { padding: 24px 16px 56px; }
		.gate-main,
		.gate-side,
		.recap-shell { padding: 24px 20px; }
		.gate-actions,
		.recap-actions { flex-direction: column; align-items: stretch; }
		.gate-actions .button-primary,
		.gate-actions .button-secondary,
		.recap-actions .button-primary,
		.recap-actions .button-secondary { width: 100%; }
		.recap-header { flex-direction: column; }
		.recap-actions { width: 100%; }
		.recap-toolbar { align-items: stretch; flex-direction: column; gap: 8px; }
		.filter-control { width: 100%; }
		.table-heading { flex-direction: column; }
		.table-scroll { overflow: visible; }
		.recap-table { min-width: 0; }
		.recap-table thead { display: none; }
		.recap-table,
		.recap-table tbody,
		.recap-table tr,
		.recap-table td { display: block; width: 100%; }
		.recap-table tr { padding: 14px 16px; border-bottom: 1px solid var(--border); }
		.recap-table tr:last-child { border-bottom: 0; }
		.recap-table td { padding: 4px 0; border: 0; }
		.recap-table td::before { content: attr(data-label) ': '; color: var(--muted); font-size: 0.78rem; font-weight: 700; }
		.recap-table td.action-cell { padding-top: 10px; }
		.recap-table td.action-cell::before { content: ''; }
		.table-action { width: 100%; }
		.detail-facts { grid-template-columns: 1fr; }
		.detail-head { flex-direction: column; }
		.detail-head .status-chip { align-self: flex-start; }
	}

	@media (max-width: 460px) {
		.summary-grid { grid-template-columns: 1fr; }
		.summary-card { min-height: 108px; }
		.nik-button { display: block; margin: 8px 0 0; }
	}

	.recap-toolbar { flex-wrap:wrap; align-items:end; gap:16px; }
	.recap-search { display:grid; gap:8px; font-size:.85rem; font-weight:650; flex:1; min-width:180px; }
	.recap-search input { min-height:46px; width:100%; padding:10px 12px; border:1px solid #97aab2; border-radius:8px; background:#fff; color:var(--ink); }
	@media(max-width:1100px) {
		.recap-toolbar { align-items:stretch; }
		.recap-search { width:100%; min-width:0; flex:auto; }
	}
</style>
