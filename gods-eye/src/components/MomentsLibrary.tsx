/**
 * MomentsLibrary — full-height right-panel replacement for ContextInspector.
 *
 * Features:
 *  • Live search (label + description + tags)
 *  • Click-to-edit inline description textarea (saves on blur)
 *  • Tag pills with add / remove (saves immediately)
 *  • Jump-to-moment and delete buttons
 */

import { useMemo, useState, useRef } from 'react';
import type { SavedMoment } from '../App';
import {
  SURFACE_1, SURFACE_2, BORDER,
  TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY,
  ACCENT,
} from '../tokens';

const TEXT_MAIN  = TEXT_PRIMARY;
const TEXT_MUTED = TEXT_SECONDARY;
const PANEL_BG   = SURFACE_1;

interface MomentsLibraryProps {
  savedMoments:    SavedMoment[];
  onClose:         () => void;
  onRestoreMoment: (moment: SavedMoment) => void;
  onDeleteMoment:  (id: string) => void;
  onEditMoment:    (id: string, updates: Partial<Pick<SavedMoment, 'description' | 'tags'>>) => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)  return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function MomentsLibrary({
  savedMoments, onClose, onRestoreMoment, onDeleteMoment, onEditMoment,
}: MomentsLibraryProps) {
  const [search, setSearch] = useState('');
  const [newTag, setNewTag] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedMoments;
    return savedMoments.filter((m) =>
      m.label.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [savedMoments, search]);

  const addTag = (id: string) => {
    const tag = (newTag[id] ?? '').trim();
    if (!tag) return;
    const moment = savedMoments.find((m) => m.id === id);
    if (!moment) return;
    if (moment.tags.includes(tag)) return;
    onEditMoment(id, { tags: [...moment.tags, tag] });
    setNewTag((prev) => ({ ...prev, [id]: '' }));
  };

  const removeTag = (id: string, tag: string) => {
    const moment = savedMoments.find((m) => m.id === id);
    if (!moment) return;
    onEditMoment(id, { tags: moment.tags.filter((t) => t !== tag) });
  };

  return (
    <div style={{
      width: 300, minWidth: 300,
      background: SURFACE_2,
      borderLeft: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      height: '100%',
    }}>

      {/* ---- Header ---- */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔖</span>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: TEXT_MAIN, margin: 0 }}>
              Moments Library
            </h2>
          </div>
          <button
            onClick={onClose}
            title="Back to Match Insights"
            style={{
              background: 'none', border: `1px solid ${BORDER}`,
              borderRadius: 5, color: TEXT_MUTED, fontSize: 11,
              padding: '3px 8px', cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#64748b';
              (e.currentTarget as HTMLButtonElement).style.color = TEXT_MAIN;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
              (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED;
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search label, description, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: PANEL_BG, border: `1px solid ${BORDER}`,
            borderRadius: 6, color: TEXT_MAIN,
            fontSize: 12, padding: '7px 10px',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => (e.target.style.borderColor = ACCENT)}
          onBlur={(e) => (e.target.style.borderColor = BORDER)}
        />
      </div>

      {/* ---- Moment count ---- */}
      <div style={{
        padding: '8px 16px', fontSize: 11, color: TEXT_MUTED,
        borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
      }}>
        {filtered.length === savedMoments.length
          ? `${savedMoments.length} saved moment${savedMoments.length !== 1 ? 's' : ''}`
          : `${filtered.length} of ${savedMoments.length} shown`}
      </div>

      {/* ---- List ---- */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

        {savedMoments.length === 0 ? (
          <div style={{
            textAlign: 'center', paddingTop: 40,
            color: TEXT_TERTIARY, fontSize: 12,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔖</div>
            <p style={{ marginBottom: 6, color: TEXT_MUTED }}>No saved moments yet</p>
            <p style={{ fontSize: 11 }}>
              Use the bookmark button in the playback bar while watching a match to save interesting moments here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', paddingTop: 40,
            color: TEXT_TERTIARY, fontSize: 12,
          }}>
            <p style={{ color: TEXT_MUTED }}>No moments match "{search}"</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((m) => (
              <MomentCard
                key={m.id}
                moment={m}
                newTagValue={newTag[m.id] ?? ''}
                onNewTagChange={(v) => setNewTag((prev) => ({ ...prev, [m.id]: v }))}
                onAddTag={() => addTag(m.id)}
                onRemoveTag={(tag) => removeTag(m.id, tag)}
                onEditDescription={(desc) => onEditMoment(m.id, { description: desc })}
                onRestore={() => onRestoreMoment(m)}
                onDelete={() => onDeleteMoment(m.id)}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

/* ---- Individual Moment Card ---- */

interface MomentCardProps {
  moment:           SavedMoment;
  newTagValue:      string;
  onNewTagChange:   (v: string) => void;
  onAddTag:         () => void;
  onRemoveTag:      (tag: string) => void;
  onEditDescription: (desc: string) => void;
  onRestore:        () => void;
  onDelete:         () => void;
}

function MomentCard({
  moment, newTagValue, onNewTagChange, onAddTag, onRemoveTag,
  onEditDescription, onRestore, onDelete,
}: MomentCardProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const handleDescBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val !== moment.description) onEditDescription(val);
    setEditingDesc(false);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); onAddTag(); }
    if (e.key === 'Escape') { setShowTagInput(false); onNewTagChange(''); }
  };

  const dateLabel = moment.dateFrom === moment.dateTo
    ? moment.dateFrom
    : `${moment.dateFrom} – ${moment.dateTo}`;

  return (
    <div style={{
      background: PANEL_BG,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: '10px 12px',
    }}>
      {/* Top row: label + delete */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: TEXT_MAIN,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {moment.label}
          </div>
          <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
            {moment.map} · {dateLabel} · {relativeTime(moment.savedAt)}
          </div>
        </div>
        <button
          onClick={onDelete}
          title="Delete moment"
          style={{
            background: 'none', border: 'none',
            color: TEXT_TERTIARY, cursor: 'pointer',
            fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = '#ef4444')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = TEXT_TERTIARY)}
        >
          ×
        </button>
      </div>

      {/* Description */}
      {editingDesc ? (
        <textarea
          autoFocus
          defaultValue={moment.description}
          placeholder="Add a note about this moment…"
          onBlur={handleDescBlur}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: SURFACE_2, border: `1px solid ${ACCENT}`,
            borderRadius: 5, color: TEXT_MAIN,
            fontSize: 11, padding: '5px 8px',
            resize: 'vertical', outline: 'none',
            lineHeight: 1.5,
          }}
        />
      ) : (
        <div
          onClick={() => setEditingDesc(true)}
          title="Click to add a note"
          style={{
            fontSize: 11,
            color: moment.description ? TEXT_MUTED : TEXT_TERTIARY,
            cursor: 'text',
            padding: '4px 0',
            borderBottom: `1px dashed ${BORDER}`,
            marginBottom: 6,
            minHeight: 20,
            lineHeight: 1.5,
          }}
        >
          {moment.description || 'Click to add a note…'}
        </div>
      )}

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 }}>
        {moment.tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'rgba(56,189,248,0.1)',
              border: '1px solid rgba(56,189,248,0.25)',
              borderRadius: 99, fontSize: 9,
              padding: '2px 6px', color: ACCENT,
            }}
          >
            {tag}
            <button
              onClick={() => onRemoveTag(tag)}
              style={{
                background: 'none', border: 'none',
                color: ACCENT, cursor: 'pointer',
                fontSize: 10, padding: 0, lineHeight: 1,
                opacity: 0.7,
              }}
            >
              ×
            </button>
          </span>
        ))}

        {/* Add tag */}
        {showTagInput ? (
          <input
            ref={tagInputRef}
            autoFocus
            value={newTagValue}
            onChange={(e) => onNewTagChange(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => {
              if (!newTagValue.trim()) { setShowTagInput(false); onNewTagChange(''); }
              else { onAddTag(); setShowTagInput(false); }
            }}
            placeholder="tag name…"
            style={{
              background: SURFACE_2, border: `1px solid ${ACCENT}`,
              borderRadius: 99, color: TEXT_MAIN,
              fontSize: 9, padding: '2px 7px',
              outline: 'none', width: 70,
            }}
          />
        ) : (
          <button
            onClick={() => { setShowTagInput(true); }}
            title="Add tag"
            style={{
              background: 'none',
              border: `1px dashed ${BORDER}`,
              borderRadius: 99,
              color: TEXT_TERTIARY,
              fontSize: 9, padding: '2px 6px',
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT;
              (e.currentTarget as HTMLButtonElement).style.color = ACCENT;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
              (e.currentTarget as HTMLButtonElement).style.color = TEXT_TERTIARY;
            }}
          >
            + tag
          </button>
        )}
      </div>

      {/* Jump button */}
      <button
        onClick={onRestore}
        style={{
          marginTop: 8, width: '100%',
          background: 'transparent',
          border: `1px solid ${BORDER}`,
          borderRadius: 4, color: ACCENT,
          fontSize: 11, padding: '5px 8px',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT)}
        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = BORDER)}
      >
        ▶ Jump to moment
      </button>
    </div>
  );
}
