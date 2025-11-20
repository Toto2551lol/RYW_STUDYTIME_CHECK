import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../App";

export default function LoginPage() {
  const { handleLogin, theme } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    const res = await handleLogin(form.username, form.password);
    setLoading(false);

    if (!res.ok) {
      setErrorMsg(res.error || "เข้าสู่ระบบไม่สำเร็จ");
      return;
    }

    if (res.user.role === "teacher") {
      navigate("/teacher", { replace: true });
    } else {
      navigate("/student/summary", { replace: true });
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center ${
        theme === "dark"
          ? "bg-slate-950 text-slate-100"
          : "bg-slate-100 text-slate-900"
      }`}
    >
      <div className="max-w-4xl w-full px-4 py-6 sm:py-10">
        <div className="grid md:grid-cols-2 gap-6 items-start">
          {/* Left info */}
          <motion.section
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-3xl border border-slate-800/50 bg-slate-900/90 text-slate-100 p-5 sm:p-6 shadow-2xl shadow-slate-950/70"
          >
            <h2 className="text-lg sm:text-xl font-semibold mb-3">
              ระบบเวลาการเรียน &amp; การลา – นักเรียน
            </h2>
            <ol className="text-xs sm:text-sm space-y-2 text-slate-200 list-decimal list-inside">
              <li>เข้าสู่ระบบเพื่อบันทึกวันลาและดูเวลาเรียน</li>
              <li>ระบบจะหักชั่วโมงเรียนตามตารางเรียนของวันนั้น</li>
              <li>ขาดเกิน 20% ในวิชาใดจะถูกมองว่า มส.</li>
              <li>ต้องทำการกรอกตารางเรียนเอง</li>
              <li>ในอนาคตจะให้upload ตารางเรียนได้ ตอนนี้ยังขกทำ</li>
              <li>หากมีปัญหาติดต่อ IG:toto._pop</li>
            </ol>
            <div className="mt-5 border-t border-slate-700/60 pt-3 text-[11px] text-slate-400">
              <p>
                 <span className="font-semibold"></span>
              </p>
              <p className="mt-1 font-mono">
                 <span className="text-emerald-300"></span>
                <br />
                 <span className="text-emerald-300"></span>
              </p>
            </div>
          </motion.section>

          {/* Right login card */}
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-3xl border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-5 sm:p-6 shadow-xl"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                เข้าสู่ระบบ
              </h2>
              <button
                onClick={() => navigate("/register")}
                className="text-[11px] sm:text-xs text-indigo-600 dark:text-indigo-300 hover:underline"
              >
                สมัครสมาชิก
              </button>
            </div>

            {errorMsg && (
              <div className="mb-3 rounded-xl border border-rose-500/60 bg-rose-500/10 text-rose-600 text-xs px-3 py-2">
                {errorMsg}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block mb-1 text-xs font-medium text-slate-500 dark:text-slate-300">
                  ชื่อผู้ใช้
                </label>
                <input
                  name="username"
                  value={form.username}
                  onChange={onChange}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                />
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium text-slate-500 dark:text-slate-300">
                  รหัสผ่าน
                </label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={onChange}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-sm font-medium shadow disabled:opacity-60"
              >
                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </form>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
