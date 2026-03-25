import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
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
  owner: mongoose.Types.ObjectId;
  members?: mongoose.Types.ObjectId[];
  status: "active" | "completed" | "archived";
  totalLoggedHours?: string;
  totalBilledHours?: string;
  totalUnbilledHours?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  projectCode: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  billingMethod: {
    type: String,
    enum: ["Fixed Rate", "Hourly Rate", "Based on Project Hours"],
    default: "Hourly Rate"
  },
  rate: {
    type: String,
    trim: true
  },
  ratePerDay: {
    type: String,
    trim: true
  },
  budgetedRevenue: {
    type: String,
    trim: true
  },
  expenseAmount: {
    type: String,
    trim: true
  },
  hoursBudgetType: {
    type: String,
    trim: true
  },
  unusedRetainers: {
    type: String,
    trim: true
  },
  watchlistEnabled: {
    type: Boolean,
    default: false
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ["active", "completed", "archived"],
    default: "active"
  },
  totalLoggedHours: {
    type: String,
    default: "00:00"
  },
  totalBilledHours: {
    type: String,
    default: "00:00"
  },
  totalUnbilledHours: {
    type: String,
    default: "00:00"
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
ProjectSchema.index({ owner: 1, status: 1 });
ProjectSchema.index({ customerName: 1 });
ProjectSchema.index({ name: 1 });

export default mongoose.model<IProject>('Project', ProjectSchema);
