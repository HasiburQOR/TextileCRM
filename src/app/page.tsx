'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
/* eslint-disable react-hooks/set-state-in-effect */
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  Package, CheckCircle2, XCircle, Clock, Camera, Plus, Trash2, FileText,
  ShieldCheck, UserCircle, Box, Send, ClipboardList, Search,
  LayoutDashboard, Factory, DollarSign, Warehouse, QrCode, FileBarChart,
  Receipt, RefreshCw, ChevronLeft, ArrowLeftRight, AlertTriangle,
  CreditCard, Tag, BarChart3, Eye, Banknote, Menu,
  Users, FolderTree, MapPin, Scale, Building2, Globe, ChevronDown,
} from 'lucide-react'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type Page = 'dashboard' | 'buyers' | 'sister-profiles' | 'sourcing' | 'sourcing-trips' | 'approval' | 'catalog' | 'packing' | 'qc-costs' | 'warehouse' | 'expenses' | 'settlement' | 'costing' | 'invoices' | 'exchange-rates' | 'audit-log'

interface User { id: string; email: string; name: string | null; role: string }
interface Variant { id?: string; styleNo: string; buyer: string; poNo: string; color: string; itemNumber: string; size: string; qtyOrdered: number }
interface QCReport { id: string; reportId: string; requestId: string; lunchCostFlag: boolean; lunchCost: number; goodsCarryingCost: number; travelMode: string; extraCost: number; totalCost: number; createdBy: { id: string; name: string | null }; warehouseCost: Record<string, number> | null }
interface Carton { id?: string; cartonNoFrom: number; cartonNoTo: number; noOfCartons: number; color: string; assortId: string; itemNumber: string; sizeBreakdown: string; qtyPerCarton: number; shipQty: number; orderQty: number; shortQty: number; shortPct: number; ctnLength: number; ctnWidth: number; ctnHeight: number; netWeight: number; grossWeight: number; ctnCbm: number }
interface PackingList { id: string; orderQty: number; shipmentQty: number; shortQty: number; shortPct: number; totalCbm: number; totalNetWeight: number; totalGrossWeight: number; frontMark: string; sideMark: string; cartons: Carton[] }
interface InvoiceLineItem { id?: string; description: string; brand: string; ctn: number; qtyPerCtn: number; totalQty: number; unitPrice: number; amount: number; netWeight: number; grossWeight: number; cbm: number; material: string; styleItemCode: string; remarks: string }
interface Invoice { id: string; invoiceNo: string; buyerName: string; status: string; rejectionReason: string; exchangeRateValue: number; targetCurrency: string; commissionType: string; commissionValue: number; totalValue: number; convertedTotal: number; outstandingBalance: number; createdAt: string; createdBy: { id: string; name: string | null }; approvedBy: { id: string; name: string | null } | null; lineItems: InvoiceLineItem[]; payments: { id: string; amount: number; currency: string; paymentDate: string; bankReference: string }[] }
interface ExchangeRate { id: string; sourceCurrency: string; targetCurrency: string; rate: number; effectiveDate: string; publishedBy: { id: string; name: string | null } }
interface SourcingRequest {
  id: string; productName: string; photoUrl: string; packingListNotes: string; status: string
  rejectionReason: string; createdAt: string; createdUser: { id: string; name: string | null; email: string; role: string }
  reviewedUser: { id: string; name: string | null; email: string; role: string } | null
  variants: Variant[]; qcReport: QCReport | null; packingLists: PackingList[]
  sisterProfileId?: string; brandName?: string; styleNumber?: string
  sisterProfile?: { id: string; name: string; buyerProfile: { id: string; name: string } } | null
}
interface DashboardData { totalRequests: number; pendingRequests: number; approvedRequests: number; rejectedRequests: number; totalQCReports: number; totalInvoices: number; pendingInvoices: number; issuedInvoices: number; totalInvoiceValue: number; totalPayments: number; totalOutstanding: number; requests: SourcingRequest[]; totalBuyers?: number; totalSisterProfiles?: number; totalExpenses?: number; buyerBreakdown?: { buyerId: string; buyerName: string; sisterCount: number }[] }

interface BuyerProfile { id: string; name: string; contactInfo: string; branding: string; portalUsername: string; _count: { sisterProfiles: number } }
interface SisterProfile { id: string; buyerProfileId: string; name: string; poReference: string; agreementType: string; negotiatedRate: number; terms: string; status: string; buyerProfile: { id: string; name: string } }
interface TripLocation { id: string; sourcingTripId: string; locationName: string; quantity: number; advanceAmount: number; status: string; date: string }
interface SourcingTrip { id: string; requestId: string; status: string; totalAdvance: number; closedAt: string | null; locations: TripLocation[]; request: { id: string; productName: string; brandName: string; styleNumber: string | null } }
interface Expense { id: string; sisterProfileId: string; productId: string | null; sourceType: string; amount: number; currency: string; remarks: string; fieldName: string | null; createdBy: { id: string; name: string | null }; createdAt: string; sisterProfile: { id: string; name: string; buyerProfile: { id: string; name: string } } }
interface SettlementData { sisterProfileId: string; sisterProfileName: string; agreementType: string; negotiatedRate: number; totalAdvance: number; totalExpense: number; amountOwed: number; netPosition: number; negativeBalance: boolean }
interface AuditLogEntry { id: string; actorId: string; action: string; entityType: string; entityId: string; afterSnapshot: string; timestamp: string; actor: { id: string; name: string | null } }

// ═══════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING_ADMIN_APPROVAL: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-800' },
  APPROVED_FOR_QC: { label: 'Approved for QC', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
  PENDING_APPROVAL: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-800' },
  ISSUED: { label: 'Issued', cls: 'bg-emerald-100 text-emerald-800' },
  VOID: { label: 'Void', cls: 'bg-gray-100 text-gray-800' },
  PENDING: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  REPORTED: { label: 'Reported', cls: 'bg-blue-100 text-blue-800' },
  OPEN: { label: 'Open', cls: 'bg-sky-100 text-sky-800' },
  CLOSED: { label: 'Closed', cls: 'bg-emerald-100 text-emerald-800' },
  ACTIVE: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800' },
  TYPE_1: { label: 'Type 1 (% Commission)', cls: 'bg-violet-100 text-violet-800' },
  TYPE_2: { label: 'Type 2 (Per Unit)', cls: 'bg-blue-100 text-blue-800' },
  TYPE_3: { label: 'Type 3 (Reimburse + Commission)', cls: 'bg-teal-100 text-teal-800' },
}

const NAV: { id: Page; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'buyers', label: 'Buyers', icon: Users, adminOnly: true },
  { id: 'sister-profiles', label: 'Sister Profiles', icon: FolderTree, adminOnly: true },
  { id: 'sourcing', label: 'Sourcing Intake', icon: Factory },
  { id: 'sourcing-trips', label: 'Sourcing Trips', icon: MapPin },
  { id: 'approval', label: 'Admin Approval', icon: ShieldCheck, adminOnly: true },
  { id: 'catalog', label: 'Product Catalog', icon: Search },
  { id: 'packing', label: 'Packing Lists', icon: ClipboardList },
  { id: 'qc-costs', label: 'QC Costs', icon: DollarSign },
  { id: 'warehouse', label: 'Warehouse Costs', icon: Warehouse },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'settlement', label: 'Settlement', icon: Scale },
  { id: 'costing', label: 'Cost Reports', icon: BarChart3 },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'exchange-rates', label: 'Exchange Rates', icon: ArrowLeftRight, adminOnly: true },
  { id: 'audit-log', label: 'Audit Log', icon: FileText, adminOnly: true },
]

const EMPTY_V: Variant = { styleNo: '', buyer: '', poNo: '', color: '', itemNumber: '', size: '', qtyOrdered: 0 }
const EMPTY_LI: InvoiceLineItem = { description: '', brand: '', ctn: 0, qtyPerCtn: 0, totalQty: 0, unitPrice: 0, amount: 0, netWeight: 0, grossWeight: 0, cbm: 0, material: '', styleItemCode: '', remarks: '' }

const CURRENCIES = ['USD', 'EUR', 'GBP', 'BDT', 'CNY', 'JPY', 'INR', 'AUD', 'CAD', 'SGD', 'AED']

const SOURCE_TYPE_LABELS: Record<string, string> = {
  qc_lunch: 'QC Lunch',
  qc_carrying: 'QC Carrying',
  qc_travel_extra: 'QC Travel Extra',
  warehouse_loader: 'Warehouse Loader',
  warehouse_extra_worker: 'Warehouse Extra Worker',
  warehouse_packaging_item: 'Packaging Item',
  custom_field: 'Custom Field',
  extra_cost: 'Extra Cost',
  sourcing_advance: 'Sourcing Advance',
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════

export default function Home() {
  // ─── Navigation ───
  const [page, setPage] = useState<Page>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ─── Data ───
  const [users, setUsers] = useState<User[]>([])
  const [requests, setRequests] = useState<SourcingRequest[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([])
  const [dashData, setDashData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // ─── New Phase 2 Data ───
  const [buyers, setBuyers] = useState<BuyerProfile[]>([])
  const [sisterProfiles, setSisterProfiles] = useState<SisterProfile[]>([])
  const [sourcingTrips, setSourcingTrips] = useState<SourcingTrip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlementData, setSettlementData] = useState<SettlementData | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])

  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Derived ───
  const currentUser = useMemo(() => users.find(u => u.id === currentUserId) ?? null, [users, currentUserId])
  const role = currentUser?.role || ''
  const isAdmin = role === 'ADMIN'
  const filteredNav = NAV.filter(n => !n.adminOnly || isAdmin)

  // ─── Sourcing Form ───
  const [newReqOpen, setNewReqOpen] = useState(false)
  const [productName, setProductName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [packingNotes, setPackingNotes] = useState('')
  const [formVariants, setFormVariants] = useState<Variant[]>([{ ...EMPTY_V }])
  const [submitting, setSubmitting] = useState(false)
  const [formSisterProfileId, setFormSisterProfileId] = useState('')
  const [formBrandName, setFormBrandName] = useState('NA')

  // ─── QC Form ───
  const [qcFormReqId, setQcFormReqId] = useState('')
  const [qcLunchFlag, setQcLunchFlag] = useState(false)
  const [qcLunchCost, setQcLunchCost] = useState('')
  const [qcGoodsCost, setQcGoodsCost] = useState('')
  const [qcTravelMode, setQcTravelMode] = useState('TRAVELLING_WITH_GOODS')
  const [qcExtraCost, setQcExtraCost] = useState('')

  // ─── Warehouse Form ───
  const [whQcReportId, setWhQcReportId] = useState('')
  const [whLoader, setWhLoader] = useState('')
  const [whExtraWorker, setWhExtraWorker] = useState('')
  const [whLabelsOn, setWhLabelsOn] = useState(false)
  const [whLabelsCost, setWhLabelsCost] = useState('')
  const [whHtakeOn, setWhHtakeOn] = useState(false)
  const [whHtakeCost, setWhHtakeCost] = useState('')
  const [whStickersOn, setWhStickersOn] = useState(false)
  const [whStickersCost, setWhStickersCost] = useState('')
  const [whCartonsOn, setWhCartonsOn] = useState(false)
  const [whCartonsCost, setWhCartonsCost] = useState('')
  const [whPolyBagsOn, setWhPolyBagsOn] = useState(false)
  const [whPolyBagsCost, setWhPolyBagsCost] = useState('')
  const [whGumTapeOn, setWhGumTapeOn] = useState(false)
  const [whGumTapeCost, setWhGumTapeCost] = useState('')

  // ─── Invoice Form ───
  const [newInvOpen, setNewInvOpen] = useState(false)
  const [invBuyer, setInvBuyer] = useState('')
  const [invRateId, setInvRateId] = useState('')
  const [invCommType, setInvCommType] = useState('NONE')
  const [invCommValue, setInvCommValue] = useState('')
  const [invLineItems, setInvLineItems] = useState<InvoiceLineItem[]>([{ ...EMPTY_LI }])

  // ─── Exchange Rate Form ───
  const [erSource, setErSource] = useState('USD')
  const [erTarget, setErTarget] = useState('BDT')
  const [erRate, setErRate] = useState('')
  const [erDate, setErDate] = useState('')

  // ─── Packing List Form ───
  const [plDialogOpen, setPlDialogOpen] = useState(false)
  const [plReqId, setPlReqId] = useState('')
  const [plOrderQty, setPlOrderQty] = useState('')
  const [plShipmentQty, setPlShipmentQty] = useState('')
  const [plFrontMark, setPlFrontMark] = useState('')
  const [plSideMark, setPlSideMark] = useState('')
  const [plCartons, setPlCartons] = useState<Carton[]>([{ cartonNoFrom: 1, cartonNoTo: 1, noOfCartons: 1, color: '', assortId: '', itemNumber: '', sizeBreakdown: '', qtyPerCarton: 0, shipQty: 0, orderQty: 0, shortQty: 0, shortPct: 0, ctnLength: 0, ctnWidth: 0, ctnHeight: 0, netWeight: 0, grossWeight: 0, ctnCbm: 0 }])
  const [plSubmitting, setPlSubmitting] = useState(false)

  // ─── Payment Form ───
  const [payInvId, setPayInvId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payRef, setPayRef] = useState('')

  // ─── Dialog State ───
  const [detailReq, setDetailReq] = useState<SourcingRequest | null>(null)
  const [detailInv, setDetailInv] = useState<Invoice | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<{ type: 'request' | 'invoice' | 'void'; id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // ─── Buyer Form ───
  const [newBuyerOpen, setNewBuyerOpen] = useState(false)
  const [buyerName, setBuyerName] = useState('')
  const [buyerContact, setBuyerContact] = useState('')
  const [buyerBranding, setBuyerBranding] = useState('')
  const [buyerPortalUser, setBuyerPortalUser] = useState('')
  const [buyerPortalPass, setBuyerPortalPass] = useState('')

  // ─── Sister Profile Form ───
  const [newSisterOpen, setNewSisterOpen] = useState(false)
  const [sisterBuyerId, setSisterBuyerId] = useState('')
  const [sisterName, setSisterName] = useState('')
  const [sisterPO, setSisterPO] = useState('')
  const [sisterAgreement, setSisterAgreement] = useState('TYPE_1')
  const [sisterRate, setSisterRate] = useState('')
  const [sisterTerms, setSisterTerms] = useState('')

  // ─── Sourcing Trip Form ───
  const [tripDialogOpen, setTripDialogOpen] = useState(false)
  const [tripReqId, setTripReqId] = useState('')
  const [tripLocations, setTripLocations] = useState([{ locationName: '', quantity: '', advanceAmount: '', date: '' }])

  // ─── Expense Filter ───
  const [expenseSisterFilter, setExpenseSisterFilter] = useState('all')

  // ─── Audit Log Filter ───
  const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState('all')

  // ─── Settlement View ───
  const [selectedSettlementSP, setSelectedSettlementSP] = useState<string | null>(null)

  // ═════════════════════════════════════════════════════════════════════════
  // Data Fetching
  // ═════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then((d: User[]) => {
      setUsers(d)
      if (!currentUserId && d.length > 0) setCurrentUserId(d[0].id)
    })
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    setLoading(true)
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch('/api/requests').then(r => r.json()),
      fetch('/api/invoices?status=ALL').then(r => r.json()),
      fetch('/api/exchange-rates').then(r => r.json()),
      fetch('/api/buyers').then(r => r.json()),
      fetch('/api/sister-profiles').then(r => r.json()),
      fetch('/api/sourcing-trips').then(r => r.json()),
      fetch('/api/expenses').then(r => r.json()),
      fetch('/api/audit-log').then(r => r.json()),
    ]).then(([dash, reqs, invs, rates, buyerList, sisterList, trips, expenseList, auditList]) => {
      setDashData(dash)
      setRequests(reqs)
      setInvoices(invs)
      setExchangeRates(rates)
      setBuyers(buyerList)
      setSisterProfiles(sisterList)
      setSourcingTrips(trips)
      setExpenses(expenseList)
      setAuditLogs(auditList)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [currentUserId, refreshKey])

  // ═════════════════════════════════════════════════════════════════════════
  // Handlers
  // ═════════════════════════════════════════════════════════════════════════

  const refresh = () => setRefreshKey(k => k + 1)

  const submitSourcing = async () => {
    if (!productName.trim() || !currentUser) return
    setSubmitting(true)
    let url = photoUrl
    if (photoFile) {
      const fd = new FormData()
      fd.append('file', photoFile)
      try {
        const u = await fetch('/api/upload', { method: 'POST', body: fd })
        const data = await u.json()
        if (data.url) url = data.url
      } catch { /* keep existing url */ }
    }
    try {
      const res = await fetch('/api/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName, photoUrl: url, packingListNotes: packingNotes,
          variants: formVariants.filter(v => v.styleNo || v.buyer || v.poNo),
          createdById: currentUser.id,
          sisterProfileId: formSisterProfileId || undefined,
          brandName: formBrandName || 'NA',
        }),
      })
      if (res.ok) {
        toast({ title: 'Sourcing request created' })
        setProductName(''); setPhotoUrl(''); setPhotoFile(null); setPackingNotes('')
        setFormVariants([{ ...EMPTY_V }]); setNewReqOpen(false); setFormSisterProfileId(''); setFormBrandName('NA'); refresh()
      } else toast({ title: 'Failed to create request', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
    setSubmitting(false)
  }

  const handleApproveReq = async (id: string) => {
    if (!currentUser) return
    try {
      const res = await fetch(`/api/requests/${id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedById: currentUser.id }),
      })
      if (res.ok) { toast({ title: 'Request approved for QC' }); setDetailReq(null); refresh() }
      else toast({ title: 'Approval failed', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const openRejectDialog = (type: 'request' | 'invoice' | 'void', id: string) => {
    setRejectTarget({ type, id })
    setRejectReason('')
    setRejectOpen(true)
  }

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim() || !currentUser) return
    try {
      if (rejectTarget.type === 'request') {
        const res = await fetch(`/api/requests/${rejectTarget.id}/reject`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewedById: currentUser.id, reason: rejectReason }),
        })
        if (res.ok) { toast({ title: 'Request rejected' }); setDetailReq(null) }
        else toast({ title: 'Rejection failed', variant: 'destructive' })
      } else if (rejectTarget.type === 'invoice') {
        const res = await fetch(`/api/invoices/${rejectTarget.id}/reject`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvedById: currentUser.id, reason: rejectReason }),
        })
        if (res.ok) { toast({ title: 'Invoice rejected' }); setDetailInv(null) }
        else toast({ title: 'Rejection failed', variant: 'destructive' })
      } else if (rejectTarget.type === 'void') {
        const res = await fetch(`/api/invoices/${rejectTarget.id}/void`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectReason }),
        })
        if (res.ok) { toast({ title: 'Invoice voided' }); setDetailInv(null) }
        else toast({ title: 'Void failed', variant: 'destructive' })
      }
      setRejectOpen(false); setRejectTarget(null); setRejectReason(''); refresh()
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const submitQC = async () => {
    if (!qcFormReqId || !currentUser) return
    try {
      const res = await fetch('/api/qc-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: qcFormReqId, lunchCostFlag: qcLunchFlag,
          lunchCost: parseFloat(qcLunchCost) || 0,
          goodsCarryingCost: parseFloat(qcGoodsCost) || 0,
          travelMode: qcTravelMode,
          extraCost: qcTravelMode === 'TRAVELLING_INDIVIDUALLY' ? parseFloat(qcExtraCost) || 0 : 0,
          createdById: currentUser.id,
        }),
      })
      if (res.ok) {
        toast({ title: 'QC report created' })
        setQcFormReqId(''); setQcLunchFlag(false); setQcLunchCost('')
        setQcGoodsCost(''); setQcTravelMode('TRAVELLING_WITH_GOODS'); setQcExtraCost('')
        refresh()
      } else toast({ title: 'Failed to create QC report', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const submitWarehouse = async () => {
    if (!whQcReportId || !currentUser || !parseFloat(whLoader)) return
    try {
      const res = await fetch('/api/warehouse-costs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qcReportId: whQcReportId,
          loaderCost: parseFloat(whLoader) || 0,
          extraWorkerCost: parseFloat(whExtraWorker) || 0,
          labelsCost: whLabelsOn ? parseFloat(whLabelsCost) || 0 : 0,
          htakeCost: whHtakeOn ? parseFloat(whHtakeCost) || 0 : 0,
          stickersCost: whStickersOn ? parseFloat(whStickersCost) || 0 : 0,
          cartonsCost: whCartonsOn ? parseFloat(whCartonsCost) || 0 : 0,
          polyBagsCost: whPolyBagsOn ? parseFloat(whPolyBagsCost) || 0 : 0,
          gamtapeCost: whGumTapeOn ? parseFloat(whGumTapeCost) || 0 : 0,
          createdById: currentUser.id,
        }),
      })
      if (res.ok) {
        toast({ title: 'Warehouse costs saved' }); setWhQcReportId(''); refresh()
      } else toast({ title: 'Failed to save warehouse costs', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const submitInvoice = async () => {
    if (!invBuyer || !currentUser || !invLineItems.some(li => li.description.trim())) {
      toast({ title: 'Fill required fields', variant: 'destructive' }); return
    }
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerName: invBuyer, exchangeRateId: invRateId || null,
          commissionType: invCommType, commissionValue: parseFloat(invCommValue) || 0,
          lineItems: invLineItems.filter(li => li.description.trim()),
          createdById: currentUser.id,
        }),
      })
      if (res.ok) {
        toast({ title: 'Invoice created' }); setNewInvOpen(false)
        setInvBuyer(''); setInvRateId(''); setInvCommType('NONE'); setInvCommValue('')
        setInvLineItems([{ ...EMPTY_LI }]); refresh()
      } else toast({ title: 'Failed to create invoice', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const submitExchangeRate = async () => {
    if (!erRate || !currentUser || !erDate) return
    try {
      const res = await fetch('/api/exchange-rates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCurrency: erSource, targetCurrency: erTarget,
          rate: parseFloat(erRate), effectiveDate: erDate, publishedById: currentUser.id,
        }),
      })
      if (res.ok) { toast({ title: 'Exchange rate published' }); setErRate(''); refresh() }
      else toast({ title: 'Failed to publish rate', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const openPackingListForm = (req: SourcingRequest) => {
    const totalQty = req.variants.reduce((s, v) => s + v.qtyOrdered, 0)
    setPlReqId(req.id)
    setPlOrderQty(String(totalQty))
    setPlShipmentQty(String(totalQty))
    setPlFrontMark(req.packingListNotes || '')
    setPlSideMark('')
    setPlCartons(req.variants.map((v, idx) => ({
      cartonNoFrom: idx + 1, cartonNoTo: idx + 1, noOfCartons: 1,
      color: v.color, assortId: v.styleNo, itemNumber: v.itemNumber,
      sizeBreakdown: v.size, qtyPerCarton: v.qtyOrdered, shipQty: v.qtyOrdered,
      orderQty: v.qtyOrdered, shortQty: 0, shortPct: 0,
      ctnLength: 0, ctnWidth: 0, ctnHeight: 0, netWeight: 0, grossWeight: 0, ctnCbm: 0,
    })))
    setPlDialogOpen(true)
  }

  const updatePlCarton = (idx: number, field: keyof Carton, value: string | number) => {
    setPlCartons(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const updated = { ...c, [field]: value }
      const from = Number(updated.cartonNoFrom)
      const to = Number(updated.cartonNoTo)
      updated.noOfCartons = to >= from ? to - from + 1 : 1
      const qtyPerCtn = Number(updated.qtyPerCarton) || 0
      updated.shipQty = updated.noOfCartons * qtyPerCtn
      const oq = Number(updated.orderQty) || 0
      updated.shortQty = oq - updated.shipQty
      updated.shortPct = oq > 0 ? (updated.shortQty / oq) * 100 : 0
      const l = Number(updated.ctnLength) || 0
      const w = Number(updated.ctnWidth) || 0
      const h = Number(updated.ctnHeight) || 0
      updated.ctnCbm = Math.round((l * w * h / 1000000) * 10000) / 10000
      return updated
    }))
  }

  const addPlCarton = () => {
    const last = plCartons[plCartons.length - 1]
    setPlCartons(prev => [...prev, {
      cartonNoFrom: (last?.cartonNoTo || 0) + 1, cartonNoTo: (last?.cartonNoTo || 0) + 2,
      noOfCartons: 1, color: '', assortId: '', itemNumber: '', sizeBreakdown: '',
      qtyPerCarton: 0, shipQty: 0, orderQty: 0, shortQty: 0, shortPct: 0,
      ctnLength: 0, ctnWidth: 0, ctnHeight: 0, netWeight: 0, grossWeight: 0, ctnCbm: 0,
    }])
  }

  const removePlCarton = (idx: number) => {
    if (plCartons.length <= 1) return
    setPlCartons(prev => prev.filter((_, i) => i !== idx))
  }

  const plCartonTotals = useMemo(() => plCartons.reduce(
    (acc, c) => ({
      cartons: acc.cartons + c.noOfCartons,
      shipQty: acc.shipQty + c.shipQty,
      cbm: acc.cbm + c.ctnCbm * c.noOfCartons,
      netWeight: acc.netWeight + c.netWeight * c.noOfCartons,
      grossWeight: acc.grossWeight + c.grossWeight * c.noOfCartons,
    }),
    { cartons: 0, shipQty: 0, cbm: 0, netWeight: 0, grossWeight: 0 },
  ), [plCartons])

  const submitPackingList = async () => {
    if (!plReqId || !plOrderQty) return
    setPlSubmitting(true)
    try {
      const res = await fetch('/api/packing-lists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: plReqId,
          orderQty: parseInt(plOrderQty) || 0,
          shipmentQty: parseInt(plShipmentQty) || 0,
          frontMark: plFrontMark, sideMark: plSideMark,
          cartons: plCartons.filter(c => c.noOfCartons > 0),
        }),
      })
      if (res.ok) {
        toast({ title: 'Packing list created' }); setPlDialogOpen(false); refresh()
      } else {
        const err = await res.json()
        toast({ title: err.error || 'Failed to create packing list', variant: 'destructive' })
      }
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
    setPlSubmitting(false)
  }

  const submitPayment = async () => {
    if (!payInvId || !parseFloat(payAmount) || !currentUser) return
    try {
      const res = await fetch(`/api/invoices/${payInvId}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(payAmount), currency: 'USD',
          paymentDate: new Date().toISOString(), bankReference: payRef,
          recordedById: currentUser.id,
        }),
      })
      if (res.ok) {
        toast({ title: 'Payment recorded' }); setPayInvId(''); setPayAmount(''); setPayRef(''); refresh()
      } else toast({ title: 'Failed to record payment', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const approveInvoice = async (id: string) => {
    if (!currentUser) return
    try {
      const res = await fetch(`/api/invoices/${id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedById: currentUser.id }),
      })
      if (res.ok) { toast({ title: 'Invoice approved' }); setDetailInv(null); refresh() }
      else toast({ title: 'Approval failed', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const voidInvoice = (id: string) => { openRejectDialog('void', id) }

  // ═════════════════════════════════════════════════════════════════════════
  // New Phase 2 Handlers
  // ═════════════════════════════════════════════════════════════════════════

  const submitBuyer = async () => {
    if (!buyerName.trim() || !buyerPortalUser.trim()) return
    try {
      const res = await fetch('/api/buyers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: buyerName, contactInfo: buyerContact, branding: buyerBranding, portalUsername: buyerPortalUser, portalPasswordHash: buyerPortalPass || 'proto_hash' }),
      })
      if (res.ok) {
        toast({ title: 'Buyer profile created' }); setNewBuyerOpen(false)
        setBuyerName(''); setBuyerContact(''); setBuyerBranding(''); setBuyerPortalUser(''); setBuyerPortalPass(''); refresh()
      } else toast({ title: 'Failed to create buyer', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const submitSisterProfile = async () => {
    if (!sisterBuyerId || !sisterName.trim() || !sisterPO.trim()) return
    try {
      const res = await fetch('/api/sister-profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerProfileId: sisterBuyerId, name: sisterName, poReference: sisterPO, agreementType: sisterAgreement, negotiatedRate: parseFloat(sisterRate) || 0, terms: sisterTerms }),
      })
      if (res.ok) {
        toast({ title: 'Sister profile created' }); setNewSisterOpen(false); refresh()
      } else toast({ title: 'Failed', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const submitSourcingTrip = async () => {
    if (!tripReqId) return
    try {
      const res = await fetch('/api/sourcing-trips', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: tripReqId }),
      })
      if (res.ok) {
        const trip = await res.json()
        for (const loc of tripLocations.filter(l => l.locationName.trim())) {
          await fetch(`/api/sourcing-trips/${trip.id}/locations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...loc, quantity: parseInt(loc.quantity) || 0, advanceAmount: parseFloat(loc.advanceAmount) || 0, status: 'PENDING' }),
          })
        }
        toast({ title: 'Sourcing trip created' }); setTripDialogOpen(false); refresh()
      } else toast({ title: 'Failed', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const closeTrip = async (tripId: string) => {
    if (!currentUser) return
    try {
      const res = await fetch(`/api/sourcing-trips/${tripId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED', closedById: currentUser.id }),
      })
      if (res.ok) { toast({ title: 'Trip closed' }); refresh() }
      else toast({ title: 'Failed to close trip', variant: 'destructive' })
    } catch { toast({ title: 'Network error', variant: 'destructive' }) }
  }

  const reportLocation = async (tripId: string, locId: string) => {
    try {
      const res = await fetch(`/api/sourcing-trips/${tripId}/locations/${locId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REPORTED' }),
      })
      if (res.ok) { toast({ title: 'Location reported' }); refresh() }
    } catch { toast({ title: 'Failed', variant: 'destructive' }) }
  }

  const fetchSettlement = async (spId: string) => {
    try {
      const res = await fetch(`/api/settlement/${spId}`)
      if (res.ok) {
        const data = await res.json()
        setSettlementData(data)
      }
    } catch {}
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Form Helpers
  // ═════════════════════════════════════════════════════════════════════════

  const handleVariantChange = (idx: number, field: string, val: string) => {
    setFormVariants(prev => prev.map((v, i) => {
      if (i !== idx) return v
      return { ...v, [field]: field === 'qtyOrdered' ? parseInt(val) || 0 : val }
    }))
  }

  const addVariant = () => setFormVariants(prev => [...prev, { ...EMPTY_V }])
  const removeVariant = (idx: number) => setFormVariants(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const handleLIChange = (idx: number, field: string, val: string) => {
    setInvLineItems(prev => prev.map((li, i) => {
      if (i !== idx) return li
      const updated = { ...li }
      if (['description', 'brand', 'material', 'styleItemCode', 'remarks'].includes(field)) {
        (updated as Record<string, unknown>)[field] = val
      } else {
        (updated as Record<string, unknown>)[field] = parseInt(val) || 0
      }
      updated.totalQty = updated.ctn * updated.qtyPerCtn
      updated.amount = Math.round(updated.ctn * updated.qtyPerCtn * updated.unitPrice * 100) / 100
      return updated
    }))
  }

  const addLI = () => setInvLineItems(prev => [...prev, { ...EMPTY_LI }])
  const removeLI = (idx: number) => setInvLineItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setPhotoFile(f); setPhotoUrl(URL.createObjectURL(f)) }
  }

  const addTripLocation = () => setTripLocations(prev => [...prev, { locationName: '', quantity: '', advanceAmount: '', date: '' }])
  const removeTripLocation = (idx: number) => setTripLocations(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  const updateTripLocation = (idx: number, field: string, val: string) => {
    setTripLocations(prev => prev.map((l, i) => i !== idx ? l : { ...l, [field]: val }))
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Computed Lists
  // ═════════════════════════════════════════════════════════════════════════

  const approvedReqs = requests.filter(r => r.status === 'APPROVED_FOR_QC' && !r.qcReport)
  const qcWithCostReqs = requests.filter(r => r.qcReport && !r.qcReport.warehouseCost)
  const reqsWithWarehouse = requests.filter(r => r.qcReport?.warehouseCost)
  const qcEstimate = (qcLunchFlag ? parseFloat(qcLunchCost) || 0 : 0) + (parseFloat(qcGoodsCost) || 0) + (qcTravelMode === 'TRAVELLING_INDIVIDUALLY' ? parseFloat(qcExtraCost) || 0 : 0)

  const approvedReqsNoTrip = useMemo(() => {
    const tripReqIds = new Set(sourcingTrips.map(t => t.requestId))
    return requests.filter(r => r.status === 'APPROVED_FOR_QC' && !tripReqIds.has(r.id))
  }, [requests, sourcingTrips])

  const statusBadge = (s: string) => {
    const c: Record<string, string> = { PENDING_ADMIN_APPROVAL: 'bg-yellow-100 text-yellow-800', APPROVED_FOR_QC: 'bg-blue-100 text-blue-800', QC_IN_PROGRESS: 'bg-purple-100 text-purple-800', REJECTED: 'bg-red-100 text-red-800', OPEN: 'bg-green-100 text-green-800', CLOSED: 'bg-gray-100 text-gray-800', PENDING: 'bg-yellow-100 text-yellow-800', APPROVED: 'bg-green-100 text-green-800', ISSUED: 'bg-blue-100 text-blue-800', PAID: 'bg-green-100 text-green-800', VOID: 'bg-gray-300 text-gray-700', ACTIVE: 'bg-green-100 text-green-800', INACTIVE: 'bg-red-100 text-red-800' }
    return <Badge className={c[s] || 'bg-gray-100 text-gray-800'}>{s.replace(/_/g, ' ')}</Badge>
  }
  const navItems: { key: Page; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'buyers', label: 'Buyers', icon: <Users className="w-4 h-4" /> },
    { key: 'sister-profiles', label: 'Sister Profiles', icon: <FolderTree className="w-4 h-4" /> },
    { key: 'sourcing', label: 'Sourcing', icon: <Package className="w-4 h-4" /> },
    { key: 'sourcing-trips', label: 'Sourcing Trips', icon: <MapPin className="w-4 h-4" /> },
    { key: 'approval', label: 'Approvals', icon: <CheckCircle2 className="w-4 h-4" /> },
    { key: 'packing', label: 'Packing Lists', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'qc-costs', label: 'QC & Warehouse', icon: <ShieldCheck className="w-4 h-4" /> },
    { key: 'invoices', label: 'Invoices', icon: <Receipt className="w-4 h-4" /> },
    { key: 'exchange-rates', label: 'Exchange Rates', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { key: 'expenses', label: 'Expenses', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'settlement', label: 'Settlement', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'audit-log', label: 'Audit Log', icon: <FileBarChart className="w-4 h-4" /> },
  ]
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="space-y-4 text-center"><Skeleton className="h-12 w-12 rounded-full mx-auto" /><Skeleton className="h-4 w-[250px] mx-auto" /><p className="text-sm text-muted-foreground">Loading...</p></div></div>
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b"><h1 className="font-bold text-lg flex items-center gap-2"><Box className="w-5 h-5" /> Shipment Sourcing</h1><p className="text-xs text-muted-foreground mt-1">Traceability Platform</p></div>
        <div className="p-2 border-b"><Select value={currentUserId} onValueChange={setCurrentUserId}><SelectTrigger className="w-full"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name || u.email} ({u.role})</SelectItem>)}</SelectContent></Select></div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">{navItems.map(item => <Button key={item.key} variant={activePage === item.key ? 'secondary' : 'ghost'} className="w-full justify-start gap-2" onClick={() => { setActivePage(item.key); setDetailReq(null); setDetailInv(null) }}>{item.icon} {item.label}</Button>)}</nav>
        <div className="p-3 border-t text-xs text-muted-foreground text-center">{currentUser?.name || currentUser?.email}</div>
      </aside>
      <main className="flex-1 overflow-y-auto"><div className="p-6 max-w-7xl mx-auto">
        {/* DASHBOARD */}
        {activePage === 'dashboard' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[{ l: 'Total Requests', v: dashData?.totalRequests ?? 0 }, { l: 'Pending Approval', v: dashData?.pendingRequests ?? 0 }, { l: 'Total Invoices', v: dashData?.totalInvoices ?? 0 }, { l: 'Total Payments', v: dashData?.totalPayments ?? 0 }].map(c => (
              <Card key={c.l}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{c.l}</CardTitle><Package className="w-4 h-4" /></CardHeader><CardContent><p className="text-2xl font-bold">{c.v}</p></CardContent></Card>
            ))}
          </div>
          <Card><CardHeader><CardTitle>Recent Requests</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{requests.slice(0, 10).map(r => <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailReq(r)}><TableCell className="font-medium">{r.productName}</TableCell><TableCell>{statusBadge(r.status)}</TableCell><TableCell className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </div>}
        {/* BUYERS */}
        {activePage === 'buyers' && <div className="space-y-6">
          <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Buyer Profiles</h2><Button onClick={() => setNewBuyerOpen(true)}><Plus className="w-4 h-4 mr-2" />New Buyer</Button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{buyers.map(b => <Card key={b.id}><CardHeader><CardTitle>{b.name}</CardTitle><CardDescription>{b.branding}</CardDescription></CardHeader><CardContent><p className="text-sm">{b.contactInfo}</p><p className="text-xs text-muted-foreground mt-2">{b._count.sisterProfiles} sister profile(s)</p></CardContent></Card>)}</div>
        </div>}
        {/* SISTER PROFILES */}
        {activePage === 'sister-profiles' && <div className="space-y-6">
          <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Sister Profiles</h2><Button onClick={() => setNewSisterOpen(true)}><Plus className="w-4 h-4 mr-2" />New Sister Profile</Button></div>
          <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Buyer</TableHead><TableHead>PO Ref</TableHead><TableHead>Agreement</TableHead><TableHead>Rate</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{sisterProfiles.map(sp => <TableRow key={sp.id}><TableCell className="font-medium">{sp.name}</TableCell><TableCell>{buyers.find(b => b.id === sp.buyerProfileId)?.name || sp.buyerProfileId}</TableCell><TableCell>{sp.poReference}</TableCell><TableCell>{sp.agreementType}</TableCell><TableCell>{sp.negotiatedRate}</TableCell><TableCell>{statusBadge(sp.status)}</TableCell></TableRow>)}</TableBody></Table>
        </div>}
        {/* SOURCING */}
        {activePage === 'sourcing' && <div className="space-y-6">
          <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Sourcing Requests</h2><Button onClick={() => setNewReqOpen(true)}><Plus className="w-4 h-4 mr-2" />New Request</Button></div>
          <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Brand</TableHead><TableHead>Status</TableHead><TableHead>Created By</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{requests.map(r => <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailReq(r)}><TableCell className="font-medium">{r.productName}</TableCell><TableCell>{r.brandName || 'N/A'}</TableCell><TableCell>{statusBadge(r.status)}</TableCell><TableCell>{r.createdUser.name || r.createdUser.email}</TableCell><TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell></TableRow>)}</TableBody></Table>
        </div>}
        {/* APPROVALS */}
        {activePage === 'approval' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">Pending Approvals</h2>
          {requests.filter(r => r.status === 'PENDING_ADMIN_APPROVAL').length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">No pending approvals</CardContent></Card> : (
            <Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Brand</TableHead><TableHead>Created By</TableHead><TableHead>Date</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{requests.filter(r => r.status === 'PENDING_ADMIN_APPROVAL').map(r => <TableRow key={r.id}><TableCell className="font-medium">{r.productName}</TableCell><TableCell>{r.brandName || 'N/A'}</TableCell><TableCell>{r.createdUser.name || r.createdUser.email}</TableCell><TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell><TableCell><div className="flex gap-2"><Button size="sm" onClick={() => handleApproveReq(r.id)}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button><Button size="sm" variant="destructive" onClick={() => openRejectDialog('request', r.id)}><XCircle className="w-4 h-4 mr-1" />Reject</Button></div></TableCell></TableRow>)}</TableBody></Table>
          )}
        </div>}
        {/* TRIPS */}
        {activePage === 'sourcing-trips' && <div className="space-y-6">
          <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Sourcing Trips</h2><Button onClick={() => { setTripDialogOpen(true); setTripReqId('') }}><Plus className="w-4 h-4 mr-2" />New Trip</Button></div>
          <Table><TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Status</TableHead><TableHead>Locations</TableHead></TableRow></TableHeader><TableBody>{sourcingTrips.map(t => <TableRow key={t.id}><TableCell className="font-medium">{requests.find(r => r.id === t.requestId)?.productName || t.requestId}</TableCell><TableCell>{statusBadge(t.status)}</TableCell><TableCell>{(t.locations || []).length}</TableCell><TableCell>{t.status === 'OPEN' && <Button size="sm" variant="outline" onClick={() => closeTrip(t.id)}>Close</Button>}</TableCell></TableRow>)}</TableBody></Table>
        </div>}
        {/* PACKING */}
        {activePage === 'packing' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">Packing Lists</h2>
          {requests.filter(r => r.packingLists && r.packingLists.length > 0).length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">No packing lists yet.</CardContent></Card> : requests.filter(r => r.packingLists && r.packingLists.length > 0).map(r => r.packingLists!.map(pl => <Card key={pl.id}><CardHeader><CardTitle>{r.productName}</CardTitle><CardDescription>Order: {pl.orderQty} | Ship: {pl.shipmentQty} | CBM: {pl.totalCbm}</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Ctn From</TableHead><TableHead>Ctn To</TableHead><TableHead>No Ctn</TableHead><TableHead>Color</TableHead><TableHead>Ship Qty</TableHead></TableRow></TableHeader><TableBody>{pl.cartons.map((c, i) => <TableRow key={i}><TableCell>{c.cartonNoFrom}</TableCell><TableCell>{c.cartonNoTo}</TableCell><TableCell>{c.noOfCartons}</TableCell><TableCell>{c.color}</TableCell><TableCell>{c.shipQty}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>))}
        </div>}
        {/* QC & WAREHOUSE */}
        {activePage === 'qc-costs' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">QC & Warehouse Costing</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle>Create QC Report</CardTitle></CardHeader><CardContent className="space-y-4">
              <Select value={qcFormReqId} onValueChange={setQcFormReqId}><SelectTrigger><SelectValue placeholder="Select approved request" /></SelectTrigger><SelectContent>{approvedReqs.map(r => <SelectItem key={r.id} value={r.id}>{r.productName}</SelectItem>)}</SelectContent></Select>
              <div className="flex items-center gap-2"><Checkbox checked={qcLunchFlag} onCheckedChange={v => setQcLunchFlag(!!v)} /><Label>Lunch Cost</Label></div>
              {qcLunchFlag && <Input type="number" placeholder="Lunch cost" value={qcLunchCost} onChange={e => setQcLunchCost(e.target.value)} />}
              <Input type="number" placeholder="Goods carrying cost" value={qcGoodsCost} onChange={e => setQcGoodsCost(e.target.value)} />
              <Select value={qcTravelMode} onValueChange={setQcTravelMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TRAVELLING_WITH_GOODS">Travelling with Goods</SelectItem><SelectItem value="TRAVELLING_INDIVIDUALLY">Travelling Individually</SelectItem></SelectContent></Select>
              {qcTravelMode === 'TRAVELLING_INDIVIDUALLY' && <Input type="number" placeholder="Extra travel cost" value={qcExtraCost} onChange={e => setQcExtraCost(e.target.value)} />}
              <p className="text-sm text-muted-foreground">Estimated total: {qcEstimate.toFixed(2)}</p>
              <Button onClick={submitQC} disabled={!qcFormReqId}>Submit QC Report</Button>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Add Warehouse Costs</CardTitle></CardHeader><CardContent className="space-y-4">
              <Select value={whQcReportId} onValueChange={setWhQcReportId}><SelectTrigger><SelectValue placeholder="Select QC report" /></SelectTrigger><SelectContent>{qcWithCostReqs.map(r => <SelectItem key={r.id} value={r.qcReport!.id}>{r.productName} ({r.qcReport!.reportId})</SelectItem>)}</SelectContent></Select>
              <Input type="number" placeholder="Loader cost" value={whLoader} onChange={e => setWhLoader(e.target.value)} />
              <Input type="number" placeholder="Extra worker cost" value={whExtraWorker} onChange={e => setWhExtraWorker(e.target.value)} />
              <Button onClick={submitWarehouse} disabled={!whQcReportId || !whLoader}>Save Warehouse Costs</Button>
            </CardContent></Card>
          </div>
        </div>}
        {/* INVOICES */}
        {activePage === 'invoices' && <div className="space-y-6">
          <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Invoices</h2><Button onClick={() => setNewInvOpen(true)}><Plus className="w-4 h-4 mr-2" />New Invoice</Button></div>
          <Table><TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Buyer</TableHead><TableHead>Status</TableHead><TableHead>Total</TableHead><TableHead>Currency</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{invoices.map(inv => <TableRow key={inv.id} className="cursor-pointer" onClick={() => setDetailInv(inv)}><TableCell className="font-medium">{inv.invoiceNo}</TableCell><TableCell>{inv.buyerName}</TableCell><TableCell>{statusBadge(inv.status)}</TableCell><TableCell>{inv.totalValue.toFixed(2)}</TableCell><TableCell>{inv.targetCurrency}</TableCell><TableCell>{new Date(inv.createdAt).toLocaleDateString()}</TableCell></TableRow>)}</TableBody></Table>
        </div>}
        {/* EXCHANGE RATES */}
        {activePage === 'exchange-rates' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">Exchange Rates</h2>
          <Card><CardHeader><CardTitle>Publish New Rate</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4"><Select value={erSource} onValueChange={setErSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="BDT">BDT</SelectItem></SelectContent></Select><Select value={erTarget} onValueChange={setErTarget}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="BDT">BDT</SelectItem></SelectContent></Select></div>
            <Input type="number" placeholder="Rate" value={erRate} onChange={e => setErRate(e.target.value)} />
            <Input type="date" value={erDate} onChange={e => setErDate(e.target.value)} />
            <Button onClick={submitExchangeRate} disabled={!erRate || !erDate}>Publish Rate</Button>
          </CardContent></Card>
          <Table><TableHeader><TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Rate</TableHead><TableHead>Effective Date</TableHead></TableRow></TableHeader><TableBody>{exchangeRates.map(er => <TableRow key={er.id}><TableCell>{er.sourceCurrency}</TableCell><TableCell>{er.targetCurrency}</TableCell><TableCell>{er.rate}</TableCell><TableCell>{new Date(er.effectiveDate).toLocaleDateString()}</TableCell></TableRow>)}</TableBody></Table>
        </div>}
        {/* EXPENSES */}
        {activePage === 'expenses' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">Expenses</h2>
          <Table><TableHeader><TableRow><TableHead>Sister Profile</TableHead><TableHead>Source</TableHead><TableHead>Amount</TableHead><TableHead>Currency</TableHead><TableHead>Remarks</TableHead></TableRow></TableHeader><TableBody>{expenses.map((e: { id: string; sisterProfileId: string; sourceType: string; amount: number; currency: string; remarks: string }) => <TableRow key={e.id}><TableCell>{sisterProfiles.find(sp => sp.id === e.sisterProfileId)?.name || e.sisterProfileId}</TableCell><TableCell>{e.sourceType}</TableCell><TableCell>{e.amount.toFixed(2)}</TableCell><TableCell>{e.currency}</TableCell><TableCell className="max-w-xs truncate">{e.remarks}</TableCell></TableRow>)}</TableBody></Table>
        </div>}
        {/* SETTLEMENT */}
        {activePage === 'settlement' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">Settlement</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{sisterProfiles.map(sp => <Card key={sp.id} className="cursor-pointer" onClick={() => { setSelectedSettlementSP(sp.id); fetchSettlement(sp.id) }}><CardHeader><CardTitle>{sp.name}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Click to view settlement</p></CardContent></Card>)}</div>
          {selectedSettlementSP && settlementData && <Card><CardHeader><CardTitle>Settlement Details</CardTitle></CardHeader><CardContent className="space-y-2"><p>Total Purchases: <strong>{(settlementData as Record<string, number>)?.totalPurchases?.toFixed(2) ?? '—'}</strong></p><p>Total Expenses: <strong>{(settlementData as Record<string, number>)?.totalExpenses?.toFixed(2) ?? '—'}</strong></p><Separator /><p>Net Balance: <strong>{(settlementData as Record<string, number>)?.netBalance?.toFixed(2) ?? '—'}</strong></p></CardContent></Card>}
        </div>}
        {/* AUDIT LOG */}
        {activePage === 'audit-log' && <div className="space-y-6">
          <h2 className="text-2xl font-bold">Audit Log</h2>
          <Table><TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>ID</TableHead></TableRow></TableHeader><TableBody>{auditLogs.map((a: { id: string; action: string; entityType: string; entityId: string; timestamp: string }) => <TableRow key={a.id}><TableCell>{new Date(a.timestamp).toLocaleString()}</TableCell><TableCell>{a.action}</TableCell><TableCell>{a.entityType}</TableCell><TableCell className="font-mono text-xs">{a.entityId}</TableCell></TableRow>)}</TableBody></Table>
        </div>}
      </div></main>
      {/* ═══ DIALOGS ═══ */}
      {/* New Sourcing Request */}
      <Dialog open={newReqOpen} onOpenChange={setNewReqOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>New Sourcing Request</DialogTitle></DialogHeader><div className="space-y-4">
        <div><Label>Product Name *</Label><Input value={productName} onChange={e => setProductName(e.target.value)} /></div>
        <div><Label>Brand Name</Label><Input value={formBrandName} onChange={e => setFormBrandName(e.target.value)} /></div>
        <Select value={formSisterProfileId} onValueChange={setFormSisterProfileId}><SelectTrigger><SelectValue placeholder="Sister Profile (optional)" /></SelectTrigger><SelectContent>{sisterProfiles.map(sp => <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>)}</SelectContent></Select>
        <div><Label>Packing List Notes</Label><Textarea value={packingNotes} onChange={e => setPackingNotes(e.target.value)} /></div>
        <Label>Variants</Label>
        {formVariants.map((v, i) => <div key={i} className="grid grid-cols-6 gap-2 mb-2"><Input placeholder="Style No" value={v.styleNo} onChange={e => handleVariantChange(i, 'styleNo', e.target.value)} /><Input placeholder="Buyer" value={v.buyer} onChange={e => handleVariantChange(i, 'buyer', e.target.value)} /><Input placeholder="PO No" value={v.poNo} onChange={e => handleVariantChange(i, 'poNo', e.target.value)} /><Input placeholder="Color" value={v.color} onChange={e => handleVariantChange(i, 'color', e.target.value)} /><Input placeholder="Size" value={v.size} onChange={e => handleVariantChange(i, 'size', e.target.value)} /><div className="flex gap-1"><Input type="number" placeholder="Qty" value={v.qtyOrdered} onChange={e => handleVariantChange(i, 'qtyOrdered', e.target.value)} />{formVariants.length > 1 && <Button size="sm" variant="destructive" onClick={() => removeVariant(i)}><Trash2 className="w-3 h-3" /></Button>}</div></div>)}
        <Button size="sm" variant="outline" onClick={addVariant}><Plus className="w-3 h-3 mr-1" />Add Variant</Button>
        <Button onClick={submitSourcing} disabled={submitting || !productName.trim()}>{submitting ? 'Creating...' : 'Create Request'}</Button>
      </div></DialogContent></Dialog>
      {/* Request Detail */}
      <Dialog open={!!detailReq} onOpenChange={() => setDetailReq(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Request Details</DialogTitle></DialogHeader>{detailReq && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4"><div><Label className="text-muted-foreground">Product</Label><p className="font-medium">{detailReq.productName}</p></div><div><Label className="text-muted-foreground">Status</Label><p>{statusBadge(detailReq.status)}</p></div><div><Label className="text-muted-foreground">Brand</Label><p>{detailReq.brandName || 'N/A'}</p></div><div><Label className="text-muted-foreground">Created By</Label><p>{detailReq.createdUser.name || detailReq.createdUser.email}</p></div></div>
        {detailReq.variants.length > 0 && <Table><TableHeader><TableRow><TableHead>Style</TableHead><TableHead>Buyer</TableHead><TableHead>PO</TableHead><TableHead>Color</TableHead><TableHead>Size</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader><TableBody>{detailReq.variants.map((v, i) => <TableRow key={i}><TableCell>{v.styleNo}</TableCell><TableCell>{v.buyer}</TableCell><TableCell>{v.poNo}</TableCell><TableCell>{v.color}</TableCell><TableCell>{v.size}</TableCell><TableCell>{v.qtyOrdered}</TableCell></TableRow>)}</TableBody></Table>}
        {detailReq.status === 'PENDING_ADMIN_APPROVAL' && <div className="flex gap-2 pt-4 border-t"><Button onClick={() => handleApproveReq(detailReq.id)}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button><Button variant="destructive" onClick={() => openRejectDialog('request', detailReq.id)}><XCircle className="w-4 h-4 mr-1" />Reject</Button></div>}
        {detailReq.status === 'APPROVED_FOR_QC' && <div className="flex gap-2 pt-4 border-t"><Button onClick={() => openPackingListForm(detailReq)}><ClipboardList className="w-4 h-4 mr-1" />Create Packing List</Button></div>}
      </div>}</DialogContent></Dialog>
      {/* New Buyer */}
      <Dialog open={newBuyerOpen} onOpenChange={setNewBuyerOpen}><DialogContent><DialogHeader><DialogTitle>New Buyer Profile</DialogTitle></DialogHeader><div className="space-y-4">
        <div><Label>Name *</Label><Input value={buyerName} onChange={e => setBuyerName(e.target.value)} /></div>
        <div><Label>Contact Info</Label><Input value={buyerContact} onChange={e => setBuyerContact(e.target.value)} /></div>
        <div><Label>Branding</Label><Input value={buyerBranding} onChange={e => setBuyerBranding(e.target.value)} /></div>
        <div><Label>Portal Username</Label><Input value={buyerPortalUser} onChange={e => setBuyerPortalUser(e.target.value)} /></div>
        <div><Label>Portal Password</Label><Input type="password" value={buyerPortalPass} onChange={e => setBuyerPortalPass(e.target.value)} /></div>
        <Button onClick={submitBuyer} disabled={!buyerName.trim()}>Create Buyer</Button>
      </div></DialogContent></Dialog>
      {/* New Sister Profile */}
      <Dialog open={newSisterOpen} onOpenChange={setNewSisterOpen}><DialogContent><DialogHeader><DialogTitle>New Sister Profile</DialogTitle></DialogHeader><div className="space-y-4">
        <Select value={sisterBuyerId} onValueChange={setSisterBuyerId}><SelectTrigger><SelectValue placeholder="Select buyer *" /></SelectTrigger><SelectContent>{buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
        <div><Label>Name *</Label><Input value={sisterName} onChange={e => setSisterName(e.target.value)} /></div>
        <div><Label>PO Reference</Label><Input value={sisterPO} onChange={e => setSisterPO(e.target.value)} /></div>
        <Select value={sisterAgreement} onValueChange={setSisterAgreement}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TYPE_1">Type 1 (% commission)</SelectItem><SelectItem value="TYPE_2">Type 2 (BDT/unit)</SelectItem><SelectItem value="TYPE_3">Type 3 (% on expenses)</SelectItem></SelectContent></Select>
        <Input type="number" placeholder="Negotiated rate" value={sisterRate} onChange={e => setSisterRate(e.target.value)} />
        <Textarea placeholder="Terms" value={sisterTerms} onChange={e => setSisterTerms(e.target.value)} />
        <Button onClick={submitSisterProfile} disabled={!sisterBuyerId || !sisterName.trim()}>Create Sister Profile</Button>
      </div></DialogContent></Dialog>
      {/* New Invoice */}
      <Dialog open={newInvOpen} onOpenChange={setNewInvOpen}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader><div className="space-y-4">
        <Input placeholder="Buyer Name *" value={invBuyer} onChange={e => setInvBuyer(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Select value={invRateId || 'none'} onValueChange={v => setInvRateId(v === 'none' ? '' : v)}><SelectTrigger><SelectValue placeholder="Exchange Rate (optional)" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{exchangeRates.map(er => <SelectItem key={er.id} value={er.id}>{er.sourceCurrency}/{er.targetCurrency} @ {er.rate}</SelectItem>)}</SelectContent></Select>
          <div className="grid grid-cols-2 gap-2"><Select value={invCommType} onValueChange={setInvCommType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">No Commission</SelectItem><SelectItem value="PERCENTAGE">Percentage</SelectItem><SelectItem value="FIXED">Fixed</SelectItem></SelectContent></Select>{invCommType !== 'NONE' && <Input type="number" placeholder="Value" value={invCommValue} onChange={e => setInvCommValue(e.target.value)} />}</div>
        </div>
        <Separator /><Label>Line Items</Label>
        {invLineItems.map((li, i) => <div key={i} className="grid grid-cols-4 gap-2"><Input placeholder="Description *" value={li.description} onChange={e => handleLIChange(i, 'description', e.target.value)} /><Input placeholder="Brand" value={li.brand} onChange={e => handleLIChange(i, 'brand', e.target.value)} /><Input type="number" placeholder="Ctns" value={li.ctn || ''} onChange={e => handleLIChange(i, 'ctn', e.target.value)} /><div className="flex gap-1"><Input type="number" placeholder="Qty/Ctn" value={li.qtyPerCtn || ''} onChange={e => handleLIChange(i, 'qtyPerCtn', e.target.value)} />{invLineItems.length > 1 && <Button size="sm" variant="destructive" onClick={() => removeLI(i)}><Trash2 className="w-3 h-3" /></Button>}</div></div>)}
        <Button size="sm" variant="outline" onClick={addLI}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
        <Button onClick={submitInvoice}>Create Invoice</Button>
      </div></DialogContent></Dialog>
      {/* Invoice Detail */}
      <Dialog open={!!detailInv} onOpenChange={() => setDetailInv(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Invoice Details</DialogTitle></DialogHeader>{detailInv && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4"><div><Label className="text-muted-foreground">Invoice #</Label><p className="font-medium">{detailInv.invoiceNo}</p></div><div><Label className="text-muted-foreground">Status</Label><p>{statusBadge(detailInv.status)}</p></div><div><Label className="text-muted-foreground">Buyer</Label><p>{detailInv.buyerName}</p></div><div><Label className="text-muted-foreground">Total</Label><p>{detailInv.totalValue.toFixed(2)} {detailInv.targetCurrency}</p></div></div>
        {detailInv.lineItems.length > 0 && <Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Brand</TableHead><TableHead>Ctns</TableHead><TableHead>Total Qty</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>{detailInv.lineItems.map((li, i) => <TableRow key={i}><TableCell>{li.description}</TableCell><TableCell>{li.brand}</TableCell><TableCell>{li.ctn}</TableCell><TableCell>{li.totalQty}</TableCell><TableCell>{li.amount.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>}
        {detailInv.status === 'PENDING' && <div className="flex gap-2 pt-4 border-t"><Button onClick={() => approveInvoice(detailInv.id)}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button><Button variant="destructive" onClick={() => openRejectDialog('invoice', detailInv.id)}><XCircle className="w-4 h-4 mr-1" />Reject</Button></div>}
        {detailInv.status === 'APPROVED' && <div className="flex gap-2 pt-4 border-t"><Button variant="outline" onClick={() => { setPayInvId(detailInv.id); setPayAmount(''); setPayRef('') }}><Banknote className="w-4 h-4 mr-1" />Record Payment</Button><Button variant="destructive" onClick={() => openRejectDialog('void', detailInv.id)}>Void</Button></div>}
      </div>}</DialogContent></Dialog>
      {/* Reject / Void */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{rejectTarget?.type === 'void' ? 'Void Invoice' : 'Confirm Rejection'}</AlertDialogTitle><AlertDialogDescription>Please provide a reason.</AlertDialogDescription></AlertDialogHeader><Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason..." /><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmReject}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {/* Sourcing Trip */}
      <Dialog open={tripDialogOpen} onOpenChange={setTripDialogOpen}><DialogContent><DialogHeader><DialogTitle>New Sourcing Trip</DialogTitle></DialogHeader><div className="space-y-4">
        <Select value={tripReqId} onValueChange={setTripReqId}><SelectTrigger><SelectValue placeholder="Select approved request *" /></SelectTrigger><SelectContent>{approvedReqsNoTrip.map(r => <SelectItem key={r.id} value={r.id}>{r.productName}</SelectItem>)}</SelectContent></Select>
        <Label>Locations</Label>
        {tripLocations.map((loc, i) => <div key={i} className="grid grid-cols-4 gap-2"><Input placeholder="Location" value={loc.locationName} onChange={e => updateTripLocation(i, 'locationName', e.target.value)} /><Input type="number" placeholder="Qty" value={loc.quantity} onChange={e => updateTripLocation(i, 'quantity', e.target.value)} /><Input type="number" placeholder="Advance" value={loc.advanceAmount} onChange={e => updateTripLocation(i, 'advanceAmount', e.target.value)} /><Input type="date" value={loc.date} onChange={e => updateTripLocation(i, 'date', e.target.value)} /></div>)}
        <Button size="sm" variant="outline" onClick={addTripLocation}><Plus className="w-3 h-3 mr-1" />Add Location</Button>
        <Button onClick={submitSourcingTrip} disabled={!tripReqId}>Create Trip</Button>
      </div></DialogContent></Dialog>
      {/* Payment */}
      <Dialog open={!!payInvId} onOpenChange={() => setPayInvId('')}><DialogContent><DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader><div className="space-y-4">
        <Input type="number" placeholder="Amount *" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
        <Input placeholder="Bank Reference" value={payRef} onChange={e => setPayRef(e.target.value)} />
        <Button onClick={submitPayment} disabled={!payAmount}>Record Payment</Button>
      </div></DialogContent></Dialog>
    </div>
  )
}
