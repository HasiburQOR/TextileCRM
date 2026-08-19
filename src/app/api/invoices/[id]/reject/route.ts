import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { approvedById, reason } = await req.json()
  if (!approvedById || !reason) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const invoice = await db.invoice.update({
    where: { id },
    data: { status: 'REJECTED', rejectionReason: reason, approvedById, approvedAt: new Date() },
    include: { lineItems: true, payments: true, createdBy: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } },
  })
  return NextResponse.json(invoice)
}