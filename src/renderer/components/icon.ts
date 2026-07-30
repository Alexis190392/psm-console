import {
  AppWindow,
  Check,
  CircleQuestionMark,
  Clock,
  Copy,
  DatabaseBackup,
  Download,
  Eraser,
  FileText,
  GlobeLock,
  House,
  Info,
  LayoutDashboard,
  LogOut,
  Map,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Router,
  Save,
  Search,
  SendHorizontal,
  Server,
  ServerCog,
  Settings2,
  ShieldUser,
  Square,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  Undo2,
  UsersRound,
  Workflow,
  X,
  type IconNode
} from 'lucide';
import { escapeHtml } from '../utils/text';

const ICONS: Readonly<Record<string, IconNode>> = {
  admin: ShieldUser,
  'admin-server': ServerCog,
  api: GlobeLock,
  application: AppWindow,
  automation: Workflow,
  backup: DatabaseBackup,
  check: Check,
  clear: Eraser,
  clock: Clock,
  copy: Copy,
  dashboard: LayoutDashboard,
  download: Download,
  file: FileText,
  help: CircleQuestionMark,
  home: House,
  info: Info,
  'log-out': LogOut,
  logs: SquareTerminal,
  map: Map,
  maximize: Maximize2,
  minus: Minus,
  network: Router,
  'sidebar-collapse': PanelLeftClose,
  'sidebar-expand': PanelLeftOpen,
  pause: Pause,
  play: Play,
  refresh: RefreshCw,
  reset: RotateCcw,
  save: Save,
  search: Search,
  send: SendHorizontal,
  server: Server,
  settings: Settings2,
  'settings-warning': Settings2,
  stop: Square,
  trash: Trash2,
  undo: Undo2,
  users: UsersRound,
  warning: TriangleAlert,
  workflow: Workflow,
  x: X
};

export function renderIcon(name: string, extraClass = ''): string {
  const icon = ICONS[name];
  const className = `ui-icon ui-icon--${name}${extraClass ? ` ${extraClass}` : ''}`;

  if (!icon) {
    return `<span class="${escapeHtml(className)}" aria-hidden="true"></span>`;
  }

  return `
    <svg
      class="${escapeHtml(className)}"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.15"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >${icon.map(renderIconNode).join('')}</svg>
  `;
}

function renderIconNode([tag, attributes]: IconNode[number]): string {
  const serializedAttributes = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${toKebabCase(name)}="${escapeHtml(String(value))}"`)
    .join(' ');

  return `<${tag}${serializedAttributes ? ` ${serializedAttributes}` : ''}></${tag}>`;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}
