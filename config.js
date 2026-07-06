// ==========================================
// ไฟล์ตั้งค่าระบบเช็คชื่อ (Configuration)
// ==========================================
// คุณครูสามารถกำหนดลิงก์ข้อมูลและค่าคงที่พื้นฐานของโรงเรียนได้ที่นี่ครับ
// ระบบหน้าเว็บจะดึงข้อมูลจากไฟล์นี้ไปแสดงผลโดยอัตโนมัติ

const GLOBAL_CONFIG = {
    // 1. ลิงก์ Apps Script (ลงท้ายด้วย /exec)
    scriptUrl: "https://script.google.com/macros/s/AKfycbxQW8KyjjsI9Vx8lH2Y5lxlTLtj6eriNZoSPLk4XaYRGdPr138MgoWZPqPWrO7vXLrX/exec",
    
    // 2. ลิงก์ Google Sheet (เอาไว้เป็นข้อมูลอ้างอิง)
    sheetUrl: "https://docs.google.com/spreadsheets/d/1caozfZoNBlgZPmvUMnggb7DuRgoB4IsPSslt7XgYPTk/edit?usp=sharing",

    // 3. ข้อมูลพื้นฐานของโรงเรียน (ปรับเปลี่ยนตามปีการศึกษา/ภาคเรียนจริง)
    schoolName: "โรงเรียนซับบอนวิทยาคม",
    workGroup: "กลุ่มงานบริหารทั่วไป",
    semester: "ภาคเรียนที่ 1",
    academicYear: "ปีการศึกษา 2569"
};
