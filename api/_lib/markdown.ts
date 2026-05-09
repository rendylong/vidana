import type { AnalysisReport, GlobalEdit, TimelineEdit } from './types'

interface AnalysisMarkdownContext {
  targetAudience?: string
  platform?: string
  context?: string
}

function cleanCell(value: unknown): string {
  const text = value == null || value === '' ? '-' : String(value)
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function bullet(value: string): string {
  return `- ${value}`
}

function timelineRows(edits: TimelineEdit[]): string[] {
  if (!edits.length) return ['| - | - | - | 暂无逐场景修改。 | - |']
  return edits.map((edit) => (
    `| ${cleanCell(edit.timestamp)} | ${cleanCell(edit.severity)} | ${cleanCell(edit.category)} | ${cleanCell(edit.issue)} | ${cleanCell(edit.action)} |`
  ))
}

function globalEditLine(edit: GlobalEdit): string {
  return `- [${cleanCell(edit.severity)}][${cleanCell(edit.category)}] ${cleanCell(edit.issue)} -> ${cleanCell(edit.action)}`
}

export function formatAnalysisMarkdown(report: AnalysisReport, context: AnalysisMarkdownContext = {}): string {
  const lines = [
    '# Vidana 视频分析报告',
    '',
    '## 基本信息',
    `- 目标用户：${context.targetAudience || '未指定'}`,
    `- 投放平台：${context.platform || '未指定'}`,
    `- 补充背景：${context.context || '未指定'}`,
    '',
    '## 综合判断',
    `- 综合评分：${report.score ?? 0}`,
    `- 总结：${report.summary || '暂无总结。'}`,
    '',
    '## 逐场景修改',
    '| 时间点 | 严重程度 | 类别 | 问题 | 修改建议 |',
    '| --- | --- | --- | --- | --- |',
    ...timelineRows(report.timelineEdits || []),
    '',
    '## 全局修改',
    ...(report.globalEdits?.length ? report.globalEdits.map(globalEditLine) : [bullet('暂无全局修改。')]),
    '',
    '## 宏观建议',
    ...(report.suggestions?.length ? report.suggestions.map(bullet) : [bullet('暂无宏观建议。')]),
  ]

  return `${lines.join('\n')}\n`
}
