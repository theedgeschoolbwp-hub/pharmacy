import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { CURRENCY } from '../utils/constants'
import { Search, Users, Truck, ChevronRight, TrendingUp } from 'lucide-react'

export default function LedgerOverview() {
  const { user } = useAuth()
  const shopId = user?.shop_id
  const navigate = useNavigate()

  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('customers') // customers | suppliers
  const [loading, setLoading] = useState(true)
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
        const [custRes, supRes] = await Promise.all([
          supabase.from('customers').select('id, name, phone, balance').eq('shop_id', shopId).eq('is_active', true).gt('balance', 0).order('balance', { ascending: false }),
          supabase.from('suppliers').select('id, name, phone, company, balance').eq('shop_id', shopId).eq('is_active', true).gt('balance', 0).order('balance', { ascending: false }),
        ])
        setCustomers(custRes.data || [])
        setSuppliers(supRes.data || [])
      } else {
        const [custs, sups] = await Promise.all([
          db.customers.where('shop_id').equals(shopId).filter(c => c.is_active !== false && (c.balance || 0) > 0).toArray(),
          db.suppliers.where('shop_id').equals(shopId).filter(s => s.is_active !== false && (s.balance || 0) > 0).toArray(),
        ])
        setCustomers(custs.sort((a, b) => (b.balance || 0) - (a.balance || 0)))
        setSuppliers(sups.sort((a, b) => (b.balance || 0) - (a.balance || 0)))
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [shopId, isOnline])

  useEffect(() => { load() }, [load])

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`

  const filteredCustomers = customers.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
  })

  const filteredSuppliers = suppliers.filter(s => {
    const q = search.toLowerCase()
    return !q || s.name?.toLowerCase().includes(q) || s.company?.toLowerCase().includes(q) || s.phone?.includes(q)
  })

  const totalReceivable = customers.reduce((s, c) => s + (c.balance || 0), 0)
  const totalPayable = suppliers.reduce((s, s2) => s + (s2.balance || 0), 0)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp size={22} className="text-blue-600" /> Ledger Overview
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Outstanding balances across customers and suppliers</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
          <p className="text-xs text-orange-500 font-medium uppercase">Total Receivable</p>
          <p className="text-2xl font-bold text-orange-700 mt-1">{fmt(totalReceivable)}</p>
          <p className="text-xs text-orange-400 mt-0.5">{customers.length} customers</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs text-red-500 font-medium uppercase">Total Payable</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{fmt(totalPayable)}</p>
          <p className="text-xs text-red-400 mt-0.5">{suppliers.length} suppliers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('customers')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${tab === 'customers' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Customers ({customers.length})
        </button>
        <button
          onClick={() => setTab('suppliers')}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${tab === 'suppliers' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Suppliers ({suppliers.length})
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 w-full md:max-w-sm">
        <Search size={15} className="text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="text-sm outline-none flex-1 bg-transparent" />
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : tab === 'customers' ? (
          filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-gray-400"><Users size={40} className="mx-auto mb-2 opacity-30" /><p>No outstanding customer balances</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredCustomers.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    <div>
                      <p className="text-sm font-bold text-orange-600">{fmt(c.balance)}</p>
                      <p className="text-[10px] text-gray-400">outstanding</p>
                    </div>
                    <button onClick={() => navigate(`/customers/${c.id}/ledger`)} className="p-1.5 rounded hover:bg-blue-50 text-blue-400">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          filteredSuppliers.length === 0 ? (
            <div className="text-center py-12 text-gray-400"><Truck size={40} className="mx-auto mb-2 opacity-30" /><p>No outstanding supplier balances</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredSuppliers.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-sm flex-shrink-0">
                    {s.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    {s.company && <p className="text-xs text-gray-400">{s.company}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-red-600">{fmt(s.balance)}</p>
                    <p className="text-[10px] text-gray-400">payable</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
