export function hasContactNumber(value: string) {
  return [...value.matchAll(/\+?\d[\d\s().-]{7,}\d/g)].some((match) => {
    const digits = match[0].replace(/\D/g, "").length;
    return digits >= 9 && digits <= 15;
  });
}
