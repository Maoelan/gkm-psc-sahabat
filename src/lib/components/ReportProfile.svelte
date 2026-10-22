<script lang="ts">
	import { victimFields, type VictimProfile } from '../victim';
	import { violenceTypes } from '../education';
	let { profile }: { profile?: VictimProfile } = $props();
</script>
{#if profile}
	<details class="profile-review"><summary>Data korban dan koordinasi</summary><dl>{#each victimFields as field}{#if profile[field.key]}<div><dt>{field.label}</dt><dd>{profile[field.key]}</dd></div>{/if}{/each}
		{#if profile.violenceTypes?.length}<div><dt>Jenis yang dipilih pelapor</dt><dd>{profile.violenceTypes.map(id => violenceTypes.find(v => v.id === id)?.name ?? '').filter(Boolean).join(', ')}</dd></div>{/if}
	</dl><p>Informasi opsional dari pelapor. Bagian yang tidak diisi tetap belum diketahui.</p></details>
{/if}
<style>.profile-review{margin:24px 0;padding:16px 0;border-block:1px solid var(--border)}summary{font-weight:700;cursor:pointer}dl{display:grid;grid-template-columns:1fr 1fr;gap:16px}dt,p{font-size:.82rem;color:var(--muted)}dd{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){dl{grid-template-columns:1fr}}</style>
