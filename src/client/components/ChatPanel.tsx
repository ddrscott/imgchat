import { useState, useRef, useEffect } from 'hono/jsx/dom';
import type { Session, Message, DebugInfo } from '../hooks/useSession';
import type { Settings } from '../hooks/useSettings';
import { MODELS, getModelInfo } from '../models';

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
  onUpload: (file: File) => void;
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

// Find matching or closest aspect ratio label
function getAspectLabel(width: number, height: number): string {
  const match = ASPECT_RATIOS.find(r => r.width === width && r.height === height);
  if (match) return match.label;
  // Calculate ratio and find closest
  const ratio = width / height;
  let closest = ASPECT_RATIOS[0];
  let closestDiff = Math.abs(ratio - closest.width / closest.height);
  for (const r of ASPECT_RATIOS) {
    const diff = Math.abs(ratio - r.width / r.height);
    if (diff < closestDiff) {
      closest = r;
      closestDiff = diff;
    }
  }
  return `~${closest.label}`;
}

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

// Radio tower icon for Radio TTS models (Lucide)
const RadioIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" class="provider-icon">
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
    <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
  </svg>
);

// Cloud icon for Cloudflare models (Lucide)
const CloudIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" class="provider-icon">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </svg>
);

// Provider icon component
const ProviderIcon = ({ type }: { type: 'radio' | 'cloud' }) => {
  return type === 'cloud' ? <CloudIcon /> : <RadioIcon />;
};

// Upload icon SVG
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
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
  onUpload,
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
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      <div
        class={`chat-messages ${isDragging ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer?.files?.[0];
          if (file && file.type.match(/^image\/(png|jpeg|webp)$/)) {
            onUpload(file);
          }
        }}
      >
        {isDragging && (
          <div class="drop-overlay">
            <div class="drop-icon"><UploadIcon /></div>
            <p>Drop image to upload</p>
          </div>
        )}
        {messages.length === 0 && !generating && !isDragging && (
          <div class="empty-state">
            <div class="empty-icon">🎨</div>
            <p>Describe an image to get started</p>
          </div>
        )}
        {messages.map((msg) => {
          const isPending = msg.status === 'pending';
          const isFailed = msg.status === 'failed';
          const isSuccess = !isPending && !isFailed;
          const isSelected = msg.image_path && selectedImages.includes(msg.image_path);
          const isUploaded = msg.prompt.startsWith('[Uploaded');
          const messageType = isUploaded ? 'uploaded' : (msg.is_edit ? 'edit' : 'new');

          return (
            <div
              key={msg.id}
              class={`message-card ${messageType} ${isSelected ? 'selected' : ''} ${isPending ? 'pending' : ''} ${isFailed ? 'failed' : ''}`}
            >
              {/* Image container with inset checkbox */}
              <div class="message-image-container">
                {/* Checkbox overlaid on image */}
                {msg.image_path && isSuccess && (
                  <label class="message-checkbox-label">
                    <input
                      type="checkbox"
                      class="message-checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(msg.image_path!)}
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
                <span class="message-type">{messageType}</span>
                {isPending && <span>generating...</span>}
                {isFailed && <span class="error-label">failed</span>}
                {msg.generation_time_ms && isSuccess && (
                  <span>{(msg.generation_time_ms / 1000).toFixed(1)}s</span>
                )}

                {/* Action buttons inline */}
                <div class="message-actions">
                  {/* Pending: show dismiss to cancel stuck generations */}
                  {isPending && (
                    <button
                      class="dismiss-btn"
                      onClick={() => onDismiss(msg.id)}
                      title="Cancel"
                    >
                      <DismissIcon />
                    </button>
                  )}
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
                  onInput={(e) => {
                    const ratio = ASPECT_RATIOS.find(r => `${r.width}x${r.height}` === (e.target as HTMLSelectElement).value);
                    if (ratio) onUpdateSettings({ width: ratio.width, height: ratio.height });
                  }}
                >
                  {ASPECT_RATIOS.map(r => (
                    <option key={r.label} value={`${r.width}x${r.height}`}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div class="gen-setting model-setting">
                <label>Model</label>
                <div class="model-select-wrapper">
                  <span class="model-provider-icon">
                    <ProviderIcon type={getModelInfo(settings.model)?.providerIcon || 'radio'} />
                  </span>
                  <select
                    value={settings.model}
                    onInput={(e) => onUpdateSettings({ model: (e.target as HTMLSelectElement).value as Settings['model'] })}
                  >
                    <optgroup label="☁️ Cloudflare Workers AI">
                      {MODELS.filter(m => m.provider === 'cloudflare').map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="📡 Radio TTS (API Key)">
                      {MODELS.filter(m => m.provider === 'radio').map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div class="gen-setting">
                <label>Steps</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={settings.steps}
                  onInput={(e) => onUpdateSettings({ steps: parseInt((e.target as HTMLInputElement).value) || 4 })}
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
                  onInput={(e) => onUpdateSettings({ guidance: parseFloat((e.target as HTMLInputElement).value) || 1.0 })}
                />
              </div>
            </div>
            <div class="gen-setting full-width">
              <label>Negative Prompt</label>
              <input
                type="text"
                value={settings.negativePrompt}
                onInput={(e) => onUpdateSettings({ negativePrompt: (e.target as HTMLInputElement).value })}
                placeholder="Things to avoid..."
              />
            </div>
          </div>
        )}

        <form class="chat-input" onSubmit={handleSubmit}>
          {selectedImages.length > 0 && (
            <div class="selected-preview">
              <span class="selected-count">{selectedImages.length} selected:</span>
              {selectedImages.map((imagePath) => (
                <div class="selected-preview-item" key={imagePath}>
                  <img src={`/${imagePath}`} alt="Selected" loading="lazy" />
                  <button
                    type="button"
                    class="remove-btn"
                    onClick={() => onToggleSelect(imagePath)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
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
            <button
              type="button"
              class="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload image"
              disabled={generating}
            >
              <UploadIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  onUpload(file);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            {showGenSettings ? (
              <textarea
                value={prompt}
                onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
                onKeyDown={handleKeyDown}
                placeholder={isEditMode ? 'Describe changes...' : 'Describe an image...'}
                rows={4}
              />
            ) : (
              <input
                type="text"
                value={prompt}
                onInput={(e) => setPrompt((e.target as HTMLInputElement).value)}
                onKeyDown={handleKeyDown}
                placeholder={isEditMode ? 'Describe changes...' : 'Describe an image...'}
              />
            )}
            <button type="submit" disabled={!prompt.trim()}>
              {isEditMode ? 'Edit' : 'New'}
            </button>
          </div>
          <div class="input-hint">
            <span class="settings-preview" onClick={() => setShowGenSettings(true)} title="Click to change">
              {getModelInfo(settings.model)?.name || settings.model} · {getAspectLabel(settings.width, settings.height)}
            </span>
            <span class="hint-sep">·</span>
            <span>Ctrl+Enter to send</span>
          </div>
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
