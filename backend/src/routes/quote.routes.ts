import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  list,
  getOne,
  create,
  update,
  remove,
  sendQuote,
  acceptQuote,
  rejectQuote,
  getNextNumber,
  downloadPdf,
  sendQuoteEmail,
  convertToInvoice,
  convertToSalesOrder,
} from "../controllers/quote.controller";
import multer from "multer";

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Must be before /:id to avoid "next-number" being captured as an id
router.get("/next-number", getNextNumber);

router.get("/", list);
router.post("/", create);
router.get("/:id/pdf", downloadPdf);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

// Status transitions
router.post("/:id/send", sendQuote);
router.post("/:id/send-email", upload.array("files", 10), sendQuoteEmail);
router.post("/:id/accept", acceptQuote);
router.post("/:id/reject", rejectQuote);
router.post("/:id/convert-to-invoice", convertToInvoice);
router.post("/:id/convert-to-sales-order", convertToSalesOrder);

export default router;
