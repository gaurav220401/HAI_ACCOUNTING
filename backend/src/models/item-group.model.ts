import { Schema, model } from "mongoose";
import { IItemGroup } from "../types";

const itemGroupSchema = new Schema<IItemGroup>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "ItemGroup", default: null },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

itemGroupSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const ItemGroup = model<IItemGroup>("ItemGroup", itemGroupSchema);
export default ItemGroup;
