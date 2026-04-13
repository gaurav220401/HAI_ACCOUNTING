import { Schema, model, Document, Types } from "mongoose";

export type JournalNumberingMode = "auto" | "manual";

export interface IJournalNumberingPreference extends Document {
  organizationId: Types.ObjectId;
  mode: JournalNumberingMode;
  prefix: string;
  nextNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

const journalNumberingPreferenceSchema =
  new Schema<IJournalNumberingPreference>(
    {
      organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        unique: true,
        index: true,
      },
      mode: {
        type: String,
        enum: ["auto", "manual"],
        default: "auto",
        required: true,
      },
      prefix: {
        type: String,
        default: "JRN-",
        required: true,
        trim: true,
      },
      nextNumber: {
        type: Number,
        default: 1,
        required: true,
        min: 1,
      },
    },
    { timestamps: true },
  );

const JournalNumberingPreference = model<IJournalNumberingPreference>(
  "JournalNumberingPreference",
  journalNumberingPreferenceSchema,
);

export default JournalNumberingPreference;
