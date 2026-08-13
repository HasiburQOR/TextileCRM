let _styleCounter = 0

/** Sequential auto-suggestion (STYLE-0001, STYLE-0002, ...) — shared between
 * Sourcing Intake and Packing List so both auto-generate Style No the same
 * way. Always editable/overridable by the user. */
export function nextStyleNo(): string {
  _styleCounter += 1
  return "STYLE-" + String(_styleCounter).padStart(4, "0")
}
