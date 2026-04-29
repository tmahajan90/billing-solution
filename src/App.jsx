import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { OfflineProvider } from "./context/OfflineContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import TablesPage from "./pages/TablesPage";
import POSPage from "./pages/POSPage";
import OrdersPage from "./pages/OrdersPage";

function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? <Navigate to="/" replace /> : children;
}

function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <OfflineProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<TablesPage />} />
              <Route path="tables" element={<TablesPage />} />
              <Route path="pos/new" element={<POSPage />} />
              <Route path="pos/:orderId" element={<POSPage />} />
              <Route path="orders" element={<OrdersPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OfflineProvider>
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
