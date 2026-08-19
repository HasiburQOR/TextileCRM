import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { qcReportId, loaderCost, extraWorkerCost, labelsCost, htakeCost, stickersCost, cartonsCost, polyBagsCost, gamtapeCost, customCosts, createdById } = body
  if (!qcReportId || !createdById) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const existing = await db.warehouseCost.findUnique({ where: { qcReportId } })
  if (existing) return NextResponse.json({ error: 'Warehouse cost already exists' }, { status: 409 })

  const totalCost = (loaderCost||0) + (extraWorkerCost||0) + (labelsCost||0) + (htakeCost||0) + (stickersCost||0) + (cartonsCost||0) + (polyBagsCost||0) + (gamtapeCost||0)

  // Parse custom costs and add to total
  let parsedCustomCosts: { amount?: number; currency?: string; remarks?: string; fieldName?: string; name?: string }[] = []
  if (customCosts && Array.isArray(customCosts)) {
    parsedCustomCosts = customCosts
  } else if (typeof customCosts === 'string') {
    try { parsedCustomCosts = JSON.parse(customCosts) } catch { parsedCustomCosts = [] }
  }
  const customTotal = parsedCustomCosts.reduce((s: number, c: { amount?: number }) => s + (c.amount || 0), 0)
  const grandTotal = totalCost + customTotal

  const cost = await db.warehouseCost.create({
    data: { qcReportId, loaderCost: loaderCost||0, extraWorkerCost: extraWorkerCost||0, labelsCost: labelsCost||0, htakeCost: htakeCost||0, stickersCost: stickersCost||0, cartonsCost: cartonsCost||0, polyBagsCost: polyBagsCost||0, gamtapeCost: gamtapeCost||0, totalCost: grandTotal, customCosts: JSON.stringify(parsedCustomCosts), createdById },
    include: { qcReport: { include: { request: { include: { variants: true, sisterProfile: { select: { id: true, name: true } } } } } }, createdBy: { select: { id: true, name: true } } },
  })

  // Create Expense rows if sisterProfileId exists
  const sisterProfileId = cost.qcReport.request.sisterProfileId
  const productName = cost.qcReport.request.productName
  const requestId = cost.qcReport.requestId

  if (sisterProfileId) {
    const expenseData: { sisterProfileId: string; productId: string; sourceType: string; amount: number; currency: string; remarks: string; fieldName?: string | null; createdById: string }[] = []

    if (loaderCost) {
      expenseData.push({
        sisterProfileId,
        productId: requestId,
        sourceType: 'warehouse_loader',
        amount: loaderCost,
        currency: 'BDT',
        remarks: `Warehouse loader cost for ${productName}`,
        createdById,
      })
    }
    if (extraWorkerCost) {
      expenseData.push({
        sisterProfileId,
        productId: requestId,
        sourceType: 'warehouse_extra_worker',
        amount: extraWorkerCost,
        currency: 'BDT',
        remarks: `Extra worker cost for ${productName}`,
        createdById,
      })
    }
    // Create expense for each checked packaging item
    const packagingItems = [
      { field: 'labelsCost', name: 'Labels', value: labelsCost },
      { field: 'htakeCost', name: 'H-Take', value: htakeCost },
      { field: 'stickersCost', name: 'Stickers', value: stickersCost },
      { field: 'cartonsCost', name: 'Cartons', value: cartonsCost },
      { field: 'polyBagsCost', name: 'Poly Bags', value: polyBagsCost },
      { field: 'gamtapeCost', name: 'Gam Tape', value: gamtapeCost },
    ]
    for (const item of packagingItems) {
      if (item.value) {
        expenseData.push({
          sisterProfileId,
          productId: requestId,
          sourceType: 'warehouse_packaging_item',
          amount: item.value,
          currency: 'BDT',
          remarks: `${item.name} packaging cost for ${productName}`,
          fieldName: item.field,
          createdById,
        })
      }
    }
    // Custom cost fields
    for (const cc of parsedCustomCosts) {
      if (cc.amount) {
        expenseData.push({
          sisterProfileId,
          productId: requestId,
          sourceType: 'custom_field',
          amount: cc.amount,
          currency: cc.currency || 'BDT',
          remarks: cc.remarks || `Custom cost for ${productName}`,
          fieldName: cc.fieldName || cc.name || null,
          createdById,
        })
      }
    }

    if (expenseData.length > 0) {
      await db.expense.createMany({ data: expenseData })
    }
  }

  return NextResponse.json(cost, { status: 201 })
}
