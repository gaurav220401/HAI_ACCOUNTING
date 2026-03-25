import mongoose, { Schema, Document } from 'mongoose';

export interface ITimesheetEntry extends Document {
  projectId: mongoose.Types.ObjectId;
  projectName: string;
  customerName: string;
  task: string;
  userId: mongoose.Types.ObjectId;
  userName: string;
  date: Date;
  startTime?: Date;
  endTime?: Date;
  duration: string;
  billingStatus: "Invoiced" | "Unbilled" | "Draft";
  status: "completed" | "in-progress" | "pending";
  description?: string;
  hourlyRate?: string;
  totalAmount?: string;
  isBillable: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TimesheetEntrySchema: Schema = new Schema({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  projectName: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  task: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  duration: {
    type: String,
    required: true
  },
  billingStatus: {
    type: String,
    enum: ["Invoiced", "Unbilled", "Draft"],
    default: "Unbilled"
  },
  status: {
    type: String,
    enum: ["completed", "in-progress", "pending"],
    default: "pending"
  },
  description: {
    type: String,
    trim: true
  },
  hourlyRate: {
    type: String
  },
  totalAmount: {
    type: String
  },
  isBillable: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
TimesheetEntrySchema.index({ projectId: 1, userId: 1, date: 1 });
TimesheetEntrySchema.index({ userId: 1, date: 1 });
TimesheetEntrySchema.index({ billingStatus: 1 });

export default mongoose.model<ITimesheetEntry>('TimesheetEntry', TimesheetEntrySchema);
