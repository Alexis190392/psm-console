import { describe, expect, it } from 'vitest';
import type { PalworldAdminStatusDto } from '../src/shared/dto/palworld-admin.dto';
import type { PalworldPlayersStatusDto } from '../src/shared/dto/palworld-players-status.dto';
import { renderAdminStatus } from '../src/renderer/views/admin-view';

const adminStatus: PalworldAdminStatusDto = {
  status: 'READY',
  info: { servername: 'Servidor de prueba' },
  metrics: { currentplayernum: 1 },
  settings: { PublicPort: 8211 },
  updatedAt: '2026-07-24T12:00:00.000Z',
  message: 'Administracion REST disponible.'
};

const playersStatus: PalworldPlayersStatusDto = {
  status: 'READY',
  currentPlayers: 1,
  maxPlayers: 32,
  players: [
    {
      name: 'Jugador <Uno>',
      userId: 'steam_1',
      ping: 24.28,
      online: true,
      locationX: 120,
      locationY: -45,
      level: 8,
      banState: 'NOT_BANNED'
    }
  ],
  previousPlayers: [
    {
      name: 'Anterior',
      userId: 'steam_2',
      online: false,
      banState: 'BANNED'
    }
  ],
  updatedAt: '2026-07-24T12:00:00.000Z',
  message: 'Jugadores disponibles.'
};

describe('admin view', () => {
  it('renders server administration actions in the general tab', () => {
    const html = renderAdminStatus(adminStatus, playersStatus, 'general');

    expect(html).toContain('ADMINISTRACION / SERVIDOR');
    expect(html).toContain('data-admin-form="save"');
    expect(html).toContain('data-admin-form="shutdown"');
    expect(html).toContain('data-admin-form="stop"');
    expect(html).toContain('class="input-with-unit"');
    expect(html).toContain('<small>s</small>');
    expect(html).toContain('Servidor de prueba');
  });

  it('renders current and previous players with safe actions', () => {
    const html = renderAdminStatus(adminStatus, playersStatus, 'players');

    expect(html).toContain('ADMINISTRACION / JUGADORES');
    expect(html).toContain('En curso');
    expect(html).toContain('Vistos anteriormente');
    expect(html).toContain('data-player-action="kick"');
    expect(html).toContain('data-player-action="unban"');
    expect(html).toContain('data-admin-form="announce"');
    expect(html).toContain('data-admin-form="player"');
    expect(html).toContain('player-row__identity');
    expect(html).toContain('player-row__details');
    expect(html).toContain('player-row__status');
    expect(html).toContain('Jugador &lt;Uno&gt;');
    expect(html).not.toContain('Jugador <Uno>');
  });

  it('renders relative player positions in the map tab', () => {
    const html = renderAdminStatus(adminStatus, playersStatus, 'map');

    expect(html).toContain('ADMINISTRACION / MAPA');
    expect(html).toContain('admin-map-marker');
    expect(html).toContain('X 120 / Y -45');
  });
});
