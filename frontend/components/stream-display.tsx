import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StreamDisplayProps {
  content: string;
  statusMessage: string;
  isActive: boolean;
}

export function StreamDisplay({
  content,
  statusMessage,
  isActive,
}: StreamDisplayProps) {
  if (!isActive && !content) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          採点中
          {isActive && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
          )}
        </CardTitle>
        {statusMessage && (
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        )}
      </CardHeader>
      <CardContent>
        {content ? (
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm font-mono leading-relaxed overflow-x-auto">
            {content}
          </pre>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
