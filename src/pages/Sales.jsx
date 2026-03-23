import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db, { getFIFOBatches, deductFIFOStock } from '../services/db'
import { CURRENCY, PAYMENT_METHODS, RETURN_REASONS } from '../utils/constants'
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Printer,
  User, AlertCircle, ChevronDown, X, Clock, Receipt
} from 'lucide-react'

// ─── Cart Item Row ────────────────────────────────────────────────────────────
function CartItem({ item, onQty, onRemove }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-gray-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
        <p className="text-xs text-gray-400">
          {CURRENCY}{item.unit_price} • Exp: {item.expiry_date || 'N/A'}
          {item.batch_number && <span className="ml-1 font-mono text-[10px]">({item.batch_number})</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onQty(item.cart_id, -1)}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600">
          <Minus size={12} />
        </button>
        <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
        <button onClick={() => onQty(item.cart_id, 1)}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-600">
          <Plus size={12} />
        </button>
      </div>
      <div className="text-right flex-shrink-0 w-20">
        <p className="text-sm font-semibold text-gray-800">{CURRENCY}{(item.unit_price * item.quantity).toLocaleString()}</p>
        <button onClick={() => onRemove(item.cart_id)} className="text-[10px] text-red-400 hover:text-red-600">
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

export default function Sales() {
  const { user } = useAuth()
  const shopId = user?.shop_id
  const searchRef = useRef()

  const [products, setProducts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [cart, setCart] = useState([])
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [paymentType, setPaymentType] = useState('cash')
  const [paidAmount, setPaidAmount] = useState('')
  const [discount, setDiscount] = useState(0)
  const [prescriptionNo, setPrescriptionNo] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [successInvoice, setSuccessInvoice] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const isOnline = navigator.onLine

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      if (isOnline) {
        const [prodRes, custRes, salesRes] = await Promise.all([
          supabase.from('products').select('id, name, generic_name, barcode, unit, sale_price, cost_price, requires_prescription, shelf_location').eq('shop_id', shopId).eq('is_active', true).order('name'),
          supabase.from('customers').select('id, name, phone, balance').eq('shop_id', shopId).eq('is_active', true).order('name'),
          supabase.from('sales').select('id, total_amount, payment_type, created_at, customers(name)').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(8),
        ])
        setProducts(prodRes.data || [])
        setCustomers(custRes.data || [])
        setRecentSales(salesRes.data || [])
      } else {
        const [prods, custs] = await Promise.all([
          db.products.where('shop_id').equals(shopId).filter(p => p.is_active !== false).toArray(),
          db.customers.where('shop_id').equals(shopId).toArray(),
        ])
        setProducts(prods)
        setCustomers(custs)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [shopId, isOnline])

  useEffect(() => { load() }, [load])

  // ── Search products ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const q = searchQuery.toLowerCase()
    const results = products.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.generic_name?.toLowerCase().includes(q) ||
      p.barcode?.includes(q)
    ).slice(0, 8)
    setSearchResults(results)
  }, [searchQuery, products])

  // ── Add product to cart ─────────────────────────────────────────────────────
  const addToCart = async (product) => {
    setSearchQuery('')
    setSearchResults([])

    // Get FIFO batches
    let batches = []
    if (isOnline) {
      const { data } = await supabase
        .from('product_batches')
        .select('*')
        .eq('product_id', product.id)
        .gt('quantity_remaining', 0)
        .order('expiry_date', { ascending: true })
      batches = data || []
    } else {
      batches = await getFIFOBatches(product.id)
    }

    if (batches.length === 0) {
      setError(`"${product.name}" is out of stock`)
      setTimeout(() => setError(''), 3000)
      return
    }

    // Pick the first (earliest expiry) batch
    const batch = batches[0]
    const cartId = `${product.id}_${batch.id}_${Date.now()}`
    const existing = cart.find(c => c.product_id === product.id && c.batch_id === batch.id)

    if (existing) {
      if (existing.quantity >= batch.quantity_remaining) {
        setError(`Only ${batch.quantity_remaining} units available`)
        setTimeout(() => setError(''), 3000)
        return
      }
      setCart(prev => prev.map(c =>
        c.cart_id === existing.cart_id ? { ...c, quantity: c.quantity + 1 } : c
      ))
    } else {
      setCart(prev => [...prev, {
        cart_id: cartId,
        product_id: product.id,
        batch_id: batch.id,
        batch_number: batch.batch_number,
        name: product.name,
        unit: product.unit,
        unit_price: batch.sale_price || product.sale_price,
        purchase_price: batch.purchase_price || product.cost_price || 0,
        expiry_date: batch.expiry_date,
        max_qty: batch.quantity_remaining,
        quantity: 1,
        requires_prescription: product.requires_prescription,
      }])
    }
    searchRef.current?.focus()
  }

  const updateQty = (cartId, delta) => {
    setCart(prev => prev.map(c => {
      if (c.cart_id !== cartId) return c
      const newQty = Math.max(1, Math.min(c.max_qty, c.quantity + delta))
      return { ...c, quantity: newQty }
    }))
  }

  const removeFromCart = (cartId) => setCart(prev => prev.filter(c => c.cart_id !== cartId))

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)
  const discountAmt = Math.min(subtotal, Number(discount) || 0)
  const total = subtotal - discountAmt
  const paid = paymentType === 'cash' || paymentType === 'card' || paymentType === 'easypaisa' || paymentType === 'jazzcash'
    ? total
    : paymentType === 'credit' ? 0
    : Number(paidAmount) || 0
  const balance = total - paid

  // ── Process Sale ────────────────────────────────────────────────────────────
  const processSale = async () => {
    if (cart.length === 0) return setError('Cart is empty')
    const rxItems = cart.filter(c => c.requires_prescription)
    if (rxItems.length > 0 && !prescriptionNo.trim()) {
      return setError(`Prescription required for: ${rxItems.map(x => x.name).join(', ')}`)
    }
    if (paymentType === 'partial' && (!paidAmount || Number(paidAmount) <= 0)) {
      return setError('Enter partial payment amount')
    }
    if ((paymentType === 'credit' || paymentType === 'partial') && !selectedCustomer) {
      return setError('Select a customer for credit/partial payment')
    }

    setProcessing(true)
    setError('')
    try {
      const now = new Date().toISOString()
      const salePayload = {
        shop_id: shopId,
        customer_id: selectedCustomer?.id || null,
        total_amount: total,
        discount: discountAmt,
        paid_amount: Math.min(paid, total),
        payment_type: paymentType,
        prescription_number: prescriptionNo || null,
        note: note || null,
        served_by: user?.username || user?.id,
        created_at: now,
      }

      if (isOnline) {
        // Insert sale
        const { data: saleData, error: saleErr } = await supabase.from('sales').insert(salePayload).select().single()
        if (saleErr) throw saleErr

        // Insert sale items and deduct batch stock
        const saleItems = cart.map(c => ({
          sale_id: saleData.id,
          product_id: c.product_id,
          batch_id: c.batch_id,
          quantity: c.quantity,
          unit_price: c.unit_price,
          purchase_price: c.purchase_price,
          discount: 0,
          total: c.unit_price * c.quantity,
          expiry_date: c.expiry_date,
        }))
        const { error: itemsErr } = await supabase.from('sale_items').insert(saleItems)
        if (itemsErr) throw itemsErr

        // Deduct batch quantities
        for (const c of cart) {
          await supabase.rpc('deduct_batch_stock', { p_batch_id: c.batch_id, p_quantity: c.quantity })
        }

        // Update customer balance if credit/partial
        if (selectedCustomer && balance > 0) {
          await supabase.from('customers').update({
            balance: (selectedCustomer.balance || 0) + balance
          }).eq('id', selectedCustomer.id)
        }

        setSuccessInvoice({ ...saleData, items: saleItems, customer: selectedCustomer })
      } else {
        // Offline — save to Dexie
        const saleId = Date.now()
        await db.sales.add({ id: saleId, ...salePayload, synced: false })
        const saleItems = cart.map(c => ({
          sale_id: saleId,
          product_id: c.product_id,
          batch_id: c.batch_id,
          quantity: c.quantity,
          unit_price: c.unit_price,
          purchase_price: c.purchase_price,
          discount: 0,
          total: c.unit_price * c.quantity,
          expiry_date: c.expiry_date,
        }))
        await db.sale_items.bulkAdd(saleItems)
        // Deduct local batch stock
        for (const c of cart) {
          const batch = await db.product_batches.get(c.batch_id)
          if (batch) {
            await db.product_batches.update(c.batch_id, {
              quantity_remaining: Math.max(0, batch.quantity_remaining - c.quantity)
            })
          }
        }
        setSuccessInvoice({ id: saleId, ...salePayload, items: saleItems, customer: selectedCustomer })
      }

      // Reset
      setCart([])
      setSelectedCustomer(null)
      setPaymentType('cash')
      setPaidAmount('')
      setDiscount(0)
      setPrescriptionNo('')
      setNote('')
      await load()
    } catch (err) {
      setError(err.message || 'Sale failed')
    } finally {
      setProcessing(false)
    }
  }

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left — Product Search & Recent */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 bg-gray-50">
        <div className="p-4 bg-white border-b border-gray-200 space-y-3">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <ShoppingCart size={20} className="text-blue-600" /> Pharmacy POS
          </h1>
          {/* Search */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Search size={16} className="text-gray-400 flex-shrink-0" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search medicine name, generic, barcode…"
                className="flex-1 text-sm outline-none bg-transparent"
                autoFocus
              />
              {searchQuery && <button onClick={() => setSearchQuery('')}><X size={14} className="text-gray-400" /></button>}
            </div>
            {/* Dropdown results */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 mt-1 max-h-72 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{p.name}
                        {p.requires_prescription && <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1 rounded">Rx</span>}
                      </p>
                      <p className="text-xs text-gray-400">{p.generic_name || p.category || ''} • {p.unit} • Shelf: {p.shelf_location || 'N/A'}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-600 flex-shrink-0">{fmt(p.sale_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Sales */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
            <Clock size={12} /> Recent Sales
          </p>
          <div className="space-y-2">
            {recentSales.map(s => (
              <div key={s.id} className="bg-white rounded-lg border border-gray-100 px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">{s.customers?.name || 'Walk-in'}</p>
                  <p className="text-[10px] text-gray-400 font-mono">#{String(s.id).slice(-6)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{fmt(s.total_amount)}</p>
                  <p className="text-[10px] text-gray-400">{new Date(s.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
            {recentSales.length === 0 && (
              <p className="text-xs text-gray-300 text-center py-8">No recent sales</p>
            )}
          </div>
        </div>
      </div>

      {/* Right — Cart & Checkout */}
      <div className="w-96 flex flex-col bg-white overflow-hidden">
        {/* Customer selector */}
        <div className="p-3 border-b border-gray-100 bg-gray-50">
          <select
            value={selectedCustomer?.id || ''}
            onChange={e => setSelectedCustomer(customers.find(c => c.id === Number(e.target.value)) || null)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none"
          >
            <option value="">👤 Walk-in Customer</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name} {c.balance > 0 ? `(Balance: ${fmt(c.balance)})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <ShoppingCart size={40} className="mb-2" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs">Search and add medicines above</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cart.map(item => (
                <CartItem key={item.cart_id} item={item} onQty={updateQty} onRemove={removeFromCart} />
              ))}
            </div>
          )}
        </div>

        {/* Checkout Panel */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 p-3 space-y-3 bg-gray-50">
            {/* Discount */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 flex-shrink-0 w-16">Discount</label>
              <input type="number" min="0" max={subtotal} value={discount}
                onChange={e => setDiscount(e.target.value)}
                className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>

            {/* Prescription # */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 flex-shrink-0 w-16">Rx #</label>
              <input value={prescriptionNo} onChange={e => setPrescriptionNo(e.target.value)}
                placeholder="Prescription number"
                className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>

            {/* Payment type */}
            <div className="flex gap-1 flex-wrap">
              {PAYMENT_METHODS.map(m => (
                <button key={m.value} onClick={() => setPaymentType(m.value)}
                  className={`flex-1 min-w-fit px-2 py-1 rounded text-xs font-medium transition-colors ${
                    paymentType === m.value ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Partial paid amount */}
            {paymentType === 'partial' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 flex-shrink-0 w-16">Paid Now</label>
                <input type="number" min="0" max={total} value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white" />
              </div>
            )}

            {/* Totals */}
            <div className="bg-white rounded-lg border border-gray-200 p-2.5 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Discount</span><span>-{fmt(discountAmt)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-1">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
              {balance > 0 && (
                <div className="flex justify-between text-orange-600 text-xs font-medium">
                  <span>Balance (Udhaar)</span><span>{fmt(balance)}</span>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded p-2">
                <AlertCircle size={14} />{error}
              </div>
            )}

            <button onClick={processSale} disabled={processing || cart.length === 0}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {processing ? (
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <><Receipt size={16} /> Complete Sale — {fmt(total)}</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Success Modal / Invoice */}
      {successInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 text-center border-b border-gray-100">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Receipt size={22} className="text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800">Sale Complete!</h2>
              <p className="text-sm text-gray-500">Invoice #{String(successInvoice.id).slice(-8)}</p>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Customer</span><span className="font-medium">{successInvoice.customer?.name || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Total</span><span className="font-bold text-gray-900">{fmt(successInvoice.total_amount)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Paid</span><span className="font-medium text-green-600">{fmt(successInvoice.paid_amount)}</span>
              </div>
              {successInvoice.total_amount - successInvoice.paid_amount > 0 && (
                <div className="flex justify-between text-orange-600 font-medium">
                  <span>Balance</span><span>{fmt(successInvoice.total_amount - successInvoice.paid_amount)}</span>
                </div>
              )}
            </div>
            <div className="p-4 flex gap-2 border-t border-gray-100">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5"
              >
                <Printer size={14} /> Print
              </button>
              <button
                onClick={() => setSuccessInvoice(null)}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
