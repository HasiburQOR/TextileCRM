import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await db.sourcingTrip.findUnique({
    where: { id },
    include: {
      request: { include: { variants: true } },
      closedBy: { select: { id: true, name: true } },
      locations: { orderBy: { date: 'asc' } },
    },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  return NextResponse.json(trip)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { status, closedById } = body

  const existing = await db.sourcingTrip.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  if (status === 'CLOSED') {
    // Recalculate total advance from locations
    const locations = await db.tripLocation.findMany({ where: { sourcingTripId: id } })
    const totalAdvance = locations.reduce((sum, loc) => sum + loc.advanceAmount, 0)

    const trip = await db.sourcingTrip.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: closedById || null,
        totalAdvance: Math.round(totalAdvance * 100) / 100,
      },
      include: {
        request: true,
        closedBy: { select: { id: true, name: true } },
        locations: true,
      },
    })
    return NextResponse.json(trip)
  }

  return NextResponse.json({ error: 'Only status=CLOSED update is supported' }, { status: 400 })
}
