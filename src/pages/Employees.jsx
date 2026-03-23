import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  Plus, 
  UserPlus, 
  Phone, 
  Briefcase, 
  Wallet,
  CheckCircle2,
  User as UserIcon,
  ChevronLeft
} from 'lucide-react';
import { clsx } from 'clsx';
import styles from './Employees.module.css';
import EmployeeLedger from './EmployeeLedger';
import { useLanguage } from '../context/LanguageContext';
import { translations } from '../utils/translations';

const Employees = () => {
  const { shop } = useAuth();
  const { language } = useLanguage();
  const t = translations[language];
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    role: 'Staff',
    salary_type: 'Fixed',
    base_salary: ''
  });

  useEffect(() => {
    if (shop) fetchEmployees();
  }, [shop]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('shop_id', shop.id)
        .order('name');

      if (error) throw error;
      setEmployees(data);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('employees').insert([{
        shop_id: shop.id,
        ...formData,
        base_salary: parseFloat(formData.base_salary || 0)
      }]);

      if (error) throw error;
      setShowAddModal(false);
      setFormData({ name: '', mobile: '', role: 'Staff', salary_type: 'Fixed', base_salary: '' });
      fetchEmployees();
    } catch (err) {
      alert(err.message);
    }
  };

  if (selectedEmployee) {
    return (
      <EmployeeLedger 
        employee={selectedEmployee} 
        onBack={() => {
          setSelectedEmployee(null);
          fetchEmployees();
        }} 
      />
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t.team_mgmt}</h1>
          <p className={styles.subtitle}>{t.staff_subtitle}</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
          <UserPlus size={20} />
          <span>{t.add_member}</span>
        </button>
      </header>

      {loading ? (
        <div className={styles.loading}>{t.loading_staff}</div>
      ) : (
        <div className={styles.grid}>
          {employees.map(emp => (
            <div key={emp.id} className={clsx("premium-card", styles.employeeCard)}>
              <div className={styles.cardTop}>
                <div className={styles.nameInfo}>
                  <h3>{emp.name}</h3>
                  <span className={styles.roleTag}>{emp.role}</span>
                </div>
                <div className={styles.status}>
                   <CheckCircle2 size={18} color="var(--success)" />
                </div>
              </div>

              <div className={styles.contactInfo}>
                <div className={styles.infoItem}>
                  <Phone size={16} />
                  <span>{emp.mobile || 'No mobile'}</span>
                </div>
                <div className={styles.infoItem}>
                  <Briefcase size={16} />
                  <span>{emp.salary_type === 'Fixed' ? t.fixed_monthly : emp.salary_type === 'Commission' ? t.commission_based : t.daily_wages}</span>
                </div>
              </div>

              <div className={styles.salaryInfo}>
                <span className={styles.salaryLabel}>{t.base_salary_label}</span>
                <span className={styles.salaryValue}>₨ {emp.base_salary.toLocaleString()}</span>
              </div>

              <button 
                className={styles.viewLedgerBtn}
                onClick={() => setSelectedEmployee(emp)}
              >
                {t.salary_ledger}
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <header className={styles.modalHeader}>
              <h2>{t.register_staff}</h2>
              <button onClick={() => setShowAddModal(false)}><X size={24} /></button>
            </header>
            <form onSubmit={handleAddEmployee}>
              <div className={styles.modalBody}>
                <div className={styles.inputGroup}>
                  <label>{t.full_name} *</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t.mobile_number}</label>
                  <input 
                    type="text" 
                    value={formData.mobile}
                    onChange={e => setFormData({...formData, mobile: e.target.value})}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>{t.role}</label>
                  <input 
                    type="text" 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value})}
                    placeholder="e.g. Master, Tailor, Helper"
                  />
                </div>
                <div className={styles.row} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className={styles.inputGroup}>
                    <label>{t.salary_type}</label>
                    <select 
                      value={formData.salary_type}
                      onChange={e => setFormData({...formData, salary_type: e.target.value})}
                    >
                      <option value="Fixed">{t.fixed_monthly}</option>
                      <option value="Commission">{t.commission_based}</option>
                      <option value="Daily">{t.daily_wages}</option>
                    </select>
                  </div>
                  <div className={styles.inputGroup}>
                    <label>{t.base_salary_label} (₨)</label>
                    <input 
                      type="number" 
                      value={formData.base_salary}
                      onChange={e => setFormData({...formData, base_salary: e.target.value})}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <footer className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowAddModal(false)}>{t.cancel}</button>
                <button type="submit" className={styles.saveBtn}>{t.add_member}</button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
