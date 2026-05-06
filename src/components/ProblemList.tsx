import { useState } from 'react'
import type { Problem } from '../lib/types'

interface Props { problems: Problem[] }

const severityConfig = {
  high: { color: 'bg-red-100 text-red-700', label: '严重' },
  medium: { color: 'bg-yellow-100 text-yellow-700', label: '中等' },
  low: { color: 'bg-green-100 text-green-700', label: '轻微' },
}

export default function ProblemList({ problems }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">问题清单</h3>
      {problems.map((p, i) => (
        <div key={i} onClick={() => setExpanded(expanded === `${i}` ? null : `${i}`)}
          className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${severityConfig[p.severity].color}`}>{severityConfig[p.severity].label}</span>
              <span className="text-sm font-medium text-gray-800">{p.category}</span>
            </div>
            {p.timestamp && <span className="text-xs text-gray-400">{p.timestamp}</span>}
          </div>
          {expanded === `${i}` && <p className="text-sm text-gray-600 mt-2">{p.description}</p>}
        </div>
      ))}
    </div>
  )
}
