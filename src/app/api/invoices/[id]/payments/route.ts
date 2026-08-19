import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, currency, paymentDate, bankReference, recordedById } = await req.json()
  if (!amount || !recordedById) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const payment = await db.invoicePayment.create({
    data: { invoiceId: id, amount, currency: currency || 'USD', paymentDate: new Date(paymentDate), bankReference: bankReference || '', recordedById },
  })

  // Recalculate outstanding
  const allPayments = await db.invoicePayment.findMany({ where: { invoiceId: id } })
  const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0)
  const invoice = await db.invoice.findUnique({ where: { id } })
  const commission = invoice?.commissionType === 'PERCENTAGE' ? invoice.totalValue * invoice.commissionValue / 100 : invoice?.commissionType === 'FLAT' ? invoice.commissionValue : 0
  const grandTotal = (invoice?.totalValue || 0) + commission
  const outstanding = Math.round((grandTotal - totalPaid) * 100) / 100

  await db.invoice.update({ where: { id }, data: { outstandingBalance: Math.max(0, outstanding) } })

  return NextResponse.json(payment, { status: 201 })
}