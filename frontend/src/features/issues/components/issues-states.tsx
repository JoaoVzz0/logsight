import { Button } from '../../../shared/ui/button'
import { Card } from '../../../shared/ui/card'

const PANEL = 'flex flex-col items-center gap-1 p-10 text-center text-sm'

export function IssuesError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card data-testid="issues-error" role="alert" className={PANEL}>
      <p className="font-medium text-foreground">Could not load issues</p>
      <p className="text-muted-foreground">
        The request to the issues service failed.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Retry
      </Button>
    </Card>
  )
}

export function IssuesEmpty() {
  return (
    <Card data-testid="issues-empty" className={PANEL}>
      <p className="font-medium text-foreground">No issues yet</p>
      <p className="text-muted-foreground">
        Import a log file to start grouping occurrences into issues.
      </p>
    </Card>
  )
}

export function IssuesNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <Card data-testid="issues-no-matches" className={PANEL}>
      <p className="font-medium text-foreground">No issues match these filters</p>
      <p className="text-muted-foreground">
        Drop a filter to see more.
      </p>
      <Button variant="outline" size="sm" onClick={onClear} className="mt-3">
        Clear filters
      </Button>
    </Card>
  )
}
