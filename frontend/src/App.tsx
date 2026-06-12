import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as api from './api/client';
import ResumePreview from './components/ResumePreview';
import SectionEditor from './components/SectionEditor';
import { useDebouncedCallback } from './hooks/useDebouncedCallback';
import {
  cloneContent,
  createGeneralSection,
  displaySpecialTitle,
  insertSection,
  isSpecialSectionId,
  moveSection,
  normalizeResumeContent,
  removeSection,
  sectionDeleteNeedsConfirmation,
} from './lib/sectionModel';

export default function App() {
  const [resumes, setResumes] = useState<api.ResumeListItem[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [detail, setDetail] = useState<api.ResumeDetail | null>(null);
  const [content, setContent] = useState<api.ResumeContent | null>(null);
  const [syncEpoch, setSyncEpoch] = useState(0);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [editingHeaderName, setEditingHeaderName] = useState(false);
  const [headerNameDraft, setHeaderNameDraft] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  const [editorWidth, setEditorWidth] = useState(420);
  const [draggingSection, setDraggingSection] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ target: string; position: 'above' | 'below' } | null>(null);

  const contentRef = useRef<api.ResumeContent | null>(null);
  const headerNameInputRef = useRef<HTMLInputElement>(null);
  const draggedSectionRef = useRef<string | null>(null);
  const draggingDividerRef = useRef(false);
  const mainBodyRef = useRef<HTMLDivElement>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef(0);
  const restoreEditorScrollRef = useRef(false);
  const ignoreWsUntilRef = useRef(0);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const loadList = useCallback(async () => {
    try {
      setResumes(await api.listResumes());
    } catch (e) {
      console.error('Failed to load resumes', e);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const applyContent = useCallback((next: api.ResumeContent, bumpSync = false) => {
    const normalized = normalizeResumeContent(next);
    setContent(normalized);
    setDetail((prev) => (prev ? { ...prev, content: normalized } : prev));
    contentRef.current = normalized;
    if (bumpSync) setSyncEpoch((n) => n + 1);
  }, []);

  const rememberEditorScroll = useCallback(() => {
    const panel = editorPanelRef.current;
    if (!panel) return;
    editorScrollRef.current = panel.scrollTop;
    restoreEditorScrollRef.current = true;
  }, []);

  const loadDetail = useCallback(async (name: string, preserveEditorScroll = false) => {
    try {
      if (preserveEditorScroll) rememberEditorScroll();
      const d = await api.getResume(name);
      applyContent(d.content, true);
      setDetail(d);
    } catch (e) {
      console.error('Failed to load resume', e);
    }
  }, [applyContent, rememberEditorScroll]);

  useEffect(() => {
    if (activeName) loadDetail(activeName);
    else {
      setDetail(null);
      setContent(null);
    }
  }, [activeName, loadDetail]);

  const markLocalWrite = useCallback(() => {
    ignoreWsUntilRef.current = Date.now() + 1500;
  }, []);

  const persistContent = useDebouncedCallback(async () => {
    if (!activeName || !contentRef.current) return;
    markLocalWrite();
    try {
      await api.updateContent(activeName, contentRef.current);
    } catch (e) {
      console.error('Failed to persist content', e);
    }
  }, 500);

  const persistContentNow = useCallback(async () => {
    if (!activeName || !contentRef.current) return;
    markLocalWrite();
    try {
      await api.updateContent(activeName, contentRef.current);
    } catch (e) {
      console.error('Failed to persist content', e);
    }
  }, [activeName, markLocalWrite]);

  useLayoutEffect(() => {
    if (!restoreEditorScrollRef.current) return;
    const panel = editorPanelRef.current;
    if (panel) panel.scrollTop = editorScrollRef.current;
    restoreEditorScrollRef.current = false;
  }, [content]);

  const patchContent = useCallback((updater: (current: api.ResumeContent) => api.ResumeContent, immediateSave = false) => {
    const current = contentRef.current;
    if (!current) return;
    rememberEditorScroll();
    const next = normalizeResumeContent(updater(cloneContent(current)));

    setContent((prev) => {
      if (!prev) return next;
      const sections = { ...prev.sections };
      for (const [id, section] of Object.entries(next.sections)) {
        if (sections[id] !== section) sections[id] = section;
      }
      for (const id of Object.keys(sections)) {
        if (!(id in next.sections)) delete sections[id];
      }
      return { ...next, sections };
    });
    setDetail((prev) => (prev ? { ...prev, content: next } : prev));
    contentRef.current = next;

    markLocalWrite();
    if (immediateSave) persistContentNow();
    else persistContent();
  }, [markLocalWrite, persistContent, persistContentNow, rememberEditorScroll]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.onmessage = (event) => {
      if (Date.now() < ignoreWsUntilRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        if (activeName && msg.type === 'file_changed' && msg.resume_name === activeName) {
          loadDetail(activeName, true);
        }
      } catch {
        // ignore malformed messages
      }
    };
    return () => ws.close();
  }, [activeName, loadDetail]);

  const handleSectionContentChange = useCallback((sectionId: string, markdown: string) => {
    patchContent((current) => {
      const section = current.sections[sectionId];
      if (!section || section.content === markdown) return current;
      return {
        ...current,
        sections: {
          ...current.sections,
          [sectionId]: { ...section, content: markdown },
        },
      };
    });
  }, [patchContent]);

  const handleTitleChange = useCallback((sectionId: string, title: string) => {
    if (isSpecialSectionId(sectionId)) return;
    patchContent((current) => {
      const section = current.sections[sectionId];
      if (!section || section.title === title) return current;
      return {
        ...current,
        sections: {
          ...current.sections,
          [sectionId]: { ...section, title },
        },
      };
    }, true);
  }, [patchContent]);

  const insertIdRelativeToAnchor = useCallback((
    order: string[],
    anchorId: string,
    newId: string,
    position: 'above' | 'below',
  ) => {
    if (!isSpecialSectionId(anchorId)) return insertSection(order, anchorId, newId, position);
    return position === 'above'
      ? [newId, ...order.filter((id) => id !== newId)]
      : [...order.filter((id) => id !== newId), newId];
  }, []);

  const handleAddSection = useCallback((anchorId: string, position: 'above' | 'below') => {
    patchContent((current) => {
      const section = createGeneralSection(current.sections);
      return {
        ...current,
        sections: { ...current.sections, [section.id]: section },
        section_order: insertIdRelativeToAnchor(current.section_order, anchorId, section.id, position),
      };
    }, true);
  }, [insertIdRelativeToAnchor, patchContent]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    if (isSpecialSectionId(sectionId)) {
      alert(`${sectionId} Section 是必选 Section，不能删除。`);
      return;
    }
    const section = contentRef.current?.sections[sectionId];
    if (!section) return;
    if (
      sectionDeleteNeedsConfirmation(section.content)
      && !confirm(`确定删除 Section「${section.title || sectionId}」吗？`)
    ) return;

    patchContent((current) => {
      const sections = { ...current.sections };
      delete sections[sectionId];
      return {
        ...current,
        sections,
        section_order: removeSection(current.section_order, sectionId),
      };
    }, true);
  }, [patchContent]);

  const resetSectionDrag = useCallback(() => {
    draggedSectionRef.current = null;
    setDraggingSection(null);
    setDropHint(null);
  }, []);

  const handleDropOnSection = useCallback((targetId: string, position: 'above' | 'below') => {
    const draggedId = draggedSectionRef.current;
    resetSectionDrag();
    if (!draggedId || draggedId === targetId || isSpecialSectionId(targetId)) return;
    patchContent((current) => ({
      ...current,
      section_order: moveSection(current.section_order, draggedId, targetId, position),
    }), true);
  }, [patchContent, resetSectionDrag]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await api.createResume(newName.trim());
      setShowNewDialog(false);
      setNewName('');
      await loadList();
      setActiveName(newName.trim());
    } catch (e) {
      console.error('Failed to create resume', e);
    }
  }, [loadList, newName]);

  const handleDelete = useCallback(async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定删除简历「${name}」吗？`)) return;
    try {
      await api.deleteResume(name);
      if (activeName === name) setActiveName(null);
      await loadList();
    } catch (err) {
      console.error('Failed to delete resume', err);
    }
  }, [activeName, loadList]);

  const handleCopyResume = useCallback(async (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const result = await api.copyResume(name);
      await loadList();
      setActiveName(result.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : '复制简历失败');
    }
  }, [loadList]);

  const renameActiveResume = useCallback(async (currentName: string, nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    const result = await api.renameResume(currentName, trimmed);
    await loadList();
    setActiveName(result.name);
  }, [loadList]);

  const handleExportPdf = useCallback(async () => {
    if (!activeName || exportingPdf) return;
    setExportingPdf(true);
    try {
      const blob = await api.exportPdf(activeName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '导出 PDF 失败');
    } finally {
      setExportingPdf(false);
    }
  }, [activeName, exportingPdf]);

  useEffect(() => {
    if (!editingHeaderName) return;
    headerNameInputRef.current?.focus();
    headerNameInputRef.current?.select();
  }, [editingHeaderName]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingDividerRef.current || !mainBodyRef.current) return;
      const rect = mainBodyRef.current.getBoundingClientRect();
      const clamped = Math.max(280, Math.min(e.clientX - rect.left, rect.width - 300));
      setEditorWidth(clamped);
    };
    const onMouseUp = () => {
      if (!draggingDividerRef.current) return;
      draggingDividerRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const editorSectionIds = content
    ? ['name', 'contact', ...(content.sections.photo ? ['photo'] : []), ...content.section_order]
    : [];

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">📄</span> ResumeCopilot
        </div>
        <div className="sidebar-list">
          {resumes.map((r) => (
            <div
              key={r.name}
              className={`sidebar-item ${activeName === r.name ? 'active' : ''}`}
              onClick={() => setActiveName(r.name)}
            >
              <span className="resume-name">{r.name}</span>
              <span className="resume-actions">
                <button className="sidebar-action-btn" onClick={(e) => handleCopyResume(r.name, e)} title="复制">⧉</button>
                <button
                  className="sidebar-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameTarget(r.name);
                    setRenameName(r.name);
                  }}
                  title="重命名"
                >
                  ✎
                </button>
                <button className="sidebar-action-btn delete-btn" onClick={(e) => handleDelete(r.name, e)} title="删除">×</button>
              </span>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button className="add-btn" type="button" onClick={() => setShowNewDialog(true)}>+ 新建简历</button>
        </div>
      </aside>

      <main className="main">
        {detail && content ? (
          <>
            <header className="main-header">
              {editingHeaderName ? (
                <input
                  ref={headerNameInputRef}
                  className="resume-name-input"
                  value={headerNameDraft}
                  onChange={(e) => setHeaderNameDraft(e.target.value)}
                  onBlur={() => {
                    const next = headerNameDraft.trim();
                    if (next && next !== detail.name) renameActiveResume(detail.name, next);
                    setEditingHeaderName(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingHeaderName(false);
                  }}
                />
              ) : (
                <h2
                  className="editable-resume-name"
                  onClick={() => {
                    setHeaderNameDraft(detail.name);
                    setEditingHeaderName(true);
                  }}
                >
                  {detail.name}
                </h2>
              )}
              <div className="spacer" />
              <button className="header-btn" type="button" onClick={() => handleCopyResume(detail.name)}>复制简历</button>
              <button className="export-btn" type="button" onClick={handleExportPdf} disabled={exportingPdf}>
                {exportingPdf ? '导出中...' : '导出 PDF'}
              </button>
            </header>

            <div className="main-body" ref={mainBodyRef}>
              <div ref={editorPanelRef} className="editor-panel" style={{ width: editorWidth, minWidth: 280 }}>
                {editorSectionIds.map((sectionId) => {
                  const section = content.sections[sectionId];
                  if (!section) return null;
                  const special = isSpecialSectionId(sectionId);
                  const title = special && (sectionId === 'name' || sectionId === 'contact')
                    ? displaySpecialTitle(sectionId)
                    : section.title;

                  return (
                    <SectionEditor
                      key={sectionId}
                      section={section}
                      displayTitle={title}
                      editableTitle={!special}
                      canDelete={!special}
                      canDrag={!special}
                      isPhoto={sectionId === 'photo'}
                      syncEpoch={syncEpoch}
                      dragState={
                        draggingSection === sectionId
                          ? 'dragging'
                          : dropHint?.target === sectionId
                            ? `drop-${dropHint.position}` as const
                            : undefined
                      }
                      onContentChange={handleSectionContentChange}
                      onTitleChange={handleTitleChange}
                      onAddAbove={() => handleAddSection(sectionId, 'above')}
                      onAddBelow={() => handleAddSection(sectionId, 'below')}
                      onDelete={() => handleDeleteSection(sectionId)}
                      onDragStart={() => {
                        draggedSectionRef.current = sectionId;
                        setDraggingSection(sectionId);
                        setDropHint(null);
                      }}
                      onDragOver={(position) => {
                        const draggedId = draggedSectionRef.current;
                        if (!draggedId || draggedId === sectionId || isSpecialSectionId(sectionId)) {
                          setDropHint(null);
                          return;
                        }
                        setDropHint({ target: sectionId, position });
                      }}
                      onDragLeave={() => setDropHint((prev) => (prev?.target === sectionId ? null : prev))}
                      onDragEnd={resetSectionDrag}
                      onDrop={(position) => handleDropOnSection(sectionId, position)}
                    />
                  );
                })}
              </div>

              <div
                className="split-divider"
                onMouseDown={(e) => {
                  e.preventDefault();
                  draggingDividerRef.current = true;
                  document.body.style.cursor = 'col-resize';
                  document.body.style.userSelect = 'none';
                }}
              />

              <div className="preview-panel">
                <ResumePreview templateHtml={detail.template_html} content={content} />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">选择一份简历开始编辑</div>
        )}
      </main>

      {showNewDialog && (
        <div className="dialog-overlay" onClick={() => setShowNewDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>新建简历</h3>
            <input
              placeholder="简历名称（如：投字节算法）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="dialog-actions">
              <button type="button" onClick={() => setShowNewDialog(false)}>取消</button>
              <button type="button" className="primary" onClick={handleCreate}>创建</button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="dialog-overlay" onClick={() => setRenameTarget(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>更改简历名</h3>
            <input
              placeholder="新的简历名称"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await renameActiveResume(renameTarget, renameName);
                  setRenameTarget(null);
                }
              }}
              autoFocus
            />
            <div className="dialog-actions">
              <button type="button" onClick={() => setRenameTarget(null)}>取消</button>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  await renameActiveResume(renameTarget, renameName);
                  setRenameTarget(null);
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
