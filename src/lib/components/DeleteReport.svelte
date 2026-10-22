<script lang="ts">
	let { id, csrfToken }: { id: string; csrfToken: string } = $props();
	let dialog: HTMLDialogElement;
	let confirmation = $state(''), reason = $state(''), error = $state(''), busy = $state(false);
	function open() { confirmation = ''; reason = ''; error = ''; dialog.showModal(); }
	async function remove(event: SubmitEvent) {
		event.preventDefault(); if (busy || confirmation !== id || reason.trim().length < 3) return;
		busy = true; error = '';
		try {
			const response = await fetch(`/api/staff/reports/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ confirmation, reason }) });
			const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Laporan belum dapat dihapus.');
			window.location.reload();
		} catch (caught) { error = caught instanceof Error ? caught.message : 'Laporan belum dapat dihapus.'; }
		finally { busy = false; }
	}
</script>
<div class="delete-report"><button type="button" class="link-button" onclick={open}>Hapus laporan</button><p>Khusus admin. Penghapusan juga menghilangkan laporan dari rekap.</p></div>
<dialog bind:this={dialog} aria-labelledby="delete-report-title" oncancel={(e) => { if (busy) e.preventDefault(); }}>
	<h2 id="delete-report-title">Hapus laporan ini?</h2>
	<p>Laporan <strong>{id}</strong>, identitas, draf, riwayat percakapan, dan catatan terkait akan dihapus permanen. Jejak audit penghapusan tetap disimpan. File yang sudah diunduh tidak ikut terhapus.</p>
	<form onsubmit={remove}><label>Ketik kode laporan untuk konfirmasi<input bind:value={confirmation} autocomplete="off" disabled={busy} required /></label><label>Alasan penghapusan<textarea bind:value={reason} maxlength="500" minlength="3" rows="3" disabled={busy} required></textarea></label>
		{#if error}<p role="alert">{error}</p>{/if}
		<div class="actions"><button type="button" class="button-secondary" onclick={() => dialog.close()} disabled={busy}>Batal</button><button class="button-primary" type="submit" disabled={busy || confirmation !== id || reason.trim().length < 3}>{busy ? 'Menghapus…' : 'Hapus permanen'}</button></div>
	</form>
</dialog>
<style>.delete-report{margin-top:32px;padding-top:20px;border-top:1px solid var(--border)}.delete-report button{color:var(--danger)}p{font-size:.9rem}dialog{max-width:560px;width:calc(100% - 32px);max-height:85dvh;overflow:auto;border:1px solid var(--border);border-radius:16px;padding:28px;color:var(--ink)}dialog::backdrop{background:rgb(7 50 75 / .45)}label{display:flex;flex-direction:column;gap:8px;margin:18px 0;font-weight:600}input,textarea{padding:12px;font:inherit;border:1px solid var(--border);border-radius:8px}.actions{display:flex;justify-content:flex-end;gap:12px}.actions .button-primary{background:var(--danger)}</style>
