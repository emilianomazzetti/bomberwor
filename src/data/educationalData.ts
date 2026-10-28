export type SubjectType = 'ortografia' | 'verbi' | 'inglese' | 'matematica';

export interface SubjectMeta {
  id: SubjectType;
  title: string;
  badge: string;
  icon: string;
  description: string;
  type: 'spelling' | 'choice';
}

export const SUBJECTS: SubjectMeta[] = [
  {
    id: 'ortografia',
    title: 'Ortografia Italiana',
    badge: 'Lettere & Parole',
    icon: '📝',
    description: 'Componi le parole lettera per lettera raccogliendo le tessere corrette sulla mappa.',
    type: 'spelling'
  },
  {
    id: 'verbi',
    title: 'Verbi e Grammatica',
    badge: 'Coniugazioni & Regole',
    icon: '📚',
    description: 'Trova la forma corretta del verbo o la regola grammaticale richiesta.',
    type: 'choice'
  },
  {
    id: 'inglese',
    title: 'English Vocabulary',
    badge: 'Translation & Spelling',
    icon: '🇬🇧',
    description: 'Traduci le parole italiane in inglese e componi il loro spelling inglese.',
    type: 'spelling'
  },
  {
    id: 'matematica',
    title: 'Tabelline e Matematica',
    badge: 'Calcolo Veloce',
    icon: '🧮',
    description: 'Risolvi al volo moltiplicazioni, tabelline e calcoli a mente per guadagnare bombe.',
    type: 'choice'
  }
];

export interface QuestionItem {
  id: string;
  subject: SubjectType;
  prompt: string;
  hint?: string;
  // For spelling words: target word to collect letter by letter
  targetWord?: string;
  // Current target symbol needed on map (e.g. single letter 'C' or number '56')
  targetSymbol: string;
  // Multiple choice options for choice type
  correctAnswer?: string;
  distractors: string[];
}

export const SPELLING_ITALIAN_WORDS = [
  'CANE', 'GATTO', 'SOLE', 'LUNA', 'MARE', 'BICI', 'LIBRO', 'SCUOLA',
  'STELLA', 'FIORE', 'BOMBA', 'ALBERO', 'PIZZA', 'MATITA', 'DELFINO',
  'TRENO', 'QUADERNO', 'ZAINO', 'AQUILA', 'GIRAFFA'
];

export const ENGLISH_VOCABULARY = [
  { it: 'CANE', en: 'DOG' },
  { it: 'GATTO', en: 'CAT' },
  { it: 'SOLE', en: 'SUN' },
  { it: 'MELA', en: 'APPLE' },
  { it: 'LIBRO', en: 'BOOK' },
  { it: 'ROSSO', en: 'RED' },
  { it: 'BLU', en: 'BLUE' },
  { it: 'VERDE', en: 'GREEN' },
  { it: 'CASA', en: 'HOUSE' },
  { it: 'ACQUA', en: 'WATER' },
  { it: 'PESCE', en: 'FISH' },
  { it: 'AMICO', en: 'FRIEND' },
  { it: 'PALLA', en: 'BALL' },
  { it: 'UCCELLO', en: 'BIRD' },
  { it: 'FIORE', en: 'FLOWER' }
];

export const GRAMMAR_QUESTIONS = [
  {
    prompt: 'Passato Prossimo di CANTARE (Io)',
    correct: 'HO CANTATO',
    distractors: ['CANTAVO', 'CANTERÒ', 'CANTO']
  },
  {
    prompt: 'Futuro Semplice di LEGGERE (Noi)',
    correct: 'LEGGEREMO',
    distractors: ['LEGGEMMO', 'LEGGEVAMO', 'LEGGIAMO']
  },
  {
    prompt: 'Imperfetto di ESSERE (Egli)',
    correct: 'ERA',
    distractors: ['FU', 'SARÀ', 'È']
  },
  {
    prompt: 'Quale parola è un Nome Proprio?',
    correct: 'ROMA',
    distractors: ['CITTÀ', 'STRADA', 'FIUME']
  },
  {
    prompt: 'Plurale irregolare corretto di UOVO',
    correct: 'UOVA',
    distractors: ['UOVI', 'UOVE', 'UOVOS']
  },
  {
    prompt: 'Quale richiede apostrofo con l\'articolo?',
    correct: 'L\'ALBERO',
    distractors: ['IL CANE', 'LA CASA', 'LO ZAINO']
  },
  {
    prompt: 'Trapassato Prossimo di VEDERE (Io)',
    correct: 'AVEVO VISTO',
    distractors: ['HO VISTO', 'VEDRÒ', 'VIDI']
  },
  {
    prompt: 'Sinonimo di FELICE',
    correct: 'CONTENTO',
    distractors: ['TRISTE', 'ARRABBIATO', 'NOIOSO']
  },
  {
    prompt: 'Contrario di VELOCE',
    correct: 'LENTO',
    distractors: ['RAPIDO', 'SCATTANTE', 'AGILE']
  },
  {
    prompt: 'Condizionale Presente di VOLERE (Io)',
    correct: 'VORREI',
    distractors: ['VOGLIO', 'VOLEVO', 'VOLLE']
  },
  {
    prompt: 'Articolo corretto per ZAINO',
    correct: 'LO',
    distractors: ['IL', 'LA', 'GLI']
  },
  {
    prompt: 'Qual è un aggettivo qualificativo?',
    correct: 'BELLO',
    distractors: ['CORRERE', 'CASA', 'LENTAMENTE']
  }
];

export const MATH_QUESTIONS = [
  { prompt: '7 × 8 = ?', correct: '56', distractors: ['54', '48', '64'] },
  { prompt: '6 × 7 = ?', correct: '42', distractors: ['48', '36', '49'] },
  { prompt: '9 × 6 = ?', correct: '54', distractors: ['63', '45', '56'] },
  { prompt: '8 × 8 = ?', correct: '64', distractors: ['72', '56', '62'] },
  { prompt: '4 × 9 = ?', correct: '36', distractors: ['32', '38', '45'] },
  { prompt: '5 × 7 = ?', correct: '35', distractors: ['40', '30', '42'] },
  { prompt: '3 × 8 = ?', correct: '24', distractors: ['21', '28', '27'] },
  { prompt: '9 × 9 = ?', correct: '81', distractors: ['72', '89', '90'] },
  { prompt: '12 + 15 = ?', correct: '27', distractors: ['25', '29', '37'] },
  { prompt: '50 - 18 = ?', correct: '32', distractors: ['34', '28', '38'] },
  { prompt: '45 ÷ 5 = ?', correct: '9', distractors: ['8', '7', '10'] },
  { prompt: '36 ÷ 4 = ?', correct: '9', distractors: ['8', '6', '7'] },
  { prompt: '6 × 8 = ?', correct: '48', distractors: ['54', '42', '56'] },
  { prompt: '7 × 7 = ?', correct: '49', distractors: ['42', '56', '51'] },
  { prompt: '9 × 5 = ?', correct: '45', distractors: ['40', '50', '35'] },
  { prompt: '8 × 4 = ?', correct: '32', distractors: ['36', '28', '24'] }
];

export function getInitialQuestion(subject: SubjectType, playerIndex: number = 0): {
  questionText: string;
  targetSymbol: string;
  spellingWord?: string;
  letterIndex?: number;
  options?: string[];
  correctAnswer?: string;
} {
  if (subject === 'ortografia') {
    const word = SPELLING_ITALIAN_WORDS[playerIndex % SPELLING_ITALIAN_WORDS.length];
    return {
      questionText: `Componi la parola: ${word}`,
      targetSymbol: word[0],
      spellingWord: word,
      letterIndex: 0
    };
  }

  if (subject === 'inglese') {
    const item = ENGLISH_VOCABULARY[playerIndex % ENGLISH_VOCABULARY.length];
    return {
      questionText: `Traduci: ${item.it} → [${item.en}]`,
      targetSymbol: item.en[0],
      spellingWord: item.en,
      letterIndex: 0
    };
  }

  if (subject === 'verbi') {
    const q = GRAMMAR_QUESTIONS[playerIndex % GRAMMAR_QUESTIONS.length];
    const opts = shuffleArray([q.correct, ...q.distractors]);
    return {
      questionText: q.prompt,
      targetSymbol: q.correct,
      correctAnswer: q.correct,
      options: opts
    };
  }

  // Matematica
  const q = MATH_QUESTIONS[playerIndex % MATH_QUESTIONS.length];
  const opts = shuffleArray([q.correct, ...q.distractors]);
  return {
    questionText: q.prompt,
    targetSymbol: q.correct,
    correctAnswer: q.correct,
    options: opts
  };
}

export function getNextQuestion(
  subject: SubjectType,
  currentLetterIndex: number,
  currentSpellingWord: string | undefined,
  advanceTotal: number
): {
  questionText: string;
  targetSymbol: string;
  spellingWord?: string;
  letterIndex?: number;
  isWordCompleted?: boolean;
  options?: string[];
  correctAnswer?: string;
} {
  if (subject === 'ortografia' || subject === 'inglese') {
    const word = currentSpellingWord || (subject === 'ortografia' ? 'CANE' : 'DOG');
    const nextIdx = currentLetterIndex + 1;
    if (nextIdx < word.length) {
      // Still completing current word
      const prefix = subject === 'inglese' ? 'Traduci & Componi' : 'Componi';
      return {
        questionText: `${prefix}: ${word} (Cerca: ${word[nextIdx]})`,
        targetSymbol: word[nextIdx],
        spellingWord: word,
        letterIndex: nextIdx,
        isWordCompleted: false
      };
    } else {
      // Completed current word! Choose next word
      const pool = subject === 'ortografia' ? SPELLING_ITALIAN_WORDS : ENGLISH_VOCABULARY.map(v => v.en);
      const nextWord = pool[(advanceTotal + 1) % pool.length];
      const prefix = subject === 'inglese' ? 'Nuova parola' : 'Componi la parola';
      return {
        questionText: `${prefix}: ${nextWord}`,
        targetSymbol: nextWord[0],
        spellingWord: nextWord,
        letterIndex: 0,
        isWordCompleted: true
      };
    }
  }

  if (subject === 'verbi') {
    const q = GRAMMAR_QUESTIONS[(advanceTotal + 1) % GRAMMAR_QUESTIONS.length];
    const opts = shuffleArray([q.correct, ...q.distractors]);
    return {
      questionText: q.prompt,
      targetSymbol: q.correct,
      correctAnswer: q.correct,
      options: opts,
      isWordCompleted: true
    };
  }

  // Matematica
  const q = MATH_QUESTIONS[(advanceTotal + 1) % MATH_QUESTIONS.length];
  const opts = shuffleArray([q.correct, ...q.distractors]);
  return {
    questionText: q.prompt,
    targetSymbol: q.correct,
    correctAnswer: q.correct,
    options: opts,
    isWordCompleted: true
  };
}

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
