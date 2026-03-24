import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { db, addToSyncQueue } from '../services/db'
import PasswordModal from '../components/PasswordModal'
import * as XLSX from 'xlsx'
import { hasFeature } from '../utils/featureGate'

export default function Settings() {
  const { user } = useAuth()

  const LOGO_KEY = `shop_logo_${user?.shop_id}`

  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem('shop_settings_full')
      if (saved) return JSON.parse(saved)
    } catch (_) {}
    return {
      name: localStorage.getItem('shop_name') || 'PharmaCare',
      phone: '',
      address: '',
      logo_url: '',
      invoice_footer: 'شکریہ! دوبارہ تشریف لائیں',
      quotation_footer: 'یہ صرف قیمت نامہ ہے',
      print_size: 'thermal',
      print_mode: 'manual',
      invoice_prefix: 'INV',
      wa_reminder_template: 'Hello [Name], this is a reminder from [Shop Name] regarding your outstanding balance of Rs. [Amount]. Please clear your dues at your earliest convenience. Thank you!',
      wa_bill_template: 'Hello [Name], thank you for shopping at [Shop Name]! Your bill summary for Invoice #[ID] is Rs. [Amount]. Thank you for your business!',
      wa_reorder_template: 'Assalam-o-Alaikum *[Supplier Name]*! 🙏\n\n*[Shop Name]* se order:\n\n[Items]\n\nMeharbani farma kar jald supply karein. Shukriya!',
    }
  })

  const [logoUrl, setLogoUrl] = useState(() =>
    (user?.shop_id ? localStorage.getItem(`shop_logo_${user.shop_id}`) : null)
    || localStorage.getItem('shop_logo') || ''
  )

  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [planInfo, setPlanInfo] = useState(null)
  const [printTemplate, setPrintTemplate] = useState(() => localStorage.getItem('print_template') || '2')
  const [reportPeriod, setReportPeriod] = useState('today')
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    if (user?.shop_id) {
      const saved = localStorage.getItem(`shop_logo_${user.shop_id}`) || localStorage.getItem('shop_logo')
      if (saved) setLogoUrl(saved)
    }
  }, [user?.shop_id])

  useEffect(() => {
    fetchShop()
    fetchPlanInfo()
  }, [])

  // ── Fetch shop from Supabase / Dexie ───────────────────────────────────────
  const fetchShop = async () => {
    try {
      if (!navigator.onLine) throw new Error('Offline')
      const sid = Number(user.shop_id)
      const fetchPromise = supabase.from('shops').select('*').eq('id', sid).maybeSingle()
      const timeout = new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 4000))
      const { data, error } = await Promise.race([fetchPromise, timeout])
      if (error) throw error
      if (data) {
        setShop(data)
        populateForm(data)
      }
    } catch (_) {
      // Fallback: read from localStorage
      const saved = localStorage.getItem('shop_settings_full')
      if (saved) {
        try { populateForm(JSON.parse(saved)) } catch (_) {}
      }
    } finally {
      setLoading(false)
    }
  }

  const populateForm = (data) => {
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem('shop_settings_full') || '{}') } catch (_) {}
    setForm(prev => ({
      name:                 saved.name                 || data.name     || prev.name    || 'PharmaCare',
      phone:                saved.phone                || data.phone    || prev.phone   || '',
      address:              saved.address              || data.address  || prev.address || '',
      logo_url:             prev.logo_url,
      invoice_footer:       saved.invoice_footer       || prev.invoice_footer       || 'شکریہ! دوبارہ تشریف لائیں',
      quotation_footer:     saved.quotation_footer     || prev.quotation_footer     || 'یہ صرف قیمت نامہ ہے',
      print_size:           saved.print_size           || prev.print_size           || 'thermal',
      print_mode:           saved.print_mode           || prev.print_mode           || 'manual',
      invoice_prefix:       saved.invoice_prefix       || prev.invoice_prefix       || 'INV',
      wa_reminder_template: saved.wa_reminder_template || prev.wa_reminder_template || '',
      wa_bill_template:     saved.wa_bill_template     || prev.wa_bill_template     || '',
      wa_reorder_template:  saved.wa_reorder_template  || prev.wa_reorder_template  || '',
    }))
    const localLogo = (user?.shop_id ? localStorage.getItem(`shop_logo_${user.shop_id}`) : null)
      || localStorage.getItem('shop_logo')
    if (!localLogo && data.logo_url) setLogoUrl(data.logo_url)
  }

  // ── Plan info ───────────────────────────────────────────────────────────────
  const fetchPlanInfo = async () => {
    const cached = localStorage.getItem('plan_limits')
    if (cached) { try { setPlanInfo(JSON.parse(cached)) } catch (_) {} }
    if (!navigator.onLine || !user?.shop_id) return
    try {
      const { data, error } = await supabase.rpc('get_shop_config', { p_shop_id: user.shop_id })
      if (!error && data) {
        setPlanInfo(data)
        localStorage.setItem('plan_limits', JSON.stringify(data))
        if (data.features) localStorage.setItem('plan_features', JSON.stringify(data.features))
      }
    } catch (_) {}
  }

  // ── Save profile ────────────────────────────────────────────────────────────
  const handleUpdate = async (e) => {
    e.preventDefault()
    setSaving(true)
    const sid = Number(user.shop_id)
    const fullSettings = { ...form, logo_url: logoUrl }
    localStorage.setItem('shop_settings_full', JSON.stringify(fullSettings))
    localStorage.setItem('shop_name', form.name || 'PharmaCare')
    window.dispatchEvent(new Event('storage'))
    try {
      if (!navigator.onLine) throw new TypeError('Failed to fetch')
      const { data: rpc, error } = await supabase.rpc('update_shop_settings', {
        p_shop_id: sid,
        p_name: form.name,
        p_phone: form.phone,
        p_address: form.address,
      })
      if (error) throw error
      if (rpc && !rpc.success) throw new Error(rpc.error || 'Update failed')
      alert('Settings saved successfully! ✅')
    } catch (err) {
      const msg = err?.message || String(err)
      if (msg.includes('Failed to fetch') || !navigator.onLine) {
        await addToSyncQueue('shops', 'UPDATE', { id: sid, name: form.name, phone: form.phone, address: form.address })
        alert('Offline: Settings saved locally. Will sync when online. 🔄')
      } else {
        alert('Save failed: ' + msg)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Logo upload ─────────────────────────────────────────────────────────────
  const compressImage = (file) => new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 300
      let w = img.width, h = img.height
      if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.onerror = () => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.readAsDataURL(file)
    }
    img.src = url
  })

  const handleLogoUpload = async (e) => {
    const sid = Number(user.shop_id)
    const file = e.target.files[0]
    if (!file) return
    setSaving(true)
    try {
      const compressed = await compressImage(file)
      setLogoUrl(compressed)
      localStorage.setItem(`shop_logo_${sid}`, compressed)
      localStorage.setItem('shop_logo', compressed)
      const updatedForm = { ...form, logo_url: compressed }
      setForm(updatedForm)
      localStorage.setItem('shop_settings_full', JSON.stringify(updatedForm))
      window.dispatchEvent(new Event('storage'))
      if (navigator.onLine) {
        const { data: rpc, error } = await supabase.rpc('update_shop_settings', { p_shop_id: sid, p_logo_url: compressed })
        if (error || (rpc && !rpc.success)) {
          alert('Logo saved on device ✅\n⚠️ Server sync failed. Logo will not show on other devices.')
        } else {
          alert('Logo saved & synced ✅')
        }
      } else {
        alert('Logo saved on device ✅\n(Offline — will sync when connected)')
      }
    } catch (err) {
      alert('Logo upload failed: ' + (err?.message || String(err)))
    } finally {
      setSaving(false)
    }
  }

  // ── Sales report ────────────────────────────────────────────────────────────
  const printSalesReport = async () => {
    setReportLoading(true)
    try {
      const now = new Date()
      let fromDate
      if (reportPeriod === 'today') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      } else if (reportPeriod === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0)
        fromDate = d.toISOString()
      } else {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      }

      let sales = []
      if (navigator.onLine) {
        const { data: s } = await supabase.from('sales').select('*').eq('shop_id', user.shop_id).gte('created_at', fromDate).order('created_at', { ascending: false })
        sales = s || []
      } else {
        sales = await db.sales.filter(s => String(s.shop_id) === String(user.shop_id) && s.created_at >= fromDate).toArray()
      }

      if (sales.length === 0) { alert('No sales found for the selected period.'); return }

      const shopName = form.name || 'PharmaCare'
      const periodLabel = reportPeriod === 'today' ? 'Today' : reportPeriod === 'week' ? 'This Week' : 'This Month'
      const totalRevenue = sales.reduce((s, x) => s + (x.paid_amount || 0), 0)
      const cashSales = sales.filter(s => s.payment_type === 'cash').reduce((s, x) => s + (x.paid_amount || 0), 0)
      const creditSales = sales.filter(s => s.payment_type === 'credit').reduce((s, x) => s + (x.total_amount || 0), 0)
      const totalDiscount = sales.reduce((s, x) => s + (x.discount || 0), 0)

      const rows = sales.map(s => `
        <tr>
          <td>${new Date(s.created_at).toLocaleDateString('en-PK')}</td>
          <td>#${String(s.id).slice(-8).toUpperCase()}</td>
          <td>${s.payment_type || '—'}</td>
          <td style="text-align:right">Rs.${(s.total_amount || 0).toLocaleString()}</td>
          <td style="text-align:right">Rs.${(s.paid_amount || 0).toLocaleString()}</td>
          <td style="text-align:right">${s.discount > 0 ? 'Rs.' + s.discount : '—'}</td>
        </tr>`).join('')

      const html = `<!DOCTYPE html><html><head><title>Sales Report — ${shopName}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .sub { color: #666; font-size: 11px; margin-bottom: 16px; }
        .summary { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
        .card { background: #f5f5f5; padding: 10px 16px; border-radius: 8px; min-width: 120px; }
        .card-label { font-size: 10px; color: #888; text-transform: uppercase; }
        .card-value { font-size: 16px; font-weight: bold; color: #111; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #222; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) td { background: #fafafa; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>📊 Sales Report — ${shopName}</h1>
      <p class="sub">Period: ${periodLabel} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PK')} &nbsp;|&nbsp; ${sales.length} transactions</p>
      <div class="summary">
        <div class="card"><div class="card-label">Total Revenue</div><div class="card-value">Rs.${totalRevenue.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Cash Sales</div><div class="card-value">Rs.${cashSales.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Credit Sales</div><div class="card-value">Rs.${creditSales.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Discounts</div><div class="card-value">Rs.${totalDiscount.toLocaleString()}</div></div>
        <div class="card"><div class="card-label">Transactions</div><div class="card-value">${sales.length}</div></div>
      </div>
      <table><thead><tr><th>Date</th><th>Invoice</th><th>Type</th><th>Total</th><th>Paid</th><th>Discount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500) }<\/script>
      </body></html>`

      const win = window.open('', '_blank')
      win.document.write(html)
      win.document.close()
    } catch (err) {
      alert('Report failed: ' + err.message)
    } finally {
      setReportLoading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-800">⚙️ Settings</h1>
        <span className="px-2 py-1 bg-gray-100 text-gray-400 text-[10px] font-bold uppercase rounded tracking-widest">
          Shop ID: {user.shop_id}
        </span>
      </div>

      {/* ── Shop Profile ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="font-bold text-gray-700">Shop Profile</h2>
          <p className="text-xs text-gray-400">This information will appear on your prints and invoices</p>
        </div>

        <form onSubmit={handleUpdate} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Store / Shop Name</label>
            <input type="text" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-lg font-medium" />
          </div>

          {/* Logo */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">Store Logo</label>
            <div className="flex gap-4 items-center">
              <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  : <span className="text-2xl">🏪</span>}
              </div>
              <div className="flex flex-col gap-2">
                <input type="file" id="logo-upload" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <label htmlFor="logo-upload"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition">
                  {saving ? '⏳ Saving...' : '📁 Upload New Logo'}
                </label>
                {logoUrl && (
                  <button type="button"
                    onClick={async () => {
                      const sid = Number(user.shop_id)
                      setLogoUrl('')
                      localStorage.removeItem(`shop_logo_${sid}`)
                      localStorage.removeItem('shop_logo')
                      const upd = { ...form, logo_url: '' }
                      setForm(upd)
                      localStorage.setItem('shop_settings_full', JSON.stringify(upd))
                      window.dispatchEvent(new Event('storage'))
                      if (navigator.onLine) supabase.rpc('update_shop_settings', { p_shop_id: sid, p_logo_url: '' }).then(() => {})
                    }}
                    className="text-xs text-red-500 hover:text-red-700 font-bold text-left">
                    ✕ Remove Logo
                  </button>
                )}
                <p className="text-[10px] text-gray-400">JPG, PNG, or SVG. Saved automatically on select.</p>
              </div>
            </div>
          </div>

          {/* Phone + Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">Contact Phone</label>
              <input type="text" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 0300-1234567"
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">Location / City</label>
              <input type="text" value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. Karachi, Sindh"
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          {/* Footers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">Invoice Footer (Urdu/Eng)</label>
              <input type="text" value={form.invoice_footer}
                onChange={e => setForm({ ...form, invoice_footer: e.target.value })}
                placeholder="e.g. شکریہ! دوبارہ تشریف لائیں"
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">Quotation Footer (Urdu/Eng)</label>
              <input type="text" value={form.quotation_footer}
                onChange={e => setForm({ ...form, quotation_footer: e.target.value })}
                placeholder="e.g. یہ صرف قیمت نامہ ہے"
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          {/* Invoice prefix */}
          <div className="pt-4 border-t max-w-xs">
            <label className="block text-sm font-bold text-gray-600 mb-1">Invoice Number Prefix</label>
            <input type="text" value={form.invoice_prefix}
              onChange={e => setForm({ ...form, invoice_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 10) })}
              placeholder="e.g. INV or PHARMA"
              maxLength={10}
              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
            <p className="text-xs text-gray-400 mt-1">
              Invoices will appear as: <span className="font-mono font-bold text-blue-600">{form.invoice_prefix || 'INV'}-00001234</span>
            </p>
          </div>

          {/* Print size & mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">Print Size</label>
              <select value={form.print_size} onChange={e => setForm({ ...form, print_size: e.target.value })}
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold">
                <option value="thermal">Thermal (80mm)</option>
                <option value="a4">A4 (Full Page)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">Print Flow</label>
              <select value={form.print_mode} onChange={e => setForm({ ...form, print_mode: e.target.value })}
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold">
                <option value="manual">Manual (Show Dialog)</option>
                <option value="auto">Auto (Print Direct)</option>
              </select>
            </div>
          </div>

          {/* WhatsApp Templates */}
          <div className="pt-4 border-t space-y-4">
            <div>
              <h3 className="text-sm font-black text-blue-600 uppercase tracking-wider mb-1">WhatsApp Messaging Templates</h3>
              <p className="text-[10px] text-gray-400 mb-3">
                Customer templates:&nbsp;
                {['[Name]', '[Amount]', '[Shop Name]', '[ID]'].map(t => (
                  <code key={t} className="bg-gray-100 px-1 rounded mr-1">{t}</code>
                ))}
                &nbsp;·&nbsp; Reorder template:&nbsp;
                {['[Supplier Name]', '[Shop Name]', '[Items]'].map(t => (
                  <code key={t} className="bg-gray-100 px-1 rounded mr-1">{t}</code>
                ))}
              </p>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">💬 Debt Reminder Template</label>
              <textarea value={form.wa_reminder_template}
                onChange={e => setForm({ ...form, wa_reminder_template: e.target.value })}
                rows={3} placeholder="Hello [Name], your balance is Rs. [Amount]..."
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">🧾 New Bill / Sale Template</label>
              <textarea value={form.wa_bill_template}
                onChange={e => setForm({ ...form, wa_bill_template: e.target.value })}
                rows={3} placeholder="Hello [Name], your bill #[ID] for Rs. [Amount]..."
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-1">📦 Low Stock Reorder Template (Inventory → Reorder WA)</label>
              <textarea value={form.wa_reorder_template}
                onChange={e => setForm({ ...form, wa_reorder_template: e.target.value })}
                rows={4}
                placeholder={'Assalam-o-Alaikum *[Supplier Name]*!\n\n*[Shop Name]* se order:\n\n[Items]\n\nMeharbani farma kar supply karein.'}
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" />
              <p className="text-[10px] text-gray-400 mt-1">
                <code className="bg-gray-100 px-1 rounded">[Items]</code> is auto-filled with low stock product names, current stock and suggested reorder quantity.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-[10px] text-gray-400 max-w-xs">
              Note: Changing the shop name will affect all future invoices and quotations immediately.
            </p>
            <button type="submit" disabled={saving}
              className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-lg shadow-blue-100 disabled:opacity-50">
              {saving ? 'Saving...' : 'Update Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Data Management ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-gray-800">Data Management & Backup</h3>
            <p className="text-xs text-gray-400 mt-0.5">Import, export or reset your local store data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasFeature('offline_sync') && (
              <button disabled={saving}
                onClick={async () => {
                  if (!navigator.onLine) { alert('Aap abhi offline hain! Pehle internet se connect karein.'); return }
                  setSaving(true)
                  try {
                    const sid = user.shop_id
                    const [prods, custs, sups, sales, purs, exps, emps, us] = await Promise.all([
                      supabase.from('products').select('*').eq('shop_id', sid),
                      supabase.from('customers').select('*').eq('shop_id', sid),
                      supabase.from('suppliers').select('*').eq('shop_id', sid),
                      supabase.from('sales').select('*').eq('shop_id', sid),
                      supabase.from('purchases').select('*').eq('shop_id', sid),
                      supabase.from('expenses').select('*').eq('shop_id', sid),
                      supabase.from('employees').select('*').eq('shop_id', sid),
                      supabase.from('users').select('*').eq('shop_id', sid),
                    ])
                    const saleIds = (sales.data || []).map(s => s.id)
                    const purIds = (purs.data || []).map(p => p.id)
                    const [si, pi, batches] = await Promise.all([
                      saleIds.length ? supabase.from('sale_items').select('*').in('sale_id', saleIds) : { data: [] },
                      purIds.length ? supabase.from('purchase_items').select('*').in('purchase_id', purIds) : { data: [] },
                      supabase.from('product_batches').select('*').eq('shop_id', sid),
                    ])
                    const safe = async (tbl, d) => { if (d?.length) { await db[tbl].clear(); await db[tbl].bulkPut(JSON.parse(JSON.stringify(d))) } }
                    await safe('products', prods.data)
                    await safe('customers', custs.data)
                    await safe('suppliers', sups.data)
                    await safe('sales', sales.data)
                    await safe('sale_items', si.data)
                    await safe('purchases', purs.data)
                    await safe('purchase_items', pi.data)
                    await safe('expenses', exps.data)
                    await safe('employees', emps.data)
                    await safe('users', us.data)
                    await safe('product_batches', batches.data)
                    alert('Sari data successfully local device mein save ho gayi! Ab aap offline kaam kar sakte hain. ✅')
                  } catch (err) { alert('Sync failed: ' + err.message) }
                  finally { setSaving(false) }
                }}
                className="px-4 py-2 border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl font-bold text-sm disabled:opacity-50">
                {saving ? '⏳ Downloading...' : '⬇️ Download All for Offline'}
              </button>
            )}
            <button
              onClick={async () => {
                if (!confirm('Local cache clear krne se data re-fetch hoga. Continue?')) return
                await db.products.clear(); await db.customers.clear(); await db.suppliers.clear()
                await db.sales.clear(); await db.sale_items.clear(); await db.purchases.clear()
                await db.purchase_items.clear(); await db.expenses.clear()
                await db.product_batches.clear(); await db.employees.clear()
                alert('Local cache cleared! Page refresh ho raha hai.')
                window.location.reload()
              }}
              className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-sm">
              🧹 Clear All Cache
            </button>
            {hasFeature('offline_sync') && (
              <button
                onClick={async () => {
                  const { syncOfflineData } = await import('../services/syncService').catch(() => ({ syncOfflineData: null }))
                  if (syncOfflineData) { await syncOfflineData(); alert('Sync triggered! ✅') }
                  else alert('Sync service not available.')
                }}
                className="px-4 py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-sm">
                🔄 Sync Now
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Export */}
          <div className="p-4 bg-green-50/50 rounded-2xl border border-green-100 flex flex-col gap-3">
            <div>
              <p className="font-bold text-green-800 text-sm">Export All Data</p>
              <p className="text-[10px] text-green-600">Save a complete backup of all products, customers, and suppliers.</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const data = {
                    products: await db.products.toArray(),
                    product_batches: await db.product_batches.toArray(),
                    customers: await db.customers.toArray(),
                    suppliers: await db.suppliers.toArray(),
                    sales: await db.sales.toArray(),
                    sale_items: await db.sale_items.toArray(),
                    purchases: await db.purchases.toArray(),
                    purchase_items: await db.purchase_items.toArray(),
                    expenses: await db.expenses.toArray(),
                    employees: await db.employees.toArray(),
                    exported_at: new Date().toISOString(),
                    shop_id: user.shop_id,
                    version: '1.0'
                  }
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `PharmaCare_Backup_${new Date().toISOString().slice(0, 10)}.json`
                  document.body.appendChild(a); a.click()
                  document.body.removeChild(a); URL.revokeObjectURL(url)
                  alert('Full backup downloaded! 💾 Is file ko safe rakhein.')
                } catch (err) { alert('Backup failed: ' + err.message) }
              }}
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xs shadow-md">
              📥 Download System Backup (.json)
            </button>
            <button
              onClick={async () => {
                try {
                  const sheets = {
                    Products: await db.products.toArray(),
                    Batches: await db.product_batches.toArray(),
                    Customers: await db.customers.toArray(),
                    Suppliers: await db.suppliers.toArray(),
                    Sales: await db.sales.toArray(),
                    Purchases: await db.purchases.toArray(),
                    Expenses: await db.expenses.toArray(),
                    Employees: await db.employees.toArray(),
                  }
                  const wb = XLSX.utils.book_new()
                  for (const [name, rows] of Object.entries(sheets)) {
                    const ws = rows.length > 0
                      ? XLSX.utils.json_to_sheet(rows)
                      : XLSX.utils.json_to_sheet([{ Message: 'No data' }])
                    XLSX.utils.book_append_sheet(wb, ws, name)
                  }
                  XLSX.writeFile(wb, `PharmaCare_Excel_${new Date().toISOString().slice(0, 10)}.xlsx`)
                  alert('Excel exported! 📊')
                } catch (err) { alert('Excel export failed: ' + err.message) }
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-md">
              📊 Export to Excel
            </button>
          </div>

          {/* Import */}
          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-col gap-3">
            <div>
              <p className="font-bold text-blue-800 text-sm">Import / Restore Data</p>
              <p className="text-[10px] text-blue-600">Restore your database from a previous backup file.</p>
            </div>
            <input type="file" accept=".json" id="import-backup" className="hidden"
              onChange={async (e) => {
                const file = e.target.files[0]
                if (!file) return
                if (!confirm('Warning: Is se apka mojooda local data replace ho jayega. Continue?')) return
                const reader = new FileReader()
                reader.onload = async (ev) => {
                  try {
                    const data = JSON.parse(ev.target.result)
                    if (!data.products || !data.customers) throw new Error('Invalid backup file format.')
                    await db.transaction('rw',
                      db.products, db.product_batches, db.customers, db.suppliers,
                      db.sales, db.sale_items, db.purchases, db.purchase_items,
                      db.expenses, db.employees,
                      async () => {
                        await db.products.clear(); await db.product_batches.clear()
                        await db.customers.clear(); await db.suppliers.clear()
                        await db.sales.clear(); await db.sale_items.clear()
                        await db.purchases.clear(); await db.purchase_items.clear()
                        await db.expenses.clear(); await db.employees.clear()
                        if (data.products?.length) await db.products.bulkAdd(data.products)
                        if (data.product_batches?.length) await db.product_batches.bulkAdd(data.product_batches)
                        if (data.customers?.length) await db.customers.bulkAdd(data.customers)
                        if (data.suppliers?.length) await db.suppliers.bulkAdd(data.suppliers)
                        if (data.sales?.length) await db.sales.bulkAdd(data.sales)
                        if (data.sale_items?.length) await db.sale_items.bulkAdd(data.sale_items)
                        if (data.purchases?.length) await db.purchases.bulkAdd(data.purchases)
                        if (data.purchase_items?.length) await db.purchase_items.bulkAdd(data.purchase_items)
                        if (data.expenses?.length) await db.expenses.bulkAdd(data.expenses)
                        if (data.employees?.length) await db.employees.bulkAdd(data.employees)
                      })
                    alert('Data restored! ✅ Page refresh ho raha hai.')
                    window.location.reload()
                  } catch (err) { alert('Import failed: ' + err.message) }
                }
                reader.readAsText(file)
              }} />
            <label htmlFor="import-backup"
              className="flex items-center justify-center w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs cursor-pointer shadow-md">
              📤 Upload & Restore
            </label>
          </div>
        </div>
      </div>

      {/* ── Billing Template ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="font-bold text-gray-700">Billing Template</h2>
          <p className="text-xs text-gray-400">Choose how your receipts and invoices look when printed. Works for both 80mm thermal and A4.</p>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { id: '1', icon: '📄', name: 'Simple',       desc: 'Minimal & clean. No logo area, compact spacing. Fast to print.' },
            { id: '2', icon: '🧾', name: 'Classic',      desc: 'Standard receipt style with logo, dashed lines and item table. Recommended.' },
            { id: '3', icon: '📋', name: 'Professional', desc: 'Full invoice look — letterhead, invoice number box, PAID stamp, signature line.' },
          ].map(t => (
            <button key={t.id} type="button"
              onClick={() => { setPrintTemplate(t.id); localStorage.setItem('print_template', t.id) }}
              className={`text-left p-4 rounded-xl border-2 transition ${printTemplate === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="text-2xl mb-2">{t.icon}</div>
              <div className="font-bold text-gray-800 flex items-center gap-2">
                {t.name}
                {printTemplate === t.id && <span className="text-[10px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full">Active</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Sales Report ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="font-bold text-gray-700">Print Sales Report</h2>
          <p className="text-xs text-gray-400">Generate and print a daily, weekly, or monthly sales summary with revenue breakdown.</p>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'today', label: '📅 Today' },
                { id: 'week',  label: '📆 This Week' },
                { id: 'month', label: '🗓️ This Month' },
              ].map(p => (
                <button key={p.id} type="button" onClick={() => setReportPeriod(p.id)}
                  className={`px-4 py-2 rounded-xl border font-bold text-sm transition ${reportPeriod === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <button onClick={printSalesReport} disabled={reportLoading}
              className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition disabled:opacity-50 text-sm whitespace-nowrap">
              {reportLoading ? '⏳ Loading...' : '🖨️ Print Report'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Report includes: total revenue, cash/card/credit breakdown, outstanding balance, discount given, and full transaction list.
          </p>
        </div>
      </div>

      {/* ── Plan & Subscription ── */}
      {planInfo && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-blue-50 px-6 py-4 border-b">
            <h2 className="font-bold text-blue-800">Plan & Subscription</h2>
            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Your Current Service Tier</p>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-4 flex-1">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Active Plan</label>
                  <p className="text-xl font-black text-gray-800">{planInfo.plan_name} <span className="text-blue-600 italic">Tier</span></p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Product Limit</label>
                    <p className="font-bold text-gray-800">{planInfo.product_limit ?? '∞'} items</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Users Limit</label>
                    <p className="font-bold text-gray-800">{planInfo.user_limit ?? '∞'} accounts</p>
                  </div>
                </div>
              </div>
              <div className="md:border-l md:pl-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Next Billing Date</label>
                  <p className="font-mono font-black text-gray-800 bg-gray-50 px-3 py-1 rounded-lg border">
                    {planInfo.next_billing_date ? new Date(planInfo.next_billing_date).toLocaleDateString('en-PK', { dateStyle: 'long' }) : 'N/A'}
                  </p>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-[10px] text-blue-700 font-bold leading-tight">Need more capacity? Contact support to upgrade your plan.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Software Updates ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800">Software Updates</h3>
          <p className="text-xs text-gray-400 mt-0.5">Your POS is currently running the latest version <strong>v1.0.0</strong></p>
        </div>
        <div className="flex -space-x-2">
          <span className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-blue-600">AS</span>
          <span className="w-8 h-8 rounded-full bg-green-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-green-600">⚠️</span>
        </div>
      </div>

      {/* ── Danger Zone ── */}
      <div className="bg-red-50 rounded-2xl shadow-sm border-2 border-red-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-xl">⚠️</span>
          </div>
          <div>
            <h3 className="font-bold text-red-800 text-lg">Danger Zone</h3>
            <p className="text-xs text-red-500">Irreversible actions — proceed with extreme caution</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-bold text-gray-800">🗑️ Clear All Shop Data</p>
              <p className="text-xs text-gray-500 mt-1">
                Permanently delete ALL products, suppliers, customers, sales, purchases, expenses, and payments for this shop. This cannot be undone!
              </p>
            </div>
            <button onClick={() => setShowPasswordModal(true)} disabled={clearing}
              className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition whitespace-nowrap shadow-lg shadow-red-200 disabled:opacity-50">
              {clearing ? 'Clearing...' : '🔥 Clear All Data'}
            </button>
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <PasswordModal
          title="⚠️ Clear ALL Shop Data"
          message="This will permanently delete ALL data. Enter your password to confirm."
          onConfirm={async () => {
            setShowPasswordModal(false)
            const shopName = form.name || 'PharmaCare'
            const typed = prompt(`Type "${shopName}" to confirm permanent deletion of ALL data:`)
            if (typed !== shopName) { alert('Shop name does not match. Operation cancelled.'); return }
            setClearing(true)
            try {
              if (navigator.onLine) {
                const { data: shopSales } = await supabase.from('sales').select('id').eq('shop_id', user.shop_id)
                const saleIds = (shopSales || []).map(s => s.id)
                if (saleIds.length) await supabase.from('sale_items').delete().in('sale_id', saleIds)

                const { data: shopPurchases } = await supabase.from('purchases').select('id').eq('shop_id', user.shop_id)
                const purchaseIds = (shopPurchases || []).map(p => p.id)
                if (purchaseIds.length) await supabase.from('purchase_items').delete().in('purchase_id', purchaseIds)

                const tables = ['products', 'product_batches', 'customers', 'suppliers', 'sales', 'purchases',
                  'expenses', 'employees', 'employee_payments', 'customer_payments', 'supplier_payments']
                for (const t of tables) {
                  await supabase.from(t).delete().eq('shop_id', user.shop_id)
                }
              }
              const localTables = ['products', 'product_batches', 'customers', 'suppliers', 'sales', 'sale_items',
                'purchases', 'purchase_items', 'expenses', 'employees', 'employee_payments',
                'customer_payments', 'supplier_payments', 'trash_items', 'sync_queue']
              for (const t of localTables) {
                if (db[t]) await db[t].clear()
              }
              alert('✅ All shop data has been cleared successfully!')
              window.location.reload()
            } catch (err) {
              alert('Error clearing data: ' + err.message)
            } finally {
              setClearing(false)
            }
          }}
          onCancel={() => setShowPasswordModal(false)}
        />
      )}
    </div>
  )
}
