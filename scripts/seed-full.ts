import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function seed() {
  // ══════════════════════════════════════════════════════════════
  // USERS (5 roles)
  // ══════════════════════════════════════════════════════════════
  const rep1 = await prisma.user.upsert({ where: { email: 'rahim@company.com' }, update: {}, create: { email: 'rahim@company.com', name: 'Rahim Uddin', role: 'COMPANY_REP' } })
  const rep2 = await prisma.user.upsert({ where: { email: 'karim@company.com' }, update: {}, create: { email: 'karim@company.com', name: 'Karim Hossain', role: 'COMPANY_REP' } })
  const admin = await prisma.user.upsert({ where: { email: 'hasib@company.com' }, update: {}, create: { email: 'hasib@company.com', name: 'Hasib (Admin)', role: 'ADMIN' } })
  const qc = await prisma.user.upsert({ where: { email: 'jamal@company.com' }, update: {}, create: { email: 'jamal@company.com', name: 'Jamal (QC)', role: 'QC_PERSON' } })
  const wh = await prisma.user.upsert({ where: { email: 'sohel@company.com' }, update: {}, create: { email: 'sohel@company.com', name: 'Sohel (Warehouse)', role: 'WAREHOUSE_MANAGER' } })

  // ══════════════════════════════════════════════════════════════
  // SOURCING REQUESTS — covering every workflow stage
  // ══════════════════════════════════════════════════════════════

  // ── REQ 1: Full flow (Polo Shirt) — QC + Warehouse + Packing List + Invoiced ──
  const req1 = await prisma.sourcingRequest.create({
    data: {
      productName: "Men's Cotton Polo Shirt - Summer 2026",
      photoUrl: '',
      packingListNotes: 'Factory provided packing list verified. Use standard hangers.',
      status: 'APPROVED_FOR_QC',
      createdById: rep1.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-05T10:00:00Z'),
      variants: {
        create: [
          { styleNo: 'PL-2026-001', buyer: 'Walmart', poNo: 'PO-44521', color: 'Navy', itemNumber: 'ITM-001-NV-S', size: 'S', qtyOrdered: 120 },
          { styleNo: 'PL-2026-001', buyer: 'Walmart', poNo: 'PO-44521', color: 'Navy', itemNumber: 'ITM-001-NV-M', size: 'M', qtyOrdered: 200 },
          { styleNo: 'PL-2026-001', buyer: 'Walmart', poNo: 'PO-44521', color: 'Navy', itemNumber: 'ITM-001-NV-L', size: 'L', qtyOrdered: 180 },
          { styleNo: 'PL-2026-001', buyer: 'Walmart', poNo: 'PO-44521', color: 'White', itemNumber: 'ITM-001-WH-S', size: 'S', qtyOrdered: 100 },
          { styleNo: 'PL-2026-001', buyer: 'Walmart', poNo: 'PO-44521', color: 'White', itemNumber: 'ITM-001-WH-M', size: 'M', qtyOrdered: 150 },
        ],
      },
    },
  })

  // ── REQ 2: QC + Warehouse done (Denim Jacket) ──
  const req2 = await prisma.sourcingRequest.create({
    data: {
      productName: "Women's Denim Jacket - Classic Fit",
      photoUrl: '',
      packingListNotes: 'Fabric weight confirmed: 12oz denim. Special care for buttons.',
      status: 'APPROVED_FOR_QC',
      createdById: rep2.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-06T14:00:00Z'),
      variants: {
        create: [
          { styleNo: 'DJ-2026-010', buyer: 'Target', poNo: 'PO-88234', color: 'Indigo', itemNumber: 'ITM-010-IN-M', size: 'M', qtyOrdered: 80 },
          { styleNo: 'DJ-2026-010', buyer: 'Target', poNo: 'PO-88234', color: 'Indigo', itemNumber: 'ITM-010-IN-L', size: 'L', qtyOrdered: 100 },
          { styleNo: 'DJ-2026-010', buyer: 'Target', poNo: 'PO-88234', color: 'Black', itemNumber: 'ITM-010-BK-S', size: 'S', qtyOrdered: 60 },
        ],
      },
    },
  })

  // ── REQ 3: Pending admin approval (Kids Hoodie) ──
  const req3 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Kids Fleece Hoodie - Rainbow Collection',
      photoUrl: '',
      packingListNotes: 'Need QC team to verify fabric quality and print alignment',
      status: 'PENDING_ADMIN_APPROVAL',
      createdById: rep1.id,
      variants: {
        create: [
          { styleNo: 'FH-2026-005', buyer: 'Zara Kids', poNo: 'PO-11223', color: 'Sky Blue', itemNumber: 'ITM-005-SB-4', size: '4Y', qtyOrdered: 200 },
          { styleNo: 'FH-2026-005', buyer: 'Zara Kids', poNo: 'PO-11223', color: 'Sky Blue', itemNumber: 'ITM-005-SB-6', size: '6Y', qtyOrdered: 200 },
          { styleNo: 'FH-2026-005', buyer: 'Zara Kids', poNo: 'PO-11223', color: 'Pink', itemNumber: 'ITM-005-PK-4', size: '4Y', qtyOrdered: 150 },
          { styleNo: 'FH-2026-005', buyer: 'Zara Kids', poNo: 'PO-11223', color: 'Yellow', itemNumber: 'ITM-005-YL-6', size: '6Y', qtyOrdered: 180 },
        ],
      },
    },
  })

  // ── REQ 4: Rejected ──
  const req4 = await prisma.sourcingRequest.create({
    data: {
      productName: "Men's Chino Pants - Relaxed Fit",
      photoUrl: '',
      packingListNotes: 'Rejected - incomplete data',
      status: 'REJECTED',
      rejectionReason: 'Missing size-wise quantities for 2 colors. Please resubmit with complete breakdown.',
      createdById: rep2.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-07T11:00:00Z'),
      variants: {
        create: [
          { styleNo: 'CP-2026-003', buyer: 'H&M', poNo: 'PO-55678', color: 'Khaki', itemNumber: 'ITM-003-KH-M', size: 'M', qtyOrdered: 90 },
          { styleNo: 'CP-2026-003', buyer: 'H&M', poNo: 'PO-55678', color: 'Olive', itemNumber: 'ITM-003-OL-L', size: 'L', qtyOrdered: 120 },
        ],
      },
    },
  })

  // ── REQ 5: Pending admin approval (Summer Dress) ──
  const req5 = await prisma.sourcingRequest.create({
    data: {
      productName: "Women's Summer Dress - Floral Print",
      photoUrl: '',
      packingListNotes: 'Awaiting admin review before QC scheduling. Floral print needs color matching approval.',
      status: 'PENDING_ADMIN_APPROVAL',
      createdById: rep2.id,
      variants: {
        create: [
          { styleNo: 'SD-2026-015', buyer: 'Mango', poNo: 'PO-99001', color: 'Floral Pink', itemNumber: 'ITM-015-FP-S', size: 'S', qtyOrdered: 150 },
          { styleNo: 'SD-2026-015', buyer: 'Mango', poNo: 'PO-99001', color: 'Floral Pink', itemNumber: 'ITM-015-FP-M', size: 'M', qtyOrdered: 200 },
          { styleNo: 'SD-2026-015', buyer: 'Mango', poNo: 'PO-99001', color: 'Floral Blue', itemNumber: 'ITM-015-FB-S', size: 'S', qtyOrdered: 120 },
        ],
      },
    },
  })

  // ── REQ 6: Approved, NO QC report yet (ready for QC) ──
  const req6 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Basic Crew Neck T-Shirt - Unisex',
      photoUrl: '',
      packingListNotes: 'Bulk order. Standard carton dimensions. No special instructions.',
      status: 'APPROVED_FOR_QC',
      createdById: rep1.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-09T09:00:00Z'),
      variants: {
        create: [
          { styleNo: 'TN-2026-020', buyer: 'H&M', poNo: 'PO-77890', color: 'Black', itemNumber: 'ITM-020-BK-M', size: 'M', qtyOrdered: 300 },
          { styleNo: 'TN-2026-020', buyer: 'H&M', poNo: 'PO-77890', color: 'Black', itemNumber: 'ITM-020-BK-L', size: 'L', qtyOrdered: 250 },
          { styleNo: 'TN-2026-020', buyer: 'H&M', poNo: 'PO-77890', color: 'White', itemNumber: 'ITM-020-WH-M', size: 'M', qtyOrdered: 200 },
          { styleNo: 'TN-2026-020', buyer: 'H&M', poNo: 'PO-77890', color: 'White', itemNumber: 'ITM-020-WH-L', size: 'L', qtyOrdered: 180 },
        ],
      },
    },
  })

  // ── REQ 7: Approved, NO QC report (second one for QC page) ──
  const req7 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Cargo Jogger Pants - Slim Fit',
      photoUrl: '',
      packingListNotes: 'Side pocket zipper needs QC check. Elastic waistband.',
      status: 'APPROVED_FOR_QC',
      createdById: rep2.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-10T08:30:00Z'),
      variants: {
        create: [
          { styleNo: 'CJ-2026-030', buyer: 'Amazon', poNo: 'PO-33445', color: 'Charcoal', itemNumber: 'ITM-030-CH-S', size: 'S', qtyOrdered: 150 },
          { styleNo: 'CJ-2026-030', buyer: 'Amazon', poNo: 'PO-33445', color: 'Charcoal', itemNumber: 'ITM-030-CH-M', size: 'M', qtyOrdered: 200 },
          { styleNo: 'CJ-2026-030', buyer: 'Amazon', poNo: 'PO-33445', color: 'Olive', itemNumber: 'ITM-030-OL-M', size: 'M', qtyOrdered: 180 },
        ],
      },
    },
  })

  // ── REQ 8: Has QC but NO warehouse cost (for Warehouse page) ──
  const req8 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Button-Down Oxford Shirt - Formal',
      photoUrl: '',
      packingListNotes: 'Oxford fabric. Button-down collar. Wrinkle-free treatment applied.',
      status: 'APPROVED_FOR_QC',
      createdById: rep1.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-03T11:00:00Z'),
      variants: {
        create: [
          { styleNo: 'OX-2026-008', buyer: 'Marks & Spencer', poNo: 'PO-66778', color: 'White', itemNumber: 'ITM-008-WH-M', size: 'M', qtyOrdered: 100 },
          { styleNo: 'OX-2026-008', buyer: 'Marks & Spencer', poNo: 'PO-66778', color: 'White', itemNumber: 'ITM-008-WH-L', size: 'L', qtyOrdered: 120 },
          { styleNo: 'OX-2026-008', buyer: 'Marks & Spencer', poNo: 'PO-66778', color: 'Blue', itemNumber: 'ITM-008-BL-M', size: 'M', qtyOrdered: 80 },
        ],
      },
    },
  })

  // ── REQ 9: Has QC + Warehouse but NO packing list (for Catalog) ──
  const req9 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Puffer Vest - Lightweight',
      photoUrl: '',
      packingListNotes: 'Fill weight: 120gsm polyester. Zip-up front. Two side pockets.',
      status: 'APPROVED_FOR_QC',
      createdById: rep2.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-02T16:00:00Z'),
      variants: {
        create: [
          { styleNo: 'PV-2026-012', buyer: 'Uniqlo', poNo: 'PO-44556', color: 'Black', itemNumber: 'ITM-012-BK-F', size: 'F', qtyOrdered: 500 },
          { styleNo: 'PV-2026-012', buyer: 'Uniqlo', poNo: 'PO-44556', color: 'Navy', itemNumber: 'ITM-012-NV-F', size: 'F', qtyOrdered: 400 },
          { styleNo: 'PV-2026-012', buyer: 'Uniqlo', poNo: 'PO-44556', color: 'Beige', itemNumber: 'ITM-012-BG-F', size: 'F', qtyOrdered: 300 },
        ],
      },
    },
  })

  // ── REQ 10: Second packing list (for Packing Lists page) ──
  const req10 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Yoga Leggings - High Waist',
      photoUrl: '',
      packingListNotes: '4-way stretch fabric. gusseted crotch. Hidden pocket at waistband.',
      status: 'APPROVED_FOR_QC',
      createdById: rep1.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-01T10:00:00Z'),
      variants: {
        create: [
          { styleNo: 'YL-2026-018', buyer: 'Lululemon', poNo: 'PO-22334', color: 'Black', itemNumber: 'ITM-018-BK-S', size: 'S', qtyOrdered: 200 },
          { styleNo: 'YL-2026-018', buyer: 'Lululemon', poNo: 'PO-22334', color: 'Black', itemNumber: 'ITM-018-BK-M', size: 'M', qtyOrdered: 250 },
          { styleNo: 'YL-2026-018', buyer: 'Lululemon', poNo: 'PO-22334', color: 'Dark Grey', itemNumber: 'ITM-018-GY-M', size: 'M', qtyOrdered: 180 },
          { styleNo: 'YL-2026-018', buyer: 'Lululemon', poNo: 'PO-22334', color: 'Dark Grey', itemNumber: 'ITM-018-GY-L', size: 'L', qtyOrdered: 150 },
        ],
      },
    },
  })

  // ══════════════════════════════════════════════════════════════
  // QC REPORTS (4 total: 2 with warehouse, 1 without, 1 on req10)
  // ══════════════════════════════════════════════════════════════

  const qc1 = await prisma.qCReport.create({
    data: { reportId: 'QC-2026-001', requestId: req1.id, lunchCostFlag: true, lunchCost: 15.00, goodsCarryingCost: 25.00, travelMode: 'TRAVELLING_WITH_GOODS', extraCost: 0, totalCost: 40.00, createdById: qc.id },
  })

  const qc2 = await prisma.qCReport.create({
    data: { reportId: 'QC-2026-002', requestId: req2.id, lunchCostFlag: false, lunchCost: 0, goodsCarryingCost: 30.00, travelMode: 'TRAVELLING_INDIVIDUALLY', extraCost: 45.00, totalCost: 75.00, createdById: qc.id },
  })

  const qc3 = await prisma.qCReport.create({
    data: { reportId: 'QC-2026-003', requestId: req8.id, lunchCostFlag: true, lunchCost: 12.00, goodsCarryingCost: 20.00, travelMode: 'TRAVELLING_WITH_GOODS', extraCost: 0, totalCost: 32.00, createdById: qc.id },
  })

  const qc4 = await prisma.qCReport.create({
    data: { reportId: 'QC-2026-004', requestId: req9.id, lunchCostFlag: true, lunchCost: 18.00, goodsCarryingCost: 35.00, travelMode: 'TRAVELLING_INDIVIDUALLY', extraCost: 50.00, totalCost: 103.00, createdById: qc.id },
  })

  const qc5 = await prisma.qCReport.create({
    data: { reportId: 'QC-2026-005', requestId: req10.id, lunchCostFlag: false, lunchCost: 0, goodsCarryingCost: 22.00, travelMode: 'TRAVELLING_WITH_GOODS', extraCost: 0, totalCost: 22.00, createdById: qc.id },
  })

  // ══════════════════════════════════════════════════════════════
  // WAREHOUSE COSTS (3 total: for qc1, qc2, qc4)
  // ══════════════════════════════════════════════════════════════

  await prisma.warehouseCost.create({
    data: { qcReportId: qc1.id, loaderCost: 20.00, extraWorkerCost: 10.00, labelsCost: 8.00, htakeCost: 12.00, stickersCost: 5.00, cartonsCost: 35.00, polyBagsCost: 6.00, gamtapeCost: 4.00, totalCost: 100.00, createdById: wh.id },
  })

  await prisma.warehouseCost.create({
    data: { qcReportId: qc2.id, loaderCost: 25.00, extraWorkerCost: 0, labelsCost: 6.00, htakeCost: 9.00, stickersCost: 4.00, cartonsCost: 28.00, polyBagsCost: 5.00, gamtapeCost: 3.50, totalCost: 80.50, createdById: wh.id },
  })

  await prisma.warehouseCost.create({
    data: { qcReportId: qc4.id, loaderCost: 30.00, extraWorkerCost: 15.00, labelsCost: 10.00, htakeCost: 14.00, stickersCost: 7.00, cartonsCost: 45.00, polyBagsCost: 8.00, gamtapeCost: 5.00, totalCost: 134.00, createdById: wh.id },
  })

  // ══════════════════════════════════════════════════════════════
  // PACKING LISTS (3 total: req1, req10, and req9)
  // ══════════════════════════════════════════════════════════════

  await prisma.packingList.create({
    data: {
      requestId: req1.id, orderQty: 750, shipmentQty: 740, shortQty: 10, shortPct: 1.33,
      totalCbm: 4.82, totalNetWeight: 222.00, totalGrossWeight: 259.00,
      frontMark: 'WALMART\nPO-44521\nMEN\'S COTTON POLO\nMADE IN BANGLADESH',
      sideMark: 'PL-2026-001\nCTN NO: 1-50\nG.W: 5.18 KGS\nN.W: 4.44 KGS\nORIGIN: BANGLADESH',
      cartons: {
        create: [
          { cartonNoFrom: 1, cartonNoTo: 10, noOfCartons: 10, color: 'Navy', assortId: 'A', itemNumber: 'ITM-001-NV-S', sizeBreakdown: '12pcs', qtyPerCarton: 12, shipQty: 120, orderQty: 120, shortQty: 0, shortPct: 0, ctnLength: 55, ctnWidth: 38, ctnHeight: 32, netWeight: 3.60, grossWeight: 4.20, ctnCbm: 0.0669 },
          { cartonNoFrom: 11, cartonNoTo: 28, noOfCartons: 18, color: 'Navy', assortId: 'B', itemNumber: 'ITM-001-NV-M', sizeBreakdown: '10M+2L', qtyPerCarton: 12, shipQty: 200, orderQty: 200, shortQty: 0, shortPct: 0, ctnLength: 58, ctnWidth: 40, ctnHeight: 34, netWeight: 4.20, grossWeight: 4.85, ctnCbm: 0.0789 },
          { cartonNoFrom: 29, cartonNoTo: 38, noOfCartons: 10, color: 'White', assortId: 'C', itemNumber: 'ITM-001-WH-S', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 100, orderQty: 100, shortQty: 0, shortPct: 0, ctnLength: 55, ctnWidth: 38, ctnHeight: 30, netWeight: 3.00, grossWeight: 3.50, ctnCbm: 0.0627 },
          { cartonNoFrom: 39, cartonNoTo: 50, noOfCartons: 12, color: 'White', assortId: 'D', itemNumber: 'ITM-001-WH-M', sizeBreakdown: '12pcs', qtyPerCarton: 12, shipQty: 140, orderQty: 150, shortQty: 10, shortPct: 6.67, ctnLength: 58, ctnWidth: 40, ctnHeight: 34, netWeight: 3.72, grossWeight: 4.30, ctnCbm: 0.0789 },
        ],
      },
    },
  })

  await prisma.packingList.create({
    data: {
      requestId: req10.id, orderQty: 780, shipmentQty: 780, shortQty: 0, shortPct: 0,
      totalCbm: 3.45, totalNetWeight: 195.00, totalGrossWeight: 228.00,
      frontMark: 'LULULEMON\nPO-22334\nYOGA LEGGINGS HW\nMADE IN BANGLADESH',
      sideMark: 'YL-2026-018\nCTN NO: 1-78\nG.W: 2.92 KGS\nN.W: 2.50 KGS',
      cartons: {
        create: [
          { cartonNoFrom: 1, cartonNoTo: 20, noOfCartons: 20, color: 'Black', assortId: 'A', itemNumber: 'ITM-018-BK-S', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 200, orderQty: 200, shortQty: 0, shortPct: 0, ctnLength: 42, ctnWidth: 30, ctnHeight: 28, netWeight: 2.20, grossWeight: 2.50, ctnCbm: 0.0353 },
          { cartonNoFrom: 21, cartonNoTo: 45, noOfCartons: 25, color: 'Black', assortId: 'B', itemNumber: 'ITM-018-BK-M', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 250, orderQty: 250, shortQty: 0, shortPct: 0, ctnLength: 44, ctnWidth: 32, ctnHeight: 30, netWeight: 2.40, grossWeight: 2.70, ctnCbm: 0.0422 },
          { cartonNoFrom: 46, cartonNoTo: 63, noOfCartons: 18, color: 'Dark Grey', assortId: 'C', itemNumber: 'ITM-018-GY-M', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 180, orderQty: 180, shortQty: 0, shortPct: 0, ctnLength: 44, ctnWidth: 32, ctnHeight: 30, netWeight: 2.40, grossWeight: 2.70, ctnCbm: 0.0422 },
          { cartonNoFrom: 64, cartonNoTo: 78, noOfCartons: 15, color: 'Dark Grey', assortId: 'D', itemNumber: 'ITM-018-GY-L', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 150, orderQty: 150, shortQty: 0, shortPct: 0, ctnLength: 46, ctnWidth: 34, ctnHeight: 32, netWeight: 2.60, grossWeight: 2.95, ctnCbm: 0.0500 },
        ],
      },
    },
  })

  await prisma.packingList.create({
    data: {
      requestId: req9.id, orderQty: 1200, shipmentQty: 1180, shortQty: 20, shortPct: 1.67,
      totalCbm: 8.64, totalNetWeight: 360.00, totalGrossWeight: 420.00,
      frontMark: 'UNIQLO\nPO-44556\nPUFFER VEST LW\nMADE IN BANGLADESH',
      sideMark: 'PV-2026-012\nCTN NO: 1-120\nG.W: 3.50 KGS\nN.W: 3.00 KGS',
      cartons: {
        create: [
          { cartonNoFrom: 1, cartonNoTo: 50, noOfCartons: 50, color: 'Black', assortId: 'A', itemNumber: 'ITM-012-BK-F', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 500, orderQty: 500, shortQty: 0, shortPct: 0, ctnLength: 50, ctnWidth: 40, ctnHeight: 35, netWeight: 3.00, grossWeight: 3.50, ctnCbm: 0.0700 },
          { cartonNoFrom: 51, cartonNoTo: 90, noOfCartons: 40, color: 'Navy', assortId: 'B', itemNumber: 'ITM-012-NV-F', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 400, orderQty: 400, shortQty: 0, shortPct: 0, ctnLength: 50, ctnWidth: 40, ctnHeight: 35, netWeight: 3.00, grossWeight: 3.50, ctnCbm: 0.0700 },
          { cartonNoFrom: 91, cartonNoTo: 120, noOfCartons: 30, color: 'Beige', assortId: 'C', itemNumber: 'ITM-012-BG-F', sizeBreakdown: '10pcs', qtyPerCarton: 10, shipQty: 280, orderQty: 300, shortQty: 20, shortPct: 6.67, ctnLength: 50, ctnWidth: 40, ctnHeight: 35, netWeight: 3.00, grossWeight: 3.50, ctnCbm: 0.0700 },
        ],
      },
    },
  })

  // ══════════════════════════════════════════════════════════════
  // EXCHANGE RATES (4 total)
  // ══════════════════════════════════════════════════════════════

  const rate1 = await prisma.exchangeRate.create({ data: { sourceCurrency: 'USD', targetCurrency: 'BDT', rate: 121.50, effectiveDate: new Date('2026-08-01'), publishedById: admin.id } })
  const rate2 = await prisma.exchangeRate.create({ data: { sourceCurrency: 'USD', targetCurrency: 'EUR', rate: 0.92, effectiveDate: new Date('2026-08-01'), publishedById: admin.id } })
  const rate3 = await prisma.exchangeRate.create({ data: { sourceCurrency: 'USD', targetCurrency: 'GBP', rate: 0.79, effectiveDate: new Date('2026-08-05'), publishedById: admin.id } })
  const rate4 = await prisma.exchangeRate.create({ data: { sourceCurrency: 'EUR', targetCurrency: 'BDT', rate: 132.07, effectiveDate: new Date('2026-08-05'), publishedById: admin.id } })

  // ══════════════════════════════════════════════════════════════
  // INVOICES (5 total: issued, pending, rejected, void + another issued)
  // ══════════════════════════════════════════════════════════════

  // INV 1: Issued, with partial payment (Walmart - Polo Shirt)
  await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2026-001', buyerName: 'Walmart', status: 'ISSUED',
      exchangeRateId: rate1.id, exchangeRateValue: 121.50, targetCurrency: 'BDT',
      commissionType: 'PERCENTAGE', commissionValue: 5.0,
      totalValue: 18500.00, convertedTotal: 2247750.00, outstandingBalance: 9250.00,
      createdById: rep1.id, approvedById: admin.id, approvedAt: new Date('2026-08-07T16:00:00Z'),
      lineItems: {
        create: [
          { requestId: req1.id, description: "Men's Cotton Polo Shirt - Navy", brand: 'VALUEWEAR', ctn: 28, qtyPerCtn: 12, totalQty: 320, unitPrice: 8.50, amount: 2720.00, netWeight: 138.60, grossWeight: 160.20, cbm: 2.53, material: '100% Cotton Pique', styleItemCode: 'PL-2026-001 NV', remarks: '' },
          { requestId: req1.id, description: "Men's Cotton Polo Shirt - White", brand: 'VALUEWEAR', ctn: 22, qtyPerCtn: 11, totalQty: 240, unitPrice: 8.50, amount: 2040.00, netWeight: 100.80, grossWeight: 117.00, cbm: 1.84, material: '100% Cotton Pique', styleItemCode: 'PL-2026-001 WH', remarks: 'Short 10 units' },
        ],
      },
      payments: {
        create: [
          { amount: 9250.00, currency: 'USD', paymentDate: new Date('2026-08-08'), bankReference: 'TXN-WM-44521-001', recordedById: admin.id },
        ],
      },
    },
  })

  // INV 2: Pending approval (Target - Denim Jacket)
  await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2026-002', buyerName: 'Target', status: 'PENDING_APPROVAL',
      totalValue: 12600.00, outstandingBalance: 12600.00,
      createdById: rep2.id,
      lineItems: {
        create: [
          { requestId: req2.id, description: "Women's Denim Jacket - Indigo", brand: 'DENIMCO', ctn: 15, qtyPerCtn: 12, totalQty: 180, unitPrice: 18.00, amount: 3240.00, netWeight: 90.00, grossWeight: 108.00, cbm: 2.16, material: '12oz Indigo Denim', styleItemCode: 'DJ-2026-010 IN', remarks: '' },
          { requestId: req2.id, description: "Women's Denim Jacket - Black", brand: 'DENIMCO', ctn: 5, qtyPerCtn: 12, totalQty: 60, unitPrice: 18.00, amount: 1080.00, netWeight: 30.00, grossWeight: 36.00, cbm: 0.72, material: '12oz Black Denim', styleItemCode: 'DJ-2026-010 BK', remarks: '' },
        ],
      },
    },
  })

  // INV 3: Rejected
  await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2026-003', buyerName: 'H&M', status: 'REJECTED',
      rejectionReason: 'Unit price does not match PO-77890 agreed price. Please correct and resubmit.',
      totalValue: 8900.00, outstandingBalance: 8900.00,
      createdById: rep1.id, approvedById: admin.id,
      lineItems: {
        create: [
          { requestId: req6.id, description: 'Basic Crew Neck T-Shirt - Black', brand: 'BASICWEAR', ctn: 30, qtyPerCtn: 10, totalQty: 300, unitPrice: 6.00, amount: 1800.00, netWeight: 75.00, grossWeight: 90.00, cbm: 1.80, material: '100% Cotton Jersey', styleItemCode: 'TN-2026-020 BK', remarks: '' },
          { requestId: req6.id, description: 'Basic Crew Neck T-Shirt - White', brand: 'BASICWEAR', ctn: 20, qtyPerCtn: 10, totalQty: 200, unitPrice: 6.00, amount: 1200.00, netWeight: 50.00, grossWeight: 60.00, cbm: 1.20, material: '100% Cotton Jersey', styleItemCode: 'TN-2026-020 WH', remarks: '' },
        ],
      },
    },
  })

  // INV 4: Void
  await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2026-004', buyerName: 'Zara Kids', status: 'VOID',
      rejectionReason: 'Duplicate invoice. Superseded by INV-2026-006.',
      totalValue: 5200.00, outstandingBalance: 0,
      createdById: rep1.id,
      lineItems: {
        create: [
          { description: 'Kids Fleece Hoodie - Sky Blue', brand: 'KIDSWEAR', ctn: 20, qtyPerCtn: 10, totalQty: 200, unitPrice: 13.00, amount: 2600.00, netWeight: 80.00, grossWeight: 100.00, cbm: 2.40, material: 'Polyester Fleece 280gsm', styleItemCode: 'FH-2026-005 SB', remarks: 'VOIDED' },
          { description: 'Kids Fleece Hoodie - Pink', brand: 'KIDSWEAR', ctn: 15, qtyPerCtn: 10, totalQty: 150, unitPrice: 13.00, amount: 1950.00, netWeight: 60.00, grossWeight: 75.00, cbm: 1.80, material: 'Polyester Fleece 280gsm', styleItemCode: 'FH-2026-005 PK', remarks: 'VOIDED' },
        ],
      },
    },
  })

  // INV 5: Issued, fully paid (Lululemon - Yoga Leggings)
  await prisma.invoice.create({
    data: {
      invoiceNo: 'INV-2026-005', buyerName: 'Lululemon', status: 'ISSUED',
      exchangeRateId: rate2.id, exchangeRateValue: 0.92, targetCurrency: 'EUR',
      commissionType: 'FIXED', commissionValue: 500.00,
      totalValue: 31200.00, convertedTotal: 28704.00, outstandingBalance: 0,
      createdById: rep1.id, approvedById: admin.id, approvedAt: new Date('2026-08-09T14:00:00Z'),
      lineItems: {
        create: [
          { requestId: req10.id, description: 'Yoga Leggings - Black S', brand: 'FLEXFIT', ctn: 20, qtyPerCtn: 10, totalQty: 200, unitPrice: 22.00, amount: 4400.00, netWeight: 44.00, grossWeight: 50.00, cbm: 0.71, material: 'Nylon-Spandex Blend', styleItemCode: 'YL-2026-018 BK-S', remarks: '' },
          { requestId: req10.id, description: 'Yoga Leggings - Black M', brand: 'FLEXFIT', ctn: 25, qtyPerCtn: 10, totalQty: 250, unitPrice: 22.00, amount: 5500.00, netWeight: 60.00, grossWeight: 67.50, cbm: 1.06, material: 'Nylon-Spandex Blend', styleItemCode: 'YL-2026-018 BK-M', remarks: '' },
          { requestId: req10.id, description: 'Yoga Leggings - Dark Grey M', brand: 'FLEXFIT', ctn: 18, qtyPerCtn: 10, totalQty: 180, unitPrice: 22.00, amount: 3960.00, netWeight: 43.20, grossWeight: 48.60, cbm: 0.76, material: 'Nylon-Spandex Blend', styleItemCode: 'YL-2026-018 GY-M', remarks: '' },
          { requestId: req10.id, description: 'Yoga Leggings - Dark Grey L', brand: 'FLEXFIT', ctn: 15, qtyPerCtn: 10, totalQty: 150, unitPrice: 22.00, amount: 3300.00, netWeight: 39.00, grossWeight: 44.25, cbm: 0.75, material: 'Nylon-Spandex Blend', styleItemCode: 'YL-2026-018 GY-L', remarks: '' },
        ],
      },
      payments: {
        create: [
          { amount: 15600.00, currency: 'USD', paymentDate: new Date('2026-08-10'), bankReference: 'TXN-LL-22334-001', recordedById: admin.id },
          { amount: 15600.00, currency: 'USD', paymentDate: new Date('2026-08-12'), bankReference: 'TXN-LL-22334-002', recordedById: admin.id },
        ],
      },
    },
  })

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log('╔═══════════════════════════════════════════════════════╗')
  console.log('║          COMPREHENSIVE SEED COMPLETED               ║')
  console.log('╠═══════════════════════════════════════════════════════╣')
  console.log('║  Users:              5                              ║')
  console.log('║  Sourcing Requests:  10                             ║')
  console.log('║    - Pending:         2  (Kids Hoodie, Summer Dress)')
  console.log('║    - Rejected:        1  (Chino Pants)              ║')
  console.log('║    - Approved (no QC): 2 (T-Shirt, Cargo Jogger)   ║')
  console.log('║    - Has QC (no WH):  1  (Oxford Shirt)            ║')
  console.log('║    - Has QC + WH:     2  (Polo Shirt, Denim Jacket)')
  console.log('║    - Packed:          3  (Polo, Leggings, Vest)    ║')
  console.log('║  QC Reports:         5                              ║')
  console.log('║  Warehouse Costs:    3                              ║')
  console.log('║  Packing Lists:      3  (14 carton rows total)    ║')
  console.log('║  Invoices:           5                              ║')
  console.log('║    - Issued:          2  (Walmart, Lululemon)       ║')
  console.log('║    - Pending:         1  (Target)                   ║')
  console.log('║    - Rejected:        1  (H&M)                      ║')
  console.log('║    - Void:            1  (Zara Kids)                ║')
  console.log('║  Payments:           3  (across 2 invoices)        ║')
  console.log('║  Exchange Rates:     4  (USD/BDT, USD/EUR, USD/GBP, EUR/BDT)')
  console.log('╚═══════════════════════════════════════════════════════╝')
}

seed().catch(console.error).finally(() => prisma.$disconnect())
