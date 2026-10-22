<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children, data }: LayoutProps = $props();
	let menuDialog: HTMLDialogElement;
	const staffArea = $derived(Boolean(data.staff) && (/^\/(petugas|admin)(\/|$)/.test(page.url.pathname) || page.url.pathname === '/rekap'));
	const publicLinks = [
		{ href: '/', label: 'Beranda' },
		{ href: '/panduan', label: 'Panduan melapor' },
		{ href: '/chat', label: 'Buat laporan' }
	];
	const staffLinks = $derived([
		{ href: '/petugas', label: 'Laporan masuk', help: 'Periksa dan catat keputusan' },
		{ href: '/petugas/percakapan', label: 'Percakapan langsung', help: 'Bantu pelapor yang sedang menulis' },
		...(data.staff?.roles.includes('admin') ? [
			{ href: '/rekap', label: 'Rekap laporan', help: 'Lihat hasil dan unduh rekap' },
			{ href: '/admin/nik', label: 'Data NIK', help: 'Identitas untuk tindak lanjut' }
		] : [])
	]);
	const links = $derived(staffArea ? staffLinks : publicLinks);

	function quickExit() {
		try { sessionStorage.clear(); } catch { /* Browser storage may be disabled. */ }
		void fetch('/api/chat/session', { method: 'DELETE', keepalive: true }).catch(() => {});
		if (data.staff?.csrfToken) {
			void fetch('/api/staff/logout', {
				method: 'POST',
				headers: { 'x-csrf-token': data.staff.csrfToken },
				keepalive: true
			}).catch(() => {});
		}
		window.location.replace('https://www.google.com');
	}

</script>

<svelte:head>
	<title>LAPOR AMAN | Layanan pengaduan</title>
	<meta
		name="description"
		content="Portal pengaduan LAPOR AMAN milik GKM PSC SAHABAT, UPT Puskesmas Suranadi."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="app-frame" class:staff-frame={staffArea}>
	<a class="skip-link" href="#main-content">Lewati ke isi utama</a>
	<header class="topbar">
		<div class="topbar-inner">
			<a class="wordmark" href={staffArea ? '/petugas' : '/'} aria-label="LAPOR AMAN, beranda">
				<img src="/brand/puskesmas-logo.png" alt="" width="40" height="44" />
				<span><strong>LAPOR AMAN</strong><small>UPT Puskesmas Suranadi</small></span>
			</a>
			{#if staffArea}<span class="workspace-label">Ruang kerja petugas</span>
			{:else}<nav class="desktop-nav" aria-label="Menu utama">{#each publicLinks as item}<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>{item.label}</a>{/each}</nav>{/if}
			<div class="header-actions">
				{#if !staffArea}<a class="staff-entry" href={data.staff ? '/petugas' : '/masuk'}>{data.staff ? 'Ruang petugas' : 'Masuk petugas'}</a><button class="quick-exit" type="button" onclick={quickExit}>Keluar cepat</button>{/if}
				<button class="menu-toggle" type="button" aria-label="Buka menu" onclick={() => menuDialog.showModal()}>Menu</button>
			</div>
		</div>
	</header>
	<dialog class="navigation-dialog" bind:this={menuDialog} aria-labelledby="menu-title">
		<div class="mobile-nav-heading"><h2 id="menu-title">{staffArea ? 'Ruang petugas' : 'Menu utama'}</h2><button class="button-secondary" type="button" onclick={() => menuDialog.close()}>Tutup</button></div>
		<nav aria-label="Navigasi seluler">{#each links as item}<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined} onclick={() => menuDialog.close()}>{item.label}</a>{/each}<a href={staffArea ? '/' : data.staff ? '/petugas' : '/masuk'} onclick={() => menuDialog.close()}>{staffArea ? 'Buka portal publik' : data.staff ? 'Ruang petugas' : 'Masuk petugas'}</a></nav>
		{#if data.staff}<form method="POST" action="/masuk?/logout"><input type="hidden" name="csrfToken" value={data.staff.csrfToken} /><button class="button-secondary" type="submit">Keluar akun petugas</button></form>{/if}
	</dialog>
	{#if staffArea}
		<aside class="workspace-nav" aria-label="Ruang kerja petugas">
			<nav>{#each staffLinks as item}<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}><strong>{item.label}</strong><small>{item.help}</small></a>{/each}</nav>
			<div class="workspace-account"><strong>{data.staff?.displayName}</strong><span>Petugas layanan</span><a href="/">Buka portal publik</a><form method="POST" action="/masuk?/logout"><input type="hidden" name="csrfToken" value={data.staff?.csrfToken} /><button type="submit">Keluar akun</button></form></div>
		</aside>
	{:else}<div class="privacy-banner"><p>Gunakan perangkat yang aman. Cerita dapat diproses asisten AI NVIDIA. <a href="/panduan#privasi">Pelajari privasi Anda</a></p></div>{/if}
	<main id="main-content" tabindex="-1">{@render children()}</main>
	{#if !staffArea}<footer class="site-footer"><div class="footer-inner"><div><strong>LAPOR AMAN</strong><p>GKM PSC SAHABAT · UPT Puskesmas Suranadi</p></div><div class="footer-links"><a href="/panduan#privasi">Pemberitahuan privasi</a><a href="/masuk">Masuk petugas</a></div></div></footer>{/if}
</div>
