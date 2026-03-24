import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { CURRENCY } from '../utils/constants'
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Receipt, Printer } from 'lucide-react'

export default function CustomerLedger() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const shopId = user?.shop_id

  const [customer, setCustomer] = useState(null)
  const [entries, setEntries] = useState([])
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
      let cust, sales, payments

      if (isOnline) {
        const [custRes, salesRes, paymentsRes] = await Promise.all([
          supabase.from('customers').select('*').eq('id', id).single(),
          supabase.from('sales')
            .select('id, total_amount, paid_amount, discount, payment_type, created_at, sale_items(id, quantity, unit_price, products(name))')
            .eq('customer_id', id)
            .eq('shop_id', shopId)
            .order('created_at'),
          supabase.from('customer_payments')
            .select('id, amount, payment_type, note, created_at')
            .eq('customer_id', id)
            .eq('shop_id', shopId)
            .order('created_at'),
        ])
        cust = custRes.data
        sales = salesRes.data || []
        payments = paymentsRes.data || []
      } else {
        cust = await db.customers.get(Number(id))
        sales = await db.sales.where('customer_id').equals(Number(id)).toArray()
        payments = await db.customer_payments.where('customer_id').equals(Number(id)).toArray()
      }

      setCustomer(cust)

      // Build combined ledger
      const combined = [
        ...sales.map(s => ({
          id: s.id, date: s.created_at, type: 'sale',
          payment_type: s.payment_type,
          amount: s.total_amount - (s.discount || 0),
          paid_amount: s.paid_amount || 0,
          note: `Invoice #${String(s.id).slice(-8)}`,
          items: s.sale_items || [],
        })),
        ...payments.map(p => ({
          id: p.id, date: p.created_at,
          type: p.payment_type === 'return' ? 'return' : 'payment',
          payment_type: p.payment_type,
          amount: p.amount,
          note: p.note || 'Cash Payment',
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date))

      // Running balance (credit = owed amount)
      let running = 0
      const withBalance = combined.map(item => {
        if (item.type === 'sale') {
          const owed = Math.max(0, item.amount - (item.paid_amount || 0))
          if (owed > 0) running += owed
        } else {
          if (item.payment_type !== 'refund') {
            running -= Math.abs(item.amount)
          }
        }
        return { ...item, balance: running }
      })

      setEntries(withBalance)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id, shopId, isOnline])

  useEffect(() => { load() }, [load])

  const fmt = n => `${CURRENCY}${Math.abs(n || 0).toLocaleString()}`
  const totalDebit = entries.filter(e => e.type === 'sale').reduce((s, e) => s + Math.max(0, e.amount - (e.paid_amount || 0)), 0)
  const totalCredit = entries.filter(e => e.type === 'payment').reduce((s, e) => s + Math.abs(e.amount), 0)
  const finalBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/customers')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} className="text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{customer?.name || '…'}</h1>
          <p className="text-xs text-gray-400">{customer?.phone || 'Customer Ledger'}</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-2">
          <Printer size={14} /> Print
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
          <p className="text-xs text-red-500 font-medium">Total Debit</p>
          <p className="text-lg font-bold text-red-700">{fmt(totalDebit)}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
          <p className="text-xs text-green-500 font-medium">Total Paid</p>
          <p className="text-lg font-bold text-green-700">{fmt(totalCredit)}</p>
        </div>
        <div className={`${finalBalance > 0 ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'} border rounded-xl p-3 text-center`}>
          <p className={`text-xs font-medium ${finalBalance > 0 ? 'text-orange-500' : 'text-gray-500'}`}>Balance</p>
          <p className={`text-lg font-bold ${finalBalance > 0 ? 'text-orange-700' : 'text-gray-700'}`}>{fmt(finalBalance)}</p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Receipt size={40} className="mx-auto mb-2 opacity-30" />
            <p>No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((entry, idx) => {
                  const isDebit = entry.type === 'sale'
                  const debitAmt = isDebit ? Math.max(0, entry.amount - (entry.paid_amount || 0)) : 0
                  const creditAmt = !isDebit ? Math.abs(entry.amount) : 0
                  return (
                    <tr key={`${entry.type}-${entry.id}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(entry.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isDebit ? 'bg-red-100' : 'bg-green-100'}`}>
                            {isDebit ? <TrendingUp size={10} className="text-red-500" /> : <TrendingDown size={10} className="text-green-500" />}
                          </span>
                          <span className="text-gray-700">{entry.note}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {debitAmt > 0 && <span className="text-red-600 font-medium">{fmt(debitAmt)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {creditAmt > 0 && <span className="text-green-600 font-medium">{fmt(creditAmt)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-semibold ${entry.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {fmt(entry.balance)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-sm border-t-2 border-gray-200">
                  <td colSpan={2} className="px-4 py-3 text-gray-700">Total</td>
                  <td className="px-4 py-3 text-right text-red-600">{fmt(totalDebit)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{fmt(totalCredit)}</td>
                  <td className={`px-4 py-3 text-right ${finalBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>{fmt(finalBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
