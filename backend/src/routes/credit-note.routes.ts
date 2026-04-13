import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as creditNoteController from "../controllers/credit-note.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", creditNoteController.getNextNumber);
router.get("/", creditNoteController.list);
router.get("/:id", creditNoteController.getOne);
router.get("/:id/pdf", creditNoteController.downloadPdf);
router.post("/", creditNoteController.create);
router.patch("/:id", creditNoteController.update);
router.post("/:id/clone", creditNoteController.cloneCreditNote);
router.post("/:id/apply", creditNoteController.applyToInvoice);
router.post("/:id/unapply", creditNoteController.unapplyFromInvoice);
router.post("/:id/refund", creditNoteController.recordRefund);
router.post("/:id/comments", creditNoteController.addComment);
router.post("/:id/void", creditNoteController.voidCreditNote);
router.delete("/:id", creditNoteController.remove);

export default router;
