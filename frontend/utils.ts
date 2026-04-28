import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
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

export const rawToBlocks = (raw: string, prevBlocks: BlockData[] = []): BlockData[] => {
  if (!raw) return [{ id: prevBlocks[0]?.id || generateId(), raw: '', trailing: '' }];
  
  const parsedBlocks: Omit<BlockData, 'id'>[] = [];
  const lines = raw.split('\n');
  let currentBlockLines: string[] = [];
  let isInsideCode = false;
  let codeFence = '';

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

  if (isCodeBlock) {
    const lines = text.split('\n');
    const wrap = (str: string) => `<span class="opacity-30 text-md-outline select-none">${str}</span>`;
    
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

  const wrap = (str: string) => `<span class="opacity-30 text-md-outline select-none">${str}</span>`;
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
