import { useState, useEffect, useCallback } from 'hono/jsx/dom';
import type { ModelId } from '../models';

export interface Settings {
  apiKey: string;
  hasApiKey: boolean;
  model: ModelId;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  negativePrompt: string;
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  hasApiKey: false,
  model: 'cf-flux-klein-4b',
  width: 1024,
  height: 1024,
  steps: 4,
  guidance: 1.0,
  negativePrompt: '',
};

// Valid aspect ratio presets (must match ChatPanel)
const ASPECT_RATIOS = [
  { width: 1024, height: 1024 },
  { width: 1024, height: 683 },
  { width: 683, height: 1024 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 720, height: 1280 },
  { width: 1280, height: 548 },
];

// Valid model IDs
const VALID_MODELS = [
  'flux2klein', 'flux2klein-9b', 'zimage-turbo',
  'cf-flux-klein-4b', 'cf-flux-klein-9b', 'cf-flux-dev'
];

// Snap dimensions to nearest valid aspect ratio
function snapToValidAspect(width: number, height: number): { width: number; height: number } {
  const match = ASPECT_RATIOS.find(r => r.width === width && r.height === height);
  if (match) return match;
  // Find closest by ratio
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
  return closest;
}

export function useSettings(): [Settings, (settings: Partial<Settings>) => void, boolean] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Load settings from server
  useEffect(() => {
    fetch('/api/preferences')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          // Validate model - use default if invalid
          const model = VALID_MODELS.includes(data.model) ? data.model : DEFAULT_SETTINGS.model;
          // Snap dimensions to valid aspect ratio
          const { width, height } = snapToValidAspect(data.width || 1024, data.height || 1024);
          setSettings({
            apiKey: '', // Never expose actual key to client
            hasApiKey: data.hasApiKey,
            model,
            width,
            height,
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
