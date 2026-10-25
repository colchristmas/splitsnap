import { Navigate, createBrowserRouter } from 'react-router'
import { ReceiptLayout, TabsLayout } from './components/layouts'
import { Assign } from './screens/Assign'
import { History } from './screens/History'
import { Home } from './screens/Home'
import { Items } from './screens/Items'
import { People } from './screens/People'
import { Scan } from './screens/Scan'
import { Settings } from './screens/Settings'
import { Spending } from './screens/Spending'
import { Summary } from './screens/Summary'

export const router = createBrowserRouter([
  {
    element: <TabsLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'history', element: <History /> },
      { path: 'spending', element: <Spending /> },
      { path: 'people', element: <People /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  {
    path: 'r/:id',
    element: <ReceiptLayout />,
    children: [
      { index: true, element: <Navigate to="items" replace /> },
      { path: 'scan', element: <Scan /> },
      { path: 'items', element: <Items /> },
      { path: 'people', element: <Assign /> },
      { path: 'split', element: <Summary /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
