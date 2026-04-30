/// <reference types="vite/client" />
import type { AppLocale } from './i18n';

interface TypefreeOpenFileResult {
  canceled: boolean;
  content?: string;
  filePath?: string;
  name?: string;
}

interface TypefreeSaveFilePayload {
  content: string;
  defaultPath?: string;
  filePath?: string;
  saveAs?: boolean;
}

interface TypefreeSaveFileResult {
  canceled: boolean;
  filePath?: string;
  name?: string;
}

interface TypefreeRenameFilePayload {
  filePath: string;
  nextName: string;
}

interface TypefreeRenameFileResult {
  filePath: string;
  name: string;
}

interface TypefreeOpenDocumentPayload {
  content: string;
  filePath: string;
  name: string;
}

type TypefreeMenuAction =
  | 'new-file'
  | 'open-file'
  | 'save-file'
  | 'save-file-as'
  | 'set-locale'
  | 'set-source-mode'
  | 'set-theme-light'
  | 'set-theme-dark'
  | 'set-theme-system'
  | 'set-enter-mode-newline'
  | 'set-enter-mode-paragraph'
  | 'set-block-transition-smooth'
  | 'set-block-transition-none';

interface TypefreeDocumentStatePayload {
  dirty: boolean;
  filePath: null | string;
  fileName: string;
  content: string;
}

interface TypefreeEditorUiStatePayload {
  blockTransition: 'none' | 'smooth';
  enterMode: 'newline' | 'paragraph';
  locale: AppLocale;
  themeMode: 'dark' | 'light' | 'system';
  viewMode: 'raw' | 'wysiwyg';
}

interface TypefreeMenuActionPayloadMap {
  'set-locale': { locale: AppLocale };
  'set-source-mode': { enabled: boolean };
}

type TypefreeMenuActionPayload = TypefreeMenuActionPayloadMap[keyof TypefreeMenuActionPayloadMap];

interface TypefreeDesktopAPI {
  isDesktop: true;
  platform: string;
  getInitialLocale: () => AppLocale;
  getSystemTheme: () => 'light' | 'dark';
  openFile: () => Promise<TypefreeOpenFileResult>;
  renameFile: (payload: TypefreeRenameFilePayload) => Promise<TypefreeRenameFileResult>;
  saveFile: (payload: TypefreeSaveFilePayload) => Promise<TypefreeSaveFileResult>;
  updateDocumentState: (payload: TypefreeDocumentStatePayload) => void;
  updateEditorUiState: (payload: TypefreeEditorUiStatePayload) => void;
  onMenuAction: (callback: (action: TypefreeMenuAction, payload?: TypefreeMenuActionPayload) => void) => () => void;
  onOpenDocumentRequest: (callback: (payload: TypefreeOpenDocumentPayload) => void) => () => void;
  onSystemThemeChange: (callback: (theme: 'light' | 'dark') => void) => () => void;
}

declare global {
  interface Window {
    typefreeDesktop?: TypefreeDesktopAPI;
  }
}

export {};
