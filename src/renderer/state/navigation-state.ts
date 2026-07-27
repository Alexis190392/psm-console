export type RendererView = 'home' | 'server' | 'admin' | 'network' | 'backups' | 'logs' | 'settings';

export class NavigationState {
  #current: RendererView;

  constructor(initialView: RendererView = 'home') {
    this.#current = initialView;
  }

  get current(): RendererView {
    return this.#current;
  }

  set(nextView: string | undefined): RendererView {
    this.#current = isRendererView(nextView) ? nextView : 'home';
    return this.#current;
  }

  is(view: RendererView): boolean {
    return this.#current === view;
  }
}

export function isRendererView(value: string | undefined): value is RendererView {
  return (
    value === 'home' ||
    value === 'server' ||
    value === 'admin' ||
    value === 'network' ||
    value === 'backups' ||
    value === 'logs' ||
    value === 'settings'
  );
}
