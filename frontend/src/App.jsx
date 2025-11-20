import React, {
  useState,
  useEffect,
  useMemo,
  createContext,
  useContext,
} from "react";
import axios from "axios";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { motion } from "framer-motion";

import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import StudentDashboard from "./components/student/StudentDashboard";
import TeacherDashboard from "./components/teacher/TeacherDashboard";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://ryw-studytime-check.onrender.com";

// ===== AUTH CONTEXT =====
export const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

// ===== SMALL UI COMPONENTS =====
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-slate-600 border-t-indigo-500 animate-spin" />
        <p className="text-sm text-slate-400">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  );
}

function AppShell({ children }) {
  const { currentUser, theme, setTheme, handleLogout } = useAuth();
  const location = useLocation();
  const isAuthPage =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/register");

  return (
    <div
      className={`min-h-screen relative ${
        theme === "dark"
          ? "bg-slate-950 text-slate-100"
          : "bg-slate-100 text-slate-900"
      } overflow-hidden`}
    >
      {/* animated background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className={`absolute -top-24 -left-24 h-64 w-64 rounded-full blur-3xl ${
            theme === "dark" ? "bg-indigo-500/40" : "bg-indigo-300/60"
          }`}
          animate={{ x: [-40, 30, -40], y: [0, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className={`absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full blur-3xl ${
            theme === "dark" ? "bg-purple-500/30" : "bg-blue-300/50"
          }`}
          animate={{ x: [30, -30, 30], y: [20, -10, 20] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {!isAuthPage && (
        <header className="border-b border-slate-800/60 bg-slate-900/80 text-slate-100 backdrop-blur sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 font-bold text-lg shadow-lg">
                AT
              </span>
              <div>
                <div className="font-semibold tracking-tight text-sm sm:text-base">
                  ระบบเช็คเวลาเรียน &amp; การลา
                </div>
                <div className="text-[11px] text-slate-400">
                  ขาดเรียนเกิน 20% ต่อวิชา = มส.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {currentUser && (
                <div className="hidden sm:flex flex-col items-end text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {currentUser.fullName || currentUser.username}
                    </span>
                    {currentUser.role === "teacher" && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 text-[10px]">
                        TEACHER
                      </span>
                    )}
                  </div>
                  <span className="text-slate-400">
                    ชั้น {currentUser.level} ห้อง {currentUser.room}
                  </span>
                </div>
              )}

              <button
                onClick={() =>
                  setTheme((t) => (t === "dark" ? "light" : "dark"))
                }
                className="rounded-full border border-slate-500/60 px-3 py-1 text-xs flex items-center gap-1 hover:bg-slate-800/80 transition-colors"
              >
                <span>{theme === "dark" ? "🌙" : "☀️"}</span>
                <span className="hidden sm:inline">
                  {theme === "dark" ? "Dark" : "Light"}
                </span>
              </button>

              {currentUser && (
                <button
                  onClick={handleLogout}
                  className="text-xs px-3 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                >
                  ออกจากระบบ
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6 relative z-10">
        {children}
      </main>
    </div>
  );
}

// ===== PROTECTED ROUTES =====
function ProtectedRoute({ children, role }) {
  const { token, currentUser, loadingMe } = useAuth();

  if (loadingMe) return <LoadingScreen />;

  if (!token) return <Navigate to="/login" replace />;

  if (role && currentUser?.role !== role) {
    if (currentUser?.role === "teacher") return <Navigate to="/teacher" replace />;
    return <Navigate to="/student/summary" replace />;
  }

  return children;
}

function RootRedirect() {
  const { token, currentUser, loadingMe } = useAuth();
  if (loadingMe) return <LoadingScreen />;
  if (!token) return <Navigate to="/login" replace />;
  if (currentUser?.role === "teacher") return <Navigate to="/teacher" replace />;
  return <Navigate to="/student/summary" replace />;
}

// ====================== //
//       MAIN APP         //
// ====================== //
export default function App() {
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "dark"
  );
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingMe, setLoadingMe] = useState(false);

  const api = useMemo(() => {
    if (!token) return null;
    return axios.create({
      baseURL: API_BASE_URL,
      headers: { Authorization: `Bearer ${token}` },
    });
  }, [token]);

  // sync theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // load me
  useEffect(() => {
    const loadMe = async () => {
      if (!token) {
        setCurrentUser(null);
        return;
      }
      try {
        setLoadingMe(true);
        const res = await axios.get(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUser(res.data.user);
      } catch (err) {
        console.error("auth/me error:", err);
        setCurrentUser(null);
        setToken("");
        localStorage.removeItem("token");
      } finally {
        setLoadingMe(false);
      }
    };
    loadMe();
  }, [token]);

  const handleLogin = async (username, password) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        username: username.trim(),
        password,
      });
      const tk = res.data.token;
      setToken(tk);
      localStorage.setItem("token", tk);
      setCurrentUser(res.data.user);
      return { ok: true, user: res.data.user };
    } catch (err) {
      console.error("login error:", err);
      const message =
        err.response?.data?.message || "เข้าสู่ระบบไม่สำเร็จ";
      return { ok: false, error: message };
    }
  };

  const handleLogout = () => {
    setToken("");
    setCurrentUser(null);
    localStorage.removeItem("token");
  };

  const authValue = {
    api,
    apiBaseUrl: API_BASE_URL,
    token,
    currentUser,
    setCurrentUser,
    loadingMe,
    theme,
    setTheme,
    handleLogin,
    handleLogout,
  };

  return (
    <AuthContext.Provider value={authValue}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route
              path="/student/*"
              element={
                <ProtectedRoute role="student">
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/*"
              element={
                <ProtectedRoute role="teacher">
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
