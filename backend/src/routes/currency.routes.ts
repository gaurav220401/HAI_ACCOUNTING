import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  listCurrencies, seedCurrencies,
  listRates, latestRate, createRate, deleteRate,
} from "../controllers/currency.controller";

const router = Router();
router.use(authenticate);

router.get("/", listCurrencies);
router.post("/seed", seedCurrencies);

router.get("/rates", listRates);
router.get("/rates/latest", latestRate);
router.post("/rates", createRate);
router.delete("/rates/:id", deleteRate);

export default router;
