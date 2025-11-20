// backend/index.js
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const XLSX = require("xlsx"); // ใช้ Excel แทน PDF

const app = express();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MONGODB_URI = process.env.MONGODB_URI;

// ====== MIDDLEWARE ======
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

// ====== DB CONNECT ======
mongoose
  .connect(MONGODB_URI, { dbName: "attendance" })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error:", err);
    process.exit(1);
  });

// ====== SCHEMAS & MODELS ======
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true },
  level: { type: String, required: true }, // เช่น "ม.6"
  room: { type: String, required: true }, // เช่น "6/2"
  role: {
    type: String,
    enum: ["student", "teacher"],
    default: "student",
  },
});

const subjectEnrollSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  totalHours: { type: Number, required: true }, // ชั่วโมงในหลักสูตร
  credits: { type: Number, default: 0 }, // หน่วยกิต
});

const timetableSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  day: { type: String, required: true }, // "จันทร์" ฯลฯ
  period: { type: Number, required: true }, // 1–10
  subjectCode: { type: String, required: true },
});

// ตารางเรียนระดับ “ห้อง” สำหรับอาจารย์
const classTimetableSchema = new mongoose.Schema({
  level: { type: String, required: true }, // "ม.6"
  room: { type: String, required: true }, // "6/2"
  day: { type: String, required: true },
  period: { type: Number, required: true },
  subjectCode: { type: String, required: true },
});

const absenceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  subjectCode: { type: String, required: true },
  hours: { type: Number, required: true },
  reason: { type: String },
});

const User = mongoose.model("User", userSchema);
const SubjectEnroll = mongoose.model("SubjectEnroll", subjectEnrollSchema);
const Timetable = mongoose.model("Timetable", timetableSchema);
const ClassTimetable = mongoose.model("ClassTimetable", classTimetableSchema);
const Absence = mongoose.model("Absence", absenceSchema);

// ====== AUTH HELPERS ======
function createToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      username: user.username,
      level: user.level,
      room: user.room,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function teacherOnly(req, res, next) {
  if (!req.user || req.user.role !== "teacher") {
    return res.status(403).json({ message: "Teacher only" });
  }
  next();
}

// ====== SUBJECTS FROM EXCEL (แทน PDF) ======
// subjectMap[level][room] = [ { code, name, credits, totalHours }, ... ]
let subjectMap = {};
let subjectMapLoaded = false;

// helper หา key ตามคำใน header
function findKeyByKeywords(obj, keywords) {
  const keys = Object.keys(obj || {});
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw))) {
      return k;
    }
  }
  return null;
}

function normalizeStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

async function loadSubjectMapFromExcel() {
  if (subjectMapLoaded) return subjectMap;

  const xlsxPath = path.join(
    __dirname,
    "โครงสร้างรายวิชา-ทุกห้อง-ม1-ม6.xlsx"
  );

  if (!fs.existsSync(xlsxPath)) {
    console.warn("⚠️ ไม่พบไฟล์โครงสร้างรายวิชา-ทุกห้อง-ม1-ม6.xlsx");
    subjectMapLoaded = true;
    subjectMap = {};
    return subjectMap;
  }

  console.log("📄 Loading subjects from Excel:", xlsxPath);
  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  if (!rows.length) {
    console.warn("⚠️ Excel ไม่มีข้อมูล");
    subjectMapLoaded = true;
    subjectMap = {};
    return subjectMap;
  }

  const sample = rows[0];
  const levelKey = findKeyByKeywords(sample, ["ระดับ", "ชั้น"]);
  const roomKey = findKeyByKeywords(sample, ["ห้อง"]);
  const codeKey = findKeyByKeywords(sample, ["รหัส"]);
  const nameKey = findKeyByKeywords(sample, ["ชื่อ", "รายวิชา"]);
  const creditsKey = findKeyByKeywords(sample, ["หน่วยกิต"]);
  const hoursKey = findKeyByKeywords(sample, ["ชั่วโมง"]);

  if (!levelKey || !roomKey || !codeKey || !nameKey) {
    console.warn("⚠️ หัวคอลัมน์ใน Excel ไม่ตรงกับที่คาดไว้");
    console.warn(" sample keys:", Object.keys(sample));
  }

  const tempMap = {};

  rows.forEach((row) => {
    const level = normalizeStr(row[levelKey]);
    const room = normalizeStr(row[roomKey]);
    const code = normalizeStr(row[codeKey]);
    const name = normalizeStr(row[nameKey]);
    const credits = Number(row[creditsKey]) || 0;
    const totalHours = Number(row[hoursKey]) || 0;

    if (!level || !room || !code || !name) return;

    if (!tempMap[level]) tempMap[level] = {};
    if (!tempMap[level][room]) tempMap[level][room] = [];

    tempMap[level][room].push({
      code,
      name,
      credits,
      totalHours,
    });
  });

  subjectMap = tempMap;
  subjectMapLoaded = true;

  Object.keys(subjectMap).forEach((lv) => {
    Object.keys(subjectMap[lv]).forEach((rm) => {
      console.log(
        `📚 Loaded ${subjectMap[lv][rm].length} subjects for ${lv} ห้อง ${rm}`
      );
    });
  });

  return subjectMap;
}

async function ensureSubjectMap() {
  if (!subjectMapLoaded) await loadSubjectMapFromExcel();
  return subjectMap;
}

// ====== HELPERS: TIMETABLE & SUBJECT HOURS ======
async function upsertUserTimetableAndSubjects(user, timetableArray) {
  await Timetable.deleteMany({ userId: user._id });
  await SubjectEnroll.deleteMany({ userId: user._id });

  const filtered = Array.isArray(timetableArray)
    ? timetableArray.filter(
        (t) =>
          t.day &&
          t.period &&
          t.subjectCode &&
          typeof t.period === "number" &&
          t.period >= 1 &&
          t.period <= 10
      )
    : [];

  if (filtered.length === 0) return;

  const ttInsert = filtered.map((t) => ({
    userId: user._id,
    day: t.day,
    period: t.period,
    subjectCode: t.subjectCode,
  }));
  await Timetable.insertMany(ttInsert);

  const map = await ensureSubjectMap();
  const roomSubjects =
    (map[user.level] && map[user.level][user.room]) || [];
  const metaByCode = {};
  roomSubjects.forEach((s) => {
    metaByCode[s.code] = s;
  });

  const codeSet = new Set(filtered.map((t) => t.subjectCode));
  const subjDocs = [];

  codeSet.forEach((code) => {
    const meta = metaByCode[code] || {};
    const name = meta.name || code;
    const totalHours = meta.totalHours || 0;
    const credits = meta.credits || 0;
    subjDocs.push({
      userId: user._id,
      code,
      name,
      totalHours,
      credits,
    });
  });

  if (subjDocs.length) {
    await SubjectEnroll.insertMany(subjDocs);
  }
}

// ====== SEED TEACHER ACCOUNT ======
async function ensureAdminTeacher() {
  const existing = await User.findOne({ username: "Totoadmin" });
  if (existing) {
    if (existing.role !== "teacher") {
      existing.role = "teacher";
      await existing.save();
    }
    console.log("👩‍🏫 Admin teacher already exists");
    return;
  }
  const passwordHash = await bcrypt.hash("Sriaug123", 10);
  const user = await User.create({
    username: "Totoadmin",
    passwordHash,
    fullName: "Admin Teacher",
    level: "ม.6",
    room: "6/2",
    role: "teacher",
  });
  console.log("👩‍🏫 Created admin teacher:", user.username);
}

// ====== AUTH ROUTES (REGISTER / LOGIN / ME / UPDATE PROFILE) ======
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, fullName, level, room, timetable } = req.body;

    if (!username || !password || !fullName || !level || !room) {
      return res
        .status(400)
        .json({ message: "กรุณากรอก username, password, ชื่อ, ชั้น, ห้อง ให้ครบ" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: "ชื่อผู้ใช้นี้มีในระบบแล้ว" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      passwordHash,
      fullName,
      level,
      room,
      role: "student",
    });

    await upsertUserTimetableAndSubjects(user, timetable);

    const token = createToken(user);
    res.json({
      token,
      user: {
        username: user.username,
        fullName: user.fullName,
        level: user.level,
        room: user.room,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
      return res.status(400).json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });

    const token = createToken(user);
    res.json({
      token,
      user: {
        username: user.username,
        fullName: user.fullName,
        level: user.level,
        room: user.room,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

app.put("/api/me/profile", authMiddleware, async (req, res) => {
  try {
    const { fullName, level, room, timetable } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (fullName) user.fullName = fullName;
    if (level) user.level = level;
    if (room) user.room = room;

    await user.save();

    if (Array.isArray(timetable)) {
      await upsertUserTimetableAndSubjects(user, timetable);
    }

    const token = createToken(user);
    res.json({
      message: "อัปเดตโปรไฟล์สำเร็จ",
      token,
      user: {
        username: user.username,
        fullName: user.fullName,
        level: user.level,
        room: user.room,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ====== SUBJECTS API (FROM EXCEL) ======
app.get("/api/subjects", async (req, res) => {
  try {
    const { level, room } = req.query;
    if (!level) {
      return res.status(400).json({ message: "ต้องระบุ level เช่น ม.6" });
    }

    const map = await ensureSubjectMap();
    const forLevel = map[level] || {};

    let list = [];
    if (room && forLevel[room]) {
      list = forLevel[room];
    } else {
      const merged = {};
      Object.values(forLevel).forEach((arr) => {
        arr.forEach((s) => {
          merged[s.code] = s;
        });
      });
      list = Object.values(merged);
    }

    res.json(list);
  } catch (err) {
    console.error("subjects error:", err);
    res.json([]);
  }
});

// ====== CLASS TIMETABLE (teacher) ======
// GET ตารางเรียนระดับห้อง – public (ใช้ได้ทั้ง register, student, etc.)
app.get("/api/classes/timetable", async (req, res) => {
  try {
    const { level, room } = req.query;
    if (!level || !room) {
      return res
        .status(400)
        .json({ message: "ต้องระบุ level และ room เช่น ม.6, 6/2" });
    }

    const docs = await ClassTimetable.find({ level, room }).lean();
    const result = docs.map((d) => ({
      day: d.day,
      period: d.period,
      subjectCode: d.subjectCode,
    }));
    res.json(result);
  } catch (err) {
    console.error("get class timetable error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.put(
  "/api/classes/timetable",
  authMiddleware,
  teacherOnly,
  async (req, res) => {
    try {
      const { level, room, timetable } = req.body;
      if (!level || !room || !Array.isArray(timetable)) {
        return res.status(400).json({
          message: "ต้องระบุ level, room และ timetable (array)",
        });
      }

      await ClassTimetable.deleteMany({ level, room });

      const filtered = timetable.filter(
        (t) =>
          t.day &&
          t.period &&
          t.subjectCode &&
          typeof t.period === "number" &&
          t.period >= 1 &&
          t.period <= 10
      );

      if (filtered.length) {
        const docs = filtered.map((t) => ({
          level,
          room,
          day: t.day,
          period: t.period,
          subjectCode: t.subjectCode,
        }));
        await ClassTimetable.insertMany(docs);
      }

      res.json({
        message: "บันทึกตารางเรียนระดับห้องสำเร็จ",
        count: filtered.length,
      });
    } catch (err) {
      console.error("put class timetable error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ====== ABSENCES API ======

// GET รายการวันที่ลาทั้งหมดของผู้ใช้ (กลุ่มตามวัน)
app.get("/api/absences/dates", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const abs = await Absence.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$date",
              timezone: "+07:00", // ให้ตรง timezone ไทย
            },
          },
          totalHours: { $sum: "$hours" },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    const result = abs.map((a) => ({
      date: a._id,
      totalHours: a.totalHours,
    }));

    res.json(result);
  } catch (err) {
    console.error("absences dates error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE การลาของทั้งวัน (ใช้ format YYYY-MM-DD)
app.delete("/api/absences/:date", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const dateStr = req.params.date; // เช่น "2025-11-18"

    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) {
      return res.status(400).json({ message: "รูปแบบวันที่ไม่ถูกต้อง" });
    }

    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 1);

    const result = await Absence.deleteMany({
      userId,
      date: { $gte: start, $lt: end },
    });

    res.json({
      message: "ลบการลาของวันดังกล่าวเรียบร้อย",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("delete absence error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE ลบการลาทั้งหมดของผู้ใช้
app.delete("/api/absences", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await Absence.deleteMany({ userId });
    res.json({
      message: "ลบการลาทั้งหมดเรียบร้อย",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("delete all absences error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST บันทึกการลา (กันลงวันซ้ำ)
app.post("/api/absences", authMiddleware, async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date) {
      return res.status(400).json({ message: "ต้องระบุวันที่ลา (date)" });
    }

    const d = new Date(date + "T00:00:00");
    if (isNaN(d.getTime())) {
      return res.status(400).json({ message: "รูปแบบวันที่ไม่ถูกต้อง" });
    }

    const jsDay = d.getDay();
    const dayMap = {
      1: "จันทร์",
      2: "อังคาร",
      3: "พุธ",
      4: "พฤหัสบดี",
      5: "ศุกร์",
    };
    const thaiDay = dayMap[jsDay];
    if (!thaiDay) {
      return res
        .status(400)
        .json({ message: "วันที่ที่เลือกไม่ใช่วันจันทร์-ศุกร์" });
    }

    // กันลงวันเดิมซ้ำ
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 1);

    const existed = await Absence.findOne({
      userId: req.user.userId,
      date: { $gte: start, $lt: end },
    });

    if (existed) {
      return res.status(400).json({ message: "วันนี้ถูกบันทึกไปแล้ว" });
    }

    const tt = await Timetable.find({
      userId: req.user.userId,
      day: thaiDay,
    });

    if (!tt.length) {
      return res.status(400).json({
        message:
          "ในวันดังกล่าวไม่มีตารางเรียนที่บันทึกไว้ (หรือยังไม่ได้ตั้งค่าตารางเรียน)",
      });
    }

    const countMap = {};
    tt.forEach((t) => {
      countMap[t.subjectCode] = (countMap[t.subjectCode] || 0) + 1;
    });

    const absDocs = Object.entries(countMap).map(([subjectCode, periods]) => ({
      userId: req.user.userId,
      date: d,
      subjectCode,
      hours: periods, // 1 คาบ = 1 ชั่วโมง
      reason: reason || "",
    }));

    await Absence.insertMany(absDocs);

    res.json({
      message: "บันทึกการลาสำเร็จ",
      day: thaiDay,
      totalSubjects: absDocs.length,
    });
  } catch (err) {
    console.error("absences error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ====== SUMMARY & MY TIMETABLE ======
app.get("/api/summary", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const subjects = await SubjectEnroll.find({ userId });
    const absences = await Absence.find({ userId });

    const absentMap = {};
    absences.forEach((a) => {
      absentMap[a.subjectCode] =
        (absentMap[a.subjectCode] || 0) + a.hours;
    });

    const subjectSummaries = subjects.map((s) => {
      const absentHours = absentMap[s.code] || 0;
      const total = s.totalHours || 0;
      const percentAbsent = total > 0 ? (absentHours / total) * 100 : 0;
      return {
        code: s.code,
        name: s.name,
        totalHours: total,
        absentHours,
        percentAbsent,
        credits: s.credits || 0,
      };
    });

    const subjectCount = subjectSummaries.length;
    let passCount = 0;
    let missCount = 0;
    let sumPercent = 0;

    subjectSummaries.forEach((s) => {
      sumPercent += s.percentAbsent;
      // เกณฑ์ใหม่: ขาดเกิน 20% = มส.
      if (s.percentAbsent > 20) missCount++;
      else passCount++;
    });

    const totalPercentAbsent =
      subjectCount > 0 ? sumPercent / subjectCount : 0;

    res.json({
      subjectCount,
      passCount,
      missCount,
      totalPercentAbsent,
      subjects: subjectSummaries,
    });
  } catch (err) {
    console.error("summary error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ตารางเรียนของนักเรียน (ส่วนตัว)
app.get("/api/me/timetable", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs = await Timetable.find({ userId }).lean();
    const result = docs.map((d) => ({
      day: d.day,
      period: d.period,
      subjectCode: d.subjectCode,
    }));
    res.json(result);
  } catch (err) {
    console.error("get my timetable error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ====== ROOT & START ======
app.get("/", (req, res) => {
  res.send("Attendance backend is running");
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log("📄 Loading subject map from Excel...");
  loadSubjectMapFromExcel().catch((err) => {
    console.error("Error loading subjects from Excel:", err);
  });
  ensureAdminTeacher().catch((err) => {
    console.error("Error ensuring admin teacher:", err);
  });
});
app.get("/api/public/classes/timetable", async (req, res) => {
  try {
    const { level, room } = req.query;
    if (!level || !room) {
      return res
        .status(400)
        .json({ message: "ต้องระบุ level และ room เช่น ม.6, 6/2" });
    }

    const docs = await ClassTimetable.find({ level, room }).lean();
    const result = docs.map((d) => ({
      day: d.day,
      period: d.period,
      subjectCode: d.subjectCode,
    }));
    res.json(result);
  } catch (err) {
    console.error("get public class timetable error:", err);
    res.status(500).json({ message: "Server error" });
  }
});