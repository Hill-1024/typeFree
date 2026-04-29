export const DEFAULT_LOCALE = 'en';

const translations = {
  en: {
    about: 'About TypeFree',
    allFiles: 'All Files',
    appearance: 'Appearance',
    blockTransition: 'Block Transition',
    cancel: 'Cancel',
    close: 'Close',
    clearRecent: 'Clear Recent',
    dark: 'Dark',
    dontSave: "Don't Save",
    edit: 'Edit',
    copy: 'Copy',
    cut: 'Cut',
    delete: 'Delete',
    enterKeyBehavior: 'Enter Key Behavior',
    file: 'File',
    languageChinese: 'Chinese',
    languageEnglish: 'English',
    languageJapanese: 'Japanese',
    front: 'Bring All to Front',
    fullScreen: 'Toggle Full Screen',
    hide: 'Hide TypeFree',
    hideOthers: 'Hide Others',
    language: 'Language',
    light: 'Light',
    markdownDocuments: 'Markdown Documents',
    minimize: 'Minimize',
    newDocument: 'New',
    newline: 'Newline',
    noRecentDocuments: 'No Recent Documents',
    none: 'None',
    open: 'Open…',
    openRecent: 'Open Recent',
    paragraph: 'Paragraph',
    paste: 'Paste',
    quit: 'Quit TypeFree',
    redo: 'Redo',
    resetZoom: 'Actual Size',
    save: 'Save',
    saveAs: 'Save As…',
    saveAsFieldLabel: 'Save As:',
    saveOnCloseFailed: 'Failed to save the document before closing.',
    savePromptDetail: 'Your changes will be lost if you do not save them.',
    savePromptMessage: 'Do you want to save changes to {fileName}?',
    settings: 'Settings',
    selectAll: 'Select All',
    services: 'Services',
    smooth: 'Smooth',
    sourceMode: 'Source Mode',
    system: 'System',
    untitled: 'Untitled.md',
    undo: 'Undo',
    unhide: 'Show All',
    view: 'View',
    window: 'Window',
    zoom: 'Zoom',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out'
  },
  zh: {
    about: '关于 TypeFree',
    allFiles: '所有文件',
    appearance: '外观',
    blockTransition: '段落切换动画',
    cancel: '取消',
    close: '关闭',
    clearRecent: '清除最近文件',
    dark: '深色',
    dontSave: '不保存',
    edit: '编辑',
    copy: '复制',
    cut: '剪切',
    delete: '删除',
    enterKeyBehavior: '回车行为',
    file: '文件',
    languageChinese: '中文',
    languageEnglish: '英语',
    languageJapanese: '日语',
    front: '全部置于顶层',
    fullScreen: '切换全屏',
    hide: '隐藏 TypeFree',
    hideOthers: '隐藏其他',
    language: '语言',
    light: '浅色',
    markdownDocuments: 'Markdown 文档',
    minimize: '最小化',
    newDocument: '新建',
    newline: '换行',
    noRecentDocuments: '没有最近文件',
    none: '关闭',
    open: '打开…',
    openRecent: '最近打开',
    paragraph: '新段落',
    paste: '粘贴',
    quit: '退出 TypeFree',
    redo: '重做',
    resetZoom: '实际大小',
    save: '保存',
    saveAs: '另存为…',
    saveAsFieldLabel: '保存为：',
    saveOnCloseFailed: '关闭前保存文档失败。',
    savePromptDetail: '如果不保存，你的修改将会丢失。',
    savePromptMessage: '要保存对 {fileName} 的修改吗？',
    settings: '设置',
    selectAll: '全选',
    services: '服务',
    smooth: '平滑',
    sourceMode: '源码模式',
    system: '跟随系统',
    untitled: '未命名.md',
    undo: '撤销',
    unhide: '显示全部',
    view: '视图',
    window: '窗口',
    zoom: '缩放',
    zoomIn: '放大',
    zoomOut: '缩小'
  },
  ja: {
    about: 'TypeFree について',
    allFiles: 'すべてのファイル',
    appearance: '外観',
    blockTransition: 'ブロック切り替え',
    cancel: 'キャンセル',
    close: '閉じる',
    clearRecent: '最近使った項目を消去',
    dark: 'ダーク',
    dontSave: '保存しない',
    edit: '編集',
    copy: 'コピー',
    cut: '切り取り',
    delete: '削除',
    enterKeyBehavior: 'Enter キーの動作',
    file: 'ファイル',
    languageChinese: '中国語',
    languageEnglish: '英語',
    languageJapanese: '日本語',
    front: 'すべてを手前に移動',
    fullScreen: 'フルスクリーン切り替え',
    hide: 'TypeFree を隠す',
    hideOthers: 'ほかを隠す',
    language: '言語',
    light: 'ライト',
    markdownDocuments: 'Markdown ドキュメント',
    minimize: '最小化',
    newDocument: '新規',
    newline: '改行',
    noRecentDocuments: '最近使った項目はありません',
    none: 'なし',
    open: '開く…',
    openRecent: '最近使った項目を開く',
    paragraph: '段落',
    paste: '貼り付け',
    quit: 'TypeFree を終了',
    redo: 'やり直し',
    resetZoom: '実際のサイズ',
    save: '保存',
    saveAs: '名前を付けて保存…',
    saveAsFieldLabel: '保存名:',
    saveOnCloseFailed: '終了前に文書を保存できませんでした。',
    savePromptDetail: '保存しない場合、変更内容は失われます。',
    savePromptMessage: '{fileName} への変更を保存しますか？',
    settings: '設定',
    selectAll: 'すべてを選択',
    services: 'サービス',
    smooth: '滑らか',
    sourceMode: 'ソースモード',
    system: 'システム',
    untitled: '無題.md',
    undo: '取り消す',
    unhide: 'すべて表示',
    view: '表示',
    window: 'ウィンドウ',
    zoom: 'ズーム',
    zoomIn: '拡大',
    zoomOut: '縮小'
  }
};

export const normalizeLocale = (value) => {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'zh' || normalized.startsWith('zh-')) {
      return 'zh';
    }
    if (normalized === 'ja' || normalized.startsWith('ja-')) {
      return 'ja';
    }
    if (normalized === 'en' || normalized.startsWith('en-')) {
      return 'en';
    }
  }
  return DEFAULT_LOCALE;
};

export const translate = (locale, key, vars = {}) => {
  const normalized = normalizeLocale(locale);
  const template = translations[normalized]?.[key] ?? translations.en[key] ?? key;
  return Object.entries(vars).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template
  );
};

export const getTextFileFilters = (locale) => [
  {
    name: translate(locale, 'markdownDocuments'),
    extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt']
  },
  {
    name: translate(locale, 'allFiles'),
    extensions: ['*']
  }
];

export const getLocaleLabel = (uiLocale, locale) => {
  if (locale === 'zh') {
    return translate(uiLocale, 'languageChinese');
  }
  if (locale === 'ja') {
    return translate(uiLocale, 'languageJapanese');
  }
  return translate(uiLocale, 'languageEnglish');
};
