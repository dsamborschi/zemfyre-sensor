import { Clock, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";

const summaries = [
  {
    title: "In Progress",
    count: 12,
    icon: Clock,
    color: "blue",
    bgColor: "bg-blue-50",
    iconColor: "text-blue-600",
    items: [
      { name: "Website Redesign", progress: 75 },
      { name: "Mobile App Development", progress: 45 },
      { name: "Marketing Campaign", progress: 60 },
    ],
  },
  {
    title: "Completed",
    count: 48,
    icon: CheckCircle2,
    color: "green",
    bgColor: "bg-green-50",
    iconColor: "text-green-600",
    items: [
      { name: "Q3 Financial Report", progress: 100 },
      { name: "User Research Study", progress: 100 },
      { name: "Brand Guidelines", progress: 100 },
    ],
  },
  {
    title: "Needs Attention",
    count: 5,
    icon: AlertCircle,
    color: "orange",
    bgColor: "bg-orange-50",
    iconColor: "text-orange-600",
    items: [
      { name: "Client Feedback Review", progress: 20 },
      { name: "Server Migration", progress: 35 },
      { name: "API Documentation", progress: 15 },
    ],
  },
  {
    title: "Upcoming",
    count: 8,
    icon: Calendar,
    color: "purple",
    bgColor: "bg-purple-50",
    iconColor: "text-purple-600",
    items: [
      { name: "Q1 Planning Session", progress: 0 },
      { name: "Product Launch Event", progress: 0 },
      { name: "Team Offsite", progress: 0 },
    ],
  },
];

export function SummaryCards() {
  return (
    <div className="space-y-4">
      <h2 className="text-gray-900">Project Summary</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaries.map((summary, index) => {
          const Icon = summary.icon;
          return (
            <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-gray-600 mb-1">{summary.title}</p>
                  <p className="text-gray-900">{summary.count}</p>
                </div>
                <div className={`w-10 h-10 ${summary.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${summary.iconColor}`} />
                </div>
              </div>
              
              <div className="space-y-3">
                {summary.items.slice(0, 2).map((item, itemIndex) => (
                  <div key={itemIndex} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-700">{item.name}</span>
                    </div>
                    <Progress value={item.progress} className="h-1.5" />
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
