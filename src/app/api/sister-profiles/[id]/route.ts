import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await db.sisterProfile.findUnique({
    where: { id },
    include: {
      buyerProfile: true,
      sourcingRequests: { orderBy: { createdAt: 'desc' } },
      expenses: { orderBy: { createdAt: 'desc' } },
      invoices: { orderBy: { createdAt: 'desc' } },
      _count: { select: { documentVaults: true, notifications: true } },
    },
  })
  if (!profile) return NextResponse.json({ error: 'Sister profile not found' }, { status: 404 })
  return NextResponse.json(profile)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name, poReference, agreementType, negotiatedRate, terms, status } = body

  const existing = await db.sisterProfile.findUnique({
    where: { id },
    include: { _count: { select: { expenses: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Sister profile not found' }, { status: 404 })

  // Only allow updates if no expenses exist
  if (existing._count.expenses > 0 && (agreementType || negotiatedRate !== undefined)) {
    return NextResponse.json({ error: 'Cannot change agreement type or rate when expenses exist' }, { status: 409 })
  }

  const profile = await db.sisterProfile.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(poReference !== undefined && { poReference }),
      ...(agreementType && { agreementType }),
      ...(negotiatedRate !== undefined && { negotiatedRate }),
      ...(terms !== undefined && { terms }),
      ...(status && { status }),
    },
    include: { buyerProfile: true },
  })
  return NextResponse.json(profile)
}