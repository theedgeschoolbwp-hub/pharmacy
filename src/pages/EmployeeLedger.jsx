import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db from '../services/db'
import { CURRENCY } from '../utils/constants'
import { ArrowLeft, TrendingDown, DollarSign, Printer } from 'lucide-react'

export default function EmployeeLedger() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const shopId = user?.shop_id

  const [employee, setEmployee] = useState(null)
  const [payments, setPayments] = useState([])
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
        const [empRes, payRes] = await Promise.all([
          supabase.from('employees').select('*').eq('id', id).single(),
          supabase.from('employee_payments')
            .select('*')
            .eq('employee_id', id)
            .eq('shop_id', shopId)
            .order('created_at'),
        ])
        setEmployee(empRes.data)
        setPayments(payRes.data || [])
      } else {
        const emp = await db.employees.get(Number(id))
        const pays = await db.employee_payments.where('employee_id').equals(Number(id)).toArray()
        setEmployee(emp)
        setPayments(pays.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id, shopId, isOnline])

  useEffect(() => { load() }, [load])

  const fmt = n => `${CURRENCY}${Math.abs(n || 0).toLocaleString()}`
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const monthlySalary = employee?.salary || 0

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/employees')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={18} className="text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{employee?.name || '…'}</h1>
          <p className="text-xs text-gray-400">{employee?.role || 'Employee Ledger'}</p>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-2">
          <Printer size={14} /> Print
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
          <p className="text-xs text-purple-500 font-medium">Monthly Salary</p>
          <p className="text-lg font-bold text-purple-700">{fmt(monthlySalary)}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
          <p className="text-xs text-green-500 font-medium">Total Paid</p>
          <p className="text-lg font-bold text-green-700">{fmt(totalPaid)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500 font-medium">Payments</p>
          <p className="text-lg font-bold text-gray-700">{payments.length}</p>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <DollarSign size={15} className="text-green-500" /> Payment History
          </h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" /></div>
        ) : payments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <DollarSign size={40} className="mx-auto mb-2 opacity-30" />
            <p>No payments recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Month</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p, idx) => (
                  <tr key={`${p.id}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">{p.month || '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <TrendingDown size={10} className="text-green-500" />
                        </span>
                        <span className="text-gray-700 text-xs">{p.note || 'Salary Payment'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-green-600 font-semibold">{fmt(p.amount)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-sm border-t-2 border-gray-200">
                  <td colSpan={3} className="px-4 py-3 text-gray-700">Total Paid</td>
                  <td className="px-4 py-3 text-right text-green-600">{fmt(totalPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
