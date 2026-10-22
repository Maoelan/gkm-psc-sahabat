<script lang="ts">
	import { formatNik } from '../reports';
	let { id, isAdmin, contactPreference }: { id: string; isAdmin: boolean; contactPreference: string } = $props();
	let nik = $state(''), contact = $state(''), message = $state(''), busy = $state(false);
	$effect(() => { if (id) { nik = ''; contact = ''; message = ''; } });
	async function reveal(kind: 'nik' | 'contact') {
		if (busy) return;
		if (kind === 'nik' && nik) { nik = ''; return; }
		if (kind === 'contact' && contact) { contact = ''; return; }
		busy = true; message = '';
		const requestedId = id;
		try {
			const r = await fetch(`/api/staff/reports/${encodeURIComponent(id)}/${kind}`); const p = await r.json();
			if (id !== requestedId) return;
			if (!r.ok) throw new Error(p.error || 'Data belum dapat dibuka.');
			if (kind === 'nik') nik = p.nik || ''; else contact = p.contact || '';
			message = p[kind] ? 'Akses dicatat dalam audit.' : 'Data tidak diisi atau tidak diizinkan untuk digunakan.';
		} catch (e) { message = e instanceof Error ? e.message : 'Data belum dapat dibuka.'; }
		finally { busy = false; }
	}
</script>
<section class="report-identity" aria-label="Identitas dan kontak pelapor"><h3>Identitas dan kontak</h3>
	{#if isAdmin}<div><span>NIK korban</span><button type="button" class="link-button" onclick={() => reveal('nik')} disabled={busy}>{nik ? 'Sembunyikan NIK' : 'Tampilkan NIK'}</button>{#if nik}<p class="identity-value">{formatNik(nik)}</p>{/if}</div>{/if}
	<div><span>Kontak milik pelapor · {contactPreference}</span>{#if contactPreference === 'Aman dihubungi'}<button type="button" class="link-button" onclick={() => reveal('contact')} disabled={busy}>{contact ? 'Sembunyikan kontak' : 'Lihat kontak pelapor'}</button>{/if}{#if contact}<p class="identity-value">{contact}</p>{/if}</div>
	{#if message}<p role="status">{message}</p>{/if}
</section>
<style>.report-identity{margin:24px 0;padding:20px 0;border-block:1px solid var(--border)}h3{font-size:1rem}span{font-size:.85rem;color:var(--muted)}.report-identity div{margin:12px 0}.link-button{margin-left:14px}.identity-value{white-space:pre-wrap;overflow-wrap:anywhere}p[role=status]{font-size:.85rem;color:var(--muted)}</style>
