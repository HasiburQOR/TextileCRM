import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') where.status = status

  const invoices = await db.invoice.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      lineItems: true,
      payments: { orderBy: { paymentDate: 'desc' } },
      exchangeRate: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(invoices)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { buyerName, exchangeRateId, commissionType, commissionValue, lineItems, createdById, sourceCurrency, targetCurrency, manualRate } = body
  if (!buyerName || !createdById || !lineItems?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const invCount = await db.invoice.count()
  const invoiceNo = `INV-2026-${String(invCount + 1).padStart(3, '0')}`
  const totalValue = lineItems.reduce((s: number, li: { amount: number }) => s + (li.amount || 0), 0)
  const commissionAmt = commissionType === 'PERCENTAGE' ? totalValue * (commissionValue || 0) / 100 : commissionType === 'FLAT' ? commissionValue || 0 : 0
  const grandTotal = totalValue + commissionAmt

  let exchangeRateValue = 0
  let resolvedTargetCurrency = targetCurrency || ''
  let resolvedSourceCurrency = sourceCurrency || 'BDT'

  if (exchangeRateId) {
    const rate = await db.exchangeRate.findUnique({ where: { id: exchangeRateId } })
    if (rate) { exchangeRateValue = rate.rate; resolvedTargetCurrency = rate.targetCurrency; resolvedSourceCurrency = rate.sourceCurrency }
  } else if (manualRate && targetCurrency) {
    // Manual rate: "1 targetCurrency = manualRate sourceCurrency" (divide direction)
    exchangeRateValue = Number(manualRate)
  }

  // Calculate converted total: grandTotal / rate (manual/divide) or grandTotal * rate (published/multiply)
  let convertedTotal = 0
  if (exchangeRateValue > 0 && resolvedTargetCurrency) {
    if (exchangeRateId) {
      // Published rate multiplies: target = source × rate
      convertedTotal = Math.round(grandTotal * exchangeRateValue * 100) / 100
    } else {
      // Manual rate divides: target = source / rate (1 USD = 120 BDT)
      convertedTotal = Math.round(grandTotal / exchangeRateValue * 100) / 100
    }
  }

  const invoice = await db.invoice.create({
    data: {
      invoiceNo, buyerName, status: 'PENDING_APPROVAL',
      exchangeRateId: exchangeRateId || null, exchangeRateValue, targetCurrency: resolvedTargetCurrency, sourceCurrency: resolvedSourceCurrency,
      commissionType: commissionType || 'NONE', commissionValue: commissionValue || 0,
      totalValue: Math.round(totalValue * 100) / 100,
      convertedTotal,
      outstandingBalance: Math.round(grandTotal * 100) / 100,
      createdById,
      lineItems: { create: lineItems.map((li: Record<string, unknown>) => ({
        requestId: li.requestId || null, description: li.description || '', brand: li.brand || '',
        ctn: li.ctn || 0, qtyPerCtn: li.qtyPerCtn || 0, totalQty: li.totalQty || 0,
        unitPrice: li.unitPrice || 0, amount: li.amount || 0,
        netWeight: li.netWeight || 0, grossWeight: li.grossWeight || 0, cbm: li.cbm || 0,
        material: li.material || '', styleItemCode: li.styleItemCode || '', remarks: li.remarks || '',
      })) },
    },
    include: { lineItems: true, createdBy: { select: { id: true, name: true } }, exchangeRate: true },
  })
  return NextResponse.json(invoice, { status: 201 })
}