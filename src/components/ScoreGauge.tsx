interface Props { score: number }

function getColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

function getBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function ScoreGauge({ score }: Props) {
  return (
    <div className="text-center">
      <div className={`text-5xl font-bold ${getColor(score)}`}>{score}</div>
      <div className="text-gray-400 text-sm mt-1">/100</div>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
        <div className={`h-2 rounded-full ${getBarColor(score)} transition-all duration-500`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}
