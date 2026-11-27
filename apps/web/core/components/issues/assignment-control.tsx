/** Shared presentation for native and coordinated assignment controls. */
export const ASSIGNMENT_CONTROL_CLASS = "h-9 w-full rounded border border-subtle bg-surface-1 px-2 text-left text-xs";

export function AssignmentChevron() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    className="pointer-events-none absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-secondary">
    <path d="m6 9 6 6 6-6" />
  </svg>;
}
