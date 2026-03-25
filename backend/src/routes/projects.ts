import express from 'express';
import { authenticate } from '../middlewares/auth';
import Project from '../models/Project';
import TimeLog from '../models/TimeLog';
import TimesheetEntry from '../models/TimesheetEntry';

const router = express.Router();

// Helper functions for time calculations
function calculateDuration(startTime: Date, endTime: Date): string {
  const diffMs = Math.max(0, endTime.getTime() - startTime.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const diffHours = Math.floor(totalSeconds / 3600);
  const diffMinutes = Math.floor((totalSeconds % 3600) / 60);
  const diffSeconds = totalSeconds % 60;
  
  return `${diffHours.toString().padStart(2, '0')}:${diffMinutes.toString().padStart(2, '0')}:${diffSeconds.toString().padStart(2, '0')}`;
}

function addDurations(duration1: string, duration2: string): string {
  const parseStr = (str: string) => {
    if (!str) return [0, 0, 0];
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts; // HH:MM:SS
    if (parts.length === 2) return [parts[0], parts[1], 0]; // HH:MM
    return [0, 0, 0];
  };

  const [hours1, minutes1, seconds1] = parseStr(duration1);
  const [hours2, minutes2, seconds2] = parseStr(duration2);
  
  const totalSeconds = (hours1 * 3600 + minutes1 * 60 + seconds1) + (hours2 * 3600 + minutes2 * 60 + seconds2);
  const newHours = Math.floor(totalSeconds / 3600);
  const newMinutes = Math.floor((totalSeconds % 3600) / 60);
  const newSeconds = totalSeconds % 60;
  
  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}`;
}

// Get all projects for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const userId = req.user!.id;

    // Build query
    const query: any = {
      $or: [
        { owner: userId },
        { members: userId }
      ]
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      });
    }

    const projects = await Project.find(query)
      .sort({ updatedAt: -1 })
      .limit(Number(limit) * Number(page))
      .skip((Number(page) - 1) * Number(limit))
      .populate('owner', 'name email')
      .populate('members', 'name email');

    const total = await Project.countDocuments(query);

    res.json({
      data: projects,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
});

// Get a specific project
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const project = await Project.findOne({
      _id: id,
      $or: [
        { owner: userId },
        { members: userId }
      ]
    }).populate('owner', 'name email')
      .populate('members', 'name email');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ data: project });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Failed to fetch project' });
  }
});

// Create a new project
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const projectData = {
      ...req.body,
      owner: userId,
      createdBy: userId
    };

    // Generate project code if not provided
    if (!projectData.projectCode) {
      let isUnique = false;
      let count = await Project.countDocuments({ owner: userId });
      
      while (!isUnique) {
        count++;
        const proposedCode = `PRJ-${count.toString().padStart(4, '0')}`;
        const existing = await Project.findOne({ projectCode: proposedCode });
        if (!existing) {
          projectData.projectCode = proposedCode;
          isUnique = true;
        }
      }
    } else {
      // If user provided a code, quickly check if it exists to give a clear error
      const existing = await Project.findOne({ projectCode: projectData.projectCode });
      if (existing) {
        return res.status(400).json({ message: 'Project code already exists' });
      }
    }

    const project = new Project(projectData);
    await project.save();

    await project.populate('owner', 'name email');

    res.status(201).json({ data: project });
  } catch (error: any) {
    console.error('Error creating project:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Project code already exists' });
    }
    res.status(500).json({ message: 'Failed to create project' });
  }
});

// Update a project
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const updateData = { ...req.body };

    // If project code is explicitly set to empty, remove it to avoid empty string unique constraint collisions
    if (updateData.projectCode === "") {
      delete updateData.projectCode;
      // We could use $unset, but simply dropping the property prevents updating it to empty string
    }

    // If providing a new code, ensure it doesn't already exist on a different project
    if (updateData.projectCode) {
      const existing = await Project.findOne({ 
        projectCode: updateData.projectCode,
        _id: { $ne: id as string }
      });
      if (existing) {
        return res.status(400).json({ message: 'Project code already exists' });
      }
    }

    const project = await Project.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { owner: userId },
          { members: userId }
        ]
      },
      updateData,
      { new: true, runValidators: true }
    ).populate('owner', 'name email')
      .populate('members', 'name email');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ data: project });
  } catch (error: any) {
    console.error('Error updating project:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Project code already exists' });
    }
    res.status(500).json({ message: 'Failed to update project' });
  }
});

// Delete a project
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const project = await Project.findOneAndDelete({
      _id: id,
      owner: userId // Only owner can delete
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found or no permission' });
    }

    // Also delete related time logs and timesheet entries
    await TimeLog.deleteMany({ projectId: id });
    await TimesheetEntry.deleteMany({ projectId: id });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Failed to delete project' });
  }
});

// Time tracking routes

// Start time tracking for a project
router.post('/:projectId/time-logs/start', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.id;
    const { description } = req.body;

    // We no longer auto-stop existing active time logs to allow multiple trackers.

    // Create new time log
    const timeLog = new TimeLog({
      projectId,
      userId,
      startTime: new Date(),
      isActive: true,
      description,
      createdBy: userId
    });

    await timeLog.save();

    // Create in-progress timesheet entry
    const project = await Project.findById(projectId);
    if (project) {
      const timesheetEntry = new TimesheetEntry({
        projectId,
        projectName: project.name || 'Unnamed Project',
        customerName: project.customerName || 'Unknown Customer',
        task: description || 'Time tracking',
        userId,
        userName: req.user!.name || 'Unknown',
        date: new Date(),
        startTime: timeLog.startTime,
        duration: "00:00:00",
        billingStatus: 'Unbilled',
        status: 'in-progress',
        description: description,
        isBillable: true,
        createdBy: userId
      });
      await timesheetEntry.save();
    }

    await timeLog.populate('projectId', 'name');

    res.status(201).json({ data: timeLog });
  } catch (error: any) {
    console.error('Error starting timer:', error);
    res.status(500).json({ message: 'Failed to start timer', error: error.message, stack: error.stack });
  }
});

// Stop time tracking for a project
router.put('/:projectId/time-logs/:timeLogId/stop', authenticate, async (req, res) => {
  try {
    const { projectId, timeLogId } = req.params;
    const userId = req.user!.id;

    const timeLog = await TimeLog.findOne({
      _id: timeLogId,
      projectId,
      userId,
      isActive: true
    });

    if (!timeLog) {
      return res.status(404).json({ message: 'Active time log not found' });
    }

    const endTime = new Date();
    const duration = calculateDuration(timeLog.startTime, endTime);

    // Update time log
    timeLog.endTime = endTime;
    timeLog.duration = duration;
    timeLog.isActive = false;
    await timeLog.save();

    // Update existing timesheet entry or create new one
    const project = await Project.findById(projectId);
    if (project) {
      let timesheetEntry = await TimesheetEntry.findOne({
        projectId,
        userId,
        status: 'in-progress'
      }).sort({ startTime: -1 });

      if (timesheetEntry) {
        timesheetEntry.endTime = endTime;
        timesheetEntry.duration = duration;
        timesheetEntry.status = 'completed';
        timesheetEntry.task = timeLog.description || 'Time tracking';
        await timesheetEntry.save();
      } else {
        const newTimesheetEntry = new TimesheetEntry({
          projectId,
          projectName: project.name,
          customerName: project.customerName,
          task: timeLog.description || 'Time tracking',
          userId,
          userName: req.user!.name || 'Unknown',
          date: new Date(),
          startTime: timeLog.startTime,
          endTime,
          duration,
          billingStatus: 'Unbilled',
          status: 'completed',
          description: timeLog.description,
          isBillable: true,
          createdBy: userId
        });
        await newTimesheetEntry.save();
      }

      // Update project totals
      await updateProjectHours(projectId);
    }

    await timeLog.populate('projectId', 'name');

    res.json({ data: timeLog });
  } catch (error) {
    console.error('Error stopping timer:', error);
    res.status(500).json({ message: 'Failed to stop timer' });
  }
});

// Get active time logs
router.get('/time-logs/active', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.query;

    const query: any = {
      userId,
      isActive: true
    };

    if (projectId) {
      query.projectId = projectId;
    }

    const activeLogs = await TimeLog.find(query)
      .populate('projectId', 'name')
      .sort({ startTime: -1 });

    res.json({ data: activeLogs });
  } catch (error) {
    console.error('Error fetching active time logs:', error);
    res.status(500).json({ message: 'Failed to fetch active time logs' });
  }
});

// Helper function to update project hours
async function updateProjectHours(projectId: string) {
  try {
    const timesheetEntries = await TimesheetEntry.find({ projectId });
    
    const totalLogged = timesheetEntries.reduce((acc, entry) => {
      return addDurations(acc, entry.duration || '00:00:00');
    }, '00:00:00');

    const totalBilled = timesheetEntries
      .filter(entry => entry.billingStatus === 'Invoiced')
      .reduce((acc, entry) => {
        return addDurations(acc, entry.duration || '00:00:00');
      }, '00:00:00');

    const totalUnbilled = timesheetEntries
      .filter(entry => entry.billingStatus === 'Unbilled')
      .reduce((acc, entry) => {
        return addDurations(acc, entry.duration || '00:00:00');
      }, '00:00:00');

    await Project.findByIdAndUpdate(projectId, {
      totalLoggedHours: totalLogged,
      totalBilledHours: totalBilled,
      totalUnbilledHours: totalUnbilled
    });
  } catch (error) {
    console.error('Error updating project hours:', error);
  }
}

// Fetch all timesheets across all projects
router.get('/timesheets/all', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.user!.id;
    
    // Find all projects that the user has access to
    const userProjects = await Project.find({
      $or: [
        { owner: userId },
        { members: userId }
      ]
    }).select('_id');
    const projectIds = userProjects.map(p => p._id);

    const match: any = { projectId: { $in: projectIds } };

    const timesheets = await TimesheetEntry.find(match)
      .sort({ createdAt: -1 })
      .limit(Number(limit) * Number(page))
      .skip((Number(page) - 1) * Number(limit));

    const total = await TimesheetEntry.countDocuments(match);

    res.json({
      data: timesheets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching all timesheets:', error);
    res.status(500).json({ message: 'Failed to fetch timesheets' });
  }
});

// Get timesheets for a specific project
router.get('/:projectId/timesheets', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const timesheets = await TimesheetEntry.find({ projectId })
      .sort({ createdAt: -1 })
      .limit(Number(limit) * Number(page))
      .skip((Number(page) - 1) * Number(limit));

    const total = await TimesheetEntry.countDocuments({ projectId });

    res.json({
      data: timesheets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching timesheets:', error);
    res.status(500).json({ message: 'Failed to fetch timesheets' });
  }
});

// Get project users
router.get('/:projectId/users', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId)
      .populate('owner', 'name email')
      .populate('members', 'name email');
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    const users = [project.owner];
    if (project.members) {
      users.push(...project.members);
    }
    
    // Remove duplicates
    const uniqueUsers = Array.from(new Map(users.map((u: any) => [u._id.toString(), u])).values());
    res.json({ data: uniqueUsers });
  } catch (error) {
    console.error('Error fetching project users:', error);
    res.status(500).json({ message: 'Failed to fetch project users' });
  }
});

// Add project user
router.post('/:projectId/users', authenticate, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId } = req.body;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    if (!project.members) {
      project.members = [];
    }
    
    if (!project.members.includes(userId)) {
      project.members.push(userId);
      await project.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding project user:', error);
    res.status(500).json({ message: 'Failed to add project user' });
  }
});

// Remove project user
router.delete('/:projectId/users/:userId', authenticate, async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    if (project.members) {
      project.members = project.members.filter((id: any) => id.toString() !== userId);
      await project.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing project user:', error);
    res.status(500).json({ message: 'Failed to remove project user' });
  }
});

export default router;
