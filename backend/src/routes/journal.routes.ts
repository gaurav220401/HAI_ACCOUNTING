import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as journalController from "../controllers/journal.controller";

const router = Router();

router.use(authenticate);

router.get("/", journalController.list);
router.get("/:id", journalController.getOne);
router.post("/", journalController.create);
router.patch("/:id", journalController.update);
router.post("/:id/post", journalController.postJournal);
router.post("/:id/void", journalController.voidJournal);
router.delete("/:id", journalController.remove);

export default router;
