import type { Settings } from '../hooks/useSettings';
import { MODELS, getModelInfo } from '../models';

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
}

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
            <div class="model-select-wrapper">
              <span class="model-provider-icon">
                <ProviderIcon type={getModelInfo(settings.model)?.providerIcon || 'radio'} />
              </span>
              <select
                value={settings.model}
                onChange={(e) => onUpdate({ model: (e.target as HTMLSelectElement).value as Settings['model'] })}
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
            <span class="setting-hint">
              {getModelInfo(settings.model)?.requiresApiKey
                ? 'Requires TTS API key'
                : 'Uses Cloudflare Workers AI (no API key)'}
            </span>
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
