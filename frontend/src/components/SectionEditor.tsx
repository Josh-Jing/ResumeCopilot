import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ResumeSection } from '../api/client';

export type DragState = 'dragging' | 'drop-above' | 'drop-below';

export interface SectionEditorProps {
  section: ResumeSection;
  displayTitle: string;
  editableTitle: boolean;
  canDelete: boolean;
  canDrag: boolean;
  isPhoto: boolean;
  syncEpoch: number;
  dragState?: DragState;
  onContentChange: (sectionId: string, content: string) => void;
  onTitleChange: (sectionId: string, title: string) => void;
  onAddAbove: () => void;
  onAddBelow: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (position: 'above' | 'below') => void;
  onDragLeave: () => void;
  onDragEnd: () => void;
  onDrop: (position: 'above' | 'below') => void;
}

function autoResizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function SectionEditorComponent({
  section,
  displayTitle,
  editableTitle,
  canDelete,
  canDrag,
  isPhoto,
  syncEpoch,
  dragState,
  onContentChange,
  onTitleChange,
  onAddAbove,
  onAddBelow,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
}: SectionEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [draftContent, setDraftContent] = useState(section.content);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(displayTitle);

  const lastSyncEpochRef = useRef(syncEpoch);
  useEffect(() => {
    if (lastSyncEpochRef.current === syncEpoch) return;
    lastSyncEpochRef.current = syncEpoch;
    setDraftContent(section.content);
    setTitleDraft(displayTitle);
    setEditingTitle(false);
  }, [syncEpoch, section.content, displayTitle]);

  useEffect(() => {
    setTitleDraft(displayTitle);
  }, [displayTitle]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (ta) autoResizeTextarea(ta);
  }, [draftContent]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const handleContentInput = useCallback((value: string) => {
    setDraftContent(value);
    onContentChange(section.id, value);
  }, [onContentChange, section.id]);

  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== displayTitle) {
      onTitleChange(section.id, trimmed);
    } else {
      setTitleDraft(displayTitle);
    }
  }, [displayTitle, onTitleChange, section.id, titleDraft]);

  const handlePhotoFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraftContent(reader.result);
        onContentChange(section.id, reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onContentChange, section.id]);

  const getDropPosition = useCallback((e: React.DragEvent<HTMLDivElement>): 'above' | 'below' => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
  }, []);

  const hasPhotoImage = draftContent.startsWith('data:image/');

  return (
    <div
      className={`section-editor ${dragState ? `is-${dragState}` : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(getDropPosition(e));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(getDropPosition(e));
      }}
    >
      <div className="field-header-row">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="field-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setTitleDraft(displayTitle);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <div
            className={`field-label ${editableTitle ? 'editable' : ''}`}
            onClick={() => editableTitle && setEditingTitle(true)}
          >
            {displayTitle}
            {editableTitle && <span className="edit-hint">✏</span>}
          </div>
        )}

        <div className="section-controls" onClick={(e) => e.stopPropagation()}>
          <button className="section-btn" title="在上方添加 Section" onClick={onAddAbove}>↑+</button>
          <button className="section-btn" title="在下方添加 Section" onClick={onAddBelow}>↓+</button>
          <button
            className="section-btn danger"
            title={canDelete ? '删除本 Section' : '必选 Section 不能删除'}
            disabled={!canDelete}
            onClick={onDelete}
          >
            ×
          </button>
          {canDrag && (
            <button
              className="section-btn drag-handle"
              title="拖动调整 Section 顺序"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                onDragStart();
              }}
              onDragEnd={onDragEnd}
            >
              ☰
            </button>
          )}
        </div>
      </div>

      {isPhoto ? (
        <div className="photo-upload-panel">
          <input
            ref={photoInputRef}
            className="photo-file-input"
            type="file"
            accept="image/*"
            onChange={handlePhotoFileChange}
          />
          <button
            type="button"
            className={`photo-upload-box ${hasPhotoImage ? 'has-photo' : ''}`}
            onClick={() => photoInputRef.current?.click()}
          >
            {hasPhotoImage ? (
              <img src={draftContent} alt="证件照预览" />
            ) : (
              <span>
                <strong>点击上传证件照</strong>
                <small>支持 PNG / JPG / WebP</small>
              </span>
            )}
          </button>
          {hasPhotoImage && (
            <button
              type="button"
              className="photo-clear-btn"
              onClick={() => {
                setDraftContent('');
                onContentChange(section.id, '');
              }}
            >
              移除照片
            </button>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="section-textarea"
          value={draftContent}
          onChange={(e) => handleContentInput(e.target.value)}
          placeholder="在此输入 Markdown..."
          rows={3}
        />
      )}
    </div>
  );
}

function propsAreEqual(prev: SectionEditorProps, next: SectionEditorProps): boolean {
  if (prev.syncEpoch !== next.syncEpoch) return false;
  if (prev.section.id !== next.section.id) return false;
  if (prev.section.title !== next.section.title) return false;
  if (prev.section.content !== next.section.content) return false;
  if (prev.displayTitle !== next.displayTitle) return false;
  if (prev.dragState !== next.dragState) return false;
  if (prev.editableTitle !== next.editableTitle) return false;
  if (prev.canDelete !== next.canDelete) return false;
  if (prev.canDrag !== next.canDrag) return false;
  if (prev.isPhoto !== next.isPhoto) return false;
  return true;
}

const SectionEditor = memo(SectionEditorComponent, propsAreEqual);
export default SectionEditor;
