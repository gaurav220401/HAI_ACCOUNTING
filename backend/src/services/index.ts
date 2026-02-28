/**
 * Services barrel export
 *
 * Each service module will be implemented in its corresponding phase.
 * This directory provides the foundation for the service layer.
 *
 * ── Phase 0: Foundation (current) ─────────────────────────────────────
 *   organization.service.ts  — org CRUD + settings
 *
 * ── Phase 2+: Receivables ─────────────────────────────────────────────
 *   invoice.service.ts, payment.service.ts, estimate.service.ts, ...
 *
 * ── Phase 3+: Payables ────────────────────────────────────────────────
 *   bill.service.ts, purchaseOrder.service.ts, ...
 *
 * ── Phase 4+: Banking ─────────────────────────────────────────────────
 *   banking.service.ts, reconciliation.service.ts, ...
 *
 * ── Phase 5+: Accounting Core ─────────────────────────────────────────
 *   account.service.ts, journal.service.ts, ...
 *
 * All service functions follow the ServiceResult<T> contract defined
 * in backend/src/types/index.ts.
 */

export { organizationService } from "./organization.service";
