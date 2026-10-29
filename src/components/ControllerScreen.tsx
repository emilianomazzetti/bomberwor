import React, { useState, useEffect, useRef } from 'react';
import { CHARACTER_OPTIONS } from '../data/characters';
import { initControllerNetwork, checkRoomIsActive } from '../services/networkSync';
import { soundEngine } from '../utils/audio';
import { DbStatusBadge } from './DbStatusBadge';
import {
  Bomb,
  Sparkles,
  Gamepad2,
  Zap,
  ArrowRight,
  RotateCcw,
  Ghost,
  Delete
} from 'lucide-react';

interface ControllerScreenProps {
  initialRoomPin?: string;
  onExit?: () => void;
}

function parseMathQuestion(text: string, serverAnswer?: string): {
  isMath: boolean;
  operation: string;
  expectedResult: string;
  slots: string[];
} {
  const clean = (text || '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  // Match patterns like "9 × 6", "9 x 6", "12 + 15", "50 - 18", "45 ÷ 5"
  const match = clean.match(/(\d+)\s*([×xX*+\-÷/])\s*(\d+)/);
  if (match) {
    const num1 = parseInt(match[1], 10);
    const op = match[2];
    const num2 = parseInt(match[3], 10);
    let res = 0;
    let opSymbol = op;
    if (op === '×' || op.toLowerCase() === 'x' || op === '*') {
      res = num1 * num2;
      opSymbol = '×';
    } else if (op === '+') {
      res = num1 + num2;
      opSymbol = '+';
    } else if (op === '-') {
      res = num1 - num2;
      opSymbol = '-';
    } else if (op === '÷' || op === '/') {
      res = Math.floor(num1 / num2);
      opSymbol = '÷';
    }

    const formattedOp = `${num1} ${opSymbol} ${num2}`;
    const expected = (serverAnswer && /^[0-9]+$/.test(serverAnswer.trim()))
      ? serverAnswer.trim()
      : res.toString();

    let slots: string[] = [];
    if (clean.includes('=')) {
      const right = clean.split('=')[1].trim();
      const parts = right.split(/\s+/).filter(Boolean);
      slots = parts.map(p => p.trim()).filter(Boolean);
    }
    if (slots.length === 0) {
      slots = Array.from({ length: expected.length }).map(() => '?');
    }

    return {
      isMath: true,
      operation: formattedOp,
      expectedResult: expected,
      slots
    };
  }

  if (serverAnswer && /^[0-9]+$/.test(serverAnswer.trim())) {
    return {
      isMath: true,
      operation: clean.split('=')[0]?.trim() || clean,
      expectedResult: serverAnswer.trim(),
      slots: Array.from({ length: serverAnswer.trim().length }).map(() => '?')
    };
  }

  return {
    isMath: false,
    operation: clean,
    expectedResult: '',
    slots: []
  };
}

export const ControllerScreen: React.FC<ControllerScreenProps> = ({
  initialRoomPin = '',
  onExit
}) => {
  // Setup / Join state
  const [pin, setPin] = useState<string>(initialRoomPin);
  const [playerName, setPlayerName] = useState<string>('');
  const [selectedColorIdx, setSelectedColorIdx] = useState<number>(0);
  const [joined, setJoined] = useState<boolean>(false);
  const [playerId] = useState<string>(() => `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
  const [checkingRoom, setCheckingRoom] = useState<boolean>(false);
  const [roomNotStartedError, setRoomNotStartedError] = useState<boolean>(false);

  // In-Game state received from Host via WebRTC/Firebase/BroadcastChannel
  const [score, setScore] = useState<number>(0);
  const [bombs, setBombs] = useState<number>(1);
  const [isGhost, setIsGhost] = useState<boolean>(false);
  const [questionText, setQuestionText] = useState<string>('Caricamento quesito...');
  const [targetSymbol, setTargetSymbol] = useState<string>('');
  const [spellingWord, setSpellingWord] = useState<string>('');
  const [letterIndex, setLetterIndex] = useState<number>(0);
  const [options, setOptions] = useState<string[]>([]);
  const [speedBonus, setSpeedBonus] = useState<number>(0);
  const [rangeBonus, setRangeBonus] = useState<number>(0);
  const [extraBombsBonus, setExtraBombsBonus] = useState<number>(0);
  const [correctAnswer, setCorrectAnswer] = useState<string>('');
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [bombRechargeSec, setBombRechargeSec] = useState<number>(0);

  // Mini quiz & Digipad state for ghost revival
  const [digipadInput, setDigipadInput] = useState<string>('');
  const [ghostQuizAnswered, setGhostQuizAnswered] = useState<boolean>(false);
  const [ghostFeedback, setGhostFeedback] = useState<string | null>(null);

  // Network controller handle
  const netRef = useRef<ReturnType<typeof initControllerNetwork> | null>(null);

  // Joystick state
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [stickPos, setStickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const bombSeqRef = useRef<number>(0);
  const inputIntervalRef = useRef<number | null>(null);
  const currentVectorRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Load saved name
  useEffect(() => {
    const savedName = localStorage.getItem('bomberword_player_name');
    if (savedName) setPlayerName(savedName);
  }, []);

  // Handle Join Game
  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    const cleanName = playerName.trim() || `Giocatore ${selectedColorIdx + 1}`;

    if (!cleanPin) {
      alert('Inserisci il PIN della stanza!');
      return;
    }

    setCheckingRoom(true);
    const isStarted = await checkRoomIsActive(cleanPin);
    setCheckingRoom(false);

    if (!isStarted) {
      setRoomNotStartedError(true);
      return;
    }

    localStorage.setItem('bomberword_player_name', cleanName);

    const newPlayer = {
      id: playerId,
      name: cleanName,
      color: CHARACTER_OPTIONS[selectedColorIdx].hex,
      colorIdx: selectedColorIdx,
      score: 0,
      bombs: 1,
      maxBombs: 3,
      isGhost: false,
      questionText: 'Pronto al via!',
      targetSymbol: '',
      joinedAt: Date.now(),
      lastPing: Date.now()
    };

    // Initialize network (WebRTC direct channel to LIM Host + Firebase Realtime DB + BroadcastChannel)
    const net = initControllerNetwork(cleanPin, newPlayer, (stateUpdate) => {
      if (stateUpdate.score !== undefined) setScore(stateUpdate.score);
      if (stateUpdate.bombs !== undefined) setBombs(stateUpdate.bombs);
      if (stateUpdate.isGhost !== undefined) setIsGhost(stateUpdate.isGhost);
      if (stateUpdate.questionText) setQuestionText(stateUpdate.questionText);
      if (stateUpdate.targetSymbol) setTargetSymbol(stateUpdate.targetSymbol);
      if (stateUpdate.spellingWord) setSpellingWord(stateUpdate.spellingWord);
      if (stateUpdate.letterIndex !== undefined) setLetterIndex(stateUpdate.letterIndex);
      if (stateUpdate.options) setOptions(stateUpdate.options);
      if (stateUpdate.correctAnswer) setCorrectAnswer(stateUpdate.correctAnswer);
      if (stateUpdate.speedBonus !== undefined) setSpeedBonus(stateUpdate.speedBonus);
      if (stateUpdate.rangeBonus !== undefined) setRangeBonus(stateUpdate.rangeBonus);
      if (stateUpdate.extraBombsBonus !== undefined) setExtraBombsBonus(stateUpdate.extraBombsBonus);
      if (stateUpdate.completedItems !== undefined) setCompletedItems(stateUpdate.completedItems);
      if (stateUpdate.bombRechargeSeconds !== undefined) setBombRechargeSec(stateUpdate.bombRechargeSeconds);
    });

    netRef.current = net;
    setJoined(true);
  };

  // Continuous input sender (every 45ms for buttery-smooth joystick)
  useEffect(() => {
    if (!joined || !pin) return;

    inputIntervalRef.current = window.setInterval(() => {
      netRef.current?.sendInput({
        dx: currentVectorRef.current.dx,
        dy: currentVectorRef.current.dy,
        bombSeq: bombSeqRef.current,
        updatedAt: Date.now()
      });
    }, 45);

    return () => {
      if (inputIntervalRef.current) clearInterval(inputIntervalRef.current);
    };
  }, [joined, pin]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      netRef.current?.disconnect();
    };
  }, []);

  // Virtual Joystick touch/pointer handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    updateJoystick(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updateJoystick(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
    setStickPos({ x: 0, y: 0 });
    currentVectorRef.current = { dx: 0, dy: 0 };
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    const base = joystickBaseRef.current;
    if (!base) return;

    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rawDx = clientX - centerX;
    const rawDy = clientY - centerY;
    const maxRadius = rect.width / 2 - 15;

    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(rawDy, rawDx);

    const clampedX = Math.cos(angle) * clampedDist;
    const clampedY = Math.sin(angle) * clampedDist;

    setStickPos({ x: clampedX, y: clampedY });

    // Normalized input vector (-1 to 1) with dead zone
    if (dist < 10) {
      currentVectorRef.current = { dx: 0, dy: 0 };
    } else {
      const norm = clampedDist / maxRadius;
      currentVectorRef.current = {
        dx: Math.cos(angle) * norm,
        dy: Math.sin(angle) * norm
      };
    }
  };

  // Drop Bomb Button Trigger
  const handleDropBomb = () => {
    if (isGhost) return;
    if (bombs <= 0) {
      if ('vibrate' in navigator) navigator.vibrate(30);
      return;
    }

    bombSeqRef.current += 1;
    // Immediate local decrement for snappy feel
    setBombs(prev => Math.max(0, prev - 1));

    // Instantly send input with current vector to maintain uninterrupted movement!
    netRef.current?.sendInput({
      dx: currentVectorRef.current.dx,
      dy: currentVectorRef.current.dy,
      bombSeq: bombSeqRef.current,
      updatedAt: Date.now()
    });

    if ('vibrate' in navigator) {
      navigator.vibrate([40, 30, 40]);
    }
  };

  // Ghost revival mini-quiz answer
  const handleGhostAnswer = (opt: string) => {
    const target = correctAnswer || spellingWord || targetSymbol;
    if (opt.toUpperCase() === target.toUpperCase()) {
      // Correct!
      setGhostFeedback('Corretto! Sei tornato in vita! 🌟');
      soundEngine.playCorrect();
      netRef.current?.sendRevive();
      setTimeout(() => {
        setGhostFeedback(null);
        setGhostQuizAnswered(false);
      }, 1200);
    } else {
      // Incorrect
      setGhostFeedback('Sbagliato! Riprova tra un istante... ❌');
      soundEngine.playWrong();
      setTimeout(() => setGhostFeedback(null), 1500);
    }
  };

  // Ghost revival Digipad logic for math
  const mathInfo = parseMathQuestion(questionText, correctAnswer || spellingWord);
  const mathTarget = mathInfo.expectedResult || (correctAnswer || spellingWord || '').trim();
  const mathTargetLen = mathTarget.length > 0 ? mathTarget.length : 2;

  const handleDigipadInput = (digit: string) => {
    if (digipadInput.length >= mathTargetLen) return;
    const nextVal = digipadInput + digit;
    setDigipadInput(nextVal);

    if (nextVal.length === mathTargetLen) {
      if (nextVal === mathTarget) {
        setGhostFeedback('Corretto! Sei tornato in vita! 🌟');
        soundEngine.playCorrect();
        netRef.current?.sendRevive();
        setTimeout(() => {
          setGhostFeedback(null);
          setDigipadInput('');
        }, 1200);
      } else {
        setGhostFeedback('Sbagliato! Riprova... ❌');
        soundEngine.playWrong();
        setTimeout(() => {
          setGhostFeedback(null);
          setDigipadInput('');
        }, 1000);
      }
    }
  };

  const handleDigipadBackspace = () => {
    setDigipadInput(prev => prev.slice(0, -1));
  };

  const handleDigipadClear = () => {
    setDigipadInput('');
  };

  const selectedChar = CHARACTER_OPTIONS[selectedColorIdx] || CHARACTER_OPTIONS[0];

  // 1. Setup / Join Screen
  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-['Fredoka',sans-serif]">
        <div className="w-full max-w-md bg-slate-800/90 backdrop-blur-md rounded-3xl border-2 border-slate-700 p-6 sm:p-8 shadow-2xl">
          
          <div className="text-center mb-6">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                <Gamepad2 className="w-4 h-4 text-amber-400" />
                Tablet Controller Alunno
              </div>
              <DbStatusBadge />
            </div>
            <h1 className="text-3xl font-black text-white">
              BOMBER<span className="text-amber-400">WORD</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Inserisci il PIN della LIM e scegli il tuo personaggio
            </p>
          </div>

          <form onSubmit={handleJoinGame} className="space-y-4">
            {/* PIN Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                PIN Stanza LIM
              </label>
              <input
                type="text"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="es. 7482"
                required
                className="w-full bg-slate-900 border-2 border-slate-700 focus:border-amber-400 rounded-xl px-4 py-3 text-center text-3xl font-black tracking-widest text-amber-400 focus:outline-none transition shadow-inner font-mono"
              />
            </div>

            {/* Nickname Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Tuo Nome o Nickname
              </label>
              <input
                type="text"
                maxLength={15}
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="es. Sofia o Marco"
                className="w-full bg-slate-900 border-2 border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2.5 text-base font-bold text-white focus:outline-none transition"
              />
            </div>

            {/* Character / Color Grid (10 Options) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Scegli il Tuo Colore ({selectedChar.colorName})
              </label>
              <div className="grid grid-cols-5 gap-2">
                {CHARACTER_OPTIONS.map(opt => {
                  const isSelected = selectedColorIdx === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedColorIdx(opt.id)}
                      className={`relative aspect-square rounded-xl border-2 transition-transform transform active:scale-95 flex items-center justify-center ${
                        isSelected
                          ? 'border-white scale-110 shadow-lg ring-4 ring-amber-400/40 z-10'
                          : 'border-slate-700/60 hover:scale-105 opacity-85'
                      }`}
                      style={{ backgroundColor: opt.hex }}
                    >
                      {isSelected && (
                        <div className="w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center text-[10px] text-slate-900 font-black">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Join Submit Button */}
            <button
              type="submit"
              disabled={checkingRoom}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-lg py-3.5 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center justify-center gap-2 mt-4 disabled:opacity-75 disabled:cursor-wait"
            >
              {checkingRoom ? (
                <>
                  <RotateCcw className="w-5 h-5 animate-spin" />
                  VERIFICA STANZA...
                </>
              ) : (
                <>
                  ENTRA IN GIOCO
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Room Not Started Error Modal */}
        {roomNotStartedError && (
          <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-2 border-red-500 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-4 text-red-400">
                <RotateCcw className="w-8 h-8" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mb-6 leading-relaxed uppercase tracking-wide">
                STANZA NON ANCORA AVVIATA PER ENTRARE ASPETTA CHE IL DOCENTE ABBIA PREMUTO SUL PULSANTE AVVIA SCHERMO DOCENTE
              </h2>
              <button
                type="button"
                onClick={() => {
                  setRoomNotStartedError(false);
                  if (onExit) {
                    onExit();
                  }
                }}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-base py-3.5 px-6 rounded-2xl shadow-xl transition transform active:scale-95"
              >
                TORNA ALLA PAGINA PRECEDENTE
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. In-Game Controller Interface
  return (
    <div className="h-screen w-screen bg-slate-950 text-white flex flex-col justify-between font-['Fredoka',sans-serif] select-none touch-none overflow-hidden p-3 sm:p-5">
      
      {/* Top Box: Educational Question & Player Inventory Banner */}
      <header className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl shrink-0">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
          
          {/* Player Identity */}
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-lg shrink-0 border border-white/20 shadow-sm flex items-center justify-center text-xs font-black text-white"
              style={{ backgroundColor: selectedChar.hex }}
            >
              {isGhost ? '👻' : selectedChar.colorName[0]}
            </div>
            <span className="font-bold text-sm text-slate-200 truncate">
              {playerName || selectedChar.name}
            </span>
          </div>

          {/* Bombs & Points Counter */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700">
              <span className="text-base">💣</span>
              <span className="font-black text-amber-400 text-base">{bombs}</span>
            </div>
            <div className="bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700">
              <span className="font-black text-emerald-400 text-base">{score}</span>
              <span className="text-[10px] text-slate-400 ml-1">pt</span>
            </div>
          </div>
        </div>

        {/* Central Educational Mission Box */}
        <div className="bg-gradient-to-r from-blue-950/90 via-slate-900/95 to-indigo-950/90 border-2 border-amber-400/60 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col items-center justify-center text-center">
          {mathInfo.isMath ? (
            <div className="w-full flex flex-col items-center justify-center">
              <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap my-1">
                <span className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-wider drop-shadow-md font-mono">
                  {mathInfo.operation}
                </span>
                <span className="text-3xl sm:text-5xl md:text-6xl font-black text-amber-400 mx-1 drop-shadow-md font-mono">
                  =
                </span>
                <div className="inline-flex items-center gap-2 sm:gap-3">
                  {mathInfo.slots.map((s, idx) => {
                    const isDigit = /^[0-9]$/.test(s);
                    return (
                      <span
                        key={idx}
                        className={`w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl font-black text-2xl sm:text-4xl md:text-5xl flex items-center justify-center shadow-xl transition-all ${
                          isDigit
                            ? 'bg-amber-400 text-slate-950 border-2 sm:border-3 border-white scale-105 shadow-amber-500/50'
                            : 'bg-slate-900/90 text-amber-300 border-2 sm:border-3 border-dashed border-slate-600'
                        }`}
                      >
                        {s}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-2xl sm:text-3xl font-black text-white tracking-wide py-2 truncate">
              {questionText.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim()}
            </div>
          )}
        </div>

        {/* Active Collected Bonuses Display (Prominent on Tablet Controller) */}
        {(speedBonus > 0 || extraBombsBonus > 0 || rangeBonus > 0) && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bonus Attivi:</span>
            {speedBonus > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-cyan-950/90 text-cyan-300 border border-cyan-400/50 px-2.5 py-1 rounded-lg text-xs font-black shadow-sm">
                <span className="text-sm">🪽</span> Ali Velocità +{speedBonus}
              </span>
            )}
            {extraBombsBonus > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-orange-950/90 text-orange-300 border border-orange-400/50 px-2.5 py-1 rounded-lg text-xs font-black shadow-sm">
                <span className="text-sm">💣</span> Bombe Extra +{extraBombsBonus}
              </span>
            )}
            {rangeBonus > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-red-950/90 text-red-300 border border-red-400/50 px-2.5 py-1 rounded-lg text-xs font-black shadow-sm">
                <span className="text-sm">🔥</span> Raggio Fiamma +{rangeBonus}
              </span>
            )}
          </div>
        )}

        {/* Recent Completed Words / Operations Bar */}
        {completedItems && completedItems.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 px-1 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Completati:</span>
            <div className="flex items-center gap-1 shrink-0">
              {completedItems.slice(-4).map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-lg font-black"
                >
                  ✓ {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main Touch Area: Virtual Analog Joystick on Left, Giant Bomb Button on Right */}
      <main className="flex-1 flex items-center justify-around gap-4 sm:gap-8 px-2 py-4 relative">
        
        {/* Ghost Revival Overlay (solid dark overlay without blur repaints) */}
        {isGhost && (
          <div className="absolute inset-0 z-30 bg-slate-950/95 rounded-3xl border-2 border-purple-500 p-4 sm:p-6 flex flex-col items-center justify-center text-center shadow-2xl overflow-y-auto">
            <Ghost className="w-12 h-12 text-purple-300 mb-1 shrink-0 animate-bounce" />
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-0.5">SEI UN FANTASMA! 👻</h2>
            <p className="text-xs sm:text-sm text-purple-200 max-w-xs mb-3 font-semibold">
              Risolvi l'operazione sul tastierino per tornare subito in gioco sulla LIM!
            </p>

            {mathInfo.isMath ? (
              <div className="bg-slate-900 border-2 border-purple-400/60 p-4 rounded-2xl w-full max-w-xs mb-2 shadow-2xl text-center">
                <div className="text-xs uppercase tracking-widest font-black text-purple-300 mb-2">
                  Digita il risultato completo:
                </div>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {mathInfo.operation}
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">=</span>
                  <div className="inline-flex items-center gap-1.5">
                    {Array.from({ length: mathTargetLen }).map((_, idx) => {
                      const digitChar = digipadInput[idx];
                      return (
                        <span
                          key={idx}
                          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl font-black text-2xl flex items-center justify-center border-2 transition-all ${
                            digitChar
                              ? 'bg-amber-400 text-slate-950 border-white shadow-md'
                              : 'bg-slate-950 text-amber-300/80 border-dashed border-slate-600'
                          }`}
                        >
                          {digitChar || '?'}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* 3x4 Digipad Keypad matching user sketch */}
                <div className="grid grid-cols-3 gap-2 w-full max-w-[240px] mx-auto select-none">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleDigipadInput(d)}
                      className="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 text-white font-black text-xl sm:text-2xl rounded-xl border border-slate-600 shadow-md active:scale-95 transition flex items-center justify-center select-none"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleDigipadClear}
                    className="aspect-square bg-red-950/90 hover:bg-red-900 active:scale-95 text-red-300 font-black text-lg rounded-xl border border-red-700/60 shadow-md transition flex items-center justify-center select-none"
                    title="Cancella tutto"
                  >
                    C
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigipadInput('0')}
                    className="aspect-square bg-slate-800 hover:bg-slate-700 active:bg-amber-500 active:text-slate-950 text-white font-black text-xl sm:text-2xl rounded-xl border border-slate-600 shadow-md active:scale-95 transition flex items-center justify-center select-none"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleDigipadBackspace}
                    className="aspect-square bg-amber-950/90 hover:bg-amber-900 active:scale-95 text-amber-300 font-black text-lg rounded-xl border border-amber-700/60 shadow-md transition flex items-center justify-center select-none"
                    title="Cancella ultima cifra"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-purple-900/80 p-3 rounded-2xl border border-purple-400/40 w-full max-w-sm mb-4 shadow-lg">
                <div className="text-base font-bold text-amber-300 mb-3">
                  {questionText.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim()}
                </div>
                {options && options.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => handleGhostAnswer(opt)}
                        className="bg-purple-800 hover:bg-purple-700 active:scale-95 text-white font-black text-sm py-2.5 px-3 rounded-xl border border-purple-400 transition"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ghostFeedback && (
              <div className="text-sm sm:text-base font-bold text-amber-300 px-4 py-2 bg-slate-900/95 rounded-xl border border-purple-500/50 shadow-lg mt-2">
                {ghostFeedback}
              </div>
            )}
          </div>
        )}

        {/* 1. Left Side: Virtual Analog Joystick */}
        <div className="flex flex-col items-center justify-center">
          <div
            ref={joystickBaseRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-slate-900/90 border-4 border-slate-700 shadow-2xl relative flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          >
            {/* Guide directional arrows */}
            <div className="absolute top-2 text-slate-600 font-bold text-xs">▲</div>
            <div className="absolute bottom-2 text-slate-600 font-bold text-xs">▼</div>
            <div className="absolute left-2 text-slate-600 font-bold text-xs">◀</div>
            <div className="absolute right-2 text-slate-600 font-bold text-xs">▶</div>

            {/* Inner center ring */}
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-800 pointer-events-none" />

            {/* Draggable Knob */}
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-2xl absolute pointer-events-none flex items-center justify-center transition-transform duration-75 border-2 border-white/40"
              style={{
                transform: `translate(${stickPos.x}px, ${stickPos.y}px)`,
                backgroundColor: selectedChar.hex
              }}
            >
              <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center text-white font-black text-xs">
                ●
              </div>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-semibold mt-2">
            Joystick Movimento
          </span>
        </div>

        {/* 2. Right Side: Big "SGANCIA BOMBA" Action Button */}
        <div className="flex flex-col items-center justify-center">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDropBomb();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDropBomb();
            }}
            onClick={handleDropBomb}
            disabled={isGhost}
            style={{ touchAction: 'none' }}
            className={`w-40 h-40 sm:w-52 sm:h-52 rounded-full border-4 shadow-2xl flex flex-col items-center justify-center transition-all transform active:scale-90 active:shadow-inner select-none ${
              bombs > 0 && !isGhost
                ? 'bg-gradient-to-tr from-red-600 via-orange-600 to-amber-500 hover:from-red-500 hover:to-amber-400 border-amber-300 cursor-pointer shadow-red-500/30'
                : 'bg-slate-900 border-amber-500/60 ring-4 ring-amber-500/20 shadow-lg cursor-not-allowed opacity-90'
            }`}
          >
            <Bomb className={`w-12 h-12 sm:w-16 sm:h-16 drop-shadow mb-1 ${bombs > 0 ? 'text-white animate-pulse' : 'text-amber-400 animate-bounce'}`} />
            <span className="font-black text-white text-base sm:text-xl uppercase tracking-wider drop-shadow mt-0.5">
              {bombs > 0 ? 'SGANCIA BOMBA' : 'RICARICA...'}
            </span>
            <span className={`text-xs font-bold mt-1 text-center px-2 ${bombs > 0 ? 'text-amber-200' : 'text-amber-300'}`}>
              {bombs > 0 ? `${bombs} pronte` : `⏳ Nuova bomba in ${bombRechargeSec || 3}s`}
            </span>
          </button>
          <span className="text-xs text-slate-400 font-semibold mt-2">
            Piazza Bomba (3s)
          </span>
        </div>

      </main>

      {/* Footer Info Bar */}
      <footer className="text-center text-[11px] text-slate-400 flex items-center justify-between px-2 shrink-0">
        <span>Stanza: <strong className="text-amber-400">{pin}</strong></span>
        <span>Guida il personaggio verso la tessera giusta!</span>
      </footer>

    </div>
  );
};
