import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { reason } = await req.json()
  if (!reason) return NextResponse.json({ error: 'Void reason required' }, { status: 400 })

  const invoice = await db.invoice.update({
    where: { id },
    data: { status: 'VOID', rejectionReason: reason },
    include: { lineItems: true, payments: true, createdBy: { select: { id: true, name: true } } },
  })
  return NextResponse.json(invoice)
}