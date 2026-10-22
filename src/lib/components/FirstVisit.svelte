<script lang="ts">
	import { onMount } from 'svelte';
	let dialog: HTMLDialogElement;
	function dismiss() { try { localStorage.setItem('psc-sahabat-intro-v1', 'read'); } catch { /* The dialog remains usable without storage. */ } dialog.close(); }
	onMount(() => { try { if (localStorage.getItem('psc-sahabat-intro-v1') !== 'read') dialog.showModal(); } catch { dialog.showModal(); } });
</script>
<dialog bind:this={dialog} aria-labelledby="intro-title" oncancel={(e) => { e.preventDefault(); dismiss(); }}>
	<img src="/brand/psc-sahabat.svg" width="44" height="44" alt="" />
	<h2 id="intro-title">Selamat datang di PSC SAHABAT</h2>
	<p>Layanan pelaporan kekerasan terhadap perempuan dan anak untuk wilayah kerja <strong>UPT Puskesmas Suranadi</strong>.</p>
	<p>Tulis kronologi, periksa draf, lalu konfirmasi untuk mengirim laporan ke petugas. Data korban boleh dilengkapi jika diketahui.</p>
	<p>Pesan tersimpan saat dikirim dan cerita dapat diproses asisten AI NVIDIA.</p>
	<p class="intro-limit">Ini situs evaluasi. Gunakan data latihan. Aplikasi bukan layanan darurat dan tidak memantau keselamatan secara langsung.</p>
	<div><a href="/panduan#privasi" onclick={dismiss}>Baca privasi dan alur</a><button class="button-primary" type="button" onclick={dismiss}>Saya mengerti, lanjutkan</button></div>
</dialog>
<style>
dialog {
	width: calc(100% - 32px);
	max-width: 520px;
	max-height: 90dvh;
	overflow: auto;
	padding: 28px;
	border: 1px solid var(--border);
	border-radius: 16px;
	color: var(--ink);
	background: var(--paper);
}
dialog::backdrop {
	background: rgb(7 50 75 / 0.5);
}h2{font-size:1.5rem;margin:14px 0}
p {
	line-height: 1.55;
}
.intro-limit {
	color: var(--muted);
	font-size: 0.9rem;
}dialog>div{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:24px}img{object-fit:contain}
@media (max-width: 500px) {dialog{padding:22px}dialog>div{flex-direction:column;align-items:stretch;text-align:center}
}
</style>
