import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, RotateCw, FileText, FileDiff } from 'lucide-react';
import { getGitDiff } from '../api';

// --- Diff parsing types ---

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'hunk-header';
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffFile {
  filename: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

// --- Diff parser ---

function parseDiff(raw: string): DiffFile[] {
  if (!raw.trim()) return [];

  const files: DiffFile[] = [];
  const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split('\n');

    // Extract filename from the first line: "a/path b/path"
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    const filename = headerMatch ? headerMatch[2] : 'unknown';

    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;
    let additions = 0;
    let deletions = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Hunk header: @@ -old,count +new,count @@
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (hunkMatch) {
        currentHunk = {
          header: line,
          lines: [],
        };
        hunks.push(currentHunk);
        oldLine = parseInt(hunkMatch[1], 10);
        newLine = parseInt(hunkMatch[2], 10);

        currentHunk.lines.push({
          type: 'hunk-header',
          content: line,
        });
        continue;
      }

      if (!currentHunk) continue;

      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'added',
          content: line.slice(1),
          newLine: newLine,
        });
        newLine++;
        additions++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'removed',
          content: line.slice(1),
          oldLine: oldLine,
        });
        oldLine++;
        deletions++;
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLine: oldLine,
          newLine: newLine,
        });
        oldLine++;
        newLine++;
      }
      // Skip other lines (e.g., "\ No newline at end of file", index, ---, +++ headers)
    }

    if (hunks.length > 0) {
      files.push({ filename, hunks, additions, deletions });
    }
  }

  return files;
}

// --- Component ---

interface GitDiffViewProps {
  folder: string;
}

export default function GitDiffView({ folder }: GitDiffViewProps) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { diff } = await getGitDiff(folder);
      const parsed = parseDiff(diff);
      setFiles(parsed);
      // Expand all files by default
      setExpandedFiles(new Set(parsed.map(f => f.filename)));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch diff');
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  const toggleFile = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (expandedFiles.size === files.length) {
      setExpandedFiles(new Set());
    } else {
      setExpandedFiles(new Set(files.map(f => f.filename)));
    }
  };

  if (loading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
      }}>
        <RotateCw size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <div style={{ color: 'var(--danger)' }}>{error}</div>
        <button onClick={fetchDiff} style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          padding: '8px 16px',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
        }}>
          Retry
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'var(--text-muted)',
      }}>
        <FileText size={40} strokeWidth={1.5} />
        <div style={{ fontSize: 15, fontWeight: 500 }}>No changes detected</div>
        <div style={{ fontSize: 13 }}>The working directory is clean.</div>
        <button onClick={fetchDiff} style={{
          background: 'var(--bg-secondary, var(--surface))',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          padding: '6px 14px',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <RotateCw size={14} />
          Refresh
        </button>
      </div>
    );
  }

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '12px 16px' }}>
      {/* Summary bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        padding: '8px 12px',
        background: 'var(--bg-secondary, var(--surface))',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileDiff size={14} />
            <strong>{files.length}</strong> {files.length === 1 ? 'file' : 'files'} changed
          </span>
          <span className="diff-stat-added">+{totalAdditions}</span>
          <span className="diff-stat-removed">-{totalDeletions}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={toggleAll} style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 8px',
          }}>
            {expandedFiles.size === files.length ? 'Collapse all' : 'Expand all'}
          </button>
          <button onClick={fetchDiff} style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
          }} title="Refresh diff">
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      {/* File list */}
      {files.map((file) => (
        <div key={file.filename} style={{
          marginBottom: 8,
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          {/* File header */}
          <button
            onClick={() => toggleFile(file.filename)}
            className="diff-file-header"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {expandedFiles.has(file.filename) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span style={{
                fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {file.filename}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 12 }}>
              {file.additions > 0 && <span className="diff-stat-added">+{file.additions}</span>}
              {file.deletions > 0 && <span className="diff-stat-removed">-{file.deletions}</span>}
            </div>
          </button>

          {/* File diff content */}
          {expandedFiles.has(file.filename) && (
            <div className="diff-content">
              {file.hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx}>
                  {hunk.lines.map((line, lineIdx) => {
                    if (line.type === 'hunk-header') {
                      return (
                        <div key={lineIdx} className="diff-line diff-line-hunk">
                          <span className="diff-line-number" />
                          <span className="diff-line-number" />
                          <span className="diff-line-content">{line.content}</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={lineIdx}
                        className={`diff-line ${
                          line.type === 'added' ? 'diff-line-added' :
                          line.type === 'removed' ? 'diff-line-removed' :
                          ''
                        }`}
                      >
                        <span className="diff-line-number">
                          {line.type !== 'added' ? line.oldLine : ''}
                        </span>
                        <span className="diff-line-number">
                          {line.type !== 'removed' ? line.newLine : ''}
                        </span>
                        <span className="diff-line-content">
                          <span className="diff-line-prefix">
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                          </span>
                          {line.content}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
