/**
 * FIFO_Inventory.jsx — FIFO Inventory Management for Medical Store SaaS
 *
 * What is FIFO?
 * ─────────────
 *   First-In, First-Out: the oldest (earliest-expiry) batch of a product
 *   is always sold / dispensed before newer batches. This reduces waste
 *   and is legally required in pharmacy / medical contexts.
 *
 * Sections on this page
 * ──────────────────────
 *   1. Expiry Alert Banner   — counts of expired / expiring items at the top
 *   2. Batch List View       — filterable table of all batches, sorted FIFO
 *   3. Add Batch Modal       — receive new stock, assign shelf location
 *   4. FIFO Dispatch Panel   — sell/dispense, auto-selects batches in order
 *   5. Shelf Map             — visual grid of rack / bin contents
 *
 * Supabase tables used
 * ─────────────────────
 *   products       — id, name, (any other product fields)
 *   product_batches — id, shop_id, product_id, batch_number,
 *                       manufacture_date, expiry_date, purchase_price,
 *                       sale_price, quantity_received, quantity_remaining,
 *                       rack_no, bin_no, created_at
 *
 * All queries are automatically scoped to user.shop_id so this page is
 * fully multi-tenant safe — one query reads only that shop's data.
 *
 * Imports required
 * ─────────────────
 *   @/services/supabase  — named export `supabase`
 *   @/context/AuthContext — named export `useAuth`
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Days between today and a future date string (negative if already expired). */
function daysUntilExpiry(expiryDateStr) {
  if (!expiryDateStr) return null
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDateStr)
  return Math.floor((expiry - today) / (1000 * 60 * 60 * 24))
}

/**
 * Returns a status label and Tailwind colour classes for a batch row / badge
 * based on days until expiry.
 */
function expiryStatus(days) {
  if (days === null)  return { label: 'Unknown',        row: '',                          badge: 'bg-gray-100 text-gray-600' }
  if (days < 0)       return { label: 'Expired',        row: 'bg-red-50 border-red-200',  badge: 'bg-red-100 text-red-700' }
  if (days <= 30)     return { label: 'Expiring Soon',  row: 'bg-orange-50',              badge: 'bg-orange-100 text-orange-700' }
  if (days <= 90)     return { label: 'Expiring <90d',  row: 'bg-yellow-50',              badge: 'bg-yellow-100 text-yellow-700' }
  return               { label: 'OK',                   row: '',                          badge: 'bg-green-100 text-green-700' }
}

/** Format a date string to DD/MM/YYYY for display. */
function fmtDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Format a number as currency. Adjust locale / currency symbol as needed. */
function fmtPrice(n) {
  if (n == null) return '—'
  return `Rs ${Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Simple modal wrapper */
function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
                 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg
                      max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

/** Reusable form field wrapper */
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

// Common input class
const inputCls =
  'w-full px-3 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ' +
  'placeholder-gray-400 transition-all'

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

function FIFO_Inventory() {
  const { user } = useAuth()
  const shopId   = user?.shop_id

  // ── Data ────────────────────────────────────────────────────────────────────
  const [batches,  setBatches]  = useState([])   // all inventory batches
  const [products, setProducts] = useState([])   // product dropdown list
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState(null) // { msg, type: 'success'|'error' }

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [filterProduct,   setFilterProduct]   = useState('')
  const [filterShelf,     setFilterShelf]     = useState('')
  const [showExpired,     setShowExpired]     = useState(false)
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)

  // ── Active tab: 'batches' | 'dispatch' | 'shelf' ────────────────────────────
  const [activeTab, setActiveTab] = useState('batches')

  // ── Add Batch modal ──────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false)
  const defaultBatchForm = {
    product_id:           '',
    batch_number:         '',
    manufacture_date:     '',
    expiry_date:          '',
    purchase_price:       '',
    sale_price:  '',
    quantity_received:         '',
    rack_no:              '',
    bin_no:               '',
  }
  const [batchForm, setBatchForm] = useState(defaultBatchForm)

  // ── FIFO Dispatch ────────────────────────────────────────────────────────────
  const [dispatchProduct,  setDispatchProduct]  = useState('')
  const [dispatchQty,      setDispatchQty]      = useState('')
  const [dispatchPreview,  setDispatchPreview]  = useState([]) // batches to consume
  const [dispatchError,    setDispatchError]    = useState('')
  const [dispatchLoading,  setDispatchLoading]  = useState(false)

  // ─── Data fetching ────────────────────────────────────────────────────────────

  const fetchBatches = useCallback(async () => {
    if (!shopId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('product_batches')
        .select(`
          id, batch_number, manufacture_date, expiry_date,
          purchase_price, sale_price,
          quantity_received, quantity_remaining, rack_no, bin_no, created_at,
          products ( id, name )
        `)
        .eq('shop_id', shopId)
        .order('expiry_date', { ascending: true })  // FIFO order

      if (error) throw error
      setBatches(data || [])
    } catch (err) {
      console.error('[FIFO] Failed to load batches:', err)
      showToast('Failed to load inventory batches.', 'error')
    } finally {
      setLoading(false)
    }
  }, [shopId])

  const fetchProducts = useCallback(async () => {
    if (!shopId) return
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name')
        .eq('shop_id', shopId)
        .order('name')

      if (error) throw error
      setProducts(data || [])
    } catch (err) {
      console.error('[FIFO] Failed to load products:', err)
    }
  }, [shopId])

  useEffect(() => {
    fetchBatches()
    fetchProducts()
  }, [fetchBatches, fetchProducts])

  // ─── Toast helper ─────────────────────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ─── Derived / computed values ────────────────────────────────────────────────

  /**
   * Alert counts — computed from all batches regardless of filters.
   * These drive the top banner.
   */
  const alerts = useMemo(() => {
    let expired = 0, expiring30 = 0, expiring90 = 0
    batches.forEach(b => {
      if (b.quantity_remaining <= 0) return // skip depleted batches
      const days = daysUntilExpiry(b.expiry_date)
      if (days === null) return
      if (days < 0)       expired++
      else if (days <= 30) expiring30++
      else if (days <= 90) expiring90++
    })
    return { expired, expiring30, expiring90 }
  }, [batches])

  /**
   * Filtered + sorted batch list for the table.
   * Sorted by expiry ASC from the DB query; filters applied here client-side.
   */
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const days = daysUntilExpiry(b.expiry_date)

      // Hide expired unless toggle is on
      if (!showExpired && days !== null && days < 0) return false

      // Low stock filter — batches with <= 10% of received qty remaining
      if (showLowStockOnly) {
        const threshold = Math.max(5, (b.quantity_received || 100) * 0.1)
        if (b.quantity_remaining > threshold) return false
      }

      // Product filter
      if (filterProduct && b.products?.id !== filterProduct) return false

      // Shelf filter — match rack or bin
      if (filterShelf) {
        const shelf = `${b.rack_no ?? ''} ${b.bin_no ?? ''}`.toLowerCase()
        if (!shelf.includes(filterShelf.toLowerCase())) return false
      }

      return true
    })
  }, [batches, showExpired, showLowStockOnly, filterProduct, filterShelf])

  /**
   * Shelf map data — group batches by rack_no.
   * Only shows batches with stock remaining and not expired.
   */
  const shelfMap = useMemo(() => {
    const map = {}
    batches.forEach(b => {
      const days = daysUntilExpiry(b.expiry_date)
      if (b.quantity_remaining <= 0) return
      if (days !== null && days < 0 && !showExpired) return
      const rack = b.rack_no || 'Unassigned'
      if (!map[rack]) map[rack] = []
      map[rack].push(b)
    })
    return map
  }, [batches, showExpired])

  // ─── Add Batch handlers ───────────────────────────────────────────────────────

  function handleBatchFormChange(field, value) {
    setBatchForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleAddBatch(e) {
    e.preventDefault()
    if (!batchForm.product_id || !batchForm.expiry_date || !batchForm.quantity_received) {
      showToast('Product, expiry date, and quantity received are required.', 'error')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('product_batches').insert({
        shop_id:              shopId,
        product_id:           batchForm.product_id,
        batch_number:         batchForm.batch_number  || null,
        manufacture_date:     batchForm.manufacture_date || null,
        expiry_date:          batchForm.expiry_date,
        purchase_price:       batchForm.purchase_price       ? Number(batchForm.purchase_price)      : null,
        sale_price:  batchForm.sale_price  ? Number(batchForm.sale_price) : null,
        quantity_received:         Number(batchForm.quantity_received),
        quantity_remaining:        Number(batchForm.quantity_received), // starts full
        rack_no:              batchForm.rack_no || null,
        bin_no:               batchForm.bin_no  || null,
      })

      if (error) throw error

      showToast('Batch added successfully.')
      setBatchForm(defaultBatchForm)
      setShowAddModal(false)
      fetchBatches()
    } catch (err) {
      console.error('[FIFO] Add batch error:', err)
      showToast(err.message || 'Failed to add batch.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── FIFO Dispatch handlers ───────────────────────────────────────────────────

  /**
   * When the user selects a product + enters a quantity, compute which
   * batches will be consumed (earliest expiry first) and how much from each.
   * This is a pure preview — nothing is saved yet.
   */
  function computeDispatchPlan(productId, qtyNeeded) {
    setDispatchError('')
    setDispatchPreview([])
    if (!productId || !qtyNeeded || Number(qtyNeeded) <= 0) return

    // Batches for this product, sorted by expiry ASC (FIFO order)
    const productBatches = batches
      .filter(b => b.products?.id === productId && b.quantity_remaining > 0)
      .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))

    const totalAvailable = productBatches.reduce((sum, b) => sum + b.quantity_remaining, 0)
    const needed = Number(qtyNeeded)

    if (needed > totalAvailable) {
      setDispatchError(
        `Insufficient stock. Available: ${totalAvailable} units across ${productBatches.length} batch(es).`
      )
      return
    }

    // Build the dispatch plan
    const plan = []
    let remaining = needed
    for (const batch of productBatches) {
      if (remaining <= 0) break
      const take = Math.min(batch.quantity_remaining, remaining)
      plan.push({ ...batch, take })
      remaining -= take
    }

    setDispatchPreview(plan)
  }

  async function handleConfirmDispatch() {
    if (!dispatchPreview.length) return
    setDispatchLoading(true)
    try {
      // Update each affected batch — decrement quantity_remaining
      for (const item of dispatchPreview) {
        const newQty = item.quantity_remaining - item.take
        const { error } = await supabase
          .from('product_batches')
          .update({ quantity_remaining: newQty })
          .eq('id', item.id)
          .eq('shop_id', shopId)

        if (error) throw error
      }

      showToast(
        `Dispatched ${dispatchPreview.reduce((s, i) => s + i.take, 0)} unit(s) across ` +
        `${dispatchPreview.length} batch(es).`
      )
      setDispatchProduct('')
      setDispatchQty('')
      setDispatchPreview([])
      fetchBatches()
    } catch (err) {
      console.error('[FIFO] Dispatch error:', err)
      showToast(err.message || 'Dispatch failed. Please try again.', 'error')
    } finally {
      setDispatchLoading(false)
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────

  function renderAlertBanner() {
    const { expired, expiring30, expiring90 } = alerts
    if (expired === 0 && expiring30 === 0 && expiring90 === 0) return null

    return (
      <div className="flex flex-wrap gap-3 mb-6">
        {expired > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                          bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
            {expired} batch{expired > 1 ? 'es' : ''} <strong>EXPIRED</strong>
          </div>
        )}
        {expiring30 > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                          bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />
            {expiring30} batch{expiring30 > 1 ? 'es' : ''} expiring in &lt;30 days
          </div>
        )}
        {expiring90 > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                          bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
            {expiring90} batch{expiring90 > 1 ? 'es' : ''} expiring in &lt;90 days
          </div>
        )}
      </div>
    )
  }

  function renderBatchTable() {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <svg className="animate-spin h-7 w-7 mr-3 text-blue-500"
               xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading batches…
        </div>
      )
    }

    if (!filteredBatches.length) {
      return (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none"
               viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
          </svg>
          <p className="font-medium">No batches found.</p>
          <p className="text-sm mt-1">Adjust filters or add a new batch.</p>
        </div>
      )
    }

    return (
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Product', 'Batch #', 'Expiry', 'Shelf', 'Qty Remaining', 'Purchase Price', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredBatches.map(batch => {
              const days   = daysUntilExpiry(batch.expiry_date)
              const status = expiryStatus(days)
              return (
                <tr
                  key={batch.id}
                  className={`border-b border-gray-100 hover:brightness-95 transition-all
                              ${status.row}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                    {batch.products?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">
                    {batch.batch_number || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-gray-700">{fmtDate(batch.expiry_date)}</span>
                    {days !== null && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {[batch.rack_no, batch.bin_no].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-800 font-semibold">
                    {batch.quantity_remaining}
                    <span className="text-gray-400 font-normal text-xs ml-1">
                      / {batch.quantity_received}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">
                    {fmtPrice(batch.purchase_price)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.badge}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  function renderDispatchPanel() {
    return (
      <div className="grid sm:grid-cols-2 gap-6">

        {/* ── Dispatch form ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-5">
            Dispatch / Sell Stock (FIFO)
          </h3>

          <div className="space-y-4">
            <Field label="Select Product" required>
              <select
                value={dispatchProduct}
                onChange={(e) => {
                  setDispatchProduct(e.target.value)
                  computeDispatchPlan(e.target.value, dispatchQty)
                }}
                className={inputCls}
              >
                <option value="">— Select a product —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Quantity to Dispatch" required>
              <input
                type="number"
                min="1"
                placeholder="e.g. 50"
                value={dispatchQty}
                onChange={(e) => {
                  setDispatchQty(e.target.value)
                  computeDispatchPlan(dispatchProduct, e.target.value)
                }}
                className={inputCls}
              />
            </Field>

            {dispatchError && (
              <p className="text-sm text-red-600 font-medium bg-red-50
                            border border-red-200 rounded-lg px-3 py-2">
                {dispatchError}
              </p>
            )}
          </div>
        </div>

        {/* ── Dispatch preview ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-5">
            FIFO Batch Allocation Preview
          </h3>

          {!dispatchPreview.length ? (
            <p className="text-sm text-gray-400 mt-4">
              Select a product and quantity to see which batches will be consumed.
            </p>
          ) : (
            <>
              <div className="space-y-2 mb-5">
                {dispatchPreview.map(item => {
                  const days   = daysUntilExpiry(item.expiry_date)
                  const status = expiryStatus(days)
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between
                                 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100"
                    >
                      <div>
                        <p className="font-semibold text-sm text-gray-800">
                          Batch: {item.batch_number || '(no batch #)'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Expiry: {fmtDate(item.expiry_date)}
                          {' · '}
                          <span className={`font-medium ${status.badge.split(' ')[1]}`}>
                            {status.label}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-700">
                          -{item.take}
                        </p>
                        <p className="text-xs text-gray-400">
                          of {item.quantity_remaining} avail.
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Summary row */}
              <div className="flex items-center justify-between
                              px-4 py-3 rounded-xl bg-gray-800 text-white mb-5">
                <span className="text-sm font-semibold">Total to dispatch</span>
                <span className="text-lg font-black">
                  {dispatchPreview.reduce((s, i) => s + i.take, 0)} units
                </span>
              </div>

              {/* Confirm button */}
              <button
                onClick={handleConfirmDispatch}
                disabled={dispatchLoading}
                className="w-full py-3 rounded-xl font-bold text-white
                           bg-blue-600 hover:bg-blue-500 active:scale-[0.98]
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all flex items-center justify-center gap-2"
              >
                {dispatchLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg"
                         fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10"
                              stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </>
                ) : (
                  'Confirm Dispatch'
                )}
              </button>
            </>
          )}
        </div>

      </div>
    )
  }

  function renderShelfMap() {
    const racks = Object.keys(shelfMap)
    if (!racks.length) {
      return (
        <div className="text-center py-16 text-gray-400">
          <p className="font-medium">No shelf data available.</p>
          <p className="text-sm mt-1">Add batches with rack / bin numbers to see the shelf map.</p>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {racks.sort().map(rack => (
          <div key={rack}
               className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h4 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-4 pb-2
                           border-b border-gray-100">
              Rack: {rack}
            </h4>
            <div className="space-y-2">
              {shelfMap[rack].map(batch => {
                const days   = daysUntilExpiry(batch.expiry_date)
                const status = expiryStatus(days)
                return (
                  <div
                    key={batch.id}
                    className={`flex items-center justify-between px-3 py-2.5
                                rounded-xl border ${status.row || 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {batch.products?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Bin: {batch.bin_no || '—'} · Exp: {fmtDate(batch.expiry_date)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end ml-3 shrink-0">
                      <span className="text-sm font-bold text-gray-700">
                        {batch.quantity_remaining}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full mt-1 ${status.badge}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-screen-xl mx-auto">

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[100] px-5 py-3 rounded-xl shadow-lg
                      text-sm font-semibold border
                      ${toast.type === 'error'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-green-50 border-green-200 text-green-700'}`}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Page header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            FIFO Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage stock batches in First-In, First-Out order
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                     bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm
                     shadow-md shadow-blue-600/30 active:scale-[0.98] transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v16m8-8H4" />
          </svg>
          Receive New Stock
        </button>
      </div>

      {/* ── Expiry alert banner ─────────────────────────────────────────────────── */}
      {renderAlertBanner()}

      {/* ── Tabs ─────────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {[
          { key: 'batches',  label: 'Batch List' },
          { key: 'dispatch', label: 'FIFO Dispatch' },
          { key: 'shelf',    label: 'Shelf Map' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all
                        ${activeTab === tab.key
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Batch List filters (only shown on batches tab) ──────────────────────── */}
      {activeTab === 'batches' && (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {/* Product filter */}
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All Products</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Shelf location text search */}
          <input
            type="text"
            placeholder="Filter by shelf/rack/bin…"
            value={filterShelf}
            onChange={(e) => setFilterShelf(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700
                       focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />

          {/* Show expired toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
              className="rounded border-gray-400 text-blue-500 focus:ring-blue-500 w-4 h-4"
            />
            Show expired
          </label>

          {/* Low stock toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(e) => setShowLowStockOnly(e.target.checked)}
              className="rounded border-gray-400 text-blue-500 focus:ring-blue-500 w-4 h-4"
            />
            Low stock only
          </label>

          {/* Row count badge */}
          <span className="ml-auto text-xs text-gray-400 font-medium">
            {filteredBatches.length} batch{filteredBatches.length !== 1 ? 'es' : ''}
          </span>
        </div>
      )}

      {/* ── Tab content ──────────────────────────────────────────────────────────── */}
      {activeTab === 'batches'  && renderBatchTable()}
      {activeTab === 'dispatch' && renderDispatchPanel()}
      {activeTab === 'shelf'    && renderShelfMap()}


      {/* ── Add Batch Modal ───────────────────────────────────────────────────────── */}
      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setBatchForm(defaultBatchForm) }}
        title="Receive New Stock Batch"
      >
        <form onSubmit={handleAddBatch} className="space-y-4">

          <Field label="Product" required>
            <select
              value={batchForm.product_id}
              onChange={(e) => handleBatchFormChange('product_id', e.target.value)}
              className={inputCls}
              required
            >
              <option value="">— Select product —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Batch Number">
            <input
              type="text"
              placeholder="e.g. LOT-2024-001"
              value={batchForm.batch_number}
              onChange={(e) => handleBatchFormChange('batch_number', e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Manufacture Date">
              <input
                type="date"
                value={batchForm.manufacture_date}
                onChange={(e) => handleBatchFormChange('manufacture_date', e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Expiry Date" required>
              <input
                type="date"
                value={batchForm.expiry_date}
                onChange={(e) => handleBatchFormChange('expiry_date', e.target.value)}
                className={inputCls}
                required
              />
              {/* Auto-calculated days-until-expiry hint */}
              {batchForm.expiry_date && (() => {
                const d = daysUntilExpiry(batchForm.expiry_date)
                if (d === null) return null
                const colour = d < 0 ? 'text-red-600' : d <= 30 ? 'text-orange-500' : 'text-green-600'
                return (
                  <p className={`text-xs mt-1 font-medium ${colour}`}>
                    {d < 0 ? `Already expired ${Math.abs(d)} days ago` : `Expires in ${d} days`}
                  </p>
                )
              })()}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Purchase Price">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={batchForm.purchase_price}
                onChange={(e) => handleBatchFormChange('purchase_price', e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Sale Price Override">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Leave blank to use default"
                value={batchForm.sale_price}
                onChange={(e) => handleBatchFormChange('sale_price', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Quantity Received" required>
            <input
              type="number"
              min="1"
              placeholder="e.g. 200"
              value={batchForm.quantity_received}
              onChange={(e) => handleBatchFormChange('quantity_received', e.target.value)}
              className={inputCls}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Rack No.">
              <input
                type="text"
                placeholder="e.g. R-03"
                value={batchForm.rack_no}
                onChange={(e) => handleBatchFormChange('rack_no', e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label="Bin No.">
              <input
                type="text"
                placeholder="e.g. B-07"
                value={batchForm.bin_no}
                onChange={(e) => handleBatchFormChange('bin_no', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Modal actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setShowAddModal(false); setBatchForm(defaultBatchForm) }}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700
                         font-semibold text-sm hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500
                         text-white font-semibold text-sm
                         disabled:opacity-60 disabled:cursor-not-allowed
                         active:scale-[0.98] transition-all
                         flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg"
                       fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                            stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                'Add Batch'
              )}
            </button>
          </div>

        </form>
      </Modal>

    </div>
  )
}

export default FIFO_Inventory
