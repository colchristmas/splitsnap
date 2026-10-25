import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './App'
import { ensureCategoryRules } from './db/categories'
import { ensureSelf } from './db/people'
import './index.css'

void ensureSelf()
void ensureCategoryRules()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
