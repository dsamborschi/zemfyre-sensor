import { Card } from "./ui/card";

interface InfoItem {
  label: string;
  value: string;
}

interface GeneralInfoCardProps {
  systemInfo: InfoItem[];
}

export function GeneralInfoCard({ systemInfo }: GeneralInfoCardProps) {
  return (
    <Card className="p-4 md:p-6">
      <div className="mb-4">
        <h3 className="text-foreground mb-1">General Info</h3>
        <p className="text-muted-foreground">Device details and configuration</p>
      </div>
      <div className="space-y-3">
        {systemInfo.map((info, index) => (
          <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-muted-foreground">{info.label}</span>
            <span className="text-foreground">{info.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
