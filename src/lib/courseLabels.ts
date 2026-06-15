import type { CourseStatus, Visibility } from '../types/database'

// Human-readable labels for the course enums, so cards and headers don't show
// raw values like "processing" or "private".
const STATUS_LABELS: Record<CourseStatus, string> = {
  pending: 'Not generated',
  processing: 'Generating…',
  ready: 'Ready',
  failed: 'Generation failed',
}

export function statusLabel(status: CourseStatus): string {
  return STATUS_LABELS[status] ?? status
}

export function visibilityLabel(visibility: Visibility): string {
  return visibility === 'public' ? 'Public' : 'Private'
}
