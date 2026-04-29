const { contextBridge, ipcRenderer } = require('electron');

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

const getSystemTheme = () => ipcRenderer.sendSync('theme:get-system-sync');

contextBridge.exposeInMainWorld('typefreeDesktop', {
  isDesktop: true,
  platform: process.platform,
  getSystemTheme,
  openFile: () => ipcRenderer.invoke('file:open'),
  renameFile: (payload) => ipcRenderer.invoke('file:rename', payload),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  updateDocumentState: (payload) => ipcRenderer.send('document:update-state', payload),
  updateEditorUiState: (payload) => ipcRenderer.send('editor:update-ui-state', payload),
  onMenuAction: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, action, payload) => {
      if (validMenuActions.has(action)) {
        callback(action, payload);
      }
    };

    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
  onOpenDocumentRequest: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('document:open-request', listener);
    return () => ipcRenderer.removeListener('document:open-request', listener);
  },
  onSystemThemeChange: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, theme) => {
      if (theme === 'light' || theme === 'dark') {
        callback(theme);
      }
    };

    ipcRenderer.on('theme:system-updated', listener);
    return () => ipcRenderer.removeListener('theme:system-updated', listener);
  },
});
