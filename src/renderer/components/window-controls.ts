export interface WindowControlsApi {
  minimize: () => Promise<void>;
  maximizeToggle: () => Promise<void>;
  close: () => Promise<void>;
}

export function bindWindowControls(
  windowControls: WindowControlsApi | undefined = window.windowControls
): void {
  document.getElementById('window-minimize')?.addEventListener('click', () => {
    void windowControls?.minimize();
  });

  document.getElementById('window-maximize')?.addEventListener('click', () => {
    void windowControls?.maximizeToggle();
  });

  document.getElementById('window-close')?.addEventListener('click', () => {
    void windowControls?.close();
  });
}
