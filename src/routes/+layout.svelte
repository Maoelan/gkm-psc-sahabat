<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children, data }: LayoutProps = $props();
	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement>();
	let closeButton = $state<HTMLButtonElement>();

	const publicLinks = [
		{ href: '/panduan', label: 'Panduan & Edukasi' },
		{ href: '/chat', label: 'Chat Pengaduan' }
	];
	const staffHome = $derived(
		data.staff?.roles.includes('bidan_pic') || data.staff?.roles.includes('admin')
			? '/rekap'
			: '/petugas'
	);
	const recapHref = $derived(
		data.staff?.roles.includes('bidan_pic') || data.staff?.roles.includes('admin')
			? '/rekap'
			: data.staff
				? '/petugas/ganti-akun'
				: '/rekap'
	);

	function openMenu() {
		menuOpen = true;
		requestAnimationFrame(() => closeButton?.focus());
	}

	function closeMenu(returnFocus = false) {
		menuOpen = false;
		if (returnFocus) requestAnimationFrame(() => menuButton?.focus());
	}

	function quickExit() {
		sessionStorage.clear();
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

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && menuOpen) closeMenu(true);
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

<svelte:window onkeydown={handleKeydown} />

<div class="app-frame">
	<a class="skip-link" href="#main-content">Lewati ke isi utama</a>
	<header class="topbar">
		<div class="topbar-inner">
			<a class="wordmark" href="/" aria-label="LAPOR AMAN, kembali ke beranda">
				<img src="/brand/puskesmas-logo.png" alt="" width="44" height="48" />
				<span><strong>LAPOR AMAN</strong><small>UPT Puskesmas Suranadi</small></span>
			</a>

			<button
				bind:this={menuButton}
				class="menu-toggle"
				type="button"
				aria-expanded={menuOpen}
				aria-controls="mobile-navigation"
				onclick={openMenu}
			>
				<span aria-hidden="true"></span>
				<span class="sr-only">Buka menu</span>
			</button>

			<nav class="desktop-nav" aria-label="Navigasi utama">
				{#each publicLinks as item}
					<a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>
						{item.label}
					</a>
				{/each}
				{#if data.staff}
					<a href={staffHome} aria-current={page.url.pathname === staffHome ? 'page' : undefined}>
						Ruang kerja
					</a>
					{#if data.staff.roles.includes('petugas') || data.staff.roles.includes('admin')}
						<a
							href="/petugas/percakapan"
							aria-current={page.url.pathname === '/petugas/percakapan' ? 'page' : undefined}
						>
							Percakapan
						</a>
					{/if}
					{#if data.staff.roles.includes('admin')}
						<a href="/petugas" aria-current={page.url.pathname === '/petugas' ? 'page' : undefined}>
							Meja petugas
						</a>
					{/if}
				{:else}
					<a href="/masuk" aria-current={page.url.pathname === '/masuk' ? 'page' : undefined}>
						Masuk petugas
					</a>
				{/if}
			</nav>

			<button class="quick-exit" type="button" onclick={quickExit}>Keluar cepat</button>
		</div>
	</header>

	{#if menuOpen}
		<button class="menu-backdrop" type="button" aria-label="Tutup menu" onclick={() => closeMenu(true)}></button>
		<div id="mobile-navigation" class="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu utama">
			<div class="mobile-nav-heading">
				<div><strong>Menu utama</strong><span>UPT Puskesmas Suranadi</span></div>
				<button bind:this={closeButton} type="button" onclick={() => closeMenu(true)}>Tutup</button>
			</div>
			<nav aria-label="Navigasi seluler">
				{#each publicLinks as item}
					<a
						href={item.href}
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
						onclick={() => closeMenu()}>{item.label}</a
					>
				{/each}
				{#if data.staff}
					<a href={staffHome} onclick={() => closeMenu()}>Ruang kerja {data.staff.displayName}</a>
					{#if data.staff.roles.includes('petugas') || data.staff.roles.includes('admin')}
						<a href="/petugas/percakapan" onclick={() => closeMenu()}>Percakapan langsung</a>
					{/if}
					<form method="POST" action="/masuk?/logout">
						<input type="hidden" name="csrfToken" value={data.staff.csrfToken} />
						<button class="mobile-logout" type="submit">Keluar dari sesi petugas</button>
					</form>
				{:else}
					<a href="/masuk" onclick={() => closeMenu()}>Masuk petugas</a>
				{/if}
				<a href="/petugas" onclick={() => closeMenu()}>Meja petugas</a>
				<a href={recapHref} onclick={() => closeMenu()}>Rekap bidan/PIC</a>
			</nav>
			<p>Keluar cepat mengakhiri sesi server bila memungkinkan, tetapi tidak menghapus riwayat browser atau jejak perangkat.</p>
		</div>
	{/if}

	<div class="privacy-banner" role="status">
		<div>
			<strong>Privasi Anda penting.</strong> Jangan masukkan data orang lain tanpa izin. Cerita dengan
			pola identitas yang jelas diredaksi dapat diproses oleh layanan AI NVIDIA untuk menyusun
			tanggapan dan satu pertanyaan pelengkap. <a href="/panduan#privasi">Baca pemberitahuan privasi</a>.
		</div>
	</div>

	<main id="main-content" tabindex="-1">
		{@render children()}
	</main>

	<footer class="site-footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<img src="/brand/puskesmas-logo.png" alt="" width="46" height="50" loading="lazy" />
				<div>
					<strong>LAPOR AMAN</strong>
					<p>GKM PSC SAHABAT, UPT Puskesmas Suranadi.</p>
				</div>
			</div>
			<div class="footer-links">
				<a href="/panduan#privasi">Pemberitahuan privasi</a>
				{#if data.staff}
					<a href={staffHome}>Ruang kerja</a>
					<form method="POST" action="/masuk?/logout">
						<input type="hidden" name="csrfToken" value={data.staff.csrfToken} />
						<button type="submit">Keluar</button>
					</form>
				{:else}
					<a href="/masuk">Masuk petugas</a>
				{/if}
			</div>
		</div>
	</footer>
</div>
