/**
 * Frontend JavaScript - ระบบเช็คชื่อนักเรียนออนไลน์
 * จัดการตรรกะหน้าจอและการเชื่อมต่อกับ Google Apps Script Web App
 */

// ค่ากำหนดตั้งค่าเริ่มต้น
const CONFIG_KEY = "school_attendance_config";
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1TY5QNusQpKayPX8MZXFvUcx--bae7B5Wty38FfzbW90/edit?usp=sharing";

let config = {
    sheetUrl: (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG.sheetUrl) ? GLOBAL_CONFIG.sheetUrl : DEFAULT_SHEET_URL,
    scriptUrl: (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG.scriptUrl) ? GLOBAL_CONFIG.scriptUrl : "",
    schoolName: "โรงเรียนซับบอนวิทยาคม",
    workGroup: "กลุ่มงานบริหารทั่วไป",
    semester: "ภาคเรียนที่ 1",
    academicYear: "ปีการศึกษา 2569"
};

// สถานะการทำงานของระบบ (Global State)
let students = [];       // รายชื่อนักเรียนทั้งหมด
let rooms = [];          // ห้องเรียนทั้งหมดแยกเป็นกลุ่ม
let holidays = [];       // รายการวันหยุด
let users = [];          // รายชื่อครู
let todayLogs = {};      // บันทึกเช็คชื่อของวันนี้แยกตามห้อง (ภาพรวม)
let todayLogsDetails = {}; // บันทึกเช็คชื่อของวันนี้แยกรายคนเพื่อใช้คงสถานะ: { studentId: status }
let loggedInUser = null; // ผู้ใช้งานที่เข้าสู่ระบบ
let loginPinDigits = ""; // รหัส PIN ที่กำลังกรอกในหน้าล็อกอิน
let currentView = "home";
let activeGradeFilter = "ALL";
let activeStatusFilter = "ALL"; // ALL, CHECKED, UNCHECKED
let activeStatsTab = "accumulated";
let currentCheckingDate = (function(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})(); // วันที่กำลังดำเนินการเช็คชื่อเริ่มต้นเป็นวันปัจจุบัน
let allStatsData = null; // โหลดสถิติทั้งหมดมาเก็บไว้ในแรมครั้งเดียวตอนเริ่มต้น
let documentsData = []; // ประวัติเอกสารและลายเซ็น
let atRiskTeachersCache = {}; // ข้อมูลครูที่รับผิดชอบเอกสารและลายเซ็น

// ตัวแปรควบคุมการเช็คชื่อของห้องที่เลือก
let selectedRoom = null; // { grade, room }
let attendanceRecords = []; // [{ studentId, name, gender, status }]

// ตัวแปรควบคุมแป้นกดรหัส PIN
let pinDigits = "";
let pinCallback = null; // ฟังก์ชันที่จะรันเมื่อกรอก PIN ถูกต้อง
let pinRequiredRole = null; // บทบาทที่ต้องการ ("ADMIN" หรือ "STUDENT_AFFAIRS" หรือ "ANY")
let authenticatedAdminPin = null; // เก็บ PIN ของแอดมินชั่วคราวขณะเข้าเมนูจัดการ
// ตัวแปรบันทึกความประพฤติ
let misconductLogs = [];
let selectedMisconductStudent = null; // นักเรียนที่กำลังจะเพิ่มบันทึกความประพฤติ

// โหลดการตั้งค่าเมื่อเริ่มต้น
function loadConfig() {
    // โหลดโดยตรงจาก GLOBAL_CONFIG ในไฟล์ config.js เท่านั้น (สำหรับโฮสติ้ง)
    if (typeof GLOBAL_CONFIG !== "undefined") {
        if (GLOBAL_CONFIG.scriptUrl) config.scriptUrl = GLOBAL_CONFIG.scriptUrl;
        if (GLOBAL_CONFIG.sheetUrl) config.sheetUrl = GLOBAL_CONFIG.sheetUrl;
        if (GLOBAL_CONFIG.schoolName) config.schoolName = GLOBAL_CONFIG.schoolName;
        if (GLOBAL_CONFIG.workGroup) config.workGroup = GLOBAL_CONFIG.workGroup;
        if (GLOBAL_CONFIG.semester) config.semester = GLOBAL_CONFIG.semester;
        if (GLOBAL_CONFIG.academicYear) config.academicYear = GLOBAL_CONFIG.academicYear;
    }
}

/**
 * อัปเดตข้อมูลของโรงเรียนในหน้าจอ UI ตามไฟล์ config.js
 */
function applyMetadataToUI() {
    const elSchoolName = document.getElementById("sidebar-school-name");
    const elWorkGroup = document.getElementById("sidebar-work-group");
    const elPreviewSchool = document.getElementById("preview-school-name");
    const elPreviewSem = document.getElementById("preview-semester");
    const elPreviewYear = document.getElementById("preview-academic-year");
    const elHeaderSchool = document.getElementById("header-school-name");
    
    if (elSchoolName) elSchoolName.innerText = config.schoolName;
    if (elWorkGroup) elWorkGroup.innerText = config.workGroup;
    if (elPreviewSchool) elPreviewSchool.innerText = config.schoolName;
    if (elPreviewSem) elPreviewSem.innerText = config.semester;
    if (elPreviewYear) elPreviewYear.innerText = config.academicYear;
    if (elHeaderSchool) elHeaderSchool.innerText = config.schoolName;
    
    // ตั้งค่า Document Title ของหน้าเว็บ
    document.title = `${config.schoolName} - ระบบเช็คชื่อนักเรียนออนไลน์`;
}

// แยก Sheet ID จาก URL
function extractSheetId(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : url;
}

// ดึงวันที่ปัจจุบัน YYYY-MM-DD
function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = ("0" + (d.getMonth() + 1)).slice(-2);
    const day = ("0" + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
}

/**
 * แปลงรูปแบบวันที่ YYYY-MM-DD เป็นรูปแบบภาษาไทยที่เป็นมิตร เช่น "6 ก.ค. 2569"
 */
function formatThaiFriendlyDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const day = parseInt(parts[2], 10);
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[0], 10) + 543;
    
    const thaiMonths = [
        "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
        "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
    ];
    
    const monthName = thaiMonths[monthIndex] || parts[1];
    return `${day} ${monthName} ${year}`;
}

// แสดงข้อความแจ้งเตือน Toast
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    // หายไปใน 4 วินาที
    setTimeout(() => {
        toast.style.animation = "slideIn 0.3s ease-out reverse";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// แสดง/ซ่อน Loader (มีเอฟเฟกต์เบลอกึ่งโปร่งใส ป้องกันจอกระพริบ)
function setLoader(show) {
    const loader = document.getElementById("app-loading");
    if (show) {
        loader.classList.remove("hidden");
    } else {
        loader.classList.add("hidden");
    }
}

/**
 * ฟังก์ชันประมวลผลข้อมูลแยกเพศ คำนำหน้า และชื่อ-นามสกุล ของนักเรียน
 */
function processStudentData(student) {
    let fullName = student.fullName || "";
    let prefix = "";
    let firstName = "";
    let lastName = "";
    let gender = "1"; // ชาย = 1, หกิง = 2
    
    fullName = fullName.replace(/\s+/g, ' ').trim();
    
    const prefixes = ["ด.ช.", "ด.ก.", "เด็กชาย", "เด็กหกิง", "นาย", "นางสาว", "นาง", "น.ส."];
    for (let p of prefixes) {
        if (fullName.startsWith(p)) {
            prefix = p;
            let rest = fullName.substring(p.length).trim();
            let nameParts = rest.split(' ');
            firstName = nameParts[0] || "";
            lastName = nameParts.slice(1).join(' ') || "";
            
            if (p === "ด.ก." || p === "เด็กหกิง" || p === "นางสาว" || p === "นาง" || p === "น.ส.") {
                gender = "2";
            } else {
                gender = "1";
            }
            break;
        }
    }
    
    if (!prefix) {
        let nameParts = fullName.split(' ');
        firstName = nameParts[0] || "";
        lastName = nameParts.slice(1).join(' ') || "";
    }
    
    student.gender = gender;
    student.prefix = prefix;
    student.firstName = firstName;
    student.lastName = lastName;
    student.fullName = fullName;
    return student;
}

/**
 * แปลงอักษรย่อสถานะเช็คชื่อจาก Google Sheets เป็นคำเต็มสำหรับการประมวลผลบนหน้าจอ
 */
function translateAbbreviationToStatus(abbr) {
    const map = {
        "ม": "มา",
        "ล": "ลา",
        "ข": "ขาด",
        "ส": "สาย",
        "ด": "โดด"
    };
    return map[abbr] || abbr;
}

/**
 * แปลงคำเต็มของสถานะเช็คชื่อเป็นอักษรย่อ เพื่อลดขนาดพื้นที่และแบนด์วิดท์ในการจัดเก็บข้อมูลลง Sheets
 */
function translateStatusToAbbreviation(status) {
    const map = {
        "มา": "ม",
        "ลา": "ล",
        "ขาด": "ข",
        "สาย": "ส",
        "โดด": "ด"
    };
    return map[status] || status;
}

/**
 * แปลงข้อความ CSV เป็นอาเรย์ (กรณี Fallback)
 * รองรับคอลัมน์ A: เลขประจำตัว|ชั้นเรียน/ห้อง|ชื่อเต็ม
 */
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let cleanLine = line;
        if (line.startsWith('"') && line.endsWith('"')) {
            cleanLine = line.substring(1, line.length - 1);
        }
        
        const cells = cleanLine.split('|');
        if (cells.length < 3) continue;
        
        const studentId = cells[0].trim();
        const gradeRoom = cells[1].trim(); // e.g. "ม.1/1"
        const fullName = cells[2].trim();
        
        const gradeRoomParts = gradeRoom.split('/');
        const grade = gradeRoomParts[0] || "";
        const room = gradeRoomParts[1] || "";
        
        let student = {
            no: i,
            studentId: studentId,
            grade: grade,
            room: room,
            fullName: fullName
        };
        
        result.push(processStudentData(student));
    }
    return result;
}

/**
 * 1. โหลดข้อมูลเริ่มต้นทั้งหมด
 */
async function loadInitialData() {
    setLoader(true);
    
    // หากมีการกำหนดลิงก์ Apps Script ให้โหลดข้อมูลรวมถึงรายชื่อนักเรียนและข้อมูลการเช็คชื่อของวันนี้ในคราวเดียว เพื่อเลี่ยงปักหา CORS
    if (config.scriptUrl) {
        try {
            const res = await fetch(`${config.scriptUrl}?action=init&date=${currentCheckingDate}`);
            const data = await res.json();
            
            if (data.success) {
                let roomCounters = {};
                students = (data.students || []).map((s) => {
                    let processed = processStudentData(s);
                    let roomKey = `${processed.grade}/${processed.room}`;
                    if (!roomCounters[roomKey]) roomCounters[roomKey] = 1;
                    processed.no = roomCounters[roomKey]++;
                    return processed;
                });
                holidays = data.holidays || [];
                users = data.users || [];
                todayLogs = data.todayLogs || {};
                todayLogsDetails = data.todayLogsDetails || {};
                for (let id in todayLogsDetails) {
                    todayLogsDetails[id] = translateAbbreviationToStatus(todayLogsDetails[id]);
                }
                
                if (students.length === 0) {
                    showToast("ดึงข้อมูลเรียบร้อย แต่ไม่พบรายชื่อในหน้าชีทแรก", "error");
                } else {
                    showToast(`โหลดรายชื่อสำหรับวันที่ ${currentCheckingDate} สำเร็จ ${students.length} คน`);
                }
            } else {
                showToast("ดึงสคริปต์ล้มเหลว: " + data.message, "error");
            }
        } catch (e) {
            console.error(e);
            showToast("สคริปต์ขัดข้อง กำลังโหลดรายชื่อด้วยวิธีสำรองแบบ CSV...", "error");
            await loadStudentsFromCsvFallback();
        }
    } else {
        showToast("ไม่ได้ตั้งค่า Apps Script กำลังโหลดรายชื่อแบบดึงชีทตรง...", "error");
        await loadStudentsFromCsvFallback();
    }
    
    // เริ่มต้นแสดงผลหน้าแรก
    updateHeaderDate();
    checkTodayHoliday();
    renderRooms();
    calculateOverallStats();
    
    setLoader(false);
    
    // โหลดประวัติสถิติทั้งหมดมาเก็บในหน่วยความจำตั้งแต่ต้นแบบเบื้องหลัง (Async)
    if (config.scriptUrl && !allStatsData) {
        fetchStatsDataOnce();
    }
    
    // โหลดข้อมูลอื่นๆ ที่รอได้ (Deferred Load) ไว้เบื้องหลัง
    if (config.scriptUrl) {
        fetchDeferredDataOnce();
    }
}

let deferredDataPromise = null;
async function fetchDeferredDataOnce() {
    if (!config.scriptUrl) return;
    if (deferredDataPromise) return deferredDataPromise;
    
    deferredDataPromise = (async () => {
        try {
            const res = await fetch(`${config.scriptUrl}?action=getDeferredData`);
            const data = await res.json();
            if (data.success) {
                documentsData = data.documents || [];
                atRiskTeachersCache = data.atRiskTeachers || {};
                isDeferredDataLoaded = true;
                populateTeacherDropdowns();
            }
        } catch (e) {
            console.error("โหลดข้อมูลเบื้องหลังล้มเหลว", e);
            deferredDataPromise = null; // retry on next call
        }
    })();
    return deferredDataPromise;
}

async function fetchStatsDataOnce() {
    if (!config.scriptUrl) return;
    try {
        const res = await fetch(`${config.scriptUrl}?action=getStats&month=ALL&room=ALL`);
        const data = await res.json();
        if (data.success) {
            allStatsData = data.stats;
            if (allStatsData && allStatsData.logs) {
                allStatsData.logs.forEach(log => {
                    log.status = translateAbbreviationToStatus(log.status);
                });
            }
            if (typeof updateAtRiskNoticeInTab === 'function') updateAtRiskNoticeInTab();
            if (typeof calculateOverallStats === 'function') calculateOverallStats();
        }
    } catch (e) {
        console.error("โหลดสถิติเริ่มต้นล้มเหลว", e);
    }
}

function populateTeacherDropdowns() {
    const hrSelect = document.getElementById("at-risk-homeroom-teacher");
    const saSelect = document.getElementById("at-risk-student-affairs");
    if (!hrSelect || !saSelect) return;
    
    const currentHr = hrSelect.value;
    const currentSa = saSelect.value;
    
    let options = '<option value="">-- เลือกครูที่ปรึกษา --</option>';
    let saOptions = '<option value="">-- เลือกหัวหน้างานกิจการนักเรียน --</option>';
    
    users.forEach(u => {
        options += `<option value="${u.name}">${u.name}</option>`;
        saOptions += `<option value="${u.name}">${u.name}</option>`;
    });
    
    hrSelect.innerHTML = options;
    saSelect.innerHTML = saOptions;
    
    if (currentHr) hrSelect.value = currentHr;
    if (currentSa) saSelect.value = currentSa;
}

async function loadStudentsFromCsvFallback() {
    const sheetId = extractSheetId(config.sheetUrl) || "1TY5QNusQpKayPX8MZXFvUcx--bae7B5Wty38FfzbW90";
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    
    try {
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error("การเข้าถึงชีทล้มเหลว โปรดเช็คการแชร์ชีท");
        const text = await res.text();
        students = parseCSV(text);
        
        if (students.length === 0) {
            showToast("ไม่พบรายชื่อนักเรียนใน Google Sheet", "error");
        } else {
            showToast(`โหลดรายชื่อผ่าน CSV สำเร็จ ${students.length} คน (แบบออฟไลน์/อ่านอย่างเดียว)`);
        }
    } catch (e) {
        showToast("โหลดรายชื่อผ่าน CSV ไม่สำเร็จ: " + e.message, "error");
    }
}

// อัปเดตแสดงวันที่หน้าแรกตามวันที่เลือกจริง
function updateHeaderDate() {
    const fullDays = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
    const fullMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const shortMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    
    const parts = currentCheckingDate.split("-");
    const now = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    
    const fullDayName = fullDays[now.getDay()];
    const dateNum = now.getDate();
    const fullMonthName = fullMonths[now.getMonth()];
    const shortMonthName = shortMonths[now.getMonth()];
    const yearNum = now.getFullYear() + 543; // แปลงเป็น พ.ศ.
    
    const displayStrDesktop = `${fullDayName}ที่ ${dateNum} ${fullMonthName} พ.ศ. ${yearNum}`;
    const displayStrMobile = `${dateNum} ${shortMonthName} ${yearNum}`;
    
    const displayHtml = `<span class="desktop-date">${displayStrDesktop}</span><span class="mobile-date">${displayStrMobile}</span>`;
    
    document.getElementById("home-date-display").innerHTML = displayHtml;
    
    const attDateDisplay = document.getElementById("attendance-date-display");
    if (attDateDisplay) {
        attDateDisplay.innerHTML = displayHtml;
    }
    
    // อัปเดตค่าปกิทิน input type="date" ด้วย
    const homeDatePicker = document.getElementById("home-date-picker");
    if (homeDatePicker) {
        homeDatePicker.value = currentCheckingDate;
    }
}

// ตรวจสอบวันหยุดตามวันที่เลือกจริง
function checkTodayHoliday() {
    const todayStr = currentCheckingDate;
    
    const parts = currentCheckingDate.split("-");
    const now = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const dayOfWeek = now.getDay();
    
    let text = "";
    let isHoliday = false;
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        text = "วันหยุด (เสาร์-อาทิตย์)";
        isHoliday = true;
    } else {
        const customHoliday = holidays.find(h => h.date === todayStr);
        if (customHoliday) {
            text = `วันหยุด (${customHoliday.name})`;
            isHoliday = true;
        } else {
            text = "เปิดเรียนปกติ";
            isHoliday = false;
        }
    }
    
    const tooltipText = text;
    const homePill = document.getElementById("home-date-pill");
    const attPill = document.getElementById("attendance-date-pill");
    
    if (homePill) {
        homePill.setAttribute("data-tooltip", tooltipText);
        homePill.removeAttribute("title");
        homePill.classList.remove("is-holiday", "is-workday");
        homePill.classList.add(isHoliday ? "is-holiday" : "is-workday");
    }
    if (attPill) {
        attPill.setAttribute("data-tooltip", tooltipText);
        attPill.removeAttribute("title");
        attPill.classList.remove("is-holiday", "is-workday");
        attPill.classList.add(isHoliday ? "is-holiday" : "is-workday");
    }
}

// ตรวจสอบความถูกต้องว่าวันใดวันหนึ่งเป็นวันหยุดหรือไม่
function isHoliday(dateStr) {
    const parts = dateStr.split("-");
    const now = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return true;
    return holidays.some(h => h.date === dateStr);
}

// ตัวแปรสำหรับเก็บ Instance ของกราฟ
let miniRadialCharts = {};

// Removed initStackedBarChart





// คำนวณเปอร์เซ็นต์รวมของเด็กทั้งโรงเรียนในวันนั้น (5 กริด) หรือตามชั้นที่เลือก
function calculateOverallStats() {
    let totalPresent = 0;
    let totalLeave = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalCut = 0;
    let grandTotal = 0;
    
    Object.keys(todayLogs).forEach(roomKey => {
        const grade = roomKey.split('/')[0];
        if (activeGradeFilter !== "ALL" && grade !== activeGradeFilter) return;
        
        const summary = todayLogs[roomKey];
        totalPresent += summary.Present || 0;
        totalLeave += summary.Leave || 0;
        totalAbsent += summary.Absent || 0;
        totalLate += summary.Late || 0;
        totalCut += summary.Cut || 0;
        grandTotal += summary.Total || 0;
    });
    
    const getPct = (val) => grandTotal > 0 ? "(" + ((val / grandTotal) * 100).toFixed(1) + "%)" : "(0.0%)";
    
    document.getElementById("total-present").innerText = totalPresent;
    document.getElementById("total-leave").innerText = totalLeave;
    document.getElementById("total-absent").innerText = totalAbsent;
    document.getElementById("total-late").innerText = totalLate;
    document.getElementById("total-cut").innerText = totalCut;
    
    // อัปเดตกราฟโหลน้ำ (Water Jar)
    const filteredStudents = activeGradeFilter === "ALL" 
        ? students 
        : students.filter(s => s.grade === activeGradeFilter);
        
    const allRoomsSet = new Set(filteredStudents.map(s => `${s.grade}/${s.room}`));
    const totalRoomsCount = allRoomsSet.size || 1;
    
    let checkedRoomsCount = 0;
    const uncheckedRooms = [];
    allRoomsSet.forEach(room => {
        if (todayLogs[room]) {
            checkedRoomsCount++;
        } else {
            uncheckedRooms.push(room);
        }
    });
    
    let fillPct = Math.round((checkedRoomsCount / totalRoomsCount) * 100);
    if (fillPct > 100) fillPct = 100;
    
    uncheckedRooms.sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
    
    const tooltip = document.getElementById("summary-hover-tooltip");

    const bindSummaryTooltip = (elementId, titleHtml, items) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.removeAttribute("title");
        
        // Remove old hover listeners just in case
        el.onmouseenter = null;
        el.onmouseleave = null;

        el.onclick = (e) => {
            e.stopPropagation();
            
            // Check if this card's tooltip is already open
            const isCurrentlyOpen = el.dataset.locked === "true";
            
            // Close all first
            document.querySelectorAll(".summary-card").forEach(c => {
                c.dataset.locked = "false";
                c.classList.remove("active-card"); // Optional visual feedback
            });
            hideSummaryTooltip();
            
            // If it wasn't open, open it now
            if (!isCurrentlyOpen) {
                el.dataset.locked = "true";
                el.classList.add("active-card");
                showSummaryTooltip(titleHtml, items, el);
            }
        };
    };

    // Global click listener to close tooltip when clicking outside
    if (!window.hasTooltipCloseListener) {
        document.addEventListener('click', (e) => {
            // Close if clicking outside the card OR clicking directly on the backdrop (not inside content)
            const isClickOnBackdrop = e.target.id === 'summary-folder-modal';
            const isClickOutsideCard = !e.target.closest('.summary-card') && !e.target.closest('.folder-modal-content');
            
            if (isClickOnBackdrop || isClickOutsideCard) {
                document.querySelectorAll(".summary-card").forEach(c => {
                    c.dataset.locked = "false";
                    c.classList.remove("active-card");
                });
                hideSummaryTooltip();
            }
        });
        window.hasTooltipCloseListener = true;
    }



    let presentList = [];
    let leaveList = [];
    let absentList = [];
    let lateList = [];
    let cutList = [];
    
    // คำนวณสถิติย้อนหลังสำหรับจัดการนักเรียนกลุ่มเสี่ยง (At-Risk)
    let sStats = {};
    if (allStatsData && allStatsData.logs) {
        allStatsData.logs.forEach(log => {
            let sid = log.studentId;
            if (!sStats[sid]) sStats[sid] = { a: 0, l: 0 };
            if (log.status === 'ขาด') sStats[sid].a++;
            if (log.status === 'สาย') sStats[sid].l++;
        });
    }

    filteredStudents.forEach(s => {
        const status = todayLogsDetails[s.studentId];
        if (!status) return;
        
        let label = `${s.fullName} (${s.grade}/${s.room})`;
        
        // ดึงสถิติขาด/สาย รวม
        let totalA = sStats[s.studentId] ? sStats[s.studentId].a : 0;
        let totalL = sStats[s.studentId] ? sStats[s.studentId].l : 0;
        
        if (status === "มา") presentList.push(label);
        else if (status === "ลา") leaveList.push(label);
        else if (status === "โดด") cutList.push({text: label, color: "#8b5cf6"});
        else if (status === "ขาด") {
            let itemData = { text: label, color: "#ef4444" };
            if (totalA >= 3) {
                let noticeCount = totalA >= 9 ? 3 : (totalA >= 6 ? 2 : 1);
                let docType = "ป.ค.9";
                let fullDocType = `${docType}_ครั้งที่${noticeCount}`;
                
                itemData.text = `${label} <span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 6px; font-size: 11px; margin-left: 5px; font-weight: bold;">ขาด ${totalA} วัน</span> <span style="background: var(--color-primary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-file-signature"></i> จัดการเอกสาร</span>`;
                itemData.action = () => {
                    openAtRiskActionModal(s.studentId, s.fullName, `${s.grade}/${s.room}`, docType, fullDocType, 'hr');
                };
            }
            absentList.push(itemData);
        }
        else if (status === "สาย") {
            let itemData = { text: label, color: "#f59e0b" };
            if (totalL >= 3) {
                let noticeCount = totalL >= 8 ? 3 : (totalL >= 5 ? 2 : 1);
                let docType = "ป.ค.8";
                let fullDocType = `${docType}_ครั้งที่${noticeCount}`;
                
                itemData.text = `${label} <span style="background: #ffedd5; color: #c2410c; padding: 2px 6px; border-radius: 6px; font-size: 11px; margin-left: 5px; font-weight: bold;">สาย ${totalL} ครั้ง</span> <span style="background: var(--color-primary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-file-signature"></i> จัดการเอกสาร</span>`;
                itemData.action = () => {
                    openAtRiskActionModal(s.studentId, s.fullName, `${s.grade}/${s.room}`, docType, fullDocType, 'hr');
                };
            }
            lateList.push(itemData);
        }
    });

    bindSummaryTooltip("summary-card-present", "📌 มาเรียนปกติ", presentList);
    bindSummaryTooltip("summary-card-absent", "📌 ขาด", absentList);
    bindSummaryTooltip("summary-card-late", "📌 สาย", lateList);
    bindSummaryTooltip("summary-card-leave", "📌 ลา", leaveList);
    bindSummaryTooltip("summary-card-cut", "📌 หนีเรียน", cutList);
    
    const checkedRoomsSorted = Array.from(allRoomsSet).filter(r => todayLogs[r]).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
    
    let checkedItems = checkedRoomsSorted.map(r => ({
        text: `<i class="fa-solid fa-check-circle"></i> ${r}`,
        color: "#10b981",
        action: () => {
            activeStatusFilter = "ALL";
            activeGradeFilter = "ALL";
            renderRooms();
            openAttendanceCheck(r.split('/')[0], r.split('/')[1]);
        }
    }));
    
    let uncheckedItems = uncheckedRooms.map(r => ({
        text: `<i class="fa-solid fa-circle-xmark"></i> ${r}`,
        color: "#ef4444",
        action: () => {
            activeStatusFilter = "ALL";
            activeGradeFilter = "ALL";
            renderRooms();
            openAttendanceCheck(r.split('/')[0], r.split('/')[1]);
        }
    }));
    
    const progressData = {
        type: "two-columns",
        col1: { title: "✅ เช็คแล้ว", items: checkedItems },
        col2: { title: "❌ ยังไม่เช็ค", items: uncheckedItems }
    };
    
    bindSummaryTooltip("summary-card-progress", "📌 สถานะการเช็คชื่อห้อง", progressData);
    
    const waterPctText = document.getElementById("water-pct-text");
    if (waterPctText) {
        waterPctText.innerText = fillPct + "%";
    }
    
    const waterWaveFill = document.getElementById("water-wave-fill");
    if (waterWaveFill) {
        // top: 100% คือน้ำแห้ง, top: 0% คือน้ำเต็ม
        // ชดเชยคลื่นให้ดันขึ้นเล็กน้อยเวลาน้ำเต็ม เพื่อให้มิดโหลพอดี
        const waveTop = 100 - (fillPct * 1.1); 
        waterWaveFill.style.top = Math.max(-10, waveTop) + "%";
    }
    // อัปเดต Mini Water Jars
    const tAll = totalPresent + totalAbsent + totalLate + totalLeave + totalCut;
    const getPctNum = (v) => tAll === 0 ? 0 : Math.round((v / tAll) * 100);
    
    const updateMiniJar = (id, pct) => {
        const textEl = document.getElementById("pct-" + id);
        const waveEl = document.getElementById("wave-" + id);
        if (textEl && waveEl) {
            textEl.innerText = pct + "%";
            const waveTop = 100 - (pct * 1.1);
            waveEl.style.top = Math.max(-10, waveTop) + "%";
        }
    };
    
    updateMiniJar("present", getPctNum(totalPresent));
    updateMiniJar("absent", getPctNum(totalAbsent));
    updateMiniJar("late", getPctNum(totalLate));
    updateMiniJar("leave", getPctNum(totalLeave));
    updateMiniJar("cut", getPctNum(totalCut));
    
    // อัปเดตการ์ดที่ 6: เช็คครบแล้ว
    if (document.getElementById("total-progress")) {
        document.getElementById("total-progress").innerText = `${checkedRoomsCount}/${totalRoomsCount}`;
        updateMiniJar("progress", fillPct);
    }
}

/**
 * 2. แสดงกริดห้องเรียน (Home View)
 */
function renderRooms() {
    const container = document.getElementById("rooms-list-container");
    container.innerHTML = "";
    
    // ตั้งค่า Event Listener สำหรับปุ่มกรอง (ทำแค่ครั้งเดียวด้วย Event Delegation ถ้าทำได้ หรือผูกตอนสร้าง)
    // สำหรับ status filter:
    const statusFiltersContainer = document.getElementById("status-filters");
    if (statusFiltersContainer) {
        statusFiltersContainer.innerHTML = `
            <button class="pill status-all ${activeStatusFilter === 'ALL' ? 'active' : ''}" data-status="ALL">ทั้งหมด</button>
            <button class="pill status-checked ${activeStatusFilter === 'CHECKED' ? 'active' : ''}" data-status="CHECKED">เช็คแล้ว</button>
            <button class="pill status-unchecked ${activeStatusFilter === 'UNCHECKED' ? 'active' : ''}" data-status="UNCHECKED">ยังไม่เช็ค</button>
        `;
        
        statusFiltersContainer.querySelectorAll(".pill").forEach(btn => {
            btn.onclick = () => {
                activeStatusFilter = btn.getAttribute("data-status");
                renderRooms();
            };
        });
    }
    
    const roomsMap = {};
    students.forEach(s => {
        const key = `${s.grade}/${s.room}`;
        if (!roomsMap[key]) {
            roomsMap[key] = { grade: s.grade, room: s.room, totalCount: 0 };
        }
        roomsMap[key].totalCount++;
    });
    
    const sortedRoomKeys = Object.keys(roomsMap).sort((a, b) => {
        return a.localeCompare(b, 'th', { numeric: true });
    });
    
    const gradeStats = {};
    sortedRoomKeys.forEach(key => {
        const roomInfo = roomsMap[key];
        if (!gradeStats[roomInfo.grade]) gradeStats[roomInfo.grade] = { total: 0, checked: 0 };
        gradeStats[roomInfo.grade].total++;
        if (todayLogs[key]) gradeStats[roomInfo.grade].checked++;
    });

    const gradeFiltersContainer = document.getElementById("grade-filters");
    gradeFiltersContainer.innerHTML = `<button class="pill status-all ${activeGradeFilter === 'ALL' ? 'active' : ''}" data-grade="ALL">ทุกระดับ</button>`;
    
    const uniqueGrades = Object.keys(gradeStats).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
    
    uniqueGrades.forEach(grade => {
        const isCheckedAll = (gradeStats[grade].checked === gradeStats[grade].total && gradeStats[grade].total > 0);
        const isActive = activeGradeFilter === grade;
        
        const pill = document.createElement("button");
        pill.className = `pill ${isActive ? 'active' : ''}`;
        pill.setAttribute("data-grade", grade);
        
        if (isCheckedAll) {
            pill.classList.add("status-checked");
            pill.innerHTML = `<i class="fa-solid fa-check"></i> ${grade}`;
        } else {
            pill.classList.add("status-unchecked");
            pill.innerHTML = grade;
        }
        
        gradeFiltersContainer.appendChild(pill);
    });
    
    sortedRoomKeys.forEach(key => {
        const roomInfo = roomsMap[key];
        
        if (activeGradeFilter !== "ALL" && roomInfo.grade !== activeGradeFilter) {
            return;
        }
        
        const summary = todayLogs[key];
        const isChecked = !!summary;
        
        if (activeStatusFilter === "CHECKED" && !isChecked) return;
        if (activeStatusFilter === "UNCHECKED" && isChecked) return;
        
        const card = document.createElement("div");
        card.className = "room-card";
        if (isChecked) {
            card.classList.add("checked");
        }
        card.onclick = () => openAttendanceCheck(roomInfo.grade, roomInfo.room);
        
        let presentPct = 0;
        let presentPctText = "ยังไม่ได้บันทึก";
        if (isChecked && summary.Total > 0) {
            presentPct = ((summary.Present / summary.Total) * 100).toFixed(0);
            presentPctText = "มาเรียน " + presentPct + "%";
        }
        
        const donutHtml = isChecked ? `
            <div class="donut-wrapper">
                <span class="donut-label">มา</span>
                <span class="donut-text-mobile">${presentPct}%</span>
                <div class="mini-donut" style="--pct: ${presentPct}%;" title="มาเรียน ${presentPct}%">
                    <span class="donut-text-desktop">${presentPct}%</span>
                </div>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="room-card-layout">
                <div class="room-card-info">
                    <h3 class="room-card-title">ชั้น ${roomInfo.grade}/${roomInfo.room} <span class="room-card-count">(${roomInfo.totalCount} คน)</span></h3>
                    <div class="check-status-badge ${isChecked ? 'checked' : 'unchecked'}">
                        ${isChecked ? 'เช็คแล้ว' : 'ยังไม่เช็ค'}
                    </div>
                </div>
                ${donutHtml}
                <div class="room-stats-pills">
                <div class="stat-pill stat-m">
                    <span>มา</span> <strong>${isChecked ? summary.Present : '-'}</strong>
                </div>
                <div class="stat-pill stat-l">
                    <span>ลา</span> <strong>${isChecked ? summary.Leave : '-'}</strong>
                </div>
                <div class="stat-pill stat-x">
                    <span>ขาด</span> <strong>${isChecked ? summary.Absent : '-'}</strong>
                </div>
                <div class="stat-pill stat-s">
                    <span>สาย</span> <strong>${isChecked ? summary.Late : '-'}</strong>
                </div>
                <div class="stat-pill stat-d">
                    <span>โดด</span> <strong>${isChecked ? summary.Cut : '-'}</strong>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
    
    // Update top summary stats whenever rooms are re-rendered (e.g. after filter change)
    calculateOverallStats();
}

/**
 * 3. หน้าลงเช็คชื่อรายห้อง (Check-in View) - มีการดึงประวัติมาแสดงคงสถานะเดิม
 */
function openAttendanceCheck(grade, room) {
    selectedRoom = { grade, room };
    document.getElementById("attendance-title").innerText = `เช็คชื่อชั้น ${grade} ห้อง ${room}`;
    
    // ตั้งค่า Date Picker ภายในหน้าเช็คชื่อ (ปกิทินที่เหมือนหน้าแรก)
    const checkingDatePicker = document.getElementById("checking-date-picker");
    if (checkingDatePicker) {
        if (window.flatpickr) {
            flatpickr(checkingDatePicker, {
                locale: "th",
                dateFormat: "Y-m-d",
                defaultDate: currentCheckingDate,
                position: "auto center",
                onChange: function(selectedDates, dateStr, instance) {
                    currentCheckingDate = dateStr;
                    const homeDatePicker = document.getElementById("home-date-picker");
                    if (homeDatePicker && homeDatePicker._flatpickr) {
                        homeDatePicker._flatpickr.setDate(currentCheckingDate);
                    } else if (homeDatePicker) {
                        homeDatePicker.value = currentCheckingDate;
                    }
                    
                    updateHeaderDate();
                    checkTodayHoliday();
                    
                    setLoader(true);
                    fetch(`${config.scriptUrl}?action=init&date=${currentCheckingDate}`)
                        .then(res => res.json())
                        .then(data => {
                            if (data.success) {
                                todayLogs = data.todayLogs || {};
                                todayLogsDetails = data.todayLogsDetails || {};
                                for (let id in todayLogsDetails) {
                                    todayLogsDetails[id] = translateAbbreviationToStatus(todayLogsDetails[id]);
                                }
                                calculateOverallStats(); // Sync home dashboard
                                renderRooms(); // Sync home dashboard
                                openAttendanceCheck(grade, room);
                            }
                        })
                        .finally(() => setLoader(false));
                }
            });
            
            const attendanceDatePill = document.getElementById("attendance-date-pill");
            if (attendanceDatePill) {
                attendanceDatePill.onclick = () => {
                    checkingDatePicker._flatpickr.open();
                };
            }
        } else {
            checkingDatePicker.value = currentCheckingDate;
            checkingDatePicker.onchange = (e) => {
                currentCheckingDate = e.target.value;
                const homeDatePicker = document.getElementById("home-date-picker");
                if (homeDatePicker) homeDatePicker.value = currentCheckingDate;
                
                updateHeaderDate();
                checkTodayHoliday();
                
                setLoader(true);
                fetch(`${config.scriptUrl}?action=init&date=${currentCheckingDate}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            todayLogs = data.todayLogs || {};
                            todayLogsDetails = data.todayLogsDetails || {};
                            for (let id in todayLogsDetails) {
                                todayLogsDetails[id] = translateAbbreviationToStatus(todayLogsDetails[id]);
                            }
                            calculateOverallStats();
                            renderRooms();
                            openAttendanceCheck(grade, room);
                        }
                    })
                    .finally(() => setLoader(false));
            };
        }
    }

    const roomKey = `${grade}/${room}`;
    const isChecked = !!todayLogs[roomKey];
    
    // Inject tab buttons into room-dashboard-header
    const headerContainer = document.getElementById("room-dashboard-header");
    if (headerContainer) {
        const summary = isChecked ? todayLogs[roomKey] : {};
        let presentPct = 0;
        if (isChecked && summary.Total > 0) {
            presentPct = Math.round((summary.Present / summary.Total) * 100);
        }
        const donutHtml = isChecked ? `
            <div class="donut-wrapper">
                <span class="donut-label">มา</span>
                <span class="donut-text-mobile">${presentPct}%</span>
                <div class="mini-donut" style="--pct: ${presentPct}%;" title="มาเรียน ${presentPct}%">
                    <span class="donut-text-desktop">${presentPct}%</span>
                </div>
            </div>
        ` : '';
        
        let studentCount = typeof students !== 'undefined' ? students.filter(s => s.grade === grade && s.room === room).length : 0;
        
        let atRiskNotice = '';
        if (typeof allStatsData !== 'undefined' && allStatsData && allStatsData.logs && typeof students !== 'undefined') {
            let sStats = {};
            allStatsData.logs.forEach(log => {
                if (log.room === `${grade}/${room}`) {
                    let sid = log.studentId;
                    if (!sStats[sid]) sStats[sid] = { a: 0, l: 0 };
                    if (log.status === 'ขาด') sStats[sid].a++;
                    if (log.status === 'สาย') sStats[sid].l++;
                }
            });
            let hasAtRisk = false;
            let roomStudents = students.filter(s => s.grade === grade && s.room === room);
            for (let i = 0; i < roomStudents.length; i++) {
                let sid = roomStudents[i].studentId;
                if (sStats[sid] && (sStats[sid].a >= 3 || sStats[sid].l >= 3)) {
                    hasAtRisk = true;
                    break;
                }
            }
            if (hasAtRisk) {
                atRiskNotice = ` <span style="color: var(--color-absent); font-weight: bold; font-size: 10px; letter-spacing: -0.3px;">(ติดตาม⚠️)</span>`;
            }
        }
        
        headerContainer.innerHTML = `
            <div class="room-card ${isChecked ? 'checked' : ''}" style="margin-bottom: 0; cursor: default;">
                <div class="room-card-layout">
                    <div class="room-card-info">
                        <h3 class="room-card-title">ชั้น ${grade}/${room} <span class="room-card-count" style="font-size: 0.85em; font-weight: normal; color: #64748b;">(${studentCount} คน)</span></h3>
                        <div class="check-status-badge desktop-only ${isChecked ? 'checked' : 'unchecked'}">
                            ${isChecked ? 'เช็คแล้ว' : 'ยังไม่เช็ค'}
                        </div>
                    </div>
                    ${donutHtml}
                    <div class="room-stats-pills">
                        <div class="stat-pill stat-m"><span>มา</span> <strong>${isChecked ? summary.Present : '-'}</strong></div>
                        <div class="stat-pill stat-l"><span>ลา</span> <strong>${isChecked ? summary.Leave : '-'}</strong></div>
                        <div class="stat-pill stat-x"><span>ขาด</span> <strong>${isChecked ? summary.Absent : '-'}</strong></div>
                        <div class="stat-pill stat-s"><span>สาย</span> <strong>${isChecked ? summary.Late : '-'}</strong></div>
                        <div class="stat-pill stat-d"><span>โดด</span> <strong>${isChecked ? summary.Cut : '-'}</strong></div>
                    </div>
                </div>
                <div class="room-inner-tabs-container" style="display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 20px; gap: 6px;">
                    <button class="tab-btn room-inner-tab-btn active" data-target="room-tab-attendance" style="padding: 10px 2px; font-size: 13px; white-space: nowrap;">เช็คชื่อ</button>
                    <button class="tab-btn room-inner-tab-btn" data-target="room-tab-stats" style="padding: 10px 2px; font-size: 13px; white-space: nowrap; letter-spacing: -0.3px;">สรุป${atRiskNotice}</button>
                    <button class="tab-btn room-inner-tab-btn" data-target="room-tab-schedule" style="padding: 10px 2px; font-size: 13px; white-space: nowrap;">ตาราง</button>
                </div>
            </div>
        `;
        
        headerContainer.querySelectorAll('.room-inner-tab-btn').forEach(btn => {
            btn.onclick = () => {
                headerContainer.querySelectorAll('.room-inner-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Hide all tabs securely
                const t1 = document.getElementById('room-tab-attendance');
                const t2 = document.getElementById('room-tab-stats');
                const t3 = document.getElementById('room-tab-schedule');
                if (t1) t1.style.display = 'none';
                if (t2) t2.style.display = 'none';
                if (t3) t3.style.display = 'none';
                
                const targetId = btn.getAttribute('data-target');
                const targetEl = document.getElementById(targetId);
                if (targetEl) targetEl.style.display = 'block';
                
                if (targetId === 'room-tab-stats') {
                    if (typeof renderRoomSpecificStats === 'function') {
                        renderRoomSpecificStats();
                    }
                } else if (targetId === 'room-tab-schedule') {
                    if (typeof renderRoomSpecificSchedule === 'function') {
                        renderRoomSpecificSchedule();
                    }
                }
            };
        });
        
        // Reset to first tab by default
        const firstTab = headerContainer.querySelector('.room-inner-tab-btn');
        if (firstTab) {
            firstTab.click();
        }
    }
    
    const btnPreview = document.getElementById("btn-preview-from-checking");
    if (btnPreview) {
        if (isChecked) {
            btnPreview.style.background = "#6366f1";
            btnPreview.style.color = "#fff";
            btnPreview.style.border = "none";
            btnPreview.style.opacity = "1";
            btnPreview.innerHTML = '<i class="fa-solid fa-file-lines"></i> สรุป';
        } else {
            btnPreview.style.background = "#e5e7eb";
            btnPreview.style.color = "#9ca3af";
            btnPreview.style.border = "1px solid #d1d5db";
            btnPreview.style.opacity = "0.7";
            btnPreview.innerHTML = '<i class="fa-solid fa-file-lines"></i> สรุป';
        }
        
        btnPreview.onclick = () => {
            if (!isChecked) {
                showToast("กรุณาบันทึกการเช็คชื่อก่อนดูรายงาน", "warn");
            } else {
                showPreviewSummary();
            }
        };
    }
    
    const roomStudents = students.filter(s => s.grade === grade && s.room === room);
    
    // ตั้งค่าตัวแปรเริ่มต้น: ตรวจสอบว่าใน todayLogsDetails มีการบันทึกของเด็กคนนี้ในวันนี้แล้วหรือไม่
    // หากมีแล้วจะคงสถานะเช็คชื่อเดิมไว้ หากไม่มีจะให้ค่าเริ่มต้นเป็น "มา" เพื่อความสะดวกรวดเร็ว
    attendanceRecords = roomStudents.map(s => {
        const savedStatus = todayLogsDetails[s.studentId];
        return {
            studentId: s.studentId,
            no: s.no,
            fullName: s.fullName,
            gender: s.gender,
            status: savedStatus || "มา"
        };
    });
    
    switchView("attendance-check");
    renderAttendanceStudentsList(attendanceRecords);
}

function renderAttendanceStudentsList(recordsToRender) {
    const container = document.getElementById("attendance-students-list");
    container.innerHTML = "";
    
    recordsToRender.forEach(rec => {
        const row = document.createElement("div");
        
        // กำหนดสีพื้นหลังแถวตามสถานะที่บันทึกไว้
        let rowClass = "student-row";
        if (rec.status === "มา") rowClass += " selected-present";
        else if (rec.status === "ลา") rowClass += " selected-leave";
        else if (rec.status === "ขาด") rowClass += " selected-absent";
        else if (rec.status === "สาย") rowClass += " selected-late";
        else if (rec.status === "โดด") rowClass += " selected-cut";
        
        row.className = rowClass;
        row.id = `student-row-${rec.studentId}`;
        
        row.innerHTML = `
            <div class="col-num txt-center">${rec.no}</div>
            <div class="col-name">${rec.fullName}</div>
            <div class="col-status-options txt-center">
                <div class="status-options-group" data-student="${rec.studentId}">
                    <button class="status-btn ${rec.status === 'มา' ? 'active' : ''}" data-status="มา">มา</button>
                    <button class="status-btn ${rec.status === 'ลา' ? 'active' : ''}" data-status="ลา">ลา</button>
                    <button class="status-btn ${rec.status === 'ขาด' ? 'active' : ''}" data-status="ขาด">ขาด</button>
                    <button class="status-btn ${rec.status === 'สาย' ? 'active' : ''}" data-status="สาย">สาย</button>
                    <button class="status-btn ${rec.status === 'โดด' ? 'active' : ''}" data-status="โดด">โดด</button>
                </div>
            </div>
        `;
        
        const buttons = row.querySelectorAll(".status-btn");
        buttons.forEach(btn => {
            btn.onclick = () => {
                const status = btn.getAttribute("data-status");
                updateStudentStatus(rec.studentId, status, buttons, row);
            };
        });
        
        container.appendChild(row);
    });
}

function updateStudentStatus(studentId, status, buttons, rowElement) {
    const rec = attendanceRecords.find(r => r.studentId === studentId);
    if (rec) rec.status = status;
    
    buttons.forEach(b => {
        if (b.getAttribute("data-status") === status) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });
    
    rowElement.className = "student-row";
    if (status === "มา") rowElement.classList.add("selected-present");
    else if (status === "ลา") rowElement.classList.add("selected-leave");
    else if (status === "ขาด") rowElement.classList.add("selected-absent");
    else if (status === "สาย") rowElement.classList.add("selected-late");
    else if (status === "โดด") rowElement.classList.add("selected-cut");
}

/**
 * 4. หน้าสรุปพรีวิวการเช็คชื่อแบบ 2 คอลัมน์ (ชาย/หกิง) - ปรับแก้การเรนเดอร์สีสถานะให้ตรงสี
 */
function showPreviewSummary() {
    const grade = selectedRoom.grade;
    const room = selectedRoom.room;
    
    // Initial reset
    const captureArea = document.getElementById("preview-capture-area");
    if (captureArea) {
        captureArea.style.display = "block";
        captureArea.style.transform = "scale(1)";
    }
    
    document.getElementById("preview-room-title").innerText = `ชั้น ${grade} ห้อง ${room}`;
    
    const checkDateObj = new Date(currentCheckingDate);
    document.getElementById("preview-date-text").innerText = `วันที่ ${checkDateObj.toLocaleDateString('th-TH', { dateStyle: 'long' })}`;
    
    const summary = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0 };
    attendanceRecords.forEach(r => {
        if (r.status === "มา") summary.Present++;
        else if (r.status === "ลา") summary.Leave++;
        else if (r.status === "ขาด") summary.Absent++;
        else if (r.status === "สาย") summary.Late++;
        else if (r.status === "โดด") summary.Cut++;
    });
    
    document.getElementById("preview-stats-counters").innerHTML = `
        <span class="badge workday" style="background-color: #ecfdf5; color: var(--color-present);">มา: ${summary.Present}</span>
        <span class="badge" style="background-color: #eff6ff; color: var(--color-leave);">ลา: ${summary.Leave}</span>
        <span class="badge" style="background-color: #fef2f2; color: var(--color-absent);">ขาด: ${summary.Absent}</span>
        <span class="badge" style="background-color: #fff7ed; color: var(--color-late);">สาย: ${summary.Late}</span>
        <span class="badge" style="background-color: #faf5ff; color: var(--color-cut);">โดด: ${summary.Cut}</span>
    `;
    
    const maleList = attendanceRecords.filter(r => r.gender === "1");
    const femaleList = attendanceRecords.filter(r => r.gender === "2");
    
    const renderGenderList = (list, containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = "";
        
        list.sort((a,b) => a.no - b.no).forEach(r => {
            const item = document.createElement("div");
            item.className = "preview-student-item";
            const statusChar = r.status === "มา" ? "ม" : (r.status === "ขาด" ? "ข" : (r.status === "ลา" ? "ล" : (r.status === "สาย" ? "ส" : "ด")));
            item.innerHTML = `
                <span class="p-name">${r.no}. ${r.fullName}</span>
                <span class="p-status ${statusChar}">${r.status}</span>
            `;
            container.appendChild(item);
        });
    };
    
    renderGenderList(maleList, "preview-male-list");
    renderGenderList(femaleList, "preview-female-list");
    
    document.getElementById("modal-preview-summary").classList.add("active");
    
    // Convert to Image and trigger auto-download in background
    setTimeout(() => {
        if (captureArea && typeof html2canvas !== "undefined") {
            setLoader(true);
            html2canvas(captureArea, { 
                scale: 2, 
                backgroundColor: "#ffffff",
                useCORS: true,
                allowTaint: true
            }).then(canvas => {
                setLoader(false);
                try {
                    const imgData = canvas.toDataURL("image/png");
                    
                    // Auto Download
                    const a = document.createElement("a");
                    a.href = imgData;
                    const safeDate = currentCheckingDate || new Date().toISOString().slice(0,10);
                    a.download = `สรุปเช็คชื่อ_ม${grade}-${room}_${safeDate}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } catch (err) {
                    console.error("Canvas Export Error:", err);
                    showToast("ไม่สามารถดาวน์โหลดรูปอัตโนมัติได้ (อาจติดปักหาเปิดจากไฟล์คอมพิวเตอร์โดยตรง กรุณานำขึ้นโฮสติ้งจริง)", "error");
                }
                
                // Clear any wheel zoom listeners since we auto-fit to screen now
                captureArea.parentElement.onwheel = null;
                
            }).catch(() => setLoader(false));
        }
    }, 400);
}

/**
 * 5. แป้นป้อนรหัสผ่าน PIN 4 หลัก (Keypad)
 */
function verifyLoginPin(pin) {
    const user = users.find(u => String(u.pin) === String(pin));
    if (user) {
        loggedInUser = user;
        document.getElementById("login-section").classList.add("hidden");
        document.getElementById("main-app").classList.remove("hidden");
        showMainApp();
        showToast(`เข้าสู่ระบบสำเร็จ: คุณครู ${user.name}`);
        return true;
    }
    return false;
}

function openPinModal(title, roleRequired, onSuccess) {
    document.getElementById("pin-modal-title").innerText = title;
    document.getElementById("pin-modal-subtitle").innerText = roleRequired === "ADMIN" ? "กรุณากรอกรหัสผู้ดูแลระบบ" : "กรุณากรอกรหัสผ่านเพื่อยืนยันสิทธิ์";
    document.getElementById("pin-error-message").innerText = "";
    
    pinDigits = "";
    pinCallback = onSuccess;
    pinRequiredRole = roleRequired;
    
    updatePinDots();
    document.getElementById("modal-pin").classList.add("active");
}

function handleKeypadPress(key) {
    const errorMsg = document.getElementById("pin-error-message");
    errorMsg.innerText = "";
    
    if (key === "cancel") {
        document.getElementById("modal-pin").classList.remove("active");
        return;
    }
    
    if (key === "clear") {
        if (pinDigits.length > 0) {
            pinDigits = pinDigits.slice(0, -1);
        }
    } else {
        if (pinDigits.length < 4) {
            pinDigits += key;
        }
    }
    
    updatePinDots();
    
    if (pinDigits.length === 4) {
        verifyPinAndRun();
    }
}

function updatePinDots() {
    const dots = document.querySelectorAll(".pin-dot");
    dots.forEach((dot, index) => {
        if (index < pinDigits.length) {
            dot.classList.add("active");
        } else {
            dot.classList.remove("active");
        }
    });
}

async function verifyPinAndRun() {
    const errorMsg = document.getElementById("pin-error-message");
    errorMsg.innerText = "กำลังตรวจสอบรหัส...";
    
    if (pinRequiredRole === "NEW_PIN") {
        document.getElementById("modal-pin").classList.remove("active");
        if (pinCallback) pinCallback(pinDigits, "New", "TEACHER");
        return;
    }
    
    // ทำการยืนยันรหัส PIN บนเครื่องจากหน่วยความจำโดยตรง (Local Cache Verification) เพื่อผลการตรวจสอบแบบทันที
    let matchedUser = users.find(u => String(u.pin).trim() === String(pinDigits).trim());
    
    // Master Bypass: ถ้าระบบยังไม่เชื่อมต่อกานข้อมูล หรือยังไม่มีผู้ใช้ ให้ใช้รหัส 9999 เข้าแอดมินได้
    if (!matchedUser && (!config.scriptUrl || users.length === 0) && pinDigits === "9999") {
        matchedUser = { name: "System Setup", role: "ADMIN", pin: "9999" };
    }
    
    if (matchedUser) {
        const userRole = matchedUser.role;
        const userName = matchedUser.name;
        
        let isAuthorized = false;
        if (pinRequiredRole === "ANY") {
            isAuthorized = true;
        } else if (pinRequiredRole === "ADMIN" && userRole === "ADMIN") {
            isAuthorized = true;
        } else if (pinRequiredRole === "STUDENT_AFFAIRS" && (userRole === "ADMIN" || userRole === "STUDENT_AFFAIRS")) {
            isAuthorized = true;
        } else if (pinRequiredRole === "STUDENT_AFFAIRS_ONLY" && (userRole === "STUDENT_AFFAIRS" || userRole === "ADMIN")) {
            isAuthorized = true;
        }
        
        if (isAuthorized) {
            loggedInUser = matchedUser; // Set global session
            updateUserSessionUI();
            document.getElementById("modal-pin").classList.remove("active");
            if (pinCallback) pinCallback(pinDigits, userName, userRole);
        } else {
            errorMsg.innerText = "คุณไม่มีสิทธิ์ในการดำเนินรายการนี้";
            pinDigits = "";
            updatePinDots();
        }
    } else {
        errorMsg.innerText = "รหัส PIN ผิดพลาด กรุณาลองใหม่";
        pinDigits = "";
        updatePinDots();
    }
}

// ==================== ระบบ Session / On-Demand Login ====================

window.requestLogin = function(roleRequired = "ANY", callback = null) {
    if (loggedInUser) {
        let isAuthorized = false;
        const userRole = loggedInUser.role;
        if (roleRequired === "ANY") isAuthorized = true;
        else if (roleRequired === "ADMIN" && userRole === "ADMIN") isAuthorized = true;
        else if (roleRequired === "STUDENT_AFFAIRS" && (userRole === "ADMIN" || userRole === "STUDENT_AFFAIRS")) isAuthorized = true;
        else if (roleRequired === "STUDENT_AFFAIRS_ONLY" && (userRole === "STUDENT_AFFAIRS" || userRole === "ADMIN")) isAuthorized = true;
        
        if (isAuthorized) {
            if (callback) callback(loggedInUser.pin, loggedInUser.name, loggedInUser.role);
        } else {
            alert("คุณไม่มีสิทธิ์ในการดำเนินรายการนี้");
        }
    } else {
        openPinModal("กรุณาเข้าสู่ระบบ", roleRequired, callback);
    }
};

window.updateUserSessionUI = function() {
    const loggedOutSpan = document.getElementById('session-logged-out');
    const loggedInSpan = document.getElementById('session-logged-in');
    if (loggedInUser) {
        if(loggedOutSpan) loggedOutSpan.style.display = 'none';
        if(loggedInSpan) {
            loggedInSpan.style.display = 'inline-flex';
            let shortName = loggedInUser.name;
            // Remove common Thai prefixes
            shortName = shortName.replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|คุณครู|ครู)\s*/, '');
            // Get only the first name (before space)
            shortName = shortName.split(/\s+/)[0];
            document.getElementById('user-session-name').innerText = shortName;
        }
    } else {
        if(loggedOutSpan) loggedOutSpan.style.display = 'inline-flex';
        if(loggedInSpan) loggedInSpan.style.display = 'none';
    }
};

window.logout = function() {
    loggedInUser = null;
    updateUserSessionUI();
    showToast("ออกจากระบบเรียบร้อยแล้ว");
};

/**
 * 6. บันทึกเช็คชื่อไปยัง Google Apps Script - บันทึกสถานะรายคนลงสเตตวันนี้
 */
async function saveAttendanceToSheet(pinCode, teacherName) {
    showToast(`บันทึกการเช็คชื่อห้อง ${selectedRoom.grade}/${selectedRoom.room} ล่วงหน้าเรียบร้อย (ระบบกำลังบันทึกลงชีทเบื้องหลัง)`);
    
    // อัปเดตข้อมูลภาพรวมรายห้องลง State วันนี้เพื่อสะท้อนหน้าแรก
    const summary = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: attendanceRecords.length };
    attendanceRecords.forEach(r => {
        if (r.status === "มา") summary.Present++;
        else if (r.status === "ลา") summary.Leave++;
        else if (r.status === "ขาด") summary.Absent++;
        else if (r.status === "สาย") summary.Late++;
        else if (r.status === "โดด") summary.Cut++;
        
        // สำคัก: บันทึกสถานะรายบุคคลลง todayLogsDetails ทันทีเพื่อให้ค้างสถานะเวลาเปิดใหม่
        todayLogsDetails[r.studentId] = r.status;
        
        // บวกสถานะเข้าสถิติย้อนหลังในแรมโดยตรง
        if (allStatsData) {
            const fullRoom = `${selectedRoom.grade}/${selectedRoom.room}`;
            let existing = allStatsData.logs.find(log => log.studentId === r.studentId && log.date === currentCheckingDate);
            if (existing) {
                existing.status = r.status;
            } else {
                allStatsData.logs.push({
                    date: currentCheckingDate,
                    studentId: r.studentId,
                    name: r.fullName,
                    room: fullRoom,
                    status: r.status
                });
            }
        }
    });
    
    // เพิ่มวันที่ในคอลเลกชันวันที่สถิติในแรมหากยังไม่มี
    if (allStatsData && !allStatsData.dates.includes(currentCheckingDate)) {
        allStatsData.dates.push(currentCheckingDate);
        allStatsData.dates.sort();
    }
    
    todayLogs[`${selectedRoom.grade}/${selectedRoom.room}`] = summary;
    
    calculateOverallStats();
    renderRooms();
    showPreviewSummary();
    
    const payload = {
        action: "saveAttendance",
        pin: pinCode,
        date: currentCheckingDate, // บันทึกตามวันที่ดำเนินการจริงที่เลือก
        grade: selectedRoom.grade,
        room: selectedRoom.room,
        records: attendanceRecords.map(r => ({
            studentId: r.studentId,
            name: r.fullName,
            status: translateStatusToAbbreviation(r.status)
        }))
    };
    
    if (!config.scriptUrl) {
        showToast("ทำงานโหมดออฟไลน์: บันทึกข้อมูลชั่วคราวในอุปกรณ์เรียบร้อย", "success");
        return;
    }
    
    // Send to background without awaiting
    fetch(config.scriptUrl, {
        method: "POST",
        body: JSON.stringify(payload)
    }).then(res => res.json()).then(data => {
        if (!data.success) {
            showToast("บันทึกเบื้องหลังไม่สำเร็จ: " + data.message, "error");
        }
    }).catch(e => {
        console.error("เชื่อมต่อกานข้อมูลเบื้องหลังล้มเหลว", e);
    });
}


/**
 * 7. ส่วนสถิติย้อนหลัง (Statistics View)
 */
async function fetchAndRenderStats() {
    if (!config.scriptUrl) {
        showToast("โปรดตั้งค่าลิงก์ Apps Script ก่อนเรียกดูสถิติ", "error");
        return;
    }
    
    // โหลดประวัติทั้งหมดมาไว้ในแรมหากยังไม่มี
    if (!allStatsData) {
        setLoader(true);
        try {
            const res = await fetch(`${config.scriptUrl}?action=getStats&month=ALL&room=ALL`);
            const data = await res.json();
            if (data.success) {
                allStatsData = data.stats;
                if (allStatsData && allStatsData.logs) {
                    allStatsData.logs.forEach(log => {
                        log.status = translateAbbreviationToStatus(log.status);
                    });
                }
            } else {
                showToast("ดึงสถิติไม่สำเร็จ: " + data.message, "error");
                setLoader(false);
                return;
            }
        } catch (e) {
            showToast("ข้อผิดพลาดในการเชื่อมต่อดึงสถิติ", "error");
            setLoader(false);
            return;
        }
        setLoader(false);
    }
    
    const selectedMonth = document.getElementById("stats-month-select").value;
    const selectedRoom = document.getElementById("stats-room-select").value;
    
    // อัปเดต Dropdown เดือนจากข้อมูลที่มีในแรม
    updateMonthDropdown(allStatsData.availableMonths, selectedMonth);
    
    // กรองประวัติเช็คชื่อทั้งหมดจากหน่วยความจำโดยไม่ต้องเชื่อมต่ออินเทอร์เน็ตใหม่
    const filteredLogs = [];
    allStatsData.logs.forEach(log => {
        const logMonth = log.date.substring(0, 7);
        const matchMonth = (selectedMonth === "ALL" || logMonth === selectedMonth);
        const matchRoom = (selectedRoom === "ALL" || log.room === selectedRoom);
        if (matchMonth && matchRoom) {
            filteredLogs.push(log);
        }
    });
    
    // กรองเฉพาะวันที่ของเดือนที่เลือก
    const filteredDates = [];
    allStatsData.dates.forEach(date => {
        const logMonth = date.substring(0, 7);
        if (selectedMonth === "ALL" || logMonth === selectedMonth) {
            filteredDates.push(date);
        }
    });
    
    if (typeof renderSchoolTrendChart === 'function') {
        renderSchoolTrendChart(filteredLogs, filteredDates);
    }
    
    if (activeStatsTab === "accumulated") {
        renderAccumulatedStats(filteredLogs, selectedRoom);
    } else {
        renderDailyGridStats(filteredLogs, filteredDates, selectedRoom);
    }
}

let schoolTrendChart = null;
function renderSchoolTrendChart(logs, datesList) {
    const chartEl = document.getElementById("stats-school-chart");
    if (!chartEl) return;
    
    if (datesList.length === 0) {
        chartEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding-top: 100px;">ไม่พบข้อมูลสถิติในช่วงเวลาที่เลือก</div>';
        if (schoolTrendChart) {
            schoolTrendChart.destroy();
            schoolTrendChart = null;
        }
        return;
    }
    
    const sortedDates = datesList.sort();
    const seriesPresent = [];
    const seriesLeave = [];
    const seriesAbsent = [];
    const seriesLate = [];
    const seriesCut = [];
    
    sortedDates.forEach(date => {
        let pCount = 0, lCount = 0, aCount = 0, lateCount = 0, cutCount = 0;
        logs.forEach(log => {
            if (log.date === date) {
                if (log.status === "มา") pCount++;
                else if (log.status === "ลา") lCount++;
                else if (log.status === "ขาด") aCount++;
                else if (log.status === "สาย") lateCount++;
                else if (log.status === "โดด") cutCount++;
            }
        });
        seriesPresent.push(pCount);
        seriesLeave.push(lCount);
        seriesAbsent.push(aCount);
        seriesLate.push(lateCount);
        seriesCut.push(cutCount);
    });
    
    const thMonthsAbbr = {
        "01": "ม.ค.", "02": "ก.พ.", "03": "มี.ค.", "04": "เม.ย.", "05": "พ.ค.", "06": "มิ.ย.",
        "07": "ก.ค.", "08": "ส.ค.", "09": "ก.ย.", "10": "ต.ค.", "11": "พ.ย.", "12": "ธ.ค."
    };
    
    const categories = sortedDates.map(date => {
        const parts = date.split("-");
        return `${parseInt(parts[2], 10)} ${thMonthsAbbr[parts[1]]}`;
    });
    
    const options = {
        series: [
            { name: 'มา', data: seriesPresent },
            { name: 'ลา', data: seriesLeave },
            { name: 'สาย', data: seriesLate },
            { name: 'ขาด', data: seriesAbsent },
            { name: 'โดด', data: seriesCut }
        ],
        chart: {
            type: 'area',
            height: 300,
            toolbar: { show: true, tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
            zoom: { enabled: true },
            fontFamily: 'Sarabun, sans-serif',
            animations: { enabled: true, easing: 'easeinout', speed: 800 }
        },
        colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
            categories: categories,
            tooltip: { enabled: false }
        },
        yaxis: {
            title: { text: 'จำนวน (คน)' },
            labels: { formatter: function (val) { return val.toFixed(0); } }
        },
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] }
        },
        legend: { position: 'top', horizontalAlign: 'center' },
        tooltip: { theme: 'light' }
    };
    
    chartEl.innerHTML = "";
    if (schoolTrendChart) {
        schoolTrendChart.destroy();
    }
    try {
        schoolTrendChart = new ApexCharts(chartEl, options);
        schoolTrendChart.render();
    } catch (e) {
        console.error("ApexCharts error:", e);
    }
}

function updateMonthDropdown(monthsList, currentValue) {
    const select = document.getElementById("stats-month-select");
    select.innerHTML = '<option value="ALL">ทั้งภาคเรียน</option>';
    
    const thMonths = {
        "01": "มกราคม", "02": "กุมภาพันธ์", "03": "มีนาคม", "04": "เมษายน", "05": "พฤษภาคม", "06": "มิถุนายน",
        "07": "กรกฎาคม", "08": "สิงหาคม", "09": "กันยายน", "10": "ตุลาคม", "11": "พฤศจิกายน", "12": "ธันวาคม"
    };
    
    monthsList.forEach(m => {
        const parts = m.split("-");
        const yr = parseInt(parts[0]) + 543;
        const moName = thMonths[parts[1]] || parts[1];
        
        const option = document.createElement("option");
        option.value = m;
        option.innerText = `${moName} ${yr}`;
        
        if (m === currentValue) option.selected = true;
        select.appendChild(option);
    });
}

function renderAccumulatedStats(logs, targetRoom) {
    const tbody = document.getElementById("stats-accumulated-tbody");
    tbody.innerHTML = "";
    
    let targetStudents = students;
    if (targetRoom !== "ALL") {
        targetStudents = students.filter(s => `${s.grade}/${s.room}` === targetRoom);
    }
    
    const countsMap = {};
    targetStudents.forEach(s => {
        countsMap[s.studentId] = {
            no: s.no,
            name: s.fullName,
            room: `${s.grade}/${s.room}`,
            Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0
        };
    });
    
    logs.forEach(log => {
        if (countsMap[log.studentId]) {
            if (log.status === "มา") countsMap[log.studentId].Present++;
            else if (log.status === "ลา") countsMap[log.studentId].Leave++;
            else if (log.status === "ขาด") countsMap[log.studentId].Absent++;
            else if (log.status === "สาย") countsMap[log.studentId].Late++;
            else if (log.status === "โดด") countsMap[log.studentId].Cut++;
        }
    });
    
    const statusFilter = document.getElementById("stats-status-select") ? document.getElementById("stats-status-select").value : "ALL";
    
    const sortedStudentIds = Object.keys(countsMap).sort((a,b) => {
        const roomA = countsMap[a].room;
        const roomB = countsMap[b].room;
        if (roomA !== roomB) return roomA.localeCompare(roomB, 'th', { numeric: true });
        return countsMap[a].no - countsMap[b].no;
    });
    
    let renderedCount = 0;
    
    sortedStudentIds.forEach(id => {
        const item = countsMap[id];
        let shouldShow = false;
        
        if (statusFilter === "ALL") {
            shouldShow = true;
        } else if (statusFilter === "ABSENT" && item.Absent > 0) {
            shouldShow = true;
        } else if (statusFilter === "LEAVE" && item.Leave > 0) {
            shouldShow = true;
        } else if (statusFilter === "LATE" && item.Late > 0) {
            shouldShow = true;
        } else if (statusFilter === "CUT" && item.Cut > 0) {
            shouldShow = true;
        }
        
        const totalEvents = item.Present + item.Leave + item.Absent + item.Late + item.Cut;
        if (totalEvents === 0 && statusFilter === "ALL") {
            shouldShow = true;
        }
        
        if (!shouldShow) return;
        
        renderedCount++;
        const tr = document.createElement("tr");
        const totalDays = item.Present + item.Leave + item.Absent + item.Late + item.Cut;
        // % คิดจาก (มา + สาย + โดด) นับเป็นมา
        let percent = 0;
        if (totalDays > 0) {
            const totalPresent = item.Present + item.Late + item.Cut;
            percent = Math.round((totalPresent / totalDays) * 100);
        }
        
        tr.innerHTML = `
            <td style="text-align: center; padding: 10px 8px;">${renderedCount}</td>
            <td style="padding: 10px 8px;">
                <div style="font-weight: 500; color: var(--text-main); margin-bottom: 4px; line-height: 1.3;">
                    ${item.name} <span class="mobile-only-inline" style="color: var(--text-muted); font-size: 12px; margin-left: 4px; white-space: nowrap;">(ชั้น ${item.room})</span>
                </div>
                <div class="mobile-only-flex" style="font-size: 12px; gap: 6px; flex-wrap: wrap;">
                    <span style="color: var(--color-present); white-space: nowrap;">ม.${item.Present}</span>
                    <span style="color: var(--color-leave); white-space: nowrap;">ล.${item.Leave}</span>
                    <span style="color: var(--color-absent); white-space: nowrap;">ข.${item.Absent}</span>
                    <span style="color: var(--color-late); white-space: nowrap;">ส.${item.Late}</span>
                    <span style="color: var(--color-cut); white-space: nowrap;">ด.${item.Cut}</span>
                </div>
            </td>
            <td class="desktop-only" style="text-align: center; padding: 10px 8px;">${item.room}</td>
            <td class="desktop-only" style="text-align: center; padding: 10px 8px; color: var(--color-present); font-weight: 600;">${item.Present}</td>
            <td class="desktop-only" style="text-align: center; padding: 10px 8px; color: var(--color-leave); font-weight: 600;">${item.Leave}</td>
            <td class="desktop-only" style="text-align: center; padding: 10px 8px; color: var(--color-absent); font-weight: 600;">${item.Absent}</td>
            <td class="desktop-only" style="text-align: center; padding: 10px 8px; color: var(--color-late); font-weight: 600;">${item.Late}</td>
            <td class="desktop-only" style="text-align: center; padding: 10px 8px; color: var(--color-cut); font-weight: 600;">${item.Cut}</td>
            <td style="text-align: center; padding: 10px 8px;">
                <strong style="color: ${percent >= 80 ? 'var(--color-present)' : (percent >= 60 ? 'var(--color-late)' : 'var(--color-absent)')};">${percent}%</strong>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (renderedCount === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="txt-center" style="color: var(--text-muted); padding: 30px;">ไม่พบข้อมูลสถิตินักเรียนตามเงื่อนไขที่เลือก</td></tr>';
    }
}

function renderDailyGridStats(logs, datesList, targetRoom, tableId = "stats-daily-grid-table") {
    const table = document.getElementById(tableId);
    table.innerHTML = "";
    
    const infoText = document.getElementById("daily-stats-info-text");
    if (infoText) {
        if (targetRoom === "ALL") {
            infoText.innerHTML = '<i class="fa-solid fa-info-circle"></i> ตารางแสดงข้อมูลสถิติของทุกระดับชั้น';
        } else {
            infoText.innerHTML = `<i class="fa-solid fa-info-circle"></i> ตารางแสดงข้อมูลสถิติของห้อง: <strong>ชั้น ${targetRoom}</strong>`;
        }
    }
    
    const sortedDates = datesList.sort();
    
    let roomStudents = [];
    if (targetRoom === "ALL") {
        roomStudents = students.slice().sort((a, b) => {
            const roomA = `${a.grade}/${a.room}`;
            const roomB = `${b.grade}/${b.room}`;
            if (roomA !== roomB) return roomA.localeCompare(roomB, 'th', { numeric: true });
            return a.no - b.no;
        });
    } else {
        roomStudents = students.filter(s => `${s.grade}/${s.room}` === targetRoom).sort((a,b) => a.no - b.no);
    }
    
    if (roomStudents.length === 0) {
        table.innerHTML = '<tr><td style="padding: 30px; color: var(--text-muted);">ไม่พบรายชื่อนักเรียนในห้องเรียนนี้</td></tr>';
        return;
    }
    
    let headerHtml = `<tr>
        <th class="col-student-name" style="vertical-align: bottom; padding-bottom: 12px;">เลขที่ / รายชื่อนักเรียน</th>
    `;
    
    const thMonthsAbbr = {
        "01": "ม.ค.", "02": "ก.พ.", "03": "มี.ค.", "04": "เม.ย.", "05": "พ.ค.", "06": "มิ.ย.",
        "07": "ก.ค.", "08": "ส.ค.", "09": "ก.ย.", "10": "ต.ค.", "11": "พ.ย.", "12": "ธ.ค."
    };
    
    sortedDates.forEach(date => {
        const parts = date.split("-");
        const d = parseInt(parts[2], 10);
        // Fallback for month if not exactly 01-12
        let m = thMonthsAbbr[parts[1]];
        if (!m) {
            const thaiMonthsArr = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
            m = thaiMonthsArr[parseInt(parts[1], 10) - 1] || "";
        }
        const y = (parseInt(parts[0], 10) + 543).toString().slice(-2);
        const displayDate = `${d}<br>${m}<br>${y}`;
        headerHtml += `<th style="text-align: center; vertical-align: middle; line-height: 1.2; font-size: 11px; padding: 12px 5px; color: var(--text-main);">${displayDate}</th>`;
    });
    headerHtml += "</tr>";
    
    const logsLookup = {};
    logs.forEach(log => {
        logsLookup[`${log.studentId}_${log.date}`] = log.status;
    });
    
    let bodyHtml = "";
    roomStudents.forEach((s, index) => {
        bodyHtml += `<tr>
            <td class="col-student-name">${index + 1}. ${s.fullName} ${targetRoom === "ALL" ? `<span style="font-size: 0.85em; color: var(--text-muted);">(${s.grade}/${s.room})</span>` : ""}</td>
        `;
        
        sortedDates.forEach(date => {
            const status = logsLookup[`${s.studentId}_${date}`] || "";
            let statusChar = "";
            let classStyle = "";
            
            if (status) {
                if (status === "มา") { statusChar = "ม"; classStyle = "status-present"; }
                else if (status === "ลา") { statusChar = "ล"; classStyle = "status-leave"; }
                else if (status === "ขาด") { statusChar = "ข"; classStyle = "status-absent"; }
                else if (status === "สาย") { statusChar = "ส"; classStyle = "status-late"; }
                else if (status === "โดด") { statusChar = "ด"; classStyle = "status-cut"; }
            } else {
                statusChar = "-";
                classStyle = "status-none";
            }
            
            bodyHtml += `<td class="txt-center"><span class="status-badge ${classStyle}">${statusChar}</span></td>`;
        });
        
        bodyHtml += `</tr>`;
    });
    
    table.innerHTML = `
        <thead>${headerHtml}</thead>
        <tbody>${bodyHtml}</tbody>
    `;
    
    if (sortedDates.length === 0) {
        table.innerHTML = '<tr><td style="padding: 30px; color: var(--text-muted);">ไม่พบประวัติการเช็คชื่อของห้องนี้ในรอบเดือนที่เลือก</td></tr>';
    }
}

/**
 * 8. เมนูบันทึกความประพฤติ (Misconduct View)
 */
async function fetchAndRenderMisconducts() {
    if (!config.scriptUrl) return;
    
    // โหลดความประพฤติจากเซิร์ฟเวอร์หากยังไม่มีประวัติในหน่วยความจำ
    if (misconductLogs.length === 0) {
        setLoader(true);
        try {
            await fetchMisconductDataOnce();
        } catch (e) {
            showToast("ไม่สามารถโหลดระบบความประพฤติได้", "error");
        } finally {
            setLoader(false);
        }
    }
    renderMisconductTable();
}

async function fetchMisconductDataOnce() {
    if (!config.scriptUrl) return;
    try {
        const res = await fetch(`${config.scriptUrl}?action=getMisconducts`);
        const data = await res.json();
        if (data.success) {
            misconductLogs = data.misconducts || [];
        }
    } catch (e) {
        console.error("โหลดบันทึกพฤติกรรมเริ่มต้นล้มเหลว", e);
    }
}

function renderMisconductTable() {
    const tbody = document.getElementById("misconduct-table-tbody");
    tbody.innerHTML = "";
    
    // กรองข้อมูลตาม Dropdown
    const filterVal = document.getElementById("misconduct-filter-select") ? document.getElementById("misconduct-filter-select").value : "ALL";
    let displayLogs = misconductLogs;
    if (filterVal === "RESOLVED") {
        displayLogs = misconductLogs.filter(log => log.resolved);
    } else if (filterVal === "UNRESOLVED") {
        displayLogs = misconductLogs.filter(log => !log.resolved);
    }
    
    if (displayLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="txt-center" style="color: var(--text-muted); padding: 30px;">ไม่มีบันทึกข้อมูลการทำความผิด</td></tr>';
        return;
    }
    
    displayLogs.forEach((item, index) => {
        const tr = document.createElement("tr");
        
        const dateParts = item.date.split("-");
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : item.date;
        
        tr.innerHTML = `
            <td class="txt-center">
                <button type="button" class="btn-toggle-resolve" data-id="${item.id}" style="background: none; border: none; cursor: pointer; color: ${item.resolved ? 'var(--color-success)' : '#cbd5e1'}; font-size: 24px; padding: 0; display: flex; align-items: center; justify-content: center; margin: 0 auto; transition: 0.2s;">
                    <i class="fa-${item.resolved ? 'solid fa-square-check' : 'regular fa-square'}" style="pointer-events: none;"></i>
                </button>
            </td>
            <td class="txt-center row-clickable">${index + 1}</td>
            <td class="row-clickable" style="white-space: nowrap;"><strong>${item.name}</strong></td>
            <td class="row-clickable">${item.grade}/${item.room}</td>
            <td class="row-clickable">${formattedDate}</td>
            <td class="row-clickable" style="max-width: 120px;"><div style="font-size: 13px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.description}</div></td>
            <td class="row-clickable" style="max-width: 100px;"><div style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.recorder}</div></td>
            <td class="row-clickable" style="max-width: 120px;"><div style="font-size: 13px; color: ${item.resolution ? '#166534' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.resolution || '-'}</div></td>
        `;
        
        // เมื่อคลิกที่ส่วนใดๆ ของแถว (ยกเว้น checkbox) ให้เปิดหน้าต่างรายละเอียด
        tr.querySelectorAll('.row-clickable').forEach(td => {
            td.style.cursor = "pointer";
            td.onclick = () => {
                document.getElementById("detail-misconduct-student").innerText = `${item.name} (${item.grade}/${item.room})`;
                document.getElementById("detail-misconduct-date").innerText = formattedDate;
                document.getElementById("detail-misconduct-desc").innerText = item.description;
                document.getElementById("detail-misconduct-reporter").innerText = item.recorder;
                
                const resolutionGroup = document.getElementById("detail-misconduct-resolution-group");
                if (item.resolved && item.resolution) {
                    document.getElementById("detail-misconduct-resolution").innerText = item.resolution;
                    resolutionGroup.style.display = "block";
                } else {
                    resolutionGroup.style.display = "none";
                }
                
                document.getElementById("modal-misconduct-details").classList.add("active");
            };
        });
        
        const btnToggle = tr.querySelector(".btn-toggle-resolve");
        btnToggle.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const id = btnToggle.getAttribute("data-id");
            const newStatus = !item.resolved;
            
            const modal = document.getElementById("modal-misconduct-resolve");
            const title = document.getElementById("misconduct-resolve-title");
            const inputGroup = document.getElementById("misconduct-resolve-input-group");
            const confirmText = document.getElementById("misconduct-resolve-confirm-text");
            const input = document.getElementById("misconduct-resolution-input");
            
            input.value = ""; // เคลียร์ข้อความเดิม
            
            if (newStatus) {
                title.innerText = "บันทึกการแก้ไขความประพฤติ";
                inputGroup.style.display = "block";
                confirmText.style.display = "none";
            } else {
                title.innerText = "ยกเลิกการแก้ไขความประพฤติ?";
                inputGroup.style.display = "none";
                confirmText.style.display = "block";
            }
            
            modal.classList.add("active");
            
            document.getElementById("btn-cancel-misconduct-resolve").onclick = () => {
                modal.classList.remove("active");
            };
            
            document.getElementById("btn-submit-misconduct-resolve").onclick = () => {
                let resolutionText = "";
                if (newStatus) {
                    resolutionText = input.value.trim();
                    if (!resolutionText) {
                        showToast("กรุณาระบุรายละเอียดการแก้ไข", "error");
                        return;
                    }
                }
                
                modal.classList.remove("active");
                
                openPinModal("ป้อนรหัสแอดมิน / ครูปกครอง", "STUDENT_AFFAIRS", async (pin, userName) => {
                    // Optimistic UI Update - เปลี่ยนค่าในตารางให้เห็นทันทีก่อนบันทึกเสร็จ
                    item.resolved = newStatus;
                    
                    // ถ้ายกเลิก ให้ล้างข้อความ ถ้าแก้ให้เติมชั่วคราว
                    if (newStatus) {
                        const dateStr = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
                        item.resolution = `${resolutionText} (${userName}, ${dateStr})`;
                    } else {
                        item.resolution = "";
                    }
                    
                    renderMisconductTable();
                    
                    // ไม่ต้องบล็อคหน้าจอทั้งหมดด้วย Loader แล้ว ปล่อยให้มันบันทึกเงียบๆ ด้านหลัง
                    if (!config.scriptUrl) {
                        showToast("ไม่สามารถอัปเดตออนไลน์ได้เนื่องจากไม่ได้ตั้งค่า Apps Script", "error");
                        return;
                    }
                    
                    try {
                        const res = await fetch(config.scriptUrl, {
                            method: "POST",
                            body: JSON.stringify({
                                action: "toggleMisconductResolved",
                                pin: pin,
                                id: id,
                                resolved: newStatus,
                                resolutionText: resolutionText
                            })
                        });
                        const resData = await res.json();
                        
                        if (!resData.success) {
                            showToast("เกิดข้อผิดพลาด: " + resData.message, "error");
                            // Revert on fail
                            item.resolved = !newStatus;
                            renderMisconductTable();
                        } else {
                            showToast("อัปเดตสถานะความประพฤติเรียบร้อย");
                        }
                    } catch (err) {
                        showToast("ไม่สามารถอัปเดตสถานะความประพฤติได้", "error");
                        // Revert on fail
                        item.resolved = !newStatus;
                        renderMisconductTable();
                    }
                });
            };
        };
        
        tbody.appendChild(tr);
    });
}

function handleMisconductSearch(query) {
    // รีเซ็ตการเลือกนักเรียนเมื่อมีการพิมพ์ใหม่
    selectedMisconductStudent = null;
    document.getElementById("selected-student-display").classList.add("hidden");
    
    const dropdown = document.getElementById("misconduct-student-dropdown");
    dropdown.innerHTML = "";
    
    if (!query.trim()) {
        dropdown.classList.remove("active");
        return;
    }
    
    const filtered = students.filter(s => 
        s.fullName.includes(query) || (s.studentId && s.studentId.includes(query))
    ).slice(0, 15);
    
    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-item" style="color: var(--text-muted); cursor: default;">ไม่พบนักเรียน</div>';
    } else {
        filtered.forEach(s => {
            const div = document.createElement("div");
            div.className = "dropdown-item";
            div.innerText = `${s.studentId} - ${s.fullName} (${s.grade}/${s.room})`;
            div.onclick = () => {
                selectStudentForMisconduct(s);
            };
            dropdown.appendChild(div);
        });
    }
    dropdown.classList.add("active");
}

function selectStudentForMisconduct(student) {
    selectedMisconductStudent = student;
    
    const display = document.getElementById("selected-student-display");
    display.querySelector("strong").innerText = `${student.fullName} (ชั้น ${student.grade}/${student.room})`;
    display.classList.remove("hidden");
    
    document.getElementById("misconduct-student-search").value = student.fullName;
    document.getElementById("misconduct-student-dropdown").classList.remove("active");
}

async function submitMisconduct(pinCode) {
    const dateInput = document.getElementById("misconduct-date-input").value;
    const descInput = document.getElementById("misconduct-desc-input").value;
    const searchInput = document.getElementById("misconduct-student-search").value.trim();
    
    if (!dateInput || !searchInput || !descInput.trim()) {
        showToast("กรุณากรอกข้อมูลบันทึกความประพฤติให้ครบถ้วน", "error");
        return;
    }
    
    setLoader(true);
    
    if (!config.scriptUrl) {
        showToast("ฟังก์ชันนี้ต้องเชื่อมต่อระบบ Apps Script", "error");
        setLoader(false);
        return;
    }
    
    const payload = {
        action: "saveMisconduct",
        pin: pinCode,
        date: dateInput,
        studentId: selectedMisconductStudent ? selectedMisconductStudent.studentId : "-",
        studentName: selectedMisconductStudent ? selectedMisconductStudent.fullName : searchInput,
        grade: selectedMisconductStudent ? selectedMisconductStudent.grade : "-",
        room: selectedMisconductStudent ? selectedMisconductStudent.room : "-",
        description: descInput
    };
    
    try {
        const res = await fetch(config.scriptUrl, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            showToast("เพิ่มบันทึกความประพฤติสำเร็จ");
            
            document.getElementById("modal-add-misconduct").classList.remove("active");
            document.getElementById("misconduct-desc-input").value = "";
            document.getElementById("misconduct-student-search").value = "";
            document.getElementById("selected-student-display").classList.add("hidden");
            selectedMisconductStudent = null;
            
            // ดึงข้อมูลใหม่จากหลังบ้านทันที เพื่อให้แสดงผลในตารางพร้อม ID ที่ถูกต้อง
            await fetchMisconductDataOnce();
            renderMisconductTable();
            // อัปเดตตารางเพื่อเปลี่ยนสีปุ่ม
            if (typeof renderAtRiskStudents === 'function') {
                renderAtRiskStudents();
            }
        } else {
            showToast("บันทึกไม่สำเร็จ: " + data.message, "error");
        }
    } catch (e) {
        showToast("เชื่อมต่อข้อมูลไม่สำเร็จ", "error");
    } finally {
        setLoader(false);
    }
}

/**
 * 9. หน้าลงทะเบียนผู้ใช้งาน (Register Modal) - นำ เพิ่มครูใหม่ ไปไว้ล่างสุด
 */
function openRegisterModal() {
    const select = document.getElementById("reg-teacher-select");
    select.innerHTML = '<option value="">-- กรุณาเลือก --</option>';
    
    // เติมรายชื่อครูที่มีในระบบก่อน
    users.forEach(u => {
        // ไม่รวม Admin หลักในการเปลี่ยน PIN ครูทั่วไปตรงนี้
        if (u.name !== "Admin") {
            const option = document.createElement("option");
            option.value = u.name;
            option.innerText = `${u.name} ${u.code ? '(' + u.code + ')' : ''} ${u.hasPin ? '✅' : '❌'}`;
            select.appendChild(option);
        }
    });
    
    // เอาตัวเลือก "เพิ่มครูใหม่" ไปไว้ล่างสุดของตัวเลือก
    const newOption = document.createElement("option");
    newOption.value = "NEW_TEACHER";
    newOption.innerText = "** เพิ่มครูคนใหม่ **";
    select.appendChild(newOption);
    
    document.getElementById("reg-new-teacher-wrapper").classList.add("hidden");
    document.getElementById("reg-new-teacher-name").value = "";
    document.getElementById("reg-teacher-pin").value = ""; // ล้างรหัส PIN
    document.getElementById("modal-register").classList.add("active");
}

function handleRegisterSubmit() {
    const selectVal = document.getElementById("reg-teacher-select").value;
    const pinVal = document.getElementById("reg-teacher-pin").value.trim();
    let name = selectVal;
    
    if (selectVal === "NEW_TEACHER") {
        name = document.getElementById("reg-new-teacher-name").value.trim();
        if (!name) {
            showToast("กรุณาระบุชื่อ-นามสกุลครูท่านใหม่", "error");
            return;
        }
    }
    
    if (!selectVal) {
        showToast("กรุณาเลือกรายชื่อผู้ต้องการลงทะเบียน", "error");
        return;
    }
    
    if (!pinVal || pinVal.length !== 4 || isNaN(pinVal)) {
        showToast("กรุณากรอกรหัส PIN เป็นตัวเลข 4 หลัก", "error");
        return;
    }
    
    // ตรวจสอบว่า PIN ซ้ำกับผู้ใช้งานคนอื่นหรือไม่
    const duplicateUser = users.find(u => String(u.pin || "").trim() === String(pinVal).trim() && u.name !== name);
    if (duplicateUser) {
        showToast("รหัส PIN นี้ถูกใช้งานโดยคุณครูท่านอื่นแล้ว กรุณาตั้งรหัสอื่น", "error");
        return;
    }
    
    document.getElementById("modal-register").classList.remove("active");
    
    // ตั้งรหัสผ่าน PIN ของคุณครูคนนั้นโดยตรง โดยนำไปบันทึกเลย (ส่งค่า code เป็นว่างไปเพราะเราไม่ได้ใช้รหัสครูแล้ว)
    saveUserRegistration(name, "", pinVal, "TEACHER");
}

async function saveUserRegistration(name, code, pinCode, role) {
    setLoader(true);
    
    if (!config.scriptUrl) {
        showToast("ฟังก์ชันนี้ต้องเชื่อมต่อระบบ Apps Script", "error");
        setLoader(false);
        return;
    }
    
    const payload = {
        action: "registerUser",
        name: name,
        code: code,
        newPin: pinCode,
        role: role
    };
    
    try {
        const res = await fetch(config.scriptUrl, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(`ลงทะเบียนคุณครู ${name} พร้อมรหัส PIN เรียบร้อย`);
            
            // เพิ่ม/อัปเดตข้อมูลผู้ใช้ในหน่วยความจำทันทีเพื่อให้ยืนยันรหัสได้รวดเร็ว
            let existingUser = users.find(u => u.name === name);
            if (existingUser) {
                existingUser.pin = pinCode;
                existingUser.code = code;
                existingUser.hasPin = true;
            } else {
                users.push({
                    name: name,
                    code: code,
                    role: role,
                    pin: pinCode,
                    hasPin: true
                });
            }
            
            // loadInitialData(); ถูกนำออกเพื่อให้ไม่ต้องโหลดใหม่ทั้งหน้าตอนลงทะเบียน
        } else {
            showToast("ลงทะเบียนรหัสผ่านไม่สำเร็จ: " + data.message, "error");
        }
    } catch (e) {
        showToast("ไม่สามารถอัปเดตระบบรหัสผ่านได้", "error");
    } finally {
        setLoader(false);
    }
}

/**
 * เรนเดอร์ตารางรายชื่อครูในส่วนแก้ไขสถานะของหน้าแอดมิน
 */
function renderAdminTeachers() {
    const tbody = document.getElementById("admin-teacher-list-tbody");
    tbody.innerHTML = "";
    document.getElementById("admin-teacher-unsaved-msg").style.display = "none";
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="txt-center" style="color: var(--text-muted);">ไม่มีรายการข้อมูลผู้ใช้งานครู</td></tr>';
        return;
    }
    
    users.forEach(u => {
        const tr = document.createElement("tr");
        
        const roleSelectHtml = `
            <select class="admin-role-select" data-name="${u.name}">
                <option value="TEACHER" ${u.role === 'TEACHER' ? 'selected' : ''}>TEACHER</option>
                <option value="STUDENT_AFFAIRS" ${u.role === 'STUDENT_AFFAIRS' ? 'selected' : ''}>STUDENT_AFFAIRS</option>
                <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
            </select>
        `;
        
        const isSelfAdmin = u.name === "Admin";
        
        tr.innerHTML = `
            <td><strong>${u.name}</strong></td>
            <td>
                <input type="text" class="admin-pin-input form-control" data-name="${u.name}" value="${u.pin || ''}" maxlength="4" style="font-family: monospace; letter-spacing: 2px; width: 80px; text-align: center; padding: 4px; display: inline-block; font-size: 0.9rem;" pattern="[0-9]{4}">
            </td>
            <td>${roleSelectHtml}</td>
            <td class="txt-center">
                <button class="delete-btn btn-delete-teacher" data-name="${u.name}" title="ลบครูผู้ใช้" ${isSelfAdmin ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        
        // เมื่อมีการเปลี่ยนบทบาท หรือแก้ไขรหัสผ่าน จะโชว์ข้อความเตือนให้กดบันทึก
        const select = tr.querySelector(".admin-role-select");
        select.onchange = () => {
            document.getElementById("admin-teacher-unsaved-msg").style.display = "inline-block";
        };
        
        const pinInput = tr.querySelector(".admin-pin-input");
        if (pinInput) {
            pinInput.oninput = () => {
                document.getElementById("admin-teacher-unsaved-msg").style.display = "inline-block";
            };
        }
        
        // จัดการลบบักชีครู
        const delBtn = tr.querySelector(".btn-delete-teacher");
        if (delBtn && !isSelfAdmin) {
            delBtn.onclick = () => {
                const modal = document.getElementById("modal-confirm-delete-user");
                document.getElementById("delete-user-target-name").innerText = u.name;
                modal.classList.add("active");
                
                document.getElementById("btn-cancel-delete-user-modal").onclick = () => {
                    modal.classList.remove("active");
                };
                
                document.getElementById("btn-confirm-delete-user-modal").onclick = async () => {
                    modal.classList.remove("active");
                    setLoader(true);
                    
                    if (!config.scriptUrl) {
                        showToast("ฟังก์ชันนี้ต้องเชื่อมต่อระบบ Apps Script", "error");
                        setLoader(false);
                        return;
                    }
                    
                    try {
                        const res = await fetch(config.scriptUrl, {
                            method: "POST",
                            body: JSON.stringify({
                                action: "deleteUser",
                                pin: authenticatedAdminPin,
                                name: u.name
                            })
                        });
                        const data = await res.json();
                        if (data.success) {
                            showToast(`ลบบักชีผู้ใช้ของ ${u.name} สำเร็จ`);
                            users = users.filter(usr => usr.name !== u.name); // ลบจากหน่วยความจำ
                            renderAdminTeachers(); // เรนเดอร์ใหม่
                        } else {
                            showToast("ลบผู้ใช้ไม่สำเร็จ: " + data.message, "error");
                        }
                    } catch (err) {
                        showToast("การเชื่อมต่อระบบล้มเหลว", "error");
                    } finally {
                        setLoader(false);
                    }
                };
            };
        }
        
        tbody.appendChild(tr);
    });
}

/**
 * บันทึกบทบาทครูทั้งหมด (Batch Save)
 */
document.getElementById("btn-save-all-teachers").onclick = async () => {
    const selects = document.querySelectorAll(".admin-role-select");
    const updates = [];
    let pinError = false;
    
    selects.forEach(sel => {
        const name = sel.getAttribute("data-name");
        const pinInput = document.querySelector(`.admin-pin-input[data-name="${name}"]`);
        const pinVal = pinInput ? pinInput.value.trim() : "";
        
        if (!pinVal || pinVal.length !== 4 || isNaN(pinVal)) {
            pinError = true;
            return;
        }
        
        updates.push({
            name: name,
            role: sel.value,
            pin: pinVal
        });
    });
    
    if (pinError) {
        showToast("กรุณาระบุรหัส PIN 4 หลักที่เป็นตัวเลขให้ถูกต้องสำหรับทุกคน", "error");
        return;
    }
    
    // ตรวจสอบ PIN ซ้ำกันในการแก้ไขรอบนี้
    const pinsSeen = {};
    let pinDuplicate = false;
    for (let u of updates) {
        if (pinsSeen[u.pin]) {
            pinDuplicate = true;
            break;
        }
        pinsSeen[u.pin] = u.name;
    }
    if (pinDuplicate) {
        showToast("พบรหัส PIN ซ้ำกันสำหรับผู้ใช้งานต่างคนกัน กรุณาแก้ไขรหัสไม่ให้ซ้ำกัน", "error");
        return;
    }
    
    if (updates.length === 0) return;
    
    setLoader(true);
    
    if (!config.scriptUrl) {
        showToast("ฟังก์ชันนี้ต้องเชื่อมต่อระบบ Apps Script", "error");
        setLoader(false);
        return;
    }
    
    try {
        const res = await fetch(config.scriptUrl, {
            method: "POST",
            body: JSON.stringify({
                action: "updateAllUserRoles",
                pin: authenticatedAdminPin,
                updates: updates
            })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast("บันทึกข้อมูลครูและรหัสผ่านทั้งหมดสำเร็จ");
            document.getElementById("admin-teacher-unsaved-msg").style.display = "none";
            // อัปเดตในหน่วยความจำ
            updates.forEach(u => {
                const userObj = users.find(usr => usr.name === u.name);
                if (userObj) {
                    userObj.role = u.role;
                    userObj.pin = u.pin;
                }
            });
        } else {
            showToast("บันทึกล้มเหลว: " + data.message, "error");
        }
    } catch (e) {
        showToast("การเชื่อมต่อระบบล้มเหลว", "error");
    } finally {
        setLoader(false);
    }
};

/**
 * 10. หน้าแอดมิน (Admin Control Panel)
 */
async function loadHolidaysInAdmin() {
    const tbody = document.getElementById("holiday-list-tbody");
    tbody.innerHTML = "";
    
    if (holidays.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="txt-center" style="color: var(--text-muted);">ไม่มีรายการวันหยุดที่บันทึกไว้</td></tr>';
        return;
    }
    
    holidays.forEach(h => {
        const tr = document.createElement("tr");
        
        const thDateDisplay = formatThaiFriendlyDate(h.date);
        
        tr.innerHTML = `
            <td>${thDateDisplay}</td>
            <td><strong>${h.name}</strong></td>
            <td class="txt-center">
                <button class="delete-btn btn-delete-holiday" data-date="${h.date}" title="ลบวันหยุด">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        
        tr.querySelector(".btn-delete-holiday").onclick = async () => {
            setLoader(true);
            
            if (!config.scriptUrl) {
                showToast("ฟังก์ชันนี้ต้องเชื่อมต่อระบบ Apps Script", "error");
                setLoader(false);
                return;
            }
            
            try {
                const res = await fetch(config.scriptUrl, {
                    method: "POST",
                    body: JSON.stringify({
                        action: "deleteHoliday",
                        pin: authenticatedAdminPin, // ส่งรหัสแอดมินจริงที่ล็อกอินเข้ามา
                        date: h.date
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("ลบวันหยุดเรียบร้อย");
                    await loadInitialData();
                    loadHolidaysInAdmin();
                } else {
                    showToast("ลบล้มเหลว: " + data.message, "error");
                }
            } catch (err) {
                showToast("มีข้อผิดพลาด", "error");
            } finally {
                setLoader(false);
            }
        };
        
        tbody.appendChild(tr);
    });
}

async function addHoliday() {
    const dateInput = document.getElementById("holiday-date-input").value;
    const nameInput = document.getElementById("holiday-name-input").value.trim();
    
    if (!dateInput || !nameInput) {
        showToast("กรุณากรอกวันที่และระบุชื่อวันหยุด", "error");
        return;
    }
    
    setLoader(true);
    
    if (!config.scriptUrl) {
        showToast("ฟังก์ชันนี้ต้องเชื่อมต่อระบบ Apps Script", "error");
        setLoader(false);
        return;
    }
    
    try {
        const res = await fetch(config.scriptUrl, {
            method: "POST",
            body: JSON.stringify({
                action: "addHoliday",
                pin: authenticatedAdminPin, // ส่งรหัสแอดมินจริงที่ล็อกอินเข้ามา
                date: dateInput,
                name: nameInput
            })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast("เพิ่มวันหยุดสำเร็จ");
            document.getElementById("holiday-date-input").value = "";
            document.getElementById("holiday-name-input").value = "";
            await loadInitialData();
            loadHolidaysInAdmin();
        } else {
            showToast("เพิ่มวันหยุดไม่สำเร็จ: " + data.message, "error");
        }
    } catch (e) {
        showToast("การเชื่อมต่อกานข้อมูลมีปักหา", "error");
    } finally {
        setLoader(false);
    }
}

/**
 * 11. ฟังก์ชันเปลี่ยนหน้า (SPA View Switcher)
 */
window.jumpToTracking = function(room) {
    const roomFilterSelect = document.getElementById('at-risk-room-filter');
    if (roomFilterSelect) {
        // Ensure options exist if not populated yet
        let optionExists = false;
        for (let i = 0; i < roomFilterSelect.options.length; i++) {
            if (roomFilterSelect.options[i].value === room) optionExists = true;
        }
        if (!optionExists) {
            const opt = document.createElement('option');
            opt.value = room;
            opt.text = 'ชั้น ' + room;
            roomFilterSelect.appendChild(opt);
        }
        roomFilterSelect.value = room;
    }
    switchView('at-risk');
};
function switchView(viewName) {
    currentView = viewName;
    window.scrollTo(0, 0);
    
    // ปิด Start Menu อัตโนมัติเมื่อเลือกเมนู
    const sidebar = document.querySelector(".sidebar");
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");
    const startMenuBtn = document.getElementById("start-menu-btn");
    if (sidebar) sidebar.classList.remove("active");
    if (startMenuBtn) startMenuBtn.classList.remove("active");
    if (sidebarBackdrop) sidebarBackdrop.style.display = "none";
    
    // อัปเดตหัวข้อแถบด้านบนสุดตามหน้าจอที่กำลังเปิดทำงาน
    const pageTitleEl = document.getElementById("header-page-title");
    if (pageTitleEl) {
        if (viewName === "home") {
            pageTitleEl.innerText = "หน้าแรก";
        } else if (viewName === "stats") {
            pageTitleEl.innerText = "สถิติเข้าเรียน";
        } else if (viewName === "misconduct") {
            pageTitleEl.innerText = "แจ้งพฤติกรรมนักเรียน";
        } else if (viewName === "at-risk") {
            pageTitleEl.innerText = "ติดตามนักเรียน";
        } else if (viewName === "attendance-check") {
            pageTitleEl.innerText = `เช็คชื่อห้อง ${selectedRoom ? selectedRoom.grade + '/' + selectedRoom.room : ''}`;
        }
    }
    
    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.remove("active");
    });
    
    document.querySelectorAll(".dock-item").forEach(btn => {
        btn.classList.remove("active");
    });
    const activeShortcut = document.getElementById(`shortcut-${viewName}`);
    if (activeShortcut) activeShortcut.classList.add("active");
    
    document.querySelectorAll(".content-view").forEach(view => {
        view.classList.remove("active");
    });
    
    // จัดการการแสดงผลของปุ่มย้อนกลับกละเส้นคั่น
    const backBtn = document.getElementById("shortcut-back");
    const backSep = document.getElementById("mobile-back-separator");
    if (backBtn && backSep) {
        if (viewName === "attendance-check" || viewName === "stats" || viewName === "misconduct" || viewName === "at-risk") {
            backBtn.style.setProperty("display", "flex", "important");
            backSep.style.setProperty("display", "block", "important");
            backBtn.classList.add("show-on-mobile");
            backSep.classList.add("show-on-mobile");
            // Remove active dot from other dock items since we are in an inner page
            document.querySelectorAll(".dock-item").forEach(btn => btn.classList.remove("active"));
        } else {
            backBtn.style.setProperty("display", "none", "important");
            backSep.style.setProperty("display", "none", "important");
            backBtn.classList.remove("show-on-mobile");
            backSep.classList.remove("show-on-mobile");
        }
    }
    
    if (viewName === "home") {
        document.getElementById("menu-home").classList.add("active");
        document.getElementById("view-home").classList.add("active");
        renderRooms();
    } else if (viewName === "stats") {
        document.getElementById("menu-stats").classList.add("active");
        document.getElementById("view-stats").classList.add("active");
        
        populateStatsRoomDropdown();
        fetchAndRenderStats();
    } else if (viewName === "misconduct") {
        document.getElementById("menu-misconduct").classList.add("active");
        document.getElementById("view-misconduct").classList.add("active");
        fetchAndRenderMisconducts();
    } else if (viewName === "at-risk") {
        document.getElementById("menu-at-risk").classList.add("active");
        document.getElementById("view-at-risk").classList.add("active");
        renderAtRiskStudents();
    } else if (viewName === "attendance-check") {
        document.getElementById("view-attendance-check").classList.add("active");
    }
}

/**
 * ฟังก์ชันเปิด/ปิดเมนูย่อย (Accordion)
 */
window.toggleSubMenu = function(headerElement) {
    const parent = headerElement.parentElement;
    const subMenu = parent.querySelector(".menu-sub-items");
    const chevron = headerElement.querySelector(".menu-chevron");
    
    if (subMenu.style.display === "none") {
        subMenu.style.display = "block";
        chevron.style.transform = "rotate(180deg)";
        headerElement.classList.add("expanded");
    } else {
        subMenu.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
        headerElement.classList.remove("expanded");
    }
};

/**
 * ดึงและแสดงข้อมูลนักเรียนกลุ่มเสี่ยง
 */
window.renderAtRiskStudents = async function() {
    const tbody = document.getElementById("at-risk-table-body");
    const badge = document.getElementById("at-risk-badge");
    
    tbody.innerHTML = '<tr><td colspan="5" class="txt-center" style="padding: 30px;"><div class="empty-state" style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 30px; margin-bottom: 10px;"></i><p>กำลังโหลดและคำนวณข้อมูล...</p></div></td></tr>';
    
    if (!config.scriptUrl) {
        tbody.innerHTML = '<tr><td colspan="5" class="txt-center" style="padding: 30px;">โปรดตั้งค่าลิงก์ Apps Script ก่อน</td></tr>';
        return;
    }
    
    // 1. โหลดข้อมูลสถิติทั้งหมดถ้ายังไม่มี
    if (!allStatsData) {
        try {
            const res = await fetch(`${config.scriptUrl}?action=getStats&month=ALL&room=ALL`);
            const data = await res.json();
            if (data.success) {
                allStatsData = data.stats;
                if (allStatsData && allStatsData.logs) {
                    allStatsData.logs.forEach(log => {
                        log.status = translateAbbreviationToStatus(log.status);
                    });
                }
                if (typeof updateAtRiskNoticeInTab === 'function') updateAtRiskNoticeInTab();
            } else {
                tbody.innerHTML = `<tr><td colspan="5" class="txt-center">ดึงข้อมูลไม่สำเร็จ: ${data.message}</td></tr>`;
                return;
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" class="txt-center">เกิดข้อผิดพลาดในการโหลดข้อมูลสถิติ</td></tr>';
            return;
        }
    }
    
    // รอข้อมูล At-Risk / Documents จาก Deferred Load
    if (deferredDataPromise) {
        await deferredDataPromise;
    } else if (!isDeferredDataLoaded) {
        await fetchDeferredDataOnce();
    }
    
    // 2. คำนวณสถิติ
    const countsMap = {};
    students.forEach(s => {
        countsMap[s.studentId] = {
            studentId: s.studentId,
            fullName: s.fullName,
            grade: s.grade,
            room: s.room,
            absent: 0,
            late: 0
        };
    });
    
    if (allStatsData && allStatsData.logs) {
        allStatsData.logs.forEach(log => {
            if (countsMap[log.studentId]) {
                if (log.status === "ขาด") countsMap[log.studentId].absent++;
                if (log.status === "สาย") countsMap[log.studentId].late++;
            }
        });
    }
    
    // 3. กรองเฉพาะคนที่เกินเกณฑ์ (สาย >= 3 หรือ ขาด >= 3)
    const atRiskList = [];
    Object.values(countsMap).forEach(s => {
        if (s.absent >= 3 || s.late >= 3) {
            atRiskList.push(s);
        }
    });
    
    // อัปเดตตัวเลขแจ้งเตือน
    if (atRiskList.length > 0) {
        badge.innerText = atRiskList.length;
        badge.style.display = "inline-block";
    } else {
        badge.style.display = "none";
    }
    
    // 4. แสดงผล
    if (atRiskList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px;"><div class="empty-state"><i class="fa-solid fa-circle-check" style="font-size: 40px; color: var(--color-present); margin-bottom: 10px;"></i><p>ไม่มีนักเรียนกลุ่มเสี่ยงที่ค้างดำเนินการยอดเยี่ยมมากครับ!</p></div></td></tr>';
        return;
    }
    
    const filterValue = document.getElementById('at-risk-filter') ? document.getElementById('at-risk-filter').value : 'all';
    const roomFilterSelect = document.getElementById('at-risk-room-filter');
    
    // Populate room filter if it's the first time
    if (roomFilterSelect && !roomFilterSelect.getAttribute('data-populated')) {
        roomFilterSelect.setAttribute('data-populated', 'true');
        const currentValue = roomFilterSelect.value;
        
        while (roomFilterSelect.options.length > 1) {
            roomFilterSelect.remove(1);
        }
        
        const uniqueRooms = [...new Set(atRiskList.map(s => `${s.grade}/${s.room}`))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
        uniqueRooms.forEach(room => {
            const opt = document.createElement('option');
            opt.value = room;
            opt.text = 'ชั้น ' + room;
            roomFilterSelect.appendChild(opt);
        });
        
        roomFilterSelect.value = currentValue;
    }
    
    const roomFilterValue = roomFilterSelect ? roomFilterSelect.value : 'ALL';
    
    let filteredList = atRiskList;
    if (roomFilterValue !== 'ALL') {
        filteredList = filteredList.filter(s => `${s.grade}/${s.room}` === roomFilterValue);
    }
    
    if (filterValue === 'absent') {
        filteredList = filteredList.filter(s => s.absent >= 3);
    } else if (filterValue === 'late') {
        filteredList = filteredList.filter(s => s.late >= 3);
    }
    
    // จัดเรียงตามชั้น/ห้อง
    filteredList.sort((a, b) => {
        const roomA = `${a.grade}/${a.room}`;
        const roomB = `${b.grade}/${b.room}`;
        if (roomA !== roomB) return roomA.localeCompare(roomB, 'th', { numeric: true });
        return a.studentId.localeCompare(b.studentId);
    });
    
    tbody.innerHTML = "";
    
    let teacherOptions = '<option value="">- เลือกครู -</option>';
    if (typeof users !== 'undefined') {
        users.forEach(u => {
            teacherOptions += `<option value="${u.name}">${u.name}</option>`;
        });
    }
    
    filteredList.forEach(s => {
        let statsText = "";
        let docType = "";
        let noticeCount = 1;
        
        const badgeBaseStyle = "padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 13px; display: inline-block; margin-right: 4px;";
        const absentHighStyle = badgeBaseStyle + " background-color: #fee2e2; color: #b91c1c;"; // red
        const absentMedStyle = badgeBaseStyle + " background-color: #ffedd5; color: #c2410c;"; // orange
        const absentLowStyle = badgeBaseStyle + " background-color: #fef9c3; color: #a16207;"; // yellow
        
        const lateHighStyle = badgeBaseStyle + " background-color: #f3e8ff; color: #7e22ce;"; // purple
        const lateMedStyle = badgeBaseStyle + " background-color: #e0f2fe; color: #0369a1;"; // blue
        const lateLowStyle = badgeBaseStyle + " background-color: #f1f5f9; color: #475569;"; // slate
        
        if (s.absent >= 9) { statsText += `<span style="${absentHighStyle}">ขาด ${s.absent} วัน</span>`; docType = "ป.ค.9"; noticeCount = 3; }
        else if (s.absent >= 6) { statsText += `<span style="${absentMedStyle}">ขาด ${s.absent} วัน</span>`; docType = "ป.ค.9"; noticeCount = 2; }
        else if (s.absent >= 3) { statsText += `<span style="${absentLowStyle}">ขาด ${s.absent} วัน</span>`; docType = "ป.ค.9"; noticeCount = 1; }
        
        if (s.late >= 8) { statsText += `<span style="${lateHighStyle}">สาย ${s.late} ครั้ง</span>`; if(!docType) { docType = "ป.ค.8"; noticeCount = 3; } }
        else if (s.late >= 5) { statsText += `<span style="${lateMedStyle}">สาย ${s.late} ครั้ง</span>`; if(!docType) { docType = "ป.ค.8"; noticeCount = 2; } }
        else if (s.late >= 3) { statsText += `<span style="${lateLowStyle}">สาย ${s.late} ครั้ง</span>`; if(!docType) { docType = "ป.ค.8"; noticeCount = 1; } }

        const fullDocType = `${docType}_ครั้งที่${noticeCount}`;
        const storageKey = `${s.studentId}_${fullDocType}`;

        // เช็คสถานะการเซ็น
        const existingDoc = documentsData.find(d => d.studentId === s.studentId && d.documentType === fullDocType);
        const isSigned = (existingDoc && existingDoc.signatureBase64) ? true : false;
        
        // ดึงค่าที่บันทึกไว้จาก cache ของ Google Sheets (ข้อมูลสดตอนโหลดเพจ)
        let savedHr = "";
        let savedSa = "";
        
        // ให้ได้คีย์แบบ: รหัส|เอกสาร|ครั้งที่1 (เช่น 4879|ป.ค.9|ครั้งที่1)
        const backendKey = `${s.studentId}|${docType}|ครั้งที่${fullDocType.split('_ครั้งที่')[1] || '1'}`;
        
        if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
            savedHr = atRiskTeachersCache[backendKey].hr || "";
            savedSa = atRiskTeachersCache[backendKey].sa || "";
        }

        // คำนวณสถานะปุ่ม HR
        let hrBtnClass = "btn-secondary";
        let hrBtnStyle = "width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        let hrBtnText = "รอดำเนินการ";
        let hrIcon = "fa-user-plus";
        if (savedHr) {
            if (isSigned) {
                hrBtnClass = "btn-success";
                hrBtnText = "เสร็จแล้ว";
                hrIcon = "fa-circle-check";
            } else {
                hrBtnClass = "";
                hrBtnStyle += " background-color: #f59e0b; color: white; border: none;";
                hrBtnText = "รอดำเนินการ";
                hrIcon = "fa-user-check";
            }
        }

        // คำนวณสถานะปุ่ม SA
        let saBtnClass = "btn-secondary";
        let saBtnStyle = "width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        let saBtnText = "รอดำเนินการ";
        let saIcon = "fa-user-plus";
        if (savedSa) {
            if (isSigned) {
                saBtnClass = "btn-success";
                saBtnText = "เสร็จแล้ว";
                saIcon = "fa-circle-check";
            } else {
                saBtnClass = "";
                saBtnStyle += " background-color: #f59e0b; color: white; border: none;";
                saBtnText = "รอดำเนินการ";
                saIcon = "fa-user-check";
            }
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${statsText}</td>
            <td>${s.grade}/${s.room} - ${s.studentId} - <strong>${s.fullName}</strong></td>
            <td>
                <button class="btn btn-sm btn-outline" style="white-space: nowrap;" onclick="openPreviewDirectly('${s.studentId}', '${s.fullName}', '${s.grade}/${s.room}', '${docType}', '${fullDocType}')">
                    <i class="fa-solid fa-file-lines"></i> พรีวิว
                </button>
            </td>
            <td>
                <button class="btn btn-sm ${hrBtnClass}" onclick="openAtRiskActionModal('${s.studentId}', '${s.fullName}', '${s.grade}/${s.room}', '${docType}', '${fullDocType}', 'hr')" style="${hrBtnStyle}">
                    <i class="fa-solid ${hrIcon}"></i> ${hrBtnText}
                </button>
            </td>
            <td>
                <button class="btn btn-sm ${saBtnClass}" onclick="openAtRiskActionModal('${s.studentId}', '${s.fullName}', '${s.grade}/${s.room}', '${docType}', '${fullDocType}', 'sa')" style="${saBtnStyle}">
                    <i class="fa-solid ${saIcon}"></i> ${saBtnText}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

let currentActionRole = 'hr'; // 'hr' or 'sa'
window.openPreviewDirectly = function(studentId, fullName, gradeRoom, docType, fullDocType) {
    currentSigningStudent = {
        studentId: studentId,
        fullName: fullName,
        gradeRoom: gradeRoom,
        docType: docType,
        fullDocType: fullDocType,
        backendKey: `${studentId}|${docType}|ครั้งที่${fullDocType.split('_ครั้งที่')[1] || '1'}`
    };
    
    const backendKey = currentSigningStudent.backendKey;
    let saved = { hr: "", sa: "" };
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        saved = { ...atRiskTeachersCache[backendKey] };
    }
    
    currentSigningStudent.homeroomTeacher = saved.hr || '...........................................';
    currentSigningStudent.headOfStudentAffairs = saved.sa || '...........................................';
    
    const docToPrint = { ...currentSigningStudent, documentType: currentSigningStudent.fullDocType };
    document.getElementById("modal-at-risk-action").classList.remove("active");
    openDocumentPreview(docToPrint);
};


window.openAtRiskActionModal = function(studentId, fullName, gradeRoom, docType, fullDocType, role) {
    currentSigningStudent = { studentId, fullName, gradeRoom, docType, fullDocType };
    currentActionRole = role;
    
    const roleName = role === 'hr' ? 'ครูที่ปรึกษา' : 'หัวหน้ากิจการนักเรียน';
    document.getElementById("at-risk-action-title").innerText = `จัดการ${roleName}`;
    document.getElementById("at-risk-action-subtitle").innerText = `ระบุรายชื่อผู้รับผิดชอบเพื่อพิมพ์ลงในเอกสาร ${docType}`;
    
    // แสดง/ซ่อน dropdown
    if (role === 'hr') {
        document.getElementById("group-action-hr").style.display = "block";
        document.getElementById("group-action-sa").style.display = "none";
    } else {
        // ของ SA ให้โชว์ทั้งคู่
        document.getElementById("group-action-hr").style.display = "block";
        document.getElementById("group-action-sa").style.display = "block";
    }
    
    let teacherOptions = '<option value="">- เลือกครู -</option>';
    if (typeof users !== 'undefined') {
        users.forEach(u => {
            teacherOptions += `<option value="${u.name}">${u.name}</option>`;
        });
    }
    
    const hrSelect = document.getElementById("action-hr-select");
    const saSelect = document.getElementById("action-sa-select");
    hrSelect.innerHTML = teacherOptions;
    saSelect.innerHTML = teacherOptions;
    
    const storageKey = `${studentId}_${fullDocType}`;
    // ใช้ตัวคั่น | แทน _ เวลาบันทึกจริงเพื่อการจัดเก็บใน Google Sheets แต่ key กั่งเว็บอนุโลมให้เป็น _ หรือ | ก็ได้
    // ขอปรับ storageKey ให้ตรงกับแบคเอนด์เลยคือ StudentId|DocType|NoticeCount
    const backendKey = `${studentId}|${docType}|ครั้งที่${fullDocType.split('ครั้งที่')[1] || '1'}`;
    currentSigningStudent.backendKey = backendKey;
    
    let savedHr = "";
    let savedSa = "";
    window.tempHrSign = "";
    window.tempSaSign = "";
    
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        savedHr = atRiskTeachersCache[backendKey].hr || "";
        savedSa = atRiskTeachersCache[backendKey].sa || "";
        window.tempHrSign = atRiskTeachersCache[backendKey].hrSign || "";
        window.tempSaSign = atRiskTeachersCache[backendKey].saSign || "";
    }
    
    if (savedHr) hrSelect.value = savedHr;
    if (savedSa) saSelect.value = savedSa;
    
    // แสดงลายเซ็นถ้ามี
    const hrPreview = document.getElementById("hr-signature-preview");
    const hrContainer = document.getElementById("hr-signature-preview-container");
    if (window.tempHrSign) {
        hrPreview.src = window.tempHrSign;
        hrContainer.style.display = "block";
    } else {
        hrContainer.style.display = "none";
        hrPreview.src = "";
    }
    
    const saPreview = document.getElementById("sa-signature-preview");
    const saContainer = document.getElementById("sa-signature-preview-container");
    if (window.tempSaSign) {
        saPreview.src = window.tempSaSign;
        saContainer.style.display = "block";
    } else {
        saContainer.style.display = "none";
        saPreview.src = "";
    }
    
    document.getElementById("modal-at-risk-action").classList.add("active");
};

window.closeAtRiskActionModal = function() {
    document.getElementById("modal-at-risk-action").classList.remove("active");
};

window.saveAtRiskTeachers = async function() {
    if (!currentSigningStudent) return;
    
    const hrSelect = document.getElementById("action-hr-select").value;
    const saSelect = document.getElementById("action-sa-select").value;
    const backendKey = currentSigningStudent.backendKey;
    
    let saved = { hr: "", sa: "", hrSign: "", saSign: "" };
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        saved = { ...atRiskTeachersCache[backendKey] };
    }
    
    if (currentActionRole === 'hr') {
        saved.hr = hrSelect;
        saved.hrSign = window.tempHrSign || saved.hrSign;
    } else {
        saved.hr = hrSelect;
        saved.sa = saSelect;
        saved.hrSign = window.tempHrSign || saved.hrSign;
        saved.saSign = window.tempSaSign || saved.saSign;
    }
    
    // บันทึกลง Cache เพื่อให้ UI เปลี่ยนทันที
    if (!atRiskTeachersCache) atRiskTeachersCache = {};
    atRiskTeachersCache[backendKey] = saved;
    
    if (typeof renderAtRiskStudents === 'function') renderAtRiskStudents();
    
    // ส่งข้อมูลไปเซฟที่ Google Sheets เบื้องหลัง
    if (config.scriptUrl) {
        showToast("กำลังบันทึกข้อมูลไปที่ Google Sheets...", "info");
        try {
            const res = await fetch(config.scriptUrl, {
                method: "POST",
                body: JSON.stringify({
                    action: "saveAtRiskTeachers",
                    key: backendKey,
                    hr: saved.hr,
                    sa: saved.sa,
                    hrSign: saved.hrSign,
                    saSign: saved.saSign
                })
            });
            const result = await res.json();
            if (result.success) {
                showToast("บันทึกชื่อกละลายเซ็นลงกานข้อมูลเรียบร้อย", "success");
            } else {
                showToast("เกิดข้อผิดพลาด: " + result.message, "error");
            }
        } catch (error) {
            showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
        }
    } else {
        showToast("บันทึกข้อมูลเรียบร้อย (ออฟไลน์)", "success");
    }
};

window.previewAtRiskDocument = async function() {
    if (!currentSigningStudent) return;
    await saveAtRiskTeachers(); // รอให้บันทึกเสร็จก่อนพรีวิว
    
    const backendKey = currentSigningStudent.backendKey;
    let saved = { hr: "", sa: "" };
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        saved = { ...atRiskTeachersCache[backendKey] };
    }
    
    currentSigningStudent.homeroomTeacher = saved.hr;
    currentSigningStudent.headOfStudentAffairs = saved.sa;
    
    // ตั้งค่ากลับไปใช้ documentType ธรรมดาสำหรับการพิมพ์ (ป.ค.8 ไม่ใช่ ป.ค.8_ครั้งที่1)
    // แต่ให้เอกสารรู้ว่านี่คือเอกสารที่ดึงมาจาก fullDocType ไหน หากมีการเซ็นจะบันทึกลง fullDocType
    const docToPrint = { ...currentSigningStudent, documentType: currentSigningStudent.fullDocType };
    
    closeAtRiskActionModal();
    openDocumentPreview(docToPrint);
};

/* =========================================================
 * 13. ระบบ E-Signature และออกเอกสารอัตโนมัติ
 * ========================================================= */
let signaturePadCanvas = null;
let signaturePadCtx = null;
let isDrawingSignature = false;
let currentSigningStudent = null;

function initSignaturePad() {
    signaturePadCanvas = document.getElementById("signature-pad");
    if (!signaturePadCanvas) return;
    
    signaturePadCtx = signaturePadCanvas.getContext("2d");
    signaturePadCtx.lineWidth = 3;
    signaturePadCtx.lineCap = "round";
    signaturePadCtx.strokeStyle = "#000080"; // หมึกน้ำเงินเข้ม
    
    // Mouse events
    signaturePadCanvas.addEventListener("mousedown", (e) => {
        isDrawingSignature = true;
        const rect = signaturePadCanvas.getBoundingClientRect();
        signaturePadCtx.beginPath();
        signaturePadCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    });
    
    signaturePadCanvas.addEventListener("mousemove", (e) => {
        if (!isDrawingSignature) return;
        const rect = signaturePadCanvas.getBoundingClientRect();
        signaturePadCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        signaturePadCtx.stroke();
    });
    
    signaturePadCanvas.addEventListener("mouseup", () => isDrawingSignature = false);
    signaturePadCanvas.addEventListener("mouseout", () => isDrawingSignature = false);
    
    // Touch events for Mobile/Tablet
    signaturePadCanvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        isDrawingSignature = true;
        const rect = signaturePadCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        signaturePadCtx.beginPath();
        signaturePadCtx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
    }, {passive: false});
    
    signaturePadCanvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (!isDrawingSignature) return;
        const rect = signaturePadCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        signaturePadCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
        signaturePadCtx.stroke();
    }, {passive: false});
    
    signaturePadCanvas.addEventListener("touchend", () => isDrawingSignature = false);
}

window.openSignatureFor = function(studentId, fullName, gradeRoom, docType) {
    const hrSelect = document.getElementById(`hr-${studentId}`);
    const saSelect = document.getElementById(`sa-${studentId}`);
    
    const homeroomTeacher = hrSelect ? hrSelect.value : "";
    const headOfStudentAffairs = saSelect ? saSelect.value : "";
    
    currentSigningStudent = { studentId, fullName, gradeRoom, docType, homeroomTeacher, headOfStudentAffairs };
    openDocumentPreview(currentSigningStudent);
};

window.openDocumentPreview = function(studentInfo) {
    const today = new Date();
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const formattedDate = `${today.getDate()} ${thaiMonths[today.getMonth()]} ${today.getFullYear() + 543}`;
    
    // ดึงวันที่ขาดและสายจาก allStatsData ถ้ามี
    if (allStatsData && allStatsData.logs) {
        studentInfo.absentDates = allStatsData.logs
            .filter(log => log.studentId === studentInfo.studentId && log.status === 'ขาด')
            .map(log => {
                const d = new Date(log.date);
                return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
            });
            
        studentInfo.lateDates = allStatsData.logs
            .filter(log => log.studentId === studentInfo.studentId && log.status === 'สาย')
            .map(log => {
                const d = new Date(log.date);
                return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
            });
    }

    const actualDocTypeForSave = studentInfo.documentType || studentInfo.docType;

    // ตรวจสอบว่าเคยเซ็นไว้แล้วหรือไม่
    const existingDoc = documentsData.find(d => d.studentId === studentInfo.studentId && d.documentType === actualDocTypeForSave);
    let signatureHtml = "";
    
    if (existingDoc && existingDoc.signatureBase64) {
        signatureHtml = `<img src="${existingDoc.signatureBase64}" style="max-height: 80px;" alt="ลายเซ็นผู้ปกครอง"><br>`;
        document.getElementById("btn-open-signature").style.display = "none";
        document.getElementById("btn-save-signature").style.display = "none";
    } else {
        if (studentInfo.tempSignature) {
            signatureHtml = `<img src="${studentInfo.tempSignature}" style="max-height: 80px;" alt="ลายเซ็นผู้ปกครอง"><br>`;
        } else {
            signatureHtml = `<div style="height: 80px;"></div>`;
        }
        document.getElementById("btn-open-signature").style.display = "inline-block";
        document.getElementById("btn-save-signature").style.display = studentInfo.tempSignature ? "inline-block" : "none";
    }
    
    // เรียกใช้งานเทมเพลตจาก documents.js
    const htmlContent = generateDocumentHtml(studentInfo, signatureHtml, formattedDate);
    
    document.getElementById("document-print-area").innerHTML = htmlContent;
    document.getElementById("modal-document-preview").classList.add("active");
};

window.closeDocumentPreview = function() {
    document.getElementById("modal-document-preview").classList.remove("active");
};

window.openSignatureFromPreview = function() {
    document.getElementById("signature-modal-title").innerText = `เซ็นชื่อผู้ปกครอง: ${currentSigningStudent.fullName}`;
    if (!signaturePadCanvas) initSignaturePad();
    clearSignature();
    document.getElementById("modal-signature").classList.add("active");
};

window.currentSigningTeacherRole = null;

window.openTeacherSignature = function(role) {
    window.currentSigningTeacherRole = role;
    const roleName = role === 'hr' ? 'ครูที่ปรึกษา' : 'หัวหน้ากิจการนักเรียน';
    document.getElementById("signature-modal-title").innerText = `เซ็นชื่อ: ${roleName}`;
    if (!signaturePadCanvas) initSignaturePad();
    clearSignature();
    document.getElementById("modal-signature").classList.add("active");
};

window.clearTeacherSignature = function(role) {
    if (role === 'hr') {
        window.tempHrSign = "";
        document.getElementById("hr-signature-preview-container").style.display = "none";
        document.getElementById("hr-signature-preview").src = "";
    } else {
        window.tempSaSign = "";
        document.getElementById("sa-signature-preview-container").style.display = "none";
        document.getElementById("sa-signature-preview").src = "";
    }
};

window.saveSignature = function() {
    if (!signaturePadCanvas) return;
    
    // สร้าง Canvas สีขาวและบีบอัด JPEG
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = signaturePadCanvas.width;
    tempCanvas.height = signaturePadCanvas.height;
    const ctx = tempCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(signaturePadCanvas, 0, 0);
    
    const signatureBase64 = tempCanvas.toDataURL("image/jpeg", 0.6);
    closeSignatureModal();
    
    if (window.currentSigningTeacherRole) {
        // เซ็นสำหรับครูในหน้า modal-at-risk-action
        if (window.currentSigningTeacherRole === 'hr') {
            window.tempHrSign = signatureBase64;
            document.getElementById("hr-signature-preview").src = signatureBase64;
            document.getElementById("hr-signature-preview-container").style.display = "block";
        } else {
            window.tempSaSign = signatureBase64;
            document.getElementById("sa-signature-preview").src = signatureBase64;
            document.getElementById("sa-signature-preview-container").style.display = "block";
        }
        window.currentSigningTeacherRole = null;
    } else if (currentSigningStudent) {
        // เซ็นสำหรับผู้ปกครองในหน้าพรีวิวเอกสาร
        currentSigningStudent.tempSignature = signatureBase64;
        openDocumentPreview(currentSigningStudent);
    }
};

window.saveDocumentData = async function() {
    if (!currentSigningStudent || !currentSigningStudent.tempSignature) return;
    setLoader(true);
    
    const actualDocTypeForSave = currentSigningStudent.documentType || currentSigningStudent.docType;
    
    try {
        const res = await fetch(config.scriptUrl, {
            method: "POST",
            body: JSON.stringify({
                action: "saveDocument",
                studentId: currentSigningStudent.studentId,
                documentType: actualDocTypeForSave,
                studentName: currentSigningStudent.fullName,
                gradeRoom: currentSigningStudent.gradeRoom,
                signatureBase64: currentSigningStudent.tempSignature
            })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast("บันทึกข้อมูลและลายเซ็นสำเร็จ!", "success");
            document.getElementById("btn-save-signature").style.display = "none";
            // นำเข้าข้อมูลจำลองเพื่อให้เปิดครั้งต่อไปเห็นทันที
            documentsData.push({
                studentId: currentSigningStudent.studentId,
                documentType: actualDocTypeForSave,
                signatureBase64: currentSigningStudent.tempSignature
            });
            // อัปเดตตารางเพื่อเปลี่ยนสีปุ่ม
            if (typeof renderAtRiskStudents === 'function') {
                renderAtRiskStudents();
            }
        } else {
            showToast("ไม่สามารถบันทึกได้: " + data.message, "error");
        }
    } catch (e) {
        showToast("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
    } finally {
        setLoader(false);
    }
};

window.printDocument = function() {
    if (!currentSigningStudent) return;
    
    const printContents = document.getElementById("document-print-area").innerHTML;
    
    // สร้าง div ชั่วคราวเพื่อใช้ปริ้นท์โดยเฉพาะ
    const printWrapper = document.createElement('div');
    printWrapper.className = 'print-only-wrapper';
    printWrapper.id = 'temporary-print-wrapper';
    printWrapper.innerHTML = printContents;
    
    // ยัด div ใส่ body
    document.body.appendChild(printWrapper);
    
    // สั่งปริ้นท์ (CSS จะซ่อนทุกอย่างยกเว้น .print-only-wrapper)
    window.print();
    
    // เมื่อปริ้นท์เสร็จหรือยกเลิก ลบ div ชั่วคราวทิ้ง กลับสู่สถานะปกติ
    document.body.removeChild(printWrapper);
};

function populateStatsRoomDropdown() {
    const select = document.getElementById("stats-room-select");
    
    const roomsList = [];
    students.forEach(s => {
        const key = `${s.grade}/${s.room}`;
        if (!roomsList.includes(key)) roomsList.push(key);
    });
    roomsList.sort();
    
    select.innerHTML = '<option value="ALL">ทุกระดับชั้น</option>';
    
    roomsList.forEach(r => {
        const option = document.createElement("option");
        option.value = r;
        option.innerText = `ชั้น ${r}`;
        select.appendChild(option);
    });
}

/**
 * 12. กำหนดจุดเชื่อมต่อ Event Listeners และการโหลดตั้งค่า
 */
document.addEventListener("DOMContentLoaded", () => {
    loadConfig();
    applyMetadataToUI();
    
    // จัดการเปิด/ปิด Start Menu (FAB) ทั้งบนคอมและมือถือ
    const startMenuBtn = document.getElementById("start-menu-btn");
    const mobileSidebarClose = document.getElementById("mobile-sidebar-close");
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");
    const sidebar = document.querySelector(".sidebar");
    
    const openStartMenu = () => {
        if (sidebar) sidebar.classList.add("active");
        if (startMenuBtn) startMenuBtn.classList.add("active");
        if (sidebarBackdrop) sidebarBackdrop.style.display = "block";
    };
    
    const closeStartMenu = () => {
        if (sidebar) sidebar.classList.remove("active");
        if (startMenuBtn) startMenuBtn.classList.remove("active");
        if (sidebarBackdrop) sidebarBackdrop.style.display = "none";
    };
    
    const toggleStartMenu = () => {
        if (sidebar && sidebar.classList.contains("active")) {
            closeStartMenu();
        } else {
            openStartMenu();
        }
    };
    
    if (startMenuBtn) startMenuBtn.onclick = toggleStartMenu;
    if (mobileSidebarClose) mobileSidebarClose.onclick = closeStartMenu;
    if (sidebarBackdrop) sidebarBackdrop.onclick = closeStartMenu;
    
    // สวิตซ์เมนู Sidebar
    document.getElementById("menu-home").onclick = (e) => { e.preventDefault(); switchView("home"); };
    document.getElementById("menu-stats").onclick = (e) => { e.preventDefault(); switchView("stats"); };
    document.getElementById("menu-misconduct").onclick = (e) => { e.preventDefault(); switchView("misconduct"); };
    if (document.getElementById("menu-at-risk")) {
        document.getElementById("menu-at-risk").onclick = (e) => { e.preventDefault(); switchView("at-risk"); };
    }
    
    // สวิตซ์เมนูจาก Taskbar Shortcuts ด้านล่าง
    const bindShortcut = (id, view) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = (e) => { e.preventDefault(); switchView(view); };
    };
    bindShortcut("shortcut-home", "home");
    bindShortcut("shortcut-stats", "stats");
    bindShortcut("shortcut-misconduct", "misconduct");
    bindShortcut("shortcut-at-risk", "at-risk");
    
    // สวิตซ์แท็บย่อยในหน้าสถิติ
    document.getElementById("tab-btn-accumulated").onclick = () => {
        document.getElementById("tab-btn-accumulated").classList.add("active");
        document.getElementById("tab-btn-daily").classList.remove("active");
        document.getElementById("tab-content-accumulated").classList.add("active");
        document.getElementById("tab-content-daily").classList.remove("active");
        activeStatsTab = "accumulated";
        fetchAndRenderStats();
    };
    
    document.getElementById("tab-btn-daily").onclick = () => {
        document.getElementById("tab-btn-daily").classList.add("active");
        document.getElementById("tab-btn-accumulated").classList.remove("active");
        document.getElementById("tab-content-daily").classList.add("active");
        document.getElementById("tab-content-accumulated").classList.remove("active");
        activeStatsTab = "daily";
        fetchAndRenderStats();
    };
    
    document.getElementById("stats-month-select").onchange = () => fetchAndRenderStats();
    document.getElementById("stats-room-select").onchange = () => fetchAndRenderStats();
    const statusSelect = document.getElementById("stats-status-select");
    if (statusSelect) statusSelect.onchange = () => fetchAndRenderStats();
    
    // จัดการเปลี่ยนวันที่ของปกิทินหน้าแรก
    // จัดการเปลี่ยนวันที่ของปกิทินหน้าแรก
    const homeDateInput = document.getElementById("home-date-picker");
    if (homeDateInput) {
        if (window.flatpickr) {
            flatpickr(homeDateInput, {
                locale: "th",
                dateFormat: "Y-m-d",
                defaultDate: currentCheckingDate,
                position: "auto center",
                disableMobile: true,
                onChange: function(selectedDates, dateStr, instance) {
                    currentCheckingDate = dateStr;
                    loadInitialData(); // โหลดข้อมูลสำหรับวันที่เลือกใหม่
                    
                    const checkingDatePicker = document.getElementById("checking-date-picker");
                    if (checkingDatePicker && checkingDatePicker._flatpickr) {
                        checkingDatePicker._flatpickr.setDate(currentCheckingDate);
                    }
                }
            });
            
            const homeDatePill = document.getElementById("home-date-pill");
            if (homeDatePill) {
                homeDatePill.onclick = () => {
                    homeDateInput._flatpickr.open();
                };
            }
        } else {
            homeDateInput.onchange = (e) => {
                currentCheckingDate = e.target.value;
                loadInitialData(); // โหลดข้อมูลสำหรับวันที่เลือกใหม่
            };
        }
    }
    
    const btnBackHome = document.getElementById("btn-back-home");
    if (btnBackHome) {
        btnBackHome.onclick = () => { switchView("home"); };
    }
    const shortcutBack = document.getElementById("shortcut-back");
    if (shortcutBack) {
        shortcutBack.onclick = () => { switchView("home"); };
    }
    
    document.getElementById("grade-filters").addEventListener("click", (e) => {
        if (e.target.classList.contains("pill")) {
            document.querySelectorAll("#grade-filters .pill").forEach(p => p.classList.remove("active"));
            e.target.classList.add("active");
            activeGradeFilter = e.target.getAttribute("data-grade");
            renderRooms();
        }
    });
    
    document.getElementById("btn-select-all-present").onclick = () => {
        attendanceRecords.forEach(rec => {
            rec.status = "มา";
        });
        
        const rows = document.querySelectorAll(".student-row");
        rows.forEach(row => {
            row.className = "student-row selected-present";
            const buttons = row.querySelectorAll(".status-btn");
            buttons.forEach(b => {
                if (b.getAttribute("data-status") === "มา") {
                    b.classList.add("active");
                } else {
                    b.classList.remove("active");
                }
            });
        });
        showToast("เปลี่ยนสถานะนักเรียนทั้งหมดเป็น 'มาเรียน'");
    };
    
    document.querySelectorAll("#modal-pin .key-btn").forEach(btn => {
        btn.onclick = () => {
            const key = btn.getAttribute("data-key");
            handleKeypadPress(key);
        };
    });
    
    document.getElementById("btn-save-attendance").onclick = () => {
        if (isHoliday(currentCheckingDate)) {
            showToast("วันนี้เป็นวันหยุด ไม่สามารถบันทึกเวลาเรียนได้", "error");
            return;
        }
        requestLogin("ANY", (pin, name, role) => {
            saveAttendanceToSheet(pin, name);
        });
    };
    
    const closePreviewAction = () => {
        document.getElementById("modal-preview-summary").classList.remove("active");
        switchView("home");
    };
    const btnClosePreview = document.getElementById("btn-close-preview");
    if (btnClosePreview) btnClosePreview.onclick = closePreviewAction;
    
    document.querySelectorAll(".close-modal-trigger").forEach(trigger => {
        trigger.onclick = () => {
            document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
            document.getElementById("misconduct-student-dropdown").classList.remove("active");
            authenticatedAdminPin = null; // ล้างรหัสผ่านแอดมินเมื่อปิดโมดอลเพื่อความปลอดภัย
        };
    });
    
    // ตั้งค่าสลับแท็บในโมดอลแอดมิน
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.onclick = () => {
            // ลบ active ออกจากทุกปุ่ม
            document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".admin-tab-content").forEach(c => c.classList.remove("active"));
            
            // เพิ่ม active ให้ปุ่มและเนื้อหาที่เลือก
            const tabId = btn.getAttribute("data-tab");
            btn.classList.add("active");
            document.getElementById(`admin-content-${tabId}`).classList.add("active");
            
            if (tabId === "teachers") {
                renderAdminTeachers();
            }
        };
    });
    
    // ปิดการใช้ปุ่มบันทึกการตั้งค่า เนื่องจากยึดตามไฟล์ config.js เป็นหลัก สำหรับโฮสติ้งกบบกังลิงก์ถาวร
    
    
    document.getElementById("reg-teacher-select").onchange = (e) => {
        const wrapper = document.getElementById("reg-new-teacher-wrapper");
        const codeInput = document.getElementById("reg-teacher-code");
        
        // ค้นหาข้อมูลรหัสครูที่มีอยู่เดิมมาใส่ช่องให้หากไม่ใช่ครูใหม่
        if (e.target.value === "NEW_TEACHER") {
            wrapper.classList.remove("hidden");
            if (codeInput) codeInput.value = "";
        } else {
            wrapper.classList.add("hidden");
            const selectedUser = users.find(u => u.name === e.target.value);
            if (codeInput) codeInput.value = (selectedUser && selectedUser.code) ? selectedUser.code : "";
        }
    };
    
    document.getElementById("btn-submit-registration").onclick = () => {
        handleRegisterSubmit();
    };
    
    const triggerAdminFlow = (e) => {
        if (e) e.preventDefault();
        requestLogin("ADMIN", (pinCode) => {
            authenticatedAdminPin = pinCode;
            loadHolidaysInAdmin();
            document.getElementById("modal-admin").classList.add("active");
        });
    };
    
    document.getElementById("menu-admin").onclick = triggerAdminFlow;
    if (document.getElementById("shortcut-shortcut-admin") || document.getElementById("shortcut-admin")) {
        const scAdmin = document.getElementById("shortcut-admin");
        if (scAdmin) scAdmin.onclick = triggerAdminFlow;
    }
    
    document.getElementById("btn-add-holiday").onclick = () => {
        addHoliday();
    };
    
    document.getElementById("btn-clear-attendance").onclick = () => {
        document.getElementById("modal-confirm-clear").classList.add("active");
    };
    
    document.getElementById("btn-cancel-clear-modal").onclick = () => {
        document.getElementById("modal-confirm-clear").classList.remove("active");
    };
    
    document.getElementById("btn-confirm-clear-modal").onclick = () => {
        document.getElementById("modal-confirm-clear").classList.remove("active");
        
        requestLogin("ADMIN", async (pinCode) => {
            setLoader(true);
            
            if (!config.scriptUrl) {
                showToast("ไม่สามารถทำได้เนื่องจากไม่ได้ตั้งค่า Apps Script", "error");
                setLoader(false);
                return;
            }
            
            try {
                const res = await fetch(config.scriptUrl, {
                    method: "POST",
                    body: JSON.stringify({
                        action: "clearAttendance",
                        pin: pinCode
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("ล้างประวัติเวลาเรียนทั้งหมดเรียบร้อยแล้ว");
                    document.getElementById("modal-admin").classList.remove("active");
                    await loadInitialData();
                } else {
                    showToast("ล้างข้อมูลไม่สำเร็จ: " + data.message, "error");
                }
            } catch (err) {
                showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
            } finally {
                setLoader(false);
            }
        });
    };
    
    document.getElementById("btn-open-add-misconduct").onclick = () => {
        document.getElementById("misconduct-date-input").value = getLocalDateString();
        document.getElementById("modal-add-misconduct").classList.add("active");
    };
    
    if (document.getElementById("misconduct-filter-select")) {
        document.getElementById("misconduct-filter-select").onchange = () => {
            renderMisconductTable();
        };
    }
    
    const misconductSearchInput = document.getElementById("misconduct-student-search");
    misconductSearchInput.oninput = (e) => {
        handleMisconductSearch(e.target.value);
    };
    misconductSearchInput.onfocus = (e) => {
        if (e.target.value.trim()) {
            handleMisconductSearch(e.target.value);
        }
    };
    
    document.getElementById("btn-submit-misconduct").onclick = () => {
        requestLogin("ANY", (pinCode) => {
            submitMisconduct(pinCode);
        });
    };
    
    document.addEventListener("click", (e) => {
        const container = document.querySelector(".searchable-select-container");
        if (container && !container.contains(e.target)) {
            const dropdown = document.getElementById("misconduct-student-dropdown");
            if (dropdown) dropdown.classList.remove("active");
        }
    });

    // รองรับการกดแป้นพิมพ์ตัวเลข (Physical Keyboard)
    document.addEventListener("keydown", (e) => {
        const pinModal = document.getElementById("modal-pin");
        
        if (pinModal && pinModal.classList.contains("active")) {
            if (/^[0-9]$/.test(e.key)) {
                handleKeypadPress(e.key);
            } else if (e.key === "Backspace") {
                handleKeypadPress("clear");
            } else if (e.key === "Escape") {
                handleKeypadPress("cancel");
            }
        }
    });

    updateUserSessionUI();
    loadInitialData();
});

window.updateAtRiskNoticeInTab = function() {
    const headerContainer = document.getElementById("room-dashboard-header");
    if (!headerContainer) return;
    const statsTab = headerContainer.querySelector('[data-target="room-tab-stats"]');
    if (!statsTab) return;
    
    if (typeof allStatsData !== 'undefined' && allStatsData && allStatsData.logs && typeof students !== 'undefined' && typeof selectedRoom !== 'undefined' && selectedRoom) {
        let sStats = {};
        allStatsData.logs.forEach(log => {
            if (log.room === `${selectedRoom.grade}/${selectedRoom.room}`) {
                let sid = log.studentId;
                if (!sStats[sid]) sStats[sid] = { a: 0, l: 0 };
                if (log.status === 'ขาด') sStats[sid].a++;
                if (log.status === 'สาย') sStats[sid].l++;
            }
        });
        let hasAtRisk = false;
        let roomStudents = students.filter(s => s.grade === selectedRoom.grade && s.room === selectedRoom.room);
        for (let i = 0; i < roomStudents.length; i++) {
            let sid = roomStudents[i].studentId;
            if (sStats[sid] && (sStats[sid].a >= 3 || sStats[sid].l >= 3)) {
                hasAtRisk = true;
                break;
            }
        }
        
        let atRiskNotice = hasAtRisk ? ` <span style="color: var(--color-absent); font-weight: bold; font-size: 10px; letter-spacing: -0.3px;">(ติดตาม⚠️)</span>` : '';
        statsTab.innerHTML = `สรุป${atRiskNotice}`;
    }
};

// ==========================================
// Glassmorphism Tooltip Functions
// ==========================================
function showSummaryTooltip(titleHtml, items, cardElement) {
    const modal = document.getElementById("summary-folder-modal");
    const titleContainer = document.getElementById("summary-folder-title");
    const list = document.getElementById("summary-folder-list");
    
    // Clear previous title
    titleContainer.innerHTML = "";
    
    // Clone the clicked card to act as the header!
    if (cardElement) {
        const clonedCard = cardElement.cloneNode(true);
        // Remove IDs to avoid duplicates in DOM
        clonedCard.removeAttribute("id");
        clonedCard.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
        // Remove active state classes
        clonedCard.classList.remove("active-card");
        clonedCard.dataset.locked = "false";
        
        titleContainer.appendChild(clonedCard);
    } else {
        // Fallback just in case
        titleContainer.innerHTML = `<h4 style="margin:0;font-size:18px;color:#1e293b;">${titleHtml}</h4>`;
    }
    
    list.innerHTML = "";
    
    list.className = "folder-modal-list";
    
    const createPill = (r) => {
        const pill = document.createElement("div");
        pill.className = "unchecked-room-pill";
        if (typeof r === 'object') {
            pill.innerHTML = r.text;
            if (r.color) pill.style.color = r.color;
            if (r.action) {
                pill.classList.add("clickable-pill");
                pill.onclick = (e) => {
                    e.stopPropagation();
                    hideSummaryTooltip();
                    document.querySelectorAll(".summary-card").forEach(c => {
                        c.dataset.locked = "false";
                        c.classList.remove("active-card");
                    });
                    r.action();
                };
            }
        } else {
            pill.innerText = r;
        }
        return pill;
    };

    if (items.type === "two-columns") {
        list.classList.add("two-cols");
        
        const col1 = document.createElement("div");
        col1.className = "tooltip-col";
        col1.innerHTML = `<div class="tooltip-col-title">${items.col1.title}</div>`;
        if (items.col1.items.length === 0) col1.innerHTML += `<div class="empty-col">ไม่มีข้อมูล</div>`;
        else items.col1.items.forEach(r => col1.appendChild(createPill(r)));
        
        const col2 = document.createElement("div");
        col2.className = "tooltip-col";
        col2.innerHTML = `<div class="tooltip-col-title">${items.col2.title}</div>`;
        if (items.col2.items.length === 0) col2.innerHTML += `<div class="empty-col">ไม่มีข้อมูล</div>`;
        else items.col2.items.forEach(r => col2.appendChild(createPill(r)));
        
        list.appendChild(col1);
        list.appendChild(col2);
    } else if (items.length === 0) {
        list.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 10px 0;">ไม่มีข้อมูล</div>`;
    } else {
        items.forEach(r => list.appendChild(createPill(r)));
    }
    
    modal.classList.add("show");
    document.body.style.overflow = "hidden"; // Lock background scroll
}

function hideSummaryTooltip() {
    const modal = document.getElementById("summary-folder-modal");
    if (modal) {
        modal.classList.remove("show");
        document.body.style.overflow = ""; // Restore background scroll
    }
}

window.renderRoomSpecificStats = function() {
    const tbody = document.getElementById('room-stats-tbody');
    if (!tbody) return;
    if (!allStatsData || !allStatsData.logs) {
        tbody.innerHTML = '<tr><td colspan="8" class="txt-center">กำลังโหลดข้อมูล...</td></tr>';
        fetchAndRenderStats().then(() => {
            if(document.getElementById('room-tab-stats').style.display !== 'none') renderRoomSpecificStats();
        });
        return;
    }
    
    // Get month filter
    const monthPicker = document.getElementById('room-stats-month-picker');
    let selectedMonth = monthPicker ? monthPicker.value : ''; // format YYYY-MM
    if (!selectedMonth) {
        const today = new Date();
        selectedMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
        if (monthPicker) monthPicker.value = selectedMonth;
    }
    
    const dateDisplay = document.getElementById('room-stats-date-display');
    if (dateDisplay) {
        const [yyyy, mm] = selectedMonth.split('-');
        const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        dateDisplay.innerText = thaiMonths[parseInt(mm)-1] + ' ' + (parseInt(yyyy) + 543);
    }
    
    // Bind click to open date picker
    const datePill = document.getElementById('room-stats-date-pill');
    if (datePill && !datePill.dataset.bound) {
        datePill.dataset.bound = 'true';
        datePill.onclick = () => { monthPicker.showPicker ? monthPicker.showPicker() : monthPicker.focus(); };
        monthPicker.onchange = () => { renderRoomSpecificStats(); };
    }
    
    const logs = allStatsData.logs;
    let summaryData = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: 0 };
    let studentStats = {};
    
    logs.forEach(log => {
        if (log.room === `${selectedRoom.grade}/${selectedRoom.room}`) {
            // Check month match
            if (log.date && log.date.startsWith(selectedMonth)) {
                let st = log.status;
                let sid = log.studentId;
                if (!studentStats[sid]) {
                    studentStats[sid] = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: 0 };
                }
                if (st === 'มา') { studentStats[sid].Present++; summaryData.Present++; }
                if (st === 'ลา') { studentStats[sid].Leave++; summaryData.Leave++; }
                if (st === 'ขาด') { studentStats[sid].Absent++; summaryData.Absent++; }
                if (st === 'สาย') { studentStats[sid].Late++; summaryData.Late++; }
                if (st === 'โดด') { studentStats[sid].Cut++; summaryData.Cut++; }
                studentStats[sid].Total++;
                summaryData.Total++;
            }
        }
    });
    
    let roomStudents = students.filter(s => s.grade === selectedRoom.grade && s.room === selectedRoom.room);
    
    const summaryContainer = document.getElementById('room-tab-stats-summary');
    if (summaryContainer) {
        const atRiskStudents = [];
        roomStudents.forEach(st => {
            let sid = st.studentId;
            let a = studentStats[sid] ? studentStats[sid].Absent : 0;
            let s = studentStats[sid] ? studentStats[sid].Late : 0;
            if (a >= 3 || s >= 3) {
                atRiskStudents.push({ ...st, absent: a, late: s });
            }
        });

        if (atRiskStudents.length === 0) {
            summaryContainer.innerHTML = `
                <div style="width: 100%; background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(8px); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 16px; padding: 20px; text-align: center; color: var(--color-present); margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                    <i class="fa-solid fa-circle-check" style="font-size: 28px; margin-bottom: 10px;"></i>
                    <p style="margin: 0; font-weight: bold; font-size: 16px;">ไม่มีนักเรียนขาดหรือสายเกินเกณฑ์</p>
                </div>
            `;
        } else {
            let pillsHtml = atRiskStudents.map(st => {
                let badge = '';
                if (st.absent >= 3) badge = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 6px; font-size: 11px; margin-left: 5px; font-weight: bold;">ขาด ${st.absent}</span>`;
                else if (st.late >= 3) badge = `<span style="background: #ffedd5; color: #c2410c; padding: 2px 6px; border-radius: 6px; font-size: 11px; margin-left: 5px; font-weight: bold;">สาย ${st.late}</span>`;
                return `<div onclick="if(typeof jumpToTracking === 'function') jumpToTracking('${selectedRoom.grade}/${selectedRoom.room}');" style="background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 6px 14px; font-size: 13px; display: inline-flex; align-items: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: all 0.2s;">
                    <i class="fa-solid fa-user" style="color: #64748b; margin-right: 6px;"></i> ${st.fullName} ${badge}
                </div>`;
            }).join('');
            
            summaryContainer.innerHTML = `
                <div style="width: 100%; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(8px); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 15px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.05);">
                    <div style="display: flex; align-items: center; margin-bottom: 12px; color: #b91c1c;">
                        <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px; font-size: 16px;"></i>
                        <strong style="font-size: 15px;">นักเรียนที่ขาดหรือสายเกินเกณฑ์ (คลิกชื่อเพื่อติดตาม)</strong>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${pillsHtml}
                    </div>
                </div>
            `;
        }
    }
    
    if (roomStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="txt-center">ไม่มีข้อมูลนักเรียน</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    roomStudents.forEach(st => {
        let sid = st.studentId;
        let p = studentStats[sid] ? studentStats[sid].Present : 0;
        let l = studentStats[sid] ? studentStats[sid].Leave : 0;
        let a = studentStats[sid] ? studentStats[sid].Absent : 0;
        let s = studentStats[sid] ? studentStats[sid].Late : 0;
        let c = studentStats[sid] ? studentStats[sid].Cut : 0;
        let t = studentStats[sid] ? studentStats[sid].Total : 0;
        
        let isAtRisk = (a >= 3 || s >= 3);
        let nameIcon = isAtRisk ? '<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-right: 6px;"></i>' : '';
        
        let totalPresent = p + s + c;
        let percent = t > 0 ? Math.round((totalPresent / t) * 100) : 0;
        let percentColor = percent >= 80 ? 'var(--color-present)' : (percent >= 60 ? 'var(--color-late)' : 'var(--color-absent)');

        let row = document.createElement('tr');
        if (isAtRisk) {
            row.style.backgroundColor = '#fef2f2';
            row.style.cursor = 'pointer';
            row.title = 'คลิกเพื่อติดตามนักเรียน';
            row.onclick = () => { if(typeof jumpToTracking === 'function') jumpToTracking(`${selectedRoom.grade}/${selectedRoom.room}`); };
            
            let td1 = `<td class="txt-center" style="border-left: 4px solid #ef4444; vertical-align: middle;">${st.no}</td>`;
            row.innerHTML = `
                ${td1}
                <td style="padding: 10px 15px;">
                    <div style="color: #b91c1c; font-weight: 500; margin-bottom: 6px;">${nameIcon}${st.fullName}</div>
                    <div class="mobile-only-flex" style="gap: 12px; font-size: 12px; font-weight: 600;">
                        <span style="color:var(--color-present);">ม.${p}</span>
                        <span style="color:var(--color-leave);">ล.${l}</span>
                        <span style="color:var(--color-absent);">ข.${a}</span>
                        <span style="color:var(--color-late);">ส.${s}</span>
                        <span style="color:var(--color-cut);">ด.${c}</span>
                    </div>
                </td>
                <td class="txt-center desktop-only" style="color:var(--color-present); vertical-align: middle;">${p}</td>
                <td class="txt-center desktop-only" style="color:var(--color-leave); vertical-align: middle;">${l}</td>
                <td class="txt-center desktop-only" style="color:var(--color-absent); vertical-align: middle;">${a}</td>
                <td class="txt-center desktop-only" style="color:var(--color-late); vertical-align: middle;">${s}</td>
                <td class="txt-center desktop-only" style="color:var(--color-cut); vertical-align: middle;">${c}</td>
                <td class="txt-center fw-bold" style="vertical-align: middle; color: ${percentColor};">${percent}%</td>
            `;
        } else {
            row.innerHTML = `
                <td class="txt-center" style="vertical-align: middle;">${st.no}</td>
                <td style="padding: 10px 15px;">
                    <div style="font-weight: 500; margin-bottom: 6px;">${st.fullName}</div>
                    <div class="mobile-only-flex" style="gap: 12px; font-size: 12px; font-weight: 600;">
                        <span style="color:var(--color-present);">ม.${p}</span>
                        <span style="color:var(--color-leave);">ล.${l}</span>
                        <span style="color:var(--color-absent);">ข.${a}</span>
                        <span style="color:var(--color-late);">ส.${s}</span>
                        <span style="color:var(--color-cut);">ด.${c}</span>
                    </div>
                </td>
                <td class="txt-center desktop-only" style="color:var(--color-present); vertical-align: middle;">${p}</td>
                <td class="txt-center desktop-only" style="color:var(--color-leave); vertical-align: middle;">${l}</td>
                <td class="txt-center desktop-only" style="color:var(--color-absent); vertical-align: middle;">${a}</td>
                <td class="txt-center desktop-only" style="color:var(--color-late); vertical-align: middle;">${s}</td>
                <td class="txt-center desktop-only" style="color:var(--color-cut); vertical-align: middle;">${c}</td>
                <td class="txt-center fw-bold" style="vertical-align: middle; color: ${percentColor};">${percent}%</td>
            `;
        }
        tbody.appendChild(row);
    });
};


function renderRoomSpecificSchedule() {
    const table = document.getElementById('room-daily-grid-table');
    if (!table) return;
    
    if (!allStatsData || !allStatsData.logs || !allStatsData.dates) {
        table.innerHTML = '<tr><td style="padding: 30px; text-align: center; color: var(--text-muted);">กำลังโหลดข้อมูล...</td></tr>';
        if (typeof fetchStatsDataOnce === 'function') {
            fetchStatsDataOnce().then(() => {
                if(document.getElementById('room-tab-schedule').style.display !== 'none') renderRoomSpecificSchedule();
            });
        }
        return;
    }
    
    const targetRoom = `${selectedRoom.grade}/${selectedRoom.room}`;
    
    table.innerHTML = "";
    const sortedDates = allStatsData.dates.sort();
    
    let roomStudents = students.filter(s => `${s.grade}/${s.room}` === targetRoom).sort((a,b) => a.no - b.no);
    
    if (roomStudents.length === 0) {
        table.innerHTML = '<tr><td style="padding: 30px; color: var(--text-muted);">ไม่มีรายชื่อนักเรียนในห้องนี้</td></tr>';
        return;
    }
    
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    
    let headerHtml = `<tr>
        <th class="col-student-name">เลขที่ / รายชื่อนักเรียน</th>
    `;
    sortedDates.forEach(date => {
        const parts = date.split("-");
        const y = parseInt(parts[0], 10) + 543;
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const displayDate = `${d}<br>${thaiMonths[m]}<br>${y.toString().substring(2)}`;
        headerHtml += `<th style="text-align: center; vertical-align: middle; line-height: 1.2; font-size: 11px;">${displayDate}</th>`;
    });
    headerHtml += "</tr>";
    
    const logsLookup = {};
    if (allStatsData && allStatsData.logs) {
        allStatsData.logs.forEach(log => {
            logsLookup[`${log.studentId}_${log.date}`] = log.status;
        });
    }
    
    let bodyHtml = "";
    roomStudents.forEach(s => {
        bodyHtml += `<tr>
            <td class="col-student-name">${s.no}. ${s.fullName}</td>
        `;
        
        sortedDates.forEach(date => {
            const status = logsLookup[`${s.studentId}_${date}`] || "";
            let statusChar = "";
            let classStyle = "";
            
            if (status) {
                if (status === "มา") { statusChar = "ม"; classStyle = "status-present"; }
                else if (status === "ลา") { statusChar = "ล"; classStyle = "status-leave"; }
                else if (status === "ขาด") { statusChar = "ข"; classStyle = "status-absent"; }
                else if (status === "สาย") { statusChar = "ส"; classStyle = "status-late"; }
                else if (status === "โดด") { statusChar = "ด"; classStyle = "status-cut"; }
            } else {
                statusChar = "-";
                classStyle = "status-none";
            }
            bodyHtml += `<td class="txt-center ${classStyle}">${statusChar}</td>`;
        });
        
        bodyHtml += `</tr>`;
    });
    
    table.innerHTML = headerHtml + bodyHtml;
}