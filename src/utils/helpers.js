// =============================================================================
// helpers.js — Generic utility functions for SaaS projects
// =============================================================================
// All functions are pure (no side effects, no imports from this project).
// Import only what you need — tree-shaking will strip the rest.
// =============================================================================


// -----------------------------------------------------------------------------
// FORMATTING
// -----------------------------------------------------------------------------

/**
 * Formats a number as a currency string.
 *
 * @param {number|string} amount - The numeric amount to format.
 * @param {string} [currency='Rs.'] - Currency symbol or code to prepend.
 * @param {number} [decimals=0] - Number of decimal places.
 * @returns {string} Formatted string, e.g. "Rs. 1,250" or "Rs. 1,250.50"
 *
 * @example
 * formatCurrency(1250)          // "Rs. 1,250"
 * formatCurrency(1250.5, '$', 2) // "$ 1,250.50"
 */
export function formatCurrency(amount, currency = 'Rs.', decimals = 0) {
  const num = parseFloat(amount)
  if (isNaN(num)) return `${currency} 0`
  return `${currency} ${num.toLocaleString('en-PK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}


/**
 * Formats a date string or Date object into a human-readable format.
 *
 * @param {string|Date} dateStr - ISO date string, timestamp, or Date object.
 * @param {string} [format='DD/MM/YYYY'] - Output format token.
 *   Supported tokens: DD, MM, YYYY, YY, HH, mm, ss
 * @returns {string} Formatted date string, or '' if input is falsy/invalid.
 *
 * @example
 * formatDate('2025-03-15')                  // "15/03/2025"
 * formatDate('2025-03-15T09:30:00', 'DD/MM/YYYY HH:mm')  // "15/03/2025 09:30"
 * formatDate(null)                           // ""
 */
export function formatDate(dateStr, format = 'DD/MM/YYYY') {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''

  const pad = (n) => String(n).padStart(2, '0')

  return format
    .replace('YYYY', d.getFullYear())
    .replace('YY',   String(d.getFullYear()).slice(-2))
    .replace('MM',   pad(d.getMonth() + 1))
    .replace('DD',   pad(d.getDate()))
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()))
    .replace('ss',   pad(d.getSeconds()))
}


/**
 * Normalises a Pakistani mobile number to the international format (+923xxxxxxxxx).
 * Handles inputs starting with 0, 92, +92, or a bare 10-digit number.
 *
 * @param {string} phone - Raw phone number string (may contain spaces/dashes).
 * @returns {string} Normalised phone string, or original input if it cannot be parsed.
 *
 * @example
 * formatPhone('03001234567')   // "+923001234567"
 * formatPhone('+923001234567') // "+923001234567"
 * formatPhone('923001234567')  // "+923001234567"
 */
export function formatPhone(phone) {
  if (!phone) return ''
  // Strip everything except digits and leading +
  const cleaned = String(phone).replace(/[^\d+]/g, '')
  const digits = cleaned.replace(/^\+/, '')

  if (digits.startsWith('92') && digits.length === 12) {
    return `+${digits}`
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+92${digits.slice(1)}`
  }
  if (digits.length === 10) {
    // Bare 10-digit number — assume local without leading 0
    return `+92${digits}`
  }
  // Unrecognised pattern — return as-is with + prefix if it was there
  return cleaned.startsWith('+') ? cleaned : `+${digits}`
}


/**
 * Generates a human-readable record ID with a prefix and zero-padded number.
 *
 * @param {string} [prefix='REC'] - Uppercase prefix string.
 * @param {number} [length=8] - Total numeric portion length (zero-padded).
 * @returns {string} ID like "REC-00001234"
 *
 * @example
 * generateId()            // "REC-00008472"  (random)
 * generateId('INV', 6)    // "INV-004821"
 * generateId('PAT')       // "PAT-00003317"
 */
export function generateId(prefix = 'REC', length = 8) {
  const max = Math.pow(10, length) - 1
  const num = Math.floor(Math.random() * max) + 1
  return `${prefix}-${String(num).padStart(length, '0')}`
}


/**
 * Truncates a string to a maximum length, appending an ellipsis if cut.
 *
 * @param {string} str - Input string.
 * @param {number} [maxLen=50] - Maximum allowed character count (including ellipsis).
 * @returns {string} Truncated string.
 *
 * @example
 * truncate('Hello World, this is a long sentence', 20) // "Hello World, this is…"
 */
export function truncate(str, maxLen = 50) {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}


// -----------------------------------------------------------------------------
// PERFORMANCE
// -----------------------------------------------------------------------------

/**
 * Returns a debounced version of the given function.
 * The debounced function delays invoking fn until after delay ms have elapsed
 * since the last call. Useful for search inputs and resize handlers.
 *
 * @param {Function} fn - Function to debounce.
 * @param {number} [delay=300] - Delay in milliseconds.
 * @returns {Function} Debounced function with a .cancel() method.
 *
 * @example
 * const search = debounce((q) => fetchResults(q), 400)
 * input.addEventListener('input', (e) => search(e.target.value))
 */
export function debounce(fn, delay = 300) {
  let timer = null
  const debounced = function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}


// -----------------------------------------------------------------------------
// ARRAY / OBJECT UTILITIES
// -----------------------------------------------------------------------------

/**
 * Groups an array of objects by a shared key value.
 *
 * @param {Object[]} array - Array of objects to group.
 * @param {string|Function} key - Key name (string) or accessor function.
 * @returns {Object} Plain object where each key is a group value and the value
 *   is an array of matching items.
 *
 * @example
 * groupBy([{type:'A'},{type:'B'},{type:'A'}], 'type')
 * // { A: [{type:'A'},{type:'A'}], B: [{type:'B'}] }
 *
 * groupBy(sales, (s) => s.date.slice(0, 7)) // group by YYYY-MM
 */
export function groupBy(array, key) {
  if (!Array.isArray(array)) return {}
  const accessor = typeof key === 'function' ? key : (item) => item[key]
  return array.reduce((groups, item) => {
    const group = accessor(item)
    if (!groups[group]) groups[group] = []
    groups[group].push(item)
    return groups
  }, {})
}


/**
 * Sorts an array of objects by a date field in ascending or descending order.
 * Items with missing/invalid date values are placed last.
 *
 * @param {Object[]} array - Array of objects to sort.
 * @param {string} [field='created_at'] - The date field name to sort by.
 * @param {'asc'|'desc'} [dir='desc'] - Sort direction.
 * @returns {Object[]} New sorted array (original is not mutated).
 *
 * @example
 * sortByDate(transactions, 'payment_date', 'asc')
 */
export function sortByDate(array, field = 'created_at', dir = 'desc') {
  if (!Array.isArray(array)) return []
  return [...array].sort((a, b) => {
    const ta = a[field] ? new Date(a[field]).getTime() : 0
    const tb = b[field] ? new Date(b[field]).getTime() : 0
    return dir === 'asc' ? ta - tb : tb - ta
  })
}


// -----------------------------------------------------------------------------
// DATE CALCULATIONS
// -----------------------------------------------------------------------------

/**
 * Calculates a person's age in whole years from a date of birth string.
 * Useful for patients, students, and employees.
 *
 * @param {string|Date} dateStr - Date of birth (ISO string or Date object).
 * @returns {number} Age in years, or NaN if the input is invalid.
 *
 * @example
 * calculateAge('2000-06-15') // 25 (as of 2025)
 */
export function calculateAge(dateStr) {
  if (!dateStr) return NaN
  const dob = new Date(dateStr)
  if (isNaN(dob.getTime())) return NaN
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--
  }
  return age
}


/**
 * Returns the number of whole days from today until a future date.
 * Returns a negative number if the date is in the past.
 * Useful for showing "expires in N days" or "due in N days".
 *
 * @param {string|Date} dateStr - Target date.
 * @returns {number} Days until the date (negative if past), or NaN if invalid.
 *
 * @example
 * daysUntil('2025-04-01') // 17   (days remaining)
 * daysUntil('2025-01-01') // -80  (already past)
 */
export function daysUntil(dateStr) {
  if (!dateStr) return NaN
  const target = new Date(dateStr)
  if (isNaN(target.getTime())) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}


/**
 * Returns true if the given date is strictly in the past (before today).
 *
 * @param {string|Date} dateStr - Date to check.
 * @returns {boolean}
 *
 * @example
 * isExpired('2024-01-01') // true
 * isExpired('2099-01-01') // false
 */
export function isExpired(dateStr) {
  if (!dateStr) return false
  return daysUntil(dateStr) < 0
}


/**
 * Returns true if the given date will expire within the specified number of days.
 * A date that is already expired also returns true.
 * Useful for showing expiry warnings on medicine batches, subscriptions, licences.
 *
 * @param {string|Date} dateStr - Expiry date.
 * @param {number} [days=30] - Warning threshold in days.
 * @returns {boolean}
 *
 * @example
 * isExpiringSoon('2025-04-05', 30) // true if today is within 30 days of Apr 5
 */
export function isExpiringSoon(dateStr, days = 30) {
  if (!dateStr) return false
  const remaining = daysUntil(dateStr)
  if (isNaN(remaining)) return false
  return remaining <= days
}


// -----------------------------------------------------------------------------
// EXPORT / DOWNLOAD
// -----------------------------------------------------------------------------

/**
 * Converts an array of objects to a CSV string and triggers a browser download.
 * Column headers are derived from the keys of the first object.
 * Values are automatically quoted if they contain commas or newlines.
 *
 * @param {Object[]} data - Array of plain objects (all sharing the same keys).
 * @param {string} [filename='export.csv'] - Downloaded filename.
 * @returns {void}
 *
 * @example
 * exportToCSV(salesData, 'sales-report-march-2025.csv')
 */
export function exportToCSV(data, filename = 'export.csv') {
  if (!Array.isArray(data) || data.length === 0) return

  const escape = (val) => {
    const str = val === null || val === undefined ? '' : String(val)
    // Wrap in quotes if contains comma, newline, or double-quote
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }

  const headers = Object.keys(data[0])
  const rows = [
    headers.join(','),
    ...data.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ]

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}


/**
 * Serialises data to a pretty-printed JSON file and triggers a browser download.
 * Useful for exporting configuration, backups, or debug snapshots.
 *
 * @param {*} data - Any JSON-serialisable value.
 * @param {string} [filename='export.json'] - Downloaded filename.
 * @returns {void}
 *
 * @example
 * downloadJSON({ settings, products }, 'backup-2025-03.json')
 */
export function downloadJSON(data, filename = 'export.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}


// -----------------------------------------------------------------------------
// STRING UTILITIES
// -----------------------------------------------------------------------------

/**
 * Returns the singular or plural form of a noun based on count.
 *
 * @param {number} count - The quantity being described.
 * @param {string} singular - Singular form of the noun.
 * @param {string} [plural] - Plural form; defaults to singular + 's'.
 * @returns {string} E.g. "1 item" or "3 items"
 *
 * @example
 * pluralize(1, 'patient')           // "1 patient"
 * pluralize(5, 'patient')           // "5 patients"
 * pluralize(2, 'entry', 'entries')  // "2 entries"
 */
export function pluralize(count, singular, plural) {
  const noun = count === 1 ? singular : (plural || `${singular}s`)
  return `${count} ${noun}`
}


/**
 * Sanitises a string to prevent basic XSS injection in DOM contexts.
 * Escapes HTML special characters: & < > " '
 * Note: this is a display-layer guard only. Always use parameterised queries
 * and Supabase's built-in protections for database writes.
 *
 * @param {string} str - Raw user input.
 * @returns {string} Escaped string safe for insertion into HTML text content.
 *
 * @example
 * sanitizeInput('<script>alert(1)</script>') // "&lt;script&gt;alert(1)&lt;/script&gt;"
 */
export function sanitizeInput(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}


// -----------------------------------------------------------------------------
// MISC
// -----------------------------------------------------------------------------

/**
 * Sums the values of a numeric field across an array of objects.
 *
 * @param {Object[]} array - Array of objects.
 * @param {string} field - Key of the numeric field to sum.
 * @returns {number} Total sum (0 if array is empty or field is missing).
 *
 * @example
 * sumField(expenses, 'amount')   // 15000
 */
export function sumField(array, field) {
  if (!Array.isArray(array)) return 0
  return array.reduce((total, item) => total + (parseFloat(item[field]) || 0), 0)
}


/**
 * Deep-clones a plain object or array using JSON round-trip.
 * Does NOT support: undefined values, functions, Dates (converted to strings),
 * circular references, or class instances.
 *
 * @param {*} value - The value to clone.
 * @returns {*} A deep clone of the input.
 *
 * @example
 * const copy = deepClone(formState)
 */
export function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}


/**
 * Picks a subset of keys from an object and returns a new object.
 *
 * @param {Object} obj - Source object.
 * @param {string[]} keys - Array of keys to include.
 * @returns {Object} New object containing only the specified keys.
 *
 * @example
 * pick(patient, ['id', 'name', 'phone']) // { id: 1, name: 'Ali', phone: '...' }
 */
export function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return {}
  return keys.reduce((result, key) => {
    if (key in obj) result[key] = obj[key]
    return result
  }, {})
}


/**
 * Omits specified keys from an object and returns a new object with the rest.
 *
 * @param {Object} obj - Source object.
 * @param {string[]} keys - Array of keys to exclude.
 * @returns {Object} New object without the specified keys.
 *
 * @example
 * omit(formData, ['password', 'confirm_password'])
 */
export function omit(obj, keys) {
  if (!obj || typeof obj !== 'object') return {}
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keys.includes(k))
  )
}


/**
 * Converts a snake_case or camelCase string to a human-readable Title Case label.
 * Useful for auto-generating column headers from database field names.
 *
 * @param {string} str - snake_case or camelCase string.
 * @returns {string} Title-cased label string.
 *
 * @example
 * toLabel('created_at')      // "Created At"
 * toLabel('patientName')     // "Patient Name"
 * toLabel('total_amount_rs') // "Total Amount Rs"
 */
export function toLabel(str) {
  if (!str) return ''
  return str
    // Insert space before uppercase letters in camelCase
    .replace(/([A-Z])/g, ' $1')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]/g, ' ')
    // Trim and title-case
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}


/**
 * Checks whether a value is empty: null, undefined, empty string,
 * empty array, or empty object.
 *
 * @param {*} value - Value to check.
 * @returns {boolean}
 *
 * @example
 * isEmpty(null)    // true
 * isEmpty('')      // true
 * isEmpty([])      // true
 * isEmpty({})      // true
 * isEmpty(0)       // false  — 0 is a valid value
 * isEmpty('hello') // false
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}
