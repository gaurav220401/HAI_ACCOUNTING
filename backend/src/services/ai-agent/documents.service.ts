import DocumentModel from "../../models/document.model";
import DocumentFolder from "../../models/document-folder.model";
import { Types } from "mongoose";

export async function listDocuments(organizationId: any, folderId?: string) {
  const filter: any = { organizationId, isDeleted: false };
  if (folderId) {
    filter.folderId = new Types.ObjectId(folderId);
  }
  return DocumentModel.find(filter)
    .sort({ uploadedAt: -1 })
    .lean();
}

export async function getDocumentById(organizationId: any, docId: any) {
  return DocumentModel.findOne({ _id: docId, organizationId, isDeleted: false }).lean();
}

export async function deleteDocument(organizationId: any, docId: any) {
  return DocumentModel.findOneAndUpdate(
    { _id: docId, organizationId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true }
  ).lean();
}

export async function uploadDocument(organizationId: any, file: any, metadata: any = {}) {
  return DocumentModel.create({
    organizationId,
    fileName: file.originalname || file.name || "Unnamed File",
    mimeType: file.mimetype || "application/octet-stream",
    sizeBytes: file.size || 0,
    cloudinaryPublicId: metadata.cloudinaryPublicId || `mock_${Date.now()}`,
    url: metadata.url || "http://localhost:5000/placeholder-url",
    processingStatus: "PROCESSED",
    documentType: metadata.documentType || "generic",
    folderId: metadata.folderId ? new Types.ObjectId(metadata.folderId) : null,
  });
}

export async function listFolders(organizationId: any) {
  return DocumentFolder.find({ organizationId, isDeleted: false })
    .sort({ name: 1 })
    .lean();
}

export async function createFolder(organizationId: any, data: any) {
  return DocumentFolder.create({
    organizationId,
    name: data.name,
    visibilityType: data.visibilityType || "all_users",
    permissions: data.permissions || [],
  });
}
