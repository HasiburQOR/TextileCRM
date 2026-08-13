import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(users)
}
