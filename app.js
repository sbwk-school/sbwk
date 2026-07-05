/**
 * Frontend JavaScript - ระบบเช็คชื่อนักเรียนออนไลน์
 * จัดการตรรกะหน้าจอและการเชื่อมต่อกับ Google Apps Script Web App
 */

// ค่ากำหนดตั้งค่าเริ่มต้น
const CONFIG_KEY = "school_attendance_config";
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1TY5QNusQpKayPX8MZXFvUcx--bae7B5Wty38FfzbW90/edit?usp=sharing";

let config = {
    sheetUrl: DEFAULT_SHEET_URL,
    scriptUrl: ""
};

// สถานะการทำงานของระบบ (Global State)
let students = [];       // รายชื่อนักเรียนทั้งหมด
let rooms = [];          // ห้องเรียนทั้งหมดแยกเป็นกลุ่ม
let holidays = [];       // รายการวันหยุด
let users = [];          // รายชื่อครู
let todayLogs = {};      // บันทึกเช็คชื่อของวันนี้แยกตามห้อง (ภาพรวม)
let todayLogsDetails = {}; // บันทึกเช็คชื่อของวันนี้แยกรายคนเพื่อใช้คงสถานะ: { studentId: status }
let currentView = "home";
let activeGradeFilter = "ALL";
let activeStatsTab = "accumulated";
let currentCheckingDate = getLocalDateString(); // วันที่กำลังดำเนินการเช็คชื่อ (ปรับเปลี่ยนผ่านปฏิทินหน้าแรกได้)
let allStatsData = null; // โหลดสถิติทั้งหมดมาเก็บไว้ในแรมครั้งเดียวตอนเริ่มต้น

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
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
        try {
            config = JSON.parse(saved);
            
            // นำค่าที่บันทึกไว้ไปแสดงในช่องกรอกของหน้าแอดมิน เพื่อไม่ให้ช่องว่างเปล่า
            const sheetInput = document.getElementById("config-sheet-url");
            const scriptInput = document.getElementById("config-script-url");
            if (sheetInput) sheetInput.value = config.sheetUrl || "";
            if (scriptInput) scriptInput.value = config.scriptUrl || "";
            
        } catch (e) {
            console.error("โหลดตั้งค่าผิดพลาด", e);
        }
    }
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
 * แปลงข้อความ CSV เป็นอาเรย์ (กรณี Fallback)
 */
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cells = line.split(',');
        if (cells.length < 9) continue;
        
        result.push({
            no: parseInt(cells[0]) || 0,
            studentId: cells[1].trim(),
            grade: cells[2].trim(),
            room: cells[3].trim(),
            gender: cells[4].trim(), // "1" = ชาย, "2" = หญิง
            prefix: cells[5].trim(),
            firstName: cells[6].trim(),
            lastName: cells[7].trim(),
            fullName: cells[8].trim()
        });
    }
    return result;
}

/**
 * 1. โหลดข้อมูลเริ่มต้นทั้งหมด
 */
async function loadInitialData() {
    setLoader(true);
    
    // หากมีการกำหนดลิงก์ Apps Script ให้โหลดข้อมูลรวมถึงรายชื่อนักเรียนและข้อมูลการเช็คชื่อของวันนี้ในคราวเดียว เพื่อเลี่ยงปัญหา CORS
    if (config.scriptUrl) {
        try {
            const res = await fetch(`${config.scriptUrl}?action=init&date=${currentCheckingDate}`);
            const data = await res.json();
            
            if (data.success) {
                students = data.students || [];
                holidays = data.holidays || [];
                users = data.users || [];
                todayLogs = data.todayLogs || {};
                todayLogsDetails = data.todayLogsDetails || {}; // เก็บผลการเช็คชื่อรายบุคคลของวันนี้เพื่อคงสถานะ
                
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
    
    // โหลดประวัติสถิติทั้งหมดมาเก็บในหน่วยความจำตั้งแต่ต้นแบบเบื้องหลัง (Async)
    if (config.scriptUrl && !allStatsData) {
        fetchStatsDataOnce();
    }
    
    // เริ่มต้นแสดงผลหน้าแรก
    updateHeaderDate();
    checkTodayHoliday();
    renderRooms();
    calculateOverallStats();
    
    setLoader(false);
}

async function fetchStatsDataOnce() {
    if (!config.scriptUrl) return;
    try {
        const res = await fetch(`${config.scriptUrl}?action=getStats&month=ALL&room=ALL`);
        const data = await res.json();
        if (data.success) {
            allStatsData = data.stats;
        }
    } catch (e) {
        console.error("โหลดสถิติเริ่มต้นล้มเหลว", e);
    }
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
    const days = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    
    const parts = currentCheckingDate.split("-");
    const now = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    
    const dayName = days[now.getDay()];
    const dateNum = now.getDate();
    const monthName = months[now.getMonth()];
    const yearNum = now.getFullYear() + 543; // แปลงเป็น พ.ศ.
    
    const displayStr = `ประจำ${dayName}ที่ ${dateNum} ${monthName} พ.ศ. ${yearNum}`;
    document.getElementById("home-date-display").innerText = displayStr;
    
    const attDateDisplay = document.getElementById("attendance-date-display");
    if (attDateDisplay) {
        attDateDisplay.innerText = displayStr;
    }
    
    // อัปเดตค่าปฏิทิน input type="date" ด้วย
    const homeDatePicker = document.getElementById("home-date-picker");
    if (homeDatePicker) {
        homeDatePicker.value = currentCheckingDate;
    }
}

// ตรวจสอบวันหยุดตามวันที่เลือกจริง
function checkTodayHoliday() {
    const todayStr = currentCheckingDate;
    const badgeHome = document.getElementById("holiday-status-badge");
    const badgeCheck = document.getElementById("attendance-holiday-badge");
    
    const parts = currentCheckingDate.split("-");
    const now = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const dayOfWeek = now.getDay();
    
    let text = "";
    let cls = "";
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        text = "วันหยุด (เสาร์-อาทิตย์)";
        cls = "badge holiday";
    } else {
        const customHoliday = holidays.find(h => h.date === todayStr);
        if (customHoliday) {
            text = `วันหยุด (${customHoliday.name})`;
            cls = "badge holiday";
        } else {
            text = "เปิดเรียนปกติ";
            cls = "badge workday";
        }
    }
    
    if (badgeHome) {
        badgeHome.innerText = text;
        badgeHome.className = cls;
    }
    if (badgeCheck) {
        badgeCheck.innerText = text;
        badgeCheck.className = cls;
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

// คำนวณเปอร์เซ็นต์รวมของเด็กทั้งโรงเรียนในวันนั้น (5 กริด) - ปรับแแสดงเปอร์เซ็นต์เป็นตัวใหญ่ จำนวนคนเป็นตัวเล็ก
function calculateOverallStats() {
    let totalPresent = 0;
    let totalLeave = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalCut = 0;
    let grandTotal = 0;
    
    Object.values(todayLogs).forEach(summary => {
        totalPresent += summary.Present || 0;
        totalLeave += summary.Leave || 0;
        totalAbsent += summary.Absent || 0;
        totalLate += summary.Late || 0;
        totalCut += summary.Cut || 0;
        grandTotal += summary.Total || 0;
    });
    
    const getPct = (val) => grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) + "%" : "0.0%";
    
    document.getElementById("total-present").innerText = totalPresent + " คน";
    document.getElementById("pct-present").innerText = getPct(totalPresent);
    
    document.getElementById("total-leave").innerText = totalLeave + " คน";
    document.getElementById("pct-leave").innerText = getPct(totalLeave);
    
    document.getElementById("total-absent").innerText = totalAbsent + " คน";
    document.getElementById("pct-absent").innerText = getPct(totalAbsent);
    
    document.getElementById("total-late").innerText = totalLate + " คน";
    document.getElementById("pct-late").innerText = getPct(totalLate);
    
    document.getElementById("total-cut").innerText = totalCut + " คน";
    document.getElementById("pct-cut").innerText = getPct(totalCut);
}

/**
 * 2. แสดงกริดห้องเรียน (Home View)
 */
function renderRooms() {
    const container = document.getElementById("rooms-list-container");
    container.innerHTML = "";
    
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

    document.querySelectorAll('#grade-filters .pill').forEach(pill => {
        const grade = pill.getAttribute('data-grade');
        if (grade !== 'ALL' && gradeStats[grade]) {
            if (gradeStats[grade].checked === gradeStats[grade].total && gradeStats[grade].total > 0) {
                pill.style.backgroundColor = 'var(--color-present)';
                pill.style.color = '#fff';
                pill.innerHTML = `<i class="fa-solid fa-check"></i> ${grade}`;
            } else {
                pill.style.backgroundColor = '';
                pill.style.color = '';
                pill.innerHTML = grade;
            }
        }
    });
    
    sortedRoomKeys.forEach(key => {
        const roomInfo = roomsMap[key];
        
        if (activeGradeFilter !== "ALL" && roomInfo.grade !== activeGradeFilter) {
            return;
        }
        
        const summary = todayLogs[key];
        const isChecked = !!summary;
        
        const card = document.createElement("div");
        card.className = "room-card";
        if (isChecked) {
            card.style.backgroundColor = "#e0f2f1"; // สีเขียวอ่อนเต็มการ์ด
            card.style.border = "1px solid var(--color-present)";
        }
        card.onclick = () => openAttendanceCheck(roomInfo.grade, roomInfo.room);
        
        let presentPctText = "ยังไม่ได้บันทึก";
        if (isChecked && summary.Total > 0) {
            presentPctText = "มาเรียน " + ((summary.Present / summary.Total) * 100).toFixed(0) + "%";
        }
        
        card.innerHTML = `
            <div class="room-card-header">
                <div class="room-name">
                    <h3>ชั้น ${roomInfo.grade} ห้อง ${roomInfo.room}</h3>
                    <span>นักเรียนทั้งหมด ${roomInfo.totalCount} คน</span>
                </div>
                <div class="check-status-badge ${isChecked ? 'checked' : 'unchecked'}">
                    ${isChecked ? 'เช็คแล้ว' : 'ยังไม่เช็ค'}
                </div>
            </div>
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--text-muted);">
                ${presentPctText}
            </div>
            <div class="room-mini-stats">
                <div class="mini-stat-item">
                    <span class="mini-stat-label">มา</span>
                    <span class="mini-stat-val m">${isChecked ? summary.Present : '-'}</span>
                </div>
                <div class="mini-stat-item">
                    <span class="mini-stat-label">ลา</span>
                    <span class="mini-stat-val l">${isChecked ? summary.Leave : '-'}</span>
                </div>
                <div class="mini-stat-item">
                    <span class="mini-stat-label">ขาด</span>
                    <span class="mini-stat-val x">${isChecked ? summary.Absent : '-'}</span>
                </div>
                <div class="mini-stat-item">
                    <span class="mini-stat-label">สาย</span>
                    <span class="mini-stat-val s">${isChecked ? summary.Late : '-'}</span>
                </div>
                <div class="mini-stat-item">
                    <span class="mini-stat-label">โดด</span>
                    <span class="mini-stat-val d">${isChecked ? summary.Cut : '-'}</span>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

/**
 * 3. หน้าลงเช็คชื่อรายห้อง (Check-in View) - มีการดึงประวัติมาแสดงคงสถานะเดิม
 */
function openAttendanceCheck(grade, room) {
    selectedRoom = { grade, room };
    document.getElementById("attendance-title").innerText = `เช็คชื่อชั้น ${grade} ห้อง ${room}`;
    
    // ตั้งค่า Date Picker ภายในหน้าเช็คชื่อ (ปฏิทินที่เหมือนหน้าแรก)
    const checkingDatePicker = document.getElementById("checking-date-picker");
    if (checkingDatePicker) {
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
                        calculateOverallStats(); // Sync home dashboard
                        renderRooms(); // Sync home dashboard
                        openAttendanceCheck(grade, room);
                    }
                })
                .finally(() => setLoader(false));
        };
    }

    const roomKey = `${grade}/${room}`;
    const isChecked = !!todayLogs[roomKey];
    
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
 * 4. หน้าสรุปพรีวิวการเช็คชื่อแบบ 2 คอลัมน์ (ชาย/หญิง) - ปรับแก้การเรนเดอร์สีสถานะให้ตรงสี
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
    
    const today = new Date();
    document.getElementById("preview-date-text").innerText = `ประจำวันที่ ${today.toLocaleDateString('th-TH', { dateStyle: 'long' })}`;
    
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
                    showToast("ไม่สามารถดาวน์โหลดรูปอัตโนมัติได้ (อาจติดปัญหาเปิดจากไฟล์คอมพิวเตอร์โดยตรง กรุณานำขึ้นโฮสติ้งจริง)", "error");
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
    
    // Master Bypass: ถ้าระบบยังไม่เชื่อมต่อฐานข้อมูล หรือยังไม่มีผู้ใช้ ให้ใช้รหัส 9999 เข้าแอดมินได้
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
        
        // สำคัญ: บันทึกสถานะรายบุคคลลง todayLogsDetails ทันทีเพื่อให้ค้างสถานะเวลาเปิดใหม่
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
            status: r.status
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
        console.error("เชื่อมต่อฐานข้อมูลเบื้องหลังล้มเหลว", e);
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
    
    if (activeStatsTab === "accumulated") {
        renderAccumulatedStats(filteredLogs, selectedRoom);
    } else {
        renderDailyGridStats(filteredLogs, filteredDates, selectedRoom);
    }
}

function updateMonthDropdown(monthsList, currentValue) {
    const select = document.getElementById("stats-month-select");
    select.innerHTML = '<option value="ALL">รวมทั้งหมด</option>';
    
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
    
    const showP = document.getElementById("chk-filter-present").checked;
    const showL = document.getElementById("chk-filter-leave").checked;
    const showA = document.getElementById("chk-filter-absent").checked;
    const showLa = document.getElementById("chk-filter-late").checked;
    const showC = document.getElementById("chk-filter-cut").checked;
    
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
        
        if (showP && item.Present > 0) shouldShow = true;
        if (showL && item.Leave > 0) shouldShow = true;
        if (showA && item.Absent > 0) shouldShow = true;
        if (showLa && item.Late > 0) shouldShow = true;
        if (showC && item.Cut > 0) shouldShow = true;
        
        const totalEvents = item.Present + item.Leave + item.Absent + item.Late + item.Cut;
        if (totalEvents === 0) {
            shouldShow = showP;
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
            <td>${renderedCount}</td>
            <td class="col-id">${id}</td>
            <td><strong>${item.name}</strong></td>
            <td>${item.room}</td>
            <td class="txt-center" style="color: var(--color-present); font-weight: 600;">${item.Present}</td>
            <td class="txt-center" style="color: var(--color-leave); font-weight: 600;">${item.Leave}</td>
            <td class="txt-center" style="color: var(--color-absent); font-weight: 600;">${item.Absent}</td>
            <td class="txt-center" style="color: var(--color-late); font-weight: 600;">${item.Late}</td>
            <td class="txt-center" style="color: var(--color-cut); font-weight: 600;">${item.Cut}</td>
            <td class="txt-center"><strong style="color: ${percent >= 80 ? 'var(--color-present)' : (percent >= 60 ? 'var(--color-late)' : 'var(--color-absent)')};">${percent}%</strong></td>
        `;
        tbody.appendChild(tr);
    });
    
    if (renderedCount === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="txt-center" style="color: var(--text-muted); padding: 30px;">ไม่พบข้อมูลสถิตินักเรียนตามเงื่อนไขที่ติ๊กเลือก</td></tr>';
    }
}

function renderDailyGridStats(logs, datesList, targetRoom) {
    const table = document.getElementById("stats-daily-grid-table");
    table.innerHTML = "";
    
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
        <th class="col-student-name">เลขที่ / รายชื่อนักเรียน</th>
    `;
    sortedDates.forEach(date => {
        const parts = date.split("-");
        const displayDate = `${parts[2]}/${parts[1]}`;
        headerHtml += `<th>${displayDate}</th>`;
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
                <button class="btn-toggle-resolve" data-id="${item.id}" style="background: none; border: none; cursor: pointer; color: ${item.resolved ? 'var(--color-success)' : '#cbd5e1'}; font-size: 24px; padding: 0; display: flex; align-items: center; justify-content: center; margin: 0 auto; transition: 0.2s;">
                    <i class="fa-${item.resolved ? 'solid fa-square-check' : 'regular fa-square'}"></i>
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
            const id = btnToggle.getAttribute("data-id");
            const newStatus = !item.resolved;
            
            let resolutionText = "";
            
            if (newStatus) {
                resolutionText = prompt("กรุณาระบุรายละเอียดการแก้ไข (เช่น บำเพ็ญประโยชน์):");
                if (!resolutionText) return; // กดยกเลิก หรือไม่พิมพ์อะไร
            } else {
                const confirmCancel = confirm("แน่ใจหรือไม่ว่าต้องการยกเลิกสถานะการแก้ไข?");
                if (!confirmCancel) return;
            }
            
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
                    }
                } catch (err) {
                    showToast("ไม่สามารถอัปเดตสถานะความประพฤติได้", "error");
                    // Revert on fail
                    item.resolved = !newStatus;
                    renderMisconductTable();
                }
            });
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
            option.innerText = `${u.name} ${u.code ? '(' + u.code + ')' : ''} ${u.hasPin ? '[ตั้งรหัสแล้ว]' : '[ยังไม่มี PIN]'}`;
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
            <td><span style="font-family: monospace; letter-spacing: 2px; color: var(--primary); font-weight: 600;">${u.pin || "-"}</span></td>
            <td>${roleSelectHtml}</td>
            <td class="txt-center">
                <button class="delete-btn btn-delete-teacher" data-name="${u.name}" title="ลบครูผู้ใช้" ${isSelfAdmin ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        
        // เมื่อมีการเปลี่ยนบทบาท จะแค่โชว์ข้อความเตือนให้กดบันทึก
        const select = tr.querySelector(".admin-role-select");
        select.onchange = (e) => {
            document.getElementById("admin-teacher-unsaved-msg").style.display = "inline-block";
        };
        
        // จัดการลบบัญชีครู
        const delBtn = tr.querySelector(".btn-delete-teacher");
        if (delBtn && !isSelfAdmin) {
            delBtn.onclick = async () => {
                if (!confirm(`คุณต้องการลบบัญชีผู้ใช้ของครู ${u.name} ใช่หรือไม่?`)) return;
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
                        showToast(`ลบบัญชีผู้ใช้ของ ${u.name} สำเร็จ`);
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
    selects.forEach(sel => {
        updates.push({
            name: sel.getAttribute("data-name"),
            role: sel.value
        });
    });
    
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
            showToast("บันทึกข้อมูลครูทั้งหมดสำเร็จ");
            document.getElementById("admin-teacher-unsaved-msg").style.display = "none";
            // อัปเดตในหน่วยความจำ
            updates.forEach(u => {
                const userObj = users.find(usr => usr.name === u.name);
                if (userObj) userObj.role = u.role;
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
        
        const parts = h.date.split("-");
        const thDateDisplay = `${parts[2]}/${parts[1]}/${parseInt(parts[0]) + 543}`;
        
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
        showToast("การเชื่อมต่อฐานข้อมูลมีปัญหา", "error");
    } finally {
        setLoader(false);
    }
}

/**
 * 11. ฟังก์ชันสลับการแสดงผลหน้าเว็บ (SPA View Switcher)
 */
function switchView(viewName) {
    currentView = viewName;
    
    document.querySelectorAll(".menu-item").forEach(item => {
        item.classList.remove("active");
    });
    
    document.querySelectorAll(".content-view").forEach(view => {
        view.classList.remove("active");
    });
    
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
    } else if (viewName === "attendance-check") {
        document.getElementById("view-attendance-check").classList.add("active");
    }
}

function populateStatsRoomDropdown() {
    const select = document.getElementById("stats-room-select");
    
    const roomsList = [];
    students.forEach(s => {
        const key = `${s.grade}/${s.room}`;
        if (!roomsList.includes(key)) roomsList.push(key);
    });
    roomsList.sort();
    
    select.innerHTML = '<option value="ALL">ทุกห้องเรียน</option>';
    
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
    
    // สวิตซ์เมนู Sidebar
    document.getElementById("menu-home").onclick = (e) => { e.preventDefault(); switchView("home"); };
    document.getElementById("menu-stats").onclick = (e) => { e.preventDefault(); switchView("stats"); };
    document.getElementById("menu-misconduct").onclick = (e) => { e.preventDefault(); switchView("misconduct"); };
    
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
    document.getElementById("chk-filter-present").onchange = () => fetchAndRenderStats();
    document.getElementById("chk-filter-leave").onchange = () => fetchAndRenderStats();
    document.getElementById("chk-filter-absent").onchange = () => fetchAndRenderStats();
    document.getElementById("chk-filter-late").onchange = () => fetchAndRenderStats();
    document.getElementById("chk-filter-cut").onchange = () => fetchAndRenderStats();
    
    // จัดการเปลี่ยนวันที่ของปฏิทินหน้าแรก
    document.getElementById("home-date-picker").onchange = (e) => {
        currentCheckingDate = e.target.value;
        loadInitialData(); // โหลดข้อมูลสำหรับวันที่เลือกใหม่
    };
    
    document.getElementById("btn-back-home").onclick = () => {
        switchView("home");
    };
    
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
    
    document.querySelectorAll(".key-btn").forEach(btn => {
        btn.onclick = () => {
            const key = btn.getAttribute("data-key");
            handleKeypadPress(key);
        };
    });
    
    document.getElementById("btn-save-attendance").onclick = () => {
        if (isHoliday(currentCheckingDate)) {
            showToast("วันนี้เป็นวันหยุด ไม่สามารถบันทึกเวลาเรียนได้", "error");
            alert("วันนี้เป็นวันหยุด ไม่สามารถบันทึกเวลาเรียนได้");
            return;
        }
        openPinModal("ป้อนรหัส PIN ครูผู้บันทึก", "ANY", (pinCode, teacherName) => {
            saveAttendanceToSheet(pinCode, teacherName);
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
    
    document.getElementById("btn-save-config").onclick = () => {
        const sheet = document.getElementById("config-sheet-url").value.trim();
        const script = document.getElementById("config-script-url").value.trim();
        
        if (!sheet) {
            showToast("กรุณาระบุ URL ของ Google Sheet", "error");
            return;
        }
        
        config.sheetUrl = sheet;
        config.scriptUrl = script;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        
        document.getElementById("modal-admin").classList.remove("active");
        showToast("บันทึกการตั้งค่าแล้ว ระบบจะโหลดข้อมูลใหม่");
        
        setTimeout(() => {
            location.reload();
        }, 500);
    };
    
    document.getElementById("menu-register").onclick = (e) => {
        e.preventDefault();
        openRegisterModal();
    };
    
    document.getElementById("reg-teacher-select").onchange = (e) => {
        const wrapper = document.getElementById("reg-new-teacher-wrapper");
        
        // ค้นหาข้อมูลรหัสครูที่มีอยู่เดิมมาใส่ช่องให้หากไม่ใช่ครูใหม่
        if (e.target.value === "NEW_TEACHER") {
            wrapper.classList.remove("hidden");
            document.getElementById("reg-teacher-code").value = "";
        } else {
            wrapper.classList.add("hidden");
            const selectedUser = users.find(u => u.name === e.target.value);
            document.getElementById("reg-teacher-code").value = (selectedUser && selectedUser.code) ? selectedUser.code : "";
        }
    };
    
    document.getElementById("btn-submit-registration").onclick = () => {
        handleRegisterSubmit();
    };
    
    document.getElementById("menu-admin").onclick = (e) => {
        e.preventDefault();
        openPinModal("เข้าสู่ระบบผู้ดูแลระบบ (Admin)", "ADMIN", (pinCode) => {
            authenticatedAdminPin = pinCode; // เก็บ PIN จริงของแอดมินเพื่อใช้ในธุรกรรมต่าง ๆ ในหน้านี้
            loadHolidaysInAdmin();
            document.getElementById("modal-admin").classList.add("active");
        });
    };
    
    document.getElementById("btn-add-holiday").onclick = () => {
        addHoliday();
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
        openPinModal("ยืนยันตัวตนผู้บันทึกข้อมูล", "ANY", (pinCode) => {
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

    loadInitialData();
});
