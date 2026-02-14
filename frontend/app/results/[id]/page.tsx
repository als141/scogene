"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/header";
import { ScoreCircle } from "@/components/score-circle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getGradingResult,
  type GradeResultResponse,
  type QuestionGrading,
} from "@/lib/api";

function QuestionCard({
  q,
  index,
}: {
  q: QuestionGrading;
  index: number;
}) {
  return (
    <Card
      className={`overflow-hidden transition-all ${
        q.is_correct
          ? "border-success/30"
          : q.score > 0
            ? "border-warning/30"
            : "border-destructive/30"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                q.is_correct
                  ? "bg-success"
                  : q.score > 0
                    ? "bg-warning text-warning-foreground"
                    : "bg-destructive"
              }`}
            >
              {q.is_correct ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7l3 3 5-5" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l6 6M10 4l-6 6" /></svg>
              )}
            </div>
            <div>
              <CardTitle className="text-sm">
                問{q.question_number}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {q.question_summary}
              </p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 text-xs font-bold tabular-nums"
          >
            {q.score}/{q.max_score}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* 生徒の解答 vs 正解 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              生徒の解答
            </p>
            <p className="text-sm font-mono">{q.student_answer}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              正解
            </p>
            <p className="text-sm font-mono">{q.correct_answer}</p>
          </div>
        </div>

        {/* 正誤の詳細 */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            正誤の詳細
          </p>
          <p className="text-sm leading-relaxed">{q.correctness_detail}</p>
        </div>

        {/* 途中式の評価 */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">
            途中式・プロセスの評価
          </p>
          <p className="text-sm leading-relaxed">{q.process_evaluation}</p>
        </div>

        {/* 部分点の理由 */}
        {q.partial_credit_reason && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
            <p className="text-xs font-semibold text-warning-foreground mb-1">
              部分点の理由
            </p>
            <p className="text-sm leading-relaxed">
              {q.partial_credit_reason}
            </p>
          </div>
        )}

        {/* 改善アドバイス */}
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
          <p className="text-xs font-semibold text-primary mb-1">
            改善アドバイス
          </p>
          <p className="text-sm leading-relaxed">{q.improvement_hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-40 w-40 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Separator />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-48 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<GradeResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      try {
        const result = await getGradingResult(id);
        if (!cancelled) {
          setData(result);

          // Poll if still grading
          if (result.status === "grading" || result.status === "pending") {
            setTimeout(load, 3000);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "結果の取得に失敗しました"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const isGrading = data?.status === "grading" || data?.status === "pending";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 12L6 8l4-4" />
          </svg>
          新しい採点
        </Link>

        {loading && <LoadingSkeleton />}

        {error && (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center">
              <p className="text-destructive font-medium">{error}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/">もう一度やり直す</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isGrading && !loading && (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-muted animate-spin border-t-primary" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">AIが採点中...</p>
              <p className="text-sm text-muted-foreground mt-1">
                途中式の確認や添削画像の作成を行っています
              </p>
            </div>
          </div>
        )}

        {data?.status === "error" && (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center">
              <p className="text-destructive font-medium">
                {data.error || "採点中にエラーが発生しました"}
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/">もう一度やり直す</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {data?.result && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Score overview */}
            <div className="flex flex-col items-center gap-4 py-4">
              <ScoreCircle
                score={data.result.total_score}
                maxScore={data.result.max_total_score}
              />
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{data.result.difficulty_assessment}</Badge>
              </div>
            </div>

            <Separator />

            {/* Tabs */}
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1 text-xs sm:text-sm">
                  問題別の採点
                </TabsTrigger>
                <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm">
                  総合評価
                </TabsTrigger>
                {data.annotated_image_urls.length > 0 && (
                  <TabsTrigger value="images" className="flex-1 text-xs sm:text-sm">
                    添削画像
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Questions tab */}
              <TabsContent value="details" className="mt-4">
                <div className="space-y-4 stagger-children">
                  {data.result.questions.map((q, i) => (
                    <QuestionCard key={i} q={q} index={i} />
                  ))}
                </div>
              </TabsContent>

              {/* Overview tab */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* Overall evaluation */}
                <Card>
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold mb-2">総合評価</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {data.result.overall_evaluation}
                    </p>
                  </CardContent>
                </Card>

                {/* Strengths */}
                <Card className="border-success/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-success mb-2">
                      良い点
                    </h3>
                    <ul className="space-y-1.5">
                      {data.result.strengths.map((s, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-sm leading-relaxed"
                        >
                          <span className="text-success shrink-0 mt-0.5">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7l3 3 5-5" /></svg>
                          </span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Weaknesses */}
                <Card className="border-destructive/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-destructive mb-2">
                      改善点
                    </h3>
                    <ul className="space-y-1.5">
                      {data.result.weaknesses.map((w, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-sm leading-relaxed"
                        >
                          <span className="text-destructive shrink-0 mt-1">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="3" /></svg>
                          </span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Study advice */}
                <Card className="border-primary/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-primary mb-2">
                      学習アドバイス
                    </h3>
                    <ul className="space-y-1.5">
                      {data.result.study_advice.map((a, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-sm leading-relaxed"
                        >
                          <span className="text-primary shrink-0 mt-0.5 font-bold text-xs">
                            {i + 1}.
                          </span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Annotated images tab */}
              {data.annotated_image_urls.length > 0 && (
                <TabsContent value="images" className="mt-4">
                  <div className="grid grid-cols-1 gap-4">
                    {data.annotated_image_urls.map((url, i) => (
                      <Dialog key={i}>
                        <DialogTrigger asChild>
                          <button className="group relative overflow-hidden rounded-xl border bg-muted/30 hover:border-primary/30 transition-all">
                            <Image
                              src={url}
                              alt={`添削画像 ${i + 1}`}
                              width={800}
                              height={600}
                              className="w-full h-auto object-contain"
                              unoptimized
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
                                拡大表示
                              </span>
                            </div>
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl p-2">
                          <Image
                            src={url}
                            alt={`添削画像 ${i + 1}`}
                            width={1600}
                            height={1200}
                            className="w-full h-auto"
                            unoptimized
                          />
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>

            {/* New grading button */}
            <div className="pt-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/">新しい採点を始める</Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
