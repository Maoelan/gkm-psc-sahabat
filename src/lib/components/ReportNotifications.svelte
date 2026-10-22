<script lang="ts">
	import { onMount } from 'svelte';
	let { account }: { account: string } = $props();
	let unseen = $state(0), available = $state(true), latest = $state(0);
	let since = 0;
	onMount(() => {
		const key = `psc-reports-seen:${account}`;
		try { const saved = Number(localStorage.getItem(key)); since = Number.isFinite(saved) ? saved : 0; } catch { /* Notifications still work for this visit. */ }
		let ended = false; let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			if (ended) return;
			try {
				if (!document.hidden) {
					const response = await fetch('/api/staff/notifications');
					if (!response.ok) { available = false; return; }
					const payload = await response.json() as { reports: { submittedAt: number }[] };
					if (ended) return;
					available = true;
					latest = Math.max(0, ...payload.reports.map(r => r.submittedAt));
					unseen = payload.reports.filter(r => r.submittedAt > since).length;
				}
			} catch { if (!ended) available = false; }
			finally { if (!ended) timer = setTimeout(poll, 12000); }
		}
		function visible() { clearTimeout(timer); void poll(); }
		void poll(); document.addEventListener('visibilitychange', visible);
		return () => { ended = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
	});
	function read() { since = latest; unseen = 0; try { localStorage.setItem(`psc-reports-seen:${account}`, String(since)); } catch { /* No storage is required to open the inbox. */ } }
</script>
<a class="report-notifications" href="/petugas" onclick={read} aria-label={available ? `${unseen} laporan baru. Buka laporan masuk.` : 'Notifikasi belum tersambung. Buka laporan masuk.'}>
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20h4" /></svg><span>{available ? unseen ? `${unseen} laporan baru` : 'Laporan masuk' : 'Periksa laporan'}</span>
</a>
<span class="sr-only" role="status" aria-live="polite">{available && unseen ? `${unseen} laporan baru tersedia.` : ''}</span>
<style>.report-notifications{display:flex;align-items:center;gap:8px;min-height:44px;font-size:.85rem;font-weight:600;color:var(--navy);text-decoration:none}.report-notifications svg{flex-shrink:0}@media(max-width:600px){.report-notifications span{max-width:70px;font-size:.75rem}}@media(max-width:380px){.report-notifications span{max-width:52px}.report-notifications{gap:5px}}</style>
