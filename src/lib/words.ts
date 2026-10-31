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

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** '2026-12-12' -> 'Sat 12 Dec'. */
export function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return `${DOW[dt.getDay()]} ${dt.getDate()} ${MON[dt.getMonth()]}`;
}

/**
 * The line a plan writes in its own chat when something happens (31 Oct).
 * `who` is the person who did it ("You" when it's you); `place` is the place's name if there is one.
 */
export function eventLine(event: string, who: string, meta?: { what?: string; when?: string; day?: string } | null, place?: string): string {
  const you = who === 'You';
  switch (event) {
    case 'in':
      return you ? "You're in" : `${who}'s in`;
    case 'out':
      return you ? "You can't make it" : `${who} can't make it`;
    case 'locked':
      return `${who} locked it in${place ? ` at ${place}` : ''}`;
    case 'moved':
      return `${who} moved it to ${place || 'a new place'}`;
    case 'unlocked':
      return `${who} unlocked it`;
    case 'suggested':
      return `${who} suggested ${place || 'somewhere'}`;
    case 'changed':
      return `${who} changed it${meta?.what && meta?.when ? `: ${meta.what}, ${meta.when}` : ''}`;
    case 'called_off':
      return `${who} called it off`;
    case 'locked_day':
      return `${who} locked in ${meta?.day ? shortDay(meta.day) : 'a date'}`;
    default:
      return '';
  }
}

/** "2 new" on a chat row, nothing when there's nothing new. Caps at 9+. */
export function newCount(n: number): string {
  return n <= 0 ? '' : n > 9 ? '9+ new' : `${n} new`;
}
