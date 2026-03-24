import { CURRENCY, RECEIPT_FOOTER } from '../utils/constants'

/**
 * ReceiptPrint — Hidden printable thermal receipt (80mm).
 * Render this component inside your page; it only appears when window.print() is called.
 */
export default function ReceiptPrint({ sale, shopName, shopPhone, shopAddress }) {
  if (!sale) return null

  const fmt = n => `${CURRENCY}${(n || 0).toLocaleString()}`
  const items = sale.items || []
  const payments = sale.payment_details || []
  const balance = (sale.total_amount || 0) - (sale.paid_amount || 0)

  return (
    <div className="receipt-print-area">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt-print-area, .receipt-print-area * { visibility: visible !important; }
          .receipt-print-area {
            position: fixed; left: 0; top: 0; width: 80mm;
            font-family: 'Courier New', monospace; font-size: 11px;
            color: #000; background: #fff; padding: 4mm;
            line-height: 1.4;
          }
          @page { margin: 0; size: 80mm auto; }
        }
        @media screen { .receipt-print-area { display: none; } }
        .rcpt-divider { border-top: 1px dashed #000; margin: 4px 0; }
        .rcpt-center { text-align: center; }
        .rcpt-right { text-align: right; }
        .rcpt-bold { font-weight: bold; }
        .rcpt-row { display: flex; justify-content: space-between; }
        .rcpt-items th, .rcpt-items td { text-align: left; padding: 1px 2px; font-size: 10px; }
        .rcpt-items { width: 100%; border-collapse: collapse; }
        .rcpt-items th { border-bottom: 1px solid #000; font-weight: bold; }
      `}</style>

      {/* Header */}
      <div className="rcpt-center">
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: 2 }}>{shopName || 'PharmaCare'}</div>
        {shopAddress && <div style={{ fontSize: '9px' }}>{shopAddress}</div>}
        {shopPhone && <div style={{ fontSize: '9px' }}>Tel: {shopPhone}</div>}
      </div>

      <div className="rcpt-divider" />

      {/* Invoice Info */}
      <div className="rcpt-row"><span>Invoice #</span><span className="rcpt-bold">{String(sale.id).slice(-8)}</span></div>
      <div className="rcpt-row"><span>Date</span><span>{new Date(sale.created_at || Date.now()).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
      {sale.served_by && <div className="rcpt-row"><span>Cashier</span><span>{sale.served_by}</span></div>}
      {sale.customer?.name && <div className="rcpt-row"><span>Customer</span><span>{sale.customer.name}</span></div>}
      {sale.prescription_number && <div className="rcpt-row"><span>Rx #</span><span className="rcpt-bold">{sale.prescription_number}</span></div>}

      <div className="rcpt-divider" />

      {/* Items Table */}
      <table className="rcpt-items">
        <thead>
          <tr>
            <th style={{ width: '40%' }}>Item</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Disc</th>
            <th className="rcpt-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>
                <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{item.product_name || item.name}</div>
                <div style={{ fontSize: '8px', color: '#555' }}>
                  {item.batch_number && `B: ${item.batch_number}`}
                  {item.expiry_date && ` | Exp: ${item.expiry_date}`}
                </div>
              </td>
              <td>{item.quantity}</td>
              <td>{item.unit_price}</td>
              <td>{item.discount > 0 ? item.discount : '-'}</td>
              <td className="rcpt-right">{(item.total || item.unit_price * item.quantity).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rcpt-divider" />

      {/* Totals */}
      {sale.subtotal && sale.subtotal !== sale.total_amount && (
        <div className="rcpt-row"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
      )}
      {sale.discount > 0 && (
        <div className="rcpt-row"><span>Discount</span><span>-{fmt(sale.discount)}</span></div>
      )}
      <div className="rcpt-row rcpt-bold" style={{ fontSize: '13px', margin: '2px 0' }}>
        <span>TOTAL</span><span>{fmt(sale.total_amount)}</span>
      </div>

      {/* Payment breakdown */}
      {payments.length > 0 ? (
        <>
          <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: 2 }}>Payment:</div>
          {payments.map((p, i) => (
            <div key={i} className="rcpt-row" style={{ fontSize: '10px' }}>
              <span>{p.method}</span><span>{fmt(p.amount)}</span>
            </div>
          ))}
        </>
      ) : (
        <div className="rcpt-row"><span>Paid ({sale.payment_type})</span><span>{fmt(sale.paid_amount)}</span></div>
      )}

      {balance > 0 && (
        <div className="rcpt-row rcpt-bold" style={{ color: '#c00' }}>
          <span>Balance Due</span><span>{fmt(balance)}</span>
        </div>
      )}

      <div className="rcpt-divider" />

      {/* Rx Warning */}
      {items.some(i => i.requires_prescription) && (
        <div className="rcpt-center" style={{ fontSize: '9px', fontWeight: 'bold', margin: '2px 0' }}>
          ⚠ Contains prescription medicine
        </div>
      )}

      {/* Footer */}
      <div className="rcpt-center" style={{ fontSize: '9px', marginTop: 4 }}>
        {RECEIPT_FOOTER}
      </div>
      <div className="rcpt-center" style={{ fontSize: '8px', color: '#888', marginTop: 2 }}>
        Powered by PharmaCare POS
      </div>
    </div>
  )
}
