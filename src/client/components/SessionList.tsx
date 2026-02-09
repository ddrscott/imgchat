import { useState } from 'hono/jsx/dom';
import type { Session } from '../hooks/useSession';

interface SessionListProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onArchive: (id: string, archived: boolean) => void;
}

// Archive icon SVG
const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

// Unarchive icon SVG
const UnarchiveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <polyline points="12 17 12 11" />
    <polyline points="9 14 12 11 15 14" />
  </svg>
);

export function SessionList({ sessions, currentSessionId, onSelect, onDelete, onCreate, onArchive }: SessionListProps) {
  const [showArchived, setShowArchived] = useState(false);

  const activeSessions = sessions.filter(s => !s.archived);
  const archivedSessions = sessions.filter(s => s.archived);
  const displaySessions = showArchived ? sessions : activeSessions;

  return (
    <div class="session-list">
      <div class="session-list-header">
        <button class="new-session-button" onClick={onCreate}>
          + New Chat
        </button>
      </div>
      <div class="session-list-items">
        {displaySessions.length === 0 ? (
          <div class="no-sessions">
            {showArchived ? 'No conversations' : 'No active conversations'}
          </div>
        ) : (
          displaySessions.map(session => (
            <div
              key={session.id}
              class={`session-item ${session.id === currentSessionId ? 'active' : ''} ${session.archived ? 'archived' : ''}`}
              onClick={() => onSelect(session.id)}
            >
              <div class="session-name">{session.name}</div>
              <div class="session-meta">
                {new Date(session.updated_at).toLocaleDateString()}
              </div>
              <div class="session-actions">
                <button
                  class="archive-session"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(session.id, !session.archived);
                  }}
                  title={session.archived ? 'Unarchive' : 'Archive'}
                >
                  {session.archived ? <UnarchiveIcon /> : <ArchiveIcon />}
                </button>
                <button
                  class="delete-session"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this conversation?')) {
                      onDelete(session.id);
                    }
                  }}
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {archivedSessions.length > 0 && (
        <div class="session-list-footer">
          <button
            class={`show-archived-sessions ${showArchived ? 'active' : ''}`}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? 'Hide' : 'Show'} {archivedSessions.length} archived
          </button>
        </div>
      )}
    </div>
  );
}
