import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Auth.css'

function Register() {
  const [formData, setFormData] = useState({
    nome_utente: '',
    password: '',
    conferma_password: ''
  })

  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.conferma_password) {
      setError('Passwords do not match.')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    const hasNumber = /\d/.test(formData.password);
    if (!hasNumber) {
      setError('Password must contain at least 1 number')  
      return 
    }

    const hasSpecial = /[!@#\$%\?]/.test(formData.password);
    if (!hasSpecial) {
      setError('Password must contain at least one: ! @ # $ % ?')  
      return 
    }

    setLoading(true)

    try {
      const response = await fetch('http://localhost:8080/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome_utente: formData.nome_utente,
          password: formData.password
        })
      })

      const data = await response.json()

      if (response.ok) {
        navigate('/login')
      } else {
        setError(data.message || 'Registration failed. Please try again.')
      }
    } catch (err) {
      setError('Unable to connect to server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Password Manager</h1>
        <h2>Register</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="nome_utente">Username</label>
            <input
              type="text"
              id="nome_utente"
              name="nome_utente"
              value={formData.nome_utente}
              onChange={handleChange}
              required
              autoComplete="username"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />

              <button
                type='button'
                className='occhietto'
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="conferma_password">Confirm Password</label>
            <div className="input-with-icon">
              <input
                type={showPassword ? "text" : "password"}
                id="conferma_password"
                name="conferma_password"
                value={formData.conferma_password}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />

              <button
                type='button'
                className='occhietto'
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        
        <p className="auth-link">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  )
}

export default Register