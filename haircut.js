/**
 * haircut.js - ระบบตรวจระเบียบทรงผม (Haircut Check System)
 * โรงเรียนซับบอนวิทยาคม
 * 
 * 1:1 Standalone logic สำหรับ haircut.html
 * - Realtime sync กับฐานข้อมูล Supabase ตาราง public.hair
 * - สวิตช์เปิด-ปิด Zero Delay บันทึกทันที
 * - ตัวกรองชั้น, ห้อง, เพศ, สถานะ และค้นหารายชื่อ
 */

// =========================================================================
// Global State สำหรับระบบตรวจทรงผม
// =========================================================================
window.haircutCurrentDate = (function() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
window.haircutActiveGrade = "ALL";
window.haircutActiveRoom = "ALL";
window.haircutActiveGender = "ALL"; // ALL, MALE, FEMALE
window.haircutActiveStatus = "ALL"; // ALL, PASS, FAIL
window.haircutRecordsMap = {}; // { studentId: { status: 'PASS'|'FAIL', note: '' } }

// Helper: ดึง Supabase Client ที่พร้อมใช้งาน
function getHaircutSupabase() {
    if (typeof getSupabase === "function") {
        const cl = getSupabase();
        if (cl) return cl;
    }
    if (typeof window._supabaseInstance !== "undefined" && window._supabaseInstance) {
        return window._supabaseInstance;
    }
    if (typeof window.supabase !== "undefined") {
        const url = (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG.supabaseUrl) || "https://lkpgexffxxyczxfevqkc.supabase.co";
        const key = (typeof GLOBAL_CONFIG !== "undefined" && GLOBAL_CONFIG.supabaseKey) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrcGdleGZmeHh5Y3p4ZmV2cWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NzA4ODgsImV4cCI6MjEwMzA0Njg4OH0.nZe6-3Hzw2ogcM_akBIK_w-JC9okXvp0r7GSjVj5YSM";
        if (url && key) {
            window._supabaseInstance = window.supabase.createClient(url, key);
            return window._supabaseInstance;
        }
    }
    return null;
}

// Helper: ดึงรายชื่อนักเรียนอย่างปลอดภัยจาก master table std
async function getStudentsSafe() {
    if (typeof students !== "undefined" && students && students.length > 0) {
        return students;
    }
    const db = getHaircutSupabase();
    if (db) {
        try {
            const { data } = await db.from('std').select('*').order('grade').order('room').order('no');
            if (data && data.length > 0) {
                let roomCounters = {};
                const mapped = data.map(r => {
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
                if (typeof students !== "undefined") students = mapped;
                return mapped;
            }
        } catch (e) {
            console.warn("getStudentsSafe error:", e);
        }
    }
    return [];
}

// =========================================================================
// Realtime Subscription สำหรับ public.hair
// =========================================================================
let _hairRealtimeChannel = null;
function setupHairRealtime() {
    const db = getHaircutSupabase();
    if (db && !_hairRealtimeChannel && db.channel) {
        try {
            _hairRealtimeChannel = db.channel('realtime-hair-sync')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'hair' }, payload => {
                    const rowDate = payload?.new?.check_date || payload?.old?.check_date;
                    if (rowDate === window.haircutCurrentDate) {
                        loadHaircutData().then(() => renderHaircutList());
                    }
                })
                .subscribe();
        } catch (e) {
            console.warn("Realtime hair subscription warning:", e);
        }
    }
}

// โหลดข้อมูลสดจากฐานข้อมูล public.hair (ไม่ใช้แคช เพื่อให้ใช้หลายเครื่องพร้อมกันได้)
window.loadHaircutData = async function() {
    window.haircutRecordsMap = {}; // ล้างตัวแปร เพื่อความสดใหม่เสมอ
    setupHairRealtime();

    const db = getHaircutSupabase();
    if (db) {
        try {
            const { data, error } = await db.from('hair').select('*').eq('check_date', window.haircutCurrentDate);
            if (!error && data) {
                data.forEach(row => {
                    // เฉพาะคนที่ถูกบันทึกในตาราง hair คือคนที่ 'ยังไม่ตัดผม' (เปิดสวิตช์)
                    window.haircutRecordsMap[String(row.student_id)] = {
                        status: 'FAIL',
                        note: row.note || ''
                    };
                });
            }
        } catch (err) {
            console.warn("Error loading hair table:", err);
        }
    }
};

// ฟังก์ชันอัปเดต UI เฉพาะการ์ดนักเรียนคนนั้นแบบทันที (Zero Delay 0ms ไม่ต้อง Render ใหม่ทั้งหมด)
function updateSingleHaircutCardUI(studentId, isFail) {
    const sId = String(studentId);
    const cardEl = document.getElementById(`hc-card-${sId}`);
    const badgeWrap = document.getElementById(`hc-badge-wrap-${sId}`);
    const inputEl = document.getElementById(`hc-input-${sId}`);
    const sliderEl = document.getElementById(`hc-slider-${sId}`);
    const knobEl = document.getElementById(`hc-knob-${sId}`);

    if (cardEl) {
        cardEl.style.borderColor = isFail ? '#fed7aa' : '#f1f5f9';
    }

    if (badgeWrap) {
        badgeWrap.innerHTML = isFail ? `
            <span onclick="toggleHaircutDirect('${sId}')" class="haircut-badge-btn" style="background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; -webkit-tap-highlight-color: transparent;">
                <i class="fa-solid fa-triangle-exclamation"></i> ยังไม่ตัด
            </span>
        ` : `
            <span onclick="toggleHaircutDirect('${sId}')" class="haircut-badge-btn" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; -webkit-tap-highlight-color: transparent;">
                <i class="fa-solid fa-circle-check"></i> เรียบร้อย
            </span>
        `;
    }

    if (inputEl) {
        inputEl.checked = isFail;
    }

    if (sliderEl) {
        sliderEl.style.backgroundColor = isFail ? '#22c55e' : '#cbd5e1';
    }

    if (knobEl) {
        knobEl.style.left = isFail ? '23px' : '3px';
    }

    updateHaircutStatCountersOnly();
}

async function updateHaircutStatCountersOnly() {
    const stdList = await getStudentsSafe();
    let totalAll = 0;
    let failCount = 0;

    stdList.forEach(s => {
        if (!isGradeMatch(s.grade, window.haircutActiveGrade)) return;
        if (!isRoomMatch(s.room, window.haircutActiveRoom)) return;
        totalAll++;
        if (window.haircutRecordsMap[String(s.studentId)] && window.haircutRecordsMap[String(s.studentId)].status === "FAIL") {
            failCount++;
        }
    });

    let passCount = Math.max(0, totalAll - failCount);
    const passPct = totalAll > 0 ? Math.round((passCount / totalAll) * 100) : 100;

    if (document.getElementById("haircut-stat-total-val")) document.getElementById("haircut-stat-total-val").innerText = `${totalAll}`;
    if (document.getElementById("haircut-stat-pass-val")) document.getElementById("haircut-stat-pass-val").innerText = `${passCount} (${passPct}%)`;
    if (document.getElementById("haircut-stat-fail-val")) document.getElementById("haircut-stat-fail-val").innerText = `${failCount}`;
}

// สวิตช์: isChecked = true คือเปิด (ยังไม่ตัดผม) -> บันทึกลงฐานข้อมูล public.hair
// isChecked = false คือปิด (ตัดแล้ว/เรียบร้อย) -> ลบออกจากฐานข้อมูล public.hair
window.toggleHaircutSwitch = function(studentId, isChecked) {
    const sId = String(studentId);
    const db = getHaircutSupabase();

    if (isChecked) {
        // 1. เปิดสวิตช์ = ยังไม่ตัดผม (FAIL)
        window.haircutRecordsMap[sId] = { status: "FAIL", note: "" };
        updateSingleHaircutCardUI(sId, true);

        if (window.haircutActiveStatus !== "ALL") {
            renderHaircutList();
        }

        if (db) {
            db.from('hair').upsert({
                check_date: window.haircutCurrentDate,
                student_id: sId,
                note: ''
            }, { onConflict: 'check_date,student_id' }).then(({ error }) => {
                if (error) console.warn("Error upserting to hair table:", error);
            });
        }
    } else {
        // 2. ปิดสวิตช์ = ตัดแล้ว/เรียบร้อย (PASS)
        delete window.haircutRecordsMap[sId];
        updateSingleHaircutCardUI(sId, false);

        if (window.haircutActiveStatus !== "ALL") {
            renderHaircutList();
        }

        if (db) {
            db.from('hair').delete()
                .eq('check_date', window.haircutCurrentDate)
                .eq('student_id', sId)
                .then(({ error }) => {
                    if (error) console.warn("Error deleting from hair table:", error);
                });
        }
    }
};

// กดที่ป้ายสถานะเพื่อสลับตรงๆ
window.toggleHaircutDirect = function(studentId) {
    const sId = String(studentId);
    const currentIsFail = !!(window.haircutRecordsMap[sId] && window.haircutRecordsMap[sId].status === "FAIL");
    // สลับ: ถ้าเปิดอยู่ (FAIL) ให้ปิด (false), ถ้าปิดอยู่ (PASS) ให้เปิด (true)
    window.toggleHaircutSwitch(sId, !currentIsFail);
};

window.initHaircutView = async function() {
    updateHaircutDateDisplay();
    await getStudentsSafe();
    populateHaircutRoomPills();
    await loadHaircutData();
    renderHaircutList();
};

function formatThaiLongDate(dateStr) {
    if (!dateStr) return "-";
    const days = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    const dayName = days[dateObj.getDay()];
    const monthName = months[m];
    const thaiYear = y > 2400 ? y : y + 543;
    return `${dayName}ที่ ${d} ${monthName} ${thaiYear}`;
}

function updateHaircutDateDisplay() {
    const textEl = document.getElementById("haircut-date-text");
    if (textEl) {
        textEl.innerText = formatThaiLongDate(window.haircutCurrentDate);
    }
    const input = document.getElementById("haircut-date-input");
    if (input && window.flatpickr) {
        flatpickr(input, {
            locale: "th",
            dateFormat: "Y-m-d",
            defaultDate: window.haircutCurrentDate,
            position: "auto center",
            disableMobile: true,
            onChange: function(dates, dateStr) {
                window.haircutCurrentDate = dateStr;
                updateHaircutDateDisplay();
                loadHaircutData().then(() => renderHaircutList());
            }
        });
    }
}

window.openHaircutCalendar = function() {
    const input = document.getElementById("haircut-date-input");
    if (input && input._flatpickr) input._flatpickr.open();
};

function isGradeMatch(studentGrade, filterGrade) {
    if (!filterGrade || filterGrade === "ALL") return true;
    const cleanStd = String(studentGrade || "").replace(/[^0-9]/g, "");
    const cleanFilt = String(filterGrade || "").replace(/[^0-9]/g, "");
    if (cleanStd && cleanFilt) {
        return cleanStd === cleanFilt;
    }
    return String(studentGrade || "").trim() === String(filterGrade || "").trim();
}

function isRoomMatch(studentRoom, filterRoom) {
    if (!filterRoom || filterRoom === "ALL") return true;
    const cleanStd = String(studentRoom || "").replace(/[^0-9]/g, "");
    const cleanFilt = String(filterRoom || "").replace(/[^0-9]/g, "");
    if (cleanStd && cleanFilt) {
        return cleanStd === cleanFilt;
    }
    return String(studentRoom || "").trim() === String(filterRoom || "").trim();
}

async function populateHaircutRoomPills() {
    const container = document.getElementById("haircut-room-pills-container");
    if (!container) return;

    const stdList = await getStudentsSafe();
    const roomsSet = new Set();
    stdList.forEach(s => {
        if (isGradeMatch(s.grade, window.haircutActiveGrade)) {
            roomsSet.add(s.room);
        }
    });

    const sortedRooms = Array.from(roomsSet).sort((a, b) => Number(a) - Number(b));
    let html = `
        <button type="button" class="haircut-pill ${window.haircutActiveRoom === 'ALL' ? 'active' : ''}" onclick="setHaircutRoomFilter('ALL', this)">ทุกห้อง</button>
    `;
    sortedRooms.forEach(r => {
        html += `
            <button type="button" class="haircut-pill ${String(window.haircutActiveRoom) === String(r) ? 'active' : ''}" onclick="setHaircutRoomFilter('${r}', this)">ห้อง ${r}</button>
        `;
    });
    container.innerHTML = html;
}

window.setHaircutGradeFilter = function(grade, btnEl) {
    window.haircutActiveGrade = grade;
    document.querySelectorAll("#haircut-grade-pills .haircut-pill").forEach(p => p.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    window.haircutActiveRoom = "ALL";
    populateHaircutRoomPills();
    renderHaircutList();
};

window.setHaircutRoomFilter = function(room, btnEl) {
    window.haircutActiveRoom = room;
    document.querySelectorAll("#haircut-room-pills-container .haircut-pill").forEach(p => p.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderHaircutList();
};

window.setHaircutGenderFilter = function(gender, btnEl) {
    window.haircutActiveGender = gender;
    document.querySelectorAll("#haircut-gender-pills .haircut-pill").forEach(p => p.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderHaircutList();
};

window.setHaircutStatusFilter = function(status, btnEl) {
    window.haircutActiveStatus = status;
    document.querySelectorAll("#haircut-status-pills .haircut-pill").forEach(p => p.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    renderHaircutList();
};

window.renderHaircutList = async function() {
    const container = document.getElementById("haircut-student-list");
    if (!container) return;

    const stdList = await getStudentsSafe();
    const searchTerm = (document.getElementById("haircut-search-input")?.value || "").trim().toLowerCase();

    const filtered = stdList.filter(s => {
        if (!isGradeMatch(s.grade, window.haircutActiveGrade)) return false;
        if (!isRoomMatch(s.room, window.haircutActiveRoom)) return false;
        
        // Gender filter
        if (window.haircutActiveGender !== "ALL") {
            const isMale = (s.prefix || s.fullName || "").includes("ด.ช.") || (s.prefix || s.fullName || "").includes("นาย");
            if (window.haircutActiveGender === "MALE" && !isMale) return false;
            if (window.haircutActiveGender === "FEMALE" && isMale) return false;
        }

        // Status filter (คนที่อยู่ใน haircutRecordsMap คือ FAIL คนที่ไม่อยู่คือ PASS)
        const isFail = !!(window.haircutRecordsMap[String(s.studentId)] && window.haircutRecordsMap[String(s.studentId)].status === "FAIL");
        const currentStatus = isFail ? "FAIL" : "PASS";

        if (window.haircutActiveStatus === "PASS" && currentStatus !== "PASS") return false;
        if (window.haircutActiveStatus === "FAIL" && currentStatus !== "FAIL") return false;

        // Search
        if (searchTerm) {
            const matchName = (s.fullName || s.name || "").toLowerCase().includes(searchTerm);
            const matchId = String(s.studentId || "").includes(searchTerm);
            if (!matchName && !matchId) return false;
        }
        return true;
    });

    let totalAll = stdList.filter(s => {
        if (!isGradeMatch(s.grade, window.haircutActiveGrade)) return false;
        if (!isRoomMatch(s.room, window.haircutActiveRoom)) return false;
        return true;
    }).length;

    let failCount = 0;
    stdList.forEach(s => {
        if (!isGradeMatch(s.grade, window.haircutActiveGrade)) return;
        if (!isRoomMatch(s.room, window.haircutActiveRoom)) return;
        if (window.haircutRecordsMap[String(s.studentId)] && window.haircutRecordsMap[String(s.studentId)].status === "FAIL") {
            failCount++;
        }
    });

    let passCount = Math.max(0, totalAll - failCount);
    const passPct = totalAll > 0 ? Math.round((passCount / totalAll) * 100) : 100;

    if (document.getElementById("haircut-stat-total-val")) document.getElementById("haircut-stat-total-val").innerText = `${totalAll}`;
    if (document.getElementById("haircut-stat-pass-val")) document.getElementById("haircut-stat-pass-val").innerText = `${passCount} (${passPct}%)`;
    if (document.getElementById("haircut-stat-fail-val")) document.getElementById("haircut-stat-fail-val").innerText = `${failCount}`;
    if (document.getElementById("haircut-count-summary-text")) document.getElementById("haircut-count-summary-text").innerText = `แสดง ${filtered.length} คน (จากทั้งหมด ${totalAll} คน)`;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #94a3b8; background: white; border-radius: 18px; border: 1px solid #f1f5f9; margin-top: 10px;">
                <i class="fa-solid fa-scissors" style="font-size: 36px; opacity: 0.3; margin-bottom: 10px;"></i>
                <p style="margin: 0; font-size: 14px;">ไม่พบรายชื่อนักเรียนตามเงื่อนไขที่เลือก</p>
            </div>
        `;
        return;
    }

    let html = "";
    filtered.forEach(s => {
        const isFail = !!(window.haircutRecordsMap[String(s.studentId)] && window.haircutRecordsMap[String(s.studentId)].status === "FAIL");
        const isPass = !isFail;
        const isMale = (s.prefix || s.fullName || "").includes("ด.ช.") || (s.prefix || s.fullName || "").includes("นาย");
        const avatarEmoji = isMale ? "👦" : "👧";
        
        // Clean grade display (ป้องกัน ม.ม.1/1)
        const rawGrade = String(s.grade || "").trim();
        const displayGrade = rawGrade.startsWith("ม.") ? rawGrade : `ม.${rawGrade}`;

        html += `
            <div id="hc-card-${s.studentId}" class="haircut-item-card" style="background: white; border-radius: 18px; padding: 12px 16px; margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); border: 1px solid ${isFail ? '#fed7aa' : '#f1f5f9'};">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                    <!-- Left: Avatar & Info -->
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                        <div style="width: 44px; height: 44px; border-radius: 14px; background: #e0f2fe; border: 1px solid #bae6fd; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span style="font-size: 15px; font-weight: 800; color: #0284c7; line-height: 1;">${s.no || '-'}</span>
                            <span style="font-size: 12px; line-height: 1; margin-top: 2px;">${avatarEmoji}</span>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 700; font-size: 15px; color: #1e293b; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${s.fullName || s.name}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px; white-space: nowrap;">
                                <span style="background: #ede9fe; color: #6366f1; border-radius: 6px; padding: 2px 8px; font-size: 11px; font-weight: 700; flex-shrink: 0;">${displayGrade}/${s.room}</span>
                                <span style="color: #64748b; font-size: 12px; white-space: nowrap; flex-shrink: 0;">รหัส ${s.studentId}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Badge, Toggle Switch (ไม่ตัด = เปิด / ตัดแล้ว = ปิด) -->
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                        <div id="hc-badge-wrap-${s.studentId}">
                            ${isPass ? `
                                <span onclick="toggleHaircutDirect('${s.studentId}')" class="haircut-badge-btn" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
                                    <i class="fa-solid fa-circle-check"></i> เรียบร้อย
                                </span>
                            ` : `
                                <span onclick="toggleHaircutDirect('${s.studentId}')" class="haircut-badge-btn" style="background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
                                    <i class="fa-solid fa-triangle-exclamation"></i> ยังไม่ตัด
                                </span>
                            `}
                        </div>

                        <!-- iOS Switch Toggle (ไม่ตัด = เปิด/สีเขียว, ตัดแล้ว = ปิด/สีเทา) -->
                        <label class="haircut-toggle-switch" style="position: relative; display: inline-block; width: 46px; height: 26px; margin: 0; cursor: pointer; flex-shrink: 0;">
                            <input id="hc-input-${s.studentId}" type="checkbox" ${isFail ? 'checked' : ''} onchange="toggleHaircutSwitch('${s.studentId}', this.checked)">
                            <span id="hc-slider-${s.studentId}" class="haircut-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isFail ? '#22c55e' : '#cbd5e1'}; transition: .25s; border-radius: 26px;">
                                <span id="hc-knob-${s.studentId}" style="position: absolute; content: ''; height: 20px; width: 20px; left: ${isFail ? '23px' : '3px'}; bottom: 3px; background-color: white; transition: .25s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

// Auto initialization when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
    await initHaircutView();
});
if (document.readyState === "complete" || document.readyState === "interactive") {
    initHaircutView();
}
