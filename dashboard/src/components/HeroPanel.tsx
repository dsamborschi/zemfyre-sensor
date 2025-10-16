import { TrendingUp, Users, Target, Award } from "lucide-react";
import { Card } from "./ui/card";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const chartData = [
  { name: "Jan", value: 4000, projects: 24 },
  { name: "Feb", value: 3000, projects: 18 },
  { name: "Mar", value: 5000, projects: 32 },
  { name: "Apr", value: 4500, projects: 28 },
  { name: "May", value: 6000, projects: 38 },
  { name: "Jun", value: 5500, projects: 35 },
];

const achievements = [
  {
    icon: TrendingUp,
    label: "Total Revenue",
    value: "$124,500",
    change: "+12.5%",
    positive: true,
  },
  {
    icon: Users,
    label: "Active Users",
    value: "8,549",
    change: "+8.2%",
    positive: true,
  },
  {
    icon: Target,
    label: "Projects",
    value: "175",
    change: "+23.1%",
    positive: true,
  },
  {
    icon: Award,
    label: "Success Rate",
    value: "94.8%",
    change: "+2.4%",
    positive: true,
  },
];

export function HeroPanel() {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-8 text-white">
        <div className="max-w-2xl">
          <h1 className="text-white mb-2">Welcome back, John! 👋</h1>
          <p className="text-blue-100">
            Here's what's happening with your projects today. You have 12 active tasks and 3 upcoming deadlines.
          </p>
        </div>
      </div>

      {/* Achievement Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {achievements.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-600 mb-1">{stat.label}</p>
                  <p className="text-gray-900 mb-2">{stat.value}</p>
                  <span
                    className={`inline-flex items-center gap-1 ${
                      stat.positive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" />
                    <span>{stat.change}</span>
                  </span>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Data Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="text-gray-900 mb-1">Revenue Overview</h3>
            <p className="text-gray-600">Monthly revenue performance</p>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorValue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Projects Chart */}
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="text-gray-900 mb-1">Project Activity</h3>
            <p className="text-gray-600">Projects completed per month</p>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip />
              <Bar dataKey="projects" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
