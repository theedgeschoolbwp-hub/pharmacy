import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import db, { getFIFOBatches, deductFIFOStock } from '../services/db'
import { CURRENCY, PAYMENT_METHODS, RETURN_REASONS } from '../utils/constants'
import ReceiptPrint from '../components/ReceiptPrint'
import ReturnModal from '../components/ReturnModal'
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Printer,
  User, AlertCircle, ChevronDown, X, Clock, Receipt,
  Barcode, Pause, Play, RotateCcw, Percent, DollarSign,
  CreditCard, Banknote, ChevronRight
} from 'lucide-react'

// ─── Cart Item Row ────────────────────────────────────────────────────────────
function CartItem({ item, onQty, onRemove, onDiscountChange, onDiscountTypeToggle }) {
  const effectiveDiscount = item.discountType === 'percent'
    ? (item.unit_price * item.quantity * (item.itemDiscount || 0)) / 100
    : (item.itemDiscount || 0)
  const lineTotal = Math.max(0, item.unit_price * item.quantity - effectiveDiscount)

  return (
    <div className="flex flex-col gap-1 py-2.5 border-b border-gray-50">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
          <p className="text-xs text-gray-400">
            {CURRENCY}{item.unit_price} • Exp: {item.expiry_date || 'N/A'}
            {item.batch_number && <span className="ml-1 font-mono text-[10px]">({item.batch_number})</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onQty(item.cart_id, -1)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 transition">
            <Minus size={12} />
          </button>
          <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
          <button onClick={() => onQty(item.cart_id, 1)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-600 transition">
            <Plus size={12} />
          </button>
        </div>
        <div className="text-right flex-shrink-0 w-20">
          <p className="text-sm font-semibold text-gray-800">{CURRENCY}{lineTotal.toLocaleString()}</p>
          <button onClick={() => onRemove(item.cart_id)} className="text-[10px] text-red-400 hover:text-red-600">
            <Trash2 size={10} />
          </button>
        </div>
      </div>
      {/* Per-item discount row */}
      <div className="flex items-center gap-1.5 ml-1">
        <span className="text-[10px] text-gray-400 w-12">Disc:</span>
        <input
          type="number" min="0" value={item.itemDiscount || ''}
          onChange={e => onDiscountChange(item.cart_id, e.target.value)}
          placeholder="0"
          className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 bg-white"
        />
        <button
          onClick={() => onDiscountTypeToggle(item.cart_id)}
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${
            item.discountType === 'percent'
              ? 'bg-blue-100 text-blue-600'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {item.discountType === 'percent' ? '%' : 'Rs'}
        </button>
        {effectiveDiscount > 0 && (
          <span className="text-[10px] text-red-500 font-medium">-{CURRENCY}{effectiveDiscount.toFixed(0)}</span>
        )}
      </div>
    </div>
  )
}

// ─── Multi-Payment Builder ────────────────────────────────────────────────────
const SPLIT_METHODS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'easypaisa', label: 'EasyPaisa', icon: CreditCard },
  { value: 'jazzcash', label: 'JazzCash', icon: CreditCard },
  { value: 'credit', label: 'Credit', icon: User },
]

function MultiPaymentBuilder({ total, payments, setPayments }) {
  const [method, setMethod] = useState('cash')
  const [amount, setAmount] = useState('')
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, total - totalPaid)

  const addPayment = () => {
    const amt = Number(amount) || 0
    if (amt <= 0) return
    setPayments(prev => [...prev, { method, amount: Math.min(amt, remaining) }])
    setAmount('')
  }

  const removePayment = (idx) => {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {/* Added payments */}
      {payments.map((p, i) => (
        <div key={i} className="flex items-center justify-between bg-blue-50 rounded-lg px-2.5 py-1.5">
          <span className="text-xs font-medium text-blue-700 capitalize">{p.method}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-800">{CURRENCY}{p.amount.toLocaleString()}</span>
            <button onClick={() => removePayment(i)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
          </div>
        </div>
      ))}

      {/* Add new payment row */}
      {remaining > 0 && (
        <div className="flex gap-1.5 items-center">
          <select value={method} onChange={e => setMethod(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white outline-none">
            {SPLIT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <input
            type="number" min="0" value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={remaining.toString()}
            className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400"
          />
          <button onClick={addPayment}
            className="px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition">Add</button>
        </div>
      )}

      {/* Summary */}
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">Remaining</span>
        <span className={`font-bold ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
          {remaining > 0 ? `${CURRENCY}${remaining.toLocaleString()}` : '✓ Fully allocated'}
        </span>
      </div>
    </div>
  )
}

// ─── Held Sales Drawer ────────────────────────────────────────────────────────
function HeldSalesDrawer({ heldSales, onResume, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Pause size={18} className="text-amber-600" />
            <h3 className="font-bold text-gray-800">Held Sales ({heldSales.length})</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {heldSales.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No held sales</p>
          ) : (
            heldSales.map((held, i) => (
              <div key={i} className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {held.customer?.name || 'Walk-in'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {held.cart.length} items • {new Date(held.timestamp).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-700">
                    {CURRENCY}{held.cart.reduce((s, c) => s + c.unit_price * c.quantity, 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-[10px] text-gray-400 mb-2 truncate">
                  {held.cart.map(c => c.name).join(', ')}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { onResume(i); onClose() }}
                    className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center justify-center gap-1">
                    <Play size={11} /> Resume
                  </button>
                  <button onClick={() => onDelete(i)}
                    className="py-1.5 px-3 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SALES / POS PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function Sales() {
  const { user } = useAuth()
  const shopId = user?.shop_id
  const searchRef = useRef()

  // Core state
  const [products, setProducts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [cart, setCart] = useState([])
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [prescriptionNo, setPrescriptionNo] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [successInvoice, setSuccessInvoice] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Phase 1 — New states
  const [barcodeMode, setBarcodeMode] = useState(false)
  const [paymentMode, setPaymentMode] = useState('cash') // cash | credit | split
  const [splitPayments, setSplitPayments] = useState([])
  const [saleDiscount, setSaleDiscount] = useState(0)
  const [saleDiscountType, setSaleDiscountType] = useState('flat') // flat | percent
  const [heldSales, setHeldSales] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pharmacare_held_sales') || '[]') }
    catch { return [] }
  })
  const [showHeldDrawer, setShowHeldDrawer] = useState(false)
  const [returnSale, setReturnSale] = useState(null) // sale to return
  const [toast, setToast] = useState('')
  const [showMobileCart, setShowMobileCart] = useState(false)

  // ── Shop info for receipt ──
  const shopName = localStorage.getItem('shop_name') || 'PharmaCare'
  const shopPhone = ''
  const shopAddress = ''

  // ── Toast helper ──
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // ── Persistent held sales ──
  useEffect(() => {
    localStorage.setItem('pharmacare_held_sales', JSON.stringify(heldSales))
  }, [heldSales])

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      if (isOnline) {
        const [prodRes, custRes, salesRes] = await Promise.all([
          supabase.from('products').select('id, name, generic_name, barcode, unit, sale_price, cost_price, requires_prescription, shelf_location').eq('shop_id', shopId).eq('is_active', true).order('name'),
          supabase.from('customers').select('id, name, phone, balance').eq('shop_id', shopId).eq('is_active', true).order('name'),
          supabase.from('sales').select('id, total_amount, payment_type, status, created_at, customers(name)').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(10),
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

  // ── Barcode mode — handle Enter key ─────────────────────────────────────────
  const handleSearchKeyDown = (e) => {
    if (!barcodeMode || e.key !== 'Enter') return
    e.preventDefault()
    const code = searchQuery.trim()
    if (!code) return

    const product = products.find(p => p.barcode === code)
    if (product) {
      addToCart(product)
      showToast(`✓ ${product.name}`)
    } else {
      showToast('❌ Barcode not found')
      setSearchQuery('')
    }
  }

  // ── Add product to cart ─────────────────────────────────────────────────────
  const addToCart = async (product) => {
    setSearchQuery('')
    setSearchResults([])

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
        itemDiscount: 0,
        discountType: 'flat', // flat | percent
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

  const updateItemDiscount = (cartId, value) => {
    setCart(prev => prev.map(c =>
      c.cart_id === cartId ? { ...c, itemDiscount: Number(value) || 0 } : c
    ))
  }

  const toggleItemDiscountType = (cartId) => {
    setCart(prev => prev.map(c =>
      c.cart_id === cartId ? { ...c, discountType: c.discountType === 'flat' ? 'percent' : 'flat', itemDiscount: 0 } : c
    ))
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  const calcItemTotal = (c) => {
    const lineGross = c.unit_price * c.quantity
    const disc = c.discountType === 'percent'
      ? (lineGross * (c.itemDiscount || 0)) / 100
      : (c.itemDiscount || 0)
    return Math.max(0, lineGross - disc)
  }

  const calcItemDiscount = (c) => {
    const lineGross = c.unit_price * c.quantity
    return c.discountType === 'percent'
      ? (lineGross * (c.itemDiscount || 0)) / 100
      : (c.itemDiscount || 0)
  }

  const subtotal = cart.reduce((s, c) => s + calcItemTotal(c), 0)
  const saleDiscAmt = saleDiscountType === 'percent'
    ? (subtotal * (Number(saleDiscount) || 0)) / 100
    : Math.min(subtotal, Number(saleDiscount) || 0)
  const total = Math.max(0, subtotal - saleDiscAmt)
  const totalItemDiscounts = cart.reduce((s, c) => s + calcItemDiscount(c), 0)
  const totalAllDiscounts = totalItemDiscounts + saleDiscAmt

  // Payment calculation
  const paid = paymentMode === 'cash' || paymentMode === 'card' || paymentMode === 'easypaisa' || paymentMode === 'jazzcash'
    ? total
    : paymentMode === 'credit'
      ? 0
      : paymentMode === 'split'
        ? splitPayments.reduce((s, p) => s + p.amount, 0)
        : total
  const balance = total - paid

  // ── Hold / Park Sale ───────────────────────────────────────────────────────
  const holdSale = () => {
    if (cart.length === 0) return
    if (heldSales.length >= 10) { setError('Maximum 10 held sales'); setTimeout(() => setError(''), 3000); return }
    const held = {
      cart: [...cart],
      customer: selectedCustomer,
      discount: saleDiscount,
      discountType: saleDiscountType,
      prescriptionNo,
      note,
      timestamp: new Date().toISOString(),
    }
    setHeldSales(prev => [...prev, held])
    resetCart()
    showToast('🔒 Sale held')
  }

  const resumeHeldSale = (idx) => {
    const held = heldSales[idx]
    setCart(held.cart)
    setSelectedCustomer(held.customer)
    setSaleDiscount(held.discount || 0)
    setSaleDiscountType(held.discountType || 'flat')
    setPrescriptionNo(held.prescriptionNo || '')
    setNote(held.note || '')
    setPaymentMode('cash')
    setSplitPayments([])
    setHeldSales(prev => prev.filter((_, i) => i !== idx))
    showToast('▶ Sale resumed')
  }

  const deleteHeldSale = (idx) => {
    setHeldSales(prev => prev.filter((_, i) => i !== idx))
  }

  const resetCart = () => {
    setCart([])
    setSelectedCustomer(null)
    setPaymentMode('cash')
    setSplitPayments([])
    setSaleDiscount(0)
    setSaleDiscountType('flat')
    setPrescriptionNo('')
    setNote('')
  }

  // ── Process Sale ────────────────────────────────────────────────────────────
  const processSale = async () => {
    if (cart.length === 0) return setError('Cart is empty')
    const rxItems = cart.filter(c => c.requires_prescription)
    if (rxItems.length > 0 && !prescriptionNo.trim()) {
      return setError(`Prescription required for: ${rxItems.map(x => x.name).join(', ')}`)
    }
    if (paymentMode === 'split') {
      const splitTotal = splitPayments.reduce((s, p) => s + p.amount, 0)
      if (Math.abs(splitTotal - total) > 1) return setError('Split payments must equal the total')
      if (splitPayments.some(p => p.method === 'credit') && !selectedCustomer) {
        return setError('Select a customer for credit payment')
      }
    }
    if (paymentMode === 'credit' && !selectedCustomer) {
      return setError('Select a customer for credit payment')
    }

    setProcessing(true)
    setError('')
    try {
      const now = new Date().toISOString()
      const actualPaid = paymentMode === 'split'
        ? splitPayments.filter(p => p.method !== 'credit').reduce((s, p) => s + p.amount, 0)
        : paid

      const salePayload = {
        shop_id: shopId,
        customer_id: selectedCustomer?.id || null,
        subtotal: subtotal,
        total_amount: total,
        discount: totalAllDiscounts,
        paid_amount: Math.min(actualPaid, total),
        payment_type: paymentMode === 'split' ? 'split' : paymentMode,
        payment_details: paymentMode === 'split' ? splitPayments : null,
        prescription_ref: prescriptionNo || null,
        notes: note || null,
        served_by: user?.id || null,
        created_at: now,
      }

      if (isOnline) {
        const { data: saleData, error: saleErr } = await supabase.from('sales').insert(salePayload).select().single()
        if (saleErr) throw saleErr

        const saleItems = cart.map(c => ({
          sale_id: saleData.id,
          product_id: c.product_id,
          batch_id: c.batch_id,
          product_name: c.name,
          batch_number: c.batch_number,
          quantity: c.quantity,
          unit_price: c.unit_price,
          purchase_price: c.purchase_price,
          discount: calcItemDiscount(c),
          total: calcItemTotal(c),
          expiry_date: c.expiry_date,
        }))
        const { error: itemsErr } = await supabase.from('sale_items').insert(saleItems)
        if (itemsErr) throw itemsErr

        // Note: stock deduction is handled automatically by the DB trigger
        // trg_sale_items_deduct on sale_items INSERT — no explicit RPC needed.

        // Update customer balance if credit
        const creditAmount = paymentMode === 'credit'
          ? total
          : paymentMode === 'split'
            ? splitPayments.filter(p => p.method === 'credit').reduce((s, p) => s + p.amount, 0)
            : 0

        if (selectedCustomer && creditAmount > 0) {
          await supabase.from('customers').update({
            balance: (selectedCustomer.balance || 0) + creditAmount
          }).eq('id', selectedCustomer.id)
        }

        setSuccessInvoice({
          ...saleData,
          items: saleItems.map((si, i) => ({
            ...si,
            name: cart[i].name,
            requires_prescription: cart[i].requires_prescription,
          })),
          customer: selectedCustomer,
          subtotal,
          payment_details: paymentMode === 'split' ? splitPayments : [],
        })
      } else {
        // Offline
        const saleId = Date.now()
        await db.sales.add({ id: saleId, ...salePayload, synced: false })
        const saleItems = cart.map(c => ({
          sale_id: saleId,
          product_id: c.product_id,
          batch_id: c.batch_id,
          product_name: c.name,
          batch_number: c.batch_number,
          quantity: c.quantity,
          unit_price: c.unit_price,
          purchase_price: c.purchase_price,
          discount: calcItemDiscount(c),
          total: calcItemTotal(c),
          expiry_date: c.expiry_date,
        }))
        await db.sale_items.bulkAdd(saleItems)
        for (const c of cart) {
          const batch = await db.product_batches.get(c.batch_id)
          if (batch) {
            await db.product_batches.update(c.batch_id, {
              quantity_remaining: Math.max(0, batch.quantity_remaining - c.quantity)
            })
          }
        }
        setSuccessInvoice({
          id: saleId, ...salePayload,
          items: saleItems.map((si, i) => ({ ...si, name: cart[i].name, requires_prescription: cart[i].requires_prescription })),
          customer: selectedCustomer,
          subtotal,
          payment_details: paymentMode === 'split' ? splitPayments : [],
        })
      }

      resetCart()
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
      {/* Mobile cart overlay backdrop */}
      {showMobileCart && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setShowMobileCart(false)} />
      )}

      {/* ═══ Left — Product Search, Barcode, Recent Sales ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 bg-gray-50">
        <div className="p-4 bg-white border-b border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <ShoppingCart size={20} className="text-blue-600" /> Pharmacy POS
            </h1>
            <div className="flex items-center gap-2">
              {/* Hold button */}
              <button
                onClick={() => setShowHeldDrawer(true)}
                className="relative px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition flex items-center gap-1.5"
              >
                <Pause size={13} /> Held
                {heldSales.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {heldSales.length}
                  </span>
                )}
              </button>
              {/* Barcode toggle */}
              <button
                onClick={() => { setBarcodeMode(!barcodeMode); searchRef.current?.focus() }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                  barcodeMode
                    ? 'bg-green-600 text-white shadow-lg shadow-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Barcode size={13} /> {barcodeMode ? 'Scanner ON' : 'Scanner'}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 transition ${
              barcodeMode ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
            }`}>
              {barcodeMode ? <Barcode size={16} className="text-green-600 flex-shrink-0" /> : <Search size={16} className="text-gray-400 flex-shrink-0" />}
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={barcodeMode ? 'Scan barcode… (press Enter)' : 'Search medicine name, generic, barcode…'}
                className="flex-1 text-sm outline-none bg-transparent"
                autoFocus
              />
              {searchQuery && <button onClick={() => setSearchQuery('')}><X size={14} className="text-gray-400" /></button>}
            </div>
            {/* Dropdown results (hidden in barcode mode) */}
            {!barcodeMode && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 mt-1 max-h-72 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{p.name}
                        {p.requires_prescription && <span className="ml-1 text-[10px] bg-red-100 text-red-600 px-1 rounded">Rx</span>}
                      </p>
                      <p className="text-xs text-gray-400">{p.generic_name || ''} • {p.unit} • Shelf: {p.shelf_location || 'N/A'}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-600 flex-shrink-0">{fmt(p.sale_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile floating cart button */}
        <button
          onClick={() => setShowMobileCart(true)}
          className="md:hidden fixed bottom-6 right-5 z-30 bg-blue-600 text-white rounded-full w-16 h-16 flex flex-col items-center justify-center shadow-2xl hover:bg-blue-700 transition active:scale-95"
        >
          <ShoppingCart size={22} />
          {cart.length > 0 && (
            <span className="text-[10px] font-black leading-none">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
          )}
        </button>

        {/* Recent Sales + Returns */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
            <Clock size={12} /> Recent Sales
          </p>
          <div className="space-y-2">
            {recentSales.map(s => (
              <div key={s.id} className="bg-white rounded-lg border border-gray-100 px-3 py-2 flex items-center justify-between group">
                <div>
                  <p className="text-xs font-medium text-gray-700">{s.customers?.name || 'Walk-in'}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-gray-400 font-mono">#{String(s.id).slice(-6)}</p>
                    {s.status === 'returned' && (
                      <span className="text-[9px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded font-bold uppercase">Returned</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{fmt(s.total_amount)}</p>
                    <p className="text-[10px] text-gray-400">{new Date(s.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {s.status !== 'returned' && (
                    <button
                      onClick={() => setReturnSale(s)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition"
                      title="Process Return"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {recentSales.length === 0 && (
              <p className="text-xs text-gray-300 text-center py-8">No recent sales</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Right — Cart & Checkout ═══ */}
      <div className={`
        ${showMobileCart
          ? 'fixed inset-0 z-50 flex md:static md:inset-auto md:z-auto'
          : 'hidden md:flex'}
        w-full md:w-96 flex-col bg-white overflow-hidden
      `}>
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

        {/* Mobile close button */}
        <button
          onClick={() => setShowMobileCart(false)}
          className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-100 text-sm font-bold text-gray-500 hover:text-gray-800 transition"
        >
          <X size={16} /> Close Cart
        </button>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <ShoppingCart size={40} className="mb-2" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs">Search and add medicines above</p>
            </div>
          ) : (
            <div>
              {cart.map(item => (
                <CartItem
                  key={item.cart_id}
                  item={item}
                  onQty={updateQty}
                  onRemove={removeFromCart}
                  onDiscountChange={updateItemDiscount}
                  onDiscountTypeToggle={toggleItemDiscountType}
                />
              ))}
            </div>
          )}
        </div>

        {/* Checkout Panel */}
        {cart.length > 0 && (
          <div className="border-t border-gray-200 p-3 space-y-3 bg-gray-50">
            {/* Sale-level discount */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 flex-shrink-0 w-16">Discount</label>
              <input type="number" min="0" value={saleDiscount}
                onChange={e => setSaleDiscount(e.target.value)}
                className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white" />
              <button
                onClick={() => { setSaleDiscountType(saleDiscountType === 'flat' ? 'percent' : 'flat'); setSaleDiscount(0) }}
                className={`text-xs font-bold px-2 py-1.5 rounded transition ${
                  saleDiscountType === 'percent' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {saleDiscountType === 'percent' ? '%' : 'Rs'}
              </button>
            </div>

            {/* Prescription # */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 flex-shrink-0 w-16">Rx #</label>
              <input value={prescriptionNo} onChange={e => setPrescriptionNo(e.target.value)}
                placeholder="Prescription number"
                className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white" />
            </div>

            {/* Payment mode selector */}
            <div className="flex gap-1 flex-wrap">
              {[
                { value: 'cash', label: 'Cash' },
                { value: 'credit', label: 'Credit' },
                { value: 'card', label: 'Card' },
                { value: 'easypaisa', label: 'EasyPaisa' },
                { value: 'jazzcash', label: 'JazzCash' },
                { value: 'split', label: '🔀 Split' },
              ].map(m => (
                <button key={m.value} onClick={() => { setPaymentMode(m.value); if (m.value !== 'split') setSplitPayments([]) }}
                  className={`flex-1 min-w-fit px-2 py-1 rounded text-xs font-medium transition-colors ${
                    paymentMode === m.value ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Multi-payment builder */}
            {paymentMode === 'split' && (
              <MultiPaymentBuilder total={total} payments={splitPayments} setPayments={setSplitPayments} />
            )}

            {/* Totals */}
            <div className="bg-white rounded-lg border border-gray-200 p-2.5 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal ({cart.length} items)</span><span>{fmt(subtotal)}</span>
              </div>
              {totalAllDiscounts > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Discount</span><span>-{fmt(totalAllDiscounts)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-1">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
              {balance > 0 && paymentMode !== 'split' && (
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

            <div className="flex gap-2">
              {/* Hold button */}
              <button onClick={holdSale}
                className="py-3 px-3 border border-amber-200 text-amber-700 rounded-xl font-semibold text-sm hover:bg-amber-50 transition flex items-center gap-1.5"
                title="Hold this sale">
                <Pause size={15} />
              </button>

              {/* Process Sale */}
              <button onClick={processSale} disabled={processing || cart.length === 0 || (paymentMode === 'split' && splitPayments.length === 0)}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {processing ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <><Receipt size={16} /> Complete Sale — {fmt(total)}</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Toast ═══ */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-2xl text-sm font-medium z-50 animate-bounce">
          {toast}
        </div>
      )}

      {/* ═══ Success Modal / Invoice ═══ */}
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
                <span>Items</span><span className="font-medium">{successInvoice.items?.length || 0}</span>
              </div>
              {totalAllDiscounts > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Discount</span><span className="font-medium">-{fmt(successInvoice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>Total</span><span className="font-bold text-gray-900">{fmt(successInvoice.total_amount)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Paid</span><span className="font-medium text-green-600">{fmt(successInvoice.paid_amount)}</span>
              </div>
              {/* Split payment details */}
              {successInvoice.payment_details?.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-2 space-y-1">
                  <p className="text-[10px] font-bold text-blue-600 uppercase">Payment Breakdown</p>
                  {successInvoice.payment_details.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-blue-700">
                      <span className="capitalize">{p.method}</span><span>{fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
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
                <Printer size={14} /> Print Receipt
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

      {/* ═══ Receipt Print (hidden, visible only on print) ═══ */}
      <ReceiptPrint
        sale={successInvoice}
        shopName={shopName}
        shopPhone={shopPhone}
        shopAddress={shopAddress}
      />

      {/* ═══ Return Modal ═══ */}
      {returnSale && (
        <ReturnModal
          sale={returnSale}
          onClose={() => setReturnSale(null)}
          onSuccess={() => { load(); showToast('✓ Return processed') }}
        />
      )}

      {/* ═══ Held Sales Drawer ═══ */}
      {showHeldDrawer && (
        <HeldSalesDrawer
          heldSales={heldSales}
          onResume={resumeHeldSale}
          onDelete={deleteHeldSale}
          onClose={() => setShowHeldDrawer(false)}
        />
      )}
    </div>
  )
}
