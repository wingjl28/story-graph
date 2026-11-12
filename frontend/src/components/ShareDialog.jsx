import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'

export default function ShareDialog({ graphId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)

  const fetchCollaborators = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.getCollaborators(graphId)
      setData(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [graphId])

  useEffect(() => {
    fetchCollaborators()
  }, [fetchCollaborators])

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.updateCollaboratorRole(graphId, userId, { role: newRole })
      await fetchCollaborators()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRemove = async (userId) => {
    try {
      await api.removeCollaborator(graphId, userId)
      await fetchCollaborators()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRevoke = async (email) => {
    try {
      await api.revokeInvite(graphId, email)
      await fetchCollaborators()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    try {
      await api.inviteCollaborator(graphId, { email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail('')
      setInviteRole('viewer')
      await fetchCollaborators()
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  useEffect(() => {
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
      if (!inviteEmail.trim() || inviting) return
      e.preventDefault()
      handleInvite(e)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [inviteEmail, inviting]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-dialog">
        <div className="modal-header">
          <h2 className="modal-title">Share Story</h2>
          <button className="panel-close" onClick={onClose} title="Close">×</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="share-error">{error}</div>
          )}

          {loading && !data ? (
            <p className="share-loading">Loading…</p>
          ) : data ? (
            <>
              {/* Owner */}
              <div className="share-section">
                <div className="share-section-label">Owner</div>
                <div className="share-row">
                  <span className="share-email">{data.owner?.email || data.owner?.display_name || '—'}</span>
                  <span className="share-role-badge">Owner</span>
                </div>
              </div>

              {/* Collaborators */}
              {data.collaborators && data.collaborators.length > 0 && (
                <div className="share-section">
                  <div className="share-section-label">Collaborators</div>
                  {data.collaborators.map((c) => (
                    <div key={c.user_id} className="share-row">
                      <span className="share-email">{c.email || c.display_name}</span>
                      <select
                        className="share-role-select"
                        value={c.role}
                        onChange={(e) => handleRoleChange(c.user_id, e.target.value)}
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        className="share-remove-btn"
                        onClick={() => handleRemove(c.user_id)}
                        title="Remove collaborator"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending invites */}
              {data.pending_invites && data.pending_invites.length > 0 && (
                <div className="share-section">
                  <div className="share-section-label">Pending Invites</div>
                  {data.pending_invites.map((inv) => (
                    <div key={inv.email} className="share-row">
                      <span className="share-email share-email--pending">{inv.email}</span>
                      <span className="share-role-badge share-role-badge--pending">{inv.role}</span>
                      <button
                        className="share-remove-btn"
                        onClick={() => handleRevoke(inv.email)}
                        title="Revoke invite"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Invite form */}
              <div className="share-section">
                <div className="share-section-label">Invite someone</div>
                <form className="share-invite-form" onSubmit={handleInvite}>
                  <input
                    className="share-invite-input"
                    type="email"
                    placeholder="Email address"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                  <select
                    className="share-role-select"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    className="btn btn-primary share-invite-btn"
                    type="submit"
                    disabled={inviting}
                  >
                    {inviting ? 'Inviting…' : 'Invite'}
                  </button>
                </form>
                {inviteError && <div className="share-error share-error--inline">{inviteError}</div>}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
