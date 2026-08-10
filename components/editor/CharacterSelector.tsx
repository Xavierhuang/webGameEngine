'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Upload, User } from 'lucide-react';
import ModelBuilder from './ModelBuilder';

interface CharacterSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: any) => void;
  projectId: string;
}

export default function CharacterSelector({
  isOpen,
  onClose,
  onSelect,
  projectId,
}: CharacterSelectorProps) {
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  // Quick basic shapes as character options
  const basicShapes = [
    { id: 'cube', name: 'Cube', color: '#60A5FA', shape: 'box', size: 60, description: 'Simple cube character' },
    { id: 'sphere', name: 'Sphere', color: '#F59E0B', shape: 'sphere', size: 60, description: 'Simple sphere character' },
    { id: 'cylinder', name: 'Cylinder', color: '#34D399', shape: 'cylinder', size: 60, description: 'Basic cylinder shape' },
    { id: 'cone', name: 'Cone', color: '#A78BFA', shape: 'cone', size: 60, description: 'Basic cone shape' },
    { id: 'pyramid', name: 'Pyramid', color: '#F472B6', shape: 'pyramid', size: 60, description: 'Four-sided pyramid' },
    { id: 'torus', name: 'Torus', color: '#FBBF24', shape: 'torus', size: 60, description: 'Donut ring shape' },
    { id: 'capsule', name: 'Capsule', color: '#60A5FA', shape: 'capsule', size: 60, description: 'Capsule pill shape' },
  ];

  // Pre-built character templates
  const defaultCharacters = [
    { id: 'hero', name: 'Hero', color: '#60A5FA', shape: 'box', size: 50, description: 'A brave hero' },
    { id: 'knight', name: 'Knight', color: '#3B82F6', shape: 'box', size: 55, description: 'A valiant knight' },
    { id: 'wizard', name: 'Wizard', color: '#8B5CF6', shape: 'box', size: 50, description: 'A wise wizard' },
    { id: 'robot', name: 'Robot', color: '#6B7280', shape: 'box', size: 50, description: 'A mechanical robot' },
    { id: 'ninja', name: 'Ninja', color: '#1F2937', shape: 'box', size: 48, description: 'A stealthy ninja' },
    { id: 'alien', name: 'Alien', color: '#10B981', shape: 'box', size: 52, description: 'A friendly alien' },
    { id: 'princess', name: 'Princess', color: '#EC4899', shape: 'box', size: 50, description: 'A royal princess' },
    { id: 'astronaut', name: 'Astronaut', color: '#F3F4F6', shape: 'box', size: 50, description: 'A space explorer' },
  ];

  useEffect(() => {
    if (isOpen) {
      loadCharacters();
    }
  }, [isOpen]);

  const loadCharacters = async () => {
    try {
      setLoading(true);
      // TODO: Load user-uploaded characters from API
      // const response = await fetch(`/api/characters?projectId=${projectId}`);
      // const data = await response.json();
      // setCharacters(data.characters || []);
      setCharacters(defaultCharacters);
    } catch (error) {
      console.error('Failed to load characters:', error);
      setCharacters(defaultCharacters);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) {
      alert('Please enter a character description');
      return;
    }

    try {
      setGeneratingAI(true);
      
      // Generate character with AI
      const response = await fetch('/api/ai/generate-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          projectId,
        }),
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Choose a Character</h2>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-160px)]">
          {/* Basic Shapes Section */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Basic Shapes</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {basicShapes.map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    onSelect(char);
                    onClose();
                  }}
                  className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-lg transition-all group"
                >
                  <div
                    className="w-full aspect-square rounded-lg mb-3 flex items-center justify-center"
                    style={{ backgroundColor: char.color }}
                  >
                    <User className="w-12 h-12 text-white opacity-50" />
                  </div>
                  <h4 className="font-bold text-gray-800 group-hover:text-blue-600">
                    {char.name}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">{char.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* AI Generation Section */}
          <div className="mb-8 bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-lg border-2 border-yellow-200">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-yellow-600" />
              <h3 className="text-lg font-bold text-gray-800">Generate with AI</h3>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Describe your character (e.g., 'a red dragon warrior')"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleGenerateAI()}
                className="flex-1 px-4 py-3 border-2 border-yellow-300 rounded-lg focus:border-yellow-500 focus:outline-none"
              />
              <button
                onClick={handleGenerateAI}
                disabled={generatingAI}
                className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-6 py-3 rounded-lg font-bold hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingAI ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Character Grid */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Pre-made Characters</h3>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading characters...</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {characters.map((char) => (
                  <button
                    key={char.id}
                    onClick={() => {
                      onSelect(char);
                      onClose();
                    }}
                    className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:shadow-lg transition-all group"
                  >
                    <div
                      className="w-full aspect-square rounded-lg mb-3 flex items-center justify-center"
                      style={{ backgroundColor: char.color }}
                    >
                      <User className="w-12 h-12 text-white opacity-50" />
                    </div>
                    <h4 className="font-bold text-gray-800 group-hover:text-blue-600">
                      {char.name}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">{char.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model Builder */}
          <div className="mb-8 bg-gradient-to-r from-blue-50 to-teal-50 p-6 rounded-lg border-2 border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-800">Build from Shapes</h3>
              <button
                onClick={() => setShowBuilder(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold"
              >
                Open Builder
              </button>
            </div>
            <p className="text-sm text-gray-600">Combine primitives into your own composite character.</p>
          </div>

          {/* Upload or Import Custom Character */}
          <div className="mt-8 p-6 border-2 border-dashed border-gray-300 rounded-lg text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-700 text-sm mb-3">Upload or Import 3D Model (.glb, .gltf, .obj, .stl, .fbx, .dae) or paste a URL</p>
            <div className="flex items-center gap-3 justify-center mb-3">
              <input
                type="text"
                placeholder="Paste a model URL (https://...)"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget as HTMLInputElement;
                    const url = input.value.trim();
                    if (!url) return;
                    const name = url.split('/').pop() || 'Custom Model';
                    const character = {
                      id: `custom-url-${Date.now()}`,
                      name: name.replace(/\.[^/.]+$/, ''),
                      color: '#60A5FA',
                      shape: 'model',
                      size: 1,
                      description: 'Custom external model',
                      model_url: url,
                      thumbnail_url: undefined as any,
                    };
                    onSelect(character);
                    onClose();
                  }
                }}
                className="w-2/3 px-3 py-2 border-2 border-gray-300 rounded-lg"
              />
            </div>
            <input
              type="file"
              accept=".glb,.gltf,.obj,.stl,.fbx,.dae,model/gltf-binary,model/gltf+json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
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
                  // Create a character using the uploaded model
                  const character = {
                    id: `custom-${Date.now()}`,
                    name: (name || file.name).replace(/\.[^/.]+$/, ''),
                    color: '#60A5FA',
                    shape: 'model',
                    size: 1,
                    description: 'Custom uploaded model',
                    model_url: url,
                    thumbnail_url: undefined as any,
                  };
                  onSelect(character);
                  onClose();
                } catch (err: any) {
                  setUploadError(err?.message || 'Upload failed');
                } finally {
                  setUploading(false);
                  // Reset input so same file can be chosen again if desired
                  e.currentTarget.value = '';
                }
              }}
              className="mx-auto block"
            />
            <div className="mt-2">
              <button
                disabled
                className="text-xs text-gray-400"
              >
                {uploading ? 'Uploading...' : uploadError ? `Error: ${uploadError}` : 'Max 20MB; GLB preferred'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Builder Modal */}
      <ModelBuilder
        isOpen={showBuilder}
        onClose={() => setShowBuilder(false)}
        onSave={(composite) => {
          onSelect(composite);
          onClose();
        }}
      />
    </div>
  );
}

