import type { Suggestion } from '../lib/types'

interface Props { suggestions: Suggestion[] }

const priorityConfig = {
  high: { color: 'border-l-red-500', label: '高' },
  medium: { color: 'border-l-yellow-500', label: '中' },
  low: { color: 'border-l-green-500', label: '低' },
}

export default function SuggestionList({ suggestions }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">修改建议</h3>
      {suggestions.map((s, i) => (
        <div key={i} className={`border-l-4 ${priorityConfig[s.priority].color} bg-white rounded-r-lg p-3 border border-gray-200`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{s.action}</span>
            <span className="text-xs text-gray-400">优先级：{priorityConfig[s.priority].label}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{s.detail}</p>
          {s.timeRange && <p className="text-xs text-gray-400 mt-1">时间：{s.timeRange}</p>}
        </div>
      ))}
    </div>
  )
}
