/**
 * misconduct.js - ระบบแจ้งพฤติกรรมนักเรียนแบบสแตนด์อโลน (Standalone Module)
 * โรงเรียนซับบอนวิทยาคม
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

// Global State
let misconductLogs = [];
let students = [];
let users = [];
let selectedMisconductStudent = null;
let loggedInUser = null;
let pinDigits = "";
let pinCallback = null;
let pinRequiredRole = null;

// Toast Helper
function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = "position: fixed; top: 20px; right: 20px; z-index: 100000; display: flex; flex-direction: column; gap: 10px; pointer-events: none;";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    let bg = "#1e293b";
    let icon = "fa-info-circle";
    if (type === "success") { bg = "#10b981"; icon = "fa-circle-check"; }
    else if (type === "error") { bg = "#ef4444"; icon = "fa-circle-exclamation"; }
    else if (type === "warning") { bg = "#f59e0b"; icon = "fa-triangle-exclamation"; }

    toast.style.cssText = `background: ${bg}; color: white; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px; pointer-events: auto; animation: slideIn 0.3s ease; font-family: 'Sarabun', sans-serif;`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// Loader Helper
function setLoader(show) {
    const el = document.getElementById("app-loader");
    if (el) {
        el.style.display = show ? "flex" : "none";
    }
}

// Get Local Date YYYY-MM-DD
function getLocalDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Load Students Safe
async function getStudentsSafe() {
    if (students && students.length > 0) return students;
    const db = getSupabase();
    if (db) {
        try {
            const { data } = await db.from('std').select('*').order('grade').order('room').order('no');
            if (data && data.length > 0) {
                let roomCounters = {};
                students = data.map(r => {
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
                return students;
            }
        } catch (e) {
            console.warn("Could not fetch students from Supabase:", e);
        }
    }
    return [];
}

// Load Users Safe
async function getUsersSafe() {
    if (users && users.length > 0) return users;
    const db = getSupabase();
    if (db) {
        try {
            let { data, error } = await db.from('usr').select('*').order('id');
            if (error || !data || data.length === 0) {
                const fallback = await db.from('users').select('*');
                data = fallback.data;
            }
            if (data && data.length > 0) {
                users = data.map((u, idx) => ({
                    code: u.code || ('T' + String(idx + 1).padStart(3, '0')),
                    name: u.name,
                    role: u.role || 'TEACHER',
                    pin: u.pin
                }));
                return users;
            }
        } catch (e) {
            console.warn("Could not fetch users from Supabase:", e);
        }
    }
    return [];
}

// =========================================================
// Misconduct Data Fetch & Render
// =========================================================

async function fetchMisconductDataOnce() {
    setLoader(true);
    const db = getSupabase();
    if (!db) {
        setLoader(false);
        return;
    }
    try {
        await Promise.all([getStudentsSafe(), getUsersSafe()]);
        const { data, error } = await db.from('mis').select('*').order('date', { ascending: false });
        if (error) throw error;
        misconductLogs = (data || []).map(r => {
            const st = students.find(s => s.studentId === r.student_id);
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
        renderMisconductTable();
    } catch (e) {
        console.error("Supabase fetchMisconductDataOnce error:", e);
        showToast("เกิดข้อผิดพลาดในการโหลดข้อมูลความประพฤติ", "error");
    } finally {
        setLoader(false);
    }
}

function renderMisconductTable() {
    const tbody = document.getElementById("misconduct-table-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const filterVal = document.getElementById("misconduct-filter-select") ? document.getElementById("misconduct-filter-select").value : "ALL";
    let displayLogs = misconductLogs;
    if (filterVal === "RESOLVED") {
        displayLogs = misconductLogs.filter(log => log.resolved);
    } else if (filterVal === "UNRESOLVED") {
        displayLogs = misconductLogs.filter(log => !log.resolved);
    }
    
    if (displayLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="txt-center" style="color: var(--text-muted); padding: 35px;">ไม่มีบันทึกข้อมูลการทำความผิด</td></tr>';
        return;
    }
    
    displayLogs.forEach((item, index) => {
        const tr = document.createElement("tr");
        
        const dateParts = (item.date || '').split("-");
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${parseInt(dateParts[0]) + 543}` : item.date;
        
        const recorderTeacher = users.find(u => u.code === item.recorder || u.name === item.recorder);
        const displayRecorderName = recorderTeacher ? recorderTeacher.name : (item.recorder || 'ครูผู้สอน');
        
        tr.innerHTML = `
            <td class="txt-center">
                <button type="button" class="btn-toggle-resolve" data-id="${item.id}" style="background: none; border: none; cursor: pointer; color: ${item.resolved ? 'var(--color-success, #10b981)' : '#cbd5e1'}; font-size: 24px; padding: 0; display: flex; align-items: center; justify-content: center; margin: 0 auto; transition: 0.2s;" title="${item.resolved ? 'แก้ไขแล้ว (คลิกเพื่อแก้ไข/ยกเลิก)' : 'ยังไม่แก้ไข (คลิกเพื่อบันทึกการแก้ไข)'}">
                    <i class="fa-${item.resolved ? 'solid fa-square-check' : 'regular fa-square'}" style="pointer-events: none;"></i>
                </button>
            </td>
            <td class="txt-center row-clickable">${index + 1}</td>
            <td class="row-clickable" style="white-space: nowrap;"><strong>${item.name}</strong></td>
            <td class="row-clickable">${item.grade}/${item.room}</td>
            <td class="row-clickable">${formattedDate}</td>
            <td class="row-clickable" style="max-width: 140px;"><div style="font-size: 13px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.description}">${item.description}</div></td>
            <td class="row-clickable" style="max-width: 120px;"><div style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayRecorderName}">${displayRecorderName}</div></td>
            <td class="row-clickable" style="max-width: 140px;"><div style="font-size: 13px; color: ${item.resolution ? '#166534' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.resolution || '-'}">${item.resolution || '-'}</div></td>
            <td class="txt-center">
                <button class="delete-btn" onclick="deleteMisconduct('${item.id}')" title="ลบรายการ" style="color: #ef4444; background: none; border: none; cursor: pointer; padding: 4px 8px; font-size: 14px;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        
        // Open details modal on row click
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
        
        // Toggle resolve button click
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
            
            input.value = "";
            
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
                        const dateStr = new Date().toLocaleDateString('th-TH');
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
                            showToast("อัปเดตสถานะความประพฤติเรียบร้อย ⚡", "success");
                        } catch (err) {
                            console.error("Supabase toggle resolve error:", err);
                            showToast("เกิดข้อผิดพลาดในการอัปเดตสถานะ", "error");
                        }
                    }
                });
            };
        };
        
        tbody.appendChild(tr);
    });
}

// Delete Misconduct
window.deleteMisconduct = function(id) {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบบันทึกความประพฤตินี้?")) return;
    
    openPinModal("ป้อนรหัสแอดมิน / ครูปกครอง", "STUDENT_AFFAIRS", async () => {
        setLoader(true);
        const db = getSupabase();
        if (db) {
            try {
                const { error } = await db.from('mis').delete().eq('id', id);
                if (error) throw error;
                showToast("ลบบันทึกความประพฤติสำเร็จ ⚡", "success");
                await fetchMisconductDataOnce();
            } catch (err) {
                console.error("Supabase delete misconduct error:", err);
                showToast("เกิดข้อผิดพลาดในการลบ", "error");
            } finally {
                setLoader(false);
            }
        }
    });
};

// =========================================================
// Search & Select Student for Misconduct
// =========================================================

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
        (s.fullName && s.fullName.toLowerCase().includes(query.toLowerCase())) || 
        (s.studentId && String(s.studentId).includes(query))
    ).slice(0, 15);
    
    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-item" style="color: var(--text-muted); padding: 8px 12px; cursor: default;">ไม่พบนักเรียน</div>';
    } else {
        filtered.forEach(s => {
            const div = document.createElement("div");
            div.className = "dropdown-item";
            div.style.cssText = "padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9;";
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
    
    let activeTeacher = null;
    if (userName) {
        activeTeacher = users.find(u => u.name === userName);
    }
    if (!activeTeacher && pinCode) {
        activeTeacher = users.find(u => String(u.pin) === String(pinCode));
    }
    if (!activeTeacher && loggedInUser) {
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
            
            showToast("เพิ่มบันทึกความประพฤติสำเร็จ ⚡", "success");
            document.getElementById("modal-add-misconduct").classList.remove("active");
            document.getElementById("misconduct-desc-input").value = "";
            document.getElementById("misconduct-student-search").value = "";
            document.getElementById("selected-student-display").classList.add("hidden");
            selectedMisconductStudent = null;
            
            await fetchMisconductDataOnce();
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

// =========================================================
// Keypad & PIN Verification Modal
// =========================================================

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
    
    let matchedUser = users.find(u => String(u.pin).trim() === String(pinDigits).trim());
    
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
        }
        
        if (isAuthorized) {
            loggedInUser = matchedUser;
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

window.requestLogin = function(roleRequired = "ANY", callback = null) {
    if (loggedInUser) {
        let isAuthorized = false;
        const userRole = loggedInUser.role;
        if (roleRequired === "ANY") isAuthorized = true;
        else if (roleRequired === "ADMIN" && userRole === "ADMIN") isAuthorized = true;
        else if (roleRequired === "STUDENT_AFFAIRS" && (userRole === "ADMIN" || userRole === "STUDENT_AFFAIRS" || userRole === "กิจการนักเรียน")) isAuthorized = true;
        
        if (isAuthorized) {
            if (callback) callback(loggedInUser.pin, loggedInUser.name, loggedInUser.role);
        } else {
            showToast("คุณไม่มีสิทธิ์ในการดำเนินรายการนี้", "error");
        }
    } else {
        openPinModal("กรุณาเข้าสู่ระบบ", roleRequired, callback);
    }
};

// =========================================================
// Initialization
// =========================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Open Add Misconduct Modal
    const btnOpen = document.getElementById("btn-open-add-misconduct");
    if (btnOpen) {
        btnOpen.onclick = () => {
            document.getElementById("misconduct-date-input").value = getLocalDateString();
            document.getElementById("modal-add-misconduct").classList.add("active");
        };
    }
    
    // Filter Change
    const filterSelect = document.getElementById("misconduct-filter-select");
    if (filterSelect) {
        filterSelect.onchange = () => renderMisconductTable();
    }
    
    // Search Student
    const searchInput = document.getElementById("misconduct-student-search");
    if (searchInput) {
        searchInput.oninput = (e) => handleMisconductSearch(e.target.value);
        searchInput.onfocus = (e) => {
            if (e.target.value.trim()) handleMisconductSearch(e.target.value);
        };
    }
    
    // Submit Add Misconduct
    const btnSubmit = document.getElementById("btn-submit-misconduct");
    if (btnSubmit) {
        btnSubmit.onclick = () => {
            requestLogin("ANY", (pinCode, userName) => {
                submitMisconduct(pinCode, userName);
            });
        };
    }
    
    // Close Modals Trigger
    document.querySelectorAll(".close-modal-trigger").forEach(trigger => {
        trigger.onclick = () => {
            document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
            const dd = document.getElementById("misconduct-student-dropdown");
            if (dd) dd.classList.remove("active");
        };
    });
    
    // Keypad Buttons
    document.querySelectorAll("#modal-pin .key-btn").forEach(btn => {
        btn.onclick = () => {
            const key = btn.getAttribute("data-key");
            handleKeypadPress(key);
        };
    });
    
    // Physical Keyboard support for PIN
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
    
    // Outside click to close dropdown
    document.addEventListener("click", (e) => {
        const container = document.querySelector(".searchable-select-container");
        if (container && !container.contains(e.target)) {
            const dropdown = document.getElementById("misconduct-student-dropdown");
            if (dropdown) dropdown.classList.remove("active");
        }
    });

    // Load initial data
    await fetchMisconductDataOnce();
});
