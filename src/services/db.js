import Dexie from 'dexie'

// ─── PharmaCare Offline DB (Dexie / IndexedDB) ──────────────────────────────
const db = new Dexie('PharmacareDB')

db.version(1).stores({
  // Products / medicines catalogue
  products: '++id, shop_id, name, generic_name, barcode, category, unit, requires_prescription, is_active, shelf_location, created_at',

  // FIFO stock batches — each purchase creates one or more batches
  product_batches: '++id, shop_id, product_id, batch_number, expiry_date, quantity_remaining, purchase_price, sale_price, created_at',

  // Customers (credit accounts)
  customers: '++id, shop_id, name, phone, balance, is_active, created_at',

  // Suppliers
  suppliers: '++id, shop_id, name, phone, company, balance, is_active, created_at',

  // Sales (invoices)
  sales: '++id, shop_id, customer_id, total_amount, discount, paid_amount, payment_type, prescription_number, served_by, created_at, synced',

  // Sale line items (includes batch info for FIFO traceability)
  sale_items: '++id, sale_id, product_id, batch_id, quantity, unit_price, discount, total, expiry_date',

  // Customer payments (credit settlements)
  customer_payments: '++id, shop_id, customer_id, amount, payment_type, note, created_at, synced',

  // Purchases (stock receipts)
  purchases: '++id, shop_id, supplier_id, invoice_number, total_amount, paid_amount, payment_type, status, created_at, synced',

  // Purchase line items — each line creates a product_batch
  purchase_items: '++id, purchase_id, product_id, batch_number, expiry_date, quantity, purchase_price, sale_price, bonus_qty',

  // Supplier payments
  supplier_payments: '++id, shop_id, supplier_id, amount, payment_type, note, created_at, synced',

  // Expenses
  expenses: '++id, shop_id, category, amount, description, date, created_by, created_at, synced',

  // Employees
  employees: '++id, shop_id, name, role, phone, salary, is_active, created_at',

  // Employee salary payments
  employee_payments: '++id, shop_id, employee_id, amount, month, note, created_at, synced',

  // Users (login accounts)
  users: '++id, shop_id, username, password_hash, role, is_active',

  // Audit log
  audit_log: '++id, shop_id, action, table_name, record_id, old_value, new_value, performed_by, created_at',

  // Sync queue — pending operations
  sync_queue: '++id, operation, table_name, record_id, payload, created_at, retries',

  // Trash — soft-deleted records (offline)
  trash_items: '++id, table_name, record_id, deleted_by, deleted_at',
})

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get available FIFO batches for a product (sorted by earliest expiry first).
 * Returns only batches with quantity_remaining > 0.
 */
export async function getFIFOBatches(productId) {
  const batches = await db.product_batches
    .where('product_id')
    .equals(productId)
    .filter(b => b.quantity_remaining > 0)
    .toArray()

  return batches.sort((a, b) => {
    // Sort by expiry date ascending (earliest expiry first = FIFO)
    if (!a.expiry_date) return 1
    if (!b.expiry_date) return -1
    return new Date(a.expiry_date) - new Date(b.expiry_date)
  })
}

/**
 * Deduct stock across batches using FIFO logic.
 * Returns an array of { batch_id, quantity_deducted, expiry_date, unit_price }.
 */
export async function deductFIFOStock(productId, quantityNeeded) {
  const batches = await getFIFOBatches(productId)
  const deductions = []
  let remaining = quantityNeeded

  for (const batch of batches) {
    if (remaining <= 0) break
    const deduct = Math.min(batch.quantity_remaining, remaining)
    deductions.push({
      batch_id: batch.id,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      unit_price: batch.sale_price,
      purchase_price: batch.purchase_price,
      quantity_deducted: deduct,
    })
    remaining -= deduct
  }

  if (remaining > 0) {
    throw new Error(`Insufficient stock. Short by ${remaining} units.`)
  }

  return deductions
}

/**
 * Get total stock quantity for a product (sum of all batch quantities).
 */
export async function getProductStock(productId) {
  const batches = await db.product_batches
    .where('product_id')
    .equals(productId)
    .filter(b => b.quantity_remaining > 0)
    .toArray()

  return batches.reduce((sum, b) => sum + (b.quantity_remaining || 0), 0)
}

/**
 * Get all products with current stock levels (computed).
 */
export async function getProductsWithStock(shopId) {
  const products = await db.products
    .where('shop_id')
    .equals(shopId)
    .filter(p => p.is_active !== false)
    .toArray()

  const withStock = await Promise.all(
    products.map(async p => ({
      ...p,
      stock: await getProductStock(p.id),
    }))
  )

  return withStock
}

/**
 * Get near-expiry batches within `days` days.
 */
export async function getNearExpiryBatches(shopId, days = 90) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const batches = await db.product_batches
    .filter(b => {
      if (!b.expiry_date || b.quantity_remaining <= 0) return false
      return b.expiry_date <= cutoffStr
    })
    .toArray()

  // Attach product names
  const products = await db.products.toArray()
  const productMap = Object.fromEntries(products.map(p => [p.id, p]))

  return batches
    .map(b => ({ ...b, product: productMap[b.product_id] }))
    .filter(b => b.product)
    .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
}

/**
 * Add to sync queue.
 */
export async function queueSync(operation, tableName, recordId, payload) {
  await db.sync_queue.add({
    operation,
    table_name: tableName,
    record_id: recordId,
    payload: JSON.stringify(payload),
    created_at: new Date().toISOString(),
    retries: 0,
  })
}

// ─── Named exports for backward-compatibility with template pages ────────────

/** Alias for queueSync — used by template pages like Expenses.jsx */
export const addToSyncQueue = queueSync

/**
 * Soft-delete a record by moving it to the trash table (IndexedDB).
 * Creates a `trash_items` record with snapshot of original data.
 */
export async function moveToTrash(tableName, record, deletedBy = null) {
  if (!db.trash_items) return // table not defined — skip silently
  await db.trash_items.add({
    id: Date.now(),
    table_name: tableName,
    record_id: record.id,
    data: JSON.stringify(record),
    deleted_by: deletedBy,
    deleted_at: new Date().toISOString(),
  })
}

/**
 * Restore a record from the trash (IndexedDB).
 * Removes the trash entry and re-adds the original record to its table.
 */
export async function restoreFromTrash(trashId) {
  const trashItem = await db.trash_items?.get(trashId)
  if (!trashItem) throw new Error('Trash item not found')
  const record = JSON.parse(trashItem.data)
  const table = db[trashItem.table_name]
  if (table) await table.put(record)
  await db.trash_items?.delete(trashId)
}

// ─── Also export db as a named export so template pages can do { db } ────────
export { db }

export default db
