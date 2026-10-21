<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		handoffStatusCopy,
		handoffStatusLabel,
		isHandoffOpen,
		type ActiveConversation,
		type HandoffQueueItem,
		type HandoffThreadMessage,
		type StaffHandoff
	} from '../../../lib/handoff';
	import { formatReportDate } from '../../../lib/reports';
	import { SERVICE_HOURS_LABEL } from '../../../lib/service-mode';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Nilai awal dari server; pembaruan berikutnya berasal dari polling dan aksi petugas.
	// svelte-ignore state_referenced_locally
	let chats = $state<HandoffQueueItem[]>(data.chats);
	// svelte-ignore state_referenced_locally
	let activeChats = $state<ActiveConversation[]>(data.activeChats);
	// svelte-ignore state_referenced_locally
	let loadError = $state(data.loadError);
	let selectedId = $state('');
	let handoff = $state<StaffHandoff | null>(null);
	let messages = $state<HandoffThreadMessage[]>([]);
	let cursor = $state('');
	let input = $state('');
	let error = $state('');
	let notice = $state('');
	let busy = $state(false);
	let takingOverId = $state('');
	let loadingThread = $state(false);
	let polling = $state(false);
	let detailsOpen = $state(false);
	let pageMounted = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let log = $state<HTMLDivElement>();
	let threadHeading = $state<HTMLHeadingElement>();

	let selected = $derived(chats.find((chat) => chat.id === selectedId) ?? null);
	let waitingCount = $derived(chats.filter((chat) => chat.status === 'waiting').length);
	let activeCount = $derived(chats.filter((chat) => chat.status === 'active').length);
	let canReply = $derived(
		Boolean(handoff?.status === 'active' && (handoff.claimedByMe || data.isAdmin))
	);
	let canClose = $derived(Boolean(handoff?.status === 'active' && (handoff.claimedByMe || data.isAdmin)));

	onMount(() => {
		pageMounted = true;
		timer = setTimeout(poll, 3000);
		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	function prefersReducedMotion() {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	async function scrollToLatest() {
		await tick();
		log?.scrollTo({
			top: log.scrollHeight,
			behavior: prefersReducedMotion() ? 'auto' : 'smooth'
		});
	}

	function relativeTime(value: string | null) {
		if (!value) return 'Waktu tidak tersedia';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
		const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
		if (minutes < 1) return 'Baru saja';
		if (minutes < 60) return `${minutes} menit lalu`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} jam lalu`;
		return formatReportDate(value);
	}

	function messageLabel(message: HandoffThreadMessage) {
		if (message.source === 'user') return 'Pelapor';
		if (message.source === 'staff') return 'Petugas LAPOR AMAN';
		if (message.source === 'handoff') return 'LAPOR AMAN';
		if (message.source === 'ai') return 'Asisten AI';
		return 'Panduan LAPOR AMAN';
	}

	async function staffPost(path: string, body: Record<string, unknown> = {}) {
		const response = await fetch(path, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-csrf-token': data.csrfToken
			},
			body: JSON.stringify(body)
		});
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			code?: string;
			[key: string]: unknown;
		};
		if (!response.ok) {
			const failure = new Error(payload.error || 'Permintaan tidak dapat diproses.');
			(failure as Error & { code?: string }).code = payload.code;
			throw failure;
		}
		return payload;
	}

	async function refreshQueue() {
		try {
			const response = await fetch('/api/staff/chats', { headers: { Accept: 'application/json' } });
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				chats?: HandoffQueueItem[];
				active?: ActiveConversation[];
			};
			if (!response.ok) throw new Error(payload.error || 'Antrean tidak dapat dimuat.');
			chats = Array.isArray(payload.chats) ? payload.chats : [];
			activeChats = Array.isArray(payload.active) ? payload.active : [];
			loadError = false;
		} catch {
			if (!chats.length && !activeChats.length) loadError = true;
		}
	}

	async function loadThread(id = selectedId) {
		if (!id) return;
		loadingThread = true;
		error = '';
		try {
			const response = await fetch(`/api/staff/chats/${encodeURIComponent(id)}`, {
				headers: { Accept: 'application/json' }
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				handoff?: StaffHandoff;
				messages?: HandoffThreadMessage[];
				latestMessageId?: string | null;
			};
			if (!response.ok || !payload.handoff) {
				throw new Error(payload.error || 'Percakapan tidak dapat dimuat.');
			}
			handoff = payload.handoff;
			messages = Array.isArray(payload.messages) ? payload.messages : [];
			cursor = payload.latestMessageId ?? messages.at(-1)?.id ?? '';
			detailsOpen = true;
			await scrollToLatest();
			await tick();
			threadHeading?.focus({ preventScroll: true });
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Percakapan tidak dapat dimuat.';
			handoff = null;
			messages = [];
			cursor = '';
		} finally {
			loadingThread = false;
		}
	}

	async function openChat(chat: HandoffQueueItem) {
		selectedId = chat.id;
		error = '';
		notice = '';
		if (chat.status === 'waiting') {
			handoff = null;
			messages = [];
			cursor = '';
			detailsOpen = true;
			await tick();
			threadHeading?.focus({ preventScroll: true });
			return;
		}
		await loadThread(chat.id);
	}

	async function takeoverChat(chat: ActiveConversation) {
		if (busy) return;
		busy = true;
		takingOverId = chat.sessionId;
		error = '';
		notice = '';
		try {
			const payload = (await staffPost(
				`/api/staff/conversations/${encodeURIComponent(chat.sessionId)}/takeover`
			)) as { handoff?: StaffHandoff };
			if (!payload.handoff) throw new Error('Percakapan belum dapat diambil alih.');
			handoff = payload.handoff;
			selectedId = payload.handoff.id;
			messages = [];
			cursor = '';
			detailsOpen = true;
			notice = 'Percakapan diambil alih. AI dijeda dan pelapor melihat petugas bergabung.';
			await loadThread(selectedId);
			await refreshQueue();
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Percakapan belum dapat diambil alih.';
			await refreshQueue();
		} finally {
			busy = false;
			takingOverId = '';
		}
	}

	async function claimChat() {
		if (!selectedId || busy) return;
		busy = true;
		error = '';
		notice = '';
		try {
			const payload = (await staffPost(`/api/staff/chats/${encodeURIComponent(selectedId)}/claim`)) as {
				handoff?: StaffHandoff;
				message?: HandoffThreadMessage | null;
			};
			if (!payload.handoff) throw new Error('Percakapan belum dapat diambil.');
			handoff = payload.handoff;
			messages = payload.message ? [payload.message] : [];
			cursor = payload.message?.id ?? '';
			notice = 'Percakapan diambil. Anda bisa membalas pelapor.';
			await loadThread(selectedId);
			await refreshQueue();
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Percakapan belum dapat diambil.';
			await refreshQueue();
		} finally {
			busy = false;
		}
	}

	async function appendNewMessages() {
		if (!selectedId || !handoff || !isHandoffOpen(handoff.status)) return;
		const query = cursor ? `?after=${encodeURIComponent(cursor)}` : '';
		const response = await fetch(
			`/api/staff/chats/${encodeURIComponent(selectedId)}/messages${query}`,
			{ headers: { Accept: 'application/json' } }
		);
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			handoff?: StaffHandoff;
			messages?: HandoffThreadMessage[];
			latestMessageId?: string | null;
		};
		if (!response.ok) {
			throw new Error(payload.error || 'Pesan baru tidak dapat dimuat.');
		}
		if (payload.handoff) handoff = payload.handoff;
		const incoming = Array.isArray(payload.messages) ? payload.messages : [];
		const known = new Set(messages.map((message) => message.id));
		const next = incoming.filter((message) => !known.has(message.id));
		if (next.length) {
			messages = [...messages, ...next];
			await scrollToLatest();
		}
		if (payload.latestMessageId) cursor = payload.latestMessageId;
	}

	async function poll() {
		if (polling) return;
		polling = true;
		try {
			await refreshQueue();
			if (handoff && isHandoffOpen(handoff.status) && handoff.status === 'active') {
				await appendNewMessages();
			}
		} catch (caught) {
			if (handoff?.status === 'active') {
				error = caught instanceof Error ? caught.message : 'Pesan baru tidak dapat dimuat.';
			}
		} finally {
			polling = false;
			if (pageMounted) timer = setTimeout(poll, 5000);
		}
	}

	async function sendReply(event?: SubmitEvent) {
		event?.preventDefault();
		if (!selectedId || !canReply || busy) return;
		const value = input.trim();
		if (!value) {
			error = 'Tulis balasan untuk pelapor.';
			return;
		}
		busy = true;
		error = '';
		notice = '';
		try {
			const payload = (await staffPost(
				`/api/staff/chats/${encodeURIComponent(selectedId)}/messages`,
				{ body: value }
			)) as { message?: HandoffThreadMessage };
			if (payload.message) {
				messages = [...messages, payload.message];
				cursor = payload.message.id;
			}
			input = '';
			notice = 'Balasan terkirim ke pelapor.';
			await scrollToLatest();
			await refreshQueue();
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Balasan belum dapat dikirim.';
		} finally {
			busy = false;
		}
	}

	async function closeChat() {
		if (!selectedId || !canClose || busy) return;
		busy = true;
		error = '';
		notice = '';
		try {
			const payload = (await staffPost(
				`/api/staff/chats/${encodeURIComponent(selectedId)}/close`
			)) as { handoff?: StaffHandoff; message?: HandoffThreadMessage | null };
			if (payload.handoff) handoff = payload.handoff;
			if (payload.message) {
				messages = [...messages, payload.message];
				cursor = payload.message.id;
			}
			notice = 'Percakapan ditutup. Pelapor dapat melanjutkan draf.';
			await scrollToLatest();
			await refreshQueue();
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Percakapan belum dapat ditutup.';
		} finally {
			busy = false;
		}
	}

	async function backToQueue() {
		detailsOpen = false;
		selectedId = '';
		handoff = null;
		messages = [];
		cursor = '';
		error = '';
		notice = '';
		await tick();
	}
</script>

<svelte:head>
	<title>Percakapan langsung | LAPOR AMAN</title>
</svelte:head>

<div class="live-page">
	<section class="live-shell">
		<header class="live-title">
			<div>
				<p class="eyebrow">Meja petugas</p>
				<h1>Percakapan langsung</h1>
				<p>
					Masuk sebagai <strong>{data.staff.displayName}</strong>. Ambil permintaan pelapor atau
					percakapan yang sedang berjalan, balas di thread yang sama, lalu tutup percakapan saat
					selesai.
				</p>
			</div>
			<div class="live-title-actions">
				<a class="button-secondary" href="/petugas">Meja laporan</a>
				<a class="button-secondary" href="/">Portal publik</a>
			</div>
		</header>

		<div class="live-notice">
			<strong>Akses admin.</strong>
			<span>
				Petugas, bidan, dan admin memakai akses admin. Permintaan bantuan dan percakapan yang
				sedang berjalan tampil di antrean; ambil alih percakapan untuk menjeda AI. NIK, nomor, dan
				email disamarkan di percakapan. Setiap pembukaan transkrip, pengambilalihan, balasan, dan
				penutupan dicatat dalam audit.
			</span>
		</div>

		{#if data.serviceMode === 'ai'}
			<div class="live-hours" role="status">
				<strong>Di luar jam layanan.</strong>
				<span>
					Pelapor belum dapat mengirim permintaan bantuan baru. Percakapan aktif tetap dapat
					diambil alih oleh admin. Jam layanan: {SERVICE_HOURS_LABEL}.
				</span>
			</div>
		{:else if data.serviceMode === 'unavailable'}
			<div class="live-hours" role="status">
				<strong>Layanan petugas tidak tersedia.</strong>
				<span>Periksa koneksi database sebelum menerima permintaan bantuan.</span>
			</div>
		{/if}

		{#if loadError}
			<section class="live-state" role="alert">
				<h2>Antrean tidak dapat dimuat</h2>
				<p>Periksa koneksi database, lalu muat ulang halaman.</p>
				<button class="button-secondary" type="button" onclick={() => location.reload()}
					>Coba lagi</button
				>
			</section>
		{:else}
			<div class:thread-open={detailsOpen} class="live-grid">
				<section class:queue-hidden={detailsOpen} class="live-queue" aria-label="Antrean percakapan">
					<div class="live-queue-head">
						<div>
							<h2>Antrean</h2>
							<span
								>{waitingCount} menunggu · {activeCount} aktif · {activeChats.length} percakapan
								berjalan</span
							>
						</div>
						<button class="link-button" type="button" onclick={refreshQueue}>Muat ulang</button>
					</div>

					{#if error && !detailsOpen}
						<p class="live-error queue-error" role="alert">{error}</p>
					{/if}

					{#if activeChats.length > 0}
						<section class="live-active" aria-labelledby="active-chats-title">
							<div class="live-active-head">
								<div>
									<h3 id="active-chats-title">Percakapan aktif</h3>
									<span>{activeChats.length} percakapan berjalan</span>
								</div>
								<span class="live-active-note">Bisa diambil alih</span>
							</div>
							{#each activeChats as chat (chat.sessionId)}
								<button
									class="live-row active-row"
									type="button"
									onclick={() => takeoverChat(chat)}
									disabled={busy}
								>
									<span class="live-row-top">
										<span class="live-status active-status">Berjalan</span>
										<span class="live-age">{relativeTime(chat.lastMessageAt)}</span>
									</span>
									<strong>{chat.preview || 'Belum ada pesan pelapor'}</strong>
									<span class="live-row-meta">{chat.messageCount} pesan pelapor</span>
									<span class="takeover-label">
										{takingOverId === chat.sessionId ? 'Mengambil alih...' : 'Ambil alih'}
									</span>
								</button>
							{/each}
						</section>
					{/if}

					{#if chats.length === 0}
						<div class="live-empty">
							<h3>Belum ada permintaan bantuan</h3>
							<p>
								Pelapor belum menekan tombol “Minta bantuan petugas”. Percakapan yang sedang
								berjalan tetap tampil di atas dan dapat diambil alih.
							</p>
						</div>
					{:else}
						{#each chats as chat (chat.id)}
							<button
								class:selected={selectedId === chat.id}
								class:waiting={chat.status === 'waiting'}
								class="live-row"
								type="button"
								aria-pressed={selectedId === chat.id}
								onclick={() => openChat(chat)}
							>
								<span class="live-row-top">
									<span class:waiting={chat.status === 'waiting'} class="live-status">
										{handoffStatusLabel(chat.status)}
									</span>
									<span class="live-age">{relativeTime(chat.requestedAt)}</span>
								</span>
								<strong>
									{chat.status === 'waiting'
										? 'Permintaan baru'
										: chat.claimedByMe
											? 'Ditangani Anda'
											: `Ditangani ${chat.claimedByName ?? 'petugas lain'}`}
								</strong>
								<span class="live-row-meta">
									{chat.messageCount} pesan
									{#if chat.lastMessageAt}
										· pesan terakhir {relativeTime(chat.lastMessageAt)}
									{/if}
								</span>
							</button>
						{/each}
					{/if}
				</section>

				<section class:thread-hidden={!detailsOpen} class="live-thread" aria-label="Thread percakapan">
					{#if loadingThread}
						<div class="live-state compact" aria-live="polite">
							<h2>Memuat percakapan</h2>
							<p>Mohon tunggu sebentar.</p>
						</div>
					{:else if !selectedId}
						<div class="live-empty thread-empty">
							<h2>Pilih percakapan</h2>
							<p>
								Ambil percakapan aktif dari antrean, buka permintaan baru, atau lanjutkan
								percakapan yang sedang Anda tangani.
							</p>
						</div>
					{:else if !handoff && selected?.status === 'waiting'}
						<div class="live-waiting">
							<button class="mobile-back" type="button" onclick={backToQueue}>Kembali ke antrean</button>
							<p class="eyebrow">Permintaan baru</p>
							<h2 tabindex="-1" bind:this={threadHeading}>Ambil percakapan ini?</h2>
							<p>
								Transkrip baru terbuka setelah Anda mengambil percakapan. AI pelapor sedang
								dijeda, jadi tidak ada balasan otomatis yang berjalan.
							</p>
							<button class="button-primary" type="button" onclick={claimChat} disabled={busy}>
								{busy ? 'Mengambil...' : 'Ambil percakapan'}
							</button>
							{#if error}<p class="live-error" role="alert">{error}</p>{/if}
						</div>
					{:else if !handoff}
						<div class="live-waiting">
							<button class="mobile-back" type="button" onclick={backToQueue}>Kembali ke antrean</button>
							<h2 tabindex="-1" bind:this={threadHeading}>Percakapan tidak dapat dibuka</h2>
							<p>{error || 'Percakapan ini mungkin sudah diambil petugas lain atau ditutup.'}</p>
							<button class="button-secondary" type="button" onclick={() => loadThread()}>
								Coba lagi
							</button>
						</div>
					{:else}
						<div class="live-thread-head">
							<div>
								<button class="mobile-back" type="button" onclick={backToQueue}
									>Kembali ke antrean</button
								>
								<p class="eyebrow">{handoffStatusLabel(handoff.status)}</p>
								<h2 tabindex="-1" bind:this={threadHeading}>Percakapan pelapor</h2>
								<p>
									Diminta {relativeTime(handoff.requestedAt)}
									{#if handoff.claimedByName}· ditangani {handoff.claimedByName}{/if}
								</p>
							</div>
							{#if canClose}
								<button class="button-secondary danger-button" type="button" onclick={closeChat} disabled={busy}>
									{busy ? 'Memproses...' : 'Tutup percakapan'}
								</button>
							{/if}
						</div>

						<div class="live-status-note" class:closed={!isHandoffOpen(handoff.status)}>
							{handoffStatusCopy(handoff.status)}
						</div>

						<div class="live-log" bind:this={log} role="log" aria-live="polite" aria-label="Pesan percakapan">
							{#if messages.length === 0}
								<p class="live-log-empty">Belum ada pesan dalam percakapan ini.</p>
							{:else}
								{#each messages as message (message.id)}
									<article
										class:from-user={message.source === 'user'}
										class:from-staff={message.source === 'staff'}
										class:from-service={message.source === 'handoff'}
										class="live-message"
									>
										<strong>{messageLabel(message)}</strong>
										<p>{message.body}</p>
										<time datetime={message.createdAt}>{formatReportDate(message.createdAt)}</time>
									</article>
								{/each}
							{/if}
						</div>

						{#if canReply}
							<form class="live-reply" onsubmit={sendReply}>
								<label for="staff-reply">Balas pelapor</label>
								<textarea
									id="staff-reply"
									bind:value={input}
									maxlength="2000"
									rows="3"
									placeholder="Tulis jawaban yang jelas, tanpa meminta NIK atau kontak lengkap."
								></textarea>
								<div class="live-reply-actions">
									<p>
										{data.isAdmin && !handoff.claimedByMe
											? 'Anda admin; balasan ini tercatat atas nama Anda.'
											: 'Balasan langsung terlihat oleh pelapor.'}
									</p>
									<button class="button-primary" type="submit" disabled={busy}>
										{busy ? 'Mengirim...' : 'Kirim balasan'}
									</button>
								</div>
							</form>
						{:else if isHandoffOpen(handoff.status)}
							<p class="live-readonly">
								Percakapan aktif. Hanya petugas yang mengambil atau admin yang dapat membalas.
							</p>
						{/if}

						{#if error}<p class="live-error" role="alert">{error}</p>{/if}
						{#if notice}<p class="live-notice-inline" role="status">{notice}</p>{/if}
					{/if}
				</section>
			</div>
		{/if}
	</section>
</div>

<style>
	.live-page { padding: 28px 0 56px; background: var(--ground); }
	.live-shell {
		width: min(1240px, calc(100% - 48px));
		margin: 0 auto;
	}
	.live-title {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		padding-bottom: 20px;
	}
	.eyebrow {
		margin: 0 0 4px;
		color: var(--magenta-dark);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.live-title h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 3rem);
		line-height: 1.05;
		letter-spacing: -0.035em;
	}
	.live-title p:last-child { max-width: 70ch; margin: 10px 0 0; color: var(--muted); }
	.live-title-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
	.live-notice {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		margin-bottom: 18px;
		padding: 12px 14px;
		border-left: 4px solid var(--yellow);
		background: var(--attention);
		color: #493a0b;
		font-size: 0.84rem;
	}
	.live-notice strong { flex: 0 0 auto; }
	.live-hours {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 8px;
		margin: -8px 0 18px;
		padding: 10px 14px;
		border-left: 4px solid var(--navy);
		background: var(--surface);
		color: var(--muted);
		font-size: 0.82rem;
	}
	.live-hours strong { color: var(--ink); }
	.live-grid {
		display: grid;
		grid-template-columns: minmax(280px, 0.7fr) minmax(0, 1.3fr);
		gap: 18px;
		min-height: 560px;
	}
	.live-queue,
	.live-thread {
		border: 1px solid var(--border);
		background: #fff;
	}
	.live-queue { align-self: start; }
	.live-queue-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 15px 16px;
		border-bottom: 1px solid var(--rule);
		background: var(--surface);
	}
	.live-queue-head h2 { margin: 0; font-size: 1.05rem; }
	.live-queue-head span { display: block; margin-top: 2px; color: var(--muted); font-size: 0.78rem; }
	.live-queue-head .link-button { min-height: 38px; font-size: 0.8rem; }
	.queue-error { margin: 10px 16px; }
	.live-active { border-bottom: 1px solid #cfe5df; background: #f2fbf8; }
	.live-active-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		padding: 12px 16px 9px;
	}
	.live-active-head h3 { margin: 0; font-size: 0.92rem; }
	.live-active-head > div > span { display: block; margin-top: 2px; color: var(--muted); font-size: 0.72rem; }
	.live-active-note {
		flex: 0 0 auto;
		padding: 2px 7px;
		border-radius: 999px;
		background: #dff0ed;
		color: #075f5a;
		font-size: 0.66rem;
		font-weight: 800;
	}
	.active-row { background: #fff; border-bottom: 1px solid #d7e9e4; }
	.active-row:hover { background: #edf9f5; }
	.active-row:disabled { cursor: wait; opacity: 0.75; }
	.active-row strong {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	.active-status { background: #e6f4ff; color: #164b74; }
	.takeover-label { margin-top: 2px; color: var(--magenta-dark); font-size: 0.74rem; font-weight: 800; }
	.live-row {
		display: grid;
		gap: 4px;
		width: 100%;
		padding: 14px 16px;
		border: 0;
		border-bottom: 1px solid var(--rule);
		background: #fff;
		color: var(--ink);
		text-align: left;
	}
	.live-row:hover { background: #f4faf8; }
	.live-row.selected { box-shadow: inset 4px 0 0 var(--magenta); background: #fff5f9; }
	.live-row.waiting { background: #fffdf3; }
	.live-row.waiting:hover { background: #fff9df; }
	.live-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.live-status {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--surface-teal);
		color: var(--teal-dark);
		font-size: 0.7rem;
		font-weight: 800;
	}
	.live-status.waiting { background: var(--attention); color: #6b5207; }
	.live-age { color: var(--muted); font-size: 0.72rem; }
	.live-row strong { font-size: 0.94rem; }
	.live-row-meta { color: var(--muted); font-size: 0.76rem; }
	.live-empty { padding: 38px 22px; text-align: center; }
	.live-empty h2,
	.live-empty h3 { margin: 0; }
	.live-empty p { max-width: 42ch; margin: 8px auto 0; color: var(--muted); font-size: 0.88rem; }
	.thread-empty { align-self: center; }
	.live-thread {
		display: flex;
		flex-direction: column;
		min-height: 560px;
		max-height: calc(100dvh - 190px);
		overflow: hidden;
	}
	.live-thread-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 18px;
		border-bottom: 1px solid var(--rule);
	}
	.live-thread-head h2 { margin: 0; font-size: 1.18rem; }
	.live-thread-head p:last-child { margin: 5px 0 0; color: var(--muted); font-size: 0.8rem; }
	.danger-button { border-color: #c88a8d; color: var(--danger); }
	.danger-button:hover { background: #fff1f1; }
	.live-status-note {
		padding: 9px 18px;
		border-bottom: 1px solid #b8d8d2;
		background: var(--surface-teal);
		color: #214f4e;
		font-size: 0.82rem;
	}
	.live-status-note.closed { border-bottom-color: var(--border); background: var(--surface); color: var(--muted); }
	.live-log {
		flex: 1;
		min-height: 220px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 18px;
		background: #f7faf9;
		scrollbar-color: #8ca4a9 #f7faf9;
	}
	.live-log-empty { margin: auto; color: var(--muted); font-size: 0.88rem; text-align: center; }
	.live-message {
		width: fit-content;
		max-width: min(82%, 640px);
		padding: 10px 12px;
		border: 1px solid #dbe6e4;
		border-radius: 4px 12px 12px 12px;
		background: #fff;
	}
	.live-message.from-user {
		align-self: flex-end;
		border-color: var(--navy);
		border-radius: 12px 4px 12px 12px;
		background: var(--navy);
		color: #fff;
	}
	.live-message.from-staff {
		border-color: #c88aab;
		border-left-width: 4px;
		background: #fff5f9;
	}
	.live-message.from-service { border-style: dashed; background: #f7faf9; }
	.live-message strong { display: block; margin-bottom: 3px; color: var(--teal-dark); font-size: 0.7rem; }
	.live-message.from-user strong { color: #a9dbd7; }
	.live-message.from-staff strong { color: var(--magenta-dark); }
	.live-message.from-service strong { color: var(--muted); }
	.live-message p { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; font-size: 0.9rem; }
	.live-message time { display: block; margin-top: 5px; color: var(--muted); font-size: 0.66rem; }
	.live-message.from-user time { color: #c6dfe4; }
	.live-reply {
		flex: 0 0 auto;
		padding: 13px 18px 15px;
		border-top: 1px solid var(--border);
		background: #fff;
	}
	.live-reply > label { display: block; margin-bottom: 5px; font-size: 0.82rem; font-weight: 800; }
	.live-reply textarea {
		width: 100%;
		min-height: 78px;
		max-height: 160px;
		padding: 10px 12px;
		border: 1px solid #849ba4;
		border-radius: var(--radius-control);
		resize: vertical;
	}
	.live-reply-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 8px;
	}
	.live-reply-actions p { margin: 0; color: var(--muted); font-size: 0.72rem; }
	.live-reply-actions .button-primary { min-height: 46px; }
	.live-waiting { padding: 36px 28px; }
	.live-waiting h2 { margin: 0; font-size: 1.4rem; }
	.live-waiting p:not(.eyebrow) { max-width: 54ch; margin: 10px 0 18px; color: var(--muted); }
	.live-readonly { padding: 12px 18px; border-top: 1px solid var(--rule); background: var(--surface); color: var(--muted); font-size: 0.82rem; }
	.live-error {
		margin: 10px 18px 14px;
		padding: 9px 11px;
		border-left: 3px solid var(--danger);
		background: #fff1f1;
		color: var(--danger);
		font-size: 0.84rem;
	}
	.live-notice-inline { margin: 10px 18px 14px; color: var(--success); font-size: 0.84rem; font-weight: 700; }
	.mobile-back { display: none; min-height: 40px; margin-bottom: 10px; border: 0; background: transparent; color: var(--teal-dark); padding: 0; font-weight: 800; text-decoration: underline; }
	.live-state { padding: 40px 24px; border: 1px solid var(--border); background: #fff; text-align: center; }
	.live-state h2 { margin: 0; }
	.live-state p { color: var(--muted); }
	.live-state.compact { padding: 32px 24px; }

	@media (max-width: 900px) {
		.live-title { flex-direction: column; }
		.live-title-actions { justify-content: flex-start; }
		.live-grid { grid-template-columns: 1fr; min-height: 0; }
		.live-thread { max-height: none; min-height: 480px; }
		.live-grid.thread-open .live-queue { display: none; }
		.live-grid:not(.thread-open) .live-thread { display: none; }
		.mobile-back { display: inline-flex; align-items: center; }
	}
	@media (max-width: 540px) {
		.live-page { padding: 18px 0 40px; }
		.live-shell { width: calc(100% - 32px); }
		.live-title h1 { font-size: 2rem; }
		.live-title-actions { width: 100%; }
		.live-title-actions .button-secondary { width: 100%; }
		.live-thread-head { flex-direction: column; padding: 14px; }
		.live-thread-head .button-secondary { width: 100%; }
		.live-thread-head .danger-button { width: 100%; }
		.live-log { padding: 14px; }
		.live-message { max-width: 92%; }
		.live-reply { padding: 12px 14px 14px; }
		.live-reply-actions { flex-direction: column; align-items: stretch; }
		.live-reply-actions .button-primary { width: 100%; }
	}
</style>
