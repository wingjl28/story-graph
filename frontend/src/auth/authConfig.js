export const AUTH_ENABLED = !!import.meta.env.VITE_COGNITO_AUTHORITY

export const oidcConfig = {
  authority: import.meta.env.VITE_COGNITO_AUTHORITY,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_COGNITO_REDIRECT_URI || window.location.origin,
  response_type: 'code',
  scope: import.meta.env.VITE_COGNITO_SCOPE || 'openid email profile',
  automaticSilentRenew: true,
  onSigninCallback: () =>
    window.history.replaceState({}, document.title, window.location.pathname),
}
