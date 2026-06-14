import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResumeContent } from '../api/client';
import { A4_HEIGHT, A4_WIDTH, buildPreviewSrcDoc } from '../lib/previewModel';
import { renderResumeHtml } from '../lib/resumeRenderer';

interface ResumePreviewProps {
  templateHtml: string;
  content: ResumeContent;
}

export default function ResumePreview({ templateHtml, content }: ResumePreviewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewportScale, setViewportScale] = useState(0.5);
  const [iframeHeight, setIframeHeight] = useState(A4_HEIGHT);

  const renderedHtml = useMemo(
    () => renderResumeHtml(templateHtml, content),
    [templateHtml, content],
  );

  const srcdoc = useMemo(
    () => buildPreviewSrcDoc(renderedHtml),
    [renderedHtml],
  );

  useEffect(() => {
    setIframeHeight(A4_HEIGHT);
  }, [renderedHtml]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'resume-height' || typeof e.data.height !== 'number') return;
      setIframeHeight(Math.max(A4_HEIGHT, e.data.height));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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
          className="resume-preview-page"
          style={{
            width: A4_WIDTH,
            height: A4_HEIGHT,
            transform: `scale(${viewportScale})`,
            transformOrigin: 'top left',
            overflow: 'hidden',
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
