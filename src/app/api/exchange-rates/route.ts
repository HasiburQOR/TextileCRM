import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const rates = await db.exchangeRate.findMany({
    include: { publishedBy: { select: { id: true, name: true } } },
    orderBy: { effectiveDate: 'desc' },
  })
  return NextResponse.json(rates)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { sourceCurrency, targetCurrency, rate, effectiveDate, publishedById } = body
  if (!sourceCurrency || !targetCurrency || !rate || !publishedById) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const exchangeRate = await db.exchangeRate.create({
    data: { sourceCurrency, targetCurrency, rate, effectiveDate: new Date(effectiveDate), publishedById },
    include: { publishedBy: { select: { id: true, name: true } } },
  })
  return NextResponse.json(exchangeRate, { status: 201 })
}