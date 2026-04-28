import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { BlockData, ViewMode, FocusInstruction } from './types';
import {
  BLOCK_SEPARATOR,
  EMPTY_BLOCK_SEPARATOR,
  getBlockStartOffset,
  getCursorFromGlobalOffset,
  rawToBlocks
} from './utils';
import { Block } from './components/Block';

const INITIAL_CONTENT = `\
# Welcome to typeFree

This is a Typora-like editor built with React. It strictly separates the **editing layer** (raw markdown) from the **rendering layer** (beautified HTML).

## Features

- **Real-time Preview:** Click any block to edit its raw markdown. Click away to see it rendered.
- **Strict Separation:** The underlying data is pure Markdown. The view is just a projection.
- **typeFree Design:** Clean, distraction-free interface resembling a white paper.

### LaTeX Math

Inline math like $E = mc^2$ is supported. Click this paragraph and move your cursor inside the formula to see the floating preview!

Block math is also supported:

$$
\\begin{pmatrix}
1 & a_1 & a_1^2 \\\\
1 & a_2 & a_2^2 \\\\
1 & a_3 & a_3^2
\\end{pmatrix}
$$

### Mermaid Diagrams

Click the diagram below to edit its source code.

\`\`\`mermaid
graph TD
  A[Hard] -->|Text| B(Round)
  B --> C{Decision}
  C -->|One| D[Result 1]
  C -->|Two| E[Result 2]
\`\`\`

> "Rendering is just the beautification of our editing."

\`\`\`javascript
// Code blocks work too!
function greet() {
  console.log("Hello, world!");
}
\`\`\`\
`;

export default function App() {
  const [mode, setMode] = useState<ViewMode>('wysiwyg');
  const [rawContent, setRawContent] = useState<string>(INITIAL_CONTENT);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [focusInstruction, setFocusInstruction] = useState<FocusInstruction | null>(null);
  const [blockTransition, setBlockTransition] = useState<'smooth' | 'none'>('smooth');
  const [showSettings, setShowSettings] = useState(false);
  const [enterMode, setEnterMode] = useState<'newline' | 'paragraph'>('paragraph');
  const [targetGlobalOffset, setTargetGlobalOffset] = useState<number | null>(null);
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null);
  const sourceScrollContainerRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<{ blockId: string | null; offset: number }>({ blockId: null, offset: 0 });

  const blocksRef = useRef<BlockData[]>([]);
  const blocks = useMemo(() => {
    const newBlocks = rawToBlocks(rawContent, blocksRef.current);
    blocksRef.current = newBlocks;
    return newBlocks;
  }, [rawContent]);

  // Effect to handle cursor sync when switching modes
  useEffect(() => {
    if (targetGlobalOffset === null || mode !== 'raw') return;

    const timer = setTimeout(() => {
      const editor = sourceEditorRef.current;
      if (editor) {
        editor.focus();
        const safeOffset = Math.min(targetGlobalOffset, editor.value.length);
        editor.setSelectionRange(safeOffset, safeOffset);
        
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

  const replaceRawRange = useCallback((start: number, end: number, replacement: string) => {
    const nextRaw = rawContent.slice(0, start) + replacement + rawContent.slice(end);
    return commitRawContent(nextRaw);
  }, [commitRawContent, rawContent]);

  const getBlockRange = useCallback((index: number) => {
    const start = getBlockStartOffset(blocks, index);
    const end = start + blocks[index].raw.length;
    const trailingEnd = end + blocks[index].trailing.length;

    return { start, end, trailingEnd };
  }, [blocks]);

  const handleModeChange = (newMode: ViewMode) => {
    if (newMode === mode) return;

    if (newMode === 'raw') {
      // SYNC: WYSIWYG -> Source
      let finalGlobalOffset = 0;
      const blockId = syncRef.current.blockId;
      
      if (blockId) {
        const activeIndex = blocks.findIndex((b: BlockData) => b.id === blockId);
        if (activeIndex !== -1) {
          finalGlobalOffset = getBlockStartOffset(blocks, activeIndex) + syncRef.current.offset;
        }
      }

      setTargetGlobalOffset(finalGlobalOffset);
      setMode('raw');
    } else {
      // SYNC: Source -> WYSIWYG
      const globalOffset = sourceEditorRef.current?.selectionStart || 0;
      const { blockId: targetBlockId, offset: localOff } = getCursorFromGlobalOffset(blocks, globalOffset);

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
  };

  const handleBlockChange = useCallback((id: string, newRaw: string) => {
    const blockIndex = blocks.findIndex(block => block.id === id);
    if (blockIndex === -1) return;

    const { start, end } = getBlockRange(blockIndex);
    replaceRawRange(start, end, newRaw);
  }, [blocks, getBlockRange, replaceRawRange]);

  const handleBlockKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    const currentBlock = blocks[index];
    const target = e.target as HTMLTextAreaElement;
    const cursorPosition = target.selectionStart;
    const { start: blockStart, end: blockEnd, trailingEnd } = getBlockRange(index);

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

    if (e.key === 'ArrowUp') {
      const prevPos = target.selectionStart;
      const isCodeOrMath = currentBlock.raw.trim().startsWith('```') || 
                          (currentBlock.raw.trim().startsWith('$$') && currentBlock.raw.trim().endsWith('$$'));
      
      setTimeout(() => {
        if (target.selectionStart === prevPos && index > 0) {
          if (isCodeOrMath) {
            if (prevPos === 0) {
              setActiveBlockId(blocks[index - 1].id);
              setFocusInstruction({ id: blocks[index - 1].id, type: 'jump', direction: 'up', col: 0, _ts: Date.now() });
            }
          } else {
            const textBefore = currentBlock.raw.substring(0, prevPos);
            const lastNewline = textBefore.lastIndexOf('\n');
            const col = prevPos - (lastNewline === -1 ? 0 : lastNewline + 1);
            setActiveBlockId(blocks[index - 1].id);
            setFocusInstruction({ id: blocks[index - 1].id, type: 'jump', direction: 'up', col, _ts: Date.now() });
          }
        }
      }, 0);
      
    } else if (e.key === 'ArrowDown') {
      const prevPos = target.selectionStart;
      const isCodeOrMath = currentBlock.raw.trim().startsWith('```') || 
                          (currentBlock.raw.trim().startsWith('$$') && currentBlock.raw.trim().endsWith('$$'));
      
      setTimeout(() => {
        if (target.selectionStart === prevPos && index < blocks.length - 1) {
          if (isCodeOrMath) {
            if (prevPos === currentBlock.raw.length) {
              setActiveBlockId(blocks[index + 1].id);
              setFocusInstruction({ id: blocks[index + 1].id, type: 'jump', direction: 'down', col: 0, _ts: Date.now() });
            }
          } else {
            const textBefore = currentBlock.raw.substring(0, prevPos);
            const lastNewline = textBefore.lastIndexOf('\n');
            const col = prevPos - (lastNewline === -1 ? 0 : lastNewline + 1);
            setActiveBlockId(blocks[index + 1].id);
            setFocusInstruction({ id: blocks[index + 1].id, type: 'jump', direction: 'down', col, _ts: Date.now() });
          }
        }
      }, 0);
      
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
  }, [blocks, enterMode, getBlockRange, handleBlockChange, replaceRawRange]);

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

  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;

    const blockElements = Array.from(document.querySelectorAll('[data-block-id]'));
    let clickX = e.clientX;
    let clickY = e.clientY;

    for (const el of blockElements) {
      const rect = el.getBoundingClientRect();
      if (clickY >= rect.top && clickY <= rect.bottom) {
        const blockId = el.getAttribute('data-block-id');
        if (!blockId) continue;

        // Constraint X coordinate to be within the block horizontally
        // This makes caretRangeFromPoint find the character at the start/end of the line
        const constrainedX = Math.max(rect.left + 5, Math.min(clickX, rect.right - 5));
        
        const range = (document as any).caretRangeFromPoint?.(constrainedX, clickY) || 
                      (document as any).caretPositionFromPoint?.(constrainedX, clickY);
        
        if (range) {
          const container = range.startContainer || range.offsetNode;
          if (container) {
            // Create a range that spans from the start of the block to the click point
            const preRange = document.createRange();
            const blockContentEl = el.querySelector('.md-render') || el;
            preRange.selectNodeContents(blockContentEl);
            
            try {
              if (range.startContainer) {
                preRange.setEnd(range.startContainer, range.startOffset);
              } else if (range.offsetNode) {
                preRange.setEnd(range.offsetNode, range.offset);
              }
              
              const offset = preRange.toString().length;
              setActiveBlockId(blockId);
              setFocusInstruction({ id: blockId, type: 'offset', offset, _ts: Date.now() });
            } catch (err) {
              console.error("Failed to calculate click offset:", err);
              setActiveBlockId(blockId);
            }
            return;
          }
        }
      }
    }

    // If we clicked between blocks or below, find the closest block
    let closestBlockId: string | null = null;
    let minDistance = Infinity;

    for (const el of blockElements) {
      const rect = el.getBoundingClientRect();
      const distanceToTop = Math.abs(clickY - rect.top);
      const distanceToBottom = Math.abs(clickY - rect.bottom);
      const minBlockDist = Math.min(distanceToTop, distanceToBottom);
      
      if (minBlockDist < minDistance) {
        minDistance = minBlockDist;
        closestBlockId = el.getAttribute('data-block-id');
      }
    }

    if (closestBlockId) {
      setActiveBlockId(closestBlockId);
      
      // If clicking way below all content, focus the end of the last block
      const lastBlockEl = blockElements[blockElements.length - 1];
      if (lastBlockEl && clickY > lastBlockEl.getBoundingClientRect().bottom + 20) {
        setFocusInstruction({ id: closestBlockId, type: 'end', _ts: Date.now() });
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-md-surface overflow-hidden relative font-sans">
      {/* Floating Controls */}
      <div className="absolute top-6 right-8 z-[100] flex gap-2">
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 transition-colors focus:outline-none ${showSettings ? 'text-md-primary' : 'text-md-outline hover:text-md-primary'}`}
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
        <button 
          onClick={() => handleModeChange(mode === 'wysiwyg' ? 'raw' : 'wysiwyg')}
          className="p-2 text-md-outline hover:text-md-primary transition-colors focus:outline-none"
          title={mode === 'wysiwyg' ? 'Switch to Source Mode' : 'Switch to Preview Mode'}
        >
          {mode === 'wysiwyg' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 960 960" fill="currentColor"><path d="M320 720L80 480l240-240 57 57-184 184 183 183-56 56Zm320 0l-57-57 184-184-183-183 56-56 240 240-240 240Z"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 960 960" fill="currentColor"><path d="M791 905L280 394l-87 87 183 183-56 56L80 480l143-143L55 169l57-57 736 736-57 57Zm-54-282l-57-57 87-87-183-183 56-56 240 240-143 143Z"/></svg>
          )}
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-20 right-8 z-[110] bg-md-surface shadow-2xl rounded-2xl border border-md-outlineVariant p-6 min-w-[280px] animate-in fade-in zoom-in duration-200">
          <h3 className="text-sm font-bold uppercase tracking-widest text-md-primary mb-4">Editor Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-md-onSurfaceVariant mb-2 block">Enter Key Behavior</label>
              <div className="flex bg-md-surfaceVariant/50 p-1 rounded-xl">
                <button 
                  onClick={() => setEnterMode('newline')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${enterMode === 'newline' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  Newline
                </button>
                <button 
                  onClick={() => setEnterMode('paragraph')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${enterMode === 'paragraph' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  Paragraph
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-md-onSurfaceVariant mb-2 block">Block Transition (WYSIWYG)</label>
              <div className="flex bg-md-surfaceVariant/50 p-1 rounded-xl">
                <button 
                  onClick={() => setBlockTransition('smooth')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${blockTransition === 'smooth' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  Smooth
                </button>
                <button 
                  onClick={() => setBlockTransition('none')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-all ${blockTransition === 'none' ? 'bg-md-surface shadow-sm text-md-primary font-bold' : 'text-md-onSurfaceVariant hover:text-md-onSurface'}`}
                >
                  None
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
                    transitionMode={blockTransition}
                  />
                </div>
              ))}
              {/* Bottom Spacer for Typewriter/Scroll-past-end effect */}
              <div className="flex-shrink-0 w-full pointer-events-none" style={{ height: '33vh' }} />
            </div>
          </div>
        ) : (
          <div ref={sourceScrollContainerRef} className="flex-1 flex flex-col bg-md-surface overflow-y-auto hide-scrollbar pt-8 pb-[33vh]">
            <div className="w-full flex min-h-full">
              {/* Line Numbers */}
              <div className="w-12 flex-shrink-0 flex flex-col items-end pr-4 text-md-outline/40 font-mono text-sm select-none">
                {rawContent.split('\n').map((_, i) => (
                  <div key={i} className="h-6 flex items-center justify-end leading-6">{i + 1}</div>
                ))}
              </div>
              
              {/* Content Area */}
              <div className="flex-1 relative grid">
                {/* Mirror Div for Auto-Height */}
                <div 
                  className="invisible whitespace-pre-wrap break-words font-mono text-sm leading-6 p-0 pl-4 pointer-events-none"
                  style={{ gridArea: '1 / 1 / 2 / 2' }}
                >
                  {rawContent + (rawContent.endsWith('\n') ? ' ' : '\n')}
                </div>
                <textarea
                  ref={sourceEditorRef}
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  className="w-full h-full bg-transparent resize-none outline-none text-md-onSurface font-mono text-sm leading-6 p-0 pl-4 whitespace-pre-wrap break-words overflow-hidden"
                  style={{ gridArea: '1 / 1 / 2 / 2' }}
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
