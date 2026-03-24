import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { CURRENCY } from '../utils/constants'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, ShoppingCart, Package } from 'lucide-react'

const FILTERS = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'last_month' },
]

function getDateRange(filter) {
  const now = new Date()
  let start, end
  switch (filter) {
    case 'today':
      start = new Date(now); start.setHours(0, 0, 0, 0)
      end = new Date(now); end.setHours(23, 59, 59, 999)
      break
    case 'week': {
      const day = now.getDay()
      start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0)
      end = new Date(now); end.setHours(23, 59, 59, 999)
      break
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now); end.setHours(23, 59, 59, 999)
      break
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      break
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now)
  }
  return { start: start.toISOString(), end: end.toISOString() }
}

export default function ProfitLoss() {
  const { user } = useAuth()
  const shopId = user?.shop_id

  const [filter, setFilter] = useState('month')
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [data, setData] = useState({
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
    salesCount: 0,
    expenseBreakdown: [],
  })

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { start, end } = getDateRange(filter)
    try {
      if (isOnline) {
        const [salesRes, itemsRes, expRes] = await Promise.all([
          supabase.from('sales')
            .select('id, total_amount, paid_amount, discount')
            .eq('shop_id', shopId)
            .gte('created_at', start)
            .lte('created_at', end),
          supabase.from('sale_items')
            .select('quantity, unit_price, purchase_price, discount, total, sale_id')
            .in('sale_id',
              (await supabase.from('sales').select('id').eq('shop_id', shopId).gte('created_at', start).lte('created_at', end)).data?.map(s => s.id) || []
            ),
          supabase.from('expenses')
            .select('amount, category')
            .eq('shop_id', shopId)
            .gte('date', start.split('T')[0])
            .lte('date', end.split('T')[0]),
        ])

        const sales = salesRes.data || []
        const items = itemsRes.data || []
        const exps = expRes.data || []

        const revenue = sales.reduce((s, x) => s + (x.paid_amount || 0), 0)
        const cogs = items.reduce((s, i) => s + (i.purchase_price || 0) * (i.quantity || 0), 0)
        const grossProfit = revenue - cogs
        const expenses = exps.reduce((s, e) => s + (e.amount || 0), 0)
        const netProfit = grossProfit - expenses

        const catMap = {}
        exps.forEach(e => {
          catMap[e.category || 'General'] = (catMap[e.category || 'General'] || 0) + (e.amount || 0)
        })
        const expenseBreakdown = Object.entries(catMap).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt)

        setData({ revenue, cogs, grossProfit, expenses, netProfit, salesCount: sales.length, expenseBreakdown })
      } else {
        // Offline fallback from IndexedDB
        const allSales = await db.sales
          .filter(s => s.shop_id === shopId && s.created_at >= start && s.created_at <= end)
          .toArray()
        const allItems = await db.sale_items
          .filter(i => allSales.some(s => s.id === i.sale_id))
          .toArray()
        const allExps = await db.expenses
          .filter(e => e.shop_id === shopId && e.created_at >= start && e.created_at <= end)
          .toArray()

        const revenue = allSales.reduce((s, x) => s + (x.paid_amount || 0), 0)
        const cogs = allItems.reduce((s, i) => s + (i.purchase_price || 0) * (i.quantity || 0), 0)
        const grossProfit = revenue - cogs
        const expenses = allExps.reduce((s, e) => s + (e.amount || 0), 0)
        const netProfit = grossProfit - expenses

        const catMap = {}
        allExps.forEach(e => {
          catMap[e.category || 'General'] = (catMap[e.category || 'General'] || 0) + (e.amount || 0)
        })
        const expenseBreakdown = Object.entries(catMap).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt)

        setData({ revenue, cogs, grossProfit, expenses, netProfit, salesCount: allSales.length, expenseBreakdown })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [shopId, filter, isOnline])

  useEffect(() => { load() }, [load])

  const fmt = n => `${CURRENCY}${Math.abs(n || 0).toLocaleString()}`
  const isProfit = data.netProfit >= 0

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={22} className="text-blue-600" /> Profit & Loss
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Financial performance summary</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap ${filter === f.value ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <>
          {/* P&L Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart size={16} className="text-blue-500" />
                <p className="text-xs text-blue-500 font-medium uppercase">Revenue</p>
              </div>
              <p className="text-2xl font-bold text-blue-700">{fmt(data.revenue)}</p>
              <p className="text-xs text-blue-400 mt-0.5">{data.salesCount} sales</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package size={16} className="text-red-500" />
                <p className="text-xs text-red-500 font-medium uppercase">Cost of Goods</p>
              </div>
              <p className="text-2xl font-bold text-red-700">{fmt(data.cogs)}</p>
              <p className="text-xs text-red-400 mt-0.5">purchase cost</p>
            </div>
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-teal-500" />
                <p className="text-xs text-teal-500 font-medium uppercase">Gross Profit</p>
              </div>
              <p className="text-2xl font-bold text-teal-700">{fmt(data.grossProfit)}</p>
              <p className="text-xs text-teal-400 mt-0.5">
                {data.revenue > 0 ? `${((data.grossProfit / data.revenue) * 100).toFixed(1)}% margin` : '—'}
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={16} className="text-orange-500" />
                <p className="text-xs text-orange-500 font-medium uppercase">Expenses</p>
              </div>
              <p className="text-2xl font-bold text-orange-700">{fmt(data.expenses)}</p>
              <p className="text-xs text-orange-400 mt-0.5">{data.expenseBreakdown.length} categories</p>
            </div>
            <div className={`col-span-2 md:col-span-1 ${isProfit ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} border rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={16} className={isProfit ? 'text-green-500' : 'text-red-500'} />
                <p className={`text-xs font-medium uppercase ${isProfit ? 'text-green-500' : 'text-red-500'}`}>Net Profit</p>
              </div>
              <p className={`text-2xl font-bold ${isProfit ? 'text-green-700' : 'text-red-700'}`}>
                {isProfit ? '' : '-'}{fmt(data.netProfit)}
              </p>
              <p className={`text-xs mt-0.5 ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                {isProfit ? 'Profitable period' : 'Loss period'}
              </p>
            </div>
          </div>

          {/* Expense Breakdown */}
          {data.expenseBreakdown.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Expense Breakdown</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {data.expenseBreakdown.map(({ cat, amt }) => (
                  <div key={cat} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                      <span className="text-sm text-gray-700">{cat}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-800">{fmt(amt)}</span>
                      {data.expenses > 0 && (
                        <span className="text-xs text-gray-400 ml-2">{((amt / data.expenses) * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 font-bold text-sm">
                  <span className="text-gray-700">Total Expenses</span>
                  <span className="text-orange-700">{fmt(data.expenses)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
