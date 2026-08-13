import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding initial data...')

  // Create users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: { email: 'admin@company.com', name: 'Admin User', role: 'ADMIN' },
  })
  const rep1 = await prisma.user.upsert({
    where: { email: 'rep1@company.com' },
    update: {},
    create: { email: 'rep1@company.com', name: 'Rahim Uddin', role: 'COMPANY_REP' },
  })
  const rep2 = await prisma.user.upsert({
    where: { email: 'rep2@company.com' },
    update: {},
    create: { email: 'rep2@company.com', name: 'Karim Hossain', role: 'COMPANY_REP' },
  })

  console.log('✅ Users created:', admin.id, rep1.id, rep2.id)

  // Create buyer profiles
  const buyer1 = await prisma.buyerProfile.create({
    data: {
      name: 'ZARA Trading Co.',
      contactInfo: 'zara@example.com, +880-1711-000001',
      branding: 'Premium fashion buyer, Spain',
      portalUsername: 'zara_trading',
      portalPasswordHash: 'prototype_hash_zara',
    },
  })

  const buyer2 = await prisma.buyerProfile.create({
    data: {
      name: 'H&M Sourcing Asia',
      contactInfo: 'hm.sourcing@example.com, +880-1711-000002',
      branding: 'Mass-market apparel, Sweden',
      portalUsername: 'hm_sourcing',
      portalPasswordHash: 'prototype_hash_hm',
    },
  })

  console.log('✅ Buyer profiles created:', buyer1.id, buyer2.id)

  // Create sister profiles
  const sister1 = await prisma.sisterProfile.create({
    data: {
      buyerProfileId: buyer1.id,
      name: 'Zara Dhaka Office',
      poReference: 'ZRA-PO-2026-001',
      agreementType: 'TYPE_1',
      negotiatedRate: 5, // 5% of total purchase value
      terms: 'Buyer pays 5% commission on total purchase value. All sourcing costs covered by sister concern.',
      status: 'ACTIVE',
    },
  })

  const sister2 = await prisma.sisterProfile.create({
    data: {
      buyerProfileId: buyer1.id,
      name: 'Zara Chittagong Branch',
      poReference: 'ZRA-PO-2026-002',
      agreementType: 'TYPE_2',
      negotiatedRate: 2.5, // 2.5 BDT per unit
      terms: 'Fixed rate of 2.5 BDT per unit sourced. All expenses reimbursed on top.',
      status: 'ACTIVE',
    },
  })

  const sister3 = await prisma.sisterProfile.create({
    data: {
      buyerProfileId: buyer2.id,
      name: 'H&M Bangladesh Ltd',
      poReference: 'HM-PO-2026-001',
      agreementType: 'TYPE_3',
      negotiatedRate: 3, // 3% commission on top
      terms: 'Reimburse actual expenses plus 3% commission on total expense amount.',
      status: 'ACTIVE',
    },
  })

  console.log('✅ Sister profiles created:', sister1.id, sister2.id, sister3.id)

  // Create sample sourcing requests linked to sister profiles
  const req1 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Cotton T-Shirt - Basic Round Neck',
      photoUrl: '',
      status: 'APPROVED_FOR_QC',
      createdById: rep1.id,
      sisterProfileId: sister1.id,
      brandName: 'ZARA',
      styleNumber: 'STY-SEED-ZRA-001',
      imageUrls: '[]',
      variants: {
        create: [
          { styleNo: 'STY-001-WHT', buyer: 'ZARA', poNo: 'ZRA-PO-2026-001', color: 'White', size: 'M', qtyOrdered: 5000 },
          { styleNo: 'STY-001-BLK', buyer: 'ZARA', poNo: 'ZRA-PO-2026-001', color: 'Black', size: 'L', qtyOrdered: 3000 },
        ],
      },
    },
  })

  const req2 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Denim Jeans - Slim Fit',
      photoUrl: '',
      status: 'APPROVED_FOR_QC',
      createdById: rep2.id,
      sisterProfileId: sister2.id,
      brandName: 'H&M',
      styleNumber: 'STY-SEED-HM-001',
      imageUrls: '[]',
      variants: {
        create: [
          { styleNo: 'STY-002-IND', buyer: 'H&M', poNo: 'HM-PO-2026-001', color: 'Indigo', size: '32', qtyOrdered: 2000 },
        ],
      },
    },
  })

  const req3 = await prisma.sourcingRequest.create({
    data: {
      productName: 'Polo Shirt - Classic Fit',
      photoUrl: '',
      status: 'PENDING_ADMIN_APPROVAL',
      createdById: rep1.id,
      sisterProfileId: sister3.id,
      brandName: 'H&M',
      styleNumber: 'STY-SEED-HM-002',
      imageUrls: '[]',
      variants: {
        create: [
          { styleNo: 'STY-003-NVY', buyer: 'H&M', poNo: 'HM-PO-2026-001', color: 'Navy', size: 'M', qtyOrdered: 4000 },
        ],
      },
    },
  })

  console.log('✅ Sourcing requests created:', req1.id, req2.id, req3.id)

  // Create a QC report for req1
  const qcReport = await prisma.qCReport.create({
    data: {
      reportId: 'QC-2026-001',
      requestId: req1.id,
      lunchCostFlag: true,
      lunchCost: 500,
      goodsCarryingCost: 300,
      travelMode: 'TRAVELLING_WITH_GOODS',
      extraCost: 0,
      totalCost: 800,
      createdById: rep1.id,
    },
  })

  // Create expenses for sister1 (QC costs)
  await prisma.expense.createMany({
    data: [
      { sisterProfileId: sister1.id, productId: req1.id, sourceType: 'qc_lunch', amount: 500, currency: 'BDT', remarks: 'QC lunch for T-Shirt order', createdById: rep1.id },
      { sisterProfileId: sister1.id, productId: req1.id, sourceType: 'qc_carrying', amount: 300, currency: 'BDT', remarks: 'Goods carrying cost for T-Shirt order', createdById: rep1.id },
    ],
  })

  // Create a sourcing trip for req1
  const trip = await prisma.sourcingTrip.create({
    data: {
      requestId: req1.id,
      status: 'OPEN',
      totalAdvance: 0,
      locations: {
        create: [
          { locationName: 'Gazipur Factory Zone', quantity: 8000, advanceAmount: 5000, status: 'PENDING', date: new Date('2026-01-15') },
          { locationName: 'Narayanganj Textile Market', quantity: 0, advanceAmount: 2000, status: 'REPORTED', date: new Date('2026-01-16') },
        ],
      },
    },
  })

  console.log('✅ QC report, expenses, and trip created')

  // Create warehouse costs
  const whCost = await prisma.warehouseCost.create({
    data: {
      qcReportId: qcReport.id,
      loaderCost: 400,
      extraWorkerCost: 200,
      labelsCost: 150,
      htakeCost: 80,
      stickersCost: 50,
      cartonsCost: 600,
      polyBagsCost: 100,
      gamtapeCost: 30,
      totalCost: 1610,
      customCosts: '[]',
      createdById: rep1.id,
    },
  })

  // Create warehouse expenses for sister1
  await prisma.expense.createMany({
    data: [
      { sisterProfileId: sister1.id, productId: req1.id, sourceType: 'warehouse_loader', amount: 400, currency: 'BDT', remarks: 'Loader cost for T-Shirt order', createdById: rep1.id },
      { sisterProfileId: sister1.id, productId: req1.id, sourceType: 'warehouse_extra_worker', amount: 200, currency: 'BDT', remarks: 'Extra worker cost for T-Shirt order', createdById: rep1.id },
      { sisterProfileId: sister1.id, productId: req1.id, sourceType: 'warehouse_packaging_item', amount: 150, currency: 'BDT', remarks: 'Labels cost for T-Shirt order', fieldName: 'labelsCost', createdById: rep1.id },
      { sisterProfileId: sister1.id, productId: req1.id, sourceType: 'warehouse_packaging_item', amount: 600, currency: 'BDT', remarks: 'Cartons cost for T-Shirt order', fieldName: 'cartonsCost', createdById: rep1.id },
    ],
  })

  console.log('✅ Warehouse costs and expenses created')

  // Create audit log entries
  await prisma.auditLog.createMany({
    data: [
      { actorId: admin.id, action: 'CREATE_BUYER', entityType: 'BuyerProfile', entityId: buyer1.id, afterSnapshot: JSON.stringify({ name: buyer1.name }), timestamp: new Date('2026-01-01T09:00:00Z') },
      { actorId: rep1.id, action: 'CREATE_REQUEST', entityType: 'SourcingRequest', entityId: req1.id, afterSnapshot: JSON.stringify({ productName: req1.productName }), timestamp: new Date('2026-01-10T10:00:00Z') },
      { actorId: rep1.id, action: 'CREATE_QC_REPORT', entityType: 'QCReport', entityId: qcReport.id, afterSnapshot: JSON.stringify({ reportId: qcReport.reportId }), timestamp: new Date('2026-01-12T14:00:00Z') },
    ],
  })

  // Create notifications
  await prisma.notification.createMany({
    data: [
      { userId: admin.id, title: 'New Sourcing Request', message: 'A new sourcing request for Cotton T-Shirt has been submitted by Rahim Uddin.', type: 'NEW_REQUEST', createdAt: new Date('2026-01-10T10:00:00Z') },
      { userId: rep1.id, sisterProfileId: sister1.id, title: 'QC Report Completed', message: 'QC report QC-2026-001 for Cotton T-Shirt order has been completed.', type: 'QC_COMPLETE', createdAt: new Date('2026-01-12T14:00:00Z') },
      { userId: admin.id, title: 'Settlement Alert', message: 'Zara Dhaka Office has a net negative balance. Review settlement details.', type: 'SETTLEMENT_ALERT', createdAt: new Date('2026-01-13T09:00:00Z') },
    ],
  })

  console.log('✅ Audit logs and notifications created')
  console.log('\n🌱 Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
