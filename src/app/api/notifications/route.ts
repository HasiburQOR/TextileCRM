import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  // For prototype, list all notifications (no auth filtering)
  const notifications = await db.notification.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      sisterProfile: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(notifications)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { userId, sisterProfileId, title, message, type } = body
  if (!userId || !title || !message || !type) {
    return NextResponse.json({ error: 'userId, title, message, and type are required' }, { status: 400 })
  }

  const notification = await db.notification.create({
    data: {
      userId,
      sisterProfileId: sisterProfileId || null,
      title,
      message,
      type,
    },
    include: {
      user: { select: { id: true, name: true } },
      sisterProfile: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(notification, { status: 201 })
}
