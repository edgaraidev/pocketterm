import { useState, useEffect, useRef } from 'react';

interface NanoEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  onWriteOut?: (content: string) => boolean;
}

function ShortcutRow({ shortcuts }: { shortcuts: [string, string][] }) {
  return (
    <div className="flex" style={{ lineHeight: '1.35' }}>
      {shortcuts.map(([key, label]) => (
        <div key={key + label} className="flex-1 flex items-center min-w-0">
          <span
            className="px-0.5 font-bold whitespace-nowrap"
            style={{ background: '#d4d4d4', color: '#1e1e1e' }}
          >
            {key}
          </span>
          <span className="pl-1 truncate" style={{ color: '#999' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NanoEditor({
  filePath,
  initialContent,
  onSave,
  onCancel,
  onWriteOut,
}: NanoEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [modified, setModified] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusTimer = useRef<number>(0);

  useEffect(() => {
    // Small delay so the textarea is in the DOM before focusing
    const raf = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatusMsg(''), 2500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.ctrlKey) return;

    const key = e.key.toLowerCase();

    switch (key) {
      case 'x':
        e.preventDefault();
        onSave(content);
        return;

      case 'o':
        e.preventDefault();
        if (onWriteOut) {
          const ok = onWriteOut(content);
          if (ok) {
            const lines = content.split('\n').length;
            showStatus(`[ Wrote ${lines} line${lines !== 1 ? 's' : ''} ]`);
            setModified(false);
          } else {
            showStatus('[ Error writing — Permission denied ]');
          }
        } else {
          onSave(content);
        }
        return;

      // Prevent browser defaults on nano-mapped combos
      case 'g':
      case 'w':
      case 'j':
      case 'r':
      case 't':
      case 's':
        e.preventDefault();
        return;
    }
  };

  // Escape to cancel (exit without saving)
  useEffect(() => {
    const handleGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleGlobal);
    return () => window.removeEventListener('keydown', handleGlobal);
  }, [onCancel]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setCursorPos(e.target.selectionStart);
    if (!modified) setModified(true);
  };

  const updateCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPos(target.selectionStart);
  };

  const lineCount = content.split('\n').length;
  const clampedPos = Math.max(0, Math.min(cursorPos, content.length));
  const curLine = content.slice(0, clampedPos).split('\n').length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none"
      style={{ background: '#1e1e1e', fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
    >
      {/* ── Title bar (inverted) ── */}
      <div
        className="flex items-center px-2 text-sm shrink-0"
        style={{ background: '#d4d4d4', color: '#1e1e1e', lineHeight: '1.6' }}
      >
        <span className="whitespace-nowrap font-bold">  GNU nano 5.6.1</span>
        <span className="flex-1 text-center truncate px-4 font-bold">{filePath}</span>
        {modified && (
          <span className="whitespace-nowrap pr-2">Modified</span>
        )}
      </div>

      {/* ── Editor body ── */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        onSelect={updateCursor}
        onKeyDown={handleKeyDown}
        className="flex-1 min-h-0 w-full resize-none focus:outline-none px-1 py-0"
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          fontSize: '14px',
          lineHeight: '1.4',
          caretColor: '#d4d4d4',
          tabSize: 8,
          fontFamily: 'inherit',
        }}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />

      {/* ── Status bar ── */}
      <div
        className="shrink-0 flex items-center justify-center text-sm"
        style={{ height: '1.6em', color: '#d4d4d4' }}
      >
        {statusMsg ? (
          <span
            className="px-2 font-bold"
            style={{ background: '#d4d4d4', color: '#1e1e1e' }}
          >
            {statusMsg}
          </span>
        ) : (
          <span style={{ color: '#666' }}>
            [ line {curLine}/{lineCount} ]
          </span>
        )}
      </div>

      {/* ── Shortcut bars (two rows) ── */}
      <div className="shrink-0 text-xs px-1" style={{ background: '#1e1e1e' }}>
        <ShortcutRow
          shortcuts={[
            ['^G', 'Help'],
            ['^O', 'Write Out'],
            ['^W', 'Where Is'],
            ['^K', 'Cut'],
            ['^J', 'Justify'],
            ['^C', 'Location'],
          ]}
        />
        <ShortcutRow
          shortcuts={[
            ['^X', 'Exit'],
            ['^R', 'Read File'],
            ['^\\', 'Replace'],
            ['^U', 'Paste'],
            ['^T', 'Execute'],
            ['^_', 'Go To Line'],
          ]}
        />
      </div>
    </div>
  );
}
