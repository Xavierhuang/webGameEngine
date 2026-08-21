'use client';

import { useEffect, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { User, Sparkles, Upload, Wand2, Boxes, Link as LinkIcon } from 'lucide-react';
import ModelBuilder from './ModelBuilder';
import ShapePreview from './ShapePreview';
import { filterStarters } from '@/lib/editor/starterSearch';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';
import { useTranslator } from '../common/LocaleProvider';
import { PICKER_CHARACTERS, CHARACTER_TEMPLATES, BASIC_SHAPES } from '../../lib/prefabs/characters';

interface CharacterSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: any) => void;
  projectId: string;
}

// CHARACTER_TEMPLATES and BASIC_SHAPES live in lib/prefabs/characters.ts —
// the same module the /api/ai/generate-character route uses. Any prefab a kid
// can pick by hand is also what the AI returns when the prompt matches.

export default function CharacterSelector({
  isOpen,
  onClose,
  onSelect,
  projectId,
}: CharacterSelectorProps) {
  const t = useTranslator();
  const [tab, setTab] = useState<'starters' | 'shapes' | 'ai' | 'import'>('starters');
  const [query, setQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState('');

  // Preload every starter GLB the first time the picker opens so that by the
  // time a tile scrolls into view its file is already in drei's cache. Only
  // WebGL setup remains — the ~200-500ms per-file network wait moves off the
  // critical path. Runs once per session; useGLTF.preload dedupes internally.
  useEffect(() => {
    if (!isOpen) return;
    for (const c of CHARACTER_TEMPLATES) {
      const url = c.model_url;
      if (!url) continue;
      const ext = url.split('.').pop()?.toLowerCase();
      if (ext !== 'glb' && ext !== 'gltf') continue;
      useGLTF.preload(url);
    }
  }, [isOpen]);

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return;
    try {
      setGeneratingAI(true);
      const response = await fetch('/api/ai/generate-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, projectId }),
      });
      if (response.ok) {
        const character = await response.json();
        onSelect(character);
        onClose();
      } else {
        alert('Failed to generate character');
      }
    } catch (error) {
      console.error('Error generating character:', error);
      alert('Failed to generate character');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleUrlSubmit = () => {
    const url = modelUrl.trim();
    if (!url) return;
    const name = (url.split('/').pop() || 'Custom Model').replace(/\.[^/.]+$/, '');
    onSelect({
      id: `custom-url-${Date.now()}`,
      name,
      color: '#60A5FA',
      shape: 'model',
      size: 1,
      description: 'External model',
      model_url: url,
    });
    onClose();
  };

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/uploads/model', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const { url, name } = await res.json();
      onSelect({
        id: `custom-${Date.now()}`,
        name: (name || file.name).replace(/\.[^/.]+$/, ''),
        color: '#60A5FA',
        shape: 'model',
        size: 1,
        description: 'Uploaded model',
        model_url: url,
      });
      onClose();
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Filtered on every keystroke; the list is small enough that debouncing
  // would only add lag between typing and seeing the result.
  const visibleStarters = filterStarters(PICKER_CHARACTERS, query);

  return (
    <>
      <SelectorModal
        isOpen={isOpen}
        onClose={onClose}
        title={t('editor.characterPicker.title')}
        eyebrow={t('editor.characterPicker.eyebrow')}
        icon={<User className="w-5 h-5" />}
        accent={PALETTE.motion}
        tabs={[
          { id: 'starters', label: t('editor.characterPicker.tab.starters') },
          { id: 'shapes', label: t('editor.characterPicker.tab.shapes') },
          { id: 'ai', label: t('editor.characterPicker.tab.ai') },
          { id: 'import', label: t('editor.characterPicker.tab.import') },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as typeof tab)}
        search={
          tab === 'starters'
            ? {
                value: query,
                onChange: setQuery,
                placeholder: t('editor.characterPicker.searchPlaceholder'),
                resultCount: visibleStarters.length,
              }
            : undefined
        }
      >
        {tab === 'starters' && (
          <SelectorSection
            title={t('editor.characterPicker.starters.title')}
            description={t('editor.characterPicker.starters.description')}
            accent={PALETTE.motion}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visibleStarters.map((c) => {
                // Prefab id → localized display name. Falls back to the English
                // hardcoded `c.name` when the id isn't in the catalog yet, so a
                // new prefab still renders correctly before its translation
                // lands.
                const nameKey = `prefab.character.${c.id}.name` as any;
                const descKey = `prefab.character.${c.id}.description` as any;
                const localizedName = t(nameKey);
                const localizedDesc = t(descKey);
                const displayName = localizedName === nameKey ? c.name : localizedName;
                const displayDesc = localizedDesc === descKey ? c.description : localizedDesc;
                return (
                <SelectorTile
                  key={c.id}
                  title={displayName}
                  description={displayDesc}
                  onClick={() => {
                    onSelect(c);
                    onClose();
                  }}
                >
                  <ShapePreview
                    shape={c.shape}
                    color={c.color}
                    modelUrl={c.model_url}
                    previewScale={c.preview_scale}
                    previewRotation={c.preview_rotation}
                    modelBounds={c.model_bounds}
                  />

                </SelectorTile>
                );
              })}
            </div>
          </SelectorSection>
        )}

        {tab === 'shapes' && (
          <SelectorSection
            title={t('editor.characterPicker.shapes.title')}
            description={t('editor.characterPicker.shapes.description')}
            accent={PALETTE.control}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {BASIC_SHAPES.map((s) => (
                <SelectorTile
                  key={s.id}
                  title={s.name}
                  description={s.description}
                  onClick={() => {
                    onSelect(s);
                    onClose();
                  }}
                >
                  <ShapePreview shape={s.shape} color={s.color} modelUrl={s.model_url} />
                </SelectorTile>
              ))}
            </div>
          </SelectorSection>
        )}

        {tab === 'ai' && (
          <>
            <SelectorSection
              title={t('editor.characterPicker.ai.title')}
              description={t('editor.characterPicker.ai.description')}
              accent={PALETTE.ai}
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateAI()}
                  placeholder={t('editor.characterPicker.ai.placeholder')}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <button
                  onClick={handleGenerateAI}
                  disabled={generatingAI || !aiPrompt.trim()}
                  className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-5 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {generatingAI ? t('editor.characterPicker.ai.generating') : t('editor.characterPicker.ai.generate')}
                </button>
              </div>
            </SelectorSection>

            <SelectorSection
              title={t('editor.characterPicker.builder.title')}
              description={t('editor.characterPicker.builder.description')}
              accent={PALETTE.looks}
            >
              <button
                onClick={() => setShowBuilder(true)}
                className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-full px-5 py-2.5 transition"
              >
                <Boxes className="w-4 h-4" />
                {t('editor.characterPicker.builder.open')}
              </button>
            </SelectorSection>
          </>
        )}

        {tab === 'import' && (
          <>
            <SelectorSection
              title={t('editor.characterPicker.import.urlTitle')}
              description={t('editor.characterPicker.import.urlDescription')}
              accent={PALETTE.sensing}
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={modelUrl}
                  onChange={(e) => setModelUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  placeholder={t('editor.characterPicker.import.urlPlaceholder')}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!modelUrl.trim()}
                  className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-5 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LinkIcon className="w-4 h-4" />
                  {t('editor.characterPicker.import.useUrl')}
                </button>
              </div>
            </SelectorSection>

            <SelectorSection
              title={t('editor.characterPicker.import.uploadTitle')}
              description={t('editor.characterPicker.import.uploadDescription')}
              accent={PALETTE.variables}
            >
              <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition p-6 text-center cursor-pointer">
                <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-900">
                  {uploading ? t('editor.characterPicker.import.uploading') : t('editor.characterPicker.import.chooseFile')}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  .glb, .gltf, .obj, .stl, .fbx, .dae
                </div>
                <input
                  type="file"
                  accept=".glb,.gltf,.obj,.stl,.fbx,.dae,model/gltf-binary,model/gltf+json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.currentTarget.value = '';
                  }}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {uploadError && (
                <p className="mt-2 text-sm text-red-600">{uploadError}</p>
              )}
            </SelectorSection>
          </>
        )}
      </SelectorModal>

      <ModelBuilder
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        onSave={(composite) => {
          onSelect(composite);
          setShowBuilder(false);
          onClose();
        }}
      />
    </>
  );
}
