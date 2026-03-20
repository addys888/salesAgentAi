// ════════════════════════════════════════════════════════
//  DIALER.JS — File processing, Dialer engine, Sessions, AI, Email
//  Features: DND Guard, Call Timer, Duplicate Detection, Search,
//            Call Notes, Export, Callback Scheduler
// ════════════════════════════════════════════════════════

// ── F7: Call Duration Timer state ──
var _callTimerInterval = null;
var _callStartTime = null;

// ── F6: DND Time Guard ──
function isDNDHours() {
  var now = new Date();
  var h = now.getHours();
  return h < 9 || h >= 21;
}

function showDNDBanner() {
  var existing = document.getElementById('dndBannerLive');
  if(existing) return;
  var banner = document.createElement('div');
  banner.className = 'dnd-banner';
  banner.id = 'dndBannerLive';
  var icon = document.createElement('span');
  icon.className = 'dnd-icon';
  icon.textContent = '⏰';
  var text = document.createElement('div');
  text.className = 'dnd-text';
  text.textContent = 'TRAI DND hours active (9PM - 9AM). Calling is not recommended during this time to comply with regulations.';
  var dismiss = document.createElement('button');
  dismiss.className = 'dnd-dismiss';
  dismiss.textContent = '\u00D7';
  dismiss.onclick = function(){ banner.remove(); };
  banner.appendChild(icon);
  banner.appendChild(text);
  banner.appendChild(dismiss);
  var container = document.querySelector('.container');
  if(container) container.insertBefore(banner, container.firstChild.nextSibling);
}

function removeDNDBanner() {
  var b = document.getElementById('dndBannerLive');
  if(b) b.remove();
}

// ── F7: Timer functions ──
function startCallTimer() {
  _callStartTime = Date.now();
  var el = document.getElementById('callDuration');
  if(el) { el.textContent = '00:00'; el.parentElement.classList.add('active'); }
  clearInterval(_callTimerInterval);
  _callTimerInterval = setInterval(function(){
    if(!_callStartTime) return;
    var secs = Math.floor((Date.now() - _callStartTime) / 1000);
    var m = String(Math.floor(secs/60)).padStart(2,'0');
    var s = String(secs%60).padStart(2,'0');
    var el2 = document.getElementById('callDuration');
    if(el2) el2.textContent = m+':'+s;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(_callTimerInterval);
  var duration = _callStartTime ? Math.floor((Date.now() - _callStartTime)/1000) : 0;
  _callStartTime = null;
  var el = document.getElementById('callDuration');
  if(el) el.parentElement.classList.remove('active');
  return duration;
}

// ── F9: Duplicate Detection ──
function deduplicateContacts(contactList) {
  var seen = {};
  var unique = [];
  var dupCount = 0;
  contactList.forEach(function(c){
    if(!seen[c.number]) {
      seen[c.number] = true;
      unique.push(c);
    } else {
      dupCount++;
    }
  });
  if(dupCount > 0) {
    appAlert('Found ' + dupCount + ' duplicate number' + (dupCount>1?'s':'') + ' - removed automatically. ' + unique.length + ' unique contacts remain.', '🔍');
  }
  return unique;
}

// ── F4: Search & Filter ──
var _searchDebounce = null;
window.filterQueue = function() {
  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(function(){
    var query = (document.getElementById('queueSearch').value || '').toLowerCase().trim();
    var filter = document.getElementById('queueFilter').value;
    var visibleCount = 0;
    contacts.forEach(function(c, i){
      var row = document.getElementById('row-'+i);
      if(!row) return;
      var matchText = !query || (c.name && c.name.toLowerCase().indexOf(query) >= 0) || c.number.indexOf(query) >= 0;
      var matchStatus = filter === 'all' || c.status === filter || (filter === 'pending' && c.status === 'current');
      row.style.display = (matchText && matchStatus) ? '' : 'none';
      if(matchText && matchStatus) visibleCount++;
    });
    var countEl = document.getElementById('searchCount');
    if(countEl) countEl.textContent = visibleCount + '/' + contacts.length;
  }, 200);
};

// ════════════════════════════════════════════════════════
//  FILE UPLOAD & PARSING
// ════════════════════════════════════════════════════════
function handleFile(file) {
  if(!file) return;
  var ext = file.name.split('.').pop().toLowerCase();
  if(ext === 'csv'){
    var r = new FileReader(); r.onload = function(e){ parseCSV(e.target.result); }; r.readAsText(file);
  } else if(['xlsx','xls'].indexOf(ext) >= 0){
    var r2 = new FileReader();
    r2.onload = function(e){
      var wb = XLSX.read(e.target.result, {type:'binary'});
      parseRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1}));
    };
    r2.readAsBinaryString(file);
  } else { appAlert('Please upload .xlsx, .xls, or .csv', '📁'); }
}

// ── RFC 4180 compliant CSV parser ──
// Handles: quoted fields, commas inside quotes, escaped quotes (""), newlines in quotes
function parseCSV(text) {
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;
  var i = 0;
  var len = text.length;

  while(i < len) {
    var ch = text[i];

    if(inQuotes) {
      if(ch === '"') {
        // Check for escaped quote ("")
        if(i + 1 < len && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if(ch === '"') {
        inQuotes = true;
        i++;
      } else if(ch === ',') {
        row.push(field.trim());
        field = '';
        i++;
      } else if(ch === '\r') {
        // Handle \r\n or standalone \r
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
        if(i + 1 < len && text[i + 1] === '\n') i++;
        i++;
      } else if(ch === '\n') {
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  // Push last field/row
  if(field || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  // Filter out empty rows
  rows = rows.filter(function(r) { return r.some(function(c) { return c !== ''; }); });
  parseRows(rows);
}

function parseRows(rows) {
  if(rows.length < 2){ appAlert('File appears empty.', '📄'); return; }
  var headers = rows[0].map(String);
  window._rawRows = rows.slice(1);

  function mk(sel, none){
    // Clear with safe DOM
    while(sel.firstChild) sel.removeChild(sel.firstChild);
    if(none) {
      var noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— None —';
      sel.appendChild(noneOpt);
    }
    headers.forEach(function(h,i){
      var o = document.createElement('option');
      o.value = i;
      o.textContent = h || 'Col '+(i+1);
      sel.appendChild(o);
    });
  }
  mk(document.getElementById('colPhone'), false);
  mk(document.getElementById('colName'), true);
  mk(document.getElementById('colNote'), true);
  var pi = headers.findIndex(function(h){ return /mobile|phone|number|contact|no\.?|ph\b/i.test(h); });
  if(pi >= 0) document.getElementById('colPhone').value = pi;
  var ni = headers.findIndex(function(h){ return /name/i.test(h); });
  if(ni >= 0) document.getElementById('colName').value = ni;
  document.getElementById('uploadZone').style.display = 'none';
  document.getElementById('configBar').style.display = 'block';
}

function cleanNumber(raw) {
  var n = String(raw).replace(/\D/g,'');
  if(n.startsWith('91') && n.length===12) n = n.slice(2);
  if(n.startsWith('0') && n.length===11) n = n.slice(1);
  if(n.length===10 && /^[6-9]/.test(n)) return n;
  return null;
}

// ════════════════════════════════════════════════════════
//  DIALER ENGINE
// ════════════════════════════════════════════════════════
window.startQueue = function() {
  var pc = parseInt(document.getElementById('colPhone').value);
  var ncVal = document.getElementById('colName').value;
  var ocVal = document.getElementById('colNote').value;
  var nc = ncVal !== '' ? parseInt(ncVal) : null;
  var oc = ocVal !== '' ? parseInt(ocVal) : null;
  contacts = [];
  window._rawRows.forEach(function(row){
    var num = cleanNumber(row[pc]);
    if(num) contacts.push({ number:num, name: nc!=null?(row[nc]||''):'', note: oc!=null?(row[oc]||''):'', status:'pending', outcome:'', callNote:'', duration:0 });
  });
  if(!contacts.length){ appAlert('No valid Indian mobile numbers found.', '📵'); return; }
  // F9: Deduplicate
  contacts = deduplicateContacts(contacts);
  // F6: DND check
  if(isDNDHours()) showDNDBanner(); else removeDNDBanner();
  document.getElementById('configBar').style.display = 'none';
  document.getElementById('statsBar').style.display = 'grid';
  document.getElementById('dialerPanel').style.display = 'block';
  currentIndex=0; calledCount=0; skippedCount=0;
  buildTable(); updateStats(); showContact(0);
};

function buildTable() {
  var body = document.getElementById('queueBody');
  body.textContent = ''; // Safe clear

  contacts.forEach(function(c,i){
    var tr = document.createElement('tr');
    tr.id = 'row-'+i;

    // Index
    var tdIdx = document.createElement('td');
    tdIdx.style.color = 'var(--muted)';
    tdIdx.textContent = (i+1);
    tr.appendChild(tdIdx);

    // Number
    var tdNum = document.createElement('td');
    tdNum.className = 'mono';
    tdNum.textContent = '+91 '+c.number;
    tr.appendChild(tdNum);

    // Name
    var tdName = document.createElement('td');
    if(c.name) {
      tdName.textContent = c.name;
    } else {
      var dash = document.createElement('span');
      dash.style.color = 'var(--muted)';
      dash.textContent = '—';
      tdName.appendChild(dash);
    }
    tr.appendChild(tdName);

    // Outcome cell
    var tdOc = document.createElement('td');
    tdOc.id = 'oc-cell-'+i;
    tdOc.style.cssText = 'color:var(--muted);font-size:11px';
    tdOc.textContent = '—';
    tr.appendChild(tdOc);

    // Status
    var tdStatus = document.createElement('td');
    var statusSpan = document.createElement('span');
    statusSpan.className = 'row-status pending';
    statusSpan.id = 'status-'+i;
    statusSpan.textContent = '● Pending';
    tdStatus.appendChild(statusSpan);
    tr.appendChild(tdStatus);

    // Jump button
    var tdJump = document.createElement('td');
    tdJump.id = 'jump-cell-'+i;
    var jumpBtn = document.createElement('button');
    jumpBtn.className = 'jump-btn';
    jumpBtn.title = 'Jump to this contact';
    jumpBtn.textContent = '↗';
    jumpBtn.dataset.idx = i;
    jumpBtn.addEventListener('click', function(e) {
      jumpToContact(parseInt(e.target.dataset.idx));
    });
    tdJump.appendChild(jumpBtn);
    tr.appendChild(tdJump);

    body.appendChild(tr);
  });
}

// Jump to any contact
window.jumpToContact = async function(i) {
  if(i === currentIndex) return;
  if(contacts[i].status === 'done') {
    var proceed = await appConfirm('This contact is already called. Jump to re-call?', '↗');
    if(!proceed) return;
    contacts[i].status = 'pending'; contacts[i].outcome = '';
    updateRowStatus(i, 'pending');
    calledCount = Math.max(0, calledCount - 1);
  }

  if(currentIndex < contacts.length && contacts[currentIndex].status === 'current') {
    contacts[currentIndex].status = 'pending';
    updateRowStatus(currentIndex, 'pending');
  }

  var gapCount = 0;
  var minGap = currentIndex < i ? currentIndex : 0;
  for(var k = minGap; k < i; k++) {
    if(contacts[k].status === 'pending') gapCount++;
  }

  currentIndex = i;
  updateStats();
  showContact(i);

  if(gapCount > 0) {
    showToast('↗ Jumped to #'+(i+1)+' · '+gapCount+' pending row'+(gapCount>1?'s':'')+' will auto-fill after');
  }
  markDirty(); autoSaveSession();
};

function updateRowStatus(i, s) {
  var row = document.getElementById('row-'+i);
  var badge = document.getElementById('status-'+i);
  if(!row||!badge) return;
  row.className = s;
  var L = {current:'◉ Current', done:'✓ Called', skipped:'↷ Skipped', pending:'● Pending'};
  badge.className = 'row-status '+s;
  badge.textContent = L[s]||s;
  var jbtn = document.getElementById('jump-cell-'+i);
  if(jbtn) jbtn.style.display = (s === 'current') ? 'none' : '';
  if(s==='current') setTimeout(function(){ row.scrollIntoView({behavior:'smooth',block:'nearest'}); }, 100);
}

function showContact(i) {
  hasCalledCurrent = false; currentOutcome = '';
  document.getElementById('btnNext').disabled = true;
  ['interested','callback','noanswer','notinterested'].forEach(function(o){ document.getElementById('oc-'+o).className='outcome-btn'; });
  // F7: Reset timer display
  stopCallTimer();
  // F2: Clear note input
  var noteInp = document.getElementById('callNoteInput');
  if(noteInp) noteInp.value = '';
  // F8: Hide callback scheduler
  var cbSched = document.getElementById('callbackSchedRow');
  if(cbSched) cbSched.style.display = 'none';
  if(i >= contacts.length) { allDone(); return; }
  var anyPending = contacts.some(function(c){ return c.status === 'pending'; });
  if(!anyPending){ allDone(); return; }
  var c = contacts[i]; c.status = 'current'; updateRowStatus(i,'current');
  document.getElementById('currentNumber').textContent = '+91 '+c.number;
  document.getElementById('currentName').textContent = c.name||'Unknown Contact';
  document.getElementById('currentNote').textContent = c.note||'';
  document.getElementById('btnCall').href = 'https://wa.me/91'+c.number;
  document.getElementById('btnPhone').href = 'tel:+91'+c.number;
  var emojis = ['\u{1F464}','\u{1F9D1}','\u{1F469}','\u{1F468}','\u{1F64B}','\u{1F91D}','\u{1F4BC}','\u{1F9D1}\u200D\u{1F4BC}'];
  document.getElementById('avEl').textContent = emojis[i%8];
  // F2: Load saved note if exists
  if(noteInp && c.callNote) noteInp.value = c.callNote;
  // F6: DND check each contact
  if(isDNDHours()) showDNDBanner(); else removeDNDBanner();
  setStatus('active','\u25CF Ready'); updateProgress(); updateStats();
}

window.markCalled = function() {
  if(hasCalledCurrent) return;
  // F6: DND warning (non-blocking)
  if(isDNDHours()) {
    showDNDBanner();
  }
  hasCalledCurrent = true;
  setStatus('calling','\uD83D\uDCF2 Calling...');
  document.getElementById('avEl').classList.add('calling');
  document.getElementById('btnNext').disabled = false;
  setTimeout(function(){ document.getElementById('avEl').classList.remove('calling'); }, 4000);
  // F7: Start call timer
  startCallTimer();
  markDirty();
};

window.setOutcome = function(o) {
  currentOutcome = o;
  ['interested','callback','noanswer','notinterested'].forEach(function(x){
    document.getElementById('oc-'+x).className = 'outcome-btn'+(x===o?' sel-'+x:'');
  });
};

window.nextContact = function() {
  if(!hasCalledCurrent) return;
  // F7: Stop timer and record duration
  var dur = stopCallTimer();
  contacts[currentIndex].duration = dur;
  // F2: Save call note
  var noteInp = document.getElementById('callNoteInput');
  if(noteInp) contacts[currentIndex].callNote = noteInp.value.trim();
  contacts[currentIndex].status = 'done'; contacts[currentIndex].outcome = currentOutcome;
  updateRowStatus(currentIndex,'done');
  var cell = document.getElementById('oc-cell-'+currentIndex);
  if(cell){ var L={interested:'\uD83D\uDFE2 Interested',callback:'\uD83D\uDD14 Callback',noanswer:'\uD83D\uDCF5 No Answer',notinterested:'\uD83D\uDD34 Not Interested','':'\u2014'}; cell.textContent=L[currentOutcome]||'\u2014'; }
  calledCount++;
  // F8: If callback, schedule it
  if(currentOutcome === 'callback') {
    scheduleCallbackPrompt(contacts[currentIndex]);
  }
  currentIndex = findNextPending();
  updateStats(); showContact(currentIndex);
  markDirty(); autoSaveSession();
  // Save daily stats on every 5th call
  if(calledCount % 5 === 0) saveDailyStats();
};

window.skipContact = function() {
  stopCallTimer(); // F7: Stop timer on skip
  contacts[currentIndex].status='skipped'; contacts[currentIndex].outcome='skipped';
  updateRowStatus(currentIndex,'skipped'); skippedCount++;
  currentIndex = findNextPending();
  updateStats(); showContact(currentIndex);
  markDirty(); autoSaveSession();
};

function findNextPending() {
  for(var i = currentIndex + 1; i < contacts.length; i++) {
    if(contacts[i].status === 'pending') return i;
  }
  for(var j = 0; j < currentIndex; j++) {
    if(contacts[j].status === 'pending') {
      showToast('↩ Returning to skipped row #'+(j+1));
      return j;
    }
  }
  return contacts.length;
}

function updateStats() {
  var pending = contacts.filter(function(c){ return c.status==='pending'||c.status==='current'; }).length;
  document.getElementById('statTotal').textContent=contacts.length;
  document.getElementById('statDone').textContent=calledCount;
  document.getElementById('statSkipped').textContent=skippedCount;
  document.getElementById('statLeft').textContent=pending;
}

function updateProgress() {
  var done = contacts.filter(function(c){ return c.status==='done'||c.status==='skipped'; }).length;
  var p = contacts.length ? Math.round(done/contacts.length*100) : 0;
  document.getElementById('progressFill').style.width = p+'%';
  document.getElementById('progressText').textContent = done+' / '+contacts.length;
}

function setStatus(type, text) {
  var pill = document.getElementById('statusPill');
  pill.className = 'status-pill '+type;
  pill.querySelector('.dot').className = type==='calling' ? 'dot blink' : 'dot';
  document.getElementById('statusText').textContent = text;
}

function allDone() {
  stopCallTimer(); // F7
  removeDNDBanner(); // F6
  document.getElementById('dialerPanel').style.display='none';
  document.getElementById('doneBanner').style.display='block';
  var oc = contacts.reduce(function(a,c){ a[c.outcome]=(a[c.outcome]||0)+1; return a; },{});
  // F7: Calculate avg duration
  var calledList = contacts.filter(function(c){ return c.status==='done' && c.duration > 0; });
  var avgDur = calledList.length ? Math.round(calledList.reduce(function(s,c){ return s+c.duration; },0)/calledList.length) : 0;
  var avgStr = avgDur > 0 ? ' \u00B7 Avg call: '+Math.floor(avgDur/60)+'m '+avgDur%60+'s' : '';
  document.getElementById('doneSummary').textContent =
    'Called: '+calledCount+' \u00B7 Skipped: '+skippedCount+' \u00B7 Interested: '+(oc.interested||0)+' \u00B7 Callbacks: '+(oc.callback||0)+avgStr;
  setStatus('idle','\u2713 Complete'); updateProgress();
  completeSession();
  saveDailyStats(); // F1: Save stats for analytics
}

window.resetDialer = function() {
  contacts=[]; currentIndex=0; calledCount=0; skippedCount=0;
  _activeSessionId = null; _isDirty = false; jumpReturnIndex = -1;
  clearTimeout(_idleTimer);
  stopCallTimer(); // F7
  removeDNDBanner(); // F6
  ['dialerPanel','statsBar','doneBanner','configBar'].forEach(function(id){ document.getElementById(id).style.display='none'; });
  document.getElementById('uploadZone').style.display='block';
  var fi=document.getElementById('fileInput'); if(fi) fi.value='';
  setStatus('idle','Idle');
};

// ════════════════════════════════════════════════════════
//  SESSION AUTO-SAVE & RESUME
// ════════════════════════════════════════════════════════
var _activeSessionId = null;
var _isDirty = false;
var _isSaving = false;
var _idleTimer = null;
var _IDLE_LIMIT = 5 * 60 * 1000;

function markDirty() {
  _isDirty = true;
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(function(){
    _isDirty = false;
    console.log('Session idle — auto-save paused');
  }, _IDLE_LIMIT);
}

async function autoSaveSession() {
  if(!currentUser || !_sb || !contacts.length) return;
  if(!_isDirty) return;
  if(_isSaving) return;
  _isDirty = false;
  _isSaving = true;
  try {
    var payload = {
      user_id:       currentUser.id,
      session_date:  new Date().toISOString().split('T')[0],
      contacts:      contacts,
      current_index: currentIndex,
      called_count:  calledCount,
      skipped_count: skippedCount,
      status:        'active',
      updated_at:    new Date().toISOString()
    };
    if(_activeSessionId) {
      var r = await _sb.from('call_sessions').update(payload).eq('id', _activeSessionId);
      if(r.error) throw r.error;
    } else {
      var res = await _sb.from('call_sessions').insert(payload).select('id').single();
      if(res.error) throw res.error;
      if(res.data) _activeSessionId = res.data.id;
    }
    console.log('Session saved ✓ index:', currentIndex);
  } catch(e) {
    _isDirty = true;
    console.warn('Auto-save failed (will retry):', e.message);
  }
  _isSaving = false;
}

async function completeSession() {
  if(!_activeSessionId || !_sb) return;
  try {
    await _sb.from('call_sessions')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', _activeSessionId);
    _activeSessionId = null;
  } catch(e) { console.warn('Complete session save:', e.message); }
}

async function checkForActiveSession() {
  if(!currentUser || !_sb) return;
  try {
    var cutoff = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    _sb.from('call_sessions')
      .delete()
      .eq('user_id', currentUser.id)
      .in('status', ['completed','discarded'])
      .lt('updated_at', cutoff)
      .then(function(){}).catch(function(){});

    var res = await _sb.from('call_sessions')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1);
    if(res.error || !res.data || !res.data.length) return;
    var session = res.data[0];
    if(!session.contacts || !session.contacts.length) return;
    _activeSessionId = session.id;
    showResumeModal(session);
  } catch(e) { console.warn('Session check (non-fatal):', e.message); }
}

function showResumeModal(session) {
  var called  = session.called_count || 0;
  var skipped = session.skipped_count || 0;
  var total   = session.contacts ? session.contacts.length : 0;
  var remaining = total - (session.current_index || 0);
  var savedDate = session.updated_at ? new Date(session.updated_at) : new Date();
  var timeAgo = getTimeAgo(savedDate);

  // Build stats with safe DOM
  var statsContainer = document.getElementById('resumeStats');
  statsContainer.textContent = '';

  var statsData = [
    { val: total, label: 'Total Leads', color: 'var(--accent)' },
    { val: called, label: 'Already Called', color: 'var(--green)' },
    { val: skipped, label: 'Skipped', color: 'var(--warn)' },
    { val: remaining, label: 'Remaining', color: 'var(--accent)' }
  ];

  statsData.forEach(function(stat) {
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:12px;text-align:center';
    var valDiv = document.createElement('div');
    valDiv.style.cssText = 'font-family:Syne,sans-serif;font-size:22px;font-weight:800;color:' + stat.color;
    valDiv.textContent = stat.val;
    var lblDiv = document.createElement('div');
    lblDiv.style.cssText = 'font-size:10px;color:var(--muted);margin-top:2px';
    lblDiv.textContent = stat.label;
    card.appendChild(valDiv);
    card.appendChild(lblDiv);
    statsContainer.appendChild(card);
  });

  // Build details with safe DOM
  var detailsEl = document.getElementById('resumeDetails');
  detailsEl.textContent = '';

  var line1 = document.createTextNode('📅 Session saved ');
  var strong1 = document.createElement('strong');
  strong1.style.color = 'var(--text)';
  strong1.textContent = timeAgo;
  detailsEl.appendChild(line1);
  detailsEl.appendChild(strong1);
  detailsEl.appendChild(document.createElement('br'));

  var line2p1 = document.createTextNode('▶ Resuming will start you from lead ');
  var strong2 = document.createElement('strong');
  strong2.style.color = 'var(--accent)';
  strong2.textContent = '#'+(session.current_index+1);
  var line2p2 = document.createTextNode(' — all '+ called +' previously called leads are preserved with their outcomes.');
  detailsEl.appendChild(line2p1);
  detailsEl.appendChild(strong2);
  detailsEl.appendChild(line2p2);
  detailsEl.appendChild(document.createElement('br'));

  var discardNote = document.createElement('span');
  discardNote.style.color = 'var(--danger)';
  discardNote.textContent = '🗑 Start Fresh';
  detailsEl.appendChild(discardNote);
  detailsEl.appendChild(document.createTextNode(' will discard this session and let you upload a new file.'));

  document.getElementById('resumeModal').classList.add('open');
}

function getTimeAgo(date) {
  var mins = Math.round((Date.now() - date.getTime()) / 60000);
  if(mins < 2)   return 'just now';
  if(mins < 60)  return mins + ' minutes ago';
  var hrs = Math.round(mins / 60);
  if(hrs < 24)   return hrs + ' hour' + (hrs > 1 ? 's' : '') + ' ago';
  var days = Math.round(hrs / 24);
  return days + ' day' + (days > 1 ? 's' : '') + ' ago';
}

window.resumeSession = async function() {
  document.getElementById('resumeModal').classList.remove('open');
  if(!_sb || !_activeSessionId) return;
  try {
    var res = await _sb.from('call_sessions').select('*').eq('id', _activeSessionId).single();
    if(res.error || !res.data) return;
    var session = res.data;
    contacts      = session.contacts;
    currentIndex  = session.current_index || 0;
    calledCount   = session.called_count  || 0;
    skippedCount  = session.skipped_count || 0;

    document.getElementById('uploadZone').style.display  = 'none';
    document.getElementById('statsBar').style.display    = 'grid';
    document.getElementById('dialerPanel').style.display = 'block';
    buildTable();

    contacts.forEach(function(c, i) {
      if(c.status === 'done' || c.status === 'skipped') {
        updateRowStatus(i, c.status);
        var cell = document.getElementById('oc-cell-'+i);
        if(cell && c.outcome) {
          var L = {interested:'🟢 Interested', callback:'🔔 Callback', noanswer:'📵 No Answer', notinterested:'🔴 Not Interested', skipped:'↷ Skipped', '':'—'};
          cell.textContent = L[c.outcome] || '—';
        }
      }
    });

    updateStats(); showContact(currentIndex);
    setStatus('active', '▶ Resumed');
    showToast('✅ Session resumed — starting from lead #'+(currentIndex+1));
  } catch(e) {
    showToast('❌ Could not restore session: ' + e.message, true);
  }
};

window.discardSession = async function() {
  document.getElementById('resumeModal').classList.remove('open');
  if(_activeSessionId && _sb) {
    try {
      await _sb.from('call_sessions').update({ status: 'discarded' }).eq('id', _activeSessionId);
    } catch(e) {}
    _activeSessionId = null;
  }
};

// ════════════════════════════════════════════════════════
//  TEMPLATES — uses TEMPLATES from templates.js
// ════════════════════════════════════════════════════════

function getRepName() {
  var meta = (currentUser && currentUser.user_metadata) || {};
  return meta.full_name || (currentUser && currentUser.email && currentUser.email.split('@')[0]) || 'Sales Advisor';
}

window.openTemplates = function() {
  var c = contacts[currentIndex] || {};
  var repN = getRepName();
  var lang = getTplLang();
  var list = document.getElementById('tplList');
  list.textContent = '';
  // Set language selector value
  var langSel = document.getElementById('tplLang');
  if(langSel) langSel.value = lang;

  Object.entries(TEMPLATES).forEach(function(entry){
    var key=entry[0], tpl=entry[1];
    var textFn = tpl.text[lang] || tpl.text['en'];
    var msg = textFn(c.name, repN);
    var waUrl = 'https://wa.me/91'+(c.number||'')+'?text='+encodeURIComponent(msg);

    var div = document.createElement('div');
    div.className = 'tpl-item';

    var nameDiv = document.createElement('div');
    nameDiv.className = 'tpl-name';
    var langLabel = TEMPLATE_LANGS.find(function(l){ return l.code === lang; });
    nameDiv.textContent = tpl.name + (langLabel ? ' \u00B7 ' + langLabel.label : '');

    var previewDiv = document.createElement('div');
    previewDiv.className = 'tpl-preview';
    previewDiv.textContent = msg.substring(0,160) + (msg.length > 160 ? '...' : '');

    var sendDiv = document.createElement('div');
    sendDiv.className = 'tpl-send';
    sendDiv.textContent = '\uD83D\uDC46 Tap to open in WhatsApp';

    div.appendChild(nameDiv);
    div.appendChild(previewDiv);
    div.appendChild(sendDiv);
    div.addEventListener('click', function(){ window.open(waUrl,'_blank'); document.getElementById('tplModal').classList.remove('open'); });
    list.appendChild(div);
  });
  document.getElementById('tplModal').classList.add('open');
};

window.onTplLangChange = function(sel) {
  setTplLang(sel.value);
  window.openTemplates(); // Re-render with new language
};

// ════════════════════════════════════════════════════════
//  AI SUMMARY
// ════════════════════════════════════════════════════════
var AI_PROXY_URL = 'https://royal-pine-470f.aaddyyss90.workers.dev';

window.openAISummary = function(){ document.getElementById('aiModal').classList.add('open'); window.generateAISummary(); };
window.generateAISummary = async function() {
  document.getElementById('aiLoadingDiv').style.display='flex';
  document.getElementById('aiOutput').style.display='none';
  var called = contacts.filter(function(c){ return c.status==='done'; });
  var oc = {interested:0,callback:0,noanswer:0,notinterested:0};
  called.forEach(function(c){ if(oc[c.outcome]!==undefined) oc[c.outcome]++; });
  var repN = getRepName();
  var intList = called.filter(function(c){ return c.outcome==='interested'; }).map(function(c){ return c.name||'+91'+c.number; }).join(', ')||'None';
  var cbList  = called.filter(function(c){ return c.outcome==='callback'; }).map(function(c){ return c.name||'+91'+c.number; }).join(', ')||'None';
  var convRate = called.length > 0 ? Math.round((oc.interested/called.length)*100) : 0;
  var naRate   = called.length > 0 ? Math.round((oc.noanswer/called.length)*100) : 0;
  var prompt =
    'You are an expert sales coach for Indian outbound sales teams (DSA, real estate, insurance, banking).\n\n' +
    'Analyse today\'s calling session and write a sharp WhatsApp report a manager would genuinely find useful.\n\n' +
    'REP: '+repN+'\n' +
    'DATE: '+new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})+'\n\n' +
    'TODAY\'S NUMBERS:\n' +
    'Total Leads: '+contacts.length+' | Called: '+called.length+' | Skipped: '+skippedCount+'\n' +
    '🟢 Interested: '+oc.interested+' | 🔔 Callback: '+oc.callback+' | 📵 No Answer: '+oc.noanswer+' | 🔴 Not Interested: '+oc.notinterested+'\n' +
    'Conversion rate today: '+convRate+'% | No Answer rate: '+naRate+'%\n\n' +
    'HOT LEADS:\n'+intList+'\n\n' +
    'CALLBACKS:\n'+cbList+'\n\n' +
    'Write 200-230 words covering: PERFORMANCE VERDICT, COACHING OBSERVATION, PRIORITY FOLLOW-UPS, CALLBACKS TOMORROW, TACTICAL TIP.\n' +
    'TONE: Professional but warm. Hinglish phrases welcome. WhatsApp plain text.\n' +
    'Start with exactly: "📊 Daily Call Report – '+repN+'"';

  if(!AI_PROXY_URL || AI_PROXY_URL === 'YOUR_CLOUDFLARE_WORKER_URL') {
    showManualSummary(repN, called, oc, intList, cbList);
    return;
  }

  try {
    var res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    });
    if(!res.ok) throw new Error('Proxy error ' + res.status);
    var data = await res.json();
    if(data.error) throw new Error(data.error);
    document.getElementById('aiOutput').textContent = data.text || data.content || 'No response.';
  } catch(e) {
    console.warn('AI proxy error:', e.message);
    showManualSummary(repN, called, oc, intList, cbList);
  }
  document.getElementById('aiLoadingDiv').style.display='none';
  document.getElementById('aiOutput').style.display='block';
};

function showManualSummary(repN, called, oc, intList, cbList) {
  var d = new Date();
  var dateStr = d.toLocaleDateString('en-IN', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
  var rate = called.length > 0 ? Math.round((oc.interested / called.length) * 100) : 0;
  var summary =
    '📊 Daily Call Report – ' + repN + '\n' +
    '📅 ' + dateStr + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '📞 CALL STATS\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    'Total Leads : ' + contacts.length + '\n' +
    'Called      : ' + called.length + '\n' +
    'Skipped     : ' + skippedCount + '\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '📋 OUTCOMES\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '🟢 Interested    : ' + oc.interested + '\n' +
    '🔔 Callback      : ' + oc.callback + '\n' +
    '📵 No Answer     : ' + oc.noanswer + '\n' +
    '🔴 Not Interested: ' + oc.notinterested + '\n' +
    '📈 Success Rate  : ' + rate + '%\n\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '🔥 HOT LEADS\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    intList + '\n\n' +
    '🔔 CALLBACKS PENDING\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    cbList + '\n\n' +
    '— Sent from - CallSmart Pro';
  document.getElementById('aiOutput').textContent = summary;
  document.getElementById('aiLoadingDiv').style.display='none';
  document.getElementById('aiOutput').style.display='block';
}

window.copyAI = async function(){
  try {
    await navigator.clipboard.writeText(document.getElementById('aiOutput').textContent);
    showToast('✅ Copied to clipboard!');
  } catch(e) {
    await appAlert('Could not copy automatically. Please select & copy manually.', '📋');
  }
};
window.shareAI = function(){ window.open('https://wa.me/?text='+encodeURIComponent(document.getElementById('aiOutput').textContent),'_blank'); };

// ════════════════════════════════════════════════════════
//  EMAIL REPORT via EmailJS
// ════════════════════════════════════════════════════════
var EMAILJS_PUBLIC_KEY  = 'YOUR_EMAILJS_PUBLIC_KEY';
var EMAILJS_SERVICE_ID  = 'YOUR_EMAILJS_SERVICE_ID';
var EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';

var emailJSReady = false;
(function initEmailJS(){
  if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY') {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    emailJSReady = true;
    console.log('EmailJS ready');
  }
})();

window.openEmailModal = function() {
  var senderEl = document.getElementById('senderName');
  if(senderEl && currentUser) {
    var meta = currentUser.user_metadata || {};
    senderEl.value = meta.full_name || currentUser.email || '';
  }
  var saved = localStorage.getItem('managerEmail');
  if(saved) document.getElementById('managerEmail').value = saved;

  var reportText = document.getElementById('aiOutput').textContent || '';
  var previewEl = document.getElementById('emailPreviewText');
  if(reportText && reportText.length > 10) {
    previewEl.textContent = reportText.substring(0, 200) + (reportText.length > 200 ? '...' : '');
  } else {
    previewEl.textContent = 'No summary yet — generate one first.';
  }

  document.getElementById('emailFormWrap').style.display = 'block';
  document.getElementById('emailSuccessWrap').style.display = 'none';
  document.getElementById('emailModalFooter').style.display = 'flex';
  document.getElementById('emailStatusMsg').textContent = '';
  document.getElementById('emailModal').classList.add('open');
};

window.closeEmailModal = function() {
  document.getElementById('emailModal').classList.remove('open');
};

window.sendEmailReport = function() {
  var toEmail = document.getElementById('managerEmail').value.trim();
  var fromName = document.getElementById('senderName').value.trim() || 'Sales Rep';
  var reportText = document.getElementById('aiOutput').textContent || '';
  var statusEl = document.getElementById('emailStatusMsg');
  var btn = document.getElementById('sendEmailBtn');

  if(!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = '❌ Please enter a valid email address';
    return;
  }
  if(!reportText || reportText.length < 10) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = '❌ No report to send. Generate a summary first.';
    return;
  }

  localStorage.setItem('managerEmail', toEmail);

  if(EMAILJS_PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
    var subject = encodeURIComponent('Daily Call Report — ' + fromName + ' — ' + new Date().toLocaleDateString('en-IN'));
    var body = encodeURIComponent(reportText);
    window.open('mailto:' + toEmail + '?subject=' + subject + '&body=' + body);
    document.getElementById('emailFormWrap').style.display = 'none';
    document.getElementById('emailModalFooter').style.display = 'none';
    document.getElementById('emailSuccessWrap').style.display = 'block';
    // Safe DOM instead of innerHTML
    var sentToEl = document.getElementById('emailSentTo');
    sentToEl.textContent = '';
    sentToEl.appendChild(document.createTextNode('Your email app has opened. Just tap '));
    var strong = document.createElement('strong');
    strong.textContent = 'Send';
    sentToEl.appendChild(strong);
    sentToEl.appendChild(document.createTextNode(' to deliver the report to ' + toEmail));
    setTimeout(function(){ closeEmailModal(); }, 4000);
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Sending...';
  statusEl.textContent = '';

  var templateParams = {
    to_email:    toEmail,
    from_name:   fromName,
    report_date: new Date().toLocaleDateString('en-IN', {weekday:'long', year:'numeric', month:'long', day:'numeric'}),
    report_text: reportText,
    rep_email:   currentUser ? currentUser.email : ''
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
    .then(function() {
      document.getElementById('emailFormWrap').style.display = 'none';
      document.getElementById('emailModalFooter').style.display = 'none';
      document.getElementById('emailSuccessWrap').style.display = 'block';
      document.getElementById('emailSentTo').textContent = 'Sent to ' + toEmail;
      setTimeout(function(){ closeEmailModal(); }, 3000);
    })
    .catch(function(err) {
      console.error('EmailJS error:', err);
      statusEl.style.color = 'var(--danger)';
      statusEl.textContent = '❌ Failed to send. Check your EmailJS config.';
      btn.disabled = false;
      btn.textContent = '📧 Send Report';
    });
};

// ════════════════════════════════════════════════════════
//  F5: EXPORT REPORT (PDF / Excel)
// ════════════════════════════════════════════════════════
window.exportPDF = function() {
  if(typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    appAlert('PDF library not loaded. Please check your internet connection.', '📄');
    return;
  }
  var doc = new (window.jspdf || jspdf).jsPDF();
  var repN = getRepName();
  var d = new Date();
  var dateStr = d.toLocaleDateString('en-IN', {weekday:'long', year:'numeric', month:'long', day:'numeric'});

  // Title
  doc.setFontSize(18);
  doc.setTextColor(37, 211, 102);
  doc.text('Daily Call Report', 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(repN + ' | ' + dateStr, 14, 28);

  // Stats
  var oc = contacts.reduce(function(a,c){ a[c.outcome]=(a[c.outcome]||0)+1; return a; },{});
  var calledList = contacts.filter(function(c){ return c.status==='done'; });
  var avgDur = calledList.length ? Math.round(calledList.reduce(function(s,c){ return s+(c.duration||0); },0)/calledList.length) : 0;

  doc.setFontSize(12);
  doc.setTextColor(0);
  var y = 40;
  doc.text('Call Statistics', 14, y); y += 8;
  doc.setFontSize(10);
  doc.text('Total Leads: ' + contacts.length, 14, y); y += 6;
  doc.text('Called: ' + calledCount + '  |  Skipped: ' + skippedCount, 14, y); y += 6;
  doc.text('Interested: ' + (oc.interested||0) + '  |  Callback: ' + (oc.callback||0), 14, y); y += 6;
  doc.text('No Answer: ' + (oc.noanswer||0) + '  |  Not Interested: ' + (oc.notinterested||0), 14, y); y += 6;
  if(avgDur > 0) { doc.text('Avg Call Duration: ' + Math.floor(avgDur/60) + 'm ' + avgDur%60 + 's', 14, y); y += 6; }
  y += 6;

  // Contact table
  doc.setFontSize(12);
  doc.text('Contact Details', 14, y); y += 8;
  doc.setFontSize(8);
  doc.text('#', 14, y); doc.text('Number', 24, y); doc.text('Name', 65, y); doc.text('Outcome', 110, y); doc.text('Note', 150, y);
  y += 5;

  contacts.forEach(function(c, i) {
    if(y > 275) { doc.addPage(); y = 20; }
    doc.setTextColor(c.status === 'done' ? 0 : 150);
    doc.text(String(i+1), 14, y);
    doc.text('+91 ' + c.number, 24, y);
    doc.text((c.name || '-').substring(0, 20), 65, y);
    var ocLabel = {interested:'Interested',callback:'Callback',noanswer:'No Answer',notinterested:'Not Int.',skipped:'Skipped'};
    doc.text(ocLabel[c.outcome] || '-', 110, y);
    doc.text((c.callNote || '-').substring(0, 25), 150, y);
    y += 5;
  });

  doc.save('call-report-' + d.toISOString().split('T')[0] + '.pdf');
  showToast('📄 PDF exported!');
};

window.exportExcel = function() {
  if(typeof XLSX === 'undefined') {
    appAlert('Excel library not loaded.', '📊');
    return;
  }
  var data = [['#', 'Number', 'Name', 'Outcome', 'Call Note', 'Duration (sec)', 'Status']];
  contacts.forEach(function(c, i) {
    data.push([i+1, '+91 ' + c.number, c.name || '', c.outcome || '', c.callNote || '', c.duration || 0, c.status]);
  });

  var ws = XLSX.utils.aoa_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Call Report');

  // Summary sheet
  var oc = contacts.reduce(function(a,c){ a[c.outcome]=(a[c.outcome]||0)+1; return a; },{});
  var summaryData = [
    ['Call Report Summary'],
    ['Date', new Date().toLocaleDateString('en-IN')],
    ['Rep', getRepName()],
    [''],
    ['Total Leads', contacts.length],
    ['Called', calledCount],
    ['Skipped', skippedCount],
    ['Interested', oc.interested || 0],
    ['Callback', oc.callback || 0],
    ['No Answer', oc.noanswer || 0],
    ['Not Interested', oc.notinterested || 0]
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');

  XLSX.writeFile(wb, 'call-report-' + new Date().toISOString().split('T')[0] + '.xlsx');
  showToast('📊 Excel exported!');
};

// ════════════════════════════════════════════════════════
//  F8: CALLBACK SCHEDULER
// ════════════════════════════════════════════════════════
function scheduleCallbackPrompt(contact) {
  var schedRow = document.getElementById('callbackSchedRow');
  if(!schedRow) return;
  schedRow.style.display = 'flex';
  // Set default date to tomorrow
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var dateInput = document.getElementById('cbDate');
  var timeInput = document.getElementById('cbTime');
  if(dateInput) dateInput.value = tomorrow.toISOString().split('T')[0];
  if(timeInput) timeInput.value = '10:00';
  // Store contact for saving
  schedRow.dataset.number = contact.number;
  schedRow.dataset.name = contact.name || '';
}

window.saveCallback = async function() {
  var schedRow = document.getElementById('callbackSchedRow');
  if(!schedRow || !_sb || !currentUser) return;
  var cbDate = document.getElementById('cbDate').value;
  var cbTime = document.getElementById('cbTime').value;
  if(!cbDate) { showToast('Please select a date'); return; }

  try {
    await _sb.from('callbacks').insert({
      user_id: currentUser.id,
      contact_name: schedRow.dataset.name || '',
      contact_number: schedRow.dataset.number || '',
      callback_date: cbDate,
      callback_time: cbTime || null,
      note: document.getElementById('callNoteInput') ? document.getElementById('callNoteInput').value : '',
      status: 'pending'
    });
    showToast('🔔 Callback scheduled for ' + cbDate);
    schedRow.style.display = 'none';
  } catch(e) {
    console.warn('Callback save failed:', e.message);
    showToast('Could not save callback - will try again');
  }
};

window.checkTodayCallbacks = async function() {
  if(!_sb || !currentUser) return;
  try {
    var today = new Date().toISOString().split('T')[0];
    var res = await _sb.from('callbacks')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('status', 'pending')
      .lte('callback_date', today)
      .order('callback_time', { ascending: true });
    if(res.error || !res.data || !res.data.length) return;
    showCallbackBanner(res.data);
  } catch(e) { console.warn('Callback check:', e.message); }
};

function showCallbackBanner(callbacks) {
  var existing = document.getElementById('callbackBannerLive');
  if(existing) existing.remove();
  var banner = document.createElement('div');
  banner.className = 'callback-banner';
  banner.id = 'callbackBannerLive';

  var header = document.createElement('div');
  header.className = 'cb-header';
  var icon = document.createElement('span');
  icon.className = 'cb-icon';
  icon.textContent = '🔔';
  var title = document.createElement('span');
  title.className = 'cb-title';
  title.textContent = 'Callbacks Due Today';
  var count = document.createElement('span');
  count.className = 'cb-count';
  count.textContent = callbacks.length;
  header.appendChild(icon);
  header.appendChild(title);
  header.appendChild(count);
  banner.appendChild(header);

  var list = document.createElement('div');
  list.className = 'cb-list';
  callbacks.slice(0, 5).forEach(function(cb) {
    var item = document.createElement('div');
    item.className = 'cb-item';
    var name = document.createElement('span');
    name.className = 'cb-name';
    name.textContent = (cb.contact_name || '+91 ' + cb.contact_number);
    var time = document.createElement('span');
    time.className = 'cb-time';
    time.textContent = cb.callback_time ? cb.callback_time.substring(0,5) : 'Any time';
    var doneBtn = document.createElement('button');
    doneBtn.className = 'cb-done-btn';
    doneBtn.textContent = '✓ Done';
    doneBtn.onclick = function(e) {
      e.stopPropagation();
      markCallbackDone(cb.id, item);
    };
    item.appendChild(name);
    item.appendChild(time);
    item.appendChild(doneBtn);
    list.appendChild(item);
  });
  banner.appendChild(list);

  var container = document.querySelector('.container');
  var uploadZone = document.getElementById('uploadZone');
  if(container && uploadZone) container.insertBefore(banner, uploadZone);
}

async function markCallbackDone(cbId, itemEl) {
  if(!_sb) return;
  try {
    await _sb.from('callbacks').update({ status: 'done' }).eq('id', cbId);
    if(itemEl) { itemEl.style.opacity = '0.3'; itemEl.style.textDecoration = 'line-through'; }
    showToast('✓ Callback marked done');
  } catch(e) { console.warn('Callback update:', e.message); }
}

// ════════════════════════════════════════════════════════
//  F1: SAVE DAILY STATS (for admin analytics)
// ════════════════════════════════════════════════════════
async function saveDailyStats() {
  if(!_sb || !currentUser || !contacts.length) return;
  var oc = contacts.reduce(function(a,c){ a[c.outcome]=(a[c.outcome]||0)+1; return a; },{});
  var calledList = contacts.filter(function(c){ return c.status==='done' && c.duration > 0; });
  var avgDur = calledList.length ? Math.round(calledList.reduce(function(s,c){ return s+c.duration; },0)/calledList.length) : 0;

  try {
    await _sb.from('daily_stats').upsert({
      user_id: currentUser.id,
      stat_date: new Date().toISOString().split('T')[0],
      total_leads: contacts.length,
      called: calledCount,
      skipped: skippedCount,
      interested: oc.interested || 0,
      callback: oc.callback || 0,
      noanswer: oc.noanswer || 0,
      notinterested: oc.notinterested || 0,
      avg_call_duration: avgDur
    }, { onConflict: 'user_id,stat_date' });
  } catch(e) { console.warn('Daily stats save:', e.message); }
}
