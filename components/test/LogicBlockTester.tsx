'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Play, Database, Code } from 'lucide-react';
import Link from 'next/link';

interface LogicBlockTesterProps {
  projectId: string;
  data: {
    project: { id: string; title: string };
    gameObjects: Array<{
      id: string;
      name: string;
      type: string;
      has_physics: boolean;
      logic_blocks: Array<{
        id: string;
        block_type: string;
        category: string;
        order_index: number;
        block_data: any;
      }>;
    }>;
    allLogicBlocks: Array<{
      id: string;
      game_object_id: string | null;
      game_object_name: string;
      block_type: string;
      category: string;
      order_index: number;
      block_data: any;
    }>;
  };
}

export default function LogicBlockTester({ projectId, data }: LogicBlockTesterProps) {
  const [testResults, setTestResults] = useState<{
    saved: boolean;
    loaded: boolean;
    executed: boolean;
    details: string[];
  } | null>(null);

  const runTests = async () => {
    const results = {
      saved: false,
      loaded: false,
      executed: false,
      details: [] as string[],
    };

    // Test 1: Check if logic blocks are saved
    if (data.allLogicBlocks.length > 0) {
      results.saved = true;
      results.details.push(`✅ Found ${data.allLogicBlocks.length} logic blocks in database`);
    } else {
      results.details.push('❌ No logic blocks found in database');
    }

    // Test 2: Check if logic blocks are loaded for game objects
    const objectsWithLogic = data.gameObjects.filter((go) => go.logic_blocks.length > 0);
    if (objectsWithLogic.length > 0) {
      results.loaded = true;
      results.details.push(`✅ ${objectsWithLogic.length} game object(s) have logic blocks attached`);
      objectsWithLogic.forEach((go) => {
        results.details.push(`   - "${go.name}" has ${go.logic_blocks.length} logic block(s)`);
      });
    } else {
      results.details.push('❌ No game objects have logic blocks attached');
    }

    // Test 3: Check if logic blocks have valid structure
    let validBlocks = 0;
    let invalidBlocks = 0;
    data.allLogicBlocks.forEach((block) => {
      if (block.block_type && block.category && block.block_data) {
        validBlocks++;
      } else {
        invalidBlocks++;
        results.details.push(`⚠️ Invalid block structure: ${JSON.stringify(block)}`);
      }
    });

    if (validBlocks > 0) {
      results.executed = invalidBlocks === 0;
      results.details.push(`✅ ${validBlocks} logic block(s) have valid structure`);
      if (invalidBlocks > 0) {
        results.details.push(`⚠️ ${invalidBlocks} logic block(s) have invalid structure`);
      }
    }

    // Test 4: Check for movement-related blocks
    const movementBlocks = data.allLogicBlocks.filter(
      (block) =>
        block.block_type === 'on_key_press' ||
        block.category === 'movement' ||
        block.category === 'input' ||
        block.category === 'event'
    );

    if (movementBlocks.length > 0) {
      results.details.push(`✅ Found ${movementBlocks.length} movement/input logic block(s)`);
      movementBlocks.forEach((block) => {
        const key = block.block_data?.key || block.block_data?.direction || 'unknown';
        results.details.push(`   - Block for key: ${key} (type: ${block.block_type}, category: ${block.category})`);
      });
    } else {
      results.details.push('⚠️ No movement/input logic blocks found');
    }

    setTestResults(results);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">
            Logic Blocks Test Suite
          </h1>
          <p className="text-gray-600 mb-4">
            Project: <span className="font-semibold">{data.project.title}</span>
          </p>

          <div className="flex gap-4 mb-6">
            <button
              onClick={runTests}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2"
            >
              <Database className="w-5 h-5" />
              Run Tests
            </button>
            <Link
              href={`/play/${projectId}`}
              target="_blank"
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Test in Player
            </Link>
            <Link
              href={`/editor/${projectId}`}
              className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2"
            >
              <Code className="w-5 h-5" />
              Back to Editor
            </Link>
          </div>

          {testResults && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h2 className="text-xl font-bold mb-4">Test Results</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className={`p-4 rounded-lg ${testResults.saved ? 'bg-green-100' : 'bg-red-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResults.saved ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600" />
                    )}
                    <span className="font-bold">Saved to DB</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {testResults.saved ? 'Logic blocks are saved' : 'No logic blocks found'}
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${testResults.loaded ? 'bg-green-100' : 'bg-red-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResults.loaded ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600" />
                    )}
                    <span className="font-bold">Loaded</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {testResults.loaded ? 'Attached to objects' : 'Not attached'}
                  </p>
                </div>
                <div className={`p-4 rounded-lg ${testResults.executed ? 'bg-green-100' : 'bg-yellow-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {testResults.executed ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-yellow-600" />
                    )}
                    <span className="font-bold">Valid Structure</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {testResults.executed ? 'All blocks valid' : 'Some issues found'}
                  </p>
                </div>
              </div>
              <div className="bg-white rounded p-4">
                <h3 className="font-bold mb-2">Details:</h3>
                <ul className="space-y-1">
                  {testResults.details.map((detail, i) => (
                    <li key={i} className="text-sm font-mono">
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Game Objects with Logic Blocks */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-4">Game Objects & Logic Blocks</h2>
            {data.gameObjects.length === 0 ? (
              <p className="text-gray-600">No game objects found in this project.</p>
            ) : (
              <div className="space-y-4">
                {data.gameObjects.map((obj) => (
                  <div key={obj.id} className="bg-white rounded-lg p-4 shadow">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-lg">{obj.name}</h3>
                        <p className="text-sm text-gray-600">
                          Type: {obj.type} | Physics: {obj.has_physics ? 'Yes' : 'No'}
                        </p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-bold ${
                        obj.logic_blocks.length > 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {obj.logic_blocks.length} logic block(s)
                      </div>
                    </div>
                    {obj.logic_blocks.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {obj.logic_blocks.map((block, idx) => (
                          <div key={block.id} className="bg-gray-50 rounded p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-sm">{block.block_type}</span>
                              <span className="text-xs text-gray-500">({block.category})</span>
                              <span className="text-xs text-gray-400">Order: {block.order_index}</span>
                            </div>
                            <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                              {JSON.stringify(block.block_data, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No logic blocks attached</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All Logic Blocks Summary */}
          <div>
            <h2 className="text-2xl font-bold mb-4">All Logic Blocks Summary</h2>
            {data.allLogicBlocks.length === 0 ? (
              <p className="text-gray-600">No logic blocks found in the database.</p>
            ) : (
              <div className="bg-white rounded-lg p-4 shadow">
                <p className="mb-4">
                  <span className="font-bold">Total:</span> {data.allLogicBlocks.length} logic block(s)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Object</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Category</th>
                        <th className="text-left p-2">Key/Direction</th>
                        <th className="text-left p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.allLogicBlocks.map((block) => (
                        <tr key={block.id} className="border-b">
                          <td className="p-2">{block.game_object_name}</td>
                          <td className="p-2">{block.block_type}</td>
                          <td className="p-2">{block.category}</td>
                          <td className="p-2">
                            {block.block_data?.key || block.block_data?.direction || 'N/A'}
                          </td>
                          <td className="p-2">
                            {block.block_data?.action || block.block_data?.parameter?.action || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

