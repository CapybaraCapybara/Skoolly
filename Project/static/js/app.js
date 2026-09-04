/**
 * OPEC International Schools - Core Application Script
 * Handles table data rendering, searching, filtering, modal interactions,
 * real-time process polling, and backend API commands.
 */

// Global State
let allSchools = [];
let activeDetailSchool = null;
let activeEditCode = null;
let isPolling = false;
let pollTimeoutId = null;

// Tab Navigation
function switchNav(tabName, clickedBtn) {
  document.querySelectorAll('.nav-item-btn').forEach(b => b.classList.remove('active'));
  if (clickedBtn) {
    clickedBtn.classList.add('active');
  } else {
    const defaultBtn = document.querySelector(`.nav-item-btn[onclick*="${tabName}"]`);
    if (defaultBtn) defaultBtn.classList.add('active');
  }

  const secDashboard = document.getElementById('sectionDashboard');
  const secSchools = document.getElementById('sectionSchools');
  const secPlaceholder = document.getElementById('sectionPlaceholder');
  const placeholderTitle = document.getElementById('placeholderTitle');

  if (tabName === 'dashboard') {
    if (secDashboard) secDashboard.style.display = 'block';
    if (secSchools) secSchools.style.display = 'none';
    if (secPlaceholder) secPlaceholder.style.display = 'none';
    if (typeof renderDashboard === 'function') renderDashboard();
  } else if (tabName === 'schools') {
    if (secDashboard) secDashboard.style.display = 'none';
    if (secSchools) secSchools.style.display = 'block';
    if (secPlaceholder) secPlaceholder.style.display = 'none';
    filterTable();
  } else {
    if (secDashboard) secDashboard.style.display = 'none';
    if (secSchools) secSchools.style.display = 'none';
    if (secPlaceholder) secPlaceholder.style.display = 'block';
    const titles = {
      'verify': 'School Verification System',
      'reviews': 'School Reviews & Feedback',
      'tickets': 'Support Tickets & Issues',
      'ai-logs': 'AI Intelligence & Scraper Logs',
      'audit-log': 'Audit & Security Logs',
      'users': 'User Management & Permissions',
      'scraper': 'Advanced OPEC Scraper Control',
      'analytics': 'International Schools Analytics'
    };
    if (placeholderTitle) placeholderTitle.textContent = titles[tabName] || tabName.toUpperCase();
  }
}

// Theme Management
function initTheme() {
  const saved = localStorage.getItem('opec_admin_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('opec_admin_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

initTheme();

function setButtonsDisabled(disabled) {
  const b1 = document.getElementById('btnFetchOpec');
  const b2 = document.getElementById('btnEnrichEn');
  const b3 = document.getElementById('btnEnrichGps');
  const b4 = document.getElementById('btnFetchWebsites');
  const b5 = document.getElementById('btnEnrichData');
  const b6 = document.getElementById('btnClearData');
  if (b1) b1.disabled = disabled;
  if (b2) b2.disabled = disabled;
  if (b3) b3.disabled = disabled;
  if (b4) b4.disabled = disabled;
  if (b5) b5.disabled = disabled;
  if (b6) b6.disabled = disabled;
}

function showToast(msg) {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMessage');
  if (toast && msgEl) {
    msgEl.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }
}

async function loadData(retry = true) {
  try {
    const schoolsRes = await fetch('/api/schools?t=' + Date.now(), { cache: 'no-store' });
    if (schoolsRes.ok) {
      const newSchools = await schoolsRes.json();
      if (Array.isArray(newSchools)) {
        allSchools = newSchools;
        renderStats();
        populateProvinces();
        filterTable();
        if (typeof renderDashboard === 'function') renderDashboard();

        const navCount = document.getElementById('navSchoolCount');
        if (navCount) navCount.textContent = allSchools.length;

        if (allSchools.length === 0 && retry) {
          setTimeout(() => loadData(false), 500);
        }
      }
    }
  } catch (err) {
    console.error('[loadData] Error:', err);
  }
}

async function loadProgressOnly() {
  try {
    const res = await fetch('/api/progress?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[loadProgressOnly] Error:', err);
    return null;
  }
}

function updateProgressUI(state) {
  if (!state) return;

  const taskEl = document.getElementById('progressTask');
  if (taskEl && state.task) {
    if (state.is_running) {
      taskEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${state.task}`;
    } else {
      taskEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${state.task}`;
    }
  }

  const percentEl = document.getElementById('progressPercent');
  if (percentEl) percentEl.textContent = `${state.percent || 0}%`;

  const barEl = document.getElementById('progressBarFill');
  if (barEl) barEl.style.width = `${Math.max(state.percent || 0, 3)}%`;

  if (state.logs && state.logs.length > 0) {
    const logBox = document.getElementById('logBox');
    if (logBox) {
      logBox.innerHTML = state.logs.map(l => `<div>${l}</div>`).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }
    const badge = document.getElementById('logCountBadge');
    if (badge) badge.textContent = `${state.logs.length} บรรทัด`;
  }
}

async function manualRefreshTable() {
  const icon = document.getElementById('refreshTableIcon');
  if (icon) icon.classList.add('fa-spin');

  try {
    const state = await loadProgressOnly();
    if (state && !state.is_running) {
      setButtonsDisabled(false);
    }
  } catch (e) {}

  await loadData();
  showToast('อัปเดตข้อมูลตารางเรียบร้อย');

  setTimeout(() => {
    if (icon) icon.classList.remove('fa-spin');
  }, 500);
}

function toggleExpandLog() {
  const logBox = document.getElementById('logBox');
  const btn = document.getElementById('btnExpandLog');
  if (logBox && btn) {
    if (logBox.classList.contains('expanded')) {
      logBox.classList.remove('expanded');
      btn.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i> ขยาย';
    } else {
      logBox.classList.add('expanded');
      btn.innerHTML = '<i class="fa-solid fa-down-left-and-up-right-to-center"></i> ย่อ';
    }
  }
}

function toggleLogBox() {
  const logBox = document.getElementById('logBox');
  const btn = document.getElementById('btnToggleLog');
  if (logBox && btn) {
    if (logBox.style.display === 'none') {
      logBox.style.display = 'block';
      btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> ซ่อน';
    } else {
      logBox.style.display = 'none';
      btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> แสดง';
    }
  }
}

function copyLogContent() {
  const logBox = document.getElementById('logBox');
  if (!logBox) return;
  const text = logBox.innerText || logBox.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('คัดลอก Log เรียบร้อยแล้ว');
  });
}

async function clearLogs() {
  try {
    await fetch('/api/clear-logs', { method: 'POST' });
    const logBox = document.getElementById('logBox');
    if (logBox) logBox.innerHTML = 'พร้อมเริ่มการทำงาน... (กดปุ่มด้านบนเพื่อเริ่มดึงข้อมูล)';
    const badge = document.getElementById('logCountBadge');
    if (badge) badge.textContent = '0 รายการ';
    showToast('ล้าง Log เรียบร้อย');
  } catch (err) {
    console.error('Clear logs error:', err);
  }
}

function renderStats() {
  const total = allSchools.length;
  const hasWeb = allSchools.filter(s => s.website && s.website.trim() !== '').length;
  const missingEn = allSchools.filter(s => !s.school_name_en || s.school_name_en.trim() === '').length;
  const missingGps = allSchools.filter(s => {
    const lat = String(s.latitude || '').trim();
    const lon = String(s.longitude || '').trim();
    return !lat || !lon || lat === '0' || lon === '0' || lat === 'null' || lon === 'null';
  }).length;
  const provs = new Set(allSchools.map(s => s.province).filter(Boolean)).size;

  const elTotal = document.getElementById('statTotal');
  const elWeb = document.getElementById('statWebsites');
  const elMissingEn = document.getElementById('statMissingEn');
  const elMissingGps = document.getElementById('statMissingGps');
  const elProv = document.getElementById('statProvinces');
  const elMiss = document.getElementById('statMissing');

  if (elTotal) elTotal.textContent = total;
  if (elWeb) elWeb.textContent = `${hasWeb} (${total > 0 ? Math.round(hasWeb/total*100) : 0}%)`;
  if (elMissingEn) elMissingEn.textContent = `${missingEn} แห่ง`;
  if (elMissingGps) elMissingGps.textContent = `${missingGps} แห่ง`;
  if (elProv) elProv.textContent = `${provs} จังหวัด`;
  if (elMiss) elMiss.textContent = (total - hasWeb);

  // Header Timestamp Badge
  const firstWithFetchTime = allSchools.find(s => s.fetched_at || s.last_updated);
  const headerBadge = document.getElementById('headerLastFetchedBadge');
  const headerTime = document.getElementById('headerLastFetchedTime');
  if (firstWithFetchTime && headerBadge && headerTime) {
    headerBadge.style.display = 'inline-flex';
    headerTime.textContent = firstWithFetchTime.fetched_at || firstWithFetchTime.last_updated || '—';
  } else if (headerBadge) {
    headerBadge.style.display = 'none';
  }
}

// =========================================================================
// Searchable Province Combobox Logic
// =========================================================================
let allProvincesList = [];
let selectedProvince = '';
let highlightedIndex = -1;

function populateProvinces() {
  const provCounts = {};
  allSchools.forEach(s => {
    if (s.province && s.province.trim() !== '') {
      provCounts[s.province] = (provCounts[s.province] || 0) + 1;
    }
  });

  const provs = Object.keys(provCounts).sort((a, b) => a.localeCompare(b, 'th'));
  allProvincesList = provs.map(p => ({
    name: p,
    count: provCounts[p]
  }));

  if (selectedProvince && !provCounts[selectedProvince]) {
    selectedProvince = '';
  }

  const input = document.getElementById('provinceInput');
  if (input) {
    input.value = selectedProvince;
    const clearBtn = document.getElementById('provinceClearBtn');
    if (clearBtn) clearBtn.style.display = selectedProvince ? 'inline-block' : 'none';
  }

  renderProvinceDropdown('');
}

function renderProvinceDropdown(filterText = '') {
  const dropdown = document.getElementById('provinceDropdown');
  if (!dropdown) return;

  const q = (filterText || '').trim().toLowerCase();
  let matches = allProvincesList;
  if (q) {
    matches = allProvincesList.filter(item => item.name.toLowerCase().includes(q));
  }

  let html = '';
  const isAllSelected = !selectedProvince;
  html += `
    <div class="combobox-option ${isAllSelected && !q ? 'selected' : ''}" onclick="selectProvince('')" data-value="">
      <span>-- ทุกจังหวัด --</span>
      <span class="combobox-badge">${allSchools.length}</span>
    </div>
  `;

  if (matches.length > 0) {
    matches.forEach(item => {
      const isSelected = selectedProvince === item.name;
      html += `
        <div class="combobox-option ${isSelected ? 'selected' : ''}" onclick="selectProvince('${item.name.replace(/'/g, "\\'")}')" data-value="${item.name}">
          <span>${item.name}</span>
          <span class="combobox-badge">${item.count}</span>
        </div>
      `;
    });
  } else {
    html += `<div class="combobox-empty">ไม่พบจังหวัด "${filterText}"</div>`;
  }

  dropdown.innerHTML = html;
  highlightedIndex = -1;
}

function openProvinceDropdown() {
  const wrap = document.getElementById('provinceCombobox');
  const dropdown = document.getElementById('provinceDropdown');
  const input = document.getElementById('provinceInput');
  if (wrap && dropdown) {
    wrap.classList.add('open');
    dropdown.style.display = 'block';
    renderProvinceDropdown(input ? input.value : '');
  }
}

function closeProvinceDropdown() {
  const wrap = document.getElementById('provinceCombobox');
  const dropdown = document.getElementById('provinceDropdown');
  const input = document.getElementById('provinceInput');
  if (wrap && dropdown) {
    wrap.classList.remove('open');
    dropdown.style.display = 'none';
    if (input) {
      input.value = selectedProvince;
      const clearBtn = document.getElementById('provinceClearBtn');
      if (clearBtn) clearBtn.style.display = selectedProvince ? 'inline-block' : 'none';
    }
  }
}

function toggleProvinceDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('provinceDropdown');
  if (dropdown && dropdown.style.display === 'block') {
    closeProvinceDropdown();
  } else {
    openProvinceDropdown();
    const input = document.getElementById('provinceInput');
    if (input) input.focus();
  }
}

function selectProvince(provName) {
  selectedProvince = provName || '';
  const input = document.getElementById('provinceInput');
  if (input) {
    input.value = selectedProvince;
    const clearBtn = document.getElementById('provinceClearBtn');
    if (clearBtn) clearBtn.style.display = selectedProvince ? 'inline-block' : 'none';
  }
  closeProvinceDropdown();
  filterTable();
}

function clearProvinceSelection(e) {
  if (e) e.stopPropagation();
  selectedProvince = '';
  const input = document.getElementById('provinceInput');
  if (input) {
    input.value = '';
    const clearBtn = document.getElementById('provinceClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
  }
  closeProvinceDropdown();
  filterTable();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    filterTable();
  }
}

// =========================================================================
// Clickable Stat Card Filtering Logic
// =========================================================================
let activeCardFilter = 'all';

function filterByStatCard(filterType, cardEl) {
  if (activeCardFilter === filterType && filterType !== 'all') {
    activeCardFilter = 'all';
  } else {
    activeCardFilter = filterType;
  }

  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
  const activeCard = document.getElementById(`cardFilter_${activeCardFilter}`);
  if (activeCard) activeCard.classList.add('active-filter');

  const banner = document.getElementById('activeStatFilterBanner');
  const labelEl = document.getElementById('activeStatFilterLabel');
  
  if (activeCardFilter === 'all') {
    if (banner) banner.style.display = 'none';
  } else {
    if (banner) banner.style.display = 'flex';
    let label = '';
    if (activeCardFilter === 'has_website') label = '🟢 มี Official Website แล้ว';
    else if (activeCardFilter === 'missing_en') label = '⚠️ ไม่มีชื่อภาษาอังกฤษ (EN)';
    else if (activeCardFilter === 'missing_gps') label = '📍 ไม่มีพิกัด GPS หรือเป็นพิกัดประมาณการ';
    else if (activeCardFilter === 'provinces') label = '🗺️ เรียงจัดกลุ่มตามจังหวัด (ก-ฮ)';
    else if (activeCardFilter === 'missing_website') label = '🔴 ยังไม่มี Official Website';
    if (labelEl) labelEl.textContent = label;
  }

  filterTable();
}

function clearCardFilter() {
  filterByStatCard('all');
}

function filterTable() {
  const searchEl = document.getElementById('searchInput');
  const q = searchEl ? searchEl.value.toLowerCase().trim() : '';
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

  const prov = selectedProvince;
  const status = document.getElementById('statusSelect') ? document.getElementById('statusSelect').value : '';

  let filtered = allSchools.filter(s => {
    const matchProv = !prov || s.province === prov;
    
    const hasW = s.website && s.website.trim() !== '';
    const src = (s.website_source || '').toLowerCase();

    let matchStatus = true;
    if (status === 'has_website') {
      matchStatus = hasW;
    } else if (status === 'source_opec') {
      matchStatus = hasW && src === 'opec profile';
    } else if (status === 'source_live') {
      matchStatus = hasW && (src.includes('live domain') || src.includes('verified') || src.includes('search'));
    } else if (status === 'no_website') {
      matchStatus = !hasW;
    }

    // Active Card Filter
    let matchCard = true;
    if (activeCardFilter === 'has_website') {
      matchCard = hasW;
    } else if (activeCardFilter === 'missing_website') {
      matchCard = !hasW;
    } else if (activeCardFilter === 'missing_en') {
      matchCard = !s.school_name_en || s.school_name_en.trim() === '';
    } else if (activeCardFilter === 'missing_gps') {
      const lat = String(s.latitude || '').trim();
      const lon = String(s.longitude || '').trim();
      const isMissing = !lat || !lon || lat === '0' || lon === '0' || lat === 'null' || lon === 'null';
      const isApprox = s.gps_precision === 'Approximate' || (s.gps_source && (s.gps_source.includes('District') || s.gps_source.includes('ประมาณการ') || s.gps_source.includes('Placeholder')));
      matchCard = isMissing || isApprox;
    }
    
    const curriculumsStr = Array.isArray(s.curriculums) ? s.curriculums.join(' ').toLowerCase() : '';
    const levelsStr = Array.isArray(s.levels_offered) ? s.levels_offered.join(' ').toLowerCase() : '';

    const matchQ = !q ||
      (s.school_name_th && s.school_name_th.toLowerCase().includes(q)) ||
      (s.school_name_en && s.school_name_en.toLowerCase().includes(q)) ||
      (s.school_code && s.school_code.toLowerCase().includes(q)) ||
      (s.address && s.address.toLowerCase().includes(q)) ||
      (s.level_range && s.level_range.toLowerCase().includes(q)) ||
      curriculumsStr.includes(q) ||
      levelsStr.includes(q) ||
      (s.telephone && s.telephone.toLowerCase().includes(q));

    return matchProv && matchStatus && matchCard && matchQ;
  });

  if (activeCardFilter === 'provinces') {
    filtered = [...filtered].sort((a, b) => {
      const provA = a.province || '';
      const provB = b.province || '';
      const pComp = provA.localeCompare(provB, 'th');
      if (pComp !== 0) return pComp;
      return (a.school_name_th || '').localeCompare(b.school_name_th || '', 'th');
    });
  }

  const badge = document.getElementById('filterCountBadge');
  if (badge) badge.textContent = `แสดง ${filtered.length} จาก ${allSchools.length} แห่ง`;

  const statFilterCount = document.getElementById('activeStatFilterCount');
  if (statFilterCount) statFilterCount.textContent = filtered.length;

  renderTable(filtered);
}

function renderTable(items) {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 1.6rem; margin-bottom: 8px; display: block; color: var(--text-dim);"></i>
          <div style="font-weight: 500; font-size: 0.95rem; color: var(--text-main);">ไม่พบข้อมูลโรงเรียน</div>
          <div style="font-size: 0.82rem; margin-top: 2px;">กดปุ่ม <b>"ดึงข้อมูล OPEC (ปุ่ม 1)"</b> เพื่อเริ่มต้น</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  items.forEach((s, idx) => {
    const tr = document.createElement('tr');

    let webHtml = '<span style="color: var(--text-dim); font-size: 0.8rem;">— ไม่มี URL —</span>';
    if (s.website) {
      webHtml = `
        <div style="display: flex; align-items: center; gap: 5px;">
          <a href="${s.website}" target="_blank" rel="noopener" class="url-link" title="${s.website}">
            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.72rem;"></i>
            <span>${s.website}</span>
          </a>
          <button type="button" class="btn-copy-mini" title="คัดลอก URL" onclick="copyText('${s.website}')">
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>
      `;
    }

    let badgeClass = 'badge-notfound';
    let srcLabel = s.website_source || 'Not Found';
    if (s.website_source === 'OPEC Profile') badgeClass = 'badge-opec';
    else if (s.website_source === 'Verified Official Directory') badgeClass = 'badge-verified';
    else if (s.website_source === 'Manual Edit') badgeClass = 'badge-manual';
    else if (s.website_source && s.website_source.includes('Live Domain')) badgeClass = 'badge-verified';

    const levelRange = s.level_range || (Array.isArray(s.levels_offered) && s.levels_offered.length > 0 ? s.levels_offered.join(', ') : '');

    tr.innerHTML = `
      <td style="text-align: center; color: var(--text-dim); font-size: 0.78rem;">${idx + 1}</td>
      <td><span style="font-family: 'Plus Jakarta Sans', monospace; color: var(--text-muted); font-size: 0.82rem; font-weight: 600;">${s.school_code}</span></td>
      <td>
        <div class="school-title-wrap" onclick="openDetailModal('${s.school_code}')" title="คลิกเพื่อดูข้อมูลทั้งหมด">
          <div class="school-title-th">${s.school_name_th || '—'}</div>
          <div class="school-title-en">${s.school_name_en || ''}</div>
        </div>
        <div class="school-tags-row">
          ${levelRange && levelRange !== 'ไม่ระบุ' ? `<span class="badge-level-pill"><i class="fa-solid fa-graduation-cap"></i> ${levelRange}</span>` : ''}
          ${s.student_count && s.student_count > 0 ? `<span class="badge-metric-mini"><i class="fa-solid fa-user-graduate"></i> ${s.student_count} คน</span>` : ''}
          ${s.gps_precision === 'Approximate' || (s.gps_source && (s.gps_source.includes('District') || s.gps_source.includes('ประมาณการ') || s.gps_source.includes('Placeholder'))) ? `<span class="badge badge-warning" style="font-size: 0.72rem; padding: 2px 6px;" title="พิกัด GPS เป็นการประมาณการระดับอำเภอ/ตำบล"><i class="fa-solid fa-location-crosshairs"></i> พิกัดระดับอำเภอ</span>` : ''}
        </div>
      </td>
      <td><span class="badge-province">${s.province || '—'}</span></td>
      <td>${webHtml}</td>
      <td><span class="badge ${badgeClass}">${srcLabel}</span></td>
      <td style="text-align: center; white-space: nowrap;">
        <a href="${s.opec_profile_url}" target="_blank" rel="noopener" class="btn-view-opec">
          <i class="fa-solid fa-id-card"></i> ดู สช.
        </a>
      </td>
      <td style="text-align: center;">
        <div class="action-icons">
          <button type="button" class="btn-action-icon" title="ดูข้อมูลเท่าที่มีทั้งหมด" onclick="openDetailModal('${s.school_code}')">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button type="button" class="btn-action-icon" title="แก้ไข URL" onclick="openEditModal('${s.school_code}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="btn-action-icon" title="ค้นหาเฉพาะโรงเรียนนี้" onclick="resolveSingle('${s.school_code}')">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function copyText(text, successMsg = 'คัดลอกเรียบร้อย') {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      fallbackCopy(text, successMsg);
    });
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textarea);
}

// =========================================================================
// View Comprehensive Landscape Detail Modal (แสดงครบ 100% ทุกฟิลด์)
// =========================================================================
function openDetailModal(code) {
  const s = allSchools.find(item => item.school_code === code);
  if (!s) return;
  activeDetailSchool = s;

  // Logo Avatar
  const logoContainer = document.getElementById('detLogoAvatar');
  if (s.school_logo_url) {
    logoContainer.innerHTML = `<img src="${s.school_logo_url}" alt="School Logo" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-graduation-cap\\' style=\\'color:#2563eb; font-size:1.3rem;\\'></i>'">`;
  } else {
    logoContainer.innerHTML = '<i class="fa-solid fa-graduation-cap" style="color: #2563eb; font-size: 1.3rem;"></i>';
  }

  // Header info
  document.getElementById('detSchoolNameTh').textContent = s.school_name_th || '—';
  document.getElementById('detSchoolNameEn').textContent = s.school_name_en || '—';
  document.getElementById('detSchoolCodeBadge').textContent = `รหัส สช: ${s.school_code || '—'}`;
  document.getElementById('detProvinceBadge').textContent = s.province || '—';
  document.getElementById('detGovSupportBadge').textContent = s.government_support || 'ไม่รับเงินอุดหนุน';

  // Card 1: Levels & Academics
  const allPossibleLevels = ["ก่อนอนุบาล", "อนุบาล", "ประถมศึกษา", "มัธยมศึกษาตอนต้น", "มัธยมศึกษาตอนปลาย"];
  const activeLevels = Array.isArray(s.levels_offered) ? s.levels_offered : [];
  const levelsContainer = document.getElementById('detLevelsList');
  levelsContainer.innerHTML = allPossibleLevels.map(lvl => {
    const isActive = activeLevels.includes(lvl);
    return `<span class="level-tag ${isActive ? 'active' : 'inactive'}">${isActive ? '<i class="fa-solid fa-check"></i> ' : ''}${lvl}</span>`;
  }).join('');

  document.getElementById('detLevelRange').textContent = s.level_range && s.level_range !== 'ไม่ระบุ' ? s.level_range : (activeLevels.length > 0 ? activeLevels.join(' - ') : '—');
  
  const currContainer = document.getElementById('detCurriculums');
  if (Array.isArray(s.curriculums) && s.curriculums.length > 0) {
    currContainer.innerHTML = s.curriculums.map(c => `<span class="badge badge-verified" style="margin: 2px 3px 2px 0; font-size: 0.76rem;">${c}</span>`).join('');
  } else {
    currContainer.textContent = '—';
  }
  document.getElementById('detGovernmentSupport').textContent = s.government_support || '—';

  // Card 2: Metrics & Admins
  document.getElementById('detStudentCount').textContent = (s.student_count && s.student_count > 0) ? `${s.student_count} คน` : '—';
  document.getElementById('detTeacherCount').textContent = (s.teacher_count && s.teacher_count > 0) ? `${s.teacher_count} คน` : '—';

  const admins = [];
  if (s.director_name) admins.push(`ผู้อำนวยการ: ${s.director_name}`);
  if (s.licensee_name) admins.push(`ผู้รับใบอนุญาต: ${s.licensee_name}`);
  if (s.manager_name) admins.push(`ผู้จัดการ: ${s.manager_name}`);
  document.getElementById('detAdminsList').innerHTML = admins.length > 0 ? admins.map(a => `<div>• ${a}</div>`).join('') : '<span style="color:var(--text-dim)">— ไม่ระบุใน สช. —</span>';

  // Card 3: Location & Address
  document.getElementById('detCode').textContent = s.school_code || '—';
  document.getElementById('detProvince').textContent = s.province || '—';
  document.getElementById('detDistrict').textContent = s.district || '—';
  document.getElementById('detSubdistrict').textContent = s.subdistrict || '—';
  document.getElementById('detAddress').textContent = s.address || '—';

  // Card 4: Online & Socials
  const offWebEl = document.getElementById('detOfficialWeb');
  if (s.website) {
    offWebEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
        <a href="${s.website}" target="_blank" rel="noopener" style="font-weight: 600;">${s.website}</a>
        <button type="button" class="btn-copy-mini" onclick="copyText('${s.website}')"><i class="fa-solid fa-copy"></i></button>
      </div>
    `;
  } else {
    offWebEl.innerHTML = '<span style="color: var(--text-dim);">— ยังไม่มี Website —</span>';
  }

  document.getElementById('detWebSource').innerHTML = `<span class="badge badge-verified">${s.website_source || 'Not Found'}</span>`;

  const opecProfEl = document.getElementById('detOpecProfile');
  if (s.opec_profile_url) {
    opecProfEl.innerHTML = `<a href="${s.opec_profile_url}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดหน้า สช. (school.opec.go.th)</a>`;
  } else {
    opecProfEl.textContent = '—';
  }

  const socials = [];
  if (s.facebook) socials.push(`<a href="${s.facebook}" target="_blank" rel="noopener"><i class="fa-brands fa-facebook" style="color:#1877f2"></i> Facebook</a>`);
  if (s.instagram) socials.push(`<a href="${s.instagram.startsWith('http') ? s.instagram : 'https://instagram.com/' + s.instagram}" target="_blank" rel="noopener"><i class="fa-brands fa-instagram" style="color:#e4405f"></i> Instagram</a>`);
  if (s.line_id) socials.push(`<span><i class="fa-brands fa-line" style="color:#06c755"></i> Line: ${s.line_id}</span>`);
  if (s.tiktok) socials.push(`<a href="${s.tiktok}" target="_blank" rel="noopener"><i class="fa-brands fa-tiktok"></i> TikTok</a>`);
  if (s.youtube) socials.push(`<a href="${s.youtube}" target="_blank" rel="noopener"><i class="fa-brands fa-youtube" style="color:#ff0000"></i> YouTube</a>`);
  document.getElementById('detSocials').innerHTML = socials.length > 0 ? socials.join(' &nbsp;|&nbsp; ') : '<span style="color:var(--text-dim)">—</span>';

  document.getElementById('detFetchedAt').textContent = s.fetched_at || '—';
  document.getElementById('detLastUpdated').textContent = s.last_updated || s.fetched_at || '—';

  // Card 5: Contact & Maps
  document.getElementById('detTelephone').textContent = s.telephone || '—';
  document.getElementById('detMobile').textContent = s.mobile || '—';
  document.getElementById('detEmail').textContent = s.email || '—';

  const lat = s.latitude || '';
  const lon = s.longitude || '';
  const gpsSource = s.gps_source || '';
  const isApprox = s.gps_precision === 'Approximate' || (gpsSource && (gpsSource.includes('District') || gpsSource.includes('Centroid') || gpsSource.includes('Placeholder') || gpsSource.includes('ประมาณการ')));
  
  if (lat && lon) {
    document.getElementById('detGps').textContent = `${lat}, ${lon}`;
    if (isApprox) {
      document.getElementById('detGpsPrecision').innerHTML = `<span class="badge badge-warning" style="font-size: 0.78rem;"><i class="fa-solid fa-triangle-exclamation"></i> พิกัดประมาณการ (ระดับอำเภอ/ตำบล)</span>`;
      document.getElementById('detGpsSource').innerHTML = `<span style="color: var(--badge-warning-text); font-weight: 500;">${gpsSource || 'District Centroid (ประมาณการ)'} <small style="display: block; color: var(--text-dim); margin-top: 2px;">⚠️ ไม่ใช่หมุดอาคารเป๊ะ แนะนำตรวจสอบหรือระบุเพิ่มเติม</small></span>`;
    } else {
      document.getElementById('detGpsPrecision').innerHTML = `<span class="badge badge-success" style="font-size: 0.78rem;"><i class="fa-solid fa-circle-check"></i> แม่นยำระดับอาคาร / วิทยาเขต / ถนน</span>`;
      document.getElementById('detGpsSource').innerHTML = `<span style="color: var(--accent-emerald); font-weight: 500;">${gpsSource || 'Official / Precise Geocode'}</span>`;
    }
    document.getElementById('detMapBtnContainer').innerHTML = `
      <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener" class="btn btn-muted" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 0.8rem;">
        <i class="fa-solid fa-map-pin" style="color: #ea4335;"></i> เปิดดูใน Google Maps ${isApprox ? '(พิกัดคร่าวๆ)' : ''}
      </a>
    `;
  } else {
    document.getElementById('detGps').textContent = '—';
    document.getElementById('detGpsPrecision').innerHTML = '<span style="color: var(--text-dim)">—</span>';
    document.getElementById('detGpsSource').innerHTML = '<span style="color: var(--text-dim)">—</span>';
    document.getElementById('detMapBtnContainer').innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem;">(ไม่มีพิกัด GPS)</span>';
  }

  // Card 6: Profile Extra
  let hasExtra = false;
  if (s.school_history) {
    document.getElementById('rowHistory').style.display = 'flex';
    document.getElementById('detHistory').textContent = s.school_history;
    hasExtra = true;
  } else {
    document.getElementById('rowHistory').style.display = 'none';
  }

  if (s.vision || s.mission) {
    document.getElementById('rowVision').style.display = 'flex';
    document.getElementById('detVision').textContent = `${s.vision || ''} ${s.mission ? ' / พันธกิจ: ' + s.mission : ''}`.trim();
    hasExtra = true;
  } else {
    document.getElementById('rowVision').style.display = 'none';
  }

  if (s.uniqueness || s.identity || s.maxim) {
    document.getElementById('rowIdentity').style.display = 'flex';
    document.getElementById('detIdentity').textContent = [s.uniqueness, s.identity, s.maxim].filter(Boolean).join(' | ');
    hasExtra = true;
  } else {
    document.getElementById('rowIdentity').style.display = 'none';
  }

  if (s.tags) {
    document.getElementById('rowTags').style.display = 'flex';
    document.getElementById('detTags').textContent = s.tags;
    hasExtra = true;
  } else {
    document.getElementById('rowTags').style.display = 'none';
  }

  document.getElementById('detProfileExtraCard').style.display = hasExtra ? 'flex' : 'none';
  document.getElementById('detailModalOverlay').style.display = 'flex';
}

function closeDetailModal() {
  document.getElementById('detailModalOverlay').style.display = 'none';
  activeDetailSchool = null;
}

function openEditFromDetail() {
  if (!activeDetailSchool) return;
  const code = activeDetailSchool.school_code;
  closeDetailModal();
  openEditModal(code);
}

function resolveFromDetail() {
  if (!activeDetailSchool) return;
  const code = activeDetailSchool.school_code;
  closeDetailModal();
  resolveSingle(code);
}

// Modal Edit URL
function openEditModal(code) {
  const school = allSchools.find(s => s.school_code === code);
  if (!school) return;
  activeEditCode = code;
  document.getElementById('modalSchoolName').textContent = `${school.school_name_th} (${school.school_name_en || ''})`;
  document.getElementById('modalWebsiteInput').value = school.website || 'https://';
  document.getElementById('editModalOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modalWebsiteInput').focus(), 100);
}

function closeEditModal() {
  document.getElementById('editModalOverlay').style.display = 'none';
  activeEditCode = null;
}

async function saveEditModal() {
  if (!activeEditCode) return;
  const newUrl = document.getElementById('modalWebsiteInput').value.trim();
  const code = activeEditCode;
  closeEditModal();

  try {
    await fetch(`/api/school/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: newUrl, website_source: 'Manual Edit' })
    });
    await loadData(false);
    showToast('บันทึก URL เรียบร้อย');
  } catch (err) {
    alert('เกิดข้อผิดพลาด: ' + err);
  }
}

async function resolveSingle(code) {
  const school = allSchools.find(s => s.school_code === code);
  if (!school) return;

  showToast(`กำลังค้นหา ${school.school_name_th}...`);
  try {
    const res = await fetch(`/api/school/${code}/resolve`, { method: 'POST' });
    if (res.ok) {
      const updated = await res.json();
      await loadData(false);
      if (updated.website) {
        showToast(`✅ พบ: ${updated.website}`);
      } else {
        showToast(`⚠️ ไม่พบเว็บไซต์ทางการ`);
      }
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาด: ' + err);
  }
}

// =========================================================================
// Custom Confirmation & Alert Dialog System
// =========================================================================
let currentDialogCallback = null;

function showConfirmModal(opts) {
  currentDialogCallback = opts.onConfirm;

  const badge = document.getElementById('dialogIconBadge');
  if (badge) badge.className = `dialog-icon-badge ${opts.type || 'info'}`;

  const iconEl = document.getElementById('dialogIcon');
  if (iconEl) iconEl.className = opts.iconClass || 'fa-solid fa-circle-question';

  const titleEl = document.getElementById('dialogTitle');
  if (titleEl) titleEl.textContent = opts.title || 'ยืนยันการดำเนินการ';

  const subEl = document.getElementById('dialogSubtitle');
  if (subEl) {
    if (opts.subtitle) {
      subEl.textContent = opts.subtitle;
      subEl.style.display = 'block';
    } else {
      subEl.style.display = 'none';
    }
  }

  const msgEl = document.getElementById('dialogMessage');
  if (msgEl) msgEl.innerHTML = opts.message || '';

  const extraBox = document.getElementById('dialogExtraBox');
  if (extraBox) {
    if (opts.extraHtml) {
      extraBox.innerHTML = opts.extraHtml;
      extraBox.style.display = 'flex';
    } else {
      extraBox.style.display = 'none';
    }
  }

  const cancelBtn = document.getElementById('dialogBtnCancel');
  if (cancelBtn) {
    if (opts.cancelText !== false && opts.cancelText !== '') {
      cancelBtn.style.display = 'inline-flex';
      cancelBtn.textContent = opts.cancelText || 'ยกเลิก';
    } else {
      cancelBtn.style.display = 'none';
    }
  }

  const confirmBtn = document.getElementById('dialogBtnConfirm');
  if (confirmBtn) {
    confirmBtn.innerHTML = opts.confirmText || '<i class="fa-solid fa-check"></i> ยืนยัน';
    confirmBtn.className = `btn ${opts.confirmBtnClass || 'btn-solid-primary'}`;
  }

  const overlay = document.getElementById('confirmDialogOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function handleDialogConfirm(event) {
  if (event) event.preventDefault();
  const cb = currentDialogCallback;
  currentDialogCallback = null;
  closeConfirmDialog();
  if (typeof cb === 'function') {
    cb();
  }
}

function closeConfirmDialog() {
  const overlay = document.getElementById('confirmDialogOverlay');
  if (overlay) overlay.style.display = 'none';
  currentDialogCallback = null;
}

function startFetchOpec() {
  showConfirmModal({
    title: 'ยืนยันการดึงข้อมูลจาก OPEC',
    subtitle: 'สำนักงานคณะกรรมการส่งเสริมการศึกษาเอกชน (school.opec.go.th)',
    message: 'ระบบจะเชื่อมต่อ API ของ สช. เพื่อดึงรายชื่อโรงเรียนนานาชาติ<b>ทั้งหมดที่มีในระบบ OPEC</b> พร้อมดึงสถิติจำนวนนักเรียน, จำนวนครู/บุคลากร, ระดับชั้นที่เปิดสอน และหลักสูตรการศึกษาทั้งหมดแบบ Real-Time',
    extraHtml: '<i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> ข้อมูลจะถูกบันทึกลงไฟล์ JSON และ CSV โดยอัตโนมัติ',
    iconClass: 'fa-solid fa-cloud-arrow-down',
    type: 'info',
    confirmText: '<i class="fa-solid fa-cloud-arrow-down"></i> เริ่มดึงข้อมูล OPEC',
    confirmBtnClass: 'btn-solid-primary',
    onConfirm: async () => {
      setButtonsDisabled(true);
      document.getElementById('progressBanner').style.display = 'block';
      document.getElementById('progressTask').innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังเชื่อมต่อและดึงข้อมูลจาก OPEC...`;
      document.getElementById('progressBarFill').style.width = '2%';
      document.getElementById('progressPercent').textContent = '2%';

      try {
        const res = await fetch('/api/fetch-opec', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'already_running') {
          showToast('⚠️ ระบบกำลังทำงานอยู่แล้ว กรุณารอสักครู่');
        }
        pollProgress();
      } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err);
        setButtonsDisabled(false);
      }
    }
  });
}

function startFetchWebsites() {
  if (allSchools.length === 0) {
    showConfirmModal({
      title: 'ไม่พบข้อมูลโรงเรียนในระบบ',
      subtitle: 'กรุณาดึงข้อมูลเริ่มต้นก่อน',
      message: 'ยังไม่มีข้อมูลโรงเรียนในระบบ กรุณากดปุ่ม <b>"ดึงข้อมูล OPEC (ปุ่ม 1)"</b> เพื่อโหลดรายชื่อโรงเรียนนานาชาติก่อนเริ่มค้นหา Official Website',
      iconClass: 'fa-solid fa-circle-exclamation',
      type: 'warning',
      cancelText: '',
      confirmText: '<i class="fa-solid fa-check"></i> ทราบแล้ว',
      confirmBtnClass: 'btn-solid-primary',
      onConfirm: () => {}
    });
    return;
  }

  showConfirmModal({
    title: 'ยืนยันการค้นหา Official Website ทางการ',
    subtitle: 'Real-Time Algorithmic Domain Resolution & DNS Verification',
    message: 'ระบบจะเริ่มค้นหาและตรวจเช็ค Official Website URL ของโรงเรียนนานาชาติทั้งหมด <b>' + allSchools.length + ' แห่ง</b> พร้อมตรวจสอบสถานะเว็บไซต์ (HTTP 200, DNS Resolution และกรองเว็บ Parked/โดเมนขาย)',
    extraHtml: '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> ระบบจะรักษาความถูกต้องและตรวจสอบเว็บที่มีอยู่จริงเท่านั้น',
    iconClass: 'fa-solid fa-globe',
    type: 'success',
    confirmText: '<i class="fa-solid fa-globe"></i> เริ่มค้นหา Official Website (ปุ่ม 4)',
    confirmBtnClass: 'btn-solid-secondary',
    onConfirm: async () => {
      setButtonsDisabled(true);
      document.getElementById('progressBanner').style.display = 'block';
      document.getElementById('progressTask').innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังค้นหา Official Website...`;
      document.getElementById('progressBarFill').style.width = '2%';
      document.getElementById('progressPercent').textContent = '2%';

      try {
        const res = await fetch('/api/fetch-official-websites', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'already_running') {
          showToast('⚠️ ระบบกำลังทำงานอยู่แล้ว กรุณารอสักครู่');
        }
        pollProgress();
      } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err);
        setButtonsDisabled(false);
      }
    }
  });
}

function startEnrichEn() {
  if (!allSchools || allSchools.length === 0) {
    showConfirmModal({
      title: 'ไม่พบข้อมูลโรงเรียนในระบบ',
      subtitle: 'กรุณาดึงข้อมูลเริ่มต้นก่อน',
      message: 'ยังไม่มีข้อมูลโรงเรียนในระบบ กรุณากดปุ่ม <b>"ดึงข้อมูล OPEC (ปุ่ม 1)"</b> เพื่อโหลดรายชื่อโรงเรียนนานาชาติก่อนเริ่มเติมชื่อภาษาอังกฤษ',
      iconClass: 'fa-solid fa-circle-exclamation',
      type: 'warning',
      cancelText: '',
      confirmText: '<i class="fa-solid fa-check"></i> ทราบแล้ว',
      confirmBtnClass: 'btn-solid-primary',
      onConfirm: () => {}
    });
    return;
  }

  showConfirmModal({
    title: 'ยืนยันการเติมชื่อภาษาอังกฤษ (School Name EN)',
    subtitle: 'ดึงชื่อภาษาอังกฤษทางการจาก OPEC Profile, Website Metadata & Linguistic Standard Formula',
    message: 'ระบบจะสแกนหาโรงเรียนที่ยังไม่มี<b>ชื่อภาษาอังกฤษ</b> หรือชื่อที่ตกหล่น เพื่อสกัดและแปลงชื่อให้ถูกต้องตามมาตรฐานโรงเรียนนานาชาติ 100%',
    extraHtml: '<i class="fa-solid fa-language" style="color: #f59e0b;"></i> ใช้ Standalone Dynamic Multi-Tier Engine โดยไม่ต้องพึ่งพาไฟล์ Reference',
    iconClass: 'fa-solid fa-language',
    type: 'info',
    confirmText: '<i class="fa-solid fa-language"></i> เริ่มเติมชื่อ EN (ปุ่ม 2)',
    confirmBtnClass: 'btn-solid-amber',
    onConfirm: async () => {
      setButtonsDisabled(true);
      document.getElementById('progressBanner').style.display = 'block';
      document.getElementById('progressTask').innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังเติมชื่อภาษาอังกฤษทางการ...`;
      document.getElementById('progressBarFill').style.width = '2%';
      document.getElementById('progressPercent').textContent = '2%';

      try {
        const res = await fetch('/api/enrich-names-en', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'already_running') {
          showToast('⚠️ ระบบกำลังทำงานอยู่แล้ว กรุณารอสักครู่');
        }
        pollProgress();
      } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err);
        setButtonsDisabled(false);
      }
    }
  });
}

function startEnrichGps() {
  if (!allSchools || allSchools.length === 0) {
    showConfirmModal({
      title: 'ไม่พบข้อมูลโรงเรียนในระบบ',
      subtitle: 'กรุณาดึงข้อมูลเริ่มต้นก่อน',
      message: 'ยังไม่มีข้อมูลโรงเรียนในระบบ กรุณากดปุ่ม <b>"ดึงข้อมูล OPEC (ปุ่ม 1)"</b> เพื่อโหลดรายชื่อโรงเรียนนานาชาติก่อนเริ่มค้นหาพิกัด GPS',
      iconClass: 'fa-solid fa-circle-exclamation',
      type: 'warning',
      cancelText: '',
      confirmText: '<i class="fa-solid fa-check"></i> ทราบแล้ว',
      confirmBtnClass: 'btn-solid-primary',
      onConfirm: () => {}
    });
    return;
  }

  showConfirmModal({
    title: 'ยืนยันการค้นหาพิกัด GPS ความแม่นยำสูง',
    subtitle: 'ค้นหาพิกัดระดับอาคาร/ถนน (Exact) ผ่าน Esri ArcGIS World Geocoding Engine',
    message: 'ระบบจะสแกนหาโรงเรียนที่ยังไม่มี<b>พิกัด GPS</b> หรือพิกัดที่เป็นจุดศูนย์กลางอำเภอ เพื่อค้นหาหมุดระดับถนน/อาคารจริง พร้อมระบบ Province Bounding Box Guard',
    extraHtml: '<i class="fa-solid fa-location-dot" style="color: #10b981;"></i> กำกับความแม่นยำอย่างซื่อตรง (Exact อาคาร/ถนน vs Approximate พิกัดประมาณการ)',
    iconClass: 'fa-solid fa-location-dot',
    type: 'info',
    confirmText: '<i class="fa-solid fa-location-dot"></i> เริ่มค้นหาพิกัด GPS (ปุ่ม 3)',
    confirmBtnClass: 'btn-solid-emerald',
    onConfirm: async () => {
      setButtonsDisabled(true);
      document.getElementById('progressBanner').style.display = 'block';
      document.getElementById('progressTask').innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังค้นหาพิกัด GPS ความแม่นยำสูง...`;
      document.getElementById('progressBarFill').style.width = '2%';
      document.getElementById('progressPercent').textContent = '2%';

      try {
        const res = await fetch('/api/enrich-gps', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'already_running') {
          showToast('⚠️ ระบบกำลังทำงานอยู่แล้ว กรุณารอสักครู่');
        }
        pollProgress();
      } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err);
        setButtonsDisabled(false);
      }
    }
  });
}

function startEnrichData() {
  if (!allSchools || allSchools.length === 0) {
    showConfirmModal({
      title: 'ไม่พบข้อมูลโรงเรียนในระบบ',
      subtitle: 'กรุณาดึงข้อมูลเริ่มต้นก่อน',
      message: 'ยังไม่มีข้อมูลโรงเรียนในระบบ กรุณากดปุ่ม <b>"ดึงข้อมูล OPEC (ปุ่ม 1)"</b> เพื่อโหลดรายชื่อโรงเรียนนานาชาติก่อนเริ่มเติมเต็มข้อมูล',
      iconClass: 'fa-solid fa-circle-exclamation',
      type: 'warning',
      cancelText: '',
      confirmText: '<i class="fa-solid fa-check"></i> ทราบแล้ว',
      confirmBtnClass: 'btn-solid-primary',
      onConfirm: () => {}
    });
    return;
  }

  showConfirmModal({
    title: 'ยืนยันการเติมเต็มข้อมูล EN & GPS (Auto-Enrich)',
    subtitle: 'ดึงชื่อภาษาอังกฤษจาก Website Metadata & พิกัด GPS จาก OpenStreetMap Geocoding',
    message: 'ระบบจะสแกนหาโรงเรียนที่ยังไม่มี<b>ชื่อภาษาอังกฤษ</b> หรือ<b>พิกัด GPS</b> เพื่อดึงข้อมูลมาเติมเต็มให้อัตโนมัติจากเว็บไซต์ทางการและฐานข้อมูลแผนที่ OpenStreetMap (OSM) แบบ Real-Time',
    extraHtml: '<i class="fa-solid fa-wand-magic-sparkles" style="color: #f59e0b;"></i> ช่วยให้ข้อมูลโรงเรียนครบถ้วนสมบูรณ์ 100% โดยไม่ต้องกรอกเอง',
    iconClass: 'fa-solid fa-wand-magic-sparkles',
    type: 'info',
    confirmText: '<i class="fa-solid fa-wand-magic-sparkles"></i> เริ่มเติมเต็มข้อมูล',
    confirmBtnClass: 'btn-solid-amber',
    onConfirm: async () => {
      setButtonsDisabled(true);
      document.getElementById('progressBanner').style.display = 'block';
      document.getElementById('progressTask').innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังเติมเต็มข้อมูลภาษาอังกฤษและพิกัด GPS...`;
      document.getElementById('progressBarFill').style.width = '2%';
      document.getElementById('progressPercent').textContent = '2%';

      try {
        const res = await fetch('/api/enrich-data', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'already_running') {
          showToast('⚠️ ระบบกำลังทำงานอยู่แล้ว กรุณารอสักครู่');
        }
        pollProgress();
      } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err);
        setButtonsDisabled(false);
      }
    }
  });
}

function clearAllData() {
  showConfirmModal({
    title: 'ยืนยันการลบข้อมูลทั้งหมด',
    subtitle: '⚠️ การกระทำนี้ไม่สามารถย้อนกลับได้',
    message: 'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลโรงเรียนนานาชาติทั้งหมดออกจากระบบ? ไฟล์ <b>international_schools_thailand_opec (.json / .csv)</b> จะถูกล้างข้อมูล',
    extraHtml: '<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i> ประวัติและสถานะเว็บไซต์ที่เคยค้นหาไว้จะถูกรีเซ็ต',
    iconClass: 'fa-solid fa-trash-can',
    type: 'danger',
    confirmText: '<i class="fa-solid fa-trash-can"></i> ยืนยันการลบข้อมูล',
    confirmBtnClass: 'btn-solid-danger',
    onConfirm: async () => {
      try {
        await fetch('/api/clear-data', { method: 'POST' });
        allSchools = [];
        activeCardFilter = 'all';
        document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
        const cardAll = document.getElementById('cardFilter_all');
        if (cardAll) cardAll.classList.add('active-filter');
        const banner = document.getElementById('activeStatFilterBanner');
        if (banner) banner.style.display = 'none';

        renderStats();
        populateProvinces();
        filterTable();
        showToast('ลบข้อมูลทั้งหมดเรียบร้อย');
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการลบข้อมูล: ' + err);
      }
    }
  });
}

function pollProgress() {
  if (pollTimeoutId) clearTimeout(pollTimeoutId);
  isPolling = true;

  async function tick() {
    if (!isPolling) return;

    try {
      const state = await loadProgressOnly();
      if (state) {
        updateProgressUI(state);

        if (state.is_running) {
          await loadData(false);
        }

        if (!state.is_running) {
          isPolling = false;
          setButtonsDisabled(false);

          await loadData(true);

          setTimeout(async () => {
            setButtonsDisabled(false);
            await loadData(false);
          }, 400);

          setTimeout(async () => {
            setButtonsDisabled(false);
            await loadData(false);
          }, 1200);

          return;
        }
      }
    } catch (err) {
      console.error('[pollProgress] tick error:', err);
    }

    if (isPolling) {
      pollTimeoutId = setTimeout(tick, 700);
    }
  }

  pollTimeoutId = setTimeout(tick, 700);
}

// Event Listeners setup
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', filterTable);

  const statusSelect = document.getElementById('statusSelect');
  if (statusSelect) statusSelect.addEventListener('change', filterTable);

  const provInput = document.getElementById('provinceInput');
  if (provInput) {
    provInput.addEventListener('focus', () => {
      openProvinceDropdown();
    });

    provInput.addEventListener('input', (e) => {
      openProvinceDropdown();
      renderProvinceDropdown(e.target.value);
    });

    provInput.addEventListener('keydown', (e) => {
      const dropdown = document.getElementById('provinceDropdown');
      if (!dropdown) return;
      const options = dropdown.querySelectorAll('.combobox-option');
      if (options.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % options.length;
        options.forEach((opt, i) => opt.classList.toggle('highlighted', i === highlightedIndex));
        options[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = (highlightedIndex - 1 + options.length) % options.length;
        options.forEach((opt, i) => opt.classList.toggle('highlighted', i === highlightedIndex));
        options[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && options[highlightedIndex]) {
          const val = options[highlightedIndex].getAttribute('data-value');
          selectProvince(val);
        } else if (options.length > 0) {
          const val = options[0].getAttribute('data-value');
          selectProvince(val);
        }
      } else if (e.key === 'Escape') {
        closeProvinceDropdown();
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const combobox = document.getElementById('provinceCombobox');
    if (combobox && !combobox.contains(e.target)) {
      closeProvinceDropdown();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailModal();
      closeEditModal();
      closeConfirmDialog();
      if (typeof closeDrillDownModal === 'function') closeDrillDownModal();
    }
  });

  document.getElementById('detailModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'detailModalOverlay') closeDetailModal();
  });

  document.getElementById('editModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'editModalOverlay') closeEditModal();
  });

  document.getElementById('confirmDialogOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'confirmDialogOverlay') closeConfirmDialog();
  });

  document.getElementById('drillDownModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'drillDownModalOverlay' && typeof closeDrillDownModal === 'function') closeDrillDownModal();
  });
});

// Self-init on load
(async () => {
  const state = await loadProgressOnly();
  if (state && state.is_running) {
    updateProgressUI(state);
    setButtonsDisabled(true);
    pollProgress();
  } else {
    setButtonsDisabled(false);
  }
  await loadData();
})();
