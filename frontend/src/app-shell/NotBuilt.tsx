/** Stands in for a page until its task builds it. */
export function NotBuilt({ page }: { page: string }) {
  return (
    <main>
      <h1>Monitory</h1>
      <p>The {page} page is not built yet.</p>
    </main>
  )
}
