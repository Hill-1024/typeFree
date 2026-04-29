export type AppLocale = 'en' | 'zh' | 'ja';

type TranslationKey =
  | 'activeTheme'
  | 'allFiles'
  | 'appearance'
  | 'blockTransition'
  | 'blockTransitionPreview'
  | 'browserDocument'
  | 'cancel'
  | 'clearRecent'
  | 'confirmDiscardChanges'
  | 'dark'
  | 'dontSave'
  | 'edit'
  | 'editorSettings'
  | 'enterKeyBehavior'
  | 'file'
  | 'languageChinese'
  | 'languageEnglish'
  | 'languageJapanese'
  | 'language'
  | 'light'
  | 'localFile'
  | 'markdownDocuments'
  | 'newDocument'
  | 'newline'
  | 'noRecentDocuments'
  | 'none'
  | 'open'
  | 'openFailed'
  | 'openFileTooltip'
  | 'openRecent'
  | 'paragraph'
  | 'renameFailed'
  | 'save'
  | 'saveAs'
  | 'saveFailed'
  | 'saveFileTooltip'
  | 'saveOnCloseFailed'
  | 'savePromptDetail'
  | 'savePromptMessage'
  | 'settings'
  | 'settingsTooltip'
  | 'smooth'
  | 'sourceMode'
  | 'switchToPreviewMode'
  | 'switchToSourceMode'
  | 'system'
  | 'unsaved'
  | 'window'
  | 'view';

type TranslationMap = Record<TranslationKey, string>;

export const LOCALE_STORAGE_KEY = 'typefree-locale';

const LOCALE_FALLBACK_ORDER: AppLocale[] = ['zh', 'en', 'ja'];

const DEFAULT_FILE_NAMES: Record<AppLocale, string> = {
  en: 'Untitled.md',
  zh: '未命名.md',
  ja: '無題.md'
};

const translations: Record<AppLocale, TranslationMap> = {
  en: {
    activeTheme: 'Active: {theme}',
    allFiles: 'All Files',
    appearance: 'Appearance',
    blockTransition: 'Block Transition',
    blockTransitionPreview: 'Block Transition (Preview)',
    browserDocument: 'Browser document',
    cancel: 'Cancel',
    clearRecent: 'Clear Recent',
    confirmDiscardChanges: 'Current changes are not saved. Continue and discard them?',
    dark: 'Dark',
    dontSave: "Don't Save",
    edit: 'Edit',
    editorSettings: 'Editor Settings',
    enterKeyBehavior: 'Enter Key Behavior',
    file: 'File',
    languageChinese: 'Chinese',
    languageEnglish: 'English',
    languageJapanese: 'Japanese',
    language: 'Language',
    light: 'Light',
    localFile: 'Local file',
    markdownDocuments: 'Markdown Documents',
    newDocument: 'New',
    newline: 'Newline',
    noRecentDocuments: 'No Recent Documents',
    none: 'None',
    open: 'Open',
    openFailed: 'Failed to open file.',
    openFileTooltip: 'Open File (Cmd/Ctrl+O)',
    openRecent: 'Open Recent',
    paragraph: 'Paragraph',
    renameFailed: 'Failed to rename file.',
    save: 'Save',
    saveAs: 'Save As',
    saveFailed: 'Failed to save file.',
    saveFileTooltip: 'Save File (Cmd/Ctrl+S)',
    saveOnCloseFailed: 'Failed to save the document before closing.',
    savePromptDetail: 'Your changes will be lost if you do not save them.',
    savePromptMessage: 'Do you want to save changes to {fileName}?',
    settings: 'Settings',
    settingsTooltip: 'Settings',
    smooth: 'Smooth',
    sourceMode: 'Source Mode',
    switchToPreviewMode: 'Switch to Preview Mode',
    switchToSourceMode: 'Switch to Source Mode',
    system: 'System',
    unsaved: 'Unsaved',
    view: 'View',
    window: 'Window'
  },
  zh: {
    activeTheme: '当前：{theme}',
    allFiles: '所有文件',
    appearance: '外观',
    blockTransition: '段落切换动画',
    blockTransitionPreview: '段落切换动画（预览）',
    browserDocument: '浏览器文档',
    cancel: '取消',
    clearRecent: '清除最近文件',
    confirmDiscardChanges: '当前修改尚未保存。仍要继续并丢弃这些修改吗？',
    dark: '深色',
    dontSave: '不保存',
    edit: '编辑',
    editorSettings: '编辑器设置',
    enterKeyBehavior: '回车行为',
    file: '文件',
    languageChinese: '中文',
    languageEnglish: '英语',
    languageJapanese: '日语',
    language: '语言',
    light: '浅色',
    localFile: '本地文件',
    markdownDocuments: 'Markdown 文档',
    newDocument: '新建',
    newline: '换行',
    noRecentDocuments: '没有最近文件',
    none: '关闭',
    open: '打开',
    openFailed: '打开文件失败。',
    openFileTooltip: '打开文件 (Cmd/Ctrl+O)',
    openRecent: '最近打开',
    paragraph: '新段落',
    renameFailed: '重命名文件失败。',
    save: '保存',
    saveAs: '另存为',
    saveFailed: '保存文件失败。',
    saveFileTooltip: '保存文件 (Cmd/Ctrl+S)',
    saveOnCloseFailed: '关闭前保存文档失败。',
    savePromptDetail: '如果不保存，你的修改将会丢失。',
    savePromptMessage: '要保存对 {fileName} 的修改吗？',
    settings: '设置',
    settingsTooltip: '设置',
    smooth: '平滑',
    sourceMode: '源码模式',
    switchToPreviewMode: '切换到预览模式',
    switchToSourceMode: '切换到源码模式',
    system: '跟随系统',
    unsaved: '未保存',
    view: '视图',
    window: '窗口'
  },
  ja: {
    activeTheme: '現在: {theme}',
    allFiles: 'すべてのファイル',
    appearance: '外観',
    blockTransition: 'ブロック切り替え',
    blockTransitionPreview: 'ブロック切り替え（プレビュー）',
    browserDocument: 'ブラウザ文書',
    cancel: 'キャンセル',
    clearRecent: '最近使った項目を消去',
    confirmDiscardChanges: '現在の変更は保存されていません。破棄して続行しますか？',
    dark: 'ダーク',
    dontSave: '保存しない',
    edit: '編集',
    editorSettings: 'エディタ設定',
    enterKeyBehavior: 'Enter キーの動作',
    file: 'ファイル',
    languageChinese: '中国語',
    languageEnglish: '英語',
    languageJapanese: '日本語',
    language: '言語',
    light: 'ライト',
    localFile: 'ローカルファイル',
    markdownDocuments: 'Markdown ドキュメント',
    newDocument: '新規',
    newline: '改行',
    noRecentDocuments: '最近使った項目はありません',
    none: 'なし',
    open: '開く',
    openFailed: 'ファイルを開けませんでした。',
    openFileTooltip: 'ファイルを開く (Cmd/Ctrl+O)',
    openRecent: '最近使った項目を開く',
    paragraph: '段落',
    renameFailed: 'ファイル名を変更できませんでした。',
    save: '保存',
    saveAs: '名前を付けて保存',
    saveFailed: 'ファイルを保存できませんでした。',
    saveFileTooltip: 'ファイルを保存 (Cmd/Ctrl+S)',
    saveOnCloseFailed: '終了前に文書を保存できませんでした。',
    savePromptDetail: '保存しない場合、変更内容は失われます。',
    savePromptMessage: '{fileName} への変更を保存しますか？',
    settings: '設定',
    settingsTooltip: '設定',
    smooth: '滑らか',
    sourceMode: 'ソースモード',
    switchToPreviewMode: 'プレビューモードに切り替え',
    switchToSourceMode: 'ソースモードに切り替え',
    system: 'システム',
    unsaved: '未保存',
    view: '表示',
    window: 'ウィンドウ'
  }
};

export const getStoredLocale = (): AppLocale => {
  if (typeof window === 'undefined') {
    return LOCALE_FALLBACK_ORDER[0];
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh' || stored === 'ja') {
    return stored;
  }

  const systemLocales = Array.isArray(window.navigator.languages) && window.navigator.languages.length > 0
    ? window.navigator.languages
    : [window.navigator.language];

  for (const locale of systemLocales) {
    const normalized = String(locale).toLowerCase();
    if (normalized.startsWith('zh')) {
      return 'zh';
    }
    if (normalized.startsWith('en')) {
      return 'en';
    }
    if (normalized.startsWith('ja')) {
      return 'ja';
    }
  }

  return LOCALE_FALLBACK_ORDER[0];
};

export const getDefaultFileName = (locale: AppLocale): string => DEFAULT_FILE_NAMES[locale];

export const isDefaultFileName = (value: string): boolean => Object.values(DEFAULT_FILE_NAMES).includes(value);

export const getLocaleLabel = (uiLocale: AppLocale, locale: AppLocale): string => {
  if (locale === 'zh') {
    return t(uiLocale, 'languageChinese');
  }
  if (locale === 'ja') {
    return t(uiLocale, 'languageJapanese');
  }
  return t(uiLocale, 'languageEnglish');
};

export const t = (locale: AppLocale, key: TranslationKey, vars?: Record<string, string>): string => {
  const template = translations[locale][key] ?? translations.en[key] ?? key;
  if (!vars) {
    return template;
  }

  return Object.entries(vars).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, value),
    template
  );
};

export const getFilePickerTypes = (locale: AppLocale) => [
  {
    description: t(locale, 'markdownDocuments'),
    accept: {
      'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'],
      'text/plain': ['.txt']
    }
  }
];
