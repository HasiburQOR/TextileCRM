import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sisterProfileId = searchParams.get('sisterProfileId')
  const productId = searchParams.get('productId')
  const sourceType = searchParams.get('sourceType')

  const where: Record<string, unknown> = {}
  if (sisterProfileId) where.sisterProfileId = sisterProfileId
  if (productId) where.productId = productId
  if (sourceType) where.sourceType = sourceType

  const expenses = await db.expense.findMany({
    where,
    include: {
      sisterProfile: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(expenses)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sisterProfileId, productId, sourceType, amount, currency, remarks, fieldName, createdById } = body

  if (!sisterProfileId || !sourceType || amount === undefined || !createdById) {
    return NextResponse.json({ error: 'sisterProfileId, sourceType, amount, and createdById are required' }, { status: 400 })
  }

  const validSourceTypes = ['sourcing_advance', 'qc_lunch', 'qc_carrying', 'qc_travel_extra', 'warehouse_loader', 'warehouse_extra_worker', 'warehouse_packaging_item', 'custom_field', 'extra_cost']
  if (!validSourceTypes.includes(sourceType)) {
    return NextResponse.json({ error: `Invalid sourceType. Must be one of: ${validSourceTypes.join(', ')}` }, { status: 400 })
  }

  const expense = await db.expense.create({
    data: {
      sisterProfileId,
      productId: productId || null,
      sourceType,
      amount: amount || 0,
      currency: currency || 'BDT',
      remarks: remarks || '',
      fieldName: fieldName || null,
      createdById,
    },
    include: {
      sisterProfile: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  })

  // Create AuditLog entry
  await db.auditLog.create({
    data: {
      actorId: createdById,
      action: 'CREATE_EXPENSE',
      entityType: 'Expense',
      entityId: expense.id,
      beforeSnapshot: '{}',
      afterSnapshot: JSON.stringify(expense),
    },
  })

  return NextResponse.json(expense, { status: 201 })
}
