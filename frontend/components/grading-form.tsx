"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GradingFormProps {
  onSubmit: (problem: string, studentAnswer: string) => void;
  isLoading: boolean;
}

export function GradingForm({ onSubmit, isLoading }: GradingFormProps) {
  const [problem, setProblem] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem.trim() && studentAnswer.trim()) {
      onSubmit(problem, studentAnswer);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>数学の問題を採点</CardTitle>
        <CardDescription>
          問題と生徒の回答を入力すると、AIが詳細なフィードバック付きで採点します。
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="problem" className="text-sm font-medium">
              数学の問題
            </label>
            <Textarea
              id="problem"
              placeholder="例: xについて解け: 2x + 5 = 13"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              className="min-h-[100px] resize-none"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="answer" className="text-sm font-medium">
              生徒の回答
            </label>
            <Textarea
              id="answer"
              placeholder="例: x = 4"
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
              className="min-h-[80px] resize-none"
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={isLoading || !problem.trim() || !studentAnswer.trim()}
            className="w-full"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                採点中...
              </span>
            ) : (
              "採点する"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
