import { Schema, model } from "mongoose";
import { IReportingTag } from "../types";
import { auditTrailPlugin } from "../plugins";

const reportingTagSchema = new Schema<IReportingTag>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    color: { type: String, default: "#6366f1" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

reportingTagSchema.plugin(auditTrailPlugin);
reportingTagSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const ReportingTag = model<IReportingTag>("ReportingTag", reportingTagSchema);
export default ReportingTag;
