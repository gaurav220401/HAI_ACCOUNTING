import Organization from "../models/organization.model";
import { IOrganization, ServiceResult } from "../types";

/**
 * organizationService
 *
 * Business logic for Organization management.
 * Controllers call these methods; the service layer handles validation,
 * DB interaction, and error normalisation.
 */
export const organizationService = {
  /**
   * Find an organization by MongoDB _id.
   */
  async findById(id: string): Promise<ServiceResult<IOrganization>> {
    try {
      const org = await Organization.findById(id);
      if (!org) {
        return { success: false, error: "Organization not found", statusCode: 404 };
      }
      return { success: true, data: org };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 500 };
    }
  },

  /**
   * List all non-deleted organizations.
   */
  async listAll(): Promise<ServiceResult<IOrganization[]>> {
    try {
      const orgs = await Organization.find().sort({ name: 1 });
      return { success: true, data: orgs };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 500 };
    }
  },

  /**
   * Check whether an organization name is already taken.
   */
  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const query: Record<string, unknown> = { name };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Organization.findOne(query);
    return !!existing;
  },
};
