import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../../App";
import StudentMenuCards from "./StudentMenuCards";

const TH_DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

export default function StudentDashboard() {
  const { api, currentUser, setCurrentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState("summary");

  const [summary, setSummary] = useState(null);
  const [absenceHistory, setAbsenceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [absenceDate, setAbsenceDate] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceSaving, setAbsenceSaving] = useState(false);

  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [profileTimetable, setProfileTimetable] = useState(
    buildEmptyTimetable()
  );
  const [profileInitialLoaded, setProfileInitialLoaded] = useState(false);

  const [profileForm, setProfileForm] = useState({
    fullName: "",
    level: "",
    room: "",
  });

  const [savingProfile, setSavingProfile] = useState(false);

  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");

  // ===== TAB <-> URL SYNC =====
  useEffect(() => {
    if (location.pathname.includes("/student/absence")) {
      setActiveTab("absence");
    } else if (location.pathname.includes("/student/profile")) {
      setActiveTab("profile");
    } else {
      setActiveTab("summary");
    }
  }, [location.pathname]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    navigate(`/student/${tab}`);
  };

  // ===== API LOADERS =====
  const fetchSummary = async () => {
    if (!api) return;
    try {
      const res = await api.get("/api/summary");
      setSummary(res.data);
    } catch (err) {
      console.error("summary error:", err);
    }
  };

  const fetchAbsenceHistory = async () => {
    if (!api) return;
    try {
      setHistoryLoading(true);
      const res = await api.get("/api/absences/dates");
      setAbsenceHistory(res.data || []);
    } catch (err) {
      console.error("absence dates error:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!api || !currentUser) return;
    fetchSummary();
    fetchAbsenceHistory();
    setProfileForm({
      fullName: currentUser.fullName || "",
      level: currentUser.level || "",
      room: currentUser.room || "",
    });
  }, [api, currentUser]);

  // ===== AUTO LOAD PROFILE TIMETABLE (personal -> class) =====
  useEffect(() => {
    if (!api || !currentUser || profileInitialLoaded) return;

    const loadProfileTimetable = async () => {
      try {
        const subRes = await api.get("/api/subjects", {
          params: { level: currentUser.level, room: currentUser.room },
        });
        setAvailableSubjects(subRes.data || []);

        let grid = buildEmptyTimetable();
        let hasPersonal = false;

        // 1) ตารางส่วนตัว
        try {
          const ttRes = await api.get("/api/me/timetable");
          if (Array.isArray(ttRes.data) && ttRes.data.length) {
            ttRes.data.forEach((t) => {
              if (grid[t.day] && grid[t.day][t.period] !== undefined) {
                grid[t.day][t.period] = t.subjectCode;
              }
            });
            hasPersonal = true;
          }
        } catch (err) {
          if (err.response?.status !== 404) {
            console.error("my timetable error:", err);
          }
        }

        // 2) ถ้าไม่มี timetable ส่วนตัว -> ใช้ timetable ห้อง
        if (!hasPersonal) {
          const clsRes = await api.get("/api/classes/timetable", {
            params: {
              level: currentUser.level,
              room: currentUser.room,
            },
          });
          clsRes.data.forEach((t) => {
            if (grid[t.day] && grid[t.day][t.period] !== undefined) {
              grid[t.day][t.period] = t.subjectCode;
            }
          });
        }

        setProfileTimetable(grid);
      } catch (err) {
        console.error("auto profile timetable error:", err);
      } finally {
        setProfileInitialLoaded(true);
      }
    };

    loadProfileTimetable();
  }, [api, currentUser, profileInitialLoaded]);

  // ===== ABSENCE HANDLERS =====
  const handleAbsenceSubmit = async (e) => {
    e.preventDefault();
    setGlobalError("");
    setGlobalSuccess("");

    if (!absenceDate) {
      setGlobalError("กรุณาเลือกวันที่ลา");
      return;
    }

    const already = absenceHistory.some((h) => h.date === absenceDate);
    if (already) {
      setGlobalError("วันนี้ถูกบันทึกไปแล้ว");
      return;
    }

    try {
      setAbsenceSaving(true);
      await api.post("/api/absences", {
        date: absenceDate,
        reason: absenceReason || "",
      });

      setAbsenceDate("");
      setAbsenceReason("");
      setGlobalSuccess("บันทึกการลาสำเร็จ");

      await fetchSummary();
      await fetchAbsenceHistory();
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message || "บันทึกการลาไม่สำเร็จ"
      );
    } finally {
      setAbsenceSaving(false);
    }
  };

  const handleDeleteAbsenceDate = async (dateStr) => {
    const ok = window.confirm(`ยืนยันการลบวันลา ${dateStr} ?`);
    if (!ok) return;
    setGlobalError("");
    setGlobalSuccess("");
    try {
      await api.delete(`/api/absences/${dateStr}`);
      setGlobalSuccess(`ลบข้อมูลการลาของวันที่ ${dateStr} แล้ว`);
      await fetchAbsenceHistory();
      await fetchSummary();
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message || "ไม่สามารถลบข้อมูลการลาได้"
      );
    }
  };

  const handleDeleteAllAbsences = async () => {
    const ok = window.confirm("ยืนยันลบวันลาทั้งหมดของคุณหรือไม่?");
    if (!ok) return;
    setGlobalError("");
    setGlobalSuccess("");
    try {
      await api.delete("/api/absences");
      setGlobalSuccess("ลบวันลาทั้งหมดเรียบร้อย");
      await fetchAbsenceHistory();
      await fetchSummary();
    } catch (err) {
      console.error(err);
      setGlobalError("ไม่สามารถลบวันลาทั้งหมดได้");
    }
  };

  // ===== PROFILE HANDLERS =====
  const handleProfileFormChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((f) => ({ ...f, [name]: value }));
  };

  const handleProfileSubjectChange = (day, period, value) => {
    setProfileTimetable((prev) => ({
      ...prev,
      [day]: { ...prev[day], [period]: value },
    }));
  };

  const handleProfileLoadClassTimetable = async () => {
    if (!api) return;
    setGlobalError("");
    setGlobalSuccess("");
    try {
      const resSubjects = await api.get("/api/subjects", {
        params: {
          level: profileForm.level,
          room: profileForm.room,
        },
      });
      setAvailableSubjects(resSubjects.data || []);

      const res = await api.get("/api/classes/timetable", {
        params: {
          level: profileForm.level,
          room: profileForm.room,
        },
      });

      const grid = buildEmptyTimetable();
      res.data.forEach((t) => {
        if (grid[t.day] && grid[t.day][t.period] !== undefined) {
          grid[t.day][t.period] = t.subjectCode;
        }
      });
      setProfileTimetable(grid);
      setGlobalSuccess("โหลดตารางเรียนจากระดับห้องเรียบร้อย");
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message ||
          "ไม่สามารถโหลดตารางเรียนระดับห้องได้"
      );
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!api) return;
    setGlobalError("");
    setGlobalSuccess("");

    try {
      setSavingProfile(true);

      const timetableArray = [];
      TH_DAYS.forEach((day) => {
        PERIODS.forEach((p) => {
          const code = profileTimetable[day][p];
          if (code) {
            timetableArray.push({ day, period: p, subjectCode: code });
          }
        });
      });

      const res = await api.put("/api/me/profile", {
        fullName: profileForm.fullName,
        level: profileForm.level,
        room: profileForm.room,
        timetable: timetableArray,
      });

      setCurrentUser(res.data.user);
      setGlobalSuccess("อัปเดตโปรไฟล์และตารางเรียนสำเร็จ");
      await fetchSummary();
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message || "อัปเดตโปรไฟล์ไม่สำเร็จ"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // ===== SUMMARY CALC =====
  const totalAbsencePercent = summary?.totalPercentAbsent || 0;

  const studentTotals = useMemo(() => {
    if (!summary || !Array.isArray(summary.subjects)) {
      return {
        subjectCount: 0,
        totalHours: 0,
        totalAbsent: 0,
        totalCredits: 0,
      };
    }
    let totalHours = 0;
    let totalAbsent = 0;
    let totalCredits = 0;
    summary.subjects.forEach((s) => {
      totalHours += s.totalHours || 0;
      totalAbsent += s.absentHours || 0;
      totalCredits += s.credits || 0;
    });
    return {
      subjectCount: summary.subjects.length,
      totalHours,
      totalAbsent,
      totalCredits,
    };
  }, [summary]);

  if (!api || !currentUser) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-400 text-sm">
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Global alert */}
      {(globalError || globalSuccess) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs sm:text-sm shadow ${
            globalError
              ? "border-rose-500/70 bg-rose-500/10 text-rose-100"
              : "border-emerald-500/70 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {globalError || globalSuccess}
        </div>
      )}

            {/* TOP SECTION – cards + tabs bar */}
      <section className="space-y-3 sm:space-y-4">
        {/* สรุปการ์ดด้านบน (เหลือ 2 ใบ) */}
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {/* card 1 – percent */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl sm:rounded-3xl border border-slate-800/60 bg-slate-900/90 text-slate-50 p-4 sm:p-5 shadow-2xl shadow-slate-950/70"
          >
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-xs uppercase tracking-wide text-slate-400">
                สถานะเวลาเรียนรวม
              </span>
              <span className="text-xl sm:text-2xl">
                {totalAbsencePercent > 20 ? "⚠️" : "✅"}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-semibold mb-1">
              {totalAbsencePercent.toFixed(1)}%
            </div>
            <p className="text-[11px] sm:text-xs text-slate-300">
              ถ้าขาดเกิน{" "}
              <span className="font-semibold text-rose-300">20%</span> ของเวลา
              วิชานั้นจะถูกระบุว่า{" "}
              <span className="font-semibold text-rose-300">มส.</span>
            </p>
          </motion.div>

          {/* card 2 – totals */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-4 sm:p-5 shadow flex flex-col justify-between"
          >
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-300 mb-2">
              ชั้น{" "}
              <span className="font-semibold">{currentUser.level}</span> ห้อง{" "}
              <span className="font-semibold">{currentUser.room}</span>
            </div>
            <div className="text-xs sm:text-sm space-y-1.5 text-slate-800 dark:text-slate-100">
              <div className="flex justify-between">
                <span>จำนวนวิชาในระบบ</span>
                <span className="font-semibold">
                  {studentTotals.subjectCount} วิชา
                </span>
              </div>
              <div className="flex justify-between">
                <span>ชั่วโมงเรียนทั้งหมด</span>
                <span className="font-semibold">
                  {studentTotals.totalHours} ชม.
                </span>
              </div>
              <div className="flex justify-between">
                <span>ขาดเรียนสะสม</span>
                <span className="font-semibold text-rose-500">
                  {studentTotals.totalAbsent} ชม.
                </span>
              </div>
              {studentTotals.totalCredits > 0 && (
                <div className="flex justify-between">
                  <span>หน่วยกิตรวม</span>
                  <span className="font-semibold">
                    {studentTotals.totalCredits} หน่วยกิต
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* BAR เมนูโหมดการทำงาน */}
        <div className="mt-1">
          <StudentMenuCards activeTab={activeTab} onChange={handleTabChange} />
        </div>
      </section>


      {/* ===== TAB CONTENTS ===== */}

      {/* SUMMARY TAB */}
      {activeTab === "summary" && (
        <section className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-4 sm:p-5 shadow">
          <h2 className="text-sm sm:text-base font-semibold mb-3 text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-2">
            📚 สรุปเวลาเรียนรายวิชา
            <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
              (ข้อมูลจากโครงสร้างรายวิชา + การลาที่คุณบันทึก)
            </span>
          </h2>

          {summary && summary.subjects && summary.subjects.length ? (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="min-w-[720px] md:min-w-full text-[11px] sm:text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100">
                    <th className="px-3 py-2 text-left">รหัสวิชา</th>
                    <th className="px-3 py-2 text-left">ชื่อวิชา</th>
                    <th className="px-3 py-2 text-center">หน่วยกิต</th>
                    <th className="px-3 py-2 text-center">ชั่วโมงทั้งหมด</th>
                    <th className="px-3 py-2 text-center">ขาดเรียน (ชม.)</th>
                    <th className="px-3 py-2 text-center">% ขาด</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.subjects.map((s) => (
                    <tr
                      key={s.code}
                      className="border-t border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    >
                      <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                        {s.code}
                      </td>
                      <td className="px-3 py-1.5">{s.name}</td>
                      <td className="px-3 py-1.5 text-center">
                        {s.credits ?? "-"}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {s.totalHours}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {s.absentHours}
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        {s.percentAbsent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {s.percentAbsent > 20 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 text-[10px]">
                            มส.
                          </span>
                        ) : s.percentAbsent > 10 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px]">
                            เสี่ยง
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px]">
                            ผ่าน
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-300">
              ยังไม่มีข้อมูลสรุปเวลาเรียน ลองบันทึกการลาดูก่อน
            </div>
          )}
        </section>
      )}

      {/* ABSENCE TAB */}
      {activeTab === "absence" && (
        <section className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-4 sm:p-5 shadow">
          <h2 className="text-sm sm:text-base font-semibold mb-3 text-slate-800 dark:text-slate-100 flex items-center gap-2">
            🗓️ บันทึกการลา
          </h2>

          {/* form */}
          <form
            onSubmit={handleAbsenceSubmit}
            className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-slate-800 dark:text-slate-100"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  วันที่ลา
                </label>
                <input
                  type="date"
                  value={absenceDate}
                  onChange={(e) => setAbsenceDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  เหตุผล (ไม่บังคับ)
                </label>
                <textarea
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
                  placeholder="ป่วย, ติดธุระ, แข่งขัน, ฯลฯ"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={absenceSaving}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs sm:text-sm font-medium shadow disabled:opacity-60"
            >
              {absenceSaving ? "กำลังบันทึก..." : "บันทึกการลา"}
            </button>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              ระบบจะดูตารางเรียนของวันนั้นแล้วตัดชั่วโมงเรียนออกให้โดยอัตโนมัติ
            </p>
          </form>

          {/* summary + list */}
          <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-100">
                สรุปวันลา
              </h3>
              {absenceHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAllAbsences}
                  className="text-[10px] sm:text-[11px] px-3 py-1 rounded-full border border-rose-500 text-rose-500 hover:bg-rose-500/10"
                >
                  ลบทั้งหมด
                </button>
              )}
            </div>

            {historyLoading ? (
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-300">
                กำลังโหลด...
              </div>
            ) : absenceHistory.length === 0 ? (
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-300">
                ยังไม่มีการบันทึกวันลา
              </div>
            ) : (
              <>
                {/* summary cards */}
                <div className="grid grid-cols-2 gap-3 mb-3 text-[11px] sm:text-xs">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
                    <div className="text-slate-500 dark:text-slate-300">
                      จำนวนวันลา
                    </div>
                    <div className="text-lg sm:text-xl font-semibold">
                      {absenceHistory.length} วัน
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
                    <div className="text-slate-500 dark:text-slate-300">
                      ชั่วโมงเรียนที่หายไป
                    </div>
                    <div className="text-lg sm:text-xl font-semibold">
                      {absenceHistory.reduce(
                        (sum, x) => sum + (x.totalHours || 0),
                        0
                      )}{" "}
                      ชม.
                    </div>
                  </div>
                </div>

                {/* list */}
                <ul className="space-y-2 text-[11px] sm:text-xs text-slate-800 dark:text-slate-100">
                  {absenceHistory.map((item) => (
                    <li
                      key={item.date}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"
                    >
                      <div>
                        <div className="font-medium">{item.date}</div>
                        <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                          ขาดเรียน {item.totalHours} ชม. ในวันนั้น
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteAbsenceDate(item.date)}
                          className="text-[10px] sm:text-[11px] px-3 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white"
                        >
                          ลบวันนี้
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      {/* PROFILE TAB */}
      {activeTab === "profile" && (
        <section className="rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-4 sm:p-5 shadow">
          <h2 className="text-sm sm:text-base font-semibold mb-4 text-slate-800 dark:text-slate-100 flex items-center gap-2">
            👤 โปรไฟล์ และตารางเรียนของฉัน
          </h2>
          <form
            onSubmit={handleProfileSave}
            className="space-y-4 text-xs sm:text-sm text-slate-800 dark:text-slate-100"
          >
            <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="sm:col-span-2">
                <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  ชื่อ – สกุล
                </label>
                <input
                  name="fullName"
                  value={profileForm.fullName}
                  onChange={handleProfileFormChange}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/70"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  ระดับชั้น
                </label>
                <input
                  name="level"
                  value={profileForm.level}
                  onChange={handleProfileFormChange}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/70"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">
                  ห้อง
                </label>
                <input
                  name="room"
                  value={profileForm.room}
                  onChange={handleProfileFormChange}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/70"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-300">
              <span>
                รายวิชาที่ใช้ในตารางเรียนจะดึงจากโครงสร้างรายวิชาของ{" "}
                {profileForm.level || "…"} ห้อง {profileForm.room || "…"}
              </span>
              <button
                type="button"
                onClick={handleProfileLoadClassTimetable}
                className="px-3 py-1 rounded-full border border-slate-300 dark:border-slate-600 text-[10px] sm:text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                โหลดจากตารางเรียนระดับห้อง (อาจารย์กำหนด)
              </button>
            </div>

            {/* timetable */}
            <div className="max-h-80 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 -mx-2 sm:mx-0">
              <table className="min-w-[720px] md:min-w-full text-[11px] sm:text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">วัน / คาบ</th>
                    {PERIODS.map((p) => (
                      <th key={p} className="px-3 py-2 text-center">
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
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {day}
                      </td>
                      {PERIODS.map((p) => (
                        <td key={p} className="px-2 py-1.5">
                          <select
                            value={profileTimetable[day][p]}
                            onChange={(e) =>
                              handleProfileSubjectChange(
                                day,
                                p,
                                e.target.value
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 px-2 py-1 text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-slate-500/70"
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

            <button
              type="submit"
              disabled={savingProfile}
              className="mt-1 sm:mt-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white px-4 sm:px-5 py-2 text-xs sm:text-sm font-medium shadow disabled:opacity-60"
            >
              {savingProfile ? "กำลังบันทึก..." : "บันทึกโปรไฟล์ / ตารางเรียน"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
