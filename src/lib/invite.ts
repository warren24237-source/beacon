// Where mates download Beacon. This is the build 1.3.0 install page on Expo.
// Change it when there's a new full build, or once Google Play testing is set up.
export const INSTALL_LINK = 'https://expo.dev/accounts/wazap242/projects/beacon/builds/a7579d8a-bddc-4100-9fab-7818a8f5b3c0';

/** The invite: download link, join code and your friend code, so you're friends the moment they join. */
export function inviteText(myCode: string | null | undefined, name?: string) {
  return `${name ? `Hey ${name}, i` : 'I'}'m using Beacon to tell mates when I'm free for a drink, coffee or whatever. Fancy it? Android only for now.

1. Install: ${INSTALL_LINK}
2. Open it and use the join code: join-me
3. Add me with my code: ${myCode ?? ''}`;
}
