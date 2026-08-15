"""
Invoice document exports (Excel + PDF) — both formats carry the same
content: full buyer identity (name, branding, contact info), the Sister
Profile / PO this invoice was raised against, every line item, commission
and currency-conversion figures, and the payment history. Nothing here is
computed — it only formats fields the Invoice model/services already
computed and locked.
"""

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.invoicing.models import Invoice

HEADER_FILL = "1E2937"
LINE_HEADER_FILL = "E5E7EB"
HEADER_FILL_HEX = "#" + HEADER_FILL
LINE_HEADER_FILL_HEX = "#" + LINE_HEADER_FILL


def _money(value) -> str:
    return f"{float(value or 0):,.2f}"


def invoice_filename(invoice: Invoice, ext: str) -> str:
    return f"{invoice.invoiceNo}.{ext}"


def _buyer_block(invoice: Invoice) -> list[tuple[str, str]]:
    sister_profile = invoice.sisterProfile
    buyer = sister_profile.buyerProfile
    rows = [
        ("Buyer", buyer.name),
        ("Branding", buyer.branding or "—"),
        ("Contact Info", (buyer.contactInfo or "—").replace("\n", ", ")),
        ("Sister Profile / PO", sister_profile.poReference or str(sister_profile.id)),
        ("Agreement Type", sister_profile.get_agreementType_display()),
    ]
    return rows


def _invoice_meta(invoice: Invoice) -> list[tuple[str, str]]:
    rows = [
        ("Invoice No", invoice.invoiceNo),
        ("Status", invoice.get_status_display()),
        ("Created", invoice.createdAt.strftime("%Y-%m-%d %H:%M")),
    ]
    if invoice.approvedAt:
        approver = invoice.approvedBy.display_name() if invoice.approvedBy else "—"
        rows.append(("Approved", f"{invoice.approvedAt.strftime('%Y-%m-%d %H:%M')} by {approver}"))
    if invoice.exchangeRate_id:
        rows.append((
            "Exchange Rate",
            f"1 = {invoice.exchangeRateValueLocked} {invoice.targetCurrency} (locked at generation)",
        ))
    return rows


def render_invoice_xlsx(invoice: Invoice) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Invoice"

    bold = Font(bold=True)
    header_font = Font(bold=True, color="FFFFFF", size=13)
    header_fill = PatternFill("solid", fgColor=HEADER_FILL)
    line_header_font = Font(bold=True)
    line_header_fill = PatternFill("solid", fgColor=LINE_HEADER_FILL)

    row = 1
    ws.merge_cells(f"A{row}:G{row}")
    cell = ws.cell(row=row, column=1, value=f"COMMERCIAL INVOICE — {invoice.invoiceNo}")
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[row].height = 26
    row += 2

    for label, value in _buyer_block(invoice):
        ws.cell(row=row, column=1, value=label).font = bold
        ws.cell(row=row, column=2, value=value)
        row += 1
    row += 1
    for label, value in _invoice_meta(invoice):
        ws.cell(row=row, column=1, value=label).font = bold
        ws.cell(row=row, column=2, value=value)
        row += 1
    row += 1

    line_headers = ["Description", "Style/Item", "Packing List", "Brand", "CTN", "Qty", "Unit Price", "Amount", "Remarks"]
    for col, text in enumerate(line_headers, start=1):
        c = ws.cell(row=row, column=col, value=text)
        c.font = line_header_font
        c.fill = line_header_fill
    row += 1
    for li in invoice.lineItems.all():
        ws.cell(row=row, column=1, value=li.description)
        ws.cell(row=row, column=2, value=li.styleItemCode)
        ws.cell(row=row, column=3, value=li.packingListRef)
        ws.cell(row=row, column=4, value=li.brand)
        ws.cell(row=row, column=5, value=li.ctn)
        ws.cell(row=row, column=6, value=li.totalQty)
        ws.cell(row=row, column=7, value=float(li.unitPrice))
        ws.cell(row=row, column=8, value=float(li.amount))
        ws.cell(row=row, column=9, value=li.remarks)
        row += 1
    row += 1

    totals = [
        ("Line Total", _money(invoice.totalValue)),
        ("Commission", _money(invoice.commission_amount())),
        ("Grand Total", _money(invoice.grand_total())),
    ]
    if invoice.exchangeRate_id:
        totals.append(("Converted Total", f"{_money(invoice.convertedTotal)} {invoice.targetCurrency}"))
    totals.append(("Outstanding", _money(invoice.outstandingBalance)))
    for label, value in totals:
        ws.cell(row=row, column=1, value=label).font = bold
        ws.cell(row=row, column=2, value=value)
        row += 1
    row += 1

    payments = list(invoice.payments.all())
    if payments:
        ws.cell(row=row, column=1, value="Payments").font = bold
        row += 1
        for col, text in enumerate(["Date", "Amount", "Currency", "Reference"], start=1):
            c = ws.cell(row=row, column=col, value=text)
            c.font = line_header_font
            c.fill = line_header_fill
        row += 1
        for p in payments:
            ws.cell(row=row, column=1, value=p.paymentDate.strftime("%Y-%m-%d"))
            ws.cell(row=row, column=2, value=float(p.amount))
            ws.cell(row=row, column=3, value=p.currency)
            ws.cell(row=row, column=4, value=p.bankReference)
            row += 1

    widths = [30, 16, 16, 16, 8, 8, 12, 12, 22]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def render_invoice_pdf(invoice: Invoice) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("InvoiceTitle", parent=styles["Title"], fontSize=18, spaceAfter=2)
    label_style = ParagraphStyle("Label", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#5C6270"))
    section_style = ParagraphStyle("Section", parent=styles["Heading3"], spaceBefore=10, spaceAfter=4)

    story = [
        Paragraph(f"Commercial Invoice — {invoice.invoiceNo}", title_style),
        Paragraph(f"Status: {invoice.get_status_display()}", label_style),
        Spacer(1, 8),
    ]

    info_rows = [[Paragraph(f"<b>{l}</b>", styles["Normal"]), Paragraph(v, styles["Normal"])]
                 for l, v in (_buyer_block(invoice) + _invoice_meta(invoice))]
    info_table = Table(info_rows, colWidths=[45 * mm, 120 * mm])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(info_table)

    story.append(Paragraph("Line Items", section_style))
    # Text columns go through Paragraph so long values (product names,
    # style/packing-list codes, remarks) WRAP inside their cell and the row
    # grows taller. Passing raw strings makes reportlab render one
    # unbreakable line that overflows into the neighbouring columns and
    # overprints them — which is exactly what a narrow Description column
    # plus a real product name produces.
    cell_style = ParagraphStyle(
        "LineCell", parent=styles["Normal"], fontSize=8, leading=9.5, wordWrap="CJK",
    )
    header_style = ParagraphStyle(
        "LineHeader", parent=cell_style, fontName="Helvetica-Bold",
    )
    line_header = ["Description", "Style/Item", "Packing List", "CTN", "Qty", "Unit Price", "Amount", "Remarks"]
    line_data = [[Paragraph(h, header_style) for h in line_header]]
    for li in invoice.lineItems.all():
        line_data.append([
            Paragraph(li.description or "—", cell_style),
            Paragraph(li.styleItemCode or "—", cell_style),
            Paragraph(li.packingListRef or "—", cell_style),
            str(li.ctn), str(li.totalQty),
            _money(li.unitPrice), _money(li.amount),
            Paragraph(li.remarks or "—", cell_style),
        ])
    # Sums to 174mm — the exact printable width at A4 with 18mm side margins.
    line_table = Table(
        line_data,
        colWidths=[40 * mm, 21 * mm, 21 * mm, 11 * mm, 13 * mm, 20 * mm, 22 * mm, 26 * mm],
        repeatRows=1,
    )
    line_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(LINE_HEADER_FILL_HEX)),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (3, 1), (6, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(line_table)

    story.append(Paragraph("Totals", section_style))
    totals_rows = [["Line Total", _money(invoice.totalValue)], ["Commission", _money(invoice.commission_amount())],
                    ["Grand Total", _money(invoice.grand_total())]]
    if invoice.exchangeRate_id:
        totals_rows.append(["Converted Total", f"{_money(invoice.convertedTotal)} {invoice.targetCurrency}"])
    totals_rows.append(["Outstanding", _money(invoice.outstandingBalance)])
    totals_table = Table(totals_rows, colWidths=[45 * mm, 40 * mm])
    totals_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#E5E7EB")),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.HexColor("#1E2937")),
    ]))
    story.append(totals_table)

    payments = list(invoice.payments.all())
    if payments:
        story.append(Paragraph("Payments", section_style))
        pay_data = [["Date", "Amount", "Currency", "Reference"]]
        for p in payments:
            pay_data.append([p.paymentDate.strftime("%Y-%m-%d"), _money(p.amount), p.currency, p.bankReference or "—"])
        pay_table = Table(pay_data, colWidths=[30 * mm, 30 * mm, 25 * mm, 60 * mm], repeatRows=1)
        pay_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(LINE_HEADER_FILL_HEX)),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ]))
        story.append(pay_table)

    doc.build(story)
    return buf.getvalue()
