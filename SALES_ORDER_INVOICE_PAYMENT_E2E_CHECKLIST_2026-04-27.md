# Sales Order to Payment Flow Checklist

Date: April 27, 2026  
Scope: Sales Order -> Invoice -> Payment Received -> status/report sync

## Implementation Validation (Code)

- [x] Invoice record-payment API now creates a Payment Received entry via the canonical payment workflow.
- [x] Invoice record-payment API now applies amount against invoice through payment mapping logic (not direct invoice mutation path).
- [x] Payment linkage now reuses transaction + idempotency guard behavior.
- [x] Sales Order send-email now has a dedicated page route (not only modal flow).
- [x] Sales Order PDF endpoint added for both download and send-email preview.
- [x] Save and Send from new Sales Order now goes to dedicated send-email page.
- [x] Sales Order detail Send Email action now routes to dedicated send-email page.
- [x] Sales Order detail Download PDF now downloads actual PDF from backend endpoint.

## Why Report Sync Is Correct After This Change

- Payment recording from invoice endpoint now creates Payment Received and invoice-application map records.
- This unifies invoice-side and payment-module-side behavior so reporting sources remain consistent.
- Contact outstanding recomputation and payment event posting are triggered from the same canonical flow used by Payments Received.

## Manual End-to-End QA Checklist

1. Create Sales Order as Draft and verify status = DRAFT.
2. Click Save and Send from new Sales Order flow.
3. Confirm navigation lands on /sales/orders/{id}/send-email.
4. In send-email page:
   - Verify customer email prefilled when available.
   - Verify PDF preview renders.
   - Send email with Attach Sales Order PDF checked.
5. Convert the same Sales Order to Invoice.
6. From invoice, record a partial payment through invoice action endpoint.
7. Verify:
   - Invoice status changes to Partially Paid.
   - Payment Received entry is created.
   - Invoice payment application linkage exists.
8. Record remaining payment from invoice.
9. Verify:
   - Invoice status changes to Paid.
   - Balance due reaches 0.
   - Payment Received history has both receipts.
10. Verify reports:
   - Payments Received report shows both receipts.
   - Invoice report reflects paid status and zero outstanding.
   - Contact/customer outstanding reflects updated balance.

## Notes

- Diagnostics check run on all touched files: no TypeScript/Problems errors reported.
- This checklist documents expected runtime verification steps; execute with representative sample data in UAT/staging.
