/**
 * canteen.js - โมดูลระบบรีวิวและประเมินโรงอาหาร (Canteen Evaluation & Review Module)
 * สถาปัตยกรรมแบบแยกโมดูล (Level 1 & 2): ทำงานอิสระ ไม่ปะปนกับ app.js
 * จัดเก็บข้อมูลลงตารางอเนกประสงค์ app_data (JSONB) ใน Supabase 100%
 */

(function() {
    // -------------------------------------------------------------
    // State ประจำโมดูลโรงอาหาร (ไม่ใช้ตัวแปรปนกับระบบอื่น)
    // -------------------------------------------------------------
    let canteenReviewsCache = [];
    let canteenSelectedRating = 5;
    let canteenSelectedTags = new Set();
    let canteenActiveShopFilter = "ALL";
    let canteenActiveMonthFilter = "ALL";
    let canteenSelectedStudent = null;

    const CANTEEN_PRESET_SHOPS = [
        "ภาพรวมโรงอาหาร",
        "ร้านที่ 1: ข้าวราดแกง / อาหารจานเดียว",
        "ร้านที่ 2: ก๋วยเตี๋ยว / อาหารเส้น",
        "ร้านที่ 3: ข้าวมันไก่ / ข้าวหมูกรอบ",
        "ร้านที่ 4: เครื่องดื่ม / น้ำชง / นมสด",
        "ร้านที่ 5: ผลไม้ / ขนมขบเคี้ยว / ไอศกรีม"
    ];

    const CANTEEN_PRESET_TAGS = [
        "อร่อยบอกต่อ",
        "ให้เยอะจุใจ",
        "สะอาดถูกหลักอนามัย",
        "แม่ค้าใจดี ยิ้มแย้ม",
        "ราคาประหยัด คุ้มค่า",
        "น้ำซุปหวานกลมกล่อม",
        "อยากให้เพิ่มผัก",
        "ช่วงเที่ยงแถวยาวไปหน่อย",
        "โต๊ะอาหารสะอาด",
        "ช้อนส้อมสะอาดแห้งสนิท"
    ];

    // Helper: เชื่อมต่อ Supabase
    function getDb() {
        if (typeof getSupabase === "function") {
            const db = getSupabase();
            if (db) return db;
        }
        if (typeof window.supabase !== "undefined" && typeof config !== "undefined") {
            return window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
        }
        return null;
    }

    // Helper: แสดง Toast
    function notify(msg, type = "success") {
        if (typeof showToast === "function") {
            showToast(msg, type);
        } else {
            alert(msg);
        }
    }

    // Helper: หมุนโหลด
    function loading(isLoading) {
        if (typeof setLoader === "function") {
            setLoader(isLoading);
        }
    }

    // -------------------------------------------------------------
    // ฟังก์ชันเริ่มต้นโมดูล (ถูกเรียกเมื่อเปิดหน้า canteen.html)
    // -------------------------------------------------------------
    window.initCanteenView = async function() {
        renderCanteenBaseLayout();
        ensureStudentsLoaded(); // โหลดรายชื่อนักเรียนในพื้นหลังเพื่อใช้ตอนค้นหา
        await fetchCanteenReviews();
        renderCanteenFeed();
    };

    async function ensureStudentsLoaded() {
        if (typeof window.students !== "undefined" && window.students && window.students.length > 0) return;
        const db = getDb();
        if (!db) return;
        try {
            const { data } = await db.from('std').select('student_id, full_name, grade, room');
            if (data && data.length > 0) {
                window.students = data.map(s => ({
                    studentId: s.student_id,
                    fullName: s.full_name,
                    grade: s.grade,
                    room: s.room
                }));
            }
        } catch (e) {
            console.warn("Could not load students for search:", e);
        }
    }

    // -------------------------------------------------------------
    // วาดโครงร่างหน้าจอโรงอาหาร (UI Base Layout)
    // -------------------------------------------------------------
    function renderCanteenBaseLayout() {
        const container = document.getElementById("view-canteen");
        if (!container) return;

        // ไม่เขียนทับหากโครงร่างถูกสร้างไว้แล้ว
        if (container.querySelector(".canteen-app-wrapper")) return;

        container.innerHTML = `
            <div class="canteen-app-wrapper" style="max-width: 1080px; margin: 0 auto; padding: 10px 15px 80px 15px;">
                <!-- Header Banner -->
                <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); border-radius: 20px; padding: 24px; color: white; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(234, 88, 12, 0.25); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                            <span style="font-size: 28px;">🍽️</span>
                            <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: white;">รีวิวและประเมินโรงอาหาร</h1>
                        </div>
                        <p style="margin: 0; font-size: 13px; opacity: 0.95;">ระบบประเมินความสะอาด รสชาติ และความพึงพอใจร้านอาหารประจำโรงเรียนซับบอนวิทยาคม</p>
                    </div>
                    <button type="button" onclick="window.openCanteenReviewModal()" style="background: white; color: #ea580c; border: none; border-radius: 12px; padding: 12px 20px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: transform 0.15s ease;">
                        <i class="fa-solid fa-star" style="color: #f59e0b;"></i> เขียนรีวิวประจำเดือน
                    </button>
                </div>

                <!-- Stats Summary Cards -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 22px;">
                    <div style="background: white; border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 14px; box-shadow: var(--shadow-sm);">
                        <div style="width: 46px; height: 46px; border-radius: 12px; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-star"></i>
                        </div>
                        <div>
                            <div style="font-size: 22px; font-weight: 800; color: var(--text-main);" id="canteen-stat-avg-stars">0.0</div>
                            <div style="font-size: 12px; color: var(--text-muted);">คะแนนดาวเฉลี่ยภาพรวม</div>
                        </div>
                    </div>

                    <div style="background: white; border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 14px; box-shadow: var(--shadow-sm);">
                        <div style="width: 46px; height: 46px; border-radius: 12px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-comments"></i>
                        </div>
                        <div>
                            <div style="font-size: 22px; font-weight: 800; color: var(--text-main);" id="canteen-stat-total-reviews">0</div>
                            <div style="font-size: 12px; color: var(--text-muted);">จำนวนรีวิวทั้งหมด</div>
                        </div>
                    </div>

                    <div style="background: white; border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 14px; box-shadow: var(--shadow-sm);">
                        <div style="width: 46px; height: 46px; border-radius: 12px; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                            <i class="fa-solid fa-crown"></i>
                        </div>
                        <div>
                            <div style="font-size: 15px; font-weight: 800; color: #16a34a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" id="canteen-stat-top-shop">-</div>
                            <div style="font-size: 12px; color: var(--text-muted);">ร้านที่ได้คะแนนสูงสุด</div>
                        </div>
                    </div>
                </div>

                <!-- Filters Bar -->
                <div style="background: white; border: 1px solid var(--border-color); border-radius: 16px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-size: 13px; font-weight: 600; color: var(--text-main);"><i class="fa-solid fa-filter" style="color: #ea580c;"></i> ตัวกรอง:</span>
                        <select id="canteen-filter-shop" onchange="window.handleCanteenFilterChange()" style="padding: 7px 12px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 13px; background: #f8fafc; color: var(--text-main); font-family: inherit;">
                            <option value="ALL">ทุกลำดับร้าน / ทุกหมวด</option>
                            ${CANTEEN_PRESET_SHOPS.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                        <select id="canteen-filter-month" onchange="window.handleCanteenFilterChange()" style="padding: 7px 12px; border-radius: 10px; border: 1px solid var(--border-color); font-size: 13px; background: #f8fafc; color: var(--text-main); font-family: inherit;">
                            <option value="ALL">ทุกเดือนที่ผ่านมา</option>
                        </select>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">
                        แสดง <strong id="canteen-showing-count">0</strong> รายการ
                    </div>
                </div>

                <!-- Feed Container -->
                <div id="canteen-feed-list" style="display: flex; flex-direction: column; gap: 14px;">
                    <!-- การ์ดรีวิวจะถูกเรนเดอร์ตรงนี้ -->
                </div>
            </div>

            <!-- Modal เขียนรีวิวใหม่ -->
            <div id="canteen-review-modal" class="modal-overlay" style="display: none; align-items: center; justify-content: center; z-index: 2500;">
                <div class="modal-box" style="max-width: 540px; width: 92%; border-radius: 20px; overflow: hidden; background: white; padding: 0; box-shadow: 0 20px 50px rgba(0,0,0,0.2);">
                    <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); padding: 18px 22px; color: white; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: white;">
                            <i class="fa-solid fa-pen-fancy"></i> เขียนรีวิวโรงอาหารประจำเดือน
                        </h3>
                        <button type="button" onclick="window.closeCanteenReviewModal()" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;"><i class="fa-solid fa-xmark"></i></button>
                    </div>

                    <div style="padding: 20px; max-height: 75vh; overflow-y: auto;">
                        <!-- เลือกร้านค้า -->
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="font-size: 13px; font-weight: 700; color: var(--text-main); display: block; margin-bottom: 6px;">
                                🏪 เลือกร้านค้า หรือ บริเวณที่ต้องการรีวิว:
                            </label>
                            <select id="canteen-form-shop" class="form-control" style="border-radius: 10px;">
                                ${CANTEEN_PRESET_SHOPS.map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>

                        <!-- ให้คะแนนดาว 1-5 -->
                        <div class="form-group" style="margin-bottom: 16px; text-align: center; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 14px; padding: 14px;">
                            <label style="font-size: 13px; font-weight: 700; color: #92400e; display: block; margin-bottom: 6px;">
                                ให้คะแนนความพึงพอใจ:
                            </label>
                            <div id="canteen-star-selector" style="font-size: 32px; color: #f59e0b; cursor: pointer; display: flex; justify-content: center; gap: 8px;">
                                ${[1, 2, 3, 4, 5].map(i => `<i class="fa-solid fa-star" data-val="${i}" onclick="window.setCanteenRating(${i})"></i>`).join('')}
                            </div>
                            <span id="canteen-star-text" style="font-size: 12px; font-weight: 600; color: #b45309; display: block; margin-top: 4px;">ดีเยี่ยม (5/5)</span>
                        </div>

                        <!-- ค้นหา/ระบุนักเรียน -->
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="font-size: 13px; font-weight: 700; color: var(--text-main); display: block; margin-bottom: 6px;">
                                👤 ผู้ประเมิน (ชื่อ หรือ รหัสนักเรียน):
                            </label>
                            <input type="text" id="canteen-form-student-search" class="form-control" placeholder="พิมพ์ชื่อ นามสกุล หรือ รหัสนักเรียน..." autocomplete="off" oninput="window.handleCanteenStudentSearch(this.value)" style="border-radius: 10px;">
                            <div id="canteen-student-dropdown" style="display: none; background: white; border: 1px solid var(--border-color); border-radius: 10px; max-height: 150px; overflow-y: auto; margin-top: 4px; box-shadow: var(--shadow-md);"></div>
                            <div id="canteen-selected-student-badge" style="display: none; margin-top: 6px; padding: 6px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 12px; color: #166534; font-weight: 600;">
                                <i class="fa-solid fa-check-circle"></i> <span id="canteen-selected-student-text">-</span>
                            </div>
                        </div>

                        <!-- แท็กด่วน Quick Tags -->
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="font-size: 13px; font-weight: 700; color: var(--text-main); display: block; margin-bottom: 6px;">
                                🏷️ ติดแท็กความรู้สึก (กดเลือกได้หลายข้อ):
                            </label>
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;" id="canteen-tags-container">
                                ${CANTEEN_PRESET_TAGS.map(tag => `
                                    <button type="button" class="canteen-tag-pill" data-tag="${tag}" onclick="window.toggleCanteenTag('${tag}', this)" style="border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; padding: 5px 10px; border-radius: 20px; font-size: 12px; cursor: pointer; transition: 0.15s ease;">
                                        #${tag}
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- ข้อความรีวิว -->
                        <div class="form-group" style="margin-bottom: 14px;">
                            <label style="font-size: 13px; font-weight: 700; color: var(--text-main); display: block; margin-bottom: 6px;">
                                💬 ข้อความรีวิว / คำแนะนำเพิ่มเติม:
                            </label>
                            <textarea id="canteen-form-comment" class="form-control" rows="3" placeholder="รสชาติเป็นอย่างไร ปริมาณพออิ่มไหม มีข้อเสนอแนะอะไรถึงแม่ค้าหรือโรงเรียน..." style="border-radius: 10px; resize: vertical; font-family: inherit; font-size: 13px;"></textarea>
                        </div>
                    </div>

                    <div style="padding: 14px 20px; background: #f8fafc; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px;">
                        <button type="button" class="btn btn-secondary" onclick="window.closeCanteenReviewModal()" style="border-radius: 10px;">ยกเลิก</button>
                        <button type="button" class="btn btn-primary" onclick="window.submitCanteenReview()" style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); border: none; border-radius: 10px; font-weight: 700;">
                            <i class="fa-solid fa-paper-plane"></i> ส่งรีวิว
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------
    // ดึงข้อมูลรีวิวจาก Supabase (ตาราง app_data ที่ module = 'canteen')
    // -------------------------------------------------------------
    async function fetchCanteenReviews() {
        const db = getDb();
        if (!db) return;

        loading(true);
        try {
            const { data, error } = await db
                .from("app_data")
                .select("*")
                .eq("module", "canteen")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("fetchCanteenReviews error:", error);
                canteenReviewsCache = [];
            } else {
                canteenReviewsCache = data || [];
            }
            populateMonthFilterOptions();
            updateCanteenStats();
        } catch (e) {
            console.error("fetchCanteenReviews error:", e);
        } finally {
            loading(false);
        }
    }

    // -------------------------------------------------------------
    // คำนวณสรุปสถิติ (Average Stars & Top Shop)
    // -------------------------------------------------------------
    function updateCanteenStats() {
        const total = canteenReviewsCache.length;
        const totalEl = document.getElementById("canteen-stat-total-reviews");
        const avgEl = document.getElementById("canteen-stat-avg-stars");
        const topEl = document.getElementById("canteen-stat-top-shop");

        if (totalEl) totalEl.innerText = total;

        if (total === 0) {
            if (avgEl) avgEl.innerText = "0.0";
            if (topEl) topEl.innerText = "-";
            return;
        }

        let sumStars = 0;
        const shopScores = {};

        canteenReviewsCache.forEach(r => {
            const d = r.data || {};
            const star = parseInt(d.rating, 10) || 5;
            sumStars += star;

            const shop = d.shop_name || "ภาพรวมโรงอาหาร";
            if (!shopScores[shop]) shopScores[shop] = { sum: 0, count: 0 };
            shopScores[shop].sum += star;
            shopScores[shop].count += 1;
        });

        const avg = (sumStars / total).toFixed(1);
        if (avgEl) avgEl.innerText = avg;

        // ค้นหาร้านที่เฉลี่ยสูงสุด
        let bestShop = "-";
        let bestAvg = -1;
        Object.keys(shopScores).forEach(shop => {
            const shopAvg = shopScores[shop].sum / shopScores[shop].count;
            if (shopAvg > bestAvg) {
                bestAvg = shopAvg;
                bestShop = `${shop} (${shopAvg.toFixed(1)}⭐)`;
            }
        });

        if (topEl) topEl.innerText = bestShop;
    }

    // -------------------------------------------------------------
    // เรนเดอร์ฟีดรีวิว (Review Feed Cards)
    // -------------------------------------------------------------
    function renderCanteenFeed() {
        const feedContainer = document.getElementById("canteen-feed-list");
        const showingCountEl = document.getElementById("canteen-showing-count");
        if (!feedContainer) return;

        // กรองตามตัวเลือก
        const filtered = canteenReviewsCache.filter(item => {
            const d = item.data || {};
            if (canteenActiveShopFilter !== "ALL" && d.shop_name !== canteenActiveShopFilter) {
                return false;
            }
            if (canteenActiveMonthFilter !== "ALL" && item.date && !item.date.startsWith(canteenActiveMonthFilter)) {
                return false;
            }
            return true;
        });

        if (showingCountEl) showingCountEl.innerText = filtered.length;

        if (filtered.length === 0) {
            feedContainer.innerHTML = `
                <div style="background: white; border-radius: 16px; border: 1px dashed var(--border-color); padding: 40px; text-align: center; color: var(--text-muted);">
                    <div style="font-size: 36px; margin-bottom: 8px;">🍜</div>
                    <div style="font-weight: 600; font-size: 15px;">ยังไม่มีรีวิวตามเงื่อนไขที่เลือก</div>
                    <p style="font-size: 12px; margin-top: 4px;">เป็นคนแรกที่เขียนรีวิวร้านอาหารในโรงเรียนกันเถอะ!</p>
                </div>
            `;
            return;
        }

        let html = "";
        filtered.forEach(item => {
            const d = item.data || {};
            const stars = parseInt(d.rating, 10) || 5;
            const starIcons = [1, 2, 3, 4, 5].map(i => 
                `<i class="fa-solid fa-star" style="color: ${i <= stars ? '#f59e0b' : '#e2e8f0'}; font-size: 14px;"></i>`
            ).join('');

            const reviewerName = d.student_name || "นักเรียนซับบอน";
            const gradeRoom = d.grade_room ? ` (${d.grade_room})` : "";
            const tagsList = (d.tags && Array.isArray(d.tags)) ? d.tags : [];
            const likes = parseInt(d.likes, 10) || 0;
            const dateStr = item.date || (item.created_at ? item.created_at.split('T')[0] : '');

            html += `
                <div style="background: white; border: 1px solid var(--border-color); border-radius: 16px; padding: 18px 20px; box-shadow: var(--shadow-sm); transition: transform 0.15s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <div style="font-size: 15px; font-weight: 700; color: var(--text-main);">
                                <span style="background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; padding: 3px 8px; border-radius: 6px; font-size: 12px; margin-right: 6px;">
                                    ${escapeHtml(d.shop_name || 'ภาพรวม')}
                                </span>
                                ${reviewerName}<span style="font-weight: 500; font-size: 13px; color: var(--text-muted);">${gradeRoom}</span>
                            </div>
                            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                                <i class="fa-regular fa-calendar"></i> ${dateStr}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            ${starIcons}
                        </div>
                    </div>

                    ${d.comment ? `
                        <p style="margin: 8px 0 12px 0; font-size: 14px; color: #334155; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(d.comment)}</p>
                    ` : ''}

                    ${tagsList.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
                            ${tagsList.map(t => `<span style="font-size: 11px; background: #f1f5f9; color: #475569; padding: 3px 8px; border-radius: 12px; font-weight: 500;">#${escapeHtml(t)}</span>`).join('')}
                        </div>
                    ` : ''}

                    <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 10px; margin-top: 6px;">
                        <button type="button" onclick="window.likeCanteenReview('${item.id}', ${likes})" style="background: none; border: 1px solid #e2e8f0; border-radius: 16px; padding: 4px 12px; font-size: 12px; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-regular fa-thumbs-up" style="color: #ea580c;"></i> ถูกใจ <span id="like-count-${item.id}">${likes}</span>
                        </button>
                    </div>
                </div>
            `;
        });

        feedContainer.innerHTML = html;
    }

    // -------------------------------------------------------------
    // ฟังก์ชันจัดฟอร์ม และบันทึก
    // -------------------------------------------------------------
    window.openCanteenReviewModal = function() {
        const modal = document.getElementById("canteen-review-modal");
        if (modal) modal.style.display = "flex";
        canteenSelectedRating = 5;
        canteenSelectedTags.clear();
        canteenSelectedStudent = null;
        updateStarUI(5);
        document.querySelectorAll(".canteen-tag-pill").forEach(p => {
            p.style.background = "#f8fafc";
            p.style.color = "#475569";
            p.style.borderColor = "#e2e8f0";
        });
        const badge = document.getElementById("canteen-selected-student-badge");
        if (badge) badge.style.display = "none";
        const searchInput = document.getElementById("canteen-form-student-search");
        if (searchInput) searchInput.value = "";
        const commentInput = document.getElementById("canteen-form-comment");
        if (commentInput) commentInput.value = "";
    };

    window.closeCanteenReviewModal = function() {
        const modal = document.getElementById("canteen-review-modal");
        if (modal) modal.style.display = "none";
    };

    window.setCanteenRating = function(val) {
        canteenSelectedRating = val;
        updateStarUI(val);
    };

    function updateStarUI(val) {
        const stars = document.querySelectorAll("#canteen-star-selector i");
        stars.forEach(s => {
            const v = parseInt(s.getAttribute("data-val"), 10);
            if (v <= val) {
                s.style.color = "#f59e0b";
            } else {
                s.style.color = "#e2e8f0";
            }
        });
        const textMap = {
            1: "ปรับปรุง (1/5) ⭐",
            2: "พอใช้ (2/5) ⭐⭐",
            3: "ปานกลาง (3/5) ⭐⭐⭐",
            4: "ดีมาก (4/5) ⭐⭐⭐⭐",
            5: "ดีเยี่ยม (5/5) ⭐⭐⭐⭐⭐"
        };
        const textEl = document.getElementById("canteen-star-text");
        if (textEl) textEl.innerText = textMap[val] || `${val}/5`;
    }

    window.toggleCanteenTag = function(tag, btn) {
        if (canteenSelectedTags.has(tag)) {
            canteenSelectedTags.delete(tag);
            btn.style.background = "#f8fafc";
            btn.style.color = "#475569";
            btn.style.borderColor = "#e2e8f0";
        } else {
            canteenSelectedTags.add(tag);
            btn.style.background = "#fff7ed";
            btn.style.color = "#ea580c";
            btn.style.borderColor = "#ea580c";
        }
    };

    window.handleCanteenStudentSearch = function(query) {
        const dropdown = document.getElementById("canteen-student-dropdown");
        if (!dropdown) return;
        const q = (query || "").trim().toLowerCase();
        if (!q || typeof students === "undefined" || !students || students.length === 0) {
            dropdown.style.display = "none";
            return;
        }

        const matches = students.filter(s => 
            (s.fullName && s.fullName.toLowerCase().includes(q)) || 
            (s.studentId && s.studentId.includes(q))
        ).slice(0, 6);

        if (matches.length === 0) {
            dropdown.style.display = "none";
            return;
        }

        dropdown.innerHTML = matches.map(s => `
            <div onclick="window.selectCanteenStudent('${s.studentId}')" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; font-size: 13px;">
                <strong>${escapeHtml(s.fullName)}</strong> 
                <span style="color: #64748b; font-size: 12px;">(ม.${s.grade}/${s.room} รหัส ${s.studentId})</span>
            </div>
        `).join('');
        dropdown.style.display = "block";
    };

    window.selectCanteenStudent = function(studentId) {
        const dropdown = document.getElementById("canteen-student-dropdown");
        if (dropdown) dropdown.style.display = "none";

        if (typeof students !== "undefined" && students) {
            const s = students.find(x => x.studentId === studentId);
            if (s) {
                canteenSelectedStudent = s;
                const badge = document.getElementById("canteen-selected-student-badge");
                const text = document.getElementById("canteen-selected-student-text");
                const search = document.getElementById("canteen-form-student-search");
                if (text) text.innerText = `${s.fullName} (ม.${s.grade}/${s.room})`;
                if (badge) badge.style.display = "block";
                if (search) search.value = s.fullName;
            }
        }
    };

    // -------------------------------------------------------------
    // ส่งข้อมูลรีวิวเข้า Supabase (ตาราง app_data - JSONB)
    // -------------------------------------------------------------
    window.submitCanteenReview = async function() {
        const shop = document.getElementById("canteen-form-shop")?.value || "ภาพรวมโรงอาหาร";
        const comment = document.getElementById("canteen-form-comment")?.value.trim() || "";
        const searchInput = document.getElementById("canteen-form-student-search")?.value.trim() || "";

        let studentName = searchInput || "นักเรียนทั่วไป";
        let gradeRoom = "";
        let studentId = "";

        if (canteenSelectedStudent) {
            studentName = canteenSelectedStudent.fullName;
            gradeRoom = `ม.${canteenSelectedStudent.grade}/${canteenSelectedStudent.room}`;
            studentId = canteenSelectedStudent.studentId;
        }

        const now = new Date();
        const dateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const payload = {
            module: "canteen",
            student_id: studentId,
            date: dateIso,
            data: {
                shop_name: shop,
                rating: canteenSelectedRating,
                student_name: studentName,
                grade_room: gradeRoom,
                tags: Array.from(canteenSelectedTags),
                comment: comment,
                likes: 0
            }
        };

        const db = getDb();
        if (!db) {
            notify("ไม่พบการเชื่อมต่อฐานข้อมูล", "error");
            return;
        }

        loading(true);
        try {
            const { data, error } = await db.from("app_data").insert(payload);
            if (error) throw error;

            notify("ส่งรีวิวโรงอาหารสำเร็จ ขอบคุณสำหรับความคิดเห็นครับ! ⚡", "success");
            window.closeCanteenReviewModal();
            await fetchCanteenReviews();
            renderCanteenFeed();
        } catch (err) {
            console.error("submitCanteenReview error:", err);
            notify("บันทึกรีวิวไม่สำเร็จ: " + (err.message || err), "error");
        } finally {
            loading(false);
        }
    };

    // -------------------------------------------------------------
    // กดถูกใจรีวิว
    // -------------------------------------------------------------
    window.likeCanteenReview = async function(id, currentLikes) {
        const db = getDb();
        if (!db) return;

        const target = canteenReviewsCache.find(r => r.id === id);
        if (!target) return;

        const newLikes = (parseInt(target.data.likes, 10) || 0) + 1;
        target.data.likes = newLikes;

        const countSpan = document.getElementById(`like-count-${id}`);
        if (countSpan) countSpan.innerText = newLikes;

        try {
            await db
                .from("app_data")
                .update({ data: target.data })
                .eq("id", id);
        } catch (e) {
            console.warn("likeCanteenReview error:", e);
        }
    };

    // -------------------------------------------------------------
    // ตัวกรอง (Filter Change)
    // -------------------------------------------------------------
    window.handleCanteenFilterChange = function() {
        const shopSelect = document.getElementById("canteen-filter-shop");
        const monthSelect = document.getElementById("canteen-filter-month");
        if (shopSelect) canteenActiveShopFilter = shopSelect.value;
        if (monthSelect) canteenActiveMonthFilter = monthSelect.value;
        renderCanteenFeed();
    };

    function populateMonthFilterOptions() {
        const monthSelect = document.getElementById("canteen-filter-month");
        if (!monthSelect) return;

        const monthSet = new Set();
        canteenReviewsCache.forEach(r => {
            if (r.date && r.date.length >= 7) {
                monthSet.add(r.date.substring(0, 7)); // YYYY-MM
            }
        });

        const sortedMonths = Array.from(monthSet).sort().reverse();
        const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

        let html = '<option value="ALL">ทุกเดือนที่ผ่านมา</option>';
        sortedMonths.forEach(m => {
            const parts = m.split('-');
            if (parts.length === 2) {
                const y = parseInt(parts[0], 10) + 543;
                const mName = thaiMonths[parseInt(parts[1], 10) - 1] || parts[1];
                html += `<option value="${m}">${mName} ${y}</option>`;
            }
        });
        monthSelect.innerHTML = html;
        monthSelect.value = canteenActiveMonthFilter;
    }

    function escapeHtml(text) {
        if (!text) return "";
        return text.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
})();
