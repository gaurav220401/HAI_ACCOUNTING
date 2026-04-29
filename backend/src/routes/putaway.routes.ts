import { Router } from "express";
import * as putawayController from "../controllers/putaway.controller";
import { authenticate } from "../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/", putawayController.list);
router.post("/", putawayController.create);
router.get("/next-number", putawayController.getNextNumber);
router.get("/pending", putawayController.getPending);

export default router;
