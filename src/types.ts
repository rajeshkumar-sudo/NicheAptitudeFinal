export interface Question {
  id: number;
  question: string;
  options: {
    [key: string]: string;
  };
  answer: string;
  explanation?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}

export interface QuestionSet {
  set_name: string;
  questions: Question[];
}

export interface QuestionsData {
  sets: QuestionSet[];
}

export interface UserData {
  name: string;
  email: string;
  phone: string;
  rollNumber: string;
}

export type AppState = 'registration' | 'test' | 'result';

export interface TestStats {
  correct: number;
  wrong: number;
  skipped: number;
  partial: number;
}
