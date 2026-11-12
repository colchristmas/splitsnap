import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './App'
import { NatureBackdrop } from './components/NatureBackdrop'
import { ensureCategoryRules } from './db/categories'
import { ensureSelf } from './db/people'
import './index.css'

void ensureSelf()
void ensureCategoryRules()

// `npx vite --host --mode phone`: a QR code for opening the app on a phone.
// Production builds compile this to null, so the QR code library isn't shipped.
const PhoneQr =
  import.meta.env.DEV && import.meta.env.MODE === 'phone'
    ? lazy(() => import('./components/PhoneQr').then((m) => ({ default: m.PhoneQr })))
    : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NatureBackdrop />
    <RouterProvider router={router} />
    {PhoneQr && (
      <Suspense fallback={null}>
        <PhoneQr />
      </Suspense>
    )}
  </StrictMode>,
)
