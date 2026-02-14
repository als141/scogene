"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getSubmissions, type SubmissionListItem } from "@/lib/api";

function statusLabel(status: string) {
  switch (status) {
    case "completed":
      return { text: "完了", variant: "default" as const };
    case "grading":
      return { text: "採点中", variant: "secondary" as const };
    case "error":
      return { text: "エラー", variant: "destructive" as const };
    default:
      return { text: "待機中", variant: "secondary" as const };
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;

  return d.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getScoreColor(percentage: number | null) {
  if (percentage === null) return "text-muted-foreground";
  if (percentage >= 80) return "text-success";
  if (percentage >= 60) return "text-chart-3";
  if (percentage >= 40) return "text-warning";
  return "text-destructive";
}

export default function HistoryPage() {
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubmissions()
      .then(setSubmissions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              採点履歴
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              過去の採点結果を確認できます
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/">新規採点</Link>
          </Button>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!loading && submissions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 p-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-medium">まだ採点履歴がありません</p>
                <p className="text-sm text-muted-foreground mt-1">
                  最初の採点を始めましょう
                </p>
              </div>
              <Button asChild className="mt-2">
                <Link href="/">採点を始める</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && submissions.length > 0 && (
          <div className="space-y-2 stagger-children">
            {submissions.map((s) => {
              const st = statusLabel(s.status);
              return (
                <Link key={s.id} href={`/results/${s.id}`}>
                  <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
                    <CardContent className="flex items-center gap-4 p-4">
                      {/* Score */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
                        {s.percentage !== null ? (
                          <span
                            className={`text-lg font-bold tabular-nums ${getScoreColor(s.percentage)}`}
                          >
                            {Math.round(s.percentage)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            --
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {s.total_score !== null && s.max_total_score !== null
                              ? `${s.total_score} / ${s.max_total_score} 点`
                              : "採点結果"}
                          </p>
                          <Badge variant={st.variant} className="text-[10px] shrink-0">
                            {st.text}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(s.created_at)}
                        </p>
                      </div>

                      {/* Arrow */}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-muted-foreground"
                      >
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
