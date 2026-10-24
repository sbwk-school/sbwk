/**
 * clean5s.js - ระบบบันทึกและประเมินความสะอาด 5ส. 15 ห้องเรียน (Standalone Module)
 * โรงเรียนซับบอนวิทยาคม
 */

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

let clean5sActiveYear = "2569";
let clean5sActiveTerm = "1";
let clean5sActiveAcademicTitle = "ภาคเรียนที่ 1 ปีการศึกษา 2569";

function updateClean5sAcademicHeaderUI() {
    clean5sActiveAcademicTitle = `ภาคเรียนที่ ${clean5sActiveTerm} ปีการศึกษา ${clean5sActiveYear}`;
    const termBadgeEl = document.getElementById("clean5s-term-text");
    if (termBadgeEl) {
        termBadgeEl.innerText = clean5sActiveAcademicTitle;
    }
}

window.syncClean5sAcademicSettings = async function(db) {
    // 1. ซิงค์จาก localStorage ก่อนเพื่อแสดงผลทันทีแบบ Zero-Delay
    let localYear = "";
    let localTerm = "";
    try {
        const saved = localStorage.getItem("sbwk_system_settings");
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.academic_year) localYear = String(parsed.academic_year);
            if (parsed.current_term) localTerm = String(parsed.current_term);
        }
    } catch (e) {
        console.warn("Could not read local academic settings in clean5s", e);
    }

    if (localYear) clean5sActiveYear = localYear;
    if (localTerm) clean5sActiveTerm = localTerm;
    updateClean5sAcademicHeaderUI();

    // 2. ซิงค์จาก Supabase Cloud (ตาราง academic_years แถวที่ is_current = true)
    if (db) {
        try {
            const { data, error } = await db.from('academic_years').select('*').eq('is_current', true).limit(1);
            if (!error && data && data.length > 0) {
                const actYear = data[0];
                clean5sActiveYear = String(actYear.year || clean5sActiveYear);

                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                const todayStr = `${yyyy}-${mm}-${dd}`;

                let computedTerm = "1";
                if (actYear.term2_start && actYear.term2_end && todayStr >= actYear.term2_start && todayStr <= actYear.term2_end) {
                    computedTerm = "2";
                }

                // หากมีการระบุใน admin settings ให้ยึดค่าที่ admin กำหนดไว้
                if (localTerm) {
                    computedTerm = localTerm;
                }

                clean5sActiveTerm = computedTerm;
                updateClean5sAcademicHeaderUI();
            }
        } catch (err) {
            console.warn("Could not sync academic_years in clean5s:", err);
        }
    }
};

let clean5sFlatpickrInstance = null;
let clean5sEvaluatedDatesSet = new Set();

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

    const db = getSupabase();
    await syncClean5sAcademicSettings(db);
    if (db) {
        try {
            const { data } = await db.from('std').select('grade, room, status');
            if (data && data.length > 0) {
                const roomSet = new Set();
                data.forEach(s => {
                    if (s.status === 'ออก') return;
                    if (!s.grade || !s.room) return;
                    const gNum = String(s.grade).replace(/[^0-9]/g, '');
                    const rNum = String(s.room).replace(/[^0-9]/g, '') || String(s.room).trim();
                    if (gNum && rNum) {
                        roomSet.add(`ม.${gNum}/${rNum}`);
                    }
                });

                if (roomSet.size > 0) {
                    const sortedRooms = Array.from(roomSet).sort((a, b) => {
                        const matchA = a.match(/ม\.(\d+)\/(\d+)/);
                        const matchB = b.match(/ม\.(\d+)\/(\d+)/);
                        if (matchA && matchB) {
                            const gA = parseInt(matchA[1], 10);
                            const gB = parseInt(matchB[1], 10);
                            if (gA !== gB) return gA - gB;
                            return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
                        }
                        return a.localeCompare(b, 'th');
                    });
                    clean5sRoomsArray = sortedRooms;
                    window.clean5sRoomsArray = clean5sRoomsArray;
                }
            }
        } catch (e) {
            console.warn("Could not load dynamic rooms, using default rooms list.", e);
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
            rClean: {}, swFan: {}, swBrd: {}, swTsh: {}, swChr: {}, classNotes: {},
            aClean: {}, swTls: {}, swLeaf: {}, swGarb: {}, serviceNotes: {},
            roomNotes: {}
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
                const cNote = (row.classroom_note || "").trim();
                existingData.classNotes[room] = cNote;
                if (cNote) existingData.roomNotes[room] = cNote;
            }
            if (isServSaved) {
                existingData.aClean[room] = row.a_clean;
                existingData.swTls[room]  = (row.sw_tls === -2);
                existingData.swLeaf[room] = (row.sw_leaf === -1 || (row.service_note && row.service_note.includes("[ไม่กวาดใบไม้]")));
                existingData.swGarb[room] = (row.sw_garb === -1 || (row.service_note && row.service_note.includes("[ไม่เก็บขยะ]")));

                let cleanServNote = (row.service_note || "").replace(/\[ไม่กวาดใบไม้\]/g, '').replace(/\[ไม่เก็บขยะ\]/g, '').trim();
                existingData.serviceNotes[room] = cleanServNote;

                if (cleanServNote) {
                    existingData.roomNotes[room] = existingData.roomNotes[room] 
                        ? `${existingData.roomNotes[room]} | ${cleanServNote}` 
                        : cleanServNote;
                }
            }
        });

        clean5sExistingData = existingData;

        const processedReport = processClean5sEvaluationsReport(allEvals, targetDate);
        clean5sCachedRawRecords = processedReport.rawRecords;
        window.clean5sCachedRawRecords = clean5sCachedRawRecords;

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
        const swLeaf = isServSaved ? (row.sw_leaf !== undefined && row.sw_leaf !== null ? (parseInt(row.sw_leaf, 10) || 0) : ((row.service_note && row.service_note.includes("[ไม่กวาดใบไม้]")) ? -1 : 0)) : 0;
        const swGarb = isServSaved ? (row.sw_garb !== undefined && row.sw_garb !== null ? (parseInt(row.sw_garb, 10) || 0) : ((row.service_note && row.service_note.includes("[ไม่เก็บขยะ]")) ? -1 : 0)) : 0;
        const assignTotal = isServSaved ? (aClean + swTls + swLeaf + swGarb) : 0;

        const classMissed = [];
        if (isClassSaved) {
            if (swFan === -2) classMissed.push("ไม่ปิดไฟ/พัดลม");
            if (swBrd === -1) classMissed.push("ไม่ลบกระดาน");
            if (swTsh === -1) classMissed.push("ไม่เทขยะ");
            if (swChr === -1) classMissed.push("ไม่เก็บเก้าอี้");
        }

        const servMissed = [];
        if (isServSaved) {
            if (swTls === -2) servMissed.push("ไม่เก็บอุปกรณ์");
            if (swLeaf === -1) servMissed.push("ไม่กวาดใบไม้");
            if (swGarb === -1) servMissed.push("ไม่เก็บขยะ");
        }

        const missedItems = [...classMissed, ...servMissed];

        let servNote = row.service_note || "";
        servNote = servNote.replace(/\[ไม่กวาดใบไม้\]/g, '').replace(/\[ไม่เก็บขยะ\]/g, '').trim();

        let classNote = (row.classroom_note || '').trim();

        let note = "";
        if (classNote && servNote) {
            note = `${classNote} | ${servNote}`;
        } else {
            note = classNote || servNote || "";
        }

        dateMap[dStr].rooms[room] = {
            roomName: room,
            isClassSaved: isClassSaved,
            isServSaved: isServSaved,
            roomScore: roomTotal,
            assignScore: assignTotal,
            totalScore: roomTotal + assignTotal,
            classMissed: classMissed,
            servMissed: servMissed,
            missedList: missedItems,
            classNote: classNote,
            servNote: servNote,
            note: note
        };
    });

    const rawRecords = [];
    let todayRecords = [];

    for (const dStr in dateMap) {
        const roomsDataList = Object.values(dateMap[dStr].rooms);
        if (roomsDataList.length > 0) {
            roomsDataList.sort((a, b) => {
                const matchA = (a.roomName || '').match(/ม\.(\d+)\/(\d+)/);
                const matchB = (b.roomName || '').match(/ม\.(\d+)\/(\d+)/);
                if (matchA && matchB) {
                    const gA = parseInt(matchA[1], 10);
                    const gB = parseInt(matchB[1], 10);
                    if (gA !== gB) return gA - gB;
                    return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
                }
                return (a.roomName || '').localeCompare(b.roomName || '', 'th');
            });

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
    optTerm.innerText = "รวม" + (clean5sActiveAcademicTitle || "ภาคเรียนที่ 1 ปีการศึกษา 2569");
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
        roomIncidentMap[room] = { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0, leaf: 0, garb: 0 };
        roomDaysMap[room] = { classDays: 0, servDays: 0, totalDays: 0 };
    });

    const activeRecords = (clean5sCachedRawRecords && clean5sCachedRawRecords.length > 0) ? clean5sCachedRawRecords : (window.clean5sCachedRawRecords || []);
    if (activeRecords && activeRecords.length > 0) {
        activeRecords.forEach(record => {
            if (filterMode !== "all" && record.monthKey !== filterMode) return;

            if (record.roomsData && Array.isArray(record.roomsData)) {
                record.roomsData.forEach(rData => {
                    const rName = (rData.roomName || '').trim();
                    if (summaryMap[rName] === undefined) {
                        summaryMap[rName] = 0;
                        roomIncidentMap[rName] = { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0, leaf: 0, garb: 0 };
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
                            else if (str.includes("เทขยะ")) roomIncidentMap[rName].tsh++;
                            else if (str.includes("เก้าอี้")) roomIncidentMap[rName].chr++;
                            else if (str.includes("อุปกรณ์") || str.includes("เก็บของ")) roomIncidentMap[rName].tls++;
                            else if (str.includes("ใบไม้")) roomIncidentMap[rName].leaf++;
                            else if (str.includes("เก็บขยะ")) roomIncidentMap[rName].garb++;
                            else if (str.includes("ขยะ")) roomIncidentMap[rName].tsh++;
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
            stat: roomIncidentMap[room] || { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0, leaf: 0, garb: 0 },
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
        const currentStatObj = currentRoomObj ? currentRoomObj.stat : { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0, leaf: 0, garb: 0 };
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
                            <span class="sc-badge-circle ${currentStatObj.leaf > 0 ? 'circle-orange' : 'circle-grey'}">🍂</span>
                            <span class="sc-badge-label">ไม่กวาดใบไม้ (<span class="sum-orange-num">${currentStatObj.leaf}</span>)</span>
                        </div>
                        <div class="sc-badge-unit">
                            <span class="sc-badge-circle ${currentStatObj.garb > 0 ? 'circle-orange' : 'circle-grey'}">🚮</span>
                            <span class="sc-badge-label">ไม่เก็บขยะ (<span class="sum-orange-num">${currentStatObj.garb}</span>)</span>
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
            if (noteEl) noteEl.value = (clean5sExistingData.classNotes && clean5sExistingData.classNotes[room] !== undefined) ? clean5sExistingData.classNotes[room] : (clean5sExistingData.roomNotes[room] || "");
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
            
            <div class="clean5s-switch-grid">
                <div style="grid-column: span 2;">
                    <input type="checkbox" id="clean5s_sw_tls_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_tls_${room}">🧹 ไม่เก็บอุปกรณ์ (-2)</label>
                </div>
                <div>
                    <input type="checkbox" id="clean5s_sw_leaf_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_leaf_${room}">🍂 ไม่กวาดใบไม้ (-1)</label>
                </div>
                <div>
                    <input type="checkbox" id="clean5s_sw_garb_${room}">
                    <label class="clean5s-switch-btn" for="clean5s_sw_garb_${room}">🗑️ ไม่เก็บขยะ (-1)</label>
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

            const swTlsEl  = document.getElementById(`clean5s_sw_tls_${room}`);
            const swLeafEl = document.getElementById(`clean5s_sw_leaf_${room}`);
            const swGarbEl = document.getElementById(`clean5s_sw_garb_${room}`);
            const noteEl   = document.getElementById(`clean5s_note_service_${room}`);

            if (swTlsEl) swTlsEl.checked   = (clean5sExistingData.swTls && clean5sExistingData.swTls[room] === true);
            if (swLeafEl) swLeafEl.checked = (clean5sExistingData.swLeaf && clean5sExistingData.swLeaf[room] === true);
            if (swGarbEl) swGarbEl.checked = (clean5sExistingData.swGarb && clean5sExistingData.swGarb[room] === true);
            if (noteEl) noteEl.value = (clean5sExistingData.serviceNotes && clean5sExistingData.serviceNotes[room] !== undefined) ? clean5sExistingData.serviceNotes[room] : "";
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

            const roomScoreNum = parseInt(item.roomScore, 10) || 0;
            const assignScoreNum = parseInt(item.assignScore, 10) || 0;
            const totalScoreNum = parseInt(item.totalScore, 10) || (roomScoreNum + assignScoreNum);

            let scoreColorClass = "score-total-med";
            if (totalScoreNum >= 8) {
                scoreColorClass = "score-total-high";
            } else if (totalScoreNum < 5) {
                scoreColorClass = "score-total-low";
            }

            // Subcard 1: ห้องเรียน
            let classContentHtml = "";
            let classScorePill = "";
            if (item.isClassSaved) {
                classScorePill = `<span class="compact-score-pill score-pill-main">${roomScoreNum} คะแนน</span>`;
                if (item.classMissed && item.classMissed.length > 0) {
                    classContentHtml = `<div class="missed-badge-box">` + 
                        item.classMissed.map(m => `<span class="missed-item-pill">❌ ${escapeClean5sHtml(m)}</span>`).join('') + 
                        `</div>`;
                } else {
                    classContentHtml = `<div class="subcard-clean-pass">✨ สะอาดเรียบร้อย</div>`;
                }
            } else {
                classScorePill = `<span class="compact-score-pill subcard-pill-unsaved">ยังไม่บันทึก</span>`;
                classContentHtml = `<div class="subcard-unsaved-text">⏳ ยังไม่มีการตรวจห้อง</div>`;
            }
            if (item.classNote) {
                classContentHtml += `<div class="subcard-note"><i class="fa-solid fa-pen-clip"></i> ${escapeClean5sHtml(item.classNote)}</div>`;
            }

            // Subcard 2: เขตบริการ
            let servContentHtml = "";
            let servScorePill = "";
            if (item.isServSaved) {
                servScorePill = `<span class="compact-score-pill score-pill-sub">${assignScoreNum} คะแนน</span>`;
                if (item.servMissed && item.servMissed.length > 0) {
                    servContentHtml = `<div class="missed-badge-box">` + 
                        item.servMissed.map(m => `<span class="missed-item-pill">❌ ${escapeClean5sHtml(m)}</span>`).join('') + 
                        `</div>`;
                } else {
                    servContentHtml = `<div class="subcard-clean-pass">✨ สะอาดเรียบร้อย</div>`;
                }
            } else {
                servScorePill = `<span class="compact-score-pill subcard-pill-unsaved">ยังไม่บันทึก</span>`;
                servContentHtml = `<div class="subcard-unsaved-text">⏳ ยังไม่มีการตรวจเขต</div>`;
            }
            if (item.servNote) {
                servContentHtml += `<div class="subcard-note"><i class="fa-solid fa-pen-clip"></i> ${escapeClean5sHtml(item.servNote)}</div>`;
            }

            cardBox.innerHTML = `
                <div class="daily-card-top-header">
                    <div class="daily-room-title">
                        <span class="daily-room-badge"><i class="fa-solid fa-school"></i></span>
                        <span>ห้อง ${escapeClean5sHtml(item.roomName)}</span>
                    </div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <span class="score-pill-total-large ${scoreColorClass}">รวม: ${totalScoreNum} คะแนน</span>
                    </div>
                </div>

                <div class="daily-subcard-grid">
                    <div class="daily-subcard subcard-classroom ${item.isClassSaved ? '' : 'subcard-unsaved'}">
                        <div class="subcard-header">
                            <div class="subcard-title">
                                <i class="fa-solid fa-chalkboard-user"></i> ในห้องเรียน
                            </div>
                            ${classScorePill}
                        </div>
                        <div class="subcard-body">
                            ${classContentHtml}
                        </div>
                    </div>

                    <div class="daily-subcard subcard-service ${item.isServSaved ? '' : 'subcard-unsaved'}">
                        <div class="subcard-header">
                            <div class="subcard-title">
                                <i class="fa-solid fa-broom"></i> เขตบริการ
                            </div>
                            ${servScorePill}
                        </div>
                        <div class="subcard-body">
                            ${servContentHtml}
                        </div>
                    </div>
                </div>
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
                const swLeaf = document.getElementById(`clean5s_sw_leaf_${roomName}`)?.checked ? -1 : 0;
                const swGarb = document.getElementById(`clean5s_sw_garb_${roomName}`)?.checked ? -1 : 0;
                const note   = document.getElementById(`clean5s_note_service_${roomName}`)?.value.trim() || "";

                // Embed tags in service_note as fallback if database doesn't have sw_leaf / sw_garb columns yet
                const tags = [];
                if (swLeaf === -1) tags.push("[ไม่กวาดใบไม้]");
                if (swGarb === -1) tags.push("[ไม่เก็บขยะ]");
                let serviceNoteWithTags = note;
                if (tags.length > 0) {
                    serviceNoteWithTags = serviceNoteWithTags ? `${serviceNoteWithTags} ${tags.join(" ")}` : tags.join(" ");
                }

                recordsToUpsert.push({
                    eval_date: clean5sSelectedDate,
                    room_name: roomName,
                    a_clean: aClean,
                    sw_tls: swTls,
                    sw_leaf: swLeaf,
                    sw_garb: swGarb,
                    service_note: serviceNoteWithTags,
                    is_service_saved: true
                });
            }
        });

        let { data, error } = await db.from('evaluations').upsert(recordsToUpsert, { onConflict: 'eval_date,room_name' });

        if (error && (error.code === 'PGRST204' || (error.message && (error.message.includes('sw_leaf') || error.message.includes('sw_garb'))))) {
            console.warn("Retrying evaluations upsert without new columns (saving via service_note tags)...", error);
            const fallbackRecords = recordsToUpsert.map(r => {
                const copy = { ...r };
                delete copy.sw_leaf;
                delete copy.sw_garb;
                return copy;
            });
            const retryRes = await db.from('evaluations').upsert(fallbackRecords, { onConflict: 'eval_date,room_name' });
            error = retryRes.error;
        }

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
            const currentStatObj = currentRoomObj ? currentRoomObj.stat : { fan: 0, brd: 0, tsh: 0, chr: 0, tls: 0, leaf: 0, garb: 0 };

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
                        <span class="sc-badge-circle ${currentStatObj.leaf > 0 ? 'circle-orange' : 'circle-grey'}">🍂</span>
                        <span class="sc-badge-label">ไม่กวาดใบไม้ (<span class="sum-orange-num">${currentStatObj.leaf}</span>)</span>
                    </div>
                    <div class="sc-badge-unit">
                        <span class="sc-badge-circle ${currentStatObj.garb > 0 ? 'circle-orange' : 'circle-grey'}">🚮</span>
                        <span class="sc-badge-label">ไม่เก็บขยะ (<span class="sum-orange-num">${currentStatObj.garb}</span>)</span>
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
