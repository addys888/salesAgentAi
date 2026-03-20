// ════════════════════════════════════════════════════════
//  DIALER.JS — File processing, Dialer engine, Sessions, AI, Email
// ════════════════════════════════════════════════════════

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
    if(num) contacts.push({ number:num, name: nc!=null?(row[nc]||''):'', note: oc!=null?(row[oc]||''):'', status:'pending', outcome:'' });
  });
  if(!contacts.length){ appAlert('No valid Indian mobile numbers found.', '📵'); return; }
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
  if(i >= contacts.length) { allDone(); return; }
  var anyPending = contacts.some(function(c){ return c.status === 'pending'; });
  if(!anyPending){ allDone(); return; }
  var c = contacts[i]; c.status = 'current'; updateRowStatus(i,'current');
  document.getElementById('currentNumber').textContent = '+91 '+c.number;
  document.getElementById('currentName').textContent = c.name||'Unknown Contact';
  document.getElementById('currentNote').textContent = c.note||'';
  document.getElementById('btnCall').href = 'https://wa.me/91'+c.number;
  document.getElementById('btnPhone').href = 'tel:+91'+c.number;
  var emojis = ['👤','🧑','👩','👨','🙋','🤝','💼','🧑‍💼'];
  document.getElementById('avEl').textContent = emojis[i%8];
  setStatus('active','● Ready'); updateProgress(); updateStats();
}

window.markCalled = function() {
  if(hasCalledCurrent) return;
  hasCalledCurrent = true;
  setStatus('calling','📲 Calling...');
  document.getElementById('avEl').classList.add('calling');
  document.getElementById('btnNext').disabled = false;
  setTimeout(function(){ document.getElementById('avEl').classList.remove('calling'); }, 4000);
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
  contacts[currentIndex].status = 'done'; contacts[currentIndex].outcome = currentOutcome;
  updateRowStatus(currentIndex,'done');
  var cell = document.getElementById('oc-cell-'+currentIndex);
  if(cell){ var L={interested:'🟢 Interested',callback:'🔔 Callback',noanswer:'📵 No Answer',notinterested:'🔴 Not Interested','':'—'}; cell.textContent=L[currentOutcome]||'—'; }
  calledCount++;
  currentIndex = findNextPending();
  updateStats(); showContact(currentIndex);
  markDirty(); autoSaveSession();
};

window.skipContact = function() {
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
  document.getElementById('dialerPanel').style.display='none';
  document.getElementById('doneBanner').style.display='block';
  var oc = contacts.reduce(function(a,c){ a[c.outcome]=(a[c.outcome]||0)+1; return a; },{});
  document.getElementById('doneSummary').textContent =
    'Called: '+calledCount+' · Skipped: '+skippedCount+' · Interested: '+(oc.interested||0)+' · Callbacks: '+(oc.callback||0);
  setStatus('idle','✓ Complete'); updateProgress();
  completeSession();
}

window.resetDialer = function() {
  contacts=[]; currentIndex=0; calledCount=0; skippedCount=0;
  _activeSessionId = null; _isDirty = false; jumpReturnIndex = -1;
  clearTimeout(_idleTimer);
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
//  TEMPLATES
// ════════════════════════════════════════════════════════
var TEMPLATES = {
  followup: {name:'📋 Follow-up', text:function(n,r){ return 'Hi '+(n||'there')+'! 👋\n\nThis is '+(r||'your advisor')+'. Thank you for taking my call today.\n\nI\'d love to share more details about our offerings.\n\nFeel free to reply anytime! 😊'; }},
  intro:    {name:'👋 Introduction', text:function(n,r){ return 'Hello '+(n||'there')+'! 🙏\n\nI\'m '+(r||'your advisor')+' from our sales team. I tried reaching you regarding a special opportunity.\n\nCould we connect at your convenient time? 📅'; }},
  callback: {name:'🔔 Callback', text:function(n,r){ return 'Hi '+(n||'there')+'! ☎️\n\nI\'m '+(r||'your advisor')+' — I called earlier but couldn\'t connect.\n\nPlease let me know your best time for a quick call! 🌟'; }},
  offer:    {name:'🏷️ Special Offer', text:function(n,r){ return 'Hi '+(n||'there')+'! 🎉\n\nWe have an exclusive limited-time offer for you.\n\nYour advisor '+(r?'('+r+') ':'')+' wants to make sure you don\'t miss out.\n\nShall we connect briefly? 🤝'; }},
  property: {name:'🏠 Property Info', text:function(n,r){ return 'Hello '+(n||'there')+'! 🏠\n\nThis is '+(r||'your property advisor')+'. I have exciting properties matching your budget.\n\nCan I send you the details and brochure? 📲'; }},
  loan:     {name:'💰 Loan Offer', text:function(n,r){ return 'Hi '+(n||'there')+'! 💰\n\nI\'m '+(r||'your financial advisor')+'. We have a special pre-approved loan offer:\n✅ Lowest interest rates\n✅ Quick processing\n✅ Minimal documentation\n\nInterested? Let\'s connect! 📞'; }}
};

function getRepName() {
  var meta = (currentUser && currentUser.user_metadata) || {};
  return meta.full_name || (currentUser && currentUser.email && currentUser.email.split('@')[0]) || 'Sales Advisor';
}

window.openTemplates = function() {
  var c = contacts[currentIndex] || {};
  var repN = getRepName();
  var list = document.getElementById('tplList');
  list.textContent = ''; // Safe clear

  Object.entries(TEMPLATES).forEach(function(entry){
    var key=entry[0], tpl=entry[1];
    var msg = tpl.text(c.name, repN);
    var waUrl = 'https://wa.me/91'+(c.number||'')+'?text='+encodeURIComponent(msg);

    var div = document.createElement('div');
    div.className = 'tpl-item';

    var nameDiv = document.createElement('div');
    nameDiv.className = 'tpl-name';
    nameDiv.textContent = tpl.name;

    var previewDiv = document.createElement('div');
    previewDiv.className = 'tpl-preview';
    previewDiv.textContent = msg.substring(0,140)+'...';

    var sendDiv = document.createElement('div');
    sendDiv.className = 'tpl-send';
    sendDiv.textContent = '👆 Tap to open in WhatsApp';

    div.appendChild(nameDiv);
    div.appendChild(previewDiv);
    div.appendChild(sendDiv);

    div.addEventListener('click', function(){ window.open(waUrl,'_blank'); document.getElementById('tplModal').classList.remove('open'); });
    list.appendChild(div);
  });
  document.getElementById('tplModal').classList.add('open');
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
