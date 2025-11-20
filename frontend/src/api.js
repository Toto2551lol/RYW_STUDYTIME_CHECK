// frontend/src/api.js
const API_URL = import.meta.env.VITE_API_URL; // เช่น "https://your-backend.onrender.com"

async function handleResponse(res) {
  if (!res.ok) {
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Failed to fetch");
    }
    throw new Error(data.message || "Failed to fetch");
  }
  return res.json();
}

// -------- Auth --------
export async function apiRegister(data) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function apiLogin(data) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

// -------- Master subjects (ตาม ม. / ห้อง จากหลักสูตร) --------
export async function apiMasterSubjects({ grade, room }) {
  const params = new URLSearchParams();
  if (grade) params.append("grade", grade);
  if (room) params.append("room", room);

  const res = await fetch(
    `${API_URL}/api/master-subjects?${params.toString()}`,
    {
      headers: { "Content-Type": "application/json" },
    }
  );
  return handleResponse(res);
}

// -------- Summary / My subjects / Absences --------
export async function apiSummary(token) {
  const res = await fetch(`${API_URL}/api/me/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(res);
}

export async function apiMySubjects(token) {
  const res = await fetch(`${API_URL}/api/me/subjects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(res);
}

// body: { date, items: [{ subjectKey, hours }] }
export async function apiAddManualAbsences(token, body) {
  const res = await fetch(`${API_URL}/api/me/absences/manual`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return handleResponse(res);
}
