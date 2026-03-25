// Calculate duration between two dates in HH:MM format
export function calculateDuration(startTime: Date, endTime: Date): string {
  const diffMs = endTime.getTime() - startTime.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${diffHours.toString().padStart(2, '0')}:${diffMinutes.toString().padStart(2, '0')}`;
}

// Parse duration string to minutes
export function durationToMinutes(duration: string): number {
  const [hours, minutes] = duration.split(':').map(Number);
  return hours * 60 + minutes;
}

// Convert minutes to duration string
export function minutesToDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Add two duration strings
export function addDurations(duration1: string, duration2: string): string {
  const minutes1 = durationToMinutes(duration1);
  const minutes2 = durationToMinutes(duration2);
  return minutesToDuration(minutes1 + minutes2);
}

// Format date for display
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
