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
const AdminBuffaloRtpPage = lazy(() =>
  import("./admin/AdminBuffaloRtpPage").then((m) => ({ default: m.AdminBuffaloRtpPage }))
);
const AdminSizzlingRtpPage = lazy(() =>
  import("./admin/AdminSizzlingRtpPage").then((m) => ({ default: m.AdminSizzlingRtpPage }))
);
const AdminLifeOfLuxuryRtpPage = lazy(() =>
  import("./admin/AdminLifeOfLuxuryRtpPage").then((m) => ({ default: m.AdminLifeOfLuxuryRtpPage }))
);
const AdminShamrockRtpPage = lazy(() =>
  import("./admin/AdminShamrockRtpPage").then((m) => ({ default: m.AdminShamrockRtpPage }))
);
const AdminLiveFeedPage = lazy(() =>
  import("./admin/AdminLiveFeedPage").then((m) => ({ default: m.AdminLiveFeedPage }))
);

// Ported from a separate project (GameFun) — each brings its own full-bleed header/chrome, so
// they're excluded from the global Navbar below, same as /games/*.
const Home1Page = lazy(() => import("./pages/homepages/Home1/Home1Page").then((m) => ({ default: m.Home1Page })));
const Home2Page = lazy(() => import("./pages/homepages/Home2/Home2Page").then((m) => ({ default: m.Home2Page })));
const Home3Page = lazy(() => import("./pages/homepages/Home3/Home3Page").then((m) => ({ default: m.Home3Page })));

function AdminFallback() {
  return <div className="p-8 text-center text-slate-500">Loading admin panel...</div>;
}

function AppShell() {
  const location = useLocation();
  // "/" (HomePage) has its own complete chrome (Sidebar + TopBar, both already mobile-responsive
  // and already showing the same balance/account/logo Navbar would) — stacking Navbar on top of
  // that duplicated the balance pill and, since Navbar itself never wraps/shrinks, forced the
  // whole page wider than the viewport on narrow screens.
  const hideNavbar =
    location.pathname === "/" ||
    location.pathname.startsWith("/games/") ||
    ["/home1", "/home2", "/home3"].includes(location.pathname);

  return (
    <>
      {!hideNavbar && <Navbar />}
      <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/home1"
            element={
              <Suspense fallback={null}>
                <Home1Page />
              </Suspense>
            }
          />
          <Route
            path="/home2"
            element={
              <Suspense fallback={null}>
                <Home2Page />
              </Suspense>
            }
          />
          <Route
            path="/home3"
            element={
              <Suspense fallback={null}>
                <Home3Page />
              </Suspense>
            }
          />
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
              path="buffalo-rtp"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminBuffaloRtpPage />
                </Suspense>
              }
            />
            <Route
              path="sizzling-rtp"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminSizzlingRtpPage />
                </Suspense>
              }
            />
            <Route
              path="life-of-luxury-rtp"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminLifeOfLuxuryRtpPage />
                </Suspense>
              }
            />
            <Route
              path="shamrock-rtp"
              element={
                <Suspense fallback={<AdminFallback />}>
                  <AdminShamrockRtpPage />
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
