/**
 * Google Apps Script - ระบบเช็คชื่อนักเรียนออนไลน์ (เวอร์ชันประสิทธิภาพสูง คอลัมน์เดียว Web_ Prefix)
 * คัดลอกโค้ดนี้ทั้งหมดไปวางในเมนู Extensions -> Apps Script ของ Google Sheet ของคุณ
 */

// ชื่อชีทต่าง ๆ ในระบบที่เชื่อมต่อ
const SHEETS = {
  STUDENTS: "Web_รายชื่อนักเรียน",
  HOLIDAYS: "Web_วันหยุด",
  USERS: "Web_ผู้ใช้งาน",
  MISCONDUCT: "Web_บันทึกความประพฤติ",
  ATTENDANCE: "Web_บันทึกเวลาเรียน",
  DOCUMENTS: "Web_เอกสารที่ออกแล้ว",
  AT_RISK_TEACHERS: "Web_ติดตามนักเรียน"
};

/**
 * ฟังก์ชันเริ่มต้นระบบ: ตรวจสอบและสร้างชีทที่จำเป็นหากยังไม่มี
 */
function initDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ชีทรายชื่อนักเรียน
  if (!ss.getSheetByName(SHEETS.STUDENTS)) {
    const sheet = ss.insertSheet(SHEETS.STUDENTS);
    sheet.appendRow(["ข้อมูลดิบนักเรียน"]);
    sheet.getRange(1, 1).setFontWeight("bold").setBackground("#efebe9").setHorizontalAlignment("center");
  }
  
  // 2. ชีทวันหยุด
  if (!ss.getSheetByName(SHEETS.HOLIDAYS)) {
    const sheet = ss.insertSheet(SHEETS.HOLIDAYS);
    sheet.appendRow(["ข้อมูลวันหยุด"]);
    sheet.getRange(1, 1).setFontWeight("bold").setBackground("#efebe9").setHorizontalAlignment("center");
  }
  
  // 3. ชีทผู้ใช้งาน
  if (!ss.getSheetByName(SHEETS.USERS)) {
    const sheet = ss.insertSheet(SHEETS.USERS);
    sheet.appendRow(["ข้อมูลผู้ใช้"]);
    sheet.getRange(1, 1).setFontWeight("bold").setBackground("#e3f2fd").setHorizontalAlignment("center");
    // สร้าง Admin เริ่มต้น: ชื่อ|PIN|บทบาท
    sheet.appendRow(["Admin|9999|ADMIN"]);
  }
  
  // 4. ชีทบันทึกความประพฤติ
  if (!ss.getSheetByName(SHEETS.MISCONDUCT)) {
    const sheet = ss.insertSheet(SHEETS.MISCONDUCT);
    sheet.appendRow(["ข้อมูลความประพฤติ"]);
    sheet.getRange(1, 1).setFontWeight("bold").setBackground("#ffebee").setHorizontalAlignment("center");
  }

  // 5. ชีทบันทึกเวลาเรียน
  if (!ss.getSheetByName(SHEETS.ATTENDANCE)) {
    const sheet = ss.insertSheet(SHEETS.ATTENDANCE);
    sheet.appendRow(["ข้อมูลดิบเวลาเรียน"]);
    sheet.getRange(1, 1).setFontWeight("bold").setBackground("#ffe082").setHorizontalAlignment("center");
  }

  // 6. ชีทเอกสารที่ออกแล้ว (ป.ค.8, ป.ค.9)
  if (!ss.getSheetByName(SHEETS.DOCUMENTS)) {
    const sheet = ss.insertSheet(SHEETS.DOCUMENTS);
    sheet.appendRow(["ข้อมูลเอกสาร"]);
    sheet.getRange(1, 1).setFontWeight("bold").setBackground("#e8f5e9").setHorizontalAlignment("center");
  }

  // 7. ชีทติดตามนักเรียน (ครูที่รับผิดชอบ)
  if (!ss.getSheetByName(SHEETS.AT_RISK_TEACHERS)) {
    const sheet = ss.insertSheet(SHEETS.AT_RISK_TEACHERS);
    sheet.appendRow(["รหัสอ้างอิง", "ครูที่ปรึกษา", "หัวหน้ากิจการนักเรียน"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#fff3e0").setHorizontalAlignment("center");
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
      const documents = getDocuments(ss);
      const atRiskTeachers = getAtRiskTeachers(ss);
      
      return jsonResponse({
        success: true,
        students: students,
        holidays: holidays,
        users: users,
        todayLogs: todayLogs,
        todayLogsDetails: todayLogsDetails,
        documents: documents,
        atRiskTeachers: atRiskTeachers
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
    // การลงทะเบียนครูอนุญาตให้ทำได้โดยตรง
    if (action === "registerUser") {
      registerNewUser(ss, data.name, data.code, data.newPin, data.role);
      return jsonResponse({ success: true, message: "ลงทะเบียนผู้ใช้สำเร็จ" });
    }
    
    // การบันทึกลายเซ็นลง Sheet (ไม่ต้องแปลง PDF ให้ค้าง)
    if (action === "saveDocument") {
      try {
        logDocumentToSheet(ss, data.studentId, data.studentName, data.gradeRoom, data.documentType, data.signatureBase64);
        return jsonResponse({ success: true, message: "บันทึกข้อมูลและลายเซ็นสำเร็จ" });
      } catch (err) {
        return jsonResponse({ success: false, message: "บันทึกข้อมูลผิดพลาด: " + err.toString() });
      }
    }

    if (action === "saveAtRiskTeachers") {
      saveAtRiskTeachersInSheet(ss, data.key, data.hr, data.sa, data.hrSign, data.saSign);
      return jsonResponse({ success: true, message: "บันทึกข้อมูลครูรับผิดชอบสำเร็จ" });
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
    
    if (action === "clearAttendance") {
      if (userRole !== "ADMIN") {
        return jsonResponse({ success: false, message: "ไม่มีสิทธิ์ในการล้างข้อมูล (ต้องเป็น Admin เท่านั้น)" });
      }
      clearAttendanceHistory(ss);
      return jsonResponse({ success: true, message: "ล้างประวัติการมาเรียนทั้งหมดสำเร็จ" });
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
 * ดึงรายชื่อนักเรียนจากชีทรายชื่อนักเรียน
 * รูปแบบคอลัมน์ A: เลขประจำตัว|ชั้นเรียน/ห้อง|ชื่อเต็ม
 */
function getStudentsList(ss) {
  const sheet = ss.getSheetByName(SHEETS.STUDENTS); 
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const list = [];
  
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    if (!line) continue;
    
    const cells = line.split('|');
    if (cells.length < 3) continue;
    
    const studentId = cells[0].trim();
    const gradeRoom = cells[1].trim(); // e.g. "ม.1/1"
    const fullName = cells[2].trim();
    
    const gradeRoomParts = gradeRoom.split('/');
    const grade = gradeRoomParts[0] || "";
    const room = gradeRoomParts[1] || "";
    
    list.push({
      no: i + 1,
      studentId: studentId,
      grade: grade,
      room: room,
      fullName: fullName
    });
  }
  return list;
}

/**
 * ตรวจสอบรหัส PIN 4 หลัก จากชีทผู้ใช้งาน
 * รูปแบบคอลัมน์ A: ชื่อ|PIN|บทบาท
 */
function verifyPin(ss, pin) {
  if (!pin) return { success: false };
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false };
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    if (!line) continue;
    
    const cells = line.split('|');
    if (cells.length < 3) continue;
    
    const name = cells[0].trim();
    const userPin = cells[1].trim();
    const role = cells[2].trim();
    
    if (userPin === String(pin).trim()) {
      return { success: true, name: name, role: role };
    }
  }
  return { success: false };
}

/**
 * ดึงรายการวันหยุดทั้งหมด
 * รูปแบบคอลัมน์ A: YYYY-MM-DD|ชื่อวันหยุด
 */
function getHolidays(ss) {
  const sheet = ss.getSheetByName(SHEETS.HOLIDAYS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const list = [];
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    if (!line) continue;
    
    const cells = line.split('|');
    if (cells.length < 2) continue;
    
    list.push({
      date: cells[0].trim(),
      name: cells[1].trim()
    });
  }
  return list;
}

/**
 * ดึงรายการชื่อครูทั้งหมด
 * รูปแบบคอลัมน์ A: ชื่อ|PIN|บทบาท
 */
function getUsers(ss) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const list = [];
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    if (!line) continue;
    
    const cells = line.split('|');
    if (cells.length < 3) continue;
    
    const name = cells[0].trim();
    const pin = cells[1].trim();
    const role = cells[2].trim();
    
    list.push({
      name: name,
      code: "",
      role: role,
      pin: pin, 
      hasPin: pin !== ""
    });
  }
  return list;
}

/**
 * ดึงสถานะการเข้าเรียนรายบุคคลตามวันที่ระบุ
 * ดึงจากชีท "Web_บันทึกเวลาเรียน"
 * รูปแบบคอลัมน์ A: YYYYMMDD|เลขประจำตัว|สถานะ
 */
function getAttendanceDetailsForDate(ss, dateStr) {
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  if (!sheet) return {};
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  
  const targetDateCompact = dateStr.replace(/-/g, ""); // "20260706"
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
  const details = {};
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    if (!line) continue;
    
    const cells = line.split('|');
    if (cells.length < 3) continue;
    
    const recordDate = cells[0].trim();
    const studentId = cells[1].trim();
    const status = cells[2].trim();
    
    if (recordDate === targetDateCompact) {
      details[studentId] = status; // ตัวหลังสุดจะทับตัวหน้าโดยอัตโนมัติ
    }
  }
  return details;
}

/**
 * ดึงสรุปผลสถิติเช็คชื่อตามวันที่ระบุเพื่อนำไปสรุปการ์ดห้องหน้าแรก
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
      if (status === "ม") summaries[key].Present++;
      else if (status === "ล") summaries[key].Leave++;
      else if (status === "ข") summaries[key].Absent++;
      else if (status === "ส") summaries[key].Late++;
      else if (status === "ด") summaries[key].Cut++;
    }
  });
  
  return summaries;
}

/**
 * ดึงสถิติตามเดือนและห้องเรียนย้อนหลัง
 * รูปแบบคอลัมน์ A: YYYYMMDD|เลขประจำตัว|สถานะ
 */
function getAttendanceStats(ss, month, targetRoom) {
  const students = getStudentsList(ss);
  const studentMap = {};
  students.forEach(s => {
    studentMap[s.studentId] = {
      name: s.fullName,
      grade: s.grade,
      room: s.room,
      fullRoom: `${s.grade}/${s.room}`
    };
  });
  
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  if (!sheet) {
    return { logs: [], dates: [], availableMonths: [] };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { logs: [], dates: [], availableMonths: [] };
  }
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const logsMap = {}; // เพื่อเก็บสถานะสุดท้ายของนักเรียนในแต่ละวัน
  const dates = new Set();
  const allMonths = new Set();
  
  const targetMonthCompact = month !== "ALL" ? month.replace(/-/g, "") : "ALL"; // "202607"
  
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    if (!line) continue;
    
    const cells = line.split('|');
    if (cells.length < 3) continue;
    
    const recordDateCompact = cells[0].trim(); // "20260706"
    const studentId = cells[1].trim();
    const status = cells[2].trim();
    
    const info = studentMap[studentId];
    if (!info) continue;
    if (targetRoom !== "ALL" && info.fullRoom !== targetRoom) continue;
    
    const logMonthCompact = recordDateCompact.substring(0, 6);
    const logMonthNorm = logMonthCompact.substring(0, 4) + "-" + logMonthCompact.substring(4, 6);
    allMonths.add(logMonthNorm);
    
    if (targetMonthCompact === "ALL" || logMonthCompact === targetMonthCompact) {
      const formattedDate = recordDateCompact.substring(0, 4) + "-" + recordDateCompact.substring(4, 6) + "-" + recordDateCompact.substring(6, 8);
      dates.add(formattedDate);
      
      const key = `${formattedDate}|${studentId}`;
      logsMap[key] = {
        date: formattedDate,
        studentId: studentId,
        name: info.name,
        room: info.fullRoom,
        status: status
      };
    }
  }
  
  const logs = Object.values(logsMap);
  return {
    logs: logs,
    dates: Array.from(dates).sort(),
    availableMonths: Array.from(allMonths).sort().reverse()
  };
}

/**
 * ดึงบันทึกความประพฤติทั้งหมด
 * รูปแบบคอลัมน์ A: วันที่บันทึก|เลขประจำตัว|ชื่อ-สกุล|ชั้น/ห้อง|รายละเอียดความผิด|สถานะ|ครูผู้บันทึก|วันที่แก้ไข|รายละเอียดการแก้ไข|ครูผู้แก้ไข
 */
function getMisconductLogs(ss) {
  const sheet = ss.getSheetByName(SHEETS.MISCONDUCT);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const list = [];
  
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    if (!line) continue;
    
    const cells = line.split('|');
    const date = cells[0] || "";
    const studentId = cells[1] || "";
    const name = cells[2] || "";
    const gradeRoom = cells[3] || "";
    const description = cells[4] || "";
    const status = cells[5] || "";
    const recorder = cells[6] || "";
    const resolutionDate = cells[7] || "";
    const resolution = cells[8] || "";
    const resolver = cells[9] || "";
    
    const gradeRoomParts = gradeRoom.split('/');
    const grade = gradeRoomParts[0] || "";
    const room = gradeRoomParts[1] || "";
    
    list.push({
      id: `${date}|${studentId}|${i}`, // ใช้ดัชนีบรรทัดเป็นคีย์ในการระบุเพื่อใช้แก้ไขข้อมูลให้ถูกบรรทัด
      date: date,
      studentId: studentId,
      name: name,
      grade: grade,
      room: room,
      description: description,
      resolved: status === "แก้ไขแล้ว",
      recorder: recorder,
      timestamp: date,
      resolution: resolution,
      resolutionDate: resolutionDate,
      resolver: resolver
    });
  }
  return list.reverse();
}

/**
 * บันทึกการเช็คชื่อแบบต่อท้ายความเร็วสูง (Append Only)
 * รูปแบบข้อมูลในคอลัมน์ A: YYYYMMDD|เลขประจำตัว|สถานะ
 */
function saveAttendanceRecords(ss, dateStr, grade, room, records, teacher) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    
    const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
    const targetDateCompact = dateStr.replace(/-/g, ""); // "20260706"
    
    const newRows = [];
    records.forEach(r => {
      newRows.push([`${targetDateCompact}|${r.studentId}|${r.status}`]);
    });
    
    if (newRows.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, 1).setValues(newRows);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * ลงทะเบียนผู้ใช้ครู
 * รูปแบบคอลัมน์ A: ชื่อ|PIN|บทบาท
 */
function registerNewUser(ss, name, code, pin, role) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  
  let existingRow = -1;
  let rows = [];
  if (lastRow > 1) {
    rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < rows.length; i++) {
      const line = String(rows[i][0]).trim();
      const cells = line.split('|');
      if (cells[0] === name) {
        existingRow = i + 2;
        break;
      }
    }
  }
  
  const lineContent = `${name}|${pin}|${role}`;
  if (existingRow !== -1) {
    sheet.getRange(existingRow, 1).setValue(lineContent);
  } else {
    sheet.appendRow([lineContent]);
  }
}

/**
 * เพิ่มวันหยุด
 * รูปแบบคอลัมน์ A: YYYY-MM-DD|ชื่อวันหยุด
 */
function addHolidayRecord(ss, dateStr, name) {
  const sheet = ss.getSheetByName(SHEETS.HOLIDAYS);
  const lastRow = sheet.getLastRow();
  
  let existingRow = -1;
  let rows = [];
  if (lastRow > 1) {
    rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < rows.length; i++) {
      const line = String(rows[i][0]).trim();
      const cells = line.split('|');
      if (cells[0] === dateStr) {
        existingRow = i + 2;
        break;
      }
    }
  }
  
  const lineContent = `${dateStr}|${name}`;
  if (existingRow !== -1) {
    sheet.getRange(existingRow, 1).setValue(lineContent);
  } else {
    sheet.appendRow([lineContent]);
  }
}

/**
 * ลบวันหยุด
 */
function deleteHolidayRecord(ss, dateStr) {
  const sheet = ss.getSheetByName(SHEETS.HOLIDAYS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    const line = String(rows[i][0]).trim();
    const cells = line.split('|');
    if (cells[0] === dateStr) {
      sheet.deleteRow(i + 2);
    }
  }
}

/**
 * บันทึกความประพฤติแบบต่อท้ายคอลัมน์เดียว
 * รูปแบบ: วันที่บันทึก|เลขประจำตัว|ชื่อ-สกุล|ชั้น/ห้อง|รายละเอียดความผิด|สถานะ|ครูผู้บันทึก|วันที่แก้ไข|รายละเอียดการแก้ไข|ครูผู้แก้ไข
 */
function saveMisconductRecord(ss, dateStr, studentId, studentName, grade, room, description, teacher) {
  const sheet = ss.getSheetByName(SHEETS.MISCONDUCT);
  const lineContent = `${dateStr}|${studentId}|${studentName}|${grade}/${room}|${description}|ยังไม่แก้ไข|${teacher}|||`;
  sheet.appendRow([lineContent]);
}

/**
 * สลับสถานะและอัปเดตข้อมูลการแก้ไขบันทึกความประพฤติ
 */
function toggleMisconductResolvedRecord(ss, id, resolved, resolutionText, resolverName) {
  const sheet = ss.getSheetByName(SHEETS.MISCONDUCT);
  const parts = id.split('|');
  const rowIdx = parseInt(parts[parts.length - 1]);
  const rowNum = rowIdx + 2;
  
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) {
    throw new Error("ไม่พบแถวความประพฤติที่ต้องการแก้ไข");
  }
  
  const line = String(sheet.getRange(rowNum, 1).getValue()).trim();
  const cells = line.split('|');
  
  cells[5] = resolved ? "แก้ไขแล้ว" : "ยังไม่แก้ไข";
  cells[7] = resolved ? formatDate(new Date()) : "";
  cells[8] = resolved ? resolutionText : "";
  cells[9] = resolved ? resolverName : "";
  
  while (cells.length < 10) {
    cells.push("");
  }
  
  const newLineContent = cells.join('|');
  sheet.getRange(rowNum, 1).setValue(newLineContent);
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
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    const cells = line.split('|');
    if (cells[0] === name) {
      cells[2] = newRole;
      sheet.getRange(i + 2, 1).setValue(cells.join('|'));
      break;
    }
  }
}

/**
 * อัปเดตบทบาทผู้ใช้ทั้งหมด
 */
function updateAllUserRolesInSheet(ss, updates) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !updates || updates.length === 0) return;
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const updateMap = {};
  updates.forEach(u => {
    updateMap[u.name] = {
      role: u.role,
      pin: u.pin
    };
  });
  
  for (let i = 0; i < rows.length; i++) {
    const line = String(rows[i][0]).trim();
    const cells = line.split('|');
    const name = cells[0];
    if (updateMap[name]) {
      cells[1] = updateMap[name].pin;
      cells[2] = updateMap[name].role;
      sheet.getRange(i + 2, 1).setValue(cells.join('|'));
    }
  }
}

/**
 * ลบผู้ใช้งานออกจากชีท
 */
function deleteUserFromSheet(ss, name) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = rows.length - 1; i >= 0; i--) {
    const line = String(rows[i][0]).trim();
    const cells = line.split('|');
    if (cells[0] === name) {
      sheet.deleteRow(i + 2);
      break;
    }
  }
}

/**
 * ล้างข้อมูลบันทึกเวลาเรียนทั้งหมด (คงเหลือแถวหัวตาราง)
 */
function clearAttendanceHistory(ss) {
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}

/**
 * ดึงประวัติเอกสารและลายเซ็น
 */
function getDocuments(ss) {
  const sheet = ss.getSheetByName(SHEETS.DOCUMENTS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const docs = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    docs.push({
      date: formatDate(row[0]),
      studentId: row[2],
      documentType: row[5],
      signatureBase64: row[6] || ""
    });
  }
  return docs;
}

/**
 * บันทึกประวัติการออกเอกสารลง Sheet
 */
function logDocumentToSheet(ss, studentId, studentName, gradeRoom, documentType, signatureBase64) {
  let sheet = ss.getSheetByName(SHEETS.DOCUMENTS);
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = Utilities.formatDate(now, "GMT+7", "HH:mm:ss");
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["วันที่", "เวลา", "รหัสนักเรียน", "ชื่อ-สกุล", "ชั้น/ห้อง", "ประเภทเอกสาร", "ลายเซ็น (Base64)"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#e1bee7").setHorizontalAlignment("center");
  }
  
  sheet.appendRow([dateStr, timeStr, studentId, studentName, gradeRoom, documentType, signatureBase64]);
}

/**
 * ดึงข้อมูลครูที่รับผิดชอบเอกสารติดตามนักเรียน
 */
function getAtRiskTeachers(ss) {
  const sheet = ss.getSheetByName(SHEETS.AT_RISK_TEACHERS);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const teachers = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const keyParts = String(row[0]).split('|');
    if (keyParts.length < 3) continue;
    
    // คีย์อ้างอิงหลักคือ 3 ส่วนแรก: รหัส|เอกสาร|ครั้งที่
    const baseKey = keyParts.slice(0, 3).join('|');
    
    teachers[baseKey] = {
      hr: keyParts[3] || "",
      sa: keyParts[4] || "",
      hrSign: row[1] || "",
      saSign: row[2] || ""
    };
  }
  return teachers;
}

/**
 * บันทึกหรืออัปเดตข้อมูลครูที่รับผิดชอบเอกสารติดตามนักเรียน
 */
function saveAtRiskTeachersInSheet(ss, key, hr, sa, hrSign, saSign) {
  const sheet = ss.getSheetByName(SHEETS.AT_RISK_TEACHERS);
  if (!sheet) return;
  
  const fullColA = `${key}|${hr || ""}|${sa || ""}`;
  
  const data = sheet.getDataRange().getValues();
  let foundRowIndex = -1;
  
  for (let i = 1; i < data.length; i++) {
    const rowKeyStr = String(data[i][0]);
    if (rowKeyStr.startsWith(key + "|") || rowKeyStr === key) {
      foundRowIndex = i + 1; // +1 เพราะ data index เริ่มที่ 0 แต่ชีทเริ่มที่ 1
      break;
    }
  }
  
  if (foundRowIndex > -1) {
    // อัปเดตบรรทัดเดิม
    sheet.getRange(foundRowIndex, 1).setValue(fullColA);
    if (hrSign !== undefined && hrSign !== null) sheet.getRange(foundRowIndex, 2).setValue(hrSign);
    if (saSign !== undefined && saSign !== null) sheet.getRange(foundRowIndex, 3).setValue(saSign);
  } else {
    // เพิ่มบรรทัดใหม่
    sheet.appendRow([fullColA, hrSign || "", saSign || ""]);
  }
}
