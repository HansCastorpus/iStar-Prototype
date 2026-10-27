// Mirror Link.jsx constants
const AH = 8, AHW = 5, IG = 4
const IR = 5, LR = 8
const TRIM   = AH + IG + IR * 2 - 3          // 19
const TRIML  = AH + IG + LR * 2 - 3          // 25
const TRIMDL = TRIML + LR * 2 + 2            // 43
const TRIMN  = AH + IG + IR + AH / 2 - 3     // 18
const TRIMA  = AH + IG + IR                  // 17
const TRIMP  = TRIM + 3                      // 22

// Link SVG: 8px tall slice; icons overflow via overflow:visible
const SW = 72, SH = 8, MID = 4, TIP = 64, LS = 4

function partOfArcs(cx, cy) {
  const r = IR, ah = 3, aw = 1.5, rotDeg = -85
  return [[20, 150], [200, 330]].map(([from, to]) => {
    const fr = (from + rotDeg) * Math.PI / 180
    const tr = (to   + rotDeg) * Math.PI / 180
    const sx = cx + r * Math.cos(fr), sy = cy + r * Math.sin(fr)
    const ex = cx + r * Math.cos(tr), ey = cy + r * Math.sin(tr)
    const tdx = -Math.sin(tr), tdy = Math.cos(tr)
    return {
      sx, sy, ex, ey, r,
      pts: `${ex + tdx*ah},${ey + tdy*ah} ${ex - tdy*aw},${ey + tdx*aw} ${ex + tdy*aw},${ey - tdx*aw}`,
    }
  })
}

function LinkIcon({ type, color, sw, dash, id }) {
  const isLarge = ['hurt', 'help', 'make', 'break'].includes(type)
  const icR = isLarge ? LR : IR
  const icX = TIP - (AH + IG + icR)
  const lEnd =
    type === 'hurt' || type === 'help'  ? TIP - TRIML  :
    type === 'make' || type === 'break' ? TIP - TRIMDL :
    type === 'needed-by'                ? TIP - TRIMN  :
    type === 'and'                      ? TIP - TRIMA  :
    type === 'part-of'                  ? TIP - TRIMP  :
                                          TIP - TRIM
  const lStart = type === 'depends-on' ? LS + TRIM : LS
  const endArrow = `${TIP},${MID} ${TIP-AH},${MID-AHW} ${TIP-AH},${MID+AHW}`

  return (
    <>
      <line x1={lStart} y1={MID} x2={lEnd} y2={MID}
        stroke={color} strokeWidth={sw} strokeDasharray={dash} />
      <polygon points={endArrow} fill={color} />

      {type === 'depends-on' && <>
        <polygon points={`${LS},${MID} ${LS+AH},${MID-AHW} ${LS+AH},${MID+AHW}`} fill={color} />
        <rect x={LS+AH+IG} y={MID-IR} width={IR*2} height={IR*2} fill={color} />
      </>}

      {type === 'depends-on' && (
        <rect x={icX-IR+1.5} y={MID-IR+1.5} width={(IR-1.5)*2} height={(IR-1.5)*2}
          fill="var(--node-fill)" stroke={color} strokeWidth={3} />
      )}
      {type === 'hurt' && <>
        <circle cx={icX} cy={MID} r={LR} fill={color} />
        <rect x={icX-LR*0.6} y={MID-1} width={LR*1.2} height={2} fill="white" />
      </>}
      {type === 'help' && <>
        <circle cx={icX} cy={MID} r={LR} fill="var(--node-fill)" stroke={color} strokeWidth={1.5} />
        <rect x={icX-LR*0.6} y={MID-1} width={LR*1.2} height={2} fill={color} />
        <rect x={icX-1} y={MID-LR*0.6} width={2} height={LR*1.2} fill={color} />
      </>}
      {type === 'make' && (() => {
        const x2 = icX - (LR*2+2)
        return <>
          <circle cx={x2} cy={MID} r={LR} fill="var(--node-fill)" stroke={color} strokeWidth={1.5} />
          <rect x={x2-LR*0.6} y={MID-1} width={LR*1.2} height={2} fill={color} />
          <rect x={x2-1} y={MID-LR*0.6} width={2} height={LR*1.2} fill={color} />
          <circle cx={icX} cy={MID} r={LR} fill="var(--node-fill)" stroke={color} strokeWidth={1.5} />
          <rect x={icX-LR*0.6} y={MID-1} width={LR*1.2} height={2} fill={color} />
          <rect x={icX-1} y={MID-LR*0.6} width={2} height={LR*1.2} fill={color} />
        </>
      })()}
      {type === 'break' && (() => {
        const x2 = icX - (LR*2+2)
        return <>
          <circle cx={x2} cy={MID} r={LR} fill={color} />
          <rect x={x2-LR*0.6} y={MID-1} width={LR*1.2} height={2} fill="white" />
          <circle cx={icX} cy={MID} r={LR} fill={color} />
          <rect x={icX-LR*0.6} y={MID-1} width={LR*1.2} height={2} fill="white" />
        </>
      })()}
      {type === 'needed-by' && (() => {
        const tipX = icX - AH/2, bX = icX + AH/2
        const pts = `${tipX},${MID} ${bX},${MID-AHW} ${bX},${MID+AHW}`
        return <>
          <defs><clipPath id={id}><polygon points={pts} /></clipPath></defs>
          <polygon points={pts} fill="var(--node-fill)" stroke={color}
            strokeWidth={sw*2} clipPath={`url(#${id})`} />
        </>
      })()}
      {type === 'or' && (
        <circle cx={icX} cy={MID} r={IR - Math.min(sw,1.5)/2}
          fill="var(--node-fill)" stroke={color} strokeWidth={Math.min(sw,1.5)} />
      )}
      {type === 'xor' && <circle cx={icX} cy={MID} r={IR} fill={color} />}
      {type === 'and' && (
        <line x1={icX} y1={MID-IR} x2={icX} y2={MID+IR}
          stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      )}
      {type === 'part-of' && (
        <g>
          {partOfArcs(icX, MID).map(({ sx, sy, ex, ey, pts, r }, i) => (
            <g key={i}>
              <path d={`M ${sx},${sy} A ${r},${r} 0 0 1 ${ex},${ey}`}
                fill="none" stroke={color} strokeWidth={sw} />
              <polygon points={pts} fill={color} />
            </g>
          ))}
        </g>
      )}
    </>
  )
}

// Node shape icons – NW×NH; fill passed as prop for inactive/highlighted variants
const NW = 40, NH = 18, NP = 8

function NodeIcon({ type, fill }) {
  const stroke = 'var(--node-stroke)'
  const rx = (NH - 1) / 2

  if (type === 'goal')
    return (
      <svg width={NW} height={NH} viewBox={`0 0 ${NW} ${NH}`} style={{ flexShrink: 0 }}>
        <rect x={0.5} y={0.5} width={NW-1} height={NH-1} rx={rx}
          fill={fill} stroke={stroke} strokeWidth={1} />
      </svg>
    )

  if (type === 'task') {
    const d = `M ${NP},0.5 L ${NW-NP},0.5 L ${NW-0.5},${NH/2} L ${NW-NP},${NH-0.5} L ${NP},${NH-0.5} L 0.5,${NH/2} Z`
    return (
      <svg width={NW} height={NH} viewBox={`0 0 ${NW} ${NH}`} style={{ flexShrink: 0 }}>
        <path d={d} fill={fill} stroke={stroke} strokeWidth={1} />
      </svg>
    )
  }

  if (type === 'softgoal') {
    const clipId = `legend-sg-clip-${fill.includes('hl') ? 'hl' : 'in'}`
    return (
      <svg width={NW} height={NH} viewBox={`0 0 ${NW} ${NH}`} style={{ flexShrink: 0 }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0.5} y={0.5} width={NW-1} height={NH-1} rx={rx} />
          </clipPath>
        </defs>
        <rect x={0.5} y={0.5} width={NW-1} height={NH-1} rx={rx}
          fill={fill} stroke={stroke} strokeWidth={1} />
        {[5, 8, NW-8, NW-5].map(x => (
          <line key={x} x1={x} y1={0} x2={x} y2={NH}
            stroke={stroke} strokeWidth={1} clipPath={`url(#${clipId})`} />
        ))}
      </svg>
    )
  }

  return (
    <svg width={NW} height={NH} viewBox={`0 0 ${NW} ${NH}`} style={{ flexShrink: 0 }}>
      <rect x={0.5} y={0.5} width={NW-1} height={NH-1}
        fill={fill} stroke={stroke} strokeWidth={1} />
    </svg>
  )
}

const NODE_TYPES = ['goal', 'task', 'softgoal', 'resource']

const LINK_DEFS = [
  { type: 'depends-on', hl: { color: 'var(--hl-depends-on)', sw: 6 } },
  { type: 'or',         hl: { color: 'var(--hl-or)',         sw: 6 } },
  { type: 'xor',        hl: { color: 'var(--hl-xor)',        sw: 6 } },
  { type: 'and',        hl: { color: 'var(--hl-and)',        sw: 6 } },
  { type: 'help',       hl: { color: 'var(--hl-help)',       sw: 8 } },
  { type: 'hurt',       hl: { color: 'var(--hl-hurt)',       sw: 8 } },
  { type: 'make',       hl: { color: 'var(--hl-help)',       sw: 8 } },
  { type: 'break',      hl: { color: 'var(--hl-hurt)',       sw: 8 } },
  { type: 'needed-by',  hl: { color: 'var(--hl-needed-by)', sw: 6, dash: '8 4' } },
  { type: 'part-of',    hl: { color: 'var(--hl-part-of)',   sw: 6 } },
]

export const LEGEND_W = SW   // width reserved for a legend icon in the filter panel

// Actor sample: dashed boundary with a name tag; highlighted adds the striped fill (see Actor.jsx)
const AW = 48, AH_ = 22
function ActorIcon({ highlighted }) {
  const id = `legend-actor-stripes-${highlighted ? 'hl' : 'in'}`
  return (
    <svg width={AW} height={AH_} viewBox={`0 0 ${AW} ${AH_}`} style={{ flexShrink: 0, overflow: 'visible' }}>
      {highlighted && (
        <defs>
          <pattern id={id} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
            <rect width={5} height={5} fill="var(--actor-hl-fill)" />
            <line x1={2.5} y1={0} x2={2.5} y2={5} stroke="var(--actor-hl-stripe)" strokeWidth={2} />
          </pattern>
        </defs>
      )}
      <rect x={8.5} y={5.5} width={AW - 9} height={AH_ - 6} rx={4}
        fill={highlighted ? `url(#${id})` : 'none'}
        stroke={highlighted ? 'var(--node-stroke)' : 'var(--text-3)'} strokeWidth={highlighted ? 1.5 : 1}
        strokeDasharray={highlighted ? undefined : '3 2'} />
      <rect x={0.5} y={0.5} width={18} height={9} rx={3}
        fill="var(--node-fill)" stroke="var(--node-stroke)" strokeWidth={highlighted ? 1.5 : 1} />
    </svg>
  )
}

// Legend sample for a node or link type, in its inactive or highlighted style
export function LegendIcon({ type, highlighted }) {
  if (type === 'actor') return <ActorIcon highlighted={highlighted} />
  if (NODE_TYPES.includes(type))
    return <NodeIcon type={type} fill={highlighted ? `var(--hl-${type})` : 'var(--node-fill)'} />

  const def = LINK_DEFS.find(l => l.type === type)
  if (!def) return null
  const { color, sw, dash } = highlighted ? def.hl : { color: 'var(--link-def)', sw: 1.5 }
  return (
    <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}
      style={{ flexShrink: 0, overflow: 'visible' }}>
      <LinkIcon type={type} color={color} sw={sw} dash={dash}
        id={`leg-${highlighted ? 'hl' : 'in'}-${type}`} />
    </svg>
  )
}
