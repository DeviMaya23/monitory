import { Route, Routes } from 'react-router'
import { NotBuilt } from './app-shell/NotBuilt'

/** The route table (ARCHITECTURE.md). Each page replaces its placeholder when its task builds it. */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<NotBuilt page="dashboard" />} />
      <Route path="/sign-in" element={<NotBuilt page="sign-in" />} />
      <Route path="/services/new" element={<NotBuilt page="add service" />} />
      <Route path="/services/:serviceId" element={<NotBuilt page="edit service" />} />
      <Route path="/services/:serviceId/alerts" element={<NotBuilt page="alert list" />} />
      <Route path="/status" element={<NotBuilt page="public status" />} />
      <Route path="*" element={<NotBuilt page="requested" />} />
    </Routes>
  )
}
