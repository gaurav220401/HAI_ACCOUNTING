import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { upload } from "../middlewares/upload";
import {
	list,
	listForItem,
	details,
	getOpeningBalances,
	saveOpeningBalances,
	create,
	update,
	remove,
	seedTemplate,
	downloadSampleTemplate,
	downloadBlankTemplate,
	previewImport,
	executeImport,
} from "../controllers/account.controller";

const router = Router();
router.use(authenticate);

// Templates (must be before /:id)
router.get("/import/template/sample", downloadSampleTemplate);
router.get("/import/template/blank", downloadBlankTemplate);

// Import endpoints (must be before /:id)
router.post("/import/preview", upload.single("file"), previewImport);
router.post("/import", upload.single("file"), executeImport);

router.get("/", list);
router.get("/for-item", listForItem);   // must be before /:id
router.get("/:id/details", details);
router.get("/opening-balances", getOpeningBalances);
router.put("/opening-balances", saveOpeningBalances);
router.post("/", create);
router.post("/seed-template", seedTemplate);
router.patch("/:id", update);
router.delete("/:id", remove);


export default router;
