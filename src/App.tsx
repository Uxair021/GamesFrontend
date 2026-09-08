import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LandscapeGate } from "./components/LandscapeGate";
import { RequireAdmin } from "./components/RequireAdmin";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { UserPanelPage } from "./pages/UserPanelPage";
import { GamePage } from "./pages/GamePage";

const AdminLayout = lazy(() => import("./admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminOverviewPage = lazy(() =>
  import("./admin/AdminOverviewPage").then((m) => ({ default: m.AdminOverviewPage }))
);
const AdminEarningsPage = lazy(() =>
  import("./admin/AdminEarningsPage").then((m) => ({ default: m.AdminEarningsPage }))
);
const AdminUsersPage = lazy(() => import("./admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminPlayerDetailPage = lazy(() =>
  import("./admin/AdminPlayerDetailPage").then((m) => ({ default: m.AdminPlayerDetailPage }))
);
const AdminForceOutcomePage = lazy(() =>
  import("./admin/AdminForceOutcomePage").then((m) => ({ default: m.AdminForceOutcomePage }))
);
const AdminRtpPage = lazy(() => import("./admin/AdminRtpPage").then((m) => ({ default: m.AdminRtpPage })));
const AdminLiveFeedPage = lazy(() =>
  import("./admin/AdminLiveFeedPage").then((m) => ({ default: m.AdminLiveFeedPage }))
);

function AdminFallback() {
  return <div className="p-8 text-center text-slate-500">Loading admin panel...</div>;
}

function AppShell() {
  const location = useLocation();
  const hideNavbar = location.pathname.startsWith("/games/");

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/panel"
            element={
              <ProtectedRoute>
                <UserPanelPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/games/:slug"
            element={
              <ProtectedRoute>
                <LandscapeGate>
                  <GamePage />
                </LandscapeGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Suspense fallback={<AdminFallback />}>
                  <AdminLayout />
                </Suspense>
              </RequireAdmin>
            }
          >
            <Route
              index
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminOverviewPage />
                </Suspense>
              }
            />
            <Route
              path="earnings"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminEarningsPage />
                </Suspense>
              }
            />
            <Route
              path="users"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminUsersPage />
                </Suspense>
              }
            />
            <Route
              path="users/:id"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminPlayerDetailPage />
                </Suspense>
              }
            />
            <Route
              path="force-outcome"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminForceOutcomePage />
                </Suspense>
              }
            />
            <Route
              path="rtp"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminRtpPage />
                </Suspense>
              }
            />
            <Route
              path="live-feed"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminLiveFeedPage />
                </Suspense>
              }
            />
          </Route>
      </Routes>
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
