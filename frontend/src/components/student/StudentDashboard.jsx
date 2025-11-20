// src/components/student/StudentDashboard.jsx
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
  const [profileTimetable, setProfileTimetable] = useState(buildEmptyTimetable());
  const [profileInitialLoaded, setProfileInitialLoaded] = useState(false);

  const [profileForm, setProfileForm] = useState({
    fullName: "",
    level: "",
    room: "",
  });

  const [savingProfile, setSavingProfile] = useState(false);

  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");

  // ===========================================
  // TAB SELECTION + URL SYNC
  // ===========================================
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

  // ===========================================
  // LOAD SUMMARY + ABSENCE HISTORY
  // ===========================================
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
      fullName: currentUser.fullName,
      level: currentUser.level,
      room: currentUser.room,
    });
  }, [api, currentUser]);

  // ===========================================
  // AUTO LOAD TIMETABLE (personal → class)
  // ===========================================
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

        // personal timetable
        try {
          const ttRes = await api.get("/api/me/timetable");
          if (Array.isArray(ttRes.data) && ttRes.data.length) {
            ttRes.data.forEach((t) => {
              if (grid[t.day]?.[t.period] !== undefined) {
                grid[t.day][t.period] = t.subjectCode;
              }
            });
            hasPersonal = true;
          }
        } catch (err) {
          if (err.response?.status !== 404) console.error(err);
        }

        // class timetable fallback
        if (!hasPersonal) {
          const cls = await api.get("/api/classes/timetable", {
            params: {
              level: currentUser.level,
              room: currentUser.room,
            },
          });
          cls.data.forEach((t) => {
            if (grid[t.day]?.[t.period] !== undefined) {
              grid[t.day][t.period] = t.subjectCode;
            }
          });
        }

        setProfileTimetable(grid);
      } catch (err) {
        console.error("auto timetable error:", err);
      } finally {
        setProfileInitialLoaded(true);
      }
    };

    loadProfileTimetable();
  }, [api, currentUser, profileInitialLoaded]);

  // ===========================================
  // ABSENCE HANDLERS
  // ===========================================
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

      await fetchAbsenceHistory();
      await fetchSummary();
    } catch (err) {
      setGlobalError(err.response?.data?.message || "บันทึกผิดพลาด");
    } finally {
      setAbsenceSaving(false);
    }
  };

  const handleDeleteAbsenceDate = async (dateStr) => {
    if (!window.confirm(`ลบวันลา ${dateStr}?`)) return;

    try {
      await api.delete(`/api/absences/${dateStr}`);
      await fetchAbsenceHistory();
      await fetchSummary();
      setGlobalSuccess(`ลบแล้ว: ${dateStr}`);
    } catch (err) {
      setGlobalError(err.response?.data?.message || "ลบไม่สำเร็จ");
    }
  };

  const handleDeleteAllAbsences = async () => {
    if (!window.confirm("ยืนยันลบวันลาทั้งหมด?")) return;
    try {
      await api.delete("/api/absences");
      await fetchAbsenceHistory();
      await fetchSummary();
      setGlobalSuccess("ลบวันลาทั้งหมดเรียบร้อย");
    } catch (err) {
      setGlobalError("ลบวันลาทั้งหมดไม่สำเร็จ");
    }
  };

  // ===========================================
  // PROFILE HANDLERS
  // ===========================================
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
    try {
      const subs = await api.get("/api/subjects", {
        params: {
          level: profileForm.level,
          room: profileForm.room,
        },
      });
      setAvailableSubjects(subs.data || []);

      const res = await api.get("/api/classes/timetable", {
        params: {
          level: profileForm.level,
          room: profileForm.room,
        },
      });

      const grid = buildEmptyTimetable();
      res.data.forEach((t) => {
        if (grid[t.day]?.[t.period] !== undefined) {
          grid[t.day][t.period] = t.subjectCode;
        }
      });

      setProfileTimetable(grid);
      setGlobalSuccess("โหลดตารางเรียนจากห้องสำเร็จ");
    } catch (err) {
      setGlobalError("โหลดตารางเรียนไม่สำเร็จ");
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setGlobalError("");
    setGlobalSuccess("");

    try {
      setSavingProfile(true);

      const timetableArray = [];
      TH_DAYS.forEach((day) => {
        PERIODS.forEach((p) => {
          const code = profileTimetable[day][p];
          if (code) timetableArray.push({ day, period: p, subjectCode: code });
        });
      });

      const res = await api.put("/api/me/profile", {
        fullName: profileForm.fullName,
        level: profileForm.level,
        room: profileForm.room,
        timetable: timetableArray,
      });

      setCurrentUser(res.data.user);
      setGlobalSuccess("บันทึกโปรไฟล์สำเร็จ");
      await fetchSummary();
    } catch (err) {
      setGlobalError(
        err.response?.data?.message || "บันทึกโปรไฟล์ไม่สำเร็จ"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // ===========================================
  // SUMMARY DATA CALC
  // ===========================================
  const studentTotals = useMemo(() => {
    if (!summary?.subjects) {
      return { subjectCount: 0, totalHours: 0, totalAbsent: 0, totalCredits: 0 };
    }

    let hours = 0,
      absent = 0,
      credits = 0;

    summary.subjects.forEach((s) => {
      hours += s.totalHours || 0;
      absent += s.absentHours || 0;
      credits += s.credits || 0;
    });

    return {
      subjectCount: summary.subjects.length,
      totalHours: hours,
      totalAbsent: absent,
      totalCredits: credits,
    };
  }, [summary]);

  const totalAbsencePercent = summary?.totalPercentAbsent || 0;

  if (!api || !currentUser)
    return <div className="text-center text-slate-300">กำลังโหลด…</div>;

  // ===========================================
  // RENDER UI
  // ===========================================
  return (
    <div className="space-y-5">
      {/* GLOBAL ALERT */}
      {(globalError || globalSuccess) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm shadow ${
            globalError
              ? "border-rose-500 bg-rose-500/20 text-rose-200"
              : "border-emerald-500 bg-emerald-500/20 text-emerald-200"
          }`}
        >
          {globalError || globalSuccess}
        </div>
      )}

      {/* TOP CARDS + NAVIGATION BAR */}
      <section className="space-y-4">
        {/* Cards */}
        <div className="grid gap-3 md:grid-cols-2">
          {/* % Status */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-800 bg-slate-900 text-white p-5 shadow-xl"
          >
            <div className="flex justify-between">
              <div className="text-sm text-slate-400">สถานะเวลาเรียนรวม</div>
              <div className="text-xl">{totalAbsencePercent > 20 ? "⚠️" : "✅"}</div>
            </div>
            <div className="text-3xl font-bold mt-2">
              {totalAbsencePercent.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-300 mt-1">
              หากขาดเกิน <span className="text-rose-300 font-semibold">20%</span>{" "}
              ระบบจะระบุเป็น{" "}
              <span className="text-rose-300 font-semibold">มส.</span>
            </p>
          </motion.div>

          {/* total summary */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 p-5 shadow"
          >
            <div className="text-xs text-slate-500 dark:text-slate-300">
              ชั้น {currentUser.level} ห้อง {currentUser.room}
            </div>

            <div className="mt-2 space-y-1 text-sm dark:text-slate-100">
              <div className="flex justify-between">
                <span>จำนวนวิชา</span>
                <span className="font-semibold">
                  {studentTotals.subjectCount} วิชา
                </span>
              </div>
              <div className="flex justify-between">
                <span>ชั่วโมงทั้งหมด</span>
                <span className="font-semibold">
                  {studentTotals.totalHours} ชม.
                </span>
              </div>
              <div className="flex justify-between">
                <span>ขาดเรียนสะสม</span>
                <span className="font-semibold text-rose-400">
                  {studentTotals.totalAbsent} ชม.
                </span>
              </div>
              <div className="flex justify-between">
                <span>หน่วยกิตรวม</span>
                <span className="font-semibold">
                  {studentTotals.totalCredits}
                </span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* NAVIGATION BAR */}
        <StudentMenuCards activeTab={activeTab} onChange={handleTabChange} />
      </section>

      {/* SUMMARY TAB */}
      {activeTab === "summary" && (
        <section className="rounded-2xl border border-slate-300 dark:border-slate-700 p-5 bg-white dark:bg-slate-900 shadow">
          <h2 className="text-lg font-semibold mb-4">📚 รายวิชา & เวลาเรียน</h2>

          {summary?.subjects?.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2">รหัส</th>
                    <th className="px-3 py-2 text-left">ชื่อวิชา</th>
                    <th className="px-3 py-2">หน่วยกิต</th>
                    <th className="px-3 py-2">ชั่วโมงรวม</th>
                    <th className="px-3 py-2">ขาด</th>
                    <th className="px-3 py-2">% ขาด</th>
                    <th className="px-3 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.subjects.map((s) => (
                    <tr key={s.code} className="border-t dark:border-slate-700">
                      <td className="px-3 py-1 font-mono text-center">{s.code}</td>
                      <td className="px-3 py-1">{s.name}</td>
                      <td className="px-3 py-1 text-center">{s.credits}</td>
                      <td className="px-3 py-1 text-center">{s.totalHours}</td>
                      <td className="px-3 py-1 text-center">{s.absentHours}</td>
                      <td className="px-3 py-1 text-center">
                        {s.percentAbsent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-1 text-center">
                        {s.percentAbsent > 20 ? (
                          <span className="text-rose-400 font-semibold">มส.</span>
                        ) : s.percentAbsent > 10 ? (
                          <span className="text-amber-400 font-semibold">เสี่ยง</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">ผ่าน</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-slate-500 dark:text-slate-300">
              ยังไม่มีข้อมูลรายวิชา
            </div>
          )}
        </section>
      )}

      {/* ABSENCE TAB */}
      {activeTab === "absence" && (
        <section className="rounded-2xl border border-slate-300 dark:border-slate-700 p-5 bg-white dark:bg-slate-900 shadow">
          <h2 className="text-lg font-semibold mb-4">🗓️ บันทึกการลา</h2>

          <form onSubmit={handleAbsenceSubmit} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">วันที่ลา</label>
                <input
                  type="date"
                  value={absenceDate}
                  onChange={(e) => setAbsenceDate(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 bg-transparent"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500">เหตุผล (ไม่บังคับ)</label>
                <textarea
                  value={absenceReason}
                  onChange={(e) => setAbsenceReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 bg-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={absenceSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow"
            >
              {absenceSaving ? "กำลังบันทึก…" : "บันทึกการลา"}
            </button>
          </form>

          {/* Absence Summary */}
          <div className="mt-6">
            <div className="flex justify-between">
              <h3 className="text-sm font-semibold">สรุปวันลา</h3>

              {absenceHistory.length > 0 && (
                <button
                  onClick={handleDeleteAllAbsences}
                  className="px-3 py-1 text-xs border border-rose-400 text-rose-400 rounded-full hover:bg-rose-400/20"
                >
                  ลบทั้งหมด
                </button>
              )}
            </div>

            {absenceHistory.length === 0 ? (
              <div className="text-slate-500 text-sm mt-2">
                ยังไม่มีบันทึกการลา
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {absenceHistory.map((item) => (
                  <li
                    key={item.date}
                    className="border p-3 rounded-lg flex justify-between dark:border-slate-700"
                  >
                    <div>
                      <div className="font-medium">{item.date}</div>
                      <div className="text-xs text-slate-500">
                        ขาด {item.totalHours} ชม.
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteAbsenceDate(item.date)}
                      className="px-3 py-1 text-xs bg-rose-600 hover:bg-rose-700 rounded-lg text-white"
                    >
                      ลบ
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* PROFILE TAB */}
      {activeTab === "profile" && (
        <section className="rounded-2xl border border-slate-300 dark:border-slate-700 p-5 bg-white dark:bg-slate-900 shadow">
          <h2 className="text-lg font-semibold mb-4">👤 โปรไฟล์ + ตารางเรียน</h2>

          <form onSubmit={handleProfileSave} className="space-y-4">
            {/* PROFILE INFO */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500">ชื่อ – สกุล</label>
                <input
                  name="fullName"
                  value={profileForm.fullName}
                  onChange={handleProfileFormChange}
                  className="w-full rounded-lg border px-3 py-2 bg-transparent"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500">ระดับชั้น</label>
                <input
                  name="level"
                  value={profileForm.level}
                  onChange={handleProfileFormChange}
                  className="w-full rounded-lg border px-3 py-2 bg-transparent"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500">ห้อง</label>
                <input
                  name="room"
                  value={profileForm.room}
                  onChange={handleProfileFormChange}
                  className="w-full rounded-lg border px-3 py-2 bg-transparent"
                />
              </div>
            </div>

            {/* LOAD CLASS TIMETABLE BUTTON */}
            <button
              type="button"
              onClick={handleProfileLoadClassTimetable}
              className="px-4 py-2 text-xs border border-slate-600 rounded-lg hover:bg-slate-800"
            >
              โหลดตารางเรียนจากห้องเรียน
            </button>

            {/* TIMETABLE */}
            <div className="overflow-x-auto border rounded-xl p-2 max-h-80">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-800 text-white sticky top-0 text-xs">
                  <tr>
                    <th className="px-2 py-2">วัน/คาบ</th>
                    {PERIODS.map((p) => (
                      <th key={p} className="px-2 py-2 text-center">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TH_DAYS.map((day) => (
                    <tr key={day}>
                      <td className="px-2 py-2 font-medium whitespace-nowrap">
                        {day}
                      </td>
                      {PERIODS.map((p) => (
                        <td key={p} className="px-2 py-1">
                          <select
                            value={profileTimetable[day][p]}
                            onChange={(e) =>
                              handleProfileSubjectChange(day, p, e.target.value)
                            }
                            className="w-full rounded border bg-slate-900 text-white text-xs px-1 py-1"
                          >
                            <option value="">—</option>
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
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg"
            >
              {savingProfile ? "กำลังบันทึก…" : "บันทึกโปรไฟล์ + ตารางเรียน"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
