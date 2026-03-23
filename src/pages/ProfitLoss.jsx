import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart as PieChartIcon,
  Activity,
  BarChart as BarChartIcon
} from 'lucide-react';
import { clsx } from 'clsx';
import styles from './ProfitLoss.module.css';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../utils/translations';

const ProfitLoss = () => {
  const { shop } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('Month'); // Today, Week, Month
  
  const [financials, setFinancials] = useState({
    revenue: 0,
    expenses: 0,
    profit: 0,
    expenseBreakdown: [],
    revenueBreakdown: { orders: 0, payments: 0 }
  });

  useEffect(() => {
    if (shop) fetchFinancialData();
  }, [shop, filter]);

  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      const now = new Date();
      let startDate;
      
      if (filter === 'Today') {
        startDate = new Date(now.setHours(0,0,0,0)).toISOString();
      } else if (filter === 'Week') {
        startDate = new Date(now.setDate(now.getDate() - 7)).toISOString();
      } else {
        startDate = new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      }

      // 1. Fetch Revenue (Payments + Orders Advance)
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, type, order_id')
        .eq('shop_id', shop.id)
        .gte('recorded_at', startDate);

      const { data: orders } = await supabase
        .from('orders')
        .select('advance_payment')
        .eq('shop_id', shop.id)
        .gte('created_at', startDate);

      // 2. Fetch Expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount, category, custom_category')
        .eq('shop_id', shop.id)
        .gte('recorded_at', startDate);

      let totalRevenue = 0;
      let orderRevenue = 0;
      let directRevenue = 0;

      const orderIdsWithPayments = new Set(payments?.filter(p => p.order_id).map(p => p.order_id) || []);

      orders?.forEach(o => {
        if (!orderIdsWithPayments.has(o.id)) {
          const val = parseFloat(o.advance_payment || 0);
          totalRevenue += val;
          orderRevenue += val;
        }
      });

      payments?.forEach(p => {
        const val = parseFloat(p.amount || 0);
        totalRevenue += val;
        if (p.type === 'Advance') {
          orderRevenue += val;
        } else {
          directRevenue += val;
        }
      });

      let totalExpenses = 0;
      const breakdown = {};

      expenses?.forEach(e => {
        const val = parseFloat(e.amount || 0);
        totalExpenses += val;
        const cat = e.category === 'Other' ? e.custom_category : e.category;
        breakdown[cat] = (breakdown[cat] || 0) + val;
      });

      const expenseList = Object.entries(breakdown)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

      setFinancials({
        revenue: totalRevenue,
        expenses: totalExpenses,
        profit: totalRevenue - totalExpenses,
        expenseBreakdown: expenseList,
        revenueBreakdown: { orders: orderRevenue, payments: directRevenue }
      });

    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t.profit_loss_title}</h1>
          <p className={styles.subtitle}>{t.pl_subtitle}</p>
        </div>
        <div className={styles.filterGroup}>
          {['Today', 'Week', 'Month'].map(f => (
            <button 
              key={f}
              className={clsx(styles.filterBtn, filter === f && styles.active)}
              onClick={() => setFilter(f)}
            >
              {f === 'Today' ? t.today : f === 'Week' ? t.this_week : t.this_month}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className={styles.loading}>{t.analyzing_financials}</div>
      ) : (
        <>
          <div className={styles.summaryGrid}>
            <div className={clsx("premium-card", styles.card)}>
              <div className={clsx(styles.cardIcon, styles.revenue)}>
                <TrendingUp size={28} />
              </div>
              <span className={styles.cardLabel}>{t.total_revenue}</span>
              <h2 className={styles.cardValue}>₨ {financials.revenue.toLocaleString()}</h2>
              <div className={styles.comparison}>
                 <ArrowUpRight size={14} className={styles.pos} />
                 <span className={styles.pos}>{t.revenue_hint}</span>
              </div>
            </div>

            <div className={clsx("premium-card", styles.card)}>
              <div className={clsx(styles.cardIcon, styles.expense)}>
                <TrendingDown size={28} />
              </div>
              <span className={styles.cardLabel}>{t.total_expenses}</span>
              <h2 className={styles.cardValue}>₨ {financials.expenses.toLocaleString()}</h2>
              <div className={styles.comparison}>
                 <ArrowDownRight size={14} className={styles.neg} />
                 <span className={styles.neg}>{t.expense_hint}</span>
              </div>
            </div>

            <div className={clsx("premium-card", styles.card)}>
              <div className={clsx(styles.cardIcon, styles.profit)}>
                <Activity size={28} />
              </div>
              <span className={styles.cardLabel}>{t.net_profit}</span>
              <h2 className={styles.cardValue}>₨ {financials.profit.toLocaleString()}</h2>
              <div className={styles.comparison}>
                 <TrendingUp size={14} className={financials.profit >= 0 ? styles.pos : styles.neg} />
                 <span className={financials.profit >= 0 ? styles.pos : styles.neg}>
                   {financials.profit >= 0 ? t.surplus : t.deficit}
                 </span>
              </div>
            </div>
          </div>

          <div className={styles.contentGrid}>
            <div className={clsx("premium-card", styles.section)}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{t.expense_breakdown}</h3>
                <PieChartIcon size={20} color="var(--text-secondary)" />
              </div>
              <div className={styles.categoryList}>
                {financials.expenseBreakdown.map(item => (
                  <div key={item.name} className={styles.categoryItem}>
                    <div className={styles.catInfo}>
                      <div className={styles.catBullet} />
                      <span className={styles.catName}>{item.name === 'Salary' ? t.salary : item.name === 'Materials' ? t.materials : item.name === 'Utilities' ? t.utilities : item.name === 'Rent' ? t.rent : item.name === 'Other' ? t.other : item.name}</span>
                    </div>
                    <span className={styles.catAmount}>₨ {item.amount.toLocaleString()}</span>
                  </div>
                ))}
                {financials.expenseBreakdown.length === 0 && <p>{t.no_expenses_period}</p>}
              </div>
            </div>

            <div className={clsx("premium-card", styles.section)}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>{t.revenue_sources}</h3>
                <BarChartIcon size={20} color="var(--text-secondary)" />
              </div>
              <div className={styles.categoryList}>
                <div className={styles.categoryItem}>
                  <div className={styles.catInfo}>
                    <div className={styles.catBullet} style={{ background: '#22c55e' }} />
                    <span className={styles.catName}>{t.order_advances}</span>
                  </div>
                  <span className={styles.catAmount}>₨ {financials.revenueBreakdown.orders.toLocaleString()}</span>
                </div>
                <div className={styles.categoryItem}>
                  <div className={styles.catInfo}>
                    <div className={styles.catBullet} style={{ background: '#3b82f6' }} />
                    <span className={styles.catName}>{t.direct_payments}</span>
                  </div>
                  <span className={styles.catAmount}>₨ {financials.revenueBreakdown.payments.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProfitLoss;
