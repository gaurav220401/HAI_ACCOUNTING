"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { projectApi, type TimeLog, type Project } from "@/lib/api";

interface TimeTrackingContextType {
  activeTimeLogs: TimeLog[];
  isTracking: boolean;
  currentProjectId: string | null;
  startTime: Date | null;
  elapsedTime: string;
  startTimer: (projectId: string, description?: string) => Promise<void>;
  stopTimer: (projectId: string) => Promise<void>;
  refreshActiveLogs: () => Promise<void>;
  isProjectTracking: (projectId: string) => boolean;
  getProjectElapsedTime: (projectId: string) => string;
}

const TimeTrackingContext = createContext<TimeTrackingContextType | undefined>(undefined);

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
  const [activeTimeLogs, setActiveTimeLogs] = useState<TimeLog[]>([]);
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});

  const isTracking = activeTimeLogs.length > 0;
  const currentProjectId = isTracking 
    ? (typeof activeTimeLogs[0].projectId === 'object' 
        ? (activeTimeLogs[0].projectId as any)._id 
        : activeTimeLogs[0].projectId)
    : null;
  const startTime = isTracking ? new Date(activeTimeLogs[0].startTime) : null;
  const elapsedTime = currentProjectId ? elapsedTimes[currentProjectId] || "00:00:00" : "00:00:00";

  const refreshActiveLogs = useCallback(async () => {
    try {
      const response = await projectApi.getActiveTimeLogs();
      setActiveTimeLogs(response.data || []);
    } catch (error) {
      console.error('Failed to fetch active time logs:', error);
    }
  }, []);

  const startTimer = useCallback(async (projectId: string, description?: string) => {
    try {
      console.log('Starting timer for project:', projectId, 'with description:', description);
      const response = await projectApi.start(projectId, { description });
      console.log('Start timer response:', response);
      await refreshActiveLogs();
    } catch (error: any) {
      console.error('Failed to start timer:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }, [refreshActiveLogs]);

  const stopTimer = useCallback(async (projectId: string) => {
    try {
      const activeLog = activeTimeLogs.find(log => {
        const logProjectId = typeof log.projectId === 'object' ? (log.projectId as any)._id : log.projectId;
        return logProjectId === projectId;
      });
      if (activeLog) {
        await projectApi.stopTimeTracking(projectId, activeLog._id);
        await refreshActiveLogs();
      }
    } catch (error) {
      console.error('Failed to stop timer:', error);
    }
  }, [activeTimeLogs, refreshActiveLogs]);

  const isProjectTracking = useCallback((projectId: string) => {
    return activeTimeLogs.some(log => {
      const logProjectId = typeof log.projectId === 'object' ? (log.projectId as any)._id : log.projectId;
      return logProjectId === projectId;
    });
  }, [activeTimeLogs]);

  const getProjectElapsedTime = useCallback((projectId: string) => {
    return elapsedTimes[projectId] || "00:00:00";
  }, [elapsedTimes]);

  // Update elapsed time every second for all active logs
  useEffect(() => {
    if (activeTimeLogs.length === 0) return;

    function formatDuration(seconds: number): string {
      const hours = Math.floor(seconds / (60 * 60));
      const minutes = Math.floor((seconds % (60 * 60)) / 60);
      const secs = Math.floor(seconds % 60);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const newElapsedTimes: Record<string, string> = {};
      
      activeTimeLogs.forEach(log => {
        const pid = typeof log.projectId === 'object' ? (log.projectId as any)._id : log.projectId;
        const diff = now.getTime() - new Date(log.startTime).getTime();
        newElapsedTimes[pid] = formatDuration(Math.floor(diff / 1000));
      });
      
      setElapsedTimes(newElapsedTimes);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimeLogs]);

  // Load active logs on mount
  useEffect(() => {
    refreshActiveLogs();
  }, [refreshActiveLogs]);

  return (
    <TimeTrackingContext.Provider
      value={{
        activeTimeLogs,
        isTracking,
        currentProjectId,
        startTime,
        elapsedTime,
        startTimer,
        stopTimer,
        refreshActiveLogs,
        isProjectTracking,
        getProjectElapsedTime
      }}
    >
      {children}
    </TimeTrackingContext.Provider>
  );
}

export function useTimeTracking() {
  const ctx = useContext(TimeTrackingContext);
  if (!ctx) {
    throw new Error("useTimeTracking must be used within TimeTrackingProvider");
  }
  return ctx;
}
