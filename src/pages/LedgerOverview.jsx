import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  Search, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft,
  Users
} from 'lucide-react';
import styles from './Ledger.module.css';
import { clsx } from 'clsx';
import CustomerLedger from './CustomerLedger';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../utils/translations';

const Ledger = () => {
  const { shop } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    if (shop) fetchLedgerData();
  }, [shop]);

  const fetchLedgerData = async () => {
    try {
      setLoading(true);
      
      // Fetch customers with their orders
      const { data: customers, error: custError } = await supabase
        .from('customers')
        .select(`
          id, 
          name, 
          mobile,
          orders (
            id,
            total_price,
            advance_payment
          )
        `)
        .eq('shop_id', shop.id);

      if (custError) throw custError;

      // Fetch all payments for this shop
      const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('customer_id, amount, order_id')
        .eq('shop_id', shop.id);
      
      if (payError) throw payError;

      const orderIdsWithPayments = new Set(payments.filter(p => p.order_id).map(p => p.order_id));

      const processedData = customers.map(c => {
        let totalBilled = 0;
        let totalPaid = 0;

        // Sum from orders (billing and advance - legacy support)
        c.orders.forEach(o => {
          totalBilled += parseFloat(o.total_price || 0);
          if (!orderIdsWithPayments.has(o.id)) {
            totalPaid += parseFloat(o.advance_payment || 0);
          }
        });

        // Sum directly from payments table for this customer
        const customerPayments = payments.filter(p => p.customer_id === c.id);
        customerPayments.forEach(p => {
          totalPaid += parseFloat(p.amount || 0);
        });

        return {
          ...c,
          totalBilled,
          totalPaid,
          balance: totalBilled - totalPaid
        };
      });

      setLedgers(processedData);
    } catch (error) {
      console.error('Error fetching ledger:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredLedgers = ledgers.filter(l => 
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.mobile.includes(searchTerm)
  );

  const totalOutstanding = ledgers.reduce((acc, curr) => acc + curr.balance, 0);

  if (selectedCustomer) {
    return (
      <CustomerLedger 
        customer={selectedCustomer} 
        onBack={() => {
          setSelectedCustomer(null);
          fetchLedgerData();
        }}
      />
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t.ledger_mgmt}</h1>
          <p className={styles.subtitle}>{t.ledger_subtitle}</p>
        </div>
        <div className={clsx("premium-card", styles.summaryCard)}>
          <div className={styles.summaryIcon}>
            <Wallet size={24} />
          </div>
          <div>
            <p className={styles.summaryLabel}>{t.total_outstanding}</p>
            <h2 className={styles.summaryValue}>₨ {totalOutstanding.toLocaleString()}</h2>
          </div>
        </div>
      </header>

      <div className={styles.controls}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={20} />
          <input 
            type="text" 
            placeholder={t.search_placeholder} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <div className={clsx("premium-card", styles.tableCard)}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t.customers}</th>
                  <th>{t.total_billed}</th>
                  <th>{t.total_paid}</th>
                  <th>{t.balance}</th>
                  <th>{t.action}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgers.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div className={styles.customerCell}>
                        <span className={styles.customerName}>{l.name}</span>
                        <span className={styles.customerMobile}>{l.mobile}</span>
                      </div>
                    </td>
                    <td>₨ {l.totalBilled}</td>
                    <td className={styles.paidText}>₨ {l.totalPaid}</td>
                    <td className={clsx(styles.balanceCell, l.balance > 0 && styles.negative)}>
                      ₨ {l.balance}
                      {l.balance > 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
                    </td>
                    <td>
                      <button className={styles.viewBtn} onClick={() => setSelectedCustomer(l)}>
                        {t.view_details}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredLedgers.length === 0 && (
            <div className={styles.empty}>
              <Users size={48} />
              <p>{t.no_customer_records}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Ledger;
