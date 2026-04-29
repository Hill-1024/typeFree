import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  getCodeBlockPreview,
  getRawOffsetFromPoint,
  highlightMarkdownSyntax,
  marked
} from '../utils';
import { BlockData, FocusInstruction } from '../types';
import { MermaidPreview } from './MermaidPreview';
import { MathPreview } from './MathPreview';

interface BlockProps {
  block: BlockData;
  isActive: boolean;
  theme: 'light' | 'dark';
  onActivate: (offset?: number) => void;
  onChange: (newRaw: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect?: (offset: number) => void;
  focusInstruction?: FocusInstruction | null;
  transitionMode?: 'smooth' | 'none';
}

const SUPPORTED_LANGS = [
  'javascript', 'typescript', 'python', 'java', 'cpp', 'csharp', 'php', 'go', 'rust',
  'sql', 'yaml', 'json', 'html', 'css', 'markdown', 'mermaid', 'latex', 'bash'
];

export const Block = ({
  block,
  isActive,
  theme,
  onActivate,
  onChange,
  onKeyDown,
  onSelect,
  focusInstruction,
  transitionMode = 'smooth'
}: BlockProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [cursorPos, setCursorPos] = useState<number | null>(null);
  const [suggestionState, setSuggestionState] = useState<{
    visible: boolean;
    list: string[];
    pos: { top: number; left: number };
    query: string;
  }>({ visible: false, list: [], pos: { top: 0, left: 0 }, query: '' });
  const lastConsumedInstruction = useRef<FocusInstruction | null>(null);
  const syntaxRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const compositionEndTimerRef = useRef<number | null>(null);
  // Ref to store click-calculated offset, bypasses React state batching entirely
  const pendingClickOffset = useRef<number | null>(null);

  // Derive block type flags moved up to avoid use-before-declaration errors in effects
  const isCodeBlock = block.raw.trim().startsWith('```');
  const isMermaid = block.raw.trim().startsWith('```mermaid');
  const isMathBlock = block.raw.trim().startsWith('$$') && block.raw.trim().endsWith('$$') && block.raw.trim().length >= 4;
  const isQuote = block.raw.trim().startsWith('>');
  const isList = /^[-*+]\s/.test(block.raw) || /^\d+\.\s/.test(block.raw);

  const mermaidCode = isMermaid ? block.raw.replace(/^```mermaid[ \t]*\n?/, '').replace(/\n?```[ \t]*$/, '') : '';
  const mathCode = isMathBlock ? block.raw.replace(/^\$\$[ \t]*\n?/, '').replace(/\n?\$\$[ \t]*$/, '') : '';

  // Helper to render tokens recursively - ensures perfect nesting and no line breaks
  const renderToken = (token: any, index: number): React.ReactNode => {
    switch (token.type) {
      case 'heading':
        const headingContent = token.tokens?.map((t: any, i: number) => renderToken(t, i)) || token.text;
        if (token.depth === 1) return <h1 key={index} className="text-[2.25rem] font-bold leading-[1.4] mt-6 mb-2">{headingContent}</h1>;
        if (token.depth === 2) return <h2 key={index} className="text-[1.875rem] font-semibold leading-[1.4] mt-5 mb-2">{headingContent}</h2>;
        return <h3 key={index} className="text-[1.5rem] font-semibold leading-[1.4] mt-4 mb-2">{headingContent}</h3>;
      case 'paragraph':
        return <p key={index} className="m-0 p-0 leading-[1.7]">{token.tokens?.map((t: any, i: number) => renderToken(t, i)) || token.text}</p>;
      case 'list':
        if (token.ordered) {
          return <ol key={index} className="list-decimal pl-6 my-2">{token.items?.map((item: any, i: number) => renderToken(item, i))}</ol>;
        }
        return <ul key={index} className="list-disc pl-6 my-2">{token.items?.map((item: any, i: number) => renderToken(item, i))}</ul>;
      case 'list_item':
        return <li key={index} className="my-1">{token.tokens?.map((t: any, i: number) => renderToken(t, i)) || token.text}</li>;
      case 'blockquote':
        return <blockquote key={index} className="border-l-4 border-md-primary pl-4 bg-md-surfaceVariant/30 py-2 my-2 rounded-r-lg italic">{token.tokens?.map((t: any, i: number) => renderToken(t, i)) || token.text}</blockquote>;
      case 'inlineMath':
        return <MathPreview key={index} code={token.text} displayMode={false} />;
      case 'blockMath':
        return <MathPreview key={index} code={token.text} displayMode={true} />;
      case 'text':
        if (token.tokens) {
          return <React.Fragment key={index}>{token.tokens.map((t: any, i: number) => renderToken(t, i))}</React.Fragment>;
        }
        return token.text;
      case 'strong':
        return <strong key={index}>{token.tokens?.map((t: any, i: number) => renderToken(t, i)) || token.text}</strong>;
      case 'em':
        return <em key={index}>{token.tokens?.map((t: any, i: number) => renderToken(t, i)) || token.text}</em>;
      case 'code': {
        const codePreview = getCodeBlockPreview(token.raw, token.lang);
        return (
          <div
            key={index}
            className="md-code-preview relative font-mono text-[0.875em] leading-relaxed"
            data-code-lang={codePreview.languageLabel || undefined}
          >
            <div className="overflow-x-auto hide-scrollbar">
              <div className="md-code-lines">
                {codePreview.highlightedLines.map((lineHtml, lineIndex) => (
                  <div key={lineIndex} className="md-code-line">
                    <span
                      className="md-code-line-content"
                      dangerouslySetInnerHTML={{ __html: lineHtml }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      case 'codespan':
        return <code key={index} className="bg-md-surfaceVariant/50 px-1 rounded font-mono text-[0.9em]">{token.text}</code>;
      case 'link':
        return <a key={index} href={token.href} title={token.title} className="text-md-primary hover:underline">{token.tokens?.map((t: any, i: number) => renderToken(t, i)) || token.text}</a>;
      case 'br':
        return <br key={index} />;
      case 'hr':
        return <hr key={index} className="my-4 border-md-outline/20" />;
      case 'space':
        return null;
      default:
        // Use parseInline for simple formatting if token type is unhandled
        return <span key={index} dangerouslySetInnerHTML={{ __html: marked.parseInline(token.raw) as string }} />;
    }
  };

  const tokens = useMemo(() => {
    return marked.lexer(block.raw);
  }, [block.raw]);

  const getSpecialBlockPreviewOffset = (clientX: number, clientY: number) => {
    if (!previewRef.current) {
      return block.raw.length;
    }

    const lines = block.raw.split('\n');
    let startLine = 0;
    let endLine = lines.length - 1;

    if (isMermaid || isMathBlock) {
      startLine = Math.min(1, endLine);
      const closingFence = isMermaid ? '```' : '$$';
      if (endLine > startLine && lines[endLine].trim() === closingFence) {
        endLine -= 1;
      }
    }

    if (endLine < startLine) {
      return block.raw.length;
    }

    const rect = previewRef.current.getBoundingClientRect();
    const safeX = Math.max(rect.left + 4, Math.min(clientX, rect.right - 4));
    const safeY = Math.max(rect.top + 1, Math.min(clientY, rect.bottom - 1));
    const xRatio = rect.width > 0 ? (safeX - rect.left) / rect.width : 1;
    const yRatio = rect.height > 0 ? (safeY - rect.top) / rect.height : 1;
    const targetLine = startLine + Math.round(yRatio * (endLine - startLine));
    const line = lines[targetLine] ?? '';
    const column = Math.min(line.length, Math.round(xRatio * line.length));

    let offset = 0;
    for (let lineIndex = 0; lineIndex < targetLine; lineIndex++) {
      offset += lines[lineIndex].length + 1;
    }

    return Math.min(block.raw.length, offset + column);
  };

  const handleActivateWithPosition = (e: React.MouseEvent) => {
    let offset = block.raw.length;
    const targetNode = e.target as Node | null;

    if ((isMermaid || isMathBlock) && previewRef.current && targetNode && previewRef.current.contains(targetNode)) {
      offset = getSpecialBlockPreviewOffset(e.clientX, e.clientY);
    } else if (renderRef.current) {
      offset = getRawOffsetFromPoint(block.raw, renderRef.current, e.clientX, e.clientY);
    } else if ((isMermaid || isMathBlock) && previewRef.current) {
      offset = getSpecialBlockPreviewOffset(e.clientX, e.clientY);
    }

    const finalOffset = Math.min(offset, block.raw.length);
    pendingClickOffset.current = finalOffset;
    setCursorPos(finalOffset);
    onActivate(finalOffset);
  };

  useEffect(() => {
    if (isActive && textareaRef.current && syntaxRef.current) {
      const handleScroll = () => {
        if (syntaxRef.current && textareaRef.current) {
          syntaxRef.current.scrollTop = textareaRef.current.scrollTop;
          syntaxRef.current.scrollLeft = textareaRef.current.scrollLeft;
        }
      };
      const textarea = textareaRef.current;
      textarea.addEventListener('scroll', handleScroll);
      // Initial sync
      handleScroll();
      return () => textarea.removeEventListener('scroll', handleScroll);
    }
  }, [isActive]);

  useEffect(() => () => {
    if (compositionEndTimerRef.current !== null) {
      window.clearTimeout(compositionEndTimerRef.current);
    }
  }, []);

  // Aggressively enforce cursor position throughout the CSS transition.
  // Called from both the click handler (via pendingClickOffset) and focusInstruction path.
  const enforceCursorPosition = (targetPos: number) => {
    const apply = () => {
      if (textareaRef.current) {
        const finalPos = Math.min(targetPos, textareaRef.current.value.length);
        textareaRef.current.setSelectionRange(finalPos, finalPos);
      }
    };
    // Apply immediately, on next frame, and repeatedly throughout the 300ms CSS transition
    apply();
    requestAnimationFrame(apply);
    const timers = [0, 10, 30, 60, 100, 150, 200, 310];
    timers.forEach(delay => {
      setTimeout(() => {
        if (textareaRef.current && document.activeElement === textareaRef.current) {
          apply();
        }
      }, delay);
    });
  };

  useEffect(() => {
    if (!isActive || !textareaRef.current) return;

    const textarea = textareaRef.current;

    // Priority 1: Pending click offset (set synchronously in handleActivateWithPosition)
    // The textarea was already focused and positioned in the click handler,
    // but we enforce again here to fight any browser resets during the CSS transition.
    if (pendingClickOffset.current !== null) {
      const pos = pendingClickOffset.current;
      pendingClickOffset.current = null;
      textarea.focus();
      setCursorPos(pos);
      enforceCursorPosition(pos);
      if (focusInstruction?.id === block.id) {
        lastConsumedInstruction.current = focusInstruction;
      }
      return;
    }

    // Priority 2: focusInstruction from parent (keyboard navigation, code expansion, etc.)
    if (focusInstruction?.id === block.id && lastConsumedInstruction.current !== focusInstruction) {
      let pos = 0;
      const text = block.raw;

      if (focusInstruction.type === 'start') {
        pos = 0;
      } else if (focusInstruction.type === 'end') {
        pos = text.length;
      } else if (focusInstruction.type === 'jump') {
        const lines = text.split('\n');
        const lineIndex = focusInstruction.direction === 'up' ? lines.length - 1 : 0;
        let newPos = 0;
        for (let i = 0; i < lineIndex; i++) newPos += lines[i].length + 1;
        newPos += Math.min(focusInstruction.col || 0, lines[lineIndex].length);
        pos = newPos;
      } else if (focusInstruction.type === 'offset') {
        pos = focusInstruction.offset;
      }

      textarea.focus();
      setCursorPos(pos);
      enforceCursorPosition(pos);
      lastConsumedInstruction.current = focusInstruction;
      return;
    }

    // Priority 3: Just make sure we're focused (e.g. tab-in or programmatic activation)
    if (document.activeElement !== textarea) {
      textarea.focus({ preventScroll: false });
      if (cursorPos !== null) {
        enforceCursorPosition(cursorPos);
      }
    }
  }, [isActive, focusInstruction, block.id, block.raw, isMermaid, isMathBlock]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const pos = e.target.selectionStart;
    setCursorPos(pos);
    if (onSelect) onSelect(pos);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPos(target.selectionStart);
    if (onSelect) onSelect(target.selectionStart);
  };

  const handleCompositionStart = () => {
    if (compositionEndTimerRef.current !== null) {
      window.clearTimeout(compositionEndTimerRef.current);
      compositionEndTimerRef.current = null;
    }
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    handleSelect(e);
    compositionEndTimerRef.current = window.setTimeout(() => {
      isComposingRef.current = false;
      compositionEndTimerRef.current = null;
    }, 0);
  };

  const isCompositionKeyEvent = (e: React.KeyboardEvent<HTMLTextAreaElement>) => (
    isComposingRef.current || e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229
  );

  const handleLocalKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isCompositionKeyEvent(e)) {
      return;
    }

    const target = e.target as HTMLTextAreaElement;
    const { selectionStart: start, selectionEnd: end, value: val } = target;

    // 0. Language Suggestions Navigation
    if (suggestionState.visible) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const selected = suggestionState.list[0]; // Always take the first match
        const lines = val.split('\n');
        const firstLine = lines[0];
        
        // Find closing ticks if any
        const closingMatch = firstLine.match(/```$/);
        const hasClosing = closingMatch && firstLine.length > 3;
        
        const newFirstLine = '```' + selected + (hasClosing ? '```' : '');
        lines[0] = newFirstLine;
        const newVal = lines.join('\n');
        onChange(newVal);
        
        const newCursor = 3 + selected.length;
        setTimeout(() => {
          target.setSelectionRange(newCursor, newCursor);
          setCursorPos(newCursor);
        }, 0);
        
        setSuggestionState(prev => ({ ...prev, visible: false }));
        return;
      }
      if (e.key === 'Escape') {
        setSuggestionState(prev => ({ ...prev, visible: false }));
        return;
      }
    }

    // 1. Smart Pair Deletion: If backspacing between a pair, delete both
    const pairs: Record<string, string> = {
      '(': ')', '[': ']', '{': '}',
      '"': '"', "'": "'",
      '$': '$', '*': '*', '~': '~'
    };

    // 1. Smart Pair Deletion: If backspacing between a pair, delete both
    if (e.key === 'Backspace' && start === end && start > 0) {
      const charBefore = val[start - 1];
      const charAfter = val[start];
      if (pairs[charBefore] === charAfter) {
        // Special case for quotes/etc: ensure they are actually a pair (not always true but good heuristic)
        e.preventDefault();
        const newVal = val.slice(0, start - 1) + val.slice(start + 1);
        onChange(newVal);
        setTimeout(() => {
          target.setSelectionRange(start - 1, start - 1);
          setCursorPos(start - 1);
        }, 0);
        return;
      }
    }

    // 2. Selection Wrapping: Wrap selected text in the typed pair
    if (pairs[e.key] && start !== end) {
      e.preventDefault();
      const open = e.key;
      const close = pairs[e.key];
      const selectedText = val.slice(start, end);
      const newVal = val.slice(0, start) + open + selectedText + close + val.slice(end);
      onChange(newVal);
      setTimeout(() => {
        target.setSelectionRange(start + 1, end + 1);
        setCursorPos(end + 1);
      }, 0);
      return;
    }

    // 3. Overtyping: If typing a closing symbol and it's already there, just move past it
    const closingSymbols = Object.values(pairs);
    if (closingSymbols.includes(e.key) && start === end && val[start] === e.key) {
      // Special handling for identical symbols (`, ", ', $, *, ~)
      // If we are typing ` and the previous char is also `, don't overtype, allow typing ```
      const isIdenticalPair = pairs[e.key] === e.key;
      const charBefore = val[start - 1];
      
      if (isIdenticalPair && charBefore === e.key) {
        // Fall through to auto-pairing or default behavior to allow ``` or ""
      } else {
        e.preventDefault();
        target.setSelectionRange(start + 1, start + 1);
        setCursorPos(start + 1);
        return;
      }
    }

    // 4. Auto-pairing: Insert both and put cursor in middle
    if (pairs[e.key] && start === end) {
      const isIdenticalPair = pairs[e.key] === e.key;
      if (isIdenticalPair && val[start - 1] === e.key) {
        return; // Let browser insert the character naturally
      }

      e.preventDefault();
      const open = e.key;
      const close = pairs[e.key];
      const newVal = val.slice(0, start) + open + close + val.slice(start);
      onChange(newVal);
      setTimeout(() => {
        target.setSelectionRange(start + 1, start + 1);
        setCursorPos(start + 1);
      }, 0);
      return;
    }

    onKeyDown(e);
  };


  let activeInlineMath: string | null = null;
  if (isActive && cursorPos !== null && !isCodeBlock && !isMathBlock) {
    const regex = /(?<!\$)\$((?:\\.|[^$\n])+?)\$(?!\$)/g;
    let match;
    while ((match = regex.exec(block.raw)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (cursorPos >= start && cursorPos <= end) {
        activeInlineMath = match[1];
        break;
      }
    }
  }

  // Detection for language suggestions in code blocks
  useEffect(() => {
    if (!isActive || cursorPos === null) {
      setSuggestionState(prev => ({ ...prev, visible: false }));
      return;
    }

    const val = block.raw;
    const lines = val.split('\n');
    const firstLine = lines[0];
    const isCodeFence = firstLine.startsWith('```');
    
    // Check if cursor is on the first line and inside the lang portion
    if (isCodeFence && cursorPos <= firstLine.length) {
      const match = firstLine.match(/^```(\w*)(```)?$/);
      if (match) {
        const query = match[1].toLowerCase();
        const filtered = SUPPORTED_LANGS.filter(l => l.startsWith(query));
        
        if (filtered.length > 0) {
          // Position suggestion list below the fence
          setSuggestionState({
            visible: true,
            list: filtered,
            query: query,
            pos: { top: 32, left: 24 } // Approximation, will be refined if needed
          });
          return;
        }
      }
    }

    setSuggestionState(prev => ({ ...prev, visible: false }));
  }, [isActive, block.raw, cursorPos]);

  const [bubblePos, setBubblePos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (activeInlineMath && isActive) {
      const timer = setTimeout(() => {
        const trigger = document.getElementById('active-math-trigger');
        if (trigger) {
          const rect = trigger.getBoundingClientRect();
          const container = trigger.closest('.block-relative');
          if (container) {
            const containerRect = container.getBoundingClientRect();
            setBubblePos({
              top: rect.bottom - containerRect.top,
              left: rect.left - containerRect.left + (rect.width / 2)
            });
          }
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeInlineMath, cursorPos, block.raw, isActive]);

  const shellTransitionClass = transitionMode === 'smooth'
    ? 'transition-[background-color,border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
    : '';
  const layerTransitionClass = transitionMode === 'smooth'
    ? 'transition-[opacity,transform] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform] motion-reduce:transition-none'
    : '';
  const revealTransitionClass = transitionMode === 'smooth'
    ? 'transition-[grid-template-rows,opacity,transform,padding,border-color,max-height,margin] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
    : '';
  const renderLayerLayoutClass = isActive ? 'absolute inset-0' : 'relative';
  const editLayerLayoutClass = isActive ? 'relative' : 'absolute inset-0';

  let wrapperClass = `relative w-full py-1 my-1 ${shellTransitionClass}`;
  if (isCodeBlock || isMathBlock) {
    if (isMermaid || isMathBlock) {
      wrapperClass = `relative w-full my-4 rounded-xl p-4 ${shellTransitionClass} ${isActive ? 'bg-md-surfaceVariant/50 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.45)]' : 'hover:bg-md-surfaceVariant/30 cursor-pointer'}`;
    } else {
      wrapperClass = `relative w-full bg-md-surfaceVariant/50 p-4 rounded-xl my-2 ${shellTransitionClass}`;
    }
  } else if (isQuote) {
    wrapperClass = `relative w-full border-l-4 border-md-primary pl-4 bg-md-surfaceVariant/30 py-2 my-2 rounded-r-lg ${shellTransitionClass}`;
  } else if (block.raw.startsWith('# ')) {
    wrapperClass += " mt-6 mb-2";
  } else if (block.raw.startsWith('## ')) {
    wrapperClass += " mt-5 mb-2";
  } else if (block.raw.startsWith('### ')) {
    wrapperClass += " mt-4 mb-2";
  }

  let typographyClass = "text-base font-sans";
  if (block.raw.startsWith('# ')) typographyClass = "text-[2.25rem] font-bold leading-[1.4] font-sans";
  else if (block.raw.startsWith('## ')) typographyClass = "text-[1.875rem] font-semibold leading-[1.4] font-sans";
  else if (block.raw.startsWith('### ')) typographyClass = "text-[1.5rem] font-semibold leading-[1.4] font-sans";
  else if (isQuote) typographyClass = "text-base font-sans italic text-md-onSurfaceVariant";
  else if (isCodeBlock || isMathBlock) typographyClass = "text-[0.875em] font-mono";

  if (isList) {
    typographyClass += " pl-[1.5em]";
  }

  const isCode = isCodeBlock || isMathBlock;
  const sharedStyles = `${typographyClass} w-full ${isCode ? 'whitespace-pre overflow-x-auto' : 'whitespace-pre-wrap break-words overflow-visible'} m-0 border-none box-border bg-transparent outline-none resize-none hide-scrollbar leading-relaxed`;

  if (isMermaid || isMathBlock) {
    return (
      <div className={wrapperClass} onClick={handleActivateWithPosition}>
        <div className={`grid ${revealTransitionClass} ${isActive ? 'grid-rows-[1fr] opacity-100 translate-y-0' : 'grid-rows-[0fr] opacity-0 -translate-y-0.5 pointer-events-none'}`}>
          <div className="overflow-hidden min-h-0">
            <div className={`relative w-full mb-4 ${layerTransitionClass} ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
              {suggestionState.visible && (
                <div 
                  className="absolute z-[100] bg-md-surface shadow-2xl rounded-xl border border-md-outlineVariant py-2 min-w-[160px] animate-in fade-in zoom-in duration-200"
                  style={{ top: suggestionState.pos.top, left: suggestionState.pos.left }}
                >
                  {suggestionState.list.map((lang, i) => (
                    <div 
                      key={lang}
                      className={`px-4 py-1.5 text-sm cursor-pointer transition-colors ${i === 0 ? 'bg-md-primary/10 text-md-primary font-semibold' : 'text-md-onSurface hover:bg-md-surfaceVariant'}`}
                      onClick={() => {
                        const lines = block.raw.split('\n');
                        const hasClosing = lines[0].match(/```$/) && lines[0].length > 3;
                        lines[0] = '```' + lang + (hasClosing ? '```' : '');
                        onChange(lines.join('\n'));
                        setSuggestionState(prev => ({ ...prev, visible: false }));
                      }}
                    >
                      {lang}
                    </div>
                  ))}
                </div>
              )}
              <div 
                ref={syntaxRef}
                className={`${sharedStyles} syntax-layer text-md-onSurface pointer-events-none`}
                dangerouslySetInnerHTML={{ __html: highlightMarkdownSyntax(block.raw, cursorPos) }}
                aria-hidden="true"
              />
              <textarea
                ref={textareaRef}
                value={block.raw}
                onChange={handleChange}
                onSelect={handleSelect}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onKeyDown={handleLocalKeyDown}
                onFocus={() => onActivate()}
                className={`${sharedStyles} hide-scrollbar absolute top-0 left-0 w-full h-full text-transparent caret-md-onSurface z-10`}
                spellCheck={false}
              />
            </div>
          </div>
        </div>

        <div className={`${revealTransitionClass} ${isActive ? 'pt-4 border-t border-md-outline/20' : 'pt-0 border-t border-transparent'}`}>
          <div className={`${revealTransitionClass} overflow-hidden ${isActive ? 'max-h-10 opacity-100 mb-2 translate-y-0' : 'max-h-0 opacity-0 mb-0 -translate-y-0.5'}`}>
            <div className="text-xs text-md-onSurfaceVariant uppercase tracking-wider font-semibold">Live Preview</div>
          </div>
          <div
            ref={previewRef}
            className={`${layerTransitionClass} ${isActive ? 'opacity-100 translate-y-0' : 'opacity-90 translate-y-0'}`}
          >
            {isMermaid ? (
              <MermaidPreview code={mermaidCode} id={block.id} theme={theme} />
            ) : (
              <MathPreview code={mathCode} displayMode={true} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass} onClick={handleActivateWithPosition}>
      <div className="relative block-relative">
        <div className="relative min-h-[1.5rem]">
          {/* Render Layer Container */}
          <div className={`${renderLayerLayoutClass} ${layerTransitionClass} ${!isActive ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
            <div className="overflow-hidden min-h-0">
              <div ref={renderRef} className="md-render min-h-[1.5rem] cursor-text">
                {tokens.map((token: any, i: number) => renderToken(token, i))}
              </div>
            </div>
          </div>

          {/* Edit Layer Container - pointer-events-none when inactive prevents the z-10 textarea from intercepting clicks meant for the render layer */}
          <div className={`${editLayerLayoutClass} ${layerTransitionClass} ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'}`}>
            <div className="overflow-hidden min-h-0">
              <div className="relative edit-layer-relative w-full min-h-[1.5rem]">
                <div 
                  ref={syntaxRef}
                  className={`${sharedStyles} syntax-layer text-md-onSurface pointer-events-none`}
                  dangerouslySetInnerHTML={{ __html: highlightMarkdownSyntax(block.raw, cursorPos) }}
                  aria-hidden="true"
                />
                <textarea
                  ref={textareaRef}
                  value={block.raw}
                  onChange={handleChange}
                  onSelect={handleSelect}
                  onKeyUp={handleSelect}
                  onMouseUp={handleSelect}
                  onBlur={handleSelect}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  onKeyDown={handleLocalKeyDown}
                  onFocus={() => onActivate()}
                  className={`${sharedStyles} hide-scrollbar absolute top-0 left-0 w-full h-full text-transparent caret-md-onSurface z-10`}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Floating Overlays */}
        {suggestionState.visible && (
          <div 
            className="absolute z-[100] bg-md-surface shadow-2xl rounded-xl border border-md-outlineVariant py-2 min-w-[160px] animate-in fade-in zoom-in duration-200"
            style={{ top: suggestionState.pos.top, left: suggestionState.pos.left }}
          >
            {suggestionState.list.map((lang, i) => (
              <div 
                key={lang}
                className={`px-4 py-1.5 text-sm cursor-pointer transition-colors ${i === 0 ? 'bg-md-primary/10 text-md-primary font-semibold' : 'text-md-onSurface hover:bg-md-surfaceVariant'}`}
                onClick={() => {
                  const lines = block.raw.split('\n');
                  const hasClosing = lines[0].match(/```$/) && lines[0].length > 3;
                  lines[0] = '```' + lang + (hasClosing ? '```' : '');
                  onChange(lines.join('\n'));
                  setSuggestionState(prev => ({ ...prev, visible: false }));
                }}
              >
                {lang}
              </div>
            ))}
          </div>
        )}
        {activeInlineMath && isActive && (
          <div 
            className="absolute z-50 transform -translate-x-1/2 mt-2 pointer-events-none"
            style={{ top: bubblePos.top, left: bubblePos.left }}
          >
            <div className="bg-md-surface shadow-2xl rounded-2xl p-4 border border-md-outlineVariant min-w-[100px] flex justify-center items-center animate-in fade-in zoom-in duration-200">
              <MathPreview code={activeInlineMath} displayMode={false} />
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-45 w-3 h-3 bg-md-surface border-l border-t border-md-outlineVariant"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
