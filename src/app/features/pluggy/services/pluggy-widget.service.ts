import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';

/**
 * Callbacks the caller wires into the Pluggy Connect widget.
 * Kept framework-agnostic so components never touch the global SDK directly.
 */
export interface PluggyWidgetHandlers {
  /** Fired when the user finishes linking a bank. Receives the created item id. */
  onSuccess: (itemId: string) => void;
  /** Fired on a widget-level error. */
  onError?: (error: unknown) => void;
  /** Fired when the user closes/abandons the widget. */
  onExit?: () => void;
}

/**
 * Shape of the argument the Pluggy Connect `onSuccess` callback receives.
 * Verified contract: the widget passes `{ item: Item }`; the itemId is `item.id`
 * (never a bare `itemId`). See docs.pluggy.ai — Connect Widget.
 */
interface PluggyConnectSuccessData {
  item: { id: string };
}

/** Options object passed to the global `PluggyConnect` constructor. */
interface PluggyConnectOptions {
  connectToken: string;
  /** When true, the widget also lists Pluggy's sandbox connectors (e.g. "Pluggy Bank"). Dev-only. */
  includeSandbox?: boolean;
  /**
   * Item id to open the widget in UPDATE MODE (re-sync an existing connection)
   * instead of the default new-connection flow. Verified contract: pass the
   * itemId string as `updateItem`.
   */
  updateItem?: string;
  onSuccess?: (data: PluggyConnectSuccessData) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
}

/** Extra, optional configuration for opening the widget. */
export interface PluggyWidgetOpenOptions {
  /** When set, opens the widget in UPDATE MODE for this item. */
  updateItem?: string;
}

/** Instance returned by the `PluggyConnect` constructor. */
interface PluggyConnectInstance {
  init: () => void;
}

type PluggyConnectConstructor = new (options: PluggyConnectOptions) => PluggyConnectInstance;

declare global {
  interface Window {
    PluggyConnect?: PluggyConnectConstructor;
  }
}

/**
 * Exact CDN URL for the Pluggy Connect widget bundle (vanilla-JS / CDN build).
 *
 * NOTE: This is the single point of correction if the URL/API changes. It is
 * isolated here so the rest of the app never references the SDK directly.
 * Verify against https://docs.pluggy.ai — Connect Widget.
 */
export const PLUGGY_CONNECT_SDK_URL = 'https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js';

/**
 * Isolates ALL direct DOM/global access to the Pluggy Connect SDK so pages
 * stay pure and testable. Loads the script once (cached promise), then wraps
 * the global `PluggyConnect` constructor.
 */
@Injectable({ providedIn: 'root' })
export class PluggyWidgetService {
  private scriptPromise: Promise<void> | null = null;

  /**
   * Opens the Pluggy Connect widget with the given connect token.
   * Loads the SDK on first use, then constructs + initialises the widget.
   * Pass `options.updateItem` to open in UPDATE MODE for an existing item.
   */
  async open(
    connectToken: string,
    handlers: PluggyWidgetHandlers,
    options: PluggyWidgetOpenOptions = {},
  ): Promise<void> {
    await this.ensureScriptLoaded();

    const PluggyConnectCtor = window.PluggyConnect;
    if (!PluggyConnectCtor) {
      throw new Error('Pluggy Connect SDK loaded but window.PluggyConnect is undefined.');
    }

    const widget = new PluggyConnectCtor({
      connectToken,
      includeSandbox: environment.pluggyIncludeSandbox,
      ...(options.updateItem ? { updateItem: options.updateItem } : {}),
      onSuccess: (data) => {
        const itemId = data.item?.id;
        if (itemId) {
          handlers.onSuccess(itemId);
        }
      },
      onError: (error) => handlers.onError?.(error),
      onClose: () => handlers.onExit?.(),
    });

    widget.init();
  }

  /**
   * Opens the widget in UPDATE MODE to re-sync an existing item.
   * Convenience wrapper over `open` with `updateItem` set.
   */
  openUpdate(
    connectToken: string,
    itemId: string,
    handlers: PluggyWidgetHandlers,
  ): Promise<void> {
    return this.open(connectToken, handlers, { updateItem: itemId });
  }

  /** Loads the SDK <script> exactly once and caches the promise. */
  private ensureScriptLoaded(): Promise<void> {
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    if (window.PluggyConnect) {
      this.scriptPromise = Promise.resolve();
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PLUGGY_CONNECT_SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.scriptPromise = null;
        reject(new Error('Falha ao carregar o widget do Pluggy Connect.'));
      };
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }
}
