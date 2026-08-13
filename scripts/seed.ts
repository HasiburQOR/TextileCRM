import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function seed() {
  const rep1 = await prisma.user.upsert({
    where: { email: 'rahim@company.com' },
    update: {},
    create: { email: 'rahim@company.com', name: 'Rahim Uddin', role: 'COMPANY_REP' },
  })

  const rep2 = await prisma.user.upsert({
    where: { email: 'karim@company.com' },
    update: {},
    create: { email: 'karim@company.com', name: 'Karim Hossain', role: 'COMPANY_REP' },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'hasib@company.com' },
    update: {},
    create: { email: 'hasib@company.com', name: 'Hasib (Admin)', role: 'ADMIN' },
  })

  await prisma.sourcingRequest.create({
    data: {
      productName: 'Men\'s Cotton Polo Shirt - Summer 2026',
      photoUrl: '',
      packingListNotes: 'Factory provided packing list needs verification',
      status: 'PENDING_ADMIN_APPROVAL',
      createdById: rep1.id,
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

  await prisma.sourcingRequest.create({
    data: {
      productName: 'Women\'s Denim Jacket - Classic Fit',
      photoUrl: '',
      packingListNotes: 'Need to confirm fabric weight before QC',
      status: 'PENDING_ADMIN_APPROVAL',
      createdById: rep2.id,
      variants: {
        create: [
          { styleNo: 'DJ-2026-010', buyer: 'Target', poNo: 'PO-88234', color: 'Indigo', itemNumber: 'ITM-010-IN-M', size: 'M', qtyOrdered: 80 },
          { styleNo: 'DJ-2026-010', buyer: 'Target', poNo: 'PO-88234', color: 'Indigo', itemNumber: 'ITM-010-IN-L', size: 'L', qtyOrdered: 100 },
          { styleNo: 'DJ-2026-010', buyer: 'Target', poNo: 'PO-88234', color: 'Black', itemNumber: 'ITM-010-BK-S', size: 'S', qtyOrdered: 60 },
        ],
      },
    },
  })

  await prisma.sourcingRequest.create({
    data: {
      productName: 'Kids Fleece Hoodie - Rainbow Collection',
      photoUrl: '',
      packingListNotes: 'Approved - proceed to QC',
      status: 'APPROVED_FOR_QC',
      createdById: rep1.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-08T14:30:00Z'),
      variants: {
        create: [
          { styleNo: 'FH-2026-005', buyer: 'Zara Kids', poNo: 'PO-11223', color: 'Sky Blue', itemNumber: 'ITM-005-SB-4', size: '4Y', qtyOrdered: 200 },
          { styleNo: 'FH-2026-005', buyer: 'Zara Kids', poNo: 'PO-11223', color: 'Sky Blue', itemNumber: 'ITM-005-SB-6', size: '6Y', qtyOrdered: 200 },
          { styleNo: 'FH-2026-005', buyer: 'Zara Kids', poNo: 'PO-11223', color: 'Pink', itemNumber: 'ITM-005-PK-4', size: '4Y', qtyOrdered: 150 },
        ],
      },
    },
  })

  await prisma.sourcingRequest.create({
    data: {
      productName: 'Men\'s Chino Pants - Relaxed Fit',
      photoUrl: '',
      packingListNotes: 'Rejected - incomplete variant data',
      status: 'REJECTED',
      rejectionReason: 'Missing size-wise quantities for 2 colors. Please resubmit with complete variant breakdown.',
      createdById: rep2.id,
      reviewedById: admin.id,
      reviewedAt: new Date('2026-08-07T11:00:00Z'),
      variants: {
        create: [
          { styleNo: 'CP-2026-003', buyer: 'H&M', poNo: 'PO-55678', color: 'Khaki', itemNumber: 'ITM-003-KH-M', size: 'M', qtyOrdered: 90 },
        ],
      },
    },
  })

  console.log('Seed completed!')
}

seed().catch(console.error).finally(() => prisma.$disconnect())
