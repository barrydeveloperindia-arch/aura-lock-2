import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import FaceRegister from './pages/FaceRegister';
import Users from './pages/Users';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Attendance from './pages/Attendance';
import EmployeeAttendance from './pages/EmployeeAttendance';
import EmployeeAccess from './pages/EmployeeAccess';
import Reports from './pages/Reports';
import Login from './pages/Login';

import DoorControl from './pages/DoorControl';

import Home from './pages/Home';
import Scanner from './pages/Scanner';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('aura_token');
  if (!token) return <Navigate to="/admin" replace />;
  return children;
};

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/scanner" element={<Scanner />} />
      <Route path="/admin" element={<Login />} />
      
      {/* Admin Panel routes under /admin prefix */}
      <Route path="/admin" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
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
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
