import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FolderOpen, Save, Settings2, SquarePen, Eye } from 'lucide-react';
import { BlockData, ViewMode, FocusInstruction } from './types';
import {
  AppLocale,
  getDefaultFileName,
  getFilePickerTypes,
  getLocaleLabel,
  getStoredLocale,
  LOCALE_STORAGE_KEY,
  t
} from './i18n';
import {
  BLOCK_SEPARATOR,
  EMPTY_BLOCK_SEPARATOR,
  getBlockStartOffset,
  getCursorFromGlobalOffset,
  getRawOffsetFromPoint,
  rawToBlocks
} from './utils';
import { Block } from './components/Block';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'typefree-theme-mode';

const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
};

const getBrowserSystemTheme = (): ResolvedTheme => (
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
);

const getSystemTheme = (): ResolvedTheme => window.typefreeDesktop?.getSystemTheme() ?? getBrowserSystemTheme();

const resolveTheme = (themeMode: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme => (
  themeMode === 'system' ? systemTheme : themeMode
);

const isCompositionKeyEvent = (event: React.KeyboardEvent<HTMLElement>) => (
  event.nativeEvent.isComposing || event.key === 'Process' || event.keyCode === 229
);

const splitFileName = (fileName: string) => {
  const normalized = fileName.trim();
  const lastDotIndex = normalized.lastIndexOf('.');

  if (lastDotIndex <= 0 || lastDotIndex === normalized.length - 1) {
    return {
      stem: normalized,
      extension: ''
    };
  }

  return {
    stem: normalized.slice(0, lastDotIndex),
    extension: normalized.slice(lastDotIndex)
  };
};

const getDisplayFileName = (fileName: string) => splitFileName(fileName).stem || fileName;

const INITIAL_CONTENT = '';

const TopbarActionButton = ({
  title,
  active = false,
  onClick,
  children
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors focus:outline-none ${
      active
        ? 'bg-md-primary/12 text-md-primary'
        : 'text-md-outline hover:bg-md-surfaceVariant/40 hover:text-md-primary'
    }`}
    title={title}
    aria-label={title}
  >
    {children}
  </button>
);

export default function App() {
  const isDesktopApp = Boolean(window.typefreeDesktop?.isDesktop);
  const useNativeMacCloseFlow = isDesktopApp && /mac/i.test(navigator.userAgent);
  const [locale, setLocale] = useState<AppLocale>(() => getStoredLocale());
  const [mode, setMode] = useState<ViewMode>('wysiwyg');
  const [rawContent, setRawContent] = useState<string>(INITIAL_CONTENT);
  const [lastSavedContent, setLastSavedContent] = useState<string>(INITIAL_CONTENT);
  const [currentFileName, setCurrentFileName] = useState<string>(() => getDefaultFileName(getStoredLocale()));
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [focusInstruction, setFocusInstruction] = useState<FocusInstruction | null>(null);
  const [blockTransition, setBlockTransition] = useState<'smooth' | 'none'>('smooth');
  const [showSettings, setShowSettings] = useState(false);
  const [enterMode, setEnterMode] = useState<'newline' | 'paragraph'>('paragraph');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(getStoredThemeMode(), getSystemTheme()));
  const [targetGlobalOffset, setTargetGlobalOffset] = useState<number | null>(null);
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null);
  const sourceScrollContainerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<{ blockId: string | null; offset: number }>({ blockId: null, offset: 0 });
  const sourceSelectionRef = useRef(0);
  const browserFileHandleRef = useRef<any>(null);
  const modeRef = useRef<ViewMode>('wysiwyg');
  const titleSelectOnFocusRef = useRef(false);
  const pendingBlockSelectAllRef = useRef<{ blockId: string | null; timestamp: number }>({ blockId: null, timestamp: 0 });
  const closeRequestActiveRef = useRef(false);
  const blocksRef = useRef<BlockData[]>([]);
  const blocks = useMemo(() => {
    const newBlocks = rawToBlocks(rawContent, blocksRef.current);
    blocksRef.current = newBlocks;
    return newBlocks;
  }, [rawContent]);
  const sourceCanvasWidth = useMemo(() => {
    const longestLineLength = rawContent.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
    return `max(100%, calc(${Math.max(longestLineLength, 1)}ch + 4rem))`;
  }, [rawContent]);
  const defaultFileName = useMemo(() => getDefaultFileName(locale), [locale]);
  const displayFileName = useMemo(() => getDisplayFileName(currentFileName), [currentFileName]);
  const filePickerTypes = useMemo(() => getFilePickerTypes(locale), [locale]);
  const translate = useCallback((key: Parameters<typeof t>[1], vars?: Record<string, string>) => t(locale, key, vars), [locale]);
  const isDirty = rawContent !== lastSavedContent;

  useEffect(() => {
    if (window.typefreeDesktop) {
      setSystemTheme(window.typefreeDesktop.getSystemTheme());
      return window.typefreeDesktop.onSystemThemeChange((nextTheme) => {
        setSystemTheme(nextTheme);
      });
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => setSystemTheme(getBrowserSystemTheme());

    handleSystemThemeChange();
    media.addEventListener('change', handleSystemThemeChange);
    return () => media.removeEventListener('change', handleSystemThemeChange);
  }, []);

  useEffect(() => {
    const nextTheme = resolveTheme(themeMode, systemTheme);
    setResolvedTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [systemTheme, themeMode]);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    document.title = `${isDirty ? '• ' : ''}${currentFileName} - TypeFree`;
  }, [currentFileName, isDirty]);

  useEffect(() => {
    if (currentFilePath === null && browserFileHandleRef.current === null && rawContent === '' && lastSavedContent === '') {
      setCurrentFileName(defaultFileName);
    }
  }, [currentFilePath, defaultFileName, lastSavedContent, rawContent]);

  useEffect(() => {
    if (!isRenamingTitle || !titleInputRef.current) {
      return;
    }

    const input = titleInputRef.current;
    input.focus();

    if (titleSelectOnFocusRef.current) {
      input.select();
      titleSelectOnFocusRef.current = false;
    }
  }, [isRenamingTitle]);

  useEffect(() => {
    if (!isRenamingTitle) {
      setTitleDraft(displayFileName);
    }
  }, [displayFileName, isRenamingTitle]);

  useEffect(() => {
    if (window.typefreeDesktop?.isDesktop) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!window.typefreeDesktop?.updateDocumentState) {
      return;
    }

    window.typefreeDesktop.updateDocumentState({
      dirty: isDirty,
      filePath: currentFilePath,
      fileName: currentFileName,
      content: rawContent
    });
  }, [currentFileName, currentFilePath, isDirty, rawContent]);

  useEffect(() => {
    if (!window.typefreeDesktop?.updateEditorUiState) {
      return;
    }

    window.typefreeDesktop.updateEditorUiState({
      locale,
      themeMode,
      enterMode,
      blockTransition,
      viewMode: mode
    });
  }, [blockTransition, enterMode, locale, mode, themeMode]);

  // Effect to handle cursor sync when switching modes
  useEffect(() => {
    if (targetGlobalOffset === null || mode !== 'raw') return;

    const timer = setTimeout(() => {
      const editor = sourceEditorRef.current;
      if (editor) {
        editor.focus();
        const safeOffset = Math.min(targetGlobalOffset, editor.value.length);
        editor.setSelectionRange(safeOffset, safeOffset);
        sourceSelectionRef.current = safeOffset;
        
        const textBefore = editor.value.substring(0, safeOffset);
        const linesBefore = textBefore.split('\n').length - 1;
        const lineHeight = 26; 
        const targetScroll = linesBefore * lineHeight - (window.innerHeight / 3);
        const scrollContainer = sourceScrollContainerRef.current;

        if (scrollContainer) {
          scrollContainer.scrollTop = Math.max(0, targetScroll);
        }
        
        setTargetGlobalOffset(null);
      }
    }, 20);

    return () => clearTimeout(timer);
  }, [mode, targetGlobalOffset]);

  const commitRawContent = useCallback((nextRaw: string) => {
    const nextBlocks = rawToBlocks(nextRaw, blocksRef.current);
    blocksRef.current = nextBlocks;
    setRawContent(nextRaw);
    return nextBlocks;
  }, []);

  const resetEditorCursor = useCallback((nextMode: ViewMode) => {
    syncRef.current = { blockId: null, offset: 0 };
    sourceSelectionRef.current = 0;
    setActiveBlockId(null);
    setFocusInstruction(null);
    if (nextMode === 'raw') {
      setTargetGlobalOffset(0);
      return;
    }
    setTargetGlobalOffset(null);
  }, []);

  const applyLoadedDocument = useCallback((nextRaw: string, options: {
    fileName: string;
    filePath?: string | null;
    browserHandle?: any;
  }) => {
    commitRawContent(nextRaw);
    setLastSavedContent(nextRaw);
    setCurrentFileName(options.fileName || defaultFileName);
    setCurrentFilePath(options.filePath ?? null);
    browserFileHandleRef.current = options.browserHandle ?? null;
    resetEditorCursor(mode);
  }, [commitRawContent, defaultFileName, mode, resetEditorCursor]);

  const createNewDocument = useCallback(() => {
    browserFileHandleRef.current = null;
    applyLoadedDocument('', {
      fileName: defaultFileName,
      filePath: null
    });
  }, [applyLoadedDocument, defaultFileName]);

  const saveToBrowserHandle = useCallback(async (handle: any, content: string) => {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }, []);

  const openBrowserFileFromInput = useCallback(async () => {
    return new Promise<{ canceled: boolean; content?: string; name?: string }>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve({ canceled: true });
          return;
        }

        try {
          const content = await file.text();
          resolve({
            canceled: false,
            content,
            name: file.name
          });
        } catch (error) {
          reject(error);
        }
      };
      input.click();
    });
  }, []);

  const confirmDiscardChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm(translate('confirmDiscardChanges'));
  }, [isDirty, translate]);

  const handleOpenFile = useCallback(async () => {
    if (!confirmDiscardChanges()) return;

    try {
      if (window.typefreeDesktop?.openFile) {
        const result = await window.typefreeDesktop.openFile();
        if (result.canceled || typeof result.content !== 'string') return;

        applyLoadedDocument(result.content, {
          fileName: result.name || defaultFileName,
          filePath: result.filePath ?? null
        });
        return;
      }

      const browserWindow = window as any;
      if (typeof browserWindow.showOpenFilePicker === 'function') {
        try {
          const [handle] = await browserWindow.showOpenFilePicker({
            multiple: false,
            types: filePickerTypes
          });

          if (!handle) return;

          const file = await handle.getFile();
          applyLoadedDocument(await file.text(), {
            fileName: file.name,
            browserHandle: handle
          });
          return;
        } catch (error: any) {
          if (error?.name === 'AbortError') return;
          throw error;
        }
      }

      const result = await openBrowserFileFromInput();
      if (result.canceled || typeof result.content !== 'string') return;

      applyLoadedDocument(result.content, {
        fileName: result.name || defaultFileName
      });
    } catch (error) {
      console.error(error);
      window.alert(translate('openFailed'));
    }
  }, [applyLoadedDocument, confirmDiscardChanges, defaultFileName, filePickerTypes, openBrowserFileFromInput, translate]);

  const handleSaveFile = useCallback(async (options?: { saveAs?: boolean }) => {
    const saveAs = options?.saveAs ?? false;
    const suggestedName = currentFileName || defaultFileName;

    try {
      if (window.typefreeDesktop?.saveFile) {
        const result = await window.typefreeDesktop.saveFile({
          content: rawContent,
          defaultPath: currentFilePath ?? suggestedName,
          filePath: saveAs ? undefined : currentFilePath ?? undefined,
          saveAs
        });

        if (result.canceled) return false;

        setLastSavedContent(rawContent);
        setCurrentFilePath(result.filePath ?? null);
        setCurrentFileName(result.name || suggestedName);
        browserFileHandleRef.current = null;
        return true;
      }

      if (!saveAs && browserFileHandleRef.current) {
        await saveToBrowserHandle(browserFileHandleRef.current, rawContent);
        const file = await browserFileHandleRef.current.getFile();
        setLastSavedContent(rawContent);
        setCurrentFileName(file.name || suggestedName);
        setCurrentFilePath(null);
        return true;
      }

      const browserWindow = window as any;
      if (typeof browserWindow.showSaveFilePicker === 'function') {
        try {
          const handle = await browserWindow.showSaveFilePicker({
            suggestedName,
            types: filePickerTypes
          });

          await saveToBrowserHandle(handle, rawContent);
          const file = await handle.getFile();
          browserFileHandleRef.current = handle;
          setLastSavedContent(rawContent);
          setCurrentFileName(file.name || suggestedName);
          setCurrentFilePath(null);
          return true;
        } catch (error: any) {
          if (error?.name === 'AbortError') return false;
          throw error;
        }
      }

      const blob = new Blob([rawContent], { type: 'text/markdown;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = suggestedName;
      link.click();
      URL.revokeObjectURL(objectUrl);

      browserFileHandleRef.current = null;
      setLastSavedContent(rawContent);
      setCurrentFileName(suggestedName);
      setCurrentFilePath(null);
      return true;
    } catch (error) {
      console.error(error);
      window.alert(translate('saveFailed'));
      return false;
    }
  }, [currentFileName, currentFilePath, defaultFileName, filePickerTypes, rawContent, saveToBrowserHandle, translate]);

  useEffect(() => {
    if (useNativeMacCloseFlow) {
      return;
    }

    if (!window.typefreeDesktop?.onCloseRequest) {
      return;
    }

    return window.typefreeDesktop.onCloseRequest((event) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();

      if (closeRequestActiveRef.current) {
        return;
      }

      closeRequestActiveRef.current = true;
      void (async () => {
        try {
          const decision = await window.typefreeDesktop?.confirmClose({
            content: rawContent,
            defaultPath: currentFilePath ?? (currentFileName || defaultFileName),
            fileName: currentFileName || defaultFileName,
            filePath: currentFilePath ?? undefined
          });

          if (decision?.action === 'discard') {
            await window.typefreeDesktop?.closeWindow();
            return;
          }

          if (decision?.action === 'save') {
            setLastSavedContent(rawContent);
            setCurrentFilePath(decision.filePath ?? currentFilePath ?? null);
            setCurrentFileName(decision.name || currentFileName || defaultFileName);
            browserFileHandleRef.current = null;
            await window.typefreeDesktop?.closeWindow();
          }
        } finally {
          closeRequestActiveRef.current = false;
        }
      })();
    });
  }, [currentFileName, currentFilePath, defaultFileName, isDirty, rawContent, useNativeMacCloseFlow]);

  const beginTitleRename = useCallback(() => {
    titleSelectOnFocusRef.current = true;
    setTitleDraft(getDisplayFileName(currentFileName));
    setIsRenamingTitle(true);
  }, [currentFileName]);

  const cancelTitleRename = useCallback(() => {
    setTitleDraft(getDisplayFileName(currentFileName));
    setIsRenamingTitle(false);
  }, [currentFileName]);

  const commitTitleRename = useCallback(async () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(getDisplayFileName(currentFileName));
      setIsRenamingTitle(false);
      return;
    }

    if (nextTitle === getDisplayFileName(currentFileName)) {
      setTitleDraft(nextTitle);
      setIsRenamingTitle(false);
      return;
    }

    try {
      if (currentFilePath && window.typefreeDesktop?.renameFile) {
        const result = await window.typefreeDesktop.renameFile({
          filePath: currentFilePath,
          nextName: nextTitle
        });

        setCurrentFilePath(result.filePath);
        setCurrentFileName(result.name || nextTitle);
        setTitleDraft(result.name || nextTitle);
        setIsRenamingTitle(false);
        return;
      }

      const currentExtension = splitFileName(currentFileName).extension || '.md';
      const normalizedTitle = splitFileName(nextTitle).extension ? nextTitle : `${nextTitle}${currentExtension}`;
      setCurrentFileName(normalizedTitle);
      setTitleDraft(nextTitle);
      setIsRenamingTitle(false);
    } catch (error) {
      console.error(error);
      window.alert(translate('renameFailed'));
      setTitleDraft(getDisplayFileName(currentFileName));
      setIsRenamingTitle(false);
    }
  }, [currentFileName, currentFilePath, titleDraft, translate]);

  const replaceRawRange = useCallback((start: number, end: number, replacement: string) => {
    const nextRaw = rawContent.slice(0, start) + replacement + rawContent.slice(end);
    return commitRawContent(nextRaw);
  }, [commitRawContent, rawContent]);

  const syncFromSourceOffset = useCallback((globalOffset: number) => {
    sourceSelectionRef.current = globalOffset;
    const { blockId, offset } = getCursorFromGlobalOffset(blocksRef.current, globalOffset);
    syncRef.current = { blockId: blockId ?? null, offset };
  }, []);

  const getBlockRange = useCallback((index: number) => {
    const start = getBlockStartOffset(blocks, index);
    const end = start + blocks[index].raw.length;
    const trailingEnd = end + blocks[index].trailing.length;

    return { start, end, trailingEnd };
  }, [blocks]);

  const handleModeChange = useCallback((newMode: ViewMode) => {
    const currentMode = modeRef.current;
    if (newMode === currentMode) return;

    if (newMode === 'raw') {
      // SYNC: WYSIWYG -> Source
      let finalGlobalOffset = 0;
      const blockId = syncRef.current.blockId;
      const currentBlocks = blocksRef.current;
      
      if (blockId) {
        const activeIndex = currentBlocks.findIndex((b: BlockData) => b.id === blockId);
        if (activeIndex !== -1) {
          finalGlobalOffset = getBlockStartOffset(currentBlocks, activeIndex) + syncRef.current.offset;
        }
      }

      sourceSelectionRef.current = finalGlobalOffset;
      setTargetGlobalOffset(finalGlobalOffset);
      setMode('raw');
    } else {
      // SYNC: Source -> WYSIWYG
      const globalOffset = sourceSelectionRef.current;
      const { blockId: targetBlockId, offset: localOff } = getCursorFromGlobalOffset(blocksRef.current, globalOffset);

      setActiveBlockId(targetBlockId);
      syncRef.current = { blockId: targetBlockId ?? null, offset: localOff };
      setMode('wysiwyg');

      if (targetBlockId) {
        setTimeout(() => {
          setFocusInstruction({
            id: targetBlockId,
            type: 'offset',
            offset: localOff,
            _ts: Date.now()
          });
        }, 50);
      }
    }
  }, []);

  const handleBlockChange = useCallback((id: string, newRaw: string) => {
    const blockIndex = blocks.findIndex(block => block.id === id);
    if (blockIndex === -1) return;

    const { start, end } = getBlockRange(blockIndex);
    replaceRawRange(start, end, newRaw);
  }, [blocks, getBlockRange, replaceRawRange]);

  const selectWholeDocumentInWysiwyg = useCallback(() => {
    setActiveBlockId(null);
    setFocusInstruction(null);
    syncRef.current = { blockId: null, offset: 0 };

    requestAnimationFrame(() => {
      const container = editorContainerRef.current;
      const selection = window.getSelection();
      if (!container || !selection) {
        return;
      }

      const blockNodes = Array.from(container.querySelectorAll('[data-block-id]'));
      if (blockNodes.length === 0) {
        return;
      }

      const range = document.createRange();
      range.setStartBefore(blockNodes[0]);
      range.setEndAfter(blockNodes[blockNodes.length - 1]);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, []);

  const handleBlockKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const currentBlock = blocks[index];
    const target = e.target as HTMLTextAreaElement;
    const cursorPosition = target.selectionStart;
    const hasSelection = target.selectionStart !== target.selectionEnd;
    const { start: blockStart, end: blockEnd, trailingEnd } = getBlockRange(index);
    const isSelectAllShortcut = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a';

    if (isSelectAllShortcut) {
      const now = Date.now();
      const isCurrentBlockFullySelected = target.selectionStart === 0 && target.selectionEnd === currentBlock.raw.length;
      const pendingSelectAll = pendingBlockSelectAllRef.current;
      const shouldSelectWholeDocument = isCurrentBlockFullySelected &&
        pendingSelectAll.blockId === currentBlock.id &&
        now - pendingSelectAll.timestamp <= 700;

      pendingBlockSelectAllRef.current = { blockId: currentBlock.id, timestamp: now };

      if (shouldSelectWholeDocument) {
        e.preventDefault();
        selectWholeDocumentInWysiwyg();
      }
      return;
    }

    if (e.key === 'Enter') {
      const isShift = e.shiftKey;
      const shouldSplit = (enterMode === 'paragraph' && !isShift) || (enterMode === 'newline' && isShift);

      // Check for code block expansion: matches ```lang or ```lang``` (auto-paired)
      const expansionMatch = currentBlock.raw.match(/^```(\w*)(```)?$/);
      if (expansionMatch && target.selectionStart >= 3 && target.selectionStart <= 3 + expansionMatch[1].length) {
        if (shouldSplit) { // Only expand on the "split" action
          e.preventDefault();
          const langTag = expansionMatch[1];
          const expandedCode = '```' + langTag + '\n\n```';
          replaceRawRange(blockStart, blockEnd, expandedCode);
          
          const newOffset = 3 + langTag.length + 1;
          setFocusInstruction({ 
            id: currentBlock.id, 
            type: 'offset', 
            offset: newOffset, 
            _ts: Date.now() 
          });
          return;
        }
      }

      const isCodeBlock = currentBlock.raw.trim().startsWith('```');
      const isMathBlock = currentBlock.raw.trim().startsWith('$$') && currentBlock.raw.trim().endsWith('$$') && currentBlock.raw.trim().length >= 4;
      
      if (isCodeBlock || isMathBlock) {
        if (target.selectionStart !== target.selectionEnd) return;
        const fence = isCodeBlock ? '```' : '$$';
        const isClosed = currentBlock.raw.trim().endsWith(fence) && currentBlock.raw.trim().length > fence.length;
        
        // If we are at the very end of a closed block, and we WANT to split, exit the block
        if (isClosed && cursorPosition === currentBlock.raw.length) {
          if (shouldSplit) {
            e.preventDefault();
            const replacement = currentBlock.raw
              + EMPTY_BLOCK_SEPARATOR
              + (currentBlock.trailing === '' ? '' : EMPTY_BLOCK_SEPARATOR);
            const nextBlocks = replaceRawRange(blockStart, trailingEnd, replacement);
            const nextBlockId = nextBlocks[index + 1]?.id;
            if (nextBlockId) {
              setActiveBlockId(nextBlockId);
              setFocusInstruction({ id: nextBlockId, type: 'start', _ts: Date.now() });
            }
            return;
          }
        }
        
        // Otherwise, inside a code/math block, Enter should just be a newline (never split)
        // If shouldSplit is true (Enter without Shift), we preventDefault and manually insert \n
        // to avoid the splitting logic below.
        if (shouldSplit) {
          e.preventDefault();
          const selectionStart = target.selectionStart;
          const selectionEnd = target.selectionEnd;
          const val = target.value;
          const nextBlocks = replaceRawRange(
            blockStart + selectionStart,
            blockStart + selectionEnd,
            '\n'
          );
          
          // Move cursor after \n
          const newPos = selectionStart + 1;
          setTimeout(() => {
            if (target) {
              target.setSelectionRange(newPos, newPos);
            }
          }, 0);
          const currentId = nextBlocks[index]?.id ?? currentBlock.id;
          setFocusInstruction({ id: currentId, type: 'offset', offset: newPos, _ts: Date.now() });
          return;
        }
        // If shouldSplit is false (Shift+Enter), let browser handle it (inserts \n)
        return;
      }

      if (!shouldSplit) {
        // Just insert a newline (default behavior if we don't preventDefault)
        return;
      }

      // Perform Split Block
      e.preventDefault();
      const textBefore = currentBlock.raw.substring(0, target.selectionStart);
      const textAfter = currentBlock.raw.substring(target.selectionEnd);
      const nextTrailing = textAfter === '' && currentBlock.trailing !== '' ? EMPTY_BLOCK_SEPARATOR : currentBlock.trailing;
      const replacement = textBefore + BLOCK_SEPARATOR + textAfter + nextTrailing;
      const nextBlocks = replaceRawRange(blockStart, trailingEnd, replacement);
      const nextBlockId = nextBlocks[index + 1]?.id;

      if (nextBlockId) {
        setActiveBlockId(nextBlockId);
        setFocusInstruction({ id: nextBlockId, type: 'start', _ts: Date.now() });
      }
      return;
    }

    if (e.key === 'Backspace' && target.selectionStart === 0 && target.selectionEnd === 0 && index > 0) {
      e.preventDefault();
      const prevBlock = blocks[index - 1];
      const prevLen = prevBlock.raw.length;
      const { start: prevStart } = getBlockRange(index - 1);
      const replacement = prevBlock.raw + currentBlock.raw + currentBlock.trailing;
      const nextBlocks = replaceRawRange(prevStart, trailingEnd, replacement);
      const mergedBlockId = nextBlocks[index - 1]?.id ?? prevBlock.id;

      setActiveBlockId(mergedBlockId);
      setFocusInstruction({ id: mergedBlockId, type: 'offset', offset: prevLen, _ts: Date.now() });
      return;
    }

    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !hasSelection) {
      const isCodeOrMath = currentBlock.raw.trim().startsWith('```') ||
        (currentBlock.raw.trim().startsWith('$$') && currentBlock.raw.trim().endsWith('$$'));
      const textBefore = currentBlock.raw.substring(0, cursorPosition);
      const lines = currentBlock.raw.split('\n');
      const currentLineIndex = textBefore.split('\n').length - 1;
      const lastNewline = textBefore.lastIndexOf('\n');
      const col = cursorPosition - (lastNewline === -1 ? 0 : lastNewline + 1);
      const isFirstLine = currentLineIndex === 0;
      const isLastLine = currentLineIndex === lines.length - 1;

      if (!isCodeOrMath) {
        const prevPos = cursorPosition;
        const direction = e.key;

        setTimeout(() => {
          if (target.selectionStart !== prevPos || target.selectionEnd !== prevPos) {
            if (direction === 'ArrowUp' && isFirstLine && target.selectionStart === 0) {
              if (index === 0) {
                syncRef.current = { blockId: currentBlock.id, offset: 0 };
                return;
              }

              setActiveBlockId(blocks[index - 1].id);
              setFocusInstruction({ id: blocks[index - 1].id, type: 'jump', direction: 'up', col, _ts: Date.now() });
              return;
            }

            if (direction === 'ArrowDown' && isLastLine && target.selectionStart === currentBlock.raw.length) {
              if (index === blocks.length - 1) {
                syncRef.current = { blockId: currentBlock.id, offset: currentBlock.raw.length };
                return;
              }

              setActiveBlockId(blocks[index + 1].id);
              setFocusInstruction({ id: blocks[index + 1].id, type: 'jump', direction: 'down', col, _ts: Date.now() });
              return;
            }

            syncRef.current = { blockId: currentBlock.id, offset: target.selectionStart };
            return;
          }

          if (direction === 'ArrowUp' && isFirstLine) {
            if (index === 0) {
              target.setSelectionRange(0, 0);
              syncRef.current = { blockId: currentBlock.id, offset: 0 };
              return;
            }

            setActiveBlockId(blocks[index - 1].id);
            setFocusInstruction({ id: blocks[index - 1].id, type: 'jump', direction: 'up', col, _ts: Date.now() });
            return;
          }

          if (direction === 'ArrowDown' && isLastLine) {
            if (index === blocks.length - 1) {
              const endPos = currentBlock.raw.length;
              target.setSelectionRange(endPos, endPos);
              syncRef.current = { blockId: currentBlock.id, offset: endPos };
              return;
            }

            setActiveBlockId(blocks[index + 1].id);
            setFocusInstruction({ id: blocks[index + 1].id, type: 'jump', direction: 'down', col, _ts: Date.now() });
          }
        }, 0);
        return;
      }

      if (e.key === 'ArrowUp' && isFirstLine) {
        e.preventDefault();

        if (cursorPosition > 0) {
          target.setSelectionRange(0, 0);
          syncRef.current = { blockId: currentBlock.id, offset: 0 };
          return;
        }

        if (index > 0) {
          setActiveBlockId(blocks[index - 1].id);
          setFocusInstruction({ id: blocks[index - 1].id, type: 'jump', direction: 'up', col, _ts: Date.now() });
          return;
        }

        target.setSelectionRange(0, 0);
        syncRef.current = { blockId: currentBlock.id, offset: 0 };
        return;
      }

      if (e.key === 'ArrowDown' && isLastLine) {
        e.preventDefault();

        const endPos = currentBlock.raw.length;
        if (cursorPosition < endPos) {
          target.setSelectionRange(endPos, endPos);
          syncRef.current = { blockId: currentBlock.id, offset: endPos };
          return;
        }

        if (index < blocks.length - 1) {
          setActiveBlockId(blocks[index + 1].id);
          setFocusInstruction({ id: blocks[index + 1].id, type: 'jump', direction: 'down', col, _ts: Date.now() });
          return;
        }

        target.setSelectionRange(endPos, endPos);
        syncRef.current = { blockId: currentBlock.id, offset: endPos };
        return;
      }
    } else if (e.key === 'ArrowLeft' && cursorPosition === 0) {
      if (index > 0) {
        e.preventDefault();
        setActiveBlockId(blocks[index - 1].id);
        setFocusInstruction({ id: blocks[index - 1].id, type: 'end', _ts: Date.now() });
      }
      
    } else if (e.key === 'ArrowRight' && cursorPosition === currentBlock.raw.length) {
      if (index < blocks.length - 1) {
        e.preventDefault();
        setActiveBlockId(blocks[index + 1].id);
        setFocusInstruction({ id: blocks[index + 1].id, type: 'start', _ts: Date.now() });
      }
    }
  }, [blocks, enterMode, getBlockRange, handleBlockChange, replaceRawRange, selectWholeDocumentInWysiwyg]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.editor-container') && !target.closest('header')) {
        setActiveBlockId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      const key = event.key.toLowerCase();
      if (key === 'o') {
        event.preventDefault();
        void handleOpenFile();
        return;
      }

      if (key === 's') {
        event.preventDefault();
        void handleSaveFile({ saveAs: event.shiftKey });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleOpenFile, handleSaveFile]);

  useEffect(() => {
    if (!window.typefreeDesktop?.onMenuAction) {
      return;
    }

    return window.typefreeDesktop.onMenuAction((action, payload) => {
      if (action === 'new-file') {
        if (!confirmDiscardChanges()) {
          return;
        }
        createNewDocument();
        return;
      }

      if (action === 'open-file') {
        void handleOpenFile();
        return;
      }

      if (action === 'save-file') {
        void handleSaveFile();
        return;
      }

      if (action === 'save-file-as') {
        void handleSaveFile({ saveAs: true });
        return;
      }

      if (action === 'set-source-mode') {
        const enabled = payload && 'enabled' in payload ? payload.enabled : false;
        handleModeChange(enabled ? 'raw' : 'wysiwyg');
        return;
      }

      if (action === 'set-locale') {
        if (payload && 'locale' in payload && (payload.locale === 'en' || payload.locale === 'zh' || payload.locale === 'ja')) {
          setLocale(payload.locale);
        }
        return;
      }

      if (action === 'set-theme-light') {
        setThemeMode('light');
        return;
      }

      if (action === 'set-theme-dark') {
        setThemeMode('dark');
        return;
      }

      if (action === 'set-theme-system') {
        setThemeMode('system');
        return;
      }

      if (action === 'set-enter-mode-newline') {
        setEnterMode('newline');
        return;
      }

      if (action === 'set-enter-mode-paragraph') {
        setEnterMode('paragraph');
        return;
      }

      if (action === 'set-block-transition-smooth') {
        setBlockTransition('smooth');
        return;
      }

      if (action === 'set-block-transition-none') {
        setBlockTransition('none');
      }
    });
  }, [confirmDiscardChanges, createNewDocument, handleModeChange, handleOpenFile, handleSaveFile]);

  useEffect(() => {
    if (!window.typefreeDesktop?.onOpenDocumentRequest) {
      return;
    }

    return window.typefreeDesktop.onOpenDocumentRequest((payload) => {
      if (!confirmDiscardChanges()) {
        return;
      }

      applyLoadedDocument(payload.content, {
        fileName: payload.name || defaultFileName,
        filePath: payload.filePath ?? null
      });
    });
  }, [applyLoadedDocument, confirmDiscardChanges, defaultFileName]);

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;

    const blockElements = Array.from(document.querySelectorAll('[data-block-id]')) as HTMLElement[];
    const clickX = e.clientX;
    const clickY = e.clientY;

    const focusBlockOffset = (blockId: string, offset: number) => {
      const safeOffset = Math.max(0, offset);
      setActiveBlockId(blockId);
      syncRef.current = { blockId, offset: safeOffset };
      setFocusInstruction({ id: blockId, type: 'offset', offset: safeOffset, _ts: Date.now() });
    };

    const resolveOffsetForElement = (element: HTMLElement, block: BlockData) => {
      const renderSurface = element.querySelector('.md-render') as HTMLElement | null;
      if (renderSurface) {
        return getRawOffsetFromPoint(block.raw, renderSurface, clickX, clickY);
      }

      return clickY <= element.getBoundingClientRect().top ? 0 : block.raw.length;
    };

    if (blockElements.length === 0) {
      return;
    }

    const firstBlockEl = blockElements[0];
    const lastBlockEl = blockElements[blockElements.length - 1];
    const firstBlockId = firstBlockEl.getAttribute('data-block-id');
    const lastBlockId = lastBlockEl.getAttribute('data-block-id');
    const firstBlock = blocks.find((block) => block.id === firstBlockId);
    const lastBlock = blocks.find((block) => block.id === lastBlockId);

    if (firstBlockEl && firstBlock && clickY <= firstBlockEl.getBoundingClientRect().top) {
      focusBlockOffset(firstBlock.id, 0);
      return;
    }

    if (lastBlockEl && lastBlock && clickY >= lastBlockEl.getBoundingClientRect().bottom) {
      focusBlockOffset(lastBlock.id, lastBlock.raw.length);
      return;
    }

    for (const el of blockElements) {
      const rect = el.getBoundingClientRect();
      if (clickY >= rect.top && clickY <= rect.bottom) {
        const blockId = el.getAttribute('data-block-id');
        if (!blockId) continue;
        const block = blocks.find((item) => item.id === blockId);
        if (!block) continue;
        focusBlockOffset(blockId, resolveOffsetForElement(el, block));
        return;
      }
    }

    // If we clicked between blocks or below, find the closest block
    let closestBlockEl: HTMLElement | null = null;
    let minDistance = Infinity;

    for (const el of blockElements) {
      const rect = el.getBoundingClientRect();
      const distanceToTop = Math.abs(clickY - rect.top);
      const distanceToBottom = Math.abs(clickY - rect.bottom);
      const minBlockDist = Math.min(distanceToTop, distanceToBottom);
      
      if (minBlockDist < minDistance) {
        minDistance = minBlockDist;
        closestBlockEl = el;
      }
    }

    if (closestBlockEl) {
      const blockId = closestBlockEl.getAttribute('data-block-id');
      const block = blocks.find((item) => item.id === blockId);
      if (!blockId || !block) return;
      focusBlockOffset(blockId, resolveOffsetForElement(closestBlockEl, block));
    }
  };

  return (
    <div className="h-screen flex flex-col bg-md-surface overflow-hidden relative font-sans">
      <header className="grid h-12 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-md-outlineVariant/35 px-4">
        <div />
        <div className="min-w-0 px-4 text-center">
          {isRenamingTitle ? (
            <div className="flex items-center justify-center gap-2">
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitleRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isCompositionKeyEvent(event)) {
                    event.preventDefault();
                    commitTitleRename();
                    return;
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTitleRename();
                  }
                }}
                className="min-w-0 max-w-full rounded-md bg-md-surfaceVariant/55 px-2 py-1 text-center text-sm font-semibold tracking-[0.01em] text-md-onSurface outline-none ring-1 ring-md-outlineVariant/50 focus:ring-md-primary"
              />
              {isDirty ? (
                <span className="flex-shrink-0 text-xs font-medium text-md-primary">
                  {translate('unsaved')}
                </span>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={beginTitleRename}
              className={`max-w-full truncate rounded-md px-2 py-1 text-center text-sm font-semibold tracking-[0.01em] transition-colors focus:outline-none ${isDirty ? 'text-md-primary hover:text-md-primary' : 'text-md-onSurface hover:text-md-primary'}`}
              title={currentFileName}
            >
              {displayFileName}{isDirty ? ` • ${translate('unsaved')}` : ''}
            </button>
          )}
        </div>

        {isDesktopApp ? (
          <div />
        ) : (
          <div className="flex items-center justify-self-end gap-1">
            <TopbarActionButton
              onClick={() => void handleOpenFile()}
              title={translate('openFileTooltip')}
            >
              <FolderOpen size={18} strokeWidth={1.85} />
            </TopbarActionButton>
            <TopbarActionButton
              onClick={() => void handleSaveFile()}
              title={translate('saveFileTooltip')}
              active={isDirty}
            >
              <Save size={18} strokeWidth={1.85} />
            </TopbarActionButton>
            <TopbarActionButton
              onClick={() => setShowSettings(!showSettings)}
              title={translate('settingsTooltip')}
              active={showSettings}
            >
              <Settings2 size={18} strokeWidth={1.85} />
            </TopbarActionButton>
            <TopbarActionButton
              onClick={() => handleModeChange(mode === 'wysiwyg' ? 'raw' : 'wysiwyg')}
              title={mode === 'wysiwyg' ? translate('switchToSourceMode') : translate('switchToPreviewMode')}
            >
              {mode === 'wysiwyg' ? (
                <SquarePen size={18} strokeWidth={1.85} />
              ) : (
                <Eye size={18} strokeWidth={1.85} />
              )}
            </TopbarActionButton>
          </div>
        )}
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-14 right-4 z-[110] bg-md-surface shadow-2xl rounded-2xl border border-md-outlineVariant p-6 min-w-[280px] animate-in fade-in zoom-in duration-200">
          <h3 className="text-sm font-bold uppercase tracking-widest text-md-primary mb-4">{translate('editorSettings')}</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-md-onSurfaceVariant mb-2 block">{translate('file')}</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => void handleOpenFile()}
                  className="px-3 py-2 text-xs rounded-xl bg-md-surfaceVariant/50 text-md-onSurfaceVariant hover:text-md-onSurface transition-colors"
                >
                  {translate('open')}
                </button>
                <button
                  onClick={() => void handleSaveFile()}
                  className={`px-3 py-2 text-xs rounded-xl transition-colors ${isDirty ? 'bg-md-primary/12 text-md-primary' : 'bg-md-surfaceVariant/50 text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('save')}
                </button>
                <button
                  onClick={() => void handleSaveFile({ saveAs: true })}
                  className="px-3 py-2 text-xs rounded-xl bg-md-surfaceVariant/50 text-md-onSurfaceVariant hover:text-md-onSurface transition-colors"
                >
                  {translate('saveAs')}
                </button>
              </div>
              <div className="mt-2 truncate text-[11px] uppercase tracking-[0.16em] text-md-onSurfaceVariant/70">
                {currentFilePath ? currentFilePath : (window.typefreeDesktop ? translate('localFile') : translate('browserDocument'))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-md-onSurfaceVariant mb-2 block">{translate('appearance')}</label>
              <div className="flex bg-md-surfaceVariant/50 p-1 rounded-xl">
                <button
                  onClick={() => setThemeMode('light')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${themeMode === 'light' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('light')}
                </button>
                <button
                  onClick={() => setThemeMode('dark')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${themeMode === 'dark' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('dark')}
                </button>
                <button
                  onClick={() => setThemeMode('system')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${themeMode === 'system' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('system')}
                </button>
              </div>
              <div className="mt-2 text-[11px] tracking-[0.08em] text-md-onSurfaceVariant/70">
                {translate('activeTheme', { theme: translate(resolvedTheme) })}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-md-onSurfaceVariant mb-2 block">{translate('language')}</label>
              <div className="flex bg-md-surfaceVariant/50 p-1 rounded-xl">
                {(['zh', 'ja', 'en'] as AppLocale[]).map((nextLocale) => (
                  <button
                    key={nextLocale}
                    onClick={() => setLocale(nextLocale)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${locale === nextLocale ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                  >
                    {getLocaleLabel(locale, nextLocale)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-md-onSurfaceVariant mb-2 block">{translate('enterKeyBehavior')}</label>
              <div className="flex bg-md-surfaceVariant/50 p-1 rounded-xl">
                <button 
                  onClick={() => setEnterMode('newline')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${enterMode === 'newline' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('newline')}
                </button>
                <button 
                  onClick={() => setEnterMode('paragraph')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${enterMode === 'paragraph' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('paragraph')}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-md-onSurfaceVariant mb-2 block">{translate('blockTransitionPreview')}</label>
              <div className="flex bg-md-surfaceVariant/50 p-1 rounded-xl">
                <button 
                  onClick={() => setBlockTransition('smooth')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${blockTransition === 'smooth' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('smooth')}
                </button>
                <button 
                  onClick={() => setBlockTransition('none')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${blockTransition === 'none' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  {translate('none')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex justify-center overflow-hidden relative">
        {mode === 'wysiwyg' ? (
          <div 
            className="w-full h-full overflow-y-auto hide-scrollbar cursor-text"
            onClick={handleContainerClick}
          >
            <div 
              ref={editorContainerRef}
              className="w-full max-w-5xl mx-auto px-6 pt-8 flex flex-col min-h-full editor-container"
              onClick={handleContainerClick}
            >
              {blocks.map((block: BlockData, index: number) => (
                <div key={block.id} data-block-id={block.id}>
                  <Block
                    block={block}
                    isActive={activeBlockId === block.id}
                    onActivate={(offset?: number) => {
                      setActiveBlockId(block.id);
                      syncRef.current.blockId = block.id;
                      if (offset !== undefined) {
                        syncRef.current.offset = offset;
                        setFocusInstruction({
                          id: block.id,
                          type: 'offset',
                          offset,
                          _ts: Date.now()
                        });
                      }
                    }}
                    onChange={(newRaw) => handleBlockChange(block.id, newRaw)}
                    onKeyDown={(e) => handleBlockKeyDown(e, index)}
                    onSelect={(offset) => {
                      syncRef.current.offset = offset;
                    }}
                    focusInstruction={focusInstruction}
                    theme={resolvedTheme}
                    transitionMode={blockTransition}
                  />
                </div>
              ))}
              {/* Bottom Spacer for Typewriter/Scroll-past-end effect */}
              <div className="flex-shrink-0 w-full pointer-events-none" style={{ height: '33vh' }} />
            </div>
          </div>
        ) : (
          <div ref={sourceScrollContainerRef} className="flex-1 flex flex-col bg-md-surface overflow-auto hide-scrollbar pt-8 pb-[33vh]">
            <div className="inline-flex min-w-full min-h-full">
              {/* Line Numbers */}
              <div className="sticky left-0 z-10 w-12 flex-shrink-0 flex flex-col items-end pr-4 text-md-outline/40 font-mono text-sm select-none bg-md-surface">
                {rawContent.split('\n').map((_, i) => (
                  <div key={i} className="h-6 flex items-center justify-end leading-6">{i + 1}</div>
                ))}
              </div>
              
              {/* Content Area */}
              <div className="relative inline-grid min-w-full" style={{ width: sourceCanvasWidth }}>
                {/* Mirror Div for Auto-Height */}
                <div 
                  className="invisible inline-block min-w-full whitespace-pre font-mono text-sm leading-6 p-0 pl-4 pr-8 pointer-events-none"
                  style={{ gridArea: '1 / 1 / 2 / 2', width: sourceCanvasWidth }}
                >
                  {rawContent + (rawContent.endsWith('\n') ? ' ' : '\n')}
                </div>
                <textarea
                  ref={sourceEditorRef}
                  value={rawContent}
                  onChange={(e) => {
                    commitRawContent(e.target.value);
                    syncFromSourceOffset(e.target.selectionStart);
                  }}
                  onSelect={(e) => {
                    syncFromSourceOffset((e.target as HTMLTextAreaElement).selectionStart);
                  }}
                  onKeyUp={(e) => {
                    syncFromSourceOffset((e.target as HTMLTextAreaElement).selectionStart);
                  }}
                  onMouseUp={(e) => {
                    syncFromSourceOffset((e.target as HTMLTextAreaElement).selectionStart);
                  }}
                  className="min-w-full h-full bg-transparent resize-none outline-none text-md-onSurface font-mono text-sm leading-6 p-0 pl-4 pr-8 whitespace-pre overflow-hidden"
                  style={{ gridArea: '1 / 1 / 2 / 2', width: sourceCanvasWidth }}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
