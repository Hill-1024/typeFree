import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';

interface MathPreviewProps {
  code: string;
  displayMode?: boolean;
}

// Global cache for rendered math to prevent flicker and redundant typesetting
const mathCache = new Map<string, string>();

export const MathPreview: React.FC<MathPreviewProps> = ({ code, displayMode = false }) => {
  const [error, setError] = useState<string>('');
  const [renderedHtml, setRenderedHtml] = useState<string>(mathCache.get(`${displayMode ? 'block' : 'inline'}:${code.trim()}`) || '');
  const cacheKey = `${displayMode ? 'block' : 'inline'}:${code.trim()}`;
  const lastValidHtml = useRef<string>(mathCache.get(cacheKey) || '');

  useEffect(() => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError('');
      setRenderedHtml('');
      return;
    }

    if (mathCache.has(cacheKey)) {
      const cached = mathCache.get(cacheKey)!;
      setRenderedHtml(cached);
      lastValidHtml.current = cached;
      setError('');
      return;
    }

    try {
      const html = katex.renderToString(trimmedCode, {
        displayMode,
        throwOnError: true,
        output: 'htmlAndMathml',
        strict: 'warn'
      });

      mathCache.set(cacheKey, html);
      lastValidHtml.current = html;
      setRenderedHtml(html);
      setError('');
    } catch (err: any) {
      setError(err.message || String(err));
      setRenderedHtml(lastValidHtml.current);
    }
  }, [cacheKey, code, displayMode]);

  const [displayError, setDisplayError] = useState<string>('');

  useEffect(() => {
    if (error) {
      setDisplayError(error);
    } else {
      // Small delay to let the animation finish before clearing the text
      const timer = setTimeout(() => setDisplayError(''), 300);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (displayMode) {
    return (
      <div className="relative w-full flex flex-col items-center my-2 group">
        {/* Display error with smooth transition */}
        <div className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${error ? 'max-h-20 opacity-100 mb-2 translate-y-0' : 'max-h-0 opacity-0 mb-0 -translate-y-2 pointer-events-none'}`}>
          <div className="p-2 bg-md-errorContainer/80 backdrop-blur text-md-onErrorContainer font-mono text-xs rounded-md border border-md-error/20 z-10 shadow-sm">
            {displayError.split('\n')[0]}
          </div>
        </div>
        <div 
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
          className={`flex justify-center items-center w-full overflow-x-auto py-2 transition-opacity duration-300 ${error ? 'opacity-50' : 'opacity-100'}`} 
        />
      </div>
    );
  }

  return (
    <span className="inline-relative">
      <span className="inline" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      {error && (
        <span className="text-md-onErrorContainer font-mono text-[10px] ml-1 px-1 bg-md-errorContainer/80 rounded border border-md-error/20">
          !
        </span>
      )}
    </span>
  );
};
