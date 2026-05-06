import type { PlatformAdvice as PlatformAdviceType } from '../lib/types'

interface Props { advice: PlatformAdviceType }

export default function PlatformAdvice({ advice }: Props) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-blue-900">{advice.platform} 适配建议</h3>
      <ul className="mt-2 space-y-1">
        {advice.tips.map((tip, i) => (
          <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">·</span><span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
