export interface GradeRequest {
  problem: string;
  studentAnswer: string;
}

export interface GradeResult {
  is_correct: boolean;
  score: number;
  feedback: string;
  correct_answer: string | null;
  steps: string[];
}

export interface StreamEvent {
  type: "delta" | "status" | "tool_output" | "message" | "done";
  content: string;
}

export interface GradingHistoryItem {
  id: string;
  timestamp: Date;
  problem: string;
  studentAnswer: string;
  result: GradeResult;
}
