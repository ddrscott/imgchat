import { render, useState, useEffect, useRef, useCallback } from 'hono/jsx/dom';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { useSession } from './hooks/useSession';
import { LoginPrompt } from './components/LoginPrompt';
import { SettingsPanel } from './components/SettingsPanel';
import { SessionList } from './components/SessionList';
import { ChatPanel } from './components/ChatPanel';

function App() {
  const { user, loading: authLoading } = useAuth();
  const [settings, updateSettings, settingsLoading] = useSettings();
  // Use ref to always get latest settings, avoiding stale closure issues
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const getSettings = useCallback(() => settingsRef.current, []);
  const session = useSession(getSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Spinning title indicator while generating
  const SPINNERS = ['◐', '◓', '◑', '◒'];
  const spinnerIndexRef = useRef(0);
  useEffect(() => {
    if (!session.generating) {
      document.title = 'imgchat';
      return;
    }

    const interval = setInterval(() => {
      spinnerIndexRef.current = (spinnerIndexRef.current + 1) % SPINNERS.length;
      document.title = `${SPINNERS[spinnerIndexRef.current]} imgchat`;
    }, 150);

    // Set initial spinner immediately
    document.title = `${SPINNERS[0]} imgchat`;

    return () => {
      clearInterval(interval);
      document.title = 'imgchat';
    };
  }, [session.generating]);

  // Parse session ID from URL (nanoid uses A-Za-z0-9_- alphabet)
  const getSessionIdFromUrl = () => {
    const match = window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  // Fetch sessions on auth, then select from URL if present
  useEffect(() => {
    if (user) {
      session.fetchSessions().then(() => {
        const urlSessionId = getSessionIdFromUrl();
        if (urlSessionId) {
          session.selectSession(urlSessionId);
        }
      });
    }
  }, [user]);

  // Update URL when session changes
  useEffect(() => {
    if (session.currentSession) {
      const newPath = `/s/${session.currentSession.id}`;
      if (window.location.pathname !== newPath) {
        window.history.pushState({}, '', newPath);
      }
    }
  }, [session.currentSession?.id]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const urlSessionId = getSessionIdFromUrl();
      if (urlSessionId && urlSessionId !== session.currentSession?.id) {
        session.selectSession(urlSessionId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [session.currentSession?.id]);

  // Show API key prompt if not set (after settings load)
  useEffect(() => {
    if (user && !settingsLoading && !settings.hasApiKey) {
      setShowSettings(true);
    }
  }, [user, settingsLoading, settings.hasApiKey]);

  // Loading state
  if (authLoading) {
    return (
      <div class="app loading">
        <div class="loading-spinner">Loading...</div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <LoginPrompt />;
  }

  // Close sidebar when selecting a session on mobile
  const handleSelectSession = (sessionId: string) => {
    session.selectSession(sessionId);
    setShowSidebar(false);
  };

  return (
    <div class="app">
      <header class="app-header">
        <div class="header-left">
          <button class="hamburger-btn" onClick={() => setShowSidebar(!showSidebar)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h1>imgchat</h1>
        </div>
        <div class="header-actions">
          <span class="user-email">{user.email}</span>
          <button class="settings-button" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      <main class="app-main">
        {showSidebar && <div class="sidebar-overlay" onClick={() => setShowSidebar(false)} />}
        <aside class={`sidebar ${showSidebar ? 'open' : ''}`}>
          <SessionList
            sessions={session.sessions}
            currentSessionId={session.currentSession?.id || null}
            onSelect={handleSelectSession}
            onDelete={session.deleteSession}
            onCreate={session.createSession}
            onArchive={session.archiveSession}
          />
        </aside>

        <section class="content">
          <ChatPanel
            session={session.currentSession}
            generating={session.generating}
            generatingPrompt={session.generatingPrompt}
            selectedImages={session.selectedImages}
            debugInfo={session.debugInfo}
            settings={settings}
            onUpdateSettings={updateSettings}
            onGenerate={session.generateImage}
            onRename={session.renameSession}
            onToggleSelect={session.toggleImageSelection}
            onBranch={session.branchFrom}
            onClearSelection={session.clearSelection}
            onRetry={session.retryMessage}
            onDismiss={session.dismissFailedMessage}
            onDelete={session.deleteMessage}
          />
        </section>
      </main>

      {session.error && (
        <div class="error-toast" onClick={() => session.clearError()}>
          {session.error}
          <button class="dismiss">&times;</button>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// Mount the app
const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
