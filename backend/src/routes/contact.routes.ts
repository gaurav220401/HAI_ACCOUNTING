import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  list, getOne, create, update, remove,
  addComment, getActivity, clone, merge,
  downloadSampleTemplate, downloadBlankTemplate, previewImport, executeImport,
  exportProtectedContacts
} from "../controllers/contact.controller";
import { upload } from "../middlewares/upload";

const router = Router();
router.use(authenticate);

// Templates (must be before /:id)
router.get("/import/template/sample", downloadSampleTemplate);
router.get("/import/template/blank", downloadBlankTemplate);

// Import endpoints (must be before /:id)
router.post("/import/preview", upload.single("file"), previewImport);
router.post("/import", upload.single("file"), executeImport);
router.post("/export-protected", exportProtectedContacts);

router.get("/", list);
router.post("/", create);
router.post("/:id/clone", clone);
router.post("/:id/merge", merge);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);
router.post("/:id/comments", addComment);
router.get("/:id/activity", getActivity);

export default router;
