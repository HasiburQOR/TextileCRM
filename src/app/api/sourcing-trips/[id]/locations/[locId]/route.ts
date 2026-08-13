import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; locId: string }> }) {
  const { id, locId } = await params
  const body = await req.json()
  const { locationName, quantity, advanceAmount, status } = body

  const trip = await db.sourcingTrip.findUnique({ where: { id } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  if (trip.status === 'CLOSED') {
    return NextResponse.json({ error: 'Cannot update locations on a closed trip' }, { status: 409 })
  }

  const location = await db.tripLocation.findUnique({ where: { id: locId } })
  if (!location || location.sourcingTripId !== id) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 })
  }

  const updated = await db.tripLocation.update({
    where: { id: locId },
    data: {
      ...(locationName !== undefined && { locationName }),
      ...(quantity !== undefined && { quantity }),
      ...(advanceAmount !== undefined && { advanceAmount }),
      ...(status && { status }),
    },
  })
  return NextResponse.json(updated)
}
