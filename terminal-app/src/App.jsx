import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

// Terminal Home
import TerminalHome from './TerminalHome';

// Admin App
import AdminLayout from './admin-app/components/Layout';
import Dashboard from './admin-app/pages/Dashboard';
import FaceRegister from './admin-app/pages/FaceRegister';
import Users from './admin-app/pages/Users';
import Logs from './admin-app/pages/Logs';
import Settings from './admin-app/pages/Settings';
import Attendance from './admin-app/pages/Attendance';
import EmployeeAttendance from './admin-app/pages/EmployeeAttendance';
import EmployeeAccess from './admin-app/pages/EmployeeAccess';
import Reports from './admin-app/pages/Reports';
import Login from './admin-app/pages/Login';
import DoorControl from './admin-app/pages/DoorControl';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('aura_token');
  if (!token) return <Navigate to="/admin" replace />;
  return children;
};

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Terminal Home Route */}
        <Route path="/" element={<TerminalHome />} />

        {/* Admin Login Route */}
        <Route path="/admin" element={<Login />} />
        
        {/* Admin Panel Routes */}
        <Route path="/admin/*" element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }>
          {/* Note: since AdminLayout uses Outlet, the child routes should be relative without /admin/ prefix */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="register" element={<FaceRegister />} />
          <Route path="users" element={<Users />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="attendance/employee/:employee_id" element={<EmployeeAttendance />} />
          <Route path="access/employee/:employee_id" element={<EmployeeAccess />} />
          <Route path="reports" element={<Reports />} />
          <Route path="logs" element={<Logs />} />
          <Route path="door-control" element={<DoorControl />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
        
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
