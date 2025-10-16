import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { MoreVertical } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const entries = [
  {
    id: "PRJ-001",
    name: "Website Redesign",
    status: "In Progress",
    priority: "High",
    assignee: {
      name: "Sarah Johnson",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
      initials: "SJ",
    },
    dueDate: "Oct 20, 2025",
    progress: 75,
  },
  {
    id: "PRJ-002",
    name: "Mobile App Development",
    status: "In Progress",
    priority: "High",
    assignee: {
      name: "Michael Chen",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
      initials: "MC",
    },
    dueDate: "Nov 15, 2025",
    progress: 45,
  },
  {
    id: "PRJ-003",
    name: "Marketing Campaign",
    status: "In Progress",
    priority: "Medium",
    assignee: {
      name: "Emily Rodriguez",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
      initials: "ER",
    },
    dueDate: "Oct 25, 2025",
    progress: 60,
  },
  {
    id: "PRJ-004",
    name: "Q3 Financial Report",
    status: "Completed",
    priority: "High",
    assignee: {
      name: "David Kim",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
      initials: "DK",
    },
    dueDate: "Oct 10, 2025",
    progress: 100,
  },
  {
    id: "PRJ-005",
    name: "User Research Study",
    status: "Completed",
    priority: "Medium",
    assignee: {
      name: "Lisa Wang",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
      initials: "LW",
    },
    dueDate: "Oct 12, 2025",
    progress: 100,
  },
  {
    id: "PRJ-006",
    name: "Client Feedback Review",
    status: "Needs Attention",
    priority: "High",
    assignee: {
      name: "James Brown",
      avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop",
      initials: "JB",
    },
    dueDate: "Oct 18, 2025",
    progress: 20,
  },
  {
    id: "PRJ-007",
    name: "Server Migration",
    status: "Needs Attention",
    priority: "High",
    assignee: {
      name: "Sarah Johnson",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
      initials: "SJ",
    },
    dueDate: "Oct 22, 2025",
    progress: 35,
  },
  {
    id: "PRJ-008",
    name: "API Documentation",
    status: "Needs Attention",
    priority: "Low",
    assignee: {
      name: "Michael Chen",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
      initials: "MC",
    },
    dueDate: "Oct 30, 2025",
    progress: 15,
  },
];

const statusColors: Record<string, string> = {
  "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
  "Completed": "bg-green-100 text-green-700 border-green-200",
  "Needs Attention": "bg-orange-100 text-orange-700 border-orange-200",
};

const priorityColors: Record<string, string> = {
  "High": "bg-red-100 text-red-700 border-red-200",
  "Medium": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Low": "bg-gray-100 text-gray-700 border-gray-200",
};

export function EntriesTable() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-gray-900">Recent Projects</h2>
        <Button variant="outline">View All</Button>
      </div>
      
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <div>
                    <div className="text-gray-900">{entry.name}</div>
                    <div className="text-gray-500">{entry.id}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColors[entry.status]}>
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={priorityColors[entry.priority]}>
                    {entry.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={entry.assignee.avatar} />
                      <AvatarFallback>{entry.assignee.initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-gray-900">{entry.assignee.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-gray-600">{entry.dueDate}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${entry.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-gray-600">{entry.progress}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Edit</DropdownMenuItem>
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
