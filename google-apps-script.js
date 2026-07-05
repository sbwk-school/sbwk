/**
 * Google Apps Script - ระบบเช็คชื่อนักเรียนออนไลน์ (เวอร์ชันคอลัมน์ความเร็วสูง - ป้องกันคอลัมน์วันที่ซ้ำซ้อน)
 * คัดลอกโค้ดนี้ทั้งหมดไปวางในเมนู Extensions -> Apps Script ของ Google Sheet ของคุณ
 */

// ชื่อชีทต่าง ๆ ในระบบ
const SHEETS = {
  HOLIDAYS: "วันหยุด",
  USERS: "ผู้ใช้งาน",
  MISCONDUCT: "บันทึกความประพฤติ",
  ATTENDANCE: "บันทึกเวลาเรียน"
};

/**
 * ฟังก์ชันเริ่มต้นระบบ: ตรวจสอบและสร้างชีทที่จำเป็นหากยังไม่มี
 */
function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ชีทวันหยุด
  if (!ss.getSheetByName(SHEETS.HOLIDAYS)) {
    const sheet = ss.insertSheet(SHEETS.HOLIDAYS);
    sheet.appendRow(["วันที่", "ชื่อวันหยุด"]);
    sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#efebe9");
  }
  
  // 2. ชีทผู้ใช้งาน
  if (!ss.getSheetByName(SHEETS.USERS)) {
    const sheet = ss.insertSheet(SHEETS.USERS);
    sheet.appendRow(["ชื่อ", "รหัสครู", "PIN", "บทบาท"]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#e3f2fd");
    // สร้าง Admin เริ่มต้น
    sheet.appendRow(["Admin", "9999", "9999", "ADMIN"]);
  }
  
  // 3. ชีทบันทึกความประพฤติ
  if (!ss.getSheetByName(SHEETS.MISCONDUCT)) {
    const sheet = ss.insertSheet(SHEETS.MISCONDUCT);
    sheet.appendRow(["ID", "วันที่", "เลขประจำตัว", "ชื่อ-สกุล", "ชั้น", "ห้อง", "รายละเอียดการทำผิด", "สถานะการแก้ไข", "ผู้บันทึก", "เวลาบันทึก"]);
    sheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#ffebee");
  }

  // 4. ชีทบันทึกเวลาเรียน
  if (!ss.getSheetByName(SHEETS.ATTENDANCE)) {
    const sheet = ss.insertSheet(SHEETS.ATTENDANCE);
    sheet.appendRow(["เลขประจำตัว"]);
    sheet.getRange(1, 1).setFontWeight("bold").setBackground("#ffe082").setHorizontalAlignment("center");
    
    // ก๊อปปี้เลขประจำตัวนักเรียนทั้งหมดจากชีทแรก (รายชื่อนักเรียน) มาใส่ในคอลัมน์แรก
    const studentSheet = ss.getSheets()[0];
    const lastRow = studentSheet.getLastRow();
    if (lastRow > 1) {
      const studentIds = studentSheet.getRange(2, 2, lastRow - 1, 1).getValues();
      sheet.getRange(2, 1, lastRow - 1, 1).setValues(studentIds);
    }
  }
}

/**
 * ตอบกลับสำหรับการเรียกแบบ GET
 */
function doGet(e) {
  initDatabase();
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    if (action === "init") {
      const dateParam = e.parameter.date || formatDate(new Date());
      const students = getStudentsList(ss);
      const holidays = getHolidays(ss);
      const users = getUsers(ss);
      const todayLogs = getAttendanceSummaryForDate(ss, dateParam);
      const todayLogsDetails = getAttendanceDetailsForDate(ss, dateParam);
      
      return jsonResponse({
        success: true,
        students: students,
        holidays: holidays,
        users: users,
        todayLogs: todayLogs,
        todayLogsDetails: todayLogsDetails
      });
    }
    
    if (action === "getStats") {
      const month = e.parameter.month; // "YYYY-MM" หรือ "ALL"
      const room = e.parameter.room;   // "ม.1/1" หรือ "ALL"
      const stats = getAttendanceStats(ss, month, room);
      return jsonResponse({ success: true, stats: stats });
    }
    
    if (action === "getMisconducts") {
      const misconducts = getMisconductLogs(ss);
      return jsonResponse({ success: true, misconducts: misconducts });
    }
    
    return jsonResponse({ success: false, message: "ไม่พบ Action ที่ระบุ" });
  } catch (error) {
    return jsonResponse({ success: false, message: error.toString() });
  }
}

/**
 * ตอบกลับสำหรับการเรียกแบบ POST
 */
function doPost(e) {
  initDatabase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, message: "รูปแบบข้อมูล JSON ไม่ถูกต้อง" });
  }
  
  const action = data.action;
  const pin = data.pin;
  
  try {
    // การลงทะเบียนครูอนุญาตให้ทำได้โดยตรง โดยผู้ใช้เลือกชื่อและรหัสแล้วบันทึกได้ทันที
    if (action === "registerUser") {
      registerNewUser(ss, data.name, data.code, data.newPin, data.role);
      return jsonResponse({ success: true, message: "ลงทะเบียนผู้ใช้สำเร็จ" });
    }
    
    // การทำรายการอื่น ๆ ต้องยืนยันสิทธิ์ PIN แอดมิน/ครู
    const auth = verifyPin(ss, pin);
    if (!auth.success) {
      return jsonResponse({ success: false, message: "รหัส PIN ไม่ถูกต้อง" });
    }
    
    const userRole = auth.role;
    const userName = auth.name;
    
    if (action === "saveAttendance") {
      saveAttendanceRecords(ss, data.date, data.grade, data.room, data.records, userName);
      return jsonResponse({ success: true, message: "บันทึกการเช็คชื่อสำเร็จ" });
    }
    
    if (action === "addHoliday" || action === "deleteHoliday") {
      if (userRole !== "ADMIN") {
        return jsonResponse({ success: false, message: "ไม่มีสิทธิ์ในการจัดการวันหยุด (ต้องเป็น Admin เท่านั้น)" });
      }
      
      if (action === "addHoliday") {
        addHolidayRecord(ss, data.date, data.name);
        return jsonResponse({ success: true, message: "เพิ่มวันหยุดสำเร็จ" });
      } else {
        deleteHolidayRecord(ss, data.date);
        return jsonResponse({ success: true, message: "ลบวันหยุดสำเร็จ" });
      }
    }
    
    // จัดการบทบาทครูและการลบครูผู้ใช้ (แอดมินเท่านั้น)
    if (action === "updateUserRole" || action === "updateAllUserRoles" || action === "deleteUser") {
      if (userRole !== "ADMIN") {
        return jsonResponse({ success: false, message: "ไม่มีสิทธิ์ในการจัดการข้อมูลครู (ต้องเป็น Admin เท่านั้น)" });
      }
      if (action === "updateAllUserRoles") {
        updateAllUserRolesInSheet(ss, data.updates);
        return jsonResponse({ success: true, message: "บันทึกข้อมูลครูทั้งหมดสำเร็จ" });
      } else if (action === "updateUserRole") {
        updateUserRoleInSheet(ss, data.name, data.newRole);
        return jsonResponse({ success: true, message: "อัปเดตบทบาทสำเร็จ" });
      } else {
        deleteUserFromSheet(ss, data.name);
        return jsonResponse({ success: true, message: "ลบผู้ใช้สำเร็จ" });
      }
    }
    
    if (action === "saveMisconduct") {
      saveMisconductRecord(ss, data.date, data.studentId, data.studentName, data.grade, data.room, data.description, userName);
      return jsonResponse({ success: true, message: "บันทึกข้อมูลความประพฤติสำเร็จ" });
    }
    
    if (action === "toggleMisconductResolved") {
      if (userRole !== "ADMIN" && userRole !== "STUDENT_AFFAIRS") {
        return jsonResponse({ success: false, message: "ไม่มีสิทธิ์จัดการบันทึก (เฉพาะครูกิจการและแอดมิน)" });
      }
      toggleMisconductResolvedRecord(ss, data.id, data.resolved, data.resolutionText, userName);
      return jsonResponse({ success: true, message: "อัปเดตสถานะความประพฤติสำเร็จ" });
    }
    
    if (action === "verifyPinOnly") {
      return jsonResponse({ success: true, name: userName, role: userRole });
    }
    
    return jsonResponse({ success: false, message: "ไม่พบ Action หรือไม่มีสิทธิ์เข้าถึง" });
  } catch (error) {
    return jsonResponse({ success: false, message: error.toString() });
  }
}

/**
 * จัดการคืนค่าผลลัพธ์เป็น JSON พร้อมแก้ปัญหา CORS
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ดึงรายชื่อนักเรียนจากชีทแรก (รายชื่อ)
 */
function getStudentsList(ss) {
  const sheet = ss.getSheets()[0]; 
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  // ดึงข้อมูลเฉพาะช่วง A-I (คอลัมน์ 1 ถึง 9) เพื่อป้องกันการขยายตัวความเร็ว
  const rows = sheet.getRange(1, 1, lastRow, 9).getValues();
  const list = [];
  
  for (let i = 1; i < rows.length; i++) {
    const studentId = String(rows[i][1]).trim();
    if (!studentId || rows[i][0] === "") continue;
    
    list.push({
      no: parseInt(rows[i][0]) || 0,
      studentId: studentId,
      grade: String(rows[i][2]).trim(),
      room: String(rows[i][3]).trim(),
      gender: String(rows[i][4]).trim(),
      prefix: String(rows[i][5]).trim(),
      firstName: String(rows[i][6]).trim(),
      lastName: String(rows[i][7]).trim(),
      fullName: String(rows[i][8]).trim()
    });
  }
  return list;
}

/**
 * แปลงฟอร์แมตหัวตารางวันที่ต่าง ๆ เป็น YYYY-MM-DD แบบเป็นมาตรฐานเดียวกัน
 */
function normalizeHeaderDate(cellValue) {
  if (cellValue instanceof Date) {
    return formatDate(cellValue);
  }
  const str = String(cellValue).trim();
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return str;
  }
  // ทดลอง Parse สตริงทั่วไปเป็นวันที่
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }
  return str;
}

/**
 * ฟังก์ชันช่วยค้นหาคอลัมน์ของชีทผู้ใช้งาน โดยอิงตามชื่อหัวคอลัมน์ (ยืดหยุ่นสูง)
 */
function getUserSheetMapping(headers) {
  let nameIdx = 0;
  let codeIdx = -1;
  let pinIdx = -1;
  let roleIdx = -1;
  
  for (let j = 0; j < headers.length; j++) {
    const h = String(headers[j]).trim().toUpperCase();
    if (h.includes("ชื่อ") || h.includes("NAME")) nameIdx = j;
    else if (h.includes("รหัสครู") || h.includes("รหัสประจำตัว") || h === "รหัส" || h.includes("CODE")) codeIdx = j;
    else if (h.includes("PIN") || h.includes("พิน") || h.includes("รหัสผ่าน")) pinIdx = j;
    else if (h.includes("บทบาท") || h.includes("สิทธิ์") || h.includes("สถานะ") || h.includes("ตำแหน่ง") || h.includes("ROLE") || h.includes("STATUS")) roleIdx = j;
  }
  
  return { nameIdx, codeIdx, pinIdx, roleIdx };
}

/**
 * ตรวจสอบรหัส PIN 4 หลัก (แบบสแกนหัวคอลัมน์อัตโนมัติ)
 */
function verifyPin(ss, pin) {
  if (!pin) return { success: false };
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getDisplayValues();
  if (rows.length === 0) return { success: false };
  
  const mapping = getUserSheetMapping(rows[0]);
  
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][mapping.pinIdx]).trim() === String(pin).trim()) {
      return { success: true, name: rows[i][mapping.nameIdx], role: rows[i][mapping.roleIdx] };
    }
  }
  return { success: false };
}

/**
 * ดึงรายการวันหยุดทั้งหมด
 */
function getHolidays(ss) {
  const sheet = ss.getSheetByName(SHEETS.HOLIDAYS);
  const rows = sheet.getDataRange().getDisplayValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      list.push({
        date: String(rows[i][0]).trim(),
        name: rows[i][1]
      });
    }
  }
  return list;
}

/**
 * ดึงรายการชื่อครูทั้งหมด (แบบสแกนหัวคอลัมน์อัตโนมัติ)
 */
function getUsers(ss) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getDisplayValues();
  const list = [];
  if (rows.length === 0) return [];
  
  const mapping = getUserSheetMapping(rows[0]);
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][mapping.nameIdx]) {
      const codeVal = mapping.codeIdx !== -1 ? rows[i][mapping.codeIdx] : "";
      let roleVal = mapping.roleIdx !== -1 ? String(rows[i][mapping.roleIdx]).trim().toUpperCase() : "TEACHER";
      const pinVal = mapping.pinIdx !== -1 ? rows[i][mapping.pinIdx] : "";
      
      // Normalize role
      let normalizedRole = "TEACHER";
      if (roleVal.includes("ADMIN") || roleVal.includes("แอดมิน") || roleVal.includes("ผู้ดูแล") || roleVal === "A") {
        normalizedRole = "ADMIN";
      } else if (roleVal.includes("AFFAIR") || roleVal.includes("กิจการ") || roleVal.includes("ปกครอง") || roleVal.includes("ฝ่าย") || roleVal === "SA") {
        normalizedRole = "STUDENT_AFFAIRS";
      }
      
      list.push({
        name: rows[i][mapping.nameIdx],
        code: codeVal,
        role: normalizedRole,
        pin: pinVal, 
        hasPin: pinVal !== ""
      });
    }
  }
  return list;
}

/**
 * ค้นหาคอลัมน์ของวันที่ต้องการเช็คชื่อ (เปรียบเทียบจากวันที่ที่แปลงมาตรฐานแล้ว เริ่มต้นหาตั้งแต่คอลัมน์ที่ 2)
 */
function findDateColumnIndex(sheet, dateStr, headersRaw) {
  for (let j = 1; j < headersRaw.length; j++) {
    if (normalizeHeaderDate(headersRaw[j]) === dateStr) {
      return j + 1; // 1-based index
    }
  }
  
  // หากไม่พบ ให้สร้างคอลัมน์ใหม่ที่ท้ายตาราง บังคับเซฟเป็น Plain text เพื่อกันระบบจัดฟอร์แมตผิดเพี้ยน
  const newColIdx = headersRaw.length + 1;
  sheet.getRange(1, newColIdx).setValue("'" + dateStr)
    .setFontWeight("bold")
    .setBackground("#ffe082")
    .setHorizontalAlignment("center");
  return newColIdx;
}

/**
 * ดึงสถานะการเข้าเรียนรายบุคคลตามวันที่ระบุ (ดึงจากชีท "บันทึกเวลาเรียน")
 */
function getAttendanceDetailsForDate(ss, dateStr) {
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  if (!sheet) return {};
  
  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastCol < 2 || lastRow < 2) return {};
  
  const headersRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  let dateColIdx = -1;
  for (let j = 1; j < headersRaw.length; j++) {
    if (normalizeHeaderDate(headersRaw[j]) === dateStr) {
      dateColIdx = j + 1; // getRange uses 1-based index
      break;
    }
  }
  
  const details = {};
  if (dateColIdx !== -1) {
    // โหลดเฉพาะคอลัมน์รหัส (A) และคอลัมน์สถานะของวันนั้น (แทนการโหลดทั้งตาราง) เพื่อความเร็วสูงสุด
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const statuses = sheet.getRange(2, dateColIdx, lastRow - 1, 1).getValues();
    
    for (let i = 0; i < ids.length; i++) {
      const studentId = String(ids[i][0]).trim();
      const status = String(statuses[i][0]).trim();
      if (studentId && status) {
        details[studentId] = status;
      }
    }
  }
  return details;
}

/**
 * ดึงสรุปผลสถิติเช็คชื่อตามวันที่ระบุเพื่อนำไปสรุปการ์ดห้องหน้าแรก (แบบคำนวณและ Map ผ่าน JS)
 */
function getAttendanceSummaryForDate(ss, dateStr) {
  const students = getStudentsList(ss);
  const details = getAttendanceDetailsForDate(ss, dateStr);
  
  const summaries = {};
  
  students.forEach(s => {
    const status = details[s.studentId];
    if (status) {
      const key = `${s.grade}/${s.room}`;
      if (!summaries[key]) {
        summaries[key] = { Present: 0, Leave: 0, Absent: 0, Late: 0, Cut: 0, Total: 0 };
      }
      
      summaries[key].Total++;
      if (status === "มา") summaries[key].Present++;
      else if (status === "ลา") summaries[key].Leave++;
      else if (status === "ขาด") summaries[key].Absent++;
      else if (status === "สาย") summaries[key].Late++;
      else if (status === "โดด") summaries[key].Cut++;
    }
  });
  
  return summaries;
}

/**
 * ดึงสถิติตามเดือนและห้องเรียนย้อนหลัง (คัดกรองจากแนวคอลัมน์วันที่)
 */
function getAttendanceStats(ss, month, targetRoom) {
  const studentSheet = ss.getSheets()[0];
  const studentsRows = studentSheet.getRange(1, 1, studentSheet.getLastRow(), 9).getValues();
  
  // สร้างแผนที่ข้อมูลเด็กเพื่อความเร็วในการค้นหา
  const studentMap = {};
  for (let i = 1; i < studentsRows.length; i++) {
    const studentId = String(studentsRows[i][1]).trim();
    if (studentId && studentsRows[i][0] !== "") {
      studentMap[studentId] = {
        name: studentsRows[i][8],
        grade: studentsRows[i][2],
        room: studentsRows[i][3],
        fullRoom: `${studentsRows[i][2]}/${studentsRows[i][3]}`
      };
    }
  }
  
  const attSheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  if (!attSheet) {
    return { logs: [], dates: [], availableMonths: [] };
  }
  
  const lastCol = attSheet.getLastColumn();
  if (lastCol < 2) {
    return { logs: [], dates: [], availableMonths: [] };
  }
  
  const headersRaw = attSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const attRows = attSheet.getDataRange().getValues();
  
  const logs = [];
  const dates = new Set();
  const allMonths = new Set();
  
  const dateColumns = [];
  for (let j = 1; j < headersRaw.length; j++) {
    const headerNorm = normalizeHeaderDate(headersRaw[j]);
    if (headerNorm.match(/^\d{4}-\d{2}-\d{2}$/)) {
      allMonths.add(headerNorm.substring(0, 7));
      
      const logMonth = headerNorm.substring(0, 7);
      if (month === "ALL" || logMonth === month) {
        dateColumns.push({ colIdx: j, date: headerNorm });
        dates.add(headerNorm);
      }
    }
  }
  
  for (let i = 1; i < attRows.length; i++) {
    const studentId = String(attRows[i][0]).trim();
    if (!studentId) continue;
    
    const info = studentMap[studentId];
    if (!info) continue;
    
    if (targetRoom !== "ALL" && info.fullRoom !== targetRoom) continue;
    
    dateColumns.forEach(col => {
      const status = attRows[i][col.colIdx].trim();
      if (status) {
        logs.push({
          date: col.date,
          studentId: studentId,
          name: info.name,
          room: info.fullRoom,
          status: status
        });
      }
    });
  }
  
  return {
    logs: logs,
    dates: Array.from(dates).sort(),
    availableMonths: Array.from(allMonths).sort().reverse()
  };
}

/**
 * ดึงบันทึกความประพฤติทั้งหมด
 */
function getMisconductLogs(ss) {
  const sheet = ss.getSheetByName(SHEETS.MISCONDUCT);
  const rows = sheet.getDataRange().getDisplayValues();
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      list.push({
        id: rows[i][0],
        date: String(rows[i][1]).trim(),
        studentId: String(rows[i][2]).trim(),
        name: rows[i][3],
        grade: rows[i][4],
        room: rows[i][5],
        description: rows[i][6],
        resolved: rows[i][7] === "แก้ไขแล้ว",
        recorder: rows[i][8],
        timestamp: rows[i][9],
        resolution: rows[i][10] || ""
      });
    }
  }
  return list.reverse();
}

/**
 * บันทึกการเช็คชื่อความเร็วสูง (อัปเดตลงคอลัมน์วันที่แบบแบทช์)
 */
function saveAttendanceRecords(ss, dateStr, grade, room, records, teacher) {
  // เปิดระบบล็อกเพื่อป้องกันปัญหาครูเซฟพร้อมกันแล้วข้อมูลหาย
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // รอสูงสุด 15 วินาที
    
    const attSheet = ss.getSheetByName(SHEETS.ATTENDANCE);
    const lastRow = attSheet.getLastRow();
    const lastCol = attSheet.getLastColumn();
    
    // ดึงหัวตารางของชีทเช็คชื่อ
    const headersRaw = lastCol > 0 ? attSheet.getRange(1, 1, 1, lastCol).getValues()[0] : ["เลขประจำตัว"];
    const colIdx = findDateColumnIndex(attSheet, dateStr, headersRaw);
    
    // ดึงรหัสเด็กทั้งหมดที่มีในชีทเช็คชื่อปัจจุบัน (ใช้ getDisplayValues ป้องกันเลขนัยสำคัญและเลขศูนย์นำหน้าหาย)
    const attIdsRange = attSheet.getRange(1, 1, lastRow, 1);
    const attIds = attIdsRange.getDisplayValues().map(r => String(r[0]).trim());
    
    // ดึงสถานะเดิมในคอลัมน์วันที่นี้
    const colRange = attSheet.getRange(1, colIdx, lastRow, 1);
    const colValues = colRange.getValues();
    
    const recordMap = {};
    records.forEach(r => {
      recordMap[String(r.studentId).trim()] = r.status;
    });
    
    // วนลูปเช็คสถานะเด็กที่มีอยู่ในคอลัมน์
    for (let i = 1; i < attIds.length; i++) {
      const studentId = attIds[i];
      if (recordMap[studentId] !== undefined) {
        colValues[i][0] = recordMap[studentId];
        delete recordMap[studentId]; // ลบออกจากรายการเพื่อดูตัวตกหล่น (เด็กใหม่)
      }
    }
    
    // จัดการเขียนค่ากลับ
    colRange.setValues(colValues);
    
    // กรณีมีเด็กที่ย้ายมาใหม่และไม่มีรหัสในชีทเช็คชื่อนี้ (ให้ append ต่อท้ายและเช็คชื่อ)
    const remainingIds = Object.keys(recordMap);
    if (remainingIds.length > 0) {
      // ใช้ setValues แทน appendRow ในลูปเพื่อเพิ่มความเร็วและป้องกัน Timeout
      const newRowsData = remainingIds.map(id => [id]);
      attSheet.getRange(lastRow + 1, 1, newRowsData.length, 1).setValues(newRowsData);
      
      // ดึงคอลัมน์ใหม่อีกครั้งหลังขยายแถว
      const newLastRow = lastRow + remainingIds.length;
      const updatedColRange = attSheet.getRange(1, colIdx, newLastRow, 1);
      const updatedColValues = updatedColRange.getValues();
      
      // ดึงรายชื่ออัปเดตใหม่ทั้งหมด
      const updatedAttIdsRange = attSheet.getRange(1, 1, newLastRow, 1);
      const updatedAttIds = updatedAttIdsRange.getDisplayValues().map(r => String(r[0]).trim());
      
      for (let i = attIds.length; i < updatedAttIds.length; i++) {
        const studentId = updatedAttIds[i];
        if (recordMap[studentId] !== undefined) {
          updatedColValues[i][0] = recordMap[studentId];
        }
      }
      updatedColRange.setValues(updatedColValues);
    }
    
  } finally {
    // ปลดล็อกระบบเพื่อให้เครื่องถัดไปทำต่อได้
    lock.releaseLock();
  }
}

/**
 * สมัครสมาชิกลงทะเบียน PIN ให้ครูผู้ใช้
 */
function registerNewUser(ss, name, code, pin, role) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const range = sheet.getDataRange();
  const rows = range.getDisplayValues();
  
  let mapping = getUserSheetMapping(rows[0]);
  
  // สร้างคอลัมน์ถ้ายังไม่มี
  let headersUpdated = false;
  let currentHeaders = [...rows[0]];
  
  if (mapping.codeIdx === -1) {
    currentHeaders.push("รหัสครู");
    mapping.codeIdx = currentHeaders.length - 1;
    headersUpdated = true;
  }
  if (mapping.roleIdx === -1) {
    currentHeaders.push("บทบาท");
    mapping.roleIdx = currentHeaders.length - 1;
    headersUpdated = true;
  }
  
  if (headersUpdated) {
    sheet.getRange(1, 1, 1, currentHeaders.length).setValues([currentHeaders]);
  }
  
  let existingRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][mapping.nameIdx] === name) {
      existingRow = i + 1;
      break;
    }
  }
  
  if (existingRow !== -1) {
    sheet.getRange(existingRow, mapping.codeIdx + 1).setValue(code);
    sheet.getRange(existingRow, mapping.pinIdx + 1).setValue(pin);
    
    const currentRole = sheet.getRange(existingRow, mapping.roleIdx + 1).getValue();
    if (!currentRole || String(currentRole).trim() === "") {
      sheet.getRange(existingRow, mapping.roleIdx + 1).setValue(role);
    }
  } else {
    const newRowData = new Array(currentHeaders.length).fill("");
    newRowData[mapping.nameIdx] = name;
    newRowData[mapping.codeIdx] = code;
    newRowData[mapping.pinIdx] = pin;
    newRowData[mapping.roleIdx] = role;
    
    sheet.appendRow(newRowData);
  }
}

/**
 * เพิ่มวันหยุด
 */
function addHolidayRecord(ss, dateStr, name) {
  const sheet = ss.getSheetByName(SHEETS.HOLIDAYS);
  const rows = sheet.getDataRange().getDisplayValues();
  
  for (let i = 1; i < rows.length; i++) {
    const rowDate = String(rows[i][0]).trim();
    if (rowDate === dateStr) {
      sheet.getRange(i + 1, 2).setValue(name);
      return;
    }
  }
  sheet.appendRow([dateStr, name]);
}

/**
 * ลบวันหยุด
 */
function deleteHolidayRecord(ss, dateStr) {
  const sheet = ss.getSheetByName(SHEETS.HOLIDAYS);
  const rows = sheet.getDataRange().getDisplayValues();
  
  for (let i = rows.length - 1; i >= 1; i--) {
    const rowDate = String(rows[i][0]).trim();
    if (rowDate === dateStr) {
      sheet.deleteRow(i + 1);
    }
  }
}

/**
 * บันทึกความประพฤติ
 */
function saveMisconductRecord(ss, dateStr, studentId, studentName, grade, room, description, teacher) {
  const sheet = ss.getSheetByName(SHEETS.MISCONDUCT);
  const id = "MC-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
  const timestamp = new Date();
  
  sheet.appendRow([id, dateStr, studentId, studentName, grade, room, description, "ยังไม่แก้ไข", teacher, timestamp]);
}

/**
 * ลบข้อมูลความประพฤติ (เก็บไว้ก่อน เผื่ออนาคต)
 */
function deleteMisconductRecord(ss, id) {
  const sheet = ss.getSheetByName(SHEETS.MISCONDUCT);
  const rows = sheet.getDataRange().getDisplayValues();
  
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

/**
 * สลับสถานะกล่องติ๊ก "แก้ไขแล้ว" / "ยังไม่แก้ไข" ในความประพฤติ
 */
function toggleMisconductResolvedRecord(ss, id, resolved, resolutionText, resolverName) {
  const sheet = ss.getSheetByName(SHEETS.MISCONDUCT);
  const rows = sheet.getDataRange().getDisplayValues();
  
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      const statusText = resolved ? "แก้ไขแล้ว" : "ยังไม่แก้ไข";
      sheet.getRange(i + 1, 8).setValue(statusText);
      
      // บันทึกรายละเอียดการแก้ไขลงคอลัมน์ 11 (K)
      if (resolved && resolutionText) {
        const dateStr = formatDate(new Date());
        // รูปแบบ: ข้อความ (ชื่อ, ว/ด/ป)
        const finalText = `${resolutionText} (${resolverName}, ${dateStr})`;
        sheet.getRange(i + 1, 11).setValue(finalText);
      } else if (!resolved) {
        // ถ้ายกเลิก ให้ล้างข้อความทิ้ง
        sheet.getRange(i + 1, 11).setValue("");
      }
      
      break;
    }
  }
}

/**
 * ฟังก์ชันช่วยแปลงรูปแบบวันที่เป็น YYYY-MM-DD ท้องถิ่น
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = ("0" + (date.getMonth() + 1)).slice(-2);
  const day = ("0" + date.getDate()).slice(-2);
  return `${year}-${month}-${day}`;
}

/**
 * อัปเดตบทบาทของผู้ใช้งานในชีท
 */
function updateUserRoleInSheet(ss, name, newRole) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getDisplayValues();
  let mapping = getUserSheetMapping(rows[0]);
  
  // ถ้าไม่มีคอลัมน์บทบาท ให้สร้างใหม่
  if (mapping.roleIdx === -1) {
    const newColIdx = rows[0].length + 1;
    sheet.getRange(1, newColIdx).setValue("บทบาท").setFontWeight("bold");
    mapping.roleIdx = newColIdx - 1;
  }
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][mapping.nameIdx] === name) {
      sheet.getRange(i + 1, mapping.roleIdx + 1).setValue(newRole);
      break;
    }
  }
}

/**
 * อัปเดตบทบาททั้งหมดในครั้งเดียวแบบรวดเร็ว
 */
function updateAllUserRolesInSheet(ss, updates) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !updates || updates.length === 0) return;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let mapping = getUserSheetMapping(headers);
  
  if (mapping.roleIdx === -1) {
    const newColIdx = headers.length + 1;
    sheet.getRange(1, newColIdx).setValue("บทบาท").setFontWeight("bold").setBackground("#e3f2fd");
    mapping.roleIdx = newColIdx - 1;
  }
  
  const nameValues = sheet.getRange(2, mapping.nameIdx + 1, lastRow - 1, 1).getValues();
  const roleRange = sheet.getRange(2, mapping.roleIdx + 1, lastRow - 1, 1);
  const roleValues = roleRange.getValues();
  
  const updateMap = {};
  updates.forEach(u => updateMap[u.name] = u.role);
  
  for (let i = 0; i < nameValues.length; i++) {
    const name = String(nameValues[i][0]).trim();
    if (updateMap[name]) {
      roleValues[i][0] = updateMap[name];
    }
  }
  
  roleRange.setValues(roleValues);
}

/**
 * ลบผู้ใช้งานออกจากชีท
 */
function deleteUserFromSheet(ss, name) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getDisplayValues();
  const mapping = getUserSheetMapping(rows[0]);
  
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][mapping.nameIdx] === name) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}
