import { useState, useEffect } from 'react'
import './Dashboard.css'
import Cookies from 'js-cookie';

const generateTotpCode = async (secret, timestamp) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const normalizedSecret = secret.toUpperCase().replace(/[\s=-]/g, '')
  let buffer = 0
  let bitsLeft = 0
  const secretBytes = []

  for (const character of normalizedSecret) {
    const value = alphabet.indexOf(character)
    if (value === -1) {
      throw new Error('Invalid Base32 OTP secret')
    }

    buffer = (buffer << 5) | value
    bitsLeft += 5
    if (bitsLeft >= 8) {
      bitsLeft -= 8
      secretBytes.push((buffer >> bitsLeft) & 0xff)
      buffer &= (1 << bitsLeft) - 1
    }
  }

  if (secretBytes.length === 0) {
    throw new Error('Invalid Base32 OTP secret')
  }

  const counter = BigInt(Math.floor(timestamp / 30000))
  const counterBytes = new ArrayBuffer(8)
  new DataView(counterBytes).setBigUint64(0, counter)
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(secretBytes),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes))
  const offset = hash[hash.length - 1] & 0x0f
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)

  return String(binary % 1000000).padStart(6, '0')
}

function Dashboard({ onLogout }) {
  const [passwords, setPasswords] = useState([])
  const [otpCodes, setOtpCodes] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [aggiungiPassword, setaggiungiPassword] = useState(null)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null);
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [showAddOtp, setShowAddOtp] = useState(false)
  const [showEditOtp, setShowEditOtp] = useState(false)
  const [revealedPasswords, setRevealedPasswords] = useState({})

  const [formData, setFormData] = useState({
    url: '',
    username: '',
    password: '',
    otp: ''
  })

  useEffect(() => {
    fetchPasswords()
  }, [])

  useEffect(() => {
    const updateOtpCodes = async () => {
      const entries = await Promise.all(
        passwords
          .filter(password => password.otpSecret)
          .map(async password => {
            try {
              const now = Date.now()
              return [password.id, {
                code: await generateTotpCode(password.otpSecret, now),
                secondsRemaining: 30 - (Math.floor(now / 1000) % 30)
              }]
            } catch {
              return [password.id, { code: 'OTP unavailable', secondsRemaining: 0 }]
            }
          })
      )
      setOtpCodes(Object.fromEntries(entries))
    }

    updateOtpCodes()
    const intervalId = setInterval(updateOtpCodes, 1000)
    return () => clearInterval(intervalId)
  }, [passwords])

  const getAuthHeaders = () => {
    const token = Cookies.get('session_token')
    return {
      'Content-Type': 'application/json',
    }
  }

  const fetchPasswords = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/cerca_Password', {
        headers: getAuthHeaders(),
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setPasswords(data || [])
      } else if (response.status === 401) {
        onLogout()
      }
    } catch (err) {
      showToast('Failed to load passwords', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const url = `http://localhost:8080/api/aggiungi`
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(formData)
      })
      
      if (response.ok) {
        showToast('Password added', 'success')
        closeModal()
        fetchPasswords()
      } else {
        showToast('Failed to save password', 'error')
      }
    } catch (err) {
      showToast('Failed to save password', 'error')
    }
  }
  
  const handleEdit = async (e) => {
    e.preventDefault()
    
    try {
      const response = await fetch(`http://localhost:8080/api/modifica/${editingId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(formData)
      })
      if (response.ok) {
        showToast('Password modified', 'success')
        closeEdit()
        fetchPasswords()
      } else {
        showToast('Failed to edit password', 'error')
      }
    } catch (err) {
      showToast('Failed to edit password', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this password?')) {
      return
    }

    try {
      const response = await fetch(`http://localhost:8080/api/elimina_password/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include'
      })

      if (response.ok) {
        showToast('Password deleted', 'success')
        fetchPasswords()
      } else {
        showToast('Failed to delete password', 'error')
      }
    } catch (err) {
      showToast('Failed to delete password', 'error')
    }
  }

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard', 'success')
    } catch (err) {
      showToast('Failed to copy', 'error')
    }
  }

  const openModal = () => {
    setaggiungiPassword(null)
    setFormData({ url: '', username: '', password: '', otp: '' })
    setShowAddPassword(false)
    setShowAddOtp(false)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setShowAddPassword(false)
    setShowAddOtp(false)
    setFormData({ url: '', username: '', password: '', otp: '' })
  }


  const openEdit = (password) => {
    setEditingId(password.id);
    setaggiungiPassword('Update')
    setShowEditPassword(false)
    setShowEditOtp(false)
    
    setFormData({ 
      url: password.url, 
      username: password.username, 
      password: '', // Keep password empty for security
      otp: ''
    })
    setShowEdit(true)
  }

  const closeEdit = () => {
    setShowEdit(false)
    setShowEditPassword(false)
    setShowEditOtp(false)
    setEditingId(null)
    setFormData({ url: '', username: '', password: '', otp: '' })
  }

  const togglePasswordVisibility = (id) => {
    setRevealedPasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const generateSecurePassword = (length = 16) => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const lowercase = 'abcdefghijklmnopqrstuvwxyz'
    const numbers = '0123456789'
    const symbols = '!@#$%?'

    const requiredChars = [
      uppercase[Math.floor(Math.random() * uppercase.length)],
      lowercase[Math.floor(Math.random() * lowercase.length)],
      numbers[Math.floor(Math.random() * numbers.length)],
      symbols[Math.floor(Math.random() * symbols.length)]
    ]

    const allChars = uppercase + lowercase + numbers + symbols
    const passwordChars = [...requiredChars]

    while (passwordChars.length < length) {
      passwordChars.push(allChars[Math.floor(Math.random() * allChars.length)])
    }

    for (let i = passwordChars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]]
    }

    return passwordChars.join('')
  }

  const handleGeneratePassword = (target) => {
    const generatedPassword = generateSecurePassword(16)

    if (target === 'add') {
      setFormData(prev => ({ ...prev, password: generatedPassword }))
      setShowAddPassword(true)
      return
    }

    setFormData(prev => ({ ...prev, password: generatedPassword }))
    setShowEditPassword(true)
  }

  const showToast = (message, type) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filteredPasswords = passwords.filter(p => 
    p.url?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🔐 Password Manager</h1>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </header>

      <main className="dashboard-content">
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search passwords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="add-btn-container">
          <button className="add-password-btn" onClick={openModal}>
            + Add Password
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading passwords...</p>
          </div>
        ) : filteredPasswords.length === 0 ? (
          <div className="empty-state">
            <h2>{searchTerm ? 'No results found' : 'No passwords yet'}</h2>
            <p>{searchTerm ? 'Try a different search term' : 'Add your first password to get started'}</p>
          </div>
        ) : (
          <div className="password-list">
            {filteredPasswords.map((password) => {
              const isPowned = String(password.powned) === '1'
              return(
              <div 
                  key={password.id} 
                  className={`password-card ${isPowned ? 'powned' : ''}`}>

                  <div className="password-info">
                    <h3>
                      {password.url}    {isPowned && <span className="powned-badge">🚨 VIOLATA</span>}
                    </h3>
                    <p><strong>Username:</strong> {password.username}</p>
                    <div className="password-field">
                      <strong>Password:</strong>
                      <span>{revealedPasswords[password.id] ? password.password : '••••••••'}</span>
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => togglePasswordVisibility(password.id)}
                      >
                        {revealedPasswords[password.id] ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {password.otpSecret && (
                      <div className="otp-field">
                        <strong>OTP:</strong>
                        <span className="otp-code">{otpCodes[password.id]?.code || '------'}</span>
                        <span className="otp-countdown">
                          {otpCodes[password.id]?.secondsRemaining ?? 30}s
                        </span>
                        <button
                          type="button"
                          className="action-btn copy-btn"
                          onClick={() => {
                            const code = otpCodes[password.id]?.code
                            if (/^\d{6}$/.test(code || '')) {
                              handleCopy(code)
                            }
                          }}
                          disabled={!/^\d{6}$/.test(otpCodes[password.id]?.code || '')}
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="password-actions">
                    <button 
                      className="action-btn copy-btn" 
                      onClick={() => handleCopy(password.password)}
                    >
                      Copy
                    </button>
                    <button 
                      className="action-btn modify-btn"
                      onClick={() => openEdit(password)}
                    >
                      Edit
                    </button>

                    <button 
                      className="action-btn delete-btn"
                      onClick={() => handleDelete(password.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
            </div>
        )
      }
      </main>

      {/* Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add New Password</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="url">Website / URL</label>
                <input
                  type="text"
                  id="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  required
                  placeholder="https://example.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="username">Username / Email</label>
                <input
                  type="text"
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  placeholder="user@example.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showAddPassword ? 'text' : 'password'}
                    id="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    placeholder="Enter password"
                  />
                  <div className="password-input-actions">
                    <button
                      type="button"
                      className="visibility-btn"
                      onClick={() => setShowAddPassword(!showAddPassword)}
                      aria-label={showAddPassword ? 'Hide password' : 'Show password'}
                    >
                      {showAddPassword ? '🙈' : '👁️'}
                    </button>
                    <button
                      type="button"
                      className="generate-password-btn"
                      onClick={() => handleGeneratePassword('add')}
                    >
                      Random Password
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <button
                  type="button"
                  className="btn btn-secondary otp-toggle-btn"
                  onClick={() => setShowAddOtp(!showAddOtp)}
                >
                  {showAddOtp ? 'Hide OTP' : 'Add OTP'}
                </button>
                {showAddOtp && (
                  <>
                    <label htmlFor="otp">OTP secret (Base32)</label>
                    <input
                      type="password"
                      id="otp"
                      value={formData.otp}
                      onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                      placeholder="Enter OTP secret"
                      autoComplete="off"
                    />
                  </>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn cancel-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Password</h2>
           
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label htmlFor="edit-url">Website / URL</label>
                <input
                  type="text"
                  id="edit-url"
                  value={formData.url}
                  disabled 
                  className="readonly-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-username">Username / Email</label>
                <input
                  type="text"
                  id="edit-username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-password">New Password (optional)</label>
                <div className="password-input-wrapper">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    id="edit-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Leave empty to keep the current password"
                  />
                  <div className="password-input-actions">
                    <button
                      type="button"
                      className="visibility-btn"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      aria-label={showEditPassword ? 'Hide password' : 'Show password'}
                    >
                      {showEditPassword ? '🙈' : '👁️'}
                    </button>
                    <button
                      type="button"
                      className="generate-password-btn"
                      onClick={() => handleGeneratePassword('edit')}
                    >
                      Random Password
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <button
                  type="button"
                  className="btn btn-secondary otp-toggle-btn"
                  onClick={() => setShowEditOtp(!showEditOtp)}
                >
                  {showEditOtp ? 'Hide OTP' : 'Add OTP'}
                </button>
                {showEditOtp && (
                  <>
                    <label htmlFor="edit-otp">OTP secret (Base32)</label>
                    <input
                      type="password"
                      id="edit-otp"
                      value={formData.otp}
                      onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                      placeholder="Enter OTP secret to add or replace"
                      autoComplete="off"
                    />
                  </>
                )}
              </div>
              <div className="modal-actions">
                
                <button type="button" className="btn cancel-btn" onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default Dashboard