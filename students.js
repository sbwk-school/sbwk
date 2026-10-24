/**
 * students.js - ระบบทะเบียนนักเรียน (Student Roster & Registration Management)
 * โรงเรียนซับบอนวิทยาคม
 * 
 * สถาปัตยกรรม 1:1 สำหรับ students.html
 * - ซิงค์ตรงกับตาราง Master 'std' ใน Supabase Cloud
 * - ปุ่มสลับสถานะ "เข้า / ออก" หน้าสุดตามสั่ง
 * - เรียงลำดับตามหลังบ้าน (Grade -> Room -> No)
 * - ระบบนำเข้าข้อมูลยกชุดจาก Google Sheet / Excel (Batch Import)
 * - ระบบส่งออก CSV และพิมพ์ใบรายชื่อ A4 (PDF) สวยงาม
 */

// =========================================================================
// Global State
// =========================================================================
window.studentsRoster = [];
window.activeGradeFilter = "ALL";
window.activeRoomFilter = "ALL";
window.activeStatusFilter = "ALL"; // ALL, IN, OUT
window.parsedImportRows = [];
window.isSheetEditMode = false; // โหมดแก้ไขตารางเหมือน Google Sheet
window.newRowCounter = 1;

// =========================================================================
// 🔐 ระบบยืนยันสิทธิ์สำหรับผู้ดูแลระบบและครูวิชาการ (Academic & Admin Auth Gate)
// =========================================================================
let academicPinDigits = "";
let pendingAcademicCallback = null;

// ตรวจสอบว่าในเซสชันปัจจุบันปลดล็อกสิทธิ์แล้วหรือไม่ (ADMIN หรือ ACADEMIC)
window.isAcademicAuthorized = function() {
    if (window.SBWK_SESSION && window.SBWK_SESSION.canEditAcademic()) {
        return true;
    }
    // 1. ถ้าปลดล็อกในเซสชันหน้านี้แล้ว
    if (sessionStorage.getItem("sbwk_academic_auth") === "true") {
        return true;
    }
    // 2. ถ้าล็อกอินในหน้าระบบแอดมินไว้แล้ว (sbwk_admin_auth)
    if (sessionStorage.getItem("sbwk_admin_auth") === "true") {
        return true;
    }
    return false;
};

// ดึงข้อมูลผู้ใช้งานที่เข้าสู่ระบบ
window.getAcademicAuthUser = function() {
    if (window.SBWK_SESSION) {
        const u = window.SBWK_SESSION.getUser();
        if (u) {
            return { name: u.name, role: u.role };
        }
    }
    const name = sessionStorage.getItem("sbwk_academic_user") || sessionStorage.getItem("sbwk_admin_user") || "ผู้ใช้งาน";
    const role = sessionStorage.getItem("sbwk_academic_role") || (sessionStorage.getItem("sbwk_admin_auth") === "true" ? "ADMIN" : "ACADEMIC");
    return { name, role };
};

// อัปเดตการแสดงผล Session ผู้ใช้ใน Navbar (เหมือนหน้าหลัก 100%)
window.updateAuthBadgeUI = function() {
    const loggedOutSpan = document.getElementById('session-logged-out');
    const loggedInSpan = document.getElementById('session-logged-in');
    const userNameSpan = document.getElementById('user-session-name');

    const user = (window.SBWK_SESSION ? window.SBWK_SESSION.getUser() : null) || (isAcademicAuthorized() ? getAcademicAuthUser() : null);

    if (user && user.name) {
        if (loggedOutSpan) loggedOutSpan.style.display = 'none';
        if (loggedInSpan) {
            loggedInSpan.style.display = 'inline-flex';
            let shortName = user.name;
            // ตัดคำนำหน้าเหมือนหน้าหลัก (index.html)
            shortName = shortName.replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|คุณครู|ครู)\s*/, '');
            shortName = shortName.split(/\s+/)[0];
            if (userNameSpan) userNameSpan.innerText = shortName;
        }
    } else {
        if (loggedOutSpan) loggedOutSpan.style.display = 'inline-flex';
        if (loggedInSpan) loggedInSpan.style.display = 'none';
    }

    const badgeContainer = document.getElementById("student-auth-badge-container");
    if (badgeContainer) {
        badgeContainer.style.display = 'none';
    }
};

// คลิกเข้าสู่ระบบ
window.handleStudentAuthClick = function() {
    openAcademicPinModal("เข้าสู่ระบบ / ปลดล็อก");
};

// คลิกออกจากระบบ
window.handleStudentLogoutClick = function() {
    if (confirm("ต้องการออกจากระบบหรือไม่?")) {
        if (window.SBWK_SESSION) {
            window.SBWK_SESSION.clearUser();
        }
        sessionStorage.removeItem("sbwk_academic_auth");
        sessionStorage.removeItem("sbwk_academic_user");
        sessionStorage.removeItem("sbwk_academic_role");
        sessionStorage.removeItem("sbwk_admin_auth");
        sessionStorage.removeItem("sbwk_admin_user");

        if (window.isSheetEditMode) {
            window.isSheetEditMode = false;
            const normAct = document.getElementById("normal-mode-actions");
            const sheetAct = document.getElementById("sheet-mode-actions");
            if (normAct) normAct.style.display = "flex";
            if (sheetAct) sheetAct.style.display = "none";
            renderStudentList();
        }

        if (window.isTeachersEditMode) {
            window.isTeachersEditMode = false;
            if (typeof renderTeachersAdvisorsView === "function") {
                renderTeachersAdvisorsView();
            }
        }

        updateAuthBadgeUI();
        showToast("ออกจากระบบเรียบร้อยแล้ว", "info");
    }
};

window.handleAuthStatusClick = window.handleStudentAuthClick;
window.lockAcademicAuth = window.handleStudentLogoutClick;

// ตรวจสอบสิทธิ์ก่อนทำ Action ใดๆ
window.ensureAcademicAuth = function(callback, actionName = "แก้ไขข้อมูล") {
    if (isAcademicAuthorized()) {
        if (typeof callback === "function") callback();
        return;
    }

    pendingAcademicCallback = callback;
    openAcademicPinModal(actionName);
};

// เปิด Modal กรอก PIN
window.openAcademicPinModal = function(actionName = "แก้ไขข้อมูล") {
    const modal = document.getElementById("modal-student-auth-pin");
    if (!modal) return;

    academicPinDigits = "";
    updateAcademicPinDots();

    const subtitleEl = document.getElementById("academic-pin-subtitle");
    if (subtitleEl) {
        subtitleEl.innerText = actionName ? `เพื่อ${actionName} กรุณากรอกรหัส PIN (เฉพาะแอดมิน / ครูวิชาการ)` : "เฉพาะแอดมิน (ADMIN) หรือครูวิชาการ (ACADEMIC)";
    }

    const errorEl = document.getElementById("academic-pin-error");
    if (errorEl) errorEl.innerText = "";

    modal.style.display = "flex";
    modal.classList.add("active");
};

// ปิด Modal กรอก PIN
window.closeAcademicPinModal = function() {
    const modal = document.getElementById("modal-student-auth-pin");
    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
    }
    academicPinDigits = "";
    updateAcademicPinDots();
    pendingAcademicCallback = null;
};

// อัปเดตจุดไข่ปลา PIN
function updateAcademicPinDots() {
    const dots = document.querySelectorAll("#modal-student-auth-pin .pin-dot");
    dots.forEach((dot, index) => {
        if (index < academicPinDigits.length) {
            dot.classList.add("active");
        } else {
            dot.classList.remove("active");
        }
    });
}

// ตรวจสอบรหัส PIN กับตาราง usr ใน Supabase
window.verifyAcademicPin = async function(enteredPin) {
    const pinStr = String(enteredPin).trim();

    // 1. PIN 9999 Master Backup สำหรับแอดมิน
    if (pinStr === "9999") {
        return { valid: true, userName: "Admin (Master)", role: "ADMIN" };
    }

    // 2. ค้นหาในตาราง usr ของ Supabase
    const db = getStudentsSupabase();
    if (db) {
        try {
            const { data, error } = await db.from('usr').select('name, pin, role, code');
            if (!error && data && data.length > 0) {
                const matchedUser = data.find(u => String(u.pin || "").trim() === pinStr);
                if (matchedUser) {
                    const roleUpper = String(matchedUser.role || "").toUpperCase();
                    if (roleUpper === 'ADMIN' || roleUpper === 'ACADEMIC') {
                        return {
                            valid: true,
                            userName: matchedUser.name,
                            role: roleUpper
                        };
                    } else {
                        return {
                            valid: false,
                            reason: "ROLE_NOT_ALLOWED",
                            userName: matchedUser.name,
                            role: matchedUser.role || "TEACHER"
                        };
                    }
                }
            }
        } catch (e) {
            console.warn("verifyAcademicPin db error:", e);
        }
    }

    return { valid: false, reason: "INVALID_PIN" };
};

// จัดการการกดปุ่มบน Keypad
window.handleAcademicKeypadPress = async function(key) {
    const errorMsg = document.getElementById("academic-pin-error");
    if (errorMsg) errorMsg.innerText = "";

    if (key === "cancel") {
        closeAcademicPinModal();
        return;
    }

    if (key === "clear") {
        if (academicPinDigits.length > 0) {
            academicPinDigits = academicPinDigits.slice(0, -1);
            updateAcademicPinDots();
        }
        return;
    }

    if (academicPinDigits.length < 4) {
        academicPinDigits += key;
        updateAcademicPinDots();
    }

    if (academicPinDigits.length === 4) {
        if (errorMsg) errorMsg.innerText = "กำลังตรวจสอบสิทธิ์...";
        setLoader(true);
        setTimeout(async () => {
            try {
                const res = await verifyAcademicPin(academicPinDigits);
                setLoader(false);
                if (res.valid) {
                    if (window.SBWK_SESSION) {
                        window.SBWK_SESSION.setUser({
                            name: res.userName || "ผู้ดูแลระบบ",
                            role: res.role || "ADMIN",
                            pin: academicPinDigits
                        });
                    }
                    sessionStorage.setItem("sbwk_academic_auth", "true");
                    sessionStorage.setItem("sbwk_academic_user", res.userName || "ผู้ดูแลระบบ");
                    sessionStorage.setItem("sbwk_academic_role", res.role || "ADMIN");

                    updateAuthBadgeUI();
                    closeAcademicPinModal();

                    const roleTitle = res.role === "ADMIN" ? "ผู้ดูแลระบบ" : "ครูวิชาการ";
                    showToast(`ปลดล็อกโหมดแก้ไขเรียบร้อย: ${res.userName} (${roleTitle}) 🔓`, "success");

                    if (typeof pendingAcademicCallback === "function") {
                        const cb = pendingAcademicCallback;
                        pendingAcademicCallback = null;
                        cb();
                    }
                } else {
                    if (res.reason === "ROLE_NOT_ALLOWED") {
                        if (errorMsg) errorMsg.innerText = "⚠️ ไม่มีสิทธิ์";
                    } else {
                        if (errorMsg) errorMsg.innerText = "❌ รหัส PIN ไม่ถูกต้อง";
                    }
                    academicPinDigits = "";
                    updateAcademicPinDots();
                }
            } catch (err) {
                setLoader(false);
                if (errorMsg) errorMsg.innerText = "เกิดข้อผิดพลาดในการตรวจสอบรหัส";
                academicPinDigits = "";
                updateAcademicPinDots();
            }
        }, 150);
    }
};

// ผูก Event Listener ให้ปุ่มบน Keypad และคีย์บอร์ดจริง
function initAcademicPinKeypad() {
    const keypadButtons = document.querySelectorAll("#modal-student-auth-pin .key-btn");
    keypadButtons.forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const key = btn.getAttribute("data-key");
            handleAcademicKeypadPress(key);
        };
    });
}

window.addEventListener("keydown", (e) => {
    const pinModal = document.getElementById("modal-student-auth-pin");
    if (pinModal && (pinModal.style.display === "flex" || pinModal.classList.contains("active"))) {
        if (e.key >= '0' && e.key <= '9') {
            handleAcademicKeypadPress(e.key);
        } else if (e.key === 'Backspace') {
            handleAcademicKeypadPress('clear');
        } else if (e.key === 'Escape') {
            closeAcademicPinModal();
        }
    }
});

// Helper: ดึง Supabase Client
function getStudentsSupabase() {
    if (typeof getSupabase === "function") {
        const cl = getSupabase();
        if (cl) return cl;
    }
    if (window._supabaseInstance) return window._supabaseInstance;
    if (typeof window.supabase !== "undefined" && typeof GLOBAL_CONFIG !== "undefined") {
        window._supabaseInstance = window.supabase.createClient(GLOBAL_CONFIG.supabaseUrl, GLOBAL_CONFIG.supabaseKey);
        return window._supabaseInstance;
    }
    return null;
}

// Toast Notification
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#3b82f6')};
        color: white;
        padding: 10px 18px;
        border-radius: 12px;
        margin-top: 8px;
        font-weight: 600;
        font-size: 13px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        animation: fadeIn 0.25s ease;
    `;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info')}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3500);
}

// Loader Overlay
function setLoader(isLoading) {
    const el = document.getElementById("loader-overlay");
    if (el) el.style.display = isLoading ? "flex" : "none";
}

// Local Status Cache Helpers (เก็บสถานะ เข้า/ออก พร้อมหมายเหตุและวันที่ออก เพื่อความเสถียรสูงสุด)
function getLocalStatusMap() {
    try {
        return JSON.parse(localStorage.getItem("sbwk_student_status_map") || "{}");
    } catch (e) {
        return {};
    }
}

function getStudentStatusInfo(studentId) {
    const map = getLocalStatusMap();
    const item = map[String(studentId)];
    if (!item) return { status: "เข้า", outReason: "", outDate: "" };
    if (typeof item === "string") return { status: item, outReason: "", outDate: "" };
    return {
        status: item.status || "เข้า",
        outReason: item.outReason || "",
        outDate: item.outDate || ""
    };
}

function setLocalStatus(studentId, status, outReason = "", outDate = "") {
    try {
        const map = getLocalStatusMap();
        map[String(studentId)] = {
            status: status || "เข้า",
            outReason: outReason || "",
            outDate: outDate || ""
        };
        localStorage.setItem("sbwk_student_status_map", JSON.stringify(map));
    } catch (e) {}
}

// ฟังก์ชันแปลงวันที่เป็นภาษาไทย เช่น "2026-09-20" -> "20 ก.ย. 2569"
function formatThaiDateDisplay(dateStr) {
    if (!dateStr) return "";
    const str = String(dateStr).trim();
    const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        const yearAD = parseInt(match[1], 10);
        const yearBE = yearAD < 2400 ? yearAD + 543 : yearAD;
        const monthIdx = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        const monthName = (monthIdx >= 0 && monthIdx < 12) ? thaiMonths[monthIdx] : match[2];
        return `${day} ${monthName} ${yearBE}`;
    }
    return str;
}

// วันที่ปัจจุบันในรูปแบบ YYYY-MM-DD
function getTodayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// สร้างข้อความกำกับสถานะออก เช่น "ย้าย รร 20 ก.ย. 2569"
function getStudentOutRemark(s) {
    if (!s || s.status !== "ออก") return "";
    const reason = (s.outReason || "").trim();
    const dateFormatted = formatThaiDateDisplay(s.outDate);
    if (reason && dateFormatted) return `${reason} ${dateFormatted}`;
    if (reason) return reason;
    if (dateFormatted) return `ออก ${dateFormatted}`;
    return "ย้ายออก";
}

// Helper ตรวจสอบเพศ: 1 = ชาย, 2 = หญิง (อิงจากคำนำหน้าชื่อเป็นหลัก เพื่อความแม่นยำ 100%)
function getStudentGenderSortKey(s) {
    const name = String(s.fullName || "").trim();
    if (name.startsWith("ด.ช.") || name.startsWith("เด็กชาย") || name.startsWith("นาย")) return 1;
    if (name.startsWith("ด.ญ.") || name.startsWith("เด็กหญิง") || name.startsWith("น.ส.") || name.startsWith("นางสาว") || name.startsWith("นาง")) return 2;
    if (String(s.gender) === "2" || String(s.gender) === "หญิง") return 2;
    if (String(s.gender) === "1" || String(s.gender) === "ชาย") return 1;
    if (name.includes("ด.ญ.") || name.includes("น.ส.")) return 2;
    return 1;
}

// ฟังก์ชันจัดเรียงนักเรียน: ชั้น -> ห้อง -> สถานะ (เข้าก่อน ออกทีหลัง) -> เพศ (ชายก่อน หญิง) -> เลขประจำตัว นร. (น้อยไปมาก)
function sortStudentsRoster(list) {
    return list.slice().sort((a, b) => {
        // 1. ระดับชั้น (Grade: ม.1 - ม.6)
        const gA = parseInt(String(a.grade || "").replace(/[^0-9]/g, ""), 10) || 0;
        const gB = parseInt(String(b.grade || "").replace(/[^0-9]/g, ""), 10) || 0;
        if (gA !== gB) return gA - gB;

        // 2. ห้อง (Room: 1, 2, 3...)
        const rA = parseInt(String(a.room || "").replace(/[^0-9]/g, ""), 10) || 0;
        const rB = parseInt(String(b.room || "").replace(/[^0-9]/g, ""), 10) || 0;
        if (rA !== rB) return rA - rB;

        // ⭐️ 3. สถานะ: นร. ที่ "เข้า" (กำลังศึกษา) ต้องมาก่อนคน "ออก" (คนออกไปอยู่ท้ายห้องเสมอ)
        const isOutA = (a.status === "ออก");
        const isOutB = (b.status === "ออก");
        if (isOutA !== isOutB) {
            return isOutA ? 1 : -1;
        }

        // 4. เพศ (ชาย = 1 ขึ้นก่อน, หญิง = 2 ตามหลัง ตามมาตรฐานทะเบียน)
        const genA = getStudentGenderSortKey(a);
        const genB = getStudentGenderSortKey(b);
        if (genA !== genB) return genA - genB;

        // 5. เลขประจำตัวนักเรียน (Student ID เรียงจากน้อยไปมาก)
        const idA = parseInt(String(a.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
        const idB = parseInt(String(b.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
        if (idA !== idB) return idA - idB;

        // 6. fallback: เลขที่เดิม
        return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0);
    });
}

// ⭐️ ฟังก์ชันรันเลขที่ใหม่ในห้อง: คนที่กำลังศึกษาได้เลข 1, 2, 3... ต่อเนื่อง และคนที่ออกจะได้เลขที่ 99 อยู่ท้าย
function resequenceRoomNumbers(grade, room) {
    const cleanG = String(grade || "").replace(/[^0-9]/g, "");
    const cleanR = String(room || "").replace(/[^0-9]/g, "");

    const roomStudents = (window.studentsRoster || []).filter(s => {
        const g = String(s.grade || "").replace(/[^0-9]/g, "");
        const r = String(s.room || "").replace(/[^0-9]/g, "");
        return g === cleanG && r === cleanR;
    });

    // เรียง: คนเข้ามาก่อน (เพศ -> รหัส นร.), คนออกไปอยู่ท้าย
    roomStudents.sort((a, b) => {
        const outA = (a.status === "ออก");
        const outB = (b.status === "ออก");
        if (outA !== outB) return outA ? 1 : -1;
        const genA = getStudentGenderSortKey(a);
        const genB = getStudentGenderSortKey(b);
        if (genA !== genB) return genA - genB;
        const idA = parseInt(String(a.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
        const idB = parseInt(String(b.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
        if (idA !== idB) return idA - idB;
        return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0);
    });

    let activeNo = 1;
    const updates = [];
    roomStudents.forEach(s => {
        if (s.status === "ออก") {
            s.no = 99;
        } else {
            s.no = activeNo++;
        }
        updates.push({
            student_id: s.studentId,
            full_name: s.fullName,
            grade: s.grade,
            room: s.room,
            no: s.no,
            gender: s.gender,
            status: s.status || "เข้า",
            out_reason: s.outReason || null,
            out_date: s.outDate || null
        });
    });

    return updates;
}

// =========================================================================
// โหลดข้อมูลนักเรียนจากฐานข้อมูล Supabase (เรียงตาม ชั้น -> ห้อง -> เพศ -> รหัส นร.)
// =========================================================================
window.loadStudents = async function() {
    setLoader(true);
    const db = getStudentsSupabase();
    if (!db) {
        setLoader(false);
        showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
        return;
    }

    try {
        // ดึงจากตาราง std
        const { data, error } = await db
            .from('std')
            .select('*')
            .order('grade', { ascending: true })
            .order('room', { ascending: true })
            .order('no', { ascending: true });

        if (error) throw error;

        const rawList = (data || []).map(r => {
            const sId = String(r.student_id);
            const cachedInfo = getStudentStatusInfo(sId);
            // ตรวจสอบสถานะ: ถ้าไม่มีระบุไว้ แต่ r.no เคยเป็น 99 ให้ถือว่าเป็น "ออก" เพื่อรักษาประวัติเดิม
            const currentStatus = r.status || cachedInfo.status || (parseInt(r.no, 10) === 99 ? "ออก" : "เข้า");
            const currentReason = r.out_reason || cachedInfo.outReason || "";
            const currentDate = r.out_date || cachedInfo.outDate || "";
            const rawG = String(r.grade || "").trim();
            const normG = rawG.startsWith("ม.") ? rawG : `ม.${rawG.replace(/[^0-9]/g, "") || "1"}`;
            
            let currentNo = parseInt(r.no, 10) || 1;
            if (currentStatus === "ออก") {
                currentNo = 99;
            }

            return {
                studentId: sId,
                fullName: r.full_name || "",
                grade: normG,
                room: String(r.room || "").trim(),
                no: currentNo,
                gender: r.gender || "1",
                status: currentStatus, // "เข้า" หรือ "ออก"
                outReason: currentReason,
                outDate: currentDate
            };
        });

        // จัดเรียงตามเกณฑ์: เข้าก่อน ออกทีหลัง -> เพศ -> เลขประจำตัวนักเรียน
        window.studentsRoster = sortStudentsRoster(rawList);

        // จัดการรันเลขที่ 1..N สำหรับคนเข้า และเลขที่ 99 สำหรับคนออกในแต่ละห้อง
        const roomActiveCounters = {};
        window.studentsRoster.forEach(s => {
            const cleanG = String(s.grade || "").replace(/[^0-9]/g, "") || "1";
            const cleanR = String(s.room || "").replace(/[^0-9]/g, "") || "1";
            const key = `${cleanG}_${cleanR}`;

            if (s.status === "ออก") {
                s.no = 99;
            } else {
                if (!roomActiveCounters[key]) roomActiveCounters[key] = 1;
                s.no = roomActiveCounters[key]++;
            }
        });

        populateClassRoomDropdown();
        updateSummaryCounters();
        updateAuthBadgeUI();
        initAcademicPinKeypad();

        // โหลดข้อมูลครูและครูที่ปรึกษา
        await loadTeachersAndAdvisors();

        // ซิงค์ปีการศึกษาและภาคเรียนที่แอคทีฟจากตาราง academic_years ใน Supabase (และ sbwk_system_settings)
        try {
            const { data: yearData } = await db.from('academic_years').select('*').eq('is_current', true).limit(1);
            if (yearData && yearData.length > 0) {
                const actYear = yearData[0];
                let yr = String(actYear.year || "2569");
                const today = getTodayIsoDate();
                let term = "1";
                if (actYear.term2_start && actYear.term2_end && today >= actYear.term2_start && today <= actYear.term2_end) {
                    term = "2";
                }
                const saved = localStorage.getItem("sbwk_system_settings");
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.current_term) term = String(parsed.current_term);
                    if (parsed.academic_year) yr = String(parsed.academic_year);
                }
                if (window.GLOBAL_CONFIG) {
                    window.GLOBAL_CONFIG.academicYear = `ปีการศึกษา ${yr}`;
                    window.GLOBAL_CONFIG.semester = `ภาคเรียนที่ ${term}`;
                }

                // อัปเดตค่าลงในช่อง input ทันทีตั้งแต่ตอนเริ่มโหลดหน้าเว็บ
                const termInput = document.getElementById("pdf-input-term");
                const yearInput = document.getElementById("pdf-input-year");
                if (termInput) termInput.value = term;
                if (yearInput) yearInput.value = yr;
            }
        } catch (e) {
            console.warn("Could not sync academic_years in students:", e);
        }

        // สลับไปยังแท็บเริ่มต้น (ค่าเริ่มต้นคือ แดชบอร์ด ตามคำสั่งผู้ใช้ หรือจำค่าเดิม)
        const urlParams = new URLSearchParams(window.location.search);
        const targetTab = urlParams.get('tab') || localStorage.getItem("sbwk_students_active_tab") || "dashboard";
        switchStudentsMainTab(targetTab);
    } catch (err) {
        console.error("loadStudents error:", err);
        showToast("เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน", "error");
    } finally {
        setLoader(false);
    }
};

// อัปเดตตัวเลขนับสรุปด้านบน
function updateSummaryCounters() {
    const list = window.studentsRoster || [];
    const total = list.length;
    let inCount = 0;
    let outCount = 0;

    list.forEach(s => {
        if (s.status === "ออก") outCount++;
        else inCount++;
    });

    if (document.getElementById("stat-total-students")) document.getElementById("stat-total-students").innerText = total.toLocaleString();
    if (document.getElementById("stat-in-students")) document.getElementById("stat-in-students").innerText = inCount.toLocaleString();
    if (document.getElementById("stat-out-students")) document.getElementById("stat-out-students").innerText = outCount.toLocaleString();

    if (window.currentMainTab === "dashboard" && typeof renderStudentsDashboard === "function") {
        renderStudentsDashboard();
    }
}

// =========================================================================
// 🏷️ สลับแท็บหน้าหลัก (1. แดชบอร์ด | 2. ทะเบียน | 3. ครู)
// =========================================================================
window.roomAdvisorsMap = {};
window.teachersList = [];
window.currentMainTab = "dashboard";

window.switchStudentsMainTab = function(tabName) {
    const validTabs = ["dashboard", "roster", "teachers"];
    if (!validTabs.includes(tabName)) tabName = "dashboard";
    window.currentMainTab = tabName;

    validTabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const pane = document.getElementById(`tab-content-${t}`);
        if (btn) btn.classList.toggle("active", t === tabName);
        if (pane) pane.style.display = (t === tabName) ? "block" : "none";
    });

    try {
        localStorage.setItem("sbwk_students_active_tab", tabName);
        // อัปเดต URL ใน Address bar ให้เป็นลิงก์เฉพาะของแท็บนั้นทันที เพื่อให้ก๊อปปี้ไปแชร์ได้ตรงหน้า
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("tab", tabName);
        window.history.replaceState(null, "", currentUrl.toString());
    } catch (e) {}

    if (tabName === "dashboard") {
        renderStudentsDashboard();
    } else if (tabName === "roster") {
        renderStudentList();
    } else if (tabName === "teachers") {
        renderTeachersAdvisorsView();
    }
};

// คัดลอกลิงก์หน้าปัจจุบันเพื่อนำไปแชร์ใน LINE หรือส่งต่อให้ครูท่านอื่น
window.copyCurrentPageLink = function() {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showToast("คัดลอกลิงก์หน้านี้เรียบร้อยแล้ว พร้อมแชร์ได้ทันที 📋", "success");
        }).catch(() => {
            prompt("คัดลอกลิงก์หน้านี้เพื่อส่งแชร์:", url);
        });
    } else {
        prompt("คัดลอกลิงก์หน้านี้เพื่อส่งแชร์:", url);
    }
};

// =========================================================================
// 🧑‍🏫 จัดการครูที่ปรึกษาประจำชั้น/ห้อง (Homeroom Advisors)
// =========================================================================
function getStoredAdvisorsMap() {
    try {
        return JSON.parse(localStorage.getItem("sbwk_room_advisors") || "{}");
    } catch (e) {
        return {};
    }
}

window.getRoomAdvisorInfo = function(grade, room) {
    const cleanG = String(grade || "").replace(/[^0-9]/g, "");
    const cleanR = String(room || "").replace(/[^0-9]/g, "");
    const map = window.roomAdvisorsMap || getStoredAdvisorsMap();
    return map[`${cleanG}/${cleanR}`] || map[`ม.${cleanG}/${cleanR}`] || null;
};

window.loadTeachersAndAdvisors = async function() {
    // 1. โหลดข้อมูลครูที่ปรึกษาจาก LocalStorage ก่อนเพื่อความรวดเร็ว
    window.roomAdvisorsMap = getStoredAdvisorsMap();

    // 2. ดึงรายชื่อครูทั้งหมดจากตาราง usr ใน Supabase
    const db = getStudentsSupabase();
    if (db) {
        try {
            const { data: usersData, error: usrErr } = await db.from('usr').select('name, role, code').order('name');
            if (!usrErr && usersData) {
                window.teachersList = usersData.map(u => u.name).filter(Boolean);
                populateTeachersDatalist();
            }
        } catch (e) {
            console.warn("loadTeachers usr notice:", e);
        }

        // 3. พยายามดึงตาราง advisors จาก Supabase ถ้ามี
        try {
            const { data: advData, error: advErr } = await db.from('advisors').select('*');
            if (!advErr && advData && advData.length > 0) {
                const cloudMap = {};
                advData.forEach(row => {
                    const cleanG = String(row.grade || "").replace(/[^0-9]/g, "");
                    const cleanR = String(row.room || "").replace(/[^0-9]/g, "");
                    cloudMap[`${cleanG}/${cleanR}`] = {
                        teacher1: row.teacher1 || row.advisor1 || row.advisor_name || "",
                        teacher2: row.teacher2 || row.advisor2 || row.co_advisor || "",
                        phone: row.phone || ""
                    };
                });
                window.roomAdvisorsMap = Object.assign({}, window.roomAdvisorsMap, cloudMap);
                localStorage.setItem("sbwk_room_advisors", JSON.stringify(window.roomAdvisorsMap));
            }
        } catch (e) {
            // ไม่พบตาราง advisors บน Supabase ใช้ LocalStorage ต่อเนื่องได้ปกติ
        }
    }
};

function populateTeachersDatalist() {
    const datalist = document.getElementById("teachers-datalist");
    if (!datalist) return;
    datalist.innerHTML = (window.teachersList || []).map(name => `<option value="${name}">`).join("");
}

window.isTeachersEditMode = false;

window.toggleTeachersEditMode = function(isEdit) {
    const willEdit = (typeof isEdit === "boolean") ? isEdit : !window.isTeachersEditMode;
    if (willEdit) {
        ensureAcademicAuth(() => {
            window.isTeachersEditMode = true;
            renderTeachersAdvisorsView();
        }, "แก้ไขข้อมูลครูที่ปรึกษา");
    } else {
        window.isTeachersEditMode = false;
        renderTeachersAdvisorsView();
    }
};

window.renderTeachersAdvisorsView = function() {
    const container = document.getElementById("teachers-rooms-grid");
    if (!container) return;

    populateTeachersDatalist();

    // จัดการปุ่มใน Header Bar
    const headerActions = document.getElementById("teachers-header-actions");
    if (headerActions) {
        if (window.isTeachersEditMode) {
            headerActions.innerHTML = `
                <button type="button" class="btn btn-outline" onclick="promptAddNewRoomAdvisor()" style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 12px; font-weight: 700; font-size: 13px; background: white; border: 1.5px solid #cbd5e1; color: #1e293b; cursor: pointer; transition: all 0.15s ease;">
                    <i class="fa-solid fa-plus" style="color: #4f46e5;"></i> เพิ่มห้องเรียน
                </button>
                <button type="button" class="btn btn-secondary" onclick="toggleTeachersEditMode(false)" style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 12px; font-weight: 700; font-size: 13px; background: #64748b; border: none; color: white; cursor: pointer; transition: all 0.15s ease;">
                    <i class="fa-solid fa-xmark"></i> ยกเลิก
                </button>
                <button type="button" onclick="saveAllRoomAdvisors()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 22px; border-radius: 12px; border: none; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; font-weight: 800; font-size: 13.5px; cursor: pointer; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35); transition: all 0.15s ease;">
                    <i class="fa-solid fa-floppy-disk"></i> บันทึก
                </button>
            `;
        } else {
            headerActions.innerHTML = `
                <button type="button" class="btn-big-edit" onclick="toggleTeachersEditMode(true)">
                    <i class="fa-solid fa-pen-to-square"></i> แก้ไขข้อมูล
                </button>
            `;
        }
    }

    // 1. รวมรายชื่อห้องที่มีอยู่จริงจาก studentsRoster
    const roomMap = {};
    (window.studentsRoster || []).forEach(s => {
        const g = String(s.grade || "").replace(/[^0-9]/g, "");
        const r = String(s.room || "").replace(/[^0-9]/g, "");
        if (!g || !r) return;
        const key = `${g}/${r}`;
        if (!roomMap[key]) {
            roomMap[key] = { grade: g, room: r, total: 0, male: 0, female: 0 };
        }
        roomMap[key].total++;
        if (getStudentGenderSortKey(s) === 1) roomMap[key].male++;
        else roomMap[key].female++;
    });

    // 2. ถ้ามีข้อมูลห้องใน sbwk_room_advisors ให้นำมารวมด้วย เพื่อไม่ให้ห้องที่เคยตั้งไว้หายไป
    const advisorsMap = getStoredAdvisorsMap();
    Object.keys(advisorsMap || {}).forEach(k => {
        const cleanK = k.replace("ม.", "").trim();
        const parts = cleanK.split(/[\/-]/);
        if (parts.length === 2 && parts[0] && parts[1]) {
            const g = parts[0];
            const r = parts[1];
            const key = `${g}/${r}`;
            if (!roomMap[key]) {
                roomMap[key] = { grade: g, room: r, total: 0, male: 0, female: 0 };
            }
        }
    });

    // 3. หากระบบยังไม่มีนักเรียนเลย ให้มีห้องเริ่มต้น ม.1/1 - ม.6/1 เป็นค่าเริ่มต้น
    if (Object.keys(roomMap).length === 0) {
        for (let g = 1; g <= 6; g++) {
            roomMap[`${g}/1`] = { grade: String(g), room: "1", total: 0, male: 0, female: 0 };
        }
    }

    const keys = Object.keys(roomMap).sort((a, b) => {
        const [gA, rA] = a.split("/").map(Number);
        const [gB, rB] = b.split("/").map(Number);
        if (gA !== gB) return gA - gB;
        return rA - rB;
    });

    const juniorKeys = keys.filter(k => Number(k.split("/")[0]) <= 3);
    const seniorKeys = keys.filter(k => Number(k.split("/")[0]) >= 4);

    const isEdit = !!window.isTeachersEditMode;

    function renderRoomTableHtml(title, iconColor, roomKeys) {
        if (roomKeys.length === 0) return "";
        let h = `
            <div style="background: white; border-radius: 18px; border: 1.5px solid #cbd5e1; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.03); margin-bottom: 20px;">
                <div style="padding: 12px 18px; background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="font-size: 15px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-graduation-cap" style="color: ${iconColor}; font-size: 16px;"></i> ${title}
                    </div>
                    <span style="font-size: 12px; font-weight: 700; color: #475569; background: white; padding: 3px 10px; border-radius: 10px; border: 1px solid #cbd5e1;">
                        ${roomKeys.length} ห้องเรียน
                    </span>
                </div>
                <div class="sheet-table-wrapper" style="margin: 0; border: none; border-radius: 0; overflow-x: auto;">
                    <table class="sheet-table" style="width: 100%; min-width: 680px; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                                <th style="padding: 10px 14px; text-align: center; font-weight: 800; color: #334155; width: 110px;">
                                    <i class="fa-solid fa-door-open" style="color: #4f46e5; margin-right: 4px;"></i> ชั้น
                                </th>
                                <th style="padding: 10px 14px; text-align: left; font-weight: 800; color: #334155; width: ${isEdit ? '31%' : '35%'};">
                                    <i class="fa-solid fa-user-tie" style="color: #4f46e5; margin-right: 4px;"></i> ครูที่ปรึกษา 1 ${isEdit ? '*' : ''}
                                </th>
                                <th style="padding: 10px 14px; text-align: left; font-weight: 800; color: #334155; width: ${isEdit ? '31%' : '35%'};">
                                    <i class="fa-solid fa-user-tie" style="color: #4f46e5; margin-right: 4px;"></i> ครูที่ปรึกษา 2
                                </th>
                                <th style="padding: 10px 14px; text-align: left; font-weight: 800; color: #334155; width: ${isEdit ? '28%' : '30%'};">
                                    <i class="fa-solid fa-comment-dots" style="color: #10b981; margin-right: 4px;"></i> หมายเหตุ
                                </th>
                                ${isEdit ? `
                                <th style="padding: 10px 8px; text-align: center; font-weight: 800; color: #64748b; width: 45px;">
                                    ล้าง
                                </th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
        `;

        roomKeys.forEach(k => {
            const inf = roomMap[k];
            const g = inf.grade;
            const r = inf.room;
            const adv = advisorsMap[k] || advisorsMap[`ม.${g}/${r}`] || {};

            const safeT1 = (adv.teacher1 || "").replace(/"/g, '&quot;');
            const safeT2 = (adv.teacher2 || "").replace(/"/g, '&quot;');
            const safePhone = (adv.phone || adv.note || "").replace(/"/g, '&quot;');

            h += `
                <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                    <td style="padding: 9px 14px; vertical-align: middle; text-align: center;">
                        <span style="background: #eef2ff; color: #4f46e5; font-weight: 800; padding: 5px 12px; border-radius: 9px; font-size: 14px; border: 1.5px solid #c7d2fe; display: inline-block; white-space: nowrap;">
                            ม.${g}/${r}
                        </span>
                    </td>
            `;

            if (isEdit) {
                h += `
                    <td style="padding: 7px 12px; vertical-align: middle;">
                        <div style="position: relative;">
                            <input type="text" list="teachers-datalist" id="adv-t1-${g}-${r}" value="${safeT1}" 
                                   placeholder="เลือกหรือพิมพ์ชื่อครู 1..." 
                                   class="sheet-input" 
                                   style="padding-left: 30px; font-weight: 600; color: #1e293b;">
                            <i class="fa-solid fa-user-tie" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #6366f1; font-size: 11px; pointer-events: none;"></i>
                        </div>
                    </td>
                    <td style="padding: 7px 12px; vertical-align: middle;">
                        <div style="position: relative;">
                            <input type="text" list="teachers-datalist" id="adv-t2-${g}-${r}" value="${safeT2}" 
                                   placeholder="ครูร่วม (เว้นว่างได้)..." 
                                   class="sheet-input" 
                                   style="padding-left: 30px; font-weight: 600; color: #1e293b;">
                            <i class="fa-solid fa-user-tie" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #6366f1; font-size: 11px; pointer-events: none;"></i>
                        </div>
                    </td>
                    <td style="padding: 7px 12px; vertical-align: middle;">
                        <div style="position: relative;">
                            <input type="text" id="adv-phone-${g}-${r}" value="${safePhone}" 
                                   placeholder="หมายเหตุ / เบอร์โทร..." 
                                   class="sheet-input" 
                                   style="padding-left: 30px; color: #1e293b;">
                            <i class="fa-solid fa-comment-dots" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #10b981; font-size: 11px; pointer-events: none;"></i>
                        </div>
                    </td>
                    <td style="padding: 7px 8px; text-align: center; vertical-align: middle;">
                        <button type="button" onclick="clearAdvisorRow('${g}', '${r}')" title="ล้างข้อมูลห้อง ม.${g}/${r}" style="width: 28px; height: 28px; border-radius: 7px; border: 1px solid #e2e8f0; background: white; color: #94a3b8; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease;" onmouseover="this.style.color='#ef4444'; this.style.borderColor='#fca5a5'; this.style.background='#fef2f2';" onmouseout="this.style.color='#94a3b8'; this.style.borderColor='#e2e8f0'; this.style.background='white';">
                            <i class="fa-solid fa-eraser" style="font-size: 11px;"></i>
                        </button>
                    </td>
                `;
            } else {
                h += `
                    <td style="padding: 10px 14px; vertical-align: middle;">
                        ${adv.teacher1 ? `
                            <div style="font-weight: 700; font-size: 13.5px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-user-tie" style="color: #6366f1; font-size: 12px;"></i>
                                <span>${adv.teacher1}</span>
                            </div>
                        ` : `
                            <div style="color: #94a3b8; font-size: 13px; font-style: italic; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-user-tie" style="color: #cbd5e1; font-size: 12px;"></i>
                                <span>- ยังไม่ได้ระบุ -</span>
                            </div>
                        `}
                    </td>
                    <td style="padding: 10px 14px; vertical-align: middle;">
                        ${adv.teacher2 ? `
                            <div style="font-weight: 700; font-size: 13.5px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-user-tie" style="color: #6366f1; font-size: 12px;"></i>
                                <span>${adv.teacher2}</span>
                            </div>
                        ` : `
                            <div style="color: #cbd5e1; font-size: 13px; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-user-tie" style="color: #e2e8f0; font-size: 12px;"></i>
                                <span>-</span>
                            </div>
                        `}
                    </td>
                    <td style="padding: 10px 14px; vertical-align: middle;">
                        ${(adv.phone || adv.note) ? `
                            <div style="font-weight: 600; font-size: 13px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-comment-dots" style="color: #10b981; font-size: 12px;"></i>
                                <span>${adv.phone || adv.note}</span>
                            </div>
                        ` : `
                            <div style="color: #cbd5e1; font-size: 13px; display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-comment-dots" style="color: #e2e8f0; font-size: 12px;"></i>
                                <span>-</span>
                            </div>
                        `}
                    </td>
                `;
            }

            h += `</tr>`;
        });

        h += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        return h;
    }

    let fullHtml = "";
    fullHtml += renderRoomTableHtml("มัธยมศึกษาตอนต้น (ม.1 - ม.3)", "#10b981", juniorKeys);
    fullHtml += renderRoomTableHtml("มัธยมศึกษาตอนปลาย (ม.4 - ม.6)", "#f59e0b", seniorKeys);

    container.innerHTML = fullHtml;
};

window.clearAdvisorRow = function(g, r) {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.clearAdvisorRow(g, r), "ล้างข้อมูลครูที่ปรึกษา");
        return;
    }
    const t1 = document.getElementById(`adv-t1-${g}-${r}`);
    const t2 = document.getElementById(`adv-t2-${g}-${r}`);
    const ph = document.getElementById(`adv-phone-${g}-${r}`);
    if (t1) t1.value = "";
    if (t2) t2.value = "";
    if (ph) ph.value = "";
};

window.promptAddNewRoomAdvisor = function() {
    ensureAcademicAuth(() => {
        executePromptAddNewRoomAdvisor();
    }, "เพิ่มห้องเรียน");
};

function executePromptAddNewRoomAdvisor() {
    const res = prompt("ระบุระดับชั้นและห้องที่ต้องการเพิ่ม (เช่น 1/3 หรือ ม.1/3):", "");
    if (!res) return;
    const clean = res.replace("ม.", "").trim();
    const parts = clean.split(/[\/-]/);
    if (parts.length === 2 && parts[0] && parts[1]) {
        const g = parts[0].trim().replace(/[^0-9]/g, "");
        const r = parts[1].trim().replace(/[^0-9]/g, "");
        if (!g || !r) {
            showToast("กรุณาระบุตัวเลขชั้นและห้อง เช่น 1/3 หรือ 4/2", "error");
            return;
        }
        const key = `${g}/${r}`;
        const map = getStoredAdvisorsMap();
        if (!map[key]) {
            map[key] = { teacher1: "", teacher2: "", phone: "" };
            window.roomAdvisorsMap = map;
            localStorage.setItem("sbwk_room_advisors", JSON.stringify(map));
            renderTeachersAdvisorsView();
            showToast(`เพิ่มห้อง ม.${g}/${r} เข้าสู่ตารางเรียบร้อยแล้ว`, "success");
        } else {
            showToast(`ห้อง ม.${g}/${r} มีอยู่ในตารางอยู่แล้ว`, "info");
        }
    } else {
        showToast("รูปแบบไม่ถูกต้อง กรุณาระบุ เช่น 1/3 หรือ 4/2", "error");
    }
}

window.saveAllRoomAdvisors = async function() {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.saveAllRoomAdvisors(), "บันทึกข้อมูลครูที่ปรึกษา");
        return;
    }
    const container = document.getElementById("teachers-rooms-grid");
    if (!container) return;

    setLoader(true);
    const inputs = container.querySelectorAll("input[id^='adv-t1-']");
    const newMap = {};
    const upsertRows = [];

    inputs.forEach(in1 => {
        const idParts = in1.id.replace("adv-t1-", "").split("-");
        const g = idParts[0];
        const r = idParts[1];
        const in2 = document.getElementById(`adv-t2-${g}-${r}`);
        const inPhone = document.getElementById(`adv-phone-${g}-${r}`);

        const t1 = in1.value.trim();
        const t2 = in2 ? in2.value.trim() : "";
        const phone = inPhone ? inPhone.value.trim() : "";

        const key = `${g}/${r}`;
        newMap[key] = { teacher1: t1, teacher2: t2, phone: phone };

        upsertRows.push({
            grade: `ม.${g}`,
            room: r,
            teacher1: t1,
            teacher2: t2,
            phone: phone,
            updated_at: new Date().toISOString()
        });
    });

    window.roomAdvisorsMap = newMap;
    try {
        localStorage.setItem("sbwk_room_advisors", JSON.stringify(newMap));
    } catch (e) {}

    // พยายาม sync ลง Supabase
    const db = getStudentsSupabase();
    if (db) {
        try {
            await db.from('advisors').upsert(upsertRows, { onConflict: 'grade,room' });
        } catch (e) {
            console.warn("saveAllRoomAdvisors Supabase notice:", e);
        }
    }

    if (typeof renderStudentsDashboard === "function") {
        try {
            renderStudentsDashboard();
        } catch (e) {}
    }

    window.isTeachersEditMode = false;
    renderTeachersAdvisorsView();

    setLoader(false);
    showToast("บันทึกข้อมูลครูที่ปรึกษาทุกห้องเรียนเรียบร้อยแล้ว 💾✨", "success");
};

// =========================================================================
// 📊 สถิตินักเรียนและแดชบอร์ด (Student Analytics Dashboard)
// =========================================================================
window.calculateStudentDemographics = function() {
    const list = window.studentsRoster || [];
    const total = list.length;
    let inCount = 0;
    let outCount = 0;
    let totalMale = 0;
    let totalFemale = 0;

    let juniorTotal = 0;
    let juniorMale = 0;
    let juniorFemale = 0;
    let juniorIn = 0;
    let juniorOut = 0;

    let seniorTotal = 0;
    let seniorMale = 0;
    let seniorFemale = 0;
    let seniorIn = 0;
    let seniorOut = 0;

    const gradesData = {};
    for (let i = 1; i <= 6; i++) {
        gradesData[String(i)] = {
            total: 0, male: 0, female: 0, in: 0, out: 0,
            rooms: {}
        };
    }

    list.forEach(s => {
        const isOut = (s.status === "ออก");
        if (isOut) {
            outCount++;
        } else {
            inCount++;
        }

        const isM = (getStudentGenderSortKey(s) === 1);
        if (!isOut) {
            if (isM) totalMale++;
            else totalFemale++;
        }

        const gNum = parseInt(String(s.grade || "").replace(/[^0-9]/g, ""), 10);
        const rStr = String(s.room || "").replace(/[^0-9]/g, "") || "1";

        if (gNum >= 1 && gNum <= 3) {
            juniorTotal++;
            if (isOut) {
                juniorOut++;
            } else {
                juniorIn++;
                if (isM) juniorMale++;
                else juniorFemale++;
            }
        } else if (gNum >= 4 && gNum <= 6) {
            seniorTotal++;
            if (isOut) {
                seniorOut++;
            } else {
                seniorIn++;
                if (isM) seniorMale++;
                else seniorFemale++;
            }
        }

        const gKey = String(gNum);
        if (gradesData[gKey]) {
            gradesData[gKey].total++;
            if (isOut) {
                gradesData[gKey].out++;
            } else {
                gradesData[gKey].in++;
                if (isM) gradesData[gKey].male++;
                else gradesData[gKey].female++;
            }

            if (!gradesData[gKey].rooms[rStr]) {
                gradesData[gKey].rooms[rStr] = { total: 0, male: 0, female: 0, in: 0, out: 0 };
            }
            gradesData[gKey].rooms[rStr].total++;
            if (isOut) {
                gradesData[gKey].rooms[rStr].out++;
            } else {
                gradesData[gKey].rooms[rStr].in++;
                if (isM) gradesData[gKey].rooms[rStr].male++;
                else gradesData[gKey].rooms[rStr].female++;
            }
        }
    });

    const activeBase = inCount > 0 ? inCount : total;
    return {
        total, inCount, outCount,
        totalMale, totalFemale,
        malePct: activeBase > 0 ? ((totalMale / activeBase) * 100).toFixed(1) : "0",
        femalePct: activeBase > 0 ? ((totalFemale / activeBase) * 100).toFixed(1) : "0",
        junior: { total: juniorTotal, male: juniorMale, female: juniorFemale, in: juniorIn, out: juniorOut },
        senior: { total: seniorTotal, male: seniorMale, female: seniorFemale, in: seniorIn, out: seniorOut },
        grades: gradesData
    };
};

window.renderStudentsDashboard = function() {
    const data = calculateStudentDemographics();

    // 1. KPI Cards
    if (document.getElementById("dash-kpi-total")) document.getElementById("dash-kpi-total").innerHTML = `${data.inCount.toLocaleString()} <span style="font-size: 14px; font-weight: 600; color: #64748b;">คน</span>`;
    if (document.getElementById("dash-kpi-in")) document.getElementById("dash-kpi-in").innerText = data.inCount.toLocaleString();
    if (document.getElementById("dash-kpi-out")) document.getElementById("dash-kpi-out").innerText = data.outCount.toLocaleString();

    if (document.getElementById("dash-kpi-male")) document.getElementById("dash-kpi-male").innerText = data.totalMale.toLocaleString();
    if (document.getElementById("dash-kpi-female")) document.getElementById("dash-kpi-female").innerText = data.totalFemale.toLocaleString();
    if (document.getElementById("dash-gender-bar-male")) document.getElementById("dash-gender-bar-male").style.width = `${data.malePct}%`;
    if (document.getElementById("dash-kpi-male-pct")) document.getElementById("dash-kpi-male-pct").innerText = `ชาย ${data.malePct}%`;
    if (document.getElementById("dash-kpi-female-pct")) document.getElementById("dash-kpi-female-pct").innerText = `หญิง ${data.femalePct}%`;

    if (document.getElementById("dash-kpi-junior-total")) {
        const jOut = data.junior.out > 0 ? ` <span style="font-size: 11px; font-weight: 600; color: #ef4444;" title="ย้ายออก ${data.junior.out} คน">(ออก ${data.junior.out})</span>` : '';
        document.getElementById("dash-kpi-junior-total").innerHTML = `${data.junior.in.toLocaleString()} <span style="font-size: 13px; font-weight: 600; color: #64748b;">คน</span>${jOut}`;
    }
    if (document.getElementById("dash-kpi-junior-m")) document.getElementById("dash-kpi-junior-m").innerText = `${data.junior.male}`;
    if (document.getElementById("dash-kpi-junior-f")) document.getElementById("dash-kpi-junior-f").innerText = `${data.junior.female}`;

    if (document.getElementById("dash-kpi-senior-total")) {
        const sOut = data.senior.out > 0 ? ` <span style="font-size: 11px; font-weight: 600; color: #ef4444;" title="ย้ายออก ${data.senior.out} คน">(ออก ${data.senior.out})</span>` : '';
        document.getElementById("dash-kpi-senior-total").innerHTML = `${data.senior.in.toLocaleString()} <span style="font-size: 13px; font-weight: 600; color: #64748b;">คน</span>${sOut}`;
    }
    if (document.getElementById("dash-kpi-senior-m")) document.getElementById("dash-kpi-senior-m").innerText = `${data.senior.male}`;
    if (document.getElementById("dash-kpi-senior-f")) document.getElementById("dash-kpi-senior-f").innerText = `${data.senior.female}`;

    // 2. Matrix Table
    const tbody = document.getElementById("dash-matrix-tbody");
    if (tbody) {
        let tHtml = "";

        const renderSubtotalRow = (label, male, female, inC, outC, tot, bgColor, textColor, borderColor = "#cbd5e1", extraStyle = "") => `
            <tr style="background: ${bgColor}; font-weight: 800; color: ${textColor}; border-top: 1.5px solid ${borderColor}; border-bottom: 1.5px solid ${borderColor}; ${extraStyle}">
                <td style="padding: 10px 10px; text-align: center; white-space: nowrap; vertical-align: middle; font-size: 13.5px;">${label}</td>
                <td style="padding: 10px 8px; text-align: center; color: #1d4ed8; font-weight: 800; vertical-align: middle;">${male}</td>
                <td style="padding: 10px 8px; text-align: center; color: #c2410c; font-weight: 800; vertical-align: middle;">${female}</td>
                <td style="padding: 10px 8px; text-align: center; color: #15803d; font-weight: 800; vertical-align: middle;">${inC}</td>
                <td style="padding: 10px 8px; text-align: center; color: ${outC > 0 ? '#b91c1c' : '#94a3b8'}; font-weight: 800; vertical-align: middle;">${outC}</td>
                <td style="padding: 10px 8px; text-align: center; font-size: 15px; font-weight: 900; color: ${textColor}; vertical-align: middle;">${tot}</td>
                <td style="padding: 10px 16px; text-align: center; font-size: 13px; font-weight: 700; color: #94a3b8; vertical-align: middle;">-</td>
            </tr>
        `;

        const gradeStyles = {
            1: { subBg: "#e0f2fe", subText: "#0369a1", border: "#7dd3fc", badgeBg: "#e0f2fe", badgeColor: "#0369a1", badgeBorder: "#bae6fd" },
            2: { subBg: "#dcfce7", subText: "#15803d", border: "#86efac", badgeBg: "#dcfce7", badgeColor: "#15803d", badgeBorder: "#bbf7d0" },
            3: { subBg: "#f3e8ff", subText: "#6b21a8", border: "#d8b4fe", badgeBg: "#f3e8ff", badgeColor: "#6b21a8", badgeBorder: "#e9d5ff" },
            4: { subBg: "#ffedd5", subText: "#c2410c", border: "#fdba74", badgeBg: "#ffedd5", badgeColor: "#c2410c", badgeBorder: "#fed7aa" },
            5: { subBg: "#fce7f3", subText: "#9d174d", border: "#f472b6", badgeBg: "#fce7f3", badgeColor: "#9d174d", badgeBorder: "#fbcfe8" },
            6: { subBg: "#e0e7ff", subText: "#3730a3", border: "#a5b4fc", badgeBg: "#e0e7ff", badgeColor: "#3730a3", badgeBorder: "#c7d2fe" }
        };

        for (let g = 1; g <= 6; g++) {
            const gInf = data.grades[String(g)];
            const rKeys = Object.keys(gInf.rooms).sort((a, b) => Number(a) - Number(b));
            const st = gradeStyles[g] || gradeStyles[1];

            rKeys.forEach(r => {
                const rInf = gInf.rooms[r];
                const adv = getRoomAdvisorInfo(g, r);
                
                let teacherDisplay = '<span style="color: #94a3b8; font-style: italic; font-size: 12px;">- ยังไม่ได้ระบุ -</span>';
                if (adv) {
                    const t1 = (adv.teacher1 || "").trim();
                    const t2 = (adv.teacher2 || "").trim();
                    if (t1 && t2) {
                        teacherDisplay = `
                            <div style="display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; line-height: 1.35;">
                                <div style="white-space: nowrap;"><span style="color: #6366f1; font-weight: 800; margin-right: 4px;">1.</span>${t1}</div>
                                <div style="white-space: nowrap;"><span style="color: #6366f1; font-weight: 800; margin-right: 4px;">2.</span>${t2}</div>
                            </div>
                        `;
                    } else if (t1 || t2) {
                        teacherDisplay = `
                            <div style="white-space: nowrap; font-size: 12.5px; line-height: 1.35;">
                                <span style="color: #6366f1; font-weight: 800; margin-right: 4px;">1.</span>${t1 || t2}
                            </div>
                        `;
                    }
                }

                tHtml += `
                    <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                        <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #1e293b; white-space: nowrap; vertical-align: middle;">
                            <span style="background: ${st.badgeBg}; color: ${st.badgeColor}; border: 1px solid ${st.badgeBorder}; padding: 3px 10px; border-radius: 6px; font-weight: 800; display: inline-block; white-space: nowrap; font-size: 13px;">ชั้น ม.${g}/${r}</span>
                        </td>
                        <td style="padding: 8px; text-align: center; color: #2563eb; font-weight: 700; vertical-align: middle;">${rInf.male}</td>
                        <td style="padding: 8px; text-align: center; color: #ea580c; font-weight: 700; vertical-align: middle;">${rInf.female}</td>
                        <td style="padding: 8px; text-align: center; color: #16a34a; font-weight: 700; vertical-align: middle;">${rInf.in}</td>
                        <td style="padding: 8px; text-align: center; color: ${rInf.out > 0 ? '#dc2626' : '#94a3b8'}; font-weight: ${rInf.out > 0 ? '700' : 'normal'}; vertical-align: middle;">${rInf.out}</td>
                        <td style="padding: 8px; text-align: center; font-weight: 800; color: #0f172a; vertical-align: middle; font-size: 13.5px;">${rInf.in}</td>
                        <td style="padding: 8px 16px; text-align: left; color: #334155; vertical-align: middle;">
                            ${teacherDisplay}
                        </td>
                    </tr>
                `;
            });

            // แถวสรุประดับชั้น (รวม ม.g)
            tHtml += renderSubtotalRow(`⚡ รวมระดับชั้น ม.${g}`, gInf.male, gInf.female, gInf.in, gInf.out, gInf.in, st.subBg, st.subText, st.border);

            // แถวสรุปช่วงชั้น ม.ต้น (หลังจบ ม.3)
            if (g === 3) {
                tHtml += renderSubtotalRow(`🎒 รวม ม.ต้น`, data.junior.male, data.junior.female, data.junior.in, data.junior.out, data.junior.in, "#bbf7d0", "#14532d", "#16a34a", "font-size: 14.5px; border-top: 2.5px solid #16a34a; border-bottom: 2.5px solid #16a34a;");
            }
            // แถวสรุปช่วงชั้น ม.ปลาย (หลังจบ ม.6)
            if (g === 6) {
                tHtml += renderSubtotalRow(`🎓 รวม ม.ปลาย`, data.senior.male, data.senior.female, data.senior.in, data.senior.out, data.senior.in, "#fde68a", "#78350f", "#d97706", "font-size: 14.5px; border-top: 2.5px solid #d97706; border-bottom: 2.5px solid #d97706;");
            }
        }

        // แถวรวมทั้งโรงเรียน
        tHtml += `
            <tr style="background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); font-weight: 900; color: #3730a3; border-top: 2.5px solid #4f46e5; border-bottom: 2.5px solid #4f46e5; font-size: 14.5px;">
                <td style="padding: 12px 10px; text-align: center; white-space: nowrap;">
                    <i class="fa-solid fa-school-flag" style="margin-right: 6px;"></i> รวมทั้งโรงเรียน
                </td>
                <td style="padding: 12px 8px; text-align: center; color: #1d4ed8;">${data.totalMale}</td>
                <td style="padding: 12px 8px; text-align: center; color: #c2410c;">${data.totalFemale}</td>
                <td style="padding: 12px 8px; text-align: center; color: #15803d;">${data.inCount}</td>
                <td style="padding: 12px 8px; text-align: center; color: #b91c1c;">${data.outCount}</td>
                <td style="padding: 12px 8px; text-align: center; font-size: 16px; color: #312e81;">${data.inCount}</td>
                <td style="padding: 12px 16px; text-align: center; font-size: 12.5px; font-weight: 700; color: #6366f1;">ทุกระดับชั้น (ม.1 - ม.6)</td>
            </tr>
        `;

        tbody.innerHTML = tHtml;
    }
};

window.printDashboardA4Report = function() {
    window.currentPrintDocType = "dashboard_summary";
    const data = calculateStudentDemographics();
    const printableArea = document.getElementById("printable-a4-area");
    const previewModal = document.getElementById("modal-print-preview");
    if (!printableArea || !previewModal) return;

    const activeTerm = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.semester) ? String(window.GLOBAL_CONFIG.semester).replace(/[^0-9]/g, "") : "1";
    const activeYear = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.academicYear) ? String(window.GLOBAL_CONFIG.academicYear).replace(/[^0-9]/g, "") : "2569";
    const term = (document.getElementById("pdf-input-term")?.value || activeTerm).trim();
    const year = (document.getElementById("pdf-input-year")?.value || activeYear).trim();

    let tableRowsHtml = "";
    for (let g = 1; g <= 6; g++) {
        const gInf = data.grades[String(g)];
        const rKeys = Object.keys(gInf.rooms).sort((a, b) => Number(a) - Number(b));

        rKeys.forEach(r => {
            const rInf = gInf.rooms[r];
            const adv = getRoomAdvisorInfo(g, r);
            let teacherDisplay = '-';
            if (adv) {
                const t1 = (adv.teacher1 || "").trim();
                const t2 = (adv.teacher2 || "").trim();
                if (t1 && t2) {
                    teacherDisplay = `1. ${t1}<br>2. ${t2}`;
                } else if (t1 || t2) {
                    teacherDisplay = `1. ${t1 || t2}`;
                }
            }

            tableRowsHtml += `
                <tr style="height: 24px; font-size: 13px;">
                    <td style="border: 0.6px solid black; text-align: center; vertical-align: middle;">ม.${g}/${r}</td>
                    <td style="border: 0.6px solid black; text-align: center; vertical-align: middle;">${rInf.male}</td>
                    <td style="border: 0.6px solid black; text-align: center; vertical-align: middle;">${rInf.female}</td>
                    <td style="border: 0.6px solid black; text-align: center; font-weight: bold; vertical-align: middle;">${rInf.in}</td>
                    <td style="border: 0.6px solid black; text-align: center; color: ${rInf.out > 0 ? 'red' : 'black'}; vertical-align: middle;">${rInf.out}</td>
                    <td style="border: 0.6px solid black; text-align: center; font-weight: bold; vertical-align: middle;">${rInf.in}</td>
                    <td style="border: 0.6px solid black; text-align: left; padding: 3px 8px; vertical-align: middle; line-height: 1.3;">${teacherDisplay}</td>
                </tr>
            `;
        });

        // แถวรวมชั้น
        tableRowsHtml += `
            <tr style="height: 24px; font-size: 13px; font-weight: bold; background: #f1f5f9;">
                <td style="border: 0.6px solid black; text-align: center; white-space: nowrap;">รวม ม.${g}</td>
                <td style="border: 0.6px solid black; text-align: center;">${gInf.male}</td>
                <td style="border: 0.6px solid black; text-align: center;">${gInf.female}</td>
                <td style="border: 0.6px solid black; text-align: center;">${gInf.in}</td>
                <td style="border: 0.6px solid black; text-align: center;">${gInf.out}</td>
                <td style="border: 0.6px solid black; text-align: center;">${gInf.in}</td>
                <td style="border: 0.6px solid black; text-align: center;">-</td>
            </tr>
        `;

        if (g === 3) {
            tableRowsHtml += `
                <tr style="height: 25px; font-size: 13.5px; font-weight: bold; background: #dcfce7;">
                    <td style="border: 0.6px solid black; text-align: center; white-space: nowrap;">รวม ม.ต้น</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.junior.male}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.junior.female}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.junior.in}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.junior.out}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.junior.in}</td>
                    <td style="border: 0.6px solid black; text-align: center;">-</td>
                </tr>
            `;
        } else if (g === 6) {
            tableRowsHtml += `
                <tr style="height: 25px; font-size: 13.5px; font-weight: bold; background: #fef3c7;">
                    <td style="border: 0.6px solid black; text-align: center; white-space: nowrap;">รวม ม.ปลาย</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.senior.male}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.senior.female}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.senior.in}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.senior.out}</td>
                    <td style="border: 0.6px solid black; text-align: center;">${data.senior.in}</td>
                    <td style="border: 0.6px solid black; text-align: center;">-</td>
                </tr>
            `;
        }
    }

    tableRowsHtml += `
        <tr style="height: 26px; font-size: 14px; font-weight: bold; background: #cbd5e1;">
            <td style="border: 0.8px solid black; text-align: center; white-space: nowrap;">รวมทั้งโรงเรียน</td>
            <td style="border: 0.8px solid black; text-align: center;">${data.totalMale}</td>
            <td style="border: 0.8px solid black; text-align: center;">${data.totalFemale}</td>
            <td style="border: 0.8px solid black; text-align: center;">${data.inCount}</td>
            <td style="border: 0.8px solid black; text-align: center;">${data.outCount}</td>
            <td style="border: 0.8px solid black; text-align: center;">${data.inCount}</td>
            <td style="border: 0.8px solid black; text-align: center;">ทุกระดับชั้น</td>
        </tr>
    `;

    printableArea.innerHTML = `
        <div class="a4-official-page" style="padding: 12mm 10mm 10mm;">
            <div style="display: flex; align-items: center; position: relative; margin-bottom: 12px; min-height: 52px;">
                <img src="${window.SCHOOL_LOGO_BASE64 || 'logo.png'}" alt="Logo" style="position: absolute; left: 0; top: 0; width: 50px; height: 50px; object-fit: contain;">
                <div style="width: 100%; text-align: center; padding: 0 55px;">
                    <div style="font-size: 16px; font-weight: bold; color: black; line-height: 1.3;">
                        รายงานสรุปสถิติจำนวนนักเรียน โรงเรียนซับบอนวิทยาคม
                    </div>
                    <div style="font-size: 14px; color: black; margin-top: 3px;">
                        ภาคเรียนที่ ${term} ปีการศึกษา ${year} (ข้อมูล ณ วันที่ ${formatThaiDateDisplay(getTodayIsoDate())})
                    </div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; border: 1px solid black; font-family: 'Sarabun', sans-serif;">
                <thead>
                    <tr style="background: #e2e8f0; height: 32px; font-size: 13px; font-weight: bold;">
                        <th style="border: 0.6px solid black; width: 105px; text-align: center; white-space: nowrap;">ระดับชั้น</th>
                        <th style="border: 0.6px solid black; width: 55px; text-align: center;">ชาย</th>
                        <th style="border: 0.6px solid black; width: 55px; text-align: center;">หญิง</th>
                        <th style="border: 0.6px solid black; width: 70px; text-align: center;">กำลังศึกษา</th>
                        <th style="border: 0.6px solid black; width: 50px; text-align: center;">ออก</th>
                        <th style="border: 0.6px solid black; width: 70px; text-align: center;">รวม (ปกติ)</th>
                        <th style="border: 0.6px solid black; text-align: center;">ครูที่ปรึกษา</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>

            <div style="display: flex; justify-content: space-around; margin-top: 35px; font-size: 13.5px; font-family: 'Sarabun', sans-serif; text-align: center;">
                <div>
                    <div>ลงชื่อ ................................................................ ผู้รายงาน</div>
                    <div style="margin-top: 4px;">( ................................................................ )</div>
                    <div style="margin-top: 4px;">เจ้าหน้าที่งานทะเบียนนักเรียน</div>
                </div>
                <div>
                    <div>ลงชื่อ ................................................................ ผู้รับรอง</div>
                    <div style="margin-top: 4px;">( ................................................................ )</div>
                    <div style="margin-top: 4px;">ผู้อำนวยการโรงเรียนซับบอนวิทยาคม</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById("print-preview-modal-title").innerHTML = `<i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i> พรีวิวรายงานสรุปสถิติจำนวนนักเรียน (A4)`;
    previewModal.style.display = "flex";
};

window.exportDashboardSummaryExcel = async function() {
    if (typeof ExcelJS === "undefined") {
        showToast("ไม่พบไลบรารี ExcelJS กรุณาลองใหม่อีกครั้ง", "error");
        return;
    }

    setLoader(true);
    try {
        const data = calculateStudentDemographics();
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "SBWK Management System";
        workbook.created = new Date();

        const sheet = workbook.addWorksheet("สรุปสถิตินักเรียน", {
            pageSetup: { paperSize: 9, orientation: 'portrait' }
        });

        // 1. Title Rows
        sheet.mergeCells('A1:G1');
        sheet.getCell('A1').value = "รายงานสรุปสถิติจำนวนนักเรียน โรงเรียนซับบอนวิทยาคม";
        sheet.getCell('A1').font = { name: 'TH SarabunPSK', size: 20, bold: true };
        sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 36;

        sheet.mergeCells('A2:G2');
        sheet.getCell('A2').value = `ข้อมูล ณ วันที่ ${formatThaiDateDisplay(getTodayIsoDate())} (นักเรียนทั้งหมด ${data.inCount} คน)`;
        sheet.getCell('A2').font = { name: 'TH SarabunPSK', size: 14, italic: true };
        sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(2).height = 26;

        // Helper to fill background color only for columns A-G (columns 1 to 7)
        const fillRowAG = (targetRow, argbColor) => {
            for (let c = 1; c <= 7; c++) {
                targetRow.getCell(c).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: argbColor }
                };
            }
        };

        // 2. Headers
        const headers = ["ระดับชั้น / ห้อง", "ชาย (คน)", "หญิง (คน)", "กำลังศึกษา (คน)", "ย้ายออก (คน)", "รวม (ปกติ) (คน)", "ครูที่ปรึกษา"];
        const headerRow = sheet.addRow(headers);
        headerRow.font = { name: 'TH SarabunPSK', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        fillRowAG(headerRow, 'FF4F46E5');
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 34;

        sheet.columns = [
            { key: 'room', width: 22 },
            { key: 'male', width: 14 },
            { key: 'female', width: 14 },
            { key: 'in', width: 18 },
            { key: 'out', width: 14 },
            { key: 'total', width: 18 },
            { key: 'advisor', width: 36 }
        ];

        // 3. Data Rows
        for (let g = 1; g <= 6; g++) {
            const gInf = data.grades[String(g)];
            const rKeys = Object.keys(gInf.rooms).sort((a, b) => Number(a) - Number(b));

            rKeys.forEach(r => {
                const rInf = gInf.rooms[r];
                const adv = getRoomAdvisorInfo(g, r);
                let teacherDisplay = '-';
                if (adv) {
                    const t1 = (adv.teacher1 || "").trim();
                    const t2 = (adv.teacher2 || "").trim();
                    if (t1 && t2) {
                        teacherDisplay = `1. ${t1}\n2. ${t2}`;
                    } else if (t1 || t2) {
                        teacherDisplay = `1. ${t1 || t2}`;
                    }
                }

                const row = sheet.addRow([
                    `ม.${g}/${r}`,
                    rInf.male,
                    rInf.female,
                    rInf.in,
                    rInf.out,
                    rInf.in,
                    teacherDisplay
                ]);
                row.font = { name: 'TH SarabunPSK', size: 16 };
                row.height = 50;
                row.alignment = { vertical: 'middle', wrapText: true };
                row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
                for (let c = 2; c <= 6; c++) row.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' };
                row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            });

            // Subtotal grade
            const excelGradeColors = {
                1: 'FFE0F2FE', // ม.1 ฟ้าสดใส
                2: 'FFDCFCE7', // ม.2 เขียวมิ้นต์
                3: 'FFF3E8FF', // ม.3 ม่วงพาสเทล
                4: 'FFFFEDD5', // ม.4 ส้มพีช
                5: 'FFFCE7F3', // ม.5 ชมพูกุหลาบ
                6: 'FFE0E7FF'  // ม.6 อินดิโก
            };
            const subRow = sheet.addRow([
                `รวม ม.${g}`,
                gInf.male,
                gInf.female,
                gInf.in,
                gInf.out,
                gInf.in,
                "-"
            ]);
            subRow.font = { name: 'TH SarabunPSK', size: 16, bold: true };
            subRow.height = 50;
            fillRowAG(subRow, excelGradeColors[g] || 'FFF1F5F9');
            subRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
            for (let c = 2; c <= 6; c++) subRow.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' };
            subRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };

            if (g === 3) {
                const junRow = sheet.addRow([
                    `รวม ม.ต้น`,
                    data.junior.male,
                    data.junior.female,
                    data.junior.in,
                    data.junior.out,
                    data.junior.in,
                    "-"
                ]);
                junRow.font = { name: 'TH SarabunPSK', size: 16.5, bold: true };
                junRow.height = 50;
                fillRowAG(junRow, 'FFBBF7D0');
                junRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
                for (let c = 2; c <= 6; c++) junRow.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' };
                junRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
            } else if (g === 6) {
                const senRow = sheet.addRow([
                    `รวม ม.ปลาย`,
                    data.senior.male,
                    data.senior.female,
                    data.senior.in,
                    data.senior.out,
                    data.senior.in,
                    "-"
                ]);
                senRow.font = { name: 'TH SarabunPSK', size: 16.5, bold: true };
                senRow.height = 50;
                fillRowAG(senRow, 'FFFDE68A');
                senRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
                for (let c = 2; c <= 6; c++) senRow.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' };
                senRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
            }
        }

        // Grand total
        const grandRow = sheet.addRow([
            `รวมทั้งโรงเรียน`,
            data.totalMale,
            data.totalFemale,
            data.inCount,
            data.outCount,
            data.inCount,
            "ทุกระดับชั้น"
        ]);
        grandRow.font = { name: 'TH SarabunPSK', size: 17, bold: true, color: { argb: 'FF312E81' } };
        grandRow.height = 50;
        fillRowAG(grandRow, 'FFE0E7FF');
        grandRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        for (let c = 2; c <= 6; c++) grandRow.getCell(c).alignment = { vertical: 'middle', horizontal: 'center' };
        grandRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };

        // Borders (Columns A-G only)
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber >= 3) {
                for (let c = 1; c <= 7; c++) {
                    row.getCell(c).border = {
                        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                    };
                }
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `สรุปสถิตินักเรียน_ซับบอนวิทยาคม_${getTodayIsoDate()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast("ดาวน์โหลดไฟล์ Excel สรุปสถิติเรียบร้อย ⚡", "success");
    } catch (err) {
        console.error("exportDashboardSummaryExcel error:", err);
        showToast("เกิดข้อผิดพลาดในการส่งออก Excel", "error");
    } finally {
        setLoader(false);
    }
};

// =========================================================================
// ปุ่มสลับสถานะ "เข้า / ออก" (หากเปลี่ยนเป็น ออก จะมี Modal ให้ระบุเหตุผลและวันที่)
// =========================================================================
window.toggleStudentStatus = async function(studentId) {
    ensureAcademicAuth(() => {
        executeToggleStudentStatus(studentId);
    }, "เปลี่ยนสถานะนักเรียน");
};

function executeToggleStudentStatus(studentId) {
    const sId = String(studentId);
    const target = (window.studentsRoster || []).find(s => s.studentId === sId);
    if (!target) return;

    if (target.status === "เข้า") {
        // หากต้องการเปลี่ยนเป็น 'ออก' -> เปิดป๊อปอัปให้ระบุหมายเหตุและวันที่ออกทันที
        openStudentOutModal(target);
    } else {
        // หากต้องการเปลี่ยนกลับมาเป็น 'เข้า' -> เปิดป๊อปอัปยืนยันแบบสวยงาม (ไม่ใช้ confirm ของเบราว์เซอร์)
        openStudentInConfirmModal(target);
    }
}

// =========================================================================
// ป๊อปอัป (Modal) ยืนยันเปลี่ยนสถานะกลับเป็น "กำลังศึกษา (เข้า)" สวยงาม
// =========================================================================
window.openStudentInConfirmModal = function(student) {
    const modal = document.getElementById("modal-student-in-confirm");
    if (!modal) return;

    document.getElementById("in-confirm-student-id").value = student.studentId;
    const isMale = (student.fullName || "").includes("ด.ช.") || (student.fullName || "").includes("นาย") || student.gender === "1";
    document.getElementById("in-confirm-avatar").innerText = isMale ? "👦" : "👧";
    document.getElementById("in-confirm-student-name").innerText = student.fullName;
    document.getElementById("in-confirm-student-sub").innerText = `รหัส นร.: ${student.studentId} | ชั้น: ${student.grade}/${student.room} | เลขที่: ${student.no || '-'}`;

    modal.style.display = "flex";
};

window.closeStudentInConfirmModal = function() {
    const modal = document.getElementById("modal-student-in-confirm");
    if (modal) modal.style.display = "none";
};

window.submitStudentInConfirmModal = async function() {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.submitStudentInConfirmModal(), "เปลี่ยนสถานะนักเรียน");
        return;
    }
    const sId = document.getElementById("in-confirm-student-id").value;
    const target = (window.studentsRoster || []).find(s => s.studentId === sId);
    if (!target) {
        closeStudentInConfirmModal();
        return;
    }

    target.status = "เข้า";
    target.outReason = "";
    target.outDate = "";
    setLocalStatus(sId, "เข้า", "", "");

    // ⭐️ รันเลขที่ในห้องนั้นใหม่ (ดึงกลับมาเป็น 1..N ต่อเนื่อง) และจัดเรียง
    const updates = resequenceRoomNumbers(target.grade, target.room);
    window.studentsRoster = sortStudentsRoster(window.studentsRoster);

    renderStudentList();
    updateSummaryCounters();
    closeStudentInConfirmModal();

    const db = getStudentsSupabase();
    if (db) {
        try {
            for (let u of updates) {
                await db.from('std').update({
                    no: u.no,
                    status: u.status,
                    out_reason: u.out_reason,
                    out_date: u.out_date
                }).eq('student_id', u.student_id);
            }
        } catch (e) {
            console.warn("submitStudentInConfirmModal sync error:", e);
        }
    }

    showToast(`เปลี่ยนสถานะ ${target.fullName}: กำลังศึกษา (เข้า) ได้เลขที่ ${target.no} 🟢 เรียบร้อย`, "success");
};

// =========================================================================
// ป๊อปอัป (Modal) ระบุหมายเหตุและวันที่ออก / จำหน่าย
// =========================================================================
window.openStudentOutModal = function(student) {
    const modal = document.getElementById("modal-student-out-reason");
    if (!modal) return;

    document.getElementById("out-modal-student-id").value = student.studentId;
    const isMale = (student.fullName || "").includes("ด.ช.") || (student.fullName || "").includes("นาย") || student.gender === "1";
    document.getElementById("out-modal-student-avatar").innerText = isMale ? "👦" : "👧";
    document.getElementById("out-modal-student-name").innerText = student.fullName;
    document.getElementById("out-modal-student-sub").innerText = `รหัส นร.: ${student.studentId} | ชั้น: ${student.grade}/${student.room} | เลขที่: ${student.no || '-'}`;

    const reasonInput = document.getElementById("out-modal-reason-input");
    reasonInput.value = student.outReason || "ย้าย รร";

    const dateInput = document.getElementById("out-modal-date-input");
    dateInput.value = student.outDate || getTodayIsoDate();

    updateOutModalPreview();

    reasonInput.oninput = updateOutModalPreview;
    dateInput.onchange = updateOutModalPreview;

    modal.style.display = "flex";
    setTimeout(() => {
        reasonInput.focus();
        reasonInput.select();
    }, 60);
};

window.closeStudentOutModal = function() {
    const modal = document.getElementById("modal-student-out-reason");
    if (modal) modal.style.display = "none";
};

window.setOutReasonChip = function(reason) {
    const input = document.getElementById("out-modal-reason-input");
    if (input) {
        input.value = reason;
        updateOutModalPreview();
        input.focus();
    }
};

window.setOutDateToday = function() {
    const input = document.getElementById("out-modal-date-input");
    if (input) {
        input.value = getTodayIsoDate();
        updateOutModalPreview();
    }
};

function updateOutModalPreview() {
    const nameEl = document.getElementById("out-modal-student-name");
    const reasonInput = document.getElementById("out-modal-reason-input");
    const dateInput = document.getElementById("out-modal-date-input");
    const previewEl = document.getElementById("out-modal-preview-text");
    const datePreviewEl = document.getElementById("out-modal-date-preview");

    const name = nameEl ? nameEl.innerText : "...";
    const reason = (reasonInput ? reasonInput.value : "").trim() || "ย้าย รร";
    const dateVal = dateInput ? dateInput.value : "";
    const thaiDate = formatThaiDateDisplay(dateVal);

    if (datePreviewEl) {
        datePreviewEl.innerText = dateVal ? `รูปแบบไทย: ${thaiDate}` : "";
    }

    if (previewEl) {
        const remark = thaiDate ? `${reason} ${thaiDate}` : reason;
        previewEl.innerText = `${name} (${remark})`;
    }
}

window.submitStudentOutModal = async function() {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.submitStudentOutModal(), "เปลี่ยนสถานะนักเรียน");
        return;
    }
    const sId = document.getElementById("out-modal-student-id").value;
    const target = (window.studentsRoster || []).find(s => s.studentId === sId);
    if (!target) {
        closeStudentOutModal();
        return;
    }

    const reason = (document.getElementById("out-modal-reason-input").value || "").trim() || "ย้าย รร";
    const date = document.getElementById("out-modal-date-input").value || getTodayIsoDate();

    target.status = "ออก";
    target.outReason = reason;
    target.outDate = date;
    target.no = 99; // ⭐️ ตั้งเลขที่ 99 ทันที
    setLocalStatus(sId, "ออก", reason, date);

    // ⭐️ รันเลขที่ในห้องนั้นใหม่ (คนเข้าได้ 1..N ต่อเนื่อง คนออกได้ 99 ไปอยู่ท้าย)
    const updates = resequenceRoomNumbers(target.grade, target.room);
    window.studentsRoster = sortStudentsRoster(window.studentsRoster);

    renderStudentList();
    updateSummaryCounters();
    closeStudentOutModal();

    const db = getStudentsSupabase();
    if (db) {
        try {
            for (let u of updates) {
                await db.from('std').update({
                    no: u.no,
                    status: u.status,
                    out_reason: u.out_reason,
                    out_date: u.out_date
                }).eq('student_id', u.student_id);
            }
        } catch (e) {
            console.warn("submitStudentOutModal sync error:", e);
        }
    }

    const thaiDate = formatThaiDateDisplay(date);
    showToast(`เปลี่ยนสถานะ ${target.fullName} เป็นออก (เลขที่ 99 ย้ายไปอยู่ท้ายห้อง) เรียบร้อย 🔴`, "info");
};

window.toggleStudentModalOutFields = function(statusVal) {
    const outFields = document.getElementById("modal-student-out-fields");
    if (!outFields) return;
    if (statusVal === "ออก") {
        outFields.style.display = "block";
        const reasonIn = document.getElementById("input-student-out-reason");
        const dateIn = document.getElementById("input-student-out-date");
        if (reasonIn && !reasonIn.value) reasonIn.value = "ย้าย รร";
        if (dateIn && !dateIn.value) dateIn.value = getTodayIsoDate();
    } else {
        outFields.style.display = "none";
    }
};

function updateSingleStudentRowUI(s) {
    renderSingleStudentRowView(s);
}

// =========================================================================
// Filter & Render
// =========================================================================
function isGradeMatch(studentGrade, filterGrade) {
    if (!filterGrade || filterGrade === "ALL") return true;
    const cleanStd = String(studentGrade || "").replace(/[^0-9]/g, "");
    const cleanFilt = String(filterGrade || "").replace(/[^0-9]/g, "");
    if (cleanStd && cleanFilt) return cleanStd === cleanFilt;
    return String(studentGrade || "").trim() === String(filterGrade || "").trim();
}

function isRoomMatch(studentRoom, filterRoom) {
    if (!filterRoom || filterRoom === "ALL") return true;
    const cleanStd = String(studentRoom || "").replace(/[^0-9]/g, "");
    const cleanFilt = String(filterRoom || "").replace(/[^0-9]/g, "");
    if (cleanStd && cleanFilt) return cleanStd === cleanFilt;
    return String(studentRoom || "").trim() === String(filterRoom || "").trim();
}

// =========================================================================
// สร้างตัวเลือกดรอปดาวน์ ชั้น/ห้อง (เช่น ม.1/1) ในแถบเดียว
// =========================================================================
function populateClassRoomDropdown() {
    const sel = document.getElementById("class-room-select");
    if (!sel) return;

    const currentVal = sel.value || "ALL";

    // รวบรวมระดับชั้นและห้องทั้งหมดจาก studentsRoster
    const classMap = {};
    (window.studentsRoster || []).forEach(s => {
        const cleanGrade = String(s.grade || "").replace(/[^0-9]/g, "").trim();
        const cleanRoom = String(s.room || "").replace(/[^0-9]/g, "").trim();
        if (cleanGrade) {
            if (!classMap[cleanGrade]) {
                classMap[cleanGrade] = new Set();
            }
            if (cleanRoom) {
                classMap[cleanGrade].add(cleanRoom);
            }
        }
    });

    const sortedGrades = Object.keys(classMap).sort((a, b) => Number(a) - Number(b));

    let html = `<option value="ALL">🏫 ทุกระดับชั้น / ทุกห้อง</option>`;

    sortedGrades.forEach(g => {
        const rooms = Array.from(classMap[g]).sort((a, b) => Number(a) - Number(b));
        // รวมเป็น "ชั้นมัธยมศึกษาปีที่ X (ทุกห้อง)" ให้กดเลือกได้เลยโดยตรง ประหยัดพื้นที่
        html += `<option value="GRADE_${g}" style="font-weight: 700;">ชั้นมัธยมศึกษาปีที่ ${g} (ทุกห้อง)</option>`;
        rooms.forEach(r => {
            html += `<option value="${g}/${r}">&nbsp;&nbsp;&nbsp;&nbsp;ม.${g}/${r}</option>`;
        });
    });

    sel.innerHTML = html;

    // ตรวจสอบและตั้งค่าเดิมกลับคืน
    const optionExists = Array.from(sel.options).some(opt => opt.value === currentVal);
    if (optionExists) {
        sel.value = currentVal;
    } else {
        sel.value = "ALL";
    }
}

// =========================================================================
// Helpers สำหรับ Sheet Mode, Auto-Detect เพศ และตรวจสอบข้อมูลที่ยังไม่เซฟ
// =========================================================================

// ตรวจจับเพศอัตโนมัติจากคำนำหน้าชื่อ (1 = ชาย, 2 = หญิง)
window.autoDetectGenderFromName = function(name) {
    if (!name) return null;
    const clean = String(name).trim();
    if (
        clean.startsWith("ด.ญ.") ||
        clean.startsWith("ด.ญ ") ||
        clean.startsWith("เด็กหญิง") ||
        clean.startsWith("น.ส.") ||
        clean.startsWith("น.ส ") ||
        clean.startsWith("นางสาว") ||
        clean.startsWith("นาง ")
    ) {
        return "2";
    }
    if (
        clean.startsWith("ด.ช.") ||
        clean.startsWith("ด.ช ") ||
        clean.startsWith("เด็กชาย") ||
        clean.startsWith("นาย")
    ) {
        return "1";
    }
    return null;
};

// จัดการเมื่อพิมพ์ชื่อในตาราง (Sheet Mode / Inline Edit) เพื่อเปลี่ยนเพศอัตโนมัติทันที
window.handleSheetNameInput = function(input) {
    const tr = input.closest("tr");
    if (!tr) return;
    const detectedGender = window.autoDetectGenderFromName(input.value);
    if (detectedGender) {
        const genderSelect = tr.querySelector("select[data-field='gender'], select[data-inline-field='gender']");
        if (genderSelect && genderSelect.value !== detectedGender) {
            genderSelect.value = detectedGender;
            genderSelect.style.transition = "background-color 0.3s";
            genderSelect.style.backgroundColor = detectedGender === "1" ? "#dbeafe" : "#fce7f3";
            setTimeout(() => {
                genderSelect.style.backgroundColor = "";
            }, 800);
        }
    }
};

// ตรวจสอบว่าในตารางมีข้อมูลที่ยังไม่ได้กดบันทึกหรือไม่ (ป้องกันข้อมูลหายเมื่อฟิลเตอร์หรือค้นหา)
window.hasUnsavedSheetChanges = function() {
    const table = document.getElementById("students-table");
    if (!table) return false;

    // 1. มีแถวใหม่ที่ยังไม่ได้บันทึก
    if (table.querySelector("tbody tr[data-is-new='true']")) return true;

    // 2. มีแถวที่กำลังเปิดแก้ไขแบบ Inline อยู่
    if (table.querySelector("tbody tr.is-inline-editing")) return true;

    // 3. หากอยู่ในโหมดตาราง Sheet Mode ให้ตรวจว่ามีค่าใดถูกแก้ไขต่างจาก roster หรือไม่
    if (window.isSheetEditMode) {
        const rows = table.querySelectorAll("tbody tr[data-student-id]");
        for (const tr of rows) {
            const sId = tr.getAttribute("data-student-id");
            if (!sId || sId.startsWith("NEW_")) return true;
            const orig = (window.studentsRoster || []).find(x => String(x.studentId) === sId);
            if (!orig) return true;

            const nameInput = tr.querySelector("[data-field='fullName']");
            if (nameInput && nameInput.value.trim() !== (orig.fullName || "")) return true;

            const gradeInput = tr.querySelector("[data-field='grade']");
            const origGrade = String(orig.grade || "").replace(/[^0-9]/g, "") || "1";
            if (gradeInput && gradeInput.value !== origGrade) return true;

            const roomInput = tr.querySelector("[data-field='room']");
            const origRoom = String(orig.room || "1").replace(/[^0-9]/g, "") || "1";
            if (roomInput && roomInput.value.trim() !== origRoom) return true;

            const genderInput = tr.querySelector("[data-field='gender']");
            const origGender = orig.gender || (typeof getStudentGenderSortKey === "function" && getStudentGenderSortKey(orig) === 1 ? "1" : "2");
            if (genderInput && genderInput.value !== origGender) return true;

            const statusInput = tr.querySelector("[data-field='status']");
            const origStatus = orig.status || "เข้า";
            if (statusInput && statusInput.value !== origStatus) return true;
        }
    }

    return false;
};

// คำนวณเลขที่ถัดไปตามห้องและระดับชั้นจริง (ไม่ใช้จำนวนรวมทั้งโรงเรียน และข้ามคนออก/เลขที่ 99)
window.getNextClassStudentNumber = function(targetGrade, targetRoom) {
    const cleanG = String(targetGrade || "").replace(/[^0-9]/g, "");
    const cleanR = String(targetRoom || "").replace(/[^0-9]/g, "");

    let maxNo = 0;
    let count = 0;
    (window.studentsRoster || []).forEach(s => {
        const sg = String(s.grade || "").replace(/[^0-9]/g, "");
        const sr = String(s.room || "").replace(/[^0-9]/g, "");
        if (sg === cleanG && sr === cleanR) {
            const n = parseInt(s.no, 10);
            // ⭐️ ข้ามคนที่สถานะ "ออก" หรือเลขที่ >= 99 เพื่อไม่ให้เลขที่กระโดดเป็น 100
            if (s.status === "ออก" || (!isNaN(n) && n >= 99)) return;
            count++;
            if (!isNaN(n) && n > maxNo) maxNo = n;
        }
    });

    const newRows = document.querySelectorAll("#students-table tbody tr[data-is-new='true']");
    newRows.forEach(tr => {
        const gSel = tr.querySelector("[data-field='grade']");
        const rInput = tr.querySelector("[data-field='room']");
        const stSel = tr.querySelector("[data-field='status']");
        if (stSel && stSel.value === "ออก") return;
        const rowG = gSel ? String(gSel.value || "").replace(/[^0-9]/g, "") : "";
        const rowR = rInput ? String(rInput.value || "").replace(/[^0-9]/g, "") : "";
        if (rowG === cleanG && rowR === cleanR) {
            count++;
        }
    });

    return Math.max(maxNo, count) + 1;
};

// อัปเดตเลขที่คาดหมายเมื่อเปลี่ยนระดับชั้นหรือห้องในแถวใหม่
window.handleSheetClassChange = function(el) {
    const tr = el.closest("tr");
    if (!tr || tr.getAttribute("data-is-new") !== "true") return;

    const gradeInput = tr.querySelector("[data-field='grade']");
    const roomInput = tr.querySelector("[data-field='room']");
    const noInput = tr.querySelector("input[data-field='no']");
    const noBadge = tr.querySelector("[data-role='new-badge']");

    if (gradeInput && roomInput) {
        const nextNo = window.getNextClassStudentNumber(gradeInput.value, roomInput.value);
        if (noInput) noInput.value = nextNo;
        if (noBadge) {
            noBadge.innerHTML = `<i class="fa-solid fa-plus"></i> แถวใหม่ (${nextNo})`;
            noBadge.title = `เลขที่คาดหมายในห้อง: ${nextNo} (ม.${gradeInput.value}/${roomInput.value})`;
        }
    }
};

// จัดการเมื่อพิมพ์ในช่องค้นหา เพื่อป้องกันข้อมูลใน Sheet Mode หลุดหาย
window.handleStudentSearchInput = function(input) {
    if (window.isSheetEditMode && window.hasUnsavedSheetChanges()) {
        const confirmDiscard = confirm("คุณมีข้อมูลที่กำลังแก้ไขหรือยังไม่ได้บันทึกในตาราง\nหากพิมพ์ค้นหา ข้อมูลที่กำลังแก้ไขจะสูญหาย\n\nต้องการละทิ้งการแก้ไขและค้นหาหรือไม่?");
        if (!confirmDiscard) {
            input.value = "";
            return;
        }
    }
    window.renderStudentList();
};

window.onClassRoomFilterChange = function(val) {
    if (window.isSheetEditMode && window.hasUnsavedSheetChanges()) {
        const confirmDiscard = confirm("คุณมีข้อมูลที่กำลังแก้ไขหรือยังไม่ได้บันทึกในตาราง\nหากเปลี่ยนชั้น/ห้อง ข้อมูลที่กำลังแก้ไขจะสูญหาย\n\nต้องการเปลี่ยนชั้น/ห้องและยกเลิกการแก้ไขหรือไม่?");
        if (!confirmDiscard) {
            const sel = document.getElementById("class-room-select");
            if (sel) {
                if (window.activeGradeFilter === "ALL" && window.activeRoomFilter === "ALL") {
                    sel.value = "ALL";
                } else if (window.activeRoomFilter === "ALL") {
                    sel.value = `GRADE_${window.activeGradeFilter}`;
                } else {
                    sel.value = `${window.activeGradeFilter}/${window.activeRoomFilter}`;
                }
            }
            return;
        }
    }
    if (!val || val === "ALL") {
        window.activeGradeFilter = "ALL";
        window.activeRoomFilter = "ALL";
    } else if (val.startsWith("GRADE_")) {
        window.activeGradeFilter = val.replace("GRADE_", "").trim();
        window.activeRoomFilter = "ALL";
    } else if (val.includes("/")) {
        const parts = val.split("/");
        window.activeGradeFilter = parts[0].trim();
        window.activeRoomFilter = parts[1].trim();
    }
    renderStudentList();
};

window.setStatusFilter = function(status, btn) {
    if (window.isSheetEditMode && window.hasUnsavedSheetChanges()) {
        const confirmDiscard = confirm("คุณมีข้อมูลที่กำลังแก้ไขหรือยังไม่ได้บันทึกในตาราง\nหากเปลี่ยนตัวกรอง ข้อมูลที่กำลังแก้ไขจะสูญหาย\n\nต้องการเปลี่ยนตัวกรองและยกเลิกการแก้ไขหรือไม่?");
        if (!confirmDiscard) return;
    }
    window.activeStatusFilter = status;
    document.querySelectorAll("#status-pills .filter-pill").forEach(p => p.classList.remove("active"));
    if (btn) btn.classList.add("active");
    renderStudentList();
};

// =========================================================================
// สลับโหมดแก้ไขตารางเหมือน Google Sheet (Sheet Edit Mode)
// =========================================================================
window.toggleSheetEditMode = function() {
    if (!window.isSheetEditMode) {
        ensureAcademicAuth(() => {
            executeToggleSheetEditMode();
        }, "เปิดโหมดแก้ไขตาราง");
    } else {
        executeToggleSheetEditMode();
    }
};

function executeToggleSheetEditMode() {
    if (window.isSheetEditMode && window.hasUnsavedSheetChanges()) {
        const confirmDiscard = confirm("คุณมีข้อมูลที่กำลังแก้ไขหรือยังไม่ได้บันทึกในตาราง\nหากปิดโหมดแก้ไข ข้อมูลที่พิมพ์ไว้จะสูญหาย\n\nต้องการออกจากโหมดแก้ไขโดยไม่บันทึกหรือไม่?");
        if (!confirmDiscard) return;
    }
    window.isSheetEditMode = !window.isSheetEditMode;

    const normAct = document.getElementById("normal-mode-actions");
    const sheetAct = document.getElementById("sheet-mode-actions");

    if (window.isSheetEditMode) {
        if (normAct) normAct.style.display = "none";
        if (sheetAct) sheetAct.style.display = "flex";
        showToast("เปิดโหมดแก้ไขตาราง (Sheet Mode) แก้ไขเซลล์ได้ทันที 📝", "info");
    } else {
        if (normAct) normAct.style.display = "flex";
        if (sheetAct) sheetAct.style.display = "none";
        showToast("ออกจากโหมดแก้ไขตารางแล้ว", "info");
    }

    renderStudentList();
}

window.renderStudentList = function() {
    const container = document.getElementById("students-list-container");
    if (!container) return;

    const query = (document.getElementById("student-search-input")?.value || "").trim().toLowerCase();

    // กรองข้อมูลตามเงื่อนไขที่เลือก (รักษาลำดับตามหลังบ้าน)
    const filtered = (window.studentsRoster || []).filter(s => {
        if (!isGradeMatch(s.grade, window.activeGradeFilter)) return false;
        if (!isRoomMatch(s.room, window.activeRoomFilter)) return false;

        // ตัวกรองสถานะ
        if (window.activeStatusFilter === "IN" && s.status !== "เข้า") return false;
        if (window.activeStatusFilter === "OUT" && s.status !== "ออก") return false;

        // คำค้นหา
        if (query) {
            const matchName = (s.fullName || "").toLowerCase().includes(query);
            const matchId = String(s.studentId || "").includes(query);
            if (!matchName && !matchId) return false;
        }
        return true;
    });

    const summaryText = document.getElementById("student-count-summary-text");
    if (summaryText) {
        summaryText.innerText = `แสดง ${filtered.length} คน (จากทั้งหมด ${window.studentsRoster.length} คน)`;
    }

    if (filtered.length === 0 && !window.isSheetEditMode) {
        container.innerHTML = `
            <div style="background: white; border-radius: 18px; padding: 45px 20px; text-align: center; border: 1.5px solid #cbd5e1; color: #94a3b8;">
                <i class="fa-solid fa-user-slash" style="font-size: 38px; opacity: 0.3; margin-bottom: 12px; display: block;"></i>
                <p style="margin: 0; font-size: 14px; font-weight: 600;">ไม่พบรายชื่อนักเรียนตามเงื่อนไขที่ระบุ</p>
            </div>
        `;
        return;
    }

    let html = `
        <div class="sheet-table-wrapper">
            <table class="sheet-table" id="students-table">
                <thead>
                    <!-- 1. แถวหัวตารางที่แทรก: ยัดปุ่ม เพิ่ม นร กับ แก้ไข ลงไป (อยู่ตรงข้างบนของ สถานะ) -->
                    <tr class="table-toolbar-row">
                        <th colspan="8" style="background: #f8fafc; padding: 9px 14px; border: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                <!-- ด้านซ้าย: ปุ่ม เพิ่ม นร กับ แก้ไข อยู่ตรงข้างบนของ สถานะ -->
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    ${!window.isSheetEditMode ? `
                                        <button type="button" class="btn-table-header-add" onclick="openAddStudentModal()" title="เพิ่มนักเรียนใหม่">
                                            <i class="fa-solid fa-user-plus"></i> เพิ่ม นร
                                        </button>
                                        <button type="button" class="btn-table-header-edit" onclick="toggleSheetEditMode()" title="เปิดโหมดตารางแก้ไข (Sheet Mode)">
                                            <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                                        </button>
                                        <button type="button" class="btn-table-header-upload" onclick="openImportModal()" title="อัพโหลดรายชื่อนักเรียนจาก Excel / Google Sheets">
                                            <i class="fa-solid fa-cloud-arrow-up"></i> อัพโหลด
                                        </button>
                                    ` : `
                                        <button type="button" class="btn-table-header-save" onclick="saveAllSheetChanges()" title="บันทึกการแก้ไขทั้งหมด">
                                            <i class="fa-solid fa-floppy-disk"></i> บันทึกทั้งหมด
                                        </button>
                                        <button type="button" class="btn-table-header-add-row" onclick="addNewSheetRow()" title="แทรกแถวใหม่">
                                            <i class="fa-solid fa-plus"></i> แทรกแถว
                                        </button>
                                        <button type="button" class="btn-table-header-cancel" onclick="toggleSheetEditMode()" title="ออกจากโหมดแก้ไข">
                                            <i class="fa-solid fa-xmark"></i> ออก
                                        </button>
                                    `}
                                </div>

                                <!-- ด้านขวา: ข้อมูลสรุปตาราง -->
                                <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #64748b;">
                                    ${window.isSheetEditMode ? `
                                        <span style="color: #4f46e5; font-weight: 700;"><i class="fa-solid fa-table-cells"></i> โหมดแก้ไขตารางเปิดอยู่</span>
                                    ` : `
                                        <span><i class="fa-solid fa-users"></i> ในตาราง: <strong>${filtered.length}</strong> คน</span>
                                    `}
                                </div>
                            </div>
                        </th>
                    </tr>

                    <!-- 2. แถวชื่อคอลัมน์หลัก -->
                    <tr class="table-columns-header-row">
                        <th style="width: 85px; text-align: center;">สถานะ</th>
                        <th style="width: 60px; text-align: center;">เลขที่</th>
                        <th style="width: 105px; text-align: center;">รหัส นร.</th>
                        <th style="min-width: 200px;">ชื่อ - นามสกุล</th>
                        <th style="width: 85px; text-align: center;">ระดับชั้น</th>
                        <th style="width: 70px; text-align: center;">ห้อง</th>
                        <th style="width: 90px; text-align: center;">เพศ</th>
                        <th style="width: 90px; text-align: center;">จัดการ</th>
                    </tr>
                </thead>
                <tbody id="students-table-body">
    `;

    filtered.forEach((s, idx) => {
        const isOut = (s.status === "ออก");
        const isMale = (s.fullName || "").includes("ด.ช.") || (s.fullName || "").includes("นาย") || s.gender === "1";
        const avatarEmoji = isMale ? "👦" : "👧";

        const rawGrade = String(s.grade || "").trim();
        const cleanGrade = rawGrade.replace(/[^0-9]/g, "") || "1";
        const displayGrade = rawGrade.startsWith("ม.") ? rawGrade : `ม.${cleanGrade}`;
        const genderVal = s.gender || (isMale ? "1" : "2");

        if (!window.isSheetEditMode) {
            // ==========================================
            // 1. โหมดแสดงผลปกติ (View Mode)
            // ==========================================
            html += `
                <tr id="std-row-${s.studentId}" class="${isOut ? 'is-out' : ''}" data-student-id="${s.studentId}">
                    <!-- 1. ปุ่มสถานะ เข้า / ออก หน้าสุด -->
                    <td style="text-align: center;">
                        <button type="button" id="status-btn-${s.studentId}" class="btn-status-toggle ${isOut ? 'status-out' : 'status-in'}" onclick="toggleStudentStatus('${s.studentId}')" title="คลิกสลับสถานะ เข้า / ออก">
                            ${isOut ? `<i class="fa-solid fa-circle-xmark"></i> ออก` : `<i class="fa-solid fa-circle-check"></i> เข้า`}
                        </button>
                    </td>

                    <!-- 2. เลขที่ -->
                    <td style="text-align: center; font-weight: 700; color: #334155;">
                        ${s.no || idx + 1}
                    </td>

                    <!-- 3. รหัสนักเรียน -->
                    <td style="text-align: center; font-family: monospace; font-weight: 700; color: #4338ca;">
                        ${s.studentId}
                    </td>

                    <!-- 4. ชื่อ - นามสกุล -->
                    <td style="font-weight: 600; color: #1e293b;">
                        <span style="font-size: 13px; margin-right: 4px;">${avatarEmoji}</span> <span>${s.fullName}</span>${isOut ? ` <span class="student-out-badge" title="จำหน่าย / ย้ายออก (${getStudentOutRemark(s)})">(${getStudentOutRemark(s)})</span>` : ''}
                    </td>

                    <!-- 5. ระดับชั้น -->
                    <td style="text-align: center;">
                        <span style="background: #ede9fe; color: #6366f1; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 700;">
                            ${displayGrade}
                        </span>
                    </td>

                    <!-- 6. ห้อง -->
                    <td style="text-align: center; font-weight: 600; color: #475569;">
                        ห้อง ${s.room}
                    </td>

                    <!-- 7. เพศ -->
                    <td style="text-align: center; font-size: 12px; color: #475569;">
                        ${genderVal === "1" ? "ชาย 👦" : "หญิง 👧"}
                    </td>

                    <!-- 8. จัดการ: ปุ่มแก้ไขรายคน และปุ่มลบ -->
                    <td style="text-align: center;">
                        <div style="display: inline-flex; align-items: center; gap: 4px;">
                            <button type="button" class="action-icon-btn" onclick="startInlineEditRow('${s.studentId}')" title="แก้ไขข้อมูลในแถวนี้">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button type="button" class="action-icon-btn btn-delete" onclick="confirmDeleteStudent('${s.studentId}', '${s.fullName}')" title="ลบออกจากระบบ">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            // ==========================================
            // 2. โหมดแก้ไขตารางเลียนแบบ Sheet (Sheet Mode)
            // ==========================================
            html += `
                <tr id="std-row-${s.studentId}" class="${isOut ? 'is-out' : ''}" data-student-id="${s.studentId}">
                    <!-- 1. สถานะ (เข้า/ออก) ดรอปดาวน์ -->
                    <td style="text-align: center;">
                        <select class="sheet-select" data-field="status" style="width: 78px; font-weight: 700; ${isOut ? 'color: #dc2626;' : 'color: #166534;'}" onchange="this.style.color = (this.value === 'ออก' ? '#dc2626' : '#166534');">
                            <option value="เข้า" ${s.status === 'เข้า' ? 'selected' : ''}>🟢 เข้า</option>
                            <option value="ออก" ${s.status === 'ออก' ? 'selected' : ''}>🔴 ออก</option>
                        </select>
                    </td>

                    <!-- 2. เลขที่ (ไม่อนุญาตให้แก้ไข - รันอัตโนมัติ) -->
                    <td style="text-align: center; font-weight: 700; color: #475569;">
                        <span title="ระบบรันเลขอัตโนมัติตามเพศและรหัสนักเรียน">${s.no || idx + 1}</span>
                        <input type="hidden" data-field="no" value="${s.no || idx + 1}">
                    </td>

                    <!-- 3. รหัสนักเรียน (PK) -->
                    <td style="text-align: center;">
                        <input type="text" class="sheet-input sheet-input-id" style="width: 95px; text-align: center;" value="${s.studentId}" data-field="studentId" readonly title="รหัสนักเรียนเป็น Primary Key หากต้องการเปลี่ยนให้ลบแล้วเพิ่มใหม่">
                    </td>

                    <!-- 4. ชื่อ - นามสกุล -->
                    <td>
                        <input type="text" class="sheet-input" style="min-width: 180px; font-weight: 600;" value="${s.fullName}" data-field="fullName" placeholder="คำนำหน้าและชื่อ-นามสกุล" oninput="handleSheetNameInput(this)">
                    </td>

                    <!-- 5. ระดับชั้น -->
                    <td style="text-align: center;">
                        <select class="sheet-select" style="width: 75px;" data-field="grade">
                            <option value="1" ${cleanGrade === '1' ? 'selected' : ''}>ม.1</option>
                            <option value="2" ${cleanGrade === '2' ? 'selected' : ''}>ม.2</option>
                            <option value="3" ${cleanGrade === '3' ? 'selected' : ''}>ม.3</option>
                            <option value="4" ${cleanGrade === '4' ? 'selected' : ''}>ม.4</option>
                            <option value="5" ${cleanGrade === '5' ? 'selected' : ''}>ม.5</option>
                            <option value="6" ${cleanGrade === '6' ? 'selected' : ''}>ม.6</option>
                        </select>
                    </td>

                    <!-- 6. ห้อง -->
                    <td style="text-align: center;">
                        <input type="number" class="sheet-input" style="width: 60px; text-align: center;" value="${s.room || '1'}" data-field="room" min="1" max="15">
                    </td>

                    <!-- 7. เพศ -->
                    <td style="text-align: center;">
                        <select class="sheet-select" style="width: 85px;" data-field="gender">
                            <option value="1" ${genderVal === '1' ? 'selected' : ''}>👦 ชาย</option>
                            <option value="2" ${genderVal === '2' ? 'selected' : ''}>👧 หญิง</option>
                        </select>
                    </td>

                    <!-- 8. จัดการ: ลบแถว -->
                    <td style="text-align: center;">
                        <button type="button" class="action-icon-btn btn-delete" onclick="removeSheetRow(this, '${s.studentId}')" title="ลบแถวนี้">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `;
        }
    });

    if (window.isSheetEditMode) {
        html += `
            <tr>
                <td colspan="8" style="padding: 14px; background: #f8fafc; text-align: center; border: 1px solid #cbd5e1;">
                    <div style="display: flex; justify-content: center; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <button type="button" class="btn btn-outline" onclick="addNewSheetRow()" style="padding: 9px 20px; border-radius: 10px; background: white; border: 1.5px dashed #4f46e5; color: #4f46e5; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-plus"></i> แทรกแถวใหม่ (+ Add Row)
                        </button>
                        <button type="button" class="btn-big-save" onclick="saveAllSheetChanges()" style="padding: 9px 24px;">
                            <i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูลตารางทั้งหมด
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    html += `
            </tbody>
        </table>
    </div>
    `;

    container.innerHTML = html;
};

// =========================================================================
// เพิ่มแถวใหม่ในโหมดตารางแก้ไข (Add New Row in Sheet Mode)
// =========================================================================
window.addNewSheetRow = function() {
    ensureAcademicAuth(() => {
        executeAddNewSheetRow();
    }, "แทรกแถวใหม่");
};

function executeAddNewSheetRow() {
    const tbody = document.getElementById("students-table-body");
    if (!tbody) return;

    const defaultGrade = window.activeGradeFilter !== "ALL" ? window.activeGradeFilter : "1";
    const defaultRoom = window.activeRoomFilter !== "ALL" ? window.activeRoomFilter : "1";
    const nextNo = window.getNextClassStudentNumber(defaultGrade, defaultRoom);
    const tempId = `NEW_${Date.now()}_${window.newRowCounter++}`;

    const tr = document.createElement("tr");
    tr.id = `std-row-${tempId}`;
    tr.className = "is-new-row is-active-row";
    tr.setAttribute("data-student-id", tempId);
    tr.setAttribute("data-is-new", "true");

    tr.innerHTML = `
        <!-- 1. สถานะ -->
        <td style="text-align: center;">
            <select class="sheet-select" data-field="status" style="width: 78px; font-weight: 700; color: #166534;">
                <option value="เข้า" selected>🟢 เข้า</option>
                <option value="ออก">🔴 ออก</option>
            </select>
        </td>

        <!-- 2. เลขที่ (แสดงสถานะแถวใหม่พร้อมเลขที่คาดหมายในห้อง) -->
        <td style="text-align: center; font-weight: 700;">
            <span data-role="new-badge" title="เลขที่คาดหมายในห้อง: ${nextNo} (ม.${defaultGrade}/${defaultRoom})" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 4px rgba(245, 158, 11, 0.35);">
                <i class="fa-solid fa-plus"></i> แถวใหม่ (${nextNo})
            </span>
            <input type="hidden" data-field="no" value="${nextNo}">
        </td>

        <!-- 3. รหัสนักเรียน (กรอกได้เพราะเป็นแถวใหม่) -->
        <td style="text-align: center;">
            <input type="text" class="sheet-input sheet-input-id" style="width: 95px; text-align: center; border-color: #f59e0b; background: #ffffff; font-weight: 700;" placeholder="รหัส นร.*" value="" data-field="studentId">
        </td>

        <!-- 4. ชื่อ - นามสกุล (ตรวจจับเพศให้อัตโนมัติเมื่อพิมพ์คำนำหน้า) -->
        <td>
            <input type="text" class="sheet-input" style="min-width: 180px; font-weight: 600; border-color: #f59e0b; background: #ffffff;" value="" data-field="fullName" placeholder="คำนำหน้าและชื่อ-นามสกุล *" oninput="handleSheetNameInput(this)">
        </td>

        <!-- 5. ระดับชั้น (เปลี่ยนแล้วคำนวณเลขที่ใหม่ทันที) -->
        <td style="text-align: center;">
            <select class="sheet-select" style="width: 75px;" data-field="grade" onchange="handleSheetClassChange(this)">
                <option value="1" ${defaultGrade === '1' ? 'selected' : ''}>ม.1</option>
                <option value="2" ${defaultGrade === '2' ? 'selected' : ''}>ม.2</option>
                <option value="3" ${defaultGrade === '3' ? 'selected' : ''}>ม.3</option>
                <option value="4" ${defaultGrade === '4' ? 'selected' : ''}>ม.4</option>
                <option value="5" ${defaultGrade === '5' ? 'selected' : ''}>ม.5</option>
                <option value="6" ${defaultGrade === '6' ? 'selected' : ''}>ม.6</option>
            </select>
        </td>

        <!-- 6. ห้อง (เปลี่ยนแล้วคำนวณเลขที่ใหม่ทันที) -->
        <td style="text-align: center;">
            <input type="number" class="sheet-input" style="width: 60px; text-align: center;" value="${defaultRoom}" data-field="room" min="1" max="15" onchange="handleSheetClassChange(this)" oninput="handleSheetClassChange(this)">
        </td>

        <!-- 7. เพศ -->
        <td style="text-align: center;">
            <select class="sheet-select" style="width: 85px;" data-field="gender">
                <option value="1" selected>👦 ชาย</option>
                <option value="2">👧 หญิง</option>
            </select>
        </td>

        <!-- 8. จัดการ: ลบแถว -->
        <td style="text-align: center;">
            <button type="button" class="action-icon-btn btn-delete" onclick="removeSheetRow(this, '${tempId}')" title="ยกเลิกแถวนี้">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </td>
    `;

    // แทรกที่แถวบนสุดของตารางเสมอ (Top of the table)
    if (tbody.firstElementChild) {
        tbody.insertBefore(tr, tbody.firstElementChild);
    } else {
        tbody.appendChild(tr);
    }

    // เลื่อนมุมมองหน้าจอไปที่แถวใหม่บนสุดทันที
    const tableWrapper = document.querySelector(".sheet-table-wrapper");
    if (tableWrapper) {
        tableWrapper.scrollTop = 0;
    }
    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // โฟกัสไปที่ช่องรหัสนักเรียนพร้อมให้พิมพ์ได้ทันที
    const idInput = tr.querySelector("input[data-field='studentId']");
    if (idInput) {
        setTimeout(() => {
            idInput.focus();
            idInput.select();
        }, 60);
    }

    showToast("แทรกแถวใหม่บนสุดเรียบร้อย สามารถพิมพ์ข้อมูลได้ทันที ⚡", "info");
};

// ไฮไลท์แถวที่กำลังทำงานอยู่ (Active Working Row) ให้เปลี่ยนสีเห็นชัดเจนทันที
document.addEventListener("focusin", function(e) {
    const tr = e.target.closest("#students-table tbody tr");
    if (tr) {
        document.querySelectorAll("#students-table tbody tr.is-active-row").forEach(r => {
            if (r !== tr) r.classList.remove("is-active-row");
        });
        tr.classList.add("is-active-row");
    }
});

document.addEventListener("click", function(e) {
    const tr = e.target.closest("#students-table tbody tr[data-student-id]");
    if (tr && window.isSheetEditMode) {
        document.querySelectorAll("#students-table tbody tr.is-active-row").forEach(r => {
            if (r !== tr) r.classList.remove("is-active-row");
        });
        tr.classList.add("is-active-row");
    }
});

// =========================================================================
// ลบแถวในโหมดตารางแก้ไข (Remove Row in Sheet Mode)
// =========================================================================
window.removeSheetRow = function(btn, studentId) {
    ensureAcademicAuth(() => {
        executeRemoveSheetRow(btn, studentId);
    }, "ลบแถว");
};

function executeRemoveSheetRow(btn, studentId) {
    const tr = btn.closest("tr");
    if (!tr) return;

    const isNew = tr.getAttribute("data-is-new") === "true";
    if (isNew) {
        tr.remove();
        showToast("ยกเลิกแถวใหม่เรียบร้อย", "info");
        return;
    }

    const target = (window.studentsRoster || []).find(s => s.studentId === String(studentId));
    const name = target ? target.fullName : studentId;
    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${name}" ออกจากระบบ?`)) {
        deleteStudent(studentId);
    }
}

// =========================================================================
// บันทึกการแก้ไขทั้งหมดในตาราง (Save All Sheet Changes)
// =========================================================================
window.saveAllSheetChanges = async function() {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.saveAllSheetChanges(), "บันทึกข้อมูลตาราง");
        return;
    }
    const table = document.getElementById("students-table");
    if (!table) return;

    const rows = table.querySelectorAll("tbody tr[data-student-id]");
    if (rows.length === 0) {
        showToast("ไม่พบข้อมูลนักเรียนที่จะบันทึก", "error");
        return;
    }

    const payloadRows = [];
    const statusMapUpdates = {};
    const seenIds = new Set();
    const batchClassCounters = {};
    let hasValidationError = false;

    rows.forEach(tr => {
        if (hasValidationError) return;

        const idInput = tr.querySelector("[data-field='studentId']");
        const nameInput = tr.querySelector("[data-field='fullName']");
        const gradeInput = tr.querySelector("[data-field='grade']");
        const roomInput = tr.querySelector("[data-field='room']");
        const noInput = tr.querySelector("[data-field='no']");
        const genderInput = tr.querySelector("[data-field='gender']");
        const statusInput = tr.querySelector("[data-field='status']");

        const studentId = idInput ? idInput.value.trim() : "";
        const fullName = nameInput ? nameInput.value.trim() : "";
        const rawG = gradeInput ? gradeInput.value.trim() : "1";
        const grade = rawG.startsWith("ม.") ? rawG : `ม.${rawG.replace(/[^0-9]/g, "") || "1"}`;
        const room = roomInput ? roomInput.value.trim() : "1";
        const no = noInput ? parseInt(noInput.value, 10) || 1 : 1;
        const gender = genderInput ? genderInput.value.trim() : "1";
        const status = statusInput ? statusInput.value.trim() : "เข้า";

        if (!studentId) {
            showToast("พบแถวที่ไม่มีรหัสนักเรียน กรุณากรอกให้ครบ", "error");
            if (idInput) idInput.focus();
            hasValidationError = true;
            return;
        }

        if (!fullName) {
            showToast(`รหัส ${studentId}: กรุณากรอกชื่อ-นามสกุล`, "error");
            if (nameInput) nameInput.focus();
            hasValidationError = true;
            return;
        }

        if (seenIds.has(studentId)) {
            showToast(`รหัสนักเรียนซ้ำในตารางที่กรอก: ${studentId}`, "error");
            if (idInput) idInput.focus();
            hasValidationError = true;
            return;
        }
        seenIds.add(studentId);

        // ตรวจสอบความซ้ำซ้อนกับฐานข้อมูลนักเรียนทั้งโรงเรียน หากเป็นแถวที่เพิ่มเข้ามาใหม่
        const isNewRow = (tr.getAttribute("data-is-new") === "true");
        if (isNewRow) {
            const alreadyExists = (window.studentsRoster || []).find(it => String(it.studentId).trim() === studentId);
            if (alreadyExists) {
                showToast(`รหัสนักเรียน ${studentId} มีอยู่แล้วในระบบ! (${alreadyExists.grade}/${alreadyExists.room} "${alreadyExists.fullName}") กรุณาตรวจสอบรหัสใหม่เพื่อป้องกันการบันทึกทับข้อมูล`, "error");
                if (idInput) {
                    idInput.focus();
                    idInput.select();
                }
                hasValidationError = true;
                return;
            }
        }

        // คำนวณเลขที่: หากเป็นแถวใหม่ ให้รันตามลำดับจริงในห้องนั้นเพื่อป้องกันเลขกระโดด
        let finalNo = no;
        if (isNewRow) {
            const cleanG = grade.replace(/[^0-9]/g, "") || "1";
            const cleanR = String(room).replace(/[^0-9]/g, "") || "1";
            const classKey = `${cleanG}_${cleanR}`;
            if (!batchClassCounters[classKey]) {
                let maxNoInClass = 0;
                let countInClass = 0;
                (window.studentsRoster || []).forEach(s => {
                    const sg = String(s.grade || "").replace(/[^0-9]/g, "");
                    const sr = String(s.room || "").replace(/[^0-9]/g, "");
                    if (sg === cleanG && sr === cleanR) {
                        const n = parseInt(s.no, 10);
                        // ⭐️ ข้ามคนที่สถานะ "ออก" หรือเลขที่ >= 99 ไม่นำมาคิดเลขที่ถัดไป
                        if (s.status === "ออก" || (!isNaN(n) && n >= 99)) return;
                        countInClass++;
                        if (!isNaN(n) && n > maxNoInClass) maxNoInClass = n;
                    }
                });
                batchClassCounters[classKey] = Math.max(maxNoInClass, countInClass);
            }
            batchClassCounters[classKey]++;
            finalNo = batchClassCounters[classKey];
        }

        if (status === "ออก") {
            finalNo = 99;
        } else if (finalNo >= 99) {
            // ⭐️ หากสถานะเป็น "เข้า" แต่เลขที่ยังค้าง 99 ให้หาเลขที่ถัดไปของห้องให้อัตโนมัติ
            finalNo = window.getNextClassStudentNumber(grade, room);
        }

        const existingStd = (window.studentsRoster || []).find(it => it.studentId === studentId);
        const currentReason = status === "ออก" ? (existingStd?.outReason || "ย้าย รร") : null;
        const currentDate = status === "ออก" ? (existingStd?.outDate || getTodayIsoDate()) : null;

        payloadRows.push({
            student_id: studentId,
            full_name: fullName,
            grade: grade,
            room: room,
            no: finalNo,
            gender: gender,
            status: status,
            out_reason: currentReason,
            out_date: currentDate
        });

        statusMapUpdates[studentId] = {
            status: status,
            outReason: currentReason || "",
            outDate: currentDate || ""
        };
    });

    if (hasValidationError) return;

    setLoader(true);
    const db = getStudentsSupabase();

    try {
        if (db) {
            // บันทึกทั้งหมดยกชุดลงตาราง std ใน Supabase
            const { error } = await db.from('std').upsert(payloadRows, { onConflict: 'student_id' });
            if (error) {
                console.warn("Supabase upsert with out columns error/notice:", error.message);
                // Fallback โดยตัด out columns ออกถ้ายังไม่ได้สร้าง
                const fallbackRows = payloadRows.map(r => ({
                    student_id: r.student_id,
                    full_name: r.full_name,
                    grade: r.grade,
                    room: r.room,
                    no: r.no,
                    gender: r.gender
                }));
                const { error: err2 } = await db.from('std').upsert(fallbackRows, { onConflict: 'student_id' });
                if (err2) throw err2;
            }
        }

        // อัปเดตแคชสถานะ
        Object.keys(statusMapUpdates).forEach(sId => {
            const inf = statusMapUpdates[sId];
            setLocalStatus(sId, inf.status, inf.outReason, inf.outDate);
        });

        showToast(`บันทึกข้อมูลตารางทั้งหมด ${payloadRows.length} รายการ เรียบร้อย ⚡`, "success");
        
        // ปิดโหมดแก้ไขตารางและโหลดข้อมูลใหม่
        window.isSheetEditMode = false;
        const normAct = document.getElementById("normal-mode-actions");
        const sheetAct = document.getElementById("sheet-mode-actions");
        if (normAct) normAct.style.display = "flex";
        if (sheetAct) sheetAct.style.display = "none";

        await loadStudents();
    } catch (err) {
        console.error("saveAllSheetChanges error:", err);
        showToast(`เกิดข้อผิดพลาดในการบันทึก: ${err.message || err}`, "error");
    } finally {
        setLoader(false);
    }
};

// =========================================================================
// จัดเรียงและรันเลขที่ใหม่อัตโนมัติ (แยกเพศ ชาย -> หญิง และเรียงตามเลขประจำตัว นร.)
// =========================================================================
window.autoSortAndRenumberStudents = async function() {
    ensureAcademicAuth(() => {
        executeAutoSortAndRenumberStudents();
    }, "จัดเรียงเลขที่ใหม่");
};

async function executeAutoSortAndRenumberStudents() {
    if (window.isSheetEditMode && window.hasUnsavedSheetChanges()) {
        const confirmDiscard = confirm("คุณมีข้อมูลที่กำลังแก้ไขหรือยังไม่ได้บันทึกในตาราง\nหากจัดเรียงเลขที่ใหม่ ข้อมูลที่ยังไม่ได้บันทึกจะสูญหาย\n\nต้องการจัดเรียงใหม่และยกเลิกการแก้ไขหรือไม่?");
        if (!confirmDiscard) return;
    }

    if (!window.studentsRoster || window.studentsRoster.length === 0) {
        showToast("ไม่พบข้อมูลนักเรียนเพื่อจัดเรียง", "error");
        return;
    }

    // 1. จัดเรียงตามเกณฑ์: ชั้น -> ห้อง -> สถานะ (เข้าก่อน ออกทีหลัง) -> เพศ -> เลขประจำตัวนักเรียน
    const sorted = sortStudentsRoster(window.studentsRoster);

    // 2. รันเลขที่ 1, 2, 3... ใหม่อัตโนมัติในแต่ละห้อง (คนเข้าได้ 1..N คนออกได้ 99 ไปอยู่ท้าย)
    const classCounters = {};
    const updatedPayload = [];

    sorted.forEach(s => {
        const cleanG = String(s.grade || "").replace(/[^0-9]/g, "") || "1";
        const cleanR = String(s.room || "").replace(/[^0-9]/g, "") || "1";
        const key = `${cleanG}_${cleanR}`;

        let newNo;
        if (s.status === "ออก") {
            newNo = 99;
        } else {
            if (!classCounters[key]) classCounters[key] = 1;
            newNo = classCounters[key]++;
        }

        s.no = newNo;
        updatedPayload.push({
            student_id: s.studentId,
            full_name: s.fullName,
            grade: s.grade,
            room: s.room,
            no: newNo,
            gender: s.gender || (getStudentGenderSortKey(s) === 1 ? "1" : "2"),
            status: s.status || "เข้า",
            out_reason: s.outReason || null,
            out_date: s.outDate || null
        });
    });

    window.studentsRoster = sorted;
    renderStudentList();

    const doSave = confirm(
        `จัดเรียงลำดับและรันเลขที่ในแต่ละห้องใหม่เรียบร้อยแล้ว!\n\n` +
        `• นร. กำลังศึกษา: รันเลขที่ 1..N ต่อเนื่อง (เพศชายขึ้นก่อน ➡️ ตามด้วยเพศหญิง)\n` +
        `• นร. ย้ายออก/จำหน่าย: กำหนดเป็นเลขที่ 99 ย้ายไปอยู่ท้ายห้องเสมอ\n\n` +
        `ต้องการบันทึกการจัดเรียงเลขที่ใหม่นี้ลงฐานข้อมูล Supabase ทันทีเลยหรือไม่?`
    );

    if (doSave) {
        setLoader(true);
        const db = getStudentsSupabase();
        try {
            if (db) {
                const { error } = await db.from('std').upsert(updatedPayload, { onConflict: 'student_id' });
                if (error) {
                    console.warn("Supabase autoSort upsert fallback notice:", error.message);
                    const fallbackPayload = updatedPayload.map(r => ({
                        student_id: r.student_id,
                        full_name: r.full_name,
                        grade: r.grade,
                        room: r.room,
                        no: r.no,
                        gender: r.gender
                    }));
                    const { error: err2 } = await db.from('std').upsert(fallbackPayload, { onConflict: 'student_id' });
                    if (err2) throw err2;
                }
            }
            showToast(`บันทึกการจัดเรียงเลขที่ใหม่ ${updatedPayload.length} รายการ เรียบร้อย ⚡`, "success");
            await loadStudents();
        } catch (err) {
            console.error("autoSortAndRenumberStudents error:", err);
            showToast(`เกิดข้อผิดพลาดในการบันทึก: ${err.message || err}`, "error");
        } finally {
            setLoader(false);
        }
    } else {
        showToast("จัดเรียงเลขที่บนหน้าจอแล้ว (ยังไม่ได้บันทึกลงฐานข้อมูล)", "info");
    }
};

// =========================================================================
// แก้ไขข้อมูลโดยตรงในแถว (Inline Row Editing)
// =========================================================================
window.startInlineEditRow = function(studentId) {
    ensureAcademicAuth(() => {
        executeStartInlineEditRow(studentId);
    }, "แก้ไขข้อมูลนักเรียน");
};

function executeStartInlineEditRow(studentId) {
    const sId = String(studentId);
    const s = (window.studentsRoster || []).find(item => item.studentId === sId);
    if (!s) return;

    const tr = document.getElementById(`std-row-${sId}`);
    if (!tr) return;

    tr.classList.add("is-inline-editing");

    const isOut = (s.status === "ออก");
    const cleanGrade = String(s.grade || "").replace(/[^0-9]/g, "") || "1";
    const genderVal = s.gender || ((s.fullName || "").includes("ด.ช.") || (s.fullName || "").includes("นาย") ? "1" : "2");

    tr.innerHTML = `
        <!-- 1. สถานะ เข้า / ออก -->
        <td style="text-align: center;">
            <select class="sheet-select" data-inline-field="status" style="width: 78px; font-weight: 700; ${isOut ? 'color: #dc2626;' : 'color: #166534;'}" onchange="this.style.color = (this.value === 'ออก' ? '#dc2626' : '#166534');">
                <option value="เข้า" ${s.status === 'เข้า' ? 'selected' : ''}>🟢 เข้า</option>
                <option value="ออก" ${s.status === 'ออก' ? 'selected' : ''}>🔴 ออก</option>
            </select>
        </td>

        <!-- 2. เลขที่ (ไม่อนุญาตให้แก้ไข - รันอัตโนมัติ) -->
        <td style="text-align: center; font-weight: 700; color: #475569;">
            <span title="ระบบรันเลขอัตโนมัติตามเพศและรหัสนักเรียน">${s.no || '-'}</span>
            <input type="hidden" data-inline-field="no" value="${s.no || ''}">
        </td>

        <!-- 3. รหัสนักเรียน (PK) -->
        <td style="text-align: center;">
            <input type="text" class="sheet-input sheet-input-id" style="width: 95px; text-align: center; background: #f1f5f9; color: #4338ca;" value="${s.studentId}" data-inline-field="studentId" readonly title="รหัสนักเรียนเป็น Primary Key">
        </td>

        <!-- 4. ชื่อ - นามสกุล -->
        <td>
            <input type="text" class="sheet-input" style="min-width: 180px; font-weight: 600;" value="${s.fullName}" data-inline-field="fullName" placeholder="คำนำหน้าและชื่อ-นามสกุล" onkeydown="handleInlineRowKeydown(event, '${sId}')" oninput="handleSheetNameInput(this)">
        </td>

        <!-- 5. ระดับชั้น -->
        <td style="text-align: center;">
            <select class="sheet-select" style="width: 75px;" data-inline-field="grade" onkeydown="handleInlineRowKeydown(event, '${sId}')">
                <option value="1" ${cleanGrade === '1' ? 'selected' : ''}>ม.1</option>
                <option value="2" ${cleanGrade === '2' ? 'selected' : ''}>ม.2</option>
                <option value="3" ${cleanGrade === '3' ? 'selected' : ''}>ม.3</option>
                <option value="4" ${cleanGrade === '4' ? 'selected' : ''}>ม.4</option>
                <option value="5" ${cleanGrade === '5' ? 'selected' : ''}>ม.5</option>
                <option value="6" ${cleanGrade === '6' ? 'selected' : ''}>ม.6</option>
            </select>
        </td>

        <!-- 6. ห้อง -->
        <td style="text-align: center;">
            <input type="number" class="sheet-input" style="width: 60px; text-align: center;" value="${s.room || '1'}" data-inline-field="room" min="1" max="15" onkeydown="handleInlineRowKeydown(event, '${sId}')">
        </td>

        <!-- 7. เพศ -->
        <td style="text-align: center;">
            <select class="sheet-select" style="width: 85px;" data-inline-field="gender" onkeydown="handleInlineRowKeydown(event, '${sId}')">
                <option value="1" ${genderVal === '1' ? 'selected' : ''}>👦 ชาย</option>
                <option value="2" ${genderVal === '2' ? 'selected' : ''}>👧 หญิง</option>
            </select>
        </td>

        <!-- 8. ปุ่มบันทึก & ยกเลิก (ในแถวนี้เลย) -->
        <td style="text-align: center;">
            <div style="display: inline-flex; align-items: center; gap: 5px;">
                <button type="button" class="action-icon-btn btn-save-inline" onclick="saveInlineEditRow('${sId}')" title="บันทึกการแก้ไขแถวนี้" style="background: #10b981; color: white; border-color: #10b981;">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button type="button" class="action-icon-btn btn-cancel-inline" onclick="cancelInlineEditRow('${sId}')" title="ยกเลิก" style="background: #f1f5f9; color: #64748b; border-color: #cbd5e1;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </td>
    `;

    const nameInput = tr.querySelector("input[data-inline-field='fullName']");
    if (nameInput) {
        nameInput.focus();
        nameInput.select();
    }
};

window.handleInlineRowKeydown = function(e, studentId) {
    if (e.key === "Enter") {
        e.preventDefault();
        saveInlineEditRow(studentId);
    } else if (e.key === "Escape") {
        e.preventDefault();
        cancelInlineEditRow(studentId);
    }
};

window.cancelInlineEditRow = function(studentId) {
    const sId = String(studentId);
    const s = (window.studentsRoster || []).find(item => item.studentId === sId);
    if (!s) return;
    renderSingleStudentRowView(s);
};

window.saveInlineEditRow = async function(studentId) {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.saveInlineEditRow(studentId), "บันทึกข้อมูลนักเรียน");
        return;
    }
    const sId = String(studentId);
    const tr = document.getElementById(`std-row-${sId}`);
    if (!tr) return;

    const s = (window.studentsRoster || []).find(item => item.studentId === sId);
    if (!s) return;

    const noInput = tr.querySelector("[data-inline-field='no']");
    const nameInput = tr.querySelector("[data-inline-field='fullName']");
    const gradeInput = tr.querySelector("[data-inline-field='grade']");
    const roomInput = tr.querySelector("[data-inline-field='room']");
    const genderInput = tr.querySelector("[data-inline-field='gender']");
    const statusInput = tr.querySelector("[data-inline-field='status']");

    const fullName = nameInput ? nameInput.value.trim() : s.fullName;
    let no = noInput ? parseInt(noInput.value, 10) || s.no : s.no;
    const rawG = gradeInput ? gradeInput.value.trim() : s.grade;
    const grade = rawG.startsWith("ม.") ? rawG : `ม.${String(rawG).replace(/[^0-9]/g, "") || "1"}`;
    const room = roomInput ? roomInput.value.trim() : s.room;
    const gender = genderInput ? genderInput.value.trim() : s.gender;
    const status = statusInput ? statusInput.value.trim() : s.status;

    if (status === "ออก") {
        no = 99;
    }

    if (!fullName) {
        showToast("กรุณากรอกชื่อ-นามสกุล", "error");
        if (nameInput) nameInput.focus();
        return;
    }

    setLoader(true);
    const db = getStudentsSupabase();

    const outReason = status === "ออก" ? (s.outReason || "ย้าย รร") : null;
    const outDate = status === "ออก" ? (s.outDate || getTodayIsoDate()) : null;

    const payload = {
        student_id: sId,
        full_name: fullName,
        grade: grade,
        room: room,
        no: no,
        gender: gender,
        status: status,
        out_reason: outReason,
        out_date: outDate
    };

    try {
        if (db) {
            const { error } = await db.from('std').upsert(payload, { onConflict: 'student_id' });
            if (error) {
                console.warn("Supabase inline upsert fallback notice:", error.message);
                const fallbackPayload = {
                    student_id: sId,
                    full_name: fullName,
                    grade: grade,
                    room: room,
                    no: no,
                    gender: gender
                };
                const { error: err2 } = await db.from('std').upsert(fallbackPayload, { onConflict: 'student_id' });
                if (err2) throw err2;
            }
        }

        const isStatusChanged = (s.status !== status);
        const isRoomOrGradeOrGenderChanged = (s.grade !== grade || s.room !== room || s.gender !== gender);

        s.fullName = fullName;
        s.no = no;
        s.grade = grade;
        s.room = room;
        s.gender = gender;
        s.status = status;
        s.outReason = outReason || "";
        s.outDate = outDate || "";

        setLocalStatus(sId, status, s.outReason, s.outDate);

        showToast(`บันทึกข้อมูล ${fullName} เรียบร้อย ⚡`, "success");

        populateClassRoomDropdown();
        updateSummaryCounters();

        if (isRoomOrGradeOrGenderChanged || isStatusChanged || status === "ออก") {
            resequenceRoomNumbers(grade, room);
            window.studentsRoster = sortStudentsRoster(window.studentsRoster || []);
            renderStudentList();
        } else {
            renderSingleStudentRowView(s);
        }
    } catch (err) {
        console.error("saveInlineEditRow error:", err);
        showToast(`เกิดข้อผิดพลาดในการบันทึก: ${err.message || err}`, "error");
    } finally {
        setLoader(false);
    }
};

function renderSingleStudentRowView(s) {
    const tr = document.getElementById(`std-row-${s.studentId}`);
    if (!tr) {
        renderStudentList();
        return;
    }

    tr.classList.remove("is-inline-editing");
    const isOut = (s.status === "ออก");
    if (isOut) {
        tr.classList.add("is-out");
    } else {
        tr.classList.remove("is-out");
    }

    const isMale = (s.fullName || "").includes("ด.ช.") || (s.fullName || "").includes("นาย") || s.gender === "1";
    const avatarEmoji = isMale ? "👦" : "👧";
    const rawGrade = String(s.grade || "").trim();
    const cleanGrade = rawGrade.replace(/[^0-9]/g, "") || "1";
    const displayGrade = rawGrade.startsWith("ม.") ? rawGrade : `ม.${cleanGrade}`;
    const genderVal = s.gender || (isMale ? "1" : "2");

    tr.innerHTML = `
        <!-- 1. ปุ่มสถานะ เข้า / ออก หน้าสุด -->
        <td style="text-align: center;">
            <button type="button" id="status-btn-${s.studentId}" class="btn-status-toggle ${isOut ? 'status-out' : 'status-in'}" onclick="toggleStudentStatus('${s.studentId}')" title="คลิกสลับสถานะ เข้า / ออก">
                ${isOut ? `<i class="fa-solid fa-circle-xmark"></i> ออก` : `<i class="fa-solid fa-circle-check"></i> เข้า`}
            </button>
        </td>

        <!-- 2. เลขที่ -->
        <td style="text-align: center; font-weight: 700; color: #334155;">
            ${s.no || '-'}
        </td>

        <!-- 3. รหัสนักเรียน -->
        <td style="text-align: center; font-family: monospace; font-weight: 700; color: #4338ca;">
            ${s.studentId}
        </td>

        <!-- 4. ชื่อ - นามสกุล -->
        <td style="font-weight: 600; color: #1e293b;">
            <span style="font-size: 13px; margin-right: 4px;">${avatarEmoji}</span> <span>${s.fullName}</span>${isOut ? ` <span class="student-out-badge" title="จำหน่าย / ย้ายออก (${getStudentOutRemark(s)})">(${getStudentOutRemark(s)})</span>` : ''}
        </td>

        <!-- 5. ระดับชั้น -->
        <td style="text-align: center;">
            <span style="background: #ede9fe; color: #6366f1; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 700;">
                ${displayGrade}
            </span>
        </td>

        <!-- 6. ห้อง -->
        <td style="text-align: center; font-weight: 600; color: #475569;">
            ห้อง ${s.room}
        </td>

        <!-- 7. เพศ -->
        <td style="text-align: center; font-size: 12px; color: #475569;">
            ${genderVal === "1" ? "ชาย 👦" : "หญิง 👧"}
        </td>

        <!-- 8. จัดการ: ปุ่มแก้ไขในแถวนี้ และปุ่มลบ -->
        <td style="text-align: center;">
            <div style="display: inline-flex; align-items: center; gap: 4px;">
                <button type="button" class="action-icon-btn" onclick="startInlineEditRow('${s.studentId}')" title="แก้ไขข้อมูลในแถวนี้">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="action-icon-btn btn-delete" onclick="confirmDeleteStudent('${s.studentId}', '${s.fullName}')" title="ลบออกจากระบบ">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </td>
    `;
}

// =========================================================================
// เพิ่ม / แก้ไข ข้อมูลนักเรียน (Modal Actions)
// =========================================================================
window.openAddStudentModal = function() {
    ensureAcademicAuth(() => {
        executeOpenAddStudentModal();
    }, "เพิ่มนักเรียนใหม่");
};

function executeOpenAddStudentModal() {
    document.getElementById("modal-student-title").innerHTML = `<i class="fa-solid fa-user-plus" style="color: #4f46e5;"></i> เพิ่มนักเรียน`;
    document.getElementById("edit-original-id").value = "";
    document.getElementById("input-student-id").value = "";
    document.getElementById("input-student-id").disabled = false;
    document.getElementById("input-student-name").value = "";
    const g = window.activeGradeFilter !== "ALL" ? window.activeGradeFilter : "1";
    const r = window.activeRoomFilter !== "ALL" ? window.activeRoomFilter : "1";
    document.getElementById("input-student-grade").value = g;
    document.getElementById("input-student-room").value = r;

    // คำนวณเลขที่ถัดไปในห้องนั้นให้อัตโนมัติ (ข้ามคนออก เพื่อไม่ให้เลขที่กระโดด)
    document.getElementById("input-student-no").value = window.getNextClassStudentNumber(g, r);
    document.getElementById("input-student-status").value = "เข้า";

    if (document.getElementById("modal-student-out-fields")) {
        document.getElementById("modal-student-out-fields").style.display = "none";
    }
    if (document.getElementById("input-student-out-reason")) {
        document.getElementById("input-student-out-reason").value = "";
    }
    if (document.getElementById("input-student-out-date")) {
        document.getElementById("input-student-out-date").value = "";
    }

    document.getElementById("modal-student").style.display = "flex";
}

window.openEditStudentModal = function(studentId) {
    ensureAcademicAuth(() => {
        executeOpenEditStudentModal(studentId);
    }, "แก้ไขข้อมูลนักเรียน");
};

function executeOpenEditStudentModal(studentId) {
    const s = (window.studentsRoster || []).find(item => item.studentId === String(studentId));
    if (!s) return;

    document.getElementById("modal-student-title").innerHTML = `<i class="fa-solid fa-user-pen" style="color: #4f46e5;"></i> แก้ไขข้อมูลนักเรียน`;
    document.getElementById("edit-original-id").value = s.studentId;
    document.getElementById("input-student-id").value = s.studentId;
    document.getElementById("input-student-id").disabled = true; // ไม่ให้แก้ Primary Key
    document.getElementById("input-student-name").value = s.fullName;
    document.getElementById("input-student-grade").value = s.grade.replace(/[^0-9]/g, "") || "1";
    document.getElementById("input-student-room").value = s.room;
    document.getElementById("input-student-no").value = s.no;
    
    const isOut = (s.status === "ออก");
    document.getElementById("input-student-status").value = s.status || "เข้า";

    if (document.getElementById("modal-student-out-fields")) {
        document.getElementById("modal-student-out-fields").style.display = isOut ? "block" : "none";
    }
    if (document.getElementById("input-student-out-reason")) {
        document.getElementById("input-student-out-reason").value = s.outReason || (isOut ? "ย้าย รร" : "");
    }
    if (document.getElementById("input-student-out-date")) {
        document.getElementById("input-student-out-date").value = s.outDate || (isOut ? getTodayIsoDate() : "");
    }

    document.getElementById("modal-student").style.display = "flex";
}

window.closeStudentModal = function() {
    document.getElementById("modal-student").style.display = "none";
};

window.handleSaveStudent = async function(e) {
    e.preventDefault();
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.handleSaveStudent(e), "บันทึกข้อมูลนักเรียน");
        return;
    }
    const originalId = document.getElementById("edit-original-id").value;
    const studentId = document.getElementById("input-student-id").value.trim();
    const fullName = document.getElementById("input-student-name").value.trim();
    const rawG = document.getElementById("input-student-grade").value.trim();
    const grade = rawG.startsWith("ม.") ? rawG : `ม.${String(rawG).replace(/[^0-9]/g, "") || "1"}`;
    const room = document.getElementById("input-student-room").value.trim();
    const no = parseInt(document.getElementById("input-student-no").value, 10) || 1;
    const status = document.getElementById("input-student-status").value;
    const outReason = status === "ออก" ? (document.getElementById("input-student-out-reason")?.value.trim() || "ย้าย รร") : null;
    const outDate = status === "ออก" ? (document.getElementById("input-student-out-date")?.value || getTodayIsoDate()) : null;

    if (!studentId || !fullName) {
        showToast("กรุณากรอกรหัสและชื่อนักเรียนให้ครบถ้วน", "error");
        return;
    }

    // หากเป็นการเพิ่มนักเรียนใหม่ ให้ตรวจว่ารหัสนักเรียนซ้ำในระบบหรือไม่
    if (!originalId) {
        const existing = (window.studentsRoster || []).find(it => String(it.studentId).trim() === studentId);
        if (existing) {
            showToast(`รหัสนักเรียน ${studentId} มีอยู่แล้วในระบบ (${existing.grade}/${existing.room} "${existing.fullName}") กรุณาใช้รหัสอื่น`, "error");
            return;
        }
    }

    const detectedGender = window.autoDetectGenderFromName ? window.autoDetectGenderFromName(fullName) : null;
    const gender = detectedGender || (fullName.includes("ด.ช.") || fullName.includes("นาย") ? "1" : "2");

    setLoader(true);
    const db = getStudentsSupabase();

    let finalNo = (status === "ออก") ? 99 : no;
    if (status === "เข้า" && finalNo >= 99) {
        finalNo = window.getNextClassStudentNumber(grade, room);
    }

    const payload = {
        student_id: studentId,
        full_name: fullName,
        grade: grade,
        room: room,
        no: finalNo,
        gender: gender,
        status: status,
        out_reason: outReason,
        out_date: outDate
    };

    try {
        if (db) {
            // บันทึกหรืออัปเดตลงตาราง std ใน Supabase
            const { error } = await db.from('std').upsert(payload, { onConflict: 'student_id' });
            if (error) {
                // หากคอลัมน์ status/out_reason/out_date ยังไม่มีบน Supabase ให้ fallback บันทึกเฉพาะคอลัมน์เดิม
                console.warn("Supabase upsert with out columns notice:", error.message);
                const fallbackPayload = {
                    student_id: studentId,
                    full_name: fullName,
                    grade: grade,
                    room: room,
                    no: no,
                    gender: gender
                };
                const { error: err2 } = await db.from('std').upsert(fallbackPayload, { onConflict: 'student_id' });
                if (err2) throw err2;
            }
        }

        // เซฟสถานะลง Local Cache
        setLocalStatus(studentId, status, outReason || "", outDate || "");

        showToast(originalId ? "แก้ไขข้อมูลนักเรียนสำเร็จ ⚡" : "เพิ่มนักเรียนใหม่เรียบร้อย ⚡", "success");
        closeStudentModal();
        await loadStudents();
    } catch (err) {
        console.error("handleSaveStudent error:", err);
        showToast(`เกิดข้อผิดพลาด: ${err.message || err}`, "error");
    } finally {
        setLoader(false);
    }
};

// =========================================================================
// ลบข้อมูลนักเรียน
// =========================================================================
window.confirmDeleteStudent = function(studentId, fullName) {
    ensureAcademicAuth(() => {
        executeConfirmDeleteStudent(studentId, fullName);
    }, "ลบข้อมูลนักเรียน");
};

function executeConfirmDeleteStudent(studentId, fullName) {
    const s = (window.studentsRoster || []).find(it => it.studentId === String(studentId));
    openStudentDeleteModal(studentId, fullName, s);
}

window.openStudentDeleteModal = function(studentId, fullName, studentObj) {
    const modal = document.getElementById("modal-student-delete-confirm");
    if (!modal) {
        if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ "${fullName}" ออกจากระบบ?`)) {
            deleteStudent(studentId);
        }
        return;
    }

    document.getElementById("delete-confirm-student-id").value = studentId;
    document.getElementById("delete-confirm-name").innerText = fullName;
    const sub = studentObj ? `รหัส นร.: ${studentId} | ชั้น: ${studentObj.grade}/${studentObj.room} | เลขที่: ${studentObj.no || '-'}` : `รหัสนักเรียน: ${studentId}`;
    document.getElementById("delete-confirm-sub").innerText = sub;

    modal.style.display = "flex";
};

window.closeStudentDeleteModal = function() {
    const modal = document.getElementById("modal-student-delete-confirm");
    if (modal) modal.style.display = "none";
};

window.submitStudentDeleteModal = function() {
    const sId = document.getElementById("delete-confirm-student-id").value;
    closeStudentDeleteModal();
    if (sId) deleteStudent(sId);
};

async function deleteStudent(studentId) {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => deleteStudent(studentId), "ลบข้อมูลนักเรียน");
        return;
    }
    setLoader(true);
    const db = getStudentsSupabase();
    try {
        if (db) {
            const { error } = await db.from('std').delete().eq('student_id', String(studentId));
            if (error) throw error;
        }

        showToast("ลบข้อมูลนักเรียนเรียบร้อยแล้ว", "success");
        await loadStudents();
    } catch (err) {
        console.error("deleteStudent error:", err);
        showToast(`ไม่สามารถลบข้อมูลได้: ${err.message || err}`, "error");
    } finally {
        setLoader(false);
    }
}

// =========================================================================
// นำเข้าข้อมูลยกชุดจาก Google Sheet / Excel (Batch Paste Import)
// =========================================================================
window.openImportModal = function() {
    ensureAcademicAuth(() => {
        executeOpenImportModal();
    }, "นำเข้าข้อมูลนักเรียน");
};

function executeOpenImportModal() {
    document.getElementById("import-paste-area").value = "";
    document.getElementById("import-preview-summary").innerText = "";
    document.getElementById("btn-confirm-import").disabled = true;
    document.getElementById("btn-confirm-import").style.opacity = "0.5";
    document.getElementById("modal-import").style.display = "flex";
}

window.closeImportModal = function() {
    document.getElementById("modal-import").style.display = "none";
};

window.previewImportData = function() {
    const rawText = (document.getElementById("import-paste-area").value || "").trim();
    const summaryEl = document.getElementById("import-preview-summary");
    const confirmBtn = document.getElementById("btn-confirm-import");

    if (!rawText) {
        summaryEl.innerText = "";
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = "0.5";
        window.parsedImportRows = [];
        return;
    }

    const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
    const parsed = [];
    const roomCounters = {}; // นับเลขที่แยกตามระดับชั้นและห้อง (grade / room)

    lines.forEach(line => {
        // แยกตาม Tab (Excel copy) หรือ Comma
        let cols = line.split("\t");
        if (cols.length < 2) cols = line.split(",");

        if (cols.length >= 2) {
            const sId = cols[0].trim();
            const name = cols[1].trim();
            const rawG = cols[2] ? cols[2].replace(/[^0-9]/g, "").trim() : "1";
            const gradeNum = rawG || "1";
            const roomNum = cols[3] ? cols[3].replace(/[^0-9]/g, "").trim() || "1" : "1";
            const roomKey = `${gradeNum}_${roomNum}`;

            if (!roomCounters[roomKey]) roomCounters[roomKey] = 0;
            roomCounters[roomKey]++;

            // ถ้ามีระบุเลขที่มาในคอลัมน์ 4 ให้ใช้ตามนั้น ถ้าไม่มีให้นับแยกตามห้อง
            const parsedNo = cols[4] ? parseInt(cols[4], 10) : null;
            const no = (!isNaN(parsedNo) && parsedNo > 0) ? parsedNo : roomCounters[roomKey];

            // ตรวจจับเพศ:
            // 1. ตรวจจากคอลัมน์ cols[5] ถ้ามีระบุ เช่น "ชาย", "หญิง", "1", "2"
            // 2. เรียกใช้ window.autoDetectGenderFromName(name)
            // 3. fallback คำนำหน้าชื่อ ด.ช./นาย เป็น 1, ด.ญ./น.ส./นางสาว/นาง/เด็กหญิง เป็น 2
            let gender = "1";
            const colGender = cols[5] ? cols[5].trim() : "";
            if (colGender === "1" || colGender === "ชาย") {
                gender = "1";
            } else if (colGender === "2" || colGender === "หญิง") {
                gender = "2";
            } else {
                const autoG = typeof window.autoDetectGenderFromName === "function" ? window.autoDetectGenderFromName(name) : null;
                if (autoG) {
                    gender = autoG;
                } else if (name.includes("ด.ญ.") || name.includes("น.ส.") || name.includes("นางสาว") || name.includes("เด็กหญิง")) {
                    gender = "2";
                } else {
                    gender = "1";
                }
            }

            if (sId && name && !isNaN(Number(sId.replace(/[^0-9]/g, "")))) {
                parsed.push({
                    student_id: sId,
                    full_name: name,
                    grade: `ม.${gradeNum}`,
                    room: roomNum,
                    no: no,
                    gender: gender
                });
            }
        }
    });

    window.parsedImportRows = parsed;

    if (parsed.length > 0) {
        summaryEl.innerText = `✅ ตรวจพบข้อมูลนักเรียนพร้อมนำเข้า ${parsed.length} รายการ`;
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = "1";
    } else {
        summaryEl.innerText = `⚠️ ไม่พบรูปแบบข้อมูลที่ถูกต้อง (ตรวจสอบว่ามีคอลัมน์: รหัส และ ชื่อ-สกุล)`;
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = "0.5";
    }
};

window.confirmImportData = async function() {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.confirmImportData(), "นำเข้าข้อมูลนักเรียน");
        return;
    }
    const rows = window.parsedImportRows;
    if (!rows || rows.length === 0) return;

    if (!confirm(`ยืนยันการนำเข้าข้อมูลนักเรียน ${rows.length} คน เข้าสู่ฐานข้อมูลหลัก?`)) return;

    setLoader(true);
    const db = getStudentsSupabase();

    try {
        if (db) {
            // Upsert batch ลงตาราง std
            const { error } = await db.from('std').upsert(rows, { onConflict: 'student_id' });
            if (error) {
                console.warn("Supabase import fallback notice:", error.message);
                const fallbackRows = rows.map(r => ({
                    student_id: r.student_id,
                    full_name: r.full_name,
                    grade: r.grade,
                    room: r.room,
                    no: r.no,
                    gender: r.gender
                }));
                const { error: err2 } = await db.from('std').upsert(fallbackRows, { onConflict: 'student_id' });
                if (err2) throw err2;
            }
        }

        // ตั้งสถานะเริ่มต้นเป็น เข้า
        rows.forEach(r => setLocalStatus(r.student_id, "เข้า", "", ""));

        showToast(`นำเข้าข้อมูลนักเรียน ${rows.length} คน สำเร็จเรียบร้อย ⚡`, "success");
        closeImportModal();
        await loadStudents();
    } catch (err) {
        console.error("confirmImportData error:", err);
        showToast(`เกิดข้อผิดพลาดในการนำเข้า: ${err.message || err}`, "error");
    } finally {
        setLoader(false);
    }
};

// =========================================================================
// ระบบเลือกห้องพิมพ์ใบรายชื่อ A4 PDF (แผ่นละ 1 ห้อง ตรงตามแบบฟอร์มโรงเรียน)
// =========================================================================

window.openSelectPdfRoomsModal = function() {
    const modal = document.getElementById("modal-select-pdf-rooms");
    if (!modal) return;

    // อัปเดตภาคเรียนและปีการศึกษาเริ่มต้นจากระบบส่วนกลาง (ถ้ามี)
    try {
        const sysSettings = localStorage.getItem("sbwk_system_settings");
        const termInput = document.getElementById("pdf-input-term");
        const yearInput = document.getElementById("pdf-input-year");
        if (sysSettings) {
            const parsed = JSON.parse(sysSettings);
            if (termInput && parsed.current_term) termInput.value = parsed.current_term;
            if (yearInput && parsed.academic_year) yearInput.value = parsed.academic_year;
        } else if (window.GLOBAL_CONFIG) {
            const gTerm = String(window.GLOBAL_CONFIG.semester || "").replace(/[^0-9]/g, "");
            const gYear = String(window.GLOBAL_CONFIG.academicYear || "").replace(/[^0-9]/g, "");
            if (termInput && gTerm) termInput.value = gTerm;
            if (yearInput && gYear) yearInput.value = gYear;
        }
    } catch (e) {}

    // รวบรวมระดับชั้นและห้องทั้งหมดจาก studentsRoster
    const classMap = {};
    (window.studentsRoster || []).forEach(s => {
        const cleanGrade = String(s.grade || "").replace(/[^0-9]/g, "").trim();
        const cleanRoom = String(s.room || "").replace(/[^0-9]/g, "").trim();
        if (cleanGrade && cleanRoom) {
            if (!classMap[cleanGrade]) {
                classMap[cleanGrade] = {};
            }
            if (!classMap[cleanGrade][cleanRoom]) {
                classMap[cleanGrade][cleanRoom] = { total: 0, in: 0, out: 0 };
            }
            classMap[cleanGrade][cleanRoom].total++;
            if (s.status === "ออก") {
                classMap[cleanGrade][cleanRoom].out++;
            } else {
                classMap[cleanGrade][cleanRoom].in++;
            }
        }
    });

    const container = document.getElementById("pdf-rooms-checkbox-grid");
    if (!container) return;

    const sortedGrades = Object.keys(classMap).sort((a, b) => Number(a) - Number(b));

    if (sortedGrades.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px; color: #64748b;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 28px; color: #f59e0b; margin-bottom: 6px;"></i>
                <div style="font-weight: 600;">ยังไม่พบข้อมูลห้องเรียนในระบบ</div>
            </div>
        `;
        modal.style.display = "flex";
        return;
    }

    let html = "";
    sortedGrades.forEach(g => {
        const rooms = Object.keys(classMap[g]).sort((a, b) => Number(a) - Number(b));
        html += `
            <div class="pdf-grade-row">
                <button type="button" class="pdf-grade-badge" onclick="toggleGradePdfRooms('${g}')" title="คลิกเพื่อเลือก/ไม่เลือก ม.${g} ทั้งหมด">
                    ม.${g} ทั้งหมด
                </button>
                <div style="display: flex; flex-wrap: wrap; gap: 6px; flex: 1;">
        `;

        rooms.forEach(r => {
            const info = classMap[g][r];
            const isCurrentlyFiltered = (window.activeGradeFilter === g && window.activeRoomFilter === r);
            const isGradeFiltered = (window.activeGradeFilter === g && window.activeRoomFilter === "ALL");
            const defaultChecked = (window.activeGradeFilter === "ALL" || isCurrentlyFiltered || isGradeFiltered);

            html += `
                <label class="pdf-chip ${defaultChecked ? 'active' : ''}">
                    <input type="checkbox" name="pdf_selected_rooms" value="${g}/${r}" data-grade="${g}" ${defaultChecked ? 'checked' : ''} onchange="handlePdfChipChange(this)" style="position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0;">
                    <span class="chip-icon">${defaultChecked ? '✓' : ''}</span>
                    <span>ม.${g}/${r}</span>
                </label>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateSelectedRoomsCount();
    modal.style.display = "flex";
};

window.handlePdfChipChange = function(input) {
    const chip = input.closest('.pdf-chip');
    if (chip) {
        chip.classList.toggle('active', input.checked);
        const icon = chip.querySelector('.chip-icon');
        if (icon) icon.textContent = input.checked ? '✓' : '';
    }
    updateSelectedRoomsCount();
};

window.syncPdfChipsUI = function() {
    const boxes = document.querySelectorAll("input[name='pdf_selected_rooms']");
    boxes.forEach(b => {
        const chip = b.closest('.pdf-chip');
        if (chip) {
            chip.classList.toggle('active', b.checked);
            const icon = chip.querySelector('.chip-icon');
            if (icon) icon.textContent = b.checked ? '✓' : '';
        }
    });
    updateSelectedRoomsCount();
};

window.closeSelectPdfRoomsModal = function() {
    const modal = document.getElementById("modal-select-pdf-rooms");
    if (modal) modal.style.display = "none";
};

window.updateSelectedRoomsCount = function() {
    const checked = document.querySelectorAll("input[name='pdf_selected_rooms']:checked");
    const countEl = document.getElementById("pdf-selected-rooms-count");
    if (countEl) {
        countEl.innerHTML = `<span style="color: #4f46e5; font-weight: 800;">เลือกแล้ว ${checked.length} ห้อง</span> (${checked.length} แผ่น)`;
    }
};

window.toggleAllPdfRooms = function(selectAll) {
    const boxes = document.querySelectorAll("input[name='pdf_selected_rooms']");
    boxes.forEach(b => b.checked = !!selectAll);
    syncPdfChipsUI();
};

window.toggleGradePdfRooms = function(grade) {
    const boxes = document.querySelectorAll(`input[name='pdf_selected_rooms'][data-grade='${grade}']`);
    if (boxes.length === 0) return;
    const anyUnchecked = Array.from(boxes).some(b => !b.checked);
    boxes.forEach(b => b.checked = anyUnchecked);
    syncPdfChipsUI();
};

window.togglePdfRoomsByLevel = function(level) {
    const boxes = document.querySelectorAll("input[name='pdf_selected_rooms']");
    boxes.forEach(b => {
        const grade = parseInt(b.getAttribute("data-grade"), 10) || 0;
        if (level === 'junior') {
            b.checked = (grade >= 1 && grade <= 3);
        } else if (level === 'senior') {
            b.checked = (grade >= 4 && grade <= 6);
        }
    });
    syncPdfChipsUI();
};

window.generateAndPrintMultiRoomPdf = function() {
    const checkedBoxes = Array.from(document.querySelectorAll("input[name='pdf_selected_rooms']:checked"));
    if (checkedBoxes.length === 0) {
        showToast("กรุณาเลือกห้องเรียนอย่างน้อย 1 ห้อง", "error");
        return;
    }

    const activeTerm = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.semester) ? String(window.GLOBAL_CONFIG.semester).replace(/[^0-9]/g, "") : "1";
    const activeYear = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.academicYear) ? String(window.GLOBAL_CONFIG.academicYear).replace(/[^0-9]/g, "") : "2569";
    const term = (document.getElementById("pdf-input-term")?.value || activeTerm).trim();
    const year = (document.getElementById("pdf-input-year")?.value || activeYear).trim();
    const checkCols = parseInt(document.getElementById("pdf-input-check-cols")?.value, 10) || 15;
    const advisorInput = (document.getElementById("pdf-input-advisor")?.value || "").trim();
    const includeOut = !!document.getElementById("pdf-checkbox-include-out")?.checked;

    const printableArea = document.getElementById("printable-a4-area");
    if (!printableArea) return;

    window.currentPrintDocType = "multi_room_roster";
    setLoader(true);

    try {
        let pagesHtml = "";
        let totalPages = 0;

        // เรียงลำดับห้องที่เลือก: ชั้น (Grade) -> ห้อง (Room)
        checkedBoxes.sort((a, b) => {
            const [gA, rA] = a.value.split("/").map(Number);
            const [gB, rB] = b.value.split("/").map(Number);
            if (gA !== gB) return gA - gB;
            return rA - rB;
        });

        checkedBoxes.forEach(box => {
            const [g, r] = box.value.split("/");
            // กรองนักเรียนในห้องนั้น (เอาเฉพาะคนมีตัวตน คนออกไม่ใส่)
            const studentsInRoom = (window.studentsRoster || []).filter(s => {
                if (!isGradeMatch(s.grade, g) || !isRoomMatch(s.room, r)) return false;
                if (!includeOut && s.status === "ออก") return false;
                return true;
            });

            // จัดเรียง: นร.กำลังศึกษามาก่อน (คนออกไปอยู่ท้าย) -> ชาย (1) ก่อน หญิง (2) และตามด้วยรหัส นร.
            const sorted = studentsInRoom.slice().sort((a, b) => {
                const outA = (a.status === "ออก");
                const outB = (b.status === "ออก");
                if (outA !== outB) return outA ? 1 : -1;
                const genA = getStudentGenderSortKey(a);
                const genB = getStudentGenderSortKey(b);
                if (genA !== genB) return genA - genB;
                const idA = parseInt(String(a.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
                const idB = parseInt(String(b.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
                if (idA !== idB) return idA - idB;
                return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0);
            });

            // แบ่งหน้า: หน้าละ 40 บรรทัดตามมาตรฐานฟอร์มโรงเรียน
            const chunkSize = 40;
            const chunks = [];
            if (sorted.length === 0) {
                chunks.push([]);
            } else {
                for (let i = 0; i < sorted.length; i += chunkSize) {
                    chunks.push(sorted.slice(i, i + chunkSize));
                }
            }

            chunks.forEach((chunk, chunkIdx) => {
                totalPages++;
                const roomAdv = getRoomAdvisorInfo(g, r);
                const defaultAdv = roomAdv ? [roomAdv.teacher1, roomAdv.teacher2].filter(Boolean).join(" และ ") : "";
                const finalAdvisor = advisorInput || defaultAdv;
                const advisorLine = finalAdvisor 
                    ? `<span style="font-weight: 600; text-decoration: underline;">${finalAdvisor}</span>` 
                    : `............................................................................................................................`;

                const pageLabel = chunks.length > 1 ? ` (แผ่นที่ ${chunkIdx + 1}/${chunks.length})` : "";

                pagesHtml += `
                    <div class="a4-official-page">
                        <!-- ส่วนหัวเอกสาร (โลโก้ + ข้อความจัดวางตรงตามแบบฟอร์มต้นฉบับ) -->
                        <div class="a4-header" style="display: flex; align-items: flex-start; position: relative; margin-bottom: 6px; min-height: 48px;">
                            <img src="${window.SCHOOL_LOGO_BASE64 || 'logo.png'}" alt="Logo" style="position: absolute; left: 0; top: 0; width: 44px; height: 44px; object-fit: contain;">
                            
                            <div style="width: 100%; text-align: center; padding: 0 45px;">
                                <div style="font-size: 15px; font-weight: 700; color: black; line-height: 1.3; letter-spacing: 0.1px;">
                                    รายชื่อนักเรียนโรงเรียนซับบอนวิทยาคม &nbsp; ชั้นมัธยมศึกษาปีที่ ${g}/${r}${pageLabel} &nbsp;&nbsp;&nbsp;&nbsp; ภาคเรียนที่ ${term} &nbsp;&nbsp;&nbsp;&nbsp; ปีการศึกษา ${year}
                                </div>
                                <div style="font-size: 13.5px; color: black; margin-top: 3px; line-height: 1.2;">
                                    ครูที่ปรึกษา ${advisorLine}
                                </div>
                            </div>
                        </div>

                        <!-- ตารางมาตรฐาน 40 บรรทัด ยืดเต็มหน้า A4 (คอลัมน์: ที่, เลขประจำตัว, ชื่อ-สกุล, ${checkCols} ช่องคะแนน, หมายเหตุ) -->
                        <table class="a4-table" style="width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid black; font-family: 'Sarabun', sans-serif;">
                            <thead>
                                <tr style="height: 36px; background: white;">
                                    <th style="width: 36px; border: 0.6px solid black; text-align: center; font-size: 12.5px; font-weight: 700; padding: 2px;">ที่</th>
                                    <th style="width: 80px; border: 0.6px solid black; text-align: center; font-size: 12px; font-weight: 700; padding: 2px; line-height: 1.15;">เลขประจำ<br>ตัว</th>
                                    <th style="width: 215px; border: 0.6px solid black; text-align: center; font-size: 13px; font-weight: 700; padding: 2px;">ชื่อ-สกุล</th>
                                    ${Array(checkCols).fill(0).map(() => '<th style="border: 0.6px solid black; padding: 0;"></th>').join('')}
                                    <th style="width: 68px; border: 0.6px solid black; text-align: center; font-size: 12.5px; font-weight: 700; padding: 2px;">หมายเหตุ</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                for (let rowIdx = 0; rowIdx < 40; rowIdx++) {
                    const student = chunk[rowIdx];
                    const globalNo = chunkIdx * chunkSize + rowIdx + 1;

                    if (student) {
                        const isOut = (student.status === "ออก");
                        const statusNote = isOut ? getStudentOutRemark(student) : '';
                        const nameDisplay = isOut ? `${student.fullName} (${statusNote})` : student.fullName;
                        const displayNo = isOut ? 99 : (student.no || globalNo);

                        pagesHtml += `
                            <tr style="height: 23.5px;">
                                <td style="border: 1px solid black; text-align: center; font-size: 13px; font-weight: normal; padding: 1px 2px;">${displayNo}</td>
                                <td style="border: 1px solid black; text-align: center; font-size: 13px; font-weight: normal; padding: 1px 2px; font-family: 'Sarabun', sans-serif;">${student.studentId}</td>
                                <td style="border: 1px solid black; text-align: left; padding: 1px 8px; font-size: 13.5px; font-weight: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nameDisplay}</td>
                                ${Array(checkCols).fill(0).map(() => '<td style="border: 1px solid black; padding: 0;"></td>').join('')}
                                <td style="border: 1px solid black; text-align: center; font-size: 11.5px; font-weight: normal; padding: 1px 2px; color: ${isOut ? '#dc2626' : 'black'};">${statusNote}</td>
                            </tr>
                        `;
                    } else {
                        // บรรทัดว่างพร้อมเส้นตารางสมบูรณ์แบบ
                        pagesHtml += `
                            <tr style="height: 23.5px;">
                                <td style="border: 1px solid black; text-align: center; font-size: 12px; padding: 1px 2px;"></td>
                                <td style="border: 1px solid black; padding: 1px 2px;"></td>
                                <td style="border: 1px solid black; padding: 1px 6px;"></td>
                                ${Array(checkCols).fill(0).map(() => '<td style="border: 1px solid black; padding: 0;"></td>').join('')}
                                <td style="border: 1px solid black; padding: 1px 2px;"></td>
                            </tr>
                        `;
                    }
                }

                pagesHtml += `
                            </tbody>
                        </table>
                    </div>
                `;
            });
        });

        printableArea.innerHTML = pagesHtml;

        // ปิด Modal เลือกห้อง
        closeSelectPdfRoomsModal();

        // อัปเดตหัวข้อของ Preview Modal
        const previewTitle = document.getElementById("print-preview-modal-title");
        if (previewTitle) {
            previewTitle.innerHTML = `<i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i> พรีวิวเอกสารใบรายชื่อ (${checkedBoxes.length} ห้อง / รวม ${totalPages} แผ่น)`;
        }

        // เปิด Modal พรีวิว
        const previewModal = document.getElementById("modal-print-preview");
        if (previewModal) previewModal.style.display = "flex";

        showToast(`สร้างใบรายชื่อสำเร็จ ${checkedBoxes.length} ห้อง (แผ่นละ 1 ห้อง รวม ${totalPages} แผ่น) 🖨️`, "success");
    } catch (err) {
        console.error("generateAndPrintMultiRoomPdf error:", err);
        showToast("เกิดข้อผิดพลาดในการสร้างเอกสาร: " + (err.message || err), "error");
    } finally {
        setLoader(false);
    }
};

window.openPrintPdfModal = function() {
    // ส่งต่อไปยังโมดอลเลือกห้อง
    openSelectPdfRoomsModal();
};

window.closePrintPdfModal = function() {
    const modal = document.getElementById("modal-print-preview");
    if (modal) modal.style.display = "none";
};

// =========================================================================
// สั่งพิมพ์ หรือ บันทึกเป็น Vector PDF แท้ (100% คมชัดเหมือนพรีวิว เส้นบาง ไม่แตก ไม่เพี้ยน)
// =========================================================================
window.printVectorPdf = function() {
    window.print();
};

// =========================================================================
// บันทึกไฟล์ PDF โดยตรงลงเครื่องทันที (Direct Image PDF)
// =========================================================================
window.downloadPreviewPdf = async function() {
    const printableArea = document.getElementById("printable-a4-area");
    if (!printableArea) {
        showToast("ไม่พบเอกสารเพื่อบันทึก PDF", "error");
        return;
    }

    const pages = printableArea.querySelectorAll(".a4-official-page");
    if (!pages || pages.length === 0) {
        showToast("ไม่พบหน้าเอกสารเพื่อบันทึก", "error");
        return;
    }

    setLoader(true);

    // 1. ตรวจสอบและโหลด html2canvas หากยังไม่มี
    if (typeof html2canvas === "undefined") {
        await new Promise((resolve) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
            s.onload = () => resolve();
            s.onerror = () => resolve();
            document.head.appendChild(s);
        });
    }

    // 2. ตรวจสอบและโหลด jsPDF หากยังไม่มี
    if (typeof window.jspdf === "undefined" && typeof jsPDF === "undefined") {
        await new Promise((resolve) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            s.onload = () => resolve();
            s.onerror = () => resolve();
            document.head.appendChild(s);
        });
    }

    const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || null);
    if (typeof html2canvas === "undefined" || !jsPDFConstructor) {
        setLoader(false);
        showToast("ไม่สามารถโหลดระบบสร้างไฟล์ PDF ได้ กำลังเปิดหน้าพิมพ์แทน", "warning");
        window.print();
        return;
    }

    try {
        // ตรวจสอบและแปลงรูปภาพทั้งหมดในพื้นที่พรีวิวให้เป็น Base64 
        // ป้องกัน Browser Sandbox Tainted Canvas เมื่อเปิดใช้งานแบบออฟไลน์/เปิดไฟล์ตรงๆ (file:///)
        const allImages = printableArea.querySelectorAll("img");
        allImages.forEach(img => {
            if (window.SCHOOL_LOGO_BASE64 && (!img.src || !img.src.startsWith("data:"))) {
                img.src = window.SCHOOL_LOGO_BASE64;
            }
        });

        const pdf = new jsPDFConstructor({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
            compress: true
        });

        for (let i = 0; i < pages.length; i++) {
            const pageEl = pages[i];

            // เคลียร์เงาและมาร์จิ้นหน้ากระดาษชั่วคราวขณะจับภาพ เพื่อให้หน้า PDF คมชัด ขอบขาวเป๊ะ 100%
            const prevShadow = pageEl.style.boxShadow;
            const prevRadius = pageEl.style.borderRadius;
            const prevMargin = pageEl.style.margin;
            pageEl.style.boxShadow = "none";
            pageEl.style.borderRadius = "0";
            pageEl.style.margin = "0";

            const canvas = await html2canvas(pageEl, {
                scale: 2.5, // เรนเดอร์ 2.5 เท่า คมชัดระดับ Hi-DPI
                useCORS: true,
                backgroundColor: "#ffffff",
                logging: false
            });

            // คืนค่ารูปแบบเดิมบนหน้าจอพรีวิว
            pageEl.style.boxShadow = prevShadow;
            pageEl.style.borderRadius = prevRadius;
            pageEl.style.margin = prevMargin;

            // ใช้ PNG แบบ Lossless คมชัด 100% ไม่มีเงาเบลอหรือรอยบีบอัดรอบเส้นตาราง/ตัวอักษรแบบ JPEG
            const imgData = canvas.toDataURL("image/png");

            if (i > 0) {
                pdf.addPage("a4", "portrait");
            }
            // ใส่ลงหน้า A4 เต็มแผ่น (210mm x 297mm) สัดส่วนตรงเป๊ะ ไม่เพี้ยน
            pdf.addImage(imgData, "PNG", 0, 0, 210, 297, undefined, "FAST");
        }

        const dateStr = getTodayIsoDate();
        let fileName = (window.currentPrintDocType === "dashboard_summary")
            ? `รายงานสรุปสถิติจำนวนนักเรียน_ซับบอนวิทยาคม_${dateStr}.pdf`
            : `ใบรายชื่อนักเรียน_ซับบอนวิทยาคม_${dateStr}.pdf`;

        pdf.save(fileName);
        showToast(`บันทึกไฟล์ PDF เรียบร้อยแล้ว (${pages.length} หน้า) 📄⚡`, "success");
    } catch (err) {
        console.error("downloadPreviewPdf error:", err);
        showToast("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: " + (err.message || err), "error");
    } finally {
        setLoader(false);
    }
};

// =========================================================================
// ส่งออกไฟล์ Excel (CSV) - เอาเฉพาะคนมีตัวตน (กำลังศึกษา) คนออกไม่ใส่
// =========================================================================
window.exportStudentsToCsv = function() {
    const list = (window.studentsRoster || []).filter(s => s.status !== "ออก");
    if (list.length === 0) {
        showToast("ไม่พบข้อมูลนักเรียนที่มีตัวตน (กำลังศึกษา) เพื่อส่งออก", "error");
        return;
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "เลขที่,รหัสนักเรียน,คำนำหน้าชื่อ-นามสกุล,ชั้น,ห้อง,ครูที่ปรึกษา,เพศ,สถานะ\n";

    list.forEach((s, idx) => {
        const advInfo = typeof getRoomAdvisorInfo === "function" ? getRoomAdvisorInfo(s.grade, s.room) : null;
        const advText = advInfo ? [advInfo.teacher1, advInfo.teacher2].filter(Boolean).join(" และ ") : "";
        const row = [
            s.no || (idx + 1),
            `"${s.studentId}"`,
            `"${s.fullName}"`,
            s.grade,
            s.room,
            `"${advText}"`,
            s.gender === "1" ? "ชาย" : "หญิง",
            s.status || "เข้า"
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    link.setAttribute("href", url);
    link.setAttribute("download", `รายชื่อนักเรียน_ซับบอนวิทยาคม_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("ส่งออกไฟล์ CSV สำเร็จเรียบร้อย 📥", "success");
};

// =========================================================================
// ส่งออกไฟล์ Excel แท้ (.xlsx) ด้วยฟอนต์ TH Sarabun PSK และจัดรูปแบบตรงตามชีท 100%
// (เอาเฉพาะคนมีตัวตน กำลังศึกษาอยู่ คนออกไม่นำมาใส่)
// =========================================================================
window.exportStudentsToExcel = async function() {
    const list = window.studentsRoster || [];
    if (list.length === 0) {
        showToast("ไม่พบข้อมูลนักเรียนเพื่อส่งออก", "error");
        return;
    }

    if (typeof ExcelJS === "undefined") {
        console.warn("ExcelJS is not loaded, falling back to CSV export.");
        return exportStudentsToCsv();
    }

    try {
        if (typeof setLoader === "function") setLoader(true);
        showToast("กำลังสร้างไฟล์ Excel (.xlsx) ฟอนต์ TH SarabunPSK... 📊", "info");

        // 1. จัดกลุ่มนักเรียนแยกตามห้อง (เอาเฉพาะคนมีตัวตน กำลังศึกษา status !== "ออก" คนออกไม่ใส่)
        const activeList = list.filter(s => s.status !== "ออก");
        const roomGroups = {};
        activeList.forEach(s => {
            const g = String(s.grade || "").replace(/[^0-9]/g, "").trim() || "1";
            const r = String(s.room || "").replace(/[^0-9]/g, "").trim() || "1";
            const key = `${g}/${r}`;
            if (!roomGroups[key]) {
                roomGroups[key] = {
                    grade: g,
                    room: r,
                    label: `ม.${g}/${r}`,
                    tabName: `ม.${g}-${r}`,
                    students: []
                };
            }
            roomGroups[key].students.push(s);
        });

        const sortedRooms = Object.values(roomGroups).sort((a, b) => {
            if (Number(a.grade) !== Number(b.grade)) return Number(a.grade) - Number(b.grade);
            return Number(a.room) - Number(b.room);
        });

        // จัดเรียงนักเรียนในแต่ละห้อง: ชาย (1) ก่อน หญิง (2) และตามด้วยรหัส นร.
        sortedRooms.forEach(rm => {
            rm.students.sort((a, b) => {
                const genA = typeof getStudentGenderSortKey === "function" ? getStudentGenderSortKey(a) : (a.gender === "1" ? 1 : 2);
                const genB = typeof getStudentGenderSortKey === "function" ? getStudentGenderSortKey(b) : (b.gender === "1" ? 1 : 2);
                if (genA !== genB) return genA - genB;
                const idA = parseInt(String(a.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
                const idB = parseInt(String(b.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
                if (idA !== idB) return idA - idB;
                return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0);
            });
        });

        const schoolName = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.schoolName) || "โรงเรียนซับบอนวิทยาคม";
        const semester = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.semester) || "ภาคเรียนที่ 1";
        const academicYear = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.academicYear) || "ปีการศึกษา 2569";
        const fontName = "TH SarabunPSK";

        // สร้างสมุดงาน Excel (Workbook)
        const workbook = new ExcelJS.Workbook();
        workbook.creator = schoolName;
        workbook.lastModifiedBy = "ระบบทะเบียนนักเรียน";
        workbook.created = new Date();

        const thinBorder = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } }
        };

        const grayFill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F5F9" }
        };

        sortedRooms.forEach(rm => {
            // สร้าง Sheet ย่อยแยกห้อง
            const ws = workbook.addWorksheet(rm.tabName, {
                views: [{ showGridLines: false }] // ซ่อนเส้นตารางพื้นหลัง ให้คลีนสวยงามพร้อมพิมพ์
            });

            // กำหนดความกว้างคอลัมน์ (A-N รวม 14 คอลัมน์)
            ws.columns = [
                { width: 6 },   // ที่
                { width: 16 },  // เลขประจำตัว
                { width: 30 },  // ชื่อ - นามสกุล
                { width: 5 },   // 1
                { width: 5 },   // 2
                { width: 5 },   // 3
                { width: 5 },   // 4
                { width: 5 },   // 5
                { width: 5 },   // 6
                { width: 5 },   // 7
                { width: 5 },   // 8
                { width: 5 },   // 9
                { width: 5 },   // 10
                { width: 14 }   // หมายเหตุ
            ];

            // --- แถวที่ 1: หัวกระดาษหลัก (สูง 35, ขนาด 18 หนา) ---
            ws.mergeCells("A1:N1");
            const row1 = ws.getRow(1);
            row1.height = 35;
            const cell1 = ws.getCell("A1");
            cell1.value = `รายชื่อนักเรียน${schoolName}   ชั้นมัธยมศึกษาปีที่ ${rm.grade}/${rm.room}      ${semester}      ${academicYear}`;
            cell1.font = { name: fontName, size: 18, bold: true };
            cell1.alignment = { vertical: "middle", horizontal: "center" };

            // --- แถวที่ 2: ครูที่ปรึกษา (สูง 24, ขนาด 16) ---
            ws.mergeCells("A2:N2");
            const row2 = ws.getRow(2);
            row2.height = 24;
            const cell2 = ws.getCell("A2");
            const advInfo = typeof getRoomAdvisorInfo === "function" ? getRoomAdvisorInfo(rm.grade, rm.room) : null;
            const advText = advInfo ? [advInfo.teacher1, advInfo.teacher2].filter(Boolean).join(" และ ") : "";
            cell2.value = advText 
                ? `ครูที่ปรึกษา  ${advText}` 
                : "ครูที่ปรึกษา ............................................................................................................................";
            cell2.font = { name: fontName, size: 16, bold: !!advText };
            cell2.alignment = { vertical: "middle", horizontal: "center" };

            // --- แถวที่ 3: แถบหัวตาราง (สูง 24, ขนาด 16 หนา, แถบสีเทาอ่อน, เส้นขอบดำ) ---
            const row3 = ws.getRow(3);
            row3.height = 24;
            row3.values = ["ที่", "เลขประจำตัว", "ชื่อ - นามสกุล", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "หมายเหตุ"];
            for (let c = 1; c <= 14; c++) {
                const cell = row3.getCell(c);
                cell.font = { name: fontName, size: 16, bold: true };
                cell.fill = grayFill;
                cell.alignment = { vertical: "middle", horizontal: "center" };
                cell.border = thinBorder;
            }

            // --- แถวที่ 4 ถึง 43: รายชื่อนักเรียน 40 แถวมาตรฐาน (สูง 24, ขนาด 16, เส้นขอบดำ) ---
            const maxRows = Math.max(rm.students.length, 40);
            for (let i = 0; i < maxRows; i++) {
                const rowNum = 4 + i;
                const row = ws.getRow(rowNum);
                row.height = 24;
                const s = rm.students[i];

                row.values = [
                    i + 1,
                    s ? String(s.studentId || "") : "",
                    s ? String(s.fullName || "") : "",
                    "", "", "", "", "", "", "", "", "", "",
                    ""
                ];

                for (let c = 1; c <= 14; c++) {
                    const cell = row.getCell(c);
                    cell.font = { name: fontName, size: 16 };
                    cell.alignment = {
                        vertical: "middle",
                        horizontal: c === 3 ? "left" : "center"
                    };
                    if (c === 2) {
                        cell.numFmt = "@"; // จัดรูปแบบเป็นข้อความ ป้องกันเลข 0 หาย
                    }
                    cell.border = thinBorder;
                }
            }
        });

        // ส่งออกไฟล์และดาวน์โหลดลงเครื่อง
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const d = new Date();
        const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = `รายชื่อนักเรียน_ซับบอนวิทยาคม_${dateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast("สร้างและดาวน์โหลดไฟล์ Excel (.xlsx) ฟอนต์ TH SarabunPSK สำเร็จเรียบร้อย! 📥", "success");
    } catch (err) {
        console.error("exportStudentsToExcel error:", err);
        showToast("เกิดข้อผิดพลาดในการสร้างไฟล์ Excel: " + err.message, "error");
        exportStudentsToCsv();
    } finally {
        if (typeof setLoader === "function") setLoader(false);
    }
};

// =========================================================================
// ระบบฝังลิงก์ Google Sheets & Excel รายชื่อนักเรียน (แยกชั้น & รวมโรงเรียน)
// =========================================================================

const DEFAULT_EMBEDDED_SHEET_LINKS = {
    master: "https://docs.google.com/spreadsheets/",
    m1: "",
    m2: "",
    m3: "",
    m4: "",
    m5: "",
    m6: "",
    webAppUrl: "https://script.google.com/macros/s/AKfycbziGwGolUdSI0PAUZCRlorWJPiAuEWkhH0QikUn6fItg2zerT50lJYVMhdPfHygHCEh/exec"
};

// ดึงลิงก์จาก LocalStorage หรือ config.js หรือค่าเริ่มต้น
window.getEmbeddedSheetLinks = function() {
    const base = Object.assign({}, DEFAULT_EMBEDDED_SHEET_LINKS, (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.studentSheetLinks) ? window.GLOBAL_CONFIG.studentSheetLinks : {});
    try {
        const stored = localStorage.getItem("sbwk_embedded_sheet_links");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (!parsed.webAppUrl) {
                parsed.webAppUrl = base.webAppUrl;
            }
            return Object.assign({}, base, parsed);
        }
    } catch (e) {
        console.warn("Could not load stored sheet links:", e);
    }
    return base;
};

// =========================================================================
// ฟังก์ชันยิงรายชื่อนักเรียนล่าสุดขึ้น Google Sheets อัตโนมัติ (Live Auto-Push)
// =========================================================================
window.syncStudentsToGoogleSheet = async function(showFeedback = true) {
    const links = getEmbeddedSheetLinks();
    const webAppUrl = (links.webAppUrl || "").trim();

    if (!webAppUrl) {
        if (showFeedback) {
            showToast("ยังไม่ได้ระบุลิงก์ Web App (กรุณากด 'ตั้งค่า/เปลี่ยนลิงก์' เพื่อระบุ)", "warning");
            toggleSheetLinkSettings(true);
        }
        return false;
    }

    const students = window.studentsRoster || [];
    if (students.length === 0) {
        if (showFeedback) showToast("ไม่พบข้อมูลนักเรียนเพื่อซิงค์", "error");
        return false;
    }

    try {
        if (showFeedback) {
            showToast("🚀 กำลังยิงรายชื่อล่าสุดไปยัง Google Sheet...", "info");
        }

        // จัดกลุ่มและเรียงลำดับนักเรียนแยกตามห้องเรียน (เอาเฉพาะคนมีตัวตน/กำลังศึกษา คนออกไม่ใส่)
        const activeStudents = (students || []).filter(s => s.status !== "ออก");
        const roomGroups = {};
        activeStudents.forEach(s => {
            const g = String(s.grade || "").replace(/[^0-9]/g, "").trim();
            const r = String(s.room || "").replace(/[^0-9]/g, "").trim();
            if (g && r) {
                const key = `${g}/${r}`;
                if (!roomGroups[key]) {
                    roomGroups[key] = {
                        grade: g,
                        room: r,
                        label: `ม.${g}/${r}`,
                        tabName: `ม.${g}-${r}`,
                        students: []
                    };
                }
                roomGroups[key].students.push(s);
            }
        });

        const sortedRooms = Object.values(roomGroups).sort((a, b) => {
            if (Number(a.grade) !== Number(b.grade)) return Number(a.grade) - Number(b.grade);
            return Number(a.room) - Number(b.room);
        });

        // จัดเรียงนักเรียนในแต่ละห้อง: ชาย (1) ก่อน หญิง (2) และตามด้วยรหัส นร.
        sortedRooms.forEach(rm => {
            rm.students.sort((a, b) => {
                const genA = getStudentGenderSortKey(a);
                const genB = getStudentGenderSortKey(b);
                if (genA !== genB) return genA - genB;
                const idA = parseInt(String(a.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
                const idB = parseInt(String(b.studentId || "").replace(/[^0-9]/g, ""), 10) || 0;
                if (idA !== idB) return idA - idB;
                return (parseInt(a.no, 10) || 0) - (parseInt(b.no, 10) || 0);
            });
        });

        const schoolName = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.schoolName) || "โรงเรียนซับบอนวิทยาคม";
        const semester = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.semester) || "ภาคเรียนที่ 1";
        const academicYear = (window.GLOBAL_CONFIG && window.GLOBAL_CONFIG.academicYear) || "ปีการศึกษา 2569";

        const payload = {
            action: "sync_roster_pdf_style",
            schoolName: schoolName,
            semester: semester,
            academicYear: academicYear,
            checkColsCount: 10,
            fontFamily: "Sarabun",
            timestamp: new Date().toISOString(),
            totalStudents: activeStudents.length,
            totalRooms: sortedRooms.length,
            advisors: window.roomAdvisorsMap || (typeof getStoredAdvisorsMap === "function" ? getStoredAdvisorsMap() : {}),
            rooms: sortedRooms.map(rm => {
                const advInfo = typeof getRoomAdvisorInfo === "function" ? getRoomAdvisorInfo(rm.grade, rm.room) : null;
                const advText = advInfo ? [advInfo.teacher1, advInfo.teacher2].filter(Boolean).join(" และ ") : "";
                return {
                    grade: rm.grade,
                    room: rm.room,
                    label: rm.label,
                    tabName: rm.tabName,
                    total: rm.students.length,
                    advisor: advText,
                    advisor1: (advInfo && advInfo.teacher1) || "",
                    advisor2: (advInfo && advInfo.teacher2) || "",
                    teacher: advText,
                    teacher1: (advInfo && advInfo.teacher1) || "",
                    teacher2: (advInfo && advInfo.teacher2) || "",
                    phone: (advInfo && advInfo.phone) || "",
                    students: rm.students.map((s, idx) => ({
                        no: idx + 1,
                        studentId: s.studentId,
                        fullName: s.fullName,
                        gender: s.gender,
                        status: "เข้า"
                    }))
                };
            }),
            students: activeStudents.map((s, idx) => {
                const advInfo = typeof getRoomAdvisorInfo === "function" ? getRoomAdvisorInfo(s.grade, s.room) : null;
                const advText = advInfo ? [advInfo.teacher1, advInfo.teacher2].filter(Boolean).join(" และ ") : "";
                return {
                    no: s.no || (idx + 1),
                    studentId: s.studentId,
                    fullName: s.fullName,
                    grade: s.grade,
                    room: s.room,
                    gender: s.gender,
                    status: "เข้า",
                    advisor: advText,
                    advisor1: (advInfo && advInfo.teacher1) || "",
                    advisor2: (advInfo && advInfo.teacher2) || "",
                    teacher: advText
                };
            })
        };

        // ยิงข้อมูลตรงไปยัง Google Apps Script Web App (ใช้ no-cors ป้องกันปัญหาข้ามโดเมน)
        await fetch(webAppUrl, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(payload)
        });

        if (showFeedback) {
            showToast(`✅ ยิงใบรายชื่อแยก ${sortedRooms.length} ห้อง ขึ้นชีทสำเร็จเรียบร้อย!`, "success");
        }
        return true;
    } catch (err) {
        console.warn("syncStudentsToGoogleSheet error:", err);
        if (showFeedback) {
            showToast("เกิดข้อผิดพลาดในการยิงข้อมูล: " + err.message, "error");
        }
        return false;
    }
};

// =========================================================================
// ป๊อปอัปเล็กๆ ติดปุ่ม: Excel & Sheet (เปิดชีทออนไลน์ หรือ ดาวน์โหลดไฟล์ Excel)
// =========================================================================
window.toggleExcelSheetPopover = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const popover = document.getElementById("excel-sheet-popover");
    if (!popover) return;
    const isShowing = popover.style.display === "block";
    popover.style.display = isShowing ? "none" : "block";
};

window.closeExcelSheetPopover = function() {
    const popover = document.getElementById("excel-sheet-popover");
    if (popover) popover.style.display = "none";
};

window.openExcelSheetChoiceModal = window.toggleExcelSheetPopover;
window.closeExcelSheetChoiceModal = window.closeExcelSheetPopover;

// ตัวเลือกที่ 1: เปิด Google Sheet (ยิงอัปเดตข้อมูลขึ้นชีท + เปิดแท็บใหม่)
window.handleChoiceOpenSheet = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    closeExcelSheetPopover();
    handleDirectSheetClick();
};

// ตัวเลือกที่ 2: โหลดไฟล์ Excel (.xlsx ด้วยฟอนต์ TH Sarabun PSK ตามสเปกชีท 100%)
window.handleChoiceDownloadExcel = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    closeExcelSheetPopover();
    exportStudentsToExcel();
};

// ปิดป็อปอัปอัตโนมัติเมื่อคลิกที่จุดอื่นของหน้าจอ
document.addEventListener("click", function(event) {
    const popover = document.getElementById("excel-sheet-popover");
    if (!popover || popover.style.display !== "block") return;
    const btn = document.getElementById("btn-excel-sheet");
    if (btn && btn.contains(event.target)) return;
    if (popover.contains(event.target)) return;
    popover.style.display = "none";
});

// =========================================================================
// เปิด Google Sheet ทันที พร้อมยิงอัปเดตข้อมูลอัตโนมัติ
// =========================================================================
window.handleDirectSheetClick = function(event) {
    if (event) event.preventDefault();
    const links = getEmbeddedSheetLinks();

    // ดึง URL ที่จะเปิด: ถ้ามี master ให้ใช้ master, ถ้าไม่มีให้ใช้ webAppUrl
    let url = (links.master && links.master !== "https://docs.google.com/spreadsheets/") 
        ? links.master.trim() 
        : (links.webAppUrl || "https://script.google.com/macros/s/AKfycbziGwGolUdSI0PAUZCRlorWJPiAuEWkhH0QikUn6fItg2zerT50lJYVMhdPfHygHCEh/exec").trim();

    // ยิงอัปเดตข้อมูลนักเรียนล่าสุดเข้า Google Sheet ในเบื้องหลังทันที
    if (links.webAppUrl && links.webAppUrl.startsWith("http")) {
        syncStudentsToGoogleSheet(false);
    }

    showToast("กำลังเปิด Google Sheet พร้อมซิงค์รายชื่อล่าสุด ⚡", "success");

    // เปิดแท็บใหม่ไปยัง Google Sheet ทันทีตามสั่ง
    window.open(url, "_blank", "noopener,noreferrer");
};

window.openStudentSheetDirectly = window.handleDirectSheetClick;

// เปิด Modal รับ / จัดการลิงก์ Google Sheets & Excel
window.openReceiveExcelLinkModal = function() {
    const modal = document.getElementById("modal-receive-excel-link");
    if (!modal) return;

    // อัปเดตข้อมูลสรุป นร. ทั้งโรงเรียนบนการ์ด Master
    const totalStudents = (window.studentsRoster || []).length;
    const inStudents = (window.studentsRoster || []).filter(s => s.status !== "ออก").length;
    const descEl = document.getElementById("sheet-modal-master-desc");
    if (descEl) {
        descEl.innerText = `ข้อมูลนักเรียนทั้งหมดทุกระดับชั้น (ม.1 - ม.6) กำลังศึกษา ${inStudents} คน (จากทั้งหมด ${totalStudents} คน)`;
    }

    // เรนเดอร์การ์ดแยกตามระดับชั้น ม.1 - ม.6
    renderSheetGradeCards();

    // ซ่อนแผงตั้งค่าลิงก์ไว้ก่อน
    const settingsPanel = document.getElementById("sheet-link-settings-panel");
    if (settingsPanel) settingsPanel.style.display = "none";
    const toggleText = document.getElementById("sheet-settings-toggle-text");
    if (toggleText) toggleText.innerText = "ตั้งค่า/เปลี่ยนลิงก์";

    modal.style.display = "flex";

    // ⚡ ระบบยิงข้อมูลออโต้: ทุกครั้งที่กดรับลิงก์ ถ้าระบุ Web App ไว้ จะยิงอัปเดตให้อัตโนมัติทันทีในเบื้องหลัง!
    const links = getEmbeddedSheetLinks();
    if (links.webAppUrl && links.webAppUrl.startsWith("http")) {
        syncStudentsToGoogleSheet(false);
    }
};

// ปิด Modal
window.closeReceiveExcelLinkModal = function() {
    const modal = document.getElementById("modal-receive-excel-link");
    if (modal) modal.style.display = "none";
};

// เรนเดอร์การ์ดระดับชั้น ม.1 - ม.6 พร้อมจำนวนนักเรียนและปุ่มทำงาน
window.renderSheetGradeCards = function() {
    const container = document.getElementById("sheet-grade-cards-grid");
    if (!container) return;

    const links = getEmbeddedSheetLinks();
    const students = window.studentsRoster || [];
    const grades = [
        { key: "m1", gradeNum: 1, label: "ม.1" },
        { key: "m2", gradeNum: 2, label: "ม.2" },
        { key: "m3", gradeNum: 3, label: "ม.3" },
        { key: "m4", gradeNum: 4, label: "ม.4" },
        { key: "m5", gradeNum: 5, label: "ม.5" },
        { key: "m6", gradeNum: 6, label: "ม.6" }
    ];

    let html = "";
    grades.forEach(g => {
        const gradeStudents = students.filter(s => {
            const num = parseInt(String(s.grade || "").replace(/[^0-9]/g, ""), 10);
            return num === g.gradeNum;
        });
        const inCount = gradeStudents.filter(s => s.status !== "ออก").length;
        const totalCount = gradeStudents.length;
        const countText = totalCount > 0 ? `${inCount} คน` : "0 คน";

        const hasSpecificLink = !!links[g.key];
        const statusBadge = hasSpecificLink 
            ? `<span style="font-size: 10px; color: #10b981; font-weight: 700;"><i class="fa-solid fa-check"></i> ชีทเฉพาะชั้น</span>`
            : `<span style="font-size: 10px; color: #64748b; font-weight: 500;">(ใช้ชีทหลัก)</span>`;

        html += `
            <div style="background: white; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; gap: 9px; min-width: 0;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background: #eef2ff; color: #4f46e5; font-weight: 800; font-size: 13.5px; border: 1.5px solid #c7d2fe; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        ${g.label}
                    </div>
                    <div style="min-width: 0; overflow: hidden;">
                        <div style="font-weight: 800; font-size: 13px; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                            ชั้น ${g.label} ${statusBadge}
                        </div>
                        <div style="font-size: 11.5px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            กำลังศึกษา ${countText}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 5px; align-items: center; flex-shrink: 0;">
                    <button type="button" onclick="openSheetInNewTab('${g.key}')" title="เปิด Google Sheet ชั้น ${g.label} ในแท็บใหม่" style="background: #10b981; color: white; border: none; padding: 7px 11px; border-radius: 8px; font-weight: 700; font-size: 11.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(16,185,129,0.25); transition: all 0.15s ease;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดชีท
                    </button>
                    <button type="button" onclick="copySheetLink('${g.key}')" title="คัดลอกลิงก์ ${g.label}" style="background: white; color: #334155; border: 1.5px solid #cbd5e1; padding: 6px 9px; border-radius: 8px; font-weight: 700; font-size: 11.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s ease;">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

// Helper: ดึงชื่อชั้นแบบอ่านง่าย
function getGradeLabelName(gradeKey) {
    const map = {
        master: "ชีทหลักรวมทุกชั้น",
        m1: "ชั้น ม.1",
        m2: "ชั้น ม.2",
        m3: "ชั้น ม.3",
        m4: "ชั้น ม.4",
        m5: "ชั้น ม.5",
        m6: "ชั้น ม.6"
    };
    return map[gradeKey] || gradeKey;
}

// 1. ฟังก์ชันเปิดในแท็บใหม่ (Open in new tab พร้อมยิงอัปเดตอัตโนมัติ)
window.openSheetInNewTab = function(gradeKey) {
    const links = getEmbeddedSheetLinks();
    let url = (links[gradeKey] || "").trim();
    if (!url || url === "https://docs.google.com/spreadsheets/") {
        url = (links.master || "").trim();
    }
    if (!url || url === "https://docs.google.com/spreadsheets/") {
        if (links.webAppUrl && links.webAppUrl.startsWith("http")) {
            url = links.webAppUrl;
        }
    }

    if (!url || url === "https://docs.google.com/spreadsheets/") {
        showToast(`ยังไม่ได้ระบุลิงก์ Google Sheets สำหรับ ${getGradeLabelName(gradeKey)}`, "warning");
        toggleSheetLinkSettings(true);
        return;
    }

    // ถ้าระบุ Web App URL ไว้ ให้ยิงอัปเดตชีทพร้อมเปิดแท็บ
    if (links.webAppUrl && links.webAppUrl.startsWith("http")) {
        syncStudentsToGoogleSheet(false);
    }

    // เปิดในแท็บใหม่ทันที ปลอดภัยและรวดเร็ว
    window.open(url, "_blank", "noopener,noreferrer");
    showToast(`เปิด Google Sheet ${getGradeLabelName(gradeKey)} ในแท็บใหม่แล้ว ↗️`, "success");
};

// 2. ฟังก์ชันคัดลอกลิงก์ (Copy Link)
window.copySheetLink = function(gradeKey) {
    const links = getEmbeddedSheetLinks();
    let url = (links[gradeKey] || "").trim();
    if (!url || url === "https://docs.google.com/spreadsheets/") {
        url = (links.master || "").trim();
    }
    if (!url || url === "https://docs.google.com/spreadsheets/") {
        if (links.webAppUrl && links.webAppUrl.startsWith("http")) {
            url = links.webAppUrl;
        }
    }

    if (!url || url === "https://docs.google.com/spreadsheets/") {
        showToast(`ยังไม่ได้ระบุลิงก์ Google Sheets สำหรับ ${getGradeLabelName(gradeKey)}`, "warning");
        toggleSheetLinkSettings(true);
        return;
    }

    const label = getGradeLabelName(gradeKey);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showToast(`คัดลอกลิงก์ ${label} เรียบร้อยแล้ว 📋`, "success");
        }).catch(() => {
            fallbackClipboardCopy(url, label);
        });
    } else {
        fallbackClipboardCopy(url, label);
    }
};

// Fallback คัดลอกคลิปบอร์ดสำหรับอุปกรณ์รุ่นเก่า
function fallbackClipboardCopy(text, label) {
    try {
        const temp = document.createElement("textarea");
        temp.value = text;
        temp.style.position = "fixed";
        temp.style.left = "-9999px";
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
        showToast(`คัดลอกลิงก์ ${label} เรียบร้อยแล้ว 📋`, "success");
    } catch (e) {
        prompt("สามารถกดคัดลอกลิงก์ด้านล่างนี้ได้เลยครับ:", text);
    }
}

// 3. ฟังก์ชันเปิด/ปิดแผงแก้ไขลิงก์
window.toggleSheetLinkSettings = function(forceOpen = null) {
    const panel = document.getElementById("sheet-link-settings-panel");
    if (!panel) return;

    const isVisible = panel.style.display !== "none";
    const shouldOpen = forceOpen !== null ? forceOpen : !isVisible;

    if (shouldOpen) {
        ensureAcademicAuth(() => {
            executeToggleSheetLinkSettings(true);
        }, "ตั้งค่าลิงก์ Google Sheets");
    } else {
        executeToggleSheetLinkSettings(false);
    }
};

function executeToggleSheetLinkSettings(shouldOpen) {
    const panel = document.getElementById("sheet-link-settings-panel");
    const toggleText = document.getElementById("sheet-settings-toggle-text");
    if (!panel) return;

    if (shouldOpen) {
        // นำค่าปัจจุบันมาใส่ใน inputs
        const links = getEmbeddedSheetLinks();
        const keys = ["master", "m1", "m2", "m3", "m4", "m5", "m6"];
        keys.forEach(k => {
            const input = document.getElementById(`sheet-input-${k}`);
            if (input) input.value = links[k] || "";
        });

        const webappInput = document.getElementById("sheet-input-webapp");
        if (webappInput) webappInput.value = links.webAppUrl || "";

        panel.style.display = "block";
        if (toggleText) toggleText.innerText = "ซ่อนการตั้งค่า";
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
        panel.style.display = "none";
        if (toggleText) toggleText.innerText = "ตั้งค่า/เปลี่ยนลิงก์";
    }
}

// 4. บันทึกลิงก์จากฟอร์ม
window.saveSheetLinksFromInputs = function() {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.saveSheetLinksFromInputs(), "บันทึกลิงก์ Google Sheets");
        return;
    }
    const keys = ["master", "m1", "m2", "m3", "m4", "m5", "m6"];
    const links = {};
    keys.forEach(k => {
        const input = document.getElementById(`sheet-input-${k}`);
        if (input) {
            links[k] = input.value.trim();
        }
    });

    const webappInput = document.getElementById("sheet-input-webapp");
    if (webappInput) {
        links.webAppUrl = webappInput.value.trim();
    }

    try {
        localStorage.setItem("sbwk_embedded_sheet_links", JSON.stringify(links));
        showToast("บันทึกลิงก์ Google Sheets สำเร็จเรียบร้อย ⚡", "success");
        renderSheetGradeCards();
        toggleSheetLinkSettings(false);
    } catch (e) {
        showToast("เกิดข้อผิดพลาดในการบันทึกลิงก์: " + e.message, "error");
    }
};

// 5. คืนค่าเริ่มต้นของลิงก์
window.resetDefaultSheetLinks = function() {
    if (!isAcademicAuthorized()) {
        ensureAcademicAuth(() => window.resetDefaultSheetLinks(), "คืนค่าเริ่มต้นลิงก์ Google Sheets");
        return;
    }
    if (confirm("ต้องการคืนค่าเริ่มต้นของลิงก์ Google Sheets ทั้งหมดหรือไม่?")) {
        try {
            localStorage.removeItem("sbwk_embedded_sheet_links");
            const keys = ["master", "m1", "m2", "m3", "m4", "m5", "m6"];
            keys.forEach(k => {
                const input = document.getElementById(`sheet-input-${k}`);
                if (input) input.value = DEFAULT_EMBEDDED_SHEET_LINKS[k] || "";
            });
            const webappInput = document.getElementById("sheet-input-webapp");
            if (webappInput) webappInput.value = "";
            renderSheetGradeCards();
            showToast("คืนค่าเริ่มต้นเรียบร้อยแล้ว", "success");
        } catch (e) {}
    }
};

window.openReceivePdfLinkModal = function() {
    openSelectPdfRoomsModal();
};

// Auto initialization (ป้องกันเรียกซ้ำซ้อน รันเพียงครั้งเดียว)
let isAppInitialized = false;
function initializeStudentsApp() {
    if (isAppInitialized) return;
    isAppInitialized = true;
    initAcademicPinKeypad();
    updateAuthBadgeUI();
    loadStudents();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeStudentsApp);
} else {
    initializeStudentsApp();
}
