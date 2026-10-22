// Categories follow slides 7–8 of the supplied KTPA TPPO training material.
export const violenceTypes = [
  {
    id: "physical",
    name: "Kekerasan fisik",
    description:
      "Tindakan yang menyakiti tubuh atau menyebabkan cedera, seperti memukul, menendang, atau mendorong.",
  },
  {
    id: "psychological",
    name: "Kekerasan psikis",
    description:
      "Ancaman, penghinaan, intimidasi, atau tekanan yang menyebabkan ketakutan dan penderitaan psikologis.",
  },
  {
    id: "sexual",
    name: "Kekerasan seksual",
    description:
      "Perbuatan seksual tanpa persetujuan atau dengan paksaan, termasuk pelecehan fisik maupun nonfisik.",
  },
  {
    id: "neglect",
    name: "Penelantaran",
    description:
      "Pengabaian kebutuhan dasar, perawatan, pendidikan, perlindungan, atau tanggung jawab terhadap seseorang.",
  },
  {
    id: "trafficking",
    name: "Perdagangan orang atau TPPO",
    description:
      "Perekrutan atau pemindahan orang melalui ancaman, penipuan, penyalahgunaan kerentanan, atau cara lain untuk tujuan eksploitasi.",
  },
  {
    id: "exploitation",
    name: "Eksploitasi",
    description:
      "Pemanfaatan seseorang untuk keuntungan pihak lain, termasuk memaksa bekerja atau mengambil keuntungan dari kerentanannya.",
  },
] as const;
export const legalReferences = [
  {
    name: "UU Nomor 23 Tahun 2004",
    subject: "Penghapusan Kekerasan dalam Rumah Tangga",
    url: "https://jdih.mahkamahagung.go.id/legal-product/uu-nomor-23-tahun-2004doc/detail",
  },
  {
    name: "UU Nomor 21 Tahun 2007",
    subject: "Pemberantasan Tindak Pidana Perdagangan Orang",
    url: "https://jdih.mahkamahagung.go.id/legal-product/uu-nomor-21-tahun-2007doc/detail",
  },
  {
    name: "UU Nomor 35 Tahun 2014",
    subject: "Perubahan atas UU Nomor 23 Tahun 2002 tentang Perlindungan Anak",
    url: "https://jdih.bpkp.go.id/dokumen/data_dokumen/UU%20Nomor%2035%20Tahun%202014.pdf",
  },
  {
    name: "UU Nomor 12 Tahun 2022",
    subject: "Tindak Pidana Kekerasan Seksual",
    url: "https://jdih.komisiyudisial.go.id/produk-hukum-peraturan/undang-undang-nomor-12-tahun-2022-tentang-tindak-pidana-kekerasan-seksual/281",
  },
];
