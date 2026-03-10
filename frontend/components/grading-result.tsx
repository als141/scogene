import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { GradeResult } from "@/lib/types";

interface GradingResultProps {
  result: GradeResult;
}

export function GradingResult({ result }: GradingResultProps) {
  const scorePercent = Math.round(result.score * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>採点結果</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={result.is_correct ? "default" : "destructive"}>
              {result.is_correct ? "正解" : "不正解"}
            </Badge>
            <Badge variant="outline">{scorePercent}点</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">スコア</span>
            <span className="font-medium">{scorePercent}/100</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                scorePercent >= 80
                  ? "bg-green-500"
                  : scorePercent >= 50
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
        </div>

        <Separator />

        {/* Feedback */}
        <div>
          <h4 className="text-sm font-medium mb-1.5">フィードバック</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.feedback}
          </p>
        </div>

        {/* Correct answer */}
        {result.correct_answer && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-1.5">正しい答え</h4>
              <p className="text-sm font-mono bg-muted rounded-md px-3 py-2 inline-block">
                {result.correct_answer}
              </p>
            </div>
          </>
        )}

        {/* Solution steps */}
        {result.steps.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">解法ステップ</h4>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                {result.steps.map((step, i) => (
                  <li key={i} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
