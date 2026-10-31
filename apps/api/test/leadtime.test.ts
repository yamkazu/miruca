import { describe, expect, it } from 'vitest';
import { averageLeadTimeHours } from '../src/leadtime';

describe('averageLeadTimeHours', () => {
  it('is exported', () => {
    expect(typeof averageLeadTimeHours).toBe('function');
  });
});
