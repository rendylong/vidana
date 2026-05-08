import { Link } from 'react-router-dom'
import { Key, Terminal } from '@phosphor-icons/react'

const installCommand = 'npm install -g vidana'
const exportCommand = 'export VIDANA_API_KEY="vdn_your_key_here"'
const analyzeCommand = `vidana analyze ./demo.mp4 \\
  --audience "二三线城市 30-50 岁男性" \\
  --platform "抖音" \\
  --context "集成空调投放素材" > report.md`
const agentPrompt = '请使用 vidana analyze 分析 ./demo.mp4，目标用户是二三线城市 30-50 岁男性，平台是抖音，补充背景是集成空调投放素材。'

export default function CliPage() {
  return (
    <div className="h-full overflow-y-auto bg-zinc-50">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <section className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Ovidly CLI</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950">
            把视频分析接进你的 Agent 工作流
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600">
            CLI 版 Ovidly 调用线上分析服务，默认输出 Markdown。适合放进 Claude Code、Codex 或团队自己的自动化脚本里。
          </p>
          <Link
            to="/api-keys"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            <Key size={16} />
            管理 API Key
          </Link>

          <div className="mt-8 grid gap-4">
            <DocBlock title="1. 安装 CLI" code={installCommand} />
            <DocBlock title="2. 设置 API Key" code={exportCommand} />
            <DocBlock title="3. 分析视频" code={analyzeCommand} />
            <DocBlock title="4. 在 Agent 中使用" code={agentPrompt} />
          </div>
        </section>
      </div>
    </div>
  )
}

function DocBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Terminal size={16} className="text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
      </div>
      <pre className="overflow-x-auto rounded-md bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-50">
        <code>{code}</code>
      </pre>
    </div>
  )
}
