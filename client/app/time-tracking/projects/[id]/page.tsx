"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ChevronLeft, 
  MessageSquare,
  Briefcase,
  User as UserIcon,
  RefreshCw,
  UserPlus,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { projectApi, Project, TimesheetEntry } from "@/lib/api/projects";

const mockProjects: Project[] = [
  {
    _id: "1",
    name: "Handmade Rubber Fish",
    description: "Some description about Handmade Rubber Fish",
    customerName: "John Smith Customer",
    billingMethod: "Fixed Rate",
    rate: "₹50.41",
    status: "active",
    totalLoggedHours: "02:07",
    totalBilledHours: "01:00",
    totalUnbilledHours: "01:00",
    createdBy: "user1",
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2024-03-12T00:00:00Z",
    projectCode: "project_0001",
    budgetedRevenue: "403.50",
    expenseAmount: "399.40",
    hoursBudgetType: "Hours Per Staff",
    unusedRetainers: "₹5700.00",
    watchlistEnabled: true
  },
  {
    _id: "2",
    name: "Mobile App Design",
    customerName: "Jane Smith",
    billingMethod: "Hourly Rate",
    rate: "₹75/hr",
    status: "active",
    totalLoggedHours: "08:45",
    totalBilledHours: "06:00",
    totalUnbilledHours: "02:45",
    createdBy: "user1",
    createdAt: "2024-03-02T00:00:00Z",
    updatedAt: "2024-03-12T00:00:00Z"
  }
];

const mockUsers = [
  {
    id: 1,
    name: "Chad Heaney",
    email: "Alessia.Lebsack32@hotmail.com",
    loggedHours: "56:72",
    billedHours: "22:97",
    unbilledHours: "23:00",
    role: "Staff-Timesheet only"
  },
  {
    id: 2,
    name: "Robin Romaguera",
    email: "Kevin9@yahoo.com",
    loggedHours: "70:74",
    billedHours: "05:09",
    unbilledHours: "10:09",
    role: "Staff-Timesheet only"
  }
];

const mockTasks = [
  {
    id: 1,
    name: "hack wireless hard drive",
    description: "Assumenda quia enim quod porro deleniti adipisci dolores mollitia tenetur.",
    loggedHours: "05:46",
    billedHours: "63:23",
    unbilledHours: "99:18",
    type: "Billable"
  },
  {
    id: 2,
    name: "generate primary alarm",
    description: "Ipsa quam deserunt eum vitae.",
    loggedHours: "33:31",
    billedHours: "27:47",
    unbilledHours: "29:70",
    type: "Billable"
  }
];

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const projectId = unwrappedParams.id;

  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  const [activeTab, setActiveTab] = useState("overview");
  const [project, setProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);

  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [projectUsers, setProjectUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userToAdd, setUserToAdd] = useState<string>("");

  useEffect(() => {
    if (!loading && !firebaseUser) { router.push("/login"); }
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !needsOrgSetup && projectId) {
      fetchProjectData();
      fetchAllUsers();
    }
  }, [firebaseUser, needsOrgSetup, projectId]);

  const fetchProjectData = async () => {
    try {
      setProjectLoading(true);
      let projRes;
      try {
        projRes = await projectApi.getById(projectId);
      } catch (e) { 
        console.warn('API fetch failed, trying mock fallback', e); 
      }
      
      let foundProject = projRes?.data;
      if (!foundProject) {
         foundProject = mockProjects.find(p => p._id === projectId);
      }
      
      if (foundProject) {
         setProject(foundProject);
      }

      try {
        const tsRes = await projectApi.getTimesheets(projectId, { limit: 1000 });
        if (tsRes.data) setTimesheets(tsRes.data);
      } catch(e) {}

      try {
        const usersRes = await projectApi.getProjectUsers(projectId);
        if (usersRes?.data) setProjectUsers(usersRes.data);
      } catch(e) {}
    } catch (error) {
      console.error('Failed to fetch project data:', error);
    } finally {
      setProjectLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
       const res = await projectApi.getAllUsers();
       if (res.data) setAllUsers(res.data);
    } catch(e) {}
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this project?")) {
      try {
        await projectApi.remove(projectId);
        router.push("/time-tracking/projects");
      } catch(e) { console.error(e); }
    }
  };

  const handleClone = async () => {
     if (!project) return;
     try {
        const clonedProject = {
          ...project,
          name: `${project.name} (Clone)`,
          projectCode: undefined,
          _id: undefined
        };
        const res = await projectApi.create(clonedProject as any);
        if (res.data) {
           router.push(`/time-tracking/projects/${res.data._id}`);
        }
     } catch(e) { console.error(e); }
  };

  const handleToggleStatus = async () => {
     if (!project) return;
     const newStatus = project.status === "active" ? "completed" : "active";
     try {
       const res = await projectApi.update(projectId, { status: newStatus as any });
       if (res.data) setProject(res.data);
     } catch(e) { console.error(e); }
  };

  const handleToggleWatchlist = async () => {
     if (!project) return;
     try {
       const res = await projectApi.update(projectId, { watchlistEnabled: !project.watchlistEnabled });
       if (res.data) setProject(res.data);
     } catch(e) { console.error(e); }
  };

  const handleAddUser = async () => {
     if (!userToAdd) return;
     try {
       await projectApi.addProjectUser(projectId, userToAdd);
       setShowAddUserModal(false);
       fetchProjectData();
     } catch(e) { console.error(e); }
  };

  const calculateDurationHours = (durationStr: string) => {
    if (!durationStr) return 0;
    const [h, m] = durationStr.split(':').map(Number);
    return Math.max(0, h + (m / 60) || 0);
  };

  const formatHours = (hours: number) => {
    if (isNaN(hours)) hours = 0;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const userStats = new Map();
  const taskStats = new Map();

  timesheets.forEach(ts => {
     const durationH = calculateDurationHours(ts.duration || "00:00");
     
     // user stats
     let u = userStats.get(ts.userId);
     if (!u) {
        u = { id: ts.userId, name: ts.userName, email: "", logged: 0, billed: 0, unbilled: 0, role: "Member" };
        userStats.set(ts.userId, u);
     }
     u.logged += durationH;
     if (ts.billingStatus === "Invoiced") u.billed += durationH;
     else if (ts.billingStatus === "Unbilled") u.unbilled += durationH;

     // task stats
     let t = taskStats.get(ts.task);
     if (!t) {
        t = { id: ts.task, name: ts.task, description: ts.description, logged: 0, billed: 0, unbilled: 0, type: ts.isBillable ? "Billable" : "Non-Billable" };
        taskStats.set(ts.task, t);
     }
     t.logged += durationH;
     if (ts.billingStatus === "Invoiced") t.billed += durationH;
     else if (ts.billingStatus === "Unbilled") t.unbilled += durationH;
  });

  projectUsers.forEach(pu => {
    if (!userStats.has(pu._id)) {
      userStats.set(pu._id, { id: pu._id, name: pu.name, email: pu.email, logged: 0, billed: 0, unbilled: 0, role: project?.owner === pu._id ? "Owner" : "Member" });
    } else {
      userStats.get(pu._id).email = pu.email;
      userStats.get(pu._id).role = project?.owner === pu._id ? "Owner" : "Member";
    }
  });

  const usersArray = Array.from(userStats.values());
  const tasksArray = Array.from(taskStats.values());

  const progressPercent = project && project.budgetedRevenue && project.expenseAmount ? 
      Math.min(100, Math.max(0, Math.round((parseFloat(project.expenseAmount) / parseFloat(project.budgetedRevenue)) * 100))) : 55;

  if (loading || orgLoading || projectLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-medium">Project Not Found</h2>
        <Button onClick={() => router.push('/time-tracking/projects')}>Return to Projects</Button>
      </div>
    );
  }

  const isMockData = mockProjects.some(p => p._id === project._id);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header matching the general application layout */}
        <PageHeader 
          breadcrumb={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/time-tracking/projects')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-lg font-semibold tracking-tight">{project.name}</h1>
              <Badge variant={project.status === "active" ? "default" : "secondary"}>
                {project.status}
              </Badge>
            </div>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddUserModal(true)}>
                <UserPlus className="h-4 w-4 mr-2" /> Add User
              </Button>
              <Button variant="outline" size="sm" onClick={handleClone}>
                <Copy className="h-4 w-4 mr-2" /> Clone
              </Button>
              <Button variant="outline" size="sm" onClick={handleToggleStatus}>
                 {project.status === "active" ? <XCircle className="h-4 w-4 mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                 {project.status === "active" ? "Mark Inactive" : "Mark Active"}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </div>
          }
        />

        <div className="flex flex-1 flex-col gap-6 p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex justify-between items-center mb-6 border-b border-border pb-2">
              <TabsList className="bg-transparent border-none p-0 h-auto gap-4">
                {['Overview', 'Timesheet', 'Purchases', 'Sales', 'Account Level Budget', 'Journals'].map((item) => {
                  const val = item.toLowerCase().replace(/ /g, '-');
                  return (
                    <TabsTrigger
                      key={val}
                      value={val}
                      className="text-sm font-medium text-muted-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none shadow-none bg-transparent hover:text-foreground hover:bg-transparent"
                    >
                      {item}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <TabsContent value="overview" className="m-0 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Left Side Details Card */}
                <Card className="md:col-span-1 shadow-sm">
                  <CardContent className="pt-6">
                    <div className="mb-6">
                      <div className="flex items-start gap-4 mb-4">
                        <Briefcase className="h-[22px] w-[22px] text-muted-foreground mt-1 flex-shrink-0" />
                        <div>
                          <h2 className="text-lg font-semibold mb-1 tracking-tight">{project.name}</h2>
                          <p className="text-sm text-muted-foreground leading-relaxed">{project.description || `Some description about ${project.name}`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-6">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-primary text-sm font-medium hover:underline cursor-pointer">{project.customerName}</span>
                      </div>
                    </div>

                    <hr className="my-6 border-border" />

                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project Code</span>
                        <span className="text-sm">{project.projectCode || "project_0001"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Billing Method</span>
                        <span className="text-sm">{project.billingMethod || "Daily Rate Per Project"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Rate Per Hour</span>
                        <span className="text-sm font-medium">{project.rate || "₹0"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Dashboard Watchlist</span>
                        <div className="text-sm flex items-center gap-2">
                          {project.watchlistEnabled ? "Enabled" : "Disabled"} 
                          <span className="text-muted-foreground">-</span> 
                          <span className="text-primary cursor-pointer hover:underline text-xs font-semibold" onClick={handleToggleWatchlist}>
                            {project.watchlistEnabled ? "Disable" : "Enable"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Expense Amount</span>
                        <span className="text-sm text-primary cursor-pointer hover:underline font-medium">{project.expenseAmount || "₹0"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Budgeted Revenue</span>
                        <span className="text-sm font-medium">{project.budgetedRevenue || "₹0"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Hours Budget Type</span>
                        <span className="text-sm">{project.hoursBudgetType || "Hours Per Staff"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Unused Retainers</span>
                        <span className="text-sm font-medium">{project.unusedRetainers || "₹0"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Right Side Stats & Charts Card */}
                <Card className="md:col-span-2 shadow-sm">
                  <CardHeader className="border-b border-border bg-muted/20">
                    <div className="flex justify-between items-center w-full">
                      <CardTitle className="text-base font-medium">Project Hours & Profitability</CardTitle>
                      <div className="text-sm text-primary cursor-pointer hover:underline">
                        This Week ▼
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-8">
                    {/* Mock Chart Area */}
                    <div className="h-[240px] flex flex-col justify-end relative border-b border-border mb-8 pb-8 px-8">
                      <div className="absolute left-0 top-0 h-full w-8 flex flex-col justify-between text-xs text-muted-foreground pb-8">
                        <span className="text-right w-full">1</span>
                        <span className="text-right w-full">0.8</span>
                        <span className="text-right w-full">0.6</span>
                        <span className="text-right w-full">0.4</span>
                        <span className="text-right w-full">0.2</span>
                        <span className="text-right w-full">0</span>
                      </div>
                      <div className="flex h-full items-end justify-center w-full max-w-[400px] mx-auto gap-8 sm:gap-16 relative">
                        <div className="w-8 sm:w-12 bg-primary relative rounded-t-sm" style={{ height: "80%" }}>
                          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground text-center">02<br/>Apr</span>
                        </div>
                        <div className="flex w-16 sm:w-24 items-end">
                          <div className="w-8 sm:w-12 bg-primary relative rounded-t-sm" style={{ height: "80%" }}></div>
                          <div className="w-8 sm:w-12 bg-secondary relative border-x border-t border-border rounded-t-sm" style={{ height: "80%" }}>
                            <span className="absolute -bottom-8 -left-3 sm:-left-5 text-xs text-muted-foreground text-center">03<br/>Apr</span>
                          </div>
                        </div>
                        <div className="w-8 sm:w-12 h-0 relative">
                           <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground text-center">04<br/>Apr</span>
                        </div>
                      </div>
                      <div className="-rotate-90 absolute -left-8 top-1/2 -translate-y-1/2 text-xs text-muted-foreground w-12 text-center tracking-wide uppercase">Hours</div>
                      
                      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-1 bg-primary rounded-full"></div>
                          <span className="text-xs font-medium text-muted-foreground">Billable Hours</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-1 bg-secondary border border-border rounded-full"></div>
                          <span className="text-xs font-medium text-muted-foreground">Unbilled Hours</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 mb-10">
                       <div className="text-center border-r-0 md:border-r border-border pb-4 md:pb-0">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Logged Hours</div>
                        <div className="text-xl font-semibold mb-1">{project.totalLoggedHours || "00:00"}</div>
                        <div className="text-lg font-bold text-foreground">₹{isMockData ? '868.28' : ((tasksArray.reduce((acc, t) => acc + t.logged, 0)) * (parseFloat(project.rate || "0"))).toFixed(2)}</div>
                      </div>
                       <div className="text-center border-r-0 md:border-r border-border pb-4 md:pb-0">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Billable Hours</div>
                        <div className="text-xl font-semibold text-primary mb-1">{isMockData ? '02:00' : formatHours(tasksArray.reduce((acc, t) => acc + t.billed + t.unbilled, 0))}</div>
                        <div className="text-lg font-bold text-foreground">₹{isMockData ? '519.46' : ((tasksArray.reduce((acc, t) => acc + t.billed + t.unbilled, 0)) * (parseFloat(project.rate || "0"))).toFixed(2)}</div>
                      </div>
                       <div className="text-center border-r-0 md:border-r border-border">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Billed Hours</div>
                        <div className="text-xl font-semibold text-primary mb-1">{project.totalBilledHours || "00:00"}</div>
                        <div className="text-lg font-bold text-foreground">₹{isMockData ? '0.00' : ((tasksArray.reduce((acc, t) => acc + t.billed, 0)) * (parseFloat(project.rate || "0"))).toFixed(2)}</div>
                      </div>
                       <div className="text-center">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Unbilled Hours</div>
                        <div className="text-xl font-semibold text-primary mb-1">{project.totalUnbilledHours || "00:00"}</div>
                        <div className="text-lg font-bold text-foreground">₹{isMockData ? '310.66' : ((tasksArray.reduce((acc, t) => acc + t.unbilled, 0)) * (parseFloat(project.rate || "0"))).toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="px-2">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase mb-3">Logged Amount vs Budgeted Amount</h3>
                      <div className="flex w-full h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${progressPercent}%` }}></div>
                        <div className="bg-orange-500 h-full" style={{ width: `${100 - progressPercent}%` }}></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Users and Tasks combined in a double stacked layout */}
              <div className="grid gap-6">
                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between py-4 bg-muted/20 border-b border-border">
                    <CardTitle className="text-base font-medium">Users</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setShowAddUserModal(true)}>
                      <UserPlus className="h-4 w-4 mr-2" /> Add User
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-medium text-xs uppercase tracking-wider h-11">Name</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider text-center h-11">Logged Hours</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider text-center h-11">Billed Hours</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider text-center h-11">Unbilled Hours</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider h-11">Role</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isMockData ? mockUsers.map(user => (
                          <TableRow key={user.id}>
                            <TableCell className="py-3">
                              <div className="text-sm font-medium">{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            </TableCell>
                            <TableCell className="text-center py-3">
                              <div className="flex items-center justify-center gap-1.5 text-sm">
                                {user.id === 1 && <RefreshCw className="h-3 w-3 text-emerald-500 absolute -ml-5" />}
                                {user.loggedHours}
                              </div>
                            </TableCell>
                            <TableCell className="text-center py-3">
                              <div className="text-sm text-muted-foreground">{user.billedHours}</div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center justify-center gap-3">
                                <span className="text-sm text-muted-foreground">{user.unbilledHours}</span>
                                {user.id < 3 && <div className="w-12 h-2 bg-emerald-500 rounded-sm"></div>}
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="text-sm">{user.role}</div>
                            </TableCell>
                          </TableRow>
                        )) : usersArray.map((user, idx) => (
                          <TableRow key={user.id}>
                            <TableCell className="py-3">
                              <div className="text-sm font-medium">{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            </TableCell>
                            <TableCell className="text-center py-3">
                              <div className="flex items-center justify-center gap-1.5 text-sm">
                                {idx === 0 && <RefreshCw className="h-3 w-3 text-emerald-500 absolute -ml-5" />}
                                {formatHours(user.logged)}
                              </div>
                            </TableCell>
                            <TableCell className="text-center py-3">
                              <div className="text-sm text-muted-foreground">{formatHours(user.billed)}</div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center justify-center gap-3">
                                <span className="text-sm text-muted-foreground">{formatHours(user.unbilled)}</span>
                                <div className="w-12 h-2 bg-emerald-500 rounded-sm"></div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="text-sm">{user.role}</div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {!isMockData && usersArray.length === 0 && (
                           <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No users assigned.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between py-4 bg-muted/20 border-b border-border">
                    <CardTitle className="text-base font-medium">Project Tasks</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-medium text-xs uppercase tracking-wider h-11">Name</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider text-center h-11">Logged Hours</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider text-center h-11">Billed Hours</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider text-center h-11">Unbilled Hours</TableHead>
                          <TableHead className="font-medium text-xs uppercase tracking-wider h-11">Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isMockData ? mockTasks.map((task, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="py-3">
                              <div className="text-sm font-medium">{task.name}</div>
                              <div className="text-xs text-muted-foreground md:max-w-md truncate">{task.description}</div>
                            </TableCell>
                            <TableCell className="text-center py-3 text-sm">{task.loggedHours}</TableCell>
                            <TableCell className="text-center py-3 text-sm text-muted-foreground">{task.billedHours}</TableCell>
                            <TableCell className="text-center py-3 text-sm text-muted-foreground">{task.unbilledHours}</TableCell>
                            <TableCell className="py-3 text-sm">{task.type}</TableCell>
                          </TableRow>
                        )) : tasksArray.map((task, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="py-3">
                              <div className="text-sm font-medium">{task.name}</div>
                              <div className="text-xs text-muted-foreground md:max-w-md truncate">{task.description}</div>
                            </TableCell>
                            <TableCell className="text-center py-3 text-sm">{formatHours(task.logged)}</TableCell>
                            <TableCell className="text-center py-3 text-sm text-muted-foreground">{formatHours(task.billed)}</TableCell>
                            <TableCell className="text-center py-3 text-sm text-muted-foreground">{formatHours(task.unbilled)}</TableCell>
                            <TableCell className="py-3 text-sm">{task.type}</TableCell>
                          </TableRow>
                        ))}
                        {!isMockData && tasksArray.length === 0 && (
                           <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No tasks logged yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="timesheet">
               <Card><CardContent className="py-12 text-muted-foreground text-center text-sm">Timesheet Tab Placeholder Content</CardContent></Card>
            </TabsContent>
            <TabsContent value="purchases">
               <Card><CardContent className="py-12 text-muted-foreground text-center text-sm">Purchases Tab Placeholder Content</CardContent></Card>
            </TabsContent>
            <TabsContent value="sales">
               <Card><CardContent className="py-12 text-muted-foreground text-center text-sm">Sales Tab Placeholder Content</CardContent></Card>
            </TabsContent>
            <TabsContent value="account-level-budget">
               <Card><CardContent className="py-12 text-muted-foreground text-center text-sm">Account Level Budget Tab Placeholder Content</CardContent></Card>
            </TabsContent>
            <TabsContent value="journals">
               <Card><CardContent className="py-12 text-muted-foreground text-center text-sm">Journals Tab Placeholder Content</CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Add User Dialog */}
        <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
          <DialogContent className="sm:max-w-md">
             <DialogHeader>
                <DialogTitle>Add User to Project</DialogTitle>
                <DialogDescription>Select a user to grant them access to this project.</DialogDescription>
             </DialogHeader>
             <div className="space-y-4 py-4">
                <Select value={userToAdd} onValueChange={setUserToAdd}>
                   <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                   </SelectTrigger>
                   <SelectContent>
                      {allUsers.filter(u => !projectUsers.some(pu => pu._id === u._id)).map(u => (
                         <SelectItem key={u._id} value={u._id}>{u.name} ({u.email})</SelectItem>
                      ))}
                      {allUsers.filter(u => !projectUsers.some(pu => pu._id === u._id)).length === 0 && (
                         <SelectItem value="none" disabled>All available users added.</SelectItem>
                      )}
                   </SelectContent>
                </Select>
             </div>
             <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowAddUserModal(false)}>Cancel</Button>
                <Button onClick={handleAddUser} disabled={!userToAdd || userToAdd === "none"}>Add User</Button>
             </div>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
