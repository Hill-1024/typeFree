import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, shell } from 'electron';
import { basename, dirname, extname, join } from 'node:path';
import { statSync } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getLocaleLabel, getTextFileFilters, normalizeLocale, translate } from './i18n.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_NAME = 'TypeFree';
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const appIconPath = join(__dirname, '..', devServerUrl ? 'public' : 'dist', 'app-icon.png');
const getWindowBackgroundColor = () => (nativeTheme.shouldUseDarkColors ? '#13161d' : '#ffffff');
const getStartupLanguageTag = () => {
  const envLocale = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    Intl.DateTimeFormat().resolvedOptions().locale
  ].find((value) => typeof value === 'string' && value.length > 0);

  const normalized = String(envLocale ?? '').replace('.UTF-8', '').replace('.utf8', '').replace('_', '-').toLowerCase();
  if (normalized.startsWith('zh')) {
    return 'zh-CN';
  }
  if (normalized.startsWith('ja')) {
    return 'ja';
  }
  if (normalized.startsWith('en')) {
    return 'en-US';
  }
  return 'zh-CN';
};
const getInitialLocale = () => {
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith('zh')) {
    return 'zh';
  }
  if (locale.startsWith('ja')) {
    return 'ja';
  }
  return 'en';
};
const getSystemUiLocale = () => normalizeLocale(app.getLocale());

app.commandLine.appendSwitch('lang', getStartupLanguageTag());

const recentDocumentsStorePath = join(app.getPath('userData'), 'recent-documents.json');
const documentStateByWebContentsId = new Map();
const closingWindowIds = new Set();
const editorWindowIds = new Set();
const pendingOpenPaths = [];
let recentDocuments = [];
let lastFocusedEditorWindowId = null;
let editorUiState = {
  locale: getInitialLocale(),
  themeMode: 'system',
  enterMode: 'paragraph',
  blockTransition: 'smooth',
  viewMode: 'wysiwyg'
};

const getTargetWindow = () => {
  if (typeof lastFocusedEditorWindowId === 'number') {
    const lastFocusedWindow = BrowserWindow.fromId(lastFocusedEditorWindowId);
    if (lastFocusedWindow && !lastFocusedWindow.isDestroyed()) {
      return lastFocusedWindow;
    }
  }

  for (const windowId of editorWindowIds) {
    const editorWindow = BrowserWindow.fromId(windowId);
    if (editorWindow && !editorWindow.isDestroyed()) {
      return editorWindow;
    }
  }

  return BrowserWindow.getAllWindows()[0] ?? null;
};

const applyWindowDocumentState = (window, documentState) => {
  if (!window || window.isDestroyed() || process.platform !== 'darwin') {
    return;
  }

  const filePath = typeof documentState?.filePath === 'string' ? documentState.filePath : '';
  window.setRepresentedFilename(filePath);
  window.setDocumentEdited(Boolean(documentState?.dirty));
};

const parseFilePathFromArgv = (argv = []) => {
  const candidates = argv.filter((arg) => typeof arg === 'string' && arg.length > 0 && !arg.startsWith('-'));
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    try {
      if (statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Ignore non-existent paths and non-readable entries.
    }
  }

  return null;
};

const readDocumentFromPath = async (filePath) => {
  const stats = await stat(filePath);
  if (!stats.isFile()) {
    throw new Error(`Unsupported document path: ${filePath}`);
  }

  const content = await readFile(filePath, 'utf-8');
  return {
    content,
    filePath,
    name: basename(filePath)
  };
};

const renameDocumentPath = async ({ filePath, nextName }) => {
  const currentStats = await stat(filePath);
  if (!currentStats.isFile()) {
    throw new Error(`Unsupported document path: ${filePath}`);
  }

  const trimmedName = String(nextName ?? '').trim();
  if (!trimmedName) {
    throw new Error('Missing target file name');
  }

  const currentBaseName = basename(filePath);
  const currentDotIndex = currentBaseName.lastIndexOf('.');
  const currentExtension = currentDotIndex > 0 ? currentBaseName.slice(currentDotIndex) : '';
  const nextDotIndex = trimmedName.lastIndexOf('.');
  const normalizedTargetName = nextDotIndex > 0 ? trimmedName : `${trimmedName}${currentExtension}`;
  const targetDirectory = dirname(filePath);
  const targetPath = join(targetDirectory, normalizedTargetName);
  if (targetPath === filePath) {
    return {
      filePath,
      name: basename(filePath)
    };
  }

  const targetExtension = extname(normalizedTargetName);
  const targetStem = targetExtension ? normalizedTargetName.slice(0, -targetExtension.length) : normalizedTargetName;

  let resolvedTargetPath = targetPath;
  let sequence = 0;
  while (true) {
    try {
      const existingTargetStats = await stat(resolvedTargetPath);
      if (existingTargetStats.isFile() || existingTargetStats.isDirectory()) {
        sequence += 1;
        resolvedTargetPath = join(
          targetDirectory,
          `${targetStem} (${sequence})${targetExtension}`
        );
        continue;
      }
      break;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        break;
      }
      throw error;
    }
  }

  await rename(filePath, resolvedTargetPath);
  return {
    filePath: resolvedTargetPath,
    name: basename(resolvedTargetPath)
  };
};

const saveDocumentToPath = async ({ content, targetPath }) => {
  await writeFile(targetPath, content, 'utf-8');
  return {
    filePath: targetPath,
    name: basename(targetPath)
  };
};

const persistRecentDocuments = async () => {
  await writeFile(recentDocumentsStorePath, JSON.stringify(recentDocuments, null, 2), 'utf-8');
};

const loadRecentDocuments = async () => {
  try {
    const raw = await readFile(recentDocumentsStorePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      recentDocuments = [];
      return;
    }

    recentDocuments = parsed.filter((item) => typeof item === 'string' && item.length > 0);
  } catch {
    recentDocuments = [];
  }
};

const clearRecentDocumentsList = async () => {
  recentDocuments = [];
  if (process.platform === 'darwin' || process.platform === 'win32') {
    app.clearRecentDocuments();
  }
  await persistRecentDocuments();
  Menu.setApplicationMenu(buildApplicationMenu());
};

const addRecentDocumentEntry = async (filePath) => {
  if (!filePath) {
    return;
  }

  recentDocuments = [filePath, ...recentDocuments.filter((item) => item !== filePath)].slice(0, 10);
  if (process.platform === 'darwin' || process.platform === 'win32') {
    app.addRecentDocument(filePath);
  }
  await persistRecentDocuments();
  Menu.setApplicationMenu(buildApplicationMenu());
};

const getRecentSubmenuTemplate = (locale) => {
  if (process.platform === 'darwin') {
    return {
      label: translate(locale, 'openRecent'),
      role: 'recentdocuments',
      submenu: [
        { role: 'clearrecentdocuments' }
      ]
    };
  }

  if (recentDocuments.length === 0) {
    return {
      label: translate(locale, 'openRecent'),
      submenu: [
        { label: translate(locale, 'noRecentDocuments'), enabled: false }
      ]
    };
  }

  return {
    label: translate(locale, 'openRecent'),
    submenu: [
      ...recentDocuments.map((filePath) => ({
        label: basename(filePath),
        sublabel: filePath,
        click: () => {
          void openDocumentInWindow(filePath);
        }
      })),
      { type: 'separator' },
      {
        label: translate(locale, 'clearRecent'),
        click: () => {
          void clearRecentDocumentsList();
        }
      }
    ]
  };
};

const sendMenuAction = (action, payload) => {
  const targetWindow = getTargetWindow();
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  targetWindow.webContents.send('menu:action', action, payload);
};

const sendOpenDocumentRequest = (window, documentPayload) => {
  if (!window || window.isDestroyed()) {
    pendingOpenPaths.push(documentPayload.filePath);
    return;
  }

  window.webContents.send('document:open-request', documentPayload);
};

async function openDocumentInWindow(filePath, targetWindow = getTargetWindow()) {
  const documentPayload = await readDocumentFromPath(filePath);
  sendOpenDocumentRequest(targetWindow, documentPayload);
}

const buildApplicationMenu = () => {
  const { locale, themeMode, enterMode, blockTransition, viewMode } = editorUiState;
  const systemLocale = getSystemUiLocale();
  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: APP_NAME,
          submenu: [
            { label: translate(systemLocale, 'about'), role: 'about' },
            { type: 'separator' },
            { label: translate(systemLocale, 'services'), role: 'services' },
            { type: 'separator' },
            { label: translate(systemLocale, 'hide'), role: 'hide' },
            { label: translate(systemLocale, 'hideOthers'), role: 'hideOthers' },
            { label: translate(systemLocale, 'unhide'), role: 'unhide' },
            { type: 'separator' },
            { label: translate(systemLocale, 'quit'), role: 'quit' }
          ]
        }]
      : []),
    {
      label: translate(systemLocale, 'file'),
      submenu: [
        {
          label: translate(systemLocale, 'newDocument'),
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new-file')
        },
        { type: 'separator' },
        {
          label: translate(systemLocale, 'open'),
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuAction('open-file')
        },
        getRecentSubmenuTemplate(systemLocale),
        { type: 'separator' },
        {
          label: translate(systemLocale, 'save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save-file')
        },
        {
          label: translate(systemLocale, 'saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuAction('save-file-as')
        },
        { type: 'separator' },
        ...(process.platform === 'darwin'
          ? [{ label: translate(systemLocale, 'close'), role: 'close' }]
          : [{ label: translate(systemLocale, 'quit'), role: 'quit' }])
      ]
    },
    {
      label: translate(systemLocale, 'edit'),
      submenu: [
        { label: translate(systemLocale, 'undo'), role: 'undo' },
        { label: translate(systemLocale, 'redo'), role: 'redo' },
        { type: 'separator' },
        { label: translate(systemLocale, 'cut'), role: 'cut' },
        { label: translate(systemLocale, 'copy'), role: 'copy' },
        { label: translate(systemLocale, 'paste'), role: 'paste' },
        { label: translate(systemLocale, 'delete'), role: 'delete' },
        { label: translate(systemLocale, 'selectAll'), role: 'selectAll' }
      ]
    },
    {
      label: translate(systemLocale, 'view'),
      submenu: [
        {
          label: translate(systemLocale, 'sourceMode'),
          type: 'checkbox',
          checked: viewMode === 'raw',
          accelerator: 'CmdOrCtrl+\\',
          click: (menuItem) => sendMenuAction('set-source-mode', { enabled: menuItem.checked })
        },
        { type: 'separator' },
        { label: translate(systemLocale, 'resetZoom'), role: 'resetZoom' },
        { label: translate(systemLocale, 'zoomIn'), role: 'zoomIn' },
        { label: translate(systemLocale, 'zoomOut'), role: 'zoomOut' },
        { type: 'separator' },
        { label: translate(systemLocale, 'fullScreen'), role: 'togglefullscreen' }
      ]
    },
    {
      label: translate(systemLocale, 'settings'),
      submenu: [
        {
          label: translate(systemLocale, 'appearance'),
          submenu: [
            {
              label: translate(systemLocale, 'light'),
              type: 'radio',
              checked: themeMode === 'light',
              click: () => sendMenuAction('set-theme-light')
            },
            {
              label: translate(systemLocale, 'dark'),
              type: 'radio',
              checked: themeMode === 'dark',
              click: () => sendMenuAction('set-theme-dark')
            },
            {
              label: translate(systemLocale, 'system'),
              type: 'radio',
              checked: themeMode === 'system',
              click: () => sendMenuAction('set-theme-system')
            }
          ]
        },
        {
          label: translate(systemLocale, 'language'),
          submenu: [
            {
              label: getLocaleLabel(systemLocale, 'en'),
              type: 'radio',
              checked: locale === 'en',
              click: () => sendMenuAction('set-locale', { locale: 'en' })
            },
            {
              label: getLocaleLabel(systemLocale, 'zh'),
              type: 'radio',
              checked: locale === 'zh',
              click: () => sendMenuAction('set-locale', { locale: 'zh' })
            },
            {
              label: getLocaleLabel(systemLocale, 'ja'),
              type: 'radio',
              checked: locale === 'ja',
              click: () => sendMenuAction('set-locale', { locale: 'ja' })
            }
          ]
        },
        {
          label: translate(systemLocale, 'enterKeyBehavior'),
          submenu: [
            {
              label: translate(systemLocale, 'newline'),
              type: 'radio',
              checked: enterMode === 'newline',
              click: () => sendMenuAction('set-enter-mode-newline')
            },
            {
              label: translate(systemLocale, 'paragraph'),
              type: 'radio',
              checked: enterMode === 'paragraph',
              click: () => sendMenuAction('set-enter-mode-paragraph')
            }
          ]
        },
        {
          label: translate(systemLocale, 'blockTransition'),
          submenu: [
            {
              label: translate(systemLocale, 'smooth'),
              type: 'radio',
              checked: blockTransition === 'smooth',
              click: () => sendMenuAction('set-block-transition-smooth')
            },
            {
              label: translate(systemLocale, 'none'),
              type: 'radio',
              checked: blockTransition === 'none',
              click: () => sendMenuAction('set-block-transition-none')
            }
          ]
        }
      ]
    },
    {
      label: translate(systemLocale, 'window'),
      submenu: [
        { label: translate(systemLocale, 'minimize'), role: 'minimize' },
        { label: translate(systemLocale, 'zoom'), role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [
              { type: 'separator' },
              { label: translate(systemLocale, 'front'), role: 'front' }
            ]
          : [
              { type: 'separator' },
              { label: translate(systemLocale, 'close'), role: 'close' }
            ])
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
};

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 720,
    autoHideMenuBar: false,
    backgroundColor: getWindowBackgroundColor(),
    icon: appIconPath,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  editorWindowIds.add(window.id);
  lastFocusedEditorWindowId = window.id;

  window.on('focus', () => {
    lastFocusedEditorWindowId = window.id;
  });

  applyWindowDocumentState(window, documentStateByWebContentsId.get(window.webContents.id));

  window.on('close', async (event) => {
    const windowId = window.webContents.id;
    if (closingWindowIds.has(windowId)) {
      return;
    }

    const documentState = documentStateByWebContentsId.get(windowId);
    if (!documentState?.dirty) {
      return;
    }

    event.preventDefault();
    const locale = getSystemUiLocale();
    try {
      const payload = {
        content: documentState.content ?? '',
        filePath: documentState.filePath ?? undefined,
        defaultPath: documentState.filePath ?? documentState.fileName ?? translate(locale, 'untitled'),
        saveAs: false
      };

      let targetPath = payload.filePath ?? null;

      if (process.platform === 'darwin' && !targetPath) {
        const saveResult = await dialog.showSaveDialog(window, {
          defaultPath: payload.defaultPath,
          buttonLabel: translate(locale, 'save'),
          message: translate(locale, 'savePromptMessage', {
      fileName: documentState.fileName || translate(locale, 'untitled')
          }),
          nameFieldLabel: translate(locale, 'saveAsFieldLabel'),
          filters: getTextFileFilters(locale)
        });

        if (saveResult.canceled || !saveResult.filePath) {
          return;
        }

        targetPath = saveResult.filePath;
      } else {
        const response = await dialog.showMessageBox(window, {
          type: 'warning',
          buttons: [translate(locale, 'save'), translate(locale, 'dontSave'), translate(locale, 'cancel')],
          defaultId: 0,
          cancelId: 2,
          message: translate(locale, 'savePromptMessage', {
            fileName: documentState.fileName || translate(locale, 'untitled')
          }),
          detail: translate(locale, 'savePromptDetail')
        });

        if (response.response === 2) {
          return;
        }

        if (response.response === 0) {
          if (!targetPath) {
            const saveResult = await dialog.showSaveDialog(window, {
              defaultPath: payload.defaultPath,
              buttonLabel: translate(locale, 'save'),
              ...(process.platform === 'darwin'
                ? {
                    message: translate(locale, 'savePromptMessage', {
                      fileName: documentState.fileName || translate(locale, 'untitled')
                    }),
                    nameFieldLabel: translate(locale, 'saveAsFieldLabel')
                  }
                : {}),
              filters: getTextFileFilters(locale),
              ...(process.platform === 'linux' ? { properties: ['showOverwriteConfirmation'] } : {})
            });

            if (saveResult.canceled || !saveResult.filePath) {
              return;
            }

            targetPath = saveResult.filePath;
          }
        } else {
          closingWindowIds.add(windowId);
          window.close();
          return;
        }
      }

      const saveResult = await saveDocumentToPath({
        content: payload.content,
        targetPath
      });

      const nextDocumentState = {
        ...documentState,
        dirty: false,
        filePath: saveResult.filePath,
        fileName: saveResult.name
      };
      documentStateByWebContentsId.set(windowId, nextDocumentState);
      applyWindowDocumentState(window, nextDocumentState);
      await addRecentDocumentEntry(saveResult.filePath);
    } catch (error) {
      console.error(error);
      await dialog.showMessageBox(window, {
        type: 'error',
        buttons: ['OK'],
        message: translate(locale, 'saveOnCloseFailed')
      });
      return;
    }

    closingWindowIds.add(windowId);
    window.close();
  });

  window.on('closed', () => {
    const windowId = window.webContents.id;
    editorWindowIds.delete(window.id);
    if (lastFocusedEditorWindowId === window.id) {
      lastFocusedEditorWindowId = null;
    }
    closingWindowIds.delete(windowId);
    documentStateByWebContentsId.delete(windowId);
  });

  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    await window.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  }

  while (pendingOpenPaths.length > 0) {
    const nextPath = pendingOpenPaths.shift();
    if (nextPath) {
      try {
        await openDocumentInWindow(nextPath, window);
      } catch (error) {
        console.error(error);
      }
    }
  }
};

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) {
    void openDocumentInWindow(filePath);
    return;
  }
  pendingOpenPaths.push(filePath);
});

app.setName(APP_NAME);

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath));
  }

  ipcMain.on('document:update-state', (event, payload) => {
    const nextDocumentState = {
      dirty: Boolean(payload?.dirty),
      filePath: typeof payload?.filePath === 'string' ? payload.filePath : null,
      fileName: typeof payload?.fileName === 'string' ? payload.fileName : translate(normalizeLocale(editorUiState.locale), 'untitled'),
      content: typeof payload?.content === 'string' ? payload.content : ''
    };

    documentStateByWebContentsId.set(event.sender.id, nextDocumentState);

    const window = BrowserWindow.fromWebContents(event.sender);
    applyWindowDocumentState(window, nextDocumentState);
  });

  ipcMain.on('editor:update-ui-state', (_event, payload) => {
    editorUiState = {
      locale: payload?.locale === 'en' || payload?.locale === 'zh' || payload?.locale === 'ja'
        ? payload.locale
        : editorUiState.locale,
      themeMode: payload?.themeMode === 'light' || payload?.themeMode === 'dark' || payload?.themeMode === 'system'
        ? payload.themeMode
        : editorUiState.themeMode,
      enterMode: payload?.enterMode === 'newline' || payload?.enterMode === 'paragraph'
        ? payload.enterMode
        : editorUiState.enterMode,
      blockTransition: payload?.blockTransition === 'smooth' || payload?.blockTransition === 'none'
        ? payload.blockTransition
        : editorUiState.blockTransition,
      viewMode: payload?.viewMode === 'raw' || payload?.viewMode === 'wysiwyg'
        ? payload.viewMode
        : editorUiState.viewMode
    };

    Menu.setApplicationMenu(buildApplicationMenu());
  });

  await loadRecentDocuments();
  Menu.setApplicationMenu(buildApplicationMenu());

  ipcMain.handle('file:open', async () => {
    const targetWindow = getTargetWindow();
    const locale = getSystemUiLocale();
    const result = await dialog.showOpenDialog(targetWindow, {
      filters: getTextFileFilters(locale),
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const documentPayload = await readDocumentFromPath(filePath);
    await addRecentDocumentEntry(filePath);

    return {
      canceled: false,
      ...documentPayload
    };
  });

  ipcMain.handle('file:rename', async (event, payload) => {
    const currentPath = typeof payload?.filePath === 'string' ? payload.filePath : '';
    const nextName = typeof payload?.nextName === 'string' ? payload.nextName : '';

    if (!currentPath || !nextName.trim()) {
      throw new Error('Missing rename payload');
    }

    const renameResult = await renameDocumentPath({
      filePath: currentPath,
      nextName
    });

    recentDocuments = recentDocuments.map((item) => (item === currentPath ? renameResult.filePath : item));
    await persistRecentDocuments();
    await addRecentDocumentEntry(renameResult.filePath);

    const nextDocumentState = documentStateByWebContentsId.get(event.sender.id);
    if (nextDocumentState) {
      const patchedDocumentState = {
        ...nextDocumentState,
        filePath: renameResult.filePath,
        fileName: renameResult.name
      };
      documentStateByWebContentsId.set(event.sender.id, patchedDocumentState);
      const window = BrowserWindow.fromWebContents(event.sender);
      applyWindowDocumentState(window, patchedDocumentState);
    }

    return renameResult;
  });

  ipcMain.handle('file:save', async (_event, payload) => {
    const targetWindow = getTargetWindow();
    const locale = getSystemUiLocale();
    const {
      content,
      defaultPath,
      filePath,
      saveAs
    } = payload ?? {};

    if (typeof content !== 'string') {
      throw new Error('Missing file content');
    }

    let targetPath = typeof filePath === 'string' && filePath.length > 0 ? filePath : null;

    if (!targetPath || saveAs) {
      const result = await dialog.showSaveDialog(targetWindow, {
        defaultPath: typeof defaultPath === 'string' && defaultPath.length > 0 ? defaultPath : undefined,
        filters: getTextFileFilters(locale)
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      targetPath = result.filePath;
    }

    const saveResult = await saveDocumentToPath({ content, targetPath });
    await addRecentDocumentEntry(saveResult.filePath);

    return {
      canceled: false,
      ...saveResult
    };
  });

  ipcMain.on('theme:get-system-sync', (event) => {
    event.returnValue = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  });

  void createWindow();

  nativeTheme.on('updated', () => {
    const nextTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    for (const window of BrowserWindow.getAllWindows()) {
      window.setBackgroundColor(getWindowBackgroundColor());
      window.webContents.send('theme:system-updated', nextTheme);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  const initialArgPath = parseFilePathFromArgv(process.argv.slice(1));
  if (initialArgPath) {
    pendingOpenPaths.push(initialArgPath);
  }

  app.on('second-instance', (_event, argv) => {
    const existingWindow = getTargetWindow();
    if (existingWindow) {
      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }
      existingWindow.focus();
    }

    const filePath = parseFilePathFromArgv(argv.slice(1));
    if (filePath) {
      void openDocumentInWindow(filePath, existingWindow ?? undefined);
    }
  });
}
