import { useRef } from 'react'
import useStore from '../store/useStore.js'
import { upstreamSet, focusLayers } from '../utils/dependencies.js'
import { inActor } from '../utils/actorTree.js'
import { useT } from '../i18n.js'
import {
  wrapLabel, NODE_LINE_H, NODE_BADGE_H, NODE_PAD_X, NODE_FONT, nodePadXFor, TASK_TIP_X,
  SUB_FONT, SUB_PAD_X, SUB_LOGO_H, SUB_LOGO_GAP, subLogoWidth, measureSub, fitSubLabel,
} from '../utils/grid.js'

const SELECTED_COLOR = '#0070f3'
const PENDING_TARGET_COLOR = '#16a34a'

const BADGE_CHAR_W = 7.5
const BADGE_PAD_X = 7

const NODE_TYPES = {
  goal: { stroke: 'var(--node-stroke)' },
  task: { stroke: 'var(--node-stroke)' },
  softgoal: { stroke: 'var(--node-stroke)' },
  resource: { stroke: 'var(--node-stroke)' },
  subactor: { stroke: 'var(--node-stroke)' },
}

// Pick the best source/target sides based on which axis has the larger separation.
function computeBestPorts(src, tgt) {
  const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2)
  const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2)
  if (Math.abs(dx) >= Math.abs(dy))
    return dx >= 0 ? { srcSide: 'right', tgtSide: 'left' } : { srcSide: 'left', tgtSide: 'right' }
  return dy >= 0 ? { srcSide: 'bottom', tgtSide: 'top' } : { srcSide: 'top', tgtSide: 'bottom' }
}

export default function Node({ node }) {
  const gRef = useRef(null)
  const nodeRef = useRef(node)
  nodeRef.current = node

  const pointerRef = useRef(null)

  const { mode, selectedId, select, deselect, moveNode, moveNodeGroup,
    addToSelection, setPendingLink, setDraggingNode, openSubactor } = useStore()

  // Nodes selected by clicking their actor stay selected (they move together) but aren't outlined
  const isSelected = useStore(s =>
    s.selectedId === node.id ||
    (s.selectedIds.includes(node.id) && !(s.selectedActorId && inActor(node, s.selectedActorId))))
  // Second element clicked while one was selected: target of the link being created
  const isPendingTarget = useStore(s => s.pendingLink?.targetId === node.id)
  const accent = isPendingTarget ? PENDING_TARGET_COLOR : isSelected ? SELECTED_COLOR : null
  const highlightTypes = useStore(s => s.highlightTypes)
  const isolateTypes = useStore(s => s.isolateTypes)
  const hideTags = useStore(s => s.hideTags)
  const t = useT()
  const typeName = t(`type.${node.type}`)

  const highlightActive = highlightTypes.length > 0
  const isHidden = !isolateTypes.includes(node.type)
  const isHighlighted = highlightActive && highlightTypes.includes(node.type)

  // 'none' | 'focus' (the selected node) | 'connected' (in dependency set) | 'dimmed'
  const focusStatus = useStore(s => {
    if (!s.focusNodeId) return 'none'
    if (node.id === s.focusNodeId) return 'focus'
    return upstreamSet(s.links, s.focusNodeId, focusLayers(s)).has(node.id) ? 'connected' : 'dimmed'
  })

  const HIGHLIGHT_FILLS = { goal: 'var(--hl-goal)', task: 'var(--hl-task)', softgoal: 'var(--hl-softgoal)', resource: 'var(--hl-resource)', subactor: 'var(--hl-subactor)' }
  const isFillHighlighted = isHighlighted || focusStatus === 'focus' || focusStatus === 'connected'
  const hlFill = isFillHighlighted ? (HIGHLIGHT_FILLS[node.type] ?? 'var(--node-fill)') : 'var(--node-fill)'

  const clientToWorld = (cx, cy) => {
    const pt = gRef.current.ownerSVGElement.createSVGPoint()
    pt.x = cx; pt.y = cy
    return pt.matrixTransform(gRef.current.parentNode.getScreenCTM().inverse())
  }

  const onPointerDown = (e) => {
    if (useStore.getState().mode.startsWith('add-')) return
    if (e.button !== 0) return

    e.stopPropagation()

    if (e.shiftKey) {
      addToSelection(nodeRef.current.id)
      return
    }

    gRef.current.setPointerCapture(e.pointerId)
    useStore.getState().beginBatch()  // the whole drag is one undo step

    const startWorld = clientToWorld(e.clientX, e.clientY)
    const { selectedIds } = useStore.getState()
    const groupIds = selectedIds.length > 1 && selectedIds.includes(nodeRef.current.id)
      ? selectedIds
      : null

    pointerRef.current = {
      pointerId: e.pointerId,
      startWorld,
      startNode: { x: nodeRef.current.x, y: nodeRef.current.y },
      groupIds,
      hasMoved: false,
    }
    setDraggingNode(nodeRef.current.id)
  }

  const onPointerMove = (e) => {
    const ps = pointerRef.current
    if (!ps || e.pointerId !== ps.pointerId) return

    const world = clientToWorld(e.clientX, e.clientY)
    const newX = ps.startNode.x + (world.x - ps.startWorld.x)
    const newY = ps.startNode.y + (world.y - ps.startWorld.y)

    if (!ps.hasMoved &&
      (Math.abs(newX - ps.startNode.x) > 1 || Math.abs(newY - ps.startNode.y) > 1))
      ps.hasMoved = true

    if (ps.groupIds) {
      moveNodeGroup(nodeRef.current.id, newX, newY, ps.groupIds)
    } else {
      moveNode(nodeRef.current.id, newX, newY)
    }
  }

  const endDrag = (e) => {
    const ps = pointerRef.current
    if (!ps || e.pointerId !== ps.pointerId) return

    gRef.current.releasePointerCapture(e.pointerId)
    setDraggingNode(null)
    useStore.getState().endBatch()

    if (!ps.hasMoved) {
      const state = useStore.getState()
      const prevSelected = state.selectedId

      // If another single node was already selected, start a link between them.
      if (
        prevSelected &&
        prevSelected !== nodeRef.current.id &&
        state.selectedType === 'node' &&
        state.selectedIds.length === 0
      ) {
        const srcNode = state.nodes[prevSelected]
        const { srcSide, tgtSide } = computeBestPorts(srcNode, nodeRef.current)
        setPendingLink(prevSelected, srcSide, nodeRef.current.id, tgtSide)
      } else if (
        prevSelected === nodeRef.current.id &&
        state.selectedType === 'node' &&
        state.selectedIds.length === 0
      ) {
        // A plain click on the already-selected element clears the selection
        deselect()
      } else {
        select(nodeRef.current.id, 'node')
      }
    }

    pointerRef.current = null
  }

  const { stroke } = NODE_TYPES[node.type] ?? NODE_TYPES.goal
  // Highlighted body: slightly thicker outline in a darker shade of its own fill
  const hlStroke = `color-mix(in srgb, ${hlFill} 75%, black)`
  const bodyStroke = accent ?? (isFillHighlighted ? hlStroke : stroke)
  const bodyStrokeW = (base) => accent ? 2 : isFillHighlighted ? 2 : base

  const nodePadX = nodePadXFor(node.type)
  const lines = wrapLabel(node.label || `[${typeName}]`, node.width, nodePadX)
  const cx = node.width / 2
  const textAreaH = node.height - NODE_BADGE_H / 2
  const cy = textAreaH / 2

  const badgeCY = node.height
  const badgeW = typeName.length * BADGE_CHAR_W + BADGE_PAD_X * 2

  // Sub-actor box: name (+ logo) on top, an Open button below that opens its own diagram
  const isSub = node.type === 'subactor'
  let subBody = null
  if (isSub) {
    const logoW = node.logo ? subLogoWidth(node.logoAspect ?? 1) : 0
    const name = fitSubLabel(node.label.trim() || `[${typeName}]`, node.width - SUB_PAD_X * 2 - (logoW ? logoW + SUB_LOGO_GAP : 0))
    const textW = measureSub(name)
    const startX = (node.width - (textW + (logoW ? SUB_LOGO_GAP + logoW : 0))) / 2
    const rowY = 22
    subBody = (
      <>
        <rect width={node.width} height={node.height} rx={8} fill={hlFill}
          stroke={bodyStroke} strokeWidth={bodyStrokeW(1.5)} />
        <text x={startX} y={rowY} dominantBaseline="central" fontSize={SUB_FONT} fontWeight={600} fontFamily="sans-serif"
          fill={isFillHighlighted ? 'var(--node-text-hl)' : 'var(--node-text)'}
          style={{ pointerEvents: 'none', userSelect: 'none' }}>{name}</text>
        {node.logo && (
          <image href={node.logo} x={startX + textW + SUB_LOGO_GAP} y={rowY - SUB_LOGO_H / 2}
            width={logoW} height={SUB_LOGO_H} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
        )}
        <g style={{ cursor: 'pointer' }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); openSubactor(node.id) }}>
          <rect x={cx - 34} y={40} width={68} height={18} rx={9} fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth={1} />
          <text x={cx} y={49} textAnchor="middle" dominantBaseline="central" fontSize={10} fontFamily="sans-serif"
            fill="var(--node-text)" style={{ pointerEvents: 'none', userSelect: 'none' }}>{t('subactor.open')} ›</text>
        </g>
      </>
    )
  }

  return (
    <g
      ref={gRef}
      transform={`translate(${node.x},${node.y})`}
      style={{
        cursor: 'move', touchAction: 'none',
        opacity: isHidden ? 0 : focusStatus === 'dimmed' ? 0.15 : 1,
        pointerEvents: isHidden ? 'none' : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {isSub ? subBody : node.type === 'task' ? (
        <path
          d={`M ${TASK_TIP_X},0 L ${node.width - TASK_TIP_X},0 L ${node.width},${node.height / 2} L ${node.width - TASK_TIP_X},${node.height} L ${TASK_TIP_X},${node.height} L 0,${node.height / 2} Z`}
          fill={hlFill}
          stroke={bodyStroke}
          strokeWidth={bodyStrokeW(1)}
        />
      ) : (
        <>
          <rect
            width={node.width}
            height={node.height}
            rx={(node.type === 'goal' || node.type === 'softgoal') ? node.height / 2 : 0}
            fill={hlFill}
            stroke={bodyStroke}
            strokeWidth={bodyStrokeW(1)}
          />
          {node.type === 'softgoal' && (
            <>
              <defs>
                <clipPath id={`sg-${node.id}`}>
                  <rect width={node.width} height={node.height} rx={node.height / 2} />
                </clipPath>
              </defs>
              <line
                x1={7} y1={0} x2={7} y2={node.height}
                stroke={accent ?? stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={11} y1={0} x2={11} y2={node.height}
                stroke={accent ?? stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={node.width - 11} y1={0} x2={node.width - 11} y2={node.height}
                stroke={accent ?? stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
              <line
                x1={node.width - 7} y1={0} x2={node.width - 7} y2={node.height}
                stroke={accent ?? stroke} strokeWidth={1}
                clipPath={`url(#sg-${node.id})`}
                style={{ pointerEvents: 'none' }}
              />
            </>
          )}
        </>
      )}

      {!isSub && <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={NODE_FONT}
        fontFamily="sans-serif"
        fill={isFillHighlighted ? 'var(--node-text-hl)' : 'var(--node-text)'}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={cx}
            y={cy + (i - (lines.length - 1) / 2) * NODE_LINE_H}
          >
            {line}
          </tspan>
        ))}
      </text>}

      {/* Type badge — centred on the bottom edge; hidden with "Hide tags" */}
      {!isSub && !hideTags && <>
      <rect
        x={cx - badgeW / 2}
        y={badgeCY - NODE_BADGE_H / 2}
        width={badgeW}
        height={NODE_BADGE_H}
        rx={NODE_BADGE_H / 2}
        fill="var(--node-fill)"
        stroke={bodyStroke}
        strokeWidth={bodyStrokeW(1)}
        style={{ pointerEvents: 'none' }}
      />
      <text
        x={cx}
        y={badgeCY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontFamily="sans-serif"
        fill="var(--node-text)"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {typeName.toUpperCase()}
      </text>
      </>}
    </g>
  )
}
