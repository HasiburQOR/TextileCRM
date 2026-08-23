import { useMemo } from "react"
import { CodeCell } from "@/components/CodeCell"
import { getCellValue } from "@/components/sourcing/GridColumns"
import type { Product, ProductVariant } from "@/types/sourcing"
import type { ProductTemplateFieldEntry } from "@/types/templates"

/** Build a compact QR payload that fits within QR v40 EC-L (~2 953 bytes).
 *  sizeBreakdown is flattened to "S:100/M:200/L:200" to save space. */
function buildVariantQrPayload(
  product: Product,
  variant: ProductVariant,
  templateColumns: ProductTemplateFieldEntry[],
): Record<string, unknown> {
  const customFields: Record<string, string> = {}
  for (const c of templateColumns) {
    const v = (getCellValue(variant.customFieldValues, c) as string) || ""
    if (v) customFields[c.label] = v
  }
  return {
    style: product.styleNumber,
    name: product.name,
    brand: product.brandName,
    po: product.poNo || "",
    material: product.material || "",
    ref: product.sisterProfilePoReference,
    vStyle: variant.variantStyleNo || "",
    ctnSl: variant.ctnSl || "",
    color: variant.colorName || "",
    desc: variant.description || "",
    vMat: variant.material || "",
    pattern: variant.patternNo || "",
    qty: variant.orderQty,
    sizes: variant.sizeBreakdown.map((e) => `${e.size_label}:${e.quantity}`).join("/"),
    pcCtn: variant.pcsPerCarton,
    ctns: variant.noOfCartons,
    ttlPcs: variant.totalPcs,
    price: variant.unitPrice ?? "",
    amt: variant.totalAmount,
    gw: variant.totalGrossWeight,
    nw: variant.totalNetWeight,
    cbm: variant.totalCbm,
    rmk: variant.remarks || "",
    ...customFields,
  }
}

interface VariantCodeCellProps {
  product: Product
  variant: ProductVariant
  templateColumns: ProductTemplateFieldEntry[]
}

export function VariantCodeCell({ product, variant, templateColumns }: VariantCodeCellProps) {
  const styleNo = variant.variantStyleNo || product.styleNumber
  const payload = useMemo(
    () => buildVariantQrPayload(product, variant, templateColumns),
    [product, variant, templateColumns],
  )

  return <CodeCell barcodeText={styleNo} qrPayload={payload} label={styleNo || "—"} downloadPrefix={styleNo || "variant"} />
}
