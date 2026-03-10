"use client";

import { useState, useCallback } from "react";
import { gradeWithStreaming } from "@/lib/api";
import type { GradeResult, GradingHistoryItem, StreamEvent } from "@/lib/types";

export function useGrading() {
  const [isGrading, setIsGrading] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<GradeResult | null>(null);
  const [history, setHistory] = useState<GradingHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submitForGrading = useCallback(
    async (problem: string, studentAnswer: string) => {
      setIsGrading(true);
      setStreamContent("");
      setStatusMessage("");
      setResult(null);
      setError(null);

      try {
        await gradeWithStreaming(
          problem,
          studentAnswer,
          (event: StreamEvent) => {
            switch (event.type) {
              case "delta":
                setStreamContent((prev) => prev + event.content);
                break;
              case "status":
                setStatusMessage(event.content);
                break;
              case "tool_output":
                setStatusMessage("計算完了");
                break;
              case "done":
                try {
                  const parsed: GradeResult = JSON.parse(event.content);
                  setResult(parsed);
                  setHistory((prev) => [
                    {
                      id: crypto.randomUUID(),
                      timestamp: new Date(),
                      problem,
                      studentAnswer,
                      result: parsed,
                    },
                    ...prev,
                  ]);
                } catch {
                  setResult({
                    is_correct: false,
                    score: 0,
                    feedback: event.content,
                    correct_answer: null,
                    steps: [],
                  });
                }
                break;
            }
          },
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "採点に失敗しました",
        );
      } finally {
        setIsGrading(false);
      }
    },
    [],
  );

  return {
    isGrading,
    streamContent,
    statusMessage,
    result,
    history,
    error,
    submitForGrading,
  };
}
