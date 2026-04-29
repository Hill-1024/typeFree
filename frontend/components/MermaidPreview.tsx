import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

type MermaidTheme = 'light' | 'dark';

const MERMAID_THEME_VARIABLES: Record<MermaidTheme, Record<string, string>> = {
  light: {
    primaryColor: '#F4EFF4',
    primaryTextColor: '#1D1B20',
    primaryBorderColor: '#6750A4',
    lineColor: '#79747E',
    secondaryColor: '#EADDFF',
    tertiaryColor: '#FFFFFF',
    background: '#FFFFFF'
  },
  dark: {
    primaryColor: '#283958',
    primaryTextColor: '#E8ECF4',
    primaryBorderColor: '#A5C4FF',
    lineColor: '#9AA5B5',
    secondaryColor: '#222731',
    tertiaryColor: '#13161D',
    background: '#13161D'
  }
};

const applyMermaidTheme = (theme: MermaidTheme) => {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: MERMAID_THEME_VARIABLES[theme]
  });
};

// Global cache to prevent re-rendering identical diagrams when toggling active state
const svgCache = new Map<string, string>();

interface MermaidPreviewProps {
  code: string;
  id: string;
  theme: MermaidTheme;
}

export const MermaidPreview: React.FC<MermaidPreviewProps> = ({ code, id, theme }) => {
  const initialCacheKey = `${theme}:${code.trim()}`;
  const [svg, setSvg] = useState<string>(svgCache.get(initialCacheKey) || '');
  const [error, setError] = useState<string>('');
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const lastValidSvg = useRef<string>(svgCache.get(initialCacheKey) || '');

  useEffect(() => {
    const trimmedCode = code.trim();
    const cacheKey = `${theme}:${trimmedCode}`;

    if (!trimmedCode) {
      setSvg('');
      setError('');
      return;
    }

    if (svgCache.has(cacheKey)) {
      const cachedSvg = svgCache.get(cacheKey)!;
      setSvg(cachedSvg);
      lastValidSvg.current = cachedSvg;
      setError('');
      return;
    }

    let isMounted = true;

    const renderDiagram = async () => {
      setIsRendering(true);
      try {
        applyMermaidTheme(theme);
        const uniqueId = `mermaid-${theme}-${id}-${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(uniqueId, trimmedCode);

        if (isMounted) {
          svgCache.set(cacheKey, renderedSvg);
          setSvg(renderedSvg);
          lastValidSvg.current = renderedSvg;
          setError('');
        }
      } catch (err: unknown) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(errorMessage);
          setSvg(lastValidSvg.current);
        }
      } finally {
        if (isMounted) {
          setIsRendering(false);
        }
      }
    };

    const timeoutId = window.setTimeout(renderDiagram, 500);
    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [code, id, theme]);

  const [displayError, setDisplayError] = useState<string>('');

  useEffect(() => {
    if (error) {
      setDisplayError(error);
    } else {
      const timer = window.setTimeout(() => setDisplayError(''), 300);
      return () => window.clearTimeout(timer);
    }
  }, [error]);

  if (!svg && !error) {
    return null;
  }

  return (
    <div className="relative w-full flex flex-col items-center">
      <div className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${error ? 'max-h-20 opacity-100 mb-2 translate-y-0' : 'max-h-0 opacity-0 mb-0 -translate-y-2 pointer-events-none'}`}>
        <div className="p-2 bg-md-errorContainer/80 backdrop-blur text-md-onErrorContainer font-mono text-xs rounded-md border border-md-error/20 z-10 shadow-sm">
          {displayError.split('\n')[0]}
        </div>
      </div>

      {svg && (
        <div
          className={`mermaid-surface flex justify-center items-center w-full overflow-x-auto py-2 transition-opacity duration-300 ${isRendering || error ? 'opacity-50' : 'opacity-100'}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
};
