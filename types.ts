
export enum BloomLevel {
  NHAN_BIET = 'Nhận biết',
  THONG_HIEU = 'Thông hiểu',
  VAN_DUNG = 'Vận dụng',
  PHAN_TICH = 'Phân tích',
  DANH_GIA = 'Đánh giá',
  SANG_TAO = 'Sáng tạo'
}

export interface QuestionOption {
  key: 'A' | 'B' | 'C' | 'D';
  content: string;
}

export interface DistractorAnalysis {
  key: 'A' | 'B' | 'C' | 'D';
  reason: string;
}

export interface MCQQuestion {
  id: string;
  order: number;
  bloomLevel: BloomLevel;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  rationale: string;
  citation: string;
  distractorAnalysis: DistractorAnalysis[];
}

export interface QuizConfig {
  bloomDistribution: Partial<Record<BloomLevel, number>>;
  language: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  fileName: string;
  questions: MCQQuestion[];
  config: QuizConfig;
}
