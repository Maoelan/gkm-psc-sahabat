<script lang="ts">
	import { dev } from '$app/env';
	import { onMount, tick } from 'svelte';
	import { modeCopy, SERVICE_HOURS_LABEL, type ServiceMode } from '../../lib/service-mode';
	import { appendReportStory, STORY_LIMIT, MESSAGE_LIMIT, type AnswerField, type ChatFields } from '../../lib/chat';
	import { isValidNik, maskNik, normalizeNik } from '../../lib/reports';
	import {
		handoffStatusCopy,
		handoffStatusLabel,
		isHandoffOpen,
		type HandoffThreadMessage,
		type ReporterHandoff
	} from '../../lib/handoff';
	import { PRIVACY_NOTICE_VERSION } from '../../lib/privacy';
	import type { PageProps } from './$types';

	type Stage = 'start' | 'identity' | 'chat' | 'review' | 'receipt';
	type ChatStep = 'story' | 'time' | 'location' | 'need' | 'open';
	type Sender = 'assistant' | 'user' | 'staff' | 'service';
	type FollowUpSource = 'nvidia' | 'fallback' | 'guide';
	type MessageSource = FollowUpSource | 'staff' | 'handoff' | 'user' | 'ai';
	type MissingField = 'incident_time' | 'incident_location' | 'need';
	type Message = {
		id: number;
		serverId?: string;
		sender: Sender;
		body: string;
		source?: MessageSource;
	};
	type ChatSession = { csrfToken: string };

	let { data }: PageProps = $props();

	// Nilai awal dari server; perubahan mode hanya terjadi lewat aksi pengguna di halaman ini.
	// svelte-ignore state_referenced_locally
	let serviceMode = $state<ServiceMode>(data.serviceMode);
	// svelte-ignore state_referenced_locally
	let aiEnabled = $state(data.aiEnabled);
	const modeInfo = $derived(modeCopy(serviceMode, aiEnabled));
	const modeLabel = $derived(modeInfo.label);
	const assistantLabel = $derived(modeInfo.assistantLabel);
	const modeDescription = $derived(modeInfo.description);
	let chatSession = $state<ChatSession | null>(null);
	let idempotencyKey = $state('');
	let handoff = $state<ReporterHandoff | null>(null);
	let handoffError = $state('');
	let dismissedHandoffId = $state('');
	let handoffBusy = $state(false);
	let lastHandoffMessageId = $state('');
	let handoffPolling = $state(false);
	let handoffTimer: ReturnType<typeof setTimeout> | undefined;
	let pageMounted = $state(false);

	let nextMessageId = 1;
	let stage = $state<Stage>('start');
	let chatStep = $state<ChatStep>('story');
	let messages = $state<Message[]>([]);
	let safetyChoice = $state('');
	let relation = $state('');
	let victimName = $state('');
	let victimNik = $state('');
	let story = $state('');
	let incidentTime = $state('');
	let incidentLocation = $state('');
	let need = $state('');
	let contactPreference = $state('');
	let contactDetails = $state('');
	let privacyRead = $state(false);
	let input = $state('');
	let addingStory = $state(false);
	let identityError = $state('');
	let chatError = $state('');
	let submitError = $state('');
	let busy = $state(false);
	let referenceCode = $state('');
	let submittedAt = $state('');

	let chatLog = $state<HTMLDivElement>();
	let composer = $state<HTMLTextAreaElement>();
	let startHeading = $state<HTMLHeadingElement>();
	let identityHeading = $state<HTMLHeadingElement>();
	let safetyHeading = $state<HTMLHeadingElement>();
	let unsafeHeading = $state<HTMLHeadingElement>();
	let reviewHeading = $state<HTMLHeadingElement>();
	let receiptHeading = $state<HTMLHeadingElement>();
	let privacyCheckbox = $state<HTMLInputElement>();
	let firstRelation = $state<HTMLInputElement>();
	let nameInput = $state<HTMLInputElement>();
	let nameReviewInput = $state<HTMLInputElement>();
	let nikInput = $state<HTMLInputElement>();
	let nikReviewInput = $state<HTMLInputElement>();
	let nikEditing = $state(false);
	let contactNo = $state<HTMLInputElement>();
	let reviewButton = $state<HTMLButtonElement>();

	const isFieldStep = $derived(
		chatStep === 'time' || chatStep === 'location' || chatStep === 'need'
	);
	const handoffOpen = $derived(isHandoffOpen(handoff?.status));
	const handoffAvailable = $derived(serviceMode === 'operator');
	const progressLabel = $derived(
		handoffOpen
			? 'Bantuan petugas aktif'
			: chatStep === 'story'
				? 'Tahap 1 dari 3: cerita inti'
				: chatStep === 'open'
					? 'Tahap 3 dari 3: periksa draf'
					: 'Tahap 2 dari 3: pertanyaan pelengkap'
	);
	const composerLabel = $derived(
		handoffOpen
			? 'Tulis pesan untuk petugas'
			: addingStory
				? 'Tambah cerita'
				: chatStep === 'story'
					? 'Tulis cerita Anda'
					: chatStep === 'open'
						? 'Tanggapan atau tambahan'
						: chatStep === 'time'
							? 'Waktu kejadian'
							: chatStep === 'location'
								? 'Lokasi umum'
								: 'Bantuan yang diharapkan'
	);
	const composerPlaceholder = $derived(
		handoffOpen
			? 'Tulis pesan untuk petugas. Jangan kirim NIK atau kontak lengkap di sini.'
			: addingStory
				? 'Tambahkan bagian cerita yang belum sempat Anda tulis.'
				: chatStep === 'story'
					? 'Ceritakan dengan kata-kata sendiri. Boleh belum lengkap.'
					: chatStep === 'open'
						? 'Tulis tanggapan, pertanyaan, atau tambahan cerita.'
						: chatStep === 'time'
							? 'Contoh: kemarin sore'
							: chatStep === 'location'
								? 'Contoh: di rumah'
								: 'Tulis kebutuhan Anda, atau pilih salah satu di atas.'
	);
	const unknownFields = $derived.by(() => {
		const fields: string[] = [];
		if (!incidentTime.trim() || incidentTime === 'Belum diketahui') fields.push('Waktu kejadian');
		if (!incidentLocation.trim() || incidentLocation === 'Belum diketahui') fields.push('Lokasi umum');
		if (!need.trim() || need === 'Belum diketahui') fields.push('Bantuan yang diharapkan');
		return fields;
	});

	function handleHandoffVisibility() {
		if (document.hidden) {
			clearHandoffTimer();
			return;
		}
		scheduleHandoffPoll(800);
	}

	onMount(() => {
		pageMounted = true;
		document.addEventListener('visibilitychange', handleHandoffVisibility);
		return () => {
			pageMounted = false;
			document.removeEventListener('visibilitychange', handleHandoffVisibility);
			if (handoffTimer) clearTimeout(handoffTimer);
		};
	});

	$effect(() => {
		if (pageMounted && chatSession && (stage === 'chat' || stage === 'review')) scheduleHandoffPoll(800);
		else clearHandoffTimer();
	});

	function prefersReducedMotion() {
		return (
			typeof window !== 'undefined' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	async function scrollToLatest() {
		await tick();
		chatLog?.scrollTo({
			top: chatLog.scrollHeight,
			behavior: prefersReducedMotion() ? 'auto' : 'smooth'
		});
	}

	async function addMessage(
		sender: Sender,
		body: string,
		source?: MessageSource,
		serverId?: string
	) {
		const message: Message = { id: nextMessageId++, sender, body, source, serverId };
		messages.push(message);
		await scrollToLatest();
		return message;
	}

	async function mergeHandoffMessages(items: HandoffThreadMessage[]) {
		let added = false;
		for (const item of items) {
			if (messages.some((message) => message.serverId === item.id)) continue;
			if (item.sender === 'user') {
				try { story = appendReportStory(story, item.body); } catch (error) { chatError = String(error); }
			}
			messages.push({
				id: nextMessageId++,
				serverId: item.id,
				sender:
					item.sender === 'staff'
						? 'staff'
						: item.sender === 'service'
							? 'service'
							: item.sender === 'assistant'
								? 'assistant'
								: 'user',
				body: item.body,
				source: item.source
			});
			added = true;
		}
		if (added) await scrollToLatest();
	}

	async function focusComposer() {
		await tick();
		composer?.focus();
	}

	async function ensureSession() {
		if (chatSession) return true;
		try {
			const response = await fetch(`/api/chat/session?mode=${encodeURIComponent(serviceMode)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}'
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				csrfToken?: string;
				mode?: ServiceMode;
				aiEnabled?: boolean;
			};
			if (!response.ok || !payload.csrfToken) {
				identityError = payload.error || 'Sesi tidak dapat dibuat. Coba lagi.';
				return false;
			}
			chatSession = { csrfToken: payload.csrfToken };
			if (payload.mode) serviceMode = payload.mode;
			if (typeof payload.aiEnabled === 'boolean') aiEnabled = payload.aiEnabled;
			return true;
		} catch {
			identityError = 'Sesi tidak dapat dibuat. Periksa koneksi lalu coba lagi.';
			return false;
		}
	}

	function draftPayload() {
		return {
			victimName: victimName.trim(),
			victimNik: normalizeNik(victimNik),
			relation,
			story: story.trim(),
			incidentTime: incidentTime.trim() || 'Belum diketahui',
			incidentLocation: incidentLocation.trim() || 'Belum diketahui',
			need: need.trim() || 'Belum diketahui',
			safeContact: contactPreference,
			contactDetails: contactPreference === 'yes' ? contactDetails.trim() : ''
		};
	}

	async function saveDraft() {
		if (!(await ensureSession()) || !chatSession) throw new Error('Sesi tidak tersedia.');
		const response = await fetch('/api/chat/draft', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-csrf-token': chatSession.csrfToken
			},
			body: JSON.stringify(draftPayload())
		});
		const payload = (await response.json().catch(() => ({}))) as {
			error?: string;
			draftId?: string;
			version?: number;
		};
		if (!response.ok || !payload.draftId || !payload.version) {
			throw new Error(payload.error || 'Draf belum dapat disimpan.');
		}
		return payload;
	}

	function stepForField(field: MissingField): ChatStep {
		if (field === 'incident_time') return 'time';
		if (field === 'incident_location') return 'location';
		return 'need';
	}

	function messageLabel(message: Message) {
		if (message.sender === 'user') return 'Anda';
		if (message.sender === 'staff') return 'Petugas LAPOR AMAN';
		if (message.sender === 'service' || message.source === 'handoff') return 'LAPOR AMAN';
		if (message.source === 'guide') return 'Panduan LAPOR AMAN';
		if (message.source === 'fallback' && serviceMode === 'ai' && aiEnabled) {
			return 'Panduan LAPOR AMAN';
		}
		return assistantLabel;
	}

	function sourceForPayload(source: string | undefined): FollowUpSource {
		if (source === 'nvidia') return 'nvidia';
		if (source === 'guide') return 'guide';
		return 'fallback';
	}

	async function requestTurn(userMessage: string, nextStory: string, answerField?: AnswerField) {
		if (!chatSession) {
			chatError = 'Sesi tidak tersedia. Muat ulang halaman lalu coba lagi.';
			return;
		}
		chatError = '';
		try {
			const response = await fetch('/api/chat/turn', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-csrf-token': chatSession.csrfToken
				},
				body: JSON.stringify({
					story: nextStory.trim(),
					incidentTime: incidentTime.trim(),
					incidentLocation: incidentLocation.trim(),
					need: need.trim(),
					userMessage,
					answerField
				})
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				code?: string;
				accepted?: boolean;
				userMessageId?: string;
				flowComplete?: boolean;
				message?: string | null;
				question?: string | null;
				source?: string;
				missingField?: MissingField | null;
				fields?: ChatFields;
			};
			if (!response.ok) {
				if (payload.code === 'handoff_open') {
					if (payload.accepted) {
						story = nextStory;
						input = '';
						await addMessage('user', userMessage, 'user', payload.userMessageId);
					}
					await pollHandoff(true);
					if (payload.accepted) return;
				}
				throw new Error(payload.error || 'Pertanyaan berikutnya belum dapat dimuat.');
			}
			story = nextStory;
			input = '';
			await addMessage('user', userMessage, 'user', payload.userMessageId);
			if (payload.fields) {
				incidentTime = payload.fields.incidentTime;
				incidentLocation = payload.fields.incidentLocation;
				need = payload.fields.need;
			}
			const source = sourceForPayload(payload.source);
			if (payload.flowComplete) {
				if (!payload.message) throw new Error('Tanggapan belum dapat dimuat.');
				chatStep = 'open';
				addingStory = false;
				await addMessage('assistant', payload.message, source);
				await focusComposer();
				return;
			}
			if (!payload.missingField || !payload.message) {
				throw new Error('Pertanyaan berikutnya belum dapat dimuat.');
			}
			chatStep = stepForField(payload.missingField);
			await addMessage('assistant', payload.message, source);
			await focusComposer();
		} catch (error) {
			chatError =
				error instanceof Error
					? error.message
					: 'Pertanyaan berikutnya belum dapat dimuat. Coba lagi.';
		}
	}

	async function sendChatMessage(value: string, answerField?: AnswerField, initial = false) {
		if (busy) return;
		const message = value.trim();
		if (!message || message.length > MESSAGE_LIMIT) {
			chatError = `Tulis pesan antara 1 dan ${MESSAGE_LIMIT} karakter.`;
			return;
		}
		if (initial && message.length < 10) {
			chatError = 'Tulis sedikitnya 10 karakter agar draf bisa disusun.';
			return;
		}
		busy = true;
		try {
			const nextStory = initial ? message : appendReportStory(story, message);
			await requestTurn(message, nextStory, answerField);
		} catch (error) {
			chatError = error instanceof Error ? error.message : 'Pesan belum terkirim.';
		} finally {
			busy = false;
		}
	}

	function clearHandoffTimer() {
		if (handoffTimer) {
			clearTimeout(handoffTimer);
			handoffTimer = undefined;
		}
	}

	function scheduleHandoffPoll(delay = 3500) {
		clearHandoffTimer();
		if (!pageMounted || !chatSession || document.hidden || (stage !== 'chat' && stage !== 'review')) return;
		handoffTimer = setTimeout(() => {
			void pollHandoff();
		}, delay);
	}

	async function requestHandoff() {
		if (handoffBusy || handoffOpen) return;
		if (!(await ensureSession()) || !chatSession) return;
		handoffBusy = true;
		handoffError = '';
		try {
			const response = await fetch('/api/chat/handoff', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-csrf-token': chatSession.csrfToken
				},
				body: '{}'
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				handoff?: ReporterHandoff;
				message?: HandoffThreadMessage | null;
				latestMessageId?: string | null;
			};
			if (!response.ok || !payload.handoff) {
				throw new Error(payload.error || 'Bantuan petugas belum dapat diminta.');
			}
			handoff = payload.handoff;
			addingStory = false;
			if (payload.message) await mergeHandoffMessages([payload.message]);
			lastHandoffMessageId = payload.latestMessageId ?? payload.message?.id ?? '';
			scheduleHandoffPoll(1000);
		} catch (error) {
			handoffError =
				error instanceof Error ? error.message : 'Bantuan petugas belum dapat diminta.';
		} finally {
			handoffBusy = false;
		}
	}

	async function sendHandoffMessage() {
		if (busy || handoffBusy || !handoffOpen || !chatSession) return;
		const value = input.trim();
		handoffError = '';
		if (!value) {
			handoffError = 'Tulis pesan untuk petugas.';
			return;
		}
		if (value.length > MESSAGE_LIMIT) { handoffError = `Pesan maksimal ${MESSAGE_LIMIT} karakter.`; return; }
		try { appendReportStory(story, value); } catch (error) { handoffError = String(error); return; }
		handoffBusy = true;
		try {
			const response = await fetch('/api/chat/handoff/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-csrf-token': chatSession.csrfToken
				},
				body: JSON.stringify({ body: value })
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				code?: string;
				handoff?: ReporterHandoff;
				message?: HandoffThreadMessage | null;
				latestMessageId?: string | null;
			};
			if (!response.ok) {
				if (payload.code === 'handoff_not_open') {
					handoff = null;
					lastHandoffMessageId = '';
					clearHandoffTimer();
				}
				throw new Error(payload.error || 'Pesan belum dapat dikirim.');
			}
			if (payload.handoff) handoff = payload.handoff;
			if (payload.message) await mergeHandoffMessages([payload.message]);
			lastHandoffMessageId = payload.latestMessageId ?? payload.message?.id ?? lastHandoffMessageId;
			input = '';
			await focusComposer();
		} catch (error) {
			handoffError = error instanceof Error ? error.message : 'Pesan belum dapat dikirim.';
		} finally {
			handoffBusy = false;
			scheduleHandoffPoll();
		}
	}

	async function cancelHandoff() {
		if (handoffBusy || !handoffOpen || !chatSession) return;
		handoffBusy = true;
		handoffError = '';
		try {
			const response = await fetch('/api/chat/handoff/cancel', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-csrf-token': chatSession.csrfToken
				},
				body: '{}'
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				handoff?: ReporterHandoff;
				message?: HandoffThreadMessage | null;
				latestMessageId?: string | null;
			};
			if (!response.ok || !payload.handoff) {
				throw new Error(payload.error || 'Bantuan petugas belum dapat diakhiri.');
			}
			handoff = payload.handoff;
			if (payload.message) await mergeHandoffMessages([payload.message]);
			lastHandoffMessageId = payload.latestMessageId ?? payload.message?.id ?? lastHandoffMessageId;
			clearHandoffTimer();
		} catch (error) {
			handoffError = error instanceof Error ? error.message : 'Bantuan petugas belum dapat diakhiri.';
		} finally {
			handoffBusy = false;
			scheduleHandoffPoll();
		}
	}

	async function pollHandoff(force = false) {
		if ((!force && document.hidden) || handoffPolling || !chatSession) return;
		handoffPolling = true;
		try {
			const query = lastHandoffMessageId
				? `?after=${encodeURIComponent(lastHandoffMessageId)}`
				: '';
			const response = await fetch(`/api/chat/handoff${query}`, {
				headers: { Accept: 'application/json' }
			});
			if (response.status === 401) {
				chatError = 'Sesi sudah berakhir. Muat ulang halaman untuk melanjutkan.';
				clearHandoffTimer();
				chatSession = null;
				return;
			}
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				handoff?: ReporterHandoff | null;
				messages?: HandoffThreadMessage[];
				latestMessageId?: string | null;
			};
			if (!response.ok) throw new Error(payload.error || 'Status bantuan belum dapat dimuat.');
			handoffError = '';
			if (payload.handoff && (payload.handoff.id !== dismissedHandoffId || isHandoffOpen(payload.handoff.status))) {
				if (payload.handoff.id !== handoff?.id) lastHandoffMessageId = '';
				handoff = payload.handoff;
				if (isHandoffOpen(handoff.status) && stage === 'review') stage = 'chat';
			}
			if (payload.messages?.length) await mergeHandoffMessages(payload.messages);
			if (payload.latestMessageId) lastHandoffMessageId = payload.latestMessageId;
		} catch {
			// Polling berikutnya dicoba lagi; kesalahan sesi permanen ditangani di atas.
		} finally {
			handoffPolling = false;
			scheduleHandoffPoll();
		}
	}

	function dismissHandoffNotice() {
		dismissedHandoffId = handoff?.id ?? '';
		handoff = null;
		handoffError = '';
		lastHandoffMessageId = '';
		scheduleHandoffPoll();
	}

	function formatWita(value: string) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
		return new Intl.DateTimeFormat('id-ID', {
			dateStyle: 'long',
			timeStyle: 'short',
			timeZone: 'Asia/Makassar'
		}).format(date);
	}

	async function chooseSafe() {
		safetyChoice = 'safe';
		stage = 'identity';
		await tick();
		identityHeading?.focus();
	}

	async function chooseUnsafe() {
		safetyChoice = 'unsafe';
		await tick();
		unsafeHeading?.focus();
	}

	async function dismissUnsafe() {
		safetyChoice = '';
		await tick();
		safetyHeading?.focus();
	}

	async function startChat() {
		identityError = '';
		if (!relation) {
			identityError = 'Pilih untuk siapa Anda melapor.';
			firstRelation?.focus();
			return;
		}
		const name = victimName.trim();
		if (name.length < 2) {
			identityError = 'Tulis nama korban atau nama panggilan sedikitnya 2 karakter.';
			nameInput?.focus();
			return;
		}
		const nik = normalizeNik(victimNik);
		if (!isValidNik(nik)) {
			identityError = 'NIK harus 16 digit angka. Kosongkan jika belum ingin mengisi.';
			nikInput?.focus();
			return;
		}
		victimName = name;
		victimNik = nik;
		if (!(await ensureSession())) return;
		nextMessageId = 1;
		messages = [];
		stage = 'chat';
		chatStep = 'story';
		input = '';
		addingStory = false;
		chatError = '';
		handoff = null;
		handoffError = '';
		lastHandoffMessageId = '';
		clearHandoffTimer();
		const intro =
			serviceMode === 'unavailable'
				? 'Halo. Petugas tidak tersedia, jadi kita susun draf bersama. Ceritakan yang ingin Anda sampaikan dengan kata-kata sendiri; saya akan menanyakan satu bagian pelengkap setiap giliran.'
				: 'Halo. Saya menemani percakapan ini. Ceritakan yang ingin Anda sampaikan dengan kata-kata sendiri; saya bisa menanggapi pertanyaan soal alur dan akan menanyakan satu bagian pelengkap setiap giliran. Boleh belum lengkap, dan Anda bisa melewati bagian yang belum nyaman dijawab.';
		await addMessage('assistant', intro, 'guide');
		await focusComposer();
	}

	async function toggleAddingStory() {
		addingStory = !addingStory;
		chatError = '';
		await focusComposer();
	}

	async function submitStory() { await sendChatMessage(input, undefined, true); }
	async function appendStory() { await sendChatMessage(input); addingStory = false; }
	async function answerTime(value: string) { await sendChatMessage(value, 'incidentTime'); }
	async function answerLocation(value: string) { await sendChatMessage(value, 'incidentLocation'); }
	async function answerNeed(value: string) { await sendChatMessage(value, 'need'); }

	async function skipCurrent() {
		if (chatStep === 'time') await answerTime('Belum diketahui');
		else if (chatStep === 'location') await answerLocation('Belum diketahui');
		else if (chatStep === 'need') await answerNeed('Belum diketahui');
	}

	function handleComposerKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void handleComposerSubmit();
		}
	}

	async function handleComposerSubmit(event?: SubmitEvent) {
		event?.preventDefault();
		if (handoffOpen) {
			await sendHandoffMessage();
			return;
		}
		if (addingStory) {
			await appendStory();
			return;
		}
		if (chatStep === 'story') {
			await submitStory();
			return;
		}
		if (chatStep === 'open') {
			await sendChatMessage(input);
			return;
		}
		if (!input.trim()) {
			chatError = 'Tulis jawaban, pilih salah satu tombol, atau lewati pertanyaan ini.';
			return;
		}
		if (chatStep === 'time') await answerTime(input);
		else if (chatStep === 'location') await answerLocation(input);
		else if (chatStep === 'need') await answerNeed(input);
	}

	async function openReview() {
		if (busy) return;
		if (handoffOpen) {
			chatError = 'Selesaikan atau akhiri percakapan dengan petugas sebelum membuka draf.';
			return;
		}
		if (!story.trim()) {
			chatError = 'Tulis cerita inti sebelum membuka draf.';
			await focusComposer();
			return;
		}
		incidentTime = incidentTime.trim() || 'Belum diketahui';
		incidentLocation = incidentLocation.trim() || 'Belum diketahui';
		need = need.trim() || 'Belum diketahui';
		addingStory = false;
		nikEditing = false;
		submitError = '';
		idempotencyKey ||= crypto.randomUUID();
		stage = 'review';
		await tick();
		reviewHeading?.focus();
	}

	async function backToChat() {
		stage = 'chat';
		await tick();
		if (chatStep === 'open') reviewButton?.focus();
		else composer?.focus();
	}

	async function editNik() {
		nikEditing = true;
		await tick();
		nikReviewInput?.focus();
	}

	async function submitReport() {
		if (busy) return;
		if (handoffOpen) {
			submitError = 'Bantuan petugas masih terbuka. Selesaikan percakapan sebelum mengirim laporan.';
			stage = 'chat';
			await tick();
			composer?.focus();
			return;
		}
		submitError = '';
		const name = victimName.trim();
		if (name.length < 2) {
			submitError = 'Tulis nama korban atau nama panggilan sedikitnya 2 karakter.';
			nameReviewInput?.focus();
			return;
		}
		const nik = normalizeNik(victimNik);
		if (!isValidNik(nik)) {
			submitError = 'NIK harus 16 digit angka. Kosongkan jika belum ingin mengisi.';
			nikEditing = true;
			await tick();
			nikReviewInput?.focus();
			return;
		}
		victimName = name;
		victimNik = nik;
		if (!contactPreference) {
			submitError = 'Pilih apakah Anda aman dihubungi sebelum mengirim.';
			contactNo?.focus();
			return;
		}
		if (!privacyRead) {
			submitError = 'Centang pernyataan bahwa Anda sudah membaca pemberitahuan privasi.';
			privacyCheckbox?.focus();
			return;
		}
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			submitError =
				'Perangkat sedang offline. Draf belum dikirim. Sambungkan kembali lalu coba lagi.';
			return;
		}

		busy = true;
		try {
			if (!(await ensureSession()) || !chatSession) {
				submitError = identityError || 'Sesi tidak tersedia. Muat ulang halaman lalu coba lagi.';
				return;
			}
			const saved = await saveDraft();
			idempotencyKey ||= crypto.randomUUID();
			const response = await fetch('/api/reports', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-csrf-token': chatSession.csrfToken
				},
				body: JSON.stringify({
					draftId: saved.draftId,
					version: saved.version,
					idempotencyKey,
					privacyRead: true,
					noticeVersion: PRIVACY_NOTICE_VERSION
				})
			});
			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				referenceCode?: string;
				submittedAt?: string;
			};
			if (!response.ok || !payload.referenceCode || !payload.submittedAt) {
				submitError =
					payload.error || 'Laporan belum tersimpan. Draf tetap tersedia di halaman ini.';
				return;
			}
			referenceCode = payload.referenceCode;
			submittedAt = formatWita(payload.submittedAt);
			victimNik = '';
			chatSession = null;
			void fetch('/api/chat/session', { method: 'DELETE', keepalive: true }).catch(() => {});
			stage = 'receipt';
			await tick();
			receiptHeading?.focus();
		} catch (error) {
			submitError =
				error instanceof Error
					? error.message
					: 'Laporan belum tersimpan. Draf tetap tersedia di halaman ini.';
		} finally {
			busy = false;
		}
	}

	function quickExit() {
		try {
			sessionStorage.clear();
		} catch {
			// Penyimpanan sesi dapat diblokir oleh browser.
		}
		void fetch('/api/chat/session', { method: 'DELETE', keepalive: true }).catch(() => {});
		window.location.replace('https://www.google.com');
	}

	async function reset() {
		await fetch('/api/chat/session', { method: 'DELETE' }).catch(() => {});
		chatSession = null;
		idempotencyKey = '';
		nextMessageId = 1;
		stage = 'start';
		chatStep = 'story';
		messages = [];
		safetyChoice = '';
		relation = '';
		victimName = '';
		victimNik = '';
		nikEditing = false;
		story = '';
		incidentTime = '';
		incidentLocation = '';
		need = '';
		contactPreference = '';
		contactDetails = '';
		privacyRead = false;
		input = '';
		addingStory = false;
		identityError = '';
		chatError = '';
		submitError = '';
		referenceCode = '';
		submittedAt = '';
		busy = false;
		await tick();
		startHeading?.focus();
	}
</script>

<svelte:head>
	<title>Chat Pengaduan | LAPOR AMAN</title>
</svelte:head>

<div class="chat-page" class:chat-stage={stage === 'chat'} class:review-stage={stage === 'review'}>
	{#if stage === 'receipt'}
		<section class="receipt chat-receipt" aria-labelledby="receipt-title">
			<div class="receipt-mark" aria-hidden="true"></div>
			<h1 id="receipt-title" tabindex="-1" bind:this={receiptHeading}>Laporan terkirim</h1>
			<p class="receipt-lead">
				Laporan masuk ke meja petugas. Simpan kode laporan untuk menanyakan tindak lanjut.
			</p>
			<dl class="receipt-facts">
				<div><dt>Kode laporan</dt><dd class="num">{referenceCode}</dd></div>
				<div><dt>Waktu</dt><dd>{submittedAt} WITA</dd></div>
			</dl>
			<p class="receipt-note">
				Laporan tersimpan di database LAPOR AMAN dan masuk antrean pemeriksaan petugas. Kode
				terbit setelah server menyimpan laporan. Petugas berwenang kemudian mencatat keputusan, dan
				notifikasi hanya berisi pemberitahuan umum.
			</p>
			<div class="receipt-actions">
				<button class="button-primary" type="button" onclick={reset}>Buat laporan baru</button>
				<a class="button-secondary" href="/">Kembali ke beranda</a>
			</div>
		</section>
	{:else}
		<header class="chat-page-heading">
			<h1 tabindex="-1" bind:this={startHeading}>Chat Pengaduan</h1>
			<a class="page-back" href="/">Kembali ke beranda</a>
		</header>

		{#if stage === 'start'}
			<section class="start-card" aria-labelledby="start-title">
				<h2 id="start-title">Sebelum mulai</h2>
				<div
					class="mode-panel"
					class:mode-operator={serviceMode === 'operator'}
					class:mode-unavailable={serviceMode === 'unavailable'}
				>
					<span class="mode-dot" aria-hidden="true"></span>
					<div>
						<strong>{modeLabel}</strong>
						<p>{modeDescription}</p>
					</div>
				</div>
				<p class:closed={!handoffAvailable} class="mode-hours">
					{#if handoffAvailable}
						Bantuan petugas langsung tersedia. Jam layanan: {SERVICE_HOURS_LABEL}.
					{:else}
						Bantuan petugas langsung belum tersedia. Jam layanan: {SERVICE_HOURS_LABEL}.
					{/if}
				</p>
				{#if dev && !handoffAvailable}
					<p class="dev-mode-link">
						Mode pengembangan:
						<a href="?mode=operator">buka mode layanan petugas</a> untuk menguji bantuan langsung.
					</p>
				{/if}

				<div class="privacy-strip">
					<strong>Gunakan perangkat yang aman.</strong>
					<p>
						Pesan chat tersimpan saat dikirim. Laporan resmi dibuat setelah Anda memeriksa dan mengonfirmasi draf. Pola NIK, nomor, email, dan nama yang jelas
						diredaksi sebelum cerita dapat diproses AI. Redaksi bersifat best-effort. Jangan
						masukkan data orang lain tanpa izin.
					</p>
				</div>

				{#if safetyChoice !== 'unsafe'}
					<div class="safety-question">
						<h3 tabindex="-1" bind:this={safetyHeading}>Apakah aman bagi Anda menulis di perangkat ini?</h3>
						<p>Jika ada orang lain yang dapat melihat layar ini, jangan lanjutkan di perangkat ini.</p>
						<div class="safety-actions">
							<button class="button-primary" type="button" onclick={chooseSafe}>
								Ya, saya aman
							</button>
							<button class="button-secondary" type="button" onclick={chooseUnsafe}>
								Tidak, saya tidak aman
							</button>
						</div>
					</div>
				{:else}
					<div class="unsafe-panel" role="alert">
						<h3 tabindex="-1" bind:this={unsafeHeading}>Jangan menulis di perangkat ini.</h3>
						<p>
							Tutup halaman ini atau gunakan Keluar cepat. Hubungi orang tepercaya atau layanan
							darurat dari perangkat yang aman.
						</p>
						<div class="safety-actions">
							<button class="button-primary" type="button" onclick={quickExit}>Keluar cepat</button>
							<button
								class="button-secondary"
								type="button"
								onclick={dismissUnsafe}>Kembali</button
							>
						</div>
					</div>
				{/if}

				<div class="start-links">
					<a href="/panduan" target="_blank" rel="noopener">Baca panduan dulu</a>
					<span aria-hidden="true">·</span>
					<a href="/panduan#bantuan" target="_blank" rel="noopener">Butuh pertolongan segera?</a>
				</div>
				<p class="start-footnote">
					Aplikasi ini membantu menyiapkan laporan. Penanganan dan pendampingan berlangsung di luar
					aplikasi.
				</p>
			</section>
		{:else if stage === 'identity'}
			<section class="identity-card" aria-labelledby="identity-title">
				<p class="step-kicker">Langkah 1 dari 3 · Data minimum</p> <!-- taste-skill-ignore: label progres fungsional -->
				<h2 id="identity-title" tabindex="-1" bind:this={identityHeading}>Sedikit tentang korban</h2>
				<p class="identity-lead">
					Nama korban wajib diisi. NIK opsional dan hanya dapat dilihat akun berwenang untuk
					tindak lanjut.
				</p>

				<fieldset class="relation-field">
					<legend>Anda melapor untuk siapa?</legend>
					<div class="relation-options">
						<label class="choice-card">
							<input
								bind:this={firstRelation}
								type="radio"
								bind:group={relation}
								value="Diri sendiri"
							/>
							<span><strong>Diri sendiri</strong><small>Saya yang mengalami kejadian.</small></span>
						</label>
						<label class="choice-card">
							<input type="radio" bind:group={relation} value="Keluarga atau pendamping" />
							<span
								><strong>Keluarga atau pendamping</strong><small
									>Saya mendampingi atau melapor untuk keluarga.</small
								></span
							>
						</label>
						<label class="choice-card">
							<input
								type="radio"
								bind:group={relation}
								value="Pihak lain yang mengetahui kejadian"
							/>
							<span
								><strong>Pihak lain</strong><small
									>Saya mengetahui kejadian dan ingin melapor.</small
								></span
							>
						</label>
					</div>
				</fieldset>

				<div class="field">
					<label for="victim-name">Nama lengkap atau nama panggilan korban</label>
					<input
						bind:this={nameInput}
						id="victim-name"
						maxlength="80"
						autocomplete="off"
						bind:value={victimName}
						placeholder="Contoh: Rani"
						aria-describedby="name-help"
					/>
					<p id="name-help" class="field-help">
						Tulis nama korban, bukan nama pelapor. Boleh nama samaran.
					</p>
				</div>

				<div class="field">
					<label for="victim-nik">NIK korban <span class="optional-label">(opsional)</span></label>
					<input
						bind:this={nikInput}
						id="victim-nik"
						inputmode="numeric"
						maxlength="16"
						autocomplete="off"
						bind:value={victimNik}
						oninput={() => (victimNik = normalizeNik(victimNik))}
						placeholder="16 digit, boleh dikosongkan"
						aria-describedby="nik-help"
					/>
					<p id="nik-help" class="field-help">
						Hanya akun berwenang yang dapat membuka NIK untuk tindak lanjut. Setiap pembukaan
						dicatat dalam audit.
					</p>
				</div>

				{#if identityError}<p class="form-error" role="alert">{identityError}</p>{/if}

				<div class="identity-actions">
					<button class="button-primary" type="button" onclick={startChat}>Mulai bercerita</button>
					<button class="button-secondary" type="button" onclick={() => (stage = 'start')}>
						Kembali
					</button>
				</div>
			</section>
		{/if}

{#if stage === 'chat'}
			<section class="chat-card" aria-label="Percakapan pengaduan">
				<header class="chat-card-bar">
					<div>
						<h2>Percakapan</h2>
						<p>{modeLabel}</p>
					</div>
					<div class="chat-bar-actions">
						{#if !handoffOpen}
							{#if handoffAvailable}
								<button
									class="bar-button handoff-trigger"
									type="button"
									onclick={requestHandoff}
									disabled={handoffBusy || busy}
								>
									{handoffBusy ? 'Menghubungkan...' : 'Minta bantuan petugas'}
								</button>
							{:else}
								<button
									class="bar-button handoff-unavailable"
									type="button"
									disabled
									title={`Bantuan petugas langsung tersedia ${SERVICE_HOURS_LABEL}.`}
								>
									Bantuan petugas
								</button>
							{/if}
						{/if}
						{#if isFieldStep && !handoffOpen}
							<button
								class="bar-button"
								type="button"
								title="Buka draf lebih awal"
								onclick={openReview}>Lihat draf</button
							>
						{/if}
						<a class="bar-button" href="/panduan#privasi" target="_blank" rel="noopener"
							>Privasi</a
						>
					</div>
				</header>

				<div class="chat-progress" aria-label={`Tahap percakapan: ${progressLabel}`}>
					<div class="progress-track" aria-hidden="true">
						<span class:active={chatStep === 'story'} class:done={chatStep !== 'story'}></span>
						<span class:active={isFieldStep} class:done={chatStep === 'open'}></span>
						<span class:active={chatStep === 'open'}></span>
					</div>
					<p>{progressLabel}</p>
				</div>

				{#if !handoffOpen && !handoffAvailable}
					<p class="handoff-hours">
						<strong>Bantuan petugas langsung belum tersedia.</strong>
						Jam layanan: {SERVICE_HOURS_LABEL}. Anda tetap dapat menyiapkan dan mengirim laporan.
						{#if dev}
							<a href="?mode=operator">Buka mode layanan petugas untuk pengujian.</a>
						{/if}
					</p>
				{/if}

				{#if handoff || handoffError}
					<div
						class:handoff-active={handoff?.status === 'active'}
						class:handoff-closed={handoff && !handoffOpen}
						class="handoff-banner"
						role="status"
					>
						<div>
							<strong>{handoff ? handoffStatusLabel(handoff.status) : 'Bantuan petugas'}</strong>
							<p>
								{handoff
									? handoffStatusCopy(handoff.status)
									: handoffError || 'Permintaan bantuan belum dapat diproses.'}
							</p>
							{#if handoff && handoffError}
								<p class="handoff-error" role="alert">{handoffError}</p>
							{/if}
						</div>
						<div class="handoff-banner-actions">
							{#if handoffOpen}
								<button
									class="handoff-cancel"
									type="button"
									onclick={cancelHandoff}
									disabled={handoffBusy}
								>
									{handoffBusy ? 'Memproses...' : handoff?.status === 'waiting' ? 'Batalkan' : 'Akhiri bantuan'}
								</button>
							{:else if handoff}
								<button class="handoff-cancel" type="button" onclick={dismissHandoffNotice}>
									Tutup
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<div
					class="message-log"
					bind:this={chatLog}
					role="log"
					aria-live="polite"
					aria-relevant="additions"
					aria-label="Pesan percakapan"
				>
					{#each messages as message (message.id)}
						<article
							class:from-user={message.sender === 'user'}
							class:from-staff={message.sender === 'staff'}
							class:from-service={message.sender === 'service'}
							class="message"
						>
							<strong>
								{messageLabel(message)}
								{#if message.source === 'fallback' && serviceMode === 'ai' && aiEnabled}
									<span class="message-source">Panduan terstruktur</span>
								{/if}
							</strong>
							<p>{message.body}</p>
						</article>
					{/each}
				</div>

				<div class="composer">
					{#if chatStep === 'open'}
						<div class:finish-locked={handoffOpen} class="finish-bar">
							<div class="finish-copy">
								<strong>{handoffOpen ? 'Bantuan petugas masih terbuka' : 'Sudah cukup?'}</strong>
								<p>
									{handoffOpen
										? 'Selesaikan percakapan dengan petugas sebelum membuka draf.'
										: 'Anda bisa terus menulis atau menyelesaikan percakapan untuk memeriksa draf.'}
								</p>
							</div>
							<button
								class="button-primary finish-button"
								type="button"
								bind:this={reviewButton}
								onclick={openReview}
								disabled={handoffOpen}
							>
								{handoffOpen ? 'Menunggu bantuan petugas' : 'Selesai dan periksa draf'}
							</button>
						</div>
					{/if}

					{#if !addingStory && isFieldStep && !handoffOpen}
						<div class="quick-replies" aria-label="Pilihan cepat">
							{#if chatStep === 'time'}
								<button type="button" onclick={() => answerTime('Hari ini')}>Hari ini</button>
								<button type="button" onclick={() => answerTime('Kemarin')}>Kemarin</button>
								<button type="button" onclick={() => answerTime('Minggu ini')}>Minggu ini</button>
								<button type="button" onclick={() => answerTime('Belum diketahui')}
									>Belum tahu</button
								>
								<button type="button" onclick={() => answerTime('Tercantum dalam cerita')}
									>Sudah ada di cerita</button
								>
							{:else if chatStep === 'location'}
								<button type="button" onclick={() => answerLocation('Rumah')}>Rumah</button>
								<button type="button" onclick={() => answerLocation('Sekolah')}>Sekolah</button>
								<button type="button" onclick={() => answerLocation('Tempat kerja')}
									>Tempat kerja</button
								>
								<button type="button" onclick={() => answerLocation('Belum diketahui')}
									>Belum tahu</button
								>
								<button type="button" onclick={() => answerLocation('Tercantum dalam cerita')}
									>Sudah ada di cerita</button
								>
							{:else if chatStep === 'need'}
								<button type="button" onclick={() => answerNeed('Pendampingan')}
									>Pendampingan</button
								>
								<button type="button" onclick={() => answerNeed('Pemeriksaan kesehatan')}
									>Pemeriksaan kesehatan</button
								>
								<button type="button" onclick={() => answerNeed('Informasi hukum')}
									>Informasi hukum</button
								>
								<button type="button" onclick={() => answerNeed('Belum diketahui')}
									>Belum tahu</button
								>
							{/if}
						</div>
					{/if}

					<form class="composer-form" onsubmit={handleComposerSubmit}>
						<label for="chat-answer">{composerLabel}</label>
						<div class="composer-row">
							<textarea
								id="chat-answer"
								bind:this={composer}
								bind:value={input}
								onkeydown={handleComposerKeydown}
								rows={handoffOpen || addingStory || chatStep === 'story' || chatStep === 'open' ? 4 : 2}
								maxlength={MESSAGE_LIMIT}
								placeholder={composerPlaceholder}
								aria-describedby="composer-help"
							></textarea>
							<button
								class="button-primary send-button"
								type="submit"
								disabled={busy || handoffBusy}
							>
								{busy || handoffBusy ? 'Mengirim...' : 'Kirim'}
							</button>
						</div>
						<div class="composer-meta">
							<p id="composer-help">
								{#if handoffOpen}
									Pesan ini dikirim ke petugas, bukan ke AI. Jangan tulis NIK atau kontak lengkap.
								{:else if addingStory}
									Tambahan cerita akan masuk ke keterangan Anda.
								{:else if chatStep === 'open'}
									Percakapan tetap terbuka sampai Anda menekan Selesai. Keterangan tambahan ikut masuk ke draf yang dapat Anda periksa.
								{:else}
									Anda bisa bertanya soal alur kapan saja. Jangan masukkan data orang lain
									tanpa izin.
								{/if}
							</p>
							{#if chatStep !== 'story' && !handoffOpen}
								<div class="composer-links">
									<button class="link-button" type="button" onclick={toggleAddingStory}>
										{addingStory ? 'Batal tambah cerita' : 'Tambah cerita'}
									</button>
									{#if !addingStory && isFieldStep}
										<button class="link-button" type="button" onclick={skipCurrent}>
											Lewati pertanyaan ini
										</button>
									{/if}
								</div>
							{/if}
						</div>
						{#if chatError}<p class="form-error" role="alert">{chatError}</p>{/if}
					</form>

					<p class="help-line">
						<strong>Butuh pertolongan segera?</strong> Hubungi layanan darurat atau orang tepercaya di
						sekitar Anda.
					</p>
				</div>
			</section>
			<p class="chat-footnote">
				Laporan tersimpan di server LAPOR AMAN dan masuk antrean petugas. Jangan bagikan kode laporan
				kepada orang yang tidak berwenang.
			</p>
		{:else if stage === 'review'}
			<section class="review-card" aria-labelledby="review-title">
				<header class="review-header">
					<div>
						<p class="step-kicker">Langkah 3 dari 3 · Sebelum kirim</p> <!-- taste-skill-ignore: label progres fungsional -->
						<h2 id="review-title" tabindex="-1" bind:this={reviewHeading}>Periksa draf Anda</h2>
						<p>Ini masih draf. Perbaiki bagian yang belum tepat, lalu konfirmasi.</p>
						<p class="review-mode">
							{modeLabel}. Laporan akan masuk ke meja petugas setelah dikirim.
						</p>
					</div>
					<span class="draft-chip">Belum dikirim</span>
				</header>

				<section class="review-section" aria-labelledby="story-review-title">
					<h3 id="story-review-title">Cerita Anda</h3>
					<label for="review-story">Keterangan pelapor</label>
					<textarea id="review-story" rows="4" maxlength={STORY_LIMIT} bind:value={story}></textarea>
					<p class="field-help">
						Tulisan ini adalah keterangan Anda, bukan kesimpulan petugas.
					</p>
				</section>

				<section class="review-section" aria-labelledby="summary-review-title">
					<h3 id="summary-review-title">Ringkasan terstruktur</h3>
					<div class="review-grid">
						<label class="field field-wide"
							>Nama korban
							<input
								bind:this={nameReviewInput}
								maxlength="80"
								autocomplete="off"
								bind:value={victimName}
							/>
						</label>
						<div class="field field-wide">
							{#if nikEditing}
								<label for="review-nik">NIK korban (opsional)</label>
								<input
									bind:this={nikReviewInput}
									id="review-nik"
									inputmode="numeric"
									maxlength="16"
									autocomplete="off"
									bind:value={victimNik}
									oninput={() => (victimNik = normalizeNik(victimNik))}
									placeholder="16 digit, boleh dikosongkan"
									aria-describedby="review-nik-help"
								/>
							{:else}
								<span class="field-label">NIK korban (opsional)</span>
								<p class="nik-review-value">
									<span class="num">{maskNik(victimNik)}</span>
									<button class="link-button nik-edit-button" type="button" onclick={editNik}>
										{victimNik ? 'Ubah NIK' : 'Isi NIK'}
									</button>
								</p>
							{/if}
							<p id="review-nik-help" class="field-help">
								Hanya akun berwenang yang dapat membuka NIK untuk tindak lanjut. NIK tidak
								ditampilkan di daftar meja petugas.
							</p>
						</div>
						<label class="field"
							>Hubungan dengan korban
							<select bind:value={relation}>
								<option value="Diri sendiri">Diri sendiri</option>
								<option value="Keluarga atau pendamping">Keluarga atau pendamping</option>
								<option value="Pihak lain yang mengetahui kejadian"
									>Pihak lain yang mengetahui kejadian</option
								>
							</select>
						</label>
						<label class="field"
							>Waktu kejadian
							<input maxlength="160" bind:value={incidentTime} />
						</label>
						<label class="field"
							>Lokasi umum
							<input maxlength="200" bind:value={incidentLocation} />
						</label>
						<label class="field"
							>Bantuan yang diharapkan
							<input maxlength="300" bind:value={need} />
						</label>
					</div>
					<p class="field-help">
						Kategori kejadian tidak ditetapkan otomatis. Petugas berwenang akan memeriksa laporan.
					</p>
				</section>

				<section class="review-section" aria-labelledby="unknown-title">
					<h3 id="unknown-title">Informasi yang belum diketahui</h3>
					{#if unknownFields.length}
						<ul class="unknown-list">
							{#each unknownFields as item}<li>{item}</li>{/each}
						</ul>
						<p class="field-help">
							Bagian ini boleh tetap kosong. Anda tidak perlu melengkapinya untuk mengirim.
						</p>
					{:else}
						<p>Semua bagian utama sudah terisi.</p>
					{/if}
				</section>

				<section class="review-section contact-section" aria-labelledby="contact-title">
					<h3 id="contact-title">Preferensi kontak aman</h3>
					<p>Petugas tidak akan menghubungi Anda tanpa izin. Pilih kondisi yang paling aman.</p>
					<fieldset>
						<legend class="sr-only">Apakah Anda aman dihubungi?</legend>
						<div class="contact-options">
							<label class="choice-card">
								<input
									bind:this={contactNo}
									type="radio"
									bind:group={contactPreference}
									value="no"
								/>
								<span
									><strong>Tidak aman dihubungi</strong><small
										>Laporan tetap dapat dikirim tanpa kontak.</small
									></span
								>
							</label>
							<label class="choice-card">
								<input type="radio" bind:group={contactPreference} value="yes" />
								<span
									><strong>Aman dihubungi</strong><small
										>Saya akan menulis cara dan waktu yang aman.</small
									></span
								>
							</label>
						</div>
					</fieldset>
					{#if contactPreference === 'yes'}
						<div class="field">
							<label for="contact-details">Cara, waktu, dan batasan kontak yang aman</label>
							<textarea
								id="contact-details"
								rows="3"
								maxlength="500"
								bind:value={contactDetails}
								placeholder="Contoh: WhatsApp pada pukul 10.00-12.00. Jangan sebut nama saya."
							></textarea>
							<p class="field-help">Tulis “belum tahu” jika Anda belum dapat menentukannya.</p>
						</div>
					{:else if contactPreference === 'no'}
						<p class="contact-note">
							Petugas tidak akan menghubungi melalui kontak pribadi. Pilihan ini tidak membatalkan
							laporan.
						</p>
					{/if}
				</section>

				<section class="privacy-section" aria-labelledby="privacy-title">
					<h3 id="privacy-title">Pemberitahuan privasi</h3>
					<ul>
						<li>Tujuan: menyiapkan dan memeriksa pengaduan.</li>
						<li>Data: cerita, ringkasan, nama/hubungan, NIK opsional, dan preferensi kontak.</li>
						<li>
							Akses NIK: hanya akun berwenang dengan peran admin yang dapat membuka NIK. Daftar
							meja petugas tidak menampilkan NIK. Setiap pembukaan dicatat dalam audit.
						</li>
						<li>Akses: hanya akun staff yang masuk dan memiliki peran sesuai.</li>
						<li>
							AI: pada mode AI, pola NIK, nomor, email, dan nama yang jelas diredaksi sebelum cerita
							dapat diproses untuk menyusun tanggapan dan satu pertanyaan pelengkap per giliran. AI
							tidak mengambil keputusan.
						</li>
						<li>
							Penyedia AI: NVIDIA. Redaksi bersifat best-effort, bukan jaminan anonimisasi; jangan
							menulis identitas yang tidak perlu.
						</li>
						<li>
							Laporan tersimpan di database LAPOR AMAN dan hanya dapat diakses petugas berwenang.
						</li>
					</ul>
					<p>
						<a href="/panduan#privasi" target="_blank" rel="noopener">Baca rincian privasi</a>
					</p>
					<label class="privacy-check">
						<input
							bind:this={privacyCheckbox}
							type="checkbox"
							bind:checked={privacyRead}
						/>
						<span>Saya sudah membaca pemberitahuan privasi dan menyetujui pemrosesan laporan ini.</span>
					</label>
				</section>

				{#if submitError}<p class="form-error submit-error" role="alert">{submitError}</p>{/if}

				<div class="review-actions">
					<button
						class="button-primary"
						type="button"
						onclick={submitReport}
						disabled={busy}>{busy ? 'Menyimpan...' : 'Konfirmasi dan kirim laporan'}</button
					>
					<button class="button-secondary" type="button" onclick={backToChat}>Kembali ke chat</button>
				</div>
				<button class="link-button reset-button" type="button" onclick={reset}
					>Mulai ulang dari awal</button
				>
			</section>
		{/if}
	{/if}
</div>

<style>
	.chat-page {
		width: min(760px, calc(100% - 32px));
		margin: 0 auto;
		padding: 20px 0 56px;
	}
	.chat-page.chat-stage { width: min(960px, calc(100% - 32px)); }
	.chat-page.review-stage { width: min(860px, calc(100% - 32px)); }
	.chat-page-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
	}
	.chat-page-heading h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.45rem, 3vw, 2rem);
		line-height: 1.1;
		letter-spacing: -0.025em;
	}
	.page-back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--muted);
		font-size: 0.84rem;
		font-weight: 700;
	}
	.page-back:hover { color: var(--teal-dark); }
	.chat-page h1[tabindex='-1']:focus,
	.chat-page h2[tabindex='-1']:focus { outline: none; }
	.chat-page h3[tabindex='-1']:focus { outline: 3px solid var(--focus); outline-offset: 4px; }
	.start-card,
	.identity-card,
	.review-card {
		background: #fff;
		border: 1px solid var(--border);
	}
	.start-card {
		padding: 26px;
		border-top: 4px solid var(--teal);
	}
	.start-card > h2 {
		margin: 0 0 16px;
		font-family: var(--font-display);
		font-size: clamp(1.7rem, 3vw, 2.2rem);
		line-height: 1.1;
		letter-spacing: -0.025em;
	}
	.mode-panel {
		display: flex;
		gap: 12px;
		padding: 14px 16px;
		border-left: 4px solid var(--teal);
		background: var(--surface);
	}
	.mode-dot {
		width: 10px;
		height: 10px;
		flex: 0 0 auto;
		margin-top: 5px;
		border-radius: 50%;
		background: var(--teal);
	}
	.mode-panel strong { display: block; font-size: 0.95rem; }
	.mode-panel p { margin: 4px 0 0; color: var(--muted); font-size: 0.9rem; }
	.mode-panel.mode-operator { border-left-color: var(--magenta); background: #fdeff5; }
	.mode-panel.mode-operator .mode-dot { background: var(--magenta); }
	.mode-panel.mode-unavailable { border-left-color: #b58a1b; background: #f7f4e8; }
	.mode-panel.mode-unavailable .mode-dot { background: #b58a1b; }
	.mode-hours {
		margin: 8px 0 0;
		padding-left: 26px;
		color: var(--teal-dark);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.mode-hours.closed { color: #7a5a10; }
	.dev-mode-link {
		margin: 4px 0 0;
		padding-left: 26px;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.dev-mode-link a,
	.handoff-hours a {
		color: var(--teal-dark);
		font-weight: 800;
	}
	.privacy-strip {
		margin-top: 14px;
		padding: 13px 16px;
		border-left: 4px solid #d4a72c;
		background: var(--attention);
		color: #493a0b;
	}
	.privacy-strip p { margin: 4px 0 0; font-size: 0.88rem; }
	.safety-question { margin-top: 26px; }
	.safety-question h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.45rem, 3vw, 1.8rem);
		line-height: 1.15;
	}
	.safety-question p { margin: 8px 0 0; color: var(--muted); }
	.safety-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
	.safety-actions .button-primary,
	.safety-actions .button-secondary { min-height: 50px; }
	.unsafe-panel {
		margin-top: 26px;
		padding: 18px;
		border-left: 4px solid var(--danger);
		background: #fff1f1;
	}
	.unsafe-panel h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.45rem;
		line-height: 1.15;
	}
	.unsafe-panel p { margin: 8px 0 0; color: #5d2528; }
	.start-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		margin-top: 24px;
		padding-top: 16px;
		border-top: 1px solid var(--rule);
		font-size: 0.9rem;
	}
	.start-links a { display: inline-flex; min-height: 44px; align-items: center; color: var(--teal-dark); font-weight: 800; }
	.start-footnote { margin: 12px 0 0; color: var(--muted); font-size: 0.82rem; }
	.identity-card {
		padding: 26px;
		border-top: 4px solid var(--teal);
	}
	.step-kicker {
		margin: 0 0 8px;
		color: var(--teal-dark);
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.identity-card h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.7rem, 3vw, 2.2rem);
		line-height: 1.1;
		letter-spacing: -0.025em;
	}
	.identity-lead { margin: 8px 0 0; color: var(--muted); }
	.relation-field { margin: 24px 0 0; padding: 0; border: 0; }
	.relation-field legend { margin-bottom: 10px; font-weight: 800; }
	.relation-options,
	.contact-options { display: grid; gap: 10px; }
	.choice-card {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-height: 58px;
		padding: 14px;
		border: 1px solid var(--border);
		background: #fff;
		cursor: pointer;
	}
	.choice-card:hover { border-color: #89a4aa; }
	.choice-card:has(input:checked) {
		border-color: var(--teal);
		border-left-width: 4px;
		background: #e9f5f3;
		padding-left: 11px;
	}
	.choice-card:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 3px;
	}
	.choice-card input {
		width: 20px;
		height: 20px;
		flex: 0 0 auto;
		margin: 2px 0 0;
		accent-color: var(--teal);
	}
	.choice-card strong,
	.choice-card small { display: block; }
	.choice-card small { margin-top: 2px; color: var(--muted); font-size: 0.86rem; }
	.field { display: grid; gap: 7px; margin-top: 20px; }
	.field > label { font-size: 0.9rem; font-weight: 800; }
	.field input,
	.field textarea,
	.field select {
		width: 100%;
		min-height: 48px;
		border: 1px solid #849ba4;
		border-radius: var(--radius-control);
		background: #fff;
		color: var(--ink);
		padding: 11px 13px;
	}
	.field textarea { min-height: 96px; resize: vertical; }
	.field-help { margin: 0; color: var(--muted); font-size: 0.82rem; }
	.optional-label { color: var(--muted); font-size: 0.86rem; font-weight: 600; }
	.form-error { margin: 12px 0 0; color: var(--danger); font-weight: 800; }
	.identity-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 24px;
		padding-top: 20px;
		border-top: 1px solid var(--rule);
	}
	.identity-actions .button-primary { flex: 1 1 220px; }
	.chat-card {
		display: flex;
		flex-direction: column;
		height: clamp(480px, calc(100dvh - 220px), 760px);
		overflow: hidden;
		border: 1px solid var(--border);
		background: #fff;
	}
	.chat-card-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 62px;
		padding: 10px 18px;
		background: var(--navy);
		color: #fff;
	}
	.chat-card-bar h2 { margin: 0; font-size: 1rem; }
	.chat-card-bar p { margin: 2px 0 0; color: #c6dfe4; font-size: 0.76rem; }
	.chat-bar-actions { display: flex; align-items: center; gap: 14px; }
	.bar-button {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		border: 0;
		background: transparent;
		color: #fff;
		padding: 0 2px;
		font-size: 0.84rem;
		font-weight: 800;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.bar-button:hover { color: var(--yellow); }
	.chat-progress {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 18px;
		border-bottom: 1px solid var(--rule);
		background: #f7faf9;
	}
	.progress-track { display: flex; flex: 0 0 120px; gap: 5px; }
	.progress-track span { height: 5px; flex: 1; background: #dce5e7; }
	.progress-track span.active { background: var(--magenta); }
	.progress-track span.done { background: var(--teal); }
	.chat-progress p { margin: 0; color: var(--muted); font-size: 0.78rem; }
	.message-log {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 20px;
		background: #f7faf9;
		scrollbar-color: #8ca4a9 #f7faf9;
	}
	.message {
		width: fit-content;
		max-width: min(82%, 620px);
		align-self: flex-start;
		padding: 12px 14px;
		border: 1px solid #dbe6e4;
		border-radius: 4px 14px 14px 14px;
		background: #fff;
	}
	.message strong {
		display: block;
		margin-bottom: 4px;
		color: var(--teal-dark);
		font-size: 0.74rem;
		letter-spacing: 0.02em;
	}
	.message-source {
		display: inline-block;
		margin-left: 6px;
		padding: 1px 6px;
		border: 1px solid #d9b8c8;
		border-radius: 999px;
		color: #8a3d62;
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.message p {
		margin: 0;
		color: var(--ink);
		overflow-wrap: anywhere;
		text-wrap: pretty;
		white-space: pre-wrap;
	}
	.message.from-user {
		align-self: flex-end;
		border-color: var(--navy);
		border-radius: 14px 4px 14px 14px;
		background: var(--navy);
	}
	.message.from-user strong { color: #a9dbd7; }
	.message.from-user p { color: #fff; }
	.message.from-staff {
		border-color: #b51761;
		border-left-width: 4px;
		background: #fff5f9;
	}
	.message.from-staff strong { color: var(--magenta-dark); }
	.message.from-service {
		border-style: dashed;
		background: #f7faf9;
	}
	.message.from-service strong { color: var(--muted); }
	.handoff-trigger {
		border: 1px solid var(--yellow);
		border-radius: 999px;
		padding: 0 12px;
		background: var(--yellow);
		color: var(--navy);
		font-weight: 800;
	}
	.handoff-trigger:hover { background: #ffdc85; color: var(--navy); }
	.handoff-trigger:disabled { opacity: 0.7; }
	.handoff-unavailable {
		color: #c6dfe4;
		text-decoration: none;
		cursor: not-allowed;
	}
	.handoff-unavailable:hover { color: #c6dfe4; }
	.handoff-hours {
		margin: 0;
		padding: 9px 18px;
		border-bottom: 1px solid #e7d8a6;
		background: #fffdf3;
		color: #5b470d;
		font-size: 0.78rem;
		text-wrap: pretty;
	}
	.handoff-hours strong { margin-right: 4px; }
	.handoff-banner {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
		padding: 12px 18px;
		border-left: 5px solid var(--yellow);
		border-bottom: 1px solid #e7d8a6;
		background: var(--attention);
		color: #493a0b;
	}
	.handoff-banner.handoff-active {
		border-left-color: var(--teal);
		border-bottom-color: #b8d8d2;
		background: var(--surface-teal);
		color: #214f4e;
	}
	.handoff-banner.handoff-closed {
		border-left-color: #8da6ad;
		border-bottom-color: var(--border);
		background: var(--surface);
		color: var(--ink);
	}
	.handoff-banner strong { display: block; font-size: 0.92rem; }
	.handoff-banner p { margin: 3px 0 0; font-size: 0.82rem; text-wrap: pretty; }
	.handoff-banner .handoff-error { color: var(--danger); font-weight: 700; }
	.handoff-banner-actions { flex: 0 0 auto; }
	.handoff-cancel {
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid currentColor;
		border-radius: var(--radius-control);
		background: transparent;
		color: inherit;
		font-size: 0.8rem;
		font-weight: 800;
	}
	.handoff-cancel:hover { background: rgb(255 255 255 / 55%); }
	.handoff-cancel:disabled { opacity: 0.6; }
	.finish-locked {
		border-left-color: #b8830b;
		background: var(--attention);
	}
	.finish-locked p { color: #5b470d; }
	.composer {
		flex: 0 0 auto;
		padding: 14px 18px 12px;
		border-top: 1px solid var(--border);
		background: #fff;
	}
	.quick-replies { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
	.quick-replies button {
		min-height: 42px;
		padding: 8px 12px;
		border: 1px solid #8da6ad;
		border-radius: 999px;
		background: #fff;
		color: var(--navy);
		font-size: 0.86rem;
		font-weight: 750;
		text-align: left;
	}
	.quick-replies button:hover { border-color: var(--teal); background: var(--surface-teal); }
	.composer-form > label {
		display: block;
		margin-bottom: 6px;
		font-size: 0.82rem;
		font-weight: 800;
	}
	.composer-row { display: flex; align-items: flex-end; gap: 8px; }
	.composer-row textarea {
		flex: 1;
		min-height: 48px;
		max-height: 140px;
		padding: 11px 13px;
		border: 1px solid #849ba4;
		border-radius: var(--radius-control);
		background: #fff;
		color: var(--ink);
		resize: vertical;
	}
	.send-button { flex: 0 0 auto; min-width: 88px; min-height: 48px; padding: 0 16px; }
	.composer-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 7px;
	}
	.composer-meta p { margin: 0; color: var(--muted); font-size: 0.74rem; }
	.link-button {
		min-height: 44px;
		border: 0;
		background: transparent;
		color: var(--teal-dark);
		padding: 0;
		font-weight: 800;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.help-line {
		margin: 8px 0 0;
		padding-top: 8px;
		border-top: 1px solid var(--rule);
		color: var(--muted);
		font-size: 0.76rem;
	}
	.help-line strong { color: var(--ink); }
	.finish-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
		padding: 12px 14px;
		border-left: 4px solid var(--teal);
		background: var(--surface-teal);
	}
	.finish-copy { flex: 1 1 320px; }
	.finish-bar strong { display: block; font-size: 0.95rem; }
	.finish-bar p { margin: 4px 0 0; color: #355d62; font-size: 0.84rem; }
	.finish-button { flex: 0 0 auto; min-height: 48px; }
	.composer-links { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }
	.chat-footnote {
		max-width: 760px;
		margin: 12px auto 0;
		color: var(--muted);
		font-size: 0.8rem;
		text-align: center;
	}
	.review-card {
		padding: 26px;
		border-top: 4px solid var(--navy);
	}
	.review-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
		padding-bottom: 18px;
		border-bottom: 1px solid var(--border);
	}
	.review-header h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 3.2vw, 2.4rem);
		line-height: 1.1;
		letter-spacing: -0.025em;
	}
	.review-header p:last-child { margin: 8px 0 0; color: var(--muted); }
	.review-header p.review-mode { color: var(--teal-dark); font-size: 0.78rem; font-weight: 800; }
	.draft-chip {
		flex: 0 0 auto;
		padding: 5px 9px;
		border-radius: 4px;
		background: var(--attention);
		color: #644d06;
		font-size: 0.76rem;
		font-weight: 800;
	}
	.review-section { padding: 20px 0; border-bottom: 1px solid var(--rule); }
	.review-section h3 { margin: 0 0 12px; font-size: 1.02rem; }
	.review-section > p { margin: 0 0 12px; color: var(--muted); }
	.review-section > label {
		display: block;
		margin-bottom: 6px;
		font-size: 0.86rem;
		font-weight: 800;
	}
	.review-section textarea,
	.review-section input:not([type='radio']):not([type='checkbox']),
	.review-section select {
		width: 100%;
		min-height: 48px;
		border: 1px solid #849ba4;
		border-radius: var(--radius-control);
		background: #fff;
		color: var(--ink);
		padding: 11px 13px;
	}
	.review-section textarea { min-height: 112px; resize: vertical; }
	.review-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
	.review-grid .field { margin-top: 0; font-size: 0.86rem; font-weight: 800; }
	.review-grid .field-wide { grid-column: 1 / -1; }
	.field-label { font-size: 0.9rem; font-weight: 800; }
	.nik-review-value {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px 12px;
		min-height: 48px;
		margin: 0;
		padding: 8px 13px;
		border: 1px dashed #8da6ad;
		border-radius: var(--radius-control);
		background: var(--surface);
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
	}
	.nik-edit-button { margin-left: auto; min-height: 36px; font-size: 0.82rem; }
	.unknown-list { margin: 0; padding-left: 20px; color: var(--ink); }
	.unknown-list li + li { margin-top: 4px; }
	.contact-section fieldset { margin: 0; padding: 0; border: 0; }
	.contact-note {
		margin: 12px 0 0;
		padding: 10px 12px;
		background: var(--surface-teal);
		color: #355d62;
		font-size: 0.86rem;
	}
	.privacy-section {
		margin-top: 20px;
		padding: 18px;
		background: var(--attention);
		color: #493a0b;
	}
	.privacy-section h3 { margin: 0 0 10px; font-size: 1.02rem; }
	.privacy-section ul {
		display: grid;
		gap: 6px;
		margin: 0;
		padding-left: 20px;
		font-size: 0.88rem;
	}
	.privacy-section a { color: #493a0b; font-weight: 800; }
	.privacy-check {
		display: flex;
		align-items: flex-start;
		gap: 11px;
		margin-top: 14px;
		font-weight: 800;
	}
	.privacy-check input {
		width: 20px;
		height: 20px;
		flex: 0 0 auto;
		margin: 2px 0 0;
		accent-color: var(--teal);
	}
	.review-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 20px;
	}
	.review-actions .button-primary { min-height: 50px; }
	.reset-button {
		display: block;
		margin: 12px 0 0 auto;
		color: var(--muted);
		font-size: 0.84rem;
	}
	.chat-receipt {
		max-width: 680px;
		margin: 32px auto;
		padding: 40px;
		border-top: 4px solid var(--teal);
	}
	.chat-receipt h1 {
		margin: 4px 0 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 1.05;
	}
	.receipt-lead { margin: 10px 0 0; color: var(--muted); }
	.receipt-facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin: 24px 0 0;
		border: 1px solid var(--border);
		background: var(--border);
		text-align: left;
	}
	.receipt-facts div { padding: 14px; background: #fff; }
	.receipt-facts dt { color: var(--muted); font-size: 0.76rem; }
	.receipt-facts dd { margin: 4px 0 0; font-weight: 800; overflow-wrap: anywhere; }
	.receipt-note {
		margin: 20px 0 0;
		color: var(--muted);
		font-size: 0.9rem;
		text-align: left;
	}
	.receipt-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
		margin-top: 24px;
	}
	@media (max-width: 680px) {
		.chat-page { width: calc(100% - 32px); padding: 12px 0 32px; }
		.chat-page-heading { margin-bottom: 10px; }
		.chat-page-heading h1 { font-size: 1.4rem; }
		.page-back { font-size: 0.78rem; }
		.start-card,
		.identity-card,
		.review-card { padding: 18px; }
		.safety-actions { flex-direction: column; }
		.safety-actions button { width: 100%; }
		.start-links { flex-direction: column; align-items: flex-start; gap: 0; }
		.start-links span { display: none; }
		.chat-card {
			height: calc(100dvh - 180px);
			min-height: 460px;
		}
		.chat-card-bar { padding: 8px 12px; }
		.chat-card-bar p { font-size: 0.7rem; }
		.chat-bar-actions { gap: 10px; }
		.bar-button { font-size: 0.78rem; }
		.chat-progress { padding: 8px 12px; gap: 8px; }
		.progress-track { flex-basis: 90px; }
		.chat-progress p { font-size: 0.72rem; }
		.handoff-banner { flex-direction: column; gap: 8px; padding: 10px 12px; }
		.handoff-banner-actions { width: 100%; }
		.handoff-cancel { width: 100%; }
		.message-log { padding: 14px 12px; gap: 10px; }
		.message { max-width: 88%; }
		.composer { padding: 10px 12px 8px; }
		.quick-replies { gap: 6px; margin-bottom: 8px; }
		.quick-replies button { min-height: 44px; padding: 7px 10px; font-size: 0.8rem; }
		.composer-row { gap: 6px; }
		.send-button { min-width: 74px; padding: 0 12px; }
		.composer-meta { align-items: flex-start; flex-direction: column; gap: 2px; }
		.finish-bar { padding: 10px 12px; gap: 8px; }
		.finish-button { width: 100%; }
		.help-line { font-size: 0.72rem; }
		.review-grid { grid-template-columns: 1fr; }
		.review-header { flex-direction: column; }
		.review-actions { flex-direction: column; }
		.review-actions button { width: 100%; }
		.review-actions .button-secondary { order: 2; }
		.reset-button { margin-inline: auto; }
		.chat-receipt { margin: 16px 0; padding: 28px 18px; }
		.receipt-facts { grid-template-columns: 1fr; }
		.receipt-actions { flex-direction: column; }
		.receipt-actions .button-primary,
		.receipt-actions .button-secondary { width: 100%; }
	}
</style>
