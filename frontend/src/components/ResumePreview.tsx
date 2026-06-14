import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResumeContent } from '../api/client';
import { computeFitMode } from '../lib/fitPolicy';
import type { FitMode, FitResult } from '../lib/fitPolicy';
import { A4_HEIGHT, A4_WIDTH, buildPreviewSrcDoc, contentOverflowPolicy } from '../lib/previewModel';
import { renderResumeHtml } from '../lib/resumeRenderer';

interface ResumePreviewProps {
  templateHtml: string;
  content: ResumeContent;
  smartOnePage?: boolean;
  onFitModeChange?: (fitMode: FitMode) => void;
}

const INITIAL_FIT: FitResult = { mode: 'natural', ratio: 0, overflow: false };

export default function ResumePreview({
  templateHtml,
  content,
  smartOnePage = false,
  onFitModeChange,
}: ResumePreviewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<FitResult>(INITIAL_FIT);
  const [viewportScale, setViewportScale] = useState(0.5);
  const [iframeHeight, setIframeHeight] = useState(A4_HEIGHT);

  const renderedHtml = useMemo(
    () => renderResumeHtml(templateHtml, content),
    [templateHtml, content],
  );

  const activeFitMode: FitMode = smartOnePage ? fit.mode : 'natural';

  const srcdoc = useMemo(
    () => buildPreviewSrcDoc(renderedHtml, activeFitMode, smartOnePage),
    [activeFitMode, renderedHtml, smartOnePage],
  );

  useEffect(() => {
    setFit(INITIAL_FIT);
    setIframeHeight(A4_HEIGHT);
    onFitModeChange?.('natural');
  }, [renderedHtml, smartOnePage, onFitModeChange]);

  useEffect(() => {
    onFitModeChange?.(activeFitMode);
  }, [activeFitMode, onFitModeChange]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'resume-height' || typeof e.data.height !== 'number') return;
      const measuredHeight = e.data.height;
      setIframeHeight(smartOnePage && fit.mode === 'overflow' ? measuredHeight : Math.max(A4_HEIGHT, measuredHeight));
      if (!smartOnePage) return;
      setFit((current) => {
        if (current.mode !== 'natural' || current.ratio > 0) return current;
        return computeFitMode(measuredHeight);
      });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fit.mode, smartOnePage]);

  useEffect(() => {
    const update = () => {
      if (!panelRef.current) return;
      const panelW = panelRef.current.clientWidth - 48;
      if (panelW > 0) setViewportScale(panelW / A4_WIDTH);
    };
    update();
    const obs = new ResizeObserver(update);
    if (panelRef.current) obs.observe(panelRef.current);
    return () => obs.disconnect();
  }, []);

  const wrapperWidth = A4_WIDTH * viewportScale;
  const wrapperHeight = A4_HEIGHT * viewportScale;

  return (
    <div className="resume-preview-container" ref={panelRef}>
      <div
        className="resume-preview-wrapper"
        style={{ width: wrapperWidth, height: wrapperHeight }}
      >
        <div
          className={`resume-preview-page fit-${activeFitMode}`}
          style={{
            width: A4_WIDTH,
            height: A4_HEIGHT,
            transform: `scale(${viewportScale})`,
            transformOrigin: 'top left',
            overflow: smartOnePage ? contentOverflowPolicy(activeFitMode) : 'hidden',
          }}
        >
          <div className="resume-content-layer" style={{ width: A4_WIDTH }}>
            <iframe
              className="resume-preview-iframe"
              srcDoc={srcdoc}
              title="简历预览"
              style={{ height: iframeHeight }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
