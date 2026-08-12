export type PalworldSettingKind = 'text' | 'number' | 'boolean' | 'select';

export interface PalworldSettingDefinition {
  key: string;
  label?: string;
  group: string;
  kind: PalworldSettingKind;
  help?: string;
  range?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  zeroToggle?: {
    zeroValue: string;
    defaultValue: string;
    enabledLabel: string;
    disabledLabel: string;
  };
}

export const PALWORLD_SETTING_DEFINITIONS: Record<string, PalworldSettingDefinition> = {
  ServerName: {
    key: 'ServerName',
    label: 'Nombre del servidor',
    group: 'Datos del servidor',
    kind: 'text',
    help: 'Es el nombre que identifica tu mundo. Usalo para que tus amigos reconozcan rapidamente a que servidor se estan conectando.'
  },
  ServerDescription: {
    key: 'ServerDescription',
    label: 'Descripcion del servidor',
    group: 'Datos del servidor',
    kind: 'text',
    help: 'Texto breve para explicar reglas, idioma, horarios o tipo de partida. Sirve como referencia para quienes entren al servidor.'
  },
  AdminPassword: {
    key: 'AdminPassword',
    label: 'Clave de administrador',
    group: 'Acceso y seguridad',
    kind: 'text',
    help: 'Permite usar funciones administrativas. Debe ser distinta a la clave de entrada y compartirse solo con personas de confianza.'
  },
  ServerPassword: {
    key: 'ServerPassword',
    label: 'Clave para entrar',
    group: 'Acceso y seguridad',
    kind: 'text',
    help: 'Clave que pide el juego para entrar al servidor. Si queda vacia, cualquiera que tenga acceso de red podria intentar conectarse.'
  },
  PublicPort: {
    key: 'PublicPort',
    label: 'Puerto de juego',
    group: 'Red',
    kind: 'number',
    range: '1 a 65535. Default: 8211.',
    min: 1,
    max: 65535,
    step: 1,
    help: 'Es el puerto principal por donde entran los jugadores. Debe estar permitido en Windows y, si queres acceso por Internet, redirigido en el router.'
  },
  PublicIP: {
    key: 'PublicIP',
    label: 'IP publica anunciada',
    group: 'Red',
    kind: 'text',
    help: 'Normalmente conviene dejarla vacia. Solo completala si necesitás forzar una IP concreta para publicar o anunciar el servidor.'
  },
  RCONEnabled: {
    key: 'RCONEnabled',
    label: 'Administracion remota RCON',
    group: 'Red',
    kind: 'boolean',
    help: 'Activa un puerto para administrar el servidor con herramientas externas. Si no usas una herramienta RCON, mantenelo desactivado.'
  },
  RCONPort: {
    key: 'RCONPort',
    label: 'Puerto RCON',
    group: 'Red',
    kind: 'number',
    range: '1 a 65535. Default: 25575.',
    min: 1,
    max: 65535,
    step: 1,
    help: 'Puerto usado por RCON cuando la administracion remota esta activa. No lo expongas a Internet salvo que lo necesites y sepas protegerlo.'
  },
  RESTAPIEnabled: {
    key: 'RESTAPIEnabled',
    label: 'API REST del servidor',
    group: 'Red',
    kind: 'boolean',
    help: 'Activa una API HTTP para integraciones o herramientas externas. Para uso normal con amigos no es necesaria.'
  },
  RESTAPIPort: {
    key: 'RESTAPIPort',
    label: 'Puerto REST API',
    group: 'Red',
    kind: 'number',
    range: '1 a 65535. Default: 8212.',
    min: 1,
    max: 65535,
    step: 1,
    help: 'Puerto donde escucha la API REST si esta activa. Evita usar puertos ya ocupados por otras aplicaciones.'
  },
  ServerPlayerMaxNum: {
    key: 'ServerPlayerMaxNum',
    label: 'Jugadores maximos',
    group: 'Jugadores',
    kind: 'number',
    range: '1 a 32 recomendado para servidor dedicado.',
    min: 1,
    max: 32,
    step: 1,
    help: 'Cantidad maxima de jugadores conectados al mismo tiempo. Mas jugadores consumen mas CPU, memoria y ancho de banda.'
  },
  CoopPlayerMaxNum: {
    key: 'CoopPlayerMaxNum',
    label: 'Jugadores en cooperativo',
    group: 'Jugadores',
    kind: 'number',
    range: '1 a 4 usualmente.',
    min: 1,
    max: 4,
    step: 1,
    help: 'Limite usado por sesiones cooperativas. En servidor dedicado suele ser menos importante que el maximo general de jugadores.'
  },
  GuildPlayerMaxNum: {
    key: 'GuildPlayerMaxNum',
    label: 'Jugadores por gremio',
    group: 'Jugadores',
    kind: 'number',
    min: 1,
    max: 32,
    step: 1,
    help: 'Cantidad maxima de jugadores dentro de un gremio. Subilo si todos van a jugar juntos; bajalo si queres dividir grupos.'
  },
  Difficulty: {
    key: 'Difficulty',
    label: 'Dificultad',
    group: 'Mundo',
    kind: 'select',
    options: ['None', 'Easy', 'Normal', 'Hard'],
    help: 'Define el perfil base de dificultad. Si usas None, el servidor conserva los valores configurados manualmente en el INI.'
  },
  DayTimeSpeedRate: {
    key: 'DayTimeSpeedRate',
    label: 'Duracion del dia',
    group: 'Mundo',
    kind: 'number',
    range: '0.1 a 5.0. Default: 1.0.',
    min: 0.1,
    max: 5,
    step: 0.1,
    help: 'Controla que tan rapido pasa el dia. Valores mayores hacen que el dia avance mas rapido y dure menos.'
  },
  NightTimeSpeedRate: {
    key: 'NightTimeSpeedRate',
    label: 'Duracion de la noche',
    group: 'Mundo',
    kind: 'number',
    range: '0.1 a 5.0. Default: 1.0.',
    min: 0.1,
    max: 5,
    step: 0.1,
    help: 'Controla que tan rapido pasa la noche. Valores mayores hacen que la noche avance mas rapido y dure menos.'
  },
  ExpRate: {
    key: 'ExpRate',
    label: 'Multiplicador de experiencia',
    group: 'Progreso',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la experiencia ganada. Subirlo acelera niveles de jugadores y pals; bajarlo hace la progresion mas lenta.'
  },
  PalCaptureRate: {
    key: 'PalCaptureRate',
    label: 'Facilidad de captura',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la probabilidad de capturar pals. Valores altos hacen mas facil capturar; valores bajos lo vuelven mas exigente.'
  },
  PalSpawnNumRate: {
    key: 'PalSpawnNumRate',
    label: 'Aparicion de pals',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 3.0 recomendado.',
    min: 0.1,
    max: 3,
    step: 0.1,
    help: 'Ajusta cuantos pals aparecen en el mundo. Valores altos hacen el mundo mas poblado, pero pueden afectar rendimiento.'
  },
  PalEggDefaultHatchingTime: {
    key: 'PalEggDefaultHatchingTime',
    label: 'Tiempo de incubacion de huevos',
    group: 'Pals',
    kind: 'number',
    range: '0 o mas. Default: 1.0.',
    min: 0,
    max: 72,
    step: 0.5,
    help: 'Controla cuanto tardan los huevos en eclosionar. Un valor mas bajo acelera la incubacion; 0 suele hacerla inmediata.'
  },
  WorkSpeedRate: {
    key: 'WorkSpeedRate',
    label: 'Velocidad de trabajo en base',
    group: 'Base',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la velocidad de produccion, construccion y tareas dentro de la base.'
  },
  BaseCampWorkerMaxNum: {
    key: 'BaseCampWorkerMaxNum',
    label: 'Trabajadores por base',
    group: 'Base',
    kind: 'number',
    range: '1 o mas. Default: 15.',
    min: 1,
    max: 50,
    step: 1,
    help: 'Cantidad maxima de pals asignables como trabajadores en cada base. Valores altos pueden exigir mas al servidor.'
  },
  BaseCampMaxNumInGuild: {
    key: 'BaseCampMaxNumInGuild',
    label: 'Bases por gremio',
    group: 'Base',
    kind: 'number',
    min: 1,
    max: 20,
    step: 1,
    help: 'Cantidad de bases que puede tener un gremio. Mas bases dan libertad, pero aumentan carga del mundo.'
  },
  BuildObjectDeteriorationDamageRate: {
    key: 'BuildObjectDeteriorationDamageRate',
    label: 'Deterioro de estructuras',
    group: 'Base',
    kind: 'number',
    range: '0 desactiva deterioro. Default: 1.0.',
    min: 0,
    max: 10,
    step: 0.1,
    help: 'Controla cuanto se dañan o deterioran las construcciones con el tiempo. En 0 se desactiva el deterioro.'
  },
  CollectionDropRate: {
    key: 'CollectionDropRate',
    label: 'Cantidad al recolectar',
    group: 'Recursos',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la cantidad de madera, piedra, minerales y otros recursos obtenidos al recolectar.'
  },
  CollectionObjectRespawnSpeedRate: {
    key: 'CollectionObjectRespawnSpeedRate',
    label: 'Reaparicion de recursos',
    group: 'Recursos',
    kind: 'number',
    min: 0.1,
    max: 10,
    step: 0.1,
    help: 'Controla que tan rapido vuelven a aparecer los objetos recolectables del mundo.'
  },
  EnemyDropItemRate: {
    key: 'EnemyDropItemRate',
    label: 'Botin de enemigos',
    group: 'Recursos',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la cantidad de items que dejan enemigos y pals derrotados.'
  },
  DeathPenalty: {
    key: 'DeathPenalty',
    label: 'Que se pierde al morir',
    group: 'Jugadores',
    kind: 'select',
    options: ['None', 'Item', 'ItemAndEquipment', 'All'],
    help: 'Define que pierde el jugador al morir. None es mas relajado; All hace la experiencia mas dura.'
  },
  PalDamageRateAttack: {
    key: 'PalDamageRateAttack',
    label: 'Dano que hacen los pals',
    group: 'Combate',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica el dano que causan los pals al atacar. Subirlo hace los combates mas peligrosos.'
  },
  PalDamageRateDefense: {
    key: 'PalDamageRateDefense',
    label: 'Dano que reciben los pals',
    group: 'Combate',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica el dano recibido por los pals. Valores altos hacen que caigan mas rapido.'
  },
  PlayerDamageRateAttack: {
    key: 'PlayerDamageRateAttack',
    label: 'Dano que hacen los jugadores',
    group: 'Combate',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica el dano causado por jugadores. Subirlo acelera los combates.'
  },
  PlayerDamageRateDefense: {
    key: 'PlayerDamageRateDefense',
    label: 'Dano que reciben los jugadores',
    group: 'Combate',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica el dano recibido por jugadores. Valores altos vuelven el mundo mas castigador.'
  },
  PlayerStomachDecreaceRate: {
    key: 'PlayerStomachDecreaceRate',
    label: 'Hambre de jugadores',
    group: 'Supervivencia',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Controla que tan rapido baja el hambre del jugador. Valores bajos hacen que necesite comer menos seguido.'
  },
  PlayerStaminaDecreaceRate: {
    key: 'PlayerStaminaDecreaceRate',
    label: 'Consumo de estamina de jugadores',
    group: 'Supervivencia',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Controla que tan rapido se consume la estamina del jugador al correr, trepar o hacer acciones.'
  },
  PlayerAutoHPRegeneRate: {
    key: 'PlayerAutoHPRegeneRate',
    label: 'Regeneracion de vida de jugadores',
    group: 'Supervivencia',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la regeneracion automatica de vida del jugador cuando corresponde.'
  },
  PlayerAutoHpRegeneRateInSleep: {
    key: 'PlayerAutoHpRegeneRateInSleep',
    label: 'Regeneracion al dormir',
    group: 'Supervivencia',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la recuperacion de vida del jugador mientras duerme.'
  },
  PalStomachDecreaceRate: {
    key: 'PalStomachDecreaceRate',
    label: 'Hambre de pals',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Controla que tan rapido baja el hambre de los pals.'
  },
  PalStaminaDecreaceRate: {
    key: 'PalStaminaDecreaceRate',
    label: 'Consumo de estamina de pals',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Controla que tan rapido consumen estamina los pals en combate o movimiento.'
  },
  PalAutoHPRegeneRate: {
    key: 'PalAutoHPRegeneRate',
    label: 'Regeneracion de vida de pals',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la regeneracion automatica de vida de los pals.'
  },
  PalAutoHpRegeneRateInSleep: {
    key: 'PalAutoHpRegeneRateInSleep',
    label: 'Regeneracion de pals al dormir',
    group: 'Pals',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la recuperacion de vida de los pals mientras descansan.'
  },
  BuildObjectHpRate: {
    key: 'BuildObjectHpRate',
    label: 'Vida de estructuras',
    group: 'Base',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Multiplica la vida maxima de estructuras y objetos construidos.'
  },
  BuildObjectDamageRate: {
    key: 'BuildObjectDamageRate',
    label: 'Dano a estructuras',
    group: 'Base',
    kind: 'number',
    range: '0 desactiva el dano. Hasta 20.0. Default: 1.0.',
    min: 0,
    max: 20,
    step: 0.1,
    help: 'Multiplica el dano que reciben estructuras y objetos construidos.'
  },
  CollectionObjectHpRate: {
    key: 'CollectionObjectHpRate',
    label: 'Resistencia de recursos',
    group: 'Recursos',
    kind: 'number',
    range: '0.1 a 20.0. Default: 1.0.',
    min: 0.1,
    max: 20,
    step: 0.1,
    help: 'Controla cuanta resistencia tienen los objetos recolectables antes de romperse.'
  },
  EnableInvaderEnemy: {
    key: 'EnableInvaderEnemy',
    label: 'Ataques a la base',
    group: 'Base',
    kind: 'boolean',
    help: 'Activa eventos donde enemigos pueden invadir o atacar la base.'
  },
  ActiveUNKO: {
    key: 'ActiveUNKO',
    label: 'Parametro interno UNKO',
    group: 'Avanzado',
    kind: 'boolean',
    help: 'Parametro avanzado del servidor. Si no sabes que efecto busca, conviene conservar el valor actual.'
  },
  bEnableAimAssistPad: {
    key: 'bEnableAimAssistPad',
    label: 'Ayuda de apuntado con control',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Activa asistencia de apuntado para jugadores que usan control.'
  },
  bEnableAimAssistKeyboard: {
    key: 'bEnableAimAssistKeyboard',
    label: 'Ayuda de apuntado con teclado',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Activa asistencia de apuntado para jugadores que usan teclado y mouse.'
  },
  RandomizerType: {
    key: 'RandomizerType',
    label: 'Tipo de aleatorizacion',
    group: 'Avanzado',
    kind: 'select',
    options: ['None', 'Region', 'All'],
    help: 'Define el modo de aleatorizacion si la version del servidor lo soporta. Mantene None si no queres reglas experimentales.'
  },
  RandomizerSeed: {
    key: 'RandomizerSeed',
    label: 'Semilla de aleatorizacion',
    group: 'Avanzado',
    kind: 'text',
    help: 'Valor usado como semilla para repetir una aleatorizacion concreta cuando esa funcion esta activa.'
  },
  bIsRandomizerPalLevelRandom: {
    key: 'bIsRandomizerPalLevelRandom',
    label: 'Niveles aleatorios de pals',
    group: 'Avanzado',
    kind: 'boolean',
    help: 'Permite aleatorizar niveles de pals cuando el modo de aleatorizacion esta activo.'
  },
  bEnablePlayerToPlayerDamage: {
    key: 'bEnablePlayerToPlayerDamage',
    label: 'Daño entre jugadores',
    group: 'PvP',
    kind: 'boolean',
    help: 'Permite que un jugador dañe directamente a otro. Activarlo cambia el servidor hacia una experiencia PvP.'
  },
  bIsPvP: {
    key: 'bIsPvP',
    label: 'Modo PvP',
    group: 'PvP',
    kind: 'boolean',
    help: 'Activa reglas generales de jugador contra jugador. Para servidores cooperativos conviene dejarlo desactivado.'
  },
  bEnableFriendlyFire: {
    key: 'bEnableFriendlyFire',
    label: 'Fuego amigo',
    group: 'PvP',
    kind: 'boolean',
    help: 'Permite daño entre aliados o miembros del mismo grupo. Puede causar problemas si los jugadores no lo esperan.'
  },
  bEnableFastTravel: {
    key: 'bEnableFastTravel',
    label: 'Viaje rapido',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Permite usar puntos de viaje rapido. Desactivarlo vuelve la exploracion mas lenta y exigente.'
  },
  AutoSaveSpan: {
    key: 'AutoSaveSpan',
    label: 'Guardado automatico',
    group: 'Mantenimiento',
    kind: 'number',
    range: 'Minutos. Default: 30.',
    min: 1,
    max: 120,
    step: 1,
    help: 'Intervalo entre guardados automaticos. Menos minutos reducen perdida ante cierres, pero generan mas actividad de disco.'
  },
  bIsUseBackupSaveData: {
    key: 'bIsUseBackupSaveData',
    label: 'Usar respaldo del mundo',
    group: 'Mantenimiento',
    kind: 'boolean',
    help: 'Permite usar datos de respaldo del mundo si hace falta recuperar una partida. Recomendado mantenerlo activo.'
  },
  ChatPostLimitPerMinute: {
    key: 'ChatPostLimitPerMinute',
    label: 'Mensajes por minuto',
    group: 'Moderacion y mods',
    kind: 'number',
    min: 1,
    max: 120,
    step: 1,
    help: 'Limite de mensajes de chat por minuto por jugador. Ayuda a reducir spam o abuso del chat.'
  },
  LogFormatType: {
    key: 'LogFormatType',
    label: 'Formato del log',
    group: 'Administracion',
    kind: 'select',
    options: ['Text', 'Json'],
    help: 'Selecciona el formato de salida de los registros del servidor. Text es mas legible para uso manual; Json sirve mejor para herramientas externas.'
  },
  bShowPlayerList: {
    key: 'bShowPlayerList',
    label: 'Mostrar lista de jugadores',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Controla si las funciones compatibles pueden mostrar quienes estan conectados.'
  },
  bAllowClientMod: {
    key: 'bAllowClientMod',
    label: 'Permitir mods cliente',
    group: 'Moderacion y mods',
    kind: 'boolean',
    help: 'Permite que jugadores entren con mods del lado cliente. Desactivarlo ayuda a mantener una experiencia mas consistente.'
  },
  bEnableVoiceChat: {
    key: 'bEnableVoiceChat',
    label: 'Chat de voz',
    group: 'Jugadores',
    kind: 'boolean',
    help: 'Activa el chat de voz del juego si la version del servidor y los clientes lo soportan.'
  }
};
