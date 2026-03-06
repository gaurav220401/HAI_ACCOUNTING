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
} from "../controllers/quote.controller";

const router = Router();
router.use(authenticate);

// Must be before /:id to avoid "next-number" being captured as an id
router.get("/next-number", getNextNumber);

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

// Status transitions
router.post("/:id/send", sendQuote);
router.post("/:id/accept", acceptQuote);
router.post("/:id/reject", rejectQuote);

export default router;
