import {
  apiFetch,
  buildQuery,
  type ListParams,
  type PaginatedResponse,
} from "./client";

// ─── Project API ───────────────────────────────────────────────────

export interface Project {
  _id: string;
  name: string;
  description?: string;
  customerName: string;
  projectCode?: string;
  billingMethod: "Fixed Rate" | "Hourly Rate" | "Based on Project Hours";
  rate?: string;
  ratePerDay?: string;
  budgetedRevenue?: string;
  expenseAmount?: string;
  hoursBudgetType?: string;
  unusedRetainers?: string;
  watchlistEnabled?: boolean;
  owner?: string;
  members?: string[];
  status: "active" | "inactive" | "completed" | "archived";
  totalLoggedHours?: string;
  totalBilledHours?: string;
  totalUnbilledHours?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  customerName: string;
  projectCode?: string;
  billingMethod: "Fixed Rate" | "Hourly Rate" | "Based on Project Hours";
  rate?: string;
  ratePerDay?: string;
  budgetedRevenue?: string;
  hoursBudgetType?: string;
  watchlistEnabled?: boolean;
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  status?: "active" | "inactive" | "completed" | "archived";
}

export interface TimesheetEntry {
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

export interface CreateTimesheetEntryInput {
  projectId: string;
  task: string;
  date: string;
  startTime?: string;
  endTime?: string;
  duration: string;
  description?: string;
  isBillable?: boolean;
}

export interface TimeLog {
  _id: string;
  projectId: string;
  userId: string;
  startTime: string;
  endTime?: string;
  duration?: string;
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export const projectApi = {
  list: (params?: ListParams) =>
    apiFetch<PaginatedResponse<Project>>(
      `/projects${buildQuery(params || {})}`,
    ),

  getById: (id: string) =>
    apiFetch<{ data: Project }>(`/projects/${id}`),

  create: (data: CreateProjectInput) =>
    apiFetch<{ data: Project }>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateProjectInput) =>
    apiFetch<{ data: Project }>(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/projects/${id}`, {
      method: "DELETE",
    }),

  // Timesheet operations
  getAllTimesheets: (params?: ListParams) =>
    apiFetch<PaginatedResponse<TimesheetEntry>>(
      `/projects/timesheets/all${buildQuery(params || {})}`,
    ),

  getTimesheets: (projectId: string, params?: ListParams) =>
    apiFetch<PaginatedResponse<TimesheetEntry>>(
      `/projects/${projectId}/timesheets${buildQuery(params || {})}`,
    ),

  createTimesheetEntry: (projectId: string, data: CreateTimesheetEntryInput) =>
    apiFetch<{ data: TimesheetEntry }>(`/projects/${projectId}/timesheets`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTimesheetEntry: (projectId: string, entryId: string, data: Partial<CreateTimesheetEntryInput>) =>
    apiFetch<{ data: TimesheetEntry }>(`/projects/${projectId}/timesheets/${entryId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteTimesheetEntry: (projectId: string, entryId: string) =>
    apiFetch<{ success: boolean }>(`/projects/${projectId}/timesheets/${entryId}`, {
      method: "DELETE",
    }),

  // Time tracking operations
  start: (projectId: string, data: { description?: string }) =>
    apiFetch<{ data: TimeLog }>(`/projects/${projectId}/time-logs/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  startTimeTracking: (projectId: string, data: { description?: string }) =>
    apiFetch<{ data: TimeLog }>(`/projects/${projectId}/time-logs/start`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  stopTimeTracking: (projectId: string, timeLogId: string) =>
    apiFetch<{ data: TimeLog }>(`/projects/${projectId}/time-logs/${timeLogId}/stop`, {
      method: "PUT",
    }),

  getActiveTimeLogs: (projectId?: string) =>
    apiFetch<{ data: TimeLog[] }>(`/projects/time-logs/active${projectId ? `?projectId=${projectId}` : ''}`),

  getTimeLogs: (projectId?: string, params?: ListParams) =>
    apiFetch<PaginatedResponse<TimeLog>>(
      `/projects/time-logs${projectId ? `?projectId=${projectId}` : ''}${buildQuery(params || {})}`,
    ),

  // Project users
  getProjectUsers: (projectId: string) =>
    apiFetch<{ data: any[] }>(`/projects/${projectId}/users`),

  addProjectUser: (projectId: string, userId: string, role?: string) =>
    apiFetch<{ success: boolean }>(`/projects/${projectId}/users`, {
      method: "POST",
      body: JSON.stringify({ userId, role }),
    }),

  removeProjectUser: (projectId: string, userId: string) =>
    apiFetch<{ success: boolean }>(`/projects/${projectId}/users/${userId}`, {
      method: "DELETE",
    }),

  getAllUsers: () => apiFetch<PaginatedResponse<any>>(`/users`),
};
