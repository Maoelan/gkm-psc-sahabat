<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import '../app.css';
 import FirstVisit from '../lib/components/FirstVisit.svelte';
 import ReportNotifications from '../lib/components/ReportNotifications.svelte';

	let { children, data }: LayoutProps = $props();
	let menuDialog: HTMLDialogElement;
	const reporting = $derived(page.url.pathname === '/chat');
	const staffArea = $derived(Boolean(data.staff) && (/^\/(petugas|admin)(\/|$)/.test(page.url.pathname) || page.url.pathname === '/rekap'));
	const publicLinks = [
		{ href: '/', label: 'Beranda' },
		{ href: '/edukasi', label: 'Edukasi' },
		{ href: '/panduan', label: 'Panduan melapor' },
		{ href: '/chat', label: 'Buat laporan' }
	];
	const staffLinks = $derived([
		{ href: '/petugas', label: 'Laporan masuk', help: 'Periksa dan catat keputusan' },
		{ href: '/petugas/percakapan', label: 'Percakapan langsung', help: 'Bantu pelapor yang sedang menulis' },
		...(data.staff?.roles.includes('admin') ? [
			{ href: '/rekap', label: 'Rekap dan identitas', help: 'Hasil, data korban, dan unduhan' }
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
	<title>Lapor Aman - PSC | UPT Puskesmas Suranadi</title>
	<meta
		name="description"
		content="PSC SAHABAT, pengaduan, pendampingan dan rujukan terpadu bagi perempuan dan anak korban kekerasan di wilayah kerja UPT Puskesmas Suranadi."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="app-frame" class:staff-frame={staffArea} class:reporting-frame={reporting}>
	<a class="skip-link" href="#main-content">Lewati ke isi utama</a>
	<header class="topbar">
		<div class="topbar-inner">
			<a class="wordmark" href={staffArea ? '/petugas' : '/'} aria-label="Lapor Aman - PSC, beranda">
				<img src="/brand/psc-sahabat.svg" alt="" width="44" height="48" />
				<span><strong>Lapor Aman - PSC</strong><small>UPT Puskesmas Suranadi</small></span>
			</a>
			{#if staffArea}<span class="workspace-label">Ruang kerja petugas</span>
			{:else}<nav class="desktop-nav" aria-label="Menu utama">{#each publicLinks as item}<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>{item.label}</a>{/each}</nav>{/if}
			<div class="header-actions">
 {#if staffArea && data.staff}<ReportNotifications account={data.staff.username} />{/if}
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
	{/if}
	{#if !staffArea && page.url.pathname !== '/masuk'}<FirstVisit />{/if}
    {#if staffArea}<nav class="staff-mobile-nav" aria-label="Menu petugas"><a href="/petugas" aria-current={page.url.pathname === '/petugas' ? 'page' : undefined}>Laporan</a><a href="/petugas/percakapan" aria-current={page.url.pathname === '/petugas/percakapan' ? 'page' : undefined}>Percakapan</a>{#if data.staff?.roles.includes('admin')}<a href="/rekap" aria-current={page.url.pathname === '/rekap' ? 'page' : undefined}>Rekap</a>{/if}</nav>{/if}
	<main id="main-content" tabindex="-1">{@render children()}</main>
	{#if !staffArea && !reporting}<footer class="site-footer"><div class="footer-inner"><div class="footer-institution"><img src="/brand/puskesmas-logo.png" width="44" height="48" alt="Logo Puskesmas" /><div><strong>UPT Puskesmas Suranadi</strong><p>PSC SAHABAT untuk wilayah kerja Puskesmas Suranadi.</p><p>© {new Date().getFullYear()} UPT Puskesmas Suranadi.</p></div></div><div class="footer-links"><a href="/edukasi">Edukasi</a><a href="/panduan#privasi">Pemberitahuan privasi</a><a href="https://puskesmassuranadi-dikes.lombokbaratkab.go.id/" target="_blank" rel="noopener noreferrer">Profil Puskesmas Suranadi</a><a href="/masuk">Masuk petugas</a></div></div></footer>{/if}
</div>

<style>
.staff-mobile-nav {
	display: none;
}
@media (max-width: 900px) {
	.staff-mobile-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 30;
		display: flex;
		background: var(--paper);
		border-top: 1px solid var(--border);
		padding: 4px 8px max(4px, env(safe-area-inset-bottom));
	}
	.staff-mobile-nav a {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		min-height: 52px;
		padding: 8px;
		font-size: 0.875rem;
		text-decoration: none;
		color: var(--muted);
	}
	.staff-mobile-nav a[aria-current='page'] {
		font-weight: 700;
		background: var(--surface);
		color: var(--navy);
	}
	.staff-frame {
		padding-bottom: calc(72px + env(safe-area-inset-bottom));
	}
}
.reporting-frame :global(.desktop-nav),
.reporting-frame :global(.staff-entry) {
	display: none;
}.footer-institution{display:flex;align-items:flex-start;gap:16px}.footer-institution img{object-fit:contain;flex-shrink:0}.wordmark img{object-fit:contain}
</style>
