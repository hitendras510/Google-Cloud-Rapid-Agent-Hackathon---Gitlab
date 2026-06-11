import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Failures from './pages/Failures';
import TraceViewer from './pages/TraceViewer';
import CostDashboard from './pages/CostDashboard';
import SettingsPage from './pages/Settings';
import GitLabSetup from './pages/GitLabSetup';
import Architecture from './pages/Architecture';
import TestingGuide from './pages/TestingGuide';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="failures" element={<Failures />} />
          <Route path="trace" element={<TraceViewer />} />
          <Route path="trace/:id" element={<TraceViewer />} />
          <Route path="cost" element={<CostDashboard />} />
          <Route path="gitlab" element={<GitLabSetup />} />
          <Route path="architecture" element={<Architecture />} />
          <Route path="testing-guide" element={<TestingGuide />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
