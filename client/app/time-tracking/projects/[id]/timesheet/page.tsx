"use client";

import { useEffect, useState, use } from "react";
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
  Plus,
  Edit,
  Trash2,
  Clock,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  ChevronDown,
  Search,
  Eye,
  EyeOff
} from "lucide-react";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

// Types
interface TimesheetEntry {
  _id: string;
  projectId: string;
  projectName: string;
  customerName: string;
  task: string;
  userId: string;
  userName: string;
  date: string;
  startTime?: string;
  endTime?: string;
  duration: string;
  billingStatus: "Invoiced" | "Unbilled" | "Draft";
  status: "completed" | "in-progress" | "pending" | "submitted" | "approved" | "rejected";
  description?: string;
  hourlyRate?: string;
  totalAmount?: string;
  isBillable: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateTimesheetEntry {
  date: string;
  projectId: string;
  task: string;
  hours: string;
  minutes: string;
  isBillable: boolean;
  description?: string;
}

export default function ProjectTimesheetPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const projectId = unwrappedParams.id;

  // Force recompile
  const router = useRouter();
  const { firebaseUser, dbUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  
  // State
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [timesheetsLoading, setTimesheetsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [billableFilter, setBillableFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [dateRange, setDateRange] = useState({
    start: "",
    end: ""
  });

  // Form state
  const [formData, setFormData] = useState<CreateTimesheetEntry>({
    date: new Date().toISOString().split('T')[0],
    projectId: projectId,
    task: "",
    hours: "",
    minutes: "",
    isBillable: true,
    description: ""
  });

  // Fetch data from API
  useEffect(() => {
    if (!loading) {
      if (!firebaseUser) { router.push("/login"); return; }
    }
    
    if (!orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
      return;
    }

    if (firebaseUser && !needsOrgSetup && projectId) {
      fetchTimesheets();
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router, projectId]);

  const fetchTimesheets = async () => {
    try {
      setTimesheetsLoading(true);
      const { projectApi } = await import('@/lib/api');
      const response = await projectApi.getTimesheets(projectId);
      if (response.data) {
        setTimesheets(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch timesheets:', error);
    } finally {
      setTimesheetsLoading(false);
    }
  };

  // Filter timesheets
  const filteredTimesheets = timesheets.filter(timesheet => {
    const matchesSearch = timesheet.task.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         timesheet.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         timesheet.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || timesheet.status === statusFilter;
    const matchesBillable = billableFilter === "all" || 
                          (billableFilter === "billable" && timesheet.isBillable) ||
                          (billableFilter === "non-billable" && !timesheet.isBillable);
    
    return matchesSearch && matchesStatus && matchesBillable;
  });

  // Calculate summary
  const totalHours = timesheets.reduce((acc, ts) => {
    const [hours, minutes] = ts.duration.split(':').map(Number);
    return acc + hours + (minutes / 60);
  }, 0);

  const billableHours = timesheets
    .filter(ts => ts.isBillable)
    .reduce((acc, ts) => {
      const [hours, minutes] = ts.duration.split(':').map(Number);
      return acc + hours + (minutes / 60);
    }, 0);

  const nonBillableHours = totalHours - billableHours;

  // Handlers
  const handleCreateEntry = async () => {
    try {
      // Validate form
      if (!formData.task || !formData.hours || !formData.date) {
        alert("Please fill in all required fields");
        return;
      }

      const hours = parseInt(formData.hours);
      const minutes = parseInt(formData.minutes || "0");
      
      if (hours < 0 || minutes < 0 || minutes >= 60) {
        alert("Please enter valid time (0-59 minutes, positive hours)");
        return;
      }

      if (new Date(formData.date) > new Date()) {
        alert("Cannot log time for future dates");
        return;
      }

      if (hours > 24) {
        alert("Maximum 24 hours allowed per entry");
        return;
      }

      // Create new entry via API
      const { projectApi } = await import('@/lib/api');
      
      const newEntryData = {
        projectId: projectId,
        task: formData.task,
        date: formData.date,
        duration: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
        description: formData.description,
        isBillable: formData.isBillable
      };

      const response = await projectApi.createTimesheetEntry(projectId, newEntryData);

      if (response.data) {
        setTimesheets([...timesheets, response.data]);
        setShowCreateDialog(false);
        setFormData({
          date: new Date().toISOString().split('T')[0],
          projectId: projectId,
          task: "",
          hours: "",
          minutes: "",
          isBillable: true,
          description: ""
        });
        alert("Timesheet entry created successfully!");
      }
    } catch (error) {
      console.error("Failed to create entry:", error);
      alert("Failed to create timesheet entry");
    }
  };

  const handleEditEntry = (entry: TimesheetEntry) => {
    setEditingEntry(entry);
    setFormData({
      date: entry.date,
      projectId: projectId,
      task: entry.task,
      hours: entry.duration.split(':')[0],
      minutes: entry.duration.split(':')[1],
      isBillable: entry.isBillable,
      description: entry.description || ""
    });
    setShowEditDialog(true);
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) return;

    try {
      const hours = parseInt(formData.hours);
      const minutes = parseInt(formData.minutes || "0");
      
      const updateData = {
        task: formData.task,
        duration: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
        description: formData.description,
        isBillable: formData.isBillable
      };

      const { projectApi } = await import('@/lib/api');
      const response = await projectApi.updateTimesheetEntry(projectId, editingEntry._id, updateData);

      if (response.data) {
        setTimesheets(timesheets.map(ts => 
          ts._id === editingEntry._id ? response.data : ts
        ));
        
        setShowEditDialog(false);
        setEditingEntry(null);
        alert("Timesheet entry updated successfully!");
      }
    } catch (error) {
      console.error("Failed to update entry:", error);
      alert("Failed to update timesheet entry");
    }
  };

  const handleDeleteEntry = async (entry: TimesheetEntry) => {
    if (!confirm("Are you sure you want to delete this timesheet entry?")) {
      return;
    }

    try {
      const { projectApi } = await import('@/lib/api');
      await projectApi.deleteTimesheetEntry(projectId, entry._id);
      setTimesheets(timesheets.filter(ts => ts._id !== entry._id));
      alert("Timesheet entry deleted successfully!");
    } catch (error) {
      console.error("Failed to delete entry:", error);
      alert("Failed to delete timesheet entry");
    }
  };

  const handleSubmitForApproval = async (entry: TimesheetEntry) => {
    try {
      const updatedEntry: TimesheetEntry = {
        ...entry,
        status: "submitted",
        updatedAt: new Date().toISOString()
      };

      setTimesheets(timesheets.map(ts => 
        ts._id === entry._id ? updatedEntry : ts
      ));
      
      alert("Timesheet entry submitted for approval!");
    } catch (error) {
      console.error("Failed to submit entry:", error);
      alert("Failed to submit timesheet entry");
    }
  };

  const handleApproveEntry = async (entry: TimesheetEntry) => {
    try {
      const updatedEntry: TimesheetEntry = {
        ...entry,
        status: "approved",
        updatedAt: new Date().toISOString()
      };

      setTimesheets(timesheets.map(ts => 
        ts._id === entry._id ? updatedEntry : ts
      ));
      
      alert("Timesheet entry approved!");
    } catch (error) {
      console.error("Failed to approve entry:", error);
      alert("Failed to approve timesheet entry");
    }
  };

  const handleRejectEntry = async (entry: TimesheetEntry) => {
    const reason = prompt("Please provide reason for rejection:");
    if (!reason) return;

    try {
      const updatedEntry: TimesheetEntry = {
        ...entry,
        status: "rejected",
        description: `${entry.description}\n\nRejection reason: ${reason}`,
        updatedAt: new Date().toISOString()
      };

      setTimesheets(timesheets.map(ts => 
        ts._id === entry._id ? updatedEntry : ts
      ));
      
      alert("Timesheet entry rejected!");
    } catch (error) {
      console.error("Failed to reject entry:", error);
      alert("Failed to reject timesheet entry");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Date", "Task", "User", "Duration", "Billable", "Status", "Description"];
    const csvData = filteredTimesheets.map(entry => [
      entry.date,
      entry.task,
      entry.userName,
      entry.duration,
      entry.isBillable ? "Yes" : "No",
      entry.status,
      entry.description || ""
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${projectId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    alert("PDF export would be implemented here");
  };

  const handleGenerateInvoice = () => {
    const approvedEntries = filteredTimesheets.filter(ts => 
      ts.status === "approved" && ts.isBillable
    );
    
    if (approvedEntries.length === 0) {
      alert("No approved billable entries to invoice");
      return;
    }

    alert(`Generating invoice for ${approvedEntries.length} entries...`);
    // Would navigate to invoice creation page
  };

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (timesheetsLoading) {
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
              <span className="text-sm font-medium">Timesheet</span>
              <Badge variant="outline">Project {projectId}</Badge>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    {viewMode === "daily" ? "Daily" : "Weekly"}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setViewMode("daily")}>Daily View</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setViewMode("weekly")}>Weekly View</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Status Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Filter className="h-4 w-4" />
                    Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setStatusFilter("all")}>All Status</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("completed")}>Completed</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("submitted")}>Submitted</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("approved")}>Approved</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("rejected")}>Rejected</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Billable Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <DollarSign className="h-4 w-4" />
                    Billable
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setBillableFilter("all")}>All Entries</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBillableFilter("billable")}>Billable Only</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBillableFilter("non-billable")}>Non-Billable Only</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

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

              {/* Create Entry */}
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Log Time
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Log Time Manually</DialogTitle>
                    <DialogDescription>
                      Add a manual timesheet entry for this project
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="task">Task</Label>
                      <Input
                        id="task"
                        placeholder="What did you work on?"
                        value={formData.task}
                        onChange={(e) => setFormData({...formData, task: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hours">Hours</Label>
                        <Input
                          id="hours"
                          type="number"
                          placeholder="0"
                          min="0"
                          max="24"
                          value={formData.hours}
                          onChange={(e) => setFormData({...formData, hours: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="minutes">Minutes</Label>
                        <Input
                          id="minutes"
                          type="number"
                          placeholder="0"
                          min="0"
                          max="59"
                          value={formData.minutes}
                          onChange={(e) => setFormData({...formData, minutes: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Optional notes about this time entry..."
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="billable"
                        checked={formData.isBillable}
                        onCheckedChange={(checked) => setFormData({ ...formData, isBillable: checked === true })}
                      />
                      <Label htmlFor="billable">Billable</Label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateEntry}>
                      Create Entry
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Generate Invoice */}
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={handleGenerateInvoice}
              >
                <FileText className="h-4 w-4" />
                Generate Invoice
              </Button>
            </div>
          }
        />

        {/* Content */}
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
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
                <CardTitle className="text-sm font-medium">Non-Billable Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{nonBillableHours.toFixed(1)}h</div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search timesheets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Timesheets Table */}
          <Card>
            <CardHeader>
              <CardTitle>
                {viewMode === "daily" ? "Daily Timesheet" : "Weekly Timesheet"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Timing</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTimesheets.map((timesheet) => (
                    <TableRow key={timesheet._id}>
                      <TableCell className="font-medium">{timesheet.date}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{timesheet.task}</div>
                          {timesheet.description && (
                            <div className="text-sm text-muted-foreground">{timesheet.description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{timesheet.userName}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                        {timesheet.startTime ? new Date(timesheet.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'} 
                        {' - '}
                        {timesheet.endTime ? new Date(timesheet.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : (timesheet.status === 'in-progress' ? 'Now' : '-')}
                      </TableCell>
                      <TableCell className="font-medium">{timesheet.duration}</TableCell>
                      <TableCell>
                        <Badge variant={timesheet.isBillable ? "default" : "secondary"}>
                          {timesheet.isBillable ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            timesheet.status === "approved" ? "default" :
                            timesheet.status === "submitted" ? "secondary" :
                            timesheet.status === "rejected" ? "destructive" : "outline"
                          }
                          className="flex items-center gap-1"
                        >
                          {timesheet.status === "approved" && <CheckCircle className="h-3 w-3" />}
                          {timesheet.status === "submitted" && <AlertCircle className="h-3 w-3" />}
                          {timesheet.status === "rejected" && <XCircle className="h-3 w-3" />}
                          {timesheet.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {/* Edit */}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleEditEntry(timesheet)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          
                          {/* Submit for Approval */}
                          {timesheet.status === "completed" && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleSubmitForApproval(timesheet)}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          )}
                          
                          {/* Approve/Reject (Manager actions) */}
                          {timesheet.status === "submitted" && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleApproveEntry(timesheet)}
                                className="text-green-600"
                              >
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleRejectEntry(timesheet)}
                                className="text-red-600"
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          
                          {/* Delete */}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDeleteEntry(timesheet)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
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
