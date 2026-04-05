import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { list, getOne, create, update, remove, addComment, getActivity, clone, merge } from "../controllers/contact.controller";

const router = Router();
router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.post("/:id/clone", clone);
router.post("/:id/merge", merge);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);
router.post("/:id/comments", addComment);
router.get("/:id/activity", getActivity);

export default router;
