import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import viVN from 'antd/locale/vi_VN';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import './App.css';

// Lazy load pages - reduces initial JS parse time
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Contracts = React.lazy(() => import('./pages/Contracts'));
const Projects = React.lazy(() => import('./pages/Projects'));
const Targets = React.lazy(() => import('./pages/TargetsV2'));
const Business = React.lazy(() => import('./pages/Business'));
const Plans = React.lazy(() => import('./pages/Plans'));
const Branches = React.lazy(() => import('./pages/Branches'));
const UserManagement = React.lazy(() => import('./pages/UserManagement'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <Spin size="large" />
  </div>
);

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  if (!token) return <Navigate to="/login" replace />;

  // Block NO_ACCESS users
  if (user?.role === 'NO_ACCESS') {
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#E11D2E',
          borderRadius: 8,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        },
      }}
    >
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
            <Route path="contracts" element={<Suspense fallback={<PageLoader />}><Contracts /></Suspense>} />
            <Route path="projects" element={<Suspense fallback={<PageLoader />}><Projects /></Suspense>} />
            <Route path="targets" element={<Suspense fallback={<PageLoader />}><Targets /></Suspense>} />
            <Route path="business" element={<Suspense fallback={<PageLoader />}><Business /></Suspense>} />
            <Route path="plans" element={<Suspense fallback={<PageLoader />}><Plans /></Suspense>} />
            <Route path="branches" element={<Suspense fallback={<PageLoader />}><Branches /></Suspense>} />
            <Route path="users" element={<Suspense fallback={<PageLoader />}><UserManagement /></Suspense>} />
          </Route>
        </Routes>
      </HashRouter>
    </ConfigProvider>
  );
};

export default App;
