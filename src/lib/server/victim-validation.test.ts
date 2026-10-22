import { describe, expect, it } from "vitest";
import { draftSchema } from "./validation";
const draft = {
  victimName: "",
  victimNik: "",
  relation: "Diri sendiri",
  story: "Kronologi latihan untuk pemeriksaan.",
  safeContact: "no",
};
describe("optional victim data", () => {
  it("requires a reporter number only when the reporter agrees to contact", () => {
    expect(
      draftSchema.safeParse({
        ...draft,
        safeContact: "yes",
        contactDetails: "",
      }).success,
    ).toBe(false);
    expect(
      draftSchema.safeParse({
        ...draft,
        safeContact: "yes",
        contactDetails: "0000-0000-0000, hanya siang hari",
      }).success,
    ).toBe(true);
    expect(
      draftSchema.safeParse({ ...draft, safeContact: "no", contactDetails: "" })
        .success,
    ).toBe(true);
  });
  it("allows missing identity and profile without blocking a report", () => {
    const result = draftSchema.parse(draft);
    expect(result.victimName).toBe("");
    expect(result.profile.violenceTypes).toEqual([]);
  });
  it("validates supplied details and rejects unknown categories and invalid dates", () => {
    expect(
      draftSchema.parse({
        ...draft,
        profile: {
          birthDate: "2000-02-29",
          violenceTypes: ["physical", "trafficking"],
        },
      }).profile.birthDate,
    ).toBe("2000-02-29");
    for (const profile of [
      { birthDate: "2999-01-01" },
      { birthDate: "2020-02-31" },
      { violenceTypes: ["invented"] },
      { gender: "unexpected" },
    ])
      expect(draftSchema.safeParse({ ...draft, profile }).success).toBe(false);
  });
});
