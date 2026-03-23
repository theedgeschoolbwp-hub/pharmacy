import React, { useState } from 'react';
import { X, Wallet, Calendar, CreditCard } from 'lucide-react';
import styles from './PaymentModal.module.css';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../utils/translations';

const PaymentModal = ({ customer, order, onClose, onSuccess, initialData }) => {
  const { shop } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(initialData?.amount || '');
  const [method, setMethod] = useState(initialData?.method || 'Cash');
  const [type, setType] = useState(initialData?.type || 'Partial'); // Partial, Full

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (initialData) {
        // Update mode
        const { error } = await supabase
          .from('payments')
          .update({
            amount: parseFloat(amount),
            type,
            method
          })
          .eq('id', initialData.id);
        if (error) throw error;
        onSuccess();
      } else {
        // Insert mode
        const { data, error } = await supabase.from('payments').insert([{
          shop_id: shop.id,
          customer_id: customer.id,
          order_id: order?.id || null,
          amount: parseFloat(amount),
          type,
          method,
          recorded_at: new Date().toISOString()
        }]).select().single();

        if (error) throw error;
        onSuccess(data);
      }
    } catch (error) {
      alert('Error saving payment: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <h2>{initialData ? t.correct_payment : t.record_payment}</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={24} /></button>
        </header>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.customerSummary}>
             <p>Customer: <strong>{customer.name}</strong></p>
             {(order || initialData?.order_id) && (
               <p>Order: <strong>#{ (order?.id || initialData?.order_id).split('-')[0].toUpperCase()}</strong></p>
             )}
          </div>

          <div className={styles.inputGroup}>
            <label>{t.payment_amount} *</label>
            <input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              required 
              placeholder="0.00"
              autoFocus
            />
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>{t.payment_method}</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="Online">Online Transfer</option>
                <option value="Card">Card</option>
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label>{t.payment_type}</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="Partial">{t.partial_payment}</option>
                <option value="Full">{t.full_payment}</option>
                <option value="Advance">{t.advance}</option>
              </select>
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>{t.cancel}</button>
            <button type="submit" className={styles.submitBtn} disabled={loading || !amount}>
              {loading ? t.processing : initialData ? t.update_record : t.record_payment}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
