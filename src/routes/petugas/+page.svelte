<script lang="ts">
	import { tick } from 'svelte';
	import {
		decisionLabel as labelForDecision,
		formatReportDate,
		type Decision,
		type OfficerReport,
		type TranscriptMessage
	} from '../../lib/reports';
	import type { PageProps } from './$types';

	type ViewState = 'ready' | 'empty' | 'error';

	let { data }: PageProps = $props();
	// Antrean awal dari server; perubahan berikutnya berasal dari aksi di halaman ini.
	// svelte-ignore state_referenced_locally
	let reports = $state<OfficerReport[]>(data.reports);
	// svelte-ignore state_referenced_locally
	let selectedId = $state(data.reports[0]?.id ?? '');
	// svelte-ignore state_referenced_locally
	let viewState = $state<ViewState>(
		data.loadError ? 'error' : data.reports.length ? 'ready' : 'empty'
	);
	let search = $state('');
	let queueFilter = $state<'all' | 'open' | 'under_review' | 'decision_recorded'>('all');
	let filteredReports = $derived(reports.filter((report) => {
		const matchesStatus = queueFilter === 'all' || (queueFilter === 'open' ? !report.decision : report.status === queueFilter);
		const query = search.trim().toLocaleLowerCase('id');
		return matchesStatus && (!query || [report.id, report.victimName, report.need, report.location].some((value) => value.toLocaleLowerCase('id').includes(query)));
	}));
	let openCount = $derived(reports.filter((report) => !report.decision).length);
	$effect(() => {
		if (filteredReports.length && !filteredReports.some((report) => report.id === selectedId)) {
			selectedId = filteredReports[0].id;
			decision = filteredReports[0].decision ?? '';
			reason = filteredReports[0].reason ?? '';
			reviewNotes = ''; message = ''; reviewMessage = '';
			transcriptOpen = false; transcriptMessages = []; transcriptError = '';
		}
	});
	let decision = $state<Decision | ''>('');
	let reason = $state('');
	let reviewNotes = $state('');
	let message = $state('');
	let reviewMessage = $state('');
	let busy = $state(false);
	let detailsOpen = $state(false);
	let detailHeading = $state<HTMLElement>();
	let detailPanel = $state<HTMLElement>();
	let transcriptOpen = $state(false);
	let transcriptLoading = $state(false);
	let transcriptError = $state('');
	let transcriptMessages = $state<TranscriptMessage[]>([]);

	let selected = $derived(filteredReports.find((report) => report.id === selectedId));
	let decisionRecorded = $derived(Boolean(selected?.decision));

	function replaceReport(updated: OfficerReport) {
		reports = reports.map((report) => (report.id === updated.id ? updated : report));
	}

	async function postStaff(path: string, body: Record<string, unknown>) {
		const response = await fetch(path, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-csrf-token': data.csrfToken
			},
			body: JSON.stringify(body)
		});
		const payload = (await response.json().catch(() => ({}))) as { error?: string };
		if (!response.ok) throw new Error(payload.error || 'Permintaan tidak dapat diproses.');
		return payload;
	}

	function selectReport(id: string) {
		const report = reports.find((item) => item.id === id);
		if (!report) return;
		selectedId = id;
		detailsOpen = true;
		decision = report.decision ?? '';
		reason = report.reason ?? '';
		reviewNotes = '';
		message = '';
		reviewMessage = '';
		transcriptOpen = false;
		transcriptError = '';
		transcriptMessages = [];
		if (window.matchMedia('(max-width: 860px)').matches) {
			void tick().then(() => {
				detailHeading?.focus({ preventScroll: true });
				detailPanel?.scrollIntoView({ block: 'start' });
			});
		}
	}

	async function saveReviewNote() {
		reviewMessage = '';
		if (!selected || reviewNotes.trim().length < 3) {
			reviewMessage = 'Tulis catatan pemeriksaan sebelum menyimpan.';
			return;
		}
		busy = true;
		try {
			await postStaff(
				`/api/staff/reports/${encodeURIComponent(selected.id)}/reviews`,
				{ notes: reviewNotes.trim() }
			);
			replaceReport({ ...selected, status: 'under_review', statusLabel: 'Sedang diperiksa' });
			reviewNotes = '';
			reviewMessage = 'Catatan pemeriksaan tersimpan.';
		} catch (error) {
			reviewMessage = error instanceof Error ? error.message : 'Catatan belum dapat disimpan.';
		} finally {
			busy = false;
		}
	}

	async function saveDecision() {
		message = '';
		if (!selected || !decision || !reason.trim()) {
			message = 'Pilih keputusan dan isi alasan.';
			return;
		}
		busy = true;
		try {
			const payload = (await postStaff(
				`/api/staff/reports/${encodeURIComponent(selected.id)}/decision`,
				{ decision, reason: reason.trim() }
			)) as { decision?: Decision; reason?: string; decidedAt?: string };
			replaceReport({
				...selected,
				status: 'decision_recorded',
				statusLabel: 'Keputusan tercatat',
				decision: payload.decision ?? decision,
				reason: payload.reason ?? reason.trim(),
				decidedAt: payload.decidedAt
			});
			message = 'Keputusan tersimpan.';
		} catch (error) {
			message = error instanceof Error ? error.message : 'Keputusan belum dapat disimpan.';
		} finally {
			busy = false;
		}
	}

	function transcriptLabel(message: TranscriptMessage) {
		if (message.source === 'user') return 'Pelapor';
		if (message.source === 'staff') return 'Petugas LAPOR AMAN';
		if (message.source === 'handoff') return 'LAPOR AMAN';
		if (message.source === 'ai') return 'Asisten AI';
		return 'Panduan LAPOR AMAN';
	}

	async function loadTranscript() {
		if (!selected) return;
		transcriptOpen = true;
		transcriptLoading = true;
		transcriptError = '';
		try {
			const response = await fetch(
				`/api/staff/reports/${encodeURIComponent(selected.id)}/chat`,
				{ headers: { Accept: 'application/json' } }
			);
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				messages?: TranscriptMessage[];
			};
			if (!response.ok) throw new Error(payload.error || 'Riwayat percakapan tidak dapat dimuat.');
			transcriptMessages = Array.isArray(payload.messages) ? payload.messages : [];
		} catch (error) {
			transcriptError =
				error instanceof Error ? error.message : 'Riwayat percakapan tidak dapat dimuat.';
			transcriptMessages = [];
		} finally {
			transcriptLoading = false;
		}
	}

	function hideTranscript() {
		transcriptOpen = false;
		transcriptMessages = [];
		transcriptError = '';
	}
</script>

<svelte:head>
	<title>Meja petugas | LAPOR AMAN</title>
</svelte:head>

<div class="staff-page">
	<section class="staff-workspace" id="antrean">
		<header class="staff-title">
			<div>
				<h1>Laporan masuk</h1>
				<p>{viewState === 'error' ? 'Daftar laporan belum dapat dimuat.' : reports.length === 0 ? 'Belum ada laporan yang masuk.' : openCount ? `${openCount} laporan belum memiliki keputusan. Pilih laporan untuk memeriksa cerita dan mencatat hasilnya.` : 'Semua laporan sudah memiliki keputusan. Anda dapat membuka laporan untuk melihat hasil pemeriksaan.'}
				</p>
			</div>
			<div class="staff-title-actions"><a class="button-secondary" href="/petugas/percakapan">Buka percakapan langsung</a></div>
		</header>

		<div class="work-instructions" aria-label="Cara memeriksa laporan"><span><b>1</b> Baca cerita dan data</span><span><b>2</b> Catat pemeriksaan bila perlu</span><span><b>3</b> Simpan keputusan beserta alasan</span></div>
		<div class="staff-controls"><label class="queue-search">Cari laporan<input type="search" bind:value={search} disabled={busy} oninput={() => (detailsOpen = false)} placeholder="Kode, nama korban, atau lokasi" /></label><label class="queue-filter">Status laporan<select bind:value={queueFilter} disabled={busy} onchange={() => (detailsOpen = false)}><option value="all">Semua laporan</option><option value="open">Belum ada keputusan</option><option value="under_review">Sedang diperiksa</option><option value="decision_recorded">Keputusan tercatat</option></select></label></div>

		{#if viewState === 'empty'}
			<section class="state-panel empty-state">
				<h2>{data.isAdmin ? 'Belum ada laporan' : 'Belum ada laporan dalam penugasan Anda'}</h2>
				<p>
					{data.isAdmin
						? 'Laporan yang dikirim pelapor akan muncul di sini.'
						: 'Daftar akan terisi setelah PIC memberi penugasan yang sesuai.'}
				</p>
			</section>
		{:else if viewState === 'error'}
			<section class="state-panel error-state" role="alert">
				<h2>Daftar laporan tidak dapat dimuat</h2>
				<p>Periksa koneksi database, lalu muat ulang halaman.</p>
				<button class="button-secondary" type="button" onclick={() => location.reload()}
					>Coba lagi</button
				>
			</section>
		{:else}
			<div class="inbox-grid">
				<section class:queue-hidden={detailsOpen} class="report-queue" aria-label="Daftar laporan">
					<div class="queue-heading">
						<div>
							<h2>{data.isAdmin ? 'Semua laporan' : 'Laporan yang ditugaskan'}</h2>
							<span>{filteredReports.length} dari {reports.length} laporan</span>
						</div>
					</div>
					{#each filteredReports as report}
						<button
							class:selected={selectedId === report.id}
							class="queue-row"
							disabled={busy}
							type="button"
							aria-pressed={selectedId === report.id}
							onclick={() => selectReport(report.id)}
						>
							<span class="queue-id">{report.victimName}</span>
							<span class="queue-time">{report.received}</span>
							<span class="queue-person">{report.id} · {report.location}</span>
							<span
								class:recorded={report.status === 'decision_recorded'}
								class="status-chip queue-status">{report.statusLabel}</span
							>
						</button>
					{:else}<div class="queue-empty"><h3>Laporan tidak ditemukan</h3><p>Coba kata lain atau ubah status.</p><button class="button-secondary" type="button" onclick={() => { search = ''; queueFilter = 'all'; }}>Hapus pencarian dan filter</button></div>
					{/each}
				</section>

				{#if selected}
				<article class:details-open={detailsOpen} class="report-detail" aria-labelledby="detail-title" bind:this={detailPanel}>
					<button class="mobile-back" type="button" onclick={() => (detailsOpen = false)}>Kembali ke antrean</button>
					<div class="detail-heading">
						<div><h2 id="detail-title" tabindex="-1" bind:this={detailHeading}>Laporan {selected.id}</h2><p>Diterima {selected.received}</p></div>
						<span class:recorded={selected.status === 'decision_recorded'} class="status-chip"
							>{selected.statusLabel}</span
						>
					</div>

					<section class="detail-section">
						<h3>1. Baca keterangan pelapor</h3>
						<p>{selected.story}</p>
					</section>
					<h3 class="summary-title">Ringkasan yang dikonfirmasi</h3>
					<dl class="detail-facts">
						<div><dt>Nama korban</dt><dd>{selected.victimName}</dd></div>
						<div><dt>Hubungan dengan korban</dt><dd>{selected.relation}</dd></div>
						<div><dt>Waktu kejadian</dt><dd>{selected.time}</dd></div>
						<div><dt>Lokasi umum</dt><dd>{selected.location}</dd></div>
						<div><dt>Mode percakapan</dt><dd>{selected.modeLabel}</dd></div>
						<div><dt>Kebutuhan disampaikan</dt><dd>{selected.need}</dd></div>
						<div><dt>Preferensi kontak</dt><dd>{selected.contact}</dd></div>
						<div><dt>Status laporan</dt><dd>{selected.statusLabel}</dd></div>
					</dl>

					<div class="restricted-note">
						<strong>NIK tidak ditampilkan di daftar laporan.</strong>
						<p>
							NIK lengkap tanpa sensor ada di <a href="/admin/nik">halaman Data NIK khusus admin</a
							>. Pembukaan halaman NIK dicatat dalam audit.
						</p>
					</div>

					<section class="transcript-section" aria-labelledby="transcript-title">
						<div class="transcript-heading">
							<div>
								<h3 id="transcript-title">Riwayat percakapan</h3>
								<p>
									Hanya petugas yang ditugaskan dan admin. Setiap pembukaan riwayat dicatat
									dalam audit.
								</p>
							</div>
							<div class="transcript-actions">
								<button
									class="button-secondary"
									type="button"
									onclick={loadTranscript}
									disabled={transcriptLoading}
								>
									{transcriptLoading
										? 'Memuat...'
										: transcriptOpen
											? 'Muat ulang riwayat'
											: 'Tampilkan riwayat'}
								</button>
								{#if transcriptOpen}
									<button class="link-button" type="button" onclick={hideTranscript}>
										Sembunyikan
									</button>
								{/if}
							</div>
						</div>
						{#if transcriptOpen}
							{#if transcriptLoading}
								<p class="transcript-state" aria-live="polite">Memuat riwayat percakapan...</p>
							{:else if transcriptError}
								<p class="field-error" role="alert">{transcriptError}</p>
							{:else if transcriptMessages.length}
								<ol class="transcript-list">
									{#each transcriptMessages as item (item.id)}
										<li class:from-user={item.source === 'user'}>
											<div class="transcript-meta">
												<strong>{transcriptLabel(item)}</strong>
												{#if item.source === 'fallback'}
													<span class="transcript-source">Panduan terstruktur</span>
												{/if}
												<time datetime={item.createdAt}>{formatReportDate(item.createdAt)}</time>
											</div>
											<p>{item.body}</p>
										</li>
									{/each}
								</ol>
							{:else}
								<p class="transcript-state">Belum ada pesan yang tersimpan untuk laporan ini.</p>
							{/if}
						{/if}
					</section>

					{#if !decisionRecorded}
						<details class="review-note-form"><summary>2. Tambahkan catatan pemeriksaan (bila perlu)</summary>

							<p>Simpan kebutuhan klarifikasi tanpa menetapkan keputusan final.</p>
							<label for="review-notes">Catatan petugas</label>
							<textarea id="review-notes" maxlength="1000" bind:value={reviewNotes} placeholder="Tulis hal yang perlu diperiksa atau diklarifikasi."></textarea>
							{#if reviewMessage}<p
									class:success-message={reviewMessage.startsWith('Catatan')}
									class="field-error"
									role="status">{reviewMessage}</p
								>{/if}
							<button
								class="button-secondary"
								type="button"
								onclick={saveReviewNote}
								disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan catatan'}</button
							>
						</details>
					{/if}

					{#if decisionRecorded}
						<section id="keputusan" class="decision-form recorded-decision" aria-labelledby="recorded-title">
							<div class="decision-heading">
								<h3 id="recorded-title">Keputusan tercatat</h3>
								<p>Alur aplikasi selesai di sini. Setiap perubahan keputusan memerlukan alasan dan jejak audit.</p>
							</div>
							<dl class="recorded-facts">
								<div><dt>Keputusan</dt><dd>{labelForDecision(selected.decision)}</dd></div>
								<div><dt>Alasan</dt><dd>{selected.reason}</dd></div>
							</dl>
						</section>
					{:else}
						<section id="keputusan" class="decision-form">
							<div class="decision-heading">
								<h3>3. Catat keputusan</h3>
								<p>Pilih satu keputusan. Alasan wajib dan tetap terpisah dari keterangan pelapor.</p>
							</div>
							<fieldset>
								<legend class="legend-label">Keputusan</legend>
								<div class="radio-group">
									<label class="radio-card"><input type="radio" bind:group={decision} value="follow_up_required" /> <span><strong>Perlu tindak lanjut</strong></span></label>
									<label class="radio-card"><input type="radio" bind:group={decision} value="follow_up_not_required" /> <span><strong>Tidak perlu tindak lanjut</strong></span></label>
								</div>
							</fieldset>
							<div class="field">
								<label for="reason">Alasan keputusan</label>
								<textarea id="reason" maxlength="1000" autocomplete="off" bind:value={reason} placeholder="Tulis alasan berdasarkan pemeriksaan petugas."></textarea>
							</div>
							{#if message}<p
									class:success-message={message.startsWith('Keputusan')}
									class="field-error"
									role="alert">{message}</p
								>{/if}
							<button
								class="button-primary"
								type="button"
								onclick={saveDecision}
								disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan keputusan'}</button
							>
						</section>
					{/if}
				</article>
				{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	fieldset { border: 0; padding: 0; margin: 0; }
	.staff-page { padding: 40px 24px 72px; background: var(--ground); }
	.staff-workspace { width: min(1280px, 100%); margin: 0 auto; padding: 32px; background: #fff; border: 1px solid var(--border); }
	.staff-title { display: flex; justify-content: space-between; align-items: end; gap: 24px; }
	.staff-title h1 { margin: 4px 0 0; font-family: var(--font-display); font-size: clamp(1.75rem, 2.4vw, 2rem); line-height: 1.15; letter-spacing: -0.03em; }
	.staff-title > div > p:last-child { margin: 10px 0 0; color: var(--muted); }
	.staff-title-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
	.staff-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 20px; margin: 30px 0 20px; }

	.inbox-grid { display: grid; grid-template-columns: 330px minmax(0, 1fr); min-height: 670px; border: 1px solid var(--border); }
	.report-queue { border-right: 1px solid var(--border); background: #fbfcfc; }
	.queue-heading { padding: 20px; border-bottom: 1px solid var(--border); }
	.queue-heading h2 { margin: 0; font-size: 1rem; }
	.queue-heading span { color: var(--muted); font-size: 0.78rem; }
	.queue-row { width: 100%; min-height: 100px; display: grid; grid-template-columns: 1fr auto; gap: 5px 12px; padding: 17px 20px; border: 0; border-bottom: 1px solid var(--rule); background: #fff; color: var(--ink); text-align: left; }
	.queue-row:hover { background: #f2f6f6; }
	.queue-row.selected { border-left: 1px solid var(--teal); background: #e7f2f1; padding-left: 16px; }
	.queue-id { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.queue-time { color: var(--muted); font-size: 0.75rem; text-align: right; }
	.queue-person { grid-column: 1 / -1; font-size: 0.84rem; }

	.queue-status { grid-column: 1 / -1; justify-self: start; }
	.status-chip { width: max-content; align-self: center; padding: 4px 8px; border-radius: 4px; background: #dff0ed; color: #075f5a; font-size: 0.72rem; white-space: nowrap; }
	.status-chip.recorded { background: #e6ebee; color: #294c5e; }
	.report-detail { padding: 30px 34px 52px; overflow: auto; }
	.detail-heading { display: flex; justify-content: space-between; align-items: start; gap: 20px; padding-bottom: 22px; border-bottom: 1px solid var(--border); }
	.detail-heading h2 { margin: 0; font-size: 1.45rem; font-variant-numeric: tabular-nums; }
	.detail-heading p { margin: 3px 0 0; color: var(--muted); font-size: 0.82rem; }
	.detail-heading h2:focus { outline: none; }
	.detail-section { padding: 26px 0 20px; }
	.detail-section h3, .decision-form h3 { margin: 0; font-size: 1.08rem; }
	.detail-section p, .decision-heading > p:last-child { color: var(--muted); }
	.summary-title { margin: 0 0 12px; font-size: 1.08rem; }
	.detail-facts { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--border); }
	.detail-facts div { padding: 15px; border-bottom: 1px solid var(--border); }
	.detail-facts div:nth-child(odd) { border-right: 1px solid var(--border); }
	.detail-facts div:nth-last-child(-n + 2) { border-bottom: 0; }
	.detail-facts dt { color: var(--muted); font-size: 0.76rem; }
	.detail-facts dd { margin: 5px 0 0; font-size: 0.92rem; }
	.restricted-note { margin-top: 20px; padding: 14px 16px; border-left: 1px solid #d4a72c; background: var(--surface); color: var(--muted); font-size: 0.86rem; }
	.restricted-note p { margin: 4px 0 0; }
	.restricted-note a { color: #493a0b; font-weight: 800; }
	.transcript-section { margin-top: 28px; padding: 22px; border: 1px solid var(--border); background: var(--surface); }
	.transcript-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
	.transcript-heading h3 { margin: 0; font-size: 1.08rem; }
	.transcript-heading p { margin: 6px 0 0; color: var(--muted); font-size: 0.84rem; }
	.transcript-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
	.transcript-actions .button-secondary { min-height: 44px; }
	.transcript-list { display: grid; gap: 10px; margin: 18px 0 0; padding: 0; list-style: none; }
	.transcript-list li { width: fit-content; max-width: min(86%, 680px); padding: 11px 13px; border: 1px solid #dbe6e4; border-radius: 4px 12px 12px 12px; background: #fff; }
	.transcript-list li.from-user { justify-self: end; border-color: var(--navy); border-radius: 12px 4px 12px 12px; background: var(--navy); color: #fff; }
	.transcript-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-bottom: 5px; }
	.transcript-meta strong { color: var(--teal-dark); font-size: 0.72rem; }
	.transcript-list li.from-user .transcript-meta strong { color: #a9dbd7; }
	.transcript-meta time { margin-left: auto; color: var(--muted); font-size: 0.68rem; }
	.transcript-list li.from-user .transcript-meta time { color: #c6dfe4; }
	.transcript-source { padding: 1px 6px; border: 1px solid #d9b8c8; border-radius: 999px; color: #8a3d62; font-size: 0.62rem; }
	.transcript-list p { margin: 0; font-size: 0.9rem; overflow-wrap: anywhere; white-space: pre-wrap; }
	.transcript-state { margin: 16px 0 0; color: var(--muted); }
	.decision-form { margin-top: 34px; padding-top: 30px; border-top: 1px solid var(--border); }
	.recorded-facts { display: grid; gap: 1px; margin: 0; border: 1px solid var(--border); background: var(--border); }
	.recorded-facts div { padding: 14px; background: #fff; }
	.recorded-facts dt { color: var(--muted); font-size: 0.76rem; }
	.recorded-facts dd { margin: 4px 0 0; overflow-wrap: anywhere; }
	.review-note-form { margin-top: 28px; padding: 22px; background: var(--surface); }

	.review-note-form > p { margin: 6px 0 16px; color: var(--muted); }
	.review-note-form label { display: block; margin-bottom: 7px; font-size: 0.86rem; font-weight: 800; }
	.review-note-form textarea { width: 100%; min-height: 110px; padding: 12px 14px; border: 1px solid #849ba4; border-radius: var(--radius-control); resize: vertical; }
	.review-note-form .button-secondary { margin-top: 14px; }
	.decision-heading { margin-bottom: 20px; }
	.decision-form .button-primary { margin-top: 20px; }
	.success-message { color: var(--success) !important; }
	.state-panel { min-height: 330px; display: grid; align-content: center; justify-items: center; text-align: center; border: 1px dashed #99adb3; }
	.state-panel h2 { margin: 0; font-size: 1.25rem; }
	.error-state { border-color: #d99599; background: #fff7f7; }
	.error-state .button-secondary { margin-top: 18px; }
	.mobile-back { display: none; }

	@media (max-width: 860px) {
		.staff-page { padding: 24px 16px 56px; }
		.staff-workspace { padding: 24px 20px; }
		.staff-title, .staff-controls { align-items: start; grid-template-columns: 1fr; flex-direction: column; }
		.staff-title-actions { width: 100%; justify-content: flex-start; }
				.staff-title .button-secondary { width: 100%; }

		.inbox-grid { display: block; min-height: 0; }
		.report-queue { border-right: 0; }
		.report-queue.queue-hidden { display: none; }
		.report-detail { display: none; padding: 24px 0 20px; scroll-margin-top: 84px; }
		.report-detail.details-open { display: block; }
		.mobile-back { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 16px; border: 0; background: transparent; color: var(--teal-dark); font-weight: 800; padding: 0; text-decoration: underline; text-underline-offset: 4px; }
		.detail-facts { grid-template-columns: 1fr; }
		.detail-facts div, .detail-facts div:nth-child(odd), .detail-facts div:nth-last-child(-n + 2) { border-right: 0; border-bottom: 1px solid var(--border); }
		.detail-facts div:last-child { border-bottom: 0; }
		.transcript-section { padding: 18px; }
		.transcript-heading { flex-direction: column; }
		.transcript-list li { max-width: 94%; }
	}

	@media (max-width: 540px) {
		.staff-workspace { padding: 22px 16px; }
		.detail-heading { flex-direction: column; }
		.detail-heading .status-chip { align-self: flex-start; }
	}

	.work-instructions { display:flex; flex-wrap:wrap; gap:12px 24px; margin-top:24px; padding:16px 0; border-block:1px solid var(--rule); color:var(--muted); font-size:.82rem; }
	.work-instructions span { display:flex; align-items:center; gap:8px; }
	.work-instructions b { display:grid; place-items:center; width:24px; height:24px; border:1px solid var(--border); border-radius:50%; font-weight:600; }
	.staff-controls { display:grid; grid-template-columns:minmax(200px,1fr) 240px; gap:16px; margin:24px 0; }
	.queue-search,.queue-filter { display:grid; gap:8px; font-size:.85rem; font-weight:650; }
	.queue-search input,.queue-filter select { width:100%; min-height:46px; padding:10px 12px; border:1px solid #97aab2; border-radius:8px; background:#fff; color:var(--ink); }
	.inbox-grid { grid-template-columns:minmax(260px,.75fr) minmax(0,1.5fr); min-height:480px; border-radius:12px; }
	.queue-id { white-space:normal; overflow-wrap:anywhere; }
	.queue-row { grid-template-columns:minmax(0,1fr); gap:7px; padding:18px; }
	.queue-row.selected { border-left-width:1px; padding-left:17px; }
	.queue-time { grid-row:3; text-align:left; font-size:.78rem; }
	.queue-person { color:var(--muted); overflow-wrap:anywhere; }
	.queue-empty { padding:24px 20px; }
	.queue-empty h3 { font-size:1rem; }
	.queue-empty p { font-size:.88rem; color:var(--muted); }
	.report-detail { min-width:0; padding:24px; }
	.detail-heading h2 { font-size:1.15rem; overflow-wrap:anywhere; }
	.detail-heading { flex-wrap:wrap; gap:12px; }
	.detail-section p { color:var(--ink); white-space:pre-wrap; }
	.review-note-form { padding:0; background:transparent; }
	.review-note-form summary { font-size:1rem; }
	.review-note-form textarea { margin-bottom:8px; }
	@media(max-width:860px) { .inbox-grid { min-height:0; } .staff-controls { grid-template-columns:1fr; } .report-detail { padding:24px 16px; } .work-instructions { display:grid; gap:10px; } }
</style>
