// src/routes/index.tsx
//
// Aplicación de mapas mentales — sin login, sin backend, sin persistencia.

import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'

export const Route = createFileRoute('/')({
  component: MindMapApp,
})

// ---------------------------------------------------------------------------
// Tipos y datos iniciales
// ---------------------------------------------------------------------------

interface NodeData {
  id: string
  text: string
  x: number
  y: number
  parentId: string | null
}

const CANVAS_WIDTH = 1000
const CANVAS_HEIGHT = 640
const CENTER_X = CANVAS_WIDTH / 2
const CENTER_Y = CANVAS_HEIGHT / 2
const ROOT_ID = 'root'
const CHILD_RADIUS = 220
const NEW_CHILD_RADIUS = 150

function createInitialNodes(): NodeData[] {
  const nodes: NodeData[] = [
    { id: ROOT_ID, text: 'Idea principal', x: CENTER_X, y: CENTER_Y, parentId: null },
  ]
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i - Math.PI / 2 // reparte 4 ramas en cruz
    nodes.push({
      id: `rama-${i + 1}`,
      text: `Rama ${i + 1}`,
      x: CENTER_X + Math.cos(angle) * CHILD_RADIUS,
      y: CENTER_Y + Math.sin(angle) * CHILD_RADIUS,
      parentId: ROOT_ID,
    })
  }
  return nodes
}

let idCounter = 0
function nextId() {
  idCounter += 1
  return `nodo-${Date.now()}-${idCounter}`
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

function MindMapApp() {
  const [nodes, setNodes] = useState<NodeData[]>(() => createInitialNodes())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const didDragRef = useRef(false)

  // -------------------------------------------------------------------------
  // Selección de nodo
  // -------------------------------------------------------------------------

  const handleSelectNode = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleCanvasBackgroundClick = useCallback(() => {
    setSelectedId(null)
  }, [])

  // -------------------------------------------------------------------------
  // Edición inline (doble clic)
  // -------------------------------------------------------------------------

  const startEditing = useCallback((node: NodeData) => {
    setEditingId(node.id)
    setDraftText(node.text)
    setSelectedId(node.id)
  }, [])

  const commitEditing = useCallback(() => {
    if (!editingId) return
    setNodes((prev) =>
      prev.map((n) =>
        n.id === editingId ? { ...n, text: draftText.trim() || n.text } : n,
      ),
    )
    setEditingId(null)
  }, [editingId, draftText])

  // -------------------------------------------------------------------------
  // Arrastrar nodos (pointer events)
  // -------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, node: NodeData) => {
      if (editingId === node.id) return
      const canvasEl = canvasRef.current
      if (!canvasEl) return
      const rect = canvasEl.getBoundingClientRect()
      const pointerX = e.clientX - rect.left
      const pointerY = e.clientY - rect.top

      didDragRef.current = false
      dragState.current = {
        id: node.id,
        offsetX: pointerX - node.x,
        offsetY: pointerY - node.y,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [editingId],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragState.current
    if (!drag) return
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const rect = canvasEl.getBoundingClientRect()
    const pointerX = e.clientX - rect.left
    const pointerY = e.clientY - rect.top

    didDragRef.current = true

    const nextX = Math.min(Math.max(pointerX - drag.offsetX, 20), CANVAS_WIDTH - 20)
    const nextY = Math.min(Math.max(pointerY - drag.offsetY, 20), CANVAS_HEIGHT - 20)

    setNodes((prev) =>
      prev.map((n) => (n.id === drag.id ? { ...n, x: nextX, y: nextY } : n)),
    )
  }, [])

  const handlePointerUp = useCallback(() => {
    dragState.current = null
  }, [])

  const handleNodeClick = useCallback(
    (node: NodeData) => {
      // Evita que un arrastre termine seleccionando/deseleccionando por accidente.
      if (didDragRef.current) {
        didDragRef.current = false
        return
      }
      handleSelectNode(node.id)
    },
    [handleSelectNode],
  )

  // -------------------------------------------------------------------------
  // Añadir idea (nodo hijo)
  // -------------------------------------------------------------------------

  const handleAddIdea = useCallback(() => {
    if (!selectedId) return
    setNodes((prev) => {
      const parent = prev.find((n) => n.id === selectedId)
      if (!parent) return prev

      const siblings = prev.filter((n) => n.parentId === parent.id)
      const count = siblings.length + 1
      const index = siblings.length
      const angle = (2 * Math.PI * index) / count - Math.PI / 2

      const newNode: NodeData = {
        id: nextId(),
        text: 'Nueva idea',
        x: Math.min(
          Math.max(parent.x + Math.cos(angle) * NEW_CHILD_RADIUS, 20),
          CANVAS_WIDTH - 20,
        ),
        y: Math.min(
          Math.max(parent.y + Math.sin(angle) * NEW_CHILD_RADIUS, 20),
          CANVAS_HEIGHT - 20,
        ),
        parentId: parent.id,
      }
      return [...prev, newNode]
    })
  }, [selectedId])

  // -------------------------------------------------------------------------
  // Eliminar nodo (y descendientes)
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(() => {
    if (!selectedId || selectedId === ROOT_ID) return

    setNodes((prev) => {
      const toDelete = new Set<string>([selectedId])
      let changed = true
      while (changed) {
        changed = false
        for (const n of prev) {
          if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
            toDelete.add(n.id)
            changed = true
          }
        }
      }
      return prev.filter((n) => !toDelete.has(n.id))
    })
    setSelectedId(null)
  }, [selectedId])

  // -------------------------------------------------------------------------
  // Reiniciar
  // -------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    const confirmed = window.confirm(
      '¿Seguro que quieres reiniciar el mapa mental? Se perderán todos los cambios.',
    )
    if (!confirmed) return
    setNodes(createInitialNodes())
    setSelectedId(null)
    setEditingId(null)
  }, [])

  // -------------------------------------------------------------------------
  // Descargar PNG
  // -------------------------------------------------------------------------

  const handleDownloadPng = useCallback(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return

    toPng(canvasEl, {
      backgroundColor: '#fafaf7',
      pixelRatio: 2,
      filter: (domNode) => {
        if (domNode instanceof HTMLElement) {
          return domNode.dataset.exportIgnore !== 'true'
        }
        return true
      },
    })
      .then((dataUrl) => {
        const link = document.createElement('a')
        link.download = 'mapa-mental.png'
        link.href = dataUrl
        link.click()
      })
      .catch((err) => {
        console.error('No se pudo exportar el mapa mental:', err)
      })
  }, [])

  // -------------------------------------------------------------------------
  // Líneas de conexión
  // -------------------------------------------------------------------------

  const nodesById = useMemo(() => {
    const map = new Map<string, NodeData>()
    for (const n of nodes) map.set(n.id, n)
    return map
  }, [nodes])

  const connections = useMemo(
    () =>
      nodes
        .filter((n) => n.parentId)
        .map((n) => {
          const parent = nodesById.get(n.parentId as string)
          if (!parent) return null
          return { id: n.id, x1: parent.x, y1: parent.y, x2: n.x, y2: n.y }
        })
        .filter((c): c is { id: string; x1: number; y1: number; x2: number; y2: number } => !!c),
    [nodes, nodesById],
  )

  const canDelete = !!selectedId && selectedId !== ROOT_ID

  return (
    <div className="min-h-screen w-full flex flex-col items-center gap-6 py-10 px-4 bg-[#fafaf7]">
      <h1 className="text-xl font-semibold text-neutral-800 tracking-tight">
        Mapa mental
      </h1>

      {/* Controles */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleAddIdea}
          disabled={!selectedId}
          className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium shadow-sm hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Añadir idea
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete}
          className="px-4 py-2 rounded-lg bg-white text-neutral-800 text-sm font-medium border border-neutral-200 shadow-sm hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Eliminar
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 rounded-lg bg-white text-neutral-800 text-sm font-medium border border-neutral-200 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          Reiniciar
        </button>
        <button
          type="button"
          onClick={handleDownloadPng}
          className="px-4 py-2 rounded-lg bg-white text-neutral-800 text-sm font-medium border border-neutral-200 shadow-sm hover:bg-neutral-50 transition-colors"
        >
          Descargar PNG
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleCanvasBackgroundClick()
        }}
        className="relative overflow-hidden rounded-2xl border border-neutral-200 shadow-sm"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          maxWidth: '100%',
          backgroundColor: '#fafaf7',
          backgroundImage: 'radial-gradient(circle, #e5e5e0 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
          touchAction: 'none',
        }}
      >
        {/* Líneas de conexión */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        >
          {connections.map((c) => (
            <line
              key={c.id}
              x1={c.x1}
              y1={c.y1}
              x2={c.x2}
              y2={c.y2}
              stroke="#c7c7c0"
              strokeWidth={2}
            />
          ))}
        </svg>

        {/* Nodos */}
        {nodes.map((node) => {
          const isRoot = node.id === ROOT_ID
          const isSelected = node.id === selectedId
          const isEditing = node.id === editingId
          const size = isRoot ? 128 : 104

          return (
            <div
              key={node.id}
              onPointerDown={(e) => handlePointerDown(e, node)}
              onClick={() => handleNodeClick(node)}
              onDoubleClick={() => startEditing(node)}
              className={[
                'absolute flex items-center justify-center rounded-full text-center select-none cursor-grab active:cursor-grabbing px-3',
                isRoot
                  ? 'bg-neutral-900 text-white shadow-md'
                  : 'bg-white text-neutral-800 border border-neutral-200 shadow-sm',
                isSelected ? 'ring-2 ring-green-500' : '',
              ].join(' ')}
              style={{
                width: size,
                height: size,
                left: node.x - size / 2,
                top: node.y - size / 2,
              }}
            >
              {isEditing ? (
                <input
                  autoFocus
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onBlur={commitEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEditing()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className={[
                    'w-full bg-transparent text-center text-sm font-medium outline-none border-b',
                    isRoot ? 'text-white border-white/50' : 'text-neutral-800 border-neutral-300',
                  ].join(' ')}
                />
              ) : (
                <span className="text-sm font-medium leading-tight break-words">
                  {node.text}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <p data-export-ignore="true" className="text-xs text-neutral-400 max-w-md text-center">
        Doble clic para editar el texto · Arrastra un nodo para moverlo · Selecciona
        un nodo y pulsa «+ Añadir idea» para crear una rama.
      </p>
    </div>
  )
}
