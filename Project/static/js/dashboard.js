/**
 * OPEC International Schools - Executive Dashboard & Drill-Down Engine
 * Provides real-time aggregations, interactive distribution meters,
 * level breakdown drill-downs, and curriculum normalization analysis.
 */

let cachedDashProvinces = [];
let cachedNormalizedCurriculums = [];
let cachedRawCurriculums = [];
let curriculumViewMode = 'normalized'; // 'normalized' or 'raw'
let currentDrillDownSchools = [];

/**
 * Intelligent Curriculum Normalizer:
 * Maps 268+ fragmented/duplicate raw OPEC strings into standardized, recognized international curriculum systems.
 */
function normalizeCurriculum(raw) {
  if (!raw || !raw.trim()) return 'หลักสูตรสากลทั่วไป (General International)';
  const r = raw.trim();
  const rl = r.toLowerCase();

  // 1. Thai Language, Culture & History (OPEC Mandatory Subject Requirement)
  if (
    rl.includes('วัฒนธรรมไทย') || rl.includes('ภาษาไทย') ||
    rl.includes('ประวัติศาสตร์ไทย') || rl.includes('วิชาภาษาและวัฒนธรรมไทย')
  ) {
    return 'ภาษาและวัฒนธรรมไทย (สช. บังคับ)';
  }

  // 2. International Baccalaureate (IB)
  if (
    rl.includes('international baccalaureate') || rl.includes(' ib ') || rl.includes('ibdp') ||
    rl.includes('pyp') || rl.includes('myp') || rl.includes('ib-cp') || rl.includes('ไอบี') ||
    rl.includes('(ib)') || rl.includes('diploma programme (dp)') || rl.includes('diploma programme') ||
    rl.includes('primary year') || rl.includes('middle year') || rl.includes('career-related') ||
    rl.startsWith('ib') || rl.endsWith(' ib')
  ) {
    if (rl.includes('pyp') || rl.includes('primary year')) return 'International Baccalaureate (IB - PYP)';
    if (rl.includes('myp') || rl.includes('middle year')) return 'International Baccalaureate (IB - MYP)';
    if (rl.includes('ibdp') || rl.includes('diploma programme') || rl.includes('diploma program') || rl.includes('(dp)')) return 'International Baccalaureate (IB - DP)';
    if (rl.includes('ib-cp') || rl.includes('career-related')) return 'International Baccalaureate (IB - CP)';
    return 'International Baccalaureate (IB รวมทุกระดับ)';
  }

  // 3. British / UK Curriculum & Cambridge / IGCSE / EYFS / Wales
  if (
    rl.includes('british') || rl.includes('england') || rl.includes('uk national') || rl.includes('united kingdom') ||
    rl.includes('สหราชอาณาจักร') || rl.includes('อังกฤษ') || rl.includes('เวลส์') || rl.includes('wales') ||
    rl.includes('cambridge') || rl.includes('เคมบริดจ์') || rl.includes('แคมบริดจ์') || rl.includes('แคมบริจด์') ||
    rl.includes('igcse') || rl.includes('gcse') || rl.includes('a level') || rl.includes('a-level') || rl.includes('as level') ||
    rl.includes('as & a level') || rl.includes('a & as level') || rl.includes('eyfs') || rl.includes('early years foundation') ||
    rl.includes('early year foundation') || rl.includes('edexcel') || rl.includes('key stage') || rl.includes('oxford international') ||
    rl.includes('btec') || rl.includes('wellington college') || rl.includes('enc (english')
  ) {
    if (
      rl.includes('cambridge') || rl.includes('เคมบริดจ์') || rl.includes('แคมบริดจ์') ||
      rl.includes('แคมบริจด์') || rl.includes('igcse') || rl.includes('gcse') || rl.includes('a level') ||
      rl.includes('a-level') || rl.includes('edexcel') || rl.includes('btec') || rl.includes('oxford')
    ) {
      return 'หลักสูตรเคมบริดจ์ / สหราชอาณาจักร (Cambridge & UK Exams)';
    }
    if (rl.includes('eyfs') || rl.includes('early years foundation') || rl.includes('early year foundation')) {
      return 'หลักสูตรปฐมวัยอังกฤษ (British EYFS)';
    }
    return 'หลักสูตรสหราชอาณาจักร (British / UK National Curriculum)';
  }

  // 4. American / US Curriculum & AP / Common Core
  if (
    rl.includes('american') || rl.includes('us national') || rl.includes('united states') ||
    rl.includes('สหรัฐอเมริกา') || rl.includes('สหรัฐอเมริกัน') || rl.includes('อเมริกัน') || rl.includes('อเมริกา') ||
    rl.includes('common core') || rl.includes('california') || rl.includes('แคลิฟอร์เนีย') ||
    rl.includes('massachusetts') || rl.includes('แมสซาชูเซตส์') || rl.includes('aero') || rl.includes('ngss') ||
    rl.includes('advanced placement') || rl.includes('high school diploma') || rl.includes('เวอร์จีเนีย') ||
    rl.includes('มิสซิสซิป') || rl.includes('ยูทาห์') || rl.includes('utah') || rl.includes('adventist') ||
    rl.includes('แอ๊ดเวนตีส') || rl.includes(' ap ') || rl.includes('ap statistics') || rl.includes('หลักสูตร ap') ||
    rl.includes('pennsylvania') || rl.includes('new jersey') || rl.includes('district of columbia') ||
    rl.includes('chicago') || rl.includes('calvert') || rl.includes('a.c.e.') || rl.includes('accelerated christian') ||
    rl.includes('basis education') || rl.includes('school of tomorrow') || rl.includes('the us. elementary') ||
    rl.includes('wasc') || rl.includes('nad')
  ) {
    if (rl.includes('advanced placement') || rl.includes(' ap ') || rl.includes('หลักสูตร ap') || rl.includes('ap statistics')) {
      return 'หลักสูตรอเมริกัน / AP (American & Advanced Placement)';
    }
    return 'หลักสูตรสหรัฐอเมริกา (American / US Common Core)';
  }

  // 5. Singapore
  if (rl.includes('singapore') || rl.includes('สิงคโปร์') || rl.includes('สิงค์โปร์') || rl.includes('nurturing early learners')) {
    return 'หลักสูตรสิงคโปร์ (Singapore Curriculum)';
  }

  // 6. Australian
  if (rl.includes('australia') || rl.includes('ออสเตรเลีย') || rl.includes('acara') || rl.includes('vce') || rl.includes('sace') || rl.includes('western australian')) {
    return 'หลักสูตรออสเตรเลีย (Australian Curriculum)';
  }

  // 7. Canadian
  if (rl.includes('canada') || rl.includes('canadian') || rl.includes('แคนาดา') || rl.includes('แคนนาดา') || rl.includes('บริติชโคลัมเบีย') || rl.includes('ontario') || rl.includes('alberta')) {
    return 'หลักสูตรแคนาดา (Canadian Curriculum)';
  }

  // 8. French
  if (rl.includes('french') || rl.includes('france') || rl.includes('ฝรั่งเศส') || rl.includes('aefe')) {
    return 'หลักสูตรฝรั่งเศส (French Curriculum)';
  }

  // 9. German
  if (rl.includes('german') || rl.includes('germany') || rl.includes('เยอรมัน') || rl.includes('ทูริงเง่น') || rl.includes('thuringia') || rl.includes('abitur')) {
    return 'หลักสูตรเยอรมัน (German Curriculum)';
  }

  // 10. Japanese
  if (rl.includes('japan') || rl.includes('japanese') || rl.includes('ญี่ปุ่น') || rl.includes('ministry of education, culture, sports, science and technology')) {
    return 'หลักสูตรญี่ปุ่น (Japanese Curriculum / MEXT)';
  }

  // 11. Chinese / Mandarin
  if (rl.includes('chinese') || rl.includes('china') || rl.includes('จีน') || rl.includes('mandarin') || rl.includes('แมนดาริน')) {
    return 'หลักสูตรจีน / ไต้หวัน (Chinese Curriculum)';
  }

  // 12. Korean
  if (rl.includes('korea') || rl.includes('เกาหลี')) {
    return 'หลักสูตรเกาหลี (Korean Curriculum)';
  }

  // 13. Indian
  if (rl.includes('india') || rl.includes('indian') || rl.includes('อินเดีย') || rl.includes('cbse') || rl.includes('central board of secondary')) {
    return 'หลักสูตรอินเดีย (Indian Curriculum)';
  }

  // 14. Finnish / Nordic
  if (rl.includes('finish') || rl.includes('finnish') || rl.includes('finland') || rl.includes('nordic')) {
    return 'หลักสูตรฟินแลนด์ (Finnish Curriculum)';
  }

  // 15. Specialized Early Childhood / Montessori / IPC / HighScope
  if (
    rl.includes('montessori') || rl.includes('มอนเทสซอรี่') || rl.includes('ipc') || rl.includes('international preschool') ||
    rl.includes('highscope') || rl.includes('creative curriculum') || rl.includes('child-centered') || rl.includes('early childhood') ||
    rl.includes('early childhook') || rl.includes('early years') || rl.includes('ปฐมวัย') || rl.includes('เตรียมอนุบาล') ||
    rl.includes('อนุบาล') || rl.includes('kindergarten curriculum') || rl.includes('high reach')
  ) {
    return 'หลักสูตรปฐมวัยสากล (Early Years / Montessori / IPC)';
  }

  // 16. Institutional Bespoke / School-Designed Curriculum
  if (
    rl.includes('ของทางโรงเรียน') || rl.includes('สร้างขึ้นเอง') || rl.includes('เอกมัย') || rl.includes('เวลลิงตัน') ||
    rl.includes('ประชาคมนานาชาติ') || rl.includes('kis ') || rl.includes('roong aroon') || rl.includes('st andrews') ||
    rl.includes('ดาลัต') || rl.includes('ดาเนียล') || rl.includes('อริสตา') || rl.includes('ซีสเต็มส์')
  ) {
    return 'หลักสูตรเฉพาะของสถาบัน (Institutional Bespoke)';
  }

  return 'หลักสูตรสากลทั่วไป (General International)';
}

function renderDashboard() {
  const refreshIcon = document.getElementById('dashRefreshIcon');
  if (refreshIcon) refreshIcon.classList.add('fa-spin');

  const total = (typeof allSchools !== 'undefined' && Array.isArray(allSchools)) ? allSchools.length : 0;
  
  // 1. Calculations & Aggregations
  const provCounts = {};
  let totalStudents = 0;
  let totalTeachers = 0;
  let websitesCount = 0;
  let gpsExactCount = 0;
  let gpsApproxCount = 0;
  let subsidyYesCount = 0;
  let subsidyNoCount = 0;

  let countPreK = 0;
  let countK = 0;
  let countPrimary = 0;
  let countLowerSec = 0;
  let countUpperSec = 0;
  let countAllThrough = 0;
  let countEarlyYearsOnly = 0;

  const rawCurriculumCounts = {};
  const normCurriculumSchoolSets = {};

  if (typeof allSchools !== 'undefined' && Array.isArray(allSchools)) {
    allSchools.forEach(s => {
      // Province
      const prov = s.province || 'ไม่ระบุจังหวัด';
      provCounts[prov] = (provCounts[prov] || 0) + 1;

      // Students & Teachers
      const stu = parseInt(s.student_count) || 0;
      const tch = parseInt(s.teacher_count) || 0;
      totalStudents += stu;
      totalTeachers += tch;

      // Websites
      if (s.website && s.website.trim() !== '') websitesCount++;

      // GPS
      if (s.gps_precision === 'Exact') gpsExactCount++;
      else if (s.gps_precision === 'Approximate') gpsApproxCount++;

      // Subsidy
      if (s.government_support === 'รับเงินอุดหนุน') subsidyYesCount++;
      else subsidyNoCount++;

      // Levels
      const lvls = Array.isArray(s.levels_offered) ? s.levels_offered : (s.levels_offered ? [s.levels_offered] : []);
      const lvlStr = lvls.join(' ');
      const hasPreK = lvlStr.includes('ก่อนอนุบาล');
      const hasK = lvlStr.includes('อนุบาล');
      const hasPrimary = lvlStr.includes('ประถมศึกษา');
      const hasLowerSec = lvlStr.includes('มัธยมศึกษาตอนต้น');
      const hasUpperSec = lvlStr.includes('มัธยมศึกษาตอนปลาย');

      if (hasPreK) countPreK++;
      if (hasK) countK++;
      if (hasPrimary) countPrimary++;
      if (hasLowerSec) countLowerSec++;
      if (hasUpperSec) countUpperSec++;

      if (hasPreK && hasK && hasPrimary && hasLowerSec && hasUpperSec) {
        countAllThrough++;
      } else if ((hasPreK || hasK) && !hasPrimary && !hasLowerSec && !hasUpperSec) {
        countEarlyYearsOnly++;
      }

      // Curriculums Processing
      const currs = Array.isArray(s.curriculums) ? s.curriculums : (s.curriculums ? [s.curriculums] : []);
      const schoolNormalizedGroups = new Set();

      if (currs.length === 0) {
        rawCurriculumCounts['หลักสูตรมาตรฐานสากล (General International)'] = (rawCurriculumCounts['หลักสูตรมาตรฐานสากล (General International)'] || 0) + 1;
        schoolNormalizedGroups.add('หลักสูตรสากลทั่วไป (General International)');
      } else {
        currs.forEach(c => {
          const cleanC = (c || '').trim();
          if (cleanC) {
            rawCurriculumCounts[cleanC] = (rawCurriculumCounts[cleanC] || 0) + 1;
            const norm = normalizeCurriculum(cleanC);
            schoolNormalizedGroups.add(norm);
          }
        });
      }

      schoolNormalizedGroups.forEach(norm => {
        if (!normCurriculumSchoolSets[norm]) normCurriculumSchoolSets[norm] = [];
        normCurriculumSchoolSets[norm].push(s);
      });
    });
  }

  // Cache Provinces
  const provNames = Object.keys(provCounts).sort((a, b) => provCounts[b] - provCounts[a]);
  cachedDashProvinces = provNames.map(p => ({
    name: p,
    count: provCounts[p],
    pct: total > 0 ? ((provCounts[p] / total) * 100).toFixed(1) : 0
  }));

  // Cache Normalized Curriculums
  const sortedNormKeys = Object.keys(normCurriculumSchoolSets).sort((a, b) => normCurriculumSchoolSets[b].length - normCurriculumSchoolSets[a].length);
  cachedNormalizedCurriculums = sortedNormKeys.map(k => ({
    name: k,
    count: normCurriculumSchoolSets[k].length,
    schools: normCurriculumSchoolSets[k],
    pct: total > 0 ? ((normCurriculumSchoolSets[k].length / total) * 100).toFixed(1) : 0
  }));

  // Cache Raw Curriculums
  const sortedRawKeys = Object.keys(rawCurriculumCounts).sort((a, b) => rawCurriculumCounts[b] - rawCurriculumCounts[a]);
  cachedRawCurriculums = sortedRawKeys.map(k => ({
    name: k,
    count: rawCurriculumCounts[k],
    pct: total > 0 ? ((rawCurriculumCounts[k] / total) * 100).toFixed(1) : 0
  }));

  // Update KPI Cards
  const kpiTotal = document.getElementById('dashKpiTotal');
  const kpiProvs = document.getElementById('dashKpiProvinces');
  const kpiStudents = document.getElementById('dashKpiStudents');
  const kpiAvgStu = document.getElementById('dashKpiAvgStudent');
  const kpiTeachers = document.getElementById('dashKpiTeachers');
  const kpiRatio = document.getElementById('dashKpiRatio');
  const kpiWebs = document.getElementById('dashKpiWebsites');
  const kpiWebsCount = document.getElementById('dashKpiWebsitesCount');
  const kpiGps = document.getElementById('dashKpiGpsExact');
  const kpiGpsCount = document.getElementById('dashKpiGpsCount');

  if (kpiTotal) kpiTotal.textContent = total.toLocaleString();
  if (kpiProvs) kpiProvs.textContent = provNames.length;
  if (kpiStudents) kpiStudents.textContent = totalStudents.toLocaleString() + ' คน';
  if (kpiAvgStu) kpiAvgStu.textContent = total > 0 ? `เฉลี่ย ${Math.round(totalStudents / total).toLocaleString()} คน/โรงเรียน` : 'เฉลี่ย 0 คน';
  if (kpiTeachers) kpiTeachers.textContent = totalTeachers.toLocaleString() + ' คน';
  if (kpiRatio) kpiRatio.textContent = totalTeachers > 0 ? `อัตราส่วน ~${(totalStudents / totalTeachers).toFixed(1)} : 1 (นร./ครู)` : 'อัตราส่วน ~0 : 1';
  
  const webPct = total > 0 ? Math.round((websitesCount / total) * 100) : 0;
  if (kpiWebs) kpiWebs.textContent = `${webPct}%`;
  if (kpiWebsCount) kpiWebsCount.textContent = `${websitesCount} จาก ${total} แห่ง`;

  const gpsPct = total > 0 ? Math.round((gpsExactCount / total) * 100) : 0;
  if (kpiGps) kpiGps.textContent = `${gpsPct}%`;
  if (kpiGpsCount) kpiGpsCount.textContent = `${gpsExactCount} แห่ง (ระดับอาคาร/ถนน)`;

  // Update Province List
  const provBadge = document.getElementById('dashProvinceCountBadge');
  if (provBadge) provBadge.textContent = `${provNames.length} จังหวัด`;
  filterDashProvinces();

  // Update Curriculums List
  filterDashCurriculums();

  // Update Levels
  const elPreK = document.getElementById('dashLvlPreK');
  const elPreKPct = document.getElementById('dashLvlPreKPct');
  const elK = document.getElementById('dashLvlK');
  const elKPct = document.getElementById('dashLvlKPct');
  const elPrimary = document.getElementById('dashLvlPrimary');
  const elPrimaryPct = document.getElementById('dashLvlPrimaryPct');
  const elLowerSec = document.getElementById('dashLvlLowerSec');
  const elLowerSecPct = document.getElementById('dashLvlLowerSecPct');
  const elUpperSec = document.getElementById('dashLvlUpperSec');
  const elUpperSecPct = document.getElementById('dashLvlUpperSecPct');

  if (elPreK) elPreK.textContent = countPreK;
  if (elPreKPct) elPreKPct.textContent = total > 0 ? `${Math.round(countPreK/total*100)}%` : '0%';
  if (elK) elK.textContent = countK;
  if (elKPct) elKPct.textContent = total > 0 ? `${Math.round(countK/total*100)}%` : '0%';
  if (elPrimary) elPrimary.textContent = countPrimary;
  if (elPrimaryPct) elPrimaryPct.textContent = total > 0 ? `${Math.round(countPrimary/total*100)}%` : '0%';
  if (elLowerSec) elLowerSec.textContent = countLowerSec;
  if (elLowerSecPct) elLowerSecPct.textContent = total > 0 ? `${Math.round(countLowerSec/total*100)}%` : '0%';
  if (elUpperSec) elUpperSec.textContent = countUpperSec;
  if (elUpperSecPct) elUpperSecPct.textContent = total > 0 ? `${Math.round(countUpperSec/total*100)}%` : '0%';

  const elAllThrough = document.getElementById('dashAllThroughCount');
  if (elAllThrough) elAllThrough.textContent = `${countAllThrough} แห่ง (${total > 0 ? Math.round(countAllThrough/total*100) : 0}%)`;

  const elEarlyYears = document.getElementById('dashEarlyYearsCount');
  if (elEarlyYears) elEarlyYears.textContent = `${countEarlyYearsOnly} แห่ง (${total > 0 ? Math.round(countEarlyYearsOnly/total*100) : 0}%)`;

  // Update Top 10 Largest Schools
  const topSchoolsBody = document.getElementById('dashTopSchoolsBody');
  if (topSchoolsBody && typeof allSchools !== 'undefined') {
    const sortedByStudents = [...allSchools]
      .sort((a, b) => (parseInt(b.student_count) || 0) - (parseInt(a.student_count) || 0))
      .slice(0, 10);

    if (sortedByStudents.length === 0) {
      topSchoolsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">ไม่มีข้อมูล</td></tr>';
    } else {
      topSchoolsBody.innerHTML = sortedByStudents.map((s, idx) => {
        const stu = parseInt(s.student_count) || 0;
        const tch = parseInt(s.teacher_count) || 0;
        const ratio = tch > 0 ? (stu / tch).toFixed(1) + ' : 1' : '—';
        let rankClass = '';
        if (idx === 0) rankClass = 'top1';
        else if (idx === 1) rankClass = 'top2';
        else if (idx === 2) rankClass = 'top3';

        return `
          <tr onclick="openDetailModal('${s.school_code}')" title="คลิกดูข้อมูลเชิงลึกของ ${s.school_name_th}">
            <td style="text-align: center;"><span class="rank-pill ${rankClass}">${idx + 1}</span></td>
            <td>
              <div style="font-weight: 600; color: var(--text-main); font-size: 0.86rem;">${s.school_name_th}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted);">${s.school_name_en || '—'}</div>
            </td>
            <td><span class="badge-province">${s.province || '—'}</span></td>
            <td style="text-align: right; font-weight: 700; color: var(--accent-emerald);">${stu.toLocaleString()} คน</td>
            <td style="text-align: right; font-size: 0.76rem; color: var(--text-dim);">${ratio}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Update Subsidy
  const elSubNo = document.getElementById('dashSubsidyNoCount');
  const elSubNoPct = document.getElementById('dashSubsidyNoPct');
  const elSubYes = document.getElementById('dashSubsidyYesCount');
  const elSubYesPct = document.getElementById('dashSubsidyYesPct');

  if (elSubNo) elSubNo.textContent = `${subsidyNoCount} แห่ง`;
  if (elSubNoPct) elSubNoPct.textContent = `${total > 0 ? Math.round(subsidyNoCount/total*100) : 0}% ของทั้งหมด`;
  if (elSubYes) elSubYes.textContent = `${subsidyYesCount} แห่ง`;
  if (elSubYesPct) elSubYesPct.textContent = `${total > 0 ? Math.round(subsidyYesCount/total*100) : 0}% ของทั้งหมด`;

  // Update Digital & Spatial
  const elGpsExact = document.getElementById('dashGpsExactCount');
  const elGpsApprox = document.getElementById('dashGpsApproxCount');
  const elWebLive = document.getElementById('dashWebLiveCount');

  if (elGpsExact) elGpsExact.textContent = `${gpsExactCount} แห่ง (${total > 0 ? Math.round(gpsExactCount/total*100) : 0}%)`;
  if (elGpsApprox) elGpsApprox.textContent = `${gpsApproxCount} แห่ง (${total > 0 ? Math.round(gpsApproxCount/total*100) : 0}%)`;
  if (elWebLive) elWebLive.textContent = `${websitesCount} แห่ง (${total > 0 ? Math.round(websitesCount/total*100) : 0}%)`;

  setTimeout(() => {
    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
  }, 400);
}

function filterDashProvinces() {
  const q = (document.getElementById('dashProvinceSearchInput')?.value || '').trim().toLowerCase();
  const listEl = document.getElementById('dashProvinceList');
  if (!listEl) return;

  let list = cachedDashProvinces;
  if (q) {
    list = cachedDashProvinces.filter(p => p.name.toLowerCase().includes(q));
  }

  if (list.length === 0) {
    listEl.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">ไม่พบจังหวัด "${q}"</div>`;
    return;
  }

  listEl.innerHTML = list.map(item => {
    return `
      <div class="province-item-row" onclick="openProvinceDrillDown('${item.name.replace(/'/g, "\\'")}')" title="คลิกดูรายชื่อ ${item.count} โรงเรียนใน ${item.name}">
        <span class="province-item-name">
          <i class="fa-solid fa-location-dot" style="color: #3b82f6; font-size: 0.8rem;"></i>
          <span>${item.name}</span>
        </span>
        <div class="province-item-bar-wrap">
          <div class="province-item-bar-fill" style="width: ${Math.max(item.pct, 4)}%;"></div>
        </div>
        <span class="province-item-count">
          ${item.count} แห่ง (${item.pct}%)
          <i class="fa-solid fa-chevron-right" style="font-size: 0.72rem; opacity: 0.6;"></i>
        </span>
      </div>
    `;
  }).join('');
}

// =========================================================================
// Curriculum View Switching & Search Filtering
// =========================================================================
function setCurriculumViewMode(mode) {
  curriculumViewMode = mode;
  const btnNorm = document.getElementById('btnCurrNorm');
  const btnRaw = document.getElementById('btnCurrRaw');

  if (btnNorm) btnNorm.classList.toggle('active', mode === 'normalized');
  if (btnRaw) btnRaw.classList.toggle('active', mode === 'raw');

  filterDashCurriculums();
}

function filterDashCurriculums() {
  const q = (document.getElementById('dashCurriculumSearchInput')?.value || '').trim().toLowerCase();
  const currBadge = document.getElementById('dashCurriculumCountBadge');
  const currListEl = document.getElementById('dashCurriculumList');
  if (!currListEl) return;

  const isNorm = curriculumViewMode === 'normalized';
  const dataList = isNorm ? cachedNormalizedCurriculums : cachedRawCurriculums;

  let filtered = dataList;
  if (q) {
    filtered = dataList.filter(item => item.name.toLowerCase().includes(q));
  }

  if (currBadge) {
    if (isNorm) {
      currBadge.textContent = `${dataList.length} กลุ่มมาตรฐานสากล`;
      currBadge.style.background = 'rgba(168, 85, 247, 0.12)';
      currBadge.style.color = '#a855f7';
    } else {
      currBadge.textContent = `${dataList.length} รายการตาม สช. (Raw)`;
      currBadge.style.background = 'rgba(245, 158, 11, 0.12)';
      currBadge.style.color = '#f59e0b';
    }
  }

  if (filtered.length === 0) {
    currListEl.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">ไม่พบหลักสูตร "${q}"</div>`;
    return;
  }

  currListEl.innerHTML = filtered.map(item => {
    const escapedName = item.name.replace(/'/g, "\\'");
    let icon = 'fa-solid fa-book-open';
    if (item.name.includes('British') || item.name.includes('สหราชอาณาจักร') || item.name.includes('เคมบริดจ์') || item.name.includes('EYFS')) icon = 'fa-solid fa-landmark';
    else if (item.name.includes('American') || item.name.includes('สหรัฐอเมริกา') || item.name.includes('AP')) icon = 'fa-solid fa-flag-usa';
    else if (item.name.includes('IB') || item.name.includes('Baccalaureate')) icon = 'fa-solid fa-globe';
    else if (item.name.includes('สิงคโปร์')) icon = 'fa-solid fa-cube';
    else if (item.name.includes('ภาษาและวัฒนธรรมไทย')) icon = 'fa-solid fa-certificate';

    return `
      <div class="curriculum-item-row" onclick="openCurriculumDrillDown('${escapedName}', ${isNorm})" title="คลิกดู ${item.count} โรงเรียนที่เปิดสอนหลักสูตรนี้">
        <div class="curriculum-top-line">
          <span class="curriculum-name">
            <i class="${icon}" style="color: var(--accent-purple); font-size: 0.8rem; margin-right: 6px;"></i>
            <span>${item.name}</span>
          </span>
          <span class="curriculum-count-badge">${item.count} แห่ง (${item.pct}%)</span>
        </div>
        <div class="curriculum-bar-track">
          <div class="curriculum-bar-fill" style="width: ${Math.max(item.pct, 4)}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================================
// Generic Drill-Down Modal & Quick Filters
// =========================================================================
function openDrillDownModal({ title, subtitle, icon, schools }) {
  currentDrillDownSchools = schools || [];
  const titleEl = document.getElementById('drillDownTitle');
  const subEl = document.getElementById('drillDownSubtitle');
  const iconEl = document.getElementById('drillDownIcon');
  const searchInput = document.getElementById('drillDownSearchInput');
  const overlay = document.getElementById('drillDownModalOverlay');

  if (titleEl) titleEl.textContent = title || 'รายชื่อโรงเรียน';
  if (subEl) subEl.textContent = subtitle || `พบทั้งหมด ${currentDrillDownSchools.length} แห่ง`;
  if (iconEl) iconEl.innerHTML = `<i class="${icon || 'fa-solid fa-school'}"></i>`;
  if (searchInput) searchInput.value = '';

  filterDrillDownList();
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.add('active');
  }
}

function closeDrillDownModal() {
  const overlay = document.getElementById('drillDownModalOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.remove('active');
  }
}

function filterDrillDownList() {
  const q = (document.getElementById('drillDownSearchInput')?.value || '').trim().toLowerCase();
  const body = document.getElementById('drillDownListBody');
  const countEl = document.getElementById('drillDownFilteredCount');
  if (!body) return;

  let filtered = currentDrillDownSchools;
  if (q) {
    filtered = currentDrillDownSchools.filter(s => {
      const nameTh = (s.school_name_th || '').toLowerCase();
      const nameEn = (s.school_name_en || '').toLowerCase();
      const code = (s.school_code || '').toLowerCase();
      const prov = (s.province || '').toLowerCase();
      const dist = (s.district || '').toLowerCase();
      const phone = (s.telephone || '').toLowerCase();
      const lvls = (Array.isArray(s.levels_offered) ? s.levels_offered.join(' ') : (s.levels_offered || '')).toLowerCase();
      return nameTh.includes(q) || nameEn.includes(q) || code.includes(q) || prov.includes(q) || dist.includes(q) || phone.includes(q) || lvls.includes(q);
    });
  }

  if (countEl) countEl.textContent = `แสดง ${filtered.length} จาก ${currentDrillDownSchools.length} แห่ง`;

  if (filtered.length === 0) {
    body.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 1.5rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
        <div>ไม่พบโรงเรียนที่ตรงกับคำค้นหา</div>
      </div>
    `;
    return;
  }

  body.innerHTML = filtered.map(s => {
    const lvls = Array.isArray(s.levels_offered) ? s.levels_offered : (s.levels_offered ? [s.levels_offered] : []);
    const lvlPills = lvls.slice(0, 3).map(l => `<span class="badge-metric-mini">${l}</span>`).join(' ');
    const extraLvls = lvls.length > 3 ? `<span class="badge-metric-mini">+${lvls.length - 3}</span>` : '';
    const stu = parseInt(s.student_count) || 0;
    const webLink = s.website ? `<a href="${s.website}" target="_blank" class="url-link" style="font-size: 0.78rem;" onclick="event.stopPropagation()"><i class="fa-solid fa-arrow-up-right-from-square"></i> <span>${s.website.replace(/^https?:\/\//, '')}</span></a>` : '<span style="color: var(--text-dim); font-size: 0.76rem;">ไม่มีเว็บ</span>';

    return `
      <div class="drilldown-school-card" onclick="openDetailModal('${s.school_code}')">
        <div class="drilldown-school-info">
          <div class="drilldown-school-name-th">${s.school_name_th}</div>
          <div class="drilldown-school-name-en">${s.school_name_en || '—'}</div>
          <div class="drilldown-school-meta">
            <span class="badge badge-verified" style="font-family: monospace;">${s.school_code}</span>
            <span class="badge-province">${s.province || '—'} ${s.district ? '• ' + s.district : ''}</span>
            ${lvlPills} ${extraLvls}
            ${stu > 0 ? `<span class="badge-metric-mini" style="color: var(--accent-emerald); font-weight: 600;"><i class="fa-solid fa-user-graduate"></i> ${stu.toLocaleString()} คน</span>` : ''}
          </div>
        </div>
        <div class="drilldown-actions">
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            ${webLink}
            ${s.telephone ? `<span class="school-phone"><i class="fa-solid fa-phone" style="font-size: 0.7rem;"></i> ${s.telephone}</span>` : ''}
          </div>
          <button type="button" class="btn btn-mini btn-solid-primary" style="padding: 6px 12px; margin-left: 6px;" onclick="event.stopPropagation(); openDetailModal('${s.school_code}')">
            <i class="fa-solid fa-circle-info"></i> ข้อมูลเชิงลึก
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Drill-Down Specific Handlers
function openProvinceDrillDown(provName) {
  if (typeof allSchools === 'undefined') return;
  const matches = allSchools.filter(s => (s.province || '') === provName);
  openDrillDownModal({
    title: `โรงเรียนนานาชาติในจังหวัด "${provName}"`,
    subtitle: `พบทั้งหมด ${matches.length} แห่ง`,
    icon: 'fa-solid fa-map-location-dot',
    schools: matches
  });
}

function openCurriculumDrillDown(curriculumName, isNormalized = true) {
  if (typeof allSchools === 'undefined') return;
  
  let matches = [];
  if (isNormalized) {
    matches = allSchools.filter(s => {
      const currs = Array.isArray(s.curriculums) ? s.curriculums : (s.curriculums ? [s.curriculums] : []);
      if (currs.length === 0) {
        return curriculumName === 'หลักสูตรสากลทั่วไป (General International)';
      }
      return currs.some(c => normalizeCurriculum(c) === curriculumName);
    });
  } else {
    matches = allSchools.filter(s => {
      const currs = Array.isArray(s.curriculums) ? s.curriculums : (s.curriculums ? [s.curriculums] : []);
      if (curriculumName.includes('General International')) return currs.length === 0;
      return currs.some(c => (c || '').trim() === curriculumName);
    });
  }

  openDrillDownModal({
    title: `หลักสูตร: ${curriculumName}`,
    subtitle: `โรงเรียนที่เปิดสอน ${matches.length} แห่ง ${isNormalized ? '(จัดกลุ่มมาตรฐานสากล)' : '(ตาม สช.)'}`,
    icon: 'fa-solid fa-book-open',
    schools: matches
  });
}

function openLevelDrillDown(levelName) {
  if (typeof allSchools === 'undefined') return;
  const matches = allSchools.filter(s => {
    const lvls = Array.isArray(s.levels_offered) ? s.levels_offered : (s.levels_offered ? [s.levels_offered] : []);
    return lvls.join(' ').includes(levelName);
  });
  openDrillDownModal({
    title: `โรงเรียนที่เปิดสอนระดับ "${levelName}"`,
    subtitle: `พบทั้งหมด ${matches.length} แห่ง`,
    icon: 'fa-solid fa-layer-group',
    schools: matches
  });
}

function openAllThroughDrillDown() {
  if (typeof allSchools === 'undefined') return;
  const matches = allSchools.filter(s => {
    const lvls = Array.isArray(s.levels_offered) ? s.levels_offered : (s.levels_offered ? [s.levels_offered] : []);
    return lvls.includes('ก่อนอนุบาล') && lvls.includes('อนุบาล') && lvls.includes('ประถมศึกษา') && lvls.includes('มัธยมศึกษาตอนต้น') && lvls.includes('มัธยมศึกษาตอนปลาย');
  });
  openDrillDownModal({
    title: 'โรงเรียนเปิดสอนครบวงจร (All-Through Schools)',
    subtitle: `เปิดตั้งแต่ก่อนอนุบาลถึง ม.ปลาย (${matches.length} แห่ง)`,
    icon: 'fa-solid fa-award',
    schools: matches
  });
}

function openKindergartenOnlyDrillDown() {
  if (typeof allSchools === 'undefined') return;
  const matches = allSchools.filter(s => {
    const lvls = Array.isArray(s.levels_offered) ? s.levels_offered : (s.levels_offered ? [s.levels_offered] : []);
    const hasEarly = lvls.includes('ก่อนอนุบาล') || lvls.includes('อนุบาล');
    const hasHigher = lvls.includes('ประถมศึกษา') || lvls.includes('มัธยมศึกษาตอนต้น') || lvls.includes('มัธยมศึกษาตอนปลาย');
    return hasEarly && !hasHigher;
  });
  openDrillDownModal({
    title: 'โรงเรียนเฉพาะระดับปฐมวัย / อนุบาล (Early Years Only)',
    subtitle: `เปิดเฉพาะก่อนอนุบาลหรืออนุบาล (${matches.length} แห่ง)`,
    icon: 'fa-solid fa-shapes',
    schools: matches
  });
}

function openAllSchoolsDrillDown() {
  if (typeof allSchools === 'undefined') return;
  openDrillDownModal({
    title: 'รายชื่อโรงเรียนนานาชาติทั้งหมดในประเทศไทย',
    subtitle: `ฐานข้อมูล สช. รวม ${allSchools.length} แห่ง`,
    icon: 'fa-solid fa-school',
    schools: allSchools
  });
}

function openStudentsDrillDown() {
  if (typeof allSchools === 'undefined') return;
  const sorted = [...allSchools].sort((a, b) => (parseInt(b.student_count) || 0) - (parseInt(a.student_count) || 0));
  openDrillDownModal({
    title: 'สถิติจำนวนนักเรียน (เรียงจากมากไปน้อย)',
    subtitle: `โรงเรียนทั้งหมด ${allSchools.length} แห่ง`,
    icon: 'fa-solid fa-user-graduate',
    schools: sorted
  });
}

function openTeachersDrillDown() {
  if (typeof allSchools === 'undefined') return;
  const sorted = [...allSchools].sort((a, b) => (parseInt(b.teacher_count) || 0) - (parseInt(a.teacher_count) || 0));
  openDrillDownModal({
    title: 'สถิติจำนวนครูและบุคลากร (เรียงจากมากไปน้อย)',
    subtitle: `โรงเรียนทั้งหมด ${allSchools.length} แห่ง`,
    icon: 'fa-solid fa-chalkboard-user',
    schools: sorted
  });
}

function openSubsidyDrillDown(subsidyType) {
  if (typeof allSchools === 'undefined') return;
  const matches = allSchools.filter(s => {
    if (subsidyType === 'รับเงินอุดหนุน') return s.government_support === 'รับเงินอุดหนุน';
    return s.government_support !== 'รับเงินอุดหนุน';
  });
  openDrillDownModal({
    title: `โรงเรียนสถานะ "${subsidyType}"`,
    subtitle: `พบทั้งหมด ${matches.length} แห่ง`,
    icon: 'fa-solid fa-hand-holding-dollar',
    schools: matches
  });
}

function openGpsDrillDown(precisionType) {
  if (typeof allSchools === 'undefined') return;
  const matches = allSchools.filter(s => s.gps_precision === precisionType);
  openDrillDownModal({
    title: precisionType === 'Exact' ? 'โรงเรียนที่มีพิกัด GPS แม่นยำระดับอาคารจริง (Exact)' : 'โรงเรียนที่มีพิกัด GPS ประมาณการ (Approximate)',
    subtitle: `พบทั้งหมด ${matches.length} แห่ง`,
    icon: 'fa-solid fa-location-crosshairs',
    schools: matches
  });
}

function openWebsiteDrillDown(hasWebsite) {
  if (typeof allSchools === 'undefined') return;
  const matches = allSchools.filter(s => {
    const has = s.website && s.website.trim() !== '';
    return hasWebsite ? has : !has;
  });
  openDrillDownModal({
    title: hasWebsite ? 'โรงเรียนที่มี Official Website ทางการแล้ว' : 'โรงเรียนที่ยังไม่มี Official Website',
    subtitle: `พบทั้งหมด ${matches.length} แห่ง`,
    icon: 'fa-solid fa-globe',
    schools: matches
  });
}

function scrollToProvinces() {
  const el = document.getElementById('dashProvincesSection');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
