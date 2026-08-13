import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const notification = await db.notification.findUnique({ where: { id } })
  if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 })

  const updated = await db.notification.update({
    where: { id },
    data: { isRead: true },
  })
  return NextResponse.json(updated)
}