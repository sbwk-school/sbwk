/**
 * mental.js - ระบบแบบประเมินสุขภาพจิตและรายงานผล (Mental Health Evaluation & Report)
 * โรงเรียนซับบอนวิทยาคม
 * 
 * 1:1 Standalone logic สำหรับ mental.html
 * 1. หมวด 1: แบบประเมินความเครียดและอารมณ์ซึมเศร้า (ST-5 & 8Q ซึมเศร้า รวม 13 ข้อ -> stress_eval)
 * 2. หมวด 2: แบบประเมินจุดแข็งและจุดอ่อน SDQ (25 ข้อ 5 ด้าน -> sdq_eval)
 * 3. หมวด 3: แบบประเมินความเสี่ยงต่อการทำร้ายตนเอง (คัดกรองเบื้องต้น + 8Q รวม 9 ข้อ -> suicide_eval)
 * 4. รายงานผลการประเมิน (Dashboard, ฟิลเตอร์, สรุปสถิติ, ประวัติรายบุคคล, คำแนะนำเชิงจิตวิทยา)
 */

// =========================================================================
// Global State
// =========================================================================
window.currentMentalCategory = 1; // 1 = หมวด 1, 2 = หมวด 2, 3 = หมวด 3
window.selectedMentalStudent = null;
window.mentalAnswersCat1 = {};
window.mentalAnswersCat2 = {};
window.mentalAnswersCat3 = {};
window.mentalEvalHistoryCache = [];
window.modalHistoryActiveCat = 1;

// =========================================================================
// ข้อคำถามในแต่ละหมวด
// =========================================================================

// หมวด 1: แบบประเมินความเครียดและอารมณ์ซึมเศร้า (13 ข้อ)
const MENTAL_QUESTIONS_CAT1 = [
    "มีปัญหาการนอน หลับยาก หรือหลับๆ ตื่นๆ",
    "สมาธิไม่ดี ความจำลดลง หลงลืมง่าย",
    "หงุดหงิด กระวนกระวาย ใจร้อน ว้าวุ่นใจ",
    "รู้สึกเบื่อ เซ็ง ไม่อยากพบปะผู้คน",
    "ไม่อยากทำอะไร รู้สึกหมดพลังหรือท้อแท้",
    "เบื่อ ไม่สนใจ หรือไม่เพลิดเพลินในการทำกิจกรรมต่างๆ",
    "รู้สึกไม่สบายใจ ซึมเศร้า หรือหมดหวัง",
    "เหนื่อยง่ายหรือไม่ค่อยมีแรง",
    "เบื่ออาหาร หรือกินมากเกินไป",
    "รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลว หรือทำให้ตนเอง/ครอบครัวผิดหวัง",
    "สมาธิไม่ดีเวลาทำอะไร เช่น ทำการบ้าน อ่านหนังสือ หรือดูโทรทัศน์",
    "พูดช้า เคลื่อนไหวช้าจนคนอื่นสังเกตเห็น หรือกระสับกระส่ายอยู่ไม่สุข",
    "รู้สึกกระวนกระวายใจหรืออยู่ไม่นิ่งอย่างเห็นได้ชัด"
];

// หมวด 2: แบบประเมิน SDQ (จุดแข็งและจุดอ่อน 25 ข้อ)
const MENTAL_QUESTIONS_CAT2 = [
    "คำนึงถึงความรู้สึกของผู้อื่น มักเห็นอกเห็นใจผู้อื่น",
    "อยู่ไม่นิ่ง สมาธิสั้น วิ่งวุ่นหรืออยู่ไม่สุข",
    "มักบ่นว่าปวดศีรษะ ปวดท้อง หรือไม่สบายบ่อยๆ",
    "เต็มใจแบ่งปันสิ่งของให้ผู้อื่น (เช่น ขนม ของเล่น ดินสอ)",
    "มักอารมณ์เสีย โมโหร้าย หรืออาละวาดบ่อยๆ",
    "ค่อนข้างแยกตัว มักเล่นคนเดียว หรือทำอะไรตามลำพัง",
    "เชื่อฟังคำสั่ง มักทำตามที่ผู้ใหญ่ขอร้อง",
    "ขี้กังวล มีเรื่องกังวลใจอยู่เสมอ",
    "ชอบช่วยเหลือผู้อื่นเมื่อเห็นเขาเสียใจหรือเดือดร้อน",
    "อยู่ไม่สุข ลุกลี้ลุกลน ยุกยิกตลอดเวลา",
    "มีเพื่อนสนิทอย่างน้อย 1 คน",
    "มักมีเรื่องทะเลาะวิวาทหรือรังแกผู้อื่น",
    "มักดูไม่มีความสุข ท้อแท้ หรือร้องไห้ง่าย",
    "เป็นที่ชื่นชอบของเพื่อนๆ รุ่นเดียวกัน",
    "วอกแวกง่าย ขาดสมาธิในการเรียนหรือทำงาน",
    "ตื่นตระหนกหรือขี้กลัวง่ายในสถานการณ์ใหม่ๆ",
    "มีน้ำใจและโอบอ้อมอารีต่อเด็กที่อายุน้อยกว่า",
    "มักโกหกหรือขี้โกงผู้อื่น",
    "ถูกเด็กคนอื่นล้อเลียน หรือถูกกลั่นแกล้งบ่อยๆ",
    "มักอาสาช่วยเหลือผู้อื่น (ครู ผู้ปกครอง หรือเพื่อน)",
    "คิดก่อนทำ สามารถหยุดคิดก่อนที่จะลงมือทำได้",
    "แอบหยิบหรือขโมยของที่บ้าน ที่โรงเรียน หรือที่อื่น",
    "เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน",
    "ขี้กลัว กลัวอะไรง่ายๆ",
    "มีความพยายามทำงานที่ได้รับมอบหมายให้สำเร็จ"
];

// หมวด 3: แบบประเมินความเสี่ยงต่อการทำร้ายตนเอง (ข้อคัดกรอง + 8Q)
const MENTAL_QUESTIONS_CAT3 = [
    { text: "คิดทำร้ายตนเอง หรือคิดว่าถ้าตายไปคงจะดี (ข้อคัดกรองเบื้องต้น)", weight: 1 },
    { text: "ในช่วง 1 เดือนที่ผ่านมา คิดอยากตาย หรือคิดว่าตายไปจะดีกว่า", weight: 1 },
    { text: "ในช่วง 1 เดือนที่ผ่านมา อยากทำร้ายตัวเอง หรือทำให้ตัวเองบาดเจ็บ", weight: 2 },
    { text: "ในช่วง 1 เดือนที่ผ่านมา คิดเกี่ยวกับการฆ่าตัวตาย", weight: 6 },
    { text: "ในช่วง 1 เดือนที่ผ่านมา มีแผนการที่จะฆ่าตัวตาย", weight: 8 },
    { text: "ในช่วง 1 เดือนที่ผ่านมา ได้เตรียมการที่จะทำร้ายตนเองหรือเตรียมการจะฆ่าตัวตาย โดยตั้งใจให้ตายจริงๆ", weight: 9 },
    { text: "ในช่วง 1 เดือนที่ผ่านมา ได้ลงมือทำร้ายตนเอง โดยตั้งใจให้ตายจริงๆ (แต่ไม่ตาย)", weight: 4 },
    { text: "ตลอดชีวิตที่ผ่านมา เคยพยายามฆ่าตัวตาย", weight: 4 },
    { text: "ในช่วง 1 เดือนที่ผ่านมา ยังคงมีความคิดหรือความรู้สึกอยากฆ่าตัวตายอยู่", weight: 10 }
];

// Helper: ดึง Supabase Client ที่พร้อมใช้งานเสมอ
function getSupabaseSafe() {
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
    const db = getSupabaseSafe();
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

// =========================================================================
// สลับหมวดในแบบประเมิน (หมวด 1, หมวด 2, หมวด 3)
// =========================================================================
window.switchMentalCategory = function(catNum) {
    window.currentMentalCategory = catNum;

    document.querySelectorAll(".mental-nav-tab").forEach(tab => {
        const tabCat = parseInt(tab.getAttribute("data-cat"));
        if (tabCat === catNum) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    const v1 = document.getElementById("mental-cat-1-view");
    const v2 = document.getElementById("mental-cat-2-view");
    const v3 = document.getElementById("mental-cat-3-view");

    if (v1) v1.style.display = (catNum === 1) ? "block" : "none";
    if (v2) v2.style.display = (catNum === 2) ? "block" : "none";
    if (v3) v3.style.display = (catNum === 3) ? "block" : "none";

    const titleEl = document.getElementById("header-page-title");
    if (catNum === 1) {
        if (titleEl) titleEl.innerText = "แบบประเมินความเครียดและอารมณ์ซึมเศร้า";
        renderMentalQuestionsCat1();
    } else if (catNum === 2) {
        if (titleEl) titleEl.innerText = "แบบประเมิน SDQ";
        renderMentalQuestionsCat2();
    } else if (catNum === 3) {
        if (titleEl) titleEl.innerText = "แบบประเมินความเสี่ยงต่อการทำร้ายตนเอง";
        renderMentalQuestionsCat3();
    }
    updateStudentCardDisplay();
};

window.onMentalStudentSearch = async function(query) {
    const dropdown = document.getElementById("mental-student-dropdown");
    if (!dropdown) return;

    const stdList = await getStudentsSafe();
    query = (query || "").trim().toLowerCase();
    if (!query) {
        dropdown.style.display = "none";
        return;
    }

    const matches = stdList.filter(s => {
        const name = (s.fullName || s.name || "").toLowerCase();
        const id = String(s.studentId || "");
        return name.includes(query) || id.includes(query);
    }).slice(0, 10);

    if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding: 10px; color: #94a3b8; font-size: 13px; text-align: center;">ไม่พบข้อมูลนักเรียน</div>`;
        dropdown.style.display = "block";
        return;
    }

    let html = "";
    matches.forEach(s => {
        html += `
            <div class="mental-dropdown-item" onclick="selectMentalStudent('${s.studentId}')" style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: #1e293b; font-size: 14px;">${s.fullName || s.name}</strong>
                    <div style="font-size: 12px; color: #64748b;">ม.${s.grade}/${s.room} เลขที่ ${s.no || '-'} | รหัส ${s.studentId}</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="color: #94a3b8; font-size: 12px;"></i>
            </div>
        `;
    });

    dropdown.innerHTML = html;
    dropdown.style.display = "block";
};

window.selectMentalStudent = async function(studentId) {
    const stdList = await getStudentsSafe();
    const st = stdList.find(s => String(s.studentId) === String(studentId));
    if (st) {
        window.selectedMentalStudent = st;
        const searchInput = document.getElementById("mental-student-search-input");
        if (searchInput) searchInput.value = "";
        const dropdown = document.getElementById("mental-student-dropdown");
        if (dropdown) dropdown.style.display = "none";
        updateStudentCardDisplay();
    }
};

window.clearSelectedMentalStudent = function() {
    window.selectedMentalStudent = null;
    updateStudentCardDisplay();
};

function updateStudentCardDisplay() {
    const searchSection = document.getElementById("mental-search-section");
    const cardSection = document.getElementById("mental-selected-card-section");

    if (window.selectedMentalStudent) {
        if (searchSection) searchSection.style.display = "none";
        if (cardSection) {
            cardSection.style.display = "block";
            const st = window.selectedMentalStudent;
            const isMale = (st.prefix || st.fullName || "").includes("ด.ช.") || (st.prefix || st.fullName || "").includes("นาย");
            const avatarEl = document.getElementById("mental-card-avatar");
            if (avatarEl) avatarEl.innerText = isMale ? "👦" : "👧";

            const rawGrade = String(st.grade || "").trim();
            const displayGrade = rawGrade.startsWith("ม.") ? rawGrade : `ม.${rawGrade}`;

            if (document.getElementById("mental-card-name")) document.getElementById("mental-card-name").innerText = st.fullName || st.name;
            if (document.getElementById("mental-card-grade")) document.getElementById("mental-card-grade").innerText = `${displayGrade}/${st.room}`;
            if (document.getElementById("mental-card-no")) document.getElementById("mental-card-no").innerText = `เลขที่ ${st.no || '-'}`;
            if (document.getElementById("mental-card-id")) document.getElementById("mental-card-id").innerText = `รหัส ${st.studentId}`;
        }
    } else {
        if (searchSection) searchSection.style.display = "block";
        if (cardSection) cardSection.style.display = "none";
    }
}

// =========================================================================
// หมวด 1: แบบประเมินความเครียดและอารมณ์ซึมเศร้า (13 ข้อ)
// =========================================================================
function renderMentalQuestionsCat1() {
    const container = document.getElementById("mental-questions-cat1-container");
    if (!container) return;

    let html = "";
    MENTAL_QUESTIONS_CAT1.forEach((qText, idx) => {
        const currentVal = window.mentalAnswersCat1[idx];
        html += `
            <div class="mental-q-card" style="background: white; border-radius: 16px; padding: 16px 18px; margin-bottom: 14px; border: 1px solid #eef2f6; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #ede9fe; color: #6366f1; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                        ${idx + 1}
                    </div>
                    <div style="font-weight: 600; font-size: 15px; color: #1e293b; line-height: 1.4;">
                        ${qText}
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
                    ${[0, 1, 2, 3].map(score => `
                        <button type="button" class="mental-option-btn ${currentVal === score ? 'active' : ''}" onclick="setMentalAnswerCat1(${idx}, ${score})" style="padding: 10px 0; border-radius: 12px; font-weight: 700; font-size: 15px; border: 1px solid ${currentVal === score ? '#5850ec' : '#e2e8f0'}; background: ${currentVal === score ? '#5850ec' : '#f8fafc'}; color: ${currentVal === score ? '#ffffff' : '#475569'}; cursor: pointer; transition: 0.15s; box-shadow: ${currentVal === score ? '0 4px 12px rgba(88,80,236,0.3)' : 'none'};">
                            ${score}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateCounterCat1();
}

window.setMentalAnswerCat1 = function(qIdx, score) {
    window.mentalAnswersCat1[qIdx] = score;
    renderMentalQuestionsCat1();
};

function updateCounterCat1() {
    const count = Object.keys(window.mentalAnswersCat1).length;
    const badge = document.getElementById("mental-counter-badge-cat1");
    if (badge) badge.innerText = `ตอบแล้ว ${count} / 13 ข้อ`;
}

// =========================================================================
// หมวด 2: แบบประเมิน SDQ (จุดแข็งและจุดอ่อน 25 ข้อ)
// =========================================================================
function renderMentalQuestionsCat2() {
    const container = document.getElementById("mental-questions-cat2-container");
    if (!container) return;

    let html = "";
    MENTAL_QUESTIONS_CAT2.forEach((qText, idx) => {
        const currentVal = window.mentalAnswersCat2[idx];
        html += `
            <div class="mental-q-card" style="background: white; border-radius: 16px; padding: 16px 18px; margin-bottom: 14px; border: 1px solid #eef2f6; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #4338ca; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                        ${idx + 1}
                    </div>
                    <div style="font-weight: 600; font-size: 15px; color: #1e293b; line-height: 1.4;">
                        ${qText}
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                    ${[
                        { score: 0, label: "0 (ไม่จริง)" },
                        { score: 1, label: "1 (บางครั้ง)" },
                        { score: 2, label: "2 (จริงแท้)" }
                    ].map(opt => `
                        <button type="button" class="mental-option-btn ${currentVal === opt.score ? 'active' : ''}" onclick="setMentalAnswerCat2(${idx}, ${opt.score})" style="padding: 10px 0; border-radius: 12px; font-weight: 700; font-size: 13px; border: 1px solid ${currentVal === opt.score ? '#5850ec' : '#e2e8f0'}; background: ${currentVal === opt.score ? '#5850ec' : '#f8fafc'}; color: ${currentVal === opt.score ? '#ffffff' : '#475569'}; cursor: pointer; transition: 0.15s; box-shadow: ${currentVal === opt.score ? '0 4px 12px rgba(88,80,236,0.3)' : 'none'};">
                            ${opt.label}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateCounterCat2();
}

window.setMentalAnswerCat2 = function(qIdx, score) {
    window.mentalAnswersCat2[qIdx] = score;
    renderMentalQuestionsCat2();
};

function updateCounterCat2() {
    const count = Object.keys(window.mentalAnswersCat2).length;
    const badge = document.getElementById("mental-counter-badge-cat2");
    if (badge) badge.innerText = `ตอบแล้ว ${count} / 25 ข้อ`;
}

// =========================================================================
// หมวด 3: ประเมินความเสี่ยงต่อการทำร้ายตนเอง (ข้อ 14 เดิม + 8Q)
// =========================================================================
function renderMentalQuestionsCat3() {
    const container = document.getElementById("mental-questions-cat3-container");
    if (!container) return;

    let html = "";
    MENTAL_QUESTIONS_CAT3.forEach((qObj, idx) => {
        const currentVal = window.mentalAnswersCat3[idx];
        html += `
            <div class="mental-q-card" style="background: white; border-radius: 16px; padding: 16px 18px; margin-bottom: 14px; border: 1px solid #eef2f6; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #4338ca; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                        ${idx + 1}
                    </div>
                    <div style="font-weight: 600; font-size: 15px; color: #1e293b; line-height: 1.4;">
                        ${qObj.text}
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                    <button type="button" class="mental-option-btn ${currentVal === 0 ? 'active' : ''}" onclick="setMentalAnswerCat3(${idx}, 0)" style="padding: 10px 0; border-radius: 12px; font-weight: 700; font-size: 14px; border: 1px solid ${currentVal === 0 ? '#5850ec' : '#e2e8f0'}; background: ${currentVal === 0 ? '#5850ec' : '#f8fafc'}; color: ${currentVal === 0 ? '#ffffff' : '#475569'}; cursor: pointer; transition: 0.15s; box-shadow: ${currentVal === 0 ? '0 4px 12px rgba(88,80,236,0.3)' : 'none'};">
                        ไม่มี
                    </button>
                    <button type="button" class="mental-option-btn ${currentVal === 1 ? 'active' : ''}" onclick="setMentalAnswerCat3(${idx}, 1)" style="padding: 10px 0; border-radius: 12px; font-weight: 700; font-size: 14px; border: 1px solid ${currentVal === 1 ? '#5850ec' : '#e2e8f0'}; background: ${currentVal === 1 ? '#5850ec' : '#f8fafc'}; color: ${currentVal === 1 ? '#ffffff' : '#475569'}; cursor: pointer; transition: 0.15s; box-shadow: ${currentVal === 1 ? '0 4px 12px rgba(88,80,236,0.3)' : 'none'};">
                        มี
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateCounterCat3();
}

window.setMentalAnswerCat3 = function(qIdx, hasVal) {
    window.mentalAnswersCat3[qIdx] = hasVal;
    renderMentalQuestionsCat3();
};

function updateCounterCat3() {
    const count = Object.keys(window.mentalAnswersCat3).length;
    const badge = document.getElementById("mental-counter-badge-cat3");
    if (badge) badge.innerText = `ตอบแล้ว ${count} / ${MENTAL_QUESTIONS_CAT3.length} ข้อ`;
}

// =========================================================================
// ส่งแบบประเมินแต่ละหมวดลง Supabase Database
// =========================================================================

// ส่งแบบประเมิน หมวด 1 (ความเครียด & ซึมเศร้า -> stress_eval)
window.submitMentalCat1 = async function() {
    if (!window.selectedMentalStudent) {
        if (typeof showToast === "function") showToast("กรุณาเลือกนักเรียนก่อนส่งแบบประเมิน", "warning");
        return;
    }

    let st5Score = 0;
    for (let i = 0; i < 5; i++) st5Score += (Number(window.mentalAnswersCat1[i]) || 0);

    let depressionScore = 0;
    for (let i = 5; i < 13; i++) depressionScore += (Number(window.mentalAnswersCat1[i]) || 0);

    let stressText = st5Score <= 4 ? "เครียดน้อย" : (st5Score <= 7 ? "เครียดปานกลาง" : "เครียดสูง");
    let depressionText = depressionScore < 7 ? "ปกติ" : (depressionScore <= 12 ? "ซึมเศร้าปานกลาง" : "ซึมเศร้ารุนแรง");

    const dateStr = (typeof getLocalDateString === "function") ? getLocalDateString() : new Date().toISOString().split('T')[0];
    const teacherName = (typeof loggedInUser !== "undefined" && loggedInUser) ? loggedInUser.name : "ครูผู้ประเมิน";
    const sId = String(window.selectedMentalStudent.studentId);
    const rowId = `STRESS_${Date.now()}_${sId}`;

    const db = getSupabaseSafe();
    if (!db) {
        if (typeof showToast === "function") showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
        return;
    }

    if (typeof showToast === "function") showToast("กำลังบันทึกลงฐานข้อมูล...", "info");

    try {
        const payload = {
            id: rowId,
            eval_date: dateStr,
            student_id: sId,
            stress_score: st5Score,
            stress_level: stressText,
            depression_score: depressionScore,
            depression_level: depressionText,
            answers: window.mentalAnswersCat1,
            q14_risk: (depressionScore >= 7),
            recorder: teacherName
        };

        const { error } = await db.from('stress_eval').insert(payload);
        if (error) throw error;

        if (typeof showToast === "function") showToast("บันทึกข้อมูลแบบประเมินหมวด 1 เรียบร้อย ⚡", "success");
        window.mentalAnswersCat1 = {};
        renderMentalQuestionsCat1();
        openStudentHistoryModal();
    } catch (err) {
        console.error("submitMentalCat1 error:", err);
        alert(`❌ ไม่สามารถบันทึกลงฐานข้อมูลได้:\n\n${err.message || err}`);
        if (typeof showToast === "function") showToast("เกิดข้อผิดพลาดในการบันทึก", "error");
    }
};

// ส่งแบบประเมิน หมวด 2 (SDQ 25 ข้อ -> sdq_eval)
window.submitMentalCat2 = async function() {
    if (!window.selectedMentalStudent) {
        if (typeof showToast === "function") showToast("กรุณาเลือกนักเรียนก่อนส่งแบบประเมิน", "warning");
        return;
    }

    const ans = window.mentalAnswersCat2;
    const getVal = (idx, isReverse = false) => {
        let v = Number(ans[idx]) || 0;
        if (isReverse) {
            if (v === 0) return 2;
            if (v === 2) return 0;
            return 1;
        }
        return v;
    };

    // คำนวณคะแนน 5 ด้านตามหลักจิตวิทยา SDQ มาตรฐาน
    const emotionalScore = getVal(2) + getVal(7) + getVal(12) + getVal(15) + getVal(23);
    const conductScore = getVal(4) + getVal(6, true) + getVal(11) + getVal(17) + getVal(21);
    const hyperactivityScore = getVal(1) + getVal(9) + getVal(14) + getVal(20, true) + getVal(24, true);
    const peerScore = getVal(5) + getVal(10, true) + getVal(13, true) + getVal(18) + getVal(22);
    const prosocialScore = getVal(0) + getVal(3) + getVal(8) + getVal(16) + getVal(19);

    const totalDifficultiesScore = emotionalScore + conductScore + hyperactivityScore + peerScore;

    let overallStatus = "NORMAL";
    let overallTitle = "ปกติ";
    if (totalDifficultiesScore >= 20) {
        overallStatus = "PROBLEM";
        overallTitle = "มีปัญหา";
    } else if (totalDifficultiesScore >= 16) {
        overallStatus = "RISK";
        overallTitle = "กลุ่มเสี่ยง";
    }

    const subscalesObj = {
        emotional: { score: emotionalScore, status: emotionalScore >= 7 ? "PROBLEM" : (emotionalScore >= 5 ? "RISK" : "NORMAL") },
        conduct: { score: conductScore, status: conductScore >= 5 ? "PROBLEM" : (conductScore >= 4 ? "RISK" : "NORMAL") },
        hyperactivity: { score: hyperactivityScore, status: hyperactivityScore >= 7 ? "PROBLEM" : (hyperactivityScore >= 6 ? "RISK" : "NORMAL") },
        peer: { score: peerScore, status: peerScore >= 6 ? "PROBLEM" : (peerScore >= 4 ? "RISK" : "NORMAL") },
        prosocial: { score: prosocialScore, status: prosocialScore <= 4 ? "PROBLEM" : (prosocialScore <= 5 ? "RISK" : "NORMAL") }
    };

    const dateStr = (typeof getLocalDateString === "function") ? getLocalDateString() : new Date().toISOString().split('T')[0];
    const teacherName = (typeof loggedInUser !== "undefined" && loggedInUser) ? loggedInUser.name : "ครูผู้ประเมิน";
    const sId = String(window.selectedMentalStudent.studentId);
    const rowId = `SDQ_${Date.now()}_${sId}`;

    const db = getSupabaseSafe();
    if (!db) {
        if (typeof showToast === "function") showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
        return;
    }

    if (typeof showToast === "function") showToast("กำลังบันทึกลงฐานข้อมูล...", "info");

    try {
        const payload = {
            id: rowId,
            eval_date: dateStr,
            student_id: sId,
            total_score: totalDifficultiesScore,
            prosocial_score: prosocialScore,
            overall_status: overallStatus,
            overall_title: overallTitle,
            emotional_score: emotionalScore,
            conduct_score: conductScore,
            hyperactivity_score: hyperactivityScore,
            peer_score: peerScore,
            subscales: subscalesObj,
            answers: ans,
            recorder: teacherName
        };

        const { error } = await db.from('sdq_eval').insert(payload);
        if (error) throw error;

        if (typeof showToast === "function") showToast("บันทึกข้อมูลแบบประเมิน SDQ เรียบร้อย ⚡", "success");
        window.mentalAnswersCat2 = {};
        renderMentalQuestionsCat2();
        openStudentHistoryModal();
    } catch (err) {
        console.error("submitMentalCat2 error:", err);
        alert(`❌ ไม่สามารถบันทึกลงฐานข้อมูลได้:\n\n${err.message || err}`);
        if (typeof showToast === "function") showToast("เกิดข้อผิดพลาดในการบันทึก", "error");
    }
};

// ส่งแบบประเมิน หมวด 3 (ทำร้ายตนเอง 8Q -> suicide_eval)
window.submitMentalCat3 = async function() {
    if (!window.selectedMentalStudent) {
        if (typeof showToast === "function") showToast("กรุณาเลือกนักเรียนก่อนส่งแบบประเมิน", "warning");
        return;
    }

    let totalScore = 0;
    MENTAL_QUESTIONS_CAT3.forEach((q, idx) => {
        if (window.mentalAnswersCat3[idx] === 1) {
            totalScore += q.weight;
        }
    });

    let riskLevel = "NONE";
    let riskTitle = "ไม่มีความเสี่ยง";
    if (totalScore >= 17) {
        riskLevel = "SEVERE";
        riskTitle = "เสี่ยงระดับรุนแรง";
    } else if (totalScore >= 9) {
        riskLevel = "MEDIUM";
        riskTitle = "เสี่ยงระดับปานกลาง";
    } else if (totalScore >= 1) {
        riskLevel = "LOW";
        riskTitle = "เสี่ยงระดับน้อย";
    }

    const dateStr = (typeof getLocalDateString === "function") ? getLocalDateString() : new Date().toISOString().split('T')[0];
    const teacherName = (typeof loggedInUser !== "undefined" && loggedInUser) ? loggedInUser.name : "ครูผู้ประเมิน";
    const sId = String(window.selectedMentalStudent.studentId);
    const rowId = `SUICIDE_${Date.now()}_${sId}`;

    const db = getSupabaseSafe();
    if (!db) {
        if (typeof showToast === "function") showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
        return;
    }

    if (typeof showToast === "function") showToast("กำลังบันทึกลงฐานข้อมูล...", "info");

    try {
        const payload = {
            id: rowId,
            eval_date: dateStr,
            student_id: sId,
            total_score: totalScore,
            risk_level: riskLevel,
            risk_title: riskTitle,
            answers: window.mentalAnswersCat3,
            recorder: teacherName
        };

        const { error } = await db.from('suicide_eval').insert(payload);
        if (error) throw error;

        if (typeof showToast === "function") showToast("บันทึกข้อมูลแบบประเมินหมวด 3 เรียบร้อย ⚡", "success");
        window.mentalAnswersCat3 = {};
        renderMentalQuestionsCat3();
        openStudentHistoryModal();
    } catch (err) {
        console.error("submitMentalCat3 error:", err);
        alert(`❌ ไม่สามารถบันทึกลงฐานข้อมูลได้:\n\n${err.message || err}`);
        if (typeof showToast === "function") showToast("เกิดข้อผิดพลาดในการบันทึก", "error");
    }
};

// =========================================================================
// Modals & Recommendations
// =========================================================================
window.openCriteriaModal = function() {
    document.getElementById("modal-mental-criteria")?.classList.add("active");
};
window.closeCriteriaModal = function() {
    document.getElementById("modal-mental-criteria")?.classList.remove("active");
};

// คำแนะนำรายบุคคลตามผลประเมินแต่ละหมวดและแต่ละระดับ
function getMentalRecommendation(evalType, record) {
    if (evalType === "STRESS_DEPRESSION") {
        const stress = (record.st5_result || "").toLowerCase();
        const dep = (record.depression_result || "").toLowerCase();
        if (dep.includes("รุนแรง") || stress.includes("สูง") || stress.includes("รุนแรง")) {
            return {
                type: "danger",
                icon: "🚨",
                title: "คำแนะนำเร่งด่วน",
                text: "มีความเสี่ยงสูงต่อปัญหาสุขภาพจิต ควรประสานครูแนะแนว/ผู้ปกครอง และส่งต่อนักจิตวิทยาหรือจิตแพทย์เพื่อประเมินและดูแลรักษาทันที"
            };
        } else if (dep.includes("ปานกลาง") || stress.includes("ปานกลาง")) {
            return {
                type: "warning",
                icon: "⚠️",
                title: "คำแนะนำการดูแล",
                text: "พบความเครียด/ภาวะซึมเศร้าระดับปานกลาง ควรพูดคุยรับฟังอย่างเข้าใจ ให้คำปรึกษา แนะนำการผ่อนคลายความเครียด และติดตามดูแลอย่างใกล้ชิด"
            };
        } else {
            return {
                type: "success",
                icon: "💡",
                title: "คำแนะนำทั่วไป",
                text: "สุขภาพจิตอยู่ในเกณฑ์ปกติ ส่งเสริมกิจกรรมผ่อนคลาย การพักผ่อนที่เพียงพอ และเสริมสร้างสุขภาวะตามวัยอย่างต่อเนื่อง"
            };
        }
    } else if (evalType === "SDQ") {
        const sdq = (record.sdq_result || record.risk_level || "").toLowerCase();
        if (sdq.includes("ปัญหา") || (Number(record.total_score) >= 20)) {
            return {
                type: "danger",
                icon: "🚨",
                title: "คำแนะนำการดูแล",
                text: "มีแนวโน้มมีปัญหาพฤติกรรม/อารมณ์ ควรส่งต่อครูแนะแนวหรือทีมสหวิชาชีพ ร่วมวางแผนปรับพฤติกรรม และประสานผู้ปกครองร่วมดูแลอย่างใกล้ชิด"
            };
        } else if (sdq.includes("เสี่ยง") || (Number(record.total_score) >= 16)) {
            return {
                type: "warning",
                icon: "⚠️",
                title: "คำแนะนำการดูแล",
                text: "อยู่ในกลุ่มเสี่ยง ควรเฝ้าระวังพฤติกรรมด้านที่มีคะแนนสูง ให้การสนับสนุนรายบุคคล และส่งเสริมจุดแข็งของนักเรียน"
            };
        } else {
            return {
                type: "success",
                icon: "💡",
                title: "คำแนะนำทั่วไป",
                text: "พัฒนาการและพฤติกรรมอยู่ในเกณฑ์ปกติ ส่งเสริมจุดแข็ง ทักษะชีวิต และการมีส่วนร่วมในกิจกรรมเชิงบวกอย่างต่อเนื่อง"
            };
        }
    } else if (evalType === "SELF_HARM_8Q") {
        const risk = (record.risk_level || "").toLowerCase();
        const score = Number(record.total_score) || 0;
        if (risk.includes("รุนแรง") || risk.includes("severe") || score >= 17) {
            return {
                type: "danger",
                icon: "🆘",
                title: "คำแนะนำวิกฤต (ด่วนที่สุด)",
                text: "ห้ามปล่อยให้อยู่คนเดียวเด็ดขาด! แจ้งผู้ปกครองทันที และส่งพบแพทย์/จิตแพทย์ หรือประสานสายด่วนสุขภาพจิต 1323 โดยเร็วที่สุด"
            };
        } else if (risk.includes("ปานกลาง") || score >= 9) {
            return {
                type: "danger",
                icon: "🚨",
                title: "คำแนะนำการดูแล",
                text: "เฝ้าระวังความปลอดภัยอย่างใกล้ชิด สังเกตพฤติกรรมและอารมณ์ แจ้งผู้ปกครองร่วมดูแล และปรึกษาครูแนะแนวทันที"
            };
        } else if (risk.includes("น้อย") || score >= 1) {
            return {
                type: "warning",
                icon: "⚠️",
                title: "คำแนะนำการดูแล",
                text: "พูดคุยรับฟังด้วยความเข้าใจ สังเกตการเปลี่ยนแปลงทางอารมณ์ หลีกเลี่ยงการตำหนิหรือตัดสิน และสร้างพื้นที่ปลอดภัยในการพูดคุย"
            };
        } else {
            return {
                type: "success",
                icon: "💡",
                title: "คำแนะนำทั่วไป",
                text: "ไม่พบความเสี่ยงต่อการทำร้ายตนเอง ส่งเสริมพลังใจและสัมพันธภาพที่ดีในครอบครัวและโรงเรียน"
            };
        }
    }
    return {
        type: "info",
        icon: "💡",
        title: "คำแนะนำ",
        text: "ส่งเสริมและสนับสนุนการเรียนรู้และสุขภาพจิตของนักเรียนอย่างต่อเนื่อง"
    };
}

window.setModalHistoryCat = function(cat) {
    window.modalHistoryActiveCat = cat;
    document.querySelectorAll(".modal-history-tab").forEach(tab => {
        const hcat = tab.getAttribute("data-hcat");
        if (String(hcat) === String(cat)) {
            tab.style.background = "white";
            tab.style.color = "#4338ca";
            tab.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
        } else {
            tab.style.background = "transparent";
            tab.style.color = "#64748b";
            tab.style.boxShadow = "none";
        }
    });
    renderModalHistoryList();
};

window.openStudentHistoryModal = async function() {
    if (!window.selectedMentalStudent) {
        if (typeof showToast === "function") showToast("กรุณาเลือกนักเรียนก่อนเปิดดูประวัติ", "warning");
        return;
    }

    const st = window.selectedMentalStudent;
    const isMale = (st.prefix || st.fullName || "").includes("ด.ช.") || (st.prefix || st.fullName || "").includes("นาย");
    
    // อัปเดตหัวข้อข้อมูลนักเรียนใน Modal
    const rawGrade = String(st.grade || "").trim();
    const displayGrade = rawGrade.startsWith("ม.") ? rawGrade : `ม.${rawGrade}`;
    
    if (document.getElementById("modal-history-name")) document.getElementById("modal-history-name").innerText = st.fullName || st.name;
    if (document.getElementById("modal-history-meta")) document.getElementById("modal-history-meta").innerText = `ชั้น ${displayGrade}/${st.room} | เลขที่ ${st.no || '-'} | รหัส ${st.studentId}`;
    
    const avatarEl = document.querySelector("#modal-mental-student-history .modal-box div[style*='font-size: 26px']");
    if (avatarEl) avatarEl.innerText = isMale ? "👦" : "👧";

    // โหลดข้อมูลล่าสุดจาก Supabase จริง
    await loadAllMentalRecords();

    // เปิดหมวดตามหมวดปัจจุบันที่กำลังใช้งาน (หมวดใครหมวดมัน)
    const initialCat = window.currentMentalCategory || 1;
    setModalHistoryCat(initialCat);

    document.getElementById("modal-mental-student-history")?.classList.add("active");
};

function renderModalHistoryList() {
    if (!window.selectedMentalStudent) return;
    const st = window.selectedMentalStudent;
    const activeCat = window.modalHistoryActiveCat || 1;

    let historyList = (window.mentalEvalHistoryCache || []).filter(r => String(r.student_id) === String(st.studentId));

    if (activeCat === 1 || activeCat === "1") {
        historyList = historyList.filter(r => r.eval_type === "STRESS_DEPRESSION");
    } else if (activeCat === 2 || activeCat === "2") {
        historyList = historyList.filter(r => r.eval_type === "SDQ");
    } else if (activeCat === 3 || activeCat === "3") {
        historyList = historyList.filter(r => r.eval_type === "SELF_HARM_8Q");
    }

    const container = document.getElementById("modal-history-list-container");
    const countBadge = document.getElementById("modal-history-round-count");

    let catLabel = "ทั้งหมด";
    if (activeCat === 1 || activeCat === "1") catLabel = "หมวด 1 (ความเครียด & ซึมเศร้า)";
    else if (activeCat === 2 || activeCat === "2") catLabel = "หมวด 2 (SDQ)";
    else if (activeCat === 3 || activeCat === "3") catLabel = "หมวด 3 (ความเสี่ยงทำร้ายตนเอง)";

    if (countBadge) countBadge.innerText = `ประวัติ ${catLabel} : ${historyList.length} รอบ`;

    if (historyList.length === 0) {
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 28px 14px; color: #94a3b8; font-size: 13px;">
                    <i class="fa-regular fa-folder-open" style="font-size: 28px; margin-bottom: 8px; color: #cbd5e1; display: block;"></i>
                    ยังไม่มีประวัติการประเมินในหมวดนี้
                </div>
            `;
        }
        return;
    }

    let html = "";
    historyList.forEach((h, idx) => {
        const isCat1 = h.eval_type === "STRESS_DEPRESSION";
        const isCat2 = h.eval_type === "SDQ";
        const isCat3 = h.eval_type === "SELF_HARM_8Q";

        let catBadge = `<span style="background: #ede9fe; color: #6366f1; border-radius: 6px; padding: 2px 6px; font-size: 11px; font-weight: 700;">หมวด 1</span>`;
        if (isCat2) {
            catBadge = `<span style="background: #e0e7ff; color: #4338ca; border-radius: 6px; padding: 2px 6px; font-size: 11px; font-weight: 700;">หมวด 2 (SDQ)</span>`;
        } else if (isCat3) {
            catBadge = `<span style="background: #fee2e2; color: #dc2626; border-radius: 6px; padding: 2px 6px; font-size: 11px; font-weight: 700;">หมวด 3 (ความเสี่ยง)</span>`;
        }

        const rec = getMentalRecommendation(h.eval_type, h);
        let recBg = "#f0fdf4";
        let recBorder = "#bbf7d0";
        let recColor = "#166534";

        if (rec.type === "danger") {
            recBg = "#fef2f2";
            recBorder = "#fecaca";
            recColor = "#991b1b";
        } else if (rec.type === "warning") {
            recBg = "#fffbeb";
            recBorder = "#fde68a";
            recColor = "#92400e";
        }

        html += `
            <div style="background: white; border: 1px solid #eef2f6; border-radius: 14px; padding: 12px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.02);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${catBadge}
                        <span style="font-weight: 700; color: #1e293b; font-size: 13px;">${h.date || '-'}</span>
                    </div>
                    <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">รอบที่ ${historyList.length - idx}</span>
                </div>
                
                ${isCat1 ? `
                    <div style="display: flex; gap: 6px; font-size: 12px;">
                        <div style="flex: 1; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                            <span style="color: #9a3412; font-size: 11px;">ความเครียด:</span>
                            <strong style="color: #c2410c; display: block; font-size: 12px;">${h.st5_result || 'ปกติ'}</strong>
                        </div>
                        <div style="flex: 1; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 6px 8px; text-align: center;">
                            <span style="color: #9a3412; font-size: 11px;">ภาวะซึมเศร้า:</span>
                            <strong style="color: #c2410c; display: block; font-size: 12px;">${h.depression_result || 'ปกติ'}</strong>
                        </div>
                    </div>
                ` : (isCat3 ? `
                    <div style="background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 6px 10px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #991b1b; font-size: 11px;">ความเสี่ยงทำร้ายตนเอง:</span>
                        <strong style="color: #b91c1c; font-size: 12px;">${h.risk_level || 'ไม่มีความเสี่ยง'} ${h.total_score ? `(${h.total_score} คะแนน)` : ''}</strong>
                    </div>
                ` : `
                    <div style="display: flex; gap: 6px; font-size: 12px;">
                        <div style="flex: 1; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 6px 8px; text-align: center;">
                            <span style="color: #991b1b; font-size: 11px;">ภาพรวม 4 ด้าน:</span>
                            <strong style="color: #b91c1c; display: block; font-size: 12px;">${h.sdq_result || 'ปกติ'}</strong>
                        </div>
                        <div style="flex: 1; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 6px 8px; text-align: center;">
                            <span style="color: #166534; font-size: 11px;">ด้านจุดแข็ง:</span>
                            <strong style="color: #15803d; display: block; font-size: 12px;">${h.prosocial_result || 'ปกติ'}</strong>
                        </div>
                    </div>
                `)}

                <!-- กล่องคำแนะนำการดูแลรายบุคคลแต่ละหมวด/ระดับ -->
                <div style="margin-top: 8px; background: ${recBg}; border: 1px solid ${recBorder}; border-radius: 8px; padding: 7px 10px; font-size: 11px; color: ${recColor}; line-height: 1.45;">
                    <strong>${rec.icon} ${rec.title}:</strong> ${rec.text}
                </div>
            </div>
        `;
    });

    if (container) container.innerHTML = html;
}

window.closeStudentHistoryModal = function() {
    document.getElementById("modal-mental-student-history")?.classList.remove("active");
};

// =========================================================================
// หน้ารายงานผลการประเมิน (Evaluation Report & Dashboard)
// =========================================================================
window.initReportView = async function() {
    await loadAllMentalRecords();
    renderReportDashboard();
};

async function loadAllMentalRecords() {
    window.mentalEvalHistoryCache = [];

    const db = getSupabaseSafe();
    if (db) {
        try {
            const [stressRes, sdqRes, suicideRes] = await Promise.all([
                db.from('stress_eval').select('*').order('created_at', { ascending: false }),
                db.from('sdq_eval').select('*').order('created_at', { ascending: false }),
                db.from('suicide_eval').select('*').order('created_at', { ascending: false })
            ]);

            const stdList = await getStudentsSafe();
            const fromCloud = [];

            // 1. stress_eval (หมวด 1)
            (stressRes.data || []).forEach(d => {
                const st = stdList.find(s => String(s.studentId) === String(d.student_id));
                fromCloud.push({
                    student_id: String(d.student_id),
                    student_name: st ? (st.fullName || st.name) : (d.student_id || '-'),
                    grade: st ? st.grade : '-',
                    room: st ? st.room : '-',
                    no: st ? st.no : '-',
                    date: d.eval_date || (d.created_at ? d.created_at.split('T')[0] : ''),
                    eval_type: "STRESS_DEPRESSION",
                    st5_score: d.stress_score || 0,
                    st5_result: d.stress_level || 'ปกติ',
                    depression_score: d.depression_score || 0,
                    depression_result: d.depression_level || 'ปกติ',
                    total_score: (d.stress_score || 0) + (d.depression_score || 0),
                    risk_level: `${d.stress_level || 'ปกติ'} / ${d.depression_level || 'ปกติ'}`,
                    evaluator_name: d.recorder || '',
                    created_at: d.created_at || ''
                });
            });

            // 2. sdq_eval (หมวด 2)
            (sdqRes.data || []).forEach(d => {
                const st = stdList.find(s => String(s.studentId) === String(d.student_id));
                fromCloud.push({
                    student_id: String(d.student_id),
                    student_name: st ? (st.fullName || st.name) : (d.student_id || '-'),
                    grade: st ? st.grade : '-',
                    room: st ? st.room : '-',
                    no: st ? st.no : '-',
                    date: d.eval_date || (d.created_at ? d.created_at.split('T')[0] : ''),
                    eval_type: "SDQ",
                    total_score: d.total_score || 0,
                    sdq_result: d.overall_title || 'ปกติ',
                    prosocial_result: d.prosocial_score !== undefined ? `จุดแข็ง ${d.prosocial_score} คะแนน` : 'ปกติ',
                    risk_level: d.overall_title || 'ปกติ',
                    evaluator_name: d.recorder || '',
                    created_at: d.created_at || ''
                });
            });

            // 3. suicide_eval (หมวด 3)
            (suicideRes.data || []).forEach(d => {
                const st = stdList.find(s => String(s.studentId) === String(d.student_id));
                fromCloud.push({
                    student_id: String(d.student_id),
                    student_name: st ? (st.fullName || st.name) : (d.student_id || '-'),
                    grade: st ? st.grade : '-',
                    room: st ? st.room : '-',
                    no: st ? st.no : '-',
                    date: d.eval_date || (d.created_at ? d.created_at.split('T')[0] : ''),
                    eval_type: "SELF_HARM_8Q",
                    total_score: d.total_score || 0,
                    risk_level: d.risk_title || 'ไม่มีความเสี่ยง',
                    evaluator_name: d.recorder || '',
                    created_at: d.created_at || ''
                });
            });

            fromCloud.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
            window.mentalEvalHistoryCache = fromCloud;
        } catch (err) {
            console.error("Error loading mental eval records from Supabase:", err);
        }
    }
}

window.renderReportDashboard = function() {
    const gradeVal = document.getElementById("report-grade-select")?.value || "ALL";
    const roomVal = document.getElementById("report-room-select")?.value || "ALL";
    const riskVal = document.getElementById("report-risk-select")?.value || "ALL";
    const searchVal = (document.getElementById("report-search-input")?.value || "").trim().toLowerCase();

    const filtered = (window.mentalEvalHistoryCache || []).filter(r => {
        if (gradeVal !== "ALL" && !isGradeMatch(r.grade, gradeVal)) return false;
        if (roomVal !== "ALL" && !isRoomMatch(r.room, roomVal)) return false;
        if (riskVal !== "ALL") {
            const res = (r.risk_level || r.sdq_result || r.depression_result || "").toLowerCase();
            if (riskVal === "NORMAL" && !res.includes("ปกติ") && !res.includes("ไม่มี")) return false;
            if (riskVal === "RISK" && !res.includes("เสี่ยง")) return false;
            if (riskVal === "PROBLEM" && !res.includes("ปัญหา") && !res.includes("รุนแรง")) return false;
        }
        if (searchVal) {
            const matchName = (r.student_name || "").toLowerCase().includes(searchVal);
            const matchId = String(r.student_id || "").includes(searchVal);
            if (!matchName && !matchId) return false;
        }
        return true;
    });

    let totalCount = filtered.length;
    let normalCount = 0;
    let riskCount = 0;
    let problemCount = 0;

    filtered.forEach(r => {
        const res = r.risk_level || r.sdq_result || r.depression_result || "ปกติ";
        if (res.includes("ปกติ") || res.includes("ไม่มี")) normalCount++;
        else if (res.includes("เสี่ยง") && !res.includes("รุนแรง")) riskCount++;
        else problemCount++;
    });

    if (document.getElementById("report-card-total-val")) document.getElementById("report-card-total-val").innerText = totalCount;
    if (document.getElementById("report-card-normal-val")) document.getElementById("report-card-normal-val").innerText = normalCount;
    if (document.getElementById("report-card-risk-val")) document.getElementById("report-card-risk-val").innerText = riskCount;
    if (document.getElementById("report-card-problem-val")) document.getElementById("report-card-problem-val").innerText = problemCount;

    const tbody = document.getElementById("report-table-tbody");
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 30px; color: #94a3b8; font-size: 13px;">
                    ไม่พบข้อมูลการประเมิน
                </td>
            </tr>
        `;
        return;
    }

    let html = "";
    filtered.forEach((r, idx) => {
        const res = r.risk_level || r.sdq_result || r.depression_result || "ปกติ";
        let badgeBg = "#f0fdf4";
        let badgeColor = "#166534";
        let badgeBorder = "#bbf7d0";

        if (res.includes("เสี่ยง") && !res.includes("รุนแรง")) {
            badgeBg = "#fffbeb";
            badgeColor = "#b45309";
            badgeBorder = "#fde68a";
        } else if (res.includes("ปัญหา") || res.includes("รุนแรง")) {
            badgeBg = "#fef2f2";
            badgeColor = "#b91c1c";
            badgeBorder = "#fecaca";
        }

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                <td style="padding: 12px 14px; text-align: center; color: #64748b;">${idx + 1}</td>
                <td style="padding: 12px 14px; color: #64748b;"><i class="fa-regular fa-calendar" style="margin-right: 4px;"></i> ${r.date || '-'}</td>
                <td style="padding: 12px 14px; font-weight: 700; color: #3b82f6;">${r.student_id}</td>
                <td style="padding: 12px 14px; font-weight: 600; color: #1e293b;">${r.student_name}</td>
                <td style="padding: 12px 14px; color: #64748b;">ม.${r.grade}/${r.room}</td>
                <td style="padding: 12px 14px;">
                    <span style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; white-space: nowrap;">
                        ${res}
                    </span>
                </td>
                <td style="padding: 12px 14px;">
                    <span style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; white-space: nowrap;">
                        ${r.prosocial_result || 'ปกติ'}
                    </span>
                </td>
                <td style="padding: 12px 14px; text-align: center;">
                    <button type="button" onclick="viewSingleReportDetail('${r.student_id}')" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

window.viewSingleReportDetail = function(studentId) {
    selectMentalStudent(studentId);
    openStudentHistoryModal();
};

// =========================================================================
// Quick Search & Certificate
// =========================================================================
window.openQuickStudentSearch = function() {
    const query = prompt("🔍 ค้นหาข้อมูลนักเรียน (พิมพ์ชื่อ, นามสกุล หรือ รหัสนักเรียน):");
    if (query && query.trim()) {
        getStudentsSafe().then(stdList => {
            const cleanQ = query.trim().toLowerCase();
            const found = stdList.filter(s => 
                (s.fullName && s.fullName.toLowerCase().includes(cleanQ)) ||
                (s.studentId && String(s.studentId).includes(cleanQ))
            );
            if (found.length === 0) {
                alert(`ไม่พบข้อมูลนักเรียนที่ตรงกับ "${query}"`);
            } else if (found.length === 1) {
                const s = found[0];
                selectMentalStudent(s.studentId);
                if (typeof switchMainTab === 'function') {
                    switchMainTab('eval');
                }
                if (typeof showToast === 'function') showToast(`เปิดข้อมูลของ ${s.fullName}`);
            } else {
                let msg = `พบข้อมูลนักเรียน ${found.length} คน:\n\n`;
                found.slice(0, 10).forEach((s, i) => {
                    msg += `${i+1}. ${s.fullName} (ม.${s.grade}/${s.room} รหัส ${s.studentId})\n`;
                });
                msg += `\nกรุณาพิมพ์รหัสนักเรียนที่ต้องการค้นหาอีกครั้ง`;
                alert(msg);
            }
        });
    }
};

window.openCertificateGenerator = function() {
    if (typeof showToast === 'function') {
        showToast("เปิดระบบเกียรติบัตรและรางวัลนักเรียน", "info");
    }
    if (typeof switchMainTab === 'function') {
        switchMainTab('report');
    }
};
