---
title: Time Tracking and Project Management
url: /docs/time-tracking
---

# Time Tracking and Project Management

HAI Accounting includes a comprehensive time tracking and project management module designed to record billable and non-billable hours, manage client projects and tasks, log weekly timesheets, and run live timers.

## Projects and Client Management
Projects organize work done for specific clients (customers).
1. **Creation**: When creating a project, you specify:
   - **Customer Name**: Selected from the customer contact registry.
   - **Project Name**: Unique identifier for the project.
   - **Billing Method**:
     - *Hourly Rate*: Charged based on logged hours multiplied by the hourly rate.
     - *Fixed Cost*: A fixed billing amount for the entire project.
     - *Non-Billable*: Time is tracked but not billed to the customer.
   - **Rate**: The currency rate associated with the selected billing method.
   - **Status**: Can be set to `active`, `inactive`, `completed`, or `archived`.
2. **Project List**: Displays customer name, project name, billing method, rate, status badge, active toggle (with green/red status indicator circles), total logged hours, and action controls.
3. **Actions**: From the project dashboard, users can view project details, view project-specific timesheets, clone the project, change the active status, add comments, or delete the project.

## Tasks
Within each project, work is broken down into specific tasks.
- **Task Fields**: Name, associated project, description, and default billable status (Yes/No).
- **Association**: Timesheet entries and timers must be linked to a specific task to organize work details.

## Timesheets and Log Entries
Timesheet records hold the actual logged hours of work.
1. **Log List**: Shows logged entries with Date, Project, Customer, Task, User, Timing (Start and End times), and total duration.
2. **Details Side Panel**: Clicking a log entry slides open a detailed side widget showing:
   - Logged user's name
   - Date and Duration (Hours & Minutes)
   - Billing Status (Invoiced, Unbilled)
   - Detailed project, customer, and task names
   - Custom description or notes
3. **Timer**: Users can run a live stopwatch timer to track active tasks. Clicking "Start" on a project opens a dialog to select the project and optionally type a "Task Description" (e.g. "What are you working on?"). Once started, the status becomes `in-progress` (visible as "Running..." in the list with a pulsing green indicator). The system updates the elapsed time dynamically. Clicking "Stop" persists the entry.

## Weekly Time Log Matrix
For fast bulk entry, the platform features a full-screen **Weekly Time Log** overlay.
1. **Interface**: A grid layout displaying projects and tasks as rows against the seven days of the current week (Monday to Sunday).
2. **Bulk Entry**: Users can input hours and minutes (e.g. `02:30`) directly into the cell corresponding to the project/task and day.
3. **Controls**:
   - Navigation buttons to go to previous/next week or jump to the current week.
   - **Billable Checkbox**: Toggle whether the entire row is billable to the client.
   - **Add New Row**: Create a new project/task row in the matrix.
   - **Totals**: Real-time totals computed for each day and a grand total for the entire week.
   - **Save / Cancel**: Persist all inputs at once or discard changes.
