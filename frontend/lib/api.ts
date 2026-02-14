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

// ── Step 1: ファイルアップロード → ID 即取得 ──

export async function startGrading(
  problemFiles: File[],
  answerFiles: File[],
  answerKeyFiles?: File[],
  notes?: string
): Promise<SubmissionResponse> {
  const formData = new FormData();
  for (const file of problemFiles) formData.append("problem_files", file);
  for (const file of answerFiles) formData.append("answer_files", file);
  if (answerKeyFiles) {
    for (const file of answerKeyFiles) formData.append("answer_key_files", file);
  }
  if (notes) formData.append("notes", notes);

  const res = await fetch(`${API_URL}/api/grade/start`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ detail: "通信エラーが発生しました" }));
    throw new Error(error.detail || "採点リクエストに失敗しました");
  }

  return res.json();
}

// ── Step 2: SSE ストリーミング接続（結果ページで使用） ──

export interface StreamCallbacks {
  onStatus?: (message: string) => void;
  onReasoning?: (text: string) => void;
  onTextDelta?: (delta: string) => void;
  onToolCalled?: (info: string) => void;
  onToolOutput?: (info: string) => void;
  onResult?: (grading: GradingResult) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

export function connectGradingStream(
  submissionId: string,
  callbacks: StreamCallbacks
): EventSource {
  const es = new EventSource(`${API_URL}/api/grade/${submissionId}/stream`);

  es.addEventListener("status", (e) => {
    callbacks.onStatus?.(e.data);
  });

  es.addEventListener("reasoning", (e) => {
    callbacks.onReasoning?.(e.data);
  });

  es.addEventListener("text_delta", (e) => {
    callbacks.onTextDelta?.(e.data);
  });

  es.addEventListener("tool_called", (e) => {
    callbacks.onToolCalled?.(e.data);
  });

  es.addEventListener("tool_output", (e) => {
    callbacks.onToolOutput?.(e.data);
  });

  es.addEventListener("result", (e) => {
    try {
      const parsed = JSON.parse(e.data);
      callbacks.onResult?.(parsed.grading);
    } catch {
      callbacks.onError?.("結果の解析に失敗しました");
    }
  });

  es.addEventListener("error", (e) => {
    try {
      const me = e as MessageEvent;
      if (me.data) {
        const parsed = JSON.parse(me.data);
        callbacks.onError?.(parsed.error || "エラーが発生しました");
      } else {
        callbacks.onError?.("接続エラーが発生しました");
      }
    } catch {
      callbacks.onError?.("エラーが発生しました");
    }
  });

  es.addEventListener("done", () => {
    callbacks.onDone?.();
    es.close();
  });

  es.onerror = () => {
    // EventSource の自動再接続を防ぐ（done が来なかった場合のフォールバック）
    es.close();
  };

  return es;
}

// ── 結果取得（完了後の閲覧用） ──

export async function getGradingResult(
  submissionId: string
): Promise<GradeResultResponse> {
  const res = await fetch(`${API_URL}/api/grade/${submissionId}`);
  if (!res.ok) throw new Error("結果の取得に失敗しました");
  return res.json();
}

export async function getSubmissions(): Promise<SubmissionListItem[]> {
  const res = await fetch(`${API_URL}/api/submissions`);
  if (!res.ok) throw new Error("履歴の取得に失敗しました");
  return res.json();
}
