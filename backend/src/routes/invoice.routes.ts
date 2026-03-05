import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middlewares/auth";
import {
  list,
  getOne,
  create,
  update,
  remove,
  getNextNumber,
  sendInvoice,
  sendInvoiceEmail,
  markAsSent,
  recordPayment,
  voidInvoice,
} from "../controllers/invoice.controller";

const router = Router();
router.use(authenticate);

// multer with in-memory storage for email attachments (max 10 files, 10 MB each)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get("/next-number", getNextNumber);
router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

router.post("/:id/send", sendInvoice);
router.post("/:id/send-email", upload.array("files", 10), sendInvoiceEmail);
router.post("/:id/mark-sent", markAsSent);
router.post("/:id/record-payment", recordPayment);
router.post("/:id/void", voidInvoice);

export default router;
