import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const requestId = searchParams.get('requestId')
  const where: Record<string, unknown> = {}
  if (requestId) where.requestId = requestId

  const trips = await db.sourcingTrip.findMany({
    where,
    include: {
      request: { select: { id: true, productName: true, brandName: true } },
      closedBy: { select: { id: true, name: true } },
      _count: { select: { locations: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(trips)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { requestId, createdById } = body
  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  }

  const requestExists = await db.sourcingRequest.findUnique({ where: { id: requestId } })
  if (!requestExists) return NextResponse.json({ error: 'Sourcing request not found' }, { status: 404 })

  const trip = await db.sourcingTrip.create({
    data: { requestId, status: 'OPEN' },
    include: {
      request: true,
      _count: { select: { locations: true } },
    },
  })
  return NextResponse.json(trip, { status: 201 })
}
