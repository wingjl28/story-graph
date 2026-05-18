import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oidc-context'
import App from './App.jsx'
import { AUTH_ENABLED, oidcConfig } from './auth/authConfig.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {AUTH_ENABLED ? (
      <AuthProvider {...oidcConfig}>
        <App />
      </AuthProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
