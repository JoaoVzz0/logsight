import { Select } from '../../../shared/ui/select'
import { TIME_RANGE_OPTIONS, type TimeRangePreset } from '../model/time-range'

type TimeRangeSelectorProps = {
  readonly value: TimeRangePreset
  readonly onChange: (preset: TimeRangePreset) => void
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <Select
      aria-label="Time range"
      data-testid="time-range-selector"
      options={TIME_RANGE_OPTIONS}
      value={value}
      onChange={(event) => onChange(event.target.value as TimeRangePreset)}
    />
  )
}
