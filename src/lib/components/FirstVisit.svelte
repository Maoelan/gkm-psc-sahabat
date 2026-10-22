<script lang="ts">
	import { onMount } from 'svelte';
	let dialog: HTMLDialogElement;
	function dismiss() { try { localStorage.setItem('psc-sahabat-intro-v1', 'read'); } catch { /* The dialog remains usable without storage. */ } dialog.close(); }
	onMount(() => { try { if (localStorage.getItem('psc-sahabat-intro-v1') !== 'read') dialog.showModal(); } catch { dialog.showModal(); } });
</script>
<dialog bind:this={dialog} aria-labelledby="intro-title" oncancel={(e) => { e.preventDefault(); dismiss(); }}>
	<img src="/brand/psc-sahabat.svg" width="64" height="64" alt="" />
	<h2 id="intro-title">Selamat datang di PSC SAHABAT</h2>
	<p>Layanan pelaporan kekerasan terhadap perempuan dan anak untuk wilayah kerja <strong>UPT Puskesmas Suranadi</strong>.</p>
	<ol><li>Tulis kronologi sesuai yang Anda ingat. Data korban boleh dilengkapi jika diketahui.</li><li>Periksa draf dan pilih apakah Anda bersedia dihubungi.</li><li>Tekan <strong>Konfirmasi dan kirim laporan</strong> untuk menyerahkan laporan kepada petugas.</li></ol>
	<p>Pesan chat tersimpan saat dikirim dan dapat diproses asisten AI NVIDIA. Laporan resmi masuk ke meja petugas setelah Anda mengonfirmasi pengiriman.</p>
	<p class="intro-limit">Ini situs evaluasi. Gunakan data latihan. Aplikasi bukan layanan darurat dan tidak memantau keselamatan secara langsung.</p>
	<div><a href="/panduan#privasi" onclick={dismiss}>Baca privasi dan alur</a><button class="button-primary" type="button" onclick={dismiss}>Saya mengerti, lanjutkan</button></div>
</dialog>
<style>dialog{width:calc(100% - 32px);max-width:600px;max-height:90dvh;overflow:auto;padding:28px;border:1px solid var(--border);border-radius:16px;color:var(--ink);background:var(--paper)}dialog::backdrop{background:rgb(7 50 75 / .5)}h2{font-size:1.5rem;margin:14px 0}p,li{line-height:1.55}li{margin:10px 0}.intro-limit{color:var(--muted);font-size:.9rem}dialog>div{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:24px}img{object-fit:contain}@media(max-width:500px){dialog{padding:22px}dialog>div{flex-direction:column;align-items:stretch;text-align:center}}</style>
