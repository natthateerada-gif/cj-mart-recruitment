(function () {
  'use strict';

  document.getElementById('year').textContent = new Date().getFullYear();

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function icon(name, extraClass) {
    return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  async function api(path, options = {}) {
    const opts = Object.assign({ credentials: 'include' }, options);
    opts.headers = Object.assign({}, options.headers);
    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
      opts.headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    opts.body = body;
    const res = await fetch(path, opts);
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    }
    if (!res.ok) {
      const message = (data && data.message) || `เกิดข้อผิดพลาด (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function toast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => { el.remove(); }, 4200);
  }

  function showModal(id) {
    document.getElementById('modal-backdrop').hidden = false;
    document.getElementById(id).hidden = false;
  }
  function hideModal(id) {
    document.getElementById(id).hidden = true;
    const anyOpen = ['pdpa-modal', 'success-modal', 'job-modal', 'faq-modal', 'hr-contact-modal']
      .some((mid) => mid !== id && !document.getElementById(mid).hidden);
    if (!anyOpen) document.getElementById('modal-backdrop').hidden = true;
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const STATUS_OPTIONS = ['ใหม่', 'ติดต่อแล้ว', 'นัดสัมภาษณ์', 'รับเข้าทำงาน', 'ไม่ผ่านการพิจารณา'];
  const TITLE_OPTIONS = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ ร.ต.', 'อื่นๆ'];
  const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const ANY_PROVINCE = 'เดินทางได้ทุกจังหวัด';
  const MAX_FILE_BYTES = 5 * 1024 * 1024; // keep in sync with src/upload.js
  const RESUME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const JOB_TYPES = ['งานประจำ', 'Part-time', 'สัญญาจ้าง', 'ฝึกงาน'];
  const WORK_DAYS = ['5 วัน/สัปดาห์', '6 วัน/สัปดาห์'];
  const PROVINCES = ["กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"];
  const SOURCE_OPTIONS = ['Facebook', 'Tiktok', 'โฆษณา Facebook', 'ป้ายโฆษณา', 'เพื่อนแนะนำ', 'Jobthai', 'JobBkk', 'JobsDB', 'LinkedIn', 'Line', 'อื่นๆ'];
  const EXPERIENCE_OPTIONS = ['ไม่มีประสบการณ์', 'น้อยกว่า 1 ปี', '1-2 ปี', '3-5 ปี', '6-10 ปี', 'มากกว่า 10 ปี'];

  const PAGES = ['home', 'jobs', 'apply', 'contact', 'admin'];

  const state = {
    page: 'home',
    jobs: [],
    faqRules: [],
    pdpa: { policyText: '', consentText: '' },
    siteContent: { companyOverview: '', social: { youtube: '', tiktok: '', facebook: '', instagram: '' } },
    hrContacts: [],
    bannerImages: [],
    chat: { history: [] },
    admin: {
      loggedIn: false,
      tab: 'applicants',
      loginError: '',
      applications: [], total: 0, page: 1, pageSize: 50,
      filterJobId: '', filterStatus: '',
      jobsAll: [],
      faqRules: [],
      pdpa: { policyText: '', consentText: '' },
      siteContent: { companyOverview: '', social: { youtube: '', tiktok: '', facebook: '', instagram: '' } },
      hrContacts: [],
      bannerImages: [],
    },
  };

  function showPage(page) {
    if (!PAGES.includes(page)) page = 'home';
    state.page = page;
    PAGES.forEach((p) => {
      const el = document.getElementById(`page-${p}`);
      if (el) el.hidden = p !== page;
    });
    document.querySelectorAll('.nav-links a[data-page]').forEach((a) => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let pendingApplicationForm = null; // FormData waiting on PDPA acceptance

  // ---------------------------------------------------------------------
  // Public: hero / jobs / apply / faq shell (rendered once)
  // ---------------------------------------------------------------------
  function renderShell() {
    document.getElementById('app').innerHTML = `
      <section id="page-home" class="hero">
        <div class="wrap">
          <div id="home-banner" class="banner-carousel" hidden></div>
        </div>
        <div class="wrap hero-grid">
          <div>
            <img class="hero-logo" src="/assets/logo.png" alt="CJ Mart">
            <span class="eyebrow">${icon('sparkles')} ร่วมงานกับ CJ Mart</span>
            <h1>สมัครงานร่วมงานกับเรา</h1>
            <p class="lead" id="home-overview">กำลังโหลดข้อมูลบริษัท...</p>
            <div class="hero-actions">
              <a href="#" class="btn btn-primary" data-page="jobs">${icon('briefcase')} ดูตำแหน่งงาน</a>
              <a href="#" class="btn btn-ghost" data-page="apply">${icon('clipboard-check')} สมัครงานเลย</a>
            </div>
            <div class="hero-stats">
              <div class="stat-item">${icon('users', 'icon-badge tone-green')}<div><strong id="stat-open-jobs">-</strong><span>ตำแหน่งเปิดรับ</span></div></div>
            </div>
            <div id="home-social" class="social-row"></div>
          </div>
          <div class="hero-card">
            <h3>สวัสดิการพนักงาน</h3>
            <ul>
              <li>${icon('banknote', 'icon-badge sm tone-gold')}<span class="txt">รายได้มั่นคง จ่ายเงินเดือน 2 รอบ (วันที่ 5 และ 20 ของเดือน)</span></li>
              <li>${icon('clock', 'icon-badge sm tone-blue')}<span class="txt">วันหยุดพักผ่อนประจำปี เริ่มต้นที่ 12-17 วัน</span></li>
              <li>${icon('shield', 'icon-badge sm tone-green')}<span class="txt">กองทุนสำรองเลี้ยงชีพ</span></li>
              <li>${icon('heart', 'icon-badge sm tone-red')}<span class="txt">ประกันชีวิต</span></li>
              <li>${icon('shield', 'icon-badge sm tone-blue')}<span class="txt">ประกันสังคม</span></li>
              <li>${icon('box', 'icon-badge sm tone-gold')}<span class="txt">สวัสดิการเงินกู้เพื่อที่อยู่อาศัย</span></li>
              <li>${icon('gift', 'icon-badge sm tone-green')}<span class="txt">โบนัสประจำปี (บางตำแหน่งงาน)</span></li>
              <li>${icon('heart', 'icon-badge sm tone-gold')}<span class="txt">ประกันสุขภาพ OPD/IPD (บางตำแหน่งงาน)</span></li>
              <li>${icon('shield', 'icon-badge sm tone-red')}<span class="txt">ค่าทันตกรรม (บางตำแหน่งงาน)</span></li>
              <li>${icon('sparkles', 'icon-badge sm tone-blue')}<span class="txt">สวัสดิการอื่นๆ ตามที่บริษัทกำหนด</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section id="page-jobs" hidden>
        <div class="wrap">
          <div class="section-head">
            <div><div class="heading-row">${icon('briefcase', 'icon-badge tone-green')}<h2>ตำแหน่งงานที่เปิดรับสมัคร</h2></div>
            <p>เลือกตำแหน่งที่สนใจ แล้วกดสมัครเพื่อไปที่แบบฟอร์มสมัครงาน</p></div>
          </div>
          <div id="jobs-content"></div>
        </div>
      </section>

      <section id="page-apply" hidden>
        <div class="wrap">
          <div class="section-head">
            <div><div class="heading-row">${icon('clipboard-check', 'icon-badge tone-blue')}<h2>ใบสมัครงาน</h2></div>
            <p>กรอกข้อมูลให้ครบถ้วน ทีมงานจะติดต่อกลับหากผ่านการพิจารณาเบื้องต้น</p></div>
          </div>
          <div id="apply-content"></div>
        </div>
      </section>

      <section id="page-contact" hidden>
        <div class="wrap">
          <div class="section-head">
            <div><div class="heading-row">${icon('users', 'icon-badge tone-blue')}<h2>ติดต่อเจ้าหน้าที่</h2></div>
            <p>เจ้าหน้าที่ฝ่ายบุคคลแต่ละท่านดูแลตำแหน่งงานต่างกัน เลือกติดต่อท่านที่ดูแลตำแหน่งที่คุณสนใจได้เลย</p></div>
          </div>
          <div id="contact-content"></div>
        </div>
      </section>

      <section id="page-admin" hidden>
        <div class="wrap">
          <div class="section-head">
            <div><div class="heading-row">${icon('shield', 'icon-badge tone-red')}<h2>สำหรับแอดมิน</h2></div>
            <p>เข้าสู่ระบบเพื่อจัดการใบสมัคร ตำแหน่งงาน แชทบอท นโยบาย PDPA ข้อมูลหน้าแรก และผู้ติดต่อ HR</p></div>
          </div>
          <div id="admin-content"></div>
        </div>
      </section>
    `;
  }

  // ---------------------------------------------------------------------
  // Home page
  // ---------------------------------------------------------------------
  const SOCIAL_LABELS = { youtube: 'YouTube', tiktok: 'TikTok', facebook: 'Facebook', instagram: 'Instagram' };

  function renderHome() {
    const overviewEl = document.getElementById('home-overview');
    if (overviewEl) overviewEl.outerHTML = `<div class="overview-text" id="home-overview">${esc(state.siteContent.companyOverview || 'CJ Mart ร้านสะดวกซื้อที่พร้อมให้คุณร่วมเป็นส่วนหนึ่งของทีม')}</div>`;
    const socialEl = document.getElementById('home-social');
    if (socialEl) {
      const links = Object.entries(state.siteContent.social || {}).filter(([, url]) => url);
      socialEl.innerHTML = links.map(([key, url]) => `
        <a class="social-link" href="${esc(url)}" target="_blank" rel="noopener">${icon('external-link')} ${esc(SOCIAL_LABELS[key] || key)}</a>
      `).join('');
    }
  }

  // ---------------------------------------------------------------------
  // Home banner (rotating images managed from the admin panel)
  // ---------------------------------------------------------------------
  let bannerTimer = null;
  let bannerIndex = 0;

  function goToBannerSlide(index) {
    const el = document.getElementById('home-banner');
    if (!el) return;
    const images = el.querySelectorAll('img');
    const dots = el.querySelectorAll('.banner-dots button');
    if (images.length === 0) return;
    bannerIndex = ((index % images.length) + images.length) % images.length;
    images.forEach((img, i) => img.classList.toggle('active', i === bannerIndex));
    dots.forEach((dot, i) => dot.classList.toggle('active', i === bannerIndex));
  }

  function renderBanner() {
    const el = document.getElementById('home-banner');
    if (!el) return;
    if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null; }
    const images = state.bannerImages;
    if (!images || images.length === 0) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      ${images.map((b, i) => `<img src="${esc(b.url)}" alt="แบนเนอร์ CJ Mart" class="${i === 0 ? 'active' : ''}">`).join('')}
      ${images.length > 1 ? `<div class="banner-dots">${images.map((b, i) => `<button type="button" data-action="banner-goto" data-index="${i}" class="${i === 0 ? 'active' : ''}" aria-label="ภาพที่ ${i + 1}"></button>`).join('')}</div>` : ''}
    `;
    bannerIndex = 0;
    if (images.length > 1) {
      bannerTimer = setInterval(() => goToBannerSlide(bannerIndex + 1), 4500);
    }
  }

  // ---------------------------------------------------------------------
  // Contact page
  // ---------------------------------------------------------------------
  function renderContact() {
    const el = document.getElementById('contact-content');
    if (!el) return;
    if (state.hrContacts.length === 0) {
      el.innerHTML = `<div class="empty-state">${icon('users')}<p>ยังไม่มีข้อมูลเจ้าหน้าที่ติดต่อ</p></div>`;
      return;
    }
    el.innerHTML = `<div class="job-grid">${state.hrContacts.map((c) => `
      <div class="contact-card">
        <div class="heading-row">${icon('users', 'icon-badge tone-blue')}<h3>${esc(c.name)}</h3></div>
        ${c.coverage ? `<p class="coverage">ดูแลตำแหน่ง: ${esc(c.coverage)}</p>` : ''}
        <div class="details">
          ${c.phone ? `<span>${icon('phone')} ${esc(c.phone)}</span>` : ''}
          ${c.email ? `<span>${icon('mail')} ${esc(c.email)}</span>` : ''}
          ${c.lineId ? `<span>${icon('message-circle')} LINE: ${esc(c.lineId)}</span>` : ''}
        </div>
      </div>
    `).join('')}</div>`;
  }

  // ---------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------
  function jobCard(job) {
    return `
      <div class="job-card">
        <div class="job-card-head">${icon('box', 'icon-badge tone-green')}<h3>${esc(job.title)}</h3></div>
        <div class="job-tags">
          ${job.type ? `<span class="tag">${esc(job.type)}</span>` : ''}
          ${job.workDays ? `<span class="tag">${esc(job.workDays)}</span>` : ''}
          ${job.shift ? `<span class="tag">${esc(job.shift)}</span>` : ''}
          ${job.workLocation ? `<span class="tag">${esc(job.workLocation)}</span>` : ''}
          ${job.salaryRange ? `<span class="tag salary">${esc(job.salaryRange)}</span>` : ''}
        </div>
        <p class="summary">${esc(job.summary)}</p>
        ${job.requirements ? `<p class="req">${esc(job.requirements)}</p>` : ''}
        <div class="row-end">
          <span class="status-pill open">เปิดรับสมัคร</span>
          <button type="button" class="btn btn-primary btn-sm" data-action="apply-to" data-job-id="${esc(job.id)}">สมัครตำแหน่งนี้</button>
        </div>
      </div>
    `;
  }

  function renderJobs() {
    const el = document.getElementById('jobs-content');
    document.getElementById('stat-open-jobs').textContent = state.jobs.length;
    if (state.jobs.length === 0) {
      el.innerHTML = `<div class="empty-state">${icon('box')}<p>ขณะนี้ยังไม่มีตำแหน่งงานที่เปิดรับสมัคร กรุณาติดตามใหม่อีกครั้ง</p></div>`;
      return;
    }
    el.innerHTML = `<div class="job-grid">${state.jobs.map(jobCard).join('')}</div>`;
  }

  // ---------------------------------------------------------------------
  // Apply form
  // ---------------------------------------------------------------------
  function yesNoField(name, label) {
    return `
      <div class="field full">
        <label>${label} <span class="required">*</span></label>
        <div class="check-grid">
          <label class="check-pill"><input type="radio" name="${name}" value="true"> ใช่</label>
          <label class="check-pill"><input type="radio" name="${name}" value="false"> ไม่ใช่</label>
        </div>
      </div>`;
  }

  function renderApply() {
    const el = document.getElementById('apply-content');
    const jobOptions = state.jobs.map((j) => `<option value="${esc(j.id)}">${esc(j.title)}</option>`).join('');
    const beNow = new Date().getFullYear() + 543;
    const dayOptions = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    const monthOptions = THAI_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    const yearOptions = Array.from({ length: 66 }, (_, i) => beNow - 15 - i).map((y) => `<option value="${y}">${y}</option>`).join('');
    el.innerHTML = `
      <div class="apply-shell">
        <form id="apply-form" novalidate>
          <div class="form-grid">
            <div class="field full">
              <label for="apply-job">ตำแหน่งที่สมัคร <span class="required">*</span></label>
              <select id="apply-job" required>
                <option value="">-- เลือกตำแหน่งงาน --</option>
                ${jobOptions}
              </select>
            </div>
            <div class="field">
              <label for="apply-title">คำนำหน้าชื่อ <span class="required">*</span></label>
              <select id="apply-title" required>
                <option value="">-- เลือกคำนำหน้า --</option>
                ${TITLE_OPTIONS.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
              </select>
            </div>
            <div class="field" id="apply-title-other-wrap" hidden>
              <label for="apply-title-other">ระบุคำนำหน้า <span class="required">*</span></label>
              <input id="apply-title-other" placeholder="เช่น ดร., พ.ต.ท.">
            </div>
            <div class="field">
              <label for="apply-name">ชื่อ-นามสกุล <span class="required">*</span></label>
              <input id="apply-name" required>
            </div>
            <div class="field full">
              <label>วัน/เดือน/ปีเกิด (พ.ศ.) <span class="required">*</span></label>
              <div class="date-row">
                <select id="apply-birth-day" aria-label="วัน"><option value="">วัน</option>${dayOptions}</select>
                <select id="apply-birth-month" aria-label="เดือน"><option value="">เดือน</option>${monthOptions}</select>
                <select id="apply-birth-year" aria-label="ปี พ.ศ."><option value="">ปี พ.ศ.</option>${yearOptions}</select>
              </div>
            </div>
            <div class="field">
              <label for="apply-phone">เบอร์โทรศัพท์ <span class="required">*</span> <span class="hint">(ตัวเลข 10 หลัก)</span></label>
              <input id="apply-phone" type="tel" inputmode="numeric" maxlength="10" required placeholder="0812345678" autocomplete="tel">
            </div>
            <div class="field">
              <label for="apply-email">อีเมล</label>
              <input id="apply-email" type="email" placeholder="(ถ้ามี)">
            </div>
            <div class="field">
              <label for="apply-line">ID Line <span class="hint">(ไม่บังคับ)</span></label>
              <input id="apply-line" placeholder="เช่น cjmart.hr">
            </div>
            <div class="field">
              <label for="apply-province">จังหวัดที่สมัคร <span class="required">*</span></label>
              <select id="apply-province" required>
                <option value="">-- เลือกจังหวัด --</option>
                <option value="${esc(ANY_PROVINCE)}">${esc(ANY_PROVINCE)}</option>
                ${PROVINCES.map((pv) => `<option value="${esc(pv)}">${esc(pv)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label for="apply-start-date">วันที่พร้อมเริ่มงาน <span class="required">*</span></label>
              <input id="apply-start-date" type="date" required>
            </div>
            <div class="field">
              <label for="apply-source">ช่องทางที่รับทราบประกาศสมัครงาน <span class="required">*</span></label>
              <select id="apply-source" required>
                <option value="">-- เลือกช่องทาง --</option>
                ${SOURCE_OPTIONS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
              </select>
            </div>
            <div class="field" id="apply-source-other-wrap" hidden>
              <label for="apply-source-other">ระบุช่องทางอื่นๆ</label>
              <input id="apply-source-other" placeholder="ระบุช่องทาง">
            </div>
            ${yesNoField('apply-can-drive', 'ขับรถยนต์ได้หรือไม่')}
            ${yesNoField('apply-has-license', 'มีใบขับขี่รถยนต์หรือไม่')}
            ${yesNoField('apply-criminal', 'เคยมีประวัติถูกดำเนินคดีมาก่อนหรือไม่')}
            <div class="field full" id="apply-criminal-detail-wrap" hidden>
              <label for="apply-criminal-detail">ระบุรายละเอียดคดี <span class="required">*</span></label>
              <textarea id="apply-criminal-detail" placeholder="ระบุข้อหา/รายละเอียดคดี และผลของคดี"></textarea>
            </div>
            ${yesNoField('apply-chronic', 'มีโรคประจำตัวหรือไม่')}
            <div class="field full" id="apply-chronic-detail-wrap" hidden>
              <label for="apply-chronic-detail">ระบุโรคประจำตัว <span class="required">*</span></label>
              <textarea id="apply-chronic-detail" placeholder="ระบุโรคประจำตัว"></textarea>
            </div>
            ${yesNoField('apply-karabao', 'เคยเป็นพนักงานในเครือคาราบาวหรือไม่')}
            <div class="field full" id="apply-karabao-company-wrap" hidden>
              <label for="apply-karabao-company">ระบุชื่อบริษัท <span class="required">*</span></label>
              <input type="text" id="apply-karabao-company" placeholder="ชื่อบริษัทในเครือคาราบาวที่เคยทำงาน" />
            </div>
            <div class="field full">
              <label for="apply-total-exp">จำนวนประสบการณ์ทำงานรวม <span class="required">*</span></label>
              <select id="apply-total-exp" required>
                <option value="">-- เลือกจำนวนประสบการณ์ --</option>
                ${EXPERIENCE_OPTIONS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
              </select>
            </div>
            <div class="field full">
              <label for="apply-experience">รายละเอียดประสบการณ์ทำงาน <span class="required">*</span></label>
              <textarea id="apply-experience" required placeholder="อธิบายงานที่เคยทำโดยย่อ (หากไม่มีประสบการณ์ ให้ระบุว่า &quot;ไม่มี&quot;)"></textarea>
            </div>
            <div class="field">
              <label for="apply-resume">แนบไฟล์ประวัติ/เรซูเม่ (PDF หรือรูปภาพ)</label>
              <div class="file-drop">${icon('upload')} <input id="apply-resume" type="file" accept=".pdf,image/png,image/jpeg,image/webp,image/gif"></div>
              <div class="file-error" id="apply-resume-error" role="alert" hidden></div>
            </div>
            <div class="field">
              <label for="apply-photo">แนบรูปถ่าย</label>
              <div class="file-drop">${icon('upload')} <input id="apply-photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
              <div class="file-error" id="apply-photo-error" role="alert" hidden></div>
            </div>
          </div>
          <p class="size-note">ไฟล์แนบแต่ละไฟล์มีขนาดไม่เกิน 5MB</p>
          <div id="apply-msg"></div>
          <div class="form-footer">
            <span class="hint">การส่งใบสมัครต้องยืนยันความยินยอม PDPA ก่อนทุกครั้ง</span>
            <button type="submit" class="btn btn-accent">${icon('clipboard-check')} ส่งใบสมัคร</button>
          </div>
        </form>
      </div>
    `;
  }

  function applyFormMsg(message, type) {
    const el = document.getElementById('apply-msg');
    el.innerHTML = message ? `<div class="form-msg ${type}">${esc(message)}</div>` : '';
  }

  function radioValue(name) {
    const c = document.querySelector(`input[name="${name}"]:checked`);
    return c ? c.value : '';
  }

  function validateApplyForm() {
    const errors = [];
    const jobId = document.getElementById('apply-job').value;
    const titleSel = document.getElementById('apply-title').value;
    const titleOther = document.getElementById('apply-title-other').value.trim();
    const titlePrefix = titleSel === 'อื่นๆ' ? titleOther : titleSel;
    const name = document.getElementById('apply-name').value.trim();
    const day = parseInt(document.getElementById('apply-birth-day').value, 10);
    const month = parseInt(document.getElementById('apply-birth-month').value, 10);
    const yearBE = parseInt(document.getElementById('apply-birth-year').value, 10);
    const phone = document.getElementById('apply-phone').value.trim();
    const province = document.getElementById('apply-province').value;
    const startDate = document.getElementById('apply-start-date').value;
    const canDriveCar = radioValue('apply-can-drive');
    const hasDriverLicense = radioValue('apply-has-license');
    const hasCriminalRecord = radioValue('apply-criminal');
    const criminalRecordDetail = document.getElementById('apply-criminal-detail').value.trim();
    const hasChronicDisease = radioValue('apply-chronic');
    const chronicDiseaseDetail = document.getElementById('apply-chronic-detail').value.trim();
    const workedAtKarabao = radioValue('apply-karabao');
    const karabaoCompany = document.getElementById('apply-karabao-company').value.trim();
    const sourceChannel = document.getElementById('apply-source').value;
    const sourceChannelOther = document.getElementById('apply-source-other').value.trim();
    const totalExperience = document.getElementById('apply-total-exp').value;
    const experience = document.getElementById('apply-experience').value.trim();

    // พ.ศ. -> ค.ศ., and make sure it is a real calendar date (e.g. not 31 Feb)
    let birthDate = '';
    if (day && month && yearBE) {
      const y = yearBE - 543;
      const dt = new Date(y, month - 1, day);
      if (dt.getFullYear() === y && dt.getMonth() === month - 1 && dt.getDate() === day) {
        birthDate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    if (!jobId) errors.push('กรุณาเลือกตำแหน่งที่สมัคร');
    if (!titleSel) errors.push('กรุณาเลือกคำนำหน้าชื่อ');
    else if (!titlePrefix) errors.push('กรุณาระบุคำนำหน้าชื่อ');
    if (!name) errors.push('กรุณากรอกชื่อ-นามสกุล');
    if (!birthDate) errors.push('กรุณาเลือกวัน เดือน ปีเกิดให้ถูกต้อง');
    if (!/^[0-9]{10}$/.test(phone)) errors.push('เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลักเท่านั้น');
    if (!province) errors.push('กรุณาเลือกจังหวัดที่สมัคร');
    if (!startDate) errors.push('กรุณาเลือกวันที่พร้อมเริ่มงาน');
    if (!canDriveCar) errors.push('กรุณาตอบคำถามว่าขับรถยนต์ได้หรือไม่');
    if (!hasDriverLicense) errors.push('กรุณาตอบคำถามว่ามีใบขับขี่รถยนต์หรือไม่');
    if (!hasCriminalRecord) errors.push('กรุณาตอบคำถามเรื่องประวัติถูกดำเนินคดี');
    else if (hasCriminalRecord === 'true' && !criminalRecordDetail) errors.push('กรุณาระบุรายละเอียดคดี');
    if (!hasChronicDisease) errors.push('กรุณาตอบคำถามเรื่องโรคประจำตัว');
    else if (hasChronicDisease === 'true' && !chronicDiseaseDetail) errors.push('กรุณาระบุโรคประจำตัว');
    if (!workedAtKarabao) errors.push('กรุณาตอบคำถามว่าเคยเป็นพนักงานในเครือคาราบาวหรือไม่');
    else if (workedAtKarabao === 'true' && !karabaoCompany) errors.push('กรุณาระบุชื่อบริษัทในเครือคาราบาวที่เคยทำงาน');
    if (!sourceChannel) errors.push('กรุณาเลือกช่องทางที่รับทราบประกาศสมัครงาน');
    if (!totalExperience) errors.push('กรุณาเลือกจำนวนประสบการณ์ทำงานรวม');
    if (!experience) errors.push('กรุณากรอกรายละเอียดประสบการณ์ทำงาน');
    return {
      errors, jobId, titleSel, titleOther, name, birthDate, phone, province, startDate,
      canDriveCar, hasDriverLicense, hasCriminalRecord, criminalRecordDetail,
      hasChronicDisease, chronicDiseaseDetail, workedAtKarabao, karabaoCompany,
      sourceChannel, sourceChannelOther, totalExperience, experience,
    };
  }

  function buildApplicationFormData(fields) {
    const fd = new FormData();
    fd.append('jobId', fields.jobId);
    fd.append('titlePrefix', fields.titleSel);
    fd.append('titlePrefixOther', fields.titleOther);
    fd.append('name', fields.name);
    fd.append('birthDate', fields.birthDate);
    fd.append('phone', fields.phone);
    fd.append('email', document.getElementById('apply-email').value.trim());
    fd.append('lineId', document.getElementById('apply-line').value.trim());
    fd.append('province', fields.province);
    fd.append('startDate', fields.startDate);
    fd.append('canDriveCar', fields.canDriveCar);
    fd.append('hasDriverLicense', fields.hasDriverLicense);
    fd.append('hasCriminalRecord', fields.hasCriminalRecord);
    fd.append('criminalRecordDetail', fields.hasCriminalRecord === 'true' ? fields.criminalRecordDetail : '');
    fd.append('hasChronicDisease', fields.hasChronicDisease);
    fd.append('chronicDiseaseDetail', fields.hasChronicDisease === 'true' ? fields.chronicDiseaseDetail : '');
    fd.append('workedAtKarabao', fields.workedAtKarabao);
    fd.append('karabaoCompany', fields.workedAtKarabao === 'true' ? fields.karabaoCompany : '');
    fd.append('sourceChannel', fields.sourceChannel);
    fd.append('sourceChannelOther', fields.sourceChannelOther);
    fd.append('totalExperience', fields.totalExperience);
    fd.append('experience', fields.experience);
    const resumeFile = document.getElementById('apply-resume').files[0];
    const photoFile = document.getElementById('apply-photo').files[0];
    if (resumeFile) fd.append('resumeFile', resumeFile);
    if (photoFile) fd.append('photoFile', photoFile);
    return fd;
  }

  async function handleApplySubmit(e) {
    e.preventDefault();
    applyFormMsg('', '');
    const { errors, ...fields } = validateApplyForm();
    if (errors.length > 0) {
      applyFormMsg(errors.join(' / '), 'error');
      return;
    }
    pendingApplicationForm = buildApplicationFormData(fields);
    document.getElementById('pdpa-scroll-content').textContent = state.pdpa.policyText || 'กำลังโหลดนโยบายความเป็นส่วนตัว...';
    document.getElementById('pdpa-consent-label').textContent = state.pdpa.consentText || 'ข้าพเจ้ายินยอมให้เก็บรวบรวมและใช้ข้อมูลส่วนบุคคลเพื่อการพิจารณาสมัครงาน';
    document.getElementById('pdpa-consent-check').checked = false;
    document.getElementById('pdpa-accept-btn').disabled = true;
    showModal('pdpa-modal');
  }

  async function submitPendingApplication() {
    if (!pendingApplicationForm) return;
    pendingApplicationForm.append('pdpaConsent', 'true');
    const acceptBtn = document.getElementById('pdpa-accept-btn');
    acceptBtn.disabled = true;
    acceptBtn.textContent = 'กำลังส่ง...';
    try {
      await api('/api/applications', { method: 'POST', body: pendingApplicationForm });
      hideModal('pdpa-modal');
      showModal('success-modal');
      document.getElementById('apply-form').reset();
      ['apply-title-other-wrap', 'apply-source-other-wrap', 'apply-criminal-detail-wrap', 'apply-chronic-detail-wrap', 'apply-karabao-company-wrap', 'apply-resume-error', 'apply-photo-error'].forEach((id) => { document.getElementById(id).hidden = true; });
      applyFormMsg('', '');
    } catch (err) {
      hideModal('pdpa-modal');
      applyFormMsg(err.message, 'error');
      toast(err.message, 'error');
    } finally {
      pendingApplicationForm = null;
      acceptBtn.textContent = 'ยอมรับและส่งใบสมัคร';
      acceptBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------------------
  // Chatbot (keyword rules, all managed by admins; the starter set is seeded into the DB once)
  // ---------------------------------------------------------------------
  function findFaqAnswer(question) {
    const q = question.toLowerCase();
    const all = state.faqRules;
    for (const rule of all) {
      if (rule.keywords.some((k) => q.includes(String(k).toLowerCase()))) {
        return rule.answer;
      }
    }
    return 'ขออภัยค่ะ ผู้ช่วยยังไม่มีคำตอบสำหรับคำถามนี้ กรุณาลองถามด้วยคำอื่น หรือรอเจ้าหน้าที่ติดต่อกลับหลังส่งใบสมัครนะคะ';
  }

  function chatAppend(text, who) {
    const body = document.getElementById('chat-body');
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function renderChatChips() {
    const chips = document.getElementById('chat-chips');
    const sample = state.faqRules.slice(0, 8);
    chips.innerHTML = sample.map((r) => `<button type="button" class="chat-chip" data-action="chat-chip" data-q="${esc(r.keywords[0])}">${esc(r.keywords[0])}</button>`).join('');
  }

  function initChat() {
    chatAppend('สวัสดีค่ะ 👋 มีอะไรให้ช่วยเกี่ยวกับตำแหน่งงานของ CJ Mart ไหมคะ', 'bot');
    renderChatChips();
  }

  // ---------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------
  function renderAdminLogin() {
    const el = document.getElementById('admin-content');
    el.innerHTML = `
      <div class="admin-gate">
        ${icon('lock', 'icon-badge tone-red')}
        <h3>เข้าสู่ระบบแอดมิน</h3>
        <p>กรอกรหัสผ่านเพื่อจัดการใบสมัครและตำแหน่งงาน</p>
        <form id="admin-login-form">
          <input id="admin-password" type="password" placeholder="รหัสผ่านแอดมิน" required autocomplete="current-password">
          ${state.admin.loginError ? `<div class="form-msg error">${esc(state.admin.loginError)}</div>` : ''}
          <button type="submit" class="btn btn-primary btn-block">เข้าสู่ระบบ</button>
        </form>
      </div>
    `;
  }

  function adminTabsHtml() {
    const tabs = [
      ['applicants', 'ผู้สมัครงาน'],
      ['jobs', 'จัดการตำแหน่งงาน'],
      ['faq', 'ตั้งค่าแชทบอท'],
      ['pdpa', 'นโยบาย PDPA'],
      ['siteContent', 'ข้อมูลหน้าแรก'],
      ['hrContacts', 'ผู้ติดต่อ HR'],
      ['bannerImages', 'แบนเนอร์หน้าแรก'],
    ];
    return `
      <div class="admin-toolbar">
        <div class="admin-tabs">
          ${tabs.map(([key, label]) => `<button type="button" class="admin-tab${state.admin.tab === key ? ' active' : ''}" data-action="admin-tab" data-tab="${key}">${esc(label)}</button>`).join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="admin-logout">${icon('log-out')} ออกจากระบบ</button>
      </div>
    `;
  }

  function statusBadgeColor(status) {
    if (status === 'รับเข้าทำงาน') return 'tone-green';
    if (status === 'ไม่ผ่านการพิจารณา') return 'tone-red';
    if (status === 'นัดสัมภาษณ์') return 'tone-gold';
    return 'tone-blue';
  }

  const yn = (v) => (v === true ? 'ใช่' : v === false ? 'ไม่ใช่' : '-');

  function renderAdminApplicants() {
    const a = state.admin;
    const jobOptions = a.jobsAll.map((j) => `<option value="${esc(j.id)}" ${a.filterJobId === j.id ? 'selected' : ''}>${esc(j.title)}</option>`).join('');
    const statusOptions = STATUS_OPTIONS.map((s) => `<option value="${esc(s)}" ${a.filterStatus === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const rows = a.applications.map((app) => `
      <tr>
        <td>${app.submittedAt ? new Date(app.submittedAt).toLocaleString('th-TH') : '-'}</td>
        <td>${esc(((app.titlePrefix || '') + ' ' + app.name).trim())}${app.birthDate ? `<br><span class="hint">เกิด ${esc(new Date(app.birthDate).toLocaleDateString('th-TH'))}</span>` : ''}</td>
        <td>${esc(app.jobTitle)}</td>
        <td>${esc(app.phone)}${app.email ? '<br>' + esc(app.email) : ''}${app.lineId ? '<br>LINE: ' + esc(app.lineId) : ''}</td>
        <td>${esc(app.province || app.area || '-')}</td>
        <td>${app.startDate ? new Date(app.startDate).toLocaleDateString('th-TH') : '-'}</td>
        <td class="extra-info">${app.canDriveCar === null && app.hasDriverLicense === null && app.hasCriminalRecord === null && !app.totalExperience && !app.sourceChannel
          ? esc((app.availability || []).join(', ') || '-')
          : `ขับรถยนต์: ${esc(yn(app.canDriveCar))}<br>ใบขับขี่: ${esc(yn(app.hasDriverLicense))}<br>ประวัติคดี: ${esc(yn(app.hasCriminalRecord))}${app.hasCriminalRecord && app.criminalRecordDetail ? ` (${esc(app.criminalRecordDetail)})` : ''}<br>โรคประจำตัว: ${esc(yn(app.hasChronicDisease))}${app.hasChronicDisease && app.chronicDiseaseDetail ? ` (${esc(app.chronicDiseaseDetail)})` : ''}<br>เคยทำงานเครือคาราบาว: ${esc(yn(app.workedAtKarabao))}${app.workedAtKarabao && app.karabaoCompany ? ` (${esc(app.karabaoCompany)})` : ''}<br>ประสบการณ์รวม: ${esc(app.totalExperience || '-')}<br>รู้จักงานจาก: ${esc(app.sourceChannel || '-')}`}</td>
        <td>
          <select class="status-select" data-action="app-status" data-id="${esc(app.id)}">
            ${STATUS_OPTIONS.map((s) => `<option value="${esc(s)}" ${app.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </td>
        <td>
          ${app.hasResume ? `<a href="/api/admin/applications/${esc(app.id)}/resume" target="_blank">${icon('download')} ประวัติ</a><br>` : ''}
          ${app.hasPhoto ? `<a href="/api/admin/applications/${esc(app.id)}/photo" target="_blank">${icon('download')} รูปถ่าย</a>` : ''}
        </td>
        <td><button type="button" class="btn btn-danger btn-sm" data-action="app-delete" data-id="${esc(app.id)}">${icon('trash')}</button></td>
      </tr>
    `).join('');

    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <div class="stat-row">
        <div class="stat-card">${icon('users', 'icon-badge tone-blue')}<div><strong>${a.total}</strong><span>ใบสมัครทั้งหมด</span></div></div>
        <div class="stat-card">${icon('briefcase', 'icon-badge tone-green')}<div><strong>${a.jobsAll.filter((j) => j.open).length}</strong><span>ตำแหน่งเปิดรับ</span></div></div>
      </div>
      <div class="admin-toolbar">
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
          <select id="admin-filter-job" style="width:auto;"><option value="">ทุกตำแหน่ง</option>${jobOptions}</select>
          <select id="admin-filter-status" style="width:auto;"><option value="">ทุกสถานะ</option>${statusOptions}</select>
        </div>
        <div style="display:flex;gap:.5rem;">
          <a class="btn btn-ghost btn-sm" href="/api/admin/export/applicants.csv">${icon('download')} CSV</a>
          <a class="btn btn-ghost btn-sm" href="/api/admin/export/applicants.json">${icon('download')} JSON</a>
        </div>
      </div>
      <div class="table-wrap">
        <table class="applicants">
          <thead><tr><th>วันที่สมัคร</th><th>ชื่อ</th><th>ตำแหน่ง</th><th>ติดต่อ</th><th>จังหวัด</th><th>วันเริ่มงาน</th><th>ข้อมูลเพิ่มเติม</th><th>สถานะ</th><th>ไฟล์แนบ</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="10"><div class="empty-state">ยังไม่มีใบสมัครในเงื่อนไขนี้</div></td></tr>`}</tbody>
        </table>
      </div>
    `;
    document.getElementById('admin-filter-job').addEventListener('change', (e) => {
      state.admin.filterJobId = e.target.value;
      loadAdminApplications();
    });
    document.getElementById('admin-filter-status').addEventListener('change', (e) => {
      state.admin.filterStatus = e.target.value;
      loadAdminApplications();
    });
  }

  function renderAdminJobs() {
    const a = state.admin;
    const rows = a.jobsAll.map((j) => `
      <div class="job-manage-row">
        <div><strong>${esc(j.title)}</strong> <span class="status-pill ${j.open ? 'open' : 'closed'}">${j.open ? 'เปิดรับสมัคร' : 'ปิดรับสมัคร'}</span><br>
        <span class="hint">${[j.type, j.workDays, j.shift, j.workLocation, j.salaryRange].filter(Boolean).map(esc).join(' · ')}</span></div>
        <div style="display:flex;gap:.4rem;">
          <button type="button" class="btn btn-ghost btn-sm" data-action="job-toggle" data-id="${esc(j.id)}">${j.open ? 'ปิดรับสมัคร' : 'เปิดรับสมัคร'}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="job-edit" data-id="${esc(j.id)}">${icon('edit')}</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="job-delete" data-id="${esc(j.id)}">${icon('trash')}</button>
        </div>
      </div>
    `).join('');
    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <div class="admin-toolbar">
        <button type="button" class="btn btn-primary btn-sm" data-action="job-new">${icon('plus')} เพิ่มตำแหน่งงาน</button>
        <div style="display:flex;gap:.5rem;">
          <a class="btn btn-ghost btn-sm" href="/api/admin/export/jobs.csv">${icon('download')} ส่งออก CSV</a>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;">${icon('upload')} นำเข้า CSV<input type="file" id="job-import-input" accept=".csv" style="display:none;"></label>
        </div>
      </div>
      <div class="job-manage">${rows || `<div class="empty-state">ยังไม่มีตำแหน่งงาน</div>`}</div>
    `;
    document.getElementById('job-import-input').addEventListener('change', handleJobImport);
  }

  function renderAdminFaq() {
    const a = state.admin;
    const rows = a.faqRules.map((r) => `
      <div class="job-manage-row faq-rule-row">
        <div class="faq-rule-text"><strong>${esc(r.keywords.join(', '))}</strong><br><span class="hint">${esc(r.answer)}</span></div>
        <div class="faq-rule-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="faq-edit" data-id="${esc(r.id)}" aria-label="แก้ไข">${icon('edit')}</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="faq-delete" data-id="${esc(r.id)}" aria-label="ลบ">${icon('trash')}</button>
        </div>
      </div>
    `).join('');
    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <div class="admin-toolbar">
        <span class="hint">คำตอบที่เพิ่มไว้นี้จะถูกตรวจสอบก่อนคำตอบเริ่มต้นของแชทบอทเสมอ และแสดงเป็นปุ่มลัดในแชท (สูงสุด 8 ข้อแรก)</span>
        <button type="button" class="btn btn-primary btn-sm" data-action="faq-new">${icon('plus')} เพิ่มคำตอบแชทบอท</button>
      </div>
      <div class="job-manage">${rows || `<div class="empty-state">ยังไม่มีคำตอบที่เพิ่มเอง (ระบบจะใช้คำตอบเริ่มต้นของแชทบอท)</div>`}</div>
    `;
  }

  function renderAdminPdpa() {
    const p = state.admin.pdpa;
    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <form id="pdpa-edit-form" style="display:flex;flex-direction:column;gap:1rem;max-width:720px;">
        <div class="field">
          <label for="pdpa-edit-policy">เนื้อหานโยบายความเป็นส่วนตัว (แสดงในหน้าต่างยืนยันก่อนส่งใบสมัคร)</label>
          <textarea id="pdpa-edit-policy" style="min-height:12rem;">${esc(p.policyText)}</textarea>
        </div>
        <div class="field">
          <label for="pdpa-edit-consent">ข้อความยินยอม (แสดงข้าง checkbox ยืนยัน)</label>
          <textarea id="pdpa-edit-consent">${esc(p.consentText)}</textarea>
        </div>
        <div><button type="submit" class="btn btn-primary">บันทึก</button></div>
      </form>
    `;
    document.getElementById('pdpa-edit-form').addEventListener('submit', handlePdpaEditSubmit);
  }

  function renderAdminSiteContent() {
    const s = state.admin.siteContent;
    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <form id="site-content-edit-form" style="display:flex;flex-direction:column;gap:1rem;max-width:720px;">
        <div class="field">
          <label for="site-content-overview">ข้อความภาพรวมบริษัท (แสดงในหน้าแรก)</label>
          <textarea id="site-content-overview" style="min-height:8rem;">${esc(s.companyOverview)}</textarea>
        </div>
        <div class="form-grid">
          <div class="field"><label for="site-content-youtube">ลิงก์ YouTube</label><input id="site-content-youtube" value="${esc(s.social.youtube)}" placeholder="https://youtube.com/..."></div>
          <div class="field"><label for="site-content-tiktok">ลิงก์ TikTok</label><input id="site-content-tiktok" value="${esc(s.social.tiktok)}" placeholder="https://tiktok.com/..."></div>
          <div class="field"><label for="site-content-facebook">ลิงก์ Facebook</label><input id="site-content-facebook" value="${esc(s.social.facebook)}" placeholder="https://facebook.com/..."></div>
          <div class="field"><label for="site-content-instagram">ลิงก์ Instagram</label><input id="site-content-instagram" value="${esc(s.social.instagram)}" placeholder="https://instagram.com/..."></div>
        </div>
        <p class="hint">เว้นว่างช่องไหนไว้ จะไม่แสดงปุ่มลิงก์นั้นในหน้าแรก</p>
        <div><button type="submit" class="btn btn-primary">บันทึก</button></div>
      </form>
    `;
    document.getElementById('site-content-edit-form').addEventListener('submit', handleSiteContentEditSubmit);
  }

  function renderAdminHrContacts() {
    const rows = state.admin.hrContacts.map((c) => `
      <div class="job-manage-row">
        <div><strong>${esc(c.name)}</strong>${c.coverage ? ` <span class="hint">— ${esc(c.coverage)}</span>` : ''}<br>
        <span class="hint">${[c.phone, c.email, c.lineId ? 'LINE: ' + c.lineId : ''].filter(Boolean).map(esc).join(' · ')}</span></div>
        <div style="display:flex;gap:.4rem;">
          <button type="button" class="btn btn-ghost btn-sm" data-action="hr-contact-edit" data-id="${esc(c.id)}">${icon('edit')}</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="hr-contact-delete" data-id="${esc(c.id)}">${icon('trash')}</button>
        </div>
      </div>
    `).join('');
    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <div class="admin-toolbar">
        <span class="hint">รายชื่อนี้จะแสดงในหน้า "ติดต่อเจ้าหน้าที่" ของเว็บสาธารณะ</span>
        <button type="button" class="btn btn-primary btn-sm" data-action="hr-contact-new">${icon('plus')} เพิ่มเจ้าหน้าที่</button>
      </div>
      <div class="job-manage">${rows || `<div class="empty-state">ยังไม่มีข้อมูลเจ้าหน้าที่ติดต่อ</div>`}</div>
    `;
  }

  function renderAdminBannerImages() {
    const images = state.admin.bannerImages;
    const cards = images.map((b) => `
      <div class="banner-thumb">
        <img src="${esc(b.url)}" alt="แบนเนอร์">
        <button type="button" class="btn btn-danger btn-sm" data-action="banner-delete" data-id="${esc(b.id)}">${icon('trash')}</button>
      </div>
    `).join('');
    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <div class="admin-toolbar">
        <span class="hint">ภาพที่เพิ่มไว้นี้จะหมุนแสดงเป็นแบนเนอร์บนหน้าแรก (แนะนำภาพแนวนอน ขนาดไม่เกิน 5MB)</span>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;">${icon('upload')} เพิ่มรูปแบนเนอร์<input type="file" id="banner-upload-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none;"></label>
      </div>
      <div class="banner-thumb-grid">${cards || `<div class="empty-state">ยังไม่มีรูปแบนเนอร์ — อัปโหลดรูปแรกได้เลย</div>`}</div>
    `;
    document.getElementById('banner-upload-input').addEventListener('change', handleBannerUpload);
  }

  function renderAdmin() {
    if (!state.admin.loggedIn) { renderAdminLogin(); return; }
    if (state.admin.tab === 'jobs') renderAdminJobs();
    else if (state.admin.tab === 'faq') renderAdminFaq();
    else if (state.admin.tab === 'pdpa') renderAdminPdpa();
    else if (state.admin.tab === 'siteContent') renderAdminSiteContent();
    else if (state.admin.tab === 'hrContacts') renderAdminHrContacts();
    else if (state.admin.tab === 'bannerImages') renderAdminBannerImages();
    else renderAdminApplicants();
  }

  async function loadAdminApplications() {
    const params = new URLSearchParams();
    if (state.admin.filterJobId) params.set('jobId', state.admin.filterJobId);
    if (state.admin.filterStatus) params.set('status', state.admin.filterStatus);
    params.set('page', state.admin.page);
    params.set('pageSize', state.admin.pageSize);
    const data = await api(`/api/admin/applications?${params.toString()}`);
    state.admin.applications = data.applications;
    state.admin.total = data.total;
    renderAdminApplicants();
  }

  async function loadAdminData() {
    const [jobsAll, faqRules, pdpa, siteContent, hrContacts, bannerImages] = await Promise.all([
      api('/api/admin/jobs'),
      api('/api/faq-rules'),
      api('/api/admin/pdpa'),
      api('/api/admin/site-content'),
      api('/api/admin/hr-contacts'),
      api('/api/admin/banner-images'),
    ]);
    state.admin.jobsAll = jobsAll;
    state.admin.faqRules = faqRules;
    state.admin.pdpa = pdpa;
    state.admin.siteContent = siteContent;
    state.admin.hrContacts = hrContacts;
    state.admin.bannerImages = bannerImages;
    await loadAdminApplications();
  }

  async function checkAdminSession() {
    try {
      const { loggedIn } = await api('/api/admin/session');
      state.admin.loggedIn = loggedIn;
      if (loggedIn) await loadAdminData();
      else renderAdmin();
    } catch (e) {
      renderAdmin();
    }
  }

  async function handleAdminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      state.admin.loggedIn = true;
      state.admin.loginError = '';
      await loadAdminData();
      toast('เข้าสู่ระบบสำเร็จ', 'success');
    } catch (err) {
      state.admin.loginError = err.message;
      renderAdminLogin();
    }
  }

  async function handleAdminLogout() {
    await api('/api/admin/logout', { method: 'POST' });
    state.admin.loggedIn = false;
    renderAdmin();
    toast('ออกจากระบบแล้ว', 'info');
  }

  async function handleAppStatusChange(e) {
    const id = e.target.dataset.id;
    try {
      await api(`/api/admin/applications/${id}`, { method: 'PATCH', body: { status: e.target.value } });
      toast('อัปเดตสถานะแล้ว', 'success');
      await loadAdminApplications();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleAppDelete(id) {
    if (!confirm('ยืนยันลบใบสมัครนี้?')) return;
    try {
      await api(`/api/admin/applications/${id}`, { method: 'DELETE' });
      toast('ลบใบสมัครแล้ว', 'success');
      await loadAdminApplications();
    } catch (err) { toast(err.message, 'error'); }
  }

  // Jobs (admin)
  function openJobModal(job) {
    document.getElementById('job-modal-title').textContent = job ? 'แก้ไขตำแหน่งงาน' : 'เพิ่มตำแหน่งงานใหม่';
    document.getElementById('job-form-id').value = job ? job.id : '';
    document.getElementById('job-form-title').value = job ? job.title : '';
    const optHtml = (list, placeholder) => `<option value="">${esc(placeholder)}</option>` + list.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    const typeSel = document.getElementById('job-form-type');
    typeSel.innerHTML = optHtml(JOB_TYPES, '-- เลือกประเภทงาน --');
    typeSel.value = job && JOB_TYPES.includes(job.type) ? job.type : '';
    const daysSel = document.getElementById('job-form-workdays');
    daysSel.innerHTML = optHtml(WORK_DAYS, '-- เลือกวันทำงาน --');
    daysSel.value = job && WORK_DAYS.includes(job.workDays) ? job.workDays : '';
    const locSel = document.getElementById('job-form-location');
    locSel.innerHTML = optHtml([ANY_PROVINCE].concat(PROVINCES), '-- เลือกสถานที่ปฏิบัติงาน --');
    locSel.value = job && (job.workLocation === ANY_PROVINCE || PROVINCES.includes(job.workLocation)) ? job.workLocation : '';
    document.getElementById('job-form-shift').value = job ? job.shift : '';
    document.getElementById('job-form-salary').value = job ? job.salaryRange : '';
    document.getElementById('job-form-summary').value = job ? job.summary : '';
    document.getElementById('job-form-requirements').value = job ? job.requirements : '';
    showModal('job-modal');
  }

  async function handleJobFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('job-form-id').value;
    const payload = {
      title: document.getElementById('job-form-title').value.trim(),
      type: document.getElementById('job-form-type').value.trim(),
      workDays: document.getElementById('job-form-workdays').value.trim(),
      workLocation: document.getElementById('job-form-location').value.trim(),
      shift: document.getElementById('job-form-shift').value.trim(),
      salaryRange: document.getElementById('job-form-salary').value.trim(),
      summary: document.getElementById('job-form-summary').value.trim(),
      requirements: document.getElementById('job-form-requirements').value.trim(),
    };
    try {
      if (id) await api(`/api/admin/jobs/${id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/jobs', { method: 'POST', body: payload });
      hideModal('job-modal');
      toast('บันทึกตำแหน่งงานแล้ว', 'success');
      await refreshJobsEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleJobToggle(job) {
    try {
      await api(`/api/admin/jobs/${job.id}`, { method: 'PATCH', body: { open: !job.open } });
      await refreshJobsEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleJobDelete(id) {
    if (!confirm('ยืนยันลบตำแหน่งงานนี้? ใบสมัครที่เกี่ยวข้องจะยังคงอยู่')) return;
    try {
      await api(`/api/admin/jobs/${id}`, { method: 'DELETE' });
      toast('ลบตำแหน่งงานแล้ว', 'success');
      await refreshJobsEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleJobImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await api('/api/admin/import/jobs', { method: 'POST', body: text, headers: { 'Content-Type': 'text/csv' } });
      toast(`นำเข้าสำเร็จ: เพิ่มใหม่ ${result.created} รายการ, อัปเดต ${result.updated} รายการ`, 'success');
      await refreshJobsEverywhere();
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  }

  async function refreshJobsEverywhere() {
    state.jobs = await api('/api/jobs');
    renderJobs();
    renderApply();
    if (state.admin.loggedIn) {
      state.admin.jobsAll = await api('/api/admin/jobs');
      renderAdmin();
    }
  }

  // FAQ (admin)
  function openFaqModal(rule) {
    document.getElementById('faq-modal-title').textContent = rule ? 'แก้ไขคำตอบแชทบอท' : 'เพิ่มคำตอบให้แชทบอท';
    document.getElementById('faq-form-id').value = rule ? rule.id : '';
    document.getElementById('faq-form-keywords').value = rule ? rule.keywords.join(', ') : '';
    document.getElementById('faq-form-answer').value = rule ? rule.answer : '';
    showModal('faq-modal');
  }

  async function handleFaqFormSubmit(e) {
    e.preventDefault();
    const keywords = document.getElementById('faq-form-keywords').value.split(',').map((s) => s.trim()).filter(Boolean);
    const answer = document.getElementById('faq-form-answer').value.trim();
    const id = document.getElementById('faq-form-id').value;
    try {
      if (id) await api(`/api/admin/faq-rules/${id}`, { method: 'PATCH', body: { keywords, answer } });
      else await api('/api/admin/faq-rules', { method: 'POST', body: { keywords, answer } });
      hideModal('faq-modal');
      toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มคำตอบแล้ว', 'success');
      await refreshFaqEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleFaqDelete(id) {
    if (!confirm('ยืนยันลบคำถามนี้?')) return;
    try {
      await api(`/api/admin/faq-rules/${id}`, { method: 'DELETE' });
      toast('ลบคำถามแล้ว', 'success');
      await refreshFaqEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function refreshFaqEverywhere() {
    state.faqRules = await api('/api/faq-rules');
    renderChatChips();
    if (state.admin.loggedIn) {
      state.admin.faqRules = state.faqRules;
      renderAdmin();
    }
  }

  async function handlePdpaEditSubmit(e) {
    e.preventDefault();
    const policyText = document.getElementById('pdpa-edit-policy').value.trim();
    const consentText = document.getElementById('pdpa-edit-consent').value.trim();
    try {
      const updated = await api('/api/admin/pdpa', { method: 'PUT', body: { policyText, consentText } });
      state.admin.pdpa = updated;
      state.pdpa = updated;
      toast('บันทึกนโยบาย PDPA แล้ว', 'success');
    } catch (err) { toast(err.message, 'error'); }
  }

  // Site content (admin)
  async function handleSiteContentEditSubmit(e) {
    e.preventDefault();
    const payload = {
      companyOverview: document.getElementById('site-content-overview').value.trim(),
      social: {
        youtube: document.getElementById('site-content-youtube').value.trim(),
        tiktok: document.getElementById('site-content-tiktok').value.trim(),
        facebook: document.getElementById('site-content-facebook').value.trim(),
        instagram: document.getElementById('site-content-instagram').value.trim(),
      },
    };
    try {
      const updated = await api('/api/admin/site-content', { method: 'PUT', body: payload });
      state.admin.siteContent = updated;
      state.siteContent = updated;
      renderHome();
      toast('บันทึกข้อมูลหน้าแรกแล้ว', 'success');
    } catch (err) { toast(err.message, 'error'); }
  }

  // HR contacts (admin)
  function openHrContactModal(contact) {
    document.getElementById('hr-contact-modal-title').textContent = contact ? 'แก้ไขเจ้าหน้าที่ติดต่อ' : 'เพิ่มเจ้าหน้าที่ติดต่อ';
    document.getElementById('hr-contact-form').dataset.id = contact ? contact.id : '';
    document.getElementById('hr-contact-form-name').value = contact ? contact.name : '';
    document.getElementById('hr-contact-form-coverage').value = contact ? contact.coverage : '';
    document.getElementById('hr-contact-form-phone').value = contact ? contact.phone : '';
    document.getElementById('hr-contact-form-email').value = contact ? contact.email : '';
    document.getElementById('hr-contact-form-line').value = contact ? contact.lineId : '';
    showModal('hr-contact-modal');
  }

  async function handleHrContactFormSubmit(e) {
    e.preventDefault();
    const id = e.target.dataset.id;
    const payload = {
      name: document.getElementById('hr-contact-form-name').value.trim(),
      coverage: document.getElementById('hr-contact-form-coverage').value.trim(),
      phone: document.getElementById('hr-contact-form-phone').value.trim(),
      email: document.getElementById('hr-contact-form-email').value.trim(),
      lineId: document.getElementById('hr-contact-form-line').value.trim(),
    };
    try {
      if (id) await api(`/api/admin/hr-contacts/${id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/hr-contacts', { method: 'POST', body: payload });
      hideModal('hr-contact-modal');
      toast('บันทึกข้อมูลเจ้าหน้าที่แล้ว', 'success');
      await refreshHrContactsEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleHrContactDelete(id) {
    if (!confirm('ยืนยันลบเจ้าหน้าที่ท่านนี้?')) return;
    try {
      await api(`/api/admin/hr-contacts/${id}`, { method: 'DELETE' });
      toast('ลบข้อมูลเจ้าหน้าที่แล้ว', 'success');
      await refreshHrContactsEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function refreshHrContactsEverywhere() {
    state.hrContacts = await api('/api/hr-contacts');
    renderContact();
    if (state.admin.loggedIn) {
      state.admin.hrContacts = state.hrContacts;
      renderAdmin();
    }
  }

  // Banner images (admin)
  // Returns a Thai error message when a chosen file is too big / the wrong
  // type, or '' when it is fine. Mirrors the server-side limits in src/upload.js.
  function fileProblem(file, allowedTypes, label) {
    if (!file) return '';
    if (file.size > MAX_FILE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return `${label} "${file.name}" มีขนาด ${mb}MB เกินกำหนด (ไม่เกิน ${MAX_FILE_BYTES / (1024 * 1024)}MB) กรุณาลดขนาดไฟล์หรือเลือกไฟล์อื่น`;
    }
    if (!allowedTypes.includes(file.type)) {
      return `${label} "${file.name}" ไม่ใช่ชนิดไฟล์ที่รองรับ`;
    }
    return '';
  }

  function checkApplyFile(input) {
    const isPhoto = input.id === 'apply-photo';
    const msg = fileProblem(input.files[0], isPhoto ? PHOTO_TYPES : RESUME_TYPES, isPhoto ? 'รูปถ่าย' : 'ไฟล์ประวัติ/เรซูเม่')
      .replace(/ไม่ใช่ชนิดไฟล์ที่รองรับ$/, isPhoto ? 'ต้องเป็นไฟล์รูปภาพ (PNG/JPG/WEBP/GIF)' : 'ต้องเป็น PDF หรือรูปภาพ (PNG/JPG/WEBP/GIF)');
    const errEl = document.getElementById(`${input.id}-error`);
    if (msg) input.value = ''; // don't keep a file the server would reject
    if (errEl) { errEl.textContent = msg; errEl.hidden = !msg; }
    return msg;
  }

  async function handleBannerUpload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const problem = fileProblem(file, PHOTO_TYPES, 'รูปแบนเนอร์');
    if (problem) { toast(problem, 'error'); return; }
    const fd = new FormData();
    fd.append('image', file);
    try {
      await api('/api/admin/banner-images', { method: 'POST', body: fd });
      toast('เพิ่มรูปแบนเนอร์แล้ว', 'success');
      await refreshBannerImagesEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleBannerDelete(id) {
    if (!confirm('ยืนยันลบรูปแบนเนอร์นี้?')) return;
    try {
      await api(`/api/admin/banner-images/${id}`, { method: 'DELETE' });
      toast('ลบรูปแบนเนอร์แล้ว', 'success');
      await refreshBannerImagesEverywhere();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function refreshBannerImagesEverywhere() {
    state.bannerImages = await api('/api/banner-images');
    renderBanner();
    if (state.admin.loggedIn) {
      state.admin.bannerImages = state.bannerImages;
      renderAdmin();
    }
  }

  // ---------------------------------------------------------------------
  // Event delegation (attached once)
  // ---------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const pageEl = e.target.closest('[data-page]');
    if (pageEl) {
      e.preventDefault();
      showPage(pageEl.dataset.page);
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === 'apply-to') {
      showPage('apply');
      document.getElementById('apply-job').value = actionEl.dataset.jobId;
    } else if (action === 'pdpa-cancel') {
      hideModal('pdpa-modal');
      pendingApplicationForm = null;
    } else if (action === 'pdpa-accept') {
      submitPendingApplication();
    } else if (action === 'close-success-modal') {
      hideModal('success-modal');
    } else if (action === 'chat-chip') {
      const q = actionEl.dataset.q;
      chatAppend(q, 'user');
      chatAppend(findFaqAnswer(q), 'bot');
    } else if (action === 'admin-tab') {
      state.admin.tab = actionEl.dataset.tab;
      if (state.admin.tab === 'applicants') loadAdminApplications();
      else renderAdmin();
    } else if (action === 'admin-logout') {
      handleAdminLogout();
    } else if (action === 'app-delete') {
      handleAppDelete(actionEl.dataset.id);
    } else if (action === 'job-new') {
      openJobModal(null);
    } else if (action === 'job-edit') {
      openJobModal(state.admin.jobsAll.find((j) => j.id === actionEl.dataset.id));
    } else if (action === 'job-toggle') {
      handleJobToggle(state.admin.jobsAll.find((j) => j.id === actionEl.dataset.id));
    } else if (action === 'job-delete') {
      handleJobDelete(actionEl.dataset.id);
    } else if (action === 'job-form-cancel') {
      hideModal('job-modal');
    } else if (action === 'faq-new') {
      openFaqModal(null);
    } else if (action === 'faq-edit') {
      openFaqModal(state.admin.faqRules.find((r) => r.id === actionEl.dataset.id));
    } else if (action === 'faq-delete') {
      handleFaqDelete(actionEl.dataset.id);
    } else if (action === 'faq-form-cancel') {
      hideModal('faq-modal');
    } else if (action === 'hr-contact-new') {
      openHrContactModal(null);
    } else if (action === 'hr-contact-edit') {
      openHrContactModal(state.admin.hrContacts.find((c) => c.id === actionEl.dataset.id));
    } else if (action === 'hr-contact-delete') {
      handleHrContactDelete(actionEl.dataset.id);
    } else if (action === 'hr-contact-form-cancel') {
      hideModal('hr-contact-modal');
    } else if (action === 'banner-delete') {
      handleBannerDelete(actionEl.dataset.id);
    } else if (action === 'banner-goto') {
      goToBannerSlide(parseInt(actionEl.dataset.index, 10));
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.action === 'app-status') {
      handleAppStatusChange(e);
    }
    // conditional fields on the application form
    if (e.target.id === 'apply-title') {
      document.getElementById('apply-title-other-wrap').hidden = e.target.value !== 'อื่นๆ';
    } else if (e.target.id === 'apply-resume' || e.target.id === 'apply-photo') {
      checkApplyFile(e.target);
    } else if (e.target.id === 'apply-source') {
      document.getElementById('apply-source-other-wrap').hidden = e.target.value !== 'อื่นๆ';
    } else if (e.target.name === 'apply-criminal') {
      document.getElementById('apply-criminal-detail-wrap').hidden = radioValue('apply-criminal') !== 'true';
    } else if (e.target.name === 'apply-chronic') {
      document.getElementById('apply-chronic-detail-wrap').hidden = radioValue('apply-chronic') !== 'true';
    } else if (e.target.name === 'apply-karabao') {
      document.getElementById('apply-karabao-company-wrap').hidden = radioValue('apply-karabao') !== 'true';
    }
  });

  // phone: digits only, max 10
  document.addEventListener('input', (e) => {
    if (e.target.id === 'apply-phone') {
      e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'apply-form') handleApplySubmit(e);
    else if (e.target.id === 'admin-login-form') handleAdminLogin(e);
  });

  document.getElementById('job-form').addEventListener('submit', handleJobFormSubmit);
  document.getElementById('faq-form').addEventListener('submit', handleFaqFormSubmit);
  document.getElementById('hr-contact-form').addEventListener('submit', handleHrContactFormSubmit);
  document.getElementById('pdpa-consent-check').addEventListener('change', (e) => {
    document.getElementById('pdpa-accept-btn').disabled = !e.target.checked;
  });

  document.getElementById('chat-toggle').addEventListener('click', () => {
    const panel = document.getElementById('chat-panel');
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    document.getElementById('chat-toggle').setAttribute('aria-expanded', String(open));
  });
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-text');
    const q = input.value.trim();
    if (!q) return;
    chatAppend(q, 'user');
    chatAppend(findFaqAnswer(q), 'bot');
    input.value = '';
  });

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  async function boot() {
    renderShell();
    initChat();
    try {
      const [jobs, faqRules, pdpa, siteContent, hrContacts, bannerImages] = await Promise.all([
        api('/api/jobs'),
        api('/api/faq-rules'),
        api('/api/pdpa'),
        api('/api/site-content'),
        api('/api/hr-contacts'),
        api('/api/banner-images'),
      ]);
      state.jobs = jobs;
      state.faqRules = faqRules;
      state.pdpa = pdpa;
      state.siteContent = siteContent;
      state.hrContacts = hrContacts;
      state.bannerImages = bannerImages;
    } catch (err) {
      toast('ไม่สามารถโหลดข้อมูลได้ กรุณาลองรีเฟรชหน้าใหม่', 'error');
    }
    renderHome();
    renderBanner();
    renderJobs();
    renderApply();
    renderContact();
    renderChatChips(); // re-render now that admin-added rules are loaded
    showPage('home');
    await checkAdminSession();
  }

  boot();
})();
