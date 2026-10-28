export interface CharacterOption {
  id: number;
  name: string;
  colorName: string;
  hex: string;
  accentHex: string;
  badgeBg: string;
  borderColor: string;
  hueRotateDeg: number;
}

export const CHARACTER_OPTIONS: CharacterOption[] = [
  {
    id: 0,
    name: 'Bomber Rosso',
    colorName: 'Rosso',
    hex: '#ef4444',
    accentHex: '#b91c1c',
    badgeBg: 'bg-red-500',
    borderColor: 'border-red-500',
    hueRotateDeg: 0 // base
  },
  {
    id: 1,
    name: 'Bomber Blu',
    colorName: 'Blu',
    hex: '#3b82f6',
    accentHex: '#1d4ed8',
    badgeBg: 'bg-blue-500',
    borderColor: 'border-blue-500',
    hueRotateDeg: 220
  },
  {
    id: 2,
    name: 'Bomber Verde',
    colorName: 'Verde',
    hex: '#10b981',
    accentHex: '#047857',
    badgeBg: 'bg-emerald-500',
    borderColor: 'border-emerald-500',
    hueRotateDeg: 110
  },
  {
    id: 3,
    name: 'Bomber Giallo',
    colorName: 'Giallo',
    hex: '#f59e0b',
    accentHex: '#b45309',
    badgeBg: 'bg-amber-500',
    borderColor: 'border-amber-500',
    hueRotateDeg: 55
  },
  {
    id: 4,
    name: 'Bomber Viola',
    colorName: 'Viola',
    hex: '#8b5cf6',
    accentHex: '#6d28d9',
    badgeBg: 'bg-purple-500',
    borderColor: 'border-purple-500',
    hueRotateDeg: 270
  },
  {
    id: 5,
    name: 'Bomber Arancio',
    colorName: 'Arancione',
    hex: '#f97316',
    accentHex: '#c2410c',
    badgeBg: 'bg-orange-500',
    borderColor: 'border-orange-500',
    hueRotateDeg: 25
  },
  {
    id: 6,
    name: 'Bomber Ciano',
    colorName: 'Ciano',
    hex: '#06b6d4',
    accentHex: '#0e7490',
    badgeBg: 'bg-cyan-500',
    borderColor: 'border-cyan-500',
    hueRotateDeg: 180
  },
  {
    id: 7,
    name: 'Bomber Rosa',
    colorName: 'Rosa',
    hex: '#ec4899',
    accentHex: '#be185d',
    badgeBg: 'bg-pink-500',
    borderColor: 'border-pink-500',
    hueRotateDeg: 320
  },
  {
    id: 8,
    name: 'Bomber Bianco',
    colorName: 'Argento',
    hex: '#e2e8f0',
    accentHex: '#64748b',
    badgeBg: 'bg-slate-300 text-slate-800',
    borderColor: 'border-slate-300',
    hueRotateDeg: 0
  },
  {
    id: 9,
    name: 'Bomber Notte',
    colorName: 'Nero',
    hex: '#334155',
    accentHex: '#0f172a',
    badgeBg: 'bg-slate-800 text-yellow-300',
    borderColor: 'border-slate-700',
    hueRotateDeg: 0
  }
];
