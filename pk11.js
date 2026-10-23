/**
 * pk11.js - ระบบขออนุญาตออกนอกบริเวณโรงเรียน (ป.ค. 11) แบบสแตนด์อโลน (Standalone Module)
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
window.currentPk11Step = 1;
const totalPk11Steps = 4;
window.pk11SignatureTarget = '';
window.pk11Records = [];
window.currentPk11Student = null;
window.pk11DraftData = null;
let students = [];
let users = [];
let signaturePad = null;

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

// Load Users (Teachers) Safe
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

/**
 * อัปโหลดรูปลายเซ็นขึ้น Supabase Storage (Bucket: signatures)
 */
async function uploadSignatureToSupabase(dataUrl, folder = 'pk11', filename = '') {
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

// =========================================================
// Wizard & List Management
// =========================================================

window.openPk11Wizard = function(recordId = null) {
    document.getElementById('pk11-list-container').style.display = 'none';
    document.getElementById('pk11-wizard-container').style.display = 'block';
    
    if (recordId) {
        // Edit mode
        const record = window.pk11Records.find(r => String(r.id) === String(recordId));
        if (record) {
            document.getElementById('pk11-record-id').value = record.id;
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
                if (b64 && b64.length > 5) {
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
        const timeSelect = document.getElementById('pk11-exit-time');
        if (timeSelect) timeSelect.value = `${hh}:${min}`;
        
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
            return sig && sig.src && sig.src.length > 10;
        } else if (stepIdx === 3) {
            const sig = document.getElementById('pk11-hr-signature-preview');
            return sig && sig.src && sig.src.length > 10;
        } else if (stepIdx === 4) {
            const sig = document.getElementById('pk11-sa-signature-preview');
            return sig && sig.src && sig.src.length > 10;
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
    
    if(prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'block';
    if(saveBtn) saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึก';
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
    const hrTeacher = users.find(u => u.name === hrVal || u.code === hrVal);
    const saTeacher = users.find(u => u.name === saVal || u.code === saVal);
    const hrCode = hrTeacher ? (hrTeacher.code || hrTeacher.name) : (hrVal || "");
    const saCode = saTeacher ? (saTeacher.code || saTeacher.name) : (saVal || "");
    const isHrApproved = document.querySelector('input[name="pk11-hr-status"]:checked')?.value === "เห็นควรอนุญาต";
    const isSaApproved = document.querySelector('input[name="pk11-sa-status"]:checked')?.value === "อนุญาต";

    setLoader(true);
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
            await loadPk11Records();
        } catch (err) {
            console.error("Supabase savePK11 error:", err);
            showToast("เกิดข้อผิดพลาดในการบันทึก ป.ค.11", "error");
        } finally {
            setLoader(false);
        }
    } else {
        setLoader(false);
        showToast("ไม่สามารถเชื่อมต่อฐานข้อมูลได้", "error");
    }
};

window.loadPk11Records = async function() {
    setLoader(true);
    const db = getSupabase();
    if (!db) {
        setLoader(false);
        return;
    }
    try {
        await Promise.all([getStudentsSafe(), getUsersSafe()]);
        const { data, error } = await db.from('pk11').select('*').order('target_date', { ascending: false });
        if (error) throw error;
        window.pk11Records = (data || []).map(r => {
            const st = students.find(s => s.studentId === r.student_id);
            const hrTeacher = users.find(u => u.code === r.hr_name || u.name === r.hr_name);
            const saTeacher = users.find(u => u.code === r.sa_name || u.name === r.sa_name);
            
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
    } finally {
        setLoader(false);
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

window.previewPk11Document = function() {
    if (typeof getPK11Template === 'function' && typeof generateDocumentHtml === 'function') {
        const getSigPreview = (id) => {
            const el = document.getElementById(id);
            if (!el) return "";
            const src = el.src;
            return (src && (src.startsWith('data:image') || src.startsWith('http'))) ? src : "";
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
            
            studentSignature: getSigPreview('pk11-student-signature-preview'),
            parentSignature: getSigPreview('pk11-parent-signature-preview'),
            hrSignature: getSigPreview('pk11-hr-signature-preview'),
            saSignature: getSigPreview('pk11-sa-signature-preview')
        };
        
        const html = generateDocumentHtml(payload);
        const modal = document.getElementById('modal-document-preview');
        const container = document.getElementById('document-print-area');
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

// =========================================================
// Signature Pad Modal
// =========================================================

window.openTeacherSignature = function(targetId) {
    window.pk11SignatureTarget = targetId;
    let roleName = 'ลายเซ็น';
    if (targetId === 'pk11-student') roleName = 'นักเรียน (ป.ค.11)';
    else if (targetId === 'pk11-parent') roleName = 'ผู้ปกครอง (ป.ค.11)';
    else if (targetId === 'pk11-hr') roleName = 'ครูที่ปรึกษา (ป.ค.11)';
    else if (targetId === 'pk11-sa') roleName = 'หัวหน้ากิจการนักเรียน (ป.ค.11)';

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
            }
        }, 50);
    }
};

window.clearTeacherSignature = function(targetId) {
    const img = document.getElementById(`${targetId}-signature-preview`);
    const container = document.getElementById(`${targetId}-signature-preview-container`);
    if (img) img.src = '';
    if (container) container.style.display = 'none';
};

window.clearSignature = function() {
    if (signaturePad) {
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

            if (signaturePad) signaturePad.clear();

            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const maxAllowedW = canvas.width * 0.76;
            const maxAllowedH = canvas.height * 0.68;
            const scale = Math.min(maxAllowedW / cropW, maxAllowedH / cropH, 2.0);

            const finalW = cropW * scale;
            const finalH = cropH * scale;
            const finalX = (canvas.width - finalW) / 2;
            const finalY = (canvas.height - finalH) / 2;

            ctx.drawImage(offCanvas, minX, minY, cropW, cropH, finalX, finalY, finalW, finalH);
            ctx.restore();

            if (signaturePad) signaturePad._isEmpty = false;
            showToast("เพิ่มรูปภาพลายเซ็นเรียบร้อยแล้ว ⚡", "success");
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

window.saveSignature = function() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas) return;

    let dataUrl = "";
    if (signaturePad && !signaturePad.isEmpty()) {
        dataUrl = signaturePad.toDataURL('image/png');
    } else {
        dataUrl = canvas.toDataURL('image/png');
    }

    if (!dataUrl || dataUrl.length < 100) {
        showToast("กรุณาวาดลายเซ็นก่อนกดยืนยัน", "warning");
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
    }
};

// =========================================================
// Document Preview & Print & Export
// =========================================================

window.closeDocumentPreview = function() {
    const modal = document.getElementById('modal-document-preview');
    if (modal) modal.classList.remove('active');
};

window.exportDocumentToPdf = async function() {
    const element = document.getElementById("document-print-area");
    const scaleWrapper = document.getElementById("doc-preview-scale-wrapper");
    if (!element) {
        showToast("ไม่พบข้อมูลเอกสาร", "error");
        return;
    }
    
    let studentNameStr = (window.currentPk11Student ? window.currentPk11Student.fullName : 'นักเรียน').replace(/\s+/g, '_');
    const fileName = `ป.ค.11_${studentNameStr}.pdf`;
    
    showToast("กำลังสร้างไฟล์ PDF กรุณารอสักครู่...", "info");
    setLoader(true);
    
    try {
        if (!window.html2canvas) {
            throw new Error("html2canvas ไม่พร้อมใช้งาน");
        }
        
        const jsPdfLib = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
        if (!jsPdfLib) {
            throw new Error("jsPDF ไม่พร้อมใช้งาน");
        }
        
        const prevTransform = scaleWrapper ? scaleWrapper.style.transform : '';
        if (scaleWrapper) {
            scaleWrapper.style.transform = 'none';
            scaleWrapper.style.margin = '0 auto';
        }
        
        const images = element.querySelectorAll('img');
        const imgPromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        });
        await Promise.all(imgPromises);
        await new Promise(r => setTimeout(r, 100));

        const canvas = await window.html2canvas(element, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        if (scaleWrapper) {
            scaleWrapper.style.transform = prevTransform;
        }
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPdfLib('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(fileName);
        showToast("ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว ⚡", "success");
    } catch (err) {
        console.error("PDF export error:", err);
        showToast("เกิดข้อผิดพลาดในการสร้าง PDF: " + err.message, "error");
    } finally {
        setLoader(false);
    }
};

window.printDocument = function() {
    const printContents = document.getElementById("document-print-area")?.innerHTML;
    if (!printContents) return;
    
    const printWrapper = document.createElement('div');
    printWrapper.className = 'print-only-wrapper';
    printWrapper.id = 'temporary-print-wrapper';
    printWrapper.innerHTML = printContents;
    document.body.appendChild(printWrapper);
    
    const cleanup = () => {
        const temp = document.getElementById('temporary-print-wrapper');
        if (temp) temp.remove();
        window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
        window.print();
        setTimeout(cleanup, 2500);
    }, 200);
};

// =========================================================
// Initialization
// =========================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Populate Time Selects
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

    // Student Search Setup
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
    
    // Teacher Search Setup (HR and SA)
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

    // Load initial data and records
    await loadPk11Records();
});
