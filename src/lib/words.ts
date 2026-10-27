// Wording with no imports, so it can be tested on its own.

/** "Kat", "Kat and Sam", "Kat, Sam and Priya". */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Who a beacon went to, seen by someone it went to (decision 75): "Sent to you, Kat and Sam".
 * Long lists stop after `max` names: "Sent to you, Amy, Ben ... and 4 others".
 * `others` is everyone else it went to; null means an older server that only sends a count.
 */
export function sentToLine(others: string[] | null | undefined, sent: number, max = 6): string {
  if (!others) return `Sent to ${sent}`;
  if (!others.length) return 'Sent to you';
  const shown = others.slice(0, max);
  const rest = others.length - shown.length;
  return `Sent to ${joinNames(['you', ...shown, ...(rest ? [`${rest} other${rest === 1 ? '' : 's'}`] : [])])}`;
}

/** "Kat is in", "Kat and Sam are in", "nobody in yet". */
export function whosInLine(names: string[]): string {
  return names.length ? `${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} in` : 'nobody in yet';
}
