const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface QuestionGrading {
  question_number: number;
  question_summary: string;
  is_correct: boolean;
  score: number;
  max_score: number;
  correctness_detail: string;
  process_evaluation: string;
  partial_credit_reason: string | null;
  correct_answer: string;
  student_answer: string;
  improvement_hint: string;
}

export interface GradingResult {
  total_score: number;
  max_total_score: number;
  percentage: number;
  overall_evaluation: string;
  strengths: string[];
  weaknesses: string[];
  questions: QuestionGrading[];
  study_advice: string[];
  difficulty_assessment: string;
}

export interface SubmissionResponse {
  id: string;
  status: string;
  message: string;
}

export interface GradeResultResponse {
  id: string;
  status: string;
  result: GradingResult | null;
  annotated_image_urls: string[];
  error: string | null;
}

export interface SubmissionListItem {
  id: string;
  created_at: string;
  status: string;
  total_score: number | null;
  max_total_score: number | null;
  percentage: number | null;
}

export async function submitForGrading(
  problemFiles: File[],
  answerFiles: File[],
  answerKeyFiles?: File[],
  notes?: string
): Promise<SubmissionResponse> {
  const formData = new FormData();

  for (const file of problemFiles) {
    formData.append("problem_files", file);
  }
  for (const file of answerFiles) {
    formData.append("answer_files", file);
  }
  if (answerKeyFiles) {
    for (const file of answerKeyFiles) {
      formData.append("answer_key_files", file);
    }
  }
  if (notes) {
    formData.append("notes", notes);
  }

  const res = await fetch(`${API_URL}/api/grade`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "通信エラーが発生しました" }));
    throw new Error(error.detail || "採点リクエストに失敗しました");
  }

  return res.json();
}

export async function getGradingResult(
  submissionId: string
): Promise<GradeResultResponse> {
  const res = await fetch(`${API_URL}/api/grade/${submissionId}`);

  if (!res.ok) {
    throw new Error("結果の取得に失敗しました");
  }

  return res.json();
}

export async function getSubmissions(): Promise<SubmissionListItem[]> {
  const res = await fetch(`${API_URL}/api/submissions`);

  if (!res.ok) {
    throw new Error("履歴の取得に失敗しました");
  }

  return res.json();
}
