import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Sales from './pages/Sales'
import Purchases from './pages/Purchases'
import Customers from './pages/Customers'
import CustomerLedger from './pages/CustomerLedger'
import Suppliers from './pages/Suppliers'
import Inventory from './pages/Inventory'
import LedgerOverview from './pages/LedgerOverview'
import Employees from './pages/Employees'
import EmployeeLedger from './pages/EmployeeLedger'
import Expenses from './pages/Expenses'
import ProfitLoss from './pages/ProfitLoss'
import Users from './pages/Users'
import Support from './pages/Support'
import TrashBin from './pages/TrashBin'

export default function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected — wrapped in sidebar Layout */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Inventory & Products */}
            <Route path="/products" element={<Products />} />
            <Route path="/inventory" element={<Inventory />} />

            {/* Sales / POS */}
            <Route path="/sales" element={<Sales />} />

            {/* Purchases */}
            <Route path="/purchases" element={<Purchases />} />

            {/* Customers */}
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id/ledger" element={<CustomerLedger />} />
            <Route path="/ledger-overview" element={<LedgerOverview />} />

            {/* Suppliers */}
            <Route path="/suppliers" element={<Suppliers />} />

            {/* HR */}
            <Route path="/employees" element={<Employees />} />
            <Route path="/employees/:id/ledger" element={<EmployeeLedger />} />

            {/* Finance */}
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/profit-loss" element={<ProfitLoss />} />

            {/* Admin */}
            <Route path="/users" element={<Users />} />
            <Route path="/support" element={<Support />} />
            <Route path="/trash" element={<TrashBin />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}
