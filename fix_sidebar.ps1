$filePath = "d:\player_data\gods-eye\src\components\Sidebar.tsx"
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

$oldSection = @'
/* ------------------------------------------------------------------ */
/*  UploadPanel — send a new .nakama-0 file to the backend ETL         */
/* ------------------------------------------------------------------ */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

function UploadPanel({ onUploadDone }: { onUploadDone?: () => void }) {
  const [open, setOpen]         = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [date, setDate]         = useState('');
  const [status, setStatus]     = useState<UploadState>('idle');
  const [message, setMessage]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!API_URL) return null;

  const canUpload = !!file && !!date && status !== 'uploading';

  const handleUpload = async () => {
    if (!file || !date) return;
    setStatus('uploading');
    setMessage('Uploading and processing…');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('date', date);
      const resp = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: form });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.detail ?? resp.statusText);
      const { rows, maps_processed } = json as { rows: number; maps_processed: string[] };
      setStatus('done');
      setMessage(`Done — ${rows.toLocaleString()} rows across ${maps_processed.join(', ')}`);
      setFile(null);
      setDate('');
      if (fileRef.current) fileRef.current.value = '';
      onUploadDone?.();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const statusColor: Record<UploadState, string> = {
    idle: TEXT_MUTED, uploading: ACCENT, done: '#4ade80', error: '#f87171',
  };

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', background: 'none', border: `1px solid ${BORDER}`,
          borderRadius: 6, color: TEXT_MUTED, cursor: 'pointer',
          padding: '6px 10px', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_MUTED; }}
      >
        <span>Upload new data</span>
        <span style={{ fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.5 }}>
            Select a <code style={{ color: ACCENT, fontSize: 10 }}>.nakama-0</code> file and the date it belongs to.
            The file will be processed and added to the live dataset automatically.
          </div>

          {/* File picker */}
          <div>
            <label style={labelStyle}>Raw file (.nakama-0)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".nakama-0"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setStatus('idle'); setMessage(''); }}
              style={{
                ...inputStyle,
                padding: '4px 6px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Date picker */}
          <div>
            <label style={labelStyle}>Date of this file</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setStatus('idle'); setMessage(''); }}
              style={inputStyle}
            />
          </div>

          {/* Upload button */}
          <button
            disabled={!canUpload}
            onClick={handleUpload}
            style={{
              background: canUpload ? ACCENT : BORDER,
              color: canUpload ? '#0f172a' : TEXT_MUTED,
              border: 'none', borderRadius: 6,
              padding: '7px 12px', fontSize: 12, fontWeight: 700,
              cursor: canUpload ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            {status === 'uploading' ? 'Processing…' : 'Upload & Process'}
          </button>

          {/* Status message */}
          {message && (
            <div style={{
              fontSize: 11, color: statusColor[status],
              padding: '6px 8px', borderRadius: 4,
              background: '#0f172a', border: `1px solid ${BORDER}`,
              lineHeight: 1.5,
            }}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
'@

$newSection = @'
/* ------------------------------------------------------------------ */
/*  UploadPanel - bulk upload .nakama-0 files to the backend ETL       */
/* ------------------------------------------------------------------ */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

function UploadPanel({ onUploadDone }: { onUploadDone?: () => void }) {
  const [open, setOpen]         = useState(false);
  const [files, setFiles]       = useState<File[]>([]);
  const [status, setStatus]     = useState<UploadState>('idle');
  const [message, setMessage]   = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!API_URL) return null;

  const canUpload = files.length > 0 && status !== 'uploading';

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...arr.filter((f) => !existing.has(f.name))];
    });
    setStatus('idle');
    setMessage('');
  };

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleUpload = async () => {
    if (!files.length) return;
    setStatus('uploading');
    setMessage(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const resp = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: form });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.detail ?? resp.statusText);
      const { files_processed, files_failed, total_rows, maps_updated, dates_updated, errors } =
        json as {
          files_processed: number; files_failed: number; total_rows: number;
          maps_updated: string[]; dates_updated: string[];
          errors: { filename: string; error: string }[];
        };
      const summary = [
        `${files_processed} file${files_processed !== 1 ? 's' : ''} processed`,
        `${total_rows.toLocaleString()} rows`,
        maps_updated.length ? `maps: ${maps_updated.join(', ')}` : '',
        dates_updated.length ? `dates: ${dates_updated.join(', ')}` : '',
      ].filter(Boolean).join(' · ');
      if (files_failed > 0) {
        const errList = errors.map((e) => `${e.filename}: ${e.error}`).join('; ');
        setStatus('error');
        setMessage(`${summary}\n${files_failed} failed: ${errList}`);
      } else {
        setStatus('done');
        setMessage(summary);
      }
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      if (files_processed > 0) onUploadDone?.();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const statusColor: Record<UploadState, string> = {
    idle: TEXT_MUTED, uploading: ACCENT, done: '#4ade80', error: '#f87171',
  };

  return (
    <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', background: 'none', border: `1px solid ${BORDER}`,
          borderRadius: 6, color: TEXT_MUTED, cursor: 'pointer',
          padding: '6px 10px', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_MUTED; }}
      >
        <span>Upload new data</span>
        <span style={{ fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.6 }}>
            Drop a folder of <code style={{ color: ACCENT, fontSize: 10 }}>.nakama-0</code> files or click to pick
            multiple files. <strong style={{ color: TEXT_MAIN }}>Dates are detected automatically</strong> from the
            data — no manual input needed.
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            style={{
              border: `2px dashed ${dragging ? ACCENT : BORDER}`,
              borderRadius: 8, padding: '14px 10px', textAlign: 'center',
              cursor: 'pointer', transition: 'border-color 0.15s',
              background: dragging ? 'rgba(56,189,248,0.05)' : 'transparent',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>&#128193;</div>
            <div style={{ fontSize: 11, color: dragging ? ACCENT : TEXT_MUTED }}>
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? 's' : ''} selected — click or drop more`
                : 'Click or drag-and-drop files here'}
            </div>
          </div>

          {/* Hidden multi-file input */}
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => addFiles(e.target.files)}
          />

          {/* File list */}
          {files.length > 0 && (
            <div style={{
              maxHeight: 120, overflowY: 'auto',
              background: '#0f172a', borderRadius: 6,
              border: `1px solid ${BORDER}`, padding: '4px 0',
            }}>
              {files.map((f) => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '3px 8px', fontSize: 10, color: TEXT_MUTED,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                    {f.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(f.name); }}
                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
                  >&#x2715;</button>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <button
            disabled={!canUpload}
            onClick={handleUpload}
            style={{
              background: canUpload ? ACCENT : BORDER,
              color: canUpload ? '#0f172a' : TEXT_MUTED,
              border: 'none', borderRadius: 6,
              padding: '7px 12px', fontSize: 12, fontWeight: 700,
              cursor: canUpload ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            {status === 'uploading'
              ? `Processing ${files.length} file${files.length > 1 ? 's' : ''}...`
              : `Upload & Process${files.length > 0 ? ` (${files.length})` : ''}`}
          </button>

          {/* Status message */}
          {message && (
            <div style={{
              fontSize: 11, color: statusColor[status],
              padding: '6px 8px', borderRadius: 4,
              background: '#0f172a', border: `1px solid ${BORDER}`,
              lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>
              {status === 'done' && '✓ '}{status === 'error' && '✗ '}{message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
'@

if ($content.Contains('send a new .nakama-0 file to the backend ETL')) {
    $newContent = $content.Replace($oldSection, $newSection)
    if ($newContent -ne $content) {
        [System.IO.File]::WriteAllText($filePath, $newContent, [System.Text.Encoding]::UTF8)
        "SUCCESS: File updated"
    } else {
        "WARN: Replacement string identical or not matched precisely"
        "Content length: $($content.Length)"
    }
} else {
    "ERROR: Old marker not found"
}
