import { marked } from 'marked';
import hljs from 'highlight.js';
import type { BlockData } from './types';

export { marked };
export const BLOCK_SEPARATOR = '\n\n';
export const EMPTY_BLOCK_SEPARATOR = '\n';

const inlineMathExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(src: string) { return src.indexOf('$'); },
  tokenizer(src: string) {
    const match = /^\$((?:\\.|[^$\n])+?)\$(?!\$)/.exec(src);
    if (match) {
      return {
        type: 'inlineMath',
        raw: match[0],
        text: match[1]
      };
    }
  },
  renderer(token: any) {
    return token.raw;
  }
};

const blockMathExtension = {
  name: 'blockMath',
  level: 'block',
  start(src: string) { return src.indexOf('$$'); },
  tokenizer(src: string) {
    const match = /^\$\$((?:\\.|[^$])+?)\$\$/.exec(src);
    if (match) {
      return {
        type: 'blockMath',
        raw: match[0],
        text: match[1]
      };
    }
  },
  renderer(token: any) {
    return token.raw;
  }
};

marked.use({ extensions: [inlineMathExtension, blockMathExtension] });

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const blocksToRaw = (blocks: BlockData[]): string => {
  return blocks.map(b => b.raw + b.trailing).join('');
};

export const getBlockStartOffset = (blocks: BlockData[], targetIndex: number): number => {
  let offset = 0;
  for (let i = 0; i < targetIndex; i++) {
    offset += blocks[i].raw.length + blocks[i].trailing.length;
  }
  return offset;
};

export const getCursorFromGlobalOffset = (blocks: BlockData[], globalOffset: number) => {
  if (blocks.length === 0) {
    return { blockId: null as string | null, offset: 0 };
  }

  const safeOffset = Math.max(0, globalOffset);
  let currentOffset = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockStart = currentOffset;
    const blockEnd = blockStart + block.raw.length;

    if (safeOffset <= blockEnd) {
      return {
        blockId: block.id,
        offset: Math.min(safeOffset - blockStart, block.raw.length)
      };
    }

    currentOffset = blockEnd + block.trailing.length;
    if (safeOffset < currentOffset) {
      const nextBlock = blocks[i + 1];
      if (nextBlock) {
        return { blockId: nextBlock.id, offset: 0 };
      }

      return { blockId: block.id, offset: block.raw.length };
    }
  }

  const lastBlock = blocks[blocks.length - 1];
  return { blockId: lastBlock.id, offset: lastBlock.raw.length };
};

interface RenderedTextProjection {
  text: string;
  map: number[];
}

interface PointToOffsetOptions {
  edgeThreshold?: number;
  horizontalPadding?: number;
  verticalPadding?: number;
}

const buildDirectProjection = (text: string, startOffset: number): RenderedTextProjection => ({
  text,
  map: Array.from({ length: text.length + 1 }, (_, index) => startOffset + index)
});

const buildLinearProjection = (
  text: string,
  rawStart: number,
  rawEnd: number
): RenderedTextProjection => {
  if (!text) {
    return { text: '', map: [rawEnd] };
  }

  const rawSpan = Math.max(0, rawEnd - rawStart);
  const map = [rawStart];

  for (let index = 1; index <= text.length; index++) {
    const nextOffset = rawStart + Math.round((index / text.length) * rawSpan);
    map.push(Math.min(rawEnd, nextOffset));
  }

  return { text, map };
};

const concatProjections = (
  parts: RenderedTextProjection[],
  fallbackOffset: number
): RenderedTextProjection => {
  let text = '';
  let map = [fallbackOffset];

  for (const part of parts) {
    if (part.text.length === 0) {
      map[map.length - 1] = part.map[part.map.length - 1];
      continue;
    }

    text += part.text;
    map = map.slice(0, -1).concat(part.map);
  }

  return { text, map };
};

const getVisibleText = (token: any): string => {
  if (typeof token?.text === 'string') {
    return token.text;
  }

  if (typeof token?.raw === 'string') {
    return token.raw;
  }

  return '';
};

const escapeHtml = (text: string) => (
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
);

const getCodeFenceInfo = (raw: string) => {
  const openingMatch = raw.match(/^([ \t]*)(`{3,}|~{3,})([^\n]*)/);
  if (!openingMatch) {
    return null;
  }

  const firstNewlineIndex = raw.indexOf('\n');
  if (firstNewlineIndex === -1) {
    return null;
  }

  const indent = openingMatch[1] ?? '';
  const fence = openingMatch[2];
  const closingPattern = new RegExp(`(?:^|\\n)${indent}${fence}[ \\t]*$`);
  const closingMatch = raw.match(closingPattern);
  const contentStart = firstNewlineIndex + 1;

  if (!closingMatch || closingMatch.index === undefined || closingMatch.index < contentStart - 1) {
    return {
      content: raw.slice(contentStart),
      contentStart,
      contentEnd: raw.length
    };
  }

  const closingIndex = closingMatch.index + (closingMatch[0].startsWith('\n') ? 1 : 0);
  return {
    content: raw.slice(contentStart, closingIndex),
    contentStart,
    contentEnd: closingIndex
  };
};

const resolveCodeLanguage = (lang?: string) => {
  if (lang && hljs.getLanguage(lang)) {
    return lang;
  }

  return 'plaintext';
};

export const getCodeBlockPreview = (raw: string, lang?: string) => {
  const fenceInfo = getCodeFenceInfo(raw);
  const content = fenceInfo?.content ?? getVisibleText({ text: raw });
  const normalizedContent = fenceInfo && content.endsWith('\n')
    ? content.slice(0, -1)
    : content;
  const language = resolveCodeLanguage(lang);
  const highlightedLines = normalizedContent.split('\n').map((line) => (
    line ? hljs.highlight(line, { language }).value : ''
  ));

  return {
    content: normalizedContent,
    contentStart: fenceInfo?.contentStart ?? 0,
    contentEnd: fenceInfo?.contentEnd ?? raw.length,
    highlightedLines,
    languageLabel: lang?.trim() || ''
  };
};

const projectNestedTokens = (
  parentRaw: string,
  parentStart: number,
  tokens: any[]
): RenderedTextProjection => {
  let searchStart = 0;
  const parts = tokens.map((token) => {
    const childRaw = typeof token?.raw === 'string' ? token.raw : '';
    const childIndex = childRaw ? parentRaw.indexOf(childRaw, searchStart) : -1;
    const childStart = parentStart + (childIndex >= 0 ? childIndex : searchStart);

    if (childIndex >= 0) {
      searchStart = childIndex + childRaw.length;
    }

    return projectToken(token, childStart);
  });

  return concatProjections(parts, parentStart);
};

const projectToken = (token: any, tokenStart: number): RenderedTextProjection => {
  const tokenRaw = typeof token?.raw === 'string' ? token.raw : '';
  const tokenEnd = tokenStart + tokenRaw.length;

  switch (token?.type) {
    case 'space':
    case 'hr':
      return { text: '', map: [tokenEnd] };

    case 'br':
      return { text: '\n', map: [tokenStart, tokenEnd] };

    case 'code':
      if (typeof token?.raw === 'string') {
        const preview = getCodeBlockPreview(token.raw, token.lang);
        return buildDirectProjection(preview.content, tokenStart + preview.contentStart);
      }
      return buildLinearProjection(getVisibleText(token), tokenStart, tokenEnd);

    case 'list': {
      let searchStart = 0;
      const parts: RenderedTextProjection[] = [];

      for (const item of token.items || []) {
        const itemRaw = typeof item?.raw === 'string' ? item.raw : '';
        const itemIndex = itemRaw ? tokenRaw.indexOf(itemRaw, searchStart) : -1;
        const itemStart = tokenStart + (itemIndex >= 0 ? itemIndex : searchStart);

        if (itemIndex >= 0) {
          searchStart = itemIndex + itemRaw.length;
        }

        parts.push(projectToken(item, itemStart));

        if (item !== token.items[token.items.length - 1]) {
          const boundary = itemStart + itemRaw.length;
          parts.push({ text: '\n', map: [boundary, boundary] });
        }
      }

      return concatProjections(parts, tokenStart);
    }

    case 'heading':
    case 'paragraph':
    case 'text':
    case 'strong':
    case 'em':
    case 'link':
    case 'blockquote':
    case 'list_item':
      if (Array.isArray(token.tokens) && token.tokens.length > 0) {
        return projectNestedTokens(tokenRaw, tokenStart, token.tokens);
      }
      break;

    default:
      break;
  }

  const visibleText = getVisibleText(token);
  const visibleIndex = visibleText ? tokenRaw.indexOf(visibleText) : -1;

  if (visibleText && visibleIndex >= 0) {
    return buildDirectProjection(visibleText, tokenStart + visibleIndex);
  }

  return buildLinearProjection(visibleText, tokenStart, tokenEnd);
};

export const buildRenderedTextProjection = (raw: string): RenderedTextProjection => {
  const tokens = marked.lexer(raw);
  let searchStart = 0;

  const parts = tokens.map((token: any) => {
    const tokenRaw = typeof token?.raw === 'string' ? token.raw : '';
    const tokenIndex = tokenRaw ? raw.indexOf(tokenRaw, searchStart) : -1;
    const tokenStart = tokenIndex >= 0 ? tokenIndex : searchStart;

    if (tokenIndex >= 0) {
      searchStart = tokenIndex + tokenRaw.length;
    }

    return projectToken(token, tokenStart);
  });

  return concatProjections(parts, 0);
};

export const getRawOffsetFromRenderedOffset = (raw: string, renderedOffset: number): number => {
  const projection = buildRenderedTextProjection(raw);
  const safeOffset = Math.max(0, Math.min(renderedOffset, projection.map.length - 1));
  return projection.map[safeOffset] ?? raw.length;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const getCaretPoint = (clientX: number, clientY: number) => {
  const range = (document as any).caretRangeFromPoint?.(clientX, clientY);
  if (range) {
    return {
      container: range.startContainer,
      offset: range.startOffset
    };
  }

  const position = (document as any).caretPositionFromPoint?.(clientX, clientY);
  if (position) {
    return {
      container: position.offsetNode,
      offset: position.offset
    };
  }

  return null;
};

export const getRenderedOffsetFromPoint = (
  container: HTMLElement,
  clientX: number,
  clientY: number,
  options: PointToOffsetOptions = {}
) => {
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return 0;
  }

  const edgeThreshold = options.edgeThreshold ?? 16;
  const horizontalPadding = options.horizontalPadding ?? 5;
  const verticalPadding = options.verticalPadding ?? 1;
  const safeX = clientX <= rect.left + edgeThreshold
    ? rect.left - 1
    : clientX >= rect.right - edgeThreshold
      ? rect.right + 1
      : clamp(clientX, rect.left + horizontalPadding, rect.right - horizontalPadding);
  const safeY = clamp(clientY, rect.top + verticalPadding, rect.bottom - verticalPadding);
  const point = getCaretPoint(safeX, safeY);

  if (!point?.container || !container.contains(point.container)) {
    return clientY <= rect.top ? 0 : container.textContent?.length ?? 0;
  }

  try {
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(point.container, point.offset);
    return preRange.toString().length;
  } catch {
    return clientY <= rect.top ? 0 : container.textContent?.length ?? 0;
  }
};

export const getRawOffsetFromPoint = (
  raw: string,
  container: HTMLElement,
  clientX: number,
  clientY: number,
  options: PointToOffsetOptions = {}
) => {
  const renderedOffset = getRenderedOffsetFromPoint(container, clientX, clientY, options);
  return getRawOffsetFromRenderedOffset(raw, renderedOffset);
};

export const rawToBlocks = (raw: string, prevBlocks: BlockData[] = []): BlockData[] => {
  if (!raw) return [{ id: prevBlocks[0]?.id || generateId(), raw: '', trailing: '' }];
  
  const parsedBlocks: Omit<BlockData, 'id'>[] = [];
  const lines = raw.split('\n');
  let currentBlockLines: string[] = [];
  let isInsideCode = false;
  let codeFence = '';
  const topLevelListItemPattern = /^(?:[-*+]|\d+\.)\s+/;

  const isTopLevelListItemStart = (line: string) => topLevelListItemPattern.test(line);
  const pushCurrent = (trailingText: string) => {
    if (currentBlockLines.length === 0 && trailingText === '') return;
    const rawText = currentBlockLines.join('\n');
    
    parsedBlocks.push({
      raw: rawText,
      trailing: trailingText
    });
    currentBlockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFence = line.trim().startsWith('```') || line.trim().startsWith('$$');
    const isLastLine = i === lines.length - 1;
    
    if (isFence) {
      if (!isInsideCode) {
        if (currentBlockLines.length > 0) {
          pushCurrent('\n');
        }
        isInsideCode = true;
        codeFence = line.trim().startsWith('```') ? '```' : '$$';
        currentBlockLines.push(line);
      } else {
        const currentFence = line.trim().substring(0, codeFence.length);
        if (currentFence === codeFence) {
          currentBlockLines.push(line);
          pushCurrent(isLastLine ? '' : '\n');
          isInsideCode = false;
        } else {
          currentBlockLines.push(line);
        }
      }
      continue;
    }

    if (isInsideCode) {
      currentBlockLines.push(line);
      continue;
    }

    if (isTopLevelListItemStart(line)) {
      if (currentBlockLines.length > 0) {
        pushCurrent('\n');
      }
      currentBlockLines.push(line);
      continue;
    }

    if (line.trim() === '') {
      if (currentBlockLines.length > 0) {
        pushCurrent(isLastLine ? '\n' : '\n\n');
      } else {
        parsedBlocks.push({ raw: '', trailing: isLastLine ? '' : '\n' });
      }
    } else {
      currentBlockLines.push(line);
    }
  }

  if (currentBlockLines.length > 0 || isInsideCode) {
    pushCurrent('');
  }

  if (parsedBlocks.length === 0) {
    parsedBlocks.push({ raw: '', trailing: '' });
  }

  // Map IDs using prefix/suffix diffing
  const result: BlockData[] = [];
  
  let start = 0;
  while (start < parsedBlocks.length && start < prevBlocks.length && 
         parsedBlocks[start].raw === prevBlocks[start].raw && 
         parsedBlocks[start].trailing === prevBlocks[start].trailing) {
    result[start] = { ...parsedBlocks[start], id: prevBlocks[start].id };
    start++;
  }
  
  let endParsed = parsedBlocks.length - 1;
  let endPrev = prevBlocks.length - 1;
  while (endParsed >= start && endPrev >= start && 
         parsedBlocks[endParsed].raw === prevBlocks[endPrev].raw && 
         parsedBlocks[endParsed].trailing === prevBlocks[endPrev].trailing) {
    endParsed--;
    endPrev--;
  }
  
  // Assign IDs to changed blocks
  for (let i = start; i <= endParsed; i++) {
    const oldIndex = start + (i - start);
    // Reuse ID if within bounds of the replaced section, else generate new
    const id = (oldIndex <= endPrev) ? prevBlocks[oldIndex].id : generateId();
    result[i] = { ...parsedBlocks[i], id };
  }
  
  // Assign suffix blocks
  let suffixStartParsed = endParsed + 1;
  let suffixStartPrev = endPrev + 1;
  while (suffixStartParsed < parsedBlocks.length) {
    result[suffixStartParsed] = { 
      ...parsedBlocks[suffixStartParsed], 
      id: prevBlocks[suffixStartPrev].id 
    };
    suffixStartParsed++;
    suffixStartPrev++;
  }

  return result;
};

export const highlightMarkdownSyntax = (text: string, cursorPos: number | null = null): string => {
  if (!text) return '';
  
  const isCodeBlock = text.trim().startsWith('```');
  const wrap = (str: string) => `<span class="md-syntax-marker select-none">${str}</span>`;

  if (isCodeBlock) {
    const lines = text.split('\n');
    
    const firstLineMatch = lines[0].match(/^(\s*```)(\w*)/);
    const lang = firstLineMatch ? firstLineMatch[2] : '';
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';

    let htmlLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 || (i === lines.length - 1 && line.trim().startsWith('```') && lines.length > 1)) {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        htmlLines.push(wrap(escaped));
      } else {
        const highlighted = line ? hljs.highlight(line, { language }).value : ' ';
        htmlLines.push(highlighted);
      }
    }
    return htmlLines.join('\n');
  }

  let html = '';
  let lastIndex = 0;
  
  const mathRegex = /(?<!\$)\$((?:\\.|[^$\n])+?)\$(?!\$)/g;
  let match;
  while ((match = mathRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const isActiveMath = cursorPos !== null && cursorPos >= start && cursorPos <= end;
    
    let beforeText = text.substring(lastIndex, start);
    
    // Process markdown formatting for text before math
    beforeText = beforeText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    beforeText = beforeText.replace(/^(#+)(.*)$/gm, (m, p1, p2) => wrap(p1) + p2);
    beforeText = beforeText.replace(/^(\s*[-*+]|\s*\d+\.)/gm, (m) => wrap(m));
    beforeText = beforeText.replace(/(\*\*\*|___)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
    beforeText = beforeText.replace(/(\*\*|__)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
    beforeText = beforeText.replace(/(\*|_)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
    beforeText = beforeText.replace(/(`)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
    
    html += beforeText;
    
    const mathInner = match[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let highlightedMath = wrap('$') + mathInner + wrap('$');
    
    if (isActiveMath) {
      highlightedMath = `<span id="active-math-trigger" class="relative bg-md-primary/10 text-md-primary rounded">${highlightedMath}</span>`;
    } else {
      highlightedMath = `<span class="text-md-primary/80">${highlightedMath}</span>`;
    }
    
    html += highlightedMath;
    lastIndex = end;
  }
  
  let remainingText = text.substring(lastIndex)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  remainingText = remainingText.replace(/^(#+)(.*)$/gm, (m, p1, p2) => wrap(p1) + p2);
  remainingText = remainingText.replace(/^(\s*[-*+]|\s*\d+\.)/gm, (m) => wrap(m));
  remainingText = remainingText.replace(/(\*\*\*|___)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
  remainingText = remainingText.replace(/(\*\*|__)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
  remainingText = remainingText.replace(/(\*|_)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
  remainingText = remainingText.replace(/(`)(.*?)\1/g, (m, p1, p2) => wrap(p1) + p2 + wrap(p1));
  
  html += remainingText;

  return html;
};
