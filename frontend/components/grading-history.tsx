import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { GradingHistoryItem } from "@/lib/types";

interface GradingHistoryProps {
  items: GradingHistoryItem[];
}

export function GradingHistory({ items }: GradingHistoryProps) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">採点履歴</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <Separator className="mb-3" />}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2 flex-1">
                      {item.problem}
                    </p>
                    <Badge
                      variant={
                        item.result.is_correct ? "default" : "destructive"
                      }
                      className="text-[10px] shrink-0"
                    >
                      {Math.round(item.result.score * 100)}点
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.timestamp.toLocaleString("ja-JP")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
