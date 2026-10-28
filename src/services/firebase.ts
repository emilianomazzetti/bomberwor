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
  projectId: "emidb-1130",
  storageBucket: "emidb-1130.firebasestorage.app",
  messagingSenderId: "467390971948",
  appId: "1:467390971948:web:847f2e7d692ec532fad189",
  measurementId: "G-BQJP4NXY99"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db: Database = getDatabase(app);

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

// Helper methods for Firebase room interactions
export async function createOrUpdateRoom(pin: string, settings: RoomSettings) {
  const roomRef = ref(db, `rooms/${pin}/settings`);
  await set(roomRef, settings);
}

export async function joinPlayerToRoom(pin: string, player: PlayerSyncData) {
  const playerRef = ref(db, `rooms/${pin}/players/${player.id}`);
  await set(playerRef, player);
  try {
    const disRef = onDisconnect(playerRef);
    await disRef.remove();
  } catch (err) {
    console.warn('onDisconnect not supported or failed', err);
  }
}

export async function sendPlayerInput(pin: string, playerId: string, input: PlayerInput) {
  const inputRef = ref(db, `rooms/${pin}/players/${playerId}/input`);
  await set(inputRef, input);
}

export async function updatePlayerData(pin: string, playerId: string, partial: Partial<PlayerSyncData>) {
  const pRef = ref(db, `rooms/${pin}/players/${playerId}`);
  await update(pRef, partial);
}

export async function removePlayerFromRoom(pin: string, playerId: string) {
  const pRef = ref(db, `rooms/${pin}/players/${playerId}`);
  await remove(pRef);
}

export async function deleteRoom(pin: string) {
  const roomRef = ref(db, `rooms/${pin}`);
  await remove(roomRef);
}

export { ref, set, onValue, update, remove, onDisconnect };
