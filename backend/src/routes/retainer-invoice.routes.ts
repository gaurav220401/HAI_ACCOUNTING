import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as retainerInvoiceController from "../controllers/retainer-invoice.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", retainerInvoiceController.getNextNumber);
router.get("/", retainerInvoiceController.list);
router.get("/:id", retainerInvoiceController.getOne);
router.post("/", retainerInvoiceController.create);
router.patch("/:id", retainerInvoiceController.update);
router.delete("/:id", retainerInvoiceController.remove);

router.post("/:id/send", retainerInvoiceController.send);
router.post("/:id/record-payment", retainerInvoiceController.recordPayment);
router.post("/:id/apply", retainerInvoiceController.applyToInvoice);
router.post("/:id/unapply", retainerInvoiceController.unapplyFromInvoice);
router.post("/:id/refund", retainerInvoiceController.recordRefund);
router.post("/:id/void", retainerInvoiceController.voidRetainerInvoice);

export default router;
