import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { reviewedById, reason } = body

  if (!reviewedById || !reason) {
    return NextResponse.json({ error: 'Reviewer ID and rejection reason are required' }, { status: 400 })
  }

  const request = await db.sourcingRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedById,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
    include: {
      createdUser: true,
      reviewedUser: true,
      variants: true,
    },
  })

  return NextResponse.json(request)
}