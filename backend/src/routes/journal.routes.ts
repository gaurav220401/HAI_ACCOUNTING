import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as journalController from "../controllers/journal.controller";
import { upload } from "../middlewares/upload";

const router = Router();

router.use(authenticate);

router.get("/", journalController.list);
router.get("/numbering-preferences", journalController.getNumberingPreferences);
router.put(
  "/numbering-preferences",
  journalController.updateNumberingPreferences,
);

// Templates (must be before /:id to avoid clashing)
router.get("/import/template/sample", journalController.downloadSampleTemplate);
router.get("/import/template/blank", journalController.downloadBlankTemplate);

// Import endpoints (must be before /:id to avoid clashing)
router.post("/import/preview", upload.single("file"), journalController.previewImport);
router.post("/import", upload.single("file"), journalController.executeImport);

router.get("/:id", journalController.getOne);
router.post("/", journalController.create);
router.patch("/:id", journalController.update);
router.post("/:id/post", journalController.postJournal);
router.post("/:id/void", journalController.voidJournal);
router.delete("/:id", journalController.remove);

export default router;
