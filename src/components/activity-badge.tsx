import { Badge } from "@/components/ui/badge";
import { getActivityLevel, getActivityColour } from "@/lib/constants";

const LABELS: Record<ReturnType<typeof getActivityLevel>, string> = {
  quiet: "Quiet",
  moderate: "Moderate",
  busy: "Busy",
  "very-busy": "Very Busy",
};

export function ActivityBadge({ ratio }: { ratio: number }) {
  const level = getActivityLevel(ratio);
  const colour = getActivityColour(level);

  return (
    <Badge
      variant="outline"
      className="border-transparent font-medium"
      style={{ backgroundColor: `${colour}20`, color: colour }}
    >
      {LABELS[level]}
    </Badge>
  );
}
