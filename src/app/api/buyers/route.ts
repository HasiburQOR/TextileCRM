import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const buyers = await db.buyerProfile.findMany({
    include: {
      _count: { select: { sisterProfiles: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(buyers)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, contactInfo, branding, portalUsername, portalPasswordHash } = body
  if (!name || !portalUsername || !portalPasswordHash) {
    return NextResponse.json({ error: 'Name, portalUsername, and portalPasswordHash are required' }, { status: 400 })
  }

  const existing = await db.buyerProfile.findUnique({ where: { portalUsername } })
  if (existing) {
    return NextResponse.json({ error: 'Portal username already exists' }, { status: 409 })
  }

  const buyer = await db.buyerProfile.create({
    data: {
      name,
      contactInfo: contactInfo || '',
      branding: branding || '',
      portalUsername,
      portalPasswordHash,
    },
    include: { _count: { select: { sisterProfiles: true } } },
  })
  return NextResponse.json(buyer, { status: 201 })
}