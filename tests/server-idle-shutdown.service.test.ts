import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerIdleShutdownService } from '../src/backend/server-idle-shutdown/server-idle-shutdown.service';
import type { ServerIdlePolicyDto } from '../src/shared/dto/server-idle-policy.dto';

describe('ServerIdleShutdownService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops only after confirmed zero players for the configured time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'));
    const policy: ServerIdlePolicyDto = { enabled: true, emptySeconds: 10 };
    const stopAutomatically = vi.fn();
    const service = new ServerIdleShutdownService(
      {
        read: vi.fn(() => Promise.resolve(policy)),
        update: vi.fn()
      } as never,
      {
        getStatus: vi.fn(() => Promise.resolve({
          status: 'READY',
          currentPlayers: 0,
          players: [],
          previousPlayers: [],
          updatedAt: new Date().toISOString(),
          message: 'Sin jugadores.'
        }))
      } as never,
      {
        getRuntimeStatus: vi.fn(() => ({ state: 'RUNNING' })),
        stopAutomatically
      } as never,
      {
        write: vi.fn(() => Promise.resolve())
      } as never
    );

    await service.evaluate();
    expect((await service.getStatus()).state).toBe('COUNTDOWN');
    expect(stopAutomatically).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    await service.evaluate();

    expect(stopAutomatically).toHaveBeenCalledTimes(1);
  });

  it('cancels the countdown when players return', async () => {
    vi.useFakeTimers();
    const getPlayersStatus = vi.fn()
      .mockResolvedValueOnce({
        status: 'READY',
        currentPlayers: 0,
        players: [],
        previousPlayers: [],
        updatedAt: new Date().toISOString(),
        message: 'Sin jugadores.'
      })
      .mockResolvedValue({
        status: 'READY',
        currentPlayers: 1,
        players: [{}],
        previousPlayers: [],
        updatedAt: new Date().toISOString(),
        message: 'Con jugadores.'
      });
    const service = new ServerIdleShutdownService(
      { read: vi.fn(() => Promise.resolve({ enabled: true, emptySeconds: 10 })) } as never,
      { getStatus: getPlayersStatus } as never,
      { getRuntimeStatus: vi.fn(() => ({ state: 'RUNNING' })), stopAutomatically: vi.fn() } as never,
      { write: vi.fn(() => Promise.resolve()) } as never
    );

    await service.evaluate();
    vi.advanceTimersByTime(5_000);
    await service.evaluate();

    const status = await service.getStatus();
    expect(status.state).toBe('WAITING_FOR_PLAYERS');
    expect(status.emptySince).toBeUndefined();
  });

  it('does not count connection errors as an empty server', async () => {
    const stopAutomatically = vi.fn();
    const service = new ServerIdleShutdownService(
      { read: vi.fn(() => Promise.resolve({ enabled: true, emptySeconds: 10 })) } as never,
      {
        getStatus: vi.fn(() => Promise.resolve({
          status: 'CONNECTION_ERROR',
          currentPlayers: 0,
          players: [],
          previousPlayers: [],
          updatedAt: new Date().toISOString(),
          message: 'REST no disponible.'
        }))
      } as never,
      { getRuntimeStatus: vi.fn(() => ({ state: 'RUNNING' })), stopAutomatically } as never,
      { write: vi.fn(() => Promise.resolve()) } as never
    );

    await service.evaluate();

    expect((await service.getStatus()).state).toBe('MONITOR_UNAVAILABLE');
    expect(stopAutomatically).not.toHaveBeenCalled();
  });
});
