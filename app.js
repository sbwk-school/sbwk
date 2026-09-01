/**
 * Frontend JavaScript - ระบบเช็คชื่อนักเรียนออนไลน์
 * เชื่อมต่อและทำงานผ่าน Supabase Cloud Database 100%
 */

let config = {
    supabaseUrl: (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG.supabaseUrl) ? GLOBAL_CONFIG.supabaseUrl : "https://lkpgexffxxyczxfevqkc.supabase.co",
    supabaseKey: (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG.supabaseKey) ? GLOBAL_CONFIG.supabaseKey : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrcGdleGZmeHh5Y3p4ZmV2cWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NzA4ODgsImV4cCI6MjEwMzA0Njg4OH0.nZe6-3Hzw2ogcM_akBIK_w-JC9okXvp0r7GSjVj5YSM",
    schoolName: "โรงเรียนซับบอนวิทยาคม",
    workGroup: "กลุ่มงานบริหารทั่วไป",
    semester: "ภาคเรียนที่ 1",
    academicYear: "ปีการศึกษา 2569"
};

// Supabase Instance Getter
let _supabaseInstance = null;
function getSupabase() {
    if (!_supabaseInstance && typeof window.supabase !== "undefined" && config.supabaseUrl && config.supabaseKey) {
        try {
            _supabaseInstance = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
        } catch (e) {
            console.warn("Could not create Supabase client:", e);
        }
    }
    return _supabaseInstance;
}

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
let accumulatedStatsMap = {}; // สถิติสะสมสำเร็จรูปรายคนจากชีท Web_สถิติสะสม
let documentsData = []; // ประวัติเอกสารและลายเซ็น
let atRiskTeachersCache = {}; // ข้อมูลครูที่รับผิดชอบเอกสารและลายเซ็น
let signaturePad = null; // ออบเจกต์ลายเซ็นอิเล็กทรอนิกส์

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
        if (GLOBAL_CONFIG.supabaseUrl) config.supabaseUrl = GLOBAL_CONFIG.supabaseUrl;
        if (GLOBAL_CONFIG.supabaseKey) config.supabaseKey = GLOBAL_CONFIG.supabaseKey;
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
    let prefix = student.prefix || "";
    let firstName = student.firstName || "";
    let lastName = student.lastName || "";
    let gender = student.gender ? String(student.gender) : "";
    
    fullName = fullName.replace(/\s+/g, ' ').trim();
    
    const prefixes = [
        { p: "เด็กหญิง", g: "2" },
        { p: "เด็กชาย", g: "1" },
        { p: "นางสาว", g: "2" },
        { p: "น.ส.", g: "2" },
        { p: "ด.ญ.", g: "2" },
        { p: "ด.ญ ", g: "2" },
        { p: "ด.ช.", g: "1" },
        { p: "ด.ช ", g: "1" },
        { p: "นาย", g: "1" },
        { p: "นาง", g: "2" }
    ];
    
    for (let item of prefixes) {
        if (fullName.startsWith(item.p)) {
            prefix = item.p.trim();
            gender = item.g;
            let rest = fullName.substring(item.p.length).trim();
            let nameParts = rest.split(' ');
            firstName = nameParts[0] || "";
            lastName = nameParts.slice(1).join(' ') || "";
            break;
        }
    }
    
    if (!prefix) {
        let nameParts = fullName.split(' ');
        firstName = nameParts[0] || "";
        lastName = nameParts.slice(1).join(' ') || "";
        if (!gender) gender = "1";
    }
    
    student.gender = gender;
    student.prefix = prefix;
    student.firstName = firstName;
    student.lastName = lastName;
    student.fullName = fullName;
    return student;
}

/**
 * แปลงอักษรย่อสถานะเช็คชื่อเป็นคำเต็มสำหรับการประมวลผลบนหน้าจอ
 */
function translateAbbreviationToStatus(abbr) {
    if (!abbr) return "มา";
    const clean = String(abbr).trim();
    const map = {
        "ม": "มา", "ล": "ลา", "ข": "ขาด", "ส": "สาย", "ด": "โดด",
        "มา": "มา", "ลา": "ลา", "ขาด": "ขาด", "สาย": "สาย", "โดด": "โดด"
    };
    return map[clean] || "มา";
}

/**
 * แปลงคำเต็มของสถานะเช็คชื่อเป็นอักษรย่อ เพื่อจัดเก็บลงฐานข้อมูลอย่างกระชับ
 */
function translateStatusToAbbreviation(st) {
    if (!st) return "ม";
    const clean = String(st).trim();
    const map = {
        "มา": "ม", "ลา": "ล", "ขาด": "ข", "สาย": "ส", "โดด": "ด",
        "ม": "ม", "ล": "ล", "ข": "ข", "ส": "ส", "ด": "ด"
    };
    return map[clean] || "ม";
}

// Dynamic Script Loader (Lazy Loading Heavy Libraries)
const loadedScripts = {};
function loadScriptAsync(src) {
    if (loadedScripts[src]) return loadedScripts[src];
    loadedScripts[src] = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
    return loadedScripts[src];
}

async function ensureApexChartsLoaded() {
    if (typeof ApexCharts !== "undefined") return true;
    try {
        await loadScriptAsync("https://cdn.jsdelivr.net/npm/apexcharts");
        return true;
    } catch (err) {
        console.warn("Failed to load ApexCharts lazily:", err);
        return false;
    }
}

async function ensurePdfLibrariesLoaded() {
    if (typeof html2canvas !== "undefined" && typeof jspdf !== "undefined") return true;
    try {
        await Promise.all([
            loadScriptAsync("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
            loadScriptAsync("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
        ]);
        return true;
    } catch (err) {
        console.warn("Failed to load PDF libraries lazily:", err);
        return false;
    }
}

/**
 * 1. โหลดข้อมูลเริ่มต้นทั้งหมดจาก Supabase Real-time Database
 */
async function loadInitialData() {
    setLoader(true);
    const db = getSupabase();
    if (!db) {
        setLoader(false);
        showToast("ไม่พบการเชื่อมต่อฐานข้อมูล Supabase", "error");
        return;
    }
    
    try {
        const [
            studentsRes,
            holidaysRes,
            usersRes,
            attendanceRes,
            trackingRes,
            exemptionsRes,
            pk11Res
        ] = await Promise.all([
            db.from('std').select('*').order('grade').order('room').order('no'),
            db.from('hol').select('*').order('date'),
            db.from('usr').select('*').order('id'),
            db.from('att').select('*').eq('date', currentCheckingDate),
            db.from('pk8_pk9').select('*'),
            db.from('exm').select('*'),
            db.from('pk11').select('*').order('target_date', { ascending: false })
        ]);
        
        // 1. Students (std)
        let roomCounters = {};
        students = (studentsRes.data || []).map(r => {
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
            return processStudentData(s);
        });
        
        // 2. Holidays (hol)
        holidays = (holidaysRes.data || []).map(h => ({ date: h.date, name: h.name }));
        
        // 3. Users (usr)
        users = (usersRes.data || []).map((u, idx) => ({
            code: u.code || ('T' + String(idx + 1).padStart(3, '0')),
            name: u.name,
            pin: u.pin,
            role: u.role || 'TEACHER',
            hasPin: !!u.pin
        }));
        
        // 4. Today Attendance Logs (att)
        todayLogs = {};
        todayLogsDetails = {};
        (attendanceRes.data || []).forEach(r => {
            const roomKey = `${r.grade}/${r.room}`;
            if (!todayLogs[roomKey]) {
                todayLogs[roomKey] = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: 0 };
            }
            const st = translateAbbreviationToStatus(r.status);
            if (st === 'มา') todayLogs[roomKey].Present++;
            else if (st === 'ลา') todayLogs[roomKey].Leave++;
            else if (st === 'ขาด') todayLogs[roomKey].Absent++;
            else if (st === 'สาย') todayLogs[roomKey].Late++;
            else if (st === 'โดด') todayLogs[roomKey].Cut++;
            todayLogs[roomKey].Total++;
            
            todayLogsDetails[r.student_id] = st;
        });
        
        // 5. At Risk Tracking Cache (pk8_pk9)
        atRiskTeachersCache = {};
        documentsData = (trackingRes.data || []).map(t => ({
            studentId: String(t.student_id),
            documentType: `${t.doc_type}_ครั้งที่${t.notice_count}`,
            signatureBase64: t.parent_sign || ''
        }));

        (trackingRes.data || []).forEach(t => {
            const hrTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === t.hr_name || u.name === t.hr_name) : null;
            const saTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === t.sa_name || u.name === t.sa_name) : null;
            const sId = String(t.student_id).trim();
            const dType = String(t.doc_type).trim();
            const nCount = parseInt(t.notice_count) || 1;
            const cacheItem = {
                studentId: sId,
                docType: dType,
                noticeCount: nCount,
                hr: hrTeacher ? hrTeacher.name : (t.hr_name || ''),
                sa: saTeacher ? saTeacher.name : (t.sa_name || ''),
                parentName: t.parent_name || '',
                docDate: t.doc_date || '',
                reason: t.reason || '',
                hrSign: t.hr_sign || '',
                saSign: t.sa_sign || '',
                parentSign: t.parent_sign || '',
                signatureBase64: t.parent_sign || ''
            };
            atRiskTeachersCache[`${sId}|${dType}|ครั้งที่${nCount}`] = cacheItem;
            atRiskTeachersCache[`${sId}|${dType}|${nCount}`] = cacheItem;
            atRiskTeachersCache[`${sId}|${dType}_ครั้งที่${nCount}`] = cacheItem;
        });
        
        // 6. Exemptions Cache (exm)
        exemptionsCache = {};
        (exemptionsRes.data || []).forEach(e => {
            const st = (typeof students !== 'undefined' && students) ? students.find(s => s.studentId === e.student_id) : null;
            exemptionsCache[e.student_id] = {
                studentId: e.student_id,
                studentName: st ? st.fullName : e.student_id,
                fullName: st ? st.fullName : e.student_id,
                gradeRoom: st ? `${st.grade}/${st.room}` : '-',
                type: e.type || 'ทั้งหมด',
                reason: e.reason || ''
            };
        });
        
        // 7. PK11 Records (pk11)
        window.pk11Records = (pk11Res.data || []).map(p => {
            const st = (typeof students !== 'undefined' && students) ? students.find(s => s.studentId === p.student_id) : null;
            const hrTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === p.hr_name || u.name === p.hr_name) : null;
            const saTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === p.sa_name || u.name === p.sa_name) : null;
            
            const hasSaSign = !!(p.sa_signature && p.sa_signature.length > 5);
            const hasHrSign = !!(p.hr_signature && p.hr_signature.length > 5);
            
            const hrApproved = (p.hr_status === true || p.hr_status === 'true' || p.hr_status === 'เห็นควรอนุญาต' || p.hr_status === 'TRUE');
            const hrDisapproved = (p.hr_status === false || p.hr_status === 'false' || p.hr_status === 'ไม่เห็นควรอนุญาต');
            
            const saApproved = (p.status === true || p.status === 'true' || p.status === 'อนุญาต' || p.status === 'TRUE');
            const saDisapproved = (p.status === false || p.status === 'false' || p.status === 'ไม่อนุญาต');

            let finalStatus = "รออนุมัติ";
            if (saDisapproved && (hasSaSign || p.sa_name)) {
                finalStatus = "ไม่อนุญาต";
            } else if (hrDisapproved && (hasHrSign || p.hr_name)) {
                finalStatus = "ไม่อนุญาต";
            } else if (hasSaSign && saApproved) {
                finalStatus = "อนุญาต";
            } else {
                finalStatus = "รออนุมัติ";
            }

            return {
                id: p.id,
                targetDate: p.target_date,
                studentId: p.student_id,
                studentName: st ? st.fullName : '-',
                gradeRoom: st ? `${st.grade}/${st.room}` : '-',
                exitTime: p.exit_time,
                returnTime: p.return_time,
                location: p.location,
                reason: p.reason,
                studentPhone: p.student_phone,
                parentName: p.parent_name,
                relation: p.relation,
                parentPhone: p.parent_phone,
                hrName: hrTeacher ? hrTeacher.name : (p.hr_name || '-'),
                saName: saTeacher ? saTeacher.name : (p.sa_name || '-'),
                hrStatus: hasHrSign ? (hrApproved ? "เห็นควรอนุญาต" : "ไม่เห็นควรอนุญาต") : (p.hr_status || "รอความเห็น"),
                status: finalStatus,
                studentSignature: p.student_signature || '',
                parentSignature: p.parent_signature || '',
                hrSignature: p.hr_signature || '',
                saSignature: p.sa_signature || ''
            };
        });
        
        isDeferredDataLoaded = true;
        if (typeof populateTeacherDropdowns === 'function') populateTeacherDropdowns();
        
        updateHeaderDate();
        checkTodayHoliday();
        renderRooms();
        calculateOverallStats();
        
        // Background prefetch stats data
        setTimeout(() => {
            fetchStatsDataOnce(false).then(() => {
                if (students && students.length > 0 && allStatsData) {
                    isAtRiskDataLoaded = true;
                    if (typeof updateAtRiskNoticeInTab === 'function') updateAtRiskNoticeInTab();
                }
            });
        }, 100);
    } catch (dbErr) {
        console.error("Supabase loadInitialData error:", dbErr);
        showToast("เกิดข้อผิดพลาดในการโหลดข้อมูลจากฐานข้อมูล", "error");
    } finally {
        setLoader(false);
    }
}

let deferredDataPromise = null;
async function fetchDeferredDataOnce(forceFresh = false) {
    const db = getSupabase();
    if (db) {
        try {
            const [trackingRes, exemptionsRes] = await Promise.all([
                db.from('pk8_pk9').select('*'),
                db.from('exm').select('*')
            ]);
            atRiskTeachersCache = {};
            documentsData = (trackingRes.data || []).map(t => ({
                studentId: String(t.student_id),
                documentType: `${t.doc_type}_ครั้งที่${t.notice_count}`,
                signatureBase64: t.parent_sign || ''
            }));
            (trackingRes.data || []).forEach(t => {
                const hrTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === t.hr_name || u.name === t.hr_name) : null;
                const saTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === t.sa_name || u.name === t.sa_name) : null;
                const sId = String(t.student_id).trim();
                const dType = String(t.doc_type).trim();
                const nCount = parseInt(t.notice_count) || 1;
                const cacheItem = {
                    studentId: sId,
                    docType: dType,
                    noticeCount: nCount,
                    hr: hrTeacher ? hrTeacher.name : (t.hr_name || ''),
                    sa: saTeacher ? saTeacher.name : (t.sa_name || ''),
                    parentName: t.parent_name || '',
                    docDate: t.doc_date || '',
                    reason: t.reason || '',
                    hrSign: t.hr_sign || '',
                    saSign: t.sa_sign || '',
                    parentSign: t.parent_sign || '',
                    signatureBase64: t.parent_sign || ''
                };
                atRiskTeachersCache[`${sId}|${dType}|ครั้งที่${nCount}`] = cacheItem;
                atRiskTeachersCache[`${sId}|${dType}|${nCount}`] = cacheItem;
                atRiskTeachersCache[`${sId}|${dType}_ครั้งที่${nCount}`] = cacheItem;
            });
            exemptionsCache = {};
            (exemptionsRes.data || []).forEach(e => {
                const st = (typeof students !== 'undefined' && students) ? students.find(s => s.studentId === e.student_id) : null;
                exemptionsCache[e.student_id] = {
                    studentId: e.student_id,
                    studentName: st ? st.fullName : e.student_id,
                    fullName: st ? st.fullName : e.student_id,
                    gradeRoom: st ? `${st.grade}/${st.room}` : '-',
                    type: e.type || 'ทั้งหมด',
                    reason: e.reason || ''
                };
            });
            isDeferredDataLoaded = true;
            populateTeacherDropdowns();
            return;
        } catch (e) {
            console.warn("Supabase deferred data warning:", e);
        }
    }
}

async function fetchAllSupabaseRows(db, table, select = '*', orderCol = 'date') {
    let allRows = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        let query = db.from(table).select(select).range(from, from + pageSize - 1);
        if (orderCol) query = query.order(orderCol, { ascending: true });
        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return allRows;
}

async function fetchStatsDataOnce(forceFresh = false) {
    if (allStatsData && allStatsData.dates && !forceFresh) return;
    const db = getSupabase();
    if (!db) return;
    
    try {
        const rows = await fetchAllSupabaseRows(db, 'att', 'date,student_id,status,grade,room', 'date');
        const logs = [];
        const datesSet = new Set();
        const monthsSet = new Set();
        
        (rows || []).forEach(r => {
            const dateStr = r.date;
            if (!dateStr) return;
            datesSet.add(dateStr);
            monthsSet.add(dateStr.substring(0, 7));
            const st = (typeof students !== 'undefined' && students) ? students.find(s => s.studentId === r.student_id) : null;
            logs.push({
                date: dateStr,
                studentId: r.student_id,
                name: st ? st.fullName : '',
                room: (st && st.grade) ? `${st.grade}/${st.room}` : `${r.grade}/${r.room}`,
                status: translateAbbreviationToStatus(r.status)
            });
        });
        
        allStatsData = {
            dates: Array.from(datesSet).sort(),
            availableMonths: Array.from(monthsSet).sort(),
            logs: logs
        };
        
        if (typeof updateAtRiskNoticeInTab === 'function') updateAtRiskNoticeInTab();
        if (typeof calculateOverallStats === 'function') calculateOverallStats();
    } catch (e) {
        console.warn("Supabase stats load warning:", e);
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
                    handleNoticeClick(s.studentId, s.fullName, `${s.grade}/${s.room}`, docType, fullDocType);
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
                    handleNoticeClick(s.studentId, s.fullName, `${s.grade}/${s.room}`, docType, fullDocType);
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
 * ฟังก์ชันสลับวันที่เช็คชื่อความเร็วสูง (Instant Date Switch)
 * ดึงเฉพาะข้อมูลตาราง att ของวันที่เลือก ไม่ต้องโหลดตารางอื่นซ้ำ
 */
window.switchCheckingDate = async function(newDate, targetGrade = null, targetRoom = null) {
    if (!newDate) return;
    currentCheckingDate = newDate;
    
    // Sync Flatpickr instances
    const homeDatePicker = document.getElementById("home-date-picker");
    if (homeDatePicker) {
        if (homeDatePicker._flatpickr) homeDatePicker._flatpickr.setDate(currentCheckingDate, false);
        else homeDatePicker.value = currentCheckingDate;
    }
    const checkingDatePicker = document.getElementById("checking-date-picker");
    if (checkingDatePicker) {
        if (checkingDatePicker._flatpickr) checkingDatePicker._flatpickr.setDate(currentCheckingDate, false);
        else checkingDatePicker.value = currentCheckingDate;
    }
    
    updateHeaderDate();
    checkTodayHoliday();
    
    const db = getSupabase();
    if (db) {
        setLoader(true);
        try {
            const { data, error } = await db.from('att').select('*').eq('date', currentCheckingDate);
            if (error) throw error;
            
            todayLogs = {};
            todayLogsDetails = {};
            (data || []).forEach(r => {
                const roomKey = `${r.grade}/${r.room}`;
                if (!todayLogs[roomKey]) {
                    todayLogs[roomKey] = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: 0 };
                }
                const st = translateAbbreviationToStatus(r.status);
                if (st === 'มา') todayLogs[roomKey].Present++;
                else if (st === 'ลา') todayLogs[roomKey].Leave++;
                else if (st === 'ขาด') todayLogs[roomKey].Absent++;
                else if (st === 'สาย') todayLogs[roomKey].Late++;
                else if (st === 'โดด') todayLogs[roomKey].Cut++;
                todayLogs[roomKey].Total++;
                
                todayLogsDetails[r.student_id] = st;
            });
            
            calculateOverallStats();
            renderRooms();
            
            const g = targetGrade || (selectedRoom ? selectedRoom.grade : null);
            const rm = targetRoom || (selectedRoom ? selectedRoom.room : null);
            if (currentView === "attendance-check" && g && rm) {
                openAttendanceCheck(g, rm);
            }
        } catch (e) {
            console.error("switchCheckingDate error:", e);
            showToast("เกิดข้อผิดพลาดในการโหลดข้อมูลวันที่เลือก", "error");
        } finally {
            setLoader(false);
        }
    }
};

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
                disableMobile: true,
                onChange: function(selectedDates, dateStr, instance) {
                    window.switchCheckingDate(dateStr, grade, room);
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
                window.switchCheckingDate(e.target.value, grade, room);
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
        let hasAtRisk = false;
        let roomStudents = typeof students !== 'undefined' ? students.filter(s => s.grade === grade && s.room === room) : [];
        
        if (accumulatedStatsMap && Object.keys(accumulatedStatsMap).length > 0) {
            for (let i = 0; i < roomStudents.length; i++) {
                let sid = roomStudents[i].studentId;
                let acc = accumulatedStatsMap[sid];
                if (acc && (acc.absent >= 3 || acc.late >= 3)) {
                    hasAtRisk = true;
                    break;
                }
            }
        } else if (typeof allStatsData !== 'undefined' && allStatsData && allStatsData.logs) {
            let sStats = {};
            allStatsData.logs.forEach(log => {
                if (log.room === `${grade}/${room}`) {
                    let sid = log.studentId;
                    if (!sStats[sid]) sStats[sid] = { a: 0, l: 0 };
                    if (log.status === 'ขาด') sStats[sid].a++;
                    if (log.status === 'สาย') sStats[sid].l++;
                }
            });
            for (let i = 0; i < roomStudents.length; i++) {
                let sid = roomStudents[i].studentId;
                if (sStats[sid] && (sStats[sid].a >= 3 || sStats[sid].l >= 3)) {
                    hasAtRisk = true;
                    break;
                }
            }
        }
        if (hasAtRisk) {
            atRiskNotice = ` <span class="badge-at-risk-pulse">ติดตาม ⚠️</span>`;
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
                    <button class="tab-btn room-inner-tab-btn ${hasAtRisk ? 'tab-at-risk-glow' : ''}" data-target="room-tab-stats" style="padding: 10px 2px; font-size: 13px; white-space: nowrap; letter-spacing: -0.3px;">สรุป${atRiskNotice}</button>
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
    
    const isFemale = (r) => {
        if (r.gender === "2" || r.gender === 2) return true;
        const name = r.fullName || "";
        return name.startsWith("ด.ญ.") || name.startsWith("เด็กหญิง") || name.startsWith("นางสาว") || name.startsWith("น.ส.") || name.startsWith("นาง");
    };
    
    const maleList = attendanceRecords.filter(r => !isFemale(r));
    const femaleList = attendanceRecords.filter(r => isFemale(r));
    
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
    autoFitPreviewSummaryToScreen();
}

window.autoFitPreviewSummaryToScreen = function() {
    const scaleWrapper = document.getElementById("preview-scale-wrapper");
    const modalBody = document.getElementById("preview-modal-body-wrapper");
    if (!scaleWrapper || !modalBody) return;
    
    scaleWrapper.style.transform = 'none';
    scaleWrapper.style.transformOrigin = 'top center';
    scaleWrapper.style.marginBottom = '0px';
    
    setTimeout(() => {
        const availableWidth = modalBody.clientWidth - 24;
        const nativeWidth = 640;
        
        if (availableWidth > 0 && availableWidth < nativeWidth) {
            const scale = availableWidth / nativeWidth;
            scaleWrapper.style.transform = `scale(${scale})`;
            const naturalHeight = scaleWrapper.offsetHeight;
            const scaledHeight = naturalHeight * scale;
            const diff = naturalHeight - scaledHeight;
            scaleWrapper.style.marginBottom = `-${diff}px`;
        } else {
            scaleWrapper.style.transform = 'none';
            scaleWrapper.style.marginBottom = '0px';
        }
    }, 60);
};

window.autoFitDocumentPreviewToScreen = function() {
    const scaleWrapper = document.getElementById("doc-preview-scale-wrapper");
    const modalBody = document.getElementById("doc-preview-modal-body-wrapper");
    if (!scaleWrapper || !modalBody) return;
    
    scaleWrapper.style.transform = 'none';
    scaleWrapper.style.marginBottom = '0px';
    
    setTimeout(() => {
        const availableWidth = modalBody.clientWidth - 16;
        const nativeWidth = 794; // Width of A4 document in pixels (~210mm)
        
        if (availableWidth > 0 && availableWidth < nativeWidth) {
            const scale = availableWidth / nativeWidth;
            scaleWrapper.style.transformOrigin = 'top left';
            scaleWrapper.style.margin = '0';
            scaleWrapper.style.transform = `scale(${scale})`;
            const naturalHeight = scaleWrapper.offsetHeight;
            const scaledHeight = naturalHeight * scale;
            const diff = naturalHeight - scaledHeight;
            scaleWrapper.style.marginBottom = `-${diff}px`;
        } else {
            scaleWrapper.style.transformOrigin = 'top center';
            scaleWrapper.style.margin = '0 auto';
            scaleWrapper.style.transform = 'none';
            scaleWrapper.style.marginBottom = '0px';
        }
    }, 50);
};

// Automatic Observer for document modal activation
document.addEventListener("DOMContentLoaded", () => {
    const docModal = document.getElementById("modal-document-preview");
    if (docModal) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class" && docModal.classList.contains("active")) {
                    autoFitDocumentPreviewToScreen();
                }
            });
        });
        observer.observe(docModal, { attributes: true, attributeFilter: ["class"] });
    }
});

window.addEventListener('resize', () => {
    const modal = document.getElementById("modal-preview-summary");
    if (modal && modal.classList.contains("active")) {
        autoFitPreviewSummaryToScreen();
    }
    const docModal = document.getElementById("modal-document-preview");
    if (docModal && docModal.classList.contains("active")) {
        autoFitDocumentPreviewToScreen();
    }
});

window.downloadSummaryPreviewImage = async function() {
    const captureArea = document.getElementById("preview-capture-area");
    const scaleWrapper = document.getElementById("preview-scale-wrapper");
    if (!captureArea) return;
    
    try {
        await ensurePdfLibrariesLoaded();
        setLoader(true);
        
        const prevTransform = scaleWrapper ? scaleWrapper.style.transform : '';
        const prevMargin = scaleWrapper ? scaleWrapper.style.marginBottom : '';
        if (scaleWrapper) {
            scaleWrapper.style.transform = 'none';
            scaleWrapper.style.marginBottom = '0px';
        }
        
        setTimeout(() => {
            if (typeof html2canvas !== "undefined") {
                html2canvas(captureArea, { 
                    scale: 2, 
                    backgroundColor: "#ffffff",
                    useCORS: true,
                    allowTaint: true
                }).then(canvas => {
                    setLoader(false);
                    if (scaleWrapper) {
                        scaleWrapper.style.transform = prevTransform;
                        scaleWrapper.style.marginBottom = prevMargin;
                    }
                    try {
                        const imgData = canvas.toDataURL("image/png");
                        const grade = selectedRoom ? selectedRoom.grade : '';
                        const room = selectedRoom ? selectedRoom.room : '';
                        const safeDate = currentCheckingDate || new Date().toISOString().slice(0,10);
                        
                        const a = document.createElement("a");
                        a.href = imgData;
                        a.download = `สรุปเช็คชื่อ_ม${grade}-${room}_${safeDate}.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        showToast("บันทึกรูปภาพสรุปเรียบร้อยแล้ว 📸", "success");

                        // ปิดหน้าต่างพรีวิวอัตโนมัติทันที
                        const modal = document.getElementById("modal-preview-summary");
                        if (modal) modal.classList.remove("active");

                    } catch (err) {
                        console.error("Canvas Export Error:", err);
                        showToast("ไม่สามารถดาวน์โหลดรูปได้ (กรุณาใช้งานผ่านเว็บโฮสติ้งจริง)", "error");

                        // ปิดหน้าต่างพรีวิวอัตโนมัติ
                        const modal = document.getElementById("modal-preview-summary");
                        if (modal) modal.classList.remove("active");
                    }
                }).catch(err => {
                    setLoader(false);
                    if (scaleWrapper) {
                        scaleWrapper.style.transform = prevTransform;
                        scaleWrapper.style.marginBottom = prevMargin;
                    }
                    console.error("html2canvas error:", err);
                    showToast("เกิดข้อผิดพลาดในการแปลงรูปภาพ", "error");

                    const modal = document.getElementById("modal-preview-summary");
                    if (modal) modal.classList.remove("active");
                });
            } else {
                setLoader(false);
                if (scaleWrapper) {
                    scaleWrapper.style.transform = prevTransform;
                    scaleWrapper.style.marginBottom = prevMargin;
                }
                showToast("ไม่พบไลบรารีแปลงรูปภาพ html2canvas", "error");

                const modal = document.getElementById("modal-preview-summary");
                if (modal) modal.classList.remove("active");
            }
        }, 100);
    } catch (e) {
        setLoader(false);
        showToast("เกิดข้อผิดพลาดในการโหลดระบบสร้างรูปภาพ", "error");

        const modal = document.getElementById("modal-preview-summary");
        if (modal) modal.classList.remove("active");
    }
};

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
    
    // Master Bypass: ถ้าระบบยังไม่มีผู้ใช้ ให้ใช้รหัส 9999 เข้าแอดมินได้
    if (!matchedUser && users.length === 0 && pinDigits === "9999") {
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
        } else if (pinRequiredRole === "STUDENT_AFFAIRS" && (userRole === "ADMIN" || userRole === "STUDENT_AFFAIRS" || userRole === "กิจการนักเรียน")) {
            isAuthorized = true;
        } else if (pinRequiredRole === "STUDENT_AFFAIRS_ONLY" && (userRole === "STUDENT_AFFAIRS" || userRole === "ADMIN" || userRole === "กิจการนักเรียน")) {
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
        else if (roleRequired === "STUDENT_AFFAIRS" && (userRole === "ADMIN" || userRole === "STUDENT_AFFAIRS" || userRole === "กิจการนักเรียน")) isAuthorized = true;
        else if (roleRequired === "STUDENT_AFFAIRS_ONLY" && (userRole === "STUDENT_AFFAIRS" || userRole === "ADMIN" || userRole === "กิจการนักเรียน")) isAuthorized = true;
        
        if (isAuthorized) {
            if (callback) callback(loggedInUser.pin, loggedInUser.name, loggedInUser.role);
        } else {
            if (typeof showToast === 'function') {
                showToast("คุณไม่มีสิทธิ์ในการดำเนินรายการนี้ (เฉพาะแอดมินหรือฝ่ายกิจการฯ เท่านั้น)", "error");
            } else {
                alert("คุณไม่มีสิทธิ์ในการดำเนินรายการนี้");
            }
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
 * 6. บันทึกเช็คชื่อไปยัง Supabase Database และ Google Sheets
 */
async function saveAttendanceToSheet(pinCode, teacherName) {
    showToast(`บันทึกการเช็คชื่อห้อง ${selectedRoom.grade}/${selectedRoom.room} เรียบร้อย ⚡`);
    
    // อัปเดตข้อมูลภาพรวมรายห้องลง State วันนี้เพื่อสะท้อนหน้าแรก
    const summary = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: attendanceRecords.length };
    attendanceRecords.forEach(r => {
        if (r.status === "มา") summary.Present++;
        else if (r.status === "ลา") summary.Leave++;
        else if (r.status === "ขาด") summary.Absent++;
        else if (r.status === "สาย") summary.Late++;
        else if (r.status === "โดด") summary.Cut++;
        
        // บันทึกสถานะรายบุคคลลง todayLogsDetails ทันทีเพื่อให้ค้างสถานะเวลาเปิดใหม่
        todayLogsDetails[r.studentId] = r.status;
        isAtRiskDataLoaded = false;
        
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
    
    // บันทึกลง Supabase Database ด้วยระบบ Atomic UPSERT ความเร็วสูง
    const db = getSupabase();
    if (db) {
        try {
            const rowsToUpsert = attendanceRecords.map(r => ({
                date: currentCheckingDate,
                grade: selectedRoom.grade,
                room: selectedRoom.room,
                student_id: r.studentId,
                status: translateStatusToAbbreviation(r.status)
            }));
            
            const { error: upsertErr } = await db.from('att').upsert(rowsToUpsert, { onConflict: 'date,student_id' });
            if (upsertErr) throw upsertErr;
        } catch (dbErr) {
            console.error("Supabase attendance atomic upsert error:", dbErr);
        }
    }
}


/**
 * 7. ส่วนสถิติย้อนหลัง (Statistics View)
 */
async function fetchAndRenderStats() {
    // โหลดประวัติทั้งหมดมาไว้ในแรมหากยังไม่มี หรือหากข้อมูลโครงสร้างสถิติล่าสุดยังไม่ครบ
    if (!allStatsData || !allStatsData.dates || !allStatsData.availableMonths) {
        setLoader(true);
        try {
            await fetchStatsDataOnce(true);
        } catch (e) {
            showToast("ข้อผิดพลาดในการเชื่อมต่อดึงสถิติ", "error");
            setLoader(false);
            return;
        }
        setLoader(false);
    }
    
    if (!allStatsData || !allStatsData.dates) {
        const chartContainer = document.getElementById("school-trend-chart");
        if (chartContainer) chartContainer.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">ไม่มีข้อมูลสถิติประวัติการมาเรียน</div>';
        return;
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
async function renderSchoolTrendChart(logs, datesList) {
    const chartEl = document.getElementById("stats-school-chart");
    if (!chartEl) return;
    
    if (typeof ApexCharts === "undefined") {
        await ensureApexChartsLoaded();
    }
    
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
                const st = translateAbbreviationToStatus(log.status);
                if (st === "มา") pCount++;
                else if (st === "ลา") lCount++;
                else if (st === "ขาด") aCount++;
                else if (st === "สาย") lateCount++;
                else if (st === "โดด") cutCount++;
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
            const st = translateAbbreviationToStatus(log.status);
            if (st === "มา") countsMap[log.studentId].Present++;
            else if (st === "ลา") countsMap[log.studentId].Leave++;
            else if (st === "ขาด") countsMap[log.studentId].Absent++;
            else if (st === "สาย") countsMap[log.studentId].Late++;
            else if (st === "โดด") countsMap[log.studentId].Cut++;
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
                const st = translateAbbreviationToStatus(status);
                if (st === "มา") { statusChar = "ม"; classStyle = "status-present"; }
                else if (st === "ลา") { statusChar = "ล"; classStyle = "status-leave"; }
                else if (st === "ขาด") { statusChar = "ข"; classStyle = "status-absent"; }
                else if (st === "สาย") { statusChar = "ส"; classStyle = "status-late"; }
                else if (st === "โดด") { statusChar = "ด"; classStyle = "status-cut"; }
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
    // โหลดความประพฤติจากเซิร์ฟเวอร์หากยังไม่มีประวัติในหน่วยความจำ
    if (misconductLogs.length === 0) {
        setLoader(true);
        try {
            await fetchMisconductDataOnce();
        } catch (e) {
            console.error("fetchAndRenderMisconducts error:", e);
            showToast("ไม่สามารถโหลดระบบความประพฤติได้", "error");
        } finally {
            setLoader(false);
        }
    }
    renderMisconductTable();
}

async function fetchMisconductDataOnce(forceFresh = false) {
    const db = getSupabase();
    if (!db) return;
    try {
        const { data, error } = await db.from('mis').select('*').order('date', { ascending: false });
        if (error) throw error;
        misconductLogs = (data || []).map(r => {
            const st = (typeof students !== 'undefined' && students) ? students.find(s => s.studentId === r.student_id) : null;
            return {
                id: r.id,
                date: r.date,
                studentId: r.student_id,
                name: st ? st.fullName : '-',
                grade: st ? st.grade : (r.grade || '-'),
                room: st ? st.room : (r.room || '-'),
                description: r.description,
                recorder: r.recorder,
                resolved: !!r.resolved,
                resolution: r.resolution || ""
            };
        });
    } catch (e) {
        console.error("Supabase fetchMisconductDataOnce error:", e);
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
        
        // ค้นหาชื่อเต็มของครูผู้แจ้งจากรหัสครู (เช่น T014 -> ชื่อครู)
        const recorderTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === item.recorder || u.name === item.recorder) : null;
        const displayRecorderName = recorderTeacher ? recorderTeacher.name : (item.recorder || 'ครูผู้สอน');
        
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
            <td class="row-clickable" style="max-width: 120px;"><div style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayRecorderName}">${displayRecorderName}</div></td>
            <td class="row-clickable" style="max-width: 120px;"><div style="font-size: 13px; color: ${item.resolution ? '#166534' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.resolution || '-'}</div></td>
        `;
        
        // เมื่อคลิกที่ส่วนใดๆ ของแถว (ยกเว้น checkbox) ให้เปิดหน้าต่างรายละเอียด
        tr.querySelectorAll('.row-clickable').forEach(td => {
            td.style.cursor = "pointer";
            td.onclick = () => {
                document.getElementById("detail-misconduct-student").innerText = `${item.name} (${item.grade}/${item.room})`;
                document.getElementById("detail-misconduct-date").innerText = formattedDate;
                document.getElementById("detail-misconduct-desc").innerText = item.description;
                document.getElementById("detail-misconduct-reporter").innerText = displayRecorderName;
                
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
                    item.resolved = newStatus;
                    if (newStatus) {
                        const dateStr = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
                        item.resolution = `${resolutionText} (${userName}, ${dateStr})`;
                    } else {
                        item.resolution = "";
                    }
                    
                    renderMisconductTable();
                    
                    const db = getSupabase();
                    if (db) {
                        try {
                            const { error: dbErr } = await db.from('mis').update({
                                resolved: newStatus,
                                resolution: item.resolution
                            }).eq('id', id);
                            if (dbErr) throw dbErr;
                            showToast("อัปเดตสถานะความประพฤติเรียบร้อย ⚡");
                        } catch (err) {
                            console.error("Supabase toggle resolve error:", err);
                        }
                    }
                });
            };
        };
        
        tbody.appendChild(tr);
    });
}

function handleMisconductSearch(query) {
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

async function submitMisconduct(pinCode, userName = null) {
    const dateInput = document.getElementById("misconduct-date-input").value;
    const descInput = document.getElementById("misconduct-desc-input").value;
    const searchInput = document.getElementById("misconduct-student-search").value.trim();
    
    if (!dateInput || !searchInput || !descInput.trim()) {
        showToast("กรุณากรอกข้อมูลบันทึกความประพฤติให้ครบถ้วน", "error");
        return;
    }
    
    setLoader(true);
    const newId = "M" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const studentId = selectedMisconductStudent ? selectedMisconductStudent.studentId : "-";
    
    // ดึงข้อมูลครูผู้แจ้งอย่างถูกต้องตามชื่อและรหัส PIN ของครูที่เข้าสู่ระบบ
    let activeTeacher = null;
    if (userName) {
        activeTeacher = users.find(u => u.name === userName);
    }
    if (!activeTeacher && pinCode) {
        activeTeacher = users.find(u => String(u.pin) === String(pinCode));
    }
    if (!activeTeacher && typeof loggedInUser !== 'undefined' && loggedInUser) {
        activeTeacher = loggedInUser;
    }
    
    const teacherCode = (activeTeacher && activeTeacher.code) ? activeTeacher.code : (activeTeacher ? activeTeacher.name : "T001");
    
    const db = getSupabase();
    if (db) {
        try {
            const { error: dbErr } = await db.from('mis').insert({
                id: newId,
                date: dateInput,
                student_id: studentId,
                description: descInput,
                recorder: teacherCode,
                resolved: false,
                resolution: ""
            });
            if (dbErr) throw dbErr;
            
            showToast("เพิ่มบันทึกความประพฤติสำเร็จ ⚡");
            document.getElementById("modal-add-misconduct").classList.remove("active");
            document.getElementById("misconduct-desc-input").value = "";
            document.getElementById("misconduct-student-search").value = "";
            document.getElementById("selected-student-display").classList.add("hidden");
            selectedMisconductStudent = null;
            
            await fetchMisconductDataOnce(true);
            renderMisconductTable();
            if (typeof renderAtRiskStudents === 'function') renderAtRiskStudents();
        } catch (e) {
            console.error("Supabase submitMisconduct error:", e);
            showToast("เกิดข้อผิดพลาดในการบันทึกความประพฤติ", "error");
        } finally {
            setLoader(false);
        }
    } else {
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
    document.getElementById("modal-pin").classList.remove("active"); // ปิดหน้าจอ PIN
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
    const assignedCode = code || ('T' + String(users.length + 1).padStart(3, '0'));
    
    const db = getSupabase();
    if (db) {
        try {
            const { error } = await db.from('usr').upsert({
                code: assignedCode,
                name: name,
                pin: pinCode,
                role: role || 'TEACHER'
            }, { onConflict: 'name' });
            if (error) throw error;
            
            showToast(`ลงทะเบียนคุณครู ${name} (${assignedCode}) เรียบร้อย ⚡`);
            let existingUser = users.find(u => u.name === name);
            if (existingUser) {
                existingUser.code = assignedCode;
                existingUser.pin = pinCode;
                existingUser.hasPin = true;
            } else {
                users.push({
                    code: assignedCode,
                    name: name,
                    role: role,
                    pin: pinCode,
                    hasPin: true
                });
            }
        } catch (dbErr) {
            console.error("Supabase saveUserRegistration error:", dbErr);
            showToast("เกิดข้อผิดพลาดในการลงทะเบียน", "error");
        } finally {
            setLoader(false);
        }
    } else {
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
        tbody.innerHTML = '<tr><td colspan="5" class="txt-center" style="color: var(--text-muted);">ไม่มีรายการข้อมูลผู้ใช้งานครู</td></tr>';
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
            <td style="text-align: center; font-family: monospace; font-weight: 700; color: #2563eb;">${u.code || '-'}</td>
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
        
        // จัดการลบบัญชีครู
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
                    
                    const db = getSupabase();
                    if (db) {
                        try {
                            const { error } = await db.from('usr').delete().eq('name', u.name);
                            if (error) throw error;
                            showToast(`ลบบัญชีผู้ใช้ของ ${u.name} สำเร็จ ⚡`);
                            users = users.filter(usr => usr.name !== u.name);
                            renderAdminTeachers();
                        } catch (dbErr) {
                            console.error("Supabase deleteUser error:", dbErr);
                            showToast("เกิดข้อผิดพลาดในการลบผู้ใช้", "error");
                        } finally {
                            setLoader(false);
                        }
                    } else {
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
    
    const db = getSupabase();
    if (db) {
        try {
            for (let u of updates) {
                const userObj = users.find(usr => usr.name === u.name);
                const assignedCode = (userObj && userObj.code) ? userObj.code : ('T' + String(users.indexOf(userObj) + 1).padStart(3, '0'));
                const { error } = await db.from('usr').upsert({
                    code: assignedCode,
                    name: u.name,
                    pin: u.pin,
                    role: u.role
                }, { onConflict: 'name' });
                if (error) throw error;
            }
            showToast("บันทึกข้อมูลครูและรหัสผ่านทั้งหมดสำเร็จ ⚡");
            document.getElementById("admin-teacher-unsaved-msg").style.display = "none";
            updates.forEach(u => {
                const userObj = users.find(usr => usr.name === u.name);
                if (userObj) {
                    userObj.role = u.role;
                    userObj.pin = u.pin;
                }
            });
        } catch (dbErr) {
            console.error("Supabase updateAllUserRoles error:", dbErr);
            showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูลครู", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

/**
 * 10. หน้าแอดมิน (Admin Control Panel)
 */
window.loadHolidaysInAdmin = async function() {
    const tbody = document.getElementById("holiday-list-tbody");
    if (!tbody) return;
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
        
        const delBtn = tr.querySelector(".btn-delete-holiday");
        if (delBtn) {
            delBtn.onclick = async () => {
                const executeDelete = async (pin) => {
                    setLoader(true);
                    
                    const db = getSupabase();
                    if (db) {
                        try {
                            const { error } = await db.from('hol').delete().eq('date', h.date);
                            if (error) throw error;
                            showToast("ลบวันหยุดเรียบร้อย ⚡");
                            holidays = holidays.filter(item => item.date !== h.date);
                            loadHolidaysInAdmin();
                            checkTodayHoliday();
                        } catch (dbErr) {
                            console.error("Supabase deleteHoliday error:", dbErr);
                            showToast("เกิดข้อผิดพลาดในการลบวันหยุด", "error");
                        } finally {
                            setLoader(false);
                        }
                    } else {
                        setLoader(false);
                    }
                };
                
                if (authenticatedAdminPin) {
                    executeDelete(authenticatedAdminPin);
                } else {
                    requestLogin("ADMIN", (pin) => {
                        authenticatedAdminPin = pin;
                        executeDelete(pin);
                    });
                }
            };
        }
        
        tbody.appendChild(tr);
    });
};

window.addHoliday = async function() {
    const dateInput = document.getElementById("holiday-date-input") ? document.getElementById("holiday-date-input").value : "";
    const nameInput = document.getElementById("holiday-name-input") ? document.getElementById("holiday-name-input").value.trim() : "";
    
    if (!dateInput || !nameInput) {
        showToast("กรุณากรอกวันที่และระบุชื่อวันหยุด", "error");
        return;
    }
    
    const executeAdd = async (pin) => {
        setLoader(true);
        
        const db = getSupabase();
        if (db) {
            try {
                const { error } = await db.from('hol').upsert({
                    date: dateInput,
                    name: nameInput
                });
                if (error) throw error;
                showToast("เพิ่มวันหยุดสำเร็จ ⚡");
                const dateEl = document.getElementById("holiday-date-input");
                const nameEl = document.getElementById("holiday-name-input");
                if (dateEl) dateEl.value = "";
                if (nameEl) nameEl.value = "";
                
                const existingIdx = holidays.findIndex(h => h.date === dateInput);
                if (existingIdx >= 0) {
                    holidays[existingIdx].name = nameInput;
                } else {
                    holidays.push({ date: dateInput, name: nameInput });
                }
                loadHolidaysInAdmin();
                checkTodayHoliday();
            } catch (dbErr) {
                console.error("Supabase addHoliday error:", dbErr);
                showToast("เกิดข้อผิดพลาดในการเพิ่มวันหยุด", "error");
            } finally {
                setLoader(false);
            }
        } else {
            setLoader(false);
        }
    };
    
    if (authenticatedAdminPin) {
        executeAdd(authenticatedAdminPin);
    } else {
        requestLogin("ADMIN", (pin) => {
            authenticatedAdminPin = pin;
            executeAdd(pin);
        });
    }
};

/**
 * 11. ฟังก์ชันเปลี่ยนหน้า (SPA View Switcher)
 */
function extractNoticeCount(str, fallback = 1) {
    if (str === null || str === undefined) return fallback;
    if (typeof str === 'number') return isNaN(str) ? fallback : str;
    const s = String(str).trim();
    if (!s) return fallback;
    
    // 1. ตรวจหา "ครั้งที่ X" เช่น "ป.ค.9_ครั้งที่2" หรือ "ครั้งที่ 3"
    const countMatch = s.match(/ครั้งที่\s*(\d+)/);
    if (countMatch && countMatch[1]) return parseInt(countMatch[1], 10);
    
    // 2. ตรวจหาในวงเล็บ เช่น "ป.ค.9 (2)" หรือ "(3)"
    const parenMatch = s.match(/\((\d+)\)/);
    if (parenMatch && parenMatch[1]) return parseInt(parenMatch[1], 10);
    
    // 3. ตรวจหาหลังขีดล่างหรือขีดตั้ง เช่น "4309|ป.ค.9|2"
    const parts = s.split(/[|_]/);
    if (parts.length > 1) {
        const last = parts[parts.length - 1].trim();
        const lastNum = last.match(/\d+/);
        if (lastNum && last !== 'ป.ค.8' && last !== 'ป.ค.9' && last !== 'pk8' && last !== 'pk9') {
            return parseInt(lastNum[0], 10);
        }
    }
    
    // 4. ลบ ป.ค.8, ป.ค.9, ป.ค.11, PK8, PK9 ออกก่อน แล้วค่อยดูตัวเลขที่เหลือ
    const stripped = s.replace(/ป\.?ค\.?\s*\d+/gi, '').replace(/PK\s*\d+/gi, '');
    const remainNum = stripped.match(/\d+/);
    if (remainNum && remainNum[0]) {
        return parseInt(remainNum[0], 10);
    }
    
    return fallback;
}

window.handleNoticeClick = function(studentId, fullName, gradeRoom, docType, fullDocType, explicitCount) {
    // 1. Check if already logged in (Admin or Teacher)
    let currentRole = null;
    let currentName = "";
    
    if (authenticatedAdminPin) {
        // Admin or SA logged in
        currentRole = "ADMIN";
    } else if (loggedInUser) {
        // Teacher logged in (from checking attendance)
        currentRole = loggedInUser.role;
        currentName = loggedInUser.name;
    }
    
    // 2. If logged in, proceed directly
    if (currentRole) {
        processNoticeClick(studentId, fullName, gradeRoom, docType, fullDocType, currentRole, currentName, explicitCount);
    } else {
        // 3. If not logged in, request login
        requestLogin("ANY", (pin, name, role) => {
            processNoticeClick(studentId, fullName, gradeRoom, docType, fullDocType, role, name, explicitCount);
        });
    }
};

function processNoticeClick(studentId, fullName, gradeRoom, docType, fullDocType, role, name, explicitCount) {
    const parsedNoticeCount = explicitCount ? parseInt(explicitCount, 10) : extractNoticeCount(fullDocType, 1);
    const backendKey = `${studentId}|${docType}|ครั้งที่${parsedNoticeCount}`;
    
    let savedHr = "";
    let savedSa = "";
    let savedParentName = "";
    let savedDocDate = "";
    let savedReason = "";
    let savedHrSign = "";
    let savedSaSign = "";
    let savedParentSign = "";
    
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        const item = atRiskTeachersCache[backendKey];
        savedHr = item.hr || "";
        savedSa = item.sa || "";
        savedParentName = item.parentName || "";
        if (typeof isReasonTextStr === 'function' && isReasonTextStr(savedParentName)) {
            savedParentName = "";
        }
        savedDocDate = item.docDate || "";
        savedReason = item.reason || "";
        savedHrSign = item.hrSign || "";
        savedSaSign = item.saSign || "";
        savedParentSign = item.parentSign || item.signatureBase64 || "";
    }

    if (!savedParentSign && typeof documentsData !== 'undefined' && documentsData.length > 0) {
        const existingDoc = documentsData.find(d => d.studentId === studentId && (d.documentType === fullDocType || d.documentType === docType));
        if (existingDoc && existingDoc.signatureBase64) {
            savedParentSign = existingDoc.signatureBase64;
        }
    }

    // ข้ามไปพรีวิวทันที ถ้ามีชื่อครูที่ปรึกษาแล้ว
    if (savedHr) {
        currentSigningStudent = {
            studentId: studentId,
            fullName: fullName,
            gradeRoom: gradeRoom,
            docType: docType,
            fullDocType: fullDocType,
            documentType: fullDocType,
            noticeCount: parsedNoticeCount,
            backendKey: backendKey,
            homeroomTeacher: savedHr,
            headOfStudentAffairs: savedSa,
            parentName: savedParentName,
            reason: savedReason,
            hrSign: savedHrSign,
            saSign: savedSaSign,
            parentSign: savedParentSign,
            signatureBase64: savedParentSign,
            docDate: savedDocDate
        };
        openDocumentPreview(currentSigningStudent);
    } else {
        // เปิดหน้าเลือกครู
        openNoticeActionModal(studentId, fullName, gradeRoom, docType, fullDocType, role, backendKey, parsedNoticeCount);
    }
}

window.handleTeacherSelectChange = function(role) {
    const selectEl = document.getElementById(`action-${role}-select`);
    if (!selectEl) return;
    const teacherName = selectEl.value;
    if (!teacherName) {
        if (role === 'hr') {
            window.tempHrSign = "";
            document.getElementById("hr-signature-preview-container").style.display = "none";
            document.getElementById("hr-signature-preview").src = "";
        } else {
            window.tempSaSign = "";
            document.getElementById("sa-signature-preview-container").style.display = "none";
            document.getElementById("sa-signature-preview").src = "";
        }
        return;
    }

    let foundSignature = "";
    if (atRiskTeachersCache) {
        for (const key in atRiskTeachersCache) {
            const item = atRiskTeachersCache[key];
            if (role === 'hr' && item.hr === teacherName && item.hrSign) {
                foundSignature = item.hrSign;
                break;
            }
            if (role === 'sa' && item.sa === teacherName && item.saSign) {
                foundSignature = item.saSign;
                break;
            }
        }
    }

    if (foundSignature) {
        if (role === 'hr') {
            window.tempHrSign = foundSignature;
            document.getElementById("hr-signature-preview").src = foundSignature;
            document.getElementById("hr-signature-preview-container").style.display = "block";
        } else {
            window.tempSaSign = foundSignature;
            document.getElementById("sa-signature-preview").src = foundSignature;
            document.getElementById("sa-signature-preview-container").style.display = "block";
        }
    } else {
        if (role === 'hr') {
            window.tempHrSign = "";
            document.getElementById("hr-signature-preview-container").style.display = "none";
            document.getElementById("hr-signature-preview").src = "";
        } else {
            window.tempSaSign = "";
            document.getElementById("sa-signature-preview-container").style.display = "none";
            document.getElementById("sa-signature-preview").src = "";
        }
    }
};

window.openNoticeActionModal = function(studentId, fullName, gradeRoom, docType, fullDocType, role, backendKey, explicitCount) {
    const parsedNoticeCount = explicitCount ? parseInt(explicitCount, 10) : extractNoticeCount(fullDocType, 1);
    currentSigningStudent = { 
        studentId, 
        fullName, 
        gradeRoom, 
        docType, 
        fullDocType, 
        documentType: fullDocType, 
        noticeCount: parsedNoticeCount, 
        backendKey: backendKey || `${studentId}|${docType}|ครั้งที่${parsedNoticeCount}` 
    };
    
    document.getElementById("at-risk-action-title").innerText = `รายชื่อลงนาม`;
    document.getElementById("at-risk-action-subtitle").style.display = "none";
    document.getElementById("at-risk-action-subtitle").innerText = ``;
    
    // แสดงทั้ง 2 Dropdown
    document.getElementById("group-action-hr").style.display = "block";
    document.getElementById("group-action-sa").style.display = "block";
    
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
    
    let savedHr = "";
    let savedSa = "";
    let savedParentName = "";
    let savedDocDate = "";
    let savedReason = "";
    window.tempHrSign = "";
    window.tempSaSign = "";
    window.tempParentSign = "";
    
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        savedHr = atRiskTeachersCache[backendKey].hr || "";
        savedSa = atRiskTeachersCache[backendKey].sa || "";
        savedParentName = atRiskTeachersCache[backendKey].parentName || "";
        window.tempHrSign = atRiskTeachersCache[backendKey].hrSign || "";
        window.tempSaSign = atRiskTeachersCache[backendKey].saSign || "";
        window.tempParentSign = atRiskTeachersCache[backendKey].parentSign || atRiskTeachersCache[backendKey].signatureBase64 || "";
        savedDocDate = atRiskTeachersCache[backendKey].docDate || "";
        savedReason = atRiskTeachersCache[backendKey].reason || "";
    }

    if (!window.tempParentSign && typeof documentsData !== 'undefined' && documentsData.length > 0) {
        const existingDoc = documentsData.find(d => d.studentId === studentId && (d.documentType === fullDocType || d.documentType === docType));
        if (existingDoc && existingDoc.signatureBase64) {
            window.tempParentSign = existingDoc.signatureBase64;
        }
    }
    
function isReasonTextStr(s) {
    if (!s) return false;
    const str = String(s).trim();
    const keywords = ["แจ้งว่า", "ลาออก", "ตื่นสาย", "ป่วย", "ลากิจ", "ฝนตก", "เนื่องจาก", "เพราะ", "ติดธุระ", "ย้าย", "ไม่มา", "ขาดเรียน", "รับรองแพทย์", "อุบัติเหตุ", "ไปต่างจังหวัด", "ธุระ"];
    return keywords.some(kw => str.includes(kw));
}

    const parentNameInput = document.getElementById("action-parent-name-input");
    if (parentNameInput) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(savedParentName) || /^\d{8}$/.test(savedParentName) || isReasonTextStr(savedParentName)) {
            parentNameInput.value = "";
        } else {
            parentNameInput.value = savedParentName;
        }
    }
    
    const reasonInput = document.getElementById("action-reason-input");
    if (reasonInput) {
        reasonInput.value = savedReason;
    }
    
    // ตั้งค่าช่องวันที่: ถ้ามีวันที่เคยบันทึกไว้ให้ใช้วันที่นั้น ถ้าไม่มีให้ใช้วันนี้ (YYYY-MM-DD)
    const docDateInput = document.getElementById("action-doc-date");
    if (docDateInput) {
        if (savedDocDate) {
            docDateInput.value = savedDocDate;
        } else {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            docDateInput.value = `${y}-${m}-${d}`;
        }
    }
    
    if (savedHr) hrSelect.value = savedHr;
    if (savedSa) saSelect.value = savedSa;
    
    // สิทธิ์การเลือกชื่อครู (Role-based Blocking)
    if (role === 'ครูที่ปรึกษา' || role === 'ครูผู้สอน') {
        saSelect.disabled = true;
        saSelect.title = "คุณไม่มีสิทธิ์เปลี่ยนชื่อหัวหน้ากิจการนักเรียน";
    } else {
        saSelect.disabled = false;
        saSelect.title = "";
    }
    
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
    
    const parentPreview = document.getElementById("parent-signature-preview");
    const parentContainer = document.getElementById("parent-signature-preview-container");
    if (window.tempParentSign) {
        parentPreview.src = window.tempParentSign;
        parentContainer.style.display = "block";
    } else {
        parentContainer.style.display = "none";
        parentPreview.src = "";
    }
    
    if (!window.tempHrSign && hrSelect.value) handleTeacherSelectChange('hr');
    if (!window.tempSaSign && saSelect.value) handleTeacherSelectChange('sa');
    
    document.getElementById("modal-at-risk-action").classList.add("active");
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
        } else if (viewName === "pk11") {
            pageTitleEl.innerText = "ขออนุญาตออกนอกบริเวณ (ป.ค.11)";
        } else if (viewName === "clean5s") {
            pageTitleEl.innerText = "ประเมินความสะอาด (5ส.)";
        } else if (viewName === "haircut") {
            pageTitleEl.innerText = "ตรวจระเบียบทรงผม";
        } else if (viewName === "mental-eval") {
            pageTitleEl.innerText = "แบบประเมินสุขภาพจิตนักเรียน";
        } else if (viewName === "eval-report") {
            pageTitleEl.innerText = "รายงานผลการประเมิน";
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
    
    // จัดการการแสดงผลของปุ่มย้อนกลับและเส้นคั่น
    const backBtn = document.getElementById("shortcut-back");
    const backSep = document.getElementById("mobile-back-separator");
    if (backBtn && backSep) {
        if (viewName === "attendance-check" || viewName === "stats" || viewName === "misconduct" || viewName === "at-risk" || viewName === "pk11" || viewName === "clean5s" || viewName === "haircut" || viewName === "mental-eval" || viewName === "eval-report") {
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
        document.getElementById("menu-home")?.classList.add("active");
        document.getElementById("view-home")?.classList.add("active");
        renderRooms();
    } else if (viewName === "stats") {
        document.getElementById("menu-stats")?.classList.add("active");
        document.getElementById("view-stats")?.classList.add("active");
        
        populateStatsRoomDropdown();
        fetchAndRenderStats();
    } else if (viewName === "misconduct") {
        document.getElementById("menu-misconduct")?.classList.add("active");
        document.getElementById("view-misconduct")?.classList.add("active");
        fetchAndRenderMisconducts();
    } else if (viewName === "at-risk") {
        document.getElementById("menu-at-risk")?.classList.add("active");
        document.getElementById("view-at-risk")?.classList.add("active");
        
        // รีเซ็ตตัวกรองห้องและประเภทกลับเป็นแสดงทั้งหมด (ALL) เมื่อเข้าสู่หน้าติดตาม นร
        const roomFilterSelect = document.getElementById('at-risk-room-filter');
        if (roomFilterSelect && !window.preserveTrackingRoomFilter) {
            roomFilterSelect.value = "ALL";
        }
        const statusFilterSelect = document.getElementById('at-risk-filter');
        if (statusFilterSelect && !window.preserveTrackingRoomFilter) {
            statusFilterSelect.value = "all";
        }
        window.preserveTrackingRoomFilter = false;
        
        renderAtRiskStudents();
    } else if (viewName === "pk11") {
        document.getElementById("view-pk11")?.classList.add("active");
        if (typeof loadPk11Records === "function") loadPk11Records();
    } else if (viewName === "clean5s") {
        document.getElementById("view-clean5s")?.classList.add("active");
        if (typeof initClean5sView === "function") initClean5sView();
    } else if (viewName === "haircut") {
        document.getElementById("view-haircut")?.classList.add("active");
        if (typeof initHaircutView === "function") initHaircutView();
    } else if (viewName === "mental-eval") {
        document.getElementById("view-mental-eval")?.classList.add("active");
        if (typeof switchMentalCategory === "function") switchMentalCategory(window.currentMentalCategory || 1);
    } else if (viewName === "eval-report") {
        document.getElementById("view-eval-report")?.classList.add("active");
        if (typeof initReportView === "function") initReportView();
    } else if (viewName === "attendance-check") {
        document.getElementById("view-attendance-check")?.classList.add("active");
    }
    
    // เปิด/ปิด FAB ผ่อนผันเฉพาะเมื่อเปิดหน้าติดตาม นร
    const fabExemption = document.getElementById("fab-exemption");
    if (fabExemption) {
        if (viewName === "at-risk") fabExemption.style.display = "inline-flex";
        else fabExemption.style.display = "none";
    }
    
    // เปิด/ปิด FAB ประเมิน 5ส.
    const clean5sFab = document.getElementById("clean5s-fab-btn");
    if (clean5sFab) {
        if (viewName === "clean5s") {
            clean5sFab.classList.add("is-active-view");
            clean5sFab.style.setProperty("display", "flex", "important");
        } else {
            clean5sFab.classList.remove("is-active-view");
            clean5sFab.style.setProperty("display", "none", "important");
        }
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

let isAtRiskDataLoaded = false;

/**
 * ดึงและแสดงข้อมูลนักเรียนกลุ่มเสี่ยง
 */
window.renderAtRiskStudents = async function() {
    const container = document.getElementById("at-risk-container");
    const badge = document.getElementById("at-risk-badge");
    
    if (!container) return; // Add null check
    
    if (students && students.length > 0 && allStatsData) {
        isAtRiskDataLoaded = true;
    }
    
    // ดึงข้อมูลสถิติล่าสุดสดๆ จากเซิร์ฟเวอร์เฉพาะกรณีที่ยังไม่มีข้อมูลในแรม
    if (!isAtRiskDataLoaded && (!allStatsData || !students || students.length === 0)) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"><div class="empty-state" style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 30px; margin-bottom: 10px; color: var(--color-primary);"></i><p>กำลังดึงข้อมูลสถิติล่าสุดจากเซิร์ฟเวอร์...</p></div></div>';
        
        try {
            await Promise.all([
                fetchStatsDataOnce(false),
                fetchDeferredDataOnce(false)
            ]);
            if (students && students.length > 0 && allStatsData) {
                isAtRiskDataLoaded = true;
            }
        } catch (e) {
            console.warn("Error fetching fresh at-risk data:", e);
        }
    }
    
    // 2. คำนวณสถิติ
    const countsMap = {};
    students.forEach(s => {
        const acc = accumulatedStatsMap[s.studentId] || {};
        countsMap[s.studentId] = {
            studentId: s.studentId,
            fullName: s.fullName,
            grade: s.grade,
            room: s.room,
            absent: acc.absent !== undefined ? acc.absent : (acc.Absent || 0),
            late: acc.late !== undefined ? acc.late : (acc.Late || 0)
        };
    });
    
    // ถ้ามีข้อมูลประวัติรายละเอียด allStatsData ให้อัปเดตจำนวนขาด/สายเพิ่มเติม (ไม่ล้างค่าสะสมเดิม)
    if (allStatsData && allStatsData.logs && allStatsData.logs.length > 0) {
        const logCounts = {};
        allStatsData.logs.forEach(log => {
            if (!logCounts[log.studentId]) logCounts[log.studentId] = { absent: 0, late: 0 };
            if (log.status === "ขาด") logCounts[log.studentId].absent++;
            if (log.status === "สาย") logCounts[log.studentId].late++;
        });
        
        students.forEach(s => {
            if (logCounts[s.studentId]) {
                countsMap[s.studentId].absent = Math.max(countsMap[s.studentId].absent, logCounts[s.studentId].absent);
                countsMap[s.studentId].late = Math.max(countsMap[s.studentId].late, logCounts[s.studentId].late);
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
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 50px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"><div class="empty-state"><i class="fa-solid fa-circle-check" style="font-size: 40px; color: var(--color-present); margin-bottom: 10px;"></i><p>ไม่มีนักเรียนกลุ่มเสี่ยงที่ค้างดำเนินการ<br>ยอดเยี่ยมมากครับ!</p></div></div>';
        return;
    }
    
    const filterValue = document.getElementById('at-risk-filter') ? document.getElementById('at-risk-filter').value : 'all';
    const roomFilterSelect = document.getElementById('at-risk-room-filter');
    
    // Populate room filter options if needed
    if (roomFilterSelect) {
        const savedValue = roomFilterSelect.value;
        if (!roomFilterSelect.getAttribute('data-populated') || roomFilterSelect.options.length <= 1) {
            roomFilterSelect.setAttribute('data-populated', 'true');
            
            while (roomFilterSelect.options.length > 1) {
                roomFilterSelect.remove(1);
            }
            
            // Build room list from all students in system for full completeness
            const allSchoolRooms = (students && students.length > 0) ? 
                [...new Set(students.map(s => `${s.grade}/${s.room}`))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true })) :
                [...new Set(atRiskList.map(s => `${s.grade}/${s.room}`))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
                
            allSchoolRooms.forEach(room => {
                const opt = document.createElement('option');
                opt.value = room;
                opt.text = 'ชั้น ' + room;
                roomFilterSelect.appendChild(opt);
            });
            
            if (savedValue && Array.from(roomFilterSelect.options).some(o => o.value === savedValue)) {
                roomFilterSelect.value = savedValue;
            }
        }
    }
    
    const roomFilterValue = (roomFilterSelect && roomFilterSelect.value) ? roomFilterSelect.value : 'ALL';
    
    let filteredList = atRiskList;
    if (roomFilterValue !== 'ALL') {
        filteredList = filteredList.filter(s => `${s.grade}/${s.room}` === roomFilterValue);
    }
    
    if (filterValue === 'active') {
        filteredList = filteredList.filter(s => !exemptionsCache || !exemptionsCache[s.studentId]);
    } else if (filterValue === 'exempted') {
        filteredList = filteredList.filter(s => exemptionsCache && exemptionsCache[s.studentId]);
    } else if (filterValue === 'absent') {
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
    
    container.innerHTML = "";
    
    if (filteredList.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 45px 20px; background: white; border-radius: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); border: 1px dashed #cbd5e1;">
                <div class="empty-state" style="color: var(--text-muted);">
                    <i class="fa-solid fa-circle-check" style="font-size: 38px; color: #10b981; margin-bottom: 10px;"></i>
                    <p style="margin: 0; font-weight: 700; font-size: 15px; color: #1e293b;">ไม่พบรายการนักเรียนตามเงื่อนไขที่เลือก</p>
                    <span style="font-size: 13px; color: #64748b;">(ลองปรับเปลี่ยนตัวเลือกห้องเรียน หรือตัวกรองสถานะด้านบน)</span>
                </div>
            </div>
        `;
        return;
    }
    
    let teacherOptions = '<option value="">- เลือกครู -</option>';
    if (typeof users !== 'undefined') {
        users.forEach(u => {
            teacherOptions += `<option value="${u.name}">${u.name}</option>`;
        });
    }
    
    filteredList.forEach((s, index) => {
        let statsText = "";
        let docType = "";
        let noticeCount = 1;
        
        if (s.absent >= 9) statsText += `<div class="at-risk-stat-badge" style="border: 1px solid #fee2e2; color: #b91c1c;"><span>ขาด</span> <strong>${s.absent}</strong></div>`;
        else if (s.absent >= 6) statsText += `<div class="at-risk-stat-badge" style="border: 1px solid #ffedd5; color: #c2410c;"><span>ขาด</span> <strong>${s.absent}</strong></div>`;
        else if (s.absent >= 3) statsText += `<div class="at-risk-stat-badge" style="border: 1px solid #fef9c3; color: #a16207;"><span>ขาด</span> <strong>${s.absent}</strong></div>`;
        
        if (s.late >= 8) statsText += `<div class="at-risk-stat-badge" style="border: 1px solid #f3e8ff; color: #7e22ce;"><span>สาย</span> <strong>${s.late}</strong></div>`;
        else if (s.late >= 5) statsText += `<div class="at-risk-stat-badge" style="border: 1px solid #e0f2fe; color: #0369a1;"><span>สาย</span> <strong>${s.late}</strong></div>`;
        else if (s.late >= 3) statsText += `<div class="at-risk-stat-badge" style="border: 1px solid #f1f5f9; color: #475569;"><span>สาย</span> <strong>${s.late}</strong></div>`;

        let eligibleDocs = [];
        if (s.absent >= 3) eligibleDocs.push({ type: "ป.ค.9", count: 1 });
        if (s.absent >= 6) eligibleDocs.push({ type: "ป.ค.9", count: 2 });
        if (s.absent >= 9) eligibleDocs.push({ type: "ป.ค.9", count: 3 });
        
        if (s.late >= 3) eligibleDocs.push({ type: "ป.ค.8", count: 1 });
        if (s.late >= 5) eligibleDocs.push({ type: "ป.ค.8", count: 2 });
        if (s.late >= 8) eligibleDocs.push({ type: "ป.ค.8", count: 3 });

        let buttonsHtmlInner = '';
        
        eligibleDocs.forEach(doc => {
            const docType = doc.type;
            const noticeCount = doc.count;
            const fullDocType = `${docType}_ครั้งที่${noticeCount}`;
            const backendKey = `${s.studentId}|${docType}|ครั้งที่${noticeCount}`;
            
            // เช็คสถานะครูลงชื่อ และ ผปค เซ็น
            let savedHr = "";
            let savedSa = "";
            let cachedParentSign = "";
            if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
                savedHr = atRiskTeachersCache[backendKey].hr || "";
                savedSa = atRiskTeachersCache[backendKey].sa || "";
                cachedParentSign = atRiskTeachersCache[backendKey].parentSign || atRiskTeachersCache[backendKey].signatureBase64 || "";
            }
            
            // เช็คสถานะผู้ปกครองเซ็น (ทั้งจาก atRiskTeachersCache และ documentsData)
            const existingDoc = (typeof documentsData !== 'undefined' && documentsData) ? documentsData.find(d => d.studentId === s.studentId && (d.documentType === fullDocType || d.documentType === docType)) : null;
            const docParentSign = (existingDoc && existingDoc.signatureBase64) ? existingDoc.signatureBase64 : "";
            const isParentSigned = (cachedParentSign && cachedParentSign.length > 50) || (docParentSign && docParentSign.length > 50);
            
            // ลอจิกสีแบบพาสเทลเรียงตามสถานะการเซ็น
            let btnStyle = "";
            let btnClass = "btn at-risk-pill-btn";
            const docPrefix = docType === "ป.ค.9" ? "ป.ค.9" : "ป.ค.8";
            let btnText = `${docPrefix} (${noticeCount})`;
            let icon = docType === "ป.ค.9" ? "fa-user-slash" : "fa-clock";
            
            if (isParentSigned) {
                // 3. ผปค เซ็นแล้ว -> ฟ้าพาสเทล (Pastel Blue)
                btnStyle += " background-color: #bae6fd; color: #0369a1; border: 1px solid #7dd3fc; box-shadow: 0 2px 6px rgba(56,189,248,0.25);";
                icon = "fa-circle-check";
            } else if (savedHr && savedSa) {
                // 2. ครูเซ็นครบสองคน -> เขียวพาสเทล (Pastel Green)
                btnStyle += " background-color: #bbf7d0; color: #15803d; border: 1px solid #86efac; box-shadow: 0 2px 6px rgba(74,222,128,0.25);";
                icon = "fa-user-check";
            } else if (savedHr || savedSa) {
                // 1. ครูหรือกิจการคนใดคนหนึ่งเซ็น -> ม่วงพาสเทล (Pastel Purple)
                btnStyle += " background-color: #e9d5ff; color: #6b21a8; border: 1px solid #d8b4fe; box-shadow: 0 2px 6px rgba(192,132,252,0.25);";
                icon = savedHr ? "fa-user-shield" : "fa-pen-fancy";
            } else {
                // ยังไม่เซ็น -> แดงพาสเทล (ขาด) / ส้มพาสเทล (สาย)
                if (docType === "ป.ค.9") {
                    btnStyle += " background-color: #ffe4e6; color: #9f1239; border: 1px solid #fecdd3;";
                } else {
                    btnStyle += " background-color: #ffedd5; color: #c2410c; border: 1px solid #fed7aa;";
                }
            }
            
            buttonsHtmlInner += `<button class="${btnClass}" style="${btnStyle}" onclick="handleNoticeClick('${s.studentId}', '${s.fullName}', '${s.grade}/${s.room}', '${docType}', '${fullDocType}', ${noticeCount})">
                <i class="fa-solid ${icon}"></i> ${btnText}
            </button>`;
        });

        const ex = (exemptionsCache && exemptionsCache[s.studentId]) ? exemptionsCache[s.studentId] : null;
        let actionsHtml = "";
        if (ex) {
            actionsHtml = `<div onclick="openExemptionDetailModal('${s.studentId}')" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#d1fae5';" onmouseout="this.style.background='#ecfdf5';" title="คลิกเพื่อดูรายละเอียดและประวัติเอกสารย้อนหลัง">
                <span style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;">
                    <i class="fa-solid fa-user-shield" style="font-size: 14px; flex-shrink: 0;"></i>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>ผ่อนผัน (${ex.type || 'ทั้งหมด'}):</strong> ${ex.reason || 'ผ่อนผันการติดตาม'}</span>
                </span>
                <span style="font-size: 11px; font-weight: 600; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px; background: rgba(4, 120, 87, 0.12); color: #047857; padding: 3px 10px; border-radius: 12px; margin-left: 8px;">
                    <i class="fa-solid fa-circle-info"></i> รายละเอียด
                </span>
            </div>`;
        } else {
            actionsHtml = buttonsHtmlInner;
        }

        const card = document.createElement("div");
        card.className = "room-card";
        card.style.marginBottom = "0";
        card.style.cursor = "default";
        if (ex) {
            card.style.background = "linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(255, 255, 255, 0.8) 100%)";
            card.style.border = "1px solid rgba(16, 185, 129, 0.3)";
        } else {
            card.style.background = "linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(255, 255, 255, 0.6) 100%)";
            card.style.border = "1px solid rgba(239, 68, 68, 0.2)";
        }
        card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.03)";
        card.style.padding = "10px 14px";
        
        card.innerHTML = `
            <div class="at-risk-card-layout">
                
                <!-- แถว 1: ข้อมูลนักเรียน และ ป้ายสรุปขาด/สาย -->
                <div class="at-risk-card-top">
                    <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; overflow: hidden;">
                        <div style="display: flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; background: ${ex ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.12)'}; border-radius: 50%; color: ${ex ? '#047857' : '#dc2626'}; font-size: 12px; font-weight: 700; flex-shrink: 0;">
                            ${index + 1}
                        </div>
                        <h3 class="room-card-title" style="margin: 0; white-space: nowrap; flex-shrink: 0;">${s.grade}/${s.room}</h3>
                        <div class="room-card-count desktop-only" style="color: var(--text-muted); flex-shrink: 0;">${s.studentId}</div>
                        <div class="at-risk-student-name">
                            ${s.fullName}
                        </div>
                    </div>
                    
                    <div style="display: inline-flex; flex: 0 0 auto; gap: 6px; justify-content: flex-end; align-items: center;">
                        ${statsText}
                    </div>
                </div>
                
                <!-- แถว 2: ปุ่มเอกสาร (ขยายเต็ม 100% ความกว้างการ์ด) -->
                <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: space-between; align-items: center; width: 100%;">
                    ${actionsHtml}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
};

window.openPreviewDirectly = async function(studentId, fullName, gradeRoom, docType, fullDocType, explicitCount) {
    const parsedNoticeCount = explicitCount ? parseInt(explicitCount, 10) : extractNoticeCount(fullDocType, 1);
    currentSigningStudent = {
        studentId: studentId,
        fullName: fullName,
        gradeRoom: gradeRoom,
        docType: docType,
        fullDocType: fullDocType,
        documentType: fullDocType,
        noticeCount: parsedNoticeCount,
        backendKey: `${studentId}|${docType}|ครั้งที่${parsedNoticeCount}`
    };
    
    const backendKey = currentSigningStudent.backendKey;
    let saved = { hr: "", sa: "", hrSign: "", saSign: "" };
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        saved = { ...atRiskTeachersCache[backendKey] };
    }
    
    // โหลดลายเซ็นผู้ปกครองจาก documentsData (หากบันทึกจากหน้าเอกสารโดยตรง)
    if (typeof documentsData !== 'undefined' && documentsData.length > 0) {
        const existingDoc = documentsData.find(d => d.studentId === studentId && (d.documentType === fullDocType || d.documentType === docType));
        if (existingDoc && existingDoc.signatureBase64) {
            if (!saved.parentSign) saved.parentSign = existingDoc.signatureBase64;
        }
    }
    
    currentSigningStudent.homeroomTeacher = saved.hr || '...........................................';
    currentSigningStudent.headOfStudentAffairs = saved.sa || '...........................................';
    currentSigningStudent.hrSign = saved.hrSign;
    currentSigningStudent.saSign = saved.saSign;
    currentSigningStudent.parentName = saved.parentName;
    currentSigningStudent.parentSign = saved.parentSign || saved.signatureBase64;
    currentSigningStudent.signatureBase64 = saved.parentSign || saved.signatureBase64; // Ensure compatibility
    currentSigningStudent.reason = saved.reason || "";
    currentSigningStudent.docDate = saved.docDate || "";
    
    const docToPrint = { ...currentSigningStudent, documentType: currentSigningStudent.fullDocType };
    document.getElementById("modal-at-risk-action").classList.remove("active");
    await openDocumentPreview(docToPrint);
};

window.closeAtRiskActionModal = function() {
    document.getElementById("modal-at-risk-action").classList.remove("active");
};

window.saveAtRiskTeachers = async function() {
    if (!currentSigningStudent) return;
    
    const hrSelect = document.getElementById("action-hr-select").value;
    const saSelect = document.getElementById("action-sa-select").value;
    const parentNameInput = document.getElementById("action-parent-name-input");
    const parentNameVal = parentNameInput ? parentNameInput.value.trim() : "";
    const reasonInput = document.getElementById("action-reason-input");
    const reasonVal = reasonInput ? reasonInput.value.trim() : "";
    const docDateInput = document.getElementById("action-doc-date");
    const docDateVal = docDateInput && docDateInput.value ? docDateInput.value : "";
    
    const sId = currentSigningStudent.studentId;
    const dType = currentSigningStudent.docType;
    
    let nCount = currentSigningStudent.noticeCount;
    if (!nCount && currentSigningStudent.fullDocType) {
        nCount = extractNoticeCount(currentSigningStudent.fullDocType);
    }
    if (!nCount && currentSigningStudent.backendKey) {
        nCount = extractNoticeCount(currentSigningStudent.backendKey);
    }
    nCount = parseInt(nCount) || 1;
    currentSigningStudent.noticeCount = nCount;
    
    const backendKey = currentSigningStudent.backendKey || `${sId}|${dType}|ครั้งที่${nCount}`;
    
    let saved = { hr: "", sa: "", hrSign: "", saSign: "", parentName: "", parentSign: "", docDate: "", reason: "" };
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        saved = { ...atRiskTeachersCache[backendKey] };
    }
    
    saved.hr = hrSelect;
    saved.sa = saSelect;
    saved.parentName = parentNameVal;
    saved.reason = reasonVal;
    
    if (window.tempHrSign === "CLEARED") {
        saved.hrSign = "";
    } else if (window.tempHrSign && window.tempHrSign.length > 50) {
        saved.hrSign = window.tempHrSign;
    }
    
    if (window.tempSaSign === "CLEARED") {
        saved.saSign = "";
    } else if (window.tempSaSign && window.tempSaSign.length > 50) {
        saved.saSign = window.tempSaSign;
    }
    
    if (window.tempParentSign === "CLEARED") {
        saved.parentSign = "";
        saved.signatureBase64 = "";
    } else if (window.tempParentSign && window.tempParentSign.length > 50) {
        saved.parentSign = window.tempParentSign;
        saved.signatureBase64 = window.tempParentSign;
    } else if (!saved.parentSign && saved.signatureBase64) {
        saved.parentSign = saved.signatureBase64;
    }
    
    currentSigningStudent.parentSign = saved.parentSign;
    currentSigningStudent.signatureBase64 = saved.parentSign;
    currentSigningStudent.hrSign = saved.hrSign;
    currentSigningStudent.saSign = saved.saSign;
    currentSigningStudent.parentName = saved.parentName;
    currentSigningStudent.reason = saved.reason;
    
    if (docDateVal) {
        saved.docDate = docDateVal;
    }
    
    // บันทึกลง Cache ให้ครบทุกรูปแบบคีย์เพื่อให้ UI สะท้อนผลทันที
    if (!atRiskTeachersCache) atRiskTeachersCache = {};
    atRiskTeachersCache[backendKey] = saved;
    atRiskTeachersCache[`${sId}|${dType}|ครั้งที่${nCount}`] = saved;
    atRiskTeachersCache[`${sId}|${dType}|${nCount}`] = saved;
    atRiskTeachersCache[`${sId}|${dType}_ครั้งที่${nCount}`] = saved;
    
    // อัปเดต documentsData ด้วยเพื่อความสอดคล้อง
    if (typeof documentsData !== 'undefined' && documentsData) {
        const fullDocType = currentSigningStudent.fullDocType || `${dType}_ครั้งที่${nCount}`;
        const studentId = currentSigningStudent.studentId;
        const docIdx = documentsData.findIndex(d => d.studentId === studentId && (d.documentType === fullDocType || d.documentType === dType));
        if (saved.parentSign && saved.parentSign.length > 50) {
            if (docIdx >= 0) {
                documentsData[docIdx].signatureBase64 = saved.parentSign;
            } else {
                documentsData.push({
                    studentId: studentId,
                    documentType: fullDocType,
                    signatureBase64: saved.parentSign
                });
            }
        } else if (saved.parentSign === "" && docIdx >= 0) {
            documentsData[docIdx].signatureBase64 = "";
        }
    }
    
    if (typeof renderAtRiskStudents === 'function') renderAtRiskStudents();
    
    // บันทึกไปยัง Supabase Database
    const db = getSupabase();
    if (db) {
        try {
            const hrTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.name === saved.hr || u.code === saved.hr) : null;
            const saTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.name === saved.sa || u.code === saved.sa) : null;
            const hrCode = hrTeacher ? (hrTeacher.code || hrTeacher.name) : (saved.hr || '');
            const saCode = saTeacher ? (saTeacher.code || saTeacher.name) : (saved.sa || '');

            // Upload signatures to Supabase Storage if they are in Base64 format
            const hrSignUrl = await uploadSignatureToSupabase(saved.hrSign, 'pk8_pk9', `${sId}_${dType}_${nCount}_hr`);
            const saSignUrl = await uploadSignatureToSupabase(saved.saSign, 'pk8_pk9', `${sId}_${dType}_${nCount}_sa`);
            const parentSignUrl = await uploadSignatureToSupabase(saved.parentSign, 'pk8_pk9', `${sId}_${dType}_${nCount}_parent`);

            saved.hrSign = hrSignUrl;
            saved.saSign = saSignUrl;
            saved.parentSign = parentSignUrl;
            saved.signatureBase64 = parentSignUrl;

            const { error: dbErr } = await db.from('pk8_pk9').upsert({
                student_id: sId,
                doc_type: dType,
                notice_count: nCount,
                hr_name: hrCode,
                sa_name: saCode,
                parent_name: saved.parentName || '',
                doc_date: saved.docDate || '',
                reason: saved.reason || '',
                hr_sign: hrSignUrl,
                sa_sign: saSignUrl,
                parent_sign: parentSignUrl
            });
            if (dbErr) throw dbErr;
            showToast(`บันทึกข้อมูล ${dType} (ครั้งที่ ${nCount}) ลงฐานข้อมูลสำเร็จ ⚡`, "success");
        } catch (err) {
            console.error("Supabase pk8_pk9 save error:", err);
            showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูล", "error");
        }
    }
    
    closeAtRiskActionModal();
};

/**
 * อัปโหลดรูปลายเซ็นขึ้น Supabase Storage (Bucket: signatures) และคืนค่าเป็น Public URL
 */
async function uploadSignatureToSupabase(dataUrl, folder = 'misc', filename = '') {
    if (!dataUrl) return '';
    if (typeof dataUrl === 'string' && (dataUrl.startsWith('http://') || dataUrl.startsWith('https://'))) {
        return dataUrl;
    }
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
        return dataUrl;
    }
    const db = getSupabase();
    if (!db || !db.storage) return dataUrl;
    
    try {
        const parts = dataUrl.split(';base64,');
        if (parts.length < 2) return dataUrl;
        const contentType = parts[0].split(':')[1] || 'image/png';
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        const blob = new Blob([uInt8Array], { type: contentType });
        
        const ext = contentType.includes('webp') ? 'webp' : 'png';
        const cleanName = (filename || `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const filePath = `${folder}/${cleanName}.${ext}`;
        
        const { data, error } = await db.storage
            .from('signatures')
            .upload(filePath, blob, {
                cacheControl: '3600',
                upsert: true,
                contentType: contentType
            });
            
        if (error) {
            console.warn("Storage upload warning (fallback to Base64):", error);
            return dataUrl;
        }
        
        const { data: publicData } = db.storage.from('signatures').getPublicUrl(filePath);
        return (publicData && publicData.publicUrl) ? publicData.publicUrl : dataUrl;
    } catch (err) {
        console.error("uploadSignatureToSupabase error:", err);
        return dataUrl;
    }
}

/**
 * สคริปต์ย้ายลายเซ็น Base64 เก่าในฐานข้อมูลขึ้น Supabase Storage (One-Time Migration)
 */
window.migrateExistingSignaturesToStorage = async function() {
    const db = getSupabase();
    if (!db) {
        showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
        return;
    }
    setLoader(true);
    let convertedCount = 0;
    try {
        // 1. แปลงใน pk8_pk9
        const { data: pkRows, error: pkErr } = await db.from('pk8_pk9').select('*');
        if (!pkErr && pkRows) {
            for (const row of pkRows) {
                let updated = false;
                let hrSign = row.hr_sign;
                let saSign = row.sa_sign;
                let parentSign = row.parent_sign;

                if (hrSign && hrSign.startsWith('data:image')) {
                    hrSign = await uploadSignatureToSupabase(hrSign, 'pk8_pk9', `${row.student_id}_${row.doc_type}_${row.notice_count}_hr`);
                    updated = true;
                }
                if (saSign && saSign.startsWith('data:image')) {
                    saSign = await uploadSignatureToSupabase(saSign, 'pk8_pk9', `${row.student_id}_${row.doc_type}_${row.notice_count}_sa`);
                    updated = true;
                }
                if (parentSign && parentSign.startsWith('data:image')) {
                    parentSign = await uploadSignatureToSupabase(parentSign, 'pk8_pk9', `${row.student_id}_${row.doc_type}_${row.notice_count}_parent`);
                    updated = true;
                }

                if (updated) {
                    await db.from('pk8_pk9').update({
                        hr_sign: hrSign,
                        sa_sign: saSign,
                        parent_sign: parentSign
                    }).match({
                        student_id: row.student_id,
                        doc_type: row.doc_type,
                        notice_count: row.notice_count
                    });
                    convertedCount++;
                }
            }
        }

        // 2. แปลงใน pk11
        const { data: pk11Rows, error: pk11Err } = await db.from('pk11').select('*');
        if (!pk11Err && pk11Rows) {
            for (const row of pk11Rows) {
                let updated = false;
                let stdSign = row.student_signature;
                let parSign = row.parent_signature;
                let hrSign = row.hr_signature;
                let saSign = row.sa_signature;

                if (stdSign && stdSign.startsWith('data:image')) {
                    stdSign = await uploadSignatureToSupabase(stdSign, 'pk11', `${row.id}_student`);
                    updated = true;
                }
                if (parSign && parSign.startsWith('data:image')) {
                    parSign = await uploadSignatureToSupabase(parSign, 'pk11', `${row.id}_parent`);
                    updated = true;
                }
                if (hrSign && hrSign.startsWith('data:image')) {
                    hrSign = await uploadSignatureToSupabase(hrSign, 'pk11', `${row.id}_hr`);
                    updated = true;
                }
                if (saSign && saSign.startsWith('data:image')) {
                    saSign = await uploadSignatureToSupabase(saSign, 'pk11', `${row.id}_sa`);
                    updated = true;
                }

                if (updated) {
                    await db.from('pk11').update({
                        student_signature: stdSign,
                        parent_signature: parSign,
                        hr_signature: hrSign,
                        sa_signature: saSign
                    }).eq('id', row.id);
                    convertedCount++;
                }
            }
        }

        showToast(`ย้ายลายเซ็นขึ้น Cloud Storage สำเร็จ ${convertedCount} รายการ ⚡`, "success");
        await loadInitialData();
    } catch (e) {
        console.error("Migration error:", e);
        showToast("เกิดข้อผิดพลาดในการแปลงข้อมูลลายเซ็น", "error");
    } finally {
        setLoader(false);
    }
};

window.previewAtRiskDocument = async function() {
    if (!currentSigningStudent) return;
    await saveAtRiskTeachers(); // รอให้บันทึกเสร็จก่อนพรีวิว
    
    const backendKey = currentSigningStudent.backendKey;
    let saved = { hr: "", sa: "", hrSign: "", saSign: "", parentName: "", parentSign: "", docDate: "", reason: "" };
    if (atRiskTeachersCache && atRiskTeachersCache[backendKey]) {
        saved = { ...atRiskTeachersCache[backendKey] };
    }
    
    // โหลดลายเซ็นผู้ปกครองจาก documentsData (หากบันทึกจากหน้าเอกสารโดยตรง)
    if (typeof documentsData !== 'undefined' && documentsData.length > 0 && currentSigningStudent) {
        const fullDocType = currentSigningStudent.fullDocType;
        const docType = currentSigningStudent.docType;
        const studentId = currentSigningStudent.studentId;
        const existingDoc = documentsData.find(d => d.studentId === studentId && (d.documentType === fullDocType || d.documentType === docType));
        if (existingDoc && existingDoc.signatureBase64) {
            if (!saved.parentSign) saved.parentSign = existingDoc.signatureBase64;
        }
    }
    
    currentSigningStudent.homeroomTeacher = saved.hr;
    currentSigningStudent.headOfStudentAffairs = saved.sa;
    currentSigningStudent.parentName = saved.parentName;
    currentSigningStudent.reason = saved.reason || "";
    currentSigningStudent.hrSign = saved.hrSign;
    currentSigningStudent.saSign = saved.saSign;
    currentSigningStudent.parentSign = saved.parentSign || saved.signatureBase64;
    currentSigningStudent.signatureBase64 = saved.parentSign || saved.signatureBase64;
    currentSigningStudent.docDate = saved.docDate || "";
    
    const docToPrint = { ...currentSigningStudent, documentType: currentSigningStudent.fullDocType };
    
    closeAtRiskActionModal();
    await openDocumentPreview(docToPrint);
};

/* =========================================================
 * 13. ระบบ E-Signature และออกเอกสารอัตโนมัติ
 * ========================================================= */
let signaturePadCanvas = null;
let signaturePadCtx = null;
let isDrawingSignature = false;
let currentSigningStudent = null;

function getCanvasPoint(e) {
    if (!signaturePadCanvas) return { x: 0, y: 0 };
    const rect = signaturePadCanvas.getBoundingClientRect();
    const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
    
    // คำนวณ scale factor ป้องกันปัญหานิ้วจิ้มไม่ตรงจุดบนหน้าจอมือถือ/แท็บเล็ต
    const scaleX = rect.width > 0 ? (signaturePadCanvas.width / rect.width) : 1;
    const scaleY = rect.height > 0 ? (signaturePadCanvas.height / rect.height) : 1;
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function initSignaturePad() {
    signaturePadCanvas = document.getElementById("signature-pad");
    if (!signaturePadCanvas) return;
    
    signaturePadCtx = signaturePadCanvas.getContext("2d");
    signaturePadCtx.lineWidth = 3;
    signaturePadCtx.lineCap = "round";
    signaturePadCtx.lineJoin = "round";
    signaturePadCtx.strokeStyle = "#000080"; // หมึกน้ำเงินเข้ม
    
    if (signaturePadCanvas.dataset.bound === 'true') return;
    signaturePadCanvas.dataset.bound = 'true';
    
    // Mouse events
    signaturePadCanvas.addEventListener("mousedown", (e) => {
        isDrawingSignature = true;
        const pt = getCanvasPoint(e);
        signaturePadCtx.beginPath();
        signaturePadCtx.moveTo(pt.x, pt.y);
    });
    
    signaturePadCanvas.addEventListener("mousemove", (e) => {
        if (!isDrawingSignature) return;
        const pt = getCanvasPoint(e);
        signaturePadCtx.lineTo(pt.x, pt.y);
        signaturePadCtx.stroke();
    });
    
    signaturePadCanvas.addEventListener("mouseup", () => isDrawingSignature = false);
    signaturePadCanvas.addEventListener("mouseleave", () => isDrawingSignature = false);
    
    // Touch events for Mobile/Tablet
    signaturePadCanvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        isDrawingSignature = true;
        const pt = getCanvasPoint(e);
        signaturePadCtx.beginPath();
        signaturePadCtx.moveTo(pt.x, pt.y);
    }, {passive: false});
    
    signaturePadCanvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (!isDrawingSignature) return;
        const pt = getCanvasPoint(e);
        signaturePadCtx.lineTo(pt.x, pt.y);
        signaturePadCtx.stroke();
    }, {passive: false});
    
    signaturePadCanvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        isDrawingSignature = false;
    }, {passive: false});
    signaturePadCanvas.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        isDrawingSignature = false;
    }, {passive: false});
}

window.openSignatureFor = function(studentId, fullName, gradeRoom, docType) {
    const hrSelect = document.getElementById(`hr-${studentId}`);
    const saSelect = document.getElementById(`sa-${studentId}`);
    
    const homeroomTeacher = hrSelect ? hrSelect.value : "";
    const headOfStudentAffairs = saSelect ? saSelect.value : "";
    
    currentSigningStudent = { studentId, fullName, gradeRoom, docType, homeroomTeacher, headOfStudentAffairs };
    openDocumentPreview(currentSigningStudent);
};

window.openDocumentPreview = async function(studentInfo) {
    // ถ้ายังไม่มีสถิติรายละเอียดประวัติวันขาด/สาย ให้หมุนโหลดสั้นๆ เพื่อดึงวันที่ย้อนหลังมาแสดง
    if (!allStatsData) {
        setLoader(true);
        try {
            await fetchStatsDataOnce();
        } catch (e) {
            console.warn("Could not fetch stats data for document:", e);
        } finally {
            setLoader(false);
        }
    }

    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    
    // คำนวณวันที่ออกหนังสือ:
    // 1. ถ้ามีวันที่ล็อค/บันทึกไว้ใน studentInfo หรือใน Cache ให้ใช้วันที่นั้น
    // 2. ถ้าไม่มี ให้ใช้วันที่ปัจจุบัน (today)
    let formattedDate = "";
    let targetDateStr = studentInfo.docDate || studentInfo.targetDate || studentInfo.date || studentInfo.createdAt;
    if (!targetDateStr && studentInfo.backendKey && atRiskTeachersCache && atRiskTeachersCache[studentInfo.backendKey]) {
        targetDateStr = atRiskTeachersCache[studentInfo.backendKey].docDate;
    }
    
    if (targetDateStr) {
        if (targetDateStr.includes('-')) {
            const parts = targetDateStr.split('-');
            if (parts.length === 3) {
                const y = parseInt(parts[0], 10) + 543;
                const m = parseInt(parts[1], 10) - 1;
                const d = parseInt(parts[2], 10);
                if (!isNaN(y) && !isNaN(m) && !isNaN(d) && thaiMonths[m]) {
                    formattedDate = `${d} ${thaiMonths[m]} ${y}`;
                }
            }
        } else {
            formattedDate = targetDateStr;
        }
    }
    
    if (!formattedDate) {
        const today = new Date();
        formattedDate = `${today.getDate()} ${thaiMonths[today.getMonth()]} ${today.getFullYear() + 543}`;
    }
    
    // ตรวจสอบหมายเลขครั้งที่ (noticeCount)
    let noticeCount = extractNoticeCount(studentInfo.noticeCount || studentInfo.documentType || studentInfo.fullDocType, 1);
    studentInfo.noticeCount = noticeCount;

function formatThaiDateString(dateInput) {
    if (!dateInput) return "";
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    
    let str = String(dateInput).trim();
    let y, m, d;
    
    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length === 3) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10) - 1;
            d = parseInt(parts[2], 10);
        }
    } else if (str.length === 8 && !isNaN(str)) {
        y = parseInt(str.substring(0, 4), 10);
        m = parseInt(str.substring(4, 6), 10) - 1;
        d = parseInt(str.substring(6, 8), 10);
    } else {
        const dt = new Date(str);
        if (!isNaN(dt.getTime())) {
            y = dt.getFullYear();
            m = dt.getMonth();
            d = dt.getDate();
        }
    }
    
    if (y && m !== undefined && !isNaN(m) && d && thaiMonths[m]) {
        return `${d} ${thaiMonths[m]} ${y + 543}`;
    }
    return str;
}

    // ดึงวันที่ขาดและสายจาก allStatsData เรียงลำดับจากวันแรกสุดไปหาวันล่าสุด (Ascending)
    if (allStatsData && allStatsData.logs) {
        const studentLogs = allStatsData.logs
            .filter(log => log.studentId === studentInfo.studentId)
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));

        const allAbsentDates = studentLogs
            .filter(log => log.status === 'ขาด')
            .map(log => formatThaiDateString(log.date));
            
        const allLateDates = studentLogs
            .filter(log => log.status === 'สาย')
            .map(log => formatThaiDateString(log.date));

        studentInfo.allAbsentDates = allAbsentDates;
        studentInfo.allLateDates = allLateDates;

        // แยกตามเกณฑ์ของโรงเรียน:
        // ป.ค.8 (มาสาย):
        // ครั้งที่ 1: สาย 3 ครั้ง -> แสดงวันที่สาย 3 วันแรก (วันที่ 1 ถึง 3)
        // ครั้งที่ 2: สาย 5 ครั้ง -> แสดงวันที่สาย 5 วันแรก (วันที่ 1 ถึง 5)
        // ครั้งที่ 3: สาย 8 ครั้งขึ้นไป -> แสดงวันที่สายครบทุกวัน
        // ป.ค.9 (ขาดเรียน):
        // ครั้งที่ 1: ขาด 3 วัน -> แสดงวันที่ขาด 3 วันแรก (วันที่ 1 ถึง 3)
        // ครั้งที่ 2: ขาด 6 วัน -> แสดงวันที่ขาด 6 วันแรก (วันที่ 1 ถึง 6)
        // ครั้งที่ 3: ขาด 9 วันขึ้นไป -> แสดงวันที่ขาดครบทุกวัน
        if (noticeCount === 1) {
            studentInfo.lateDates = allLateDates.slice(0, 3);
            studentInfo.absentDates = allAbsentDates.slice(0, 3);
        } else if (noticeCount === 2) {
            studentInfo.lateDates = allLateDates.slice(0, 5);
            studentInfo.absentDates = allAbsentDates.slice(0, 6);
        } else {
            studentInfo.lateDates = allLateDates;
            studentInfo.absentDates = allAbsentDates;
        }
    }

    const actualDocTypeForSave = studentInfo.documentType || studentInfo.docType;

    const btnOpenSig = document.getElementById("btn-open-signature");
    const btnSaveSig = document.getElementById("btn-save-signature");
    
    if (btnOpenSig) btnOpenSig.style.display = "inline-flex";
    if (btnSaveSig) btnSaveSig.style.display = "none";

    let signatureHtml = "";
    if (studentInfo.tempSignature || studentInfo.parentSign || studentInfo.signatureBase64) {
        signatureHtml = `<img src="${studentInfo.tempSignature || studentInfo.parentSign || studentInfo.signatureBase64}" style="max-height: 80px;" alt="ลายเซ็นผู้ปกครอง"><br>`;
    } else {
        signatureHtml = `<div style="height: 80px;"></div>`;
    }
    
    // เรียกใช้งานเทมเพลตจาก documents.js
    const htmlContent = generateDocumentHtml(studentInfo, signatureHtml, formattedDate);
    
    const dock = document.querySelector('.mac-dock');
    if (dock) dock.style.zIndex = '100';
    
    document.getElementById("document-print-area").innerHTML = htmlContent;
    if (typeof tintAllSignatures === 'function') {
        tintAllSignatures().then(() => {
            document.getElementById("modal-document-preview").classList.add("active");
        });
    } else {
        document.getElementById("modal-document-preview").classList.add("active");
    }
};

window.closeDocumentPreview = function() {
    const dock = document.querySelector('.mac-dock');
    if (dock) dock.style.zIndex = '';
    
    document.getElementById("modal-document-preview").classList.remove("active");
};

window.openSignatureFromPreview = function() {
    openTeacherSignature('parent');
};

window.openTeacherModalFromPreview = function() {
    closeDocumentPreview();
    if (!currentSigningStudent) {
        console.warn("No currentSigningStudent found in openTeacherModalFromPreview");
        return;
    }
    const role = (loggedInUser && loggedInUser.role) ? loggedInUser.role : 
                 (authenticatedAdminPin ? "ADMIN" : "ANY");
    
    openNoticeActionModal(
        currentSigningStudent.studentId, 
        currentSigningStudent.fullName, 
        currentSigningStudent.gradeRoom, 
        currentSigningStudent.docType, 
        currentSigningStudent.fullDocType, 
        role, 
        currentSigningStudent.backendKey,
        currentSigningStudent.noticeCount
    );
};

window.currentSigningTeacherRole = null;

window.openTeacherSignature = function(targetRoleOrId) {
    let roleName = 'ลายเซ็น';
    if (targetRoleOrId === 'hr') {
        window.currentSigningTeacherRole = 'hr';
        window.pk11SignatureTarget = '';
        roleName = 'ครูที่ปรึกษา';
    } else if (targetRoleOrId === 'sa') {
        window.currentSigningTeacherRole = 'sa';
        window.pk11SignatureTarget = '';
        roleName = 'หัวหน้ากิจการนักเรียน';
    } else if (targetRoleOrId === 'parent') {
        window.currentSigningTeacherRole = 'parent';
        window.pk11SignatureTarget = '';
        roleName = 'ผู้ปกครองนักเรียน';
    } else if (typeof targetRoleOrId === 'string' && targetRoleOrId.startsWith('pk11-')) {
        window.pk11SignatureTarget = targetRoleOrId;
        window.currentSigningTeacherRole = null;
        if (targetRoleOrId === 'pk11-student') roleName = 'นักเรียน (ป.ค.11)';
        else if (targetRoleOrId === 'pk11-parent') roleName = 'ผู้ปกครอง (ป.ค.11)';
        else if (targetRoleOrId === 'pk11-hr') roleName = 'ครูที่ปรึกษา (ป.ค.11)';
        else if (targetRoleOrId === 'pk11-sa') roleName = 'หัวหน้ากิจการนักเรียน (ป.ค.11)';
    } else {
        window.currentSigningTeacherRole = null;
        window.pk11SignatureTarget = '';
        roleName = (currentSigningStudent && currentSigningStudent.fullName) ? `ผู้ปกครอง: ${currentSigningStudent.fullName}` : 'ผู้ปกครอง';
    }

    const titleEl = document.getElementById("signature-modal-title");
    if (titleEl) titleEl.innerText = `เซ็นชื่อ: ${roleName}`;

    const modal = document.getElementById("modal-signature");
    if (modal) modal.classList.add("active");

    const canvas = document.getElementById('signature-pad');
    if (canvas) {
        if (!signaturePad && typeof SignaturePad !== 'undefined') {
            signaturePad = new SignaturePad(canvas, {
                backgroundColor: 'rgba(255, 255, 255, 0)',
                penColor: '#000080'
            });
        }
        setTimeout(() => {
            if (canvas.offsetWidth > 0) {
                const ratio = Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                const ctx = canvas.getContext("2d");
                if (ctx) ctx.scale(ratio, ratio);
            }
            if (signaturePad) {
                signaturePad.clear();
            } else if (signaturePadCtx) {
                signaturePadCtx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }, 50);
    }
};

window.clearTeacherSignature = function(targetRoleOrId) {
    if (targetRoleOrId === 'hr') {
        window.tempHrSign = "CLEARED";
        const img = document.getElementById("hr-signature-preview");
        const container = document.getElementById("hr-signature-preview-container");
        if (img) img.src = "";
        if (container) container.style.display = "none";
    } else if (targetRoleOrId === 'sa') {
        window.tempSaSign = "CLEARED";
        const img = document.getElementById("sa-signature-preview");
        const container = document.getElementById("sa-signature-preview-container");
        if (img) img.src = "";
        if (container) container.style.display = "none";
    } else if (targetRoleOrId === 'parent') {
        window.tempParentSign = "CLEARED";
        const img = document.getElementById("parent-signature-preview");
        const container = document.getElementById("parent-signature-preview-container");
        if (img) img.src = "";
        if (container) container.style.display = "none";
    } else if (typeof targetRoleOrId === 'string') {
        const img = document.getElementById(`${targetRoleOrId}-signature-preview`);
        const container = document.getElementById(`${targetRoleOrId}-signature-preview-container`);
        if (img) img.src = '';
        if (container) container.style.display = 'none';
    }
};

window.clearSignature = function() {
    if (typeof signaturePad !== 'undefined' && signaturePad) {
        signaturePad.clear();
    } else {
        const canvas = document.getElementById('signature-pad');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
};

window.triggerSignatureUpload = function() {
    const input = document.getElementById("signature-upload-input");
    if (input) input.click();
};

window.handleSignatureFileUpload = function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        const dataUrl = evt.target.result;
        const img = new Image();
        img.onload = function() {
            const canvas = document.getElementById('signature-pad');
            if (!canvas) return;

            // 1. สร้าง Offscreen Canvas เพื่อวิเคราะห์และตัดขอบว่างรอบลายเซ็น (Auto-Crop / Auto-Trim)
            const offCanvas = document.createElement('canvas');
            offCanvas.width = img.naturalWidth || img.width;
            offCanvas.height = img.naturalHeight || img.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(img, 0, 0);

            let minX = offCanvas.width, minY = offCanvas.height, maxX = 0, maxY = 0;
            let hasVisiblePixel = false;

            try {
                const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
                const d = imgData.data;
                const w = offCanvas.width;
                const h = offCanvas.height;

                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = (y * w + x) * 4;
                        const r = d[idx];
                        const g = d[idx + 1];
                        const b = d[idx + 2];
                        const a = d[idx + 3];

                        // ตรวจจับพิกเซลที่ไม่ใช่พื้นหลังโปร่งใส และไม่ใช่สีขาวล้วน
                        const isVisible = a > 25 && (r < 240 || g < 240 || b < 240);
                        if (isVisible) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                            hasVisiblePixel = true;
                        }
                    }
                }
            } catch (cropErr) {
                console.warn("Auto-crop fallback to full image:", cropErr);
            }

            if (!hasVisiblePixel) {
                minX = 0; minY = 0; maxX = offCanvas.width; maxY = offCanvas.height;
            }

            const cropW = Math.max(maxX - minX + 1, 1);
            const cropH = Math.max(maxY - minY + 1, 1);

            // 2. เคลียร์ Canvas และรีเซ็ต Transform เพื่อวาดในพิกัดจริง
            if (typeof signaturePad !== 'undefined' && signaturePad) {
                signaturePad.clear();
            }

            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0); // รีเซ็ตการซูม retina ให้วาดตรงพิกัดจริง
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 3. ปรับขนาดสัดส่วนมาตรฐานให้อยู่กึ่งกลางกรอบอย่างสมส่วน
            const maxAllowedW = canvas.width * 0.76;
            const maxAllowedH = canvas.height * 0.68;
            const scale = Math.min(maxAllowedW / cropW, maxAllowedH / cropH, 2.0);

            const finalW = cropW * scale;
            const finalH = cropH * scale;
            const finalX = (canvas.width - finalW) / 2;
            const finalY = (canvas.height - finalH) / 2;

            // 4. วาดเฉพาะส่วนของลายเซ็นที่ตัดขอบแล้วให้อยู่ตรงกลาง
            ctx.drawImage(offCanvas, minX, minY, cropW, cropH, finalX, finalY, finalW, finalH);
            ctx.restore();

            if (typeof signaturePad !== 'undefined' && signaturePad) {
                signaturePad._isEmpty = false;
            }

            showToast("เพิ่มรูปภาพลายเซ็น (ตัดขอบและจัดกึ่งกลางอัตโนมัติ) เรียบร้อยแล้ว ⚡", "success");
        };
        img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
};

window.closeSignatureModal = function() {
    const modal = document.getElementById("modal-signature");
    if (modal) modal.classList.remove("active");
};

function getTrimmedSignatureDataUrl(sourceCanvas) {
    if (!sourceCanvas) return "";
    if (typeof signaturePad !== 'undefined' && signaturePad && !signaturePad.isEmpty()) {
        return signaturePad.toDataURL('image/png');
    }
    return sourceCanvas.toDataURL('image/png');
}

window.saveSignature = function() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas) return;

    // บันทึกภาพลายเซ็นตามขนาดสเกลที่ผู้ใช้ปรับไว้ใน Canvas อย่างแม่นยำ
    const dataUrl = getTrimmedSignatureDataUrl(canvas);

    if (!dataUrl || dataUrl.length < 100) {
        if (typeof showToast === 'function') showToast("กรุณาวาดลายเซ็นก่อนกดยืนยัน", "warning");
        return;
    }

    closeSignatureModal();

    if (window.pk11SignatureTarget) {
        const target = window.pk11SignatureTarget;
        const img = document.getElementById(`${target}-signature-preview`);
        const container = document.getElementById(`${target}-signature-preview-container`);
        if (img) img.src = dataUrl;
        if (container) container.style.display = 'block';
        window.pk11SignatureTarget = '';
    } else if (window.currentSigningTeacherRole === 'hr') {
        window.tempHrSign = dataUrl;
        const img = document.getElementById("hr-signature-preview");
        const container = document.getElementById("hr-signature-preview-container");
        if (img) img.src = dataUrl;
        if (container) container.style.display = 'block';
        window.currentSigningTeacherRole = null;
    } else if (window.currentSigningTeacherRole === 'sa') {
        window.tempSaSign = dataUrl;
        const img = document.getElementById("sa-signature-preview");
        const container = document.getElementById("sa-signature-preview-container");
        if (img) img.src = dataUrl;
        if (container) container.style.display = 'block';
        window.currentSigningTeacherRole = null;
    } else if (window.currentSigningTeacherRole === 'parent') {
        window.tempParentSign = dataUrl;
        const img = document.getElementById("parent-signature-preview");
        const container = document.getElementById("parent-signature-preview-container");
        if (img) img.src = dataUrl;
        if (container) container.style.display = 'block';
        if (currentSigningStudent) {
            currentSigningStudent.parentSign = dataUrl;
            currentSigningStudent.signatureBase64 = dataUrl;
            currentSigningStudent.tempSignature = dataUrl;
        }
        window.currentSigningTeacherRole = null;
    } else if (currentSigningStudent) {
        currentSigningStudent.tempSignature = dataUrl;
        currentSigningStudent.parentSign = dataUrl;
        currentSigningStudent.signatureBase64 = dataUrl;
        openDocumentPreview(currentSigningStudent);
    }
};

window.saveDocumentData = async function() {
    if (!currentSigningStudent || !currentSigningStudent.tempSignature) return;
    setLoader(true);
    
    const actualDocTypeForSave = currentSigningStudent.fullDocType || currentSigningStudent.documentType || currentSigningStudent.docType;
    const studentId = currentSigningStudent.studentId;
    const sig = currentSigningStudent.tempSignature;
    
    let docType = currentSigningStudent.docType || '';
    if (!docType && actualDocTypeForSave) {
        docType = actualDocTypeForSave.includes('ป.ค.8') ? 'ป.ค.8' : (actualDocTypeForSave.includes('ป.ค.9') ? 'ป.ค.9' : '');
    }
    
    let noticeCount = currentSigningStudent.noticeCount;
    if (!noticeCount && actualDocTypeForSave) {
        noticeCount = extractNoticeCount(actualDocTypeForSave);
    }
    if (!noticeCount && currentSigningStudent.backendKey) {
        noticeCount = extractNoticeCount(currentSigningStudent.backendKey);
    }
    noticeCount = parseInt(noticeCount) || 1;
    
    const db = getSupabase();
    if (db) {
        try {
            const uploadedSigUrl = await uploadSignatureToSupabase(sig, 'pk8_pk9', `${studentId}_${docType}_${noticeCount}_parent`);

            const { error: dbErr } = await db.from('pk8_pk9').upsert({
                student_id: studentId,
                doc_type: docType,
                notice_count: noticeCount,
                parent_sign: uploadedSigUrl
            });
            if (dbErr) throw dbErr;
            
            showToast(`บันทึกลายเซ็นผู้ปกครอง ${docType} (ครั้งที่ ${noticeCount}) สำเร็จ ⚡`, "success");
            const btnSaveSig = document.getElementById("btn-save-signature");
            if (btnSaveSig) btnSaveSig.style.display = "none";
            
            // อัปเดต Cache ให้ครบทุกคีย์
            const backendKey = currentSigningStudent.backendKey || `${studentId}|${docType}|ครั้งที่${noticeCount}`;
            if (!atRiskTeachersCache) atRiskTeachersCache = {};
            if (!atRiskTeachersCache[backendKey]) {
                atRiskTeachersCache[backendKey] = { hr: "", sa: "", hrSign: "", saSign: "", parentName: "", parentSign: "", docDate: "", reason: "" };
            }
            atRiskTeachersCache[backendKey].parentSign = uploadedSigUrl;
            atRiskTeachersCache[backendKey].signatureBase64 = uploadedSigUrl;
            atRiskTeachersCache[`${studentId}|${docType}|ครั้งที่${noticeCount}`] = atRiskTeachersCache[backendKey];
            atRiskTeachersCache[`${studentId}|${docType}|${noticeCount}`] = atRiskTeachersCache[backendKey];
            atRiskTeachersCache[`${studentId}|${docType}_ครั้งที่${noticeCount}`] = atRiskTeachersCache[backendKey];

            documentsData.push({
                studentId: studentId,
                documentType: `${docType}_ครั้งที่${noticeCount}`,
                signatureBase64: uploadedSigUrl
            });
            if (typeof renderAtRiskStudents === 'function') {
                renderAtRiskStudents();
            }
        } catch (err) {
            console.error("Supabase saveDocumentData error:", err);
            showToast("เกิดข้อผิดพลาดในการบันทึกลายเซ็น", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

window.exportDocumentToPdf = async function() {
    const element = document.getElementById("document-print-area");
    const scaleWrapper = document.getElementById("doc-preview-scale-wrapper");
    if (!element) {
        if (typeof showToast === 'function') showToast("ไม่พบข้อมูลเอกสาร", "error");
        return;
    }
    
    // ตั้งชื่อไฟล์
    let docTypeStr = 'เอกสาร';
    let studentNameStr = 'นักเรียน';
    
    if (typeof currentSigningStudent !== 'undefined' && currentSigningStudent) {
        docTypeStr = currentSigningStudent.fullDocType || currentSigningStudent.documentType || currentSigningStudent.docType || 'เอกสาร';
        studentNameStr = (currentSigningStudent.fullName || 'นักเรียน').replace(/\s+/g, '_');
    } else if (window.currentPk11Student) {
        docTypeStr = 'ป.ค.11';
        studentNameStr = (window.currentPk11Student.fullName || 'นักเรียน').replace(/\s+/g, '_');
    }
    
    const fileName = `${docTypeStr}_${studentNameStr}.pdf`;
    
    if (typeof showToast === 'function') {
        showToast("กำลังสร้างไฟล์ PDF กรุณารอสักครู่...", "info");
    }
    if (typeof setLoader === 'function') {
        setLoader(true);
    }
    
    try {
        if (typeof ensurePdfLibrariesLoaded === 'function') {
            await ensurePdfLibrariesLoaded();
        }
        
        if (!window.html2canvas) {
            throw new Error("html2canvas ไม่พร้อมใช้งาน");
        }
        
        const jsPdfLib = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
        if (!jsPdfLib) {
            throw new Error("jsPDF ไม่พร้อมใช้งาน");
        }
        
        // Reset scale wrapper ชั่วคราวเพื่อให้ html2canvas จับภาพขนาดเต็ม A4 คมชัดสูง
        const prevTransform = scaleWrapper ? scaleWrapper.style.transform : '';
        const prevMargin = scaleWrapper ? scaleWrapper.style.margin : '';
        const prevMarginBottom = scaleWrapper ? scaleWrapper.style.marginBottom : '';
        const prevTransformOrigin = scaleWrapper ? scaleWrapper.style.transformOrigin : '';
        
        if (scaleWrapper) {
            scaleWrapper.style.transform = 'none';
            scaleWrapper.style.margin = '0 auto';
            scaleWrapper.style.marginBottom = '0px';
        }
        
        // รอรูปภาพทั้งหมดโหลดเสร็จสมบูรณ์ก่อน
        const images = element.querySelectorAll('img');
        const imgPromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        });
        await Promise.all(imgPromises);

        // รอเล็กน้อยให้ DOM render รูปแบบไม่ scale
        await new Promise(r => setTimeout(r, 100));

        const canvas = await window.html2canvas(element, {
            scale: 2, // 2x scale คมชัดสูงมากสำหรับเอกสารราชการ
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        // คืนค่า scale wrapper กลับเป็นแบบ Auto-Fit สำหรับมือถือ
        if (typeof autoFitDocumentPreviewToScreen === 'function') {
            autoFitDocumentPreviewToScreen();
        } else if (scaleWrapper) {
            scaleWrapper.style.transform = prevTransform;
            scaleWrapper.style.margin = prevMargin;
            scaleWrapper.style.marginBottom = prevMarginBottom;
            scaleWrapper.style.transformOrigin = prevTransformOrigin;
        }
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        const pdf = new jsPdfLib({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
        });
        
        const pageWidth = 210;
        const pageHeight = 297;
        
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const imgHeightInMm = (canvasHeight * pageWidth) / canvasWidth;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, Math.min(imgHeightInMm, pageHeight), undefined, 'FAST');
        
        pdf.save(fileName);
        
        if (typeof showToast === 'function') {
            showToast("บันทึกไฟล์ PDF เรียบร้อยแล้ว 📄", "success");
        }
    } catch (err) {
        console.error("Error exporting PDF:", err);
        if (typeof autoFitDocumentPreviewToScreen === 'function') {
            autoFitDocumentPreviewToScreen();
        }
        if (typeof showToast === 'function') {
            showToast("เกิดข้อผิดพลาด: " + (err.message || "กรุณาลองใหม่อีกครั้ง"), "error");
        }
    } finally {
        if (typeof setLoader === 'function') {
            setLoader(false);
        }
    }
};

window.printDocument = function() {
    const printContents = document.getElementById("document-print-area")?.innerHTML;
    if (!printContents) return;
    
    // สร้าง div ชั่วคราวเพื่อใช้ปริ้นท์โดยเฉพาะ
    const printWrapper = document.createElement('div');
    printWrapper.className = 'print-only-wrapper';
    printWrapper.id = 'temporary-print-wrapper';
    printWrapper.innerHTML = printContents;
    
    // ยัด div ใส่ body
    document.body.appendChild(printWrapper);
    
    // ซ่อน mac-dock ชั่วคราวด้วย JS เพื่อป้องกันบั๊กเบราว์เซอร์มือถือบางรุ่น
    const dock = document.querySelector('.mac-dock');
    const originalDockDisplay = dock ? dock.style.display : '';
    if (dock) dock.style.display = 'none';
    
    const cleanup = () => {
        const temp = document.getElementById('temporary-print-wrapper');
        if (temp) temp.remove();
        if (dock) dock.style.display = originalDockDisplay;
        window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    // สั่งปริ้นท์
    setTimeout(() => {
        window.print();
        // Fallback cleanup หลัง 2.5 วินาที สำหรับอุปกรณ์ที่ไม่ส่ง afterprint event
        setTimeout(cleanup, 2500);
    }, 200);
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
    
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    
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
    if (mobileMenuBtn) mobileMenuBtn.onclick = toggleStartMenu;
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
                    window.switchCheckingDate(dateStr);
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
                window.switchCheckingDate(e.target.value);
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
    
    const btnAddHoliday = document.getElementById("btn-add-holiday");
    if (btnAddHoliday) {
        btnAddHoliday.onclick = () => { addHoliday(); };
    }
    
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
            const db = getSupabase();
            if (db) {
                try {
                    const { error } = await db.from('att').delete().neq('id', 0);
                    if (error) throw error;
                    showToast("ล้างประวัติเวลาเรียนทั้งหมดเรียบร้อยแล้ว ⚡");
                    document.getElementById("modal-admin").classList.remove("active");
                    await loadInitialData();
                } catch (dbErr) {
                    console.error("Supabase clear attendance error:", dbErr);
                    showToast("เกิดข้อผิดพลาดในการล้างข้อมูล", "error");
                } finally {
                    setLoader(false);
                }
            } else {
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
        requestLogin("ANY", (pinCode, userName, role) => {
            submitMisconduct(pinCode, userName);
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
                let st = translateAbbreviationToStatus(log.status);
                if (!sStats[sid]) sStats[sid] = { a: 0, l: 0 };
                if (st === 'ขาด') sStats[sid].a++;
                if (st === 'สาย') sStats[sid].l++;
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
        
        let atRiskNotice = hasAtRisk ? ` <span class="badge-at-risk-pulse">ติดตาม ⚠️</span>` : '';
        statsTab.innerHTML = `สรุป${atRiskNotice}`;
        if (hasAtRisk) {
            statsTab.classList.add('tab-at-risk-glow');
        } else {
            statsTab.classList.remove('tab-at-risk-glow');
        }
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
    
    const logs = allStatsData.logs;
    let cumulativeStudentStats = {};
    
    logs.forEach(log => {
        if (log.room === `${selectedRoom.grade}/${selectedRoom.room}`) {
            let st = translateAbbreviationToStatus(log.status);
            let sid = log.studentId;
            
            if (!cumulativeStudentStats[sid]) {
                cumulativeStudentStats[sid] = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: 0 };
            }
            if (st === 'มา') cumulativeStudentStats[sid].Present++;
            else if (st === 'ลา') cumulativeStudentStats[sid].Leave++;
            else if (st === 'ขาด') cumulativeStudentStats[sid].Absent++;
            else if (st === 'สาย') cumulativeStudentStats[sid].Late++;
            else if (st === 'โดด') cumulativeStudentStats[sid].Cut++;
            cumulativeStudentStats[sid].Total++;
        }
    });
    
    let roomStudents = students.filter(s => s.grade === selectedRoom.grade && s.room === selectedRoom.room);
    
    const summaryContainer = document.getElementById('room-tab-stats-summary');
    if (summaryContainer) {
        const atRiskStudents = [];
        roomStudents.forEach(st => {
            let sid = st.studentId;
            let a = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Absent : 0;
            let s = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Late : 0;
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
                if (st.absent >= 3 && st.late >= 3) badge = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 6px; font-size: 11px; margin-left: 5px; font-weight: bold;">ขาดสะสม ${st.absent} | สายสะสม ${st.late}</span>`;
                else if (st.absent >= 3) badge = `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 6px; font-size: 11px; margin-left: 5px; font-weight: bold;">ขาดสะสม ${st.absent}</span>`;
                else if (st.late >= 3) badge = `<span style="background: #ffedd5; color: #c2410c; padding: 2px 6px; border-radius: 6px; font-size: 11px; margin-left: 5px; font-weight: bold;">สายสะสม ${st.late}</span>`;
                return `<div onclick="if(typeof jumpToTracking === 'function') jumpToTracking('${selectedRoom.grade}/${selectedRoom.room}');" style="background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 6px 14px; font-size: 13px; display: inline-flex; align-items: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: all 0.2s;">
                    <i class="fa-solid fa-user" style="color: #64748b; margin-right: 6px;"></i> ${st.fullName} ${badge}
                </div>`;
            }).join('');
            
            summaryContainer.innerHTML = `
                <div style="width: 100%; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(8px); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 15px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.05);">
                    <div style="display: flex; align-items: center; margin-bottom: 12px; color: #b91c1c;">
                        <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px; font-size: 16px;"></i>
                        <strong style="font-size: 15px;">นักเรียนที่ขาดหรือสายเกินเกณฑ์</strong>
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
        let p = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Present : 0;
        let l = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Leave : 0;
        let a = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Absent : 0;
        let s = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Late : 0;
        let c = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Cut : 0;
        let t = cumulativeStudentStats[sid] ? cumulativeStudentStats[sid].Total : 0;
        
        let isAtRisk = (a >= 3 || s >= 3);
        let nameIcon = isAtRisk ? '<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-right: 6px;"></i>' : '';
        
        let totalPresent = p + s + c;
        let percent = t > 0 ? Math.round((totalPresent / t) * 100) : 0;
        let percentColor = percent >= 80 ? 'var(--color-present)' : (percent >= 60 ? 'var(--color-late)' : 'var(--color-absent)');

        let row = document.createElement('tr');
        if (isAtRisk) {
            row.style.backgroundColor = '#fef2f2';
            row.style.cursor = 'pointer';
            row.title = 'คลิกเพื่อติดตามนักเรียน (ขาดสะสม ' + a + ' / สายสะสม ' + s + ')';
            row.onclick = () => { if(typeof jumpToTracking === 'function') jumpToTracking(`${selectedRoom.grade}/${selectedRoom.room}`); };
            
            let td1 = `<td class="txt-center" style="border-left: 4px solid #ef4444; vertical-align: middle;">${st.no}</td>`;
            row.innerHTML = `
                ${td1}
                <td style="padding: 10px 15px;">
                    <div style="color: #b91c1c; font-weight: 500; margin-bottom: 6px;">${nameIcon}${st.fullName} <span style="font-size: 11px; font-weight: normal; color: #ef4444;">(สะสม: ข.${a} ส.${s})</span></div>
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
                const st = translateAbbreviationToStatus(status);
                if (st === "มา") { statusChar = "ม"; classStyle = "status-present"; }
                else if (st === "ลา") { statusChar = "ล"; classStyle = "status-leave"; }
                else if (st === "ขาด") { statusChar = "ข"; classStyle = "status-absent"; }
                else if (st === "สาย") { statusChar = "ส"; classStyle = "status-late"; }
                else if (st === "โดด") { statusChar = "ด"; classStyle = "status-cut"; }
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

window.jumpToTracking = function(roomKey) {
    switchView("at-risk");
    
    setTimeout(() => {
        const roomFilterSelect = document.getElementById('at-risk-room-filter');
        const filterSelect = document.getElementById('at-risk-filter');
        
        if (filterSelect) {
            filterSelect.value = 'all'; // Default secondary filter to 'all' so no student is hidden by status
        }
        
        if (roomFilterSelect) {
            // Ensure options are populated from all school rooms
            if (!roomFilterSelect.getAttribute('data-populated') || roomFilterSelect.options.length <= 1) {
                renderAtRiskStudents();
            }
            
            if (roomKey && Array.from(roomFilterSelect.options).some(o => o.value === roomKey)) {
                roomFilterSelect.value = roomKey;
            } else {
                roomFilterSelect.value = 'ALL';
            }
            renderAtRiskStudents();
        }
    }, 50);
};

/* =========================================================
 * 14. ระบบผ่อนผันนักเรียนกลุ่มเสี่ยง (Exemption System)
 * ========================================================= */
window.openExemptionModal = function(targetStudentId) {
    let currentRole = null;
    if (authenticatedAdminPin) {
        currentRole = "ADMIN";
    } else if (loggedInUser) {
        currentRole = loggedInUser.role;
    }
    
    if (currentRole === "ADMIN" || currentRole === "STUDENT_AFFAIRS" || currentRole === "กิจการนักเรียน") {
        openExemptionModalInner(targetStudentId);
    } else if (currentRole) {
        if (typeof showToast === 'function') {
            showToast("คุณไม่มีสิทธิ์ในการดำเนินรายการนี้ (เฉพาะแอดมินหรือฝ่ายกิจการฯ เท่านั้น)", "error");
        } else {
            alert("คุณไม่มีสิทธิ์ในการดำเนินรายการนี้");
        }
    } else {
        requestLogin("STUDENT_AFFAIRS_ONLY", (pin, name, role) => {
            if (role === "ADMIN" || role === "STUDENT_AFFAIRS" || role === "กิจการนักเรียน") {
                openExemptionModalInner(targetStudentId);
            } else {
                if (typeof showToast === 'function') {
                    showToast("คุณไม่มีสิทธิ์ในการดำเนินรายการนี้ (เฉพาะแอดมินหรือฝ่ายกิจการฯ เท่านั้น)", "error");
                }
            }
        });
    }
};

function openExemptionModalInner(targetStudentId) {
    const studentSelect = document.getElementById("exemption-student-select");
    const reasonInput = document.getElementById("exemption-reason-input");
    if (reasonInput) reasonInput.value = "";
    
    if (studentSelect) {
        let optionsHtml = '<option value="">-- เลือกรายชื่อนักเรียน --</option>';
        if (students && students.length > 0) {
            const atRiskStudents = students.filter(s => {
                const acc = (accumulatedStatsMap && accumulatedStatsMap[s.studentId]) ? accumulatedStatsMap[s.studentId] : {};
                let absent = acc.absent || 0;
                let late = acc.late || 0;
                if (allStatsData && allStatsData.logs) {
                    absent = 0; late = 0;
                    allStatsData.logs.forEach(log => {
                        if (log.studentId === s.studentId) {
                            const st = translateAbbreviationToStatus(log.status);
                            if (st === "ขาด") absent++;
                            if (st === "สาย") late++;
                        }
                    });
                }
                return absent >= 3 || late >= 3;
            }).sort((a, b) => {
                const rA = `${a.grade}/${a.room}`;
                const rB = `${b.grade}/${b.room}`;
                if (rA !== rB) return rA.localeCompare(rB, 'th', { numeric: true });
                return a.studentId.localeCompare(b.studentId);
            });

            optionsHtml += atRiskStudents.map(st => `<option value="${st.studentId}">${st.grade}/${st.room} - ${st.fullName}</option>`).join("");
        }
        studentSelect.innerHTML = optionsHtml;
        if (targetStudentId) studentSelect.value = targetStudentId;
    }
    
    renderActiveExemptionsInModal();
    document.getElementById("modal-exemption").classList.add("active");
}

function renderActiveExemptionsInModal() {
    const listContainer = document.getElementById("exemption-list-modal-container");
    const countBadge = document.getElementById("exemption-count-badge");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    const activeKeys = Object.keys(exemptionsCache || {});
    if (countBadge) countBadge.innerText = `${activeKeys.length} รายการ`;
    
    if (activeKeys.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 13px;">ยังไม่มีรายการนักเรียนที่ได้รับการผ่อนผัน</div>';
        return;
    }
    
    activeKeys.forEach(stId => {
        const item = exemptionsCache[stId];
        const studentObj = students.find(s => s.studentId === stId) || {};
        const stName = studentObj.fullName || item.studentName || stId;
        const stRoom = studentObj.grade ? `${studentObj.grade}/${studentObj.room}` : (item.gradeRoom || '');
        
        const row = document.createElement("div");
        row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px;";
        row.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; flex: 1; padding-right: 8px;">
                <div style="font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${stRoom} ${stName}</div>
                <div style="font-size: 11px; color: #047857; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <i class="fa-solid fa-user-shield"></i> <strong>ผ่อนผัน (${item.type || 'ทั้งหมด'}):</strong> ${item.reason || '-'}
                </div>
            </div>
            <button onclick="deleteExemptionRecord('${stId}')" class="btn btn-sm btn-danger" style="background: #ef4444; border: none; color: #fff; font-size: 11px; padding: 4px 10px; border-radius: 6px; flex-shrink: 0; font-weight: 600; cursor: pointer;" title="ยกเลิกการผ่อนผัน">
                <i class="fa-solid fa-trash-can"></i> ลบ
            </button>
        `;
        listContainer.appendChild(row);
    });
}

window.closeExemptionModal = function() {
    document.getElementById("modal-exemption").classList.remove("active");
};

window.saveExemptionRecord = async function() {
    const studentSelect = document.getElementById("exemption-student-select");
    const typeSelect = document.getElementById("exemption-type-select");
    const reasonInput = document.getElementById("exemption-reason-input");
    
    if (!studentSelect || !studentSelect.value) {
        showToast("กรุณาเลือกนักเรียนที่ต้องการผ่อนผัน", "error");
        return;
    }
    
    const studentId = studentSelect.value;
    const type = typeSelect ? typeSelect.value : "ทั้งหมด";
    const reason = reasonInput ? reasonInput.value.trim() : "";
    
    executeSaveExemption(studentId, type, reason);
};

async function executeSaveExemption(studentId, type, reason) {
    const studentObj = students.find(s => s.studentId === studentId) || {};
    const studentName = studentObj.fullName || "";
    const gradeRoom = studentObj.grade ? `${studentObj.grade}/${studentObj.room}` : "";
    
    setLoader(true);
    const db = getSupabase();
    if (db) {
        try {
            const { error: dbErr } = await db.from('exm').upsert({
                student_id: studentId,
                type: type,
                reason: reason
            });
            if (dbErr) throw dbErr;
            showToast("บันทึกข้อมูลการผ่อนผันเรียบร้อยแล้ว!", "success");
            if (!exemptionsCache) exemptionsCache = {};
            exemptionsCache[studentId] = { studentId, studentName, fullName: studentName, gradeRoom, type, reason, date: new Date().toISOString().split('T')[0] };
            renderActiveExemptionsInModal();
            renderAtRiskStudents();
        } catch (err) {
            console.error("Supabase exemptions save error:", err);
            showToast("เกิดข้อผิดพลาดในการบันทึกการผ่อนผัน", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
}

window.deleteExemptionRecord = async function(studentId) {
    if (!confirm("คุณต้องการยกเลิกรายการผ่อนผันของนักเรียนคนนี้ใช่หรือไม่?")) return;
    
    let currentRole = null;
    if (authenticatedAdminPin) {
        currentRole = "ADMIN";
    } else if (loggedInUser) {
        currentRole = loggedInUser.role;
    }
    
    if (currentRole) {
        executeDeleteExemption(studentId);
    } else {
        requestLogin("ANY", (pin, name, role) => {
            executeDeleteExemption(studentId);
        });
    }
};

async function executeDeleteExemption(studentId) {
    setLoader(true);
    const db = getSupabase();
    if (db) {
        try {
            const { error: dbErr } = await db.from('exm').delete().eq('student_id', studentId);
            if (dbErr) throw dbErr;
            showToast("ยกเลิกการผ่อนผันเรียบร้อยแล้ว", "success");
            if (exemptionsCache) delete exemptionsCache[studentId];
            renderActiveExemptionsInModal();
            renderAtRiskStudents();
        } catch (err) {
            console.error("Supabase exemptions delete error:", err);
            showToast("เกิดข้อผิดพลาดในการยกเลิกการผ่อนผัน", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
}

function formatThaiShortDate(dateStr) {
    if (!dateStr) return "-";
    const thMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    let str = String(dateStr).trim();
    let y, m, d;
    
    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length === 3) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10) - 1;
            d = parseInt(parts[2], 10);
        }
    } else if (str.length === 8 && !isNaN(str)) {
        y = parseInt(str.substring(0, 4), 10);
        m = parseInt(str.substring(4, 6), 10) - 1;
        d = parseInt(str.substring(6, 8), 10);
    }
    
    if (y && m >= 0 && m < 12 && d) {
        const yearBE = y > 2400 ? y : y + 543;
        return `${d} ${thMonths[m]} ${yearBE}`;
    }
    return dateStr;
}

window.openExemptionDetailModal = function(studentId) {
    const body = document.getElementById("exemption-detail-body");
    const modal = document.getElementById("modal-exemption-detail");
    if (!body || !modal) return;
    
    try {
        const ex = (exemptionsCache && exemptionsCache[studentId]) ? exemptionsCache[studentId] : {};
        const studentObj = students.find(s => s.studentId === studentId) || {};
        const fullName = studentObj.fullName || ex.studentName || studentId;
        const gradeRoom = studentObj.grade ? `${studentObj.grade}/${studentObj.room}` : (ex.gradeRoom || '-');
        
        const issuedDocs = [];
        Object.keys(atRiskTeachersCache || {}).forEach(backendKey => {
            if (backendKey.startsWith(`${studentId}|`)) {
                const parts = backendKey.split('|');
                const docType = parts[1] || '';
                const countStr = parts[2] || '';
                const item = atRiskTeachersCache[backendKey];
                if (item && (item.hr || item.sa || item.parentName || item.reason || item.docDate)) {
                    issuedDocs.push({
                        backendKey: backendKey,
                        docType: docType,
                        countStr: countStr,
                        fullDocType: `${docType}_${countStr}`,
                        item: item
                    });
                }
            }
        });
        
        let docsListHtml = '';
        if (issuedDocs.length === 0) {
            docsListHtml = `
                <div style="text-align: center; color: var(--text-muted); padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 13px; border: 1px dashed #cbd5e1;">
                    <i class="fa-solid fa-folder-open" style="font-size: 22px; display: block; margin-bottom: 6px; color: #94a3b8;"></i>
                    ยังไม่มีประวัติการออกเอกสารติดตามย้อนหลัง (ผ่อนผันการติดตามก่อนออกเอกสาร)
                </div>
            `;
        } else {
            docsListHtml = issuedDocs.map((doc) => {
                const item = doc.item;
                const docDateText = item.docDate ? formatThaiShortDate(item.docDate) : '-';
                
                const safeStudentId = String(studentId).replace(/'/g, "\\'");
                const safeFullName = String(fullName).replace(/'/g, "\\'");
                const safeGradeRoom = String(gradeRoom).replace(/'/g, "\\'");
                const safeDocType = String(doc.docType).replace(/'/g, "\\'");
                const safeFullDocType = String(doc.fullDocType).replace(/'/g, "\\'");
                
                return `
                    <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 10px 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; gap: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); flex-wrap: wrap;">
                        <div style="display: flex; flex-direction: column; gap: 2px; flex: 1 1 130px; min-width: 0;">
                            <div style="font-weight: 700; color: #1e293b; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;">
                                <i class="fa-solid fa-file-contract" style="color: #3b82f6; flex-shrink: 0;"></i>
                                <span>เอกสาร ${doc.docType} (${doc.countStr})</span>
                            </div>
                            <div style="font-size: 11.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <i class="fa-regular fa-calendar-check" style="color: #10b981;"></i> วันที่ออก: ${docDateText}
                            </div>
                        </div>
                        <button class="btn btn-outline" onclick="closeExemptionDetailModal(); openPreviewDirectly('${safeStudentId}', '${safeFullName}', '${safeGradeRoom}', '${safeDocType}', '${safeFullDocType}');" style="height: 34px; padding: 0 10px; border-radius: 8px; font-size: 12px; font-weight: 600; flex: 0 0 auto; color: #2563eb; border-color: #bfdbfe; background: #eff6ff; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap;">
                            <i class="fa-solid fa-eye"></i> เปิดดูเอกสาร
                        </button>
                    </div>
                `;
            }).join('');
        }
        
        const dateDisplay = ex.date ? formatThaiShortDate(ex.date) : '';
        
        body.innerHTML = `
            <!-- การ์ดสรุปข้อมูลผ่อนผัน -->
            <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #6ee7b7; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <div style="width: 34px; height: 34px; background: #047857; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; flex-shrink: 0;">
                        <i class="fa-solid fa-user-check"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: #065f46;">${gradeRoom} ${fullName}</h4>
                        <span style="font-size: 11px; color: #047857;">รหัสนักเรียน: ${studentId}</span>
                    </div>
                </div>
                
                <div style="background: rgba(255, 255, 255, 0.75); border-radius: 8px; padding: 10px; margin-top: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; color: #064e3b;">
                    <div><strong>ประเภทการผ่อนผัน:</strong> ผ่อนผัน${ex.type || 'ทั้งหมด'}</div>
                    <div><strong>เหตุผลการผ่อนผัน:</strong> ${ex.reason || 'ผ่านการอนุมัติผ่อนผันการติดตามเรียบร้อยแล้ว'}</div>
                    ${dateDisplay ? `<div><strong>วันที่บันทึกผ่อนผัน:</strong> ${dateDisplay}</div>` : ''}
                </div>
            </div>
            
            <!-- รายการเอกสารย้อนหลัง -->
            <div>
                <div style="font-weight: 700; color: #1e293b; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-clock-rotate-left" style="color: #6366f1;"></i> ประวัติเอกสารติดตามที่เคยออก (${issuedDocs.length} ฉบับ)
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 4px;">
                    ${docsListHtml}
                </div>
            </div>
        `;
        
        modal.classList.add("active");
    } catch (err) {
        console.error("openExemptionDetailModal error:", err);
        showToast("เกิดข้อผิดพลาดในการดึงข้อมูลผ่อนผัน", "error");
    }
};

window.closeExemptionDetailModal = function() {
    const modal = document.getElementById("modal-exemption-detail");
    if (modal) modal.classList.remove("active");
};

/* =========================================================
 * 15. ระบบขออนุญาตออกนอกบริเวณโรงเรียน (ป.ค. 11)
 * ========================================================= */

window.currentPk11Step = 1;
const totalPk11Steps = 4;
window.pk11SignatureTarget = '';
window.pk11Records = [];
window.currentPk11Student = null;
window.pk11DraftData = null;

window.openPk11Wizard = function(recordId = null) {
    document.getElementById('pk11-list-container').style.display = 'none';
    document.getElementById('pk11-wizard-container').style.display = 'block';
    
    if (recordId) {
        // Edit mode
        const record = window.pk11Records.find(r => String(r.id) === String(recordId));
        if (record) {
            document.getElementById('pk11-record-id').value = record.id;
            // Reconstruct currentPk11Student
            window.currentPk11Student = {
                studentId: record.studentId,
                fullName: record.studentName,
                grade: record.gradeRoom ? record.gradeRoom.split('/')[0] : '',
                room: record.gradeRoom ? record.gradeRoom.split('/')[1] : ''
            };
            
            // Populate Step 1
            const searchInput = document.getElementById('pk11-student-search');
            const dropdown = document.getElementById('pk11-student-dropdown');
            const displayBadge = document.getElementById('pk11-student-display');
            if (searchInput) {
                searchInput.value = '';
                searchInput.classList.add('hidden');
            }
            if (dropdown) dropdown.innerHTML = '';
            
            document.getElementById('pk11-student-name-display').innerText = record.studentName || '-';
            if (displayBadge) displayBadge.classList.remove('hidden');
            
            
            let dateVal = record.targetDate || record.createdAt || '';
            if (dateVal && dateVal.includes('T')) dateVal = dateVal.split('T')[0];
            const dateInput = document.getElementById('pk11-date');
            dateInput.value = dateVal;
            dateInput.disabled = true;
            
            document.getElementById('pk11-exit-time').value = record.exitTime || '';
            document.getElementById('pk11-return-time').value = record.returnTime || '';
            document.getElementById('pk11-location').value = record.location || '';
            document.getElementById('pk11-reason').value = record.reason || '';
            document.getElementById('pk11-student-phone').value = record.studentPhone || '';
            
            // Populate Step 2
            document.getElementById('pk11-parent-name').value = record.parentName || '';
            document.getElementById('pk11-relation').value = record.relation || '';
            document.getElementById('pk11-parent-phone').value = record.parentPhone || '';
            
            // Populate Step 3 & 4
            setTimeout(() => {
                const hrSelect = document.getElementById('pk11-hr-select');
                const saSelect = document.getElementById('pk11-sa-select');
                const hrDisplay = document.getElementById('pk11-hr-display');
                const saDisplay = document.getElementById('pk11-sa-display');
                const hrNameDisplay = document.getElementById('pk11-hr-name-display');
                const saNameDisplay = document.getElementById('pk11-sa-name-display');
                const hrSearch = document.getElementById('pk11-hr-search');
                const saSearch = document.getElementById('pk11-sa-search');
                
                if (hrSelect && record.hrName) {
                    hrSelect.value = record.hrName;
                    if(hrNameDisplay) hrNameDisplay.innerText = record.hrName;
                    if(hrDisplay) hrDisplay.classList.remove('hidden');
                    if(hrSearch) { hrSearch.value = ''; hrSearch.classList.add('hidden'); }
                }
                if (saSelect && record.saName) {
                    saSelect.value = record.saName;
                    if(saNameDisplay) saNameDisplay.innerText = record.saName;
                    if(saDisplay) saDisplay.classList.remove('hidden');
                    if(saSearch) { saSearch.value = ''; saSearch.classList.add('hidden'); }
                }
            }, 100);
            
            // Populate Signatures
            const setSig = (targetId, b64) => {
                const img = document.getElementById(`${targetId}-signature-preview`);
                const container = document.getElementById(`${targetId}-signature-preview-container`);
                if (b64 && b64.length > 100) {
                    if (img) img.src = b64;
                    if (container) container.style.display = 'block';
                } else {
                    if (img) img.src = '';
                    if (container) container.style.display = 'none';
                }
            };
            
            setSig('pk11-student', record.studentSignature);
            setSig('pk11-parent', record.parentSignature);
            setSig('pk11-hr', record.hrSignature);
            setSig('pk11-sa', record.saSignature);
            
            // Set status
            const statusVal = record.status || 'อนุญาต';
            const radio = document.querySelector(`input[name="pk11-sa-status"][value="${statusVal}"]`);
            if (radio) radio.checked = true;
            
            const hrStatusVal = record.hrStatus || 'เห็นควรอนุญาต';
            const hrRadio = document.querySelector(`input[name="pk11-hr-status"][value="${hrStatusVal}"]`);
            if (hrRadio) hrRadio.checked = true;
        }
    } else {
        // Create mode
        document.getElementById('pk11-record-id').value = '';
        clearPk11Form();
        window.pk11DraftData = null;
        
        // Auto set current date and time
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateInput = document.getElementById('pk11-date');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.disabled = false;
        
        const hh = String(today.getHours()).padStart(2, '0');
        const min = String(today.getMinutes()).padStart(2, '0');
        document.getElementById('pk11-exit-time').value = `${hh}:${min}`;
        
        const hrRadio = document.querySelector('input[name="pk11-hr-status"][value="เห็นควรอนุญาต"]');
        if (hrRadio) hrRadio.checked = true;
    }
    
    goToPk11Step(1);
};

window.closePk11Wizard = function() {
    document.getElementById('pk11-wizard-container').style.display = 'none';
    document.getElementById('pk11-list-container').style.display = 'block';
};

window.goToPk11Step = function(step) {
    if (step === 'next') step = window.currentPk11Step + 1;
    if (step === 'prev') step = window.currentPk11Step - 1;
    
    if (step < 1 || step > totalPk11Steps) return;
    
    // Hide all steps and evaluate completion
    const isStepCompleted = (stepIdx) => {
        if (stepIdx === 1) {
            const reason = document.getElementById('pk11-reason');
            return window.currentPk11Student != null && reason && reason.value.trim() !== '';
        } else if (stepIdx === 2) {
            const sig = document.getElementById('pk11-parent-signature-preview');
            return sig && sig.src && sig.src.length > 100;
        } else if (stepIdx === 3) {
            const sig = document.getElementById('pk11-hr-signature-preview');
            return sig && sig.src && sig.src.length > 100;
        } else if (stepIdx === 4) {
            const sig = document.getElementById('pk11-sa-signature-preview');
            return sig && sig.src && sig.src.length > 100;
        }
        return false;
    };

    for (let i = 1; i <= totalPk11Steps; i++) {
        const stepEl = document.getElementById(`pk11-step-${i}`);
        if (stepEl) stepEl.style.display = 'none';
        
        const navItem = document.getElementById(`pk11-nav-step-${i}`);
        if (navItem) {
            navItem.classList.remove('active', 'completed');
            if (i === step) {
                navItem.classList.add('active');
            } else if (isStepCompleted(i)) {
                navItem.classList.add('completed');
            }
        }
    }
    
    // Show current step
    const currentEl = document.getElementById(`pk11-step-${step}`);
    if(currentEl) currentEl.style.display = 'block';
    window.currentPk11Step = step;
    
    // Update buttons
    const prevBtn = document.getElementById('btn-pk11-prev');
    const saveBtn = document.getElementById('btn-pk11-save');
    const previewBtn = document.getElementById('btn-pk11-preview');
    
    if(prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'block';
    
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึก';
    }
};

window.clearPk11Form = function() {
    const inputs = ['pk11-student-search', 'pk11-date', 'pk11-location', 'pk11-exit-time', 'pk11-return-time', 'pk11-reason', 'pk11-student-phone', 'pk11-parent-name', 'pk11-relation', 'pk11-parent-phone', 'pk11-hr-select', 'pk11-sa-select'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    
    const displayEl = document.getElementById('pk11-student-display');
    if(displayEl) displayEl.classList.add('hidden');
    const nameDisplayEl = document.getElementById('pk11-student-name-display');
    if(nameDisplayEl) nameDisplayEl.innerText = '-';
    
    // Clear teacher selection
    ['hr', 'sa'].forEach(role => clearTeacherSelection(role));
    window.currentPk11Student = null;
    
    ['pk11-student', 'pk11-parent', 'pk11-hr', 'pk11-sa'].forEach(id => clearTeacherSignature(id));
    
    // Reset status
    const statusRadio = document.querySelector('input[name="pk11-sa-status"][value="อนุญาต"]');
    if (statusRadio) statusRadio.checked = true;
    const hrStatusRadio = document.querySelector('input[name="pk11-hr-status"][value="เห็นควรอนุญาต"]');
    if (hrStatusRadio) hrStatusRadio.checked = true;
};

window.clearTeacherSelection = function(role) {
    const select = document.getElementById(`pk11-${role}-select`);
    const search = document.getElementById(`pk11-${role}-search`);
    const display = document.getElementById(`pk11-${role}-display`);
    const nameDisplay = document.getElementById(`pk11-${role}-name-display`);
    
    if (select) select.value = '';
    if (search) { search.value = ''; search.classList.remove('hidden'); }
    if (display) display.classList.add('hidden');
    if (nameDisplay) nameDisplay.innerText = '-';
};

window.savePk11Record = async function() {
    if (!window.currentPk11Student) {
        showToast("กรุณาเลือกนักเรียน", "error");
        goToPk11Step(1);
        return;
    }
    
    const getSig = (id) => {
        const el = document.getElementById(id);
        if (!el) return "";
        const src = el.src;
        return (src && (src.startsWith('data:image') || src.startsWith('http'))) ? src : "";
    };
    
    const recId = document.getElementById('pk11-record-id').value || ("P" + Math.random().toString(36).substring(2, 6).toUpperCase());
    const targetDateVal = document.getElementById('pk11-date').value || new Date().toISOString().split('T')[0];
    
    const hrVal = document.getElementById('pk11-hr-select').value;
    const saVal = document.getElementById('pk11-sa-select').value;
    const hrTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.name === hrVal || u.code === hrVal) : null;
    const saTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.name === saVal || u.code === saVal) : null;
    const hrCode = hrTeacher ? (hrTeacher.code || hrTeacher.name) : (hrVal || "");
    const saCode = saTeacher ? (saTeacher.code || saTeacher.name) : (saVal || "");
    const isHrApproved = document.querySelector('input[name="pk11-hr-status"]:checked')?.value === "เห็นควรอนุญาต";
    const isSaApproved = document.querySelector('input[name="pk11-sa-status"]:checked')?.value === "อนุญาต";

    // Upload signatures to Supabase Storage
    const rawStudentSig = getSig('pk11-student-signature-preview');
    const rawParentSig = getSig('pk11-parent-signature-preview');
    const rawHrSig = getSig('pk11-hr-signature-preview');
    const rawSaSig = getSig('pk11-sa-signature-preview');

    const studentSigUrl = await uploadSignatureToSupabase(rawStudentSig, 'pk11', `${recId}_student`);
    const parentSigUrl = await uploadSignatureToSupabase(rawParentSig, 'pk11', `${recId}_parent`);
    const hrSigUrl = await uploadSignatureToSupabase(rawHrSig, 'pk11', `${recId}_hr`);
    const saSigUrl = await uploadSignatureToSupabase(rawSaSig, 'pk11', `${recId}_sa`);

    const recordData = {
        id: recId,
        target_date: targetDateVal,
        student_id: window.currentPk11Student.studentId,
        exit_time: document.getElementById('pk11-exit-time').value,
        return_time: document.getElementById('pk11-return-time').value,
        location: document.getElementById('pk11-location').value,
        reason: document.getElementById('pk11-reason').value,
        student_phone: document.getElementById('pk11-student-phone').value,
        parent_name: document.getElementById('pk11-parent-name').value,
        relation: document.getElementById('pk11-relation').value,
        parent_phone: document.getElementById('pk11-parent-phone').value,
        hr_name: hrCode,
        sa_name: saCode,
        hr_status: isHrApproved,
        status: isSaApproved,
        
        student_signature: studentSigUrl,
        parent_signature: parentSigUrl,
        hr_signature: hrSigUrl,
        sa_signature: saSigUrl
    };
    
    setLoader(true);
    const db = getSupabase();
    if (db) {
        try {
            const { error } = await db.from('pk11').upsert(recordData);
            if (error) throw error;
            showToast("บันทึกข้อมูล ป.ค.11 สำเร็จ ⚡", "success");
            document.getElementById('pk11-record-id').value = recId;
            
            if (window.currentPk11Step < totalPk11Steps) {
                goToPk11Step('next');
            } else {
                closePk11Wizard();
            }
            loadPk11Records();
            setLoader(false);
            return;
        } catch (err) {
            console.error("Supabase savePK11 error:", err);
            showToast("เกิดข้อผิดพลาดในการบันทึก ป.ค.11", "error");
        } finally {
            setLoader(false);
        }
    }
};

window.loadPk11Records = async function() {
    const db = getSupabase();
    if (!db) return;
    try {
        const { data, error } = await db.from('pk11').select('*').order('target_date', { ascending: false });
        if (error) throw error;
        window.pk11Records = (data || []).map(r => {
            const st = (typeof students !== 'undefined' && students) ? students.find(s => s.studentId === r.student_id) : null;
            const hrTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === r.hr_name || u.name === r.hr_name) : null;
            const saTeacher = (typeof users !== 'undefined' && users) ? users.find(u => u.code === r.sa_name || u.name === r.sa_name) : null;
            
            const hasSaSign = !!(r.sa_signature && r.sa_signature.length > 5);
            const hasHrSign = !!(r.hr_signature && r.hr_signature.length > 5);
            
            const hrApproved = (r.hr_status === true || r.hr_status === 'true' || r.hr_status === 'เห็นควรอนุญาต' || r.hr_status === 'TRUE');
            const hrDisapproved = (r.hr_status === false || r.hr_status === 'false' || r.hr_status === 'ไม่เห็นควรอนุญาต');
            
            const saApproved = (r.status === true || r.status === 'true' || r.status === 'อนุญาต' || r.status === 'TRUE');
            const saDisapproved = (r.status === false || r.status === 'false' || r.status === 'ไม่อนุญาต');

            let finalStatus = "รออนุมัติ";
            if (saDisapproved && (hasSaSign || r.sa_name)) {
                finalStatus = "ไม่อนุญาต";
            } else if (hrDisapproved && (hasHrSign || r.hr_name)) {
                finalStatus = "ไม่อนุญาต";
            } else if (hasSaSign && saApproved) {
                finalStatus = "อนุญาต";
            } else {
                finalStatus = "รออนุมัติ";
            }

            return {
                id: r.id,
                targetDate: r.target_date,
                studentId: r.student_id,
                studentName: st ? st.fullName : '-',
                gradeRoom: st ? `${st.grade}/${st.room}` : '-',
                exitTime: r.exit_time,
                returnTime: r.return_time,
                location: r.location,
                reason: r.reason,
                studentPhone: r.student_phone,
                parentName: r.parent_name,
                relation: r.relation,
                parentPhone: r.parent_phone,
                hrName: hrTeacher ? hrTeacher.name : (r.hr_name || '-'),
                saName: saTeacher ? saTeacher.name : (r.sa_name || '-'),
                hrStatus: hasHrSign ? (hrApproved ? "เห็นควรอนุญาต" : "ไม่เห็นควรอนุญาต") : (r.hr_status || "รอความเห็น"),
                status: finalStatus,
                studentSignature: r.student_signature,
                parentSignature: r.parent_signature,
                hrSignature: r.hr_signature,
                saSignature: r.sa_signature
            };
        });
        renderPk11List();
    } catch (err) {
        console.error("Supabase loadPk11Records error:", err);
    }
};

window.renderPk11List = function() {
    const tbody = document.getElementById('pk11-table-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (!window.pk11Records || window.pk11Records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="txt-center" style="color: var(--text-muted); padding: 30px;">ไม่มีรายการขออนุญาตออกนอกบริเวณโรงเรียน</td></tr>';
        return;
    }
    
    window.pk11Records.forEach((record) => {
        const tr = document.createElement('tr');
        
        const dateParts = (record.targetDate || '').split('-');
        const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${parseInt(dateParts[0]) + 543}` : (record.targetDate || '-');
        
        let statusBadge = '';
        if (record.status === 'อนุญาต') {
            statusBadge = `<span class="badge" style="background: #ecfdf5; color: #047857; font-weight: 600; padding: 4px 10px; border-radius: 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-check"></i> อนุญาต</span>`;
        } else if (record.status === 'ไม่อนุญาต') {
            statusBadge = `<span class="badge" style="background: #fef2f2; color: #b91c1c; font-weight: 600; padding: 4px 10px; border-radius: 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-xmark"></i> ไม่อนุญาต</span>`;
        } else {
            statusBadge = `<span class="badge" style="background: #fffbeb; color: #b45309; font-weight: 600; padding: 4px 10px; border-radius: 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid #fde68a;"><i class="fa-solid fa-clock"></i> รออนุมัติ</span>`;
        }
            
        const timeDisplay = (record.exitTime || record.returnTime) 
            ? `${record.exitTime || '-'} - ${record.returnTime || '-'}`
            : '-';
            
        tr.innerHTML = `
            <td class="txt-center" style="white-space: nowrap;">
                <button class="btn btn-sm btn-outline" onclick="previewPk11DocumentDirectly('${record.id}')" title="พิมพ์/ดูเอกสาร ป.ค.11" style="padding: 4px 8px; font-size: 12px; margin-right: 4px; border-radius: 6px; color: #2563eb; border-color: #bfdbfe; background: #eff6ff; cursor: pointer;">
                    <i class="fa-solid fa-print"></i> เอกสาร
                </button>
                <button class="btn btn-sm btn-outline" onclick="openPk11Wizard('${record.id}')" title="แก้ไข" style="padding: 4px 8px; font-size: 12px; border-radius: 6px; color: #475569; border-color: #cbd5e1; cursor: pointer;">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
            </td>
            <td class="txt-center">${statusBadge}</td>
            <td style="white-space: nowrap;">
                <strong>${record.studentName || '-'}</strong>
                <div style="font-size: 11.5px; color: var(--text-muted);">${record.gradeRoom || '-'}</div>
            </td>
            <td class="txt-center" style="white-space: nowrap;">${displayDate}</td>
            <td class="txt-center" style="white-space: nowrap; font-size: 12px;">${timeDisplay}</td>
            <td style="max-width: 150px;">
                <div style="font-size: 13px; font-weight: 500; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${record.reason || '-'}">${record.reason || '-'}</div>
                <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${record.location || '-'}"><i class="fa-solid fa-location-dot"></i> ${record.location || '-'}</div>
            </td>
            <td class="txt-center">
                <button class="delete-btn" onclick="deletePk11Record('${record.id}')" title="ลบรายการ" style="color: #ef4444; background: none; border: none; cursor: pointer; padding: 4px 8px; font-size: 14px;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.deletePk11Record = async function(id) {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการขออนุญาตออกนอกบริเวณโรงเรียนนี้? (การดำเนินการนี้ไม่สามารถยกเลิกได้)")) {
        return;
    }
    
    setLoader(true);
    const db = getSupabase();
    if (db) {
        try {
            const { error } = await db.from('pk11').delete().eq('id', id);
            if (error) throw error;
            showToast("ลบรายการสำเร็จ ⚡", "success");
            await loadPk11Records();
        } catch (err) {
            console.error("Supabase delete PK11 error:", err);
            showToast("เกิดข้อผิดพลาดในการลบรายการ", "error");
        } finally {
            setLoader(false);
        }
    }
};

window.previewPk11DocumentDirectly = function(recordId) {
    const item = window.pk11Records.find(r => r.id === recordId);
    if (!item) return;
    
    currentSigningStudent = null;
    window.currentPk11Student = {
        studentId: item.studentId,
        fullName: item.studentName,
        grade: item.gradeRoom ? item.gradeRoom.split('/')[0] : '',
        room: item.gradeRoom ? item.gradeRoom.split('/')[1] : ''
    };
    
    if (typeof getPK11Template === 'function' && typeof generateDocumentHtml === 'function') {
        const itemDate = item.targetDate || item.date || item.createdAt || '';
        const payload = {
            date: itemDate,
            targetDate: itemDate,
            createdAt: item.createdAt || itemDate,
            studentName: item.studentName || '-',
            grade: item.gradeRoom ? item.gradeRoom.split('/')[0] : '-',
            room: item.gradeRoom ? item.gradeRoom.split('/')[1] : '-',
            reason: item.reason || '-',
            location: item.location || '-',
            exitTime: item.exitTime || '-',
            returnTime: item.returnTime || '-',
            parentName: item.parentName || '-',
            relation: item.relation || '-',
            hrName: item.hrName || '-',
            saName: item.saName || '-',
            homeroomTeacher: item.hrName || '-',
            headOfStudentAffairs: item.saName || '-',
            studentPhone: item.studentPhone || '-',
            parentPhone: item.parentPhone || '-',
            studentSignature: item.studentSignature || '',
            parentSignature: item.parentSignature || '',
            hrSignature: item.hrSignature || '',
            saSignature: item.saSignature || '',
            hrStatus: item.hrStatus || 'เห็นควรอนุญาต',
            status: item.status || 'อนุญาต',
            docType: 'ป.ค.11'
        };
        
        const html = generateDocumentHtml(payload);
        const modal = document.getElementById('modal-document-preview');
        const container = document.getElementById('document-print-area');
        const btnOpenSig = document.getElementById("btn-open-signature");
        const btnSaveSig = document.getElementById("btn-save-signature");
        if (btnOpenSig) btnOpenSig.style.display = 'none';
        if (btnSaveSig) btnSaveSig.style.display = 'none';
        if (modal && container) {
            container.innerHTML = html;
            if (typeof tintAllSignatures === 'function') {
                tintAllSignatures().then(() => {
                    modal.classList.add('active');
                });
            } else {
                modal.classList.add('active');
            }
        }
    } else {
        showToast("ระบบเอกสารยังไม่พร้อม", "warning");
    }
};

// Implement Student Search
document.addEventListener('DOMContentLoaded', () => {
    // Populate PK11 Time Selects
    const exitSelect = document.getElementById('pk11-exit-time');
    const returnSelect = document.getElementById('pk11-return-time');
    if (exitSelect && returnSelect) {
        let options = '<option value="">-- เลือกเวลา --</option>';
        for (let h = 8; h <= 15; h++) {
            for (let m = 0; m <= 50; m += 10) {
                if (h === 8 && m < 30) continue;
                if (h === 15 && m > 30) continue;
                let hh = h.toString().padStart(2, '0');
                let mm = m.toString().padStart(2, '0');
                options += `<option value="${hh}:${mm}">${hh}:${mm} น.</option>`;
            }
        }
        exitSelect.innerHTML = options;
        returnSelect.innerHTML = options;
    }

    const searchInput = document.getElementById('pk11-student-search');
    const dropdown = document.getElementById('pk11-student-dropdown');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim().toLowerCase();
            dropdown.innerHTML = '';
            
            if (val.length < 2) {
                dropdown.style.display = 'none';
                return;
            }
            
            if (typeof students === 'undefined' || !students) return;
            
            const matches = students.filter(s => {
                return (s.fullName && s.fullName.toLowerCase().includes(val)) || 
                       (s.studentId && String(s.studentId).includes(val)) ||
                       (s.no && String(s.no) === val);
            }).slice(0, 8);
            
            if (matches.length > 0) {
                matches.forEach(student => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.innerHTML = `<div style="font-weight:600;">${student.fullName}</div><div style="font-size:11px; color:#64748b;">ม.${student.grade}/${student.room} เลขที่ ${student.no} | รหัส ${student.studentId}</div>`;
                    div.onclick = () => {
                        const displayEl = document.getElementById('pk11-student-display');
                        if(displayEl) displayEl.classList.remove('hidden');
                        
                        const nameDisplayEl = document.getElementById('pk11-student-name-display');
                        if(nameDisplayEl) nameDisplayEl.innerText = `${student.fullName} (ม.${student.grade}/${student.room})`;
                        
                        window.currentPk11Student = student;
                        searchInput.value = '';
                        dropdown.style.display = 'none';
                    };
                    dropdown.appendChild(div);
                });
                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        });
        
        document.addEventListener('click', (e) => {
            if (e.target !== searchInput && e.target !== dropdown) {
                dropdown.style.display = 'none';
            }
        });
    }
    
    // Setup Teacher Search (HR and SA)
    ['hr', 'sa'].forEach(role => {
        const tSearch = document.getElementById(`pk11-${role}-search`);
        const tDropdown = document.getElementById(`pk11-${role}-dropdown`);
        if (tSearch && tDropdown) {
            tSearch.addEventListener('input', (e) => {
                const val = e.target.value.trim().toLowerCase();
                tDropdown.innerHTML = '';
                
                if (val.length < 2) {
                    tDropdown.style.display = 'none';
                    return;
                }
                
                if (typeof users === 'undefined' || !users) return;
                
                const matches = users.filter(u => u.name && u.name.toLowerCase().includes(val)).slice(0, 8);
                
                if (matches.length > 0) {
                    matches.forEach(user => {
                        const div = document.createElement('div');
                        div.className = 'search-result-item';
                        div.innerHTML = `<div style="font-weight:600; padding: 4px 0;">${user.name}</div>`;
                        div.onclick = () => {
                            const displayEl = document.getElementById(`pk11-${role}-display`);
                            if(displayEl) displayEl.classList.remove('hidden');
                            
                            const nameDisplayEl = document.getElementById(`pk11-${role}-name-display`);
                            if(nameDisplayEl) nameDisplayEl.innerText = user.name;
                            
                            const selectEl = document.getElementById(`pk11-${role}-select`);
                            if(selectEl) selectEl.value = user.name;
                            
                            tSearch.value = '';
                            tSearch.classList.add('hidden');
                            tDropdown.style.display = 'none';
                        };
                        tDropdown.appendChild(div);
                    });
                    tDropdown.style.display = 'block';
                } else {
                    tDropdown.style.display = 'none';
                }
            });
            
            document.addEventListener('click', (e) => {
                if (e.target !== tSearch && e.target !== tDropdown) {
                    tDropdown.style.display = 'none';
                }
            });
        }
    });
});

// Hook switchView to load PK11 data when selected
const originalSwitchViewForPk11 = window.switchView;
window.switchView = function(viewId) {
    if (originalSwitchViewForPk11) originalSwitchViewForPk11(viewId);
    
    if (viewId === 'pk11') {
        const viewEl = document.getElementById('view-pk11');
        if (viewEl) viewEl.classList.add('active');
        
        const pageTitleEl = document.getElementById("header-page-title");
        if (pageTitleEl) pageTitleEl.innerText = "ขออนุญาตออกนอกบริเวณ (ป.ค. 11)";
        
        const dockShortcut = document.getElementById("shortcut-student-affairs");
        if (dockShortcut) dockShortcut.classList.add("active");
        
        closePk11Wizard();
        loadPk11Records();
    }
};

window.previewPk11Document = function() {
    currentSigningStudent = null;
    // Check if documents.js loaded and has getPK11Template
    if (typeof getPK11Template === 'function' && typeof generateDocumentHtml === 'function') {
        const getSigPreview = (id) => {
            const el = document.getElementById(id);
            if (!el) return "";
            const src = el.src;
            return (src && src.startsWith('data:image')) ? src : "";
        };
        
        const formDate = document.getElementById('pk11-date') ? document.getElementById('pk11-date').value : '';
        const payload = {
            date: formDate,
            targetDate: formDate,
            createdAt: formDate,
            studentName: window.currentPk11Student ? window.currentPk11Student.fullName : '-',
            grade: window.currentPk11Student ? window.currentPk11Student.grade : '-',
            room: window.currentPk11Student ? window.currentPk11Student.room : '-',
            reason: document.getElementById('pk11-reason').value || '-',
            location: document.getElementById('pk11-location').value || '-',
            exitTime: document.getElementById('pk11-exit-time').value || '-',
            returnTime: document.getElementById('pk11-return-time').value || '-',
            parentName: document.getElementById('pk11-parent-name').value || '-',
            relation: document.getElementById('pk11-relation').value || '-',
            hrName: document.getElementById('pk11-hr-select').value || '-',
            saName: document.getElementById('pk11-sa-select').value || '-',
            homeroomTeacher: document.getElementById('pk11-hr-select').value || '-',
            headOfStudentAffairs: document.getElementById('pk11-sa-select').value || '-',
            studentPhone: document.getElementById('pk11-student-phone').value || '-',
            parentPhone: document.getElementById('pk11-parent-phone').value || '-',
            docType: 'ป.ค.11',
            hrStatus: document.querySelector('input[name="pk11-hr-status"]:checked')?.value || "เห็นควรอนุญาต",
            status: document.querySelector('input[name="pk11-sa-status"]:checked')?.value || "อนุญาต",
            
            // Send base64 image strings or placeholders
            studentSignature: getSigPreview('pk11-student-signature-preview'),
            parentSignature: getSigPreview('pk11-parent-signature-preview'),
            hrSignature: getSigPreview('pk11-hr-signature-preview'),
            saSignature: getSigPreview('pk11-sa-signature-preview')
        };
        
        const html = generateDocumentHtml(payload);
        
        const modal = document.getElementById('modal-document-preview');
        const container = document.getElementById('document-print-area');
        const btnOpenSig = document.getElementById("btn-open-signature");
        const btnSaveSig = document.getElementById("btn-save-signature");
        if (btnOpenSig) btnOpenSig.style.display = 'none';
        if (btnSaveSig) btnSaveSig.style.display = 'none';
        if (modal && container) {
            container.innerHTML = html;
            if (typeof tintAllSignatures === 'function') {
                tintAllSignatures().then(() => {
                    modal.classList.add('active');
                });
            } else {
                modal.classList.add('active');
            }
        }
    } else {
        showToast("ระบบยังไม่พร้อมสำหรับการสร้างเอกสาร", "warning");
    }
};

window.tintAllSignatures = async function() {
    const container = document.getElementById('document-print-area');
    if (!container) return;
    
    const images = container.querySelectorAll('img');
    const promises = Array.from(images).map(img => {
        const alt = img.getAttribute('alt') || '';
        if (alt.includes('โลโก้') || img.src === (typeof SCHOOL_LOGO_BASE64 !== 'undefined' ? SCHOOL_LOGO_BASE64 : '')) {
            return Promise.resolve();
        }
        if (img.src && img.src.startsWith('data:image')) {
            return new Promise((resolve) => {
                const tempImg = new Image();
                tempImg.crossOrigin = "Anonymous";
                tempImg.onload = function() {
                    const canvas = document.createElement('canvas');
                    canvas.width = tempImg.width;
                    canvas.height = tempImg.height;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    
                    ctx.drawImage(tempImg, 0, 0);
                    
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    
                    for (let i = 0; i < data.length; i += 4) {
                        if (data[i + 3] > 0) {
                            const r = data[i], g = data[i+1], b = data[i+2];
                            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                            // Change dark pixels to standard blue #0000FF
                            if (luminance < 150) {
                                data[i] = 0;
                                data[i + 1] = 0;
                                data[i + 2] = 255;
                            }
                        }
                    }
                    
                    ctx.putImageData(imageData, 0, 0);
                    img.src = canvas.toDataURL('image/png');
                    resolve();
                };
                tempImg.onerror = resolve;
                tempImg.src = img.src;
            });
        }
        return Promise.resolve();
    });
    
    await Promise.all(promises);
};

/* =========================================================
 * 14. ระบบบันทึกและประเมินความสะอาด 5ส. (Clean 5S Evaluation)
 * ========================================================= */

const DEFAULT_CLEAN5S_ROOMS = [
    "ม.1/1", "ม.1/2", "ม.1/3",
    "ม.2/1", "ม.2/2", "ม.2/3",
    "ม.3/1", "ม.3/2", "ม.3/3",
    "ม.4/1", "ม.4/2",
    "ม.5/1", "ม.5/2",
    "ม.6/1", "ม.6/2"
];

let clean5sCurrentSubTab = "classroom";
let clean5sSelectedDate = "";
let clean5sExistingData = null;
let clean5sCachedRawRecords = [];
let clean5sAllExpandedState = false;
let clean5sRoomsArray = DEFAULT_CLEAN5S_ROOMS;
let clean5sLatestBlobUrl = "";
let clean5sLatestFileName = "";

let clean5sScale = 1;
let clean5sBaseScale = 1;
let clean5sStartDistance = 0;
let clean5sIsDragging = false;
let clean5sStartTouchX = 0, clean5sStartTouchY = 0;
let clean5sCurrentX = 0, clean5sCurrentY = 0;

function escapeClean5sHtml(text) {
    if (!text && text !== 0) return "";
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatClean5sThaiDate(dateStr) {
    if (!dateStr) return "";
    const THAI_MONTHS = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const THAI_DAYS = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
    try {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const dayName = THAI_DAYS[dateObj.getDay()];
        const day = dateObj.getDate();
        const month = THAI_MONTHS[dateObj.getMonth()];
        const yearBE = dateObj.getFullYear() + 543;
        return `${dayName}ที่ ${day} ${month} ${yearBE}`;
    } catch (e) {
        return dateStr;
    }
}

let clean5sFlatpickrInstance = null;
let clean5sEvaluatedDatesSet = new Set();

function updateClean5sDateDisplay(dateStr) {
    const displayEl = document.getElementById("clean5s-date-display");
    if (displayEl) {
        displayEl.innerText = formatClean5sThaiDate(dateStr);
    }
}

window.openClean5sDatePicker = function() {
    if (clean5sFlatpickrInstance) {
        clean5sFlatpickrInstance.open();
    } else {
        const input = document.getElementById("clean5s-date-picker-input");
        if (input) input.click();
    }
};

function initClean5sDatePicker() {
    const input = document.getElementById("clean5s-date-picker-input");
    if (!input || !window.flatpickr) return;

    if (clean5sFlatpickrInstance) {
        clean5sFlatpickrInstance.setDate(clean5sSelectedDate, false);
        clean5sFlatpickrInstance.redraw();
        return;
    }

    clean5sFlatpickrInstance = flatpickr(input, {
        locale: "th",
        dateFormat: "Y-m-d",
        defaultDate: clean5sSelectedDate,
        position: "auto center",
        disableMobile: true,
        onDayCreate: function(dObj, dStr, fp, dayElem) {
            const dateObj = dayElem.dateObj;
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            const isoDate = `${y}-${m}-${d}`;
            
            if (clean5sEvaluatedDatesSet.has(isoDate)) {
                dayElem.classList.add("clean5s-evaluated-day");
                dayElem.title = "มีบันทึกผลการประเมิน 5ส. แล้ว";
            }
        },
        onChange: function(selectedDates, dateStr, instance) {
            if (!dateStr) return;
            clean5sSelectedDate = dateStr;
            updateClean5sDateDisplay(dateStr);
            fetchClean5sDateDataAndRender(dateStr);
        }
    });
}

window.initClean5sView = async function() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    clean5sSelectedDate = `${yyyy}-${mm}-${dd}`;

    if (typeof students !== 'undefined' && students && students.length > 0) {
        const uniqueRooms = [...new Set(students.map(s => `${s.grade}/${s.room}`))].filter(Boolean);
        if (uniqueRooms.length > 0) {
            clean5sRoomsArray = uniqueRooms;
        }
    }

    updateClean5sDateDisplay(clean5sSelectedDate);
    initClean5sDatePicker();
    await loadClean5sAvailableDates();
    setupClean5sMobileZoomAndPan();
};

window.loadClean5sAvailableDates = async function() {
    const db = getSupabase();
    if (!db) return;

    try {
        const { data: dateRows, error } = await db.from('evaluations')
            .select('eval_date')
            .order('eval_date', { ascending: false });

        clean5sEvaluatedDatesSet.clear();
        if (dateRows && dateRows.length > 0) {
            dateRows.forEach(row => {
                if (row.eval_date) {
                    const cleanD = String(row.eval_date).split('T')[0].trim();
                    if (cleanD) clean5sEvaluatedDatesSet.add(cleanD);
                }
            });
        }

        updateClean5sDateDisplay(clean5sSelectedDate);
        if (clean5sFlatpickrInstance) {
            clean5sFlatpickrInstance.setDate(clean5sSelectedDate, false);
            clean5sFlatpickrInstance.redraw();
        }

        await fetchClean5sDateDataAndRender(clean5sSelectedDate);
    } catch (err) {
        console.error("loadClean5sAvailableDates Error:", err);
    }
};

window.fetchClean5sDateDataAndRender = async function(targetDate) {
    const db = getSupabase();
    if (!db) return;

    try {
        const [dayRes, allEvals] = await Promise.all([
            db.from('evaluations').select('*').eq('eval_date', targetDate),
            fetchAllSupabaseRows(db, 'evaluations', '*', 'eval_date')
        ]);

        const dayEvals = dayRes.data || [];

        const existingData = {
            rClean: {}, swFan: {}, swBrd: {}, swTsh: {}, swChr: {},
            aClean: {}, swTls: {}, roomNotes: {}
        };

        dayEvals.forEach(row => {
            const room = (row.room_name || '').trim();
            const isClassSaved = (row.is_classroom_saved === true || row.is_classroom_saved === 'true' || row.is_classroom_saved === 1 || row.is_classroom_saved === '1');
            const isServSaved  = (row.is_service_saved === true || row.is_service_saved === 'true' || row.is_service_saved === 1 || row.is_service_saved === '1');

            if (isClassSaved) {
                existingData.rClean[room] = row.r_clean;
                existingData.swFan[room] = (row.sw_fan === -2);
                existingData.swBrd[room] = (row.sw_brd === -1);
                existingData.swTsh[room] = (row.sw_tsh === -1);
                existingData.swChr[room] = (row.sw_chr === -1);
                if (row.classroom_note) existingData.roomNotes[room] = row.classroom_note;
            }
            if (isServSaved) {
                existingData.aClean[room] = row.a_clean;
                existingData.swTls[room] = (row.sw_tls === -2);
                if (row.service_note) {
                    existingData.roomNotes[room] = existingData.roomNotes[room] 
                        ? `${existingData.roomNotes[room]} | ${row.service_note}` 
                        : row.service_note;
                }
            }
        });

        clean5sExistingData = existingData;

        const processedReport = processClean5sEvaluationsReport(allEvals, targetDate);
        clean5sCachedRawRecords = processedReport.rawRecords;

        setupClean5sSummaryFilterOptions(processedReport.monthsFilterList);
        renderClean5sClassroomForm(clean5sRoomsArray);
        renderClean5sServiceForm(clean5sRoomsArray);
        updateClean5sSavedStatusUI(clean5sExistingData);
        renderClean5sDailyReport(processedReport);
        calculateClean5sAccumulatedScores();
        updateClean5sDateDisplay(targetDate);
    } catch (err) {
        console.error("fetchClean5sDateDataAndRender Error:", err);
        showToast("เกิดข้อผิดพลาดในการโหลดข้อมูล 5ส.", "error");
    }
};

function processClean5sEvaluationsReport(allEvals, targetDateStr) {
    const THAI_MONTHS_NAMES = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];

    const dateMap = {};
    const monthSet = {};

    (allEvals || []).forEach(row => {
        const dStr = row.eval_date ? String(row.eval_date).split('T')[0].trim() : '';
        if (!dStr) return;

        const p = dStr.split('-');
        let mKey = "";
        if (p.length === 3) {
            const dObj = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
            const mIndex = dObj.getMonth();
            const yBE = dObj.getFullYear() + 543;
            mKey = `${THAI_MONTHS_NAMES[mIndex]} ${yBE}`;
            monthSet[mKey] = `${dObj.getFullYear()}-${String(mIndex + 1).padStart(2, '0')}`;
        }

        if (!dateMap[dStr]) {
            dateMap[dStr] = { monthKey: mKey, rooms: {} };
        }

        const room = (row.room_name || '').trim();
        if (!room) return;

        const isClassSaved = (row.is_classroom_saved === true || row.is_classroom_saved === 'true' || row.is_classroom_saved === 1 || row.is_classroom_saved === '1');
        const isServSaved  = (row.is_service_saved === true || row.is_service_saved === 'true' || row.is_service_saved === 1 || row.is_service_saved === '1');

        const rClean = isClassSaved ? (parseInt(row.r_clean, 10) || 0) : 0;
        const swFan  = isClassSaved ? (parseInt(row.sw_fan, 10) || 0) : 0;
        const swBrd  = isClassSaved ? (parseInt(row.sw_brd, 10) || 0) : 0;
        const swTsh  = isClassSaved ? (parseInt(row.sw_tsh, 10) || 0) : 0;
        const swChr  = isClassSaved ? (parseInt(row.sw_chr, 10) || 0) : 0;
        const roomTotal = isClassSaved ? (rClean + swFan + swBrd + swTsh + swChr) : 0;

        const aClean = isServSaved ? (parseInt(row.a_clean, 10) || 0) : 0;
        const swTls  = isServSaved ? (parseInt(row.sw_tls, 10) || 0) : 0;
        const assignTotal = isServSaved ? (aClean + swTls) : 0;

        const missedItems = [];
        if (isClassSaved) {
            if (swFan === -2) missedItems.push("ไม่ปิดไฟ/พัดลม");
            if (swBrd === -1) missedItems.push("ไม่ลบกระดาน");
            if (swTsh === -1) missedItems.push("ไม่เทขยะ");
            if (swChr === -1) missedItems.push("ไม่เก็บเก้าอี้");
        }
        if (isServSaved && swTls === -2) {
            missedItems.push("ไม่เก็บอุปกรณ์");
        }

        let note = "";
        if (row.classroom_note && row.service_note) {
            note = `${row.classroom_note} | ${row.service_note}`;
        } else {
            note = row.classroom_note || row.service_note || "";
        }

        dateMap[dStr].rooms[room] = {
            roomName: room,
            isClassSaved: isClassSaved,
            isServSaved: isServSaved,
            roomScore: roomTotal,
            assignScore: assignTotal,
            totalScore: roomTotal + assignTotal,
            missedList: missedItems,
            note: note
        };
    });

    const rawRecords = [];
    let todayRecords = [];

    for (const dStr in dateMap) {
        const roomsDataList = Object.values(dateMap[dStr].rooms);
        if (roomsDataList.length > 0) {
            rawRecords.push({
                dateStr: dStr,
                monthKey: dateMap[dStr].monthKey,
                roomsData: roomsDataList
            });

            if (dStr === targetDateStr) {
                todayRecords = roomsDataList;
            }
        }
    }

    const monthsFilterList = [];
    for (const key in monthSet) {
        monthsFilterList.push({ text: key, value: monthSet[key] });
    }
    monthsFilterList.sort((a, b) => b.value.localeCompare(a.value));

    return {
        today: todayRecords,
        rawRecords: rawRecords,
        monthsFilterList: monthsFilterList
    };
}

function setupClean5sSummaryFilterOptions(monthsList) {
    const filterSelect = document.getElementById("clean5s-summary-period-filter");
    if (!filterSelect) return;
    const previousValue = filterSelect.value;
    filterSelect.innerHTML = "";

    const optTerm = document.createElement("option");
    optTerm.value = "all";
    optTerm.innerText = "รวมภาคเรียนที่ 1 ปีการศึกษา 2569";
    filterSelect.appendChild(optTerm);

    if (monthsList && monthsList.length > 0) {
        monthsList.forEach(m => {
            const optM = document.createElement("option");
            optM.value = m.text;
            optM.innerText = "เดือน " + m.text;
            filterSelect.appendChild(optM);
        });
    }

    if (previousValue && filterSelect.querySelector(`option[value="${previousValue}"]`)) {
        filterSelect.value = previousValue;
    } else {
        filterSelect.value = "all";
    }
}

window.calculateClean5sAccumulatedScores = function() {
    const filterSelect = document.getElementById("clean5s-summary-period-filter");
    const filterMode = filterSelect ? filterSelect.value : "all";

    const summaryMap = {};
    const roomIncidentMap = {};
    const roomDaysMap = {};

    clean5sRoomsArray.forEach(room => {
        summaryMap[room] = 0;
        roomIncidentMap[room] = { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0 };
        roomDaysMap[room] = { classDays: 0, servDays: 0, totalDays: 0 };
    });

    if (clean5sCachedRawRecords && clean5sCachedRawRecords.length > 0) {
        clean5sCachedRawRecords.forEach(record => {
            if (filterMode !== "all" && record.monthKey !== filterMode) return;

            if (record.roomsData && Array.isArray(record.roomsData)) {
                record.roomsData.forEach(rData => {
                    const rName = (rData.roomName || '').trim();
                    if (summaryMap[rName] === undefined) {
                        summaryMap[rName] = 0;
                        roomIncidentMap[rName] = { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0 };
                        roomDaysMap[rName] = { classDays: 0, servDays: 0, totalDays: 0 };
                    }

                    summaryMap[rName] += parseInt(rData.totalScore, 10) || 0;

                    if (rData.isClassSaved) roomDaysMap[rName].classDays++;
                    if (rData.isServSaved) roomDaysMap[rName].servDays++;
                    if (rData.isClassSaved || rData.isServSaved) roomDaysMap[rName].totalDays++;

                    if (rData.missedList && Array.isArray(rData.missedList)) {
                        rData.missedList.forEach(txt => {
                            if (!txt) return;
                            const str = txt.toString();
                            if (str.includes("พัดลม") || str.includes("ไฟ")) roomIncidentMap[rName].fan++;
                            else if (str.includes("กระดาน")) roomIncidentMap[rName].brd++;
                            else if (str.includes("ขยะ")) roomIncidentMap[rName].tsh++;
                            else if (str.includes("เก้าอี้")) roomIncidentMap[rName].chr++;
                            else if (str.includes("อุปกรณ์") || str.includes("เก็บของ")) roomIncidentMap[rName].tls++;
                        });
                    }
                });
            }
        });
    }

    const scoredRoomsList = [];
    let maxScore = 1;

    clean5sRoomsArray.forEach(room => {
        const scr = summaryMap[room] || 0;
        if (scr > maxScore) maxScore = scr;

        scoredRoomsList.push({
            roomName: room,
            score: scr,
            stat: roomIncidentMap[room] || { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0 },
            days: roomDaysMap[room] || { classDays: 0, servDays: 0, totalDays: 0 }
        });
    });

    scoredRoomsList.sort((a, b) => b.score - a.score);

    let currentRank = 1;
    for (let i = 0; i < scoredRoomsList.length; i++) {
        if (i > 0 && scoredRoomsList[i].score < scoredRoomsList[i - 1].score) {
            currentRank = i + 1;
        }
        scoredRoomsList[i].rank = currentRank;
    }

    const mainContainer = document.getElementById("clean5s-unified-summary-container");
    if (!mainContainer) return scoredRoomsList;
    mainContainer.innerHTML = "";

    const trackCard = document.createElement("div");
    trackCard.className = "race-stadium-card";

    let trackHtml = `
        <div class="stadium-title">
            <i class="fa-solid fa-flag-checkered"></i> สรุปคะแนนความสะอาดสะสม
        </div>
        <div class="stadium-controls">
            <button type="button" class="stadium-btn-toggle-all" id="clean5sMasterToggleLanesBtn" onclick="toggleAllClean5sLanesVisibility()">📂 แสดงข้อมูลทั้งหมด</button>
        </div>
    `;

    clean5sRoomsArray.forEach((roomName, index) => {
        const currentRoomObj = scoredRoomsList.find(x => x.roomName === roomName);
        const currentScore = currentRoomObj ? currentRoomObj.score : 0;
        const currentRankNum = currentRoomObj ? currentRoomObj.rank : "-";
        const currentStatObj = currentRoomObj ? currentRoomObj.stat : { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0 };
        const currentDaysObj = currentRoomObj ? currentRoomObj.days : { classDays: 0, servDays: 0, totalDays: 0 };

        let runPercent = Math.floor((currentScore / maxScore) * 100);
        if (runPercent < 0) runPercent = 0;
        if (runPercent > 100) runPercent = 100;

        let badgeRankText = "";
        if (currentRankNum === 1) badgeRankText = "🥇";
        else if (currentRankNum === 2) badgeRankText = "🥈";
        else if (currentRankNum === 3) badgeRankText = "🥉";
        else {
            badgeRankText = `<span class="other-rank-circle">${currentRankNum}</span>`;
        }

        const laneColorIdx = index % 6;

        trackHtml += `
            <div class="lane-accordion-group">
                <div class="single-lane lane-color-${laneColorIdx}" onclick="toggleClean5sLaneDetails('${roomName}')">
                    <div class="lane-lane-line"></div>
                    <div class="lane-finish-flag"></div>
                    <div class="lane-runner-flow">
                        <div class="lane-spacer-drive" style="width: ${runPercent}%;"></div>
                        <div class="lane-car-badge">
                            <div class="runner-line-rank">${badgeRankText}</div>
                            <div class="runner-line-room">${roomName} (${currentScore})</div>
                        </div>
                    </div>
                </div>
                
                <div class="lane-collapsed-details" id="clean5s_details_lane_${roomName}">
                    <div class="sc-horizontal-badge-row">
                        <div class="sc-badge-unit">
                            <span class="sc-badge-circle ${currentStatObj.fan > 0 ? 'circle-orange' : 'circle-grey'}">💡</span>
                            <span class="sc-badge-label">ไม่ปิดไฟ (<span class="sum-orange-num">${currentStatObj.fan}</span>)</span>
                        </div>
                        <div class="sc-badge-unit">
                            <span class="sc-badge-circle ${currentStatObj.brd > 0 ? 'circle-orange' : 'circle-grey'}">📋</span>
                            <span class="sc-badge-label">ไม่ลบกระดาน (<span class="sum-orange-num">${currentStatObj.brd}</span>)</span>
                        </div>
                        <div class="sc-badge-unit">
                            <span class="sc-badge-circle ${currentStatObj.tsh > 0 ? 'circle-orange' : 'circle-grey'}">🗑️</span>
                            <span class="sc-badge-label">ไม่เทขยะ (<span class="sum-orange-num">${currentStatObj.tsh}</span>)</span>
                        </div>
                        <div class="sc-badge-unit">
                            <span class="sc-badge-circle ${currentStatObj.chr > 0 ? 'circle-orange' : 'circle-grey'}">🪑</span>
                            <span class="sc-badge-label">ไม่เก็บเก้าอี้ (<span class="sum-orange-num">${currentStatObj.chr}</span>)</span>
                        </div>
                        <div class="sc-badge-unit">
                            <span class="sc-badge-circle ${currentStatObj.tls > 0 ? 'circle-orange' : 'circle-grey'}">🧹</span>
                            <span class="sc-badge-label">ไม่เก็บอุปกรณ์ (<span class="sum-orange-num">${currentStatObj.tls}</span>)</span>
                        </div>
                        
                        <div class="sc-badge-unit">
                            <span class="sc-badge-circle circle-green-star">⭐</span>
                            <span class="sc-badge-label label-green-star">คะแนนสะสม (<strong>${currentScore}</strong>)</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    trackCard.innerHTML = trackHtml;
    mainContainer.appendChild(trackCard);

    clean5sAllExpandedState = false;
    return scoredRoomsList;
};

window.renderClean5sClassroomForm = function(rooms) {
    const container = document.getElementById("clean5s-classroom-container");
    if (!container) return;
    container.innerHTML = "";

    rooms.forEach(room => {
        const card = document.createElement("div");
        card.className = "clean5s-card";
        card.id = "clean5s_card_class_" + room;

        card.innerHTML = `
            <div style="text-align: center; margin-bottom: 8px;">
                <div class="clean5s-room-tag">
                    <i class="fa-solid fa-chalkboard-user"></i>
                    <span>ห้อง ${escapeClean5sHtml(room)}</span>
                </div>
            </div>

            <div class="clean5s-section-title clean5s-title-area1">ความสะอาดห้องเรียน</div>
            <div class="clean5s-score-group">
                <input type="radio" name="clean5s_r_clean_${room}" id="clean5s_rc_5_${room}" value="5" checked>
                <label class="clean5s-score-btn btn-score-high" for="clean5s_rc_5_${room}">ดี (5)</label>
                <input type="radio" name="clean5s_r_clean_${room}" id="clean5s_rc_3_${room}" value="3">
                <label class="clean5s-score-btn btn-score-med" for="clean5s_rc_3_${room}">พอใช้ (3)</label>
                <input type="radio" name="clean5s_r_clean_${room}" id="clean5s_rc_0_${room}" value="0">
                <label class="clean5s-score-btn btn-score-low" for="clean5s_rc_0_${room}">ปรับปรุง (0)</label>
            </div>
            
            <div class="clean5s-switch-grid">
                <div>
                    <input type="checkbox" id="clean5s_sw_fan_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_fan_${room}">💡 ไม่ปิดไฟ/พัดลม (-2)</label>
                </div>
                <div>
                    <input type="checkbox" id="clean5s_sw_chr_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_chr_${room}">🪑 ไม่เก็บเก้าอี้ (-1)</label>
                </div>
                <div>
                    <input type="checkbox" id="clean5s_sw_brd_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_brd_${room}">📋 ไม่ลบกระดาน (-1)</label>
                </div>
                <div>
                    <input type="checkbox" id="clean5s_sw_tsh_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_tsh_${room}">🗑️ ไม่เทขยะ (-1)</label>
                </div>
            </div>
            
            <div style="margin-top: 8px;">
                <input type="text" id="clean5s_note_class_${room}" class="clean5s-note-input" placeholder="📝 หมายเหตุห้อง ${escapeClean5sHtml(room)}...">
            </div>
        `;
        container.appendChild(card);

        if (clean5sExistingData && clean5sExistingData.rClean && clean5sExistingData.rClean[room] !== undefined) {
            const rVal = clean5sExistingData.rClean[room];
            const radR = document.querySelector(`input[name="clean5s_r_clean_${room}"][value="${rVal}"]`);
            if (radR) radR.checked = true;

            const swFanEl = document.getElementById(`clean5s_sw_fan_${room}`);
            const swBrdEl = document.getElementById(`clean5s_sw_brd_${room}`);
            const swTshEl = document.getElementById(`clean5s_sw_tsh_${room}`);
            const swChrEl = document.getElementById(`clean5s_sw_chr_${room}`);
            const noteEl  = document.getElementById(`clean5s_note_class_${room}`);

            if (swFanEl) swFanEl.checked = (clean5sExistingData.swFan[room] === true);
            if (swBrdEl) swBrdEl.checked = (clean5sExistingData.swBrd[room] === true);
            if (swTshEl) swTshEl.checked = (clean5sExistingData.swTsh[room] === true);
            if (swChrEl) swChrEl.checked = (clean5sExistingData.swChr[room] === true);
            if (noteEl) noteEl.value = clean5sExistingData.roomNotes[room] || "";
        }
    });
};

window.renderClean5sServiceForm = function(rooms) {
    const container = document.getElementById("clean5s-service-container");
    if (!container) return;
    container.innerHTML = "";

    rooms.forEach(room => {
        const card = document.createElement("div");
        card.className = "clean5s-card";
        card.id = "clean5s_card_service_" + room;

        card.innerHTML = `
            <div style="text-align: center; margin-bottom: 8px;">
                <div class="clean5s-room-tag" style="background: linear-gradient(135deg, #E8F5E9, #C8E6C9); color: #2E7D32; border-color: #A5D6A7;">
                    <i class="fa-solid fa-broom"></i>
                    <span>เขตบริการ : ${escapeClean5sHtml(room)}</span>
                </div>
            </div>

            <div class="clean5s-section-title clean5s-title-area2">ความสะอาดเขตบริการ</div>
            <div class="clean5s-score-group">
                <input type="radio" name="clean5s_a_clean_${room}" id="clean5s_ac_5_${room}" value="5" checked>
                <label class="clean5s-score-btn btn-score-high" for="clean5s_ac_5_${room}">ดี (5)</label>
                <input type="radio" name="clean5s_a_clean_${room}" id="clean5s_ac_3_${room}" value="3">
                <label class="clean5s-score-btn btn-score-med" for="clean5s_ac_3_${room}">พอใช้ (3)</label>
                <input type="radio" name="clean5s_a_clean_${room}" id="clean5s_ac_0_${room}" value="0">
                <label class="clean5s-score-btn btn-score-low" for="clean5s_ac_0_${room}">ปรับปรุง (0)</label>
            </div>
            
            <div class="clean5s-switch-grid" style="grid-template-columns: 1fr;">
                <div>
                    <input type="checkbox" id="clean5s_sw_tls_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_tls_${room}">🧹 ไม่เก็บอุปกรณ์ (-2)</label>
                </div>
            </div>
            
            <div style="margin-top: 8px;">
                <input type="text" id="clean5s_note_service_${room}" class="clean5s-note-input" placeholder="📝 หมายเหตุเขตบริการ ${escapeClean5sHtml(room)}...">
            </div>
        `;
        container.appendChild(card);

        if (clean5sExistingData && clean5sExistingData.aClean && clean5sExistingData.aClean[room] !== undefined) {
            const aVal = clean5sExistingData.aClean[room];
            const radA = document.querySelector(`input[name="clean5s_a_clean_${room}"][value="${aVal}"]`);
            if (radA) radA.checked = true;

            const swTlsEl = document.getElementById(`clean5s_sw_tls_${room}`);
            const noteEl  = document.getElementById(`clean5s_note_service_${room}`);

            if (swTlsEl) swTlsEl.checked = (clean5sExistingData.swTls[room] === true);
            if (noteEl) noteEl.value = clean5sExistingData.roomNotes[room] || "";
        }
    });
};

function updateClean5sSavedStatusUI(existingData) {
    const fabBtn = document.getElementById("clean5s-fab-btn");
    const fabIcon = document.getElementById("clean5s-fab-icon");
    if (!fabBtn || !fabIcon) return;

    if (clean5sCurrentSubTab === "classroom") {
        fabBtn.className = "clean5s-fab-btn";
        if (existingData && existingData.rClean && Object.keys(existingData.rClean).length > 0) {
            fabBtn.classList.add("is-saved");
            fabIcon.className = "fa-solid fa-circle-check";
            fabBtn.title = "บันทึกข้อมูลห้องเรียนแล้ว (คลิกเพื่อบันทึกซ้ำ)";
        } else {
            fabIcon.className = "fa-solid fa-floppy-disk";
            fabBtn.title = "บันทึกข้อมูลห้องเรียน";
        }
    } else if (clean5sCurrentSubTab === "service") {
        fabBtn.className = "clean5s-fab-btn";
        if (existingData && existingData.aClean && Object.keys(existingData.aClean).length > 0) {
            fabBtn.classList.add("is-saved");
            fabIcon.className = "fa-solid fa-circle-check";
            fabBtn.title = "บันทึกข้อมูลเขตบริการแล้ว (คลิกเพื่อบันทึกซ้ำ)";
        } else {
            fabIcon.className = "fa-solid fa-floppy-disk";
            fabBtn.title = "บันทึกข้อมูลเขตบริการ";
        }
    }
}

window.renderClean5sDailyReport = function(data) {
    const dailyContainer = document.getElementById("clean5s-daily-list-container");
    if (!dailyContainer) return;

    if (!data || !data.today || data.today.length === 0) {
        dailyContainer.innerHTML = `<div style="text-align: center; padding: 25px; color: #94A3B8; font-size: 0.9rem;">ยังไม่มีข้อมูลคะแนนของวันที่เลือก กรุณากรอกข้อมูลในแท็บบันทึกคะแนน</div>`;
    } else {
        dailyContainer.innerHTML = "";

        data.today.forEach(item => {
            const cardBox = document.createElement("div");
            cardBox.className = "compact-daily-card";

            let missedHtml = "";
            if (item.missedList && Array.isArray(item.missedList) && item.missedList.length > 0) {
                missedHtml += `<div class="missed-badge-box">`;
                item.missedList.forEach(mItem => {
                    missedHtml += `<span class="missed-item-pill">❌ ${escapeClean5sHtml(mItem)}</span>`;
                });
                missedHtml += `</div>`;
            } else {
                missedHtml = `<div style="color: #10B981; margin-top: 4px; font-size: 0.8rem; font-weight: 700;">✨ สะอาดเรียบร้อยครบถ้วน</div>`;
            }

            const roomScoreNum = parseInt(item.roomScore, 10) || 0;
            const assignScoreNum = parseInt(item.assignScore, 10) || 0;
            const totalScoreNum = parseInt(item.totalScore, 10) || (roomScoreNum + assignScoreNum);

            let scoreColorClass = "score-total-med";
            if (totalScoreNum >= 8) {
                scoreColorClass = "score-total-high";
            } else if (totalScoreNum < 5) {
                scoreColorClass = "score-total-low";
            }

            cardBox.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <div style="font-weight: 700; color: #1E293B; font-size: 0.95rem;">ห้อง ${escapeClean5sHtml(item.roomName)}</div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <span class="compact-score-pill score-pill-main">ห้อง: ${roomScoreNum}</span>
                        <span class="compact-score-pill score-pill-sub">เขต: ${assignScoreNum}</span>
                        <span class="score-pill-total-large ${scoreColorClass}">รวม: ${totalScoreNum}</span>
                    </div>
                </div>
                <div>${missedHtml}</div>
                ${item.note ? `<div class="dash-note-box-themed"><i class="fa-solid fa-thumbtack" style="font-size: 13px; margin-top: 2px;"></i><span>${escapeClean5sHtml(item.note)}</span></div>` : ""}
            `;
            dailyContainer.appendChild(cardBox);
        });
    }
};


window.toggleClean5sLaneDetails = function(roomName) {
    const element = document.getElementById("clean5s_details_lane_" + roomName);
    if (element) {
        element.classList.toggle("show-details");
    }
};

window.toggleAllClean5sLanesVisibility = function() {
    clean5sAllExpandedState = !clean5sAllExpandedState;
    const btn = document.getElementById("clean5sMasterToggleLanesBtn");
    const allDetailBoxes = document.querySelectorAll("#clean5s-unified-summary-container .lane-collapsed-details");

    allDetailBoxes.forEach(box => {
        if (clean5sAllExpandedState) {
            box.classList.add("show-details");
        } else {
            box.classList.remove("show-details");
        }
    });

    if (btn) {
        btn.innerText = clean5sAllExpandedState ? "🗂️ ซ่อนข้อมูลทั้งหมด" : "📂 แสดงข้อมูลทั้งหมด";
    }
};

window.switchClean5sTab = function(tab) {
    clean5sCurrentSubTab = tab;

    const tabs = ["classroom", "service", "daily", "summary"];
    tabs.forEach(t => {
        const btn = document.getElementById(`clean5s-tab-${t}`);
        const page = document.getElementById(`clean5s-page-${t}`);
        if (btn) btn.classList.remove("active");
        if (page) page.style.display = "none";
    });

    const activeBtn = document.getElementById(`clean5s-tab-${tab}`);
    const activePage = document.getElementById(`clean5s-page-${tab}`);
    if (activeBtn) activeBtn.classList.add("active");
    if (activePage) activePage.style.display = "block";

    const datePickerWrapper = document.getElementById("clean5s-date-picker-wrapper");
    const fabBtn = document.getElementById("clean5s-fab-btn");
    const fabIcon = document.getElementById("clean5s-fab-icon");

    if (tab === "classroom" || tab === "service") {
        if (datePickerWrapper) datePickerWrapper.style.display = "flex";
        if (fabBtn) fabBtn.className = "clean5s-fab-btn";
        updateClean5sSavedStatusUI(clean5sExistingData);
    } else if (tab === "daily") {
        if (datePickerWrapper) datePickerWrapper.style.display = "flex";
        if (fabBtn) {
            fabBtn.className = "clean5s-fab-btn mode-screenshot";
            if (fabIcon) fabIcon.className = "fa-solid fa-camera";
            fabBtn.title = "ถ่ายภาพสรุปประจำวัน";
        }
    } else if (tab === "summary") {
        if (datePickerWrapper) datePickerWrapper.style.display = "none";
        calculateClean5sAccumulatedScores();
        if (fabBtn) {
            fabBtn.className = "clean5s-fab-btn mode-screenshot";
            if (fabIcon) fabIcon.className = "fa-solid fa-camera";
            fabBtn.title = "ถ่ายภาพสรุปผลสะสม";
        }
    }
};

window.handleClean5sDateChange = async function() {
    const pickedDate = document.getElementById("clean5s-target-date-select").value;
    if (!pickedDate) return;
    clean5sSelectedDate = pickedDate;
    await fetchClean5sDateDataAndRender(pickedDate);
};

window.handleClean5sFabClick = function() {
    if (clean5sCurrentSubTab === "classroom" || clean5sCurrentSubTab === "service") {
        saveClean5sData(clean5sCurrentSubTab);
    } else if (clean5sCurrentSubTab === "daily") {
        generateClean5sScreenshot("daily");
    } else if (clean5sCurrentSubTab === "summary") {
        generateClean5sScreenshot("summary");
    }
};

window.saveClean5sData = async function(type) {
    const db = getSupabase();
    if (!db) {
        showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
        return;
    }

    setLoader(true);
    try {
        const recordsToUpsert = [];

        clean5sRoomsArray.forEach(roomName => {
            if (type === "classroom") {
                const radChecked = document.querySelector(`input[name="clean5s_r_clean_${roomName}"]:checked`);
                const rClean = radChecked ? parseInt(radChecked.value, 10) : 5;
                const swFan  = document.getElementById(`clean5s_sw_fan_${roomName}`)?.checked ? -2 : 0;
                const swBrd  = document.getElementById(`clean5s_sw_brd_${roomName}`)?.checked ? -1 : 0;
                const swTsh  = document.getElementById(`clean5s_sw_tsh_${roomName}`)?.checked ? -1 : 0;
                const swChr  = document.getElementById(`clean5s_sw_chr_${roomName}`)?.checked ? -1 : 0;
                const note   = document.getElementById(`clean5s_note_class_${roomName}`)?.value.trim() || "";

                recordsToUpsert.push({
                    eval_date: clean5sSelectedDate,
                    room_name: roomName,
                    r_clean: rClean,
                    sw_fan: swFan,
                    sw_brd: swBrd,
                    sw_tsh: swTsh,
                    sw_chr: swChr,
                    classroom_note: note,
                    is_classroom_saved: true
                });
            } else if (type === "service") {
                const radChecked = document.querySelector(`input[name="clean5s_a_clean_${roomName}"]:checked`);
                const aClean = radChecked ? parseInt(radChecked.value, 10) : 5;
                const swTls  = document.getElementById(`clean5s_sw_tls_${roomName}`)?.checked ? -2 : 0;
                const note   = document.getElementById(`clean5s_note_service_${roomName}`)?.value.trim() || "";

                recordsToUpsert.push({
                    eval_date: clean5sSelectedDate,
                    room_name: roomName,
                    a_clean: aClean,
                    sw_tls: swTls,
                    service_note: note,
                    is_service_saved: true
                });
            }
        });

        const { data, error } = await db.from('evaluations').upsert(recordsToUpsert, { onConflict: 'eval_date,room_name' });

        if (error) {
            console.error("Supabase Evaluations Save Error:", error);
            showToast("บันทึกล้มเหลว: " + error.message, "error");
        } else {
            showToast("บันทึกข้อมูลความสะอาดเรียบร้อย ⚡", "success");
            clean5sEvaluatedDatesSet.add(clean5sSelectedDate);
            if (clean5sFlatpickrInstance) {
                clean5sFlatpickrInstance.redraw();
            }
            await fetchClean5sDateDataAndRender(clean5sSelectedDate);
        }
    } catch (err) {
        console.error("saveClean5sData Error:", err);
        showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูล", "error");
    } finally {
        setLoader(false);
    }
};

window.generateClean5sScreenshot = function(type) {
    if (typeof html2canvas === 'undefined') {
        showToast("กำลังโหลดระบบประมวลผลรูปภาพ กรุณาลองใหม่อีกครั้ง", "warning");
        return;
    }

    setLoader(true);
    const secretBox = document.getElementById("secretScreenshotBox");
    if (!secretBox) {
        setLoader(false);
        return;
    }

    secretBox.className = "secret-screenshot-box";
    secretBox.innerHTML = "";

    const dateText = formatClean5sThaiDate(clean5sSelectedDate) || clean5sSelectedDate;

    const banner = document.createElement("div");
    banner.className = "screenshot-title-banner";

    if (type === "daily") {
        secretBox.classList.add("width-daily-screenshot");
        clean5sLatestFileName = "รายงานความสะอาดประจำวัน_" + clean5sSelectedDate;
        banner.innerHTML = `
            <h3 style="margin: 0; color: #FF6B8B; font-weight: 700; font-size: 1.3rem;">📋 รายงานผลการทำความสะอาด</h3>
            <div style="background: white; border: 1px solid #FFD1DC; color: #5D576B; display: inline-block; padding: 3px 12px; border-radius: 8px; font-weight: 700; margin-top: 6px; font-size: 0.9rem;">
                ประจำวันที่: ${escapeClean5sHtml(dateText)}
            </div>
        `;
        secretBox.appendChild(banner);

        const originalCards = document.querySelectorAll("#clean5s-daily-list-container .compact-daily-card");
        if (originalCards.length === 0) {
            const noDataBox = document.createElement("div");
            noDataBox.style.textAlign = "center";
            noDataBox.style.padding = "20px";
            noDataBox.style.color = "#94A3B8";
            noDataBox.innerText = "ไม่มีข้อมูลในวันนี้";
            secretBox.appendChild(noDataBox);
        } else {
            const grid2Col = document.createElement("div");
            grid2Col.className = "screenshot-daily-grid-2col";
            originalCards.forEach(card => {
                grid2Col.appendChild(card.cloneNode(true));
            });
            secretBox.appendChild(grid2Col);
        }
    } else {
        secretBox.classList.add("width-summary-screenshot");
        const filterSelect = document.getElementById("clean5s-summary-period-filter");
        const filterText = filterSelect && filterSelect.options[filterSelect.selectedIndex] 
            ? filterSelect.options[filterSelect.selectedIndex].text 
            : "ภาพรวม";
        clean5sLatestFileName = "รายงานคะแนนความสะอาดสะสม_" + (filterSelect ? filterSelect.value : "all");

        banner.innerHTML = `
            <h3 style="margin: 0; color: #FF6B8B; font-weight: 700; font-size: 1.3rem;">🏆 สรุปคะแนนการทำความสะอาด</h3>
            <div style="background: white; border: 1px solid #FFD1DC; color: #5D576B; display: inline-block; padding: 3px 12px; border-radius: 8px; font-weight: 700; margin-top: 6px; font-size: 0.9rem;">
                ประจำ: ${escapeClean5sHtml(filterText)}
            </div>
        `;
        secretBox.appendChild(banner);

        const scoredList = calculateClean5sAccumulatedScores();
        let maxScore = 1;
        scoredList.forEach(x => { if (x.score > maxScore) maxScore = x.score; });

        const mainContentWrapper = document.createElement("div");
        mainContentWrapper.style.padding = "0 8px";

        clean5sRoomsArray.forEach((roomName, index) => {
            const currentRoomObj = scoredList.find(x => x.roomName === roomName);
            const currentScore = currentRoomObj ? currentRoomObj.score : 0;
            const currentRankNum = currentRoomObj ? currentRoomObj.rank : "-";
            const currentStatObj = currentRoomObj ? currentRoomObj.stat : { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0 };

            let runPercent = Math.floor((currentScore / maxScore) * 100);
            if (runPercent < 0) runPercent = 0;
            if (runPercent > 100) runPercent = 100;

            let badgeRankText = "";
            if (currentRankNum === 1) badgeRankText = "🥇";
            else if (currentRankNum === 2) badgeRankText = "🥈";
            else if (currentRankNum === 3) badgeRankText = "🥉";
            else {
                badgeRankText = `<span class="other-rank-circle">${currentRankNum}</span>`;
            }

            const laneColorIdx = index % 6;

            const rowItem = document.createElement("div");
            rowItem.className = "screenshot-row-item";

            const trackWrapper = document.createElement("div");
            trackWrapper.className = "sc-track-wrapper";
            trackWrapper.innerHTML = `
                <div class="lane-accordion-group" style="margin: 0;">
                    <div class="single-lane lane-color-${laneColorIdx}">
                        <div class="lane-lane-line"></div>
                        <div class="lane-finish-flag"></div>
                        <div class="lane-runner-flow">
                            <div class="lane-spacer-drive" style="width: ${runPercent}%;"></div>
                            <div class="lane-car-badge">
                                <div class="runner-line-rank">${badgeRankText}</div>
                                <div class="runner-line-room">${escapeClean5sHtml(roomName)} (${currentScore})</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const infoWrapper = document.createElement("div");
            infoWrapper.className = "sc-info-wrapper";
            infoWrapper.innerHTML = `
                <div class="sc-horizontal-badge-row">
                    <div class="sc-badge-unit">
                        <span class="sc-badge-circle ${currentStatObj.fan > 0 ? 'circle-orange' : 'circle-grey'}">💡</span>
                        <span class="sc-badge-label">ไม่ปิดไฟ (<span class="sum-orange-num">${currentStatObj.fan}</span>)</span>
                    </div>
                    <div class="sc-badge-unit">
                        <span class="sc-badge-circle ${currentStatObj.brd > 0 ? 'circle-orange' : 'circle-grey'}">📋</span>
                        <span class="sc-badge-label">ไม่ลบกระดาน (<span class="sum-orange-num">${currentStatObj.brd}</span>)</span>
                    </div>
                    <div class="sc-badge-unit">
                        <span class="sc-badge-circle ${currentStatObj.tsh > 0 ? 'circle-orange' : 'circle-grey'}">🗑️</span>
                        <span class="sc-badge-label">ไม่เทขยะ (<span class="sum-orange-num">${currentStatObj.tsh}</span>)</span>
                    </div>
                    <div class="sc-badge-unit">
                        <span class="sc-badge-circle ${currentStatObj.chr > 0 ? 'circle-orange' : 'circle-grey'}">🪑</span>
                        <span class="sc-badge-label">ไม่เก็บเก้าอี้ (<span class="sum-orange-num">${currentStatObj.chr}</span>)</span>
                    </div>
                    <div class="sc-badge-unit">
                        <span class="sc-badge-circle ${currentStatObj.tls > 0 ? 'circle-orange' : 'circle-grey'}">🧹</span>
                        <span class="sc-badge-label">ไม่เก็บอุปกรณ์ (<span class="sum-orange-num">${currentStatObj.tls}</span>)</span>
                    </div>
                    <div class="sc-badge-unit">
                        <span class="sc-badge-circle circle-green-star">⭐</span>
                        <span class="sc-badge-label label-green-star">คะแนนสะสม (<strong>${currentScore}</strong>)</span>
                    </div>
                </div>
            `;

            rowItem.appendChild(trackWrapper);
            rowItem.appendChild(infoWrapper);
            mainContentWrapper.appendChild(rowItem);
        });

        secretBox.appendChild(mainContentWrapper);
    }

    setTimeout(() => {
        const renderWidth = (type === "daily") ? 960 : 1080;

        html2canvas(secretBox, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#FFF9F2",
            windowWidth: renderWidth
        }).then(canvas => {
            secretBox.innerHTML = "";

            const modalRenderArea = document.getElementById("clean5sModalRenderArea");
            if (!modalRenderArea) {
                setLoader(false);
                return;
            }
            modalRenderArea.innerHTML = "";

            clean5sLatestBlobUrl = canvas.toDataURL('image/png');

            const imgElement = document.createElement("img");
            imgElement.src = clean5sLatestBlobUrl;
            modalRenderArea.appendChild(imgElement);

            try {
                const link = document.createElement('a');
                link.download = clean5sLatestFileName + '.png';
                link.href = clean5sLatestBlobUrl;
                link.click();
            } catch (e) {
                console.warn("Auto-download blocked by browser permission.");
            }

            const overlayModal = document.getElementById("clean5sImagePreviewModal");
            if (overlayModal) overlayModal.classList.add("show");
            resetClean5sZoomState();
            setLoader(false);
        }).catch(err => {
            secretBox.innerHTML = "";
            console.error("html2canvas error:", err);
            showToast("เกิดข้อผิดพลาดในการประมวลผลรูปภาพ", "error");
            setLoader(false);
        });
    }, 450);
};

window.closeClean5sPreviewModal = function() {
    const overlayModal = document.getElementById("clean5sImagePreviewModal");
    if (overlayModal) overlayModal.classList.remove("show");
};

function setupClean5sMobileZoomAndPan() {
    const renderArea = document.getElementById("clean5sModalRenderArea");
    if (!renderArea) return;

    renderArea.addEventListener("wheel", e => {
        e.preventDefault();
        const img = renderArea.querySelector("img");
        if (!img) return;

        const delta = e.deltaY < 0 ? 0.12 : -0.12;
        clean5sScale = Math.min(Math.max(0.5, clean5sScale + delta), 4);
        updateClean5sImageTransformStyle();
    }, { passive: false });

    renderArea.addEventListener("touchstart", e => {
        const img = renderArea.querySelector("img");
        if (!img) return;

        if (e.touches.length === 1) {
            clean5sIsDragging = true;
            clean5sStartTouchX = e.touches[0].clientX - clean5sCurrentX;
            clean5sStartTouchY = e.touches[0].clientY - clean5sCurrentY;
        } else if (e.touches.length === 2) {
            clean5sIsDragging = false;
            clean5sStartDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            clean5sBaseScale = clean5sScale;
        }
    });

    renderArea.addEventListener("touchmove", e => {
        const img = renderArea.querySelector("img");
        if (!img) return;

        if (e.touches.length === 1 && clean5sIsDragging) {
            e.preventDefault();
            clean5sCurrentX = e.touches[0].clientX - clean5sStartTouchX;
            clean5sCurrentY = e.touches[0].clientY - clean5sStartTouchY;
            updateClean5sImageTransformStyle();
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = currentDistance / (clean5sStartDistance || 1);
            clean5sScale = Math.min(Math.max(0.5, clean5sBaseScale * factor), 4);
            updateClean5sImageTransformStyle();
        }
    }, { passive: false });

    renderArea.addEventListener("touchend", e => {
        if (e.touches.length === 0) clean5sIsDragging = false;
    });

    renderArea.addEventListener("mousedown", e => {
        clean5sIsDragging = true;
        clean5sStartTouchX = e.clientX - clean5sCurrentX;
        clean5sStartTouchY = e.clientY - clean5sCurrentY;
    });

    window.addEventListener("mousemove", e => {
        if (clean5sIsDragging && e.touches === undefined) {
            clean5sCurrentX = e.clientX - clean5sStartTouchX;
            clean5sCurrentY = e.clientY - clean5sStartTouchY;
            updateClean5sImageTransformStyle();
        }
    });

    window.addEventListener("mouseup", () => { clean5sIsDragging = false; });
}

function updateClean5sImageTransformStyle() {
    const modalArea = document.getElementById("clean5sModalRenderArea");
    if (!modalArea) return;
    const img = modalArea.querySelector("img");
    if (img) {
        img.style.transform = `translate(${clean5sCurrentX}px, ${clean5sCurrentY}px) scale(${clean5sScale})`;
    }
}

function resetClean5sZoomState() {
    clean5sScale = 1;
    clean5sCurrentX = 0;
    clean5sCurrentY = 0;
    updateClean5sImageTransformStyle();
}

