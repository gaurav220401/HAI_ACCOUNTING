import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  create,
  getOne,
  list,
  pause,
  remove,
  resume,
  runNow,
  stop,
  update,
} from "../controllers/recurring-invoice.controller";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

router.post("/:id/pause", pause);
router.post("/:id/resume", resume);
router.post("/:id/stop", stop);
router.post("/:id/run-now", runNow);

export default router;