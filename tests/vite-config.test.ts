import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

describe('Vite renderer config', () => {
  it('uses relative asset paths for Electron file loading', () => {
    expect(viteConfig).toMatchObject({
      base: './'
    });
  });
});
