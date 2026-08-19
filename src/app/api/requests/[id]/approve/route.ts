import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { reviewedById } = body

  if (!reviewedById) {
    return NextResponse.json({ error: 'Reviewer ID is required' }, { status: 400 })
  }

  const request = await db.sourcingRequest.update({
    where: { id },
    data: {
      status: 'APPROVED_FOR_QC',
      reviewedById,
      reviewedAt: new Date(),
    },
    include: {
      createdUser: true,
      reviewedUser: true,
      variants: true,
    },
  })

  return NextResponse.json(request)
}