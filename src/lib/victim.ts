export const emptyVictimProfile = () => ({
  birthDate: "",
  parentName: "",
  address: "",
  gender: "",
  education: "",
  occupation: "",
  maritalStatus: "",
  pregnancy: "",
  reporterName: "",
  coordination: "",
  coordinationDetails: "",
  violenceTypes: [] as string[],
});
export type VictimProfile = ReturnType<typeof emptyVictimProfile>;
export const victimFields: {
  key: keyof Omit<VictimProfile, "violenceTypes">;
  label: string;
}[] = [
  { key: "birthDate", label: "Tanggal lahir korban" },
  { key: "parentName", label: "Nama orang tua atau wali" },
  { key: "address", label: "Alamat domisili korban" },
  { key: "gender", label: "Jenis kelamin korban" },
  { key: "education", label: "Pendidikan" },
  { key: "occupation", label: "Pekerjaan" },
  { key: "maritalStatus", label: "Status perkawinan" },
  { key: "pregnancy", label: "Kondisi kehamilan" },
  { key: "reporterName", label: "Nama pelapor" },
  { key: "coordination", label: "Koordinasi dengan pihak lain" },
  { key: "coordinationDetails", label: "Keterangan koordinasi" },
];
