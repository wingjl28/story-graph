import { useAuth } from 'react-oidc-context'
import { AUTH_ENABLED } from '../auth/authConfig.js'

/**
 * AuthedGate: only mounted when AUTH_ENABLED=true, i.e. always inside AuthProvider.
 * It is safe to call useAuth() here unconditionally.
 */
function AuthedGate({ children }) {
  const auth = useAuth()

  if (auth.isLoading) {
    return (
      <div className="login-gate-center">
        <p>Loading&hellip;</p>
      </div>
    )
  }

  if (auth.error) {
    return (
      <div className="login-gate-center">
        <p className="login-gate-error">Authentication error: {auth.error.message}</p>
        <button className="btn btn-primary" onClick={() => auth.signinRedirect()}>
          Retry
        </button>
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="login-gate-center">
        <div className="login-gate-card">
          <h1 className="login-gate-title">Story Graph</h1>
          <p className="login-gate-subtitle">Sign in to access your story graphs</p>
          <button className="btn btn-primary login-gate-btn" onClick={() => auth.signinRedirect()}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * LoginGate: passthrough in dev mode; full OIDC gate in prod mode.
 * When AUTH_ENABLED=false, renders children directly (no AuthProvider needed).
 * When AUTH_ENABLED=true, delegates to AuthedGate which calls useAuth() safely.
 */
export default function LoginGate({ children }) {
  if (!AUTH_ENABLED) {
    return <>{children}</>
  }
  return <AuthedGate>{children}</AuthedGate>
}
