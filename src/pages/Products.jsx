import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { getProductStock } from '../services/db'
import { MEDICINE_UNITS, DRUG_CATEGORIES, SHELF_LOCATIONS, CURRENCY, LOW_STOCK_THRESHOLD } from '../utils/constants'
import { Plus, Search, Edit2, Trash2, Package, AlertTriangle, Filter, Download, Barcode } from 'lucide-react'

const EMPTY = {
  name: '', generic_name: '', barcode: '', category: '', unit: 'tablet',
  cost_price: '', sale_price: '', requires_prescription: false,
  shelf_location: '', description: '', manufacturer: '', is_active: true,
}

export default function Products() {
  const { user } = useAuth()
  const shopId = user?.shop_id

  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterUnit, setFilterUnit] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [stockMap, setStockMap] = useState({})
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      let list = []
      if (isOnline) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('shop_id', shopId)
          .eq('is_active', true)
          .order('name')
        if (error) throw error
        list = data || []
        // Sync to local DB
        await db.products.bulkPut(list)
      } else {
        list = await db.products.where('shop_id').equals(shopId).filter(p => p.is_active !== false).toArray()
      }

      // Load stock for each product from batches
      const stocks = {}
      await Promise.all(
        list.map(async p => {
          stocks[p.id] = await getProductStock(p.id)
        })
      )
      setStockMap(stocks)
      setProducts(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [shopId, isOnline])

  useEffect(() => { load() }, [load])

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.generic_name?.toLowerCase().includes(q) || p.barcode?.includes(q)
    const matchCat = !filterCategory || p.category === filterCategory
    const matchUnit = !filterUnit || p.unit === filterUnit
    return matchSearch && matchCat && matchUnit
  })

  // ── Open modal ──────────────────────────────────────────────────────────────
  const openAdd = () => { setEditing(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = p => { setEditing(p); setForm({ ...p }); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Medicine name is required')
    if (!form.sale_price || isNaN(form.sale_price)) return setError('Sale price is required')
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        shop_id: shopId,
        cost_price: Number(form.cost_price) || 0,
        sale_price: Number(form.sale_price),
        name: form.name.trim(),
        generic_name: form.generic_name?.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (isOnline) {
        if (editing) {
          const { error } = await supabase.from('products').update(payload).eq('id', editing.id)
          if (error) throw error
        } else {
          payload.created_at = new Date().toISOString()
          const { error } = await supabase.from('products').insert(payload)
          if (error) throw error
        }
      } else {
        if (editing) {
          await db.products.update(editing.id, payload)
        } else {
          payload.id = Date.now()
          payload.created_at = new Date().toISOString()
          await db.products.add(payload)
        }
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? Stock batches will remain for audit.`)) return
    if (isOnline) {
      await supabase.from('products').update({ is_active: false }).eq('id', p.id)
    } else {
      await db.products.update(p.id, { is_active: false })
    }
    await load()
  }

  const stockBadge = (id) => {
    const qty = stockMap[id] || 0
    if (qty === 0) return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">Out</span>
    if (qty < LOW_STOCK_THRESHOLD) return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">{qty}</span>
    return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">{qty}</span>
  }

  const margin = Number(form.sale_price) > 0 && form.cost_price
    ? (((form.sale_price - form.cost_price) / form.sale_price) * 100).toFixed(0)
    : 0

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package size={22} className="text-blue-600" /> Medicines / Products
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} items</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus size={16} /> Add Medicine
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, generic, barcode…"
            className="text-sm outline-none flex-1 bg-transparent" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none">
          <option value="">All Categories</option>
          {DRUG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none">
          <option value="">All Units</option>
          {MEDICINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package size={40} className="mx-auto mb-2 opacity-30" />
            <p>No medicines found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Generic</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-center">Unit</th>
                  <th className="px-4 py-3 text-center">Stock</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Sale</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-center">Rx</th>
                  <th className="px-4 py-3 text-center">Shelf</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => {
                  const m = p.cost_price && Number(p.sale_price) > 0 ? (((p.sale_price - p.cost_price) / p.sale_price) * 100).toFixed(0) : 0
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {p.name}
                        {p.barcode && <span className="block text-[10px] text-gray-400 font-mono">{p.barcode}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{p.generic_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{p.category || '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-500">{p.unit}</td>
                      <td className="px-4 py-2.5 text-center">{stockBadge(p.id)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{CURRENCY}{p.cost_price || 0}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{CURRENCY}{p.sale_price}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-teal-600 font-medium">{m}%</td>
                      <td className="px-4 py-2.5 text-center">
                        {p.requires_prescription
                          ? <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Rx</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-gray-400">{p.shelf_location || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-blue-50 text-blue-500">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-red-50 text-red-400">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editing ? 'Edit Medicine' : 'Add New Medicine'}</h2>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Brand / Medicine Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              {/* Generic Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Generic / Salt Name</label>
                <input value={form.generic_name || ''} onChange={e => setForm(f => ({ ...f, generic_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              {/* Manufacturer */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer</label>
                <input value={form.manufacturer || ''} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              {/* Barcode */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Barcode</label>
                <input value={form.barcode || ''} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 font-mono" />
              </div>
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select value={form.category || ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400">
                  <option value="">Select category…</option>
                  {DRUG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Unit */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dispensing Unit *</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {MEDICINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              {/* Cost Price */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price (Purchase)</label>
                <input type="number" min="0" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              {/* Sale Price */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sale Price *</label>
                <div className="relative">
                  <input type="number" min="0" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
                  {margin > 0 && (
                    <span className="absolute right-3 top-2 text-xs text-teal-600 font-semibold">{margin}% margin</span>
                  )}
                </div>
              </div>
              {/* Shelf Location */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shelf / Storage Location</label>
                <select value={form.shelf_location || ''} onChange={e => setForm(f => ({ ...f, shelf_location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400">
                  <option value="">Not assigned</option>
                  {SHELF_LOCATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Prescription */}
              <div className="flex items-center gap-3 sm:col-span-2">
                <input type="checkbox" id="rx" checked={form.requires_prescription || false}
                  onChange={e => setForm(f => ({ ...f, requires_prescription: e.target.checked }))}
                  className="w-4 h-4 rounded accent-red-500" />
                <label htmlFor="rx" className="text-sm text-gray-700">
                  ⚠️ Requires Prescription (Rx / Schedule)
                </label>
              </div>
              {/* Description */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes / Description</label>
                <textarea value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none" />
              </div>
            </div>
            {error && <p className="px-5 pb-2 text-sm text-red-500">{error}</p>}
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Update' : 'Add Medicine'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
