import { describe, expect, it } from 'vitest';
import { rateLimiter } from '../src/rate-limiter.js';
import { registry } from '../src/providers/registry.js';
import { FakeProvider } from './helpers/fake-provider.js';

describe('rate limiter cooldowns never shorten', () => {
  // Two creates in flight on the same provider: one gets 429 Retry-After 600,
  // the other times out on getDomains a moment later. The later, shorter
  // transient verdict must not reopen the provider after 30 s.
  it('keeps a longer rate-limit cooldown when a transient failure lands after it', () => {
    registry.register(new FakeProvider({ name: 'cool-a' }));
    rateLimiter.recordRateLimitFailure('cool-a', '600');
    const before = rateLimiter.getCreateStatus('cool-a');

    rateLimiter.recordTransientFailure('cool-a');
    const after = rateLimiter.getCreateStatus('cool-a');

    expect(after.available).toBe(false);
    expect(after.cooldownReason).toBe('rate-limit');
    expect(after.nextAvailableAt).toBe(before.nextAvailableAt);
    expect(Date.parse(after.nextAvailableAt!) - Date.now()).toBeGreaterThan(500_000);
    registry.unregister('cool-a');
  });

  it('extends a short transient cooldown when a rate-limit verdict lands after it', () => {
    registry.register(new FakeProvider({ name: 'cool-b' }));
    rateLimiter.recordTransientFailure('cool-b');
    rateLimiter.recordRateLimitFailure('cool-b', '600');

    const status = rateLimiter.getCreateStatus('cool-b');
    expect(status.cooldownReason).toBe('rate-limit');
    expect(Date.parse(status.nextAvailableAt!) - Date.now()).toBeGreaterThan(500_000);
    registry.unregister('cool-b');
  });

  it('replaces an expired cooldown instead of keeping its stale deadline', () => {
    registry.register(new FakeProvider({ name: 'cool-c' }));
    rateLimiter.setCooldown('cool-c', Date.now() - 1_000, 'rate-limit');
    rateLimiter.recordTransientFailure('cool-c');

    const status = rateLimiter.getCreateStatus('cool-c');
    expect(status.available).toBe(false);
    expect(status.cooldownReason).toBe('transient-error');
    registry.unregister('cool-c');
  });

  it('still clears every cooldown on a real create success', () => {
    registry.register(new FakeProvider({ name: 'cool-d' }));
    rateLimiter.recordRateLimitFailure('cool-d', '600');
    rateLimiter.recordCreateSuccess('cool-d');

    expect(rateLimiter.getCreateStatus('cool-d').available).toBe(true);
    registry.unregister('cool-d');
  });
});
