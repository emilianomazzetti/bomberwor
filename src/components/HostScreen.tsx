import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '../game/GameEngine';
import { SubjectType, SUBJECTS } from '../data/educationalData';
import { CHARACTER_OPTIONS } from '../data/characters';
import { soundEngine } from '../utils/audio';
import { initHostNetwork, broadcastHostState, markRoomActive, PlayerSyncData, PlayerInput } from '../services/networkSync';
import { DbStatusBadge } from './DbStatusBadge';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Volume2,
  VolumeX,
  QrCode,
  RotateCcw,
  Bot,
  ExternalLink,
  Sparkles,
  ArrowLeft,
  X
} from 'lucide-react';

interface HostScreenProps {
  pin: string;
  subject: SubjectType;
  durationMinutes: number;
  maxPlayers: number;
  mysteryBoxes: boolean;
  onBackToLanding: () => void;
}

export const HostScreen: React.FC<HostScreenProps> = ({
  pin,
  subject,
  durationMinutes,
  maxPlayers,
  mysteryBoxes,
  onBackToLanding
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Match state
  const [timeLeft, setTimeLeft] = useState<number>(durationMinutes * 60);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [botCount, setBotCount] = useState<number>(0);
  const [playersList, setPlayersList] = useState<Array<{
    id: string;
    name: string;
    colorIdx: number;
    score: number;
    bombs: number;
    isGhost: boolean;
    questionText: string;
    targetSymbol: string;
    speedBonus?: number;
    rangeBonus?: number;
    extraBombsBonus?: number;
    completedItems?: string[];
  }>>([]);

  const activeControllerUrl = `${window.location.origin}${window.location.pathname}?mode=controller&room=${pin}`;

  // Initialize QR for late joiners
  useEffect(() => {
    QRCode.toDataURL(activeControllerUrl, { width: 300, margin: 2 })
      .then(url => setQrUrl(url))
      .catch(console.error);
  }, [activeControllerUrl]);

  // Sync state helper
  const refreshPlayersList = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const list: typeof playersList = [];
    const updates: Record<string, Partial<PlayerSyncData>> = {};

    engine.players.forEach(p => {
      if (!p.isAdversary) {
        list.push({
          id: p.id,
          name: p.name,
          colorIdx: p.colorIdx,
          score: p.score,
          bombs: p.bombs,
          isGhost: p.isGhost,
          questionText: p.questionText,
          targetSymbol: p.targetSymbol,
          speedBonus: p.speedBonus,
          rangeBonus: p.rangeBonus,
          extraBombsBonus: p.extraBombsBonus,
          completedItems: [...p.completedItems]
        });
      }

      updates[p.id] = {
        score: p.score,
        bombs: p.bombs,
        isGhost: p.isGhost,
        questionText: p.questionText,
        targetSymbol: p.targetSymbol,
        spellingWord: p.spellingWord,
        letterIndex: p.letterIndex,
        options: p.options,
        correctAnswer: p.correctAnswer,
        speedBonus: p.speedBonus,
        rangeBonus: p.rangeBonus,
        extraBombsBonus: p.extraBombsBonus,
        completedItems: [...p.completedItems],
        bombRechargeSeconds: p.bombRechargeTimer > 0 ? Math.ceil(p.bombRechargeTimer / 60) : 0
      };
    });

    setPlayersList(list);
    broadcastHostState(pin, updates);
  }, [pin]);

  // Initialize Game Engine & Network Listeners (WebRTC P2P + Firebase + BroadcastChannel)
  useEffect(() => {
    markRoomActive(pin, subject);
    const engine = new GameEngine(subject);
    engine.subject = subject;
    engine.mysteryBoxes = mysteryBoxes;
    engine.gameTimerSeconds = durationMinutes * 60;
    engineRef.current = engine;

    const cleanupNetwork = initHostNetwork(
      pin,
      // onPlayerJoin
      (pData: PlayerSyncData) => {
        engine.addOrUpdatePlayer(
          pData.id,
          pData.name || `Player`,
          pData.colorIdx ?? 0,
          subject
        );
        refreshPlayersList();
      },
      // onPlayerInput
      (pId: string, input: PlayerInput) => {
        engine.updatePlayerInput(
          pId,
          input.dx || 0,
          input.dy || 0,
          input.bombSeq || 0
        );
      },
      // onPlayerRevive
      (pId: string) => {
        engine.reviveGhost(pId);
        refreshPlayersList();
      }
    );

    return () => {
      cleanupNetwork();
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [pin, subject, mysteryBoxes, durationMinutes, refreshPlayersList]);

  // Periodic state broadcast to all controllers (every 200ms)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (!isGameOver) {
        refreshPlayersList();
      }
    }, 200);

    return () => clearInterval(syncInterval);
  }, [isGameOver, refreshPlayersList]);

  // Main 60 FPS Render & Physics Loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      const canvas = canvasRef.current;
      const engine = engineRef.current;

      if (canvas && engine) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // If match is active, update physics
          if (!isGameOver) {
            engine.update();
          }
          engine.render(ctx, canvas.width, canvas.height);
        }
      }

      animationFrameId.current = requestAnimationFrame(loop);
    };

    animationFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isGameOver]);

  // Countdown Match Timer
  useEffect(() => {
    if (isGameOver) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          triggerGameOver();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isGameOver]);

  const triggerGameOver = useCallback(() => {
    setIsGameOver(true);
    soundEngine.playGameEnd();
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { y: 0.4 }
    });
  }, []);

  const handleToggleMute = () => {
    const isM = soundEngine.toggleMute();
    setMuted(isM);
  };

  const handleAddBot = () => {
    const engine = engineRef.current;
    if (!engine) return;

    const nextBotIdx = botCount + 1;
    const botId = `bot_${nextBotIdx}_${Date.now()}`;
    const botColorIdx = (playersList.length + 1) % CHARACTER_OPTIONS.length;
    const botNames = ['Alunno Leo', 'Alunna Sofia', 'Alunno Marco', 'Alunna Giulia', 'Alunno Luca', 'Alunna Emma'];
    const botName = botNames[botCount % botNames.length] || `Bot ${nextBotIdx}`;

    const player = engine.addOrUpdatePlayer(botId, botName, botColorIdx, subject);
    setBotCount(prev => prev + 1);

    // Give bot an autonomous AI behavior interval
    const botInterval = setInterval(() => {
      if (!engine.players.has(botId)) {
        clearInterval(botInterval);
        return;
      }

      const p = engine.players.get(botId);
      if (!p) return;

      // Bot movement: steer towards nearest target educational tile
      const targetTile = engine.eduTiles.find(t => t.symbol.toUpperCase() === p.targetSymbol.toUpperCase()) || engine.eduTiles[0];

      if (targetTile && Math.random() < 0.85) {
        const dx = (targetTile.x + 0.5) - p.x;
        const dy = (targetTile.y + 0.5) - p.y;
        p.input.dx = Math.sign(dx) * 0.9;
        p.input.dy = Math.sign(dy) * 0.9;
      } else {
        // Random wandering
        const angles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
        const a = angles[Math.floor(Math.random() * angles.length)];
        p.input.dx = Math.cos(a) * 0.8;
        p.input.dy = Math.sin(a) * 0.8;
      }

      // Occasionally drop a bomb if near a crate
      if (Math.random() < 0.08 && p.bombs > 0 && !p.isGhost) {
        p.input.bombSeq += 1;
      }
    }, 450);
  };

  const handleRestartMatch = () => {
    setIsGameOver(false);
    setTimeLeft(durationMinutes * 60);
    const engine = engineRef.current;
    if (engine) {
      engine.initGrid();
      engine.players.forEach(p => {
        p.score = 0;
        p.bombs = 1;
        p.isGhost = false;
      });
    }
  };

  // Format MM:SS
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isTimeCritical = timeLeft < 30;

  const currentSubjectMeta = SUBJECTS.find(s => s.id === subject) || SUBJECTS[0];

  // Sorted leaderboard
  const sortedLeaderboard = [...playersList].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Fredoka',sans-serif] select-none overflow-hidden">
      
      {/* Top HUD Bar optimized for LIM readability */}
      <header className="bg-slate-900 border-b-2 border-slate-800 px-4 py-2.5 flex items-center justify-between gap-4 shadow-lg shrink-0">
        
        {/* Left: Game Title, Subject Badge & Room PIN */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLanding}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Torna al Setup Docente"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-xl text-white tracking-wide">
                BOMBER<span className="text-amber-400">WORD</span>
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                {currentSubjectMeta.icon} {currentSubjectMeta.title}
              </span>
              <DbStatusBadge />
            </div>
            <div className="text-xs text-slate-400">
              PIN Stanza LIM: <strong className="text-amber-400 tracking-widest text-sm">{pin}</strong>
            </div>
          </div>
        </div>

        {/* Center: Big Countdown Timer for the Classroom */}
        <div className="flex items-center gap-3">
          <div
            className={`px-5 py-1.5 rounded-xl border-2 flex items-center gap-2 transition-all ${
              isTimeCritical
                ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                : 'bg-slate-800 border-slate-700 text-amber-400'
            }`}
          >
            <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">TEMPO</span>
            <span className="font-['Press_Start_2P',monospace] text-2xl tracking-wider">
              {timeFormatted}
            </span>
          </div>
        </div>

        {/* Right: Sound, QR code modal & Quick test controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <QrCode className="w-4 h-4 text-amber-400" />
            Mostra QR Tablet
          </button>

          <button
            onClick={handleAddBot}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-xs font-semibold text-emerald-300 transition"
            title="Aggiunge un alunno virtuale per testare subito la mappa"
          >
            <Bot className="w-3.5 h-3.5" />
            + Alunno Bot
          </button>

          <button
            onClick={handleToggleMute}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            title={muted ? 'Riattiva Audio' : 'Disattiva Audio'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* Main Game Arena + Sidebar Layout */}
      <div className="flex-1 flex flex-col lg:flex-row items-stretch justify-center p-3 gap-4 overflow-hidden max-w-[1920px] mx-auto w-full">
        
        {/* Central Arena Canvas (Bomberman Map) */}
        <div className="flex-1 flex items-center justify-center relative bg-slate-900 rounded-2xl border-2 border-slate-800 p-2 shadow-2xl overflow-hidden min-h-[460px]">
          <canvas
            ref={canvasRef}
            width={1050}
            height={650}
            className="w-full h-full max-h-[85vh] object-contain rounded-xl shadow-inner border border-slate-800"
          />

          {/* Quick instructions pill at bottom of canvas */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-700/80 text-xs text-slate-300 flex items-center gap-3 pointer-events-none">
            <span>Raccogli la tua tessera 🔤</span>
            <span>•</span>
            <span>Guadagna +1 Bomba 💣</span>
            <span>•</span>
            <span>Attento alle esplosioni 🔥</span>
          </div>
        </div>

        {/* Right Sidebar: Realtime Pupils Board & Leaderboard (Up to 10 players) */}
        <aside className="w-full lg:w-80 xl:w-96 bg-slate-900 rounded-2xl border-2 border-slate-800 p-4 flex flex-col justify-between shadow-xl shrink-0">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                <Trophy className="w-4 h-4 text-amber-400" />
                Alunni Connessi ({playersList.length}/{maxPlayers})
              </div>
              <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-semibold">
                Classifica Live
              </span>
            </div>

            {/* Players cards list */}
            {playersList.length === 0 ? (
              <div className="text-center py-10 px-4 bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-2xl mb-2">
                  📱
                </div>
                <div className="text-sm font-bold text-slate-300">In attesa degli alunni...</div>
                <div className="text-xs text-slate-400 mt-1">
                  Gli alunni devono inserire il PIN <strong className="text-amber-400">{pin}</strong> sul loro tablet.
                </div>
                <button
                  onClick={handleAddBot}
                  className="mt-4 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <Bot className="w-3.5 h-3.5" /> Aggiungi Alunno di Prova
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-1">
                {sortedLeaderboard.map((player, index) => {
                  const char = CHARACTER_OPTIONS[player.colorIdx] || CHARACTER_OPTIONS[0];
                  return (
                    <div
                      key={player.id}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                        player.isGhost
                          ? 'bg-slate-800/40 border-purple-500/40 opacity-75'
                          : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Rank Badge */}
                        <span className={`w-5 text-center text-xs font-black ${
                          index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-amber-600' : 'text-slate-400'
                        }`}>
                          #{index + 1}
                        </span>

                        {/* Player Colored Avatar Dot */}
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-md shrink-0 border border-white/20"
                          style={{ backgroundColor: char.hex }}
                        >
                          {player.isGhost ? '👻' : char.name.split(' ')[1]?.[0] || 'B'}
                        </div>

                        {/* Name and Target Letter */}
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{player.name}</span>
                            {player.isGhost && (
                              <span className="text-[10px] bg-purple-900/80 text-purple-200 px-1.5 py-0.2 rounded font-bold">
                                FANTASMA
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                            <span className="font-bold text-amber-300 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-700">
                              {(player.questionText || '...').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim()}
                            </span>
                          </div>

                          {/* Completed Words / Operations Badges in Live Scoreboard */}
                          {player.completedItems && player.completedItems.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1 max-w-[200px]">
                              {player.completedItems.map((item, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded-md font-bold"
                                >
                                  ✓ {item}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Score, Bomb Count & Small Bonus Badges */}
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-xs bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                            <span className="text-amber-400 font-black text-sm">{player.score}</span>
                            <span className="text-[10px] text-slate-400 ml-1">pt</span>
                          </div>
                          <div className="flex items-center text-xs font-bold text-slate-300" title="Bombe disponibili">
                            💣 {player.bombs}
                          </div>
                        </div>

                        {/* Small Active Bonuses in LIM Scoreboard */}
                        {((player.speedBonus ?? 0) > 0 || (player.extraBombsBonus ?? 0) > 0 || (player.rangeBonus ?? 0) > 0) && (
                          <div className="flex items-center gap-1 text-[10px]">
                            {(player.speedBonus ?? 0) > 0 && (
                              <span className="bg-cyan-950 text-cyan-300 border border-cyan-500/30 px-1 py-0.2 rounded font-black" title="Ali Velocità">
                                🪽+{player.speedBonus}
                              </span>
                            )}
                            {(player.extraBombsBonus ?? 0) > 0 && (
                              <span className="bg-orange-950 text-orange-300 border border-orange-500/30 px-1 py-0.2 rounded font-black" title="Bombe Extra">
                                💣+{player.extraBombsBonus}
                              </span>
                            )}
                            {(player.rangeBonus ?? 0) > 0 && (
                              <span className="bg-red-950 text-red-300 border border-red-500/30 px-1 py-0.2 rounded font-black" title="Raggio Fiamma">
                                🔥+{player.rangeBonus}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick link to open tablet in new window */}
          <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
            <a
              href={activeControllerUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              Apri Vista Tablet Alunno
            </a>
          </div>
        </aside>
      </div>

      {/* QR Code Popup Modal (For pupils scanning from LIM) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white mb-1">Connetti il Tablet</h3>
            <p className="text-xs text-slate-300 mb-4">
              Inquadra questo QR con la fotocamera del tablet o inserisci il PIN:
            </p>
            <div className="text-4xl font-black text-amber-400 tracking-widest bg-slate-950 p-2 rounded-xl mb-4 border border-slate-800">
              {pin}
            </div>
            {qrUrl && (
              <img
                src={qrUrl}
                alt="QR Code Controller"
                className="w-56 h-56 mx-auto rounded-xl bg-white p-2 shadow-md mb-4"
              />
            )}
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition"
            >
              Chiudi e Torna al Gioco
            </button>
          </div>
        </div>
      )}

      {/* Game Over / Podium Modal */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold mb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              TEMPO SCADUTO • PARTITA CONCLUSA!
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              🏆 CLASSIFICA FINALE 🏆
            </h2>

            {/* Podium Display */}
            {sortedLeaderboard.length > 0 ? (
              <div className="space-y-2 mb-6 text-left">
                {sortedLeaderboard.slice(0, 5).map((p, i) => {
                  const char = CHARACTER_OPTIONS[p.colorIdx] || CHARACTER_OPTIONS[0];
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        i === 0
                          ? 'bg-amber-500/20 border-amber-400 text-white shadow-lg'
                          : 'bg-slate-800/80 border-slate-700 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-black text-lg w-6 text-center">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </span>
                        <div
                          className="w-7 h-7 rounded-lg shrink-0"
                          style={{ backgroundColor: char.hex }}
                        />
                        <span className="font-bold text-base truncate">{p.name}</span>
                      </div>
                      <span className="font-black text-amber-400 text-lg">
                        {p.score} punti
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-400 text-sm py-6">Nessun punteggio registrato.</div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleRestartMatch}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base flex items-center justify-center gap-2 transition"
              >
                <RotateCcw className="w-5 h-5" />
                Gioca Ancora
              </button>
              <button
                onClick={onBackToLanding}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition"
              >
                Setup Docente
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
