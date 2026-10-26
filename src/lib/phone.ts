// Mobile numbers are stored in full international form, digits only (e.g. 447700900123),
// so contacts can be matched and Message / Call open the right person.
// Assumes UK numbers when someone types a leading 0.
export function normaliseNumber(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = '44' + digits.slice(1);
  digits = digits.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
