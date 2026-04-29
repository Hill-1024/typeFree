import React, { useEffect, useRef, useState } from 'react';

interface MathPreviewProps {
  code: string;
  displayMode?: boolean;
}

// Global cache for rendered math to prevent flicker and redundant typesetting
const mathCache = new Map<string, string>();

export const MathPreview: React.FC<MathPreviewProps> = ({ code, displayMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>('');
  const cacheKey = `${displayMode ? 'block' : 'inline'}:${code.trim()}`;
  const lastValidHtml = useRef<string>(mathCache.get(cacheKey) || '');

  useEffect(() => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError('');
      if (containerRef.current) containerRef.current.innerHTML = '';
      return;
    }

    // Immediate update from cache if available
    if (mathCache.has(cacheKey)) {
      const cached = mathCache.get(cacheKey)!;
      if (containerRef.current) containerRef.current.innerHTML = cached;
      lastValidHtml.current = cached;
      setError('');
      return;
    }

    let isMounted = true;
    
    const renderMath = async () => {
      if (!isMounted) return;

      if ((window as any).MathJax && (window as any).MathJax.tex2chtmlPromise) {
        const mj = (window as any).MathJax;
        
        try {
          const node = await mj.tex2chtmlPromise(trimmedCode, { display: displayMode });
          if (isMounted) {
            // Check for our custom error prefix
            if (node.innerText && node.innerText.startsWith('ERR:')) {
              throw new Error(node.innerText.substring(4));
            }

            // We need the HTML string to cache it
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(node);
            const html = tempDiv.innerHTML;
            
            mathCache.set(cacheKey, html);
            if (containerRef.current) containerRef.current.innerHTML = html;
            lastValidHtml.current = html;
            setError('');
            
            mj.startup.document.clear();
            mj.startup.document.updateDocument();
          }
        } catch (err: any) {
          if (isMounted) {
            setError(err.message || String(err));
            // Keep the last valid HTML visible
            if (containerRef.current) containerRef.current.innerHTML = lastValidHtml.current;
          }
        }
      } else {
        // MathJax not ready, retry soon
        setTimeout(renderMath, 100);
      }
    };
    
    const timeoutId = setTimeout(renderMath, 300); // 300ms debounce
    return () => { 
      isMounted = false; 
      clearTimeout(timeoutId);
    };
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
          ref={containerRef} 
          className={`flex justify-center items-center w-full overflow-x-auto py-2 transition-opacity duration-300 ${error ? 'opacity-50' : 'opacity-100'}`} 
        />
      </div>
    );
  }

  return (
    <span className="inline-relative">
      <span ref={containerRef} className="inline" />
      {error && (
        <span className="text-md-onErrorContainer font-mono text-[10px] ml-1 px-1 bg-md-errorContainer/80 rounded border border-md-error/20">
          !
        </span>
      )}
    </span>
  );
};
