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

// --- SSE ストリーミングイベント ---

export interface StreamEvent {
  event: string;
  data: string;
}

export interface StreamCallbacks {
  onSubmission?: (id: string) => void;
  onStatus?: (message: string) => void;
  onReasoning?: (text: string) => void;
  onTextDelta?: (delta: string) => void;
  onToolCalled?: (info: string) => void;
  onToolOutput?: (info: string) => void;
  onResult?: (grading: GradingResult) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

function buildFormData(
  problemFiles: File[],
  answerFiles: File[],
  answerKeyFiles?: File[],
  notes?: string
): FormData {
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
  return formData;
}

// --- 通常の同期 API ---

export async function submitForGrading(
  problemFiles: File[],
  answerFiles: File[],
  answerKeyFiles?: File[],
  notes?: string
): Promise<SubmissionResponse> {
  const formData = buildFormData(problemFiles, answerFiles, answerKeyFiles, notes);

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

// --- SSE ストリーミング API ---

export async function submitForGradingStream(
  problemFiles: File[],
  answerFiles: File[],
  callbacks: StreamCallbacks,
  answerKeyFiles?: File[],
  notes?: string
): Promise<void> {
  const formData = buildFormData(problemFiles, answerFiles, answerKeyFiles, notes);

  const res = await fetch(`${API_URL}/api/grade/stream`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "通信エラーが発生しました" }));
    throw new Error(error.detail || "採点リクエストに失敗しました");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("ストリームの読み取りに失敗しました");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6);
      } else if (line === "" && currentEvent) {
        // イベント完了 → コールバック呼び出し
        processStreamEvent(currentEvent, currentData, callbacks);
        currentEvent = "";
        currentData = "";
      }
    }
  }

  callbacks.onDone?.();
}

function processStreamEvent(
  event: string,
  data: string,
  callbacks: StreamCallbacks
) {
  switch (event) {
    case "submission": {
      const parsed = JSON.parse(data);
      callbacks.onSubmission?.(parsed.id);
      break;
    }
    case "status":
      callbacks.onStatus?.(data);
      break;
    case "reasoning":
      callbacks.onReasoning?.(data);
      break;
    case "text_delta":
      callbacks.onTextDelta?.(data);
      break;
    case "tool_called":
      callbacks.onToolCalled?.(data);
      break;
    case "tool_output":
      callbacks.onToolOutput?.(data);
      break;
    case "result": {
      const parsed = JSON.parse(data);
      callbacks.onResult?.(parsed.grading);
      break;
    }
    case "error": {
      const parsed = JSON.parse(data);
      callbacks.onError?.(parsed.error || data);
      break;
    }
    case "done":
      callbacks.onDone?.();
      break;
  }
}

// --- 結果取得 ---

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
