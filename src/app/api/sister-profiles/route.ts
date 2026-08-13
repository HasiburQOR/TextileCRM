import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const buyerProfileId = searchParams.get('buyerProfileId')
  const where: Record<string, unknown> = {}
  if (buyerProfileId) where.buyerProfileId = buyerProfileId

  const profiles = await db.sisterProfile.findMany({
    where,
    include: {
      buyerProfile: { select: { id: true, name: true } },
      _count: { select: { sourcingRequests: true, expenses: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(profiles)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { buyerProfileId, name, poReference, agreementType, negotiatedRate, terms } = body
  if (!buyerProfileId || !name) {
    return NextResponse.json({ error: 'buyerProfileId and name are required' }, { status: 400 })
  }

  const buyer = await db.buyerProfile.findUnique({ where: { id: buyerProfileId } })
  if (!buyer) return NextResponse.json({ error: 'Buyer profile not found' }, { status: 404 })

  const profile = await db.sisterProfile.create({
    data: {
      buyerProfileId,
      name,
      poReference: poReference || '',
      agreementType: agreementType || 'TYPE_1',
      negotiatedRate: negotiatedRate || 0,
      terms: terms || '',
    },
    include: {
      buyerProfile: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(profile, { status: 201 })
}