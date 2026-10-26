// Mobile numbers are stored in full international form, digits only (e.g. 447700900123),
// so contacts can be matched and Message / Call open the right person.
// No imports, so the automatic tests can check it directly.

/** Tidies a typed or saved number. Assumes UK when it starts with a single 0. */
export function normaliseNumber(input: string): string | null {
  // "+44 (0)7700 900123": the "(0)" is a written convention, never dialled.
  let digits = input.replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = '44' + digits.slice(1);
  digits = digits.replace(/\D/g, '');
  // UK numbers never have a 0 straight after 44 (e.g. "+4407700..." typed by mistake).
  if (digits.startsWith('440')) digits = '44' + digits.slice(3);
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** UK mobiles start 447. */
const looksMobile = (n: string) => n.startsWith('447');

/**
 * The number to message someone on, from a contact's saved numbers: one labelled mobile,
 * then one that looks like a UK mobile, then the first. Avoids messaging a landline.
 */
export function bestNumber(phones: { label?: string | null; number?: string | null }[]): string | null {
  const all = phones
    .map((p) => ({ label: (p.label ?? '').toLowerCase(), n: p.number ? normaliseNumber(p.number) : null }))
    .filter((p): p is { label: string; n: string } => !!p.n);
  return (all.find((p) => p.label.includes('mobile') || p.label.includes('cell'))?.n ?? all.find((p) => looksMobile(p.n))?.n ?? all[0]?.n) || null;
}
