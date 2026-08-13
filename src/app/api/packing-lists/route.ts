import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const requestId = searchParams.get('requestId')
  const where: Record<string, unknown> = {}
  if (requestId) where.requestId = requestId

  const lists = await db.packingList.findMany({
    where,
    include: { request: true, cartons: { orderBy: { cartonNoFrom: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(lists)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { requestId, orderQty, shipmentQty, frontMark, sideMark, cartons } = body
  if (!requestId) return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })

  // Enforce: one packing list per request
  const existing = await db.packingList.findFirst({ where: { requestId } })
  if (existing) {
    return NextResponse.json({ error: 'This product already has a packing list. Each product can only have one packing list.' }, { status: 409 })
  }

  // Verify request exists
  const reqExists = await db.sourcingRequest.findUnique({ where: { id: requestId } })
  if (!reqExists) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const shortQty = orderQty - shipmentQty
  const shortPct = orderQty > 0 ? (shortQty / orderQty) * 100 : 0

  const list = await db.packingList.create({
    data: {
      requestId, orderQty, shipmentQty, shortQty, shortPct,
      totalCbm: 0, totalNetWeight: 0, totalGrossWeight: 0,
      frontMark: frontMark || '', sideMark: sideMark || '',
      cartons: {
        create: (cartons || []).map((c: Record<string, unknown>) => ({
          cartonNoFrom: c.cartonNoFrom || 0, cartonNoTo: c.cartonNoTo || 0,
          noOfCartons: c.noOfCartons || 0, color: c.color || '',
          assortId: c.assortId || '', itemNumber: c.itemNumber || '',
          sizeBreakdown: c.sizeBreakdown || '', qtyPerCarton: c.qtyPerCarton || 0,
          shipQty: c.shipQty || 0, orderQty: c.orderQty || 0,
          shortQty: c.shortQty || 0, shortPct: c.shortPct || 0,
          ctnLength: c.ctnLength || 0, ctnWidth: c.ctnWidth || 0, ctnHeight: c.ctnHeight || 0,
          netWeight: c.netWeight || 0, grossWeight: c.grossWeight || 0,
          ctnCbm: c.ctnCbm || 0,
        })),
      },
    },
    include: { request: true, cartons: true },
  })

  // Update totals
  const totals = list.cartons.reduce(
    (acc, c) => ({
      totalCbm: acc.totalCbm + c.ctnCbm * c.noOfCartons,
      totalNetWeight: acc.totalNetWeight + c.netWeight * c.noOfCartons,
      totalGrossWeight: acc.totalGrossWeight + c.grossWeight * c.noOfCartons,
    }),
    { totalCbm: 0, totalNetWeight: 0, totalGrossWeight: 0 }
  )
  const updated = await db.packingList.update({
    where: { id: list.id },
    data: { totalCbm: Math.round(totals.totalCbm * 100) / 100, totalNetWeight: Math.round(totals.totalNetWeight * 100) / 100, totalGrossWeight: Math.round(totals.totalGrossWeight * 100) / 100 },
    include: { request: true, cartons: true },
  })
  return NextResponse.json(updated, { status: 201 })
}