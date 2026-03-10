import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from openai.types.responses import ResponseTextDeltaEvent
from agents import Runner, ItemHelpers

from app.agent import math_grader_agent
from app.schemas import GradeRequest

router = APIRouter(prefix="/api")


def _build_prompt(request: GradeRequest) -> str:
    return f"問題: {request.problem}\n生徒の回答: {request.student_answer}"


@router.post("/grade")
async def grade_problem(request: GradeRequest):
    prompt = _build_prompt(request)
    result = await Runner.run(math_grader_agent, input=prompt)
    return {"result": result.final_output}


@router.post("/grade/stream")
async def grade_problem_stream(request: GradeRequest):
    prompt = _build_prompt(request)

    async def event_generator():
        result = Runner.run_streamed(math_grader_agent, input=prompt)
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                data = json.dumps(
                    {"type": "delta", "content": event.data.delta},
                    ensure_ascii=False,
                )
                yield f"data: {data}\n\n"
            elif event.type == "run_item_stream_event":
                if event.item.type == "tool_call_item":
                    data = json.dumps(
                        {"type": "status", "content": "計算を実行中..."},
                        ensure_ascii=False,
                    )
                    yield f"data: {data}\n\n"
                elif event.item.type == "tool_call_output_item":
                    data = json.dumps(
                        {
                            "type": "tool_output",
                            "content": str(event.item.output),
                        },
                        ensure_ascii=False,
                    )
                    yield f"data: {data}\n\n"
                elif event.item.type == "message_output_item":
                    text = ItemHelpers.text_message_output(event.item)
                    data = json.dumps(
                        {"type": "message", "content": text},
                        ensure_ascii=False,
                    )
                    yield f"data: {data}\n\n"

        done_data = json.dumps(
            {"type": "done", "content": result.final_output},
            ensure_ascii=False,
        )
        yield f"data: {done_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
