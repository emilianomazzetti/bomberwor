import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  onValue,
  update,
  remove,
  onDisconnect,
  Database
} from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import Peer, { DataConnection } from 'peerjs';

export const firebaseConfig = {
  apiKey: "AIzaSyCq5M8ohsilIaOt-Wh525zdiY50oelVUkQ",
  authDomain: "emidb-1130.firebaseapp.com",
  databaseURL: "https://emidb-1130-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "emidb-1130",
  storageBucket: "emidb-1130.firebasestorage.app",
  messagingSenderId: "467390971948",
  appId: "1:467390971948:web:847f2e7d692ec532fad189",
  measurementId: "G-BQJP4NXY99"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db: Database = getDatabase(app);

// Attempt anonymous authentication so rules requiring auth succeed
try {
  const auth = getAuth(app);
  signInAnonymously(auth).catch(err => {
    console.warn('Anonymous auth notice:', err.message);
  });
} catch {}

// BroadcastChannel for instant local cross-tab sync
export const localSyncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('bomberword_dual_sync')
  : null;

export interface PlayerInput {
  dx: number;
  dy: number;
  bombSeq: number;
  updatedAt: number;
}

export interface PlayerSyncData {
  id: string;
  name: string;
  color: string;
  colorIdx: number;
  score: number;
  bombs: number;
  maxBombs: number;
  isGhost: boolean;
  stunnedUntil?: number;
  questionText: string;
  targetSymbol: string;
  spellingWord?: string;
  letterIndex?: number;
  options?: string[];
  correctAnswer?: string;
  input?: PlayerInput;
  reviveTrigger?: boolean;
  joinedAt: number;
  lastPing: number;
}

export interface RoomSettings {
  pin: string;
  subject: string;
  durationMinutes: number;
  maxPlayers: number;
  mysteryBoxes: boolean;
  status: 'waiting' | 'playing' | 'ended';
  createdAt: number;
  gameStartTime?: number;
  gameEndTime?: number;
}

// Global active Peer instance
let hostPeer: Peer | null = null;
let controllerPeer: Peer | null = null;
let controllerConn: DataConnection | null = null;
const hostConnections: Map<string, DataConnection> = new Map();

// Connection status listeners
type ConnectionStateListener = (status: {
  connected: boolean;
  type: 'firebase' | 'webrtc' | 'local' | 'connecting';
  details?: string;
}) => void;

const statusListeners: Set<ConnectionStateListener> = new Set();
let currentStatus: { connected: boolean; type: 'firebase' | 'webrtc' | 'local' | 'connecting'; details?: string } = {
  connected: false,
  type: 'connecting'
};

function notifyStatus(status: typeof currentStatus) {
  currentStatus = status;
  statusListeners.forEach(listener => listener(status));
}

export function subscribeNetworkStatus(callback: ConnectionStateListener): () => void {
  statusListeners.add(callback);
  callback(currentStatus);
  return () => {
    statusListeners.delete(callback);
  };
}

// 1. Firebase .info/connected listener
try {
  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snap) => {
    const isOnline = snap.val() === true;
    if (isOnline) {
      notifyStatus({ connected: true, type: 'firebase', details: 'Firebase Realtime DB' });
    } else {
      if (currentStatus.type === 'firebase') {
        notifyStatus({ connected: false, type: 'connecting', details: 'Riconnessione...' });
      }
    }
  }, () => {
    // If permission or network issue, fallback status
  });
} catch {}

/**
 * HOST: Starts WebRTC Peer listener for the given Room PIN
 */
export function initHostNetwork(
  pin: string,
  onPlayerJoin: (player: PlayerSyncData) => void,
  onPlayerInput: (playerId: string, input: PlayerInput) => void,
  onPlayerRevive: (playerId: string) => void
) {
  // Clean up any previous peer
  if (hostPeer && !hostPeer.destroyed) {
    hostPeer.destroy();
  }

  const hostPeerId = `bomberword-host-${pin}`;
  
  try {
    const peer = new Peer(hostPeerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    peer.on('open', (id) => {
      notifyStatus({ connected: true, type: 'webrtc', details: `Host P2P ID: ${id}` });
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        hostConnections.set(conn.peer, conn);
        notifyStatus({ connected: true, type: 'webrtc', details: 'Tablet Connesso' });
      });

      conn.on('data', (data: any) => {
        if (!data) return;
        if (data.type === 'JOIN' && data.player) {
          onPlayerJoin(data.player);
          // Broadcast to other tabs locally too
          localSyncChannel?.postMessage({ type: 'PLAYER_JOIN', pin, player: data.player });
        } else if (data.type === 'INPUT' && data.playerId && data.input) {
          onPlayerInput(data.playerId, data.input);
        } else if (data.type === 'REVIVE' && data.playerId) {
          onPlayerRevive(data.playerId);
        }
      });

      conn.on('close', () => {
        hostConnections.delete(conn.peer);
      });
      conn.on('error', () => {
        hostConnections.delete(conn.peer);
      });
    });

    peer.on('error', (err) => {
      console.warn('Host Peer notice:', err.type, err.message);
    });

    hostPeer = peer;
  } catch (err) {
    console.warn('PeerJS init failed, relying on Firebase and BroadcastChannel:', err);
  }

  // Also listen to Firebase
  const playersRef = ref(db, `rooms/${pin}/players`);
  const unsubFirebase = onValue(playersRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    Object.entries(data).forEach(([pId, pData]: [string, any]) => {
      if (!pData) return;
      onPlayerJoin(pData);
      if (pData.input) {
        onPlayerInput(pId, pData.input);
      }
      if (pData.reviveTrigger) {
        onPlayerRevive(pId);
      }
    });
  }, () => {});

  // Also listen to local BroadcastChannel
  const handleLocal = (e: MessageEvent) => {
    const data = e.data;
    if (!data || data.pin !== pin) return;
    if (data.type === 'PLAYER_JOIN' && data.player) {
      onPlayerJoin(data.player);
    } else if (data.type === 'PLAYER_INPUT' && data.playerId && data.input) {
      onPlayerInput(data.playerId, data.input);
    } else if (data.type === 'PLAYER_REVIVE' && data.playerId) {
      onPlayerRevive(data.playerId);
    }
  };
  localSyncChannel?.addEventListener('message', handleLocal);

  return () => {
    unsubFirebase();
    localSyncChannel?.removeEventListener('message', handleLocal);
    hostPeer?.destroy();
    hostPeer = null;
    hostConnections.clear();
  };
}

/**
 * HOST: Broadcasts updated state to all connected tablets (over WebRTC, Firebase and BroadcastChannel)
 */
export function broadcastHostState(pin: string, playersData: Record<string, Partial<PlayerSyncData>>) {
  // 1. Send via WebRTC DataConnections to all connected tablets
  const payload = { type: 'STATE_UPDATE', pin, players: playersData };
  hostConnections.forEach(conn => {
    if (conn.open) {
      try {
        conn.send(payload);
      } catch {}
    }
  });

  // 2. Send via local BroadcastChannel
  localSyncChannel?.postMessage(payload);

  // 3. Send to Firebase
  const updates: Record<string, any> = {};
  Object.entries(playersData).forEach(([pId, pData]) => {
    Object.entries(pData).forEach(([key, val]) => {
      updates[`rooms/${pin}/players/${pId}/${key}`] = val;
    });
  });
  if (Object.keys(updates).length > 0) {
    update(ref(db), updates).catch(() => {});
  }
}

/**
 * CONTROLLER: Connects to Host via WebRTC (PeerJS), Firebase and BroadcastChannel
 */
export function initControllerNetwork(
  pin: string,
  player: PlayerSyncData,
  onStateUpdate: (playerState: Partial<PlayerSyncData>) => void
) {
  const hostPeerId = `bomberword-host-${pin}`;
  let isConnectedWebrtc = false;

  // Clean up existing controller peer
  if (controllerPeer && !controllerPeer.destroyed) {
    controllerPeer.destroy();
  }

  // 1. Connect via WebRTC
  try {
    const peer = new Peer({
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    peer.on('open', () => {
      const conn = peer.connect(hostPeerId, { reliable: true });

      conn.on('open', () => {
        isConnectedWebrtc = true;
        controllerConn = conn;
        notifyStatus({ connected: true, type: 'webrtc', details: 'WebRTC P2P Connesso' });
        // Send join payload immediately over WebRTC
        conn.send({ type: 'JOIN', player });
      });

      conn.on('data', (data: any) => {
        if (!data) return;
        if (data.type === 'STATE_UPDATE' && data.players && data.players[player.id]) {
          onStateUpdate(data.players[player.id]);
        }
      });

      conn.on('close', () => {
        isConnectedWebrtc = false;
        controllerConn = null;
      });
      conn.on('error', () => {
        isConnectedWebrtc = false;
      });
    });

    peer.on('error', (err) => {
      console.warn('Controller Peer notice:', err.type);
    });

    controllerPeer = peer;
  } catch (err) {
    console.warn('Controller PeerJS init notice:', err);
  }

  // 2. Also send Join over Firebase & BroadcastChannel
  localSyncChannel?.postMessage({ type: 'PLAYER_JOIN', pin, player });
  const playerRef = ref(db, `rooms/${pin}/players/${player.id}`);
  set(playerRef, player).catch(() => {});

  // Listen for changes from Firebase
  const unsubFirebase = onValue(playerRef, (snap) => {
    const data = snap.val();
    if (data) {
      onStateUpdate(data);
    }
  }, () => {});

  // Listen for local BroadcastChannel
  const handleLocal = (e: MessageEvent) => {
    const data = e.data;
    if (!data || data.pin !== pin) return;
    if (data.type === 'STATE_UPDATE' && data.players && data.players[player.id]) {
      onStateUpdate(data.players[player.id]);
    }
  };
  localSyncChannel?.addEventListener('message', handleLocal);

  return {
    sendInput: (input: PlayerInput) => {
      // Send over WebRTC if open
      if (controllerConn && controllerConn.open) {
        try {
          controllerConn.send({ type: 'INPUT', playerId: player.id, input });
        } catch {}
      }
      // Send over local BroadcastChannel
      localSyncChannel?.postMessage({ type: 'PLAYER_INPUT', pin, playerId: player.id, input });
      // Send over Firebase
      set(ref(db, `rooms/${pin}/players/${player.id}/input`), input).catch(() => {});
    },
    sendRevive: () => {
      if (controllerConn && controllerConn.open) {
        try {
          controllerConn.send({ type: 'REVIVE', playerId: player.id });
        } catch {}
      }
      localSyncChannel?.postMessage({ type: 'PLAYER_REVIVE', pin, playerId: player.id });
      update(ref(db, `rooms/${pin}/players/${player.id}`), { reviveTrigger: true }).catch(() => {});
    },
    disconnect: () => {
      unsubFirebase();
      localSyncChannel?.removeEventListener('message', handleLocal);
      controllerConn?.close();
      controllerPeer?.destroy();
      controllerConn = null;
      controllerPeer = null;
    }
  };
}

export { ref, set, onValue, update, remove, onDisconnect };
