"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { useTimeTracking } from "@/contexts/time-tracking-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play,
  Pause,
  Square,
  Clock,
  Calendar,
  User,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Edit,
  Trash2
} from "lucide-react";

// Types
interface Task {
  _id: string;
  projectId: string;
  title: string;
  description: string;
  assignedTo: string;
  status: "todo" | "in-progress" | "completed";
  estimatedHours: number;
  actualHours: number;
  hourlyRate: string;
  isBillable: boolean;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  timer?: {
    startTime?: string;
    elapsedSeconds?: number;
    isRunning?: boolean;
  };
}

export default function TaskDetailPage({ params }: { params: { id: string; taskId: string } }) {
  const router = useRouter();
  const { firebaseUser, dbUser, loading: authLoading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();
  const { startTimer, stopTimer } = useTimeTracking();
  
  // State
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    estimatedHours: "",
    isBillable: true
  });

  // Mock task data - replace with API call
  useEffect(() => {
    if (!authLoading) {
      if (!firebaseUser) { router.push("/login"); return; }
      
      if (!orgLoading && firebaseUser && needsOrgSetup) {
        router.push("/org-setup");
        return;
      }

      // Mock task data
      const mockTask: Task = {
        _id: params.taskId,
        projectId: params.id,
        title: "Frontend Development - User Dashboard",
        description: "Create responsive user dashboard with charts and analytics. Implement user profile management, settings page, and data visualization components.",
        assignedTo: "John Smith",
        status: "in-progress",
        estimatedHours: 16,
        actualHours: 8.5,
        hourlyRate: "₹75",
        isBillable: true,
        dueDate: "2024-03-20",
        createdAt: "2024-03-10T09:00:00Z",
        updatedAt: "2024-03-15T14:30:00Z",
        timer: {
          startTime: "2024-03-15T09:30:00Z",
          elapsedSeconds: 30600, // 8.5 hours
          isRunning: false
        }
      };
      
      setTask(mockTask);
      setLoading(false);
    }
  }, [authLoading, orgLoading, firebaseUser, needsOrgSetup, router, params]);

  // Timer functions
  const handleStartTimer = async () => {
    if (!task) return;
    
    try {
      await startTimer(params.id, `Working on ${task.title}`);
      // Update local timer state
      setTask({
        ...task,
        timer: {
          ...task.timer,
          startTime: new Date().toISOString(),
          elapsedSeconds: 0,
          isRunning: true
        }
      });
    } catch (error) {
      console.error("Failed to start timer:", error);
      alert("Failed to start timer");
    }
  };

  const handlePauseTimer = async () => {
    if (!task?.timer?.isRunning) return;
    
    try {
      await stopTimer(params.id);
      // Update local timer state
      setTask({
        ...task,
        timer: {
          ...task.timer,
          isRunning: false
        }
      });
    } catch (error) {
      console.error("Failed to pause timer:", error);
      alert("Failed to pause timer");
    }
  };

  const handleStopTimer = async () => {
    if (!task?.timer?.isRunning) return;
    
    try {
      await stopTimer(params.id);
      // Update local timer state and actual hours
      const finalElapsedSeconds = (task.timer?.elapsedSeconds || 0) + 
                               (task.timer?.startTime ? Math.floor((new Date().getTime() - new Date(task.timer.startTime).getTime()) / 1000) : 0);
      const finalHours = finalElapsedSeconds / 3600;
      
      setTask({
        ...task,
        actualHours: task.actualHours + finalHours,
        timer: {
          ...task.timer,
          isRunning: false,
          elapsedSeconds: finalElapsedSeconds
        }
      });
    } catch (error) {
      console.error("Failed to stop timer:", error);
      alert("Failed to stop timer");
    }
  };

  const handleSaveEdit = () => {
    if (!task) return;
    
    try {
      const updatedTask: Task = {
        ...task,
        title: editForm.title,
        description: editForm.description,
        estimatedHours: parseFloat(editForm.estimatedHours),
        isBillable: editForm.isBillable,
        updatedAt: new Date().toISOString()
      };
      
      setTask(updatedTask);
      setIsEditing(false);
      alert("Task updated successfully!");
    } catch (error) {
      console.error("Failed to update task:", error);
      alert("Failed to update task");
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    if (!task) return 0;
    return Math.min((task.actualHours / task.estimatedHours) * 100, 100);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-600 bg-green-50";
      case "in-progress": return "text-blue-600 bg-blue-50";
      case "todo": return "text-gray-600 bg-gray-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  if (authLoading || loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Task Not Found</h2>
          <p className="text-muted-foreground">The task you're looking for doesn't exist.</p>
        </div>
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
              <span className="text-sm font-medium">Task</span>
              <Badge variant="outline">{params.id}</Badge>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit}>
                    Save
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4" />
                  Edit Task
                </Button>
              )}
            </div>
          }
        />

        {/* Content */}
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Task Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-4">
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                        className="text-2xl font-semibold border-b-2 border-primary focus:outline-none pb-1 w-full"
                      />
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                        className="w-full border-b-2 border-muted focus:outline-none focus:border-primary pb-1 min-h-[100px]"
                        placeholder="Task description..."
                      />
                      <div className="flex items-center gap-4">
                        <div>
                          <label className="text-sm font-medium">Est. Hours</label>
                          <input
                            type="number"
                            value={editForm.estimatedHours}
                            onChange={(e) => setEditForm({...editForm, estimatedHours: e.target.value})}
                            className="border-b-2 border-muted focus:outline-none focus:border-primary w-20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editForm.isBillable}
                            onChange={(e) => setEditForm({...editForm, isBillable: e.target.checked})}
                          />
                          <label className="text-sm font-medium">Billable</label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-2xl font-semibold mb-2">{task.title}</h1>
                      <p className="text-muted-foreground mb-4 leading-relaxed">{task.description}</p>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>Assigned to: <strong>{task.assignedTo}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Due: <strong>{task.dueDate}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>Rate: <strong>{task.hourlyRate}</strong></span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Timer Controls */}
                <div className="flex flex-col items-center gap-4">
                  <div className={`text-4xl font-mono font-bold ${
                    task.timer?.isRunning ? "text-blue-600" : "text-gray-600"
                  }`}>
                    {task.timer?.isRunning 
                      ? formatTime((task.timer?.elapsedSeconds || 0) + 
                                 (task.timer?.startTime ? Math.floor((new Date().getTime() - new Date(task.timer.startTime).getTime()) / 1000) : 0))
                      : formatTime(task.timer?.elapsedSeconds || 0)
                    }
                  </div>
                  
                  <div className="flex gap-2">
                    {task.timer?.isRunning ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={handlePauseTimer}
                          className="gap-2"
                        >
                          <Pause className="h-4 w-4" />
                          Pause
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={handleStopTimer}
                          className="gap-2"
                        >
                          <Square className="h-4 w-4" />
                          Stop
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={handleStartTimer}
                        className="gap-2"
                        disabled={task.status === "completed"}
                      >
                        <Play className="h-4 w-4" />
                        Start Timer
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Task Details */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(task.status)}`}>
                    {task.status === "completed" && <CheckCircle className="h-4 w-4" />}
                    {task.status === "in-progress" && <Clock className="h-4 w-4" />}
                    {task.status === "todo" && <AlertCircle className="h-4 w-4" />}
                    {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                  </div>
                  
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Estimated:</span>
                      <span className="font-medium">{task.estimatedHours}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Actual:</span>
                      <span className="font-medium">{task.actualHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Progress:</span>
                      <span className="font-medium">{getProgressPercentage().toFixed(0)}%</span>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${getProgressPercentage()}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Time Tracking Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Time Tracking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Billable:</span>
                    <Badge variant={task.isBillable ? "default" : "secondary"}>
                      {task.isBillable ? "Yes" : "No"}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Hourly Rate:</span>
                    <span className="font-medium">{task.hourlyRate}</span>
                  </div>
                  
                  {task.timer?.startTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Started:</span>
                      <span className="font-medium">
                        {new Date(task.timer.startTime).toLocaleString()}
                      </span>
                    </div>
                  )}
                  
                  <div className="text-sm text-muted-foreground">
                    {task.timer?.isRunning 
                      ? "Timer is currently running..." 
                      : task.timer?.elapsedSeconds 
                        ? "Timer was stopped. Total time logged." 
                        : "No timer recorded yet."
                    }
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
