export type FieldType = "text" | "number" | "decimal" | "boolean" | "select"

export interface FieldGroup {
  id: string
  name: string
  description: string
}

export interface TemplateField {
  id: string
  fieldKey: string
  label: string
  fieldType: FieldType
  selectOptions: string[]
  isRequired: boolean
  fieldGroup: string | null
  fieldGroupName: string | null
  createdAt: string
}

export interface TemplateFieldCreateInput {
  fieldKey: string
  label: string
  fieldType: FieldType
  selectOptions: string[]
  isRequired: boolean
  fieldGroup: string | null
}

/** One selected field on a template, as returned nested under `fields`. */
export interface ProductTemplateFieldEntry {
  id: string // the underlying TemplateField's id
  fieldKey: string
  label: string
  fieldType: FieldType
  selectOptions: string[]
  isRequired: boolean
  fieldGroup: string | null
  displayOrder: number
}

export interface CoreFieldDescriptor {
  fieldKey: string
  label: string
}

export interface ProductTemplate {
  id: string
  name: string
  description: string
  isActive: boolean
  fields: ProductTemplateFieldEntry[]
  coreFields: CoreFieldDescriptor[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ProductTemplateCreateInput {
  name: string
  description: string
  isActive: boolean
  fieldIds: string[]
}

/** Product.customFields entry — both template-derived (value filled in at
 * intake) and ad hoc one-offs share this same shape. */
export interface CustomFieldEntry {
  label: string
  type: FieldType
  value: string
}
