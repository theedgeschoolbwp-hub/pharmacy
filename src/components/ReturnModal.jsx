import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { CURRENCY, RETURN_REASONS } from '../utils/constants'
import { X, RotateCcw, AlertCircle } from 'lucide-react'

/**
 * ReturnModal — Process returns/refunds for a completed sale.
 * Shows original sale items and lets user select return quantities + reason.
 */
export default function ReturnModal({ sale, onClose, onSuccess }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [returnQtys, setReturnQtys] = useState({})
  const [reason, setReason] = useState(RETURN_REASONS[0])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`

  // Load sale items
  useEffect(() => {
    async function loadItems() {
      try {
        const { data, error: err } = await supabase
          .from('sale_items')
          .select('*, products(name, generic_name)')
          .eq('sale_id', sale.id)
        if (err) throw err

        // Check previously returned quantities
        const { data: prevReturns } = await supabase
          .from('sale_return_items')
          .select('sale_item_id, quantity')
          .in('return_id', (
            await supabase
              .from('sale_returns')
              .select('id')
              .eq('sale_id', sale.id)
          ).data?.map(r => r.id) || [])

        const returnedMap = {}
        ;(prevReturns || []).forEach(r => {
          returnedMap[r.sale_item_id] = (returnedMap[r.sale_item_id] || 0) + r.quantity
        })

        const enriched = (data || []).map(item => ({
          ...item,
          product_name: item.products?.name || item.product_name || 'Unknown',
          already_returned: returnedMap[item.id] || 0,
          max_returnable: item.quantity - (returnedMap[item.id] || 0),
        }))
        setItems(enriched)

        // Initialize return quantities to 0
        const initQtys = {}
        enriched.forEach(item => { initQtys[item.id] = 0 })
        setReturnQtys(initQtys)
      } catch (err) {
        setError('Failed to load sale items')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadItems()
  }, [sale.id])

  const setReturnQty = (itemId, qty) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const clamped = Math.max(0, Math.min(item.max_returnable, qty))
    setReturnQtys(prev => ({ ...prev, [itemId]: clamped }))
  }

  const returningItems = items.filter(item => (returnQtys[item.id] || 0) > 0)
  const returnTotal = returningItems.reduce((sum, item) => {
    const qty = returnQtys[item.id] || 0
    return sum + (item.unit_price * qty)
  }, 0)

  const processReturn = async () => {
    if (returningItems.length === 0) {
      setError('Select at least one item to return')
      return
    }
    setProcessing(true)
    setError('')

    try {
      // 1. Create sale_returns record
      const { data: returnData, error: returnErr } = await supabase
        .from('sale_returns')
        .insert({
          sale_id: sale.id,
          shop_id: user.shop_id,
          return_amount: returnTotal,
          reason,
          note: note || null,
          returned_by: user?.id || null,
        })
        .select()
        .single()
      if (returnErr) throw returnErr

      // 2. Insert sale_return_items
      const returnItems = returningItems.map(item => ({
        return_id: returnData.id,
        sale_item_id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: returnQtys[item.id],
        unit_price: item.unit_price,
        total: item.unit_price * returnQtys[item.id],
      }))
      const { error: itemsErr } = await supabase.from('sale_return_items').insert(returnItems)
      if (itemsErr) throw itemsErr

      // 3. Restore batch stock
      for (const item of returningItems) {
        if (item.batch_id) {
          await supabase.rpc('restore_batch_stock', {
            p_batch_id: item.batch_id,
            p_quantity: returnQtys[item.id],
          })
        }
      }

      // 4. Update customer balance if credit sale
      if (sale.customer_id && (sale.payment_type === 'credit' || sale.payment_type === 'partial' || sale.payment_type === 'split')) {
        const { data: cust } = await supabase.from('customers').select('balance').eq('id', sale.customer_id).single()
        if (cust) {
          await supabase.from('customers').update({
            balance: Math.max(0, (cust.balance || 0) - returnTotal)
          }).eq('id', sale.customer_id)
        }
      }

      // 5. Check if fully returned → update sale status
      const totalOriginal = items.reduce((s, i) => s + i.quantity, 0)
      const totalNowReturned = items.reduce((s, i) => s + (i.already_returned || 0) + (returnQtys[i.id] || 0), 0)
      if (totalNowReturned >= totalOriginal) {
        await supabase.from('sales').update({ status: 'returned' }).eq('id', sale.id)
      }

      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Return failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center">
              <RotateCcw size={18} className="text-orange-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">Process Return</h2>
              <p className="text-xs text-gray-400">Invoice #{String(sale.id).slice(-8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : (
            <>
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-400">
                      {fmt(item.unit_price)} × {item.quantity}
                      {item.batch_number && <span className="ml-1">• B: {item.batch_number}</span>}
                      {item.already_returned > 0 && (
                        <span className="text-orange-500 ml-1">({item.already_returned} already returned)</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Return:</span>
                    <button
                      onClick={() => setReturnQty(item.id, (returnQtys[item.id] || 0) - 1)}
                      disabled={!returnQtys[item.id]}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-30 text-xs font-bold"
                    >−</button>
                    <span className="w-7 text-center text-sm font-bold text-gray-800">{returnQtys[item.id] || 0}</span>
                    <button
                      onClick={() => setReturnQty(item.id, (returnQtys[item.id] || 0) + 1)}
                      disabled={(returnQtys[item.id] || 0) >= item.max_returnable}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 disabled:opacity-30 text-xs font-bold"
                    >+</button>
                  </div>
                </div>
              ))}

              {/* Reason */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Return Reason</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-blue-400"
                >
                  {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Additional notes…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          {returningItems.length > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-2.5 flex justify-between items-center">
              <span className="text-sm font-medium text-orange-700">Refund Amount</span>
              <span className="text-base font-bold text-orange-700">{fmt(returnTotal)}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
              <AlertCircle size={14} />{error}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium">Cancel</button>
            <button
              onClick={processReturn}
              disabled={processing || returningItems.length === 0}
              className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
            >
              {processing ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <><RotateCcw size={14} /> Process Return</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
