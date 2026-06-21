import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root not found')
}

// App (via services) imports supabaseClient, which throws at import time when
// the Supabase env vars are missing — e.g. a Vercel preview whose PR got no
// Supabase preview branch. Import dynamically so that failure renders a
// readable message instead of a white page.
import('./App')
  .then(({ default: App }) => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    root.innerHTML = ''
    const pre = document.createElement('pre')
    pre.style.cssText = 'margin:2rem;font-family:monospace;white-space:pre-wrap'
    pre.textContent = `This deployment failed to start.\n\n${message}\n\nIf this is a PR preview: the Supabase integration may not have created a preview branch for this PR (the "Supabase Preview" check shows "skipped"), so no database credentials were injected.`
    root.appendChild(pre)
  })
