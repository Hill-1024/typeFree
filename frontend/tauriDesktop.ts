import type { AppLocale } from './i18n';

type DesktopAPI = NonNullable<Window['typefreeDesktop']>;
type DesktopMenuCallback = Parameters<DesktopAPI['onMenuAction']>[0];
type DesktopMenuAction = Parameters<DesktopMenuCallback>[0];
type DesktopMenuActionPayload = Parameters<DesktopMenuCallback>[1];
type DesktopOpenFileResult = Awaited<ReturnType<DesktopAPI['openFile']>>;
type DesktopRenameFileResult = Awaited<ReturnType<DesktopAPI['renameFile']>>;
type DesktopSaveFileResult = Awaited<ReturnType<DesktopAPI['saveFile']>>;
type DesktopCloseDecision = Awaited<ReturnType<DesktopAPI['confirmClose']>>;
type DesktopOpenDocumentPayload = Parameters<Parameters<DesktopAPI['onOpenDocumentRequest']>[0]>[0];
type DesktopCloseRequestCallback = Parameters<DesktopAPI['onCloseRequest']>[0];

const validMenuActions = new Set([
  'new-file',
  'open-file',
  'save-file',
  'save-file-as',
  'set-locale',
  'set-source-mode',
  'set-theme-light',
  'set-theme-dark',
  'set-theme-system',
  'set-enter-mode-newline',
  'set-enter-mode-paragraph',
  'set-block-transition-smooth',
  'set-block-transition-none'
]);

type TauriEvent<T> = {
  payload: T;
};

type MenuActionEvent = {
  action?: string;
  payload?: DesktopMenuActionPayload;
};

const getBrowserSystemTheme = (): 'light' | 'dark' => (
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
);

const getNavigatorLocale = (): AppLocale => {
  const systemLocales = Array.isArray(window.navigator.languages) && window.navigator.languages.length > 0
    ? window.navigator.languages
    : [window.navigator.language];

  for (const locale of systemLocales) {
    const normalized = String(locale).toLowerCase();
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('ja')) return 'ja';
    if (normalized.startsWith('en')) return 'en';
  }

  return 'zh';
};

const getPlatform = () => {
  const platform = window.navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('win')) return 'win32';
  if (platform.includes('linux')) return 'linux';
  return platform || 'unknown';
};

const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
};

const listen = async <T>(event: string, callback: (event: TauriEvent<T>) => void) => {
  const eventApi = await import('@tauri-apps/api/event');
  return eventApi.listen<T>(event, callback);
};

const closeRequestCallbacks = new Set<DesktopCloseRequestCallback>();
let closeRequestListenerInstalled = false;

const ensureCloseRequestListener = () => {
  if (closeRequestListenerInstalled) {
    return;
  }

  closeRequestListenerInstalled = true;
  void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => (
    getCurrentWindow().onCloseRequested(async (event) => {
      const callbacks = Array.from(closeRequestCallbacks);
      const request = {
        preventDefault: () => event.preventDefault()
      };

      for (const callback of callbacks) {
        await callback(request);
      }
    })
  )).catch(console.error);
};

const isTauriRuntime = () => (
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
);

export const installTauriDesktopBridge = () => {
  if (!isTauriRuntime() || window.typefreeDesktop?.isDesktop) {
    return;
  }

  window.typefreeDesktop = {
    isDesktop: true,
    platform: getPlatform(),
    getInitialLocale: getNavigatorLocale,
    getSystemTheme: getBrowserSystemTheme,
    openFile: () => invoke<DesktopOpenFileResult>('open_file'),
    closeWindow: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().destroy();
    },
    confirmClose: (payload) => invoke<DesktopCloseDecision>('confirm_close', { payload }),
    renameFile: (payload) => invoke<DesktopRenameFileResult>('rename_file', { payload }),
    saveFile: (payload) => invoke<DesktopSaveFileResult>('save_file', { payload }),
    updateDocumentState: (payload) => {
      void invoke('update_document_state', { payload }).catch(console.error);
    },
    updateEditorUiState: (payload) => {
      void invoke('update_editor_ui_state', { payload }).catch(console.error);
    },
    onCloseRequest: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }

      closeRequestCallbacks.add(callback);
      ensureCloseRequestListener();
      return () => {
        closeRequestCallbacks.delete(callback);
      };
    },
    onMenuAction: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }

      let disposed = false;
      let unlisten: null | (() => void) = null;

      void listen<MenuActionEvent>('typefree-menu-action', (event) => {
        const action = event.payload?.action;
        if (typeof action === 'string' && validMenuActions.has(action)) {
          callback(action as DesktopMenuAction, event.payload.payload);
        }
      }).then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unlisten = cleanup;
      }).catch(console.error);

      return () => {
        disposed = true;
        unlisten?.();
      };
    },
    onOpenDocumentRequest: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }

      let disposed = false;
      let unlisten: null | (() => void) = null;

      void listen<DesktopOpenDocumentPayload>('typefree-open-document-request', (event) => {
        callback(event.payload);
      }).then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unlisten = cleanup;
      }).catch(console.error);

      return () => {
        disposed = true;
        unlisten?.();
      };
    },
    onSystemThemeChange: (callback) => {
      if (typeof callback !== 'function') {
        return () => {};
      }

      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => callback(getBrowserSystemTheme());
      media.addEventListener('change', handleChange);

      return () => media.removeEventListener('change', handleChange);
    }
  };
};
