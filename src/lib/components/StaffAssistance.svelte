<script lang="ts">

	import { assistanceTopics, type StaffAssistance } from '../assistance';
	let { assistance, loading, error, disabled, onrefresh, onuse }: {
		assistance: StaffAssistance | null; loading: boolean; error: string; disabled: boolean;
		onrefresh: () => void; onuse: (question: string) => void;
	} = $props();

</script>

<aside class="assistance-panel" aria-label="Panduan petugas">
	<h3 class="guidance-title">Panduan petugas</h3>
		<p class="intro">Periksa satu saran berikut. Anda yang mengirim balasannya.</p>
		{#if loading}<p class="update-state" role="status">Membaca percakapan terbaru…</p>{/if}
		{#if error}<p class="assist-error" role="alert">{error}</p>{/if}
		{#if assistance}
			{#if assistance.suggestion}
				<section class="suggested-question" aria-labelledby="suggestion-title">
					<h3 id="suggestion-title">Pertanyaan berikutnya</h3>
					<p>{assistance.suggestion.question}</p>
					<button class="button-secondary" type="button" disabled={loading || disabled || Boolean(error)} onclick={() => assistance?.suggestion && onuse(assistance.suggestion.question)}>Gunakan pertanyaan</button>
					<small>Masuk ke kotak balasan. Periksa atau ubah sebelum dikirim.</small>
				</section>
			{:else}<p class="complete-note">Bagian utama sudah memiliki keterangan atau ditandai belum diketahui. Pelapor tetap dapat menambah cerita dan memeriksa draf.</p>{/if}
			<details class="collected-summary"><summary>Lihat kelengkapan dan kutipan pelapor</summary><dl class="collected-information">
				{#each assistanceTopics as topic}
					{@const item = assistance.fields[topic.key]}
					<div data-topic={topic.key}>
						<dt>{topic.label}<span class:found={item.status === 'found'}>{item.status === 'found' ? 'Ada keterangan' : item.status === 'unknown' ? 'Jawaban belum tersedia' : 'Belum ada keterangan'}</span></dt>
						<dd>{#if item.quote}<blockquote>“{item.quote}”</blockquote><small>Kutipan pelapor</small>{:else}Boleh tetap kosong jika pelapor belum tahu atau belum siap.{/if}</dd>
					</div>
				{/each}
			</dl></details>
			<p class="source-note">{assistance.source === 'nvidia' ? 'Dibantu AI. Cocokkan dengan percakapan.' : 'Panduan cadangan aktif. AI tidak tersedia atau hasilnya tidak dapat dipakai.'} Data identitas dan kontak diisi pada formulir pelapor.</p>
		{:else if !loading && !error}<p class="intro">Buka panduan untuk melihat bagian laporan yang perlu diperjelas.</p>{/if}
		<button class="link-button" type="button" disabled={loading || disabled} onclick={onrefresh}>{loading ? 'Memperbarui panduan…' : 'Perbarui panduan'}</button>
</aside>

<style>
	.assistance-panel { padding:18px; background:var(--surface); min-width:0; height:auto; overflow:visible; }
	details { border:0; }
	summary { padding:0 0 12px; font-size:1rem; color:var(--navy); }
	.intro,.source-note,.complete-note { font-size:.82rem; color:var(--muted); margin:0 0 16px; }
	.collected-information { margin:0; }
	.collected-information > div { padding:14px 0; border-top:1px solid var(--border); }
	dt { font-size:.9rem; font-weight:700; }
	dt span { display:block; margin-top:4px; color:var(--muted); font-size:.78rem; font-weight:400; }
	dt span.found { color:var(--teal-dark); }
	dd { margin:8px 0 0; font-size:.82rem; color:var(--muted); overflow-wrap:anywhere; }
	blockquote { margin:0 0 4px; color:var(--ink); white-space:pre-wrap; }
	small { display:block; font-size:.75rem; color:var(--muted); }
	.suggested-question { border-top:1px solid var(--border); padding-top:16px; margin-top:8px; }
	.guidance-title { margin:0 0 8px; }
 h3 { font-size:.9rem; margin:0; }
	.suggested-question p { font-size:.9rem; margin:10px 0 14px; }
	.suggested-question button { width:100%; }
	.suggested-question small { margin-top:8px; }
	.source-note { margin:18px 0 0; }
	.complete-note { margin:16px 0; }
	.update-state { color:var(--teal-dark); font-size:.82rem; margin:0 0 12px; }
	.assist-error { color:var(--danger); font-size:.85rem; }
	.link-button { font-size:.82rem; min-height:44px; text-align:left; }
	@media(max-width:1300px) { .assistance-panel { height:auto; } }
</style>
