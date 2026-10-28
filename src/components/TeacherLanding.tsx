import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { SUBJECTS, SubjectType } from '../data/educationalData';
import { createOrUpdateRoom } from '../services/firebase';
import {
  Gamepad2,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  Play,
  Clock,
  Users,
  Sparkles,
  Info,
  RefreshCw,
  Monitor
} from 'lucide-react';

import { DbStatusBadge } from './DbStatusBadge';

interface TeacherLandingProps {
  onStartHost: (pin: string, subject: SubjectType, durationMinutes: number, maxPlayers: number, mysteryBoxes: boolean) => void;
  onOpenController: (pin: string) => void;
}

export const TeacherLanding: React.FC<TeacherLandingProps> = ({ onStartHost, onOpenController }) => {
  // Generate random 4-digit PIN
  const [pin, setPin] = useState<string>(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [subject, setSubject] = useState<SubjectType>('ortografia');
  const [durationMinutes, setDurationMinutes] = useState<number>(3);
  const [maxPlayers, setMaxPlayers] = useState<number>(6);
  const [mysteryBoxes, setMysteryBoxes] = useState<boolean>(true);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [useGithubUrl, setUseGithubUrl] = useState<boolean>(false);

  // Controller URLs
  const githubBaseUrl = `https://emilianomazzetti.github.io/bomberwor/?mode=controller&room=${pin}`;
  const localBaseUrl = `${window.location.origin}${window.location.pathname}?mode=controller&room=${pin}`;
  const activeControllerUrl = useGithubUrl ? githubBaseUrl : localBaseUrl;

  const regeneratePin = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPin(newPin);
  };

  useEffect(() => {
    QRCode.toDataURL(activeControllerUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Error generating QR', err));
  }, [activeControllerUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(activeControllerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
      prompt('Copia il link qui:', activeControllerUrl);
    }
  };

  const handleLaunchHost = () => {
    // Save initial room configuration to Firebase asynchronously
    createOrUpdateRoom(pin, {
      pin,
      subject,
      durationMinutes,
      maxPlayers,
      mysteryBoxes,
      status: 'waiting',
      createdAt: Date.now()
    }).catch(err => console.warn('Firebase sync notice:', err));

    // Immediately launch host screen without waiting on network
    onStartHost(pin, subject, durationMinutes, maxPlayers, mysteryBoxes);
  };

  const selectedSubjectMeta = SUBJECTS.find(s => s.id === subject) || SUBJECTS[0];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-['Fredoka',sans-serif]">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Main Header / Title */}
      <header className="relative z-10 text-center mb-6 max-w-4xl">
        <div className="flex flex-wrap items-center justify-center gap-3 mb-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-sm font-semibold tracking-wide">
            <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
            Multiplayer Didattico Dual-Screen per Scuola Primaria
          </div>
          <DbStatusBadge />
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white drop-shadow-md">
          BOMBER<span className="text-amber-400">WORD</span> 💣
        </h1>
        <p className="mt-2 text-slate-300 text-base sm:text-lg max-w-2xl mx-auto">
          La LIM proietta il labirinto multiplayer, gli alunni giocano e rispondono in tempo reale dai propri tablet!
        </p>
      </header>

      {/* 2-Columns Teacher Setup Layout */}
      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Column: Teacher Panel & QR Code (5 cols) */}
        <div className="lg:col-span-5 bg-slate-800/90 backdrop-blur-md rounded-2xl border-2 border-slate-700/80 p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                <QrCode className="w-5 h-5" />
                Pannello Docente & QR
              </div>
              <button
                onClick={regeneratePin}
                title="Genera nuovo PIN"
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-700/60 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Nuovo PIN
              </button>
            </div>

            {/* Big PIN Display */}
            <div className="text-center bg-slate-900/80 rounded-xl p-4 border border-slate-700 mb-5">
              <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block mb-1">
                PIN Stanza per i Tablet
              </span>
              <div className="text-5xl sm:text-6xl font-black tracking-widest text-amber-400 drop-shadow">
                {pin}
              </div>
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-inner mb-4">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code PIN ${pin}`}
                  className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-slate-400">
                  Generazione QR...
                </div>
              )}
              <span className="text-xs text-slate-700 font-bold mt-1 text-center">
                Inquadra con il tablet per entrare
              </span>
            </div>

            {/* Direct Link and Copy Button */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeControllerUrl}
                  className="w-full bg-slate-900/90 text-xs text-slate-300 px-3 py-2 rounded-lg border border-slate-700 select-all font-mono truncate"
                />
                <button
                  onClick={handleCopyLink}
                  className={`px-3 py-2 rounded-lg font-semibold text-xs flex items-center gap-1 transition shrink-0 ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiato!' : 'Copia'}
                </button>
              </div>

              {/* URL switch option for GitHub Pages vs Local Preview */}
              <div className="flex items-center justify-between text-xs text-slate-400 px-1 pt-1">
                <span>Destinazione Link:</span>
                <button
                  onClick={() => setUseGithubUrl(!useGithubUrl)}
                  className="underline hover:text-amber-300 transition"
                >
                  {useGithubUrl ? 'Usa Anteprima Locale' : 'Usa GitHub Pages'}
                </button>
              </div>
            </div>
          </div>

          {/* Quick test buttons */}
          <div className="mt-5 pt-4 border-t border-slate-700/80 flex flex-col gap-2">
            <button
              onClick={() => onOpenController(pin)}
              className="w-full bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              Apri Vista Tablet Alunno (in questa scheda)
            </button>
          </div>
        </div>

        {/* Right Column: Game Settings (7 cols) */}
        <div className="lg:col-span-7 bg-slate-800/90 backdrop-blur-md rounded-2xl border-2 border-slate-700/80 p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-700 pb-3 mb-5">
              <Gamepad2 className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Impostazioni della Partita</h2>
            </div>

            {/* 1. Subject / Topic Selection */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                1. Materia & Argomento Didattico
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUBJECTS.map(subj => {
                  const isSelected = subject === subj.id;
                  return (
                    <button
                      key={subj.id}
                      type="button"
                      onClick={() => setSubject(subj.id)}
                      className={`text-left p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/20 text-white'
                          : 'bg-slate-900/60 border-slate-700 hover:border-slate-600 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-2xl">{subj.icon}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {subj.badge}
                        </span>
                      </div>
                      <div className="font-bold text-sm text-white">{subj.title}</div>
                      <div className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {subj.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Duration & Max Players */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
              {/* Duration */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Durata Partita
                </label>
                <div className="flex items-center gap-1.5 bg-slate-900/60 p-1.5 rounded-xl border border-slate-700">
                  {[1, 2, 3, 4, 5].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setDurationMinutes(mins)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                        durationMinutes === mins
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Players */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Max Giocatori (1 - 10)
                </label>
                <div className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-700">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={maxPlayers}
                    onChange={e => setMaxPlayers(Number(e.target.value))}
                    className="flex-1 accent-amber-400 cursor-pointer"
                  />
                  <span className="font-black text-amber-400 text-base w-8 text-right">
                    {maxPlayers}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Mystery Boxes option */}
            <div className="bg-slate-900/50 p-3.5 rounded-xl border border-slate-700/80 flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📦</span>
                <div>
                  <div className="text-sm font-bold text-white">Scatole a Sorpresa Didattiche</div>
                  <div className="text-xs text-slate-400">
                    Distruggendo le casse con le bombe escono tessere e lettere premio
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mysteryBoxes}
                  onChange={e => setMysteryBoxes(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Quick Summary Note */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-200">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                Modalità: <strong>{selectedSubjectMeta.title}</strong> ({selectedSubjectMeta.badge}). Gli alunni guadagnano 1 bomba per ogni risposta corretta!
              </span>
            </div>
          </div>

          {/* Big Launch Host Button */}
          <div className="mt-6">
            <button
              onClick={handleLaunchHost}
              className="w-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-400 hover:to-red-400 text-slate-950 font-black text-lg sm:text-xl py-4 px-6 rounded-2xl shadow-xl hover:shadow-amber-500/30 transform hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3"
            >
              <Monitor className="w-6 h-6 text-slate-950" />
              AVVIA SCHERMO DOCENTE (HOST SULLA LIM)
              <Play className="w-5 h-5 fill-slate-950" />
            </button>
          </div>
        </div>

      </div>

      {/* Footer Instructions for School Classroom */}
      <footer className="relative z-10 mt-6 text-center text-xs text-slate-400 max-w-xl">
        Progettato per LIM, Smart Board e Tablet d'aula • Sincronizzazione in tempo reale con Firebase • Funziona su qualsiasi browser senza installazione.
      </footer>
    </div>
  );
};
