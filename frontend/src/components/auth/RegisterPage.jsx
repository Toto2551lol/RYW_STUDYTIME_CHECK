// src/components/auth/RegisterPage.jsx
import React, { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../App";

const TH_DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LEVEL_OPTIONS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

function buildEmptyTimetable() {
  const init = {};
  TH_DAYS.forEach((d) => {
    init[d] = {};
    PERIODS.forEach((p) => {
      init[d][p] = "";
    });
  });
  return init;
}

const formatSubjectLabel = (s) =>
  s ? `${s.code} • ${s.name}` : "— ไม่มีข้อมูล —";

export default function RegisterPage() {
  const { apiBaseUrl, handleLogin, theme } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
    level: "",
    room: "",
  });

  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [timetable, setTimetable] = useState(buildEmptyTimetable());

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubjectChange = (day, period, value) => {
    setTimetable((prev) => ({
      ...prev,
      [day]: { ...prev[day], [period]: value },
    }));
  };

  // ===========================
  // STEP 1 -> NEXT (โหลดวิชา + ตารางเรียนห้อง)
  // ===========================
  const handleStep1Submit = async (e) => {
    e.preventDefault();
    setGlobalError("");
    setGlobalSuccess("");

    const { username, password, confirmPassword, fullName, level, room } =
      form;

    if (!username || !password || !confirmPassword || !fullName) {
      setGlobalError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    if (!level) {
      setGlobalError("กรุณาเลือกระดับชั้น");
      return;
    }
    if (!room) {
      setGlobalError("กรุณากรอกห้อง เช่น 5/2");
      return;
    }
    if (password !== confirmPassword) {
      setGlobalError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    try {
      setLoading(true);

      // 1) โหลดรายชื่อวิชาจาก Excel
      const subRes = await axios.get(`${apiBaseUrl}/api/subjects`, {
        params: { level, room },
      });
      setAvailableSubjects(subRes.data || []);

      // 2) พยายามโหลด "ตารางเรียนระดับห้อง" ที่ครูตั้งไว้ (public endpoint)
      let grid = buildEmptyTimetable();
      try {
        const ttRes = await axios.get(
          `${apiBaseUrl}/api/public/classes/timetable`,
          {
            params: { level, room },
          }
        );

        (ttRes.data || []).forEach((t) => {
          if (grid[t.day] && grid[t.day][t.period] !== undefined) {
            grid[t.day][t.period] = t.subjectCode;
          }
        });

        setTimetable(grid);
        setGlobalSuccess(
          "โหลดรายชื่อวิชา + ตารางเรียนจากระดับห้องเรียบร้อย (สามารถแก้ไขได้)"
        );
      } catch (err) {
        console.warn("no class timetable for this room yet", err);
        // ถ้ายังไม่มี config ห้อง → ใช้ตารางว่างให้เด็กกรอกเอง
        setTimetable(buildEmptyTimetable());
        setGlobalSuccess(
          "โหลดรายชื่อวิชาเรียบร้อย (ยังไม่มีตารางเรียนระดับห้อง ให้กรอกตารางเอง)"
        );
      }

      setStep(2);
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message ||
          "ไม่สามารถโหลดรายชื่อวิชาได้ กรุณาตรวจสอบ backend"
      );
    } finally {
      setLoading(false);
    }
  };

  // ===========================
  // STEP 2 -> REGISTER
  // ===========================
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setGlobalError("");
    setGlobalSuccess("");

    let hasAny = false;
    for (const d of TH_DAYS) {
      for (const p of PERIODS) {
        if (timetable[d][p]) {
          hasAny = true;
          break;
        }
      }
      if (hasAny) break;
    }
    if (!hasAny) {
      setGlobalError(
        "กรุณาเลือกวิชาในตารางเรียนอย่างน้อย 1 คาบ (แนะนำให้กรอกให้ครบทั้ง 5 วัน)"
      );
      return;
    }

    try {
      setLoading(true);

      const timetableArray = [];
      TH_DAYS.forEach((day) => {
        PERIODS.forEach((p) => {
          const code = timetable[day][p];
          if (code) {
            timetableArray.push({ day, period: p, subjectCode: code });
          }
        });
      });

      // register
      await axios.post(`${apiBaseUrl}/api/auth/register`, {
        username: form.username,
        password: form.password,
        fullName: form.fullName,
        level: form.level,
        room: form.room,
        timetable: timetableArray,
      });

      setGlobalSuccess("สมัครสมาชิกสำเร็จ กำลังเข้าสู่ระบบ...");

      // auto login
      const loginRes = await handleLogin(form.username, form.password);
      if (loginRes.ok) {
        if (loginRes.user.role === "teacher") {
          navigate("/teacher", { replace: true });
        } else {
          navigate("/student/summary", { replace: true });
        }
      } else {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message || "สมัครสมาชิกไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
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
      <div className="w-full max-w-5xl px-4 py-6 sm:py-10">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <div>
            <h1 className="text-lg sm:text-2xl font-semibold">
              สมัครสมาชิกระบบเวลาเรียน & การลา
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              ผูกกับตารางเรียนจริงของนักเรียนในแต่ละห้อง
            </p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="text-xs sm:text-sm text-indigo-300 hover:text-indigo-200 underline"
          >
            มีบัญชีแล้ว? เข้าสู่ระบบ
          </button>
        </div>

        {globalError && (
          <div className="mb-3 rounded-xl border border-rose-500/60 bg-rose-500/10 text-rose-200 text-xs px-3 py-2">
            {globalError}
          </div>
        )}
        {globalSuccess && (
          <div className="mb-3 rounded-xl border border-emerald-500/60 bg-emerald-500/10 text-emerald-200 text-xs px-3 py-2">
            {globalSuccess}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 items-start">
          {/* LEFT INFO */}
          <motion.section
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-3xl border border-slate-800/60 bg-slate-900/90 p-5 sm:p-6 shadow-2xl shadow-slate-950/70"
          >
            <h2 className="text-base sm:text-lg font-semibold mb-3">
              ขั้นตอนการสมัคร
            </h2>
            <ol className="text-xs sm:text-sm space-y-2 text-slate-200 list-decimal list-inside">
              <li>กรอกข้อมูลบัญชี + ชั้น / ห้อง (Step 1)</li>
              <li>ระบบโหลดรายชื่อวิชาจากโครงสร้างรายวิชา (Excel)</li>
              <li>ระบบพยายามโหลดตารางเรียนจาก “ตารางเรียนระดับห้อง” ที่ครูตั้งไว้</li>
              <li>ถ้ายังไม่มี ครูตั้งไม่เสร็จ นักเรียนสามารถกรอกตารางเองใน Step 2 ได้</li>
            </ol>
            <div className="mt-4 border-t border-slate-700/60 pt-3 text-[11px] text-slate-400">
              <p>รองรับทั้งมือถือและคอมพิวเตอร์ — ฟอร์มจะจัดเรียงอัตโนมัติ</p>
            </div>

            {/* Step indicator */}
            <div className="mt-5 flex items-center gap-3 text-[11px] text-slate-200">
              <div
                className={`flex items-center gap-1 ${
                  step === 1 ? "text-indigo-400" : ""
                }`}
              >
                <span className="h-7 w-7 flex items-center justify-center rounded-full border border-current">
                  1
                </span>
                <span>บัญชี + ชั้น/ห้อง</span>
              </div>
              <div className="flex-1 h-px bg-slate-600" />
              <div
                className={`flex items-center gap-1 ${
                  step === 2 ? "text-indigo-400" : ""
                }`}
              >
                <span className="h-7 w-7 flex items-center justify-center rounded-full border border-current">
                  2
                </span>
                <span>ตารางเรียน 5 วัน</span>
              </div>
            </div>
          </motion.section>

          {/* RIGHT FORM */}
          <motion.section
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-3xl border border-slate-200/80 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-5 sm:p-6 shadow-xl"
          >
            {step === 1 ? (
              <form
                onSubmit={handleStep1Submit}
                className="space-y-4 text-xs sm:text-sm text-slate-800 dark:text-slate-100"
              >
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      ชื่อ – สกุล
                    </label>
                    <input
                      name="fullName"
                      value={form.fullName}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      ชื่อผู้ใช้
                    </label>
                    <input
                      name="username"
                      value={form.username}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      ระดับชั้น
                    </label>
                    <select
                      name="level"
                      value={form.level}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                    >
                      <option value="">-- เลือก --</option>
                      {LEVEL_OPTIONS.map((lv) => (
                        <option key={lv} value={lv}>
                          {lv}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      ห้อง (เช่น 5/2)
                    </label>
                    <input
                      name="room"
                      value={form.room}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      รหัสผ่าน
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                      ยืนยันรหัสผ่าน
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-xs sm:text-sm font-medium shadow disabled:opacity-60"
                >
                  {loading ? "กำลังโหลดรายชื่อวิชา..." : "ถัดไป: กรอกตารางเรียน"}
                </button>
              </form>
            ) : (
              <form
                onSubmit={handleRegisterSubmit}
                className="space-y-3 text-xs sm:text-sm text-slate-800 dark:text-slate-100"
              >
                <p className="text-[11px] text-slate-500 dark:text-slate-300">
                  ระดับชั้น{" "}
                  <span className="font-semibold">{form.level}</span> ห้อง{" "}
                  <span className="font-semibold">{form.room}</span>{" "}
                  – รายวิชาที่เลือกได้มาจากโครงสร้างรายวิชาตามหลักสูตรของห้องนี้
                </p>

                {availableSubjects.length === 0 ? (
                  <div className="text-[11px] text-rose-500">
                    ไม่พบรายชื่อวิชาจาก backend สำหรับระดับชั้นนี้
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-[10px] sm:text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left">วัน / คาบ</th>
                          {PERIODS.map((p) => (
                            <th key={p} className="px-2 py-2 text-center">
                              {p}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {TH_DAYS.map((day) => (
                          <tr
                            key={day}
                            className="border-t border-slate-200 dark:border-slate-700"
                          >
                            <td className="px-2 py-2 font-medium whitespace-nowrap">
                              {day}
                            </td>
                            {PERIODS.map((p) => (
                              <td key={p} className="px-1 py-1">
                                <select
                                  value={timetable[day][p]}
                                  onChange={(e) =>
                                    handleSubjectChange(day, p, e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 px-1 py-0.5 text-[10px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/70"
                                >
                                  <option value="">— ไม่มีเรียน —</option>
                                  {availableSubjects.map((s) => (
                                    <option key={s.code} value={s.code}>
                                      {formatSubjectLabel(s)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-[11px] sm:text-xs"
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-medium shadow disabled:opacity-60"
                  >
                    {loading ? "กำลังสมัคร..." : "สมัคร + บันทึกตารางเรียน"}
                  </button>
                </div>
              </form>
            )}
          </motion.section>
        </div>
      </div>
    </div>
  );
}
