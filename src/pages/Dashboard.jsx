import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db, { getNearExpiryBatches, getProductsWithStock } from '../services/db'
import {
  Package, ShoppingCart, TrendingUp, AlertTriangle,
  Users, Truck, DollarSign, Clock, ChevronRight,
  Activity, Pill, Calendar, BarChart2
} from 'lucide-react'
import { CURRENCY, EXPIRY_THRESHOLDS, LOW_STOCK_THRESHOLD } from '../utils/constants'

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'blue', onClick }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    green:  'bg-green-50 text-green-600 border-green-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    red:    'bg-red-50 text-red-600 border-red-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    teal:   'bg-teal-50 text-teal-600 border-teal-100',
  }
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-4 flex items-start gap-3 ${colors[color]} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="p-2 rounded-lg bg-white/60">
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Alert Row ───────────────────────────────────────────────────────────────
function AlertRow({ label, value, color }) {
  const dot = { red: 'bg-red-500', orange: 'bg-orange-400', yellow: 'bg-yellow-400' }
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span className={`w-2 h-2 rounded-full ${dot[color] || 'bg-gray-300'}`} />
        {label}
      </div>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const shopId = user?.shop_id

  const [stats, setStats] = useState({
    todaySales: 0, todayRevenue: 0, todayProfit: 0,
    totalProducts: 0, lowStockCount: 0,
    expiredCount: 0, criticalExpiryCount: 0, warningExpiryCount: 0,
    totalCustomers: 0, pendingReceivables: 0,
    totalSuppliers: 0, pendingPayables: 0,
  })
  const [recentSales, setRecentSales] = useState([])
  const [expiryAlerts, setExpiryAlerts] = useState([])
  const [lowStockItems, setLowStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    if (!shopId) return
    try {
      if (isOnline) {
        await loadOnline()
      } else {
        await loadOffline()
      }
    } catch (err) {
      console.error('Dashboard load error:', err)
      await loadOffline()
    } finally {
      setLoading(false)
    }
  }, [shopId, isOnline])

  const loadOnline = async () => {
    const [salesRes, productsRes, batchesRes, customersRes, suppliersRes] = await Promise.all([
      supabase.from('sales')
        .select('id, total_amount, paid_amount, payment_type, created_at, sale_items(quantity, unit_price, purchase_price)')
        .eq('shop_id', shopId)
        .gte('created_at', `${today}T00:00:00`)
        .lt('created_at', `${tomorrow}T00:00:00`),
      supabase.from('products').select('id, name, sale_price, cost_price, is_active').eq('shop_id', shopId).eq('is_active', true),
      supabase.from('product_batches').select('*').eq('shop_id', shopId),
      supabase.from('customers').select('id, name, balance').eq('shop_id', shopId).eq('is_active', true),
      supabase.from('suppliers').select('id, name, balance').eq('shop_id', shopId).eq('is_active', true),
    ])

    const todaySalesList = salesRes.data || []
    const products = productsRes.data || []
    const batches = batchesRes.data || []
    const customers = customersRes.data || []
    const suppliers = suppliersRes.data || []

    // Today stats
    const todayRevenue = todaySalesList.reduce((s, x) => s + (x.paid_amount || x.total_amount || 0), 0)
    const todayProfit = todaySalesList.reduce((s, x) => {
      const profit = (x.sale_items || []).reduce((sp, item) => {
        return sp + (item.unit_price - (item.purchase_price || 0)) * item.quantity
      }, 0)
      return s + profit
    }, 0)

    // Inventory stats
    const productStockMap = {}
    batches.forEach(b => {
      if (b.quantity_remaining > 0) {
        productStockMap[b.product_id] = (productStockMap[b.product_id] || 0) + b.quantity_remaining
      }
    })
    const lowStockItems = products.filter(p => (productStockMap[p.id] || 0) < LOW_STOCK_THRESHOLD)
    setLowStockItems(lowStockItems.slice(0, 8))

    // Expiry stats
    const nowDate = today
    const critical = new Date(); critical.setDate(critical.getDate() + EXPIRY_THRESHOLDS.CRITICAL)
    const warning = new Date(); warning.setDate(warning.getDate() + EXPIRY_THRESHOLDS.WARNING)
    const criticalStr = critical.toISOString().split('T')[0]
    const warningStr = warning.toISOString().split('T')[0]
    const activeBatches = batches.filter(b => b.quantity_remaining > 0 && b.expiry_date)
    const expiredCount = activeBatches.filter(b => b.expiry_date < nowDate).length
    const criticalCount = activeBatches.filter(b => b.expiry_date >= nowDate && b.expiry_date <= criticalStr).length
    const warningCount = activeBatches.filter(b => b.expiry_date > criticalStr && b.expiry_date <= warningStr).length

    // Near expiry top list
    const nearExpiry = activeBatches
      .filter(b => b.expiry_date <= warningStr)
      .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
      .slice(0, 8)
    // Attach product names
    const productMap = Object.fromEntries(products.map(p => [p.id, p]))
    setExpiryAlerts(nearExpiry.map(b => ({ ...b, product: productMap[b.product_id] })))

    // Financials
    const pendingReceivables = customers.reduce((s, c) => s + Math.max(0, c.balance || 0), 0)
    const pendingPayables = suppliers.reduce((s, s2) => s + Math.max(0, s2.balance || 0), 0)

    // Recent sales
    const recentRes = await supabase.from('sales')
      .select('id, total_amount, paid_amount, payment_type, created_at, customers(name)')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(6)
    setRecentSales(recentRes.data || [])

    setStats({
      todaySales: todaySalesList.length,
      todayRevenue,
      todayProfit,
      totalProducts: products.length,
      lowStockCount: lowStockItems.length,
      expiredCount,
      criticalExpiryCount: criticalCount,
      warningExpiryCount: warningCount,
      totalCustomers: customers.length,
      pendingReceivables,
      totalSuppliers: suppliers.length,
      pendingPayables,
    })
  }

  const loadOffline = async () => {
    const [products, batches, customers, suppliers, sales] = await Promise.all([
      db.products.where('shop_id').equals(shopId).filter(p => p.is_active !== false).toArray(),
      db.product_batches.where('shop_id').equals(shopId).toArray(),
      db.customers.where('shop_id').equals(shopId).toArray(),
      db.suppliers.where('shop_id').equals(shopId).toArray(),
      db.sales.where('shop_id').equals(shopId).filter(s => s.created_at?.startsWith(today)).toArray(),
    ])

    const todayRevenue = sales.reduce((s, x) => s + (x.paid_amount || 0), 0)
    const nearExpiry = await getNearExpiryBatches(shopId)
    const lowStock = await getProductsWithStock(shopId)
    const lowItems = lowStock.filter(p => p.stock < LOW_STOCK_THRESHOLD)
    setLowStockItems(lowItems.slice(0, 8))
    setExpiryAlerts(nearExpiry.slice(0, 8))

    setStats(s => ({
      ...s,
      todaySales: sales.length,
      todayRevenue,
      totalProducts: products.length,
      lowStockCount: lowItems.length,
      totalCustomers: customers.length,
      totalSuppliers: suppliers.length,
    }))
  }

  useEffect(() => { loadDashboard() }, [loadDashboard])
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '—'

  const getExpiryColor = (dateStr) => {
    if (!dateStr) return 'gray'
    const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
    if (days < 0) return 'red'
    if (days <= EXPIRY_THRESHOLDS.CRITICAL) return 'red'
    if (days <= EXPIRY_THRESHOLDS.WARNING) return 'orange'
    return 'yellow'
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {!isOnline && (
          <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">
            ⚡ Offline Mode
          </span>
        )}
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ShoppingCart} label="Today's Sales" value={stats.todaySales} sub="invoices" color="blue" onClick={() => navigate('/sales')} />
        <StatCard icon={DollarSign} label="Today's Revenue" value={fmt(stats.todayRevenue)} sub="collected" color="green" />
        <StatCard icon={TrendingUp} label="Today's Profit" value={fmt(stats.todayProfit)} sub="gross" color="teal" />
        <StatCard icon={Activity} label="Receivables" value={fmt(stats.pendingReceivables)} sub={`${stats.totalCustomers} customers`} color="purple" onClick={() => navigate('/ledger-overview')} />
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Expiry Alerts */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-600 font-semibold text-sm">
              <Calendar size={16} /> Expiry Alerts
            </div>
            <button onClick={() => navigate('/inventory')} className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="p-3 space-y-1">
            <AlertRow label="Expired (in stock)" value={stats.expiredCount} color="red" />
            <AlertRow label={`Expire within ${EXPIRY_THRESHOLDS.CRITICAL} days`} value={stats.criticalExpiryCount} color="red" />
            <AlertRow label={`Expire within ${EXPIRY_THRESHOLDS.WARNING} days`} value={stats.warningExpiryCount} color="orange" />
          </div>
          {expiryAlerts.length > 0 && (
            <div className="border-t border-gray-50 px-3 pb-3 pt-2 space-y-1.5">
              {expiryAlerts.slice(0, 4).map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs text-gray-600">
                  <span className="truncate max-w-[130px]">{b.product?.name || 'Unknown'}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getExpiryColor(b.expiry_date) === 'red' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {b.expiry_date}
                    </span>
                    <span className="text-gray-400">×{b.quantity_remaining}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
              <Package size={16} /> Low Stock ({stats.lowStockCount})
            </div>
            <button onClick={() => navigate('/inventory')} className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="p-3 space-y-1.5">
            {lowStockItems.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">✅ All products sufficiently stocked</p>
            )}
            {lowStockItems.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs text-gray-700">
                <span className="truncate max-w-[150px]">{p.name}</span>
                <span className={`font-semibold ${p.stock === 0 ? 'text-red-600' : 'text-orange-500'}`}>
                  {p.stock === 0 ? 'Out of Stock' : `${p.stock} left`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-sm text-gray-700">Quick Actions</p>
          </div>
          <div className="p-3 grid grid-cols-2 gap-2">
            {[
              { label: 'New Sale', icon: ShoppingCart, path: '/sales', color: 'bg-blue-500' },
              { label: 'Purchase', icon: Truck, path: '/purchases', color: 'bg-green-500' },
              { label: 'Products', icon: Pill, path: '/products', color: 'bg-purple-500' },
              { label: 'Customers', icon: Users, path: '/customers', color: 'bg-teal-500' },
              { label: 'Suppliers', icon: Truck, path: '/suppliers', color: 'bg-orange-500' },
              { label: 'Reports', icon: BarChart2, path: '/profit-loss', color: 'bg-gray-600' },
            ].map(a => (
              <button
                key={a.path}
                onClick={() => navigate(a.path)}
                className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors text-xs font-medium text-gray-700"
              >
                <span className={`${a.color} text-white p-1.5 rounded`}>
                  <a.icon size={12} />
                </span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-sm text-gray-700 flex items-center gap-2">
            <Clock size={15} className="text-blue-500" /> Recent Sales
          </p>
          <button onClick={() => navigate('/sales')} className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
            View all <ChevronRight size={12} />
          </button>
        </div>
        {recentSales.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No sales yet today</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">Invoice</th>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-center">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentSales.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">#{String(s.id).slice(-6)}</td>
                    <td className="px-4 py-2.5 text-gray-700">{s.customers?.name || 'Walk-in'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {new Date(s.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{fmt(s.total_amount)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        s.payment_type === 'cash' ? 'bg-green-100 text-green-700' :
                        s.payment_type === 'credit' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {s.payment_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
