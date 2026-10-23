<script lang="ts">
    import { formatNik } from '../reports';
    let { id, isAdmin, contactPreference }: { id: string; isAdmin: boolean; contactPreference: string } = $props();
    let nik = $state(''), contact = $state(''), message = $state(''), busy = $state(false);
    async function load(kind: 'nik' | 'contact', reportId: string, signal?: AbortSignal) {
        const response = await fetch(`/api/staff/reports/${encodeURIComponent(reportId)}/${kind}`, { signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Data belum dapat dimuat.');
        return payload[kind] || '';
    }
    $effect(() => {
        const reportId = id;
        const admin = isAdmin;
        const allowedContact = contactPreference === 'Aman dihubungi';
        nik = ''; contact = ''; message = '';
        const controller = new AbortController();
        if (reportId && admin) {
            busy = true;
            void Promise.allSettled([
                load('nik', reportId, controller.signal),
                allowedContact ? load('contact', reportId, controller.signal) : Promise.resolve('')
            ]).then((results) => {
                if (controller.signal.aborted) return;
                if (results[0].status === 'fulfilled') nik = results[0].value;
                if (results[1].status === 'fulfilled') contact = results[1].value;
                message = results.some(result => result.status === 'rejected')
                    ? 'Sebagian data belum dapat dimuat. Buka kembali detail laporan untuk mencoba lagi.'
                    : 'Akses identitas tercatat dalam audit.';
                busy = false;
            });
        } else busy = false;
        return () => controller.abort();
    });
    async function revealContact() {
        if (busy) return;
        busy = true; message = '';
        const reportId = id;
        try {
            const value = await load('contact', reportId);
            if (id === reportId) { contact = value; message = 'Akses kontak tercatat dalam audit.'; }
        } catch (error) {
            if (id === reportId) message = error instanceof Error ? error.message : 'Kontak belum dapat dimuat.';
        } finally { if (id === reportId) busy = false; }
    }
</script>
<section class="report-identity" aria-label="Identitas dan kontak pelapor" aria-busy={busy}>
    <h3>Identitas dan kontak pelapor</h3>
    {#if isAdmin}<div><span>NIK korban</span><p class="identity-value">{busy ? 'Memuat…' : formatNik(nik)}</p></div>{/if}
    <div><span>Kontak milik pelapor · {contactPreference}</span>
        {#if isAdmin}<p class="identity-value">{busy ? 'Memuat…' : contact || (contactPreference === 'Aman dihubungi' ? 'Tidak diisi' : 'Tidak ada izin dihubungi')}</p>
        {:else if contact}<p class="identity-value">{contact}</p>
        {:else if contactPreference === 'Aman dihubungi'}<button type="button" class="link-button" onclick={revealContact} disabled={busy}>Lihat kontak pelapor</button>{/if}
    </div>
    {#if message}<p role="status">{message}</p>{/if}
</section>
<style>
    .report-identity { margin: 24px 0; padding: 20px 0; border-block: 1px solid var(--border); }
    h3 { font-size: 1rem; }
    span, p[role='status'] { font-size: .85rem; color: var(--muted); }
    .report-identity div { margin: 12px 0; }
    .link-button { margin-left: 14px; }
    .identity-value { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
