import { describe, expect, it } from 'vitest';
import { PortablePathService } from '../src/backend/portable-path/portable-path.service';

describe('PortablePathService', () => {
  it('uses the executable directory when packaged', () => {
    const service = new PortablePathService({
      isPackaged: true,
      getPath: () => 'C:\\Portable\\PalworldServerManager.exe'
    });

    expect(service.getPortableRoot()).toBe('C:\\Portable');
  });
});
