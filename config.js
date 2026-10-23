// ==========================================
// ไฟล์ตั้งค่าระบบเช็คชื่อ (Configuration)
// ==========================================
// คุณครูสามารถกำหนดลิงก์ข้อมูลและค่าคงที่พื้นฐานของโรงเรียนได้ที่นี่ครับ
// ระบบหน้าเว็บจะดึงข้อมูลจากไฟล์นี้ไปแสดงผลโดยอัตโนมัติ

const GLOBAL_CONFIG = {
    // 1. Supabase Database Configuration (High Speed Cloud DB)
    supabaseUrl: "https://lkpgexffxxyczxfevqkc.supabase.co",
    supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrcGdleGZmeHh5Y3p4ZmV2cWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NzA4ODgsImV4cCI6MjEwMzA0Njg4OH0.nZe6-3Hzw2ogcM_akBIK_w-JC9okXvp0r7GSjVj5YSM",

    // 2. ข้อมูลพื้นฐานของโรงเรียน (ปรับเปลี่ยนตามปีการศึกษา/ภาคเรียนจริง)
    schoolName: "โรงเรียนซับบอนวิทยาคม",
    workGroup: "กลุ่มงานบริหารทั่วไป",
    semester: "ภาคเรียนที่ 1",
    academicYear: "ปีการศึกษา 2569",

    // 3. ลิงก์ Google Sheets ทะเบียนนักเรียน (แยกชั้น & รวมโรงเรียน)
    studentSheetLinks: {
        master: "https://docs.google.com/spreadsheets/",
        m1: "",
        m2: "",
        m3: "",
        m4: "",
        m5: "",
        m6: "",
        webAppUrl: "https://script.google.com/macros/s/AKfycbziGwGolUdSI0PAUZCRlorWJPiAuEWkhH0QikUn6fItg2zerT50lJYVMhdPfHygHCEh/exec" // ลิงก์ Google Apps Script สำหรับยิงข้อมูลอัปเดตอัตโนมัติ
    }
};

// นามแฝงสำหรับการเรียกใช้ทั่วไป (Backward Compatibility)
window.config = window.config || GLOBAL_CONFIG;

// โหลดค่าปีการศึกษา/ภาคเรียนส่วนกลางจากระบบ (ถ้ามีบันทึกไว้ในเบราว์เซอร์หรือแอดมิน)
try {
    const _sbwkSavedSettings = localStorage.getItem("sbwk_system_settings");
    if (_sbwkSavedSettings) {
        const _parsed = JSON.parse(_sbwkSavedSettings);
        if (_parsed.school_name) GLOBAL_CONFIG.schoolName = _parsed.school_name;
        if (_parsed.work_group) GLOBAL_CONFIG.workGroup = _parsed.work_group;
        if (_parsed.academic_year) GLOBAL_CONFIG.academicYear = `ปีการศึกษา ${_parsed.academic_year}`;
        if (_parsed.current_term) GLOBAL_CONFIG.semester = `ภาคเรียนที่ ${_parsed.current_term}`;
    }
} catch (e) {
    console.warn("Could not load stored system settings:", e);
}

// ==========================================
// ฟังก์ชันตัวช่วยพื้นฐานส่วนกลาง (Shared Core Helpers)
// ==========================================

// 1. เชื่อมต่อ Supabase Client ส่วนกลาง (Single Instance)
window.getSupabase = function() {
    if (!window._supabaseInstance && typeof window.supabase !== "undefined" && typeof GLOBAL_CONFIG !== "undefined") {
        try {
            window._supabaseInstance = window.supabase.createClient(GLOBAL_CONFIG.supabaseUrl, GLOBAL_CONFIG.supabaseKey);
        } catch (err) {
            console.warn("Could not initialize Supabase client from config.js:", err);
        }
    }
    return window._supabaseInstance;
};

// 2. แสดงกล่องแจ้งเตือน Toast ส่วนกลาง
window.showToast = window.showToast || function(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = "position: fixed; top: 20px; right: 20px; z-index: 100000; display: flex; flex-direction: column; gap: 10px; pointer-events: none;";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    let bg = "#1e293b";
    let icon = "fa-circle-info";
    if (type === "success") { bg = "#10b981"; icon = "fa-circle-check"; }
    else if (type === "error") { bg = "#ef4444"; icon = "fa-circle-exclamation"; }
    else if (type === "warning") { bg = "#f59e0b"; icon = "fa-triangle-exclamation"; }

    toast.className = `toast ${type}`;
    toast.style.cssText = `background: ${bg}; color: white; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px; pointer-events: auto; animation: slideIn 0.3s ease; font-family: 'Sarabun', sans-serif;`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3200);
};

// 3. ดึงรายชื่อนักเรียนพื้นฐาน (std พร้อม fallback ไปยัง students)
window.getStudentsSafe = window.getStudentsSafe || async function() {
    if (typeof window.students !== "undefined" && window.students && window.students.length > 0) {
        return window.students;
    }
    const db = window.getSupabase();
    if (db) {
        try {
            let { data, error } = await db.from('std').select('*').order('grade').order('room').order('no');
            if (error || !data || data.length === 0) {
                const fallback = await db.from('students').select('*').order('grade').order('room').order('no');
                data = fallback.data;
            }
            if (data && data.length > 0) {
                let roomCounters = {};
                window.students = data.map(r => {
                    let s = {
                        studentId: r.student_id,
                        grade: r.grade,
                        room: r.room,
                        no: r.no,
                        fullName: r.full_name,
                        gender: r.gender || '1'
                    };
                    let rKey = `${s.grade}/${s.room}`;
                    if (!roomCounters[rKey]) roomCounters[rKey] = 1;
                    s.no = roomCounters[rKey]++;
                    return s;
                });
                return window.students;
            }
        } catch (e) {
            console.warn("Could not fetch students from Supabase:", e);
        }
    }
    return [];
};

// 4. ดึงรายชื่อครูและรหัส PIN (usr พร้อม fallback ไปยัง users)
window.getUsersSafe = window.getUsersSafe || async function() {
    if (typeof window.users !== "undefined" && window.users && window.users.length > 0) {
        return window.users;
    }
    const db = window.getSupabase();
    if (db) {
        try {
            let { data, error } = await db.from('usr').select('*').order('id');
            if (error || !data || data.length === 0) {
                const fallback = await db.from('users').select('*');
                data = fallback.data;
            }
            if (data && data.length > 0) {
                window.users = data.map((u, idx) => ({
                    code: u.code || ('T' + String(idx + 1).padStart(3, '0')),
                    name: u.name,
                    role: u.role || 'TEACHER',
                    pin: u.pin
                }));
                return window.users;
            }
        } catch (e) {
            console.warn("Could not fetch users from Supabase:", e);
        }
    }
    return [];
};

// ==========================================
// 5. ระบบเซสชันกลางร่วมกันทุกหน้า (Unified Shared Session System)
// ==========================================
window.SBWK_SESSION = {
    // บันทึกสถานะการเข้าสู่ระบบ
    setUser: function(user) {
        if (!user) return;
        const roleUpper = String(user.role || "TEACHER").toUpperCase();
        const sessionData = {
            name: user.name || "ผู้ใช้งาน",
            role: roleUpper,
            code: user.code || "",
            pin: user.pin || "",
            timestamp: Date.now()
        };
        try {
            const jsonStr = JSON.stringify(sessionData);
            localStorage.setItem("sbwk_user_session", jsonStr);
            sessionStorage.setItem("sbwk_user_session", jsonStr);

            // ซิงค์คีย์เดิมเพื่อรองรับโค้ดเก่า (Backwards compatibility)
            if (roleUpper === "ADMIN") {
                sessionStorage.setItem("sbwk_admin_auth", "true");
                sessionStorage.setItem("sbwk_admin_user", sessionData.name);
            }
            if (roleUpper === "ADMIN" || roleUpper === "ACADEMIC" || roleUpper === "วิชาการ" || roleUpper === "ฝ่ายวิชาการ") {
                sessionStorage.setItem("sbwk_academic_auth", "true");
                sessionStorage.setItem("sbwk_academic_user", sessionData.name);
                sessionStorage.setItem("sbwk_academic_role", roleUpper);
            }
        } catch (e) {
            console.warn("SBWK_SESSION save error:", e);
        }
    },

    // ดึงข้อมูลผู้ใช้งานปัจจุบัน
    getUser: function() {
        try {
            const raw = localStorage.getItem("sbwk_user_session") || sessionStorage.getItem("sbwk_user_session");
            if (raw) {
                return JSON.parse(raw);
            }
            // ตรวจสอบคีย์เดิม (Fallback)
            if (sessionStorage.getItem("sbwk_admin_auth") === "true") {
                return {
                    name: sessionStorage.getItem("sbwk_admin_user") || "ผู้ดูแลระบบ",
                    role: "ADMIN"
                };
            }
            if (sessionStorage.getItem("sbwk_academic_auth") === "true") {
                return {
                    name: sessionStorage.getItem("sbwk_academic_user") || "ครูวิชาการ",
                    role: sessionStorage.getItem("sbwk_academic_role") || "ACADEMIC"
                };
            }
        } catch (e) {
            console.warn("SBWK_SESSION load error:", e);
        }
        return null;
    },

    // ตรวจสอบว่ามีผู้เข้าสู่ระบบอยู่หรือไม่
    isLoggedIn: function() {
        return !!this.getUser();
    },

    // ตรวจสอบว่าผู้ใช้นี้มีสิทธิ์แก้ไขวิชาการ/ทะเบียนหรือไม่ (ADMIN หรือ ACADEMIC)
    canEditAcademic: function() {
        const u = this.getUser();
        if (!u) return false;
        const role = String(u.role || "").toUpperCase();
        return role === "ADMIN" || role === "ACADEMIC" || role === "วิชาการ" || role === "ฝ่ายวิชาการ";
    },

    // ออกจากระบบทุกหน้า
    clearUser: function() {
        try {
            localStorage.removeItem("sbwk_user_session");
            sessionStorage.removeItem("sbwk_user_session");
            sessionStorage.removeItem("sbwk_admin_auth");
            sessionStorage.removeItem("sbwk_admin_user");
            sessionStorage.removeItem("sbwk_admin_pin");
            sessionStorage.removeItem("sbwk_academic_auth");
            sessionStorage.removeItem("sbwk_academic_user");
            sessionStorage.removeItem("sbwk_academic_role");
        } catch (e) {
            console.warn("SBWK_SESSION clear error:", e);
        }
    }
};
