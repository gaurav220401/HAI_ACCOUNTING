import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  list, getOne, create, update, remove,
  bulkAction,
  getInventoryMetrics,
  listItemGroups, createItemGroup, updateItemGroup, deleteItemGroup,
  listUnits, createUnit, deleteUnit, seedUnits,
} from "../controllers/item.controller";

const router = Router();
router.use(authenticate);

// Item Groups (must be before /:id to avoid "groups" being captured as an id)
router.get("/groups", listItemGroups);
router.post("/groups", createItemGroup);
router.patch("/groups/:id", updateItemGroup);
router.delete("/groups/:id", deleteItemGroup);

// Units of Measurement (must be before /:id)
router.get("/units", listUnits);
router.post("/units", createUnit);
router.post("/units/seed", seedUnits);
router.delete("/units/:id", deleteUnit);

// Items
router.get("/", list);
router.post("/", create);
router.post("/bulk-actions", bulkAction);
router.get("/:id/inventory-metrics", getInventoryMetrics);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
