export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4 md:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            S
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none tracking-tight">
              ScoGene
            </h1>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
              AI Math Grader
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
