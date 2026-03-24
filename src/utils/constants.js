// ─── Pharmacy Constants ──────────────────────────────────────────────────────

export const APP_NAME = 'PharmaCare POS'
export const APP_VERSION = '1.0.0'

// Medicine dosage forms / units
export const MEDICINE_UNITS = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'syrup', label: 'Syrup (ml)' },
  { value: 'injection', label: 'Injection (ml)' },
  { value: 'drops', label: 'Drops (ml)' },
  { value: 'ointment', label: 'Ointment (g)' },
  { value: 'cream', label: 'Cream (g)' },
  { value: 'powder', label: 'Powder (g)' },
  { value: 'sachet', label: 'Sachet' },
  { value: 'patch', label: 'Patch' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'suppository', label: 'Suppository' },
  { value: 'strip', label: 'Strip' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'vial', label: 'Vial' },
  { value: 'ampule', label: 'Ampule' },
  { value: 'tube', label: 'Tube' },
  { value: 'piece', label: 'Piece' },
  { value: 'box', label: 'Box' },
  { value: 'pack', label: 'Pack' },
]

// Drug categories
export const DRUG_CATEGORIES = [
  'Analgesic / Pain Relief',
  'Antibiotic',
  'Antiviral',
  'Antifungal',
  'Antiparasitic',
  'Antihistamine',
  'Antacid / GI',
  'Cardiovascular',
  'Diabetes / Antidiabetic',
  'Respiratory / Bronchodilator',
  'Vitamin / Supplement',
  'Dermatology',
  'Eye / Ear Drops',
  'Hormonal',
  'Neurological / CNS',
  'Psychiatric',
  'Oncology',
  'Immunosuppressant',
  'Surgical / Wound Care',
  'Dental',
  'Pediatric',
  'Contraceptive',
  'Herbal / Natural',
  'OTC / General',
  'Other',
]

// Shelf / storage locations
export const SHELF_LOCATIONS = [
  'A-1', 'A-2', 'A-3', 'A-4', 'A-5',
  'B-1', 'B-2', 'B-3', 'B-4', 'B-5',
  'C-1', 'C-2', 'C-3', 'C-4', 'C-5',
  'D-1', 'D-2', 'D-3', 'D-4', 'D-5',
  'Refrigerator', 'Freezer', 'Counter', 'Safe / Controlled',
]

// Payment methods
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit', label: 'Credit (Udhaar)' },
  { value: 'partial', label: 'Partial Payment' },
  { value: 'card', label: 'Card' },
  { value: 'easypaisa', label: 'EasyPaisa' },
  { value: 'jazzcash', label: 'JazzCash' },
]

// Expiry alert thresholds (in days)
export const EXPIRY_THRESHOLDS = {
  CRITICAL: 30,    // red — expires within 30 days
  WARNING: 90,     // orange — expires within 90 days
  NOTICE: 180,     // yellow — expires within 180 days
}

// Low stock alert threshold (units)
export const LOW_STOCK_THRESHOLD = 10

// Tax rate (percentage) — set to 0 if not applicable
export const DEFAULT_TAX_RATE = 0

// Currency
export const CURRENCY = 'Rs.'
export const CURRENCY_CODE = 'PKR'

// Receipt / invoice settings
export const RECEIPT_FOOTER = 'Thank you for visiting PharmaCare!'
export const SHOW_PRESCRIPTION_FLAG = true

// Discount modes
export const DISCOUNT_TYPES = [
  { value: 'flat', label: 'Rs.' },
  { value: 'percent', label: '%' },
]

// Controlled substances flag
export const CONTROLLED_DRUG_LABEL = '⚠️ Prescription Required'

// Purchase order statuses
export const PO_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'yellow' },
  { value: 'received', label: 'Received', color: 'green' },
  { value: 'partial', label: 'Partial', color: 'orange' },
  { value: 'cancelled', label: 'Cancelled', color: 'red' },
]

// Sale return reasons
export const RETURN_REASONS = [
  'Wrong medicine dispensed',
  'Patient refused',
  'Expired / near-expiry',
  'Damaged packaging',
  'Duplicate billing',
  'Other',
]

// Report date range presets
export const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'last_90', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' },
]

// Feature flags (plan-gating)
export const FEATURES = {
  FIFO_INVENTORY: 'fifo_inventory',
  EXPIRY_ALERTS: 'expiry_alerts',
  PRESCRIPTION_TRACKING: 'prescription_tracking',
  SUPPLIER_LEDGER: 'supplier_ledger',
  MULTI_STORE: 'multi_store',
  ADVANCED_REPORTS: 'advanced_reports',
  SMS_ALERTS: 'sms_alerts',
  BARCODE_SCANNER: 'barcode_scanner',
}
