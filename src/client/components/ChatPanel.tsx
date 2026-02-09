import { useState, useRef, useEffect } from 'hono/jsx/dom';
import type { Session, Message, DebugInfo } from '../hooks/useSession';
import type { Settings } from '../hooks/useSettings';

interface ChatPanelProps {
  session: Session | null;
  generating: boolean;
  generatingPrompt: string | null;
  selectedImages: string[];
  debugInfo: Record<string, DebugInfo>;
  settings: Settings;
  onUpdateSettings: (settings: Partial<Settings>) => void;
  onGenerate: (prompt: string, mode: 'new' | 'edit', selectedImages?: string[]) => void;
  onRename: (name: string) => void;
  onToggleSelect: (xUrl: string) => void;
  onBranch: (message: Message) => void;
  onClearSelection: () => void;
  onRetry: (messageId: string) => void;
  onDismiss: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}

// Aspect ratio presets
const ASPECT_RATIOS = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '3:2', width: 1024, height: 683 },
  { label: '2:3', width: 683, height: 1024 },
  { label: '4:3', width: 1024, height: 768 },
  { label: '3:4', width: 768, height: 1024 },
  { label: '16:9', width: 1280, height: 720 },
  { label: '9:16', width: 720, height: 1280 },
  { label: '21:9', width: 1280, height: 548 },
];

// Branch/fork icon SVG
const BranchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

// Debug/code icon SVG
const DebugIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);


// Retry/regenerate icon SVG
const RetryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

// X/dismiss icon SVG
const DismissIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// Trash icon SVG
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

// Copy icon SVG
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

// Spinner component
const Spinner = () => (
  <div class="spinner" />
);

export function ChatPanel({
  session,
  generating,
  generatingPrompt,
  selectedImages,
  debugInfo,
  settings,
  onUpdateSettings,
  onGenerate,
  onRename,
  onToggleSelect,
  onBranch,
  onClearSelection,
  onRetry,
  onDismiss,
  onDelete,
}: ChatPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [showDebug, setShowDebug] = useState<string | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [showGenSettings, setShowGenSettings] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mode is derived from selection state
  const isEditMode = selectedImages.length > 0;

  // Auto-scroll to bottom when messages change or generating
  const messages = session?.messages || [];

  // Scroll to bottom on initial load (instant) and on new messages (smooth)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      isInitialMount.current = false;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, generating]);

  // Reset initial mount flag when session changes
  useEffect(() => {
    isInitialMount.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [session?.id]);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (prompt.trim() && !generating) {
      onGenerate(prompt.trim(), isEditMode ? 'edit' : 'new', selectedImages);
      setPrompt('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e);
    }
  };

  const handleBranch = (msg: Message) => {
    onBranch(msg);
  };

  const handleCopyPrompt = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.prompt);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleRenameClick = () => {
    setRenameValue(session?.name || '');
    setShowRename(true);
  };

  const handleRenameSubmit = (e: Event) => {
    e.preventDefault();
    if (renameValue.trim()) {
      onRename(renameValue.trim());
      setShowRename(false);
    }
  };

  const togglePromptExpand = (msgId: string) => {
    setExpandedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  // Build a map of x_url to image_path for selected preview
  const xUrlToPath = new Map<string, string>();
  messages.forEach(msg => {
    if (msg.x_url && msg.image_path) {
      xUrlToPath.set(msg.x_url, msg.image_path);
    }
  });

  if (!session) {
    return (
      <div class="chat-panel empty">
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <p>Select a conversation or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div class="chat-panel">
      <div class="chat-header">
        <h2 class="session-title" onClick={handleRenameClick} title="Click to rename">
          {session.name}
        </h2>
      </div>

      <div class="chat-messages">
        {messages.length === 0 && !generating && (
          <div class="empty-state">
            <div class="empty-icon">🎨</div>
            <p>Describe an image to get started</p>
          </div>
        )}
        {messages.map((msg) => {
          const isPending = msg.status === 'pending';
          const isFailed = msg.status === 'failed';
          const isSuccess = !isPending && !isFailed;
          const isSelected = msg.x_url && selectedImages.includes(msg.x_url);

          return (
            <div
              key={msg.id}
              class={`message-card ${msg.is_edit ? 'edit' : 'new'} ${isSelected ? 'selected' : ''} ${isPending ? 'pending' : ''} ${isFailed ? 'failed' : ''}`}
            >
              {/* Image container with inset checkbox */}
              <div class="message-image-container">
                {/* Checkbox overlaid on image */}
                {msg.x_url && isSuccess && (
                  <label class="message-checkbox-label">
                    <input
                      type="checkbox"
                      class="message-checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(msg.x_url!)}
                    />
                    <span class="checkbox-visual" />
                  </label>
                )}
                {/* Pending state - show spinner */}
                {isPending && (
                  <div class="message-spinner">
                    <Spinner />
                  </div>
                )}
                {/* Failed state - show error */}
                {isFailed && (
                  <div class="message-error">
                    <span class="error-text">{msg.error || 'Generation failed'}</span>
                  </div>
                )}
                {/* Success state - show image */}
                {msg.image_path && isSuccess && (
                  <img
                    src={`/${msg.image_path}`}
                    alt={msg.prompt}
                    class="message-image"
                    loading="lazy"
                    onClick={() => {
                      setLightboxImage(`/${msg.image_path}`);
                      setLightboxZoom(1);
                      setLightboxPan({ x: 0, y: 0 });
                    }}
                  />
                )}
              </div>

              {/* Prompt text */}
              <div
                class={`message-prompt ${expandedPrompts.has(msg.id) ? 'expanded' : ''}`}
                onClick={() => togglePromptExpand(msg.id)}
              >
                {msg.prompt}
              </div>

              {/* Meta row with inline action buttons */}
              <div class="message-meta">
                <span class="message-type">{msg.is_edit ? 'edit' : 'new'}</span>
                {isPending && <span>generating...</span>}
                {isFailed && <span class="error-label">failed</span>}
                {msg.generation_time_ms && isSuccess && (
                  <span>{(msg.generation_time_ms / 1000).toFixed(1)}s</span>
                )}

                {/* Action buttons inline */}
                <div class="message-actions">
                  {/* Failed: show retry and dismiss */}
                  {isFailed && (
                    <>
                      <button
                        class="retry-btn"
                        onClick={() => onRetry(msg.id)}
                        title="Retry"
                      >
                        <RetryIcon />
                      </button>
                      <button
                        class="dismiss-btn"
                        onClick={() => onDismiss(msg.id)}
                        title="Dismiss"
                      >
                        <DismissIcon />
                      </button>
                    </>
                  )}
                  {/* Success: show all actions */}
                  {isSuccess && (
                    <>
                      <button
                        class={`copy-btn ${copiedId === msg.id ? 'copied' : ''}`}
                        onClick={() => handleCopyPrompt(msg)}
                        title={copiedId === msg.id ? 'Copied!' : 'Copy prompt'}
                      >
                        <CopyIcon />
                      </button>
                      {debugInfo[msg.id] && (
                        <button
                          class="debug-btn"
                          onClick={() => setShowDebug(msg.id)}
                          title="View API request"
                        >
                          <DebugIcon />
                        </button>
                      )}
                      {msg.x_url && (
                        <button
                          class="branch-btn"
                          onClick={() => handleBranch(msg)}
                          title="Edit from this image"
                        >
                          <BranchIcon />
                        </button>
                      )}
                      {msg._params && (
                        <button
                          class="retry-btn"
                          onClick={() => onRetry(msg.id)}
                          title="Regenerate"
                        >
                          <RetryIcon />
                        </button>
                      )}
                      <button
                        class="delete-btn"
                        onClick={() => {
                          if (confirm('Delete this image?')) {
                            onDelete(msg.id);
                          }
                        }}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div class="chat-input-area">
        {/* Generation Settings Panel */}
        {showGenSettings && (
          <div class="gen-settings">
            <div class="gen-settings-row">
              <div class="gen-setting">
                <label>Aspect</label>
                <select
                  value={`${settings.width}x${settings.height}`}
                  onChange={(e) => {
                    const ratio = ASPECT_RATIOS.find(r => `${r.width}x${r.height}` === (e.target as HTMLSelectElement).value);
                    if (ratio) onUpdateSettings({ width: ratio.width, height: ratio.height });
                  }}
                >
                  {ASPECT_RATIOS.map(r => (
                    <option key={r.label} value={`${r.width}x${r.height}`}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div class="gen-setting">
                <label>Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => onUpdateSettings({ model: (e.target as HTMLSelectElement).value as Settings['model'] })}
                >
                  <option value="flux2klein">flux2klein</option>
                  <option value="flux2klein-9b">flux2klein-9b</option>
                  <option value="zimage-turbo">zimage-turbo</option>
                </select>
              </div>
              <div class="gen-setting">
                <label>Steps</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={settings.steps}
                  onChange={(e) => onUpdateSettings({ steps: parseInt((e.target as HTMLInputElement).value) || 4 })}
                />
              </div>
              <div class="gen-setting">
                <label>Guidance</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  value={settings.guidance}
                  onChange={(e) => onUpdateSettings({ guidance: parseFloat((e.target as HTMLInputElement).value) || 1.0 })}
                />
              </div>
            </div>
            <div class="gen-setting full-width">
              <label>Negative Prompt</label>
              <input
                type="text"
                value={settings.negativePrompt}
                onChange={(e) => onUpdateSettings({ negativePrompt: (e.target as HTMLInputElement).value })}
                placeholder="Things to avoid..."
              />
            </div>
          </div>
        )}

        <form class="chat-input" onSubmit={handleSubmit}>
          {selectedImages.length > 0 && (
            <div class="selected-preview">
              <span class="selected-count">{selectedImages.length} selected:</span>
              {selectedImages.map((xUrl) => {
                const imagePath = xUrlToPath.get(xUrl);
                return imagePath ? (
                  <div class="selected-preview-item" key={xUrl}>
                    <img src={`/${imagePath}`} alt="Selected" loading="lazy" />
                    <button
                      type="button"
                      class="remove-btn"
                      onClick={() => onToggleSelect(xUrl)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ) : null;
              })}
              <button type="button" class="clear-selection" onClick={onClearSelection}>
                clear all
              </button>
            </div>
          )}
          <div class={`input-wrapper ${showGenSettings ? 'expanded' : ''}`}>
            <button
              type="button"
              class={`settings-toggle ${showGenSettings ? 'active' : ''}`}
              onClick={() => setShowGenSettings(!showGenSettings)}
              title="Generation settings"
            >
              <span class="chevron">{showGenSettings ? '▼' : '▲'}</span>
            </button>
            {showGenSettings ? (
              <textarea
                value={prompt}
                onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
                onKeyDown={handleKeyDown}
                placeholder={isEditMode ? 'Describe changes...' : 'Describe an image...'}
                disabled={generating}
                rows={4}
              />
            ) : (
              <input
                type="text"
                value={prompt}
                onInput={(e) => setPrompt((e.target as HTMLInputElement).value)}
                onKeyDown={handleKeyDown}
                placeholder={isEditMode ? 'Describe changes...' : 'Describe an image...'}
                disabled={generating}
              />
            )}
            <button type="submit" disabled={generating || !prompt.trim()}>
              {generating ? '...' : (isEditMode ? 'Edit' : 'New')}
            </button>
          </div>
          <div class="input-hint">Ctrl+Enter to send</div>
        </form>
      </div>

      {/* Debug Modal */}
      {showDebug && debugInfo[showDebug] && (
        <div class="debug-overlay" onClick={() => setShowDebug(null)}>
          <div class="debug-panel" onClick={(e) => e.stopPropagation()}>
            <div class="debug-header">
              <h3>API Request</h3>
              <button class="close-button" onClick={() => setShowDebug(null)}>&times;</button>
            </div>
            <div class="debug-content">
              <div class="debug-field">
                <label>Endpoint:</label>
                <code>{debugInfo[showDebug].endpoint}</code>
              </div>
              <div class="debug-field">
                <label>Timestamp:</label>
                <code>{debugInfo[showDebug].timestamp}</code>
              </div>
              <div class="debug-field">
                <label>Payload:</label>
                <pre>{JSON.stringify(debugInfo[showDebug].payload, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRename && (
        <div class="debug-overlay" onClick={() => setShowRename(false)}>
          <div class="debug-panel rename-panel" onClick={(e) => e.stopPropagation()}>
            <div class="debug-header">
              <h3>Rename Chat</h3>
              <button class="close-button" onClick={() => setShowRename(false)}>&times;</button>
            </div>
            <form class="rename-form" onSubmit={handleRenameSubmit}>
              <input
                type="text"
                value={renameValue}
                onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
                placeholder="Chat name"
                autoFocus
              />
              <button type="submit">Save</button>
            </form>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          class="lightbox-overlay"
          onClick={() => setLightboxImage(null)}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setLightboxZoom(z => Math.min(Math.max(0.5, z * delta), 5));
          }}
        >
          <div class="lightbox-controls">
            <button onClick={(e) => { e.stopPropagation(); setLightboxZoom(z => Math.min(z * 1.2, 5)); }}>+</button>
            <button onClick={(e) => { e.stopPropagation(); setLightboxZoom(z => Math.max(z / 1.2, 0.5)); }}>−</button>
            <button onClick={(e) => { e.stopPropagation(); setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }}>Reset</button>
            <button onClick={(e) => { e.stopPropagation(); window.open(lightboxImage, '_blank'); }}>Open</button>
            <button onClick={() => setLightboxImage(null)}>&times;</button>
          </div>
          <div
            class="lightbox-image-container"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              if (lightboxZoom <= 1) return;
              const startX = e.clientX - lightboxPan.x;
              const startY = e.clientY - lightboxPan.y;
              const handleMove = (moveE: MouseEvent) => {
                setLightboxPan({ x: moveE.clientX - startX, y: moveE.clientY - startY });
              };
              const handleUp = () => {
                window.removeEventListener('mousemove', handleMove);
                window.removeEventListener('mouseup', handleUp);
              };
              window.addEventListener('mousemove', handleMove);
              window.addEventListener('mouseup', handleUp);
            }}
            onTouchStart={(e) => {
              if (lightboxZoom <= 1 || e.touches.length !== 1) return;
              const touch = e.touches[0];
              const startX = touch.clientX - lightboxPan.x;
              const startY = touch.clientY - lightboxPan.y;
              const handleMove = (moveE: TouchEvent) => {
                if (moveE.touches.length !== 1) return;
                const t = moveE.touches[0];
                setLightboxPan({ x: t.clientX - startX, y: t.clientY - startY });
              };
              const handleEnd = () => {
                window.removeEventListener('touchmove', handleMove);
                window.removeEventListener('touchend', handleEnd);
              };
              window.addEventListener('touchmove', handleMove);
              window.addEventListener('touchend', handleEnd);
            }}
          >
            <img
              src={lightboxImage}
              alt="Preview"
              style={{
                transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                cursor: lightboxZoom > 1 ? 'grab' : 'zoom-in',
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (lightboxZoom === 1) {
                  setLightboxZoom(2);
                } else {
                  setLightboxZoom(1);
                  setLightboxPan({ x: 0, y: 0 });
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
