import { useState, useEffect } from 'react'
import './Dashboard.css'
import Cookies from 'js-cookie';

function Dashboard({ onLogout }) {
  const [passwords, setPasswords] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [aggiungiPassword, setaggiungiPassword] = useState(null)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null);
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [revealedPasswords, setRevealedPasswords] = useState({})

  const [formData, setFormData] = useState({
    url: '',
    username: '',
    password: ''
  })

  useEffect(() => {
    fetchPasswords()
  }, [])

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
    setFormData({ url: '', username: '', password: '' })
    setShowAddPassword(false)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setShowAddPassword(false)
    setFormData({ url: '', username: '', password: '' })
  }


  const openEdit = (password) => {
    setEditingId(password.id);
    setaggiungiPassword('Update')
    setShowEditPassword(false)
    
    setFormData({ 
      url: password.url, 
      username: password.username, 
      password: '' // Keep password empty for security 
    })
    setShowEdit(true)
  }

  const closeEdit = () => {
    setShowEdit(false)
    setShowEditPassword(false)
    setEditingId(null)
    setFormData({ url: '', username: '', password: '' })
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
            {filteredPasswords.map((password) => (
              <div key={password.id} className="password-card">
                <div className="password-info">
                  <h3>{password.url}</h3>
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
            ))}
          </div>
        )}
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
                <label htmlFor="edit-password">New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    id="edit-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    placeholder="Enter new password"
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