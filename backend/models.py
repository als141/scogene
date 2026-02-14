from __future__ import annotations

from pydantic import BaseModel, Field


# --- 採点結果の構造化出力 ---

class QuestionGrading(BaseModel):
    """個別の問題に対する採点結果"""

    question_number: int = Field(description="問題番号")
    question_summary: str = Field(description="問題の概要（何を求めているか）")
    is_correct: bool = Field(description="正解かどうか")
    score: int = Field(description="得点")
    max_score: int = Field(description="配点")
    correctness_detail: str = Field(
        description="正誤の詳細。正解の場合は解法の評価、不正解の場合は間違いの箇所と理由"
    )
    process_evaluation: str = Field(
        description="途中式・解法プロセスの評価。論理の流れ、計算過程、式変形の正確さなど"
    )
    partial_credit_reason: str | None = Field(
        default=None,
        description="部分点がある場合、その理由",
    )
    correct_answer: str = Field(description="正しい答え（模範解答）")
    student_answer: str = Field(description="生徒の解答")
    improvement_hint: str = Field(
        description="この問題に関する改善アドバイス"
    )


class GradingResult(BaseModel):
    """全体の採点結果"""

    total_score: int = Field(description="合計得点")
    max_total_score: int = Field(description="満点")
    percentage: float = Field(description="得点率（パーセント）")
    overall_evaluation: str = Field(
        description="全体的な評価コメント。高校教師としての総合的なフィードバック"
    )
    strengths: list[str] = Field(
        description="生徒の良い点・強み"
    )
    weaknesses: list[str] = Field(
        description="改善が必要な点・弱点"
    )
    questions: list[QuestionGrading] = Field(
        description="各問題の採点結果"
    )
    study_advice: list[str] = Field(
        description="今後の学習に向けたアドバイス"
    )
    difficulty_assessment: str = Field(
        description="問題全体の難易度評価（易・標準・やや難・難）"
    )


# --- API リクエスト/レスポンス ---

class GradeRequest(BaseModel):
    """採点リクエスト（メタデータ部分）"""
    submission_id: str | None = None
    notes: str | None = Field(default=None, description="追加の指示やメモ")


class SubmissionResponse(BaseModel):
    """採点送信のレスポンス"""
    id: str
    status: str
    message: str


class GradeResultResponse(BaseModel):
    """採点結果のレスポンス"""
    id: str
    status: str
    result: GradingResult | None = None
    annotated_image_urls: list[str] = Field(default_factory=list)
    error: str | None = None


class SubmissionListItem(BaseModel):
    """提出一覧の各項目"""
    id: str
    created_at: str
    status: str
    total_score: int | None = None
    max_total_score: int | None = None
    percentage: float | None = None
