import * as XLSX from 'xlsx'
import { api } from '../api'

const TEMPLATE_VERSION = 1

export function buildExportData(graphData, nodeTypes, allTags, relTypes, storyTitle) {
  const typeMap = Object.fromEntries(nodeTypes.map(t => [t.name, t]))

  return {
    version: TEMPLATE_VERSION,
    exportedAt: new Date().toISOString(),
    storyTitle: storyTitle || 'Untitled',
    nodeTypes: nodeTypes.map(t => ({
      name: t.name,
      color: t.color,
      font_color: t.font_color || '#ffffff',
      description: t.description || '',
      is_date_type: !!t.is_date_type,
      scope: t.scope || 'story',
    })),
    tags: allTags.map(t => ({
      name: t.name,
      color: t.color,
      scope: t.scope || 'story',
    })),
    nodes: graphData.nodes.map(({ data: n }) => ({
      name: n.label,
      type: n.type,
      description: n.description || '',
      date: n.date || '',
      tags: (n.tags || []).map(t => t.name),
      metadata: n.metadata || {},
    })),
    relationships: graphData.edges.map(({ data: e }) => ({
      source: e.source_name,
      target: e.target_name,
      label: e.label,
      notes: e.notes || '',
      start_date: e.start_date || '',
      end_date: e.end_date || '',
      metadata: e.metadata || {},
    })),
    relTypes: relTypes.map(rt => ({
      label: rt.label,
      color: rt.color,
    })),
  }
}

export function exportAsJson(data, filename) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, filename.endsWith('.json') ? filename : `${filename}.json`)
}

export function exportAsXlsx(data, filename) {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.nodeTypes), 'NodeTypes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.tags), 'Tags')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.nodes.map(n => ({
      ...n,
      tags: n.tags.join(', '),
      metadata: Object.keys(n.metadata).length > 0 ? JSON.stringify(n.metadata) : '',
    }))
  ), 'Nodes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    data.relationships.map(r => ({
      ...r,
      metadata: Object.keys(r.metadata || {}).length > 0 ? JSON.stringify(r.metadata) : '',
    }))
  ), 'Relationships')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.relTypes), 'RelColors')

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const isJson = file.name.toLowerCase().endsWith('.json')

    reader.onload = (e) => {
      try {
        if (isJson) {
          const data = JSON.parse(e.target.result)
          resolve(normalizeImportData(data))
        } else {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          resolve(normalizeImportData(xlsxToTemplate(wb)))
        }
      } catch (err) {
        reject(new Error(`Failed to parse file: ${err.message}`))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))

    if (isJson) reader.readAsText(file)
    else reader.readAsArrayBuffer(file)
  })
}

function xlsxToTemplate(wb) {
  const sheet = (name) => {
    const s = wb.Sheets[name]
    return s ? XLSX.utils.sheet_to_json(s) : []
  }

  const nodes = sheet('Nodes').map(row => ({
    ...row,
    tags: row.tags ? String(row.tags).split(',').map(t => t.trim()).filter(Boolean) : [],
    metadata: parseJsonField(row.metadata),
  }))

  const relationships = sheet('Relationships').map(row => ({
    ...row,
    metadata: parseJsonField(row.metadata),
  }))

  const nodeTypes = sheet('NodeTypes').map(row => ({
    ...row,
    is_date_type: row.is_date_type === true || String(row.is_date_type).toLowerCase() === 'true',
  }))

  return {
    version: TEMPLATE_VERSION,
    nodeTypes,
    tags: sheet('Tags'),
    nodes,
    relationships,
    relTypes: sheet('RelColors'),
  }
}

function parseJsonField(val) {
  if (!val || val === '') return {}
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return {} }
}

function normalizeImportData(data) {
  return {
    version: data.version || 1,
    storyTitle: data.storyTitle || '',
    nodeTypes: data.nodeTypes || [],
    tags: data.tags || [],
    nodes: data.nodes || [],
    relationships: data.relationships || [],
    relTypes: data.relTypes || [],
  }
}

export function validateImportData(data, existingTypes, existingTags, existingNodes) {
  const errors = []
  const warnings = []

  if (!data.nodes?.length && !data.nodeTypes?.length && !data.tags?.length && !data.relationships?.length) {
    errors.push('File contains no data to import')
    return { errors, warnings, valid: false }
  }

  const fileTypeNames = new Set(data.nodeTypes.map(t => t.name))
  const fileTagNames = new Set(data.tags.map(t => t.name))
  const fileNodeNames = new Set()

  const existingTypeNames = new Set(existingTypes.map(t => t.name))
  const existingTagNames = new Set(existingTags.map(t => t.name))
  const existingNodeNames = new Set(existingNodes.map(n => n.data.label))

  for (const t of data.nodeTypes) {
    if (!t.name) errors.push('A node type is missing a name')
    if (existingTypeNames.has(t.name)) warnings.push(`Type "${t.name}" already exists — will reuse`)
  }

  for (const t of data.tags) {
    if (!t.name) errors.push('A tag is missing a name')
    if (existingTagNames.has(t.name)) warnings.push(`Tag "${t.name}" already exists — will reuse`)
  }

  for (const n of data.nodes) {
    if (!n.name) { errors.push('A node is missing a name'); continue }
    if (fileNodeNames.has(n.name)) errors.push(`Duplicate node name in file: "${n.name}"`)
    fileNodeNames.add(n.name)
    if (existingNodeNames.has(n.name)) errors.push(`Node "${n.name}" already exists in this story`)
    if (n.type && !fileTypeNames.has(n.type) && !existingTypeNames.has(n.type)) {
      errors.push(`Node "${n.name}" references unknown type "${n.type}"`)
    }
    for (const tag of (n.tags || [])) {
      if (!fileTagNames.has(tag) && !existingTagNames.has(tag)) {
        errors.push(`Node "${n.name}" references unknown tag "${tag}"`)
      }
    }
  }

  for (const r of data.relationships) {
    if (!r.source) { errors.push('A relationship is missing a source'); continue }
    if (!r.target) { errors.push('A relationship is missing a target'); continue }
    if (!r.label) { errors.push(`Relationship ${r.source} → ${r.target} is missing a label`); continue }
    const sourceExists = fileNodeNames.has(r.source) || existingNodeNames.has(r.source)
    const targetExists = fileNodeNames.has(r.target) || existingNodeNames.has(r.target)
    if (!sourceExists) errors.push(`Relationship source "${r.source}" not found`)
    if (!targetExists) errors.push(`Relationship target "${r.target}" not found`)
  }

  return { errors, warnings, valid: errors.length === 0 }
}

export async function executeImport(data, graphId, existingTypes, existingTags, existingNodes, onProgress) {
  const results = { types: 0, tags: 0, nodes: 0, relationships: 0, relColors: 0, errors: [] }

  const typeNameToId = Object.fromEntries(existingTypes.map(t => [t.name, t.id]))
  const tagNameToId = Object.fromEntries(existingTags.map(t => [t.name, t.id]))
  const nodeNameToId = Object.fromEntries(existingNodes.map(n => [n.data.label, n.data.id]))

  onProgress?.({ phase: 'types', current: 0, total: data.nodeTypes.length })
  for (let i = 0; i < data.nodeTypes.length; i++) {
    const t = data.nodeTypes[i]
    if (typeNameToId[t.name]) continue
    try {
      const created = await api.createNodeType({
        name: t.name,
        color: t.color || '#6366f1',
        font_color: t.font_color || '#ffffff',
        description: t.description || '',
        is_date_type: !!t.is_date_type,
        scope: 'story',
        graph_id: graphId,
      })
      typeNameToId[t.name] = created.id
      results.types++
    } catch (e) {
      results.errors.push(`Type "${t.name}": ${e.message}`)
    }
    onProgress?.({ phase: 'types', current: i + 1, total: data.nodeTypes.length })
  }

  onProgress?.({ phase: 'tags', current: 0, total: data.tags.length })
  for (let i = 0; i < data.tags.length; i++) {
    const t = data.tags[i]
    if (tagNameToId[t.name]) continue
    try {
      const created = await api.createTag({
        name: t.name,
        color: t.color || '#a78bfa',
        scope: 'story',
        graph_id: graphId,
      })
      tagNameToId[t.name] = created.id
      results.tags++
    } catch (e) {
      results.errors.push(`Tag "${t.name}": ${e.message}`)
    }
    onProgress?.({ phase: 'tags', current: i + 1, total: data.tags.length })
  }

  onProgress?.({ phase: 'nodes', current: 0, total: data.nodes.length })
  for (let i = 0; i < data.nodes.length; i++) {
    const n = data.nodes[i]
    if (nodeNameToId[n.name]) continue
    const typeId = typeNameToId[n.type]
    if (!typeId) {
      results.errors.push(`Node "${n.name}": type "${n.type}" not found`)
      continue
    }
    const tagIds = (n.tags || []).map(t => tagNameToId[t]).filter(Boolean)
    try {
      const created = await api.createNode({
        name: n.name,
        type_id: typeId,
        graph_id: graphId,
        description: n.description || '',
        metadata: n.metadata || {},
        date: n.date || null,
        tag_ids: tagIds,
      })
      nodeNameToId[n.name] = created.id
      results.nodes++
    } catch (e) {
      results.errors.push(`Node "${n.name}": ${e.message}`)
    }
    onProgress?.({ phase: 'nodes', current: i + 1, total: data.nodes.length })
  }

  onProgress?.({ phase: 'relationships', current: 0, total: data.relationships.length })
  for (let i = 0; i < data.relationships.length; i++) {
    const r = data.relationships[i]
    const sourceId = nodeNameToId[r.source]
    const targetId = nodeNameToId[r.target]
    if (!sourceId || !targetId) {
      if (!sourceId) results.errors.push(`Rel "${r.source} → ${r.target}": source not found`)
      if (!targetId) results.errors.push(`Rel "${r.source} → ${r.target}": target not found`)
      continue
    }
    try {
      await api.createRelationship({
        source_id: sourceId,
        target_id: targetId,
        label: r.label,
        notes: r.notes || '',
        metadata: r.metadata || {},
        start_date: r.start_date || null,
        end_date: r.end_date || null,
      })
      results.relationships++
    } catch {
      // duplicate relationships are expected — skip silently
    }
    onProgress?.({ phase: 'relationships', current: i + 1, total: data.relationships.length })
  }

  if (data.relTypes?.length > 0) {
    onProgress?.({ phase: 'relColors', current: 0, total: data.relTypes.length })
    for (let i = 0; i < data.relTypes.length; i++) {
      const rt = data.relTypes[i]
      try {
        await api.updateRelType(rt.label, graphId, { color: rt.color })
        results.relColors++
      } catch {
        // rel type may not exist yet if no rels with that label were created
      }
      onProgress?.({ phase: 'relColors', current: i + 1, total: data.relTypes.length })
    }
  }

  onProgress?.({ phase: 'done' })
  return results
}
