import type { PalcmApi } from '../main/preload/preload';
import type { WindowControlsApi } from './components/window-controls';

declare global {
  interface Window {
    palcm?: PalcmApi;
    windowControls?: WindowControlsApi;
  }
}

export {};
