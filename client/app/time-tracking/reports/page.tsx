"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Calendar,
  Download,
  Filter,
  ChevronDown,
  Search,
  BarChart3,
  Users,
  Clock,
  DollarSign
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Types
interface TimeReport {
  _id: string;
  projectId: string;
  projectName: string;
  customerName: string;
  taskName: string;
  userId?: string;
  userName: string;
  date: string;
  duration: string;
  hourlyRate: string;
  totalAmount: string;
  isBillable: boolean;
  status: string;
}

interface ReportFilters {
  dateRange: "this-week" | "this-month" | "last-month" | "custom";
  startDate: string;
  endDate: string;
  userId: string;
  billableFilter: "all" | "billable" | "non-billable";
  statusFilter: "all" | "completed" | "in-progress" | "pending";
}

export default function TimeTrackingReportsPage() {
  const router = useRouter();
  const { firebaseUser, dbUser, loading: authLoading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  
  // State
  const [reports, setReports] = useState<TimeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ReportFilters>({
    dateRange: "this-week",
    startDate: "",
    endDate: "",
    userId: "all",
    billableFilter: "all",
    statusFilter: "all"
  });

  // Mock data - replace with API call
  useEffect(() => {
    if (!authLoading) {
      if (!firebaseUser) { router.push("/login"); return; }
      
      if (!orgLoading && firebaseUser && needsOrgSetup) {
        router.push("/org-setup");
          return;
      }

      // Mock report data
      const mockReports: TimeReport[] = [
        {
          _id: "1",
          projectId: "1",
          projectName: "Website Development",
          customerName: "John Doe",
          taskName: "Frontend Development",
          userName: "John Smith",
          date: "2024-03-12",
          duration: "03:30",
          hourlyRate: "₹75",
          totalAmount: "₹262.50",
          isBillable: true,
          status: "completed"
        },
        {
          _id: "2",
          projectId: "1",
          projectName: "Website Development",
          customerName: "John Doe",
          taskName: "Backend API",
          userName: "Jane Doe",
          date: "2024-03-12",
          duration: "04:15",
          hourlyRate: "₹75",
          totalAmount: "₹318.75",
          isBillable: true,
          status: "completed"
        },
        {
          _id: "3",
          projectId: "2",
          projectName: "Mobile App Design",
          customerName: "Jane Smith",
          taskName: "UI/UX Design",
          userName: "John Smith",
          date: "2024-03-11",
          duration: "02:00",
          hourlyRate: "₹65",
          totalAmount: "₹130.00",
          isBillable: false,
          status: "in-progress"
        }
      ];
      
      setReports(mockReports);
      setLoading(false);
    }
  }, [authLoading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Filter reports
  const filteredReports = reports.filter(report => {
    const matchesUser = filters.userId === "all" || (report.userId ?? report.userName) === filters.userId;
    const matchesBillable = filters.billableFilter === "all" || 
                           (filters.billableFilter === "billable" && report.isBillable) ||
                           (filters.billableFilter === "non-billable" && !report.isBillable);
    const matchesStatus = filters.statusFilter === "all" || report.status === filters.statusFilter;
    
    return matchesUser && matchesBillable && matchesStatus;
  });

  // Calculate summaries
  const totalHours = filteredReports.reduce((acc, report) => {
    const [hours, minutes] = report.duration.split(':').map(Number);
    return acc + hours + (minutes / 60);
  }, 0);

  const billableHours = filteredReports
    .filter(report => report.isBillable)
    .reduce((acc, report) => {
      const [hours, minutes] = report.duration.split(':').map(Number);
      return acc + hours + (minutes / 60);
    }, 0);

  const totalAmount = filteredReports.reduce((acc, report) => {
    const amount = parseFloat(report.totalAmount.replace('₹', ''));
    return acc + amount;
  }, 0);

  // Group by user
  const hoursByUser = filteredReports.reduce((acc, report) => {
    const [hours, minutes] = report.duration.split(':').map(Number);
    const totalHours = hours + (minutes / 60);
    acc[report.userName] = (acc[report.userName] || 0) + totalHours;
    return acc;
  }, {} as Record<string, number>);

  // Group by task
  const hoursByTask = filteredReports.reduce((acc, report) => {
    const [hours, minutes] = report.duration.split(':').map(Number);
    const totalHours = hours + (minutes / 60);
    acc[report.taskName] = (acc[report.taskName] || 0) + totalHours;
    return acc;
  }, {} as Record<string, number>);

  // Export functions
  const handleExportCSV = () => {
    const headers = ["Date", "Project", "Task", "User", "Duration", "Billable", "Amount", "Status"];
    const csvData = filteredReports.map(report => [
      report.date,
      report.projectName,
      report.taskName,
      report.userName,
      report.duration,
      report.isBillable ? "Yes" : "No",
      report.totalAmount,
      report.status
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-tracking-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    alert("PDF export would be implemented here");
  };

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <PageHeader 
          breadcrumb={
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Time Tracking Reports</span>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              {/* Export */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleExportCSV}>Export as CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}>Export as PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />

        {/* Content */}
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Date Range */}
                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <Select
                    value={filters.dateRange}
                    onValueChange={(value: "this-week" | "this-month" | "last-month" | "custom") => 
                      setFilters({...filters, dateRange: value})
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this-week">This Week</SelectItem>
                      <SelectItem value="this-month">This Month</SelectItem>
                      <SelectItem value="last-month">Last Month</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Date Range */}
                {filters.dateRange === "custom" && (
                  <>
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                      />
                    </div>
                  </>
                )}

                {/* User Filter */}
                <div className="space-y-2">
                  <Label>User</Label>
                  <Select
                    value={filters.userId}
                    onValueChange={(value: string) => setFilters({...filters, userId: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="user1">John Smith</SelectItem>
                      <SelectItem value="user2">Jane Doe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Billable Filter */}
                <div className="space-y-2">
                  <Label>Billable</Label>
                  <Select
                    value={filters.billableFilter}
                    onValueChange={(value: "all" | "billable" | "non-billable") => 
                      setFilters({...filters, billableFilter: value})
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Entries</SelectItem>
                      <SelectItem value="billable">Billable Only</SelectItem>
                      <SelectItem value="non-billable">Non-billable Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={filters.statusFilter}
                    onValueChange={(value: "all" | "completed" | "in-progress" | "pending") => 
                      setFilters({...filters, statusFilter: value})
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Billable Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{billableHours.toFixed(1)}h</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">₹{totalAmount.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Entries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{filteredReports.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Hours by User */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Hours by User
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(hoursByUser).map(([user, hours]) => (
                    <div key={user} className="flex items-center justify-between">
                      <span className="text-sm">{user}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ 
                              width: `${Math.min((hours / totalHours) * 100, 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-medium">{hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Hours by Task */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Hours by Task
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(hoursByTask).map(([task, hours]) => (
                    <div key={task} className="flex items-center justify-between">
                      <span className="text-sm truncate max-w-[200px]">{task}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full transition-all duration-300"
                            style={{ 
                              width: `${Math.min((hours / totalHours) * 100, 100)}%` 
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-medium">{hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reports Table */}
          <Card>
            <CardHeader>
              <CardTitle>Time Entries</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report._id}>
                      <TableCell className="font-medium">{report.date}</TableCell>
                      <TableCell>{report.projectName}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{report.taskName}</div>
                        </div>
                      </TableCell>
                      <TableCell>{report.userName}</TableCell>
                      <TableCell className="font-medium">{report.duration}</TableCell>
                      <TableCell>
                        <Badge variant={report.isBillable ? "default" : "secondary"}>
                          {report.isBillable ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{report.totalAmount}</TableCell>
                      <TableCell>
                        <Badge variant={
                          report.status === "completed" ? "default" :
                          report.status === "in-progress" ? "secondary" :
                          "outline"
                        }>
                          {report.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
