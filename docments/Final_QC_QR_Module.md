# Final QC & QR
### Textile Sourcing, Traceability & Buyer CRM Platform
Covers final goods verification and packing list finalization, plus dual QR code generation that gates the 'Completed' status. Companion to BRD v2.0 (Section 7.7), SRS v2.0 (FR-22, FR-25–FR-27, FR-34–FR-38), and Packing_List_Module_Instructions.md.

---

## Final QC & QR

**Purpose:** Missing from the current build/sidebar. This is a distinct step from Module 8 (QC Costs) — QC Costs captures the *cost report*; this module captures the *final verified product data* and generates the dual QR codes that gate the status change to "Completed." Maps to BRD Section 7.7, BR-32–BR-35, FR-22, FR-25–FR-27, FR-34–FR-38. Add "Final QC & QR" as its own sidebar item, positioned after Packing Lists and before Invoices (matching the pipeline order in the App Workflow doc, Section 4, Step 9).

**Fields:**
| Field | Type | Notes |
|---|---|---|
| Product | FK | Must have status = Ready for Final QC (i.e. Warehouse Costs step already completed) |
| Final Goods Name | Text | Confirmed/corrected product name at final inspection |
| Final Price | Decimal | Confirmed unit price |
| Fabric Details | Text | Material composition, etc. |
| Finalized Packing List | FK / confirmation | Confirms the Packing List (Module 7) is locked and correct as of this point |
| Product QR Code | Generated, read-only | Encodes: size, color, quantity, fabric, price (JSON payload, versioned schema per SRS FR-25) |
| Carton QR Code | Generated, read-only | Encodes: carton contents, total quantity, QC Report ID (SRS FR-26) |

**UI Requirements:**
- Queue/list view: all products with status = "Ready for Final QC," so QC Person can see what's waiting.
- Detail screen: form for Final Goods Name / Price / Fabric Details, plus a read-only summary of the already-finalized Packing List (pulled from Module 7, not re-entered).
- Two clearly separate "Generate Product QR" and "Generate Carton QR" actions (they encode different data and can be generated at different times — don't merge into one button).
- Once both QR codes exist, the screen shows a "Mark Completed" confirmation (or auto-transitions — see Business Rules) and both QR images are downloadable/printable individually or as a batch sheet (SRS FR-38, Should-priority).
- Status badge on this screen and everywhere else in the app should read "Completed" only after this gate passes — verify this is the same status value/enum used across Sourcing Intake, Admin Approval, Sourcing Trips, Packing Lists, and the Buyer Portal's Sourcing Progress tab, not a separate parallel status field.

**API Endpoints:**
- `GET /api/v1/products/?status=ready_for_final_qc`
- `PATCH /api/v1/products/{id}/final-qc/` — saves Final Goods Name, Price, Fabric Details
- `POST /api/v1/products/{id}/generate-product-qr/`
- `POST /api/v1/products/{id}/generate-carton-qr/`

**Business Rules:**
- Status auto-transitions to "Completed" only when **both** QR codes exist for the product (BR-35, FR-27) — this must be a server-side check triggered after each QR generation call, not a manual status dropdown.
- QR generation should be blocked if Final Goods Name / Price / Fabric Details aren't yet saved — the QR payload depends on this data being finalized first.
- QR payload stored as structured JSON with a `schema_version` field so future payload changes don't break already-printed QR codes (SRS FR-25 note).

**Acceptance Checklist:**
- [ ] This screen/module actually exists in the sidebar and is reachable — closing the gap identified above.
- [ ] Status only flips to "Completed" once both QR codes are generated, verified with a test that generates only one and confirms status stays at the prior stage.
- [ ] QR payload correctly encodes the specified fields and can be scanned/decoded to verify content matches the source product record.
- [ ] "Completed" status is consistent across every module that displays it, including the Buyer Portal.

---

