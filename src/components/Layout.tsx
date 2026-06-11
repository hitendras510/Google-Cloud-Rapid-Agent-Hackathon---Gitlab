import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="min-h-screen bg-navy-900">
      <Sidebar />
      <main className="ml-64 min-h-screen bg-navy-800/40">
        <Outlet />
      </main>
    </div>
  );
}
