// ==========================================
// ไฟล์ตั้งค่าระบบเช็คชื่อ (Configuration)
// ==========================================
// คุณครูสามารถกำหนดลิงก์ข้อมูลและค่าคงที่พื้นฐานของโรงเรียนได้ที่นี่ครับ
// ระบบหน้าเว็บจะดึงข้อมูลจากไฟล์นี้ไปแสดงผลโดยอัตโนมัติ

const GLOBAL_CONFIG = {
    // 1. Supabase Database Configuration (High Speed Cloud DB)
    supabaseUrl: "https://lkpgexffxxyczxfevqkc.supabase.co",
    supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrcGdleGZmeHh5Y3p4ZmV2cWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NzA4ODgsImV4cCI6MjEwMzA0Njg4OH0.nZe6-3Hzw2ogcM_akBIK_w-JC9okXvp0r7GSjVj5YSM",

    // 2. ข้อมูลพื้นฐานของโรงเรียน (ปรับเปลี่ยนตามปีการศึกษา/ภาคเรียนจริง)
    schoolName: "โรงเรียนซับบอนวิทยาคม",
    workGroup: "กลุ่มงานบริหารทั่วไป",
    semester: "ภาคเรียนที่ 1",
    academicYear: "ปีการศึกษา 2569"
};
