import {
  DEFAULT_SETTING_HELP,
  PALWORLD_SETTING_DEFINITIONS,
  type PalworldSettingDefinition
} from './palworld-settings-catalog';
import { PALWORLD_SETTING_COPY } from './palworld-settings-copy';

const SELECT_OPTION_LABELS: Record<string, string> = {
  All: 'Todo',
  Easy: 'Facil',
  Hard: 'Dificil',
  Item: 'Items',
  ItemAndEquipment: 'Items y equipo',
  Json: 'JSON',
  None: 'Ninguno',
  Normal: 'Normal',
  Region: 'Por region',
  Text: 'Texto'
};

const SETTING_WORD_TRANSLATIONS: Record<string, string> = {
  active: 'Activo',
  aim: 'Apuntado',
  allow: 'Permitir',
  assist: 'Ayuda',
  attack: 'Ataque',
  auto: 'Automatico',
  base: 'Base',
  build: 'Construccion',
  camp: 'Campamento',
  client: 'Cliente',
  collection: 'Recoleccion',
  damage: 'Dano',
  day: 'Dia',
  decreace: 'Consumo',
  decrease: 'Consumo',
  defense: 'Defensa',
  deterioration: 'Deterioro',
  drop: 'Botin',
  enable: 'Activar',
  enemy: 'Enemigos',
  fast: 'Rapido',
  friendly: 'Aliado',
  guild: 'Gremio',
  hp: 'Vida',
  invader: 'Invasion',
  item: 'Item',
  keyboard: 'Teclado',
  level: 'Nivel',
  max: 'Maximo',
  mod: 'Mods',
  night: 'Noche',
  num: 'Cantidad',
  object: 'Objeto',
  pad: 'Control',
  pal: 'Pal',
  player: 'Jugador',
  pvp: 'PvP',
  random: 'Aleatorio',
  randomizer: 'Aleatorizador',
  rate: 'Multiplicador',
  regene: 'Regeneracion',
  respawn: 'Reaparicion',
  seed: 'Semilla',
  show: 'Mostrar',
  sleep: 'Dormir',
  speed: 'Velocidad',
  stamina: 'Estamina',
  stomach: 'Hambre',
  time: 'Tiempo',
  travel: 'Viaje',
  type: 'Tipo',
  voice: 'Voz',
  worker: 'Trabajadores',
  work: 'Trabajo'
};

export function getSettingDefinition(key: string, value: string): PalworldSettingDefinition {
  const known = PALWORLD_SETTING_DEFINITIONS[key];
  const copy = PALWORLD_SETTING_COPY[key];

  const base: PalworldSettingDefinition = known ?? {
    key,
    label: splitSettingKey(key),
    group: 'Avanzado',
    kind: inferSettingKind(value),
    help: DEFAULT_SETTING_HELP
  };

  return copy ? { ...base, ...copy, key } : base;
}

export function inferSettingKind(value: string): 'text' | 'number' | 'boolean' {
  if (['true', 'false'].includes(value.toLowerCase())) {
    return 'boolean';
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return 'number';
  }

  return 'text';
}

export function splitSettingKey(key: string): string {
  const readable = key
    .replace(/^b(?=[A-Z])/, '')
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

  return readable
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SETTING_WORD_TRANSLATIONS[word.toLowerCase()] ?? word)
    .join(' ');
}

export function formatSelectOptionLabel(option: string): string {
  return SELECT_OPTION_LABELS[option] ?? option;
}

