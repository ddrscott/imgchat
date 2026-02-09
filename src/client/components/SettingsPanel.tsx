import type { Settings } from '../hooks/useSettings';

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, onUpdate, onClose }: SettingsPanelProps) {
  return (
    <div class="settings-overlay" onClick={onClose}>
      <div class="settings-panel" onClick={e => e.stopPropagation()}>
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="close-button" onClick={onClose}>&times;</button>
        </div>

        <div class="settings-content">
          <div class="setting-group">
            <label>TTS API Key</label>
            <input
              type="password"
              value={settings.apiKey}
              onInput={(e) => onUpdate({ apiKey: (e.target as HTMLInputElement).value })}
              placeholder={settings.hasApiKey ? '••••••••••••••••' : 'Your RADIO_TTS_API_KEY'}
            />
            <span class="setting-hint">
              {settings.hasApiKey ? 'API key saved. Enter new value to update.' : 'Required for image generation'}
            </span>
          </div>

          <div class="setting-group">
            <label>Model</label>
            <select
              value={settings.model}
              onChange={(e) => onUpdate({ model: (e.target as HTMLSelectElement).value as Settings['model'] })}
            >
              <option value="flux2klein">flux2klein</option>
              <option value="flux2klein-9b">flux2klein-9b</option>
              <option value="zimage-turbo">zimage-turbo</option>
            </select>
          </div>

          <div class="setting-group">
            <label>Size</label>
            <div class="size-inputs">
              <input
                type="number"
                value={settings.width}
                onInput={(e) => onUpdate({ width: parseInt((e.target as HTMLInputElement).value) || 1024 })}
                min="256"
                max="2048"
                step="64"
              />
              <span>&times;</span>
              <input
                type="number"
                value={settings.height}
                onInput={(e) => onUpdate({ height: parseInt((e.target as HTMLInputElement).value) || 1024 })}
                min="256"
                max="2048"
                step="64"
              />
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-group">
              <label>Steps</label>
              <input
                type="number"
                value={settings.steps}
                onInput={(e) => onUpdate({ steps: parseInt((e.target as HTMLInputElement).value) || 4 })}
                min="1"
                max="50"
              />
            </div>
            <div class="setting-group">
              <label>Guidance</label>
              <input
                type="number"
                value={settings.guidance}
                onInput={(e) => onUpdate({ guidance: parseFloat((e.target as HTMLInputElement).value) || 1.0 })}
                min="0"
                max="20"
                step="0.5"
              />
            </div>
          </div>

          <div class="setting-group">
            <label>Negative Prompt</label>
            <textarea
              value={settings.negativePrompt}
              onInput={(e) => onUpdate({ negativePrompt: (e.target as HTMLTextAreaElement).value })}
              placeholder="Things to avoid in generation..."
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
