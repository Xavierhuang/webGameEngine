'use client';

import { useState } from 'react';
import { User, Sparkles, Upload, Wand2, Boxes, Link as LinkIcon } from 'lucide-react';
import ModelBuilder from './ModelBuilder';
import CharacterPreview from './CharacterPreview';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';
import { CHARACTER_TEMPLATES, BASIC_SHAPES } from '../../lib/prefabs/characters';

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
  const [tab, setTab] = useState<'starters' | 'shapes' | 'ai' | 'import'>('starters');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState('');

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

  return (
    <>
      <SelectorModal
        isOpen={isOpen}
        onClose={onClose}
        title="Choose a character"
        eyebrow="Add object"
        icon={<User className="w-5 h-5" />}
        accent={PALETTE.motion}
        tabs={[
          { id: 'starters', label: 'Starters' },
          { id: 'shapes', label: 'Basic shapes' },
          { id: 'ai', label: 'AI' },
          { id: 'import', label: 'Import' },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as typeof tab)}
      >
        {tab === 'starters' && (
          <SelectorSection
            title="Starter templates"
            description="Quick presets you can tweak later. Colors and shapes are just defaults — every property is editable."
            accent={PALETTE.motion}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {CHARACTER_TEMPLATES.map((c) => (
                <SelectorTile
                  key={c.id}
                  title={c.name}
                  description={c.description}
                  onClick={() => {
                    onSelect(c);
                    onClose();
                  }}
                >
                  <CharacterPreview character={c} />
                </SelectorTile>
              ))}
            </div>
          </SelectorSection>
        )}

        {tab === 'shapes' && (
          <SelectorSection
            title="Primitive shapes"
            description="Raw 3D primitives — perfect starting points before you paint them, resize them, or attach behavior blocks."
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
                  <CharacterPreview character={s} />
                </SelectorTile>
              ))}
            </div>
          </SelectorSection>
        )}

        {tab === 'ai' && (
          <>
            <SelectorSection
              title="Describe your character"
              description="Say what you want in plain English — the AI will pick a shape, color, and starter behavior."
              accent={PALETTE.ai}
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateAI()}
                  placeholder="A red dragon warrior with a big sword"
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <button
                  onClick={handleGenerateAI}
                  disabled={generatingAI || !aiPrompt.trim()}
                  className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-5 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {generatingAI ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </SelectorSection>

            <SelectorSection
              title="Build from primitives"
              description="Combine cubes, spheres, and cylinders into a composite character — great for robots and rigs."
              accent={PALETTE.looks}
            >
              <button
                onClick={() => setShowBuilder(true)}
                className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 font-semibold rounded-full px-5 py-2.5 transition"
              >
                <Boxes className="w-4 h-4" />
                Open builder
              </button>
            </SelectorSection>
          </>
        )}

        {tab === 'import' && (
          <>
            <SelectorSection
              title="Paste a model URL"
              description="Direct link to a hosted .glb, .gltf, .obj, .stl, .fbx, or .dae file."
              accent={PALETTE.sensing}
            >
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={modelUrl}
                  onChange={(e) => setModelUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  placeholder="https://…/model.glb"
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <button
                  onClick={handleUrlSubmit}
                  disabled={!modelUrl.trim()}
                  className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-full px-5 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LinkIcon className="w-4 h-4" />
                  Use URL
                </button>
              </div>
            </SelectorSection>

            <SelectorSection
              title="Upload from your device"
              description="Max 20 MB. GLB is preferred — it bundles textures and animations into a single file."
              accent={PALETTE.variables}
            >
              <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition p-6 text-center cursor-pointer">
                <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-slate-900">
                  {uploading ? 'Uploading…' : 'Click to choose a file'}
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
