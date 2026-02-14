"use client";

interface ScoreCircleProps {
  score: number;
  maxScore: number;
  size?: number;
}

function getScoreColor(percentage: number): string {
  if (percentage >= 80) return "stroke-success";
  if (percentage >= 60) return "stroke-chart-3";
  if (percentage >= 40) return "stroke-warning";
  return "stroke-destructive";
}

function getScoreLabel(percentage: number): string {
  if (percentage >= 90) return "素晴らしい";
  if (percentage >= 80) return "優秀";
  if (percentage >= 70) return "良好";
  if (percentage >= 60) return "合格";
  if (percentage >= 40) return "もう少し";
  return "要復習";
}

export function ScoreCircle({ score, maxScore, size = 160 }: ScoreCircleProps) {
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-muted/60"
            strokeWidth="8"
          />
          {/* Score arc */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            className={getScoreColor(percentage)}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 1.2s ease-out",
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">
            {percentage}
          </span>
          <span className="text-xs text-muted-foreground -mt-0.5">%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold">{getScoreLabel(percentage)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {score} / {maxScore} 点
        </p>
      </div>
    </div>
  );
}
