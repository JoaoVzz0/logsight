import { useRef, useState, type DragEvent } from 'react'

import { cn } from '../../../shared/lib/cn'
import { Button } from '../../../shared/ui/button'
import { Select } from '../../../shared/ui/select'
import { SOURCE_TYPE_OPTIONS } from '../model/source-type'

const ACCEPT = '.json,.jsonl,.log,.txt'

type ImportDropzoneProps = {
  readonly sourceType: string
  readonly onSourceTypeChange: (value: string) => void
  readonly onFile: (file: File) => void
  readonly isUploading: boolean
  readonly error: string | null
  readonly onRetry: () => void
}

export function ImportDropzone({
  sourceType,
  onSourceTypeChange,
  onFile,
  isUploading,
  error,
  onRetry,
}: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  function pickFirst(files: FileList | null) {
    const file = files?.item(0)
    if (file !== undefined && file !== null) {
      onFile(file)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    pickFirst(event.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <label
          className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          htmlFor="source-type"
        >
          Format
        </label>
        <Select
          id="source-type"
          options={SOURCE_TYPE_OPTIONS}
          value={sourceType}
          disabled={isUploading}
          onChange={(event) => onSourceTypeChange(event.currentTarget.value)}
        />
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center transition-colors',
          isDragging
            ? 'border-accent bg-accent-subtle'
            : 'border-border-strong bg-surface hover:bg-secondary/40',
        )}
      >
        <p className="text-sm font-medium text-foreground">
          {isUploading ? 'Uploading…' : 'Drop a log file here'}
        </p>
        <p className="text-xs text-muted-foreground">
          JSON, JSON Lines or plain text — the format is detected on import.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className="mt-1"
        >
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            pickFirst(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
        />
      </div>

      {error !== null && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-severity-error/30 bg-severity-subtle-error px-4 py-2.5 text-sm text-foreground"
        >
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
