import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { CURRENCY, MEDICINE_UNITS, PO_STATUSES } from '../utils/constants'
import { Plus, Search, Trash2, Truck, ChevronDown, ChevronUp, Package, AlertCircle, Check } from 'lucide-react'

const EMPTY_ITEM = { product_id: '', product_name: '', batch_number: '', expiry_date: '', quantity: 1, bonus_qty: 0, purchase_price: 0, sale_price: 0 }
const EMPTY_PO = { supplier_id: '', invoice_number: '', total_amount: 0, paid_amount: 0, payment_type: 'cash', status: 'received', note: '' }

export default function Purchases() {
  const { user } = useAuth()
  const shopId = user?.shop_id

  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [form, setForm] = useState(EMPTY_PO)
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [productSearch, setProductSearch] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isOnline = navigator.onLine

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isOnline) {
        const [poRes, supRes, prodRes] = await Promise.all([
          supabase.from('purchases').select('*, suppliers(name), purchase_items(*, products(name))').eq('shop_id', shopId).order('created_at', { ascending: false }),
          supabase.from('suppliers').select('id, name, balance').eq('shop_id', shopId).eq('is_active', true).order('name'),
          supabase.from('products').select('id, name, generic_name, sale_price, cost_price').eq('shop_id', shopId).eq('is_active', true).order('name'),
        ])
        setPurchases(poRes.data || [])
        setSuppliers(supRes.data || [])
        setProducts(prodRes.data || [])
      } else {
        const [pos, sups, prods] = await Promise.all([
          db.purchases.where('shop_id').equals(shopId).toArray(),
          db.suppliers.where('shop_id').equals(shopId).toArray(),
          db.products.where('shop_id').equals(shopId).filter(p => p.is_active !== false).toArray(),
        ])
        setPurchases(pos)
        setSuppliers(sups)
        setProducts(prods)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [shopId, isOnline])

  useEffect(() => { load() }, [load])

  // ── Item helpers ────────────────────────────────────────────────────────────
  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }])
  const removeItem = idx => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [field]: value }
      // Auto-fill prices from product
      if (field === 'product_id') {
        const prod = products.find(p => p.id === Number(value))
        if (prod) {
          updated.product_name = prod.name
          updated.purchase_price = prod.cost_price || 0
          updated.sale_price = prod.sale_price || 0
        }
      }
      return updated
    }))
  }

  const calcTotal = () => items.reduce((s, i) => s + (Number(i.purchase_price) * Number(i.quantity)), 0)

  const handleSave = async () => {
    if (!form.supplier_id) return setError('Select a supplier')
    const validItems = items.filter(i => i.product_id)
    if (validItems.length === 0) return setError('Add at least one item')
    for (const item of validItems) {
      if (!item.quantity || item.quantity <= 0) return setError(`Invalid quantity for ${item.product_name}`)
      if (!item.purchase_price || item.purchase_price <= 0) return setError(`Enter purchase price for ${item.product_name}`)
    }

    setSaving(true)
    setError('')
    try {
      const now = new Date().toISOString()
      const totalAmt = calcTotal()
      const poPayload = {
        shop_id: shopId,
        supplier_id: Number(form.supplier_id),
        invoice_number: form.invoice_number || null,
        total_amount: totalAmt,
        paid_amount: Number(form.paid_amount) || 0,
        payment_type: form.payment_type,
        status: form.status,
        note: form.note || null,
        created_at: now,
      }

      if (isOnline) {
        const { data: po, error: poErr } = await supabase.from('purchases').insert(poPayload).select().single()
        if (poErr) throw poErr

        // Insert items and create batches
        for (const item of validItems) {
          await supabase.from('purchase_items').insert({
            purchase_id: po.id,
            product_id: Number(item.product_id),
            batch_number: item.batch_number || `B${Date.now()}`,
            expiry_date: item.expiry_date || null,
            quantity: Number(item.quantity),
            bonus_qty: Number(item.bonus_qty) || 0,
            purchase_price: Number(item.purchase_price),
            sale_price: Number(item.sale_price),
          })

          // Create / update product batch (FIFO stock)
          await supabase.from('product_batches').insert({
            shop_id: shopId,
            product_id: Number(item.product_id),
            batch_number: item.batch_number || `B${Date.now()}`,
            expiry_date: item.expiry_date || null,
            quantity: Number(item.quantity) + Number(item.bonus_qty || 0),
            quantity_remaining: Number(item.quantity) + Number(item.bonus_qty || 0),
            purchase_price: Number(item.purchase_price),
            sale_price: Number(item.sale_price),
            purchase_id: po.id,
            created_at: now,
          })

          // Update product default cost_price to latest batch
          await supabase.from('products').update({ cost_price: Number(item.purchase_price) }).eq('id', Number(item.product_id))
        }

        // Update supplier balance
        const outstanding = totalAmt - (Number(form.paid_amount) || 0)
        if (outstanding > 0) {
          const sup = suppliers.find(s => s.id === Number(form.supplier_id))
          await supabase.from('suppliers').update({ balance: (sup?.balance || 0) + outstanding }).eq('id', Number(form.supplier_id))
        }
      } else {
        const poId = Date.now()
        await db.purchases.add({ id: poId, ...poPayload, synced: false })
        for (const item of validItems) {
          const batchId = Date.now() + Math.random()
          await db.purchase_items.add({ purchase_id: poId, ...item, id: batchId })
          await db.product_batches.add({
            id: batchId + 1,
            shop_id: shopId,
            product_id: Number(item.product_id),
            batch_number: item.batch_number || `B${Date.now()}`,
            expiry_date: item.expiry_date || null,
            quantity: Number(item.quantity) + Number(item.bonus_qty || 0),
            quantity_remaining: Number(item.quantity) + Number(item.bonus_qty || 0),
            purchase_price: Number(item.purchase_price),
            sale_price: Number(item.sale_price),
            purchase_id: poId,
            created_at: now,
          })
        }
      }

      setShowModal(false)
      setForm(EMPTY_PO)
      setItems([{ ...EMPTY_ITEM }])
      await load()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const filtered = purchases.filter(p => {
    const q = search.toLowerCase()
    return !q || p.invoice_number?.toLowerCase().includes(q) || p.suppliers?.name?.toLowerCase().includes(q)
  })

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`
  const statusColor = { pending: 'bg-yellow-100 text-yellow-700', received: 'bg-green-100 text-green-700', partial: 'bg-orange-100 text-orange-700', cancelled: 'bg-red-100 text-red-700' }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={22} className="text-green-600" /> Purchases
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} purchase orders</p>
        </div>
        <button onClick={() => { setForm(EMPTY_PO); setItems([{ ...EMPTY_ITEM }]); setError(''); setShowModal(true) }}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
          <Plus size={16} /> New Purchase
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 max-w-sm">
        <Search size={15} className="text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by invoice or supplier…"
          className="text-sm outline-none flex-1 bg-transparent" />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Truck size={40} className="mx-auto mb-2 opacity-30" />
            <p>No purchases yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(po => (
              <div key={po.id}>
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{po.suppliers?.name || 'Unknown Supplier'}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[po.status] || 'bg-gray-100 text-gray-600'}`}>
                        {po.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {po.invoice_number && <span className="font-mono">{po.invoice_number} • </span>}
                      {new Date(po.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-800">{fmt(po.total_amount)}</p>
                    {po.total_amount - po.paid_amount > 0 && (
                      <p className="text-xs text-orange-500">Due: {fmt(po.total_amount - po.paid_amount)}</p>
                    )}
                  </div>
                  {expanded === po.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
                {expanded === po.id && po.purchase_items && (
                  <div className="bg-gray-50 px-4 pb-3">
                    <table className="w-full text-xs text-gray-600 mt-2">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-200">
                          <th className="text-left py-1">Medicine</th>
                          <th className="text-center py-1">Batch</th>
                          <th className="text-center py-1">Expiry</th>
                          <th className="text-center py-1">Qty</th>
                          <th className="text-center py-1">Bonus</th>
                          <th className="text-right py-1">Cost</th>
                          <th className="text-right py-1">Sale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.purchase_items.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-100 last:border-0">
                            <td className="py-1.5">{item.products?.name || item.product_name || '—'}</td>
                            <td className="text-center py-1.5 font-mono">{item.batch_number || '—'}</td>
                            <td className="text-center py-1.5">{item.expiry_date || '—'}</td>
                            <td className="text-center py-1.5 font-medium">{item.quantity}</td>
                            <td className="text-center py-1.5 text-green-600">{item.bonus_qty > 0 ? `+${item.bonus_qty}` : '—'}</td>
                            <td className="text-right py-1.5">{fmt(item.purchase_price)}</td>
                            <td className="text-right py-1.5">{fmt(item.sale_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Purchase Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">New Purchase Order</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Header fields */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                  <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400">
                    <option value="">Select supplier…</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
                  <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400">
                    {PO_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Type</label>
                  <select value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400">
                    <option value="cash">Cash</option>
                    <option value="credit">Credit</option>
                    <option value="partial">Partial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Paid Amount</label>
                  <input type="number" min="0" value={form.paid_amount}
                    onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                  <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Items</p>
                  <button onClick={addItem} className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1">
                    <Plus size={12} /> Add row
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-2 py-2 text-left">Medicine</th>
                        <th className="px-2 py-2 text-left">Batch #</th>
                        <th className="px-2 py-2 text-left">Expiry</th>
                        <th className="px-2 py-2 text-center">Qty</th>
                        <th className="px-2 py-2 text-center">Bonus</th>
                        <th className="px-2 py-2 text-right">Cost Price</th>
                        <th className="px-2 py-2 text-right">Sale Price</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1.5">
                            <select value={item.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}
                              className="w-36 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-green-400">
                              <option value="">Select…</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={item.batch_number} onChange={e => updateItem(idx, 'batch_number', e.target.value)}
                              placeholder="Auto" className="w-20 border border-gray-200 rounded px-2 py-1 text-xs outline-none font-mono" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="date" value={item.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)}
                              className="w-28 border border-gray-200 rounded px-2 py-1 text-xs outline-none" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                              className="w-14 border border-gray-200 rounded px-2 py-1 text-xs outline-none text-center" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" value={item.bonus_qty} onChange={e => updateItem(idx, 'bonus_qty', e.target.value)}
                              className="w-12 border border-gray-200 rounded px-2 py-1 text-xs outline-none text-center" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" min="0" value={item.purchase_price} onChange={e => updateItem(idx, 'purchase_price', e.target.value)}
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs outline-none text-right" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" min="0" value={item.sale_price} onChange={e => updateItem(idx, 'sale_price', e.target.value)}
                              className="w-20 border border-gray-200 rounded px-2 py-1 text-xs outline-none text-right" />
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium text-gray-700">
                            {fmt(item.purchase_price * item.quantity)}
                          </td>
                          <td className="px-2 py-1.5">
                            {items.length > 1 && (
                              <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 font-bold text-sm">
                        <td colSpan={7} className="px-2 py-2 text-right text-gray-600">Grand Total:</td>
                        <td className="px-2 py-2 text-right text-gray-900">{fmt(calcTotal())}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-5 mb-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded p-2">
                <AlertCircle size={14} />{error}
              </div>
            )}
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving…' : '✓ Save Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
