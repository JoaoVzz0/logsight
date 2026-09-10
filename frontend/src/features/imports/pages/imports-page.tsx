import { useState } from 'react'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { submitImport } from '../api/submit-import'
import { ImportDropzone } from '../components/import-dropzone'
import { ImportHistory } from '../components/import-history'
import { ImportProgress } from '../components/import-progress'
import { AUTO_DETECT, toSourceTypeOverride } from '../model/source-type'

export function ImportsPage() {
  const queryClient = useQueryClient()
  const [sourceType, setSourceType] = useState(AUTO_DETECT)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const upload = useMutation({
    mutationFn: (file: File) =>
      submitImport(file, toSourceTypeOverride(sourceType)),
    onSuccess: (created) => {
      setActiveJobId(created.id)
      void queryClient.invalidateQueries({ queryKey: ['imports'] })
    },
  })

  return (
    <section className="flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-lg font-semibold">Imports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a log file and follow the parse job through to completion.
        </p>
      </header>

      <ImportDropzone
        sourceType={sourceType}
        onSourceTypeChange={setSourceType}
        onFile={upload.mutate}
        isUploading={upload.isPending}
        error={
          upload.isError
            ? upload.error instanceof Error
              ? upload.error.message
              : 'The upload failed.'
            : null
        }
        onRetry={upload.reset}
      />

      {activeJobId !== null && (
        <ImportProgress
          key={activeJobId}
          jobId={activeJobId}
          onDismiss={() => setActiveJobId(null)}
        />
      )}

      <ImportHistory />
    </section>
  )
}
