import { describe, expect, it } from '@jest/globals';

import { routeForBuzz } from '../buzz';

describe('routeForBuzz', () => {
  it('sends every buzz somewhere sensible', () => {
    expect(routeForBuzz({ type: 'chat', beacon_id: 'b1', poll_id: null })).toEqual({ chat: { beaconId: 'b1', pollId: null } });
    expect(routeForBuzz({ type: 'chat', beacon_id: null, poll_id: 'p1' })).toEqual({ chat: { beaconId: null, pollId: 'p1' } });
    expect(routeForBuzz({ type: 'poll', poll_id: 'p1' })).toEqual({ href: '/poll/p1' });
    expect(routeForBuzz({ type: 'called_off', beacon_id: 'b1' })).toEqual({ href: '/past' });
    expect(routeForBuzz({ type: 'friend_request' })).toEqual({ href: '/friends' });
    expect(routeForBuzz({ type: 'friend_accept' })).toEqual({ href: '/friends' });
    for (const type of ['beacon', 'response', 'out', 'locked', 'suggestion', 'reminder']) {
      expect(routeForBuzz({ type, beacon_id: 'b1' })).toEqual({ beacon: 'b1' });
    }
  });
  it('does nothing for unknown or empty buzzes', () => {
    expect(routeForBuzz(undefined)).toBeNull();
    expect(routeForBuzz({ type: 'something_new' })).toBeNull();
  });
});
