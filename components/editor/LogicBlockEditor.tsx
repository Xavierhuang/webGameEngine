'use client';

import { useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';

interface LogicBlockEditorProps {
  projectId: string;
  selectedObject: any;
}

interface LogicBlock {
  id: string;
  type: 'event' | 'action' | 'condition' | 'variable';
  category: string;
  label: string;
  children?: LogicBlock[];
}

const blockTemplates = {
  events: [
    { type: 'event', category: 'input', label: 'When game starts' },
    { type: 'event', category: 'input', label: 'When clicked' },
    { type: 'event', category: 'input', label: 'When key pressed' },
    { type: 'event', category: 'collision', label: 'When touches' },
  ],
  actions: [
    { type: 'action', category: 'movement', label: 'Move forward' },
    { type: 'action', category: 'movement', label: 'Jump' },
    { type: 'action', category: 'movement', label: 'Turn' },
    { type: 'action', category: 'visual', label: 'Change color' },
    { type: 'action', category: 'visual', label: 'Show message' },
    { type: 'action', category: 'sound', label: 'Play sound' },
  ],
  conditions: [
    { type: 'condition', category: 'logic', label: 'If / Then' },
    { type: 'condition', category: 'logic', label: 'Repeat' },
    { type: 'condition', category: 'logic', label: 'Repeat until' },
  ],
  variables: [
    { type: 'variable', category: 'data', label: 'Set variable' },
    { type: 'variable', category: 'data', label: 'Change by' },
  ],
};

export default function LogicBlockEditor({
  projectId,
  selectedObject,
}: LogicBlockEditorProps) {
  const [blocks, setBlocks] = useState<LogicBlock[]>([]);
  const [showPalette, setShowPalette] = useState(true);

  const addBlock = (template: any) => {
    const newBlock: LogicBlock = {
      id: Math.random().toString(36).substr(2, 9),
      type: template.type,
      category: template.category,
      label: template.label,
      children: [],
    };
    setBlocks([...blocks, newBlock]);
  };

  const removeBlock = (blockId: string) => {
    setBlocks(blocks.filter((b) => b.id !== blockId));
  };

  return (
    <div className="flex h-full bg-gray-50">
      {/* Block Palette */}
      {showPalette && (
        <div className="w-80 bg-white shadow-lg overflow-y-auto p-4">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Logic Blocks
          </h2>

          {/* Events */}
          <BlockCategory title="Events" color="yellow">
            {blockTemplates.events.map((block, index) => (
              <BlockTemplate
                key={index}
                block={block}
                onAdd={() => addBlock(block)}
              />
            ))}
          </BlockCategory>

          {/* Actions */}
          <BlockCategory title="Actions" color="blue">
            {blockTemplates.actions.map((block, index) => (
              <BlockTemplate
                key={index}
                block={block}
                onAdd={() => addBlock(block)}
              />
            ))}
          </BlockCategory>

          {/* Conditions */}
          <BlockCategory title="Conditions" color="green">
            {blockTemplates.conditions.map((block, index) => (
              <BlockTemplate
                key={index}
                block={block}
                onAdd={() => addBlock(block)}
              />
            ))}
          </BlockCategory>

          {/* Variables */}
          <BlockCategory title="Variables" color="orange">
            {blockTemplates.variables.map((block, index) => (
              <BlockTemplate
                key={index}
                block={block}
                onAdd={() => addBlock(block)}
              />
            ))}
          </BlockCategory>
        </div>
      )}

      {/* Workspace */}
      <div className="flex-1 p-8 overflow-auto">
        {selectedObject ? (
          <>
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-800">
                Logic for: {selectedObject.name}
              </h3>
              <p className="text-gray-600">
                Drag blocks from the left to create game logic
              </p>
            </div>

            <div className="space-y-3">
              {blocks.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">No logic blocks yet!</p>
                  <p>Add blocks from the palette to get started</p>
                </div>
              ) : (
                blocks.map((block) => (
                  <LogicBlockComponent
                    key={block.id}
                    block={block}
                    onRemove={() => removeBlock(block.id)}
                  />
                ))
              )}
            </div>

            <button className="mt-6 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2">
              <Play className="w-5 h-5" />
              Test Logic
            </button>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <p className="text-xl mb-2">Select an object</p>
              <p>Choose an object from the scene to add logic</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockCategory({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-gray-600 mb-2 uppercase">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BlockTemplate({ block, onAdd }: { block: any; onAdd: () => void }) {
  const colorClasses = {
    event: 'bg-kid-yellow hover:bg-yellow-300',
    action: 'bg-kid-blue hover:bg-blue-300',
    condition: 'bg-kid-green hover:bg-green-300',
    variable: 'bg-kid-orange hover:bg-orange-300',
  };

  return (
    <button
      onClick={onAdd}
      className={`w-full text-left p-3 rounded-lg font-medium text-gray-800 shadow-sm cursor-pointer transition-all ${
        colorClasses[block.type as keyof typeof colorClasses]
      }`}
    >
      {block.label}
    </button>
  );
}

function LogicBlockComponent({
  block,
  onRemove,
}: {
  block: LogicBlock;
  onRemove: () => void;
}) {
  const colorClasses = {
    event: 'logic-block-event',
    action: 'logic-block-action',
    condition: 'logic-block-condition',
    variable: 'logic-block-variable',
  };

  return (
    <div
      className={`logic-block ${colorClasses[block.type]} flex items-center justify-between`}
    >
      <span className="font-medium text-gray-800">{block.label}</span>
      <button
        onClick={onRemove}
        className="text-red-500 hover:text-red-700 p-1"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

