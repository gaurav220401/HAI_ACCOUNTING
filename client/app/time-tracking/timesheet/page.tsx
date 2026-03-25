"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronDown, 
  Search, 
  Plus, 
  Play, 
  Clock,
  Filter,
  Edit,
  FileText,
  X,
  Calendar,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Info
} from "lucide-react";

// Real backend data integration active

export default function TimesheetPage() {
  const router = useRouter();
  const { firebaseUser, dbUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("this-week");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [timesheetsLoading, setTimesheetsLoading] = useState(true);
  const [selectedTimesheet, setSelectedTimesheet] = useState<any | null>(null);
  const [showWeeklyLog, setShowWeeklyLog] = useState(false);

  const formatDurationParts = (durationStr: string) => {
    if (!durationStr) return { hrs: 0, mins: 0 };
    const parts = durationStr.split(':').map(Number);
    return { hrs: parts[0] || 0, mins: parts[1] || 0 };
  };

  useEffect(() => {
    if (!loading) {
      if (!firebaseUser) { router.push("/login"); return; }
    }
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !needsOrgSetup) {
      fetchTimesheets();
    }
  }, [firebaseUser, needsOrgSetup]);

  const fetchTimesheets = async () => {
    try {
      setTimesheetsLoading(true);
      const { projectApi } = await import('@/lib/api');
      const response = await projectApi.getAllTimesheets();
      if (response.data) {
        setTimesheets(response.data);
      } else {
        setTimesheets([]);
      }
    } catch (error) {
      console.error('Failed to fetch timesheets:', error);
      setTimesheets([]);
    } finally {
      setTimesheetsLoading(false);
    }
  };

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filteredTimesheets = timesheets.filter(timesheet =>
    (timesheet.project || timesheet.projectName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (timesheet.customer || timesheet.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (timesheet.task || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (timesheet.user || timesheet.userName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Weekly Logic ---
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const getDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weekDayKeys = weekDays.map(getDayKey);
  const weekDaysFormatted = weekDays.map(d => ({
    day: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    date: `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short' })}`
  }));

  const formatHoursMins = (durationStr: string) => {
    if (!durationStr || durationStr === '00:00:00' || durationStr === '00:00') return ''; 
    const parts = durationStr.split(':').map(Number);
    const hrs = parts[0] || 0;
    const mins = parts[1] || 0;
    if (hrs === 0 && mins === 0) return '';
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const addTimes = (t1: string, t2: string) => {
    const p1 = (t1 || '00:00:00').split(':').map(Number);
    const p2 = (t2 || '00:00:00').split(':').map(Number);
    const s1 = (p1[0] || 0) * 3600 + (p1[1] || 0) * 60 + (p1[2] || 0);
    const s2 = (p2[0] || 0) * 3600 + (p2[1] || 0) * 60 + (p2[2] || 0);
    const total = s1 + s2;
    if (total === 0) return '00:00';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const weeklyDataMap = new Map<string, any>();
  timesheets.forEach(ts => {
    if (!ts.date) return;
    const tsDateObj = new Date(ts.date);
    const tsDateKey = getDayKey(tsDateObj);
    if (weekDayKeys.includes(tsDateKey)) {
      const rowKey = `${ts.projectId}-${ts.task}`;
      if (!weeklyDataMap.has(rowKey)) {
        weeklyDataMap.set(rowKey, {
          projectId: ts.projectId,
          projectName: ts.project || ts.projectName || 'Unnamed Project',
          task: ts.task || 'No task',
          isBillable: ts.isBillable !== false,
          days: {}
        });
      }
      const row = weeklyDataMap.get(rowKey);
      if (!row.days[tsDateKey]) row.days[tsDateKey] = '00:00';
      row.days[tsDateKey] = addTimes(row.days[tsDateKey], ts.duration || ts.time || '00:00');
    }
  });

  const weeklyRows = Array.from(weeklyDataMap.values());
  let absoluteTotal = '00:00';
  const columnTotals: Record<string, string> = {};
  
  weekDayKeys.forEach(k => {
    let dayTotal = '00:00';
    weeklyRows.forEach(row => {
      dayTotal = addTimes(dayTotal, row.days[k] || '00:00');
    });
    columnTotals[k] = dayTotal;
    absoluteTotal = addTimes(absoluteTotal, dayTotal);
  });

  weeklyRows.forEach(row => {
    let rowTotal = '00:00';
    weekDayKeys.forEach(k => {
      rowTotal = addTimes(rowTotal, row.days[k] || '00:00');
    });
    row.total = rowTotal;
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <PageHeader 
          breadcrumb={
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Timesheet</span>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search timesheets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          }
        />

        {/* Content Layout */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col gap-6 p-6 overflow-auto">
            {/* Filters and Actions */}
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                {/* Status Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      Status
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setStatusFilter("all")}>All Status</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("completed")}>Completed</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("pending")}>Pending</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusFilter("in-progress")}>In Progress</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Period Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      Period
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setPeriodFilter("today")}>Today</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriodFilter("this-week")}>This Week</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriodFilter("this-month")}>This Month</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriodFilter("last-month")}>Last Month</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriodFilter("custom")}>Custom Range</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Customer Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      Customer
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setCustomerFilter("all")}>All Customers</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCustomerFilter("john-smith")}>John Smith Customer</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCustomerFilter("jane-smith")}>Jane Smith</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCustomerFilter("acme")}>Acme Corp</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Project Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      Project
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setProjectFilter("all")}>All Projects</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProjectFilter("elegant-plastic")}>Elegant Plastic Fish</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProjectFilter("website-dev")}>Website Development</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProjectFilter("mobile-app")}>Mobile App Design</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProjectFilter("database-migration")}>Database Migration</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* User Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      User
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setUserFilter("all")}>All Users</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setUserFilter("glen")}>Glen Hill</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setUserFilter("brittany")}>Dr. Brittany Simon</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Filter Button */}
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filter
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {/* Start Button */}
                <Button variant="outline" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground border-transparent">
                  <Play className="h-4 w-4 fill-current" />
                  Start
                </Button>

                {/* Log Time Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 bg-blue-500 text-white hover:bg-blue-600 hover:text-white border-transparent">
                      Log Time
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-1">
                    <DropdownMenuItem className="bg-blue-500 text-white focus:bg-blue-600 focus:text-white cursor-pointer justify-between rounded-sm">
                      Log Time
                      <span className="text-xs text-blue-100">c+t</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="cursor-pointer py-2.5 text-foreground"
                      onClick={() => setShowWeeklyLog(true)}
                    >
                      Weekly Log
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer py-2.5 justify-between text-foreground">
                      Timer - Chrome Extension
                      <div className="h-4 w-4 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-green-500 shadow-sm" />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Summary Link */}
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Timesheets Table */}
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase">Date</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase">Project</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase">Customer</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase">Task</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase">User</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase">Timing</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTimesheets.length === 0 ? (
                       <TableRow>
                         <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No timesheets found.</TableCell>
                       </TableRow>
                    ) : (
                      filteredTimesheets.map((timesheet) => {
                        const isSelected = selectedTimesheet && (selectedTimesheet._id === timesheet._id || selectedTimesheet.id === timesheet.id);
                        return (
                          <TableRow 
                            key={timesheet.id || timesheet._id}
                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-green-50/70 hover:bg-green-50/90' : 'hover:bg-muted/50'}`}
                            onClick={() => setSelectedTimesheet(timesheet)}
                          >
                            <TableCell className="font-medium">
                               {timesheet.date && timesheet.date.includes('-') && timesheet.date.length === 10 ? timesheet.date : (timesheet.date ? new Date(timesheet.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '')}
                            </TableCell>
                            <TableCell className="text-primary font-medium">{timesheet.project || timesheet.projectName}</TableCell>
                            <TableCell>{timesheet.customer || timesheet.customerName}</TableCell>
                            <TableCell className="max-w-[200px]">
                              <div className="font-medium text-sm truncate">{timesheet.task}</div>
                              {timesheet.description && <div className="text-xs text-muted-foreground truncate">{timesheet.description}</div>}
                            </TableCell>
                            <TableCell>{timesheet.user || timesheet.userName}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                              {timesheet.startTime ? new Date(timesheet.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'} 
                              {' - '}
                              {timesheet.endTime ? new Date(timesheet.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : (timesheet.status === 'in-progress' ? 'Now' : '-')}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {timesheet.status === 'in-progress' ? (
                                <span className="text-green-600 animate-pulse">Running</span>
                              ) : (
                                timesheet.time || timesheet.duration
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Side Panel Widget */}
          {selectedTimesheet && (
            <div className="w-[450px] border-l border-border bg-background flex flex-col h-full shadow-lg overflow-y-auto shrink-0 animate-in slide-in-from-right-8 duration-300 relative z-10">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-20">
                <h3 className="text-lg font-semibold tracking-tight">{selectedTimesheet.user || selectedTimesheet.userName}'s Log Entry</h3>
                <div className="flex gap-2 items-center">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setSelectedTimesheet(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Panel Content */}
              <div className="p-6 flex-1 flex flex-col gap-8">
                {/* Time Summary Card */}
                <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-8 flex flex-col items-center justify-center relative overflow-hidden shadow-sm">
                  <Badge 
                    className={`absolute top-4 right-4 ${selectedTimesheet.billingStatus === 'Invoiced' ? 'bg-green-500 hover:bg-green-600' : 'bg-[#e86a34] hover:bg-[#d55e2a]'}`}
                  >
                    {selectedTimesheet.billingStatus || 'Unbilled'}
                  </Badge>
                  
                  <div className="flex items-center gap-2 text-muted-foreground mb-3 text-sm font-medium">
                    <Calendar className="h-4 w-4" />
                    {selectedTimesheet.date && selectedTimesheet.date.includes('-') && selectedTimesheet.date.length === 10 ? selectedTimesheet.date : (selectedTimesheet.date ? new Date(selectedTimesheet.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '')}
                  </div>
                  
                  {selectedTimesheet.status === 'in-progress' ? (
                    <div className="text-3xl font-semibold text-green-600 animate-pulse">Running...</div>
                  ) : (
                    <div className="text-4xl font-light text-foreground tracking-tight flex items-baseline gap-2">
                      <span className="font-semibold">{formatDurationParts(selectedTimesheet.duration || selectedTimesheet.time).hrs}</span>
                      <span className="text-lg font-medium text-muted-foreground tracking-normal uppercase text-xs">hrs</span>
                      <span className="mx-1">:</span>
                      <span className="font-semibold">{formatDurationParts(selectedTimesheet.duration || selectedTimesheet.time).mins}</span>
                      <span className="text-lg font-medium text-muted-foreground tracking-normal uppercase text-xs">mins</span>
                    </div>
                  )}
                </div>

                {/* Tabs / Headers */}
                <div className="border-b border-border flex gap-6">
                  <div className="text-sm font-semibold text-primary border-b-2 border-primary pb-3 px-1 cursor-pointer">
                    Other Details
                  </div>
                  <div className="text-sm font-medium text-muted-foreground hover:text-foreground pb-3 px-1 cursor-pointer">
                    Comments
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-[140px_1fr] gap-y-6 text-sm">
                  <div className="text-muted-foreground font-medium">Project Name :</div>
                  <div className="font-medium">{selectedTimesheet.project || selectedTimesheet.projectName}</div>

                  <div className="text-muted-foreground font-medium">Customer Name :</div>
                  <div className="font-medium">{selectedTimesheet.customer || selectedTimesheet.customerName}</div>

                  <div className="text-muted-foreground font-medium">Task Name :</div>
                  <div className="font-medium">{selectedTimesheet.task}</div>

                  <div className="text-muted-foreground font-medium">User Name :</div>
                  <div className="font-medium">{selectedTimesheet.user || selectedTimesheet.userName}</div>

                  <div className="text-muted-foreground font-medium">Notes :</div>
                  <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedTimesheet.description || selectedTimesheet.task || "No additional notes provided."}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>

      {/* Weekly Time Log Full Screen Overlay */}
      {showWeeklyLog && (
        <div className="fixed inset-0 bg-background z-[100] flex flex-col animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shadow-sm bg-white">
            <div className="flex items-center gap-2 text-lg font-medium">
              <span className="cursor-pointer text-blue-600 hover:text-blue-800" onClick={() => setShowWeeklyLog(false)}>
                <ChevronLeft className="h-5 w-5 inline mr-1" />
              </span>
              Weekly Time Log
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowWeeklyLog(false)} className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer">
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Content Body */}
          <div className="flex-1 overflow-auto bg-[#f8f9fa] p-6 lg:p-12">
            <div className="max-w-[1200px] mx-auto space-y-4">
              {/* Date Controller Ribbon */}
              <div className="flex justify-between items-center text-sm font-medium mb-2">
                <div className="text-muted-foreground">Year : {today.getFullYear()}</div>
                <div className="flex items-center gap-4 text-base font-semibold">
                  <ChevronLeft className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                  {weekDaysFormatted[0].date} - {weekDaysFormatted[6].date}
                  <ChevronRight className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground" />
                </div>
                <div className="text-blue-600 cursor-pointer hover:underline text-sm flex items-center">
                  View Current Week <ChevronRight className="h-4 w-4 ml-1" />
                </div>
              </div>

              {/* Weekly Input Grid */}
              <div className="bg-white border text-sm border-border rounded-md shadow-sm overflow-hidden flex flex-col">
                {/* Table Header */}
                <div className="grid grid-cols-[minmax(200px,1.5fr)_minmax(200px,1.5fr)_repeat(7,1fr)_80px_100px] border-b border-border bg-[#FBFBFC]">
                  <div className="p-3 font-semibold text-xs tracking-wider text-muted-foreground uppercase flex items-center border-r">PROJECT</div>
                  <div className="p-3 font-semibold text-xs tracking-wider text-muted-foreground uppercase flex items-center border-r">TASK</div>
                  {weekDaysFormatted.map((day, idx) => (
                    <div key={idx} className="p-3 font-semibold text-xs tracking-wider text-muted-foreground uppercase flex flex-col items-center justify-center border-r">
                      {day.day}<span className="font-normal mt-0.5">{day.date}</span>
                    </div>
                  ))}
                  <div className="p-3 font-semibold text-xs tracking-wider text-muted-foreground uppercase flex items-center justify-center border-r">BILLABLE</div>
                  <div className="p-3 font-semibold text-xs tracking-wider text-muted-foreground uppercase flex items-center justify-center">TOTAL</div>
                </div>

                {/* Dynamic Entry Rows */}
                {weeklyRows.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground border-b border-border">
                    No time logged yet for this week.
                  </div>
                ) : (
                  weeklyRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[minmax(200px,1.5fr)_minmax(200px,1.5fr)_repeat(7,1fr)_80px_100px] border-b border-border group">
                      <div className="p-3 border-r border-border hover:bg-muted/30 cursor-pointer flex items-center justify-between text-foreground">
                        {row.projectName} <ChevronDown className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                      <div className="p-3 border-r border-border hover:bg-muted/30 cursor-pointer flex items-center justify-between text-foreground">
                        {row.task} <ChevronDown className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                      
                      {weekDayKeys.map((dayKey, didx) => {
                        const val = formatHoursMins(row.days[dayKey]);
                        const isVal = val !== '';
                        return (
                          <div key={didx} className={`p-3 border-r border-border hover:bg-muted/30 cursor-text flex items-center justify-center font-medium ${isVal && typeof window !== 'undefined' ? 'border-b-2 border-b-blue-400 bg-blue-50/20' : ''}`}>
                            {val}
                          </div>
                        );
                      })}
                      
                      <div className="p-3 border-r border-border flex items-center justify-center">
                        <input type="checkbox" defaultChecked={row.isBillable} className="w-4 h-4 text-blue-500 accent-blue-500" />
                      </div>
                      <div className="p-3 flex items-center justify-center font-semibold bg-muted/10 text-muted-foreground">
                        {formatHoursMins(row.total) || '00:00'}
                      </div>
                    </div>
                  ))
                )}

                {/* Totals Row */}
                <div className="grid grid-cols-[minmax(200px,1.5fr)_minmax(200px,1.5fr)_repeat(7,1fr)_80px_100px] bg-muted/20">
                  <div className="col-span-2 p-3 font-bold text-right text-xs tracking-wider border-r border-border uppercase flex items-center justify-end pr-6 text-foreground">TOTAL</div>
                  {weekDayKeys.map((dayKey, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-center font-semibold text-muted-foreground text-sm border-r border-border">
                      {formatHoursMins(columnTotals[dayKey]) || '00:00'}
                    </div>
                  ))}
                  <div className="p-3 border-r border-border"></div>
                  <div className="p-3 flex items-center justify-center font-bold text-foreground text-sm">
                    {formatHoursMins(absoluteTotal) || '00:00'}
                  </div>
                </div>
              </div>

              {/* Lower Actions */}
              <div className="flex justify-between items-start mt-4">
                <Button variant="outline" size="sm" className="text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 border border-blue-200">
                  <Plus className="h-3 w-3 mr-1 font-bold" /> Add New Row
                </Button>
                
                <div className="text-blue-600 cursor-pointer hover:underline text-xs flex items-center font-medium">
                  <Info className="h-4 w-4 mr-1 fill-blue-100 text-blue-600" /> Supported Time Formats
                </div>
              </div>
            </div>
          </div>
          
          {/* Footer Action Bar */}
          <div className="p-4 border-t border-border flex gap-3 bg-white shadow-[-0_-2px_4px_rgba(0,0,0,0.02)] pl-8">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white min-w-[80px]">Save</Button>
            <Button variant="outline" onClick={() => setShowWeeklyLog(false)} className="bg-secondary/50">Cancel</Button>
          </div>
        </div>
      )}

    </SidebarProvider>
  );
}
