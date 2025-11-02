import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";

interface MetricCardWithProgressProps {
  label: string;
  value: string | number;
  progress: number;
  icon: LucideIcon;
  iconColor?: "blue" | "purple" | "green" | "orange";
  progressColor?: "blue" | "purple" | "green" | "orange";
  trend?: "up" | "down" | "neutral";
  trendValue?: string | number;
}

const iconColorClasses = {
  blue: "text-blue-600 dark:text-blue-400",
  purple: "text-purple-600 dark:text-purple-400",
  green: "text-green-600 dark:text-green-400",
  orange: "text-orange-600 dark:text-orange-400",
};

const progressBarColorClasses = {
  blue: "bg-blue-600 dark:bg-blue-500",
  purple: "bg-purple-600 dark:bg-purple-500",
  green: "bg-green-600 dark:bg-green-500",
  orange: "bg-orange-600 dark:bg-orange-500",
};

export function MetricCardWithProgress({ 
  label, 
  value, 
  progress,
  icon: Icon, 
  iconColor = "blue",
  progressColor = "blue",
  trend,
  trendValue
}: MetricCardWithProgressProps) {
  const getTrendIcon = () => {
    if (trend === "up") return TrendingUp;
    if (trend === "down") return TrendingDown;
    return null;
  };

  const getTrendColor = () => {
    if (trend === "up") return "text-green-600 dark:text-green-400";
    if (trend === "down") return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const TrendIcon = getTrendIcon();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <div className={`h-10 w-10 ${iconColorClasses[iconColor]}`}>
            <Icon className="h-full w-full" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <CardTitle className="font-bold mb-1" style={{ fontSize: 'var(--metric-card-value-size)' }}>
            {value}
          </CardTitle>
          {trend && TrendIcon && (
            <div className={`flex items-center gap-1 ${getTrendColor()}`}>
              <TrendIcon className="h-4 w-4" />
              {trendValue && (
                <span className="text-sm font-medium">{trendValue}</span>
              )}
            </div>
          )}
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted mt-4">
          <div 
            className={`h-full transition-all ${progressBarColorClasses[progressColor]}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
