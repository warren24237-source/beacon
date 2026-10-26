// Where mates get Beacon (decision 62): Google Play internal testing. Only people Warren has added
// to the "Beacon friends" list can install from this link, so the invite asks for their store email first.
// iPhone friends get a TestFlight invite instead (decision 64).
export const INSTALL_LINK = 'https://play.google.com/apps/internaltest/4701015742130024367';

/** The invite: how to get added, where to install, the join code, and your friend code. */
export function inviteText(myCode: string | null | undefined, name?: string) {
  return `${name ? `Hey ${name}, i` : 'I'}'m testing an app called Beacon for telling mates when I'm free for a drink, coffee or whatever. It's invite only for now.

1. Send me the email your phone's app store uses so I can add you.
2. Android: install from ${INSTALL_LINK}
   iPhone: I'll send you a TestFlight invite.
3. Open it and use the join code: join-me
4. Add me with my code: ${myCode ?? ''}`;
}
