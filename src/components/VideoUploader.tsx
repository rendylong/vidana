import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv']
const MAX_SIZE = 20 * 1024 * 1024

interface Props { onUploaded: (storagePath: string) => void }

export default function VideoUploader({ onUploaded }: Props) {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validate = (f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|avi|wmv)$/i)) return '不支持的视频格式，请上传 MP4/MOV/AVI/WMV 格式'
    if (f.size > MAX_SIZE) return '文件大小不能超过 20MB'
    return null
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) { const err = validate(f); if (err) { setError(err); return }; setError(''); setFile(f) }
  }, [])

  const handleUpload = async () => {
    if (!file || !user) return
    setUploading(true); setError('')
    const ext = file.name.split('.').pop()
    const storagePath = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('videos').upload(storagePath, file, { cacheControl: '3600', upsert: false })
    if (uploadError) { setError('上传失败，请重试'); setUploading(false); return }
    setUploading(false); onUploaded(storagePath)
  }

  return (
    <div className="space-y-4">
      <div onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={handleDrop}
        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
        <input ref={inputRef} type="file" accept=".mp4,.mov,.avi,.wmv,video/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { const err = validate(f); if (err) { setError(err); return }; setError(''); setFile(f) } }} />
        {file ? (
          <div><p className="text-sm font-medium text-gray-900">{file.name}</p><p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p></div>
        ) : (
          <div><p className="text-gray-500">拖拽视频到此处，或点击选择文件</p><p className="text-xs text-gray-400 mt-1">MP4/MOV/AVI/WMV, 不超过 20MB</p></div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {uploading && <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }} /></div>}
      {file && !uploading && (
        <button onClick={handleUpload} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          上传视频
        </button>
      )}
    </div>
  )
}
