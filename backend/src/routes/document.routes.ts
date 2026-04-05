import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as documentController from "../controllers/document.controller";

const router = Router();

// Email webhook style ingestion endpoint (uses key header, not Firebase auth).
router.post("/email-ingest", documentController.emailIngest);
router.get("/events", documentController.streamEvents);

router.use(authenticate);

router.get("/mailbox", documentController.getMailbox);
router.post("/mailbox/regenerate", documentController.regenerateMailbox);

router.get("/folders", documentController.listFolders);
router.post("/folders", documentController.createFolder);
router.get("/trash", documentController.listTrashDocuments);

router.post("/upload", documentController.uploadDocumentFile, documentController.uploadDocument);

router.get("/", documentController.listDocuments);
router.get("/stats", documentController.getDocumentStats);
router.get("/:id", documentController.getDocument);
router.get("/:id/signed-url", documentController.getSignedPreviewUrl);
router.delete("/:id", documentController.deleteDocument);
router.post("/:id/restore", documentController.restoreDocument);

router.patch("/:id/move-folder", documentController.moveToFolder);
router.post("/:id/reprocess", documentController.reprocessDocument);
router.get("/:id/link-suggestions", documentController.getLinkSuggestions);
router.post("/:id/link", documentController.linkDocument);
router.post("/:id/add-to", documentController.addToEntity);
router.post("/:id/add-to-bank", documentController.addStatementToBank);

export default router;
