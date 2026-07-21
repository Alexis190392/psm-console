import { describe, expect, it } from 'vitest';
import { formatLocalLogTimestamp } from '../src/shared/utils/local-time';

describe('local time formatting', () => {
  it('formats log timestamps without UTC marker', () => {
    const value = formatLocalLogTimestamp(new Date('2026-07-21T15:00:00Z'));

    expect(value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(value).not.toContain('T');
    expect(value).not.toContain('Z');
  });
});
