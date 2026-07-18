import { create } from 'zustand';

export interface Choice {
  label: string;
  text: string;
}

export interface Explanation {
  correctReason: string;
  choiceReasons: Record<string, string>;
}

export interface Question {
  questionId: string;
  passage: string | null;
  questionStem: string;
  choices: Choice[];
  correctAnswer: string | null;
  explanation: Explanation | null;
  skill: string;
  approvedAt?: string;
  folderId?: string;
  sourceFileId?: string;
}

export interface Highlight {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  note?: string;
}

interface PracticeState {
  questions: Question[];
  currentQuestionIndex: number;
  selectedAnswers: Record<string, string>; // questionId -> answer
  eliminatedChoices: Record<string, string[]>; // questionId -> list of labels (A, B, C, D)
  markedForReview: Record<string, boolean>; // questionId -> boolean
  highlights: Record<string, Highlight[]>; // questionId -> highlights
  elapsedTimes: Record<string, number>; // questionId -> seconds spent
  timerSeconds: number;
  timerActive: boolean;
  isPracticeMode: boolean;
  showResults: boolean;
  checkedQuestions: Record<string, boolean>; // questionId -> checked in practice mode

  // Actions
  setQuestions: (questions: Question[]) => void;
  setCurrentQuestionIndex: (index: number) => void;
  selectAnswer: (questionId: string, answer: string) => void;
  toggleEliminateChoice: (questionId: string, choiceLabel: string) => void;
  toggleMarkForReview: (questionId: string) => void;
  addHighlight: (questionId: string, highlight: Omit<Highlight, 'id'>) => void;
  removeHighlight: (questionId: string, highlightId: string) => void;
  updateHighlightNote: (questionId: string, highlightId: string, note: string) => void;
  incrementTime: (questionId: string) => void;
  resetTimer: () => void;
  setTimerActive: (active: boolean) => void;
  setPracticeMode: (isPractice: boolean) => void;
  checkAnswer: (questionId: string) => void;
  submitTest: () => void;
  resetSession: () => void;
}

export const usePracticeStore = create<PracticeState>((set) => ({
  questions: [],
  currentQuestionIndex: 0,
  selectedAnswers: {},
  eliminatedChoices: {},
  markedForReview: {},
  highlights: {},
  elapsedTimes: {},
  timerSeconds: 0,
  timerActive: false,
  isPracticeMode: true,
  showResults: false,
  checkedQuestions: {},

  setQuestions: (questions) => set({ 
    questions, 
    currentQuestionIndex: 0,
    selectedAnswers: {},
    eliminatedChoices: {},
    markedForReview: {},
    highlights: {},
    elapsedTimes: {},
    timerSeconds: 0,
    timerActive: true,
    showResults: false,
    checkedQuestions: {}
  }),

  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),

  selectAnswer: (questionId, answer) => set((state) => {
    // If the answer is already selected, unselect it. Otherwise select it.
    const currentAnswer = state.selectedAnswers[questionId];
    return {
      selectedAnswers: {
        ...state.selectedAnswers,
        [questionId]: currentAnswer === answer ? '' : answer
      }
    };
  }),

  toggleEliminateChoice: (questionId, choiceLabel) => set((state) => {
    const list = state.eliminatedChoices[questionId] || [];
    const newList = list.includes(choiceLabel)
      ? list.filter((l) => l !== choiceLabel)
      : [...list, choiceLabel];
    
    // Also, if the eliminated choice was selected, clear the selection
    const selected = state.selectedAnswers[questionId];
    const newSelectedAnswers = { ...state.selectedAnswers };
    if (selected === choiceLabel && newList.includes(choiceLabel)) {
      newSelectedAnswers[questionId] = '';
    }

    return {
      eliminatedChoices: {
        ...state.eliminatedChoices,
        [questionId]: newList
      },
      selectedAnswers: newSelectedAnswers
    };
  }),

  toggleMarkForReview: (questionId) => set((state) => ({
    markedForReview: {
      ...state.markedForReview,
      [questionId]: !state.markedForReview[questionId]
    }
  })),

  addHighlight: (questionId, highlight) => set((state) => {
    const list = state.highlights[questionId] || [];
    const newHighlight = {
      ...highlight,
      id: `hl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    return {
      highlights: {
        ...state.highlights,
        [questionId]: [...list, newHighlight]
      }
    };
  }),

  removeHighlight: (questionId, highlightId) => set((state) => {
    const list = state.highlights[questionId] || [];
    return {
      highlights: {
        ...state.highlights,
        [questionId]: list.filter((hl) => hl.id !== highlightId)
      }
    };
  }),

  updateHighlightNote: (questionId, highlightId, note) => set((state) => {
    const list = state.highlights[questionId] || [];
    return {
      highlights: {
        ...state.highlights,
        [questionId]: list.map((hl) => hl.id === highlightId ? { ...hl, note } : hl)
      }
    };
  }),

  incrementTime: (questionId) => set((state) => {
    const currentTime = state.elapsedTimes[questionId] || 0;
    return {
      elapsedTimes: {
        ...state.elapsedTimes,
        [questionId]: currentTime + 1
      },
      timerSeconds: state.timerSeconds + 1
    };
  }),

  resetTimer: () => set({ timerSeconds: 0 }),
  
  setTimerActive: (active) => set({ timerActive: active }),

  setPracticeMode: (isPractice) => set({ isPracticeMode: isPractice }),

  checkAnswer: (questionId) => set((state) => ({
    checkedQuestions: {
      ...state.checkedQuestions,
      [questionId]: true
    }
  })),

  submitTest: () => set({ showResults: true, timerActive: false }),

  resetSession: () => set({
    currentQuestionIndex: 0,
    selectedAnswers: {},
    eliminatedChoices: {},
    markedForReview: {},
    highlights: {},
    elapsedTimes: {},
    timerSeconds: 0,
    timerActive: false,
    showResults: false,
    checkedQuestions: {}
  })
}));
