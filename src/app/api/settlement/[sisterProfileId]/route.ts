import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ sisterProfileId: string }> }) {
  const { sisterProfileId } = await params

  const profile = await db.sisterProfile.findUnique({
    where: { id: sisterProfileId },
  })
  if (!profile) return NextResponse.json({ error: 'Sister profile not found' }, { status: 404 })

  // Calculate total advance from sourcing trips
  const trips = await db.sourcingTrip.findMany({
    where: { request: { sisterProfileId } },
    include: { locations: true },
  })
  const totalAdvance = trips.reduce((sum, trip) => sum + trip.totalAdvance, 0)

  // Calculate total expense
  const expenseAgg = await db.expense.aggregate({
    _sum: { amount: true },
    where: { sisterProfileId },
  })
  const totalExpense = expenseAgg._sum.amount || 0

  // Calculate total quantity from variants for TYPE_2
  const variantQtyAgg = await db.sourcingVariant.aggregate({
    _sum: { qtyOrdered: true },
    where: { request: { sisterProfileId } },
  })
  const totalQuantity = variantQtyAgg._sum.qtyOrdered || 0

  // Calculate amountOwed based on agreement type
  let amountOwed = 0
  switch (profile.agreementType) {
    case 'TYPE_1':
      // Buyer pays % of total purchase value
      amountOwed = totalExpense * (profile.negotiatedRate / 100)
      break
    case 'TYPE_2':
      // Fixed rate per unit
      amountOwed = profile.negotiatedRate * totalQuantity
      break
    case 'TYPE_3':
      // Reimburse actual + commission on top
      amountOwed = totalExpense + (totalExpense * profile.negotiatedRate / 100)
      break
  }

  const netPosition = totalAdvance - amountOwed

  return NextResponse.json({
    sisterProfileId,
    sisterProfileName: profile.name,
    agreementType: profile.agreementType,
    negotiatedRate: profile.negotiatedRate,
    totalAdvance: Math.round(totalAdvance * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    amountOwed: Math.round(amountOwed * 100) / 100,
    netPosition: Math.round(netPosition * 100) / 100,
    negativeBalance: netPosition < 0,
  })
}