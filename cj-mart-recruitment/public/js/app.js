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
  const AVAILABILITY_OPTIONS = ['กะเช้า', 'กะบ่าย', 'กะดึก', 'วันหยุด/สุดสัปดาห์', 'ยืดหยุ่นได้ทุกช่วงเวลา'];

  const DEFAULT_FAQ_RULES = [
    { keywords: ['เงินเดือน', 'ค่าแรง', 'ค่าจ้าง', 'รายได้'], answer: 'เงินเดือน/ค่าแรงของแต่ละตำแหน่งจะแสดงไว้ในการ์ดตำแหน่งงานแต่ละใบค่ะ หากไม่ระบุ ทางบริษัทจะแจ้งอัตราที่แน่นอนในวันสัมภาษณ์' },
    { keywords: ['เวลาทำงาน', 'กะ', 'เข้างาน', 'ชั่วโมง'], answer: 'สาขาส่วนใหญ่แบ่งเป็นกะเช้า กะบ่าย และกะดึก สามารถเลือกช่วงเวลาที่สะดวกได้ตอนกรอกใบสมัครเลยค่ะ' },
    { keywords: ['คุณสมบัติ', 'วุฒิ', 'อายุ', 'เพศ'], answer: 'คุณสมบัติเบื้องต้นระบุไว้ในแต่ละตำแหน่งงาน โดยทั่วไปรับสมัครอายุ 18 ปีขึ้นไป ไม่จำกัดเพศ และไม่จำเป็นต้องมีประสบการณ์มาก่อน (จะมีการฝึกอบรมให้)' },
    { keywords: ['สมัคร', 'ขั้นตอน', 'วิธี'], answer: 'สมัครได้ง่าย ๆ โดยเลื่อนไปที่ส่วน "สมัครงาน" ด้านบน กรอกข้อมูลให้ครบ แนบไฟล์ประวัติ/รูปถ่าย (ถ้ามี) แล้วกดยืนยันความยินยอม PDPA ก่อนส่งใบสมัครได้เลยค่ะ' },
    { keywords: ['สวัสดิการ', 'โบนัส', 'ประกันสังคม'], answer: 'พนักงาน CJ Mart จะได้รับสวัสดิการตามที่กฎหมายกำหนด เช่น ประกันสังคม รวมถึงสวัสดิการเพิ่มเติมตามตำแหน่งและสาขา รายละเอียดจะแจ้งในวันสัมภาษณ์ค่ะ' },
    { keywords: ['ติดต่อ', 'เบอร์โทร', 'สอบถาม'], answer: 'หากต้องการสอบถามเพิ่มเติม สามารถฝากคำถามไว้ในแชทนี้ หรือรอเจ้าหน้าที่ติดต่อกลับหลังจากส่งใบสมัครได้เลยค่ะ' },
    { keywords: ['pdpa', 'ข้อมูลส่วนบุคคล', 'ความเป็นส่วนตัว'], answer: 'ข้อมูลที่ท่านกรอกจะถูกเก็บและใช้เพื่อการพิจารณาสมัครงานเท่านั้น ตามนโยบาย PDPA ของบริษัท ซึ่งสามารถอ่านรายละเอียดได้ในหน้าต่างยืนยันความยินยอมก่อนส่งใบสมัครค่ะ' },
    { keywords: ['ตำแหน่ง', 'งานว่าง', 'เปิดรับ'], answer: 'ตำแหน่งงานที่เปิดรับสมัครอยู่ในขณะนี้แสดงอยู่ในส่วน "ตำแหน่งงาน" ด้านบนค่ะ หากตำแหน่งไหนปิดรับสมัครแล้วจะไม่แสดงในหน้านี้' },
  ];

  const PAGES = ['home', 'jobs', 'apply', 'faq', 'contact', 'admin'];

  const state = {
    page: 'home',
    jobs: [],
    faqRules: [],
    pdpa: { policyText: '', consentText: '' },
    siteContent: { companyOverview: '', social: { youtube: '', tiktok: '', facebook: '', instagram: '' } },
    hrContacts: [],
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
        <div class="wrap hero-grid">
          <div>
            <img class="hero-logo" src="/assets/logo.png" alt="CJ Mart">
            <span class="eyebrow">${icon('sparkles')} ร่วมงานกับ CJ Mart</span>
            <h1>สมัครงานร้านสะดวกซื้อ CJ Mart</h1>
            <p class="lead" id="home-overview">กำลังโหลดข้อมูลบริษัท...</p>
            <div class="hero-actions">
              <a href="#" class="btn btn-primary" data-page="jobs">${icon('briefcase')} ดูตำแหน่งงาน</a>
              <a href="#" class="btn btn-ghost" data-page="apply">${icon('clipboard-check')} สมัครงานเลย</a>
            </div>
            <div class="hero-stats">
              <div class="stat-item">${icon('users', 'icon-badge tone-green')}<div><strong id="stat-open-jobs">-</strong><span>ตำแหน่งเปิดรับ</span></div></div>
              <div class="stat-item">${icon('truck', 'icon-badge tone-blue')}<div><strong>หลายสาขา</strong><span>ทั่วประเทศ</span></div></div>
            </div>
            <div id="home-social" class="social-row"></div>
          </div>
          <div class="hero-card">
            <h3>ทำไมต้องร่วมงานกับเรา</h3>
            <ul>
              <li>${icon('banknote', 'icon-badge sm tone-gold')}<span class="txt">รายได้มั่นคง จ่ายตรงเวลา</span></li>
              <li>${icon('clock', 'icon-badge sm tone-blue')}<span class="txt">เลือกกะเวลาทำงานที่สะดวก</span></li>
              <li>${icon('graduation-cap', 'icon-badge sm tone-green')}<span class="txt">ฝึกอบรมให้ ไม่ต้องมีประสบการณ์</span></li>
              <li>${icon('gift', 'icon-badge sm tone-red')}<span class="txt">สวัสดิการตามกฎหมายและเพิ่มเติม</span></li>
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

      <section id="page-faq" hidden>
        <div class="wrap">
          <div class="section-head">
            <div><div class="heading-row">${icon('message-circle', 'icon-badge tone-gold')}<h2>คำถามที่พบบ่อย</h2></div>
            <p>คลิกคำถามเพื่อดูคำตอบ หรือพิมพ์ถามผู้ช่วยแชทมุมขวาล่างได้เลย</p></div>
          </div>
          <div id="faq-content" class="faq"></div>
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
            <p>เข้าสู่ระบบเพื่อจัดการใบสมัคร ตำแหน่งงาน คำถามที่พบบ่อย นโยบาย PDPA ข้อมูลหน้าแรก และผู้ติดต่อ HR</p></div>
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
          ${job.shift ? `<span class="tag">${esc(job.shift)}</span>` : ''}
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
  function renderApply() {
    const el = document.getElementById('apply-content');
    const jobOptions = state.jobs.map((j) => `<option value="${esc(j.id)}">${esc(j.title)}</option>`).join('');
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
              <label for="apply-name">ชื่อ-นามสกุล <span class="required">*</span></label>
              <input id="apply-name" required>
            </div>
            <div class="field">
              <label for="apply-phone">เบอร์โทรศัพท์ <span class="required">*</span></label>
              <input id="apply-phone" required placeholder="0812345678">
            </div>
            <div class="field">
              <label for="apply-email">อีเมล</label>
              <input id="apply-email" type="email" placeholder="(ถ้ามี)">
            </div>
            <div class="field">
              <label for="apply-area">พื้นที่/สาขาที่สะดวก</label>
              <input id="apply-area" placeholder="เช่น เขตบางนา, จ.สมุทรปราการ">
            </div>
            <div class="field">
              <label for="apply-start-date">วันที่พร้อมเริ่มงาน <span class="required">*</span></label>
              <input id="apply-start-date" type="date" required>
            </div>
            <div class="field full">
              <label>เวลาที่สะดวกทำงาน <span class="required">*</span> <span class="hint">(เลือกได้มากกว่า 1)</span></label>
              <div class="check-grid">
                ${AVAILABILITY_OPTIONS.map((a, i) => `
                  <label class="check-pill"><input type="checkbox" name="apply-availability" value="${esc(a)}" id="apply-avail-${i}"> ${esc(a)}</label>
                `).join('')}
              </div>
            </div>
            <div class="field full">
              <label for="apply-experience">ประสบการณ์ทำงาน <span class="required">*</span></label>
              <textarea id="apply-experience" required placeholder="เล่าประสบการณ์ทำงานที่ผ่านมาโดยย่อ (หากไม่มีประสบการณ์ ให้ระบุว่า &quot;ไม่มี&quot;)"></textarea>
            </div>
            <div class="field">
              <label for="apply-resume">แนบไฟล์ประวัติ/เรซูเม่ (PDF หรือรูปภาพ)</label>
              <div class="file-drop">${icon('upload')} <input id="apply-resume" type="file" accept=".pdf,image/png,image/jpeg,image/webp,image/gif"></div>
            </div>
            <div class="field">
              <label for="apply-photo">แนบรูปถ่าย</label>
              <div class="file-drop">${icon('upload')} <input id="apply-photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
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

  function validateApplyForm() {
    const errors = [];
    const jobId = document.getElementById('apply-job').value;
    const name = document.getElementById('apply-name').value.trim();
    const phone = document.getElementById('apply-phone').value.trim();
    const startDate = document.getElementById('apply-start-date').value;
    const experience = document.getElementById('apply-experience').value.trim();
    const availability = Array.from(document.querySelectorAll('input[name="apply-availability"]:checked')).map((c) => c.value);
    if (!jobId) errors.push('กรุณาเลือกตำแหน่งที่สมัคร');
    if (!name) errors.push('กรุณากรอกชื่อ-นามสกุล');
    if (!phone || !/^[0-9+\-\s]{9,15}$/.test(phone)) errors.push('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง');
    if (!startDate) errors.push('กรุณาเลือกวันที่พร้อมเริ่มงาน');
    if (!experience) errors.push('กรุณากรอกประสบการณ์ทำงาน');
    if (availability.length === 0) errors.push('กรุณาเลือกเวลาที่สะดวกทำงานอย่างน้อย 1 ช่วง');
    return { errors, jobId, name, phone, startDate, experience, availability };
  }

  function buildApplicationFormData(fields) {
    const fd = new FormData();
    fd.append('jobId', fields.jobId);
    fd.append('name', fields.name);
    fd.append('phone', fields.phone);
    fd.append('email', document.getElementById('apply-email').value.trim());
    fd.append('area', document.getElementById('apply-area').value.trim());
    fd.append('startDate', fields.startDate);
    fd.append('experience', fields.experience);
    fields.availability.forEach((a) => fd.append('availability', a));
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
  // FAQ + chatbot
  // ---------------------------------------------------------------------
  function renderFaq() {
    const el = document.getElementById('faq-content');
    const all = state.faqRules.concat(DEFAULT_FAQ_RULES).slice(0, 8);
    el.innerHTML = all.map((r) => `
      <button type="button" class="faq-chip" data-action="chat-chip" data-q="${esc(r.keywords[0])}">
        ${icon('tag', 'icon-badge sm tone-blue')}
        <span class="txt"><b>${esc(r.keywords[0])}</b><span>${esc((r.answer || '').slice(0, 60))}${(r.answer || '').length > 60 ? '…' : ''}</span></span>
      </button>
    `).join('');
  }

  function findFaqAnswer(question) {
    const q = question.toLowerCase();
    const all = state.faqRules.concat(DEFAULT_FAQ_RULES);
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
    const sample = state.faqRules.concat(DEFAULT_FAQ_RULES).slice(0, 4);
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
      ['faq', 'คำถามที่พบบ่อย'],
      ['pdpa', 'นโยบาย PDPA'],
      ['siteContent', 'ข้อมูลหน้าแรก'],
      ['hrContacts', 'ผู้ติดต่อ HR'],
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

  function renderAdminApplicants() {
    const a = state.admin;
    const jobOptions = a.jobsAll.map((j) => `<option value="${esc(j.id)}" ${a.filterJobId === j.id ? 'selected' : ''}>${esc(j.title)}</option>`).join('');
    const statusOptions = STATUS_OPTIONS.map((s) => `<option value="${esc(s)}" ${a.filterStatus === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const rows = a.applications.map((app) => `
      <tr>
        <td>${app.submittedAt ? new Date(app.submittedAt).toLocaleString('th-TH') : '-'}</td>
        <td>${esc(app.name)}</td>
        <td>${esc(app.jobTitle)}</td>
        <td>${esc(app.phone)}${app.email ? '<br>' + esc(app.email) : ''}</td>
        <td>${esc(app.area || '-')}</td>
        <td>${app.startDate ? new Date(app.startDate).toLocaleDateString('th-TH') : '-'}</td>
        <td>${(app.availability || []).map(esc).join(', ')}</td>
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
          <thead><tr><th>วันที่สมัคร</th><th>ชื่อ</th><th>ตำแหน่ง</th><th>ติดต่อ</th><th>พื้นที่</th><th>วันเริ่มงาน</th><th>เวลาที่สะดวก</th><th>สถานะ</th><th>ไฟล์แนบ</th><th></th></tr></thead>
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
        <span class="hint">${esc(j.type)} · ${esc(j.shift)} · ${esc(j.salaryRange)}</span></div>
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
      <div class="job-manage-row">
        <div><strong>${esc(r.keywords.join(', '))}</strong><br><span class="hint">${esc(r.answer)}</span></div>
        <button type="button" class="btn btn-danger btn-sm" data-action="faq-delete" data-id="${esc(r.id)}">${icon('trash')}</button>
      </div>
    `).join('');
    document.getElementById('admin-content').innerHTML = `
      ${adminTabsHtml()}
      <div class="admin-toolbar">
        <span class="hint">คำถามที่เพิ่มไว้นี้จะถูกตรวจสอบก่อนคำถามเริ่มต้นของแชทบอทเสมอ</span>
        <button type="button" class="btn btn-primary btn-sm" data-action="faq-new">${icon('plus')} เพิ่มคำถาม</button>
      </div>
      <div class="job-manage">${rows || `<div class="empty-state">ยังไม่มีคำถามที่เพิ่มเอง (ระบบจะใช้คำถามเริ่มต้นของแชทบอท)</div>`}</div>
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

  function renderAdmin() {
    if (!state.admin.loggedIn) { renderAdminLogin(); return; }
    if (state.admin.tab === 'jobs') renderAdminJobs();
    else if (state.admin.tab === 'faq') renderAdminFaq();
    else if (state.admin.tab === 'pdpa') renderAdminPdpa();
    else if (state.admin.tab === 'siteContent') renderAdminSiteContent();
    else if (state.admin.tab === 'hrContacts') renderAdminHrContacts();
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
    const [jobsAll, faqRules, pdpa, siteContent, hrContacts] = await Promise.all([
      api('/api/admin/jobs'),
      api('/api/faq-rules'),
      api('/api/admin/pdpa'),
      api('/api/admin/site-content'),
      api('/api/admin/hr-contacts'),
    ]);
    state.admin.jobsAll = jobsAll;
    state.admin.faqRules = faqRules;
    state.admin.pdpa = pdpa;
    state.admin.siteContent = siteContent;
    state.admin.hrContacts = hrContacts;
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
    document.getElementById('job-form-type').value = job ? job.type : '';
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
  function openFaqModal() {
    document.getElementById('faq-form-keywords').value = '';
    document.getElementById('faq-form-answer').value = '';
    showModal('faq-modal');
  }

  async function handleFaqFormSubmit(e) {
    e.preventDefault();
    const keywords = document.getElementById('faq-form-keywords').value.split(',').map((s) => s.trim()).filter(Boolean);
    const answer = document.getElementById('faq-form-answer').value.trim();
    try {
      await api('/api/admin/faq-rules', { method: 'POST', body: { keywords, answer } });
      hideModal('faq-modal');
      toast('เพิ่มคำถามแล้ว', 'success');
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
    renderFaq();
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
      openFaqModal();
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
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.action === 'app-status') {
      handleAppStatusChange(e);
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
      const [jobs, faqRules, pdpa, siteContent, hrContacts] = await Promise.all([
        api('/api/jobs'),
        api('/api/faq-rules'),
        api('/api/pdpa'),
        api('/api/site-content'),
        api('/api/hr-contacts'),
      ]);
      state.jobs = jobs;
      state.faqRules = faqRules;
      state.pdpa = pdpa;
      state.siteContent = siteContent;
      state.hrContacts = hrContacts;
    } catch (err) {
      toast('ไม่สามารถโหลดข้อมูลได้ กรุณาลองรีเฟรชหน้าใหม่', 'error');
    }
    renderHome();
    renderJobs();
    renderApply();
    renderFaq();
    renderContact();
    showPage('home');
    await checkAdminSession();
  }

  boot();
})();
