const BASE = '/api'

async function req(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || 'Request failed')
  }
  return res.json()
}

const get = (url) => req(url)
const post = (url, data) => req(url, { method: 'POST', body: JSON.stringify(data) })
const put = (url, data) => req(url, { method: 'PUT', body: JSON.stringify(data) })
const del = (url) => req(url, { method: 'DELETE' })

export const api = {
  // Node Types
  getNodeTypes: () => get('/node-types'),
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

  // Relationship Types
  getRelTypes: () => get('/rel-types'),
  updateRelType: (label, data) => put(`/rel-types/${encodeURIComponent(label)}`, data),

  // Tags
  getTags: () => get('/tags'),
  createTag: (data) => post('/tags', data),
  updateTag: (id, data) => put(`/tags/${id}`, data),
  deleteTag: (id) => del(`/tags/${id}`),
  addNodeTag: (nodeId, tagId) => post(`/tags/nodes/${nodeId}/${tagId}`, {}),
  removeNodeTag: (nodeId, tagId) => del(`/tags/nodes/${nodeId}/${tagId}`),

  // Graph
  getGraph: (graphId = 1) => get(`/graph?graph_id=${graphId}`),

  // Story Graphs
  getStoryGraphs: () => get('/story-graphs'),
  createStoryGraph: (data) => post('/story-graphs', data),
  updateStoryGraph: (id, data) => put(`/story-graphs/${id}`, data),
  deleteStoryGraph: (id) => del(`/story-graphs/${id}`),
}
