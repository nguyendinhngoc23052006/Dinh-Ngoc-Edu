// In-memory stash for a guest's upload: the landing page parks the filled-in
// form here before bouncing through login, and NewCoursePage prefills from it
// so nothing has to be re-uploaded. File objects can't be serialized, so this
// survives SPA navigation only — after a full page reload the form is simply
// empty again.

export interface PendingCourse {
  title: string
  outputLanguage: string
  files: File[]
}

let pending: PendingCourse | null = null

export function setPendingCourse(input: PendingCourse): void {
  pending = input
}

export function getPendingCourse(): PendingCourse | null {
  return pending
}

export function clearPendingCourse(): void {
  pending = null
}
