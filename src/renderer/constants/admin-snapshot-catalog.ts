export type AdminSnapshotSection = 'info' | 'metrics' | 'settings';
export type AdminMetricHealthDirection = 'minimum' | 'maximum';

export interface AdminSnapshotFieldDefinition {
  key: string;
  label: string;
  description: string;
  unit?: string;
  format?: 'boolean' | 'duration' | 'multiplier';
  health?: {
    direction: AdminMetricHealthDirection;
    warning: number;
    critical: number;
  };
}

const ADMIN_SNAPSHOT_CATALOG: Readonly<Record<AdminSnapshotSection, readonly AdminSnapshotFieldDefinition[]>> = {
  info: [
    { key: 'version', label: 'Version', description: 'Version de Palworld ejecutada por el servidor.' },
    { key: 'servername', label: 'Nombre', description: 'Nombre publico configurado para el servidor.' },
    { key: 'description', label: 'Descripcion', description: 'Descripcion publica del servidor.' },
    { key: 'worldguid', label: 'ID del mundo', description: 'Identificador unico del mundo guardado.' }
  ],
  metrics: [
    {
      key: 'serverfps',
      label: 'FPS actuales',
      description: 'Fotogramas por segundo procesados actualmente por el servidor.',
      unit: 'FPS',
      health: { direction: 'minimum', warning: 50, critical: 30 }
    },
    {
      key: 'serverfpsaverage',
      label: 'FPS promedio',
      description: 'Promedio reciente de fotogramas por segundo reportado por el servidor.',
      unit: 'FPS',
      health: { direction: 'minimum', warning: 50, critical: 30 }
    },
    {
      key: 'serverframetime',
      label: 'Tiempo por frame',
      description: 'Tiempo que tarda el servidor en procesar cada frame.',
      unit: 'ms',
      health: { direction: 'maximum', warning: 20, critical: 34 }
    },
    {
      key: 'currentplayernum',
      label: 'Jugadores conectados',
      description: 'Cantidad de jugadores conectados en este momento.'
    },
    {
      key: 'maxplayernum',
      label: 'Capacidad',
      description: 'Cantidad maxima de jugadores admitida por el servidor.'
    },
    {
      key: 'uptime',
      label: 'Tiempo activo',
      description: 'Tiempo transcurrido desde el ultimo inicio del servidor.',
      format: 'duration'
    },
    {
      key: 'basecampnum',
      label: 'Bases construidas',
      description: 'Cantidad total de bases existentes en el mundo.'
    },
    {
      key: 'days',
      label: 'Dias del mundo',
      description: 'Cantidad de dias transcurridos dentro del mundo.'
    }
  ],
  settings: [
    { key: 'Difficulty', label: 'Dificultad', description: 'Perfil de dificultad activo.' },
    { key: 'RandomizerType', label: 'Aleatorizacion', description: 'Modo de aleatorizacion aplicado al mundo.' },
    { key: 'RandomizerSeed', label: 'Semilla', description: 'Semilla utilizada por el aleatorizador.' },
    {
      key: 'bIsRandomizerPalLevelRandom',
      label: 'Niveles aleatorios',
      description: 'Indica si los niveles de los Pals se generan aleatoriamente.',
      format: 'boolean'
    },
    {
      key: 'DayTimeSpeedRate',
      label: 'Velocidad del dia',
      description: 'Multiplicador de velocidad del ciclo diurno.',
      format: 'multiplier'
    },
    {
      key: 'NightTimeSpeedRate',
      label: 'Velocidad de la noche',
      description: 'Multiplicador de velocidad del ciclo nocturno.',
      format: 'multiplier'
    },
    {
      key: 'ServerPlayerMaxNum',
      label: 'Jugadores maximos',
      description: 'Limite de jugadores configurado.'
    },
    { key: 'PublicPort', label: 'Puerto de jugadores', description: 'Puerto UDP utilizado por los jugadores.' },
    {
      key: 'RESTAPIEnabled',
      label: 'REST API',
      description: 'Indica si la administracion REST esta habilitada.',
      format: 'boolean'
    },
    { key: 'RESTAPIPort', label: 'Puerto REST', description: 'Puerto TCP utilizado por la REST API.' }
  ]
};

export function getAdminSnapshotFields(
  section: AdminSnapshotSection,
  snapshot: Readonly<Record<string, unknown>>,
  limit = 6
): Array<[string, unknown, AdminSnapshotFieldDefinition | undefined]> {
  const definitions = ADMIN_SNAPSHOT_CATALOG[section];
  const order = new Map(definitions.map((definition, index) => [definition.key, index]));

  return Object.entries(snapshot)
    .sort(([left], [right]) => {
      const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })
    .slice(0, limit)
    .map(([key, value]) => [
      key,
      value,
      definitions.find((definition) => definition.key === key)
    ]);
}
