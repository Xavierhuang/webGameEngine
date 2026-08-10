'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { CollaborationManager, Presence, generateUserColor } from '@/lib/realtime/collaboration';

interface CollaborationContextType {
  presence: Presence[];
  isConnected: boolean;
  updateCursor: (x: number, y: number) => void;
  updateScene: (sceneId: string) => void;
  broadcastUpdate: (update: any) => void;
}

const CollaborationContext = createContext<CollaborationContextType | null>(null);

export function useCollaboration() {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within CollaborationProvider');
  }
  return context;
}

export function CollaborationProvider({
  projectId,
  userId,
  username,
  children,
  onUpdate,
}: {
  projectId: string;
  userId: string;
  username: string;
  children: React.ReactNode;
  onUpdate?: (update: any) => void;
}) {
  const [manager, setManager] = useState<CollaborationManager | null>(null);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const userColor = generateUserColor();
    const collaborationManager = new CollaborationManager(projectId, userId, {
      onPresenceChange: setPresence,
      onProjectUpdate: onUpdate,
    });

    // Connect asynchronously and handle errors gracefully
    collaborationManager.connect({ username, color: userColor })
      .then(() => {
      setIsConnected(true);
      })
      .catch((error) => {
        console.error('Collaboration connection failed:', error);
        // Continue without collaboration features
        setIsConnected(false);
    });

    setManager(collaborationManager);

    return () => {
      collaborationManager.disconnect();
    };
  }, [projectId, userId, username]);

  const value: CollaborationContextType = {
    presence,
    isConnected,
    updateCursor: (x, y) => manager?.updateCursor(x, y),
    updateScene: (sceneId) => manager?.updateScene(sceneId),
    broadcastUpdate: (update) => manager?.broadcastUpdate(update),
  };

  return (
    <CollaborationContext.Provider value={value}>
      {children}
      {/* Render cursors of other users */}
      {presence.map((user) =>
        user.userId !== userId && user.cursor ? (
          <div
            key={user.userId}
            className="fixed pointer-events-none z-50"
            style={{
              left: user.cursor.x,
              top: user.cursor.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: user.color }}
            />
            <div
              className="text-xs font-medium px-2 py-1 rounded mt-1 whitespace-nowrap"
              style={{ backgroundColor: user.color, color: 'white' }}
            >
              {user.username}
            </div>
          </div>
        ) : null
      )}
    </CollaborationContext.Provider>
  );
}

