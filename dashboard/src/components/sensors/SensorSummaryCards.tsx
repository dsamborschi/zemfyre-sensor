/**
 * Sensor Summary Cards Component
 * Shows total, online, offline, and error counts
 */

import React from 'react';
import { Activity, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/components/ui/utils';

interface SensorSummary {
  total: number;
  online: number;
  offline: number;
  errors: number;
}

interface SensorSummaryCardsProps {
  summary: SensorSummary;
}

interface SummaryCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant: 'default' | 'success' | 'destructive' | 'warning';
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, variant }) => {
  const variantStyles = {
    default: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
    success: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
    destructive: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
    warning: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
  };

  const iconStyles = {
    default: 'text-blue-600 dark:text-blue-400',
    success: 'text-green-600 dark:text-green-400',
    destructive: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
  };

  return (
    <Card className={cn('border-2', variantStyles[variant])}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
          <div className={cn('h-12 w-12', iconStyles[variant])}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const SensorSummaryCards: React.FC<SensorSummaryCardsProps> = ({ summary }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        title="Total Sensors"
        value={summary.total}
        icon={<Activity className="h-full w-full" />}
        variant="default"
      />
      
      <SummaryCard
        title="Online"
        value={summary.online}
        icon={<CheckCircle className="h-full w-full" />}
        variant="success"
      />
      
      <SummaryCard
        title="Offline"
        value={summary.offline}
        icon={<XCircle className="h-full w-full" />}
        variant="destructive"
      />
      
      <SummaryCard
        title="Errors"
        value={summary.errors}
        icon={<AlertTriangle className="h-full w-full" />}
        variant="warning"
      />
    </div>
  );
};
