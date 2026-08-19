import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const buyer = await db.buyerProfile.findUnique({
    where: { id },
    include: {
      sisterProfiles: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  return NextResponse.json(buyer)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name, contactInfo, branding, portalUsername, portalPasswordHash } = body

  const existing = await db.buyerProfile.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  if (portalUsername && portalUsername !== existing.portalUsername) {
    const duplicate = await db.buyerProfile.findUnique({ where: { portalUsername } })
    if (duplicate) return NextResponse.json({ error: 'Portal username already exists' }, { status: 409 })
  }

  const buyer = await db.buyerProfile.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(contactInfo !== undefined && { contactInfo }),
      ...(branding !== undefined && { branding }),
      ...(portalUsername && { portalUsername }),
      ...(portalPasswordHash && { portalPasswordHash }),
    },
    include: { sisterProfiles: true },
  })
  return NextResponse.json(buyer)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const buyer = await db.buyerProfile.findUnique({
    where: { id },
    include: { _count: { select: { sisterProfiles: true } } },
  })
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  if (buyer._count.sisterProfiles > 0) {
    return NextResponse.json({ error: 'Cannot delete buyer with existing sister profiles' }, { status: 409 })
  }
  await db.buyerProfile.delete({ where: { id } })
  return NextResponse.json({ message: 'Deleted' })
}