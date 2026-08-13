import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const locations = await db.tripLocation.findMany({
    where: { sourcingTripId: id },
    orderBy: { date: 'asc' },
  })
  return NextResponse.json(locations)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { locationName, quantity, advanceAmount, date } = body
  if (!locationName || !date) {
    return NextResponse.json({ error: 'locationName and date are required' }, { status: 400 })
  }

  const trip = await db.sourcingTrip.findUnique({ where: { id } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  if (trip.status === 'CLOSED') {
    return NextResponse.json({ error: 'Cannot add locations to a closed trip' }, { status: 409 })
  }

  const location = await db.tripLocation.create({
    data: {
      sourcingTripId: id,
      locationName,
      quantity: quantity || 0,
      advanceAmount: advanceAmount || 0,
      status: 'PENDING',
      date: new Date(date),
    },
  })
  return NextResponse.json(location, { status: 201 })
}
