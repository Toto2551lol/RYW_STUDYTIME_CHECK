// src/components/teacher/TeacherDashboard.jsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
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

export default function TeacherDashboard() {
  const { api, currentUser } = useAuth();
  const [selectedLevel, setSelectedLevel] = useState("ม.6");
  const [selectedRoom, setSelectedRoom] = useState("6/2");

  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [classTimetable, setClassTimetable] = useState(buildEmptyTimetable());
  const [teacherLoading, setTeacherLoading] = useState(false);

  const [globalError, setGlobalError] = useState("");
  const [globalSuccess, setGlobalSuccess] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setSelectedLevel(currentUser.level || "ม.6");
    setSelectedRoom(currentUser.room || "6/2");
  }, [currentUser]);

  const loadTeacherSubjectsAndTimetable = async () => {
    if (!api) return;
    try {
      setTeacherLoading(true);
      setGlobalError("");
      setGlobalSuccess("");

      const [subRes, ttRes] = await Promise.all([
        api.get("/api/subjects", {
          params: { level: selectedLevel, room: selectedRoom },
        }),
        api.get("/api/classes/timetable", {
          params: { level: selectedLevel, room: selectedRoom },
        }),
      ]);

      setTeacherSubjects(subRes.data || []);

      const grid = buildEmptyTimetable();
      ttRes.data.forEach((t) => {
        if (grid[t.day] && grid[t.day][t.period] !== undefined) {
          grid[t.day][t.period] = t.subjectCode;
        }
      });
      setClassTimetable(grid);
      setGlobalSuccess("โหลดตารางเรียนของห้องนี้เรียบร้อย");
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message ||
          "ไม่สามารถโหลดตารางเรียนของห้องนี้ได้"
      );
    } finally {
      setTeacherLoading(false);
    }
  };

  // auto-load ครั้งแรก
  useEffect(() => {
    if (!api || !currentUser || initialized) return;
    const run = async () => {
      await loadTeacherSubjectsAndTimetable();
      setInitialized(true);
    };
    run();
  }, [api, currentUser, initialized]);

  const handleTeacherSubjectChange = (day, period, value) => {
    setClassTimetable((prev) => ({
      ...prev,
      [day]: { ...prev[day], [period]: value },
    }));
  };

  const handleTeacherSaveTimetable = async () => {
    if (!api) return;
    setGlobalError("");
    setGlobalSuccess("");

    try {
      setTeacherLoading(true);

      const timetableArray = [];
      TH_DAYS.forEach((day) => {
        PERIODS.forEach((p) => {
          const code = classTimetable[day][p];
          if (code) timetableArray.push({ day, period: p, subjectCode: code });
        });
      });

      await api.put("/api/classes/timetable", {
        level: selectedLevel,
        room: selectedRoom,
        timetable: timetableArray,
      });

      setGlobalSuccess("บันทึกตารางเรียนระดับห้องสำเร็จ");
    } catch (err) {
      console.error(err);
      setGlobalError(
        err.response?.data?.message || "บันทึกตารางเรียนไม่สำเร็จ"
      );
    } finally {
      setTeacherLoading(false);
    }
  };

  if (!api || !currentUser) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-400">
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(globalError || globalSuccess) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow ${
            globalError
              ? "border-rose-500/70 bg-rose-500/10 text-rose-100"
              : "border-emerald-500/70 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {globalError || globalSuccess}
        </div>
      )}

      <section className="grid md:grid-cols-3 gap-4">
        {/* Teacher card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-800/60 bg-slate-900/90 text-slate-50 p-5 shadow-2xl shadow-slate-950/70"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              Teacher Dashboard
            </span>
            <span className="text-xl">👩‍🏫</span>
          </div>
          <div className="text-lg font-semibold mb-1">
            {currentUser.fullName || currentUser.username}
          </div>
          <p className="text-xs text-slate-300">
            สามารถกำหนดตารางเรียนระดับห้อง และระบบจะใช้เป็นฐานให้กับนักเรียน
            ในห้องนั้น
          </p>
        </motion.div>

        {/* Level / room selector */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-5 shadow flex flex-col justify-between"
        >
          <div className="text-xs text-slate-500 dark:text-slate-300 mb-2">
            เลือกระดับชั้น / ห้อง
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-slate-800 dark:text-slate-100">
            <div>
              <label className="block mb-1 text-xs text-slate-500 dark:text-slate-300">
                ระดับชั้น
              </label>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
              >
                {LEVEL_OPTIONS.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs text-slate-500 dark:text-slate-300">
                ห้อง
              </label>
              <input
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2 text-xs">
            <button
              type="button"
              onClick={loadTeacherSubjectsAndTimetable}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              โหลดรายวิชา + ตารางเรียนของห้องนี้
            </button>
          </div>
        </motion.div>

        {/* Note card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-5 shadow text-sm text-slate-800 dark:text-slate-100"
        >
          <p className="text-xs text-slate-500 dark:text-slate-300 mb-2">
            หมายเหตุ
          </p>
          <ul className="text-xs space-y-1">
            <li>• ตารางเรียนระดับห้องนี้จะถูกใช้เป็นค่าเริ่มต้นให้กับนักเรียน</li>
            <li>
              • นักเรียนยังสามารถปรับแก้ตารางเรียนของตนเองได้ในหน้า
              “โปรไฟล์/ตารางเรียน”
            </li>
            <li>
              • รายชื่อวิชามาจากโครงสร้างรายวิชาที่คุณส่ง (ไฟล์ Excel หลักสูตร)
            </li>
          </ul>
        </motion.div>
      </section>

      {/* Timetable editor */}
      <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-5 shadow">
        <h2 className="text-base font-semibold mb-3 text-slate-800 dark:text-slate-100">
          🏫 ตารางเรียนระดับห้อง {selectedLevel} / ห้อง {selectedRoom}
        </h2>

        {teacherSubjects.length === 0 && (
          <div className="text-xs text-amber-500 mb-2">
            ยังไม่ได้โหลดรายชื่อวิชา ให้กดปุ่ม “โหลดรายวิชา +
            ตารางเรียนของห้องนี้” ด้านบนก่อน
          </div>
        )}

        <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[11px] sm:text-xs">
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
                        value={classTimetable[day][p]}
                        onChange={(e) =>
                          handleTeacherSubjectChange(day, p, e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 px-1 py-0.5 text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/70"
                      >
                        <option value="">— ไม่มีเรียน —</option>
                        {teacherSubjects.map((s) => (
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
          type="button"
          onClick={handleTeacherSaveTimetable}
          disabled={teacherLoading}
          className="mt-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 text-sm font-medium shadow disabled:opacity-60"
        >
          {teacherLoading ? "กำลังบันทึก..." : "บันทึกตารางเรียนระดับห้องนี้"}
        </button>
      </section>
    </div>
  );
}
