import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, ShieldAlert, CreditCard } from 'lucide-react';

const SubscriptionNotice = () => {
  const { shop } = useAuth();
  if (!shop) return null;

  const now = new Date();
  const exp = shop.plan_expiry ? new Date(shop.plan_expiry) : null;
  const graceExp = exp ? new Date(exp) : null;
  if (graceExp) graceExp.setDate(graceExp.getDate() + 7);

  const isSuspended = graceExp && now > graceExp;
  const isGrace = exp && now > exp && now <= graceExp;
  const isExpiringSoon = exp && (exp - now) < (3 * 24 * 60 * 60 * 1000) && now <= exp;
  const showNotice = shop.show_payment_notice;

  if (isSuspended) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: 'white',
        textAlign: 'center',
        padding: '2rem',
        backdropFilter: 'blur(8px)'
      }}>
        <ShieldAlert size={64} color="#ef4444" style={{ marginBottom: '1.5rem' }} />
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem' }}>SHOP SUSPENDED</h1>
        <p style={{ fontSize: '1.25rem', maxWidth: '600px', color: '#94a3b8', lineHeight: 1.6 }}>
          Your subscription has expired and the grace period has ended. 
          Please contact the platform administrator to settle your dues and reactivate your shop.
        </p>
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <p style={{ fontWeight: 700, fontSize: '0.875rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Reference ID: {shop.id.split('-')[0]}
          </p>
        </div>
      </div>
    );
  }

  if (isGrace || isExpiringSoon || showNotice) {
    const config = isGrace 
      ? { bg: '#fef2f2', text: '#ef4444', icon: <AlertTriangle size={18}/>, msg: 'Subscription Expired! 1-week grace period active. Please pay soon to avoid suspension.' }
      : isExpiringSoon 
        ? { bg: '#fffbeb', text: '#d97706', icon: <Clock size={18}/>, msg: 'Subscription ending soon. Please renew your plan.' }
        : { bg: '#eff6ff', text: '#2563eb', icon: <CreditCard size={18}/>, msg: 'Payment Due Notice: Please check your ledger and record pending payments.' };

    return (
      <div style={{
        background: config.bg,
        color: config.text,
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        fontSize: '0.875rem',
        fontWeight: 700,
        borderBottom: `1px solid ${config.text}22`
      }}>
        {config.icon}
        <span>{config.msg}</span>
      </div>
    );
  }

  return null;
};

const Clock = ({ size }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);

export default SubscriptionNotice;
