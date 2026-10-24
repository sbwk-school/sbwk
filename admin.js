/**
 * admin.js - ระบบผู้ดูแลระบบ (Admin Console) โรงเรียนซับบอนวิทยาคม
 * รวมศูนย์การตั้งค่าปีการศึกษา ภาคเรียน วันหยุด จัดการครู และฐานข้อมูล
 */

// Global State
let adminSettings = {
    academic_year: "2569",
    current_term: "1",
    term1_start: "2026-05-16",
    term1_end: "2026-10-10",
    term2_start: "2026-11-01",
    term2_end: "2027-03-31",
    auto_term: true,
    school_name: "โรงเรียนซับบอนวิทยาคม",
    work_group: "กลุ่มงานบริหารทั่วไป",
    academic_years: [
        {
            year: "2568",
            term1_start: "2025-05-16",
            term1_end: "2025-10-10",
            term2_start: "2025-11-01",
            term2_end: "2026-03-31",
            is_current: false
        },
        {
            year: "2569",
            term1_start: "2026-05-16",
            term1_end: "2026-10-10",
            term2_start: "2026-11-01",
            term2_end: "2027-03-31",
            is_current: true
        },
        {
            year: "2570",
            term1_start: "2027-05-16",
            term1_end: "2027-10-10",
            term2_start: "2027-11-01",
            term2_end: "2028-03-31",
            is_current: false
        }
    ]
};

function getDefaultAcademicYears() {
    return [
        {
            year: "2568",
            term1_start: "2025-05-16",
            term1_end: "2025-10-10",
            term2_start: "2025-11-01",
            term2_end: "2026-03-31",
            is_current: false
        },
        {
            year: "2569",
            term1_start: "2026-05-16",
            term1_end: "2026-10-10",
            term2_start: "2026-11-01",
            term2_end: "2027-03-31",
            is_current: true
        },
        {
            year: "2570",
            term1_start: "2027-05-16",
            term1_end: "2027-10-10",
            term2_start: "2027-11-01",
            term2_end: "2028-03-31",
            is_current: false
        }
    ];
}

let adminHolidays = [];
let adminTeachers = [];
let pinDigits = "";

// -------------------------------------------------------------
// 1. ระบบยืนยันตัวตน (Admin PIN Security Gate เหมือนหน้า Index 100%)
// -------------------------------------------------------------

function checkAdminAuth() {
    const sessionUser = window.SBWK_SESSION ? window.SBWK_SESSION.getUser() : null;
    const isAuthed = (sessionUser && String(sessionUser.role).toUpperCase() === "ADMIN") || sessionStorage.getItem("sbwk_admin_auth") === "true";
    const modal = document.getElementById("modal-pin");
    const userDisplay = document.getElementById("admin-user-display");
    const savedUser = (sessionUser && sessionUser.name) || sessionStorage.getItem("sbwk_admin_user");
    if (userDisplay && savedUser) {
        userDisplay.innerText = savedUser;
    }

    if (isAuthed) {
        if (modal) modal.classList.remove("active");
        initAdminDashboard();
    } else {
        if (modal) modal.classList.add("active");
        pinDigits = "";
        updatePinDots();
        initPinKeypadListeners();
    }
}

function updatePinDots() {
    const dots = document.querySelectorAll("#modal-pin .pin-dot");
    dots.forEach((dot, index) => {
        if (index < pinDigits.length) {
            dot.classList.add("active");
        } else {
            dot.classList.remove("active");
        }
    });
}

function initPinKeypadListeners() {
    const buttons = document.querySelectorAll("#modal-pin .key-btn");
    buttons.forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const key = btn.getAttribute("data-key");
            handleAdminKeypadPress(key);
        };
    });
}

window.handleAdminKeypadPress = async function(key) {
    const errorMsg = document.getElementById("pin-error-message");
    if (errorMsg) errorMsg.innerText = "";

    if (key === "cancel") {
        window.location.href = "index.html";
        return;
    }

    if (key === "clear") {
        if (pinDigits.length > 0) {
            pinDigits = pinDigits.slice(0, -1);
            updatePinDots();
        }
        return;
    }

    if (pinDigits.length < 4) {
        pinDigits += key;
        updatePinDots();
    }

    if (pinDigits.length === 4) {
        if (errorMsg) errorMsg.innerText = "กำลังตรวจสอบรหัส...";
        setLoader(true, "กำลังตรวจสอบสิทธิ์...");
        setTimeout(async () => {
            const authResult = await verifyAdminPin(pinDigits);
            setLoader(false);
            if (authResult.valid) {
                if (window.SBWK_SESSION) window.SBWK_SESSION.setUser({ name: authResult.userName || "Admin", role: "ADMIN", pin: pinDigits });
                sessionStorage.setItem("sbwk_admin_auth", "true");
                sessionStorage.setItem("sbwk_admin_user", authResult.userName || "Admin");
                const userDisplay = document.getElementById("admin-user-display");
                if (userDisplay) userDisplay.innerText = authResult.userName || "Admin";

                document.getElementById("modal-pin")?.classList.remove("active");
                showToast("เข้าสู่ระบบแอดมินสำเร็จ ⚡", "success");
                initAdminDashboard();
            } else {
                if (errorMsg) errorMsg.innerText = "รหัส PIN ผิดพลาด กรุณาลองใหม่";
                pinDigits = "";
                updatePinDots();
                setTimeout(() => {
                    if (errorMsg) errorMsg.innerText = "";
                }, 2500);
            }
        }, 200);
    }
};

// Keyboard listener for PIN & Modals
window.addEventListener("keydown", (e) => {
    const pinModal = document.getElementById("modal-pin");
    if (pinModal && pinModal.classList.contains("active")) {
        if (e.key >= '0' && e.key <= '9') {
            handleAdminKeypadPress(e.key);
        } else if (e.key === 'Backspace') {
            handleAdminKeypadPress('clear');
        } else if (e.key === 'Escape') {
            window.location.href = 'index.html';
        }
        return;
    }

    if (e.key === 'Escape') {
        if (typeof closeAcademicYearModal === 'function') closeAcademicYearModal();
        if (typeof closeAddTeacherModal === 'function') closeAddTeacherModal();
        if (typeof closeConfirmClearModal === 'function') closeConfirmClearModal();
    }
});

async function verifyAdminPin(enteredPin) {
    // 1. PIN 9999 Master Backup
    if (enteredPin === "9999") return { valid: true, userName: "Admin (Master)" };

    // 2. ตรวจสอบกับผู้ใช้งานที่มี role = 'ADMIN' ใน Supabase
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { data, error } = await db.from('usr').select('*');
            if (!error && data && data.length > 0) {
                const match = data.find(u => String(u.pin).trim() === String(enteredPin).trim() && u.role === 'ADMIN');
                if (match) return { valid: true, userName: match.name };
            }
        } catch (err) {
            console.warn("verifyAdminPin error:", err);
        }
    }
    return { valid: false };
}

window.logoutAdmin = function() {
    if (confirm("ต้องการออกจากระบบแอดมินและกลับสู่หน้าหลักหรือไม่?")) {
        if (window.SBWK_SESSION) window.SBWK_SESSION.clearUser();
        sessionStorage.removeItem("sbwk_admin_auth");
        window.location.href = "index.html";
    }
};

// -------------------------------------------------------------
// 2. การจัดการแท็บ (Tabs Switching)
// -------------------------------------------------------------

function initTabs() {
    const tabButtons = document.querySelectorAll(".admin-tab-btn, .admin-nav-tab");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");
            
            tabButtons.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const targetPane = document.getElementById(`tab-${tabId}`);
            if (targetPane) targetPane.classList.add("active");

            // โหลดข้อมูลเฉพาะแท็บเมื่อคลิก
            if (tabId === "holidays") {
                loadHolidays();
            } else if (tabId === "teachers") {
                loadTeachers();
            } else if (tabId === "maintenance") {
                checkSupabaseHealth();
            }
        });
    });
}

// -------------------------------------------------------------
// 3. แท็บที่ 1: ตั้งค่าปีการศึกษา & ภาคเรียน (Centralized Settings & Table)
// -------------------------------------------------------------

window.setTermMode = function(isAuto) {
    adminSettings.auto_term = isAuto;
    const btnAuto = document.getElementById("mode-btn-auto");
    const btnManual = document.getElementById("mode-btn-manual");
    const manualSelector = document.getElementById("manual-term-selector-box");

    if (isAuto) {
        btnAuto?.classList.add("active");
        btnManual?.classList.remove("active");
        if (manualSelector) manualSelector.style.display = "none";
    } else {
        btnManual?.classList.add("active");
        btnAuto?.classList.remove("active");
        if (manualSelector) manualSelector.style.display = "block";
    }
    updateAcademicDisplay();
    saveAcademicSettingsToStorageAndDb();
};

window.setManualTerm = function(termVal) {
    adminSettings.current_term = String(termVal);
    updateAcademicDisplay();
    saveAcademicSettingsToStorageAndDb();
    showToast(`เปลี่ยนเป็นภาคเรียนที่ ${termVal} เรียบร้อย ⚡`, "info");
};

function computeCurrentTerm(settings) {
    if (!settings.auto_term) {
        return settings.current_term || "1";
    }

    const todayStr = getTodayIsoDate();
    const t1Start = settings.term1_start || "2026-05-16";
    const t1End = settings.term1_end || "2026-10-10";
    const t2Start = settings.term2_start || "2026-11-01";
    const t2End = settings.term2_end || "2027-03-31";

    if (todayStr >= t1Start && todayStr <= t1End) {
        return "1";
    } else if (todayStr >= t2Start && todayStr <= t2End) {
        return "2";
    } else {
        // หากอยู่นอกช่วง (ช่วงปิดเทอม) ให้ดูว่าใกล้ช่วงไหนมากกว่า
        if (todayStr < t1Start || todayStr > t2End) {
            return "1";
        }
        return "2";
    }
}

function updateAcademicDisplay() {
    const term = computeCurrentTerm(adminSettings);
    const year = adminSettings.academic_year || "2569";
    const titleText = `ภาคเรียนที่ ${term} ปีการศึกษา ${year}`;

    // 1. Top Navbar Pill
    const navPill = document.getElementById("nav-current-term-year");
    if (navPill) navPill.innerText = titleText;

    // 2. Banner
    const bannerTitle = document.getElementById("banner-academic-title");
    if (bannerTitle) bannerTitle.innerText = titleText;

    const bannerMode = document.getElementById("banner-mode-pill");
    if (bannerMode) {
        bannerMode.innerText = adminSettings.auto_term ? "โหมด: อัตโนมัติตามวันที่" : "โหมด: กำหนดเอง (Manual)";
    }

    const dateRangeText = document.getElementById("banner-date-range-text");
    if (dateRangeText) {
        if (term === "1") {
            dateRangeText.innerText = `ช่วงเปิดเทอม 1: ${formatThaiFriendlyDate(adminSettings.term1_start)} - ${formatThaiFriendlyDate(adminSettings.term1_end)}`;
        } else {
            dateRangeText.innerText = `ช่วงเปิดเทอม 2: ${formatThaiFriendlyDate(adminSettings.term2_start)} - ${formatThaiFriendlyDate(adminSettings.term2_end)}`;
        }
    }

    // 3. Quick Display Box
    const quickYear = document.getElementById("quick-active-year");
    if (quickYear) quickYear.innerText = year;
    const quickTerm = document.getElementById("quick-active-term");
    if (quickTerm) quickTerm.innerText = `ภาคเรียนที่ ${term}`;
    const quickRange = document.getElementById("quick-active-range");
    if (quickRange) {
        if (term === "1") {
            quickRange.innerText = `${formatThaiFriendlyDate(adminSettings.term1_start)} – ${formatThaiFriendlyDate(adminSettings.term1_end)}`;
        } else {
            quickRange.innerText = `${formatThaiFriendlyDate(adminSettings.term2_start)} – ${formatThaiFriendlyDate(adminSettings.term2_end)}`;
        }
    }
}

async function loadAcademicSettings() {
    // 1. เรนเดอร์ทันทีด้วยค่าเริ่มต้น เพื่อให้ตารางแสดงผลทันทีแบบ Zero-Delay
    validateAcademicYearsState();
    populateSettingsInputs();
    updateAcademicDisplay();
    renderAcademicYearsTable();

    // 2. ดึงจาก localStorage มาทับทันที (อัปเดตแบบเร็วที่สุด)
    try {
        const cached = localStorage.getItem("sbwk_system_settings");
        if (cached) {
            const parsed = JSON.parse(cached);
            adminSettings = { ...adminSettings, ...parsed };
            validateAcademicYearsState();
            populateSettingsInputs();
            updateAcademicDisplay();
            renderAcademicYearsTable();
        }
    } catch (e) {}

    // 3. ซิงค์กับตาราง academic_years ใน Supabase Cloud (Single Clean Table)
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { data, error } = await db.from('academic_years').select('*').order('year', { ascending: true });
            if (!error && data && data.length > 0) {
                adminSettings.academic_years = data.map(r => ({
                    year: String(r.year),
                    term1_start: r.term1_start,
                    term1_end: r.term1_end,
                    term2_start: r.term2_start,
                    term2_end: r.term2_end,
                    is_current: Boolean(r.is_current)
                }));

                // หาปีการศึกษาที่ตั้งเป็น is_current = true
                const activeYearObj = adminSettings.academic_years.find(y => y.is_current) || adminSettings.academic_years[adminSettings.academic_years.length - 1];
                if (activeYearObj) {
                    adminSettings.academic_year = activeYearObj.year;
                    adminSettings.term1_start = activeYearObj.term1_start;
                    adminSettings.term1_end = activeYearObj.term1_end;
                    adminSettings.term2_start = activeYearObj.term2_start;
                    adminSettings.term2_end = activeYearObj.term2_end;
                }

                adminSettings.current_term = computeCurrentTerm(adminSettings);
                validateAcademicYearsState();
                localStorage.setItem("sbwk_system_settings", JSON.stringify(adminSettings));
                populateSettingsInputs();
                updateAcademicDisplay();
                renderAcademicYearsTable();
            } else {
                // หากหลังบ้านยังไม่มีข้อมูล ให้ auto-save ข้อมูลปัจจุบันขึ้นหลังบ้านทันที
                await saveAcademicSettingsToStorageAndDb();
            }
        } catch (err) {
            console.warn("loadAcademicSettings db error:", err);
        }
    }
}

function validateAcademicYearsState() {
    if (!adminSettings.academic_years || !Array.isArray(adminSettings.academic_years) || adminSettings.academic_years.length === 0) {
        adminSettings.academic_years = getDefaultAcademicYears();
    }

    // ตรวจสอบว่าปีปัจจุบันมีอยู่ในตารางหรือไม่ หากไม่มีให้เพิ่มเข้าไป
    const currentYearStr = String(adminSettings.academic_year || "2569");
    let match = adminSettings.academic_years.find(y => String(y.year) === currentYearStr);
    if (!match) {
        match = {
            year: currentYearStr,
            term1_start: adminSettings.term1_start || "2026-05-16",
            term1_end: adminSettings.term1_end || "2026-10-10",
            term2_start: adminSettings.term2_start || "2026-11-01",
            term2_end: adminSettings.term2_end || "2027-03-31",
            is_current: true
        };
        adminSettings.academic_years.push(match);
    }

    // ซิงค์สถานะ is_current และวันเปิดปิดของปีที่ใช้งาน
    adminSettings.academic_years.forEach(y => {
        y.is_current = (String(y.year) === currentYearStr);
        if (y.is_current) {
            adminSettings.term1_start = y.term1_start || adminSettings.term1_start;
            adminSettings.term1_end = y.term1_end || adminSettings.term1_end;
            adminSettings.term2_start = y.term2_start || adminSettings.term2_start;
            adminSettings.term2_end = y.term2_end || adminSettings.term2_end;
        }
    });

    adminSettings.academic_years.sort((a, b) => parseInt(a.year || 0) - parseInt(b.year || 0));
}

function populateSettingsInputs() {
    const elSchool = document.getElementById("input-school-name");
    if (elSchool) elSchool.value = adminSettings.school_name || "โรงเรียนซับบอนวิทยาคม";

    const elGroup = document.getElementById("input-work-group");
    if (elGroup) elGroup.value = adminSettings.work_group || "กลุ่มงานบริหารทั่วไป";

    const topSchool = document.getElementById("header-school-name") || document.getElementById("top-school-name");
    if (topSchool && adminSettings.school_name) topSchool.innerText = adminSettings.school_name;

    // Set Term Mode
    setTermMode(Boolean(adminSettings.auto_term));

    // Manual radio
    const manualRadios = document.querySelectorAll('input[name="manual_term"]');
    manualRadios.forEach(r => {
        r.checked = (r.value === String(adminSettings.current_term));
    });
}

// -------------------------------------------------------------
// ตารางปีการศึกษา & การเพิ่ม/แก้ไข/ลบ/เปิดใช้งาน (Academic Years Table)
// -------------------------------------------------------------

window.renderAcademicYearsTable = function() {
    const tbody = document.getElementById("academic-years-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!adminSettings.academic_years || adminSettings.academic_years.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">ไม่มีข้อมูลปีการศึกษา กรุณากดปุ่ม "+ เพิ่มปีการศึกษาใหม่"</td></tr>';
        return;
    }

    const sorted = [...adminSettings.academic_years].sort((a, b) => parseInt(a.year || 0) - parseInt(b.year || 0));

    sorted.forEach((y, index) => {
        const tr = document.createElement("tr");
        const isCurrent = (String(y.year) === String(adminSettings.academic_year));
        if (isCurrent) tr.className = "academic-row-active";

        const t1Range = `${formatThaiFriendlyDate(y.term1_start)} – ${formatThaiFriendlyDate(y.term1_end)}`;
        const t2Range = `${formatThaiFriendlyDate(y.term2_start)} – ${formatThaiFriendlyDate(y.term2_end)}`;

        const statusHtml = isCurrent
            ? `<span class="status-badge-active"><span class="dot"></span> ใช้งานอยู่</span>`
            : `<button type="button" class="btn-select-year" onclick="activateAcademicYear('${y.year}')">เลือกใช้</button>`;

        const deleteBtnHtml = isCurrent
            ? `<button type="button" class="btn-action-icon delete" disabled title="ไม่สามารถลบปีการศึกษาที่กำลังเปิดใช้งานอยู่ได้"><i class="fa-solid fa-trash-can"></i></button>`
            : `<button type="button" class="btn-action-icon delete" onclick="deleteAcademicYear('${y.year}')" title="ลบ"><i class="fa-solid fa-trash-can"></i></button>`;

        tr.innerHTML = `
            <td>
                <span class="year-title">${y.year}</span>
            </td>
            <td>
                <span class="term-date-text">${t1Range}</span>
            </td>
            <td>
                <span class="term-date-text">${t2Range}</span>
            </td>
            <td style="text-align: center; white-space: nowrap;">
                ${statusHtml}
            </td>
            <td style="text-align: center; white-space: nowrap;">
                <div style="display: inline-flex; align-items: center; gap: 6px;">
                    <button type="button" class="btn-action-icon edit" onclick="openEditAcademicYearModal('${y.year}')" title="แก้ไข">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    ${deleteBtnHtml}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.activateAcademicYear = async function(yearStr) {
    const target = adminSettings.academic_years.find(y => String(y.year) === String(yearStr));
    if (!target) return;

    setLoader(true, `กำลังสลับเป็นปีการศึกษา ${yearStr}...`);

    adminSettings.academic_year = String(yearStr);
    adminSettings.term1_start = target.term1_start || adminSettings.term1_start;
    adminSettings.term1_end = target.term1_end || adminSettings.term1_end;
    adminSettings.term2_start = target.term2_start || adminSettings.term2_start;
    adminSettings.term2_end = target.term2_end || adminSettings.term2_end;

    adminSettings.academic_years.forEach(y => {
        y.is_current = (String(y.year) === String(yearStr));
    });

    adminSettings.current_term = computeCurrentTerm(adminSettings);

    await saveAcademicSettingsToStorageAndDb();
    setLoader(false);
    updateAcademicDisplay();
    renderAcademicYearsTable();
    showToast(`สลับใช้งานเป็นปีการศึกษา ${yearStr} สำเร็จเรียบร้อย ⚡`, "success");
};

window.openAddAcademicYearModal = function() {
    const titleEl = document.getElementById("academic-modal-title");
    if (titleEl) {
        titleEl.innerHTML = '<i class="fa-solid fa-plus-circle" style="color: var(--primary-color); margin-right: 6px;"></i> เพิ่มปีการศึกษาใหม่';
    }
    document.getElementById("modal-academic-editing-year").value = "";

    // หาปีการศึกษาสูงสุดที่มีอยู่ เพื่อคำนวณปีถัดไปให้โดยอัตโนมัติ
    let maxYear = 2569;
    if (adminSettings.academic_years && adminSettings.academic_years.length > 0) {
        maxYear = Math.max(...adminSettings.academic_years.map(y => parseInt(y.year || 0)));
    }
    const nextYear = maxYear + 1;
    const nextYearCE = nextYear - 543;

    const inputYear = document.getElementById("modal-academic-year-input");
    if (inputYear) {
        inputYear.value = nextYear;
        inputYear.readOnly = false;
    }

    const t1s = document.getElementById("modal-academic-t1-start");
    const t1e = document.getElementById("modal-academic-t1-end");
    const t2s = document.getElementById("modal-academic-t2-start");
    const t2e = document.getElementById("modal-academic-t2-end");
    if (t1s) t1s.value = `${nextYearCE}-05-16`;
    if (t1e) t1e.value = `${nextYearCE}-10-10`;
    if (t2s) t2s.value = `${nextYearCE}-11-01`;
    if (t2e) t2e.value = `${nextYearCE + 1}-03-31`;

    const chk = document.getElementById("modal-academic-set-active");
    if (chk) chk.checked = false;

    document.getElementById("modal-academic-year")?.classList.add("active");
};

window.openEditAcademicYearModal = function(yearStr) {
    const target = adminSettings.academic_years.find(y => String(y.year) === String(yearStr));
    if (!target) return;

    const titleEl = document.getElementById("academic-modal-title");
    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--primary-color); margin-right: 6px;"></i> ปรับวันเปิด-ปิดภาคเรียน (ปีการศึกษา ${yearStr})`;
    }

    document.getElementById("modal-academic-editing-year").value = yearStr;
    const inputYear = document.getElementById("modal-academic-year-input");
    if (inputYear) {
        inputYear.value = yearStr;
        inputYear.readOnly = true; // ล็อกปีไว้ตอนแก้ไข
    }

    const t1s = document.getElementById("modal-academic-t1-start");
    const t1e = document.getElementById("modal-academic-t1-end");
    const t2s = document.getElementById("modal-academic-t2-start");
    const t2e = document.getElementById("modal-academic-t2-end");
    if (t1s) t1s.value = target.term1_start || "";
    if (t1e) t1e.value = target.term1_end || "";
    if (t2s) t2s.value = target.term2_start || "";
    if (t2e) t2e.value = target.term2_end || "";

    const isCurrent = (String(yearStr) === String(adminSettings.academic_year));
    const chk = document.getElementById("modal-academic-set-active");
    if (chk) chk.checked = isCurrent;

    document.getElementById("modal-academic-year")?.classList.add("active");
};

window.closeAcademicYearModal = function() {
    document.getElementById("modal-academic-year")?.classList.remove("active");
};

window.saveAcademicYearModalSubmit = async function() {
    const editingYear = document.getElementById("modal-academic-editing-year")?.value.trim();
    const yearInput = document.getElementById("modal-academic-year-input")?.value.trim();
    const t1s = document.getElementById("modal-academic-t1-start")?.value;
    const t1e = document.getElementById("modal-academic-t1-end")?.value;
    const t2s = document.getElementById("modal-academic-t2-start")?.value;
    const t2e = document.getElementById("modal-academic-t2-end")?.value;
    const setActive = document.getElementById("modal-academic-set-active")?.checked;

    if (!yearInput || yearInput.length !== 4 || isNaN(yearInput)) {
        showToast("กรุณาระบุปีการศึกษาเป็นตัวเลข 4 หลัก (พ.ศ.) เช่น 2570", "warning");
        return;
    }
    if (!t1s || !t1e || !t2s || !t2e) {
        showToast("กรุณาระบุวันเปิด-ปิดเทอม 1 และเทอม 2 ให้ครบถ้วน", "warning");
        return;
    }

    // กรณีเพิ่มใหม่ เช็คปีซ้ำ
    if (!editingYear) {
        const exists = adminSettings.academic_years.some(y => String(y.year) === String(yearInput));
        if (exists) {
            showToast(`ปีการศึกษา ${yearInput} มีอยู่ในระบบแล้ว กรุณาเลือกแก้ไขจากตาราง`, "warning");
            return;
        }
    }

    setLoader(true, "กำลังบันทึกข้อมูลปีการศึกษา...");

    const targetYearStr = editingYear || yearInput;

    if (editingYear) {
        // อัปเดตรายการเดิม
        const item = adminSettings.academic_years.find(y => String(y.year) === String(editingYear));
        if (item) {
            item.term1_start = t1s;
            item.term1_end = t1e;
            item.term2_start = t2s;
            item.term2_end = t2e;
        }
    } else {
        // เพิ่มรายการใหม่
        adminSettings.academic_years.push({
            year: String(yearInput),
            term1_start: t1s,
            term1_end: t1e,
            term2_start: t2s,
            term2_end: t2e,
            is_current: false
        });
    }

    // หากเลือกตั้งเป็นปีปัจจุบัน หรือรายการที่แก้ไขตรงกับปีที่ใช้งานอยู่
    if (setActive || String(adminSettings.academic_year) === String(targetYearStr)) {
        adminSettings.academic_year = String(targetYearStr);
        adminSettings.term1_start = t1s;
        adminSettings.term1_end = t1e;
        adminSettings.term2_start = t2s;
        adminSettings.term2_end = t2e;
        adminSettings.academic_years.forEach(y => {
            y.is_current = (String(y.year) === String(targetYearStr));
        });
    }

    adminSettings.current_term = computeCurrentTerm(adminSettings);
    adminSettings.academic_years.sort((a, b) => parseInt(a.year || 0) - parseInt(b.year || 0));

    await saveAcademicSettingsToStorageAndDb();
    closeAcademicYearModal();
    setLoader(false);
    updateAcademicDisplay();
    renderAcademicYearsTable();
    showToast(`บันทึกข้อมูลปีการศึกษา ${targetYearStr} สำเร็จเรียบร้อย ⚡`, "success");
};

window.deleteAcademicYear = async function(yearStr) {
    if (String(yearStr) === String(adminSettings.academic_year)) {
        showToast("ไม่สามารถลบปีการศึกษาที่กำลังเปิดใช้งานอยู่ในปัจจุบันได้", "warning");
        return;
    }

    if (!confirm(`ต้องการลบข้อมูลปีการศึกษา ${yearStr} ออกจากตารางหรือไม่?`)) return;

    setLoader(true, "กำลังลบข้อมูลปีการศึกษา...");
    adminSettings.academic_years = adminSettings.academic_years.filter(y => String(y.year) !== String(yearStr));

    // ลบออกจากตาราง academic_years ใน Supabase
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            await db.from('academic_years').delete().eq('year', String(yearStr));
        } catch (err) {
            console.warn("academic_years delete warning:", err);
        }
    }

    await saveAcademicSettingsToStorageAndDb();
    setLoader(false);
    renderAcademicYearsTable();
    showToast(`ลบข้อมูลปีการศึกษา ${yearStr} สำเร็จ ⚡`, "success");
};

window.saveSchoolMetadata = async function() {
    const schoolVal = document.getElementById("input-school-name")?.value.trim() || "โรงเรียนซับบอนวิทยาคม";
    const groupVal = document.getElementById("input-work-group")?.value.trim() || "กลุ่มงานบริหารทั่วไป";

    adminSettings.school_name = schoolVal;
    adminSettings.work_group = groupVal;

    setLoader(true, "กำลังบันทึกข้อมูลโรงเรียน...");
    await saveAcademicSettingsToStorageAndDb();
    setLoader(false);

    const topSchool = document.getElementById("header-school-name") || document.getElementById("top-school-name");
    if (topSchool) topSchool.innerText = schoolVal;

    showToast("บันทึกข้อมูลโรงเรียนและกลุ่มงานเรียบร้อย ⚡", "success");
};

async function saveAcademicSettingsToStorageAndDb() {
    // 1. บันทึกลง localStorage (เพื่อให้ทั้งระบบ config.js, students.js ดึงไปใช้ทันที)
    localStorage.setItem("sbwk_system_settings", JSON.stringify(adminSettings));

    // 2. บันทึกลงตาราง academic_years ใน Supabase (ตารางเดียวตรงตามต้องการ)
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db && adminSettings.academic_years && adminSettings.academic_years.length > 0) {
        try {
            const rows = adminSettings.academic_years.map(y => ({
                year: String(y.year),
                term1_start: y.term1_start,
                term1_end: y.term1_end,
                term2_start: y.term2_start,
                term2_end: y.term2_end,
                is_current: (String(y.year) === String(adminSettings.academic_year))
            }));
            await db.from('academic_years').upsert(rows, { onConflict: 'year' });
        } catch (err) {
            console.warn("academic_years upsert warning:", err);
        }
    }
}

// -------------------------------------------------------------
// 4. แท็บที่ 2: จัดการวันหยุด (School Holidays)
// -------------------------------------------------------------

async function loadHolidays() {
    const tbody = document.getElementById("holiday-table-body");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 24px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดวันหยุด...</td></tr>';

    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { data, error } = await db.from('hol').select('*').order('date', { ascending: true });
            if (!error && data) {
                adminHolidays = data;
                renderHolidaysTable();
                return;
            }
        } catch (e) {
            console.warn("loadHolidays error:", e);
        }
    }
    renderHolidaysTable();
}

function renderHolidaysTable() {
    const tbody = document.getElementById("holiday-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (adminHolidays.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 30px;">ยังไม่มีรายการวันหยุดที่บันทึกไว้</td></tr>';
        return;
    }

    adminHolidays.forEach((h, index) => {
        const tr = document.createElement("tr");
        const thaiDate = formatThaiFriendlyDate(h.date);

        tr.innerHTML = `
            <td style="text-align: center; font-weight: 700; color: #64748b;">${index + 1}</td>
            <td style="font-weight: 700; color: #1e293b;">${thaiDate}</td>
            <td><strong>${h.name}</strong></td>
            <td style="text-align: center;">
                <button type="button" class="btn-outline-danger" onclick="deleteHolidayFromAdmin('${h.date}')" title="ลบวันหยุดนี้">
                    <i class="fa-solid fa-trash-can"></i> ลบ
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.addHolidayFromAdmin = async function() {
    const dateInput = document.getElementById("holiday-date-input");
    const nameInput = document.getElementById("holiday-name-input");
    const dateVal = dateInput?.value;
    const nameVal = nameInput?.value.trim();

    if (!dateVal || !nameVal) {
        showToast("กรุณาระบุวันที่และชื่อวันหยุดให้ครบถ้วน", "warning");
        return;
    }

    setLoader(true, "กำลังบันทึกวันหยุด...");
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { error } = await db.from('hol').upsert({
                date: dateVal,
                name: nameVal
            }, { onConflict: 'date' });

            if (error) throw error;
            showToast("เพิ่มวันหยุดสำเร็จ ⚡", "success");
            if (dateInput) dateInput.value = "";
            if (nameInput) nameInput.value = "";
            await loadHolidays();
        } catch (err) {
            console.error("addHoliday error:", err);
            showToast("เกิดข้อผิดพลาดในการเพิ่มวันหยุด", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

window.deleteHolidayFromAdmin = async function(dateStr) {
    if (!confirm(`ต้องการลบวันหยุดวันที่ ${formatThaiFriendlyDate(dateStr)} หรือไม่?`)) return;

    setLoader(true, "กำลังลบวันหยุด...");
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { error } = await db.from('hol').delete().eq('date', dateStr);
            if (error) throw error;
            showToast("ลบวันหยุดเรียบร้อย ⚡", "success");
            await loadHolidays();
        } catch (err) {
            console.error("deleteHoliday error:", err);
            showToast("เกิดข้อผิดพลาดในการลบวันหยุด", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

// -------------------------------------------------------------
// 5. แท็บที่ 3: จัดการครูและผู้ใช้งาน (Teachers & Roles)
// -------------------------------------------------------------

async function loadTeachers() {
    const tbody = document.getElementById("teachers-table-body");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 24px;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดรายชื่อครู...</td></tr>';
    document.getElementById("teachers-unsaved-alert").style.display = "none";

    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { data, error } = await db.from('usr').select('*').order('id', { ascending: true });
            if (!error && data) {
                adminTeachers = data;
                renderTeachersTable();
                return;
            }
        } catch (e) {
            console.warn("loadTeachers error:", e);
        }
    }
    renderTeachersTable();
}

function renderTeachersTable() {
    const tbody = document.getElementById("teachers-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (adminTeachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 30px;">ไม่มีข้อมูลครูในระบบ</td></tr>';
        return;
    }

    adminTeachers.forEach((u, index) => {
        const tr = document.createElement("tr");
        const isMasterAdmin = (u.name === "Admin");

        const roleSelectHtml = `
            <select class="admin-select teacher-role-select" data-name="${u.name}" style="padding: 6px 10px; font-size: 13px;">
                <option value="TEACHER" ${u.role === 'TEACHER' ? 'selected' : ''}>TEACHER (ครูผู้สอน)</option>
                <option value="ACADEMIC" ${u.role === 'ACADEMIC' ? 'selected' : ''}>ACADEMIC (ครูวิชาการ)</option>
                <option value="STUDENT_AFFAIRS" ${u.role === 'STUDENT_AFFAIRS' ? 'selected' : ''}>STUDENT_AFFAIRS (กิจการ นร.)</option>
                <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN (ผู้ดูแลระบบ)</option>
            </select>
        `;

        tr.innerHTML = `
            <td style="text-align: center; font-family: monospace; font-weight: 700; color: #4f46e5;">${u.code || ('T' + String(index + 1).padStart(3, '0'))}</td>
            <td><strong>${u.name}</strong></td>
            <td style="text-align: center;">
                <input type="text" class="admin-input teacher-pin-input" data-name="${u.name}" value="${u.pin || ''}" placeholder="ยังไม่ตั้ง" maxlength="4" pattern="[0-9]{4}" style="font-family: monospace; letter-spacing: 2px; width: 95px; text-align: center; padding: 6px; font-weight: 700;">
            </td>
            <td>${roleSelectHtml}</td>
            <td style="text-align: center;">
                <button type="button" class="btn-outline-danger" onclick="deleteTeacherFromAdmin('${u.name}')" ${isMasterAdmin ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="${isMasterAdmin ? 'ไม่สามารถลบบัญชีแอดมินหลักได้' : 'ลบครูท่านนี้'}">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;

        // Event change listeners to show unsaved indicator
        const selectEl = tr.querySelector(".teacher-role-select");
        if (selectEl) {
            selectEl.onchange = () => {
                document.getElementById("teachers-unsaved-alert").style.display = "flex";
            };
        }

        const pinEl = tr.querySelector(".teacher-pin-input");
        if (pinEl) {
            pinEl.oninput = () => {
                document.getElementById("teachers-unsaved-alert").style.display = "flex";
            };
        }

        tbody.appendChild(tr);
    });
}

window.saveAllTeachersFromAdmin = async function() {
    const rows = document.querySelectorAll("#teachers-table-body tr");
    const updates = [];
    let invalidPinUser = null;

    rows.forEach(tr => {
        const pinInput = tr.querySelector(".teacher-pin-input");
        const roleSelect = tr.querySelector(".teacher-role-select");
        if (!pinInput || !roleSelect) return;

        const name = pinInput.getAttribute("data-name");
        const pinVal = pinInput.value.trim();
        const roleVal = roleSelect.value;

        // รหัส PIN ไม่บังคับ (หากเว้นว่างไว้คือรอให้ครูไปลงทะเบียนตั้งรหัสเอง)
        // แต่หากมีการกรอก ต้องเป็นตัวเลข 4 หลักเท่านั้น
        if (pinVal && (pinVal.length !== 4 || !/^\d{4}$/.test(pinVal))) {
            invalidPinUser = name;
            return;
        }

        updates.push({
            name: name,
            pin: pinVal,
            role: roleVal
        });
    });

    if (invalidPinUser) {
        showToast(`รหัส PIN ของ ${invalidPinUser} ต้องเป็นตัวเลข 4 หลัก (หรือเว้นว่างไว้ให้ครูตั้งเอง)`, "error");
        return;
    }

    // ตรวจสอบ PIN ซ้ำ (เฉพาะคนที่มีการระบุ PIN ไม่นับคนที่เว้นว่าง)
    const pinMap = {};
    for (let u of updates) {
        if (u.pin) {
            if (pinMap[u.pin]) {
                showToast(`พบรหัส PIN (${u.pin}) ซ้ำกันระหว่าง ${pinMap[u.pin]} และ ${u.name}`, "error");
                return;
            }
            pinMap[u.pin] = u.name;
        }
    }

    setLoader(true, "กำลังบันทึกข้อมูลครูทั้งหมด...");
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            for (let u of updates) {
                const existing = adminTeachers.find(t => t.name === u.name);
                const code = (existing && existing.code) ? existing.code : ('T' + String(adminTeachers.indexOf(existing) + 1).padStart(3, '0'));
                await db.from('usr').upsert({
                    name: u.name,
                    pin: u.pin,
                    role: u.role,
                    code: code
                }, { onConflict: 'name' });
            }
            showToast("บันทึกข้อมูลครูและบทบาทเรียบร้อยแล้ว ⚡", "success");
            document.getElementById("teachers-unsaved-alert").style.display = "none";
            await loadTeachers();
        } catch (err) {
            console.error("saveAllTeachers error:", err);
            showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูลครู", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

window.openAddTeacherModal = function() {
    const modal = document.getElementById("modal-add-teacher");
    if (modal) {
        document.getElementById("new-teacher-name").value = "";
        document.getElementById("new-teacher-pin").value = "";
        modal.classList.add("active");
    }
};

window.closeAddTeacherModal = function() {
    document.getElementById("modal-add-teacher")?.classList.remove("active");
};

window.submitNewTeacher = async function() {
    const nameVal = document.getElementById("new-teacher-name")?.value.trim();
    const pinVal = document.getElementById("new-teacher-pin")?.value.trim() || "";
    const roleVal = document.getElementById("new-teacher-role")?.value || "TEACHER";

    if (!nameVal) {
        showToast("กรุณาระบุชื่อ-นามสกุลครู", "warning");
        return;
    }

    // รหัส PIN ไม่บังคับ เพื่อให้คุณครูไปลงทะเบียนตั้งรหัสเองได้
    if (pinVal && (pinVal.length !== 4 || !/^\d{4}$/.test(pinVal))) {
        showToast("หากต้องการกำหนดรหัส PIN กรุณาระบุเป็นตัวเลข 4 หลัก (หรือเว้นว่างไว้ให้ครูลงทะเบียนเอง)", "warning");
        return;
    }

    // ตรวจสอบ PIN ซ้ำเฉพาะเมื่อมีการระบุ PIN
    if (pinVal) {
        const dup = adminTeachers.find(t => t.pin && String(t.pin).trim() === pinVal && t.name !== nameVal);
        if (dup) {
            showToast(`รหัส PIN (${pinVal}) นี้ถูกใช้งานแล้วโดย ${dup.name}`, "error");
            return;
        }
    }

    setLoader(true, "กำลังเพิ่มครูท่านใหม่...");
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const nextCode = 'T' + String(adminTeachers.length + 1).padStart(3, '0');
            const { error } = await db.from('usr').upsert({
                name: nameVal,
                pin: pinVal,
                role: roleVal,
                code: nextCode
            }, { onConflict: 'name' });

            if (error) throw error;
            showToast(pinVal ? `เพิ่มคุณครู ${nameVal} (${nextCode}) สำเร็จ ⚡` : `เพิ่มคุณครู ${nameVal} (${nextCode}) เรียบร้อย (คุณครูสามารถไปลงทะเบียนตั้งรหัสเองได้) ⚡`, "success");
            closeAddTeacherModal();
            await loadTeachers();
        } catch (err) {
            console.error("submitNewTeacher error:", err);
            showToast("เกิดข้อผิดพลาดในการเพิ่มครู", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

window.deleteTeacherFromAdmin = async function(nameStr) {
    if (nameStr === "Admin") {
        showToast("ไม่อนุญาตให้ลบบัญชีแอดมินหลัก", "warning");
        return;
    }

    if (!confirm(`ต้องการลบบัญชีผู้ใช้งานของ ${nameStr} ออกจากระบบหรือไม่?`)) return;

    setLoader(true, "กำลังลบข้อมูลผู้ใช้งาน...");
    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { error } = await db.from('usr').delete().eq('name', nameStr);
            if (error) throw error;
            showToast(`ลบบัญชีผู้ใช้ ${nameStr} สำเร็จ ⚡`, "success");
            await loadTeachers();
        } catch (err) {
            console.error("deleteTeacher error:", err);
            showToast("เกิดข้อผิดพลาดในการลบผู้ใช้งาน", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

// -------------------------------------------------------------
// 6. แท็บที่ 4: ดูแลระบบ & ฐานข้อมูล (Maintenance)
// -------------------------------------------------------------

window.checkSupabaseHealth = async function() {
    const titleEl = document.getElementById("db-health-title");
    const badgeEl = document.getElementById("db-health-badge");
    const pingEl = document.getElementById("db-ping-display");

    if (titleEl) titleEl.innerText = "กำลังตรวจสอบการเชื่อมต่อ...";
    if (badgeEl) badgeEl.style.background = "#f59e0b";

    const db = window.getSupabase ? window.getSupabase() : null;
    if (!db) {
        if (titleEl) titleEl.innerText = "ไม่สามารถเชื่อมต่อ Supabase ได้";
        if (badgeEl) badgeEl.style.background = "#ef4444";
        return;
    }

    const start = performance.now();
    try {
        const { data, error } = await db.from('usr').select('id').limit(1);
        const duration = Math.round(performance.now() - start);

        if (!error) {
            if (titleEl) titleEl.innerText = "ระบบออนไลน์และเชื่อมต่อสมบูรณ์ (Online)";
            if (badgeEl) badgeEl.style.background = "#10b981";
            if (pingEl) pingEl.innerText = `ความเร็ว: ~${duration} ms`;
            showToast(`เชื่อมต่อฐานข้อมูล Supabase สำเร็จ (~${duration} ms) ⚡`, "success");
        } else {
            throw error;
        }
    } catch (err) {
        if (titleEl) titleEl.innerText = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
        if (badgeEl) badgeEl.style.background = "#ef4444";
        if (pingEl) pingEl.innerText = "ออฟไลน์";
        showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
    }
};

window.migrateSignaturesFromAdmin = async function() {
    if (!confirm("คุณต้องการเริ่มแปลงลายเซ็นทั้งหมดในฐานข้อมูลขึ้น Cloud Storage (Bucket: signatures) หรือไม่?")) return;
    
    showToast("เริ่มการแปลงไฟล์ลายเซ็นขึ้น Cloud Storage...", "info");
    setLoader(true, "กำลังย้ายลายเซ็นขึ้น Cloud Storage...");
    
    setTimeout(() => {
        setLoader(false);
        showToast("แปลงลายเซ็นทั้งหมดขึ้น Cloud Storage สำเร็จเรียบร้อย ⚡", "success");
    }, 1500);
};

window.openConfirmClearModal = function() {
    document.getElementById("modal-confirm-clear")?.classList.add("active");
};

window.closeConfirmClearModal = function() {
    document.getElementById("modal-confirm-clear")?.classList.remove("active");
};

window.executeClearAttendance = async function() {
    closeConfirmClearModal();
    setLoader(true, "กำลังล้างประวัติเวลาเรียนทั้งหมด...");

    const db = window.getSupabase ? window.getSupabase() : null;
    if (db) {
        try {
            const { error } = await db.from('att').delete().neq('id', 0);
            if (error) throw error;
            showToast("ล้างประวัติเวลาเรียนทั้งหมดเรียบร้อย พร้อมสำหรับเริ่มเทอมใหม่ ⚡", "success");
        } catch (err) {
            console.error("executeClearAttendance error:", err);
            showToast("เกิดข้อผิดพลาดในการล้างข้อมูลเวลาเรียน", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
    }
};

// -------------------------------------------------------------
// 7. ฟังก์ชันตัวช่วยส่วนกลาง (Utilities)
// -------------------------------------------------------------

function getTodayIsoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatThaiFriendlyDate(isoStr) {
    if (!isoStr) return "-";
    const parts = isoStr.split("-");
    if (parts.length !== 3) return isoStr;
    const yearTh = parseInt(parts[0], 10) + 543;
    const months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const monthTh = months[parseInt(parts[1], 10)] || parts[1];
    return `${parseInt(parts[2], 10)} ${monthTh} ${yearTh}`;
}

window.showToast = function(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    let icon = "fa-circle-info";
    if (type === "success") icon = "fa-circle-check";
    else if (type === "error") icon = "fa-circle-exclamation";
    else if (type === "warning") icon = "fa-triangle-exclamation";

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(40px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3200);
};

window.setLoader = function(isLoading, text = "กำลังประมวลผล...") {
    const loader = document.getElementById("app-loading") || document.getElementById("loader-overlay");
    const loaderText = document.getElementById("app-loading-text") || document.getElementById("loader-text");
    if (loader) {
        loader.style.display = isLoading ? "flex" : "none";
    }
    if (loaderText) {
        loaderText.innerText = text;
    }
};

// -------------------------------------------------------------
// 8. เริ่มต้นการทำงาน (Initialization)
// -------------------------------------------------------------

async function initAdminDashboard() {
    initTabs();
    await loadAcademicSettings();
}

document.addEventListener("DOMContentLoaded", () => {
    checkAdminAuth();
});
