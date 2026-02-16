"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Platform = "ios" | "android" | "desktop" | "unknown";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/.test(ua)) {
    return "android";
  }
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// --- Icons ---

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function PlusSquareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// --- Step component ---

function Step({ number, icon, children }: { number: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
        {number}
      </div>
      <div className="flex-1 pt-0.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <p className="text-sm leading-relaxed text-foreground">{children}</p>
      </div>
    </div>
  );
}

// --- Platform cards ---

function IOSInstructions() {
  return (
    <Card className="border-0 shadow-sm bg-card">
      <CardContent className="p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white text-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">iPhone / iPad</h3>
            <p className="text-xs text-muted-foreground">Safari でこのページを開いてください</p>
          </div>
        </div>

        <div className="space-y-4">
          <Step number={1} icon={<ShareIcon />}>
            画面下部の<span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-muted text-xs font-medium"><ShareIcon className="mr-1 inline" />共有</span>ボタンをタップ
          </Step>
          <Step number={2} icon={<PlusSquareIcon />}>
            メニューをスクロールして「<span className="font-medium">ホーム画面に追加</span>」をタップ
          </Step>
          <Step number={3} icon={<CheckCircleIcon />}>
            右上の「<span className="font-medium">追加</span>」をタップすればインストール完了
          </Step>
        </div>
      </CardContent>
    </Card>
  );
}

function AndroidInstructions({ deferredPrompt, onInstall }: { deferredPrompt: BeforeInstallPromptEvent | null; onInstall: () => void }) {
  return (
    <Card className="border-0 shadow-sm bg-card">
      <CardContent className="p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.523 15.341c-.397-.642-.927-1.17-1.572-1.544l1.544-2.674a.622.622 0 0 0-.227-.849.622.622 0 0 0-.849.227l-1.564 2.71a7.167 7.167 0 0 0-5.71 0L7.581 10.5a.622.622 0 0 0-.849-.227.622.622 0 0 0-.227.849l1.544 2.674c-.645.374-1.175.902-1.572 1.544A4.324 4.324 0 0 0 5.8 17.9h12.4a4.324 4.324 0 0 0-.677-2.559zM9.5 16.2a.7.7 0 1 1 .001-1.401A.7.7 0 0 1 9.5 16.2zm5 0a.7.7 0 1 1 .001-1.401.7.7 0 0 1-.001 1.401z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Android</h3>
            <p className="text-xs text-muted-foreground">Chrome でこのページを開いてください</p>
          </div>
        </div>

        {deferredPrompt ? (
          <Button onClick={onInstall} className="w-full h-11 text-base font-semibold shadow-sm" size="lg">
            <DownloadIcon className="mr-2" />
            アプリをインストール
          </Button>
        ) : (
          <div className="space-y-4">
            <Step number={1} icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
            }>
              Chrome の右上にある<span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-muted text-xs font-medium">&#8942; メニュー</span>をタップ
            </Step>
            <Step number={2} icon={<DownloadIcon />}>
              「<span className="font-medium">アプリをインストール</span>」または「<span className="font-medium">ホーム画面に追加</span>」をタップ
            </Step>
            <Step number={3} icon={<CheckCircleIcon />}>
              確認ダイアログで「<span className="font-medium">インストール</span>」をタップ
            </Step>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DesktopInstructions({ deferredPrompt, onInstall }: { deferredPrompt: BeforeInstallPromptEvent | null; onInstall: () => void }) {
  return (
    <Card className="border-0 shadow-sm bg-card">
      <CardContent className="p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">PC / Mac</h3>
            <p className="text-xs text-muted-foreground">Chrome / Edge でこのページを開いてください</p>
          </div>
        </div>

        {deferredPrompt ? (
          <Button onClick={onInstall} className="w-full h-11 text-base font-semibold shadow-sm" size="lg">
            <DownloadIcon className="mr-2" />
            アプリをインストール
          </Button>
        ) : (
          <div className="space-y-4">
            <Step number={1} icon={<DownloadIcon />}>
              アドレスバー右側の<span className="inline-flex items-center mx-1 px-1.5 py-0.5 rounded bg-muted text-xs font-medium"><DownloadIcon className="mr-1 inline" />インストール</span>アイコンをクリック
            </Step>
            <Step number={2} icon={<CheckCircleIcon />}>
              「<span className="font-medium">インストール</span>」をクリックすれば完了
            </Step>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlreadyInstalled() {
  return (
    <Card className="border-0 shadow-sm bg-card">
      <CardContent className="p-6 text-center space-y-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 text-green-600 mx-auto">
          <CheckCircleIcon className="!w-7 !h-7" />
        </div>
        <h3 className="text-lg font-semibold">インストール済み</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          ScoGene は既にアプリとしてインストールされています。<br />
          ホーム画面からいつでも起動できます。
        </p>
      </CardContent>
    </Card>
  );
}

// --- Main page ---

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const appInstalledHandler = () => {
      setJustInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", appInstalledHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setJustInstalled(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // Register SW on this page too
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            アプリをインストール
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
            ホーム画面に追加して、ワンタップで即起動。
            <br className="hidden sm:block" />
            オフラインでも前回の結果を確認できます。
          </p>
        </div>

        <div className="space-y-4">
          {/* Installed or just-installed state */}
          {(installed || justInstalled) && <AlreadyInstalled />}

          {/* Platform-specific primary card */}
          {!installed && !justInstalled && (
            <>
              {platform === "ios" && <IOSInstructions />}
              {platform === "android" && (
                <AndroidInstructions deferredPrompt={deferredPrompt} onInstall={handleInstall} />
              )}
              {(platform === "desktop" || platform === "unknown") && (
                <DesktopInstructions deferredPrompt={deferredPrompt} onInstall={handleInstall} />
              )}
            </>
          )}

          {/* Other platforms (collapsed) */}
          {!installed && !justInstalled && (
            <details className="group">
              <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-2">
                <svg className="w-4 h-4 transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
                その他のデバイスの手順を見る
              </summary>
              <div className="space-y-4 pt-3 animate-fade-in-up">
                {platform !== "ios" && <IOSInstructions />}
                {platform !== "android" && (
                  <AndroidInstructions deferredPrompt={deferredPrompt} onInstall={handleInstall} />
                )}
                {platform !== "desktop" && platform !== "unknown" && (
                  <DesktopInstructions deferredPrompt={deferredPrompt} onInstall={handleInstall} />
                )}
              </div>
            </details>
          )}
        </div>

        {/* Benefits section */}
        <div className="mt-12 sm:mt-16">
          <h2 className="text-base font-semibold mb-4">アプリで使うメリット</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
            <Card className="border-0 shadow-none bg-muted/40">
              <CardContent className="p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold">ワンタップ起動</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  ブラウザを開かずにホーム画面から即アクセス。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-muted/40">
              <CardContent className="p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold">フルスクリーン</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  ブラウザのUIが消え、アプリのような体験。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-muted/40">
              <CardContent className="p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <line x1="12" y1="20" x2="12.01" y2="20" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold">オフライン対応</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  過去の採点結果はオフラインでも閲覧可能。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
