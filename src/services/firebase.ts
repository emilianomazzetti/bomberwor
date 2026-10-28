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

export const firebaseConfig = {
  apiKey: "AIzaSyCq5M8ohsilIaOt-Wh525zdiY50oelVUkQ",
  authDomain: "emidb-1130.firebaseapp.com",
  databaseURL: "https://emidb-1130-default-rtdb.firebaseio.com",
  projectId: "emidb-1130",
  storageBucket: "emidb-1130.firebasestorage.app",
  messagingSenderId: "467390971948",
  appId: "1:467390971948:web:847f2e7d692ec532fad189",
  measurementId: "G-BQJP4NXY99"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db: Database = getDatabase(app);

// Local BroadcastChannel for instant local zero-latency cross-tab sync
export const localSyncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('bomberword_dual_sync')
  : null;

export interface PlayerInput {
  dx: number;
  dy: number;
  bombSeq: number; // incremented whenever bomb button pressed
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

/**
 * Subscribes to Firebase database connection state
 */
export function subscribeConnectionStatus(callback: (connected: boolean) => void): () => void {
  try {
    const connectedRef = ref(db, '.info/connected');
    return onValue(connectedRef, (snap) => {
      const isOnline = snap.val() === true;
      callback(isOnline);
    }, (error) => {
      console.warn('Connection listener notice:', error);
      callback(false);
    });
  } catch (err) {
    console.warn('Failed to attach connection listener:', err);
    callback(false);
    return () => {};
  }
}

/**
 * Non-blocking room creation / update (Firebase + local BroadcastChannel)
 */
export async function createOrUpdateRoom(pin: string, settings: RoomSettings): Promise<void> {
  // Broadcast locally immediately
  localSyncChannel?.postMessage({ type: 'ROOM_SETTINGS', pin, settings });

  // Fire to Firebase with short race timeout so UI never hangs
  const roomRef = ref(db, `rooms/${pin}/settings`);
  try {
    await Promise.race([
      set(roomRef, settings),
      new Promise<void>((resolve) => setTimeout(resolve, 500))
    ]);
  } catch (err) {
    console.warn('Firebase set room notice:', err);
  }
}

/**
 * Non-blocking player join (Firebase + local BroadcastChannel)
 */
export async function joinPlayerToRoom(pin: string, player: PlayerSyncData): Promise<void> {
  // Broadcast locally immediately
  localSyncChannel?.postMessage({ type: 'PLAYER_JOIN', pin, player });

  const playerRef = ref(db, `rooms/${pin}/players/${player.id}`);
  try {
    const disRef = onDisconnect(playerRef);
    disRef.remove().catch(() => {});
  } catch {}

  try {
    await Promise.race([
      set(playerRef, player),
      new Promise<void>((resolve) => setTimeout(resolve, 500))
    ]);
  } catch (err) {
    console.warn('Firebase join notice:', err);
  }
}

/**
 * Fast input dispatcher (Local BroadcastChannel + Firebase)
 */
export async function sendPlayerInput(pin: string, playerId: string, input: PlayerInput): Promise<void> {
  localSyncChannel?.postMessage({ type: 'PLAYER_INPUT', pin, playerId, input });
  const inputRef = ref(db, `rooms/${pin}/players/${playerId}/input`);
  set(inputRef, input).catch(() => {});
}

/**
 * Fast player data update (Local BroadcastChannel + Firebase)
 */
export async function updatePlayerData(pin: string, playerId: string, partial: Partial<PlayerSyncData>): Promise<void> {
  localSyncChannel?.postMessage({ type: 'PLAYER_UPDATE', pin, playerId, partial });
  const pRef = ref(db, `rooms/${pin}/players/${playerId}`);
  update(pRef, partial).catch(() => {});
}

export async function removePlayerFromRoom(pin: string, playerId: string): Promise<void> {
  localSyncChannel?.postMessage({ type: 'PLAYER_LEAVE', pin, playerId });
  const pRef = ref(db, `rooms/${pin}/players/${playerId}`);
  remove(pRef).catch(() => {});
}

export async function deleteRoom(pin: string): Promise<void> {
  const roomRef = ref(db, `rooms/${pin}`);
  remove(roomRef).catch(() => {});
}

export { ref, set, onValue, update, remove, onDisconnect };
