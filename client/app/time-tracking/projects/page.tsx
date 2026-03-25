"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { useTimeTracking } from "@/contexts/time-tracking-context";
import { projectApi, type Project } from "@/lib/api";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ChevronDown, 
  Search, 
  Plus, 
  Play, 
  Pause,
  Clock, 
  LayoutGrid, 
  LayoutList,
  Filter,
  Timer,
  Activity,
  Users,
  Copy,
  Check,
  X,
  MessageSquare,
  MoreHorizontal,
  Circle,
  FileText
} from "lucide-react";

// Real API data bound

export default function ProjectsPage() {
  const router = useRouter();
  const { firebaseUser, dbUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  const { startTimer, stopTimer, isProjectTracking, getProjectElapsedTime } = useTimeTracking();
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [pendingDescription, setPendingDescription] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

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

  // Fetch projects from API
  useEffect(() => {
    if (firebaseUser && !needsOrgSetup) {
      fetchProjects();
    }
  }, [firebaseUser, needsOrgSetup]);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const response = await projectApi.list();
      // Use API data
      if (response.data) {
        setProjects(response.data);
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTimer = async (projectId: string, description?: string) => {
    try {
      const project = projects.find(p => p._id === projectId);
      if (!project) {
        console.error('Project not found:', projectId);
        return;
      }

      // Start the timer with project context
      await startTimer(projectId, description || `Working on ${project.name}`);
      console.log('Timer started for project:', project.name);
      await fetchProjects();
    } catch (error) {
      console.error('Failed to start timer:', error);
      alert('Failed to start timer. Please try again.');
    }
  };

  const handleStopTimer = async (projectId: string) => {
    try {
      await stopTimer(projectId);
      await fetchProjects();
    } catch (error) {
      console.error('Failed to stop timer:', error);
    }
  };

  const handleFilterProjects = (status: string) => {
    setFilterStatus(status);
    // Filter projects based on status
    if (status === "all") {
      // Show all projects (no filtering)
      fetchProjects();
    } else {
      // Filter by status - this would require API support
      // For now, just show all projects
      fetchProjects();
    }
    setShowFilterDialog(false);
  };

  const handleProjectSelect = async (projectId: string) => {
    setShowProjectDialog(false);
    await handleStartTimer(projectId, pendingDescription);
    setPendingDescription("");
  };

  const handleUsers = (project: Project) => {
    // Process users action without navigation
    console.log('Managing users for project:', project.name);
    // TODO: Open users management modal/sidebar
  };

  const handleCloneProject = async (project: Project) => {
    try {
      const clonedProject = {
        ...project,
        name: `${project.name} (Clone)`,
        _id: undefined // Will be set by backend
      };
      const response = await projectApi.create(clonedProject);
      if (response.data) {
        await fetchProjects(); // Refresh projects list
        // Show success message
        alert(`Project "${project.name}" cloned successfully!`);
      }
    } catch (error) {
      console.error('Failed to clone project:', error);
      alert('Failed to clone project. Please try again.');
    }
  };

  const handleToggleActiveStatus = async (project: Project) => {
    try {
      setUpdatingStatus(project._id); // Show updating state
      const newStatus = project.status === "active" ? "inactive" : "active";
      console.log('Updating project status:', project._id, 'from', project.status, 'to', newStatus);
      
      const updatedProject = {
        ...project,
        status: newStatus as "active" | "inactive" | "completed" | "archived"
      };
      
      const response = await projectApi.update(project._id, updatedProject);
      console.log('Update response:', response);
      
      await fetchProjects(); // Refresh projects list
      // Show success message
      alert(`Project "${project.name}" marked as ${newStatus}!`);
    } catch (error: any) {
      console.error('Failed to update project status:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      alert(`Failed to update project status: ${error.message || 'Unknown error'}`);
    } finally {
      setUpdatingStatus(null); // Clear updating state
    }
  };

  const handleAddComment = (project: Project) => {
    // Process comments action without navigation
    console.log('Adding comments for project:', project.name);
    // TODO: Open comments modal/sidebar
  };

  const handleDeleteProject = async (project: Project) => {
    if (confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      try {
        await projectApi.remove(project._id);
        await fetchProjects(); // Refresh projects list
        // Show success message
        alert(`Project "${project.name}" deleted successfully!`);
      } catch (error) {
        console.error('Failed to delete project:', error);
        alert('Failed to delete project. Please try again.');
      }
    }
  };

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filteredProjects = projects.filter(project =>
    project.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    if (isProjectTracking(a._id)) return -1;
    if (isProjectTracking(b._id)) return 1;
    const dateA = new Date(a.updatedAt).getTime();
    const dateB = new Date(b.updatedAt).getTime();
    return dateB - dateA;
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <PageHeader 
          breadcrumb={
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Projects</span>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          }
        />

        {/* Content */}
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Filter Dialog */}
        <Dialog open={showFilterDialog} onOpenChange={setShowFilterDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Filter Projects</DialogTitle>
              <DialogDescription>
                Filter projects by status
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project Status</Label>
                <Select
                  value={filterStatus}
                  onValueChange={(value: string) => setFilterStatus(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    <SelectItem value="active">Active Projects</SelectItem>
                    <SelectItem value="completed">Completed Projects</SelectItem>
                    <SelectItem value="archived">Archived Projects</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowFilterDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => handleFilterProjects(filterStatus)}
              >
                Apply Filter
              </Button>
            </div>
          </DialogContent>
        </Dialog>

              {/* View Mode Buttons */}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </div>

              {/* Filter Button */}
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => setShowFilterDialog(true)}
              >
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </div>

            <div className="flex items-center gap-2">


              {/* Start Button */}
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => {
                  if (projects.length > 0) {
                    setPendingProjectId(projects[0]._id);
                    setPendingDescription("");
                    setShowProjectDialog(true);
                  }
                }}
              >
                <Play className="h-4 w-4" />
                Start
              </Button>

              {/* Log Time Button */}
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => router.push("/time-tracking/timesheet")}
              >
                <Clock className="h-4 w-4" />
                Log Time
              </Button>

              {/* New Project Button */}
              <Button 
                className="gap-2"
                onClick={() => router.push("/time-tracking/projects/new")}
              >
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </div>
          </div>

          {/* Projects Display */}
          {viewMode === "list" ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CUSTOMER NAME</TableHead>
                      <TableHead>PROJECT NAME</TableHead>
                      <TableHead>BILLING METHOD</TableHead>
                      <TableHead>RATE</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead>ACTIVE</TableHead>
                      <TableHead>LOGGED HOURS</TableHead>
                      <TableHead>ACTION</TableHead>
                      <TableHead>MORE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProjects.length === 0 ? (
                      <TableRow>
                         <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                           No projects found. Create one to start tracking time!
                         </TableCell>
                      </TableRow>
                    ) : filteredProjects.map((project) => (
                      <TableRow 
                        key={project._id}
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${isProjectTracking(project._id) ? "bg-green-50" : ""}`}
                        onClick={() => router.push(`/time-tracking/projects/${project._id}`)}
                      >
                        <TableCell className="font-medium">{project.customerName}</TableCell>
                        <TableCell>{project.name}</TableCell>
                        <TableCell>{project.billingMethod}</TableCell>
                        <TableCell>{project.rate}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={project.status === "active" ? "default" : "secondary"}
                            className={isProjectTracking(project._id) ? "bg-green-100 text-green-800" : ""}
                          >
                            {project.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {updatingStatus === project._id ? (
                              <div className="h-3 w-3 rounded-full border-2 border-blue-500 bg-blue-100 animate-spin" />
                            ) : (
                              <Circle 
                                className={`h-3 w-3 ${
                                  project.status === "active" 
                                    ? "text-green-500" 
                                    : "text-red-500"
                                }`}
                                fill={project.status === "active" ? "currentColor" : "none"}
                              />
                            )}
                            <span className="text-sm">
                              {project.status === "active" ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {isProjectTracking(project._id) ? (
                            <span className="text-green-600 font-bold">{getProjectElapsedTime(project._id)}</span>
                          ) : (
                            project.totalLoggedHours || "00:00"
                          )}
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="w-24 gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isProjectTracking(project._id)) {
                                handleStopTimer(project._id);
                              } else {
                                setPendingProjectId(project._id);
                                setPendingDescription("");
                                setShowProjectDialog(true);
                              }
                            }}
                          >
                            {isProjectTracking(project._id) ? (
                              <>
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                Stop
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3" />
                                Start
                              </>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/time-tracking/projects/${project._id}`)}>
                                <FileText className="h-4 w-4 mr-2" />
                                View Project
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/time-tracking/projects/${project._id}/timesheet`)}>
                                <FileText className="h-4 w-4 mr-2" />
                                View Timesheet
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/time-tracking/reports`)}>
                                <FileText className="h-4 w-4 mr-2" />
                                Reports
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isProjectTracking(project._id)) {
                                    handleStopTimer(project._id);
                                  } else {
                                    setPendingProjectId(project._id);
                                    setPendingDescription("");
                                    setShowProjectDialog(true);
                                  }
                                }}
                              >
                                {isProjectTracking(project._id) ? (
                                  <><Pause className="h-4 w-4 mr-2" /> Stop Timer</>
                                ) : (
                                  <><Play className="h-4 w-4 mr-2" /> Start Timer</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCloneProject(project)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Clone
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleToggleActiveStatus(project)}
                                className={project.status === "inactive" ? "text-green-600" : "text-orange-600"}
                              >
                                <Check className="h-4 w-4 mr-2" />
                                {project.status === "inactive" ? "Mark Active" : "Mark Inactive"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAddComment(project)}>
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Comments
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteProject(project)}
                                className="text-red-600"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
            </CardContent>
          </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => (
                <Card 
                  key={project._id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/time-tracking/projects/${project._id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="font-semibold text-lg">{project.name}</h3>
                        <p className="text-sm text-muted-foreground">{project.customerName}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{project.billingMethod}</span>
                        <span className="text-sm font-bold text-primary">{project.rate}</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isProjectTracking(project._id)) {
                              handleStopTimer(project._id);
                            } else {
                              setPendingProjectId(project._id);
                              setPendingDescription("");
                              setShowProjectDialog(true);
                            }
                          }}
                        >
                          {isProjectTracking(project._id) ? (
                            <>
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                              Stop
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" />
                              Start
                            </>
                          )}
                        </Button>
                        
                        {/* Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/time-tracking/projects/${project._id}/timesheet`)}>
                              <FileText className="h-4 w-4 mr-2" />
                              View Timesheet
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/time-tracking/reports`)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Reports
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCloneProject(project)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Clone
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleToggleActiveStatus(project)}
                              className={project.status === "inactive" ? "text-green-600" : "text-orange-600"}
                            >
                              <Check className="h-4 w-4 mr-2" />
                              {project.status === "inactive" ? "Mark Active" : "Mark Inactive"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAddComment(project)}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Comments
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteProject(project)}
                              className="text-red-600"
                            >
                              <X className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Project Selection Dialog */}
        <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Project to Start Timer</DialogTitle>
              <DialogDescription>
                Choose which project you want to start tracking time for.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-select">Select Project</Label>
                <Select
                  value={pendingProjectId || ""}
                  onValueChange={(value: string) => setPendingProjectId(value)}
                >
                  <SelectTrigger id="project-select">
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project._id} value={project._id}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{project.name}</span>
                          <span className="text-sm text-muted-foreground">{project.customerName}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-description">Task Description</Label>
                <Input
                  id="task-description"
                  placeholder="What are you working on?"
                  value={pendingDescription}
                  onChange={(e) => setPendingDescription(e.target.value)}
                />
              </div>
              
              <div className="flex justify-end gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowProjectDialog(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => handleProjectSelect(pendingProjectId!)}
                  disabled={!pendingProjectId}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  Start Timer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
