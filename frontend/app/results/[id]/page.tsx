"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  connectGradingStream,
  getGradingResult,
  type GradingResult,
  type QuestionGrading,
} from "@/lib/api";

// ── ストリーミング中の表示 ──

interface ActivityLog {
  id: number;
  type: "status" | "tool" | "error";
  text: string;
  timestamp: number;
}

function StreamingView({
  logs,
  status,
  reasoningText,
  streamingText,
}: {
  logs: ActivityLog[];
  status: string;
  reasoningText: string;
  streamingText: string;
}) {
  const logScrollRef = useRef<HTMLDivElement>(null);
  const reasoningScrollRef = useRef<HTMLDivElement>(null);
  const textScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logScrollRef.current?.scrollTo(0, logScrollRef.current.scrollHeight);
  }, [logs]);

  useEffect(() => {
    reasoningScrollRef.current?.scrollTo(
      0,
      reasoningScrollRef.current.scrollHeight,
    );
  }, [reasoningText]);

  useEffect(() => {
    textScrollRef.current?.scrollTo(0, textScrollRef.current.scrollHeight);
  }, [streamingText]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Spinner + Status */}
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-[3px] border-muted animate-spin border-t-primary" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold">{status}</p>
          <p className="text-xs text-muted-foreground mt-1">
            AI が採点を実行中
          </p>
        </div>
      </div>

      {/* 推論過程 (reasoning) — トークン単位で累積表示 */}
      {reasoningText && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              推論過程
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={reasoningScrollRef}
              className="max-h-64 overflow-y-auto rounded-lg bg-primary/5 border border-primary/10 p-3 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap"
            >
              {reasoningText}
              <span className="inline-block w-[3px] h-[1.1em] bg-primary/60 ml-0.5 animate-pulse align-text-bottom rounded-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 回答生成 (text_delta) — トークン単位で累積表示 */}
      {streamingText && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              回答生成
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={textScrollRef}
              className="max-h-48 overflow-y-auto rounded-lg bg-muted/30 p-3 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-all"
            >
              {streamingText}
              <span className="inline-block w-[3px] h-[0.9em] bg-muted-foreground/40 ml-0.5 animate-pulse align-text-bottom rounded-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* アクティビティログ (status / tool のみ) */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              アクティビティ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={logScrollRef}
              className="max-h-32 overflow-y-auto rounded-lg bg-muted/30 p-3 font-mono text-xs space-y-1"
            >
              {logs.map((log, i) => (
                <div
                  key={`${log.id}-${i}`}
                  className={`flex gap-2 ${
                    log.type === "error"
                      ? "text-destructive"
                      : log.type === "tool"
                        ? "text-chart-3"
                        : "text-muted-foreground"
                  }`}
                >
                  <span className="shrink-0 opacity-50">
                    {new Date(log.timestamp).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className="break-all">{log.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 初期状態（何もまだ来ていない） */}
      {!reasoningText && !streamingText && logs.length === 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground animate-gentle-pulse text-sm">
              接続中...
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── 問題カード ──

function QuestionCard({ q }: { q: QuestionGrading }) {
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
              <CardTitle className="text-sm">問{q.question_number}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{q.question_summary}</p>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs font-bold tabular-nums">
            {q.score}/{q.max_score}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">生徒の解答</p>
            <p className="text-sm font-mono">{q.student_answer}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">正解</p>
            <p className="text-sm font-mono">{q.correct_answer}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">正誤の詳細</p>
          <p className="text-sm leading-relaxed">{q.correctness_detail}</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">途中式・プロセスの評価</p>
          <p className="text-sm leading-relaxed">{q.process_evaluation}</p>
        </div>

        {q.partial_credit_reason && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
            <p className="text-xs font-semibold text-warning-foreground mb-1">部分点の理由</p>
            <p className="text-sm leading-relaxed">{q.partial_credit_reason}</p>
          </div>
        )}

        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
          <p className="text-xs font-semibold text-primary mb-1">改善アドバイス</p>
          <p className="text-sm leading-relaxed">{q.improvement_hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── メインページ ──

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<GradingResult | null>(null);
  const [annotatedUrls, setAnnotatedUrls] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [streamStatus, setStreamStatus] = useState("接続中...");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  // トークン単位のテキスト累積（rAF でバッチ更新）
  const [reasoningText, setReasoningText] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const reasoningRef = useRef("");
  const textRef = useRef("");
  const flushRef = useRef<number | null>(null);

  const scheduleFlush = useCallback(() => {
    if (flushRef.current !== null) return;
    flushRef.current = requestAnimationFrame(() => {
      setReasoningText(reasoningRef.current);
      setStreamingText(textRef.current);
      flushRef.current = null;
    });
  }, []);

  const logIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  function addLog(type: ActivityLog["type"], text: string) {
    logIdRef.current += 1;
    setLogs((prev) => [
      ...prev,
      { id: logIdRef.current, type, text, timestamp: Date.now() },
    ]);
  }

  const didInitRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    // Strict Mode の二重実行を防止
    if (didInitRef.current) return;
    didInitRef.current = true;

    // まず DB から既存の結果を確認
    getGradingResult(id)
      .then((res) => {
        if (res.status === "completed" && res.result) {
          setResult(res.result);
          setAnnotatedUrls(res.annotated_image_urls);
          setIsStreaming(false);
          return;
        }

        if (res.status === "error") {
          setError(res.error || "採点中にエラーが発生しました");
          setIsStreaming(false);
          return;
        }

        startStream();
      })
      .catch(() => {
        startStream();
      });

    function startStream() {
      addLog("status", "サーバーに接続中...");

      const es = connectGradingStream(id, {
        onStatus: (msg) => {
          setStreamStatus(msg);
          addLog("status", msg);
        },
        onReasoning: (text) => {
          setStreamStatus("推論中...");
          reasoningRef.current += text;
          scheduleFlush();
        },
        onTextDelta: (delta) => {
          setStreamStatus("回答を生成中...");
          textRef.current += delta;
          scheduleFlush();
        },
        onToolCalled: (info) => {
          setStreamStatus(info);
          addLog("tool", info);
        },
        onToolOutput: (info) => {
          setStreamStatus("分析結果を処理中...");
          addLog("tool", info);
        },
        onResult: (grading, urls) => {
          setResult(grading);
          if (urls.length > 0) setAnnotatedUrls(urls);
          setIsStreaming(false);
          setStreamStatus("完了");
          addLog(
            "status",
            `採点完了: ${grading.total_score}/${grading.max_total_score}点`,
          );
        },
        onError: (err) => {
          setError(err);
          setIsStreaming(false);
          addLog("error", err);
        },
        onDone: () => {
          setIsStreaming(false);
        },
      });

      esRef.current = es;
    }

    return () => {
      esRef.current?.close();
      if (flushRef.current !== null) cancelAnimationFrame(flushRef.current);
    };
  }, [id, scheduleFlush]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          新しい採点
        </Link>

        {/* ── ストリーミング中 ── */}
        {isStreaming && (
          <StreamingView
            logs={logs}
            status={streamStatus}
            reasoningText={reasoningText}
            streamingText={streamingText}
          />
        )}

        {/* ── エラー ── */}
        {error && !isStreaming && (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center">
              <p className="text-destructive font-medium">{error}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/">もう一度やり直す</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── 採点結果 ── */}
        {result && !isStreaming && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Score */}
            <div className="flex flex-col items-center gap-4 py-4">
              <ScoreCircle
                score={result.total_score}
                maxScore={result.max_total_score}
              />
              <Badge variant="secondary">{result.difficulty_assessment}</Badge>
            </div>

            {/* 添削画像 — スコア直下にヒーロー表示 */}
            {annotatedUrls.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  添削結果
                </h3>
                {/* 1枚: フル幅 / 2枚以上: モバイル横スクロール・デスクトップグリッド */}
                <div
                  className={
                    annotatedUrls.length === 1
                      ? "grid grid-cols-1"
                      : "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0"
                  }
                >
                  {annotatedUrls.map((url, i) => (
                    <Dialog key={i}>
                      <DialogTrigger asChild>
                        <button
                          className={`group relative overflow-hidden rounded-xl border bg-muted/30 hover:border-primary/30 transition-all snap-center ${
                            annotatedUrls.length > 1
                              ? "min-w-[85vw] sm:min-w-0"
                              : ""
                          }`}
                        >
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
                      <DialogContent className="max-w-4xl p-2" aria-describedby={undefined}>
                        <DialogTitle className="sr-only">{`添削画像 ${i + 1}`}</DialogTitle>
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
                {/* スクロールインジケータ（モバイル・複数枚時のみ） */}
                {annotatedUrls.length > 1 && (
                  <div className="flex justify-center gap-1.5 sm:hidden">
                    {annotatedUrls.map((_, i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <Separator />

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1 text-xs sm:text-sm">
                  問題別の採点
                </TabsTrigger>
                <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm">
                  総合評価
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4">
                <div className="space-y-4 stagger-children">
                  {result.questions.map((q, i) => (
                    <QuestionCard key={i} q={q} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <Card>
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold mb-2">総合評価</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {result.overall_evaluation}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-success/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-success mb-2">良い点</h3>
                    <ul className="space-y-1.5">
                      {result.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed">
                          <span className="text-success shrink-0 mt-0.5">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7l3 3 5-5" /></svg>
                          </span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-destructive/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-destructive mb-2">改善点</h3>
                    <ul className="space-y-1.5">
                      {result.weaknesses.map((w, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed">
                          <span className="text-destructive shrink-0 mt-1">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="3" /></svg>
                          </span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-primary/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-primary mb-2">学習アドバイス</h3>
                    <ul className="space-y-1.5">
                      {result.study_advice.map((a, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed">
                          <span className="text-primary shrink-0 mt-0.5 font-bold text-xs">{i + 1}.</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

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
