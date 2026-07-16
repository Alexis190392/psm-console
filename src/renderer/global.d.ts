import type { PalcmApi } from '../main/preload/preload';

declare global {
  interface Window {
    palcm?: PalcmApi;
  }
}

export {};
