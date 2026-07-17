export type PalworldSettingKind = 'text' | 'number' | 'boolean' | 'select';

export interface PalworldSettingDefinition {
  key: string;
  label: string;
  group: string;
  kind: PalworldSettingKind;
  help: string;
  range?: string;
  options?: string[];
}

export const DEFAULT_SETTING_HELP =
  'Parametro avanzado detectado en el INI. Si no estas seguro, conserva el valor actual y cambia solo despues de probar en el servidor.';

export const PALWORLD_SETTING_DEFINITIONS: Record<string, PalworldSettingDefinition> = {
  ServerName: {
    key: 'ServerName',
    label: 'Nombre del servidor',
    group: 'Identidad',
    kind: 'text',
    help: 'Nombre visible del servidor para identificarlo en listas, logs y referencias internas.'
  },
  ServerDescription: {
    key: 'ServerDescription',
    label: 'Descripcion',
    group: 'Identidad',
    kind: 'text',
    help: 'Texto descriptivo del servidor. Conviene usarlo para reglas, idioma, tipo de partida o notas para jugadores.'
  },
  AdminPassword: {
    key: 'AdminPassword',
    label: 'Password de administrador',
    group: 'Acceso',
    kind: 'text',
    help: 'Clave para acciones administrativas. No la compartas con jugadores normales.'
  },
  ServerPassword: {
    key: 'ServerPassword',
    label: 'Password del servidor',
    group: 'Acceso',
    kind: 'text',
    help: 'Clave requerida para entrar. Vacio permite acceso sin password, si la red/firewall lo permite.'
  },
  PublicPort: {
    key: 'PublicPort',
    label: 'Puerto publico',
    group: 'Red',
    kind: 'number',
    range: '1 a 65535. Default: 8211.',
    help: 'Puerto UDP principal para que los jugadores conecten al servidor. Debe coincidir con firewall y router.'
  },
  PublicIP: {
    key: 'PublicIP',
    label: 'IP publica',
    group: 'Red',
    kind: 'text',
    help: 'IP publica anunciada. Normalmente puede quedar vacia si no necesitas forzar una direccion especifica.'
  },
  RCONEnabled: {
    key: 'RCONEnabled',
    label: 'RCON habilitado',
    group: 'Red',
    kind: 'boolean',
    help: 'Permite administracion remota por RCON. Usalo solo si sabes que herramienta lo necesita y protege el acceso.'
  },
  RCONPort: {
    key: 'RCONPort',
    label: 'Puerto RCON',
    group: 'Red',
    kind: 'number',
    range: '1 a 65535. Default: 25575.',
    help: 'Puerto usado por RCON cuando esta habilitado. No lo expongas publicamente sin necesidad.'
  },
  RESTAPIEnabled: {
    key: 'RESTAPIEnabled',
    label: 'REST API habilitada',
    group: 'Red',
    kind: 'boolean',
    help: 'Habilita API HTTP local del servidor. Recomendado mantenerla local salvo que se agregue seguridad explicita.'
  },
  RESTAPIPort: {
    key: 'RESTAPIPort',
    label: 'Puerto REST API',
    group: 'Red',
    kind: 'number',
    range: '1 a 65535. Default: 8212.',
    help: 'Puerto donde escucha la REST API si esta habilitada. Debe evitar conflictos con otros servicios.'
  },
  ServerPlayerMaxNum: {
    key: 'ServerPlayerMaxNum',
    label: 'Maximo de jugadores',
    group: 'Jugadores',
    kind: 'number',
    range: '1 a 32 recomendado para servidor dedicado.',
    help: 'Cantidad maxima de jugadores conectados. Mas jugadores requieren mas CPU, RAM y ancho de banda.'
  },
  CoopPlayerMaxNum: {
    key: 'CoopPlayerMaxNum',
    label: 'Jugadores coop',
    group: 'Jugadores',
    kind: 'number',
    range: '1 a 4 usualmente.',
    help: 'Limite de jugadores para sesiones cooperativas. En dedicado suele importar menos que el maximo del servidor.'
  },
  GuildPlayerMaxNum: {
    key: 'GuildPlayerMaxNum',
    label: 'Maximo por guild',
    group: 'Jugadores',
    kind: 'number',
    help: 'Cantidad maxima de jugadores por guild. Ajustalo segun el tamano esperado de grupos.'
  },
  Difficulty: {
    key: 'Difficulty',
    label: 'Dificultad',
    group: 'Mundo',
    kind: 'select',
    options: ['None', 'Easy', 'Normal', 'Hard'],
    help: 'Perfil general de dificultad. None conserva el comportamiento default del servidor.'
  },
  DayTimeSpeedRate: {
    key: 'DayTimeSpeedRate',
    label: 'Velocidad del dia',
    group: 'Mundo',
    kind: 'number',
    range: '0.1 a 5.0. Default: 1.0.',
    help: 'Multiplica la velocidad con la que pasa el dia. Mayor valor hace que el dia dure menos.'
  },
  NightTimeSpeedRate: {
    key: 'NightTimeSpeedRate',
    label: 'Velocidad de la noche',
    group: 'Mundo',
    kind: 'number',
    range: '0.1 a 5.0. Default: 1.0.',
    help: 'Multiplica la velocidad con la que pasa la noche. Mayor valor hace que la noche dure menos.'
  },
  ExpRate: {
    key: 'ExpRate',
    label: 'Experiencia',
    group: 'Progreso',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    help: 'Multiplica la experiencia ganada. Subirlo acelera el progreso de jugadores y pals.'
  },
  PalCaptureRate: {
    key: 'PalCaptureRate',
    label: 'Captura de pals',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    help: 'Multiplica la probabilidad de captura. Mayor valor facilita capturar pals.'
  },
  PalSpawnNumRate: {
    key: 'PalSpawnNumRate',
    label: 'Cantidad de pals',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 3.0 recomendado.',
    help: 'Ajusta la cantidad de pals que aparecen. Valores altos pueden afectar rendimiento.'
  },
  PalEggDefaultHatchingTime: {
    key: 'PalEggDefaultHatchingTime',
    label: 'Tiempo de incubacion',
    group: 'Pals',
    kind: 'number',
    range: '0 o mas. Default: 1.0.',
    help: 'Multiplica el tiempo de eclosion de huevos. Menor valor acelera la incubacion.'
  },
  WorkSpeedRate: {
    key: 'WorkSpeedRate',
    label: 'Velocidad de trabajo',
    group: 'Base',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    help: 'Multiplica la velocidad de trabajo en base. Subirlo acelera produccion y tareas.'
  },
  BaseCampWorkerMaxNum: {
    key: 'BaseCampWorkerMaxNum',
    label: 'Pals trabajadores por base',
    group: 'Base',
    kind: 'number',
    range: '1 o mas. Default: 15.',
    help: 'Cantidad maxima de pals asignables como trabajadores por base.'
  },
  BaseCampMaxNumInGuild: {
    key: 'BaseCampMaxNumInGuild',
    label: 'Bases por guild',
    group: 'Base',
    kind: 'number',
    help: 'Cantidad de bases que puede tener una guild. Subirlo aumenta carga del mundo.'
  },
  BuildObjectDeteriorationDamageRate: {
    key: 'BuildObjectDeteriorationDamageRate',
    label: 'Deterioro de estructuras',
    group: 'Base',
    kind: 'number',
    range: '0 desactiva deterioro. Default: 1.0.',
    help: 'Controla cuanto se deterioran construcciones con el tiempo.'
  },
  CollectionDropRate: {
    key: 'CollectionDropRate',
    label: 'Recursos recolectados',
    group: 'Recursos',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    help: 'Multiplica la cantidad de recursos obtenidos al recolectar.'
  },
  CollectionObjectRespawnSpeedRate: {
    key: 'CollectionObjectRespawnSpeedRate',
    label: 'Respawn de recursos',
    group: 'Recursos',
    kind: 'number',
    help: 'Controla que tan rapido vuelven a aparecer objetos recolectables.'
  },
  EnemyDropItemRate: {
    key: 'EnemyDropItemRate',
    label: 'Drops de enemigos',
    group: 'Recursos',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    help: 'Multiplica la cantidad de items que dejan enemigos y pals.'
  },
  DeathPenalty: {
    key: 'DeathPenalty',
    label: 'Penalizacion al morir',
    group: 'Jugadores',
    kind: 'select',
    options: ['None', 'Item', 'ItemAndEquipment', 'All'],
    help: 'Define que pierde el jugador al morir. None es mas casual; All es mas exigente.'
  },
  bEnablePlayerToPlayerDamage: {
    key: 'bEnablePlayerToPlayerDamage',
    label: 'Dano jugador vs jugador',
    group: 'PvP',
    kind: 'boolean',
    help: 'Permite que jugadores se hagan dano entre si. Usalo para servidores PvP.'
  },
  bIsPvP: {
    key: 'bIsPvP',
    label: 'Modo PvP',
    group: 'PvP',
    kind: 'boolean',
    help: 'Activa reglas de PvP del servidor.'
  },
  bEnableFriendlyFire: {
    key: 'bEnableFriendlyFire',
    label: 'Fuego amigo',
    group: 'PvP',
    kind: 'boolean',
    help: 'Permite dano entre aliados. Puede generar conflictos si no esta claro para jugadores.'
  },
  bEnableFastTravel: {
    key: 'bEnableFastTravel',
    label: 'Viaje rapido',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Permite usar viaje rapido. Desactivarlo hace el mundo mas exigente.'
  },
  AutoSaveSpan: {
    key: 'AutoSaveSpan',
    label: 'Autosave',
    group: 'Mantenimiento',
    kind: 'number',
    range: 'Minutos. Default: 30.',
    help: 'Intervalo de guardado automatico. Menor valor reduce perdida ante caidas, pero puede generar mas I/O.'
  },
  bIsUseBackupSaveData: {
    key: 'bIsUseBackupSaveData',
    label: 'Backups de mundo',
    group: 'Mantenimiento',
    kind: 'boolean',
    help: 'Permite que el servidor use datos de respaldo. Recomendado mantener activo.'
  },
  ChatPostLimitPerMinute: {
    key: 'ChatPostLimitPerMinute',
    label: 'Mensajes por minuto',
    group: 'Moderacion',
    kind: 'number',
    help: 'Limite de mensajes de chat por minuto para reducir spam.'
  },
  bShowPlayerList: {
    key: 'bShowPlayerList',
    label: 'Mostrar lista de jugadores',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Controla si se muestra la lista de jugadores desde funciones compatibles.'
  },
  bAllowClientMod: {
    key: 'bAllowClientMod',
    label: 'Permitir mods cliente',
    group: 'Moderacion',
    kind: 'boolean',
    help: 'Permite clientes con mods. Desactivarlo puede ayudar a mantener consistencia del servidor.'
  },
  bEnableVoiceChat: {
    key: 'bEnableVoiceChat',
    label: 'Chat de voz',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Activa chat de voz del juego si la version/cliente lo soporta.'
  }
};
