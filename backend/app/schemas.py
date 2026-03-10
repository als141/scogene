from pydantic import BaseModel


class GradeRequest(BaseModel):
    problem: str
    student_answer: str


class GradeResult(BaseModel):
    is_correct: bool
    score: float
    feedback: str
    correct_answer: str | None = None
    steps: list[str] = []
