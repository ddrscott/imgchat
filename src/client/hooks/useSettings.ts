import { useState, useEffect, useCallback } from 'hono/jsx/dom';

export interface Settings {
  apiKey: string;
  hasApiKey: boolean;
  model: 'flux2klein' | 'flux2klein-9b' | 'zimage-turbo';
  width: number;
  height: number;
  steps: number;
  guidance: number;
  negativePrompt: string;
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  hasApiKey: false,
  model: 'flux2klein',
  width: 1024,
  height: 1024,
  steps: 4,
  guidance: 1.0,
  negativePrompt: '',
};

export function useSettings(): [Settings, (settings: Partial<Settings>) => void, boolean] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load settings from server
  useEffect(() => {
    fetch('/api/preferences')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setSettings({
            apiKey: '', // Never expose actual key to client
            hasApiKey: data.hasApiKey,
            model: data.model || 'flux2klein',
            width: data.width || 1024,
            height: data.height || 1024,
            steps: data.steps || 4,
            guidance: data.guidance || 1.0,
            negativePrompt: data.negativePrompt || '',
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    // Optimistically update local state
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      // If apiKey is set, mark hasApiKey true
      if (updates.apiKey) {
        newSettings.hasApiKey = true;
      }
      return newSettings;
    });

    // Build server payload
    const payload: Record<string, unknown> = {};
    if (updates.apiKey !== undefined) payload.apiKey = updates.apiKey;
    if (updates.model !== undefined) payload.model = updates.model;
    if (updates.width !== undefined) payload.width = updates.width;
    if (updates.height !== undefined) payload.height = updates.height;
    if (updates.steps !== undefined) payload.steps = updates.steps;
    if (updates.guidance !== undefined) payload.guidance = updates.guidance;
    if (updates.negativePrompt !== undefined) payload.negativePrompt = updates.negativePrompt;

    // Save to server
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(console.error);
  }, []);

  return [settings, updateSettings, loading];
}
