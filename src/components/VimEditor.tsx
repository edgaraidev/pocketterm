import { useEffect, useMemo, useRef, useState } from 'react';

interface VimEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  onWriteOut?: (content: string) => boolean;
}

type VimMode = 'normal' | 'insert' | 'command';

export function VimEditor({
  filePath,
  initialContent,
  onSave,
  onCancel,
  onWriteOut,
}: VimEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [mode, setMode] = useState<VimMode>('normal');
  const [commandLine, setCommandLine] = useState('');
  const [commandPrefix, setCommandPrefix] = useState<':' | '/'>(':');
  const [transientStatus, setTransientStatus] = useState<string | null>(null);
  const [modified, setModified] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusTimer = useRef<number | null>(null);
  const preferredColumnRef = useRef<number | null>(null);
  const pendingNormalOpRef = useRef<'d' | 'y' | 'g' | 'c' | null>(null);
  const yankedLineRef = useRef('');
  const lastSearchPatternRef = useRef<string>('');
  const lastSearchDirRef = useRef<1 | -1>(1);
  const undoRef = useRef<{ content: string; caret: number; modified: boolean } | null>(null);
  const lastEditRef = useRef<'x' | 'dw' | 'dd' | 'p' | 'P' | 'D' | 'C' | 'cc' | 'cw' | 'o' | 'O' | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const showStatus = (msg: string) => {
    setTransientStatus(msg);
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => {
      setTransientStatus(null);
      statusTimer.current = null;
    }, 1800);
  };

  useEffect(() => {
    return () => {
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    };
  }, []);

  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const persistentStatus = mode === 'insert' ? '-- INSERT --' : '-- NORMAL --';
  const statusDisplay = mode === 'command'
    ? `${commandPrefix}${commandLine}`
    : (transientStatus ?? persistentStatus);

  const runCommand = () => {
    const cmd = commandLine.trim();
    const setCaret = (pos: number, maxLen?: number) => {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const upper = maxLen ?? el.value.length;
        const clamped = Math.max(0, Math.min(pos, upper));
        el.focus();
        el.setSelectionRange(clamped, clamped);
      });
    };

    if (commandPrefix === '/') {
      const pattern = cmd || lastSearchPatternRef.current;
      if (!pattern) {
        showStatus('Pattern not found: ');
        setMode('normal');
        setCommandLine('');
        return;
      }
      const from = (textareaRef.current?.selectionStart ?? 0) + 1;
      const idx = content.indexOf(pattern, Math.min(from, content.length));
      if (idx === -1) {
        showStatus(`Pattern not found: ${pattern}`);
      } else {
        setCaret(idx, content.length);
        lastSearchPatternRef.current = pattern;
        lastSearchDirRef.current = 1;
      }
      setMode('normal');
      setCommandLine('');
      return;
    }

    if (cmd === 'w') {
      if (onWriteOut) {
        const ok = onWriteOut(content);
        if (ok) {
          setModified(false);
          showStatus(`"${filePath}" ${lineCount}L written`);
        } else {
          showStatus('E212: Cannot open file for writing');
        }
      } else {
        onSave(content);
      }
      setMode('normal');
      setCommandLine('');
      return;
    }
    if (cmd === 'q') {
      if (modified) {
        showStatus('E37: No write since last change (add ! to override)');
        setMode('normal');
        setCommandLine('');
        return;
      }
      onCancel();
      return;
    }
    if (cmd === 'q!') {
      onCancel();
      return;
    }
    if (cmd === 'wq') {
      onSave(content);
      return;
    }
    if (cmd === 'x') {
      onSave(content);
      return;
    }
    showStatus(`Not an editor command: ${cmd}`);
    setMode('normal');
    setCommandLine('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const setCaret = (pos: number, maxLen?: number) => {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const upper = maxLen ?? el.value.length;
        const clamped = Math.max(0, Math.min(pos, upper));
        el.focus();
        el.setSelectionRange(clamped, clamped);
      });
    };

    const caret = () => textareaRef.current?.selectionStart ?? 0;
    const lineStartAt = (pos: number) => {
      const idx = content.lastIndexOf('\n', Math.max(0, pos - 1));
      return idx === -1 ? 0 : idx + 1;
    };
    const lineEndAt = (pos: number) => {
      const idx = content.indexOf('\n', pos);
      return idx === -1 ? content.length : idx;
    };
    const lineColumnAt = (pos: number) => pos - lineStartAt(pos);
    const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
    const nextWordStart = (pos: number) => {
      let i = Math.max(0, Math.min(pos, content.length));
      while (i < content.length && isWord(content[i])) i++;
      while (i < content.length && !isWord(content[i])) i++;
      return i;
    };
    const prevWordStart = (pos: number) => {
      let i = Math.max(0, Math.min(pos - 1, content.length - 1));
      while (i > 0 && !isWord(content[i])) i--;
      while (i > 0 && isWord(content[i - 1])) i--;
      return Math.max(0, i);
    };
    const endWord = (pos: number) => {
      let i = Math.max(0, Math.min(pos, content.length - 1));
      if (!isWord(content[i])) {
        while (i < content.length && !isWord(content[i])) i++;
      }
      while (i < content.length - 1 && isWord(content[i + 1])) i++;
      return i;
    };
    const saveUndo = (caretPos: number) => {
      undoRef.current = { content, caret: caretPos, modified };
    };
    const applyEdit = (updated: string, nextCaret: number, op?: typeof lastEditRef.current) => {
      setContent(updated);
      setModified(true);
      setCaret(nextCaret, updated.length);
      if (op) lastEditRef.current = op;
    };
    const moveVertical = (dir: -1 | 1) => {
      const pos = caret();
      const start = lineStartAt(pos);
      const end = lineEndAt(pos);
      const col = preferredColumnRef.current ?? lineColumnAt(pos);
      preferredColumnRef.current = col;

      if (dir === -1) {
        if (start === 0) return;
        const prevEnd = start - 1;
        const prevStart = lineStartAt(prevEnd);
        setCaret(Math.min(prevStart + col, prevEnd), content.length);
        return;
      }

      if (end >= content.length) return;
      const nextStart = end + 1;
      const nextEnd = lineEndAt(nextStart);
      setCaret(Math.min(nextStart + col, nextEnd), content.length);
    };

    if (mode === 'insert') {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMode('normal');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
      }
      return;
    }

    if (mode === 'normal') {
      const pos = caret();
      const start = lineStartAt(pos);
      const end = lineEndAt(pos);
      const pending = pendingNormalOpRef.current;
      if (pending === 'd' || pending === 'c') {
        e.preventDefault();
        pendingNormalOpRef.current = null;
        if (e.key === 'd') {
          saveUndo(pos);
          const deleteStart = start;
          const deleteEnd = end < content.length ? end + 1 : end;
          const updated = `${content.slice(0, deleteStart)}${content.slice(deleteEnd)}`;
          applyEdit(updated, Math.min(deleteStart, updated.length), 'dd');
          showStatus('1 line deleted');
          preferredColumnRef.current = null;
          return;
        }
        if (e.key === 'w') {
          saveUndo(pos);
          const target = nextWordStart(pos);
          const updated = `${content.slice(0, pos)}${content.slice(target)}`;
          applyEdit(updated, pos, pending === 'c' ? 'cw' : 'dw');
          if (pending === 'c') {
            setMode('insert');
          }
          preferredColumnRef.current = null;
          return;
        }
        if (pending === 'c' && e.key === 'c') {
          saveUndo(pos);
          const deleteStart = start;
          const deleteEnd = end;
          const updated = `${content.slice(0, deleteStart)}${content.slice(deleteEnd)}`;
          applyEdit(updated, Math.min(deleteStart, updated.length), 'cc');
          setMode('insert');
          preferredColumnRef.current = null;
          return;
        }
      } else if (pending === 'y') {
        e.preventDefault();
        pendingNormalOpRef.current = null;
        if (e.key === 'y') {
          yankedLineRef.current = end < content.length
            ? `${content.slice(start, end)}\n`
            : content.slice(start, end);
          showStatus('1 line yanked');
          preferredColumnRef.current = null;
          return;
        }
      } else if (pending === 'g') {
        e.preventDefault();
        pendingNormalOpRef.current = null;
        if (e.key === 'g') {
          setCaret(0, content.length);
          preferredColumnRef.current = null;
          return;
        }
      }

      if (e.key === 'i') {
        e.preventDefault();
        setMode('insert');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'a') {
        e.preventDefault();
        const pos = Math.min(caret() + 1, content.length);
        setMode('insert');
        setCaret(pos, content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'A') {
        e.preventDefault();
        const pos = lineEndAt(caret());
        setMode('insert');
        setCaret(pos, content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'o') {
        e.preventDefault();
        const pos = caret();
        const lineEnd = content.indexOf('\n', pos);
        const end = lineEnd === -1 ? content.length : lineEnd;
        const insertAt = end + 1;
        const updated = end === content.length
          ? `${content}\n`
          : `${content.slice(0, insertAt)}\n${content.slice(insertAt)}`;
        applyEdit(updated, insertAt, 'o');
        setMode('insert');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'O') {
        e.preventDefault();
        const pos = caret();
        const start = lineStartAt(pos);
        const updated = `${content.slice(0, start)}\n${content.slice(start)}`;
        applyEdit(updated, start, 'O');
        setMode('insert');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setCaret(caret() - 1, content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault();
        setCaret(caret() + 1, content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveVertical(1);
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveVertical(-1);
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        setCaret(lineStartAt(caret()), content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === '$') {
        e.preventDefault();
        setCaret(lineEndAt(caret()), content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'x') {
        e.preventDefault();
        const pos = caret();
        if (pos < content.length) {
          saveUndo(pos);
          const updated = `${content.slice(0, pos)}${content.slice(pos + 1)}`;
          applyEdit(updated, pos, 'x');
        }
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'p') {
        e.preventDefault();
        const yanked = yankedLineRef.current;
        if (!yanked) return;
        const pos = caret();
        saveUndo(pos);
        const end = lineEndAt(pos);
        const insertAt = end < content.length ? end + 1 : end;
        const updated = `${content.slice(0, insertAt)}${yanked}${content.slice(insertAt)}`;
        applyEdit(updated, insertAt, 'p');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'P') {
        e.preventDefault();
        const yanked = yankedLineRef.current;
        if (!yanked) return;
        const pos = caret();
        saveUndo(pos);
        const insertAt = lineStartAt(pos);
        const updated = `${content.slice(0, insertAt)}${yanked}${content.slice(insertAt)}`;
        applyEdit(updated, insertAt, 'P');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'D') {
        e.preventDefault();
        const pos = caret();
        saveUndo(pos);
        const end = lineEndAt(pos);
        const updated = `${content.slice(0, pos)}${content.slice(end)}`;
        applyEdit(updated, pos, 'D');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'C') {
        e.preventDefault();
        const pos = caret();
        saveUndo(pos);
        const end = lineEndAt(pos);
        const updated = `${content.slice(0, pos)}${content.slice(end)}`;
        applyEdit(updated, pos, 'C');
        setMode('insert');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'u') {
        e.preventDefault();
        const undo = undoRef.current;
        if (!undo) return;
        setContent(undo.content);
        setModified(undo.modified);
        setCaret(undo.caret, undo.content.length);
        undoRef.current = null;
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'w') {
        e.preventDefault();
        setCaret(nextWordStart(pos), content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'b') {
        e.preventDefault();
        setCaret(prevWordStart(pos), content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'e') {
        e.preventDefault();
        setCaret(endWord(pos), content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'c') {
        e.preventDefault();
        pendingNormalOpRef.current = 'c';
        preferredColumnRef.current = null;
        return;
      }
      if (e.key === '/' ) {
        e.preventDefault();
        setCommandPrefix('/');
        setCommandLine('');
        setMode('command');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        const pattern = lastSearchPatternRef.current;
        if (!pattern) return;
        const direction = e.key === 'n' ? lastSearchDirRef.current : (lastSearchDirRef.current === 1 ? -1 : 1);
        const current = caret();
        let idx = -1;
        if (direction === 1) {
          idx = content.indexOf(pattern, Math.min(current + 1, content.length));
        } else {
          idx = content.lastIndexOf(pattern, Math.max(0, current - 1));
        }
        if (idx === -1) {
          showStatus(`Pattern not found: ${pattern}`);
          return;
        }
        setCaret(idx, content.length);
        return;
      }
      if (e.key === '.') {
        e.preventDefault();
        const op = lastEditRef.current;
        if (!op) return;
        const pos = caret();
        const start = lineStartAt(pos);
        const end = lineEndAt(pos);
        saveUndo(pos);
        if (op === 'x' && pos < content.length) {
          applyEdit(`${content.slice(0, pos)}${content.slice(pos + 1)}`, pos, 'x');
          return;
        }
        if (op === 'dw' || op === 'cw') {
          const target = nextWordStart(pos);
          applyEdit(`${content.slice(0, pos)}${content.slice(target)}`, pos, op);
          if (op === 'cw') setMode('insert');
          return;
        }
        if (op === 'dd') {
          const deleteEnd = end < content.length ? end + 1 : end;
          applyEdit(`${content.slice(0, start)}${content.slice(deleteEnd)}`, Math.min(start, content.length), 'dd');
          return;
        }
        if (op === 'cc') {
          applyEdit(`${content.slice(0, start)}${content.slice(end)}`, start, 'cc');
          setMode('insert');
          return;
        }
        if (op === 'D' || op === 'C') {
          applyEdit(`${content.slice(0, pos)}${content.slice(end)}`, pos, op);
          if (op === 'C') setMode('insert');
          return;
        }
        if ((op === 'p' || op === 'P') && yankedLineRef.current) {
          if (op === 'p') {
            const insertAt = end < content.length ? end + 1 : end;
            applyEdit(`${content.slice(0, insertAt)}${yankedLineRef.current}${content.slice(insertAt)}`, insertAt, 'p');
          } else {
            const insertAt = start;
            applyEdit(`${content.slice(0, insertAt)}${yankedLineRef.current}${content.slice(insertAt)}`, insertAt, 'P');
          }
          return;
        }
        if (op === 'o') {
          const insertAt = end < content.length ? end + 1 : end + 1;
          const updated = end === content.length
            ? `${content}\n`
            : `${content.slice(0, insertAt)}\n${content.slice(insertAt)}`;
          applyEdit(updated, insertAt, 'o');
          setMode('insert');
          return;
        }
        if (op === 'O') {
          applyEdit(`${content.slice(0, start)}\n${content.slice(start)}`, start, 'O');
          setMode('insert');
          return;
        }
        return;
      }
      if (e.key === 'G') {
        e.preventDefault();
        setCaret(content.length, content.length);
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      if (e.key === 'd' || e.key === 'y' || e.key === 'g' || e.key === 'c') {
        e.preventDefault();
        pendingNormalOpRef.current = e.key as 'd' | 'y' | 'g' | 'c';
        preferredColumnRef.current = null;
        return;
      }
      if (e.key === ':') {
        e.preventDefault();
        setCommandPrefix(':');
        setCommandLine('');
        setMode('command');
        preferredColumnRef.current = null;
        pendingNormalOpRef.current = null;
        return;
      }
      // In normal mode, ignore all other key input.
      e.preventDefault();
      return;
    }

    // Command mode: capture command line text manually.
    if (e.key === 'Escape') {
      e.preventDefault();
      setMode('normal');
      setCommandLine('');
      setCommandPrefix(':');
      pendingNormalOpRef.current = null;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      setCommandLine((prev) => prev.slice(0, -1));
      return;
    }
    if (e.key.length === 1) {
      e.preventDefault();
      setCommandLine((prev) => prev + e.key);
      return;
    }
    e.preventDefault();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none"
      style={{ background: '#111', fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
    >
      <div className="px-2 py-1 text-sm border-b border-[#2f2f2f]" style={{ color: '#9cdcfe' }}>
        "{filePath}" {lineCount}L {modified ? '[+] ' : ''}| mode: {mode}
      </div>

      <textarea
        ref={textareaRef}
        value={content}
        readOnly={mode !== 'insert'}
        onKeyDown={handleKeyDown}
        onChange={(e) => {
          if (mode !== 'insert') return;
          undoRef.current = { content, caret: e.target.selectionStart, modified };
          setContent(e.target.value);
          if (!modified) setModified(true);
        }}
        className="flex-1 min-h-0 w-full resize-none focus:outline-none px-2 py-1"
        style={{
          background: '#111',
          color: '#d4d4d4',
          fontSize: '14px',
          lineHeight: '1.4',
          caretColor: mode === 'insert' ? '#d4d4d4' : 'transparent',
          tabSize: 8,
          fontFamily: 'inherit',
        }}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />

      <div
        className="px-2 py-1 text-sm border-t border-[#2f2f2f] flex items-center justify-between"
        style={{ color: '#d4d4d4' }}
      >
        <span>{statusDisplay}</span>
        <span style={{ color: '#777' }}>h/j/k/l w/b/e 0/$ gg/G x dd dw cc cw yy p/P u . C D  i/a/A/o/O  / n N  :w :q :q! :wq</span>
      </div>
    </div>
  );
}
