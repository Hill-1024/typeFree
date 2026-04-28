import React, { useEffect, useState, useRef } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with Material Design inspired colors
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#F4EFF4',
    primaryTextColor: '#1D1B20',
    primaryBorderColor: '#6750A4',
    lineColor: '#79747E',
    secondaryColor: '#EADDFF',
    tertiaryColor: '#FFFFFF'
  }
});

// Global cache to prevent re-rendering identical diagrams when toggling active state
const svgCache = new Map<string, string>();

interface MermaidPreviewProps {
  code: string;
  id: string;
}

export const MermaidPreview: React.FC<MermaidPreviewProps> = ({ code, id }) => {
  const [svg, setSvg] = useState<string>(svgCache.get(code) || '');
  const [error, setError] = useState<string>('');
  const [isRendering, setIsRendering] = useState<boolean>(false);
  
  // Keep track of the last valid SVG to prevent the layout from collapsing/twitching during edits
  const lastValidSvg = useRef<string>(svgCache.get(code) || '');

  useEffect(() => {
    const trimmedCode = code.trim();
    
    if (!trimmedCode) {
      setSvg('');
      setError('');
      return;
    }

    // If we already have this exact code cached, use it immediately
    if (svgCache.has(trimmedCode)) {
      const cachedSvg = svgCache.get(trimmedCode)!;
      setSvg(cachedSvg);
      lastValidSvg.current = cachedSvg;
      setError('');
      return;
    }

    let isMounted = true;
    
    const renderDiagram = async () => {
      setIsRendering(true);
      try {
        // Use a unique ID for every render to prevent Mermaid from getting confused by leftover DOM nodes
        const uniqueId = `mermaid-${id}-${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(uniqueId, trimmedCode);
        
        if (isMounted) {
          svgCache.set(trimmedCode, renderedSvg);
          setSvg(renderedSvg);
          lastValidSvg.current = renderedSvg;
          setError('');
        }
      } catch (err: any) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          // Crucial: Restore the last valid SVG so the diagram doesn't disappear while typing
          setSvg(lastValidSvg.current);
        }
      } finally {
        if (isMounted) {
          setIsRendering(false);
        }
      }
    };

    // Increased debounce to 500ms for a smoother typing experience without constant re-renders
    const timeoutId = setTimeout(renderDiagram, 500);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [code, id]);

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

  if (!svg && !error) {
    return null;
  }

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Display error with smooth transition */}
      <div className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${error ? 'max-h-20 opacity-100 mb-2 translate-y-0' : 'max-h-0 opacity-0 mb-0 -translate-y-2 pointer-events-none'}`}>
        <div className="p-2 bg-red-50/95 backdrop-blur text-red-600 font-mono text-xs rounded-md border border-red-200 z-10 shadow-sm">
          {displayError.split('\n')[0]}
        </div>
      </div>

      {svg && (
        <div 
          className={`flex justify-center items-center w-full overflow-x-auto py-2 transition-opacity duration-300 ${isRendering || error ? 'opacity-50' : 'opacity-100'}`}
          dangerouslySetInnerHTML={{ __html: svg }} 
        />
      )}
    </div>
  );
};
