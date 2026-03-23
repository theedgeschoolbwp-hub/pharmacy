import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { 
  ChevronLeft, 
  ArrowUpRight, 
  ArrowDownLeft,
  Calendar,
  Wallet,
  Receipt
} from 'lucide-react';
import { clsx } from 'clsx';
import styles from './CustomerLedger.module.css';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../utils/translations';

const EmployeeLedger = ({ employee, onBack }) => {
  const { language } = useLanguage();
  const t = translations[language];
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    fetchHistory();
  }, [employee]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      // Expenses with Salary category for this employee
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('category', 'Salary')
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      setHistory(data);
      const sum = data.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
      setTotalPaid(sum);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <ChevronLeft size={20} />
          <span>{t.back_to_team}</span>
        </button>
        <div className={styles.customerSummary}>
          <h2>{employee.name}</h2>
          <p>{employee.role} | {t.base_salary_label}: ₨ {employee.base_salary}</p>
        </div>
      </header>

      <div className={styles.summaryGrid}>
        <div className={clsx("premium-card", styles.sumCard, styles.paid)}>
          <span>{t.total_salary_paid}</span>
          <h3>₨ {totalPaid.toLocaleString()}</h3>
        </div>
        <div className={clsx("premium-card", styles.sumCard)}>
          <span>{t.last_distribution}</span>
          <h3>{history[0] ? new Date(history[0].recorded_at).toLocaleDateString() : 'N/A'}</h3>
        </div>
      </div>

      <div className={styles.controls}>
        <h3 className={styles.sectionTitle}>{t.salary_history}</h3>
      </div>

      {loading ? (
        <div className={styles.loading}>{t.loading}...</div>
      ) : (
        <div className={clsx("premium-card", styles.tableCard)}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.description_label}</th>
                <th>{t.amount_paid}</th>
              </tr>
            </thead>
            <tbody>
              {history.map(t_item => (
                <tr key={t_item.id}>
                  <td className={styles.dateCell}>{new Date(t_item.recorded_at).toLocaleDateString()}</td>
                  <td>
                    <div className={styles.descCell}>
                      <span className={styles.transType}>{t.salary}</span>
                      <span className={styles.transDesc}>{t_item.notes || t.monthly_salary}</span>
                    </div>
                  </td>
                  <td className={styles.credit}>₨ {t_item.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && (
            <div className={styles.empty}>
              <Receipt size={48} />
              <p>{t.no_salary_records}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeeLedger;
