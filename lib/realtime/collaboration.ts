export interface Presence {
  userId: string;
  username: string;
  color: string;
  cursor?: { x: number; y: number };
  currentSceneId?: string;
}

export class CollaborationManager {
  private ws: WebSocket | null = null;
  private projectId: string;
  private userId: string;
  private userInfo: { username: string; color: string } | null = null;
  private onPresenceChange?: (presence: Presence[]) => void;
  private onProjectUpdate?: (update: any) => void;
  private presence: Map<string, Presence> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(
    projectId: string,
    userId: string,
    callbacks?: {
      onPresenceChange?: (presence: Presence[]) => void;
      onProjectUpdate?: (update: any) => void;
    }
  ) {
    this.projectId = projectId;
    this.userId = userId;
    this.onPresenceChange = callbacks?.onPresenceChange;
    this.onProjectUpdate = callbacks?.onProjectUpdate;
  }

  async connect(userInfo: { username: string; color: string }) {
    this.userInfo = userInfo;
    
    // Check if WebSocket URL is configured
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) {
      console.log('WebSocket not configured - collaboration features disabled');
      // Still allow local presence tracking without server
      return;
    }
    
    try {
      // Check if WebSocket is available in the browser
      if (typeof WebSocket === 'undefined') {
        console.log('WebSocket not available in this environment');
        return;
      }

      this.ws = new WebSocket(`${wsUrl}/collaboration/${this.projectId}?userId=${this.userId}`);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        // Send join message only if connection is open
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({
              type: 'join',
          userId: this.userId,
          username: userInfo.username,
          color: userInfo.color,
            }));
          } catch (error) {
            console.error('Error sending join message:', error);
          }
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        // Only log once, don't spam console
        if (this.reconnectAttempts === 0) {
          console.debug('WebSocket connection error (collaboration server may not be running)');
        }
        // Don't try to reconnect on error - let onclose handle it
      };

      this.ws.onclose = (event) => {
        // Only log if it's an unexpected closure
        if (event.code !== 1000) {
          console.debug('WebSocket disconnected (collaboration server may not be available)');
        }
        this.ws = null;
        
        // Only attempt to reconnect if it wasn't a normal closure and server is configured
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts && process.env.NEXT_PUBLIC_WS_URL) {
          this.reconnectAttempts++;
          setTimeout(() => {
            if (this.userInfo && !this.ws) {
              this.connect(this.userInfo);
            }
          }, 1000 * this.reconnectAttempts);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.ws = null;
      // Fallback: continue without WebSocket (local-only mode)
    }
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'presence':
        this.presence.clear();
        if (message.presences) {
          message.presences.forEach((p: Presence) => {
            this.presence.set(p.userId, p);
        });
      }
        this.onPresenceChange?.(Array.from(this.presence.values()));
        break;
      case 'user_joined':
        this.presence.set(message.userId, message);
        this.onPresenceChange?.(Array.from(this.presence.values()));
        break;
      case 'user_left':
        this.presence.delete(message.userId);
        this.onPresenceChange?.(Array.from(this.presence.values()));
        break;
      case 'project_update':
        this.onProjectUpdate?.(message.payload);
        break;
    }
  }

  updateCursor(x: number, y: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'cursor_update',
      userId: this.userId,
      cursor: { x, y },
        }));
      } catch (error) {
        console.error('Error sending cursor update:', error);
      }
    }
  }

  updateScene(sceneId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'scene_update',
      userId: this.userId,
      currentSceneId: sceneId,
        }));
      } catch (error) {
        console.error('Error sending scene update:', error);
      }
    }
  }

  broadcastUpdate(update: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'project_update',
          userId: this.userId,
      payload: update,
        }));
      } catch (error) {
        console.error('Error broadcasting update:', error);
      }
    }
  }

  disconnect() {
    if (this.ws) {
      try {
        // Only send leave message if connection is open
        if (this.ws.readyState === WebSocket.OPEN) {
          try {
          this.ws.send(JSON.stringify({
            type: 'leave',
            userId: this.userId,
          }));
          } catch (e) {
            // Ignore send errors during disconnect
          }
        }
        // Close the connection safely
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          try {
          this.ws.close(1000, 'Normal closure');
          } catch (e) {
            // Ignore close errors
          }
        }
      } catch (error) {
        // Silently ignore disconnect errors
      } finally {
        this.ws = null;
      }
    }
    this.presence.clear();
  }
}

export function generateUserColor(): string {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E2',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

