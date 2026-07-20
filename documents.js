/**
 * ไฟล์รวมเทมเพลตสำหรับสร้างเอกสาร (ป.ค.1 - ป.ค.9)
 * เพื่อใช้ในการแสดงผลและพิมพ์เป็น PDF
 */

function generateDocumentHtml(studentInfo, signatureHtml, formattedDate) {
    // โครงสร้างพื้นฐานของเอกสารสไตล์หนังสือราชการ
    // ใช้ฟอนต์ Sarabun, ขนาด 10pt (ประมาณ 13px), บางพิเศษ (weight: 300), ระยะบรรทัด 1.15
    // ระยะขอบถูกตั้งค่าใน @media print ใน index.html (margin: 2.54cm)
    
    const wrapperStyle = `
        font-family: 'Sarabun', sans-serif;
        font-size: 11pt;
        font-weight: 300;
        color: #000;
        line-height: 1.8; /* 1.8 is approx 1.5x in MS Word */
        text-align: justify;
    `;

    // เลือกเนื้อหาตามประเภทของเอกสาร
    let content = "";
    
    switch (studentInfo.docType) {
        case 'ป.ค.8':
            content = getPK8Template(studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.9':
            content = getPK9Template(studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.1':
            content = getPlaceholderTemplate("ป.ค.1", "แบบบันทึกพฤติกรรม...", studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.2':
            content = getPlaceholderTemplate("ป.ค.2", "แบบรายงาน...", studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.3':
            content = getPlaceholderTemplate("ป.ค.3", "แบบฟอร์ม...", studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.4':
            content = getPlaceholderTemplate("ป.ค.4", "แบบฟอร์ม...", studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.5':
            content = getPlaceholderTemplate("ป.ค.5", "แบบฟอร์ม...", studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.6':
            content = getPlaceholderTemplate("ป.ค.6", "แบบฟอร์ม...", studentInfo, signatureHtml, formattedDate);
            break;
        case 'ป.ค.7':
            content = getPlaceholderTemplate("ป.ค.7", "แบบฟอร์ม...", studentInfo, signatureHtml, formattedDate);
            break;
        default:
            content = getPlaceholderTemplate(studentInfo.docType, "เอกสารทั่วไป", studentInfo, signatureHtml, formattedDate);
            break;
    }

    return `<div style="${wrapperStyle}">${content}</div>`;
}

    // ฟังก์ชันช่วยจัดฟอร์แมตชั้นเรียนเพื่อป้องกัน 'ม.ม.'
    const formatGrade = (grade) => {
        if (!grade) return '';
        // ถ้าขึ้นต้นด้วย 'ม.' หรือ 'ม ' ให้ตัดออกแล้วเติม 'ม.' เข้าไปใหม่ให้เป็นมาตรฐาน
        return 'ม.' + grade.replace(/^ม\.?\s*/, '');
    };

// ==========================================
// เทมเพลต ป.ค.8 (แจ้งมาสาย)
// ==========================================
function getPK8Template(studentInfo, signatureHtml, formattedDate) {
    const gradeFormatted = formatGrade(studentInfo.gradeRoom);
    
    let noticeCountStr = '............';
    if (studentInfo.lateDates) {
        let count = studentInfo.lateDates.length;
        if (count >= 9) noticeCountStr = '3';
        else if (count >= 5) noticeCountStr = '2';
        else if (count >= 3) noticeCountStr = '1';
    }
    
    return `
        <div style="position: relative;">
            <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%);">
                <img src="logo.png" style="height: 90px; width: auto;" alt="โลโก้โรงเรียน">
            </div>
            
            <div style="text-align: right; font-weight: bold;">ป.ค. 8</div>
            <div style="height: 12pt;"></div>
            <div style="text-align: right;">
                โรงเรียนซับบอนวิทยาคม<br>
                อ.บึงสามพัน จ.เพชรบูรณ์
            </div>
            <div style="height: 8pt;"></div>
            <div style="margin-left: 50%; text-align: left;">
                วันที่ ${formattedDate}
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: left;">
                <span style="font-weight: bold;">เรื่อง&nbsp;&nbsp;แจ้งพฤติกรรมการมาเรียนสาย (ครั้งที่ ${noticeCountStr})</span>
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: left; font-weight: bold;">
                เรียน&nbsp;&nbsp;ผู้ปกครอง <span style="text-decoration: underline;">${studentInfo.fullName}</span>
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: justify;">
                <span style="display:inline-block; width:2.54cm;"></span>เนื่องจาก <span style="font-weight:bold;">${studentInfo.fullName}</span> นักเรียนชั้น <span style="font-weight:bold;">${gradeFormatted}</span> ซึ่งอยู่ในความปกครองของท่าน มีสถิติการมาโรงเรียนสายกว่าเวลาที่โรงเรียนกำหนด (8.00น.) โดยไม่ได้แจ้งเหตุผลความจำเป็นให้ทางโรงเรียนทราบล่วงหน้า <span style="font-weight: bold;">จำนวน ${studentInfo.lateDates ? studentInfo.lateDates.length : '.............'} ครั้ง</span> ซึ่งมีรายละเอียดมาสายดังนี้ <span style="font-weight: bold;">วันที่ ${studentInfo.lateDates && studentInfo.lateDates.length > 0 ? studentInfo.lateDates.join(', วันที่ ') : '.......................................................................................................'}</span>
            </div>
            <div style="text-align: justify;">
                <span style="display:inline-block; width:2.54cm;"></span>ดังนั้น ทางโรงเรียนจึงขอความร่วมมือจากท่านในการกำชับพฤติกรรมของนักเรียนให้มีวินัย และมีความรับผิดชอบ หากข้อมูลดังกล่าวไม่ถูกต้อง ขอความกรุณาติดต่อครูที่ปรึกษาโดยด่วน เพื่อร่วมกันหาแนวทางแก้ไขปัญหานี้ต่อไป
            </div>
            <div style="height: 8pt;"></div>
            <div>
                <span style="display:inline-block; width:2.54cm;"></span>จึงเรียนมาเพื่อโปรดทราบ
            </div>
            <div style="height: 8pt;"></div>
            <table width="100%">
                <tr>
                    <td width="40%"></td>
                    <td width="60%" style="text-align: center;">
                        <div style="display: inline-block; text-align: left;">
                            <div style="text-align: center; margin-bottom: 30px;">ขอแสดงความนับถือ</div>
                            
                            <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
                                <div style="white-space: nowrap;">ลงชื่อ</div>
                                <div style="text-align: center; margin: 0 5px;">
                                    <div>...........................................</div>
                                    <div>(${studentInfo.homeroomTeacher || '...........................................'})</div>
                                </div>
                                <div style="white-space: nowrap;">ครูที่ปรึกษา</div>
                            </div>
                            
                            <div style="display: flex; align-items: flex-start;">
                                <div style="white-space: nowrap;">ลงชื่อ</div>
                                <div style="text-align: center; margin: 0 5px;">
                                    <div>...........................................</div>
                                    <div>(${studentInfo.headOfStudentAffairs || '...........................................'})</div>
                                </div>
                                <div style="white-space: nowrap;">หัวหน้ากิจการนักเรียน</div>
                            </div>
                        </div>
                    </td>
                </tr>
            </table>
            
            <div style="border-top: 3px dotted #000; margin: 8pt 0;"></div>
            
            <div>
                <div style="text-align: center; font-weight: bold;">หนังสือตอบรับ</div>
                เรื่อง รับทราบการแจ้งพฤติกรรมการมาเรียนสาย (ครั้งที่ ${noticeCountStr})<br>
                <div style="text-align: justify;">
                    <span style="display:inline-block; width:2.54cm;"></span>ข้าพเจ้า........................................ เป็นผู้ปกครองของ <span style="font-weight:bold;">${studentInfo.fullName}</span> นักเรียนชั้น <span style="font-weight:bold;">${gradeFormatted}</span> ได้รับหนังสือแจ้งพฤติกรรมการมาสายของโรงเรียนซับบอนวิทยาคมเรียบร้อยแล้ว ด้วยความขอบคุณยิ่ง ทั้งนี้ ข้าพเจ้าจะขอติดต่อกลับไปทางโรงเรียน (ครูที่ปรึกษา) เพื่อหารือแนวทางร่วมกัน
                </div>
                
                <table width="100%" style="margin-top: 8pt;">
                    <tr>
                        <td width="40%"></td>
                        <td width="60%" style="text-align: center;">
                            ${signatureHtml}
                            <div style="display: inline-block; text-align: left;">
                                <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                                    <div style="white-space: nowrap;">ลงชื่อ</div>
                                    <div style="text-align: center; margin: 0 5px;">
                                        <div>...........................................</div>
                                        <div>(...........................................)</div>
                                    </div>
                                    <div style="white-space: nowrap;">ผู้ปกครอง</div>
                                </div>
                                <div style="text-align: center; margin-top: 5px;">
                                    ........../........../..........
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    `;
}

// ==========================================
// เทมเพลต ป.ค.9 (ติดตามนักเรียนขาดเรียน)
// ==========================================
function getPK9Template(studentInfo, signatureHtml, formattedDate) {
    const gradeFormatted = formatGrade(studentInfo.gradeRoom);
    
    let noticeCountStr = '............';
    if (studentInfo.absentDates) {
        let count = studentInfo.absentDates.length;
        if (count >= 9) noticeCountStr = '3';
        else if (count >= 6) noticeCountStr = '2';
        else if (count >= 3) noticeCountStr = '1';
    }
    
    return `
        <div style="position: relative;">
            <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%);">
                <img src="logo.png" style="height: 90px; width: auto;" alt="โลโก้โรงเรียน">
            </div>
            
            <div style="text-align: right; font-weight: bold;">ป.ค. 9</div>
            <div style="height: 12pt;"></div>
            <div style="text-align: right;">
                โรงเรียนซับบอนวิทยาคม<br>
                อ.บึงสามพัน จ.เพชรบูรณ์
            </div>
            <div style="height: 8pt;"></div>
            <div style="margin-left: 50%; text-align: left;">
                วันที่ ${formattedDate}
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: left;">
                <span style="font-weight: bold;">เรื่อง&nbsp;&nbsp;ติดตามนักเรียนขาดเรียน (ครั้งที่ ${noticeCountStr})</span>
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: left; font-weight: bold;">
                เรียน&nbsp;&nbsp;ผู้ปกครอง <span style="text-decoration: underline;">${studentInfo.fullName}</span>
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: justify;">
                <span style="display:inline-block; width:2.54cm;"></span>เนื่องจาก <span style="font-weight:bold;">${studentInfo.fullName}</span> นักเรียนชั้น <span style="font-weight:bold;">${gradeFormatted}</span> ซึ่งอยู่ในความปกครองของท่าน มีสถิติขาดการเรียนโดยไม่ได้แจ้งลาหรือระบุเหตุผลความจำเป็นให้ทางโรงเรียนทราบ <span style="font-weight: bold;">จำนวน ${studentInfo.absentDates ? studentInfo.absentDates.length : '.....'} ครั้ง</span> ดังนี้<br>
                <span style="font-weight: bold;">วันที่ ${studentInfo.absentDates && studentInfo.absentDates.length > 0 ? studentInfo.absentDates.join(', วันที่ ') : '.......................................................................................................'}</span>
            </div>
            <div style="text-align: justify;">
                <span style="display:inline-block; width:2.54cm;"></span>ดังนั้น ทางโรงเรียนจึงขอความอนุเคราะห์จากท่านแจ้งสาเหตุให้ทางครูที่ปรึกษาทราบ เพื่อที่ทางโรงเรียนและผู้ปกครองจะได้ร่วมกันดูแล สนับสนุน และช่วยเหลือนักเรียนในด้านการเรียนและการปรับตัวได้อย่างมีประสิทธิภาพต่อไป
            </div>
            <div style="height: 8pt;"></div>
            <div>
                <span style="display:inline-block; width:2.54cm;"></span>จึงเรียนมาเพื่อโปรดทราบ
            </div>
            <div style="height: 8pt;"></div>
            <table width="100%">
                <tr>
                    <td width="40%"></td>
                    <td width="60%" style="text-align: center;">
                        <div style="display: inline-block; text-align: left;">
                            <div style="text-align: center; margin-bottom: 30px;">ขอแสดงความนับถือ</div>
                            
                            <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
                                <div style="white-space: nowrap;">ลงชื่อ</div>
                                <div style="text-align: center; margin: 0 5px;">
                                    <div>...........................................</div>
                                    <div>(${studentInfo.homeroomTeacher || '...........................................'})</div>
                                </div>
                                <div style="white-space: nowrap;">ครูที่ปรึกษา</div>
                            </div>
                            
                            <div style="display: flex; align-items: flex-start;">
                                <div style="white-space: nowrap;">ลงชื่อ</div>
                                <div style="text-align: center; margin: 0 5px;">
                                    <div>...........................................</div>
                                    <div>(${studentInfo.headOfStudentAffairs || '...........................................'})</div>
                                </div>
                                <div style="white-space: nowrap;">หัวหน้ากิจการนักเรียน</div>
                            </div>
                        </div>
                    </td>
                </tr>
            </table>
            
            <div style="border-top: 3px dotted #000; margin: 8pt 0;"></div>
            
            <div>
                <div style="text-align: center; font-weight: bold;">หนังสือตอบรับ</div>
                เรื่อง รับทราบสถิติการขาดเรียน (ครั้งที่ ${noticeCountStr})<br>
                <div style="text-align: justify;">
                    <span style="display:inline-block; width:2.54cm;"></span>ข้าพเจ้า........................................ เป็นผู้ปกครองของ <span style="font-weight:bold;">${studentInfo.fullName}</span> นักเรียนชั้น <span style="font-weight:bold;">${gradeFormatted}</span> ได้รับทราบหนังสือฉบับนี้เรียบร้อยแล้ว ด้วยความขอบคุณยิ่ง ทั้งนี้ ข้าพเจ้าจะขอติดต่อกลับไปทางโรงเรียน (ครูที่ปรึกษา) เพื่อหารือแนวทางร่วมกัน
                </div>
                
                <table width="100%" style="margin-top: 8pt;">
                    <tr>
                        <td width="40%"></td>
                        <td width="60%" style="text-align: center;">
                            ${signatureHtml}
                            <div style="display: inline-block; text-align: left;">
                                <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                                    <div style="white-space: nowrap;">ลงชื่อ</div>
                                    <div style="text-align: center; margin: 0 5px;">
                                        <div>...........................................</div>
                                        <div>(...........................................)</div>
                                    </div>
                                    <div style="white-space: nowrap;">ผู้ปกครอง</div>
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    `;
}

// ==========================================
// เทมเพลต โครงสร้างว่างๆ (สำหรับ ป.ค.1 - 7)
// ==========================================
function getPlaceholderTemplate(docCode, docTitle, studentInfo, signatureHtml, formattedDate) {
    const gradeFormatted = formatGrade(studentInfo.gradeRoom);
    
    return `
        <div style="position: relative;">
            <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%);">
                <img src="logo.png" style="height: 90px; width: auto;" alt="โลโก้โรงเรียน">
            </div>
            
            <div style="text-align: right; font-weight: bold;">${docCode}</div>
            <div style="height: 12pt;"></div>
            <div style="text-align: right;">
                โรงเรียนซับบอนวิทยาคม<br>
                อ.บึงสามพัน จ.เพชรบูรณ์
            </div>
            <div style="height: 8pt;"></div>
            <div style="margin-left: 50%; text-align: left;">
                วันที่ ${formattedDate}
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: left;">
                <span style="font-weight: bold;">เรื่อง ${docTitle}</span>
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: left;">
                เรียน ผู้ปกครองของ ${studentInfo.fullName}
            </div>
            <div style="height: 8pt;"></div>
            <div style="text-align: justify; color: #666; font-style: italic;">
                <span style="display:inline-block; width:2.54cm;"></span>(พื้นที่สำหรับกรอกข้อความของ ${docCode} สามารถเข้ามาแก้ไขเพิ่มเนื้อหาได้ที่ไฟล์ documents.js)<br>
                นักเรียนชื่อ ${studentInfo.fullName} ชั้น <span style="font-weight:bold;">${gradeFormatted}</span>
            </div>
            <div style="height: 8pt;"></div>
            <table width="100%">
                <tr>
                    <td width="40%"></td>
                    <td width="60%" style="text-align: center;">
                        <div style="display: inline-block; text-align: left;">
                            <div style="text-align: center; margin-bottom: 30px;">ขอแสดงความนับถือ</div>
                            
                            <div style="display: flex; align-items: flex-start; margin-bottom: 15px;">
                                <div style="white-space: nowrap;">ลงชื่อ</div>
                                <div style="text-align: center; margin: 0 5px;">
                                    <div>...........................................</div>
                                    <div>(${studentInfo.homeroomTeacher || '...........................................'})</div>
                                </div>
                                <div style="white-space: nowrap;">ครูที่ปรึกษา</div>
                            </div>
                            
                            <div style="display: flex; align-items: flex-start;">
                                <div style="white-space: nowrap;">ลงชื่อ</div>
                                <div style="text-align: center; margin: 0 5px;">
                                    <div>...........................................</div>
                                    <div>(${studentInfo.headOfStudentAffairs || '...........................................'})</div>
                                </div>
                                <div style="white-space: nowrap;">หัวหน้ากิจการนักเรียน</div>
                            </div>
                        </div>
                    </td>
                </tr>
            </table>
            
            <div style="border-top: 3px dotted #000; margin: 8pt 0;"></div>
            
            <div>
                <div style="text-align: center; font-weight: bold;">หนังสือตอบรับ (${docCode})</div>
                <div style="text-align: justify;">
                    <span style="display:inline-block; width:2.54cm;"></span>ข้าพเจ้า........................................ เป็นผู้ปกครองของ <span style="font-weight:bold;">${studentInfo.fullName}</span> นักเรียนชั้น <span style="font-weight:bold;">${gradeFormatted}</span> ได้รับทราบหนังสือฉบับนี้เรียบร้อยแล้ว
                </div>
                
                <table width="100%" style="margin-top: 8pt;">
                    <tr>
                        <td width="40%"></td>
                        <td width="60%" style="text-align: center;">
                            ${signatureHtml}
                            <div style="display: inline-block; text-align: left;">
                                <div style="display: flex; align-items: flex-start; margin-bottom: 5px;">
                                    <div style="white-space: nowrap;">ลงชื่อ</div>
                                    <div style="text-align: center; margin: 0 5px;">
                                        <div>...........................................</div>
                                        <div>(...........................................)</div>
                                    </div>
                                    <div style="white-space: nowrap;">ผู้ปกครอง</div>
                                </div>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
    `;
}
