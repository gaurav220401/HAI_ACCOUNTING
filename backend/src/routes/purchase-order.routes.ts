import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
	list,
	getOne,
	create,
	update,
	remove,
	getNextNumber,
	sendPurchaseOrderEmail,
	downloadPdf,
} from "../controllers/purchase-order.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", getNextNumber);
router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);
router.get("/:id/pdf", downloadPdf);
router.post("/:id/send-email", sendPurchaseOrderEmail);

export default router;
