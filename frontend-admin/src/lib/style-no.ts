let _styleCounter = 0

/** Sequential auto-suggestion (PRO-0001, PRO-0002, ...) — shared between
 * Sourcing Intake and Packing List so both auto-generate Style No the same
 * way. Always editable/overridable by the user; not server-enforced (unlike
 * a PackingList's own PKG-#### referenceCode, which is auto-generated and
 * immutable — see apps.packing.models.generate_packing_list_reference_code). */
export function nextStyleNo(): string {
  _styleCounter += 1
  return "PRO-" + String(_styleCounter).padStart(4, "0")
}
