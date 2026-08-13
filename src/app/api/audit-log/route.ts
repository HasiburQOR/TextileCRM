import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entityType')
  const actorId = searchParams.get('actorId')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  const where: Record<string, unknown> = {}
  if (entityType) where.entityType = entityType
  if (actorId) where.actorId = actorId
  if (dateFrom || dateTo) {
    const timestamp: Record<string, unknown> = {}
    if (dateFrom) timestamp.gte = new Date(dateFrom)
    if (dateTo) timestamp.lte = new Date(dateTo)
    where.timestamp = timestamp
  }

  const logs = await db.auditLog.findMany({
    where,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: 200,
  })
  return NextResponse.json(logs)
}