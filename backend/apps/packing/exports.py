"""
Packing List document exports (Excel + PDF), rendered from a Product since
the Sourcing-Intake-as-Packing-List merge: the intake record IS the packing
list, so the document is generated from Product.packingDate/frontMark/
sideMark + the Product's variant rows (with their derived ship-qty /
short-excess / weight / CBM figures computed by
apps.sourcing.services.compute_variant_derived). Nothing here computes a
business figure — it only formats and sums what the models already hold.

Packing_List_Module_Instructions.md §6: "column headers must be
localizable, not hardcoded English strings in the template." No EN/KA
translation pipeline actually exists anywhere in this codebase yet, so real
bilingual output is out of scope for this change. ROW_HEADERS below is the
minimal honest version of that ask: one label lookup both renderers share,
so adding actual localization later is a lookup-table edit, not a template
rewrite.
"""

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.sourcing.models import Product

HEADER_FILL = "1E2937"
LINE_HEADER_FILL = "E5E7EB"
LINE_HEADER_FILL_HEX = "#" + LINE_HEADER_FILL

# Shared column set for the per-color row table in both exports — order here
# is the order columns render in, in both renderers. The first three
# (style-level) values come from the Product itself; the rest are per
# ProductVariant row. Identical to the pre-merge PackingCarton column set —
# no column was dropped in the merge.
ROW_COLUMNS = [
    ("styleNo", "Style No"),
    ("product", "Product"),
    ("poNo", "PO No"),
    ("colorName", "Color"),
    ("patternNo", "Pattern No"),
    ("ctnSl", "CTN SL"),
    ("description", "Description"),
    ("material", "Material"),
    ("cartonNoFrom", "CTN From"),
    ("cartonNoTo", "CTN To"),
    ("noOfCartons", "CTNS"),
    ("orderQty", "Order Qty"),
    ("shipQty", "Ship Qty"),
    ("sizeBreakdown", "Size Breakdown"),
    ("pcsPerCarton", "PC/CTN"),
    ("totalGrossWeight", "TTL G.W (kg)"),
    ("totalNetWeight", "TTL N.W (kg)"),
    ("totalCbm", "CBM"),
]
ROW_HEADERS = [label for _, label in ROW_COLUMNS]

# 1-based column indices (openpyxl) / 0-based (reportlab, computed at use)
# for the three Product-level columns, merged across all rows of the table
# (every row belongs to the same Product on a per-product packing list).
_MERGED_COLUMN_INDICES_1BASED = [1, 2, 3]


def _num(value, decimals=2) -> str:
    return f"{float(value or 0):,.{decimals}f}"


def _size_breakdown_text(size_breakdown: list) -> str:
    """Custom_Size_Breakdown_Feature.md: size_breakdown is a free-form array
    of {size_label, quantity}, not a fixed dict."""
    return " / ".join(f"{e.get('size_label', '')}:{e.get('quantity', 0)}" for e in (size_breakdown or [])) or "—"


def _row_values(product: Product, v) -> list:
    return [
        product.styleNumber,
        product.name,
        v.poNo or product.poNo or "—",
        v.colorName or "—",
        v.patternNo or "—",
        v.ctnSl or "—",
        v.description or "—",
        v.material or product.material or "—",
        v.cartonNoFrom if v.cartonNoFrom is not None else "—",
        v.cartonNoTo if v.cartonNoTo is not None else "—",
        v.noOfCartons,
        v.orderQty,
        v.shipQty,
        _size_breakdown_text(v.sizeBreakdown),
        v.pcsPerCarton,
        v.totalGrossWeight,
        v.totalNetWeight,
        v.totalCbm,
    ]


def _totals(product: Product, variants) -> dict:
    variants = list(variants)
    total_order = sum(v.orderQty for v in variants)
    total_ship = sum(v.shipQty for v in variants)
    short_excess = total_order - total_ship
    return {
        "totalOrderQty": total_order,
        "totalShipQty": total_ship,
        "shortExcessQty": short_excess,
        "shortExcessPct": _num(short_excess / total_order * 100) if total_order else "0.00",
        "totalCartonQty": sum(v.noOfCartons for v in variants),
        "totalGrossWeight": sum(v.totalGrossWeight for v in variants),
        "totalNetWeight": sum(v.totalNetWeight for v in variants),
        "totalCbm": sum(v.totalCbm for v in variants),
    }


def _buyer_block(product: Product) -> list[tuple]:
    sister = product.sisterProfile
    buyer = sister.buyerProfile
    rows = [
        ("Buyer", buyer.name),
        ("Buyer Ref", buyer.referenceCode),
    ]
    if buyer.branding:
        rows.append(("Branding", buyer.branding))
    if buyer.contactInfo:
        rows.append(("Contact", buyer.contactInfo))
    return rows


def _list_meta(product: Product) -> list[tuple]:
    sister = product.sisterProfile
    rows = [
        ("Sister Profile", sister.referenceCode),
        ("PO Reference", sister.poReference or "—"),
        ("Style No", product.styleNumber),
        ("PO No", product.poNo or "—"),
        ("Brand", product.brandName or "—"),
    ]
    if product.packingDate:
        rows.append(("Packing Date", str(product.packingDate)))
    if product.frontMark:
        rows.append(("Front Mark", product.frontMark.replace("\n", " / ")))
    if product.sideMark:
        rows.append(("Side Mark", product.sideMark.replace("\n", " / ")))
    return rows


def packing_list_filename(product: Product, ext: str) -> str:
    po = (product.poNo or product.styleNumber or product.id).replace(" ", "_").replace("/", "-")
    return f"packing_list_{po}.{ext}"


def render_packing_list_xlsx(product: Product) -> bytes:
    variants = list(product.variants.all())
    totals = _totals(product, variants)

    wb = Workbook()
    ws = wb.active
    ws.title = "Packing List"
    ws.sheet_view.showGridLines = False

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(ROW_HEADERS))
    title = ws.cell(row=1, column=1, value=f"Packing List — {product.poNo or product.styleNumber}")
    title.font = Font(bold=True, size=14, color="FFFFFF")
    title.fill = PatternFill("solid", fgColor=HEADER_FILL)
    title.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 26

    row = 3
    for label, value in _buyer_block(product) + _list_meta(product):
        ws.cell(row=row, column=1, value=label).font = Font(bold=True)
        ws.cell(row=row, column=2, value=str(value))
        row += 1
    row += 1

    for col_idx, header in enumerate(ROW_HEADERS, start=1):
        cell = ws.cell(row=row, column=col_idx, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=HEADER_FILL)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    header_row = row

    for v in variants:
        row += 1
        values = _row_values(product, v)
        for col_idx, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col_idx, value=value)
            cell.alignment = Alignment(horizontal="center" if col_idx >= 9 else "left", vertical="center")

    # Product-level columns merged across the whole table (one Product per
    # packing list since the merge).
    if variants:
        for col_idx in _MERGED_COLUMN_INDICES_1BASED:
            ws.merge_cells(start_row=header_row + 1, start_column=col_idx, end_row=row, end_column=col_idx)
            ws.cell(row=header_row + 1, column=col_idx).alignment = Alignment(horizontal="center", vertical="center")

    row += 2
    totals_rows = [
        ("Total Order Qty", totals["totalOrderQty"], "Total Ship Qty", totals["totalShipQty"]),
        ("Short/Excess Qty", f"{totals['shortExcessQty']} ({totals['shortExcessPct']}%)", "Total Cartons", totals["totalCartonQty"]),
        ("Total Gross Weight", _num(totals["totalGrossWeight"]), "Total Net Weight", _num(totals["totalNetWeight"])),
        ("Total CBM", _num(totals["totalCbm"], 4), "", ""),
    ]
    for label1, v1, label2, v2 in totals_rows:
        ws.cell(row=row, column=1, value=label1).font = Font(bold=True)
        ws.cell(row=row, column=2, value=v1)
        ws.cell(row=row, column=4, value=label2).font = Font(bold=True)
        ws.cell(row=row, column=5, value=v2)
        row += 1

    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    for col_idx in range(1, len(ROW_HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col_idx)].width = 14
    ws.column_dimensions["A"].width = 18
    ws.column_dimensions["B"].width = 24
    ws.column_dimensions["G"].width = 26

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def render_packing_list_pdf(product: Product) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("PLTitle", parent=styles["Title"], fontSize=17, spaceAfter=2)
    section_style = ParagraphStyle("Section", parent=styles["Heading3"], spaceBefore=8, spaceAfter=4)

    story = [
        Paragraph(f"Packing List — {product.poNo or product.styleNumber}", title_style),
        Spacer(1, 6),
    ]

    info_rows = [[Paragraph(f"<b>{l}</b>", styles["Normal"]), Paragraph(str(v), styles["Normal"])]
                 for l, v in (_buyer_block(product) + _list_meta(product))]
    info_table = Table(info_rows, colWidths=[40 * mm, 110 * mm])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
    ]))
    story.append(info_table)

    story.append(Paragraph("Carton Rows", section_style))
    variants = list(product.variants.all())
    totals = _totals(product, variants)
    data = [ROW_HEADERS]
    for v in variants:
        row_values = _row_values(product, v)
        # Format the decimal columns for display (raw model values are what
        # _row_values returns, shared with the XLSX renderer which wants
        # numbers rather than pre-formatted strings).
        row_values[15] = _num(row_values[15])
        row_values[16] = _num(row_values[16])
        row_values[17] = _num(row_values[17], 4)
        data.append([str(v) for v in row_values])

    col_widths = [16, 22, 14, 20, 14, 10, 20, 16, 10, 10, 8, 10, 10, 20, 8, 13, 13, 10]
    col_widths = [w * mm for w in col_widths]
    table_style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(LINE_HEADER_FILL_HEX)),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.2),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    # One Product per packing list since the merge, so the three
    # Product-level columns (Style No, Product, PO No) span every data row.
    if len(variants) > 1:
        for col in (0, 1, 2):
            table_style_commands.append(("SPAN", (col, 1), (col, len(variants))))
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle(table_style_commands))
    story.append(table)

    story.append(Paragraph("Totals", section_style))
    totals_rows = [
        ["Total Order Qty", str(totals["totalOrderQty"]), "Total Ship Qty", str(totals["totalShipQty"])],
        ["Short/Excess Qty", f"{totals['shortExcessQty']} ({totals['shortExcessPct']}%)", "Total Cartons", str(totals["totalCartonQty"])],
        ["Total Gross Weight", f"{_num(totals['totalGrossWeight'])} kg", "Total Net Weight", f"{_num(totals['totalNetWeight'])} kg"],
        ["Total CBM", _num(totals["totalCbm"], 4), "", ""],
    ]
    totals_table = Table(totals_rows, colWidths=[38 * mm, 38 * mm, 38 * mm, 38 * mm])
    totals_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.append(totals_table)

    doc.build(story)
    return buf.getvalue()

