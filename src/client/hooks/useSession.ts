import { useState, useCallback, useEffect, useRef } from 'hono/jsx/dom';
import type { Settings } from './useSettings';
import { modelRequiresApiKey } from '../models';

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
  selectedImages: string[]; // Array of image_paths for multi-select editing
  debugInfo: Record<string, DebugInfo>; // Message ID -> debug info
}

// API response types
interface GenerateResponse {
  job: {
    id: string;
    status: string;
    model: string;
    provider: string;
    prompt: string;
  };
  message: Message;
}

interface JobResponse {
  job: {
    id: string;
    session_id: string;
    message_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error_message?: string;
  };
  message?: Message;
}

interface PendingJob {
  id: string;
  message_id: string;
  session_id: string;
  prompt: string;
  params: string;
  status: string;
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
        const sessions: Session[] = await response.json();
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
        const session: Session = await response.json();
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

  // selectSession is defined after pollJob below

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

  // Track active polling intervals
  const pollingRef = useRef<Map<string, number>>(new Map());

  // Poll for job completion
  const pollJob = useCallback((jobId: string, sessionId: string, params: Message['_params']) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          // Job not found, stop polling
          const intervalId = pollingRef.current?.get(jobId);
          if (intervalId) {
            clearInterval(intervalId);
            pollingRef.current?.delete(jobId);
          }
          return;
        }

        const data: JobResponse = await response.json();
        const { job, message } = data;

        if (job.status === 'completed' && message) {
          // Stop polling
          const intervalId = pollingRef.current?.get(jobId);
          if (intervalId) {
            clearInterval(intervalId);
            pollingRef.current?.delete(jobId);
          }

          // Update message with completed data
          const stillGenerating = (pollingRef.current?.size || 0) > 0;
          setState(s => ({
            ...s,
            generating: stillGenerating,
            generatingPrompt: stillGenerating ? s.generatingPrompt : null,
            selectedImages: message.image_path ? [message.image_path] : s.selectedImages,
            debugInfo: {
              ...s.debugInfo,
              [message.id]: {
                payload: params as Record<string, unknown>,
                endpoint: `/api/sessions/${sessionId}/generate`,
                timestamp: message.created_at,
              },
            },
            currentSession: s.currentSession?.id === sessionId ? {
              ...s.currentSession,
              current_x_url: message.x_url,
              messages: (s.currentSession.messages || []).map(m =>
                m.id === jobId ? { ...message, status: 'success' as const, _params: params } : m
              ),
            } : s.currentSession,
          }));

          // Refresh session to get auto-generated title
          try {
            const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
            if (sessionResponse.ok) {
              const updatedSession: Session = await sessionResponse.json();
              setState(s => ({
                ...s,
                sessions: s.sessions.map(sess =>
                  sess.id === sessionId ? { ...sess, name: updatedSession.name } : sess
                ),
                currentSession: s.currentSession?.id === sessionId
                  ? { ...s.currentSession, name: updatedSession.name }
                  : s.currentSession,
              }));
            }
          } catch (e) {
            // Non-critical, ignore errors
          }
        } else if (job.status === 'failed') {
          // Stop polling
          const intervalId = pollingRef.current?.get(jobId);
          if (intervalId) {
            clearInterval(intervalId);
            pollingRef.current?.delete(jobId);
          }

          // Update message with failed status
          const stillGenerating = (pollingRef.current?.size || 0) > 0;
          setState(s => ({
            ...s,
            generating: stillGenerating,
            generatingPrompt: stillGenerating ? s.generatingPrompt : null,
            currentSession: s.currentSession?.id === sessionId ? {
              ...s.currentSession,
              messages: (s.currentSession.messages || []).map(m =>
                m.id === jobId ? { ...m, status: 'failed' as const, error: job.error_message || 'Generation failed' } : m
              ),
            } : s.currentSession,
          }));
        }
        // If still pending/processing, continue polling
      } catch (e) {
        console.error('Polling error:', e);
      }
    };

    // Poll immediately, then every 2 seconds
    poll();
    const intervalId = setInterval(poll, 2000) as unknown as number;
    pollingRef.current?.set(jobId, intervalId);

    return () => {
      clearInterval(intervalId);
      pollingRef.current?.delete(jobId);
    };
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current?.forEach((intervalId) => clearInterval(intervalId));
      pollingRef.current?.clear();
    };
  }, []);

  // Select a session and load its messages + pending jobs
  const selectSession = useCallback(async (sessionId: string) => {
    // Stop any existing polling when switching sessions
    pollingRef.current?.forEach((intervalId) => clearInterval(intervalId));
    pollingRef.current?.clear();

    setState(s => ({ ...s, loading: true, selectedImages: [], generating: false, generatingPrompt: null }));
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (response.ok) {
        const session: Session = await response.json();
        setState(s => ({ ...s, currentSession: session, loading: false, error: null }));

        // Check for pending jobs and resume polling
        try {
          const jobsResponse = await fetch(`/api/sessions/${sessionId}/jobs`);
          if (jobsResponse.ok) {
            const pendingJobs: PendingJob[] = await jobsResponse.json();
            if (pendingJobs.length > 0) {
              // Add pending messages to state and start polling
              setState(s => {
                const existingMsgIds = new Set((s.currentSession?.messages || []).map(m => m.id));
                const newMessages: Message[] = pendingJobs
                  .filter((job) => !existingMsgIds.has(job.message_id))
                  .map((job) => {
                    const params = JSON.parse(job.params);
                    return {
                      id: job.message_id,
                      prompt: job.prompt,
                      image_path: null,
                      x_url: null,
                      is_edit: params.images?.length > 0 ? 1 : 0,
                      generation_time_ms: null,
                      archived: 0,
                      created_at: new Date().toISOString(),
                      status: 'pending' as const,
                      _params: params,
                    };
                  });

                return {
                  ...s,
                  generating: newMessages.length > 0,
                  generatingPrompt: newMessages[0]?.prompt || null,
                  currentSession: s.currentSession ? {
                    ...s.currentSession,
                    messages: [...(s.currentSession.messages || []), ...newMessages],
                  } : null,
                };
              });

              // Start polling for each pending job
              for (const job of pendingJobs) {
                const params = JSON.parse(job.params);
                pollJob(job.message_id, sessionId, params);
              }
            }
          }
        } catch (e) {
          console.error('Failed to check pending jobs:', e);
        }
      } else {
        setState(s => ({ ...s, loading: false, error: 'Failed to load session' }));
      }
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: 'Network error' }));
    }
  }, [pollJob]);

  // Core generation logic - calls server-side API
  const executeGeneration = useCallback(async (
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
        const errorData = await response.json().catch(() => ({ error: 'Generation failed' })) as { error?: string };
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data: GenerateResponse = await response.json();
      const { job, message: placeholderMessage } = data;

      // Add placeholder message to state
      setState(s => ({
        ...s,
        currentSession: s.currentSession?.id === sessionId ? {
          ...s.currentSession,
          messages: [...(s.currentSession.messages || []), {
            ...placeholderMessage,
            status: 'pending' as const,
            _params: params,
          }],
        } : s.currentSession,
        debugInfo: {
          ...s.debugInfo,
          [job.id]: {
            payload,
            endpoint: `/api/sessions/${sessionId}/generate`,
            timestamp: new Date().toISOString(),
          },
        },
      }));

      // Start polling for job completion
      pollJob(job.id, sessionId, params);

      return job;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Generation failed';
      setState(s => ({
        ...s,
        generating: false,
        generatingPrompt: null,
        error: errorMessage,
      }));
      return null;
    }
  }, [pollJob]);

  const generateImage = useCallback(async (prompt: string, mode: 'new' | 'edit' = 'new', currentSelectedImages?: string[]) => {
    // Get settings at call time to avoid stale closures
    const currentSettings = getSettings();

    // Check API key only for models that require it (Radio models)
    if (modelRequiresApiKey(currentSettings.model) && !currentSettings.hasApiKey) {
      setState(s => ({ ...s, error: 'API key required for Radio models. Configure in settings or use a Cloudflare model.' }));
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
    // For Radio models: only flux models support editing, zimage-turbo doesn't
    // For CF models: all flux models support editing
    let modelToUse = currentSettings.model;
    if (isEdit && modelToUse === 'zimage-turbo') {
      modelToUse = 'flux2klein'; // Fall back to flux for editing with Radio
    }

    const params: Message['_params'] = {
      model: modelToUse,
      width: currentSettings.width,
      height: currentSettings.height,
      steps: isEdit ? 4 : currentSettings.steps,
      guidance: isEdit ? 5.0 : currentSettings.guidance,
      negativePrompt: currentSettings.negativePrompt,
      images: isEdit ? [...selectedImagesNow] : [],
    };

    const sessionId = state.currentSession.id;

    // Set generating state
    setState(s => ({
      ...s,
      generating: true,
      generatingPrompt: prompt,
      error: null,
    }));

    return executeGeneration(prompt, params, isEdit, sessionId);
  }, [getSettings, state.currentSession, state.selectedImages, executeGeneration]);

  const retryMessage = useCallback(async (messageId: string) => {
    if (!state.currentSession) return null;

    const message = state.currentSession.messages?.find(m => m.id === messageId);
    if (!message || !message._params) {
      setState(s => ({ ...s, error: 'Cannot retry: missing generation parameters' }));
      return null;
    }

    // Check API key only for models that require it (Radio models)
    if (modelRequiresApiKey(message._params.model) && !getSettings().hasApiKey) {
      setState(s => ({ ...s, error: 'API key required for Radio models. Configure in settings.' }));
      return null;
    }

    const isEdit = message.is_edit === 1;
    const sessionId = state.currentSession.id;

    // Set generating state
    setState(s => ({
      ...s,
      generating: true,
      generatingPrompt: message.prompt,
      error: null,
    }));

    return executeGeneration(message.prompt, message._params, isEdit, sessionId);
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

    // Find the message to get its image_path for selection cleanup
    const message = state.currentSession.messages?.find(m => m.id === messageId);
    const imagePath = message?.image_path;

    try {
      const response = await fetch(`/api/sessions/${state.currentSession.id}/messages/${messageId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setState(s => ({
          ...s,
          // Remove from selected images if it was selected
          selectedImages: imagePath ? s.selectedImages.filter(p => p !== imagePath) : s.selectedImages,
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
    if (!message.image_path) return;
    // Set this image as the only selected image for editing
    setState(s => ({
      ...s,
      selectedImages: [message.image_path!],
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

  const uploadImage = useCallback(async (file: File) => {
    if (!state.currentSession) {
      setState(s => ({ ...s, error: 'No session selected' }));
      return null;
    }

    // Validate file type
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      setState(s => ({ ...s, error: 'Invalid file type. Use PNG, JPEG, or WebP.' }));
      return null;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setState(s => ({ ...s, error: 'Image too large (max 10MB)' }));
      return null;
    }

    setState(s => ({ ...s, error: null }));

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (e.g., "data:image/png;base64,")
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to server
      const response = await fetch(`/api/sessions/${state.currentSession.id}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          filename: file.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' })) as { error?: string };
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      const message: Message = await response.json();

      // Add message to session and auto-select for editing
      setState(s => ({
        ...s,
        currentSession: s.currentSession ? {
          ...s.currentSession,
          messages: [...(s.currentSession.messages || []), message],
        } : null,
        selectedImages: [message.image_path!], // Auto-select uploaded image
      }));

      return message;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Upload failed';
      setState(s => ({ ...s, error: errorMessage }));
      return null;
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
    uploadImage,
    clearError: () => setState(s => ({ ...s, error: null })),
  };
}
