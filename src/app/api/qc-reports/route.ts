import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const requestId = searchParams.get('requestId')
  const where: Record<string, unknown> = {}
  if (requestId) where.requestId = requestId

  const reports = await db.qCReport.findMany({
    where,
    include: {
      request: { include: { variants: true, sisterProfile: { select: { id: true, name: true } } } },
      createdBy: { select: { id: true, name: true } },
      warehouseCost: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(reports)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { requestId, lunchCostFlag, lunchCost, goodsCarryingCost, travelMode, extraCost, createdById } = body
  if (!requestId || !createdById) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const existing = await db.qCReport.findUnique({ where: { requestId } })
  if (existing) return NextResponse.json({ error: 'QC report already exists for this request' }, { status: 409 })

  const totalCost = (lunchCostFlag ? lunchCost || 0 : 0) + (goodsCarryingCost || 0) + (travelMode === 'TRAVELLING_INDIVIDUALLY' ? extraCost || 0 : 0)
  const reportCount = await db.qCReport.count()
  const reportId = `QC-2026-${String(reportCount + 1).padStart(3, '0')}`

  // Get the sourcing request to find sisterProfileId
  const sourcingRequest = await db.sourcingRequest.findUnique({ where: { id: requestId } })

  const report = await db.qCReport.create({
    data: { reportId, requestId, lunchCostFlag, lunchCost: lunchCostFlag ? lunchCost || 0 : 0, goodsCarryingCost: goodsCarryingCost || 0, travelMode: travelMode || 'TRAVELLING_WITH_GOODS', extraCost: travelMode === 'TRAVELLING_INDIVIDUALLY' ? extraCost || 0 : 0, totalCost, createdById },
    include: { request: true, createdBy: { select: { id: true, name: true } } },
  })

  // Create Expense rows if sisterProfileId exists on the sourcing request
  if (sourcingRequest?.sisterProfileId) {
    const expenseData: { sisterProfileId: string; productId: string; sourceType: string; amount: number; currency: string; remarks: string; createdById: string }[] = []
    if (lunchCostFlag && lunchCost) {
      expenseData.push({
        sisterProfileId: sourcingRequest.sisterProfileId,
        productId: requestId,
        sourceType: 'qc_lunch',
        amount: lunchCost,
        currency: 'BDT',
        remarks: `QC lunch cost for ${sourcingRequest.productName}`,
        createdById,
      })
    }
    if (goodsCarryingCost) {
      expenseData.push({
        sisterProfileId: sourcingRequest.sisterProfileId,
        productId: requestId,
        sourceType: 'qc_carrying',
        amount: goodsCarryingCost,
        currency: 'BDT',
        remarks: `Goods carrying cost for ${sourcingRequest.productName}`,
        createdById,
      })
    }
    if (travelMode === 'TRAVELLING_INDIVIDUALLY' && extraCost) {
      expenseData.push({
        sisterProfileId: sourcingRequest.sisterProfileId,
        productId: requestId,
        sourceType: 'qc_travel_extra',
        amount: extraCost,
        currency: 'BDT',
        remarks: `Individual travel extra cost for ${sourcingRequest.productName}`,
        createdById,
      })
    }
    if (expenseData.length > 0) {
      await db.expense.createMany({ data: expenseData })
    }
  }

  return NextResponse.json(report, { status: 201 })
}