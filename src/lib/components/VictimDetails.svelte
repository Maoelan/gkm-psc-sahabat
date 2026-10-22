<script lang="ts">
	import { violenceTypes } from '../education';
	import { victimFields, type VictimProfile } from '../victim';
	let { profile = $bindable(), relation, prefix = 'victim' }: { profile: VictimProfile; relation: string; prefix?: string } = $props();
	const options: Record<string, string[]> = {
		gender: ['Perempuan', 'Laki-laki', 'Tidak ingin menyebutkan'],
		education: ['Belum sekolah', 'SD atau sederajat', 'SMP atau sederajat', 'SMA atau sederajat', 'Perguruan tinggi', 'Lainnya'],
		maritalStatus: ['Belum kawin', 'Kawin', 'Cerai hidup', 'Cerai mati'],
		pregnancy: ['Hamil', 'Tidak hamil', 'Belum diketahui', 'Tidak relevan', 'Tidak ingin menjawab'],
		coordination: ['Sudah', 'Belum', 'Tidak tahu']
	};
</script>

<details class="victim-details">
	<summary>Lengkapi data korban dan kejadian <span>Opsional</span></summary>
	<p>Data yang Anda ketahui membantu pemeriksaan petugas. Isi sejauh yang aman dan Anda ketahui; kolom kosong tidak menghalangi laporan. Identitas tidak dikirim ke AI.</p>
	<div class="victim-grid">
		{#each victimFields as field}
			{#if !(field.key === 'reporterName' && relation === 'Diri sendiri') && !(field.key === 'coordinationDetails' && profile.coordination !== 'Sudah')}
				<label class:wide={field.key === 'address' || field.key === 'coordinationDetails'} for={`${prefix}-${field.key}`}>
					{field.label}
					{#if options[field.key]}
						<select id={`${prefix}-${field.key}`} bind:value={profile[field.key]}><option value="">Belum diisi</option>{#each options[field.key] as option}<option>{option}</option>{/each}</select>
					{:else if field.key === 'address' || field.key === 'coordinationDetails'}
						<textarea id={`${prefix}-${field.key}`} bind:value={profile[field.key]} rows="2" maxlength="500" autocomplete="off" placeholder={field.key === 'address' ? 'Alamat korban, jika diketahui dan aman untuk disampaikan' : 'Contoh: sudah melapor ke kepolisian; tulis keterangan yang diketahui'}></textarea>
					{:else if field.key === 'birthDate'}
						<input id={`${prefix}-${field.key}`} type="date" bind:value={profile[field.key]} max={new Date().toISOString().slice(0,10)} />
					{:else}<input id={`${prefix}-${field.key}`} bind:value={profile[field.key]} maxlength="100" autocomplete="off" />{/if}
				</label>
			{/if}
		{/each}
	</div>
	<fieldset><legend>Dugaan jenis kekerasan <span>Opsional, boleh lebih dari satu</span></legend><p>Jika belum tahu, biarkan kosong dan ceritakan kejadiannya. Pilihan ini belum merupakan penetapan petugas.</p>
		<div class="type-options">{#each violenceTypes as item}<label><input type="checkbox" bind:group={profile.violenceTypes} value={item.id} />{item.name}</label>{/each}</div>
	</fieldset>
	<a href="/edukasi" target="_blank" rel="noopener">Baca penjelasan jenis kekerasan</a>
</details>

<style>
	.victim-details { margin:24px 0; padding:18px 0; border-block:1px solid var(--border); }
	summary { font-weight:700; color:var(--navy); cursor:pointer; }
	summary span,legend span { font-weight:400; color:var(--muted); font-size:.85rem; margin-left:8px; }
	p { font-size:.9rem; color:var(--muted); max-width:70ch; }
	.victim-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin:22px 0; }
	label { display:flex; flex-direction:column; gap:8px; font-size:.9rem; font-weight:600; }
	.wide { grid-column:1/-1; }
	input,select,textarea { width:100%; font:inherit; padding:11px; border:1px solid var(--border); border-radius:8px; background:var(--paper); color:var(--ink); }
	fieldset { border:0; padding:0; margin:24px 0; }
	legend { font-weight:700; }
	.type-options { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
	.type-options label { flex-direction:row; align-items:center; min-height:44px; }
	input[type=checkbox] { width:20px; height:20px; flex-shrink:0; }
	@media(max-width:600px) { .victim-grid,.type-options { grid-template-columns:1fr; } }
</style>
