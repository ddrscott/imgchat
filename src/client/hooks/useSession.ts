import { useState, useCallback } from 'hono/jsx/dom';
import type { Settings } from './useSettings';

export interface Message {
  id: string;
  prompt: string;
  image_path: string | null;
  x_url: string | null;
  is_edit: number;
  generation_time_ms: number | null;
  archived: number;
  created_at: string;
  // Client-side only fields for pending/failed states
  status?: 'pending' | 'success' | 'failed';
  error?: string;
  // Store generation params for retry
  _params?: {
    model: string;
    width: number;
    height: number;
    steps: number;
    guidance: number;
    negativePrompt: string;
    images: string[];
  };
}

export interface Session {
  id: string;
  name: string;
  settings: string;
  current_x_url: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

export interface DebugInfo {
  payload: Record<string, unknown>;
  endpoint: string;
  timestamp: string;
}

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  loading: boolean;
  generating: boolean;
  generatingPrompt: string | null; // Prompt currently being generated
  error: string | null;
  selectedImages: string[]; // Array of x_urls for multi-select editing
  debugInfo: Record<string, DebugInfo>; // Message ID -> debug info
}

export function useSession(getSettings: () => Settings) {
  const [state, setState] = useState<SessionState>({
    sessions: [],
    currentSession: null,
    loading: false,
    generating: false,
    generatingPrompt: null,
    error: null,
    selectedImages: [],
    debugInfo: {},
  });

  const fetchSessions = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const sessions = await response.json();
        setState(s => ({ ...s, sessions, loading: false, error: null }));
      } else {
        setState(s => ({ ...s, loading: false, error: 'Failed to fetch sessions' }));
      }
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: 'Network error' }));
    }
  }, []);

  const createSession = useCallback(async (name?: string) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || 'New Chat' }),
      });
      if (response.ok) {
        const session = await response.json();
        setState(s => ({
          ...s,
          sessions: [{ ...session, messages: [] }, ...s.sessions],
          currentSession: { ...session, messages: [] },
        }));
        return session;
      }
    } catch (e) {
      setState(s => ({ ...s, error: 'Failed to create session' }));
    }
    return null;
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    setState(s => ({ ...s, loading: true, selectedImages: [] })); // Clear selection when switching
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (response.ok) {
        const session = await response.json();
        setState(s => ({ ...s, currentSession: session, loading: false, error: null }));
      } else {
        setState(s => ({ ...s, loading: false, error: 'Failed to load session' }));
      }
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: 'Network error' }));
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (response.ok) {
        setState(s => ({
          ...s,
          sessions: s.sessions.filter(sess => sess.id !== sessionId),
          currentSession: s.currentSession?.id === sessionId ? null : s.currentSession,
        }));
      }
    } catch (e) {
      setState(s => ({ ...s, error: 'Failed to delete session' }));
    }
  }, []);

  // Core generation logic - calls server-side API
  const executeGeneration = useCallback(async (
    placeholderId: string,
    prompt: string,
    params: Message['_params'],
    isEdit: boolean,
    sessionId: string,
  ) => {
    const payload = {
      prompt,
      model: params!.model,
      width: params!.width,
      height: params!.height,
      steps: params!.steps,
      guidance: params!.guidance,
      negativePrompt: params!.negativePrompt,
      images: isEdit ? params!.images : undefined,
    };

    try {
      // Call server-side generation endpoint
      const response = await fetch(`/api/sessions/${sessionId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const message = await response.json();

      // Replace placeholder with real message
      setState(s => ({
        ...s,
        generating: false,
        generatingPrompt: null,
        selectedImages: message.x_url ? [message.x_url] : [],
        debugInfo: {
          ...s.debugInfo,
          [message.id]: {
            payload,
            endpoint: `/api/sessions/${sessionId}/generate`,
            timestamp: new Date().toISOString(),
          },
        },
        currentSession: s.currentSession ? {
          ...s.currentSession,
          current_x_url: message.x_url,
          messages: (s.currentSession.messages || []).map(m =>
            m.id === placeholderId ? { ...message, status: 'success' as const, _params: params } : m
          ),
        } : null,
      }));

      return message;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Generation failed';
      // Update placeholder to failed state
      setState(s => ({
        ...s,
        generating: false,
        generatingPrompt: null,
        currentSession: s.currentSession ? {
          ...s.currentSession,
          messages: (s.currentSession.messages || []).map(m =>
            m.id === placeholderId ? { ...m, status: 'failed' as const, error: errorMessage } : m
          ),
        } : null,
      }));
      return null;
    }
  }, []);

  const generateImage = useCallback(async (prompt: string, mode: 'new' | 'edit' = 'new', currentSelectedImages?: string[]) => {
    // Get settings at call time to avoid stale closures
    const currentSettings = getSettings();

    if (!currentSettings.hasApiKey) {
      setState(s => ({ ...s, error: 'API key required. Configure in settings.' }));
      return null;
    }

    if (!state.currentSession) {
      setState(s => ({ ...s, error: 'No session selected' }));
      return null;
    }

    // Use passed selectedImages to avoid stale closure issues
    const selectedImagesNow = currentSelectedImages ?? state.selectedImages;
    const isEdit = mode === 'edit' && selectedImagesNow.length > 0;

    if (mode === 'edit' && selectedImagesNow.length === 0) {
      setState(s => ({ ...s, error: 'Select images to edit' }));
      return null;
    }

    // Store generation params for retry
    // Note: Only flux models support editing, zimage-turbo doesn't
    const params: Message['_params'] = {
      model: isEdit ? (currentSettings.model.startsWith('flux') ? currentSettings.model : 'flux2klein') : currentSettings.model,
      width: currentSettings.width,
      height: currentSettings.height,
      steps: isEdit ? 4 : currentSettings.steps,
      guidance: isEdit ? 5.0 : currentSettings.guidance,
      negativePrompt: currentSettings.negativePrompt,
      images: isEdit ? [...selectedImagesNow] : [],
    };

    // Create placeholder message immediately
    const placeholderId = `pending-${Date.now()}`;
    const placeholder: Message = {
      id: placeholderId,
      prompt,
      image_path: null,
      x_url: null,
      is_edit: isEdit ? 1 : 0,
      generation_time_ms: null,
      archived: 0,
      created_at: new Date().toISOString(),
      status: 'pending',
      _params: params,
    };

    const sessionId = state.currentSession.id;

    // Add placeholder to messages and start generating
    setState(s => ({
      ...s,
      generating: true,
      generatingPrompt: prompt,
      error: null,
      currentSession: s.currentSession ? {
        ...s.currentSession,
        messages: [...(s.currentSession.messages || []), placeholder],
      } : null,
    }));

    return executeGeneration(placeholderId, prompt, params, isEdit, sessionId);
  }, [getSettings, state.currentSession, state.selectedImages, executeGeneration]);

  const retryMessage = useCallback(async (messageId: string) => {
    if (!state.currentSession) return null;

    const message = state.currentSession.messages?.find(m => m.id === messageId);
    if (!message || !message._params) {
      setState(s => ({ ...s, error: 'Cannot retry: missing generation parameters' }));
      return null;
    }

    if (!getSettings().hasApiKey) {
      setState(s => ({ ...s, error: 'API key required. Configure in settings.' }));
      return null;
    }

    const isEdit = message.is_edit === 1;

    // Create new placeholder for retry
    const placeholderId = `pending-${Date.now()}`;
    const placeholder: Message = {
      id: placeholderId,
      prompt: message.prompt,
      image_path: null,
      x_url: null,
      is_edit: message.is_edit,
      generation_time_ms: null,
      archived: 0,
      created_at: new Date().toISOString(),
      status: 'pending',
      _params: message._params,
    };

    const sessionId = state.currentSession.id;

    // Add new placeholder after the original message
    setState(s => ({
      ...s,
      generating: true,
      generatingPrompt: message.prompt,
      error: null,
      currentSession: s.currentSession ? {
        ...s.currentSession,
        messages: [...(s.currentSession.messages || []), placeholder],
      } : null,
    }));

    return executeGeneration(placeholderId, message.prompt, message._params, isEdit, sessionId);
  }, [state.currentSession, getSettings, executeGeneration]);

  const dismissFailedMessage = useCallback((messageId: string) => {
    setState(s => ({
      ...s,
      currentSession: s.currentSession ? {
        ...s.currentSession,
        messages: (s.currentSession.messages || []).filter(m => m.id !== messageId),
      } : null,
    }));
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!state.currentSession) return;

    // Find the message to get its x_url for selection cleanup
    const message = state.currentSession.messages?.find(m => m.id === messageId);
    const xUrl = message?.x_url;

    try {
      const response = await fetch(`/api/sessions/${state.currentSession.id}/messages/${messageId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setState(s => ({
          ...s,
          // Remove from selected images if it was selected
          selectedImages: xUrl ? s.selectedImages.filter(url => url !== xUrl) : s.selectedImages,
          currentSession: s.currentSession ? {
            ...s.currentSession,
            messages: (s.currentSession.messages || []).filter(m => m.id !== messageId),
          } : null,
        }));
      } else {
        setState(s => ({ ...s, error: 'Failed to delete message' }));
      }
    } catch (e) {
      setState(s => ({ ...s, error: 'Failed to delete message' }));
    }
  }, [state.currentSession]);

  const resetSession = useCallback(async () => {
    if (!state.currentSession) return;

    try {
      await fetch(`/api/sessions/${state.currentSession.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_x_url: null }),
      });

      setState(s => ({
        ...s,
        currentSession: s.currentSession ? {
          ...s.currentSession,
          current_x_url: null,
        } : null,
      }));
    } catch (e) {
      setState(s => ({ ...s, error: 'Failed to reset session' }));
    }
  }, [state.currentSession]);

  const toggleImageSelection = useCallback((xUrl: string) => {
    setState(s => ({
      ...s,
      selectedImages: s.selectedImages.includes(xUrl)
        ? s.selectedImages.filter(url => url !== xUrl)
        : [...s.selectedImages, xUrl],
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState(s => ({ ...s, selectedImages: [] }));
  }, []);

  const branchFrom = useCallback((message: Message) => {
    if (!message.x_url) return;
    // Set this image as the only selected image for editing
    setState(s => ({
      ...s,
      selectedImages: [message.x_url!],
    }));
  }, []);

  const archiveSession = useCallback(async (sessionId: string, archived: boolean) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });

      if (response.ok) {
        setState(s => ({
          ...s,
          sessions: s.sessions.map(sess =>
            sess.id === sessionId ? { ...sess, archived: archived ? 1 : 0 } : sess
          ),
          // Clear current session if we just archived it
          currentSession: s.currentSession?.id === sessionId && archived
            ? null
            : s.currentSession,
        }));
      } else {
        setState(s => ({ ...s, error: 'Failed to archive session' }));
      }
    } catch (e) {
      setState(s => ({ ...s, error: 'Failed to archive session' }));
    }
  }, []);

  const renameSession = useCallback(async (newName: string) => {
    if (!state.currentSession) return;

    try {
      await fetch(`/api/sessions/${state.currentSession.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      setState(s => ({
        ...s,
        sessions: s.sessions.map(sess =>
          sess.id === s.currentSession?.id ? { ...sess, name: newName } : sess
        ),
        currentSession: s.currentSession ? { ...s.currentSession, name: newName } : null,
      }));
    } catch (e) {
      setState(s => ({ ...s, error: 'Failed to rename session' }));
    }
  }, [state.currentSession]);

  return {
    ...state,
    fetchSessions,
    createSession,
    selectSession,
    deleteSession,
    deleteMessage,
    generateImage,
    retryMessage,
    dismissFailedMessage,
    resetSession,
    toggleImageSelection,
    clearSelection,
    branchFrom,
    renameSession,
    archiveSession,
    clearError: () => setState(s => ({ ...s, error: null })),
  };
}
