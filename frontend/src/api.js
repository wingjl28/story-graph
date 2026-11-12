const BASE = '/api'

let _authToken = null
let _onAuthError = null

export function setAuthToken(token) {
  _authToken = token
}

export function setOnAuthError(cb) {
  _onAuthError = cb
}

async function req(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (_authToken) {
    headers['Authorization'] = `Bearer ${_authToken}`
  }
  const res = await fetch(BASE + url, {
    headers,
    ...options,
  })
  if (res.status === 401) {
    // Do NOT auto-trigger signinRedirect on 401: a *bad* (vs merely
    // expired) token loops infinitely: login -> 401 -> re-login -> 401 ...
    // Throw the error; the app surfaces it and the user can explicitly
    // sign out / sign in again via the sidebar control. (Genuine token
    // expiry is handled by react-oidc-context's automaticSilentRenew.)
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || 'Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || 'Request failed')
  }
  return res.json()
}

const get = (url) => req(url)
const post = (url, data) => req(url, { method: 'POST', body: JSON.stringify(data) })
const put = (url, data) => req(url, { method: 'PUT', body: JSON.stringify(data) })
const patch = (url, data) => req(url, { method: 'PATCH', body: JSON.stringify(data) })
const del = (url) => req(url, { method: 'DELETE' })

export const api = {
  // Node Types
  getNodeTypes: (graphId) => graphId != null ? get(`/node-types?graph_id=${graphId}`) : get('/node-types'),
  createNodeType: (data) => post('/node-types', data),
  updateNodeType: (id, data) => put(`/node-types/${id}`, data),
  deleteNodeType: (id) => del(`/node-types/${id}`),

  // Nodes
  getNodes: () => get('/nodes'),
  createNode: (data) => post('/nodes', data),
  getNode: (id) => get(`/nodes/${id}`),
  updateNode: (id, data) => put(`/nodes/${id}`, data),
  deleteNode: (id) => del(`/nodes/${id}`),
  getNodeRelationships: (id) => get(`/nodes/${id}/relationships`),

  // Relationships
  createRelationship: (data) => post('/relationships', data),
  updateRelationship: (id, data) => put(`/relationships/${id}`, data),
  deleteRelationship: (id) => del(`/relationships/${id}`),
  swapRelationship: (id) => post(`/relationships/${id}/swap`, {}),
  toggleBidirectional: (id) => post(`/relationships/${id}/toggle-bidirectional`, {}),

  // Relationship Types
  getRelTypes: (graphId) => get(`/rel-types?graph_id=${graphId}`),
  updateRelType: (label, graphId, data) => put(`/rel-types/${encodeURIComponent(label)}?graph_id=${graphId}`, data),

  // Tags
  getTags: (graphId) => graphId != null ? get(`/tags?graph_id=${graphId}`) : get('/tags'),
  createTag: (data) => post('/tags', data),
  updateTag: (id, data) => put(`/tags/${id}`, data),
  deleteTag: (id) => del(`/tags/${id}`),
  addNodeTag: (nodeId, tagId) => post(`/tags/nodes/${nodeId}/${tagId}`, {}),
  removeNodeTag: (nodeId, tagId) => del(`/tags/nodes/${nodeId}/${tagId}`),

  // Graph
  getGraph: (graphId = 1) => get(`/graph?graph_id=${graphId}`),
  getPositions: (graphId) => get(`/graph/positions?graph_id=${graphId}`),
  savePositions: (graphId, positions) => put(`/graph/positions?graph_id=${graphId}`, positions),

  // Story Graphs
  getStoryGraphs: () => get('/story-graphs'),
  createStoryGraph: (data) => post('/story-graphs', data),
  updateStoryGraph: (id, data) => put(`/story-graphs/${id}`, data),
  deleteStoryGraph: (id) => del(`/story-graphs/${id}`),

  // Collaborators
  getCollaborators: (gid) => get(`/story-graphs/${gid}/collaborators`),
  inviteCollaborator: (gid, body) => post(`/story-graphs/${gid}/collaborators`, body),
  updateCollaboratorRole: (gid, userId, body) => patch(`/story-graphs/${gid}/collaborators/${userId}`, body),
  removeCollaborator: (gid, userId) => del(`/story-graphs/${gid}/collaborators/${userId}`),
  revokeInvite: (gid, email) => del(`/story-graphs/${gid}/invites?email=${encodeURIComponent(email)}`),
}
