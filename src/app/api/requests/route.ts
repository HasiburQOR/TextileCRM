import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const role = searchParams.get('role')

  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') {
    where.status = status
  }
  if (role === 'COMPANY_REP') {
    // Company Rep sees only their own requests
    where.createdById = searchParams.get('userId') || ''
  }

  const requests = await db.sourcingRequest.findMany({
    where,
    include: {
      createdUser: { select: { id: true, name: true, email: true, role: true } },
      reviewedUser: { select: { id: true, name: true, email: true, role: true } },
      variants: { orderBy: { createdAt: 'asc' } },
      qcReport: { include: { warehouseCost: true, createdBy: { select: { id: true, name: true } } } },
      packingLists: { include: { cartons: true } },
      sisterProfile: { select: { id: true, name: true, buyerProfile: { select: { id: true, name: true } } } },
      sourcingTrips: { include: { _count: { select: { locations: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(requests)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { productName, photoUrl, packingListNotes, variants, createdById, sisterProfileId, brandName, imageUrls } = body

  if (!productName || !createdById) {
    return NextResponse.json({ error: 'Product name and user are required' }, { status: 400 })
  }

  // Auto-generate styleNumber: STY- + timestamp-based unique
  const styleNumber = `STY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

  const request = await db.sourcingRequest.create({
    data: {
      productName,
      photoUrl: photoUrl || '',
      packingListNotes: packingListNotes || '',
      createdById,
      sisterProfileId: sisterProfileId || null,
      brandName: brandName || 'NA',
      styleNumber,
      imageUrls: imageUrls ? JSON.stringify(imageUrls) : '[]',
      variants: {
        create: (variants || []).map((v: { styleNo?: string; buyer?: string; poNo?: string; color?: string; itemNumber?: string; size?: string; qtyOrdered?: number }) => ({
          styleNo: v.styleNo || '',
          buyer: v.buyer || '',
          poNo: v.poNo || '',
          color: v.color || '',
          itemNumber: v.itemNumber || '',
          size: v.size || '',
          qtyOrdered: v.qtyOrdered || 0,
        })),
      },
    },
    include: {
      createdUser: true,
      variants: true,
      sisterProfile: true,
    },
  })

  return NextResponse.json(request, { status: 201 })
}