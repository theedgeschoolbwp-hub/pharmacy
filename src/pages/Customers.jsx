import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { CURRENCY } from '../utils/constants'
import { Plus, Search, Edit2, Trash2, Users, ChevronRight, Phone, DollarSign } from 'lucide-react'

const EMPTY = { name: '', phone: '', address: '', note: '', is_active: true }

export default function Customers() {
  const { user } = useAuth()
  const shopId = user?.shop_id
  const navigate = useNavigate()

  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentCustomer, setPaymentCustomer] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (isOnline) {
        const { data } = await supabase.from('customers').select('*').eq('shop_id', shopId).eq('is_active', true).order('name')
        setCustomers(data || [])
        await db.customers.bulkPut(data || [])
      } else {
        const data = await db.customers.where('shop_id').equals(shopId).filter(c => c.is_active !== false).toArray()
        setCustomers(data)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [shopId, isOnline])

  useEffect(() => { load() }, [load])

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
  })

  const openAdd = () => { setEditing(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = c => { setEditing(c); setForm({ ...c }); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name?.trim()) return setError('Customer name required')
    setSaving(true)
    setError('')
    try {
      const payload = { ...form, shop_id: shopId, name: form.name.trim() }
      if (isOnline) {
        if (editing) {
          await supabase.from('customers').update(payload).eq('id', editing.id)
        } else {
          payload.balance = 0
          payload.created_at = new Date().toISOString()
          await supabase.from('customers').insert(payload)
        }
      } else {
        if (editing) {
          await db.customers.update(editing.id, payload)
        } else {
          payload.id = Date.now(); payload.balance = 0; payload.created_at = new Date().toISOString()
          await db.customers.add(payload)
        }
      }
      setShowModal(false)
      await load()
    } catch (err) { setError(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete customer "${c.name}"?`)) return
    if (isOnline) await supabase.from('customers').update({ is_active: false }).eq('id', c.id)
    else await db.customers.update(c.id, { is_active: false })
    await load()
  }

  const openPayment = (c) => { setPaymentCustomer(c); setPaymentAmount(''); setPaymentNote(''); setShowPaymentModal(true) }

  const handlePayment = async () => {
    if (!paymentAmount || isNaN(paymentAmount) || Number(paymentAmount) <= 0) return
    const amt = Number(paymentAmount)
    try {
      const now = new Date().toISOString()
      if (isOnline) {
        await supabase.from('customer_payments').insert({
          shop_id: shopId, customer_id: paymentCustomer.id,
          amount: amt, payment_type: 'payment', note: paymentNote || 'Cash Payment', created_at: now,
        })
        await supabase.from('customers').update({ balance: Math.max(0, (paymentCustomer.balance || 0) - amt) }).eq('id', paymentCustomer.id)
      } else {
        await db.customer_payments.add({
          id: Date.now(), shop_id: shopId, customer_id: paymentCustomer.id,
          amount: amt, payment_type: 'payment', note: paymentNote || 'Cash Payment', created_at: now, synced: false,
        })
        await db.customers.update(paymentCustomer.id, { balance: Math.max(0, (paymentCustomer.balance || 0) - amt) })
      }
      setShowPaymentModal(false)
      await load()
    } catch (err) { console.error(err) }
  }

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`
  const totalReceivable = customers.reduce((s, c) => s + Math.max(0, c.balance || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-teal-600" /> Customers
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} customers • Total Receivable: <span className="font-semibold text-orange-600">{fmt(totalReceivable)}</span>
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          <Plus size={16} /> Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 w-full md:max-w-sm">
        <Search size={15} className="text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="text-sm outline-none flex-1 bg-transparent" />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Users size={40} className="mx-auto mb-2 opacity-30" /><p>No customers found</p></div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{c.name}</p>
                  {c.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{c.phone}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {(c.balance || 0) > 0 ? (
                    <div>
                      <p className="text-sm font-bold text-orange-600">{fmt(c.balance)}</p>
                      <p className="text-[10px] text-gray-400">outstanding</p>
                    </div>
                  ) : (
                    <p className="text-xs text-green-500 font-medium">Clear</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  {(c.balance || 0) > 0 && (
                    <button onClick={() => openPayment(c)} className="p-1.5 rounded hover:bg-green-50 text-green-500" title="Collect Payment">
                      <DollarSign size={14} />
                    </button>
                  )}
                  <button onClick={() => navigate(`/customers/${c.id}/ledger`)} className="p-1.5 rounded hover:bg-blue-50 text-blue-500" title="View Ledger">
                    <ChevronRight size={14} />
                  </button>
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(c)} className="p-1.5 rounded hover:bg-red-50 text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">{editing ? 'Edit Customer' : 'Add Customer'}</h2>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <input value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                <textarea value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 resize-none" />
              </div>
            </div>
            {error && <p className="px-5 pb-2 text-sm text-red-500">{error}</p>}
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Update' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && paymentCustomer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Collect Payment</h2>
              <p className="text-sm text-gray-500">{paymentCustomer.name}</p>
              <p className="text-xs text-orange-600 font-semibold mt-1">Outstanding: {fmt(paymentCustomer.balance)}</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
                <input type="number" min="0" max={paymentCustomer.balance} value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)} autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 text-lg font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                <input value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                  placeholder="Cash payment…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200">Cancel</button>
              <button onClick={handlePayment}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                ✓ Collect {paymentAmount ? fmt(paymentAmount) : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
