import { useCallback, useRef } from 'react'

type ScrollSentinelProps = {
  readonly root: HTMLElement | null
  readonly disabled: boolean
  readonly onReach: () => void
}

export function ScrollSentinel({ root, disabled, onReach }: ScrollSentinelProps) {
  const observer = useRef<IntersectionObserver | null>(null)

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect()
      if (node === null || disabled) {
        return
      }
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            onReach()
          }
        },
        { root, rootMargin: '400px' },
      )
      observer.current.observe(node)
    },
    [root, disabled, onReach],
  )

  return <div ref={ref} data-testid="logs-sentinel" aria-hidden="true" className="h-px" />
}
