import { describe, expect, it } from 'vitest';
import { hasConfigurationChangedExternally } from '../src/renderer/config/configuration-change-guard';

describe('configuration change guard', () => {
  it('detects when active INI differs from the originally loaded content', () => {
    expect(hasConfigurationChangedExternally('OptionSettings=(PublicPort=8211)', 'OptionSettings=(PublicPort=8212)')).toBe(true);
    expect(hasConfigurationChangedExternally('OptionSettings=(PublicPort=8211)', 'OptionSettings=(PublicPort=8211)')).toBe(false);
  });
});

