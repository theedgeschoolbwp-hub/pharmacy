import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import './services/syncService'

// Auto-recover from stale IndexedDB (e.g. after Dexie schema upgrade)
const DB_VERSION_KEY = 'pharmacare_db_version'
const EXPECTED_DB_VERSION = '2' // bump this when Dexie schema changes
if (localStorage.getItem(DB_VERSION_KEY) !== EXPECTED_DB_VERSION) {
  // Check for unsynced data before wiping — warn the user so they don't lose offline work
  const warnAndWipe = async () => {
    try {
      const { default: Dexie } = await import('dexie')
      const tmpDb = new Dexie('PharmacareDB')
      // Open without a version to just inspect existing tables
      await tmpDb.open()
      const pendingCount = tmpDb.tables.find(t => t.name === 'sync_queue')
        ? await tmpDb.table('sync_queue').count()
        : 0
      tmpDb.close()
      if (pendingCount > 0 && navigator.onLine) {
        // Online: warn but allow user to cancel the wipe to preserve data
        const proceed = window.confirm(
          `Database upgrade required.\n\n` +
          `You have ${pendingCount} unsynced offline record(s). ` +
          `If you proceed, this offline data will be lost (online data in Supabase is safe).\n\n` +
          `Proceed with upgrade?`
        )
        if (!proceed) {
          localStorage.setItem(DB_VERSION_KEY, EXPECTED_DB_VERSION)
          return // skip wipe — old DB stays, Dexie will upgrade in place or throw
        }
      }
    } catch (_) { /* old DB may not open — safe to proceed */ }
    try { indexedDB.deleteDatabase('PharmacareDB') } catch (_) {}
    localStorage.setItem(DB_VERSION_KEY, EXPECTED_DB_VERSION)
  }
  warnAndWipe()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
