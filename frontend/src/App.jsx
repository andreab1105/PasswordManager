import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Register from './components/Register'
import Dashboard from './components/Dashboard'
import Cookies from 'js-cookie';





function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true); // Add a loading state


  useEffect(() => {
    // Instead of reading the cookie directly, ask the server if we are logged in
    const verifySession = async() => {
      try{
        const response = await fetch('http://localhost:8080/api/check-auth', { method: 'GET',credentials: 'include' });
        if (response.ok) {
          setIsAuthenticated(true);
        }
        else{
          setIsAuthenticated(false);
        } 
      }
      catch (err) {
      console.error("Auth check failed", err);
      setIsAuthenticated(false);
    }
    finally{
      setLoading(false);
    }
  };
    
  verifySession();    
    
  }, []);

  if (loading) return <div>Loading...</div>

  const handleLogin = (token) => {
    Cookies.set('session_token', token, { expires: 7, secure: false, sameSite: 'strict' });
    setIsAuthenticated(true);
  }

  const handleLogout = () => {
    Cookies.remove('session_token');
    setIsAuthenticated(false);
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route 
            path="/login" 
            element={isAuthenticated ? <Navigate to="/" /> : <Login onLogin={handleLogin} />} 
          />
          <Route 
            path="/register" 
            element={isAuthenticated ? <Navigate to="/" /> : <Register />} 
          />
          <Route 
            path="/" 
            element={isAuthenticated ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" />} 
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App