import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { CURRENCY } from '../utils/constants'
import { Plus, Search, Edit2, Trash2, Users, Phone, ChevronRight, DollarSign, Briefcase } from 'lucide-react'

const EMPTY = { name: '', phone: '', role: 'Pharmacist', salary: '', join_date: '', notes: '', is_active: true }

const ROLES = ['Pharmacist', 'Cashier', 'Manager', 'Assistant', 'Delivery', 'Other']

export default function Employees() {
  const { user } = useAuth()
  const shopId = user?.shop_id
  const navigate = useNavigate()

  const [employees, setEmployees] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentEmployee, setPaymentEmployee] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMonth, setPaymentMonth] = useState(() => new Date().toISOString().slice(0, 7))
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
        const { data } = await supabase.from('employees').select('*').eq('shop_id', shopId).eq('is_active', true).order('name')
        setEmployees(data || [])
        await db.employees.bulkPut(data || [])
      } else {
        const data = await db.employees.where('shop_id').equals(shopId).filter(e => e.is_active !== false).toArray()
        setEmployees(data)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [shopId, isOnline])

  useEffect(() => { load() }, [load])

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    return !q || e.name?.toLowerCase().includes(q) || e.role?.toLowerCase().includes(q) || e.phone?.includes(q)
  })

  const openAdd = () => { setEditing(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = e => { setEditing(e); setForm({ ...e }); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name?.trim()) return setError('Employee name required')
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        shop_id: shopId,
        name: form.name.trim(),
        salary: Number(form.salary) || 0,
      }
      if (isOnline) {
        if (editing) {
          await supabase.from('employees').update(payload).eq('id', editing.id)
        } else {
          payload.created_at = new Date().toISOString()
          await supabase.from('employees').insert(payload)
        }
      } else {
        if (editing) {
          await db.employees.update(editing.id, payload)
        } else {
          payload.id = Date.now(); payload.created_at = new Date().toISOString()
          await db.employees.add(payload)
        }
      }
      setShowModal(false)
      await load()
    } catch (err) { setError(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (e) => {
    if (!window.confirm(`Remove employee "${e.name}"?`)) return
    if (isOnline) await supabase.from('employees').update({ is_active: false }).eq('id', e.id)
    else await db.employees.update(e.id, { is_active: false })
    await load()
  }

  const openPayment = (e) => { setPaymentEmployee(e); setPaymentAmount(''); setPaymentNote(''); setShowPaymentModal(true) }

  const handlePayment = async () => {
    if (!paymentAmount || isNaN(paymentAmount) || Number(paymentAmount) <= 0) return
    const amt = Number(paymentAmount)
    try {
      const now = new Date().toISOString()
      if (isOnline) {
        await supabase.from('employee_payments').insert({
          shop_id: shopId, employee_id: paymentEmployee.id,
          amount: amt, month: paymentMonth,
          note: paymentNote || 'Salary Payment', created_at: now,
        })
      } else {
        await db.employee_payments.add({
          id: Date.now(), shop_id: shopId, employee_id: paymentEmployee.id,
          amount: amt, month: paymentMonth,
          note: paymentNote || 'Salary Payment', created_at: now, synced: false,
        })
      }
      setShowPaymentModal(false)
      await load()
    } catch (err) { console.error(err) }
  }

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`
  const totalSalaryBill = employees.reduce((s, e) => s + (e.salary || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-purple-600" /> Employees
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} staff • Monthly bill: <span className="font-semibold text-purple-600">{fmt(totalSalaryBill)}</span>
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 max-w-sm">
        <Search size={15} className="text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, role, phone…"
          className="text-sm outline-none flex-1 bg-transparent" />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Users size={40} className="mx-auto mb-2 opacity-30" /><p>No employees found</p></div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm flex-shrink-0">
                  {e.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{e.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Briefcase size={10} />{e.role}</span>
                    {e.phone && <span className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{e.phone}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-purple-700">{fmt(e.salary)}</p>
                  <p className="text-[10px] text-gray-400">monthly</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openPayment(e)} className="p-1.5 rounded hover:bg-green-50 text-green-500" title="Pay Salary">
                    <DollarSign size={14} />
                  </button>
                  <button onClick={() => navigate(`/employees/${e.id}/ledger`)} className="p-1.5 rounded hover:bg-blue-50 text-blue-500" title="View Ledger">
                    <ChevronRight size={14} />
                  </button>
                  <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(e)} className="p-1.5 rounded hover:bg-red-50 text-red-400">
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
              <h2 className="text-lg font-bold text-gray-800">{editing ? 'Edit Employee' : 'Add Employee'}</h2>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400 bg-white">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Salary</label>
                <input type="number" min="0" value={form.salary || ''} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Join Date</label>
                <input type="date" value={form.join_date || ''} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </div>
            </div>
            {error && <p className="px-5 pb-2 text-sm text-red-500">{error}</p>}
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Update' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && paymentEmployee && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">Pay Salary</h2>
              <p className="text-sm text-gray-500">{paymentEmployee.name}</p>
              <p className="text-xs text-purple-600 font-semibold mt-1">Monthly: {fmt(paymentEmployee.salary)}</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
                <input type="month" value={paymentMonth} onChange={e => setPaymentMonth(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
                <input type="number" min="0" value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)} autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400 text-lg font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                <input value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                  placeholder="Salary payment…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-400" />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200">Cancel</button>
              <button onClick={handlePayment}
                className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                Pay {paymentAmount ? fmt(paymentAmount) : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
