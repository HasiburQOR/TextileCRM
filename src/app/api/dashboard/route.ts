import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const [totalRequests, pendingRequests, approvedRequests, rejectedRequests,
    totalQCReports, totalInvoices, pendingInvoices, issuedInvoices,
    requests,
    totalBuyers, totalSisterProfiles, activeSisterProfiles,
    buyerBreakdown] = await Promise.all([
    db.sourcingRequest.count(),
    db.sourcingRequest.count({ where: { status: 'PENDING_ADMIN_APPROVAL' } }),
    db.sourcingRequest.count({ where: { status: 'APPROVED_FOR_QC' } }),
    db.sourcingRequest.count({ where: { status: 'REJECTED' } }),
    db.qCReport.count(),
    db.invoice.count(),
    db.invoice.count({ where: { status: 'PENDING_APPROVAL' } }),
    db.invoice.count({ where: { status: 'ISSUED' } }),
    db.sourcingRequest.findMany({
      include: { variants: true, qcReport: { include: { warehouseCost: true } } },
      orderBy: { createdAt: 'desc' }, take: 50,
    }),
    db.buyerProfile.count(),
    db.sisterProfile.count(),
    db.sisterProfile.count({ where: { status: 'ACTIVE' } }),
    // Buyer/sister profile breakdown
    db.buyerProfile.findMany({
      include: {
        _count: { select: { sisterProfiles: true } },
        sisterProfiles: {
          include: {
            _count: {
              select: {
                sourcingRequests: true,
                expenses: true,
                invoices: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const invoiceTotal = await db.invoice.aggregate({ _sum: { totalValue: true } })
  const paymentsTotal = await db.invoicePayment.aggregate({ _sum: { amount: true } })
  const outstanding = await db.invoice.aggregate({
    _sum: { outstandingBalance: true },
    where: { status: { in: ['PENDING_APPROVAL', 'ISSUED'] } },
  })

  // Total expenses across all sister profiles
  const expenseTotal = await db.expense.aggregate({ _sum: { amount: true } })

  return NextResponse.json({
    totalRequests, pendingRequests, approvedRequests, rejectedRequests,
    totalQCReports, totalInvoices, pendingInvoices, issuedInvoices,
    totalInvoiceValue: invoiceTotal._sum.totalValue || 0,
    totalPayments: paymentsTotal._sum.amount || 0,
    totalOutstanding: outstanding._sum.outstandingBalance || 0,
    totalExpenses: expenseTotal._sum.amount || 0,
    requests,
    // Phase 2: buyer/sister breakdown
    totalBuyers,
    totalSisterProfiles,
    activeSisterProfiles,
    buyerBreakdown,
  })
}
