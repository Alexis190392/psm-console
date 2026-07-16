import { describe, expect, it } from 'vitest';
import { ApplicationStateService } from '../src/backend/application-state/application-state.service';
import { createNestContext } from '../src/main/bootstrap/nest-bootstrap';

describe('NestJS bootstrap', () => {
  it('starts an application context with core services', async () => {
    const context = await createNestContext();

    try {
      expect(context.get(ApplicationStateService)).toBeInstanceOf(ApplicationStateService);
    } finally {
      await context.close();
    }
  });
});
