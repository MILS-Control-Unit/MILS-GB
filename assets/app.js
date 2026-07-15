/* ================== DATA MODEL ================== */
const SECTIONS = {
  en: { label: "English Section" },
  fr: { label: "French Section" }
};

// Small recognizable icon shown next to a subject's name wherever it appears in the
// UI (stepper, breadcrumb, Reports columns, user permission checkboxes, etc.). Keyed
// on the "base" subject name so English O.L./A.L. and French O.L./A.L. share one icon.
const SUBJECT_ICONS = {
  'Arabic':'ع','English':'🔤','Mathematics':'📐','Science':'🔬','Integrated Sciences':'🔬',
  'Social Studies':'🌍','History':'🏛️','Philosophy':'🧠','Religion':'🕌','Ch-Religion':'✝️',
  'French':'🇫🇷','German':'🇩🇪','Art':'🎨','ICT':'💻'
};
function subjectIcon(subject){
  if(!subject) return '';
  const base = subject.replace(/\s*(O\.L\.|A\.L\.)$/,'').trim();
  return SUBJECT_ICONS[base] || '📘';
}
function subjectWithIcon(subject){
  return subject ? `${subjectIcon(subject)} ${subject}` : subject;
}

const STAGES = {
  primary:  { label: "Primary Stage", grades: [
      {id:'g1', label:'Grade 1'},
      {id:'g2', label:'Grade 2'},
      {id:'g3', label:'Grade 3'},
      {id:'g4', label:'Grade 4'},
      {id:'g5', label:'Grade 5'},
      {id:'g6', label:'Grade 6'}
    ],
    subjects: ["Arabic","English O.L.","Mathematics","Science","Social Studies","English A.L.","Religion","Ch-Religion","French","German","ICT"]
  },
  prep:     { label: "Prep Stage", grades: [
      {id:'g7', label:'Grade 7'},
      {id:'g8', label:'Grade 8'},
      {id:'g9', label:'Grade 9'}
    ],
    subjects: ["Arabic","English O.L.","Mathematics","Science","Social Studies","English A.L.","Religion","Ch-Religion","French","German","Art","ICT"]
  },
  secondary:{ label: "Secondary Stage", grades: [
      {id:'g10', label:'Grade 10'},
      {id:'g11', label:'Grade 11'}
    ],
    subjects: ["Arabic","English O.L.","Mathematics","Integrated Sciences","History","Philosophy","English A.L.","Religion","Ch-Religion","French O.L.","German O.L.","French A.L.","German A.L.","ICT"]
  }
};

// French Section-specific subject mappings
const FRENCH_SECTION_SUBJECTS = {
  primary:  { label: "Primary Stage",
    subjects: ["Arabic","French O.L.","Mathematics","Science","Social Studies","French A.L.","Religion","Ch-Religion","English","ICT"]
  },
  prep:     { label: "Prep Stage",
    subjects: ["Arabic","French O.L.","Mathematics","Science","Social Studies","French A.L.","Religion","Ch-Religion","English","Art","ICT"]
  },
  secondary:{ label: "Secondary Stage",
    subjects: ["Arabic","French O.L.","Mathematics","Integrated Sciences","History","Philosophy","French A.L.","Religion","Ch-Religion","English O.L.","English A.L.","ICT"]
  }
};

// Helper function to get correct subjects based on section
function getSubjectsForStageAndSection(stageKey, sectionId){
  if(sectionId === 'fr'){
    return FRENCH_SECTION_SUBJECTS[stageKey] ? FRENCH_SECTION_SUBJECTS[stageKey].subjects : STAGES[stageKey].subjects;
  }
  return STAGES[stageKey].subjects;
}

// Used to order the Student Database list: English Section before French Section,
// and within each, Grade 1 → Grade 11 ascending (built from STAGES' own order, so
// Primary → Prep → Secondary already yields g1..g11 in the right sequence).
const SECTION_ORDER = { en:0, fr:1 };
const GRADE_ORDER = {};
// Flat lookup of every Grade id -> label across all Stages, used wherever a Grade needs to
// be labelled without also needing the Stage/Section scoping (e.g. Exam Schedule titles).
const GRADE_LABEL_BY_ID = {};
const ALL_GRADE_IDS = [];
(function(){
  let i = 0;
  ['primary','prep','secondary'].forEach(stageKey=>{
    STAGES[stageKey].grades.forEach(g=>{ GRADE_ORDER[g.id] = i++; GRADE_LABEL_BY_ID[g.id] = g.label; ALL_GRADE_IDS.push(g.id); });
  });
})();

// Absence tab keeps its OWN independent copies of the Section/Stage/Grade lists.
// These start out identical to SECTIONS/STAGES above, but editing one set (e.g. adding a
// section/stage/grade here or in the Grade Book lists) will NOT affect the other — they are
// completely separate lists, only the selected VALUES (state vs attState) were already independent.
const ATT_SECTIONS = JSON.parse(JSON.stringify(SECTIONS));
const ATT_STAGES = JSON.parse(JSON.stringify(STAGES));

let state = { termPeriod:null, section:null, stage:null, grade:null, term:null, academicTerm:null, subject:null,
  dashboardTerm:null, dashboardMode:null, dashboardSection:null, dashboardStage:null, dashboardGrade:null, dashboardClassroom:null, dashboardStudent:null,
  examsTerm:null, examsMode:null, examsSection:null, examsStage:null, examsGrade:null, examsClassroom:null, examsSubject:null,
  perfTerm:null, perfCycle:null, perfCategory:null };

// Top Performance / At Risk keeps its own independent Section/Stage/Grade/Class filter,
// fully separate from the Grade Book's state. Each Term × Cycle × Category combination gets
// its OWN filter (keyed below) so switching between, say, "Term 1 Cycle 1 Top Performance"
// and "Term 1 Cycle 1 At Risk" never carries the Section/Stage/Grade/Class choice over.
let perfFilterStates = {};
function perfFilterKey(){ return `${state.perfTerm}|${state.perfCycle}|${state.perfCategory}`; }
function getPerfFilterState(){
  const k = perfFilterKey();
  if(!perfFilterStates[k]) perfFilterStates[k] = { __isPerfFilter:true, section:null, stage:null, grade:null, term:null };
  return perfFilterStates[k];
}
// Absence tab keeps its own independent selections (Academic Term / Section / Stage / Grade / Class),
// completely separate from the Grade Book tab's selections above.
let attState = { termPeriod:null, section:null, stage:null, grade:null, term:null, subject:null, academicTerm:null };
let openStep = null;
let currentView = 'database';

// students[classKey] = [{id, displayId, name, classroom, lang2}]
let students = {};
// A student whose Notes field is exactly "TC" (case-insensitive, ignoring surrounding
// spaces) is kept in the Students Database list itself, but is hidden from every other
// list in the app (Grade Book, Attendance, Report Cards/Certificates, Class Lists,
// Statistics, Performance/Ranking, Parent Dashboard, Exams Analysis, etc.).
function isTCStudent(s){
  return !!(s && typeof s.notes === 'string' && s.notes.trim().toUpperCase() === 'TC');
}
function visibleRoster(list){
  return (list || []).filter(s => !isTCStudent(s));
}
// scores[subjKey] = { studentId: {...} } — subjKey includes the term, so each term keeps its own scores
let scores = {};
let studentIdCounter = 1;
// attendance[classKey|classroom|termPeriod|term|subject|academicTerm] = { start, end, dates:[...], records:{studentId:{dateStr:true}} }
// Each Term (1st/2nd) x Month (1st/2nd) combination is its own independent attendance table —
// selected via the Attendance tab's own stepper, exactly like the Grade Book's Mark Entry step.
let attendance = {};
// approvedLeave[classKey|classroom|termPeriod|term|subject|academicTerm] = { records:{studentId:{dateStr:true}} }
// Uses the EXACT SAME key/date-range as `attendance` above (same class/subject/month table,
// same dates) — it is not a separate table with its own Start/End, it's a second layer of
// records on top of the Absence table. Any date marked here for a student:
//   1) is shown as a locked "L" cell in the Absence table instead of a checkbox, and is
//      NOT counted in that student's absence total, and
//   2) if that student already had an absence (checkbox) recorded for that exact day,
//      marking it as Approved Leave cancels that absence for that day.
let approvedLeave = {};
// Which sub-tab of the "Absence & Approved Leave" tab is currently showing — 'absence' (the
// original attendance-taking table) or 'leave' (the new Approved Leave table). Both sub-tabs
// share the same stepper/class/subject/month selection (attState) and the same table shell,
// only what's written into each cell differs.
let attSubView = 'absence';

// Styling for the new Approved Leave sub-tab bar and the locked "L" cells inside the Absence
// table — injected here in JS since these are new UI elements that don't exist in the HTML.
(function injectApprovedLeaveStyles(){
  const css = `
    .att-subtabs{ display:flex; gap:8px; margin:0 0 14px 0; }
    .att-subtab-btn{ padding:8px 18px; border:1px solid #d0d5dd; border-radius:8px; background:#f8f9fb;
      cursor:pointer; font-weight:700; font-size:13px; color:#475467; transition:all .15s ease; }
    .att-subtab-btn:hover{ background:#eef1f5; }
    .att-subtab-btn.active{ background:#2563eb; border-color:#2563eb; color:#fff; }
    td.att-leave-cell{ text-align:center; font-weight:800; color:#b54708; background:#fffaeb; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  if(document.head) document.head.appendChild(style);
  else document.addEventListener('DOMContentLoaded', ()=> document.head.appendChild(style));
})();
// Animation styles for the Dashboard tab (Cycle Dashboard): staggered card/chart
// entrances, animated bar growth, pie-slice reveal, and radar fade-in. Pure CSS,
// no external animation library — keeps the single-file app dependency-free.
(function injectDashboardAnimStyles(){
  const css = `
    #dashboardChartsArea{ animation: dbFadeSlideIn .35s ease both; }
    .db-student-banner, .db-motivation-badge, .db-stat-card, .db-chart-card, .db-strength-alert,
    .db-attention-banner, .db-subject-trend-table{ animation: dbCardIn .45s cubic-bezier(.22,.9,.32,1) both; }
    .db-summary-row .db-stat-card:nth-child(1){ animation-delay:.02s; }
    .db-summary-row .db-stat-card:nth-child(2){ animation-delay:.08s; }
    .db-summary-row .db-stat-card:nth-child(3){ animation-delay:.14s; }
    .db-summary-row .db-stat-card:nth-child(4){ animation-delay:.20s; }
    .db-charts-grid .db-chart-card:nth-child(1){ animation-delay:.16s; }
    .db-charts-grid .db-chart-card:nth-child(2){ animation-delay:.22s; }
    .db-charts-grid .db-chart-card:nth-child(3){ animation-delay:.28s; }
    .db-stat-num{ display:inline-block; }
    @keyframes dbFadeSlideIn{ from{ opacity:0; transform:translateY(8px);} to{ opacity:1; transform:translateY(0);} }
    @keyframes dbCardIn{ from{ opacity:0; transform:translateY(10px) scale(.98);} to{ opacity:1; transform:translateY(0) scale(1);} }
    .db-anim-bar{ transform-box:fill-box; transform-origin:bottom; animation:dbBarGrow .55s cubic-bezier(.22,.9,.32,1) both; }
    @keyframes dbBarGrow{ from{ transform:scaleY(0);} to{ transform:scaleY(1);} }
    .db-anim-slice{ transform-box:fill-box; transform-origin:center; animation:dbSlicePop .5s cubic-bezier(.34,1.4,.64,1) both; }
    @keyframes dbSlicePop{ from{ opacity:0; transform:scale(.4);} to{ opacity:1; transform:scale(1);} }
    .db-anim-radar-fill{ animation:dbFadeIn .6s ease both .15s; }
    .db-anim-radar-ring{ animation:dbFadeIn .5s ease both; }
    @keyframes dbFadeIn{ from{ opacity:0;} to{ opacity:1;} }
    @media (prefers-reduced-motion: reduce){
      #dashboardChartsArea, .db-student-banner, .db-motivation-badge, .db-stat-card, .db-chart-card,
      .db-strength-alert, .db-attention-banner, .db-subject-trend-table,
      .db-anim-bar, .db-anim-slice, .db-anim-radar-fill, .db-anim-radar-ring{ animation:none !important; }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  if(document.head) document.head.appendChild(style);
  else document.addEventListener('DOMContentLoaded', ()=> document.head.appendChild(style));
})();

// ===== GSAP: masthead & nav-icon choreography =====
// Reorganizes how the header (logos, title, right-side widgets) and the nav bar's
// icons appear: a staggered entrance on load instead of everything popping in at
// once, plus a small icon "pulse" on hover. Purely additive — no layout/markup
// changes, just animation on top of the existing elements. Guarded by typeof gsap
// in case the CDN script fails to load (offline, blocked, etc.).
(function setupGsapChoreography(){
  function run(){
    if(typeof gsap === 'undefined') return;
    try{
    const logos = document.querySelectorAll('.masthead .school-logo');
    const mastheadText = document.querySelector('.masthead-text');
    const rightRows = document.querySelectorAll('.masthead-right .masthead-right-row');
    const navTabs = document.querySelectorAll('.nav-tab, .nav-group-label');

    const tl = gsap.timeline({ defaults:{ ease:'power3.out' } });

    if(logos.length){
      tl.from(logos, { opacity:0, x:-24, duration:.5, stagger:.12 }, 0);
    }
    if(mastheadText){
      tl.from(mastheadText, { opacity:0, y:-10, duration:.5 }, 0.1);
    }
    if(rightRows.length){
      tl.from(rightRows, { opacity:0, y:-10, duration:.45, stagger:.08 }, 0.15);
    }
    if(navTabs.length){
      tl.from(navTabs, { opacity:0, y:-8, duration:.35, stagger:.02, clearProps:'opacity' }, 0.3);
    }
    // Safety net: if this timeline gets interrupted by an unrelated script error
    // before it finishes, the tab labels/icons can be left stuck at a faded
    // in-between opacity (e.g. "Teachers"/"Absence" rendering pale grey instead
    // of full ink color). Force full opacity shortly after load regardless of
    // whether the animation completed cleanly.
    setTimeout(()=>{
      navTabs.forEach(el=>{ el.style.opacity = ''; });
    }, 1500);

    // Small hover "pulse" on nav-tab icons (the inline SVGs) — reinforces which
    // tab is about to be clicked without needing any CSS changes.
    document.querySelectorAll('.nav-tab svg').forEach(icon=>{
      const tab = icon.closest('.nav-tab');
      if(!tab) return;
      tab.addEventListener('mouseenter', ()=> gsap.to(icon, { scale:1.18, duration:.18, ease:'back.out(3)' }));
      tab.addEventListener('mouseleave', ()=> gsap.to(icon, { scale:1, duration:.18, ease:'power2.out' }));
    });
    }catch(e){
      // If anything above throws, make sure nav labels/icons are never left
      // stuck faded from the entrance animation.
      console.error('nav animation setup failed, forcing full opacity', e);
      document.querySelectorAll('.nav-tab, .nav-group-label').forEach(el=>{ el.style.opacity = ''; });
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

// teachers = [{id, displayId, name, section, subject, classes}]
let teachers = [];
let teacherIdCounter = 1;
// IDs of teachers deleted locally. The Firestore sync merges the teachers array by ID
// (so that a device that's behind doesn't wipe out teachers another device just added),
// but a plain union can't tell "remote still has this because it's stale" apart from
// "remote still has this because someone else added it back" — so a deletion made on one
// device would keep reappearing after the next Save/sync. Recording deleted IDs here (and
// syncing this list too) lets the merge explicitly drop them instead of re-adding them.
let deletedTeacherIds = [];

// Base64 logos for the First Month Report certificate (same images as the masthead)
const MILS_LOGO_B64 = "assets/images/mils-logo.jpg";
const EEP_LOGO_B64 = "assets/images/eep-logo.jpg";
const STAMP_LOGO_B64 = "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";

function classKey(){ return `${state.section}|${state.stage}|${state.grade}`; }

// Looks up the Teachers Database for the teacher assigned to a specific subject + classroom
// within a section. Used to show "who teaches this" under a subject at the class level.
function findSubjectTeacherName(section, subject, classroom){
  if(!classroom || !subject) return null;
  const subj = String(subject).trim().toLowerCase();
  const t = teachers.find(t=>{
    if((t.section||'')!==section) return false;
    if((t.subject||'').trim().toLowerCase()!==subj) return false;
    const classList = (t.classes||'').split(',').map(c=>c.trim()).filter(Boolean);
    return classList.includes(classroom);
  });
  return t ? t.name : null;
}

// Looks up the Head of Department for a subject + stage within a section, from the Manage
// Users accounts (role "hod"). Used to show "who oversees this" at the whole-grade level,
// where no single class teacher applies.
function findHodName(section, stage, subject){
  if(!subject) return null;
  const subj = String(subject).trim().toLowerCase();
  const u = (typeof users!=='undefined' ? users : []).find(u=>{
    if(u.role!=='hod') return false;
    if((u.section||'')!==section) return false;
    if(!Array.isArray(u.stages) || !u.stages.includes(stage)) return false;
    if(!Array.isArray(u.subjects)) return false;
    return u.subjects.some(s=> String(s||'').trim().toLowerCase()===subj);
  });
  return u ? u.displayName : null;
}
// Mark-entry sub-mode: 'month1' | 'month2' | 'coursework' (Term 1 / Term 2 is tracked separately in state.termPeriod)
function academicSubMode(){
  return state.academicTerm || null;
}
// Human-readable label for a Mark Entry screen. "examPaper" is labelled differently depending
// on which Academic Term it belongs to: "Term 1 (Total)" for Term 1, "Term 2 (Total)" for Term 2.
function markEntryLabel(termPeriod, academicTerm){
  if(!academicTerm) return null;
  if(academicTerm==='examPaper') return termPeriod==='term2' ? 'Term 2 (Total)' : 'Term 1 (Total)';
  const labels = { month1:'First Month Mark Entry', month2:'Second Month Mark Entry', coursework:'Total Coursework Mark Entry' };
  return labels[academicTerm] || null;
}
// First Month / Second Month / Total Coursework are just different entry SCREENS for the
// same subject+term data (Total Coursework needs the Month 1 & Month 2 figures to compute its
// totals), so they all share one score bucket keyed by the term period (term1 / term2) only.
function subjKey(){
  return `${classKey()}|${state.termPeriod}|${state.subject}`;
}
function isPrimary(){ return state.stage === 'primary'; }
// Grade 1 & Grade 2 Primary use an extended mark-entry structure (Q.Av./C.W./H.W./Oral out of 20/20/20/10, Total out of 75).
function isJuniorPrimary(){ return isPrimary() && (state.grade==='g1' || state.grade==='g2'); }
function nextDisplayId(){ return 'STU-' + String(studentIdCounter++).padStart(4,'0'); }
// Formats an ID that was typed/pasted into the uploaded Excel sheet into the
// on-screen display format: "MILS-" followed by the last 4 digits (from the
// right) of the value that was in the file. Non-digit characters (dashes,
// spaces, letters) are stripped first, so "800401-00001058" or "ID 1058"
// both become "MILS-1058". If fewer than 4 digits are found, it's padded
// with leading zeros.
function formatMilsId(rawId){
  const digits = (rawId||'').toString().replace(/\D/g,'');
  if(!digits) return '';
  const last4 = digits.slice(-4).padStart(4,'0');
  return 'MILS-' + last4;
}
// Builds a lookup index for matching typed/pasted Student ID(s) against the Students Database,
// tolerant of the two ID formats this app can produce for the SAME student — the default
// "STU-####" sequence number (nextDisplayId), or a "MILS-####" format derived from an external
// ID typed in during bulk import (formatMilsId, above). A person retyping/guessing an ID from
// memory often gets the digits right but the prefix wrong, so on top of the exact (trimmed,
// case-insensitive) displayId this also indexes every student by their last 4 digits — the
// same digits formatMilsId() itself keys off — so "STU-5186" and "MILS-5186" resolve to the
// same student even though neither string matches the other exactly.
function buildStudentIdIndex(students){
  const byExact = new Map();
  const byDigits = new Map();
  (students||[]).forEach(s=>{
    if(!s.displayId) return;
    const exactKey = s.displayId.toString().trim().toLowerCase();
    if(!byExact.has(exactKey)) byExact.set(exactKey, []);
    byExact.get(exactKey).push(s);
    const digits = s.displayId.toString().replace(/\D/g,'');
    if(digits){
      const digitKey = digits.slice(-4).padStart(4,'0');
      if(!byDigits.has(digitKey)) byDigits.set(digitKey, []);
      byDigits.get(digitKey).push(s);
    }
  });
  return { byExact, byDigits };
}
// Resolves one typed Student ID token against the index above. Tries an exact (trimmed,
// case-insensitive) match on the full ID first; only if that finds NOTHING does it fall back
// to matching on the last 4 digits alone — so a guessed/wrong prefix still resolves as long as
// those last 4 digits belong to exactly one student. `viaFallback` tells the caller whether the
// match came from the digits-only fallback, so a result message can optionally flag it.
function resolveStudentIdToken(rawToken, index){
  const token = (rawToken||'').toString().trim();
  if(!token) return { matches:[], viaFallback:false };
  const exact = index.byExact.get(token.toLowerCase());
  if(exact && exact.length) return { matches:exact, viaFallback:false };
  const digits = token.replace(/\D/g,'');
  if(!digits) return { matches:[], viaFallback:false };
  const digitKey = digits.slice(-4).padStart(4,'0');
  const fallback = index.byDigits.get(digitKey);
  return { matches: fallback||[], viaFallback:true };
}
// Attendance is tracked per Class within its own Academic Term + Month selection (attState),
// fully independent of the Grade Book tab. Each Term × Month combination is its own table.
function attClassKey(){ return `${attState.section}|${attState.stage}|${attState.grade}|${attState.termPeriod}|${attState.term}|${attState.subject}|${attState.academicTerm}`; }
// Approved Leave is recorded ONCE per class (Section/Stage/Grade/Class/Term/Month) — NOT per
// Subject like Absence is — so a day marked as Approved Leave shows up as a locked "L" in the
// Absence table of EVERY subject for that class/month, not just the subject that was open when
// it was recorded. This key deliberately omits attState.subject.
function attClassLevelKey(){ return `${attState.section}|${attState.stage}|${attState.grade}|${attState.termPeriod}|${attState.term}|${attState.academicTerm}`; }

function classKeyLabels(ck){
  const [sec, stg, grd] = ck.split('|');
  const stage = STAGES[stg];
  const grade = stage ? stage.grades.find(g=>g.id===grd) : null;
  return {
    section: SECTIONS[sec] ? SECTIONS[sec].label : sec,
    stage: stage ? stage.label : stg,
    grade: grade ? grade.label : grd,
    sectionId: sec, stageId: stg, gradeId: grd
  };
}

// Hides every tab's content and the nav bar itself, leaving only the
// "Account is NOT active" message on screen. Used for a Parent/Student
// login whose linked child has been checked in Configuration ▸ Blocked
// Students — the block applies to the whole account, not just Reports.
function showAccountBlockedScreen(){
  currentView = null;
  ['gradesView','databaseView','markEntryReportView','attendanceView','dashboardView','examsAnalysisView','teachersView','teacherStatisticsView','perfAlertsView'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
  const noAccess = document.getElementById('noAccessPanel');
  if(noAccess) noAccess.style.display = 'none';
  const blockedPanel = document.getElementById('accountBlockedPanel');
  if(blockedPanel) blockedPanel.style.display = 'flex';
  const nav = document.getElementById('mainNav');
  if(nav) nav.style.display = 'none';
  document.querySelectorAll('.nav-tab').forEach(b=> b.classList.remove('active'));
}

function switchView(view){
  if(isViewerAccountBlocked()){
    showAccountBlockedScreen();
    return;
  }
  if(!canAccessTab(view)){
    const allowed = firstAllowedTab();
    if(allowed && allowed!==view){ switchView(allowed); }
    return;
  }
  currentView = view;
  document.getElementById('gradesView').style.display = view==='grades' ? '' : 'none';
  document.getElementById('databaseView').style.display = view==='database' ? '' : 'none';
  document.getElementById('markEntryReportView').style.display = view==='markEntryReport' ? '' : 'none';
  document.getElementById('attendanceView').style.display = view==='attendance' ? '' : 'none';
  document.getElementById('dashboardView').style.display = view==='dashboard' ? '' : 'none';
  document.getElementById('examsAnalysisView').style.display = view==='examsAnalysis' ? '' : 'none';
  document.getElementById('teachersView').style.display = view==='teachers' ? '' : 'none';
  document.getElementById('teacherStatisticsView').style.display = view==='teacherStatistics' ? '' : 'none';
  document.getElementById('perfAlertsView').style.display = view==='perfAlerts' ? '' : 'none';
  document.getElementById('classListsView').style.display = view==='classLists' ? '' : 'none';
  document.getElementById('statisticsView').style.display = view==='statistics' ? '' : 'none';
  document.getElementById('certReportsView').style.display = view==='certReports' ? '' : 'none';
  document.querySelectorAll('.nav-tab').forEach(b=> b.classList.toggle('active', b.dataset.view===view));
  if(view==='database') renderDatabase();
  if(view==='teachers') renderTeachersDatabase();
  if(view==='teacherStatistics') renderTeacherStatistics();
  if(view==='markEntryReport'){ renderMarkEntryStepper(); renderMarkEntryWorkspace(); }
  if(view==='attendance'){ renderAttendanceStepper(); renderAttendanceWorkspace(); }
  if(view==='dashboard'){ renderDashboard(); }
  if(view==='examsAnalysis'){ renderExamsAnalysis(); }
  if(view==='perfAlerts'){ renderPerfFilterStepper(); renderPerfAlerts(); }
  if(view==='classLists'){ renderClassListsStepper(); renderClassListsWorkspace(); }
  if(view==='statistics'){ renderStatistics(); }
  if(view==='certReports'){ renderCertReportsStepper(); renderCertReportsWorkspace(); }
}

let openTermGroup = null;
function toggleTermGroup(e, term){
  e.stopPropagation();
  openTermGroup = (openTermGroup===term) ? null : term;
  document.querySelectorAll('.term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('.term-group-btn').forEach(el=> el.classList.remove('expanded'));
  if(openTermGroup){
    document.getElementById('termGroup_'+openTermGroup).classList.add('open');
    document.getElementById('termGroupBtn_'+openTermGroup).classList.add('expanded');
  }
}



/* ================== STEPPER ================== */
function getClassesInGrade(st){
  st = st || state;
  if(!st.section || !st.stage || !st.grade) return [];
  const classKey_ = `${st.section}|${st.stage}|${st.grade}`;
  const roster = students[classKey_] || [];
  const classes = [...new Set(roster.map(s => s.classroom).filter(c => c && c !== ''))];
  return classes.sort();
}

function makeStepConfig(st, sectionsData, stagesData){
  sectionsData = sectionsData || SECTIONS;
  stagesData = stagesData || STAGES;

  const termPeriodStep = { key:'termPeriod', title:'Academic Term', state: st, getLabel:()=> st.termPeriod ? TERM_LABELS[st.termPeriod] : null,
    options: [
      { id:'term1', label:'Term 1' },
      { id:'term2', label:'Term 2' }
    ] };
  const sectionStep = { key:'section', title:'Section', state: st, getLabel:()=> st.section ? sectionsData[st.section].label : null,
    options: Object.entries(sectionsData).filter(([id])=>scopeSectionAllowed(id)).map(([id,v])=>({id,label:v.label})), requires:['termPeriod'] };
  const academicTermStep = { key:'academicTerm', title:'Mark Entry', state: st, getLabel:()=> markEntryLabel(st.termPeriod, st.academicTerm),
    options: ()=>{
      const opts = [
        { id:'month1', label:'First Month Mark Entry' },
        { id:'month2', label:'Second Month Mark Entry' },
        { id:'coursework', label:'Total Coursework Mark Entry' }
      ];
      if(st.termPeriod==='term1') opts.push({ id:'examPaper', label:'Term 1 (Total)' });
      else if(st.termPeriod==='term2') opts.push({ id:'examPaper', label:'Term 2 (Total)' });
      return opts;
    },
    requires:['termPeriod','section','stage','grade','term'] };
  const subjectStep = { key:'subject', title:'Subject', state: st, getLabel:()=> st.subject ? subjectWithIcon(st.subject) : null,
    options: ()=> st.stage ? getSubjectsForStageAndSection(st.stage, st.section).filter(s=>scopeSubjectAllowed(s)).map(s=>({id:s,label:subjectWithIcon(s)})) : [], requires:['termPeriod','section','stage','grade','term','academicTerm'] };

  // Teachers only ever have one Section, and a fixed, pre-assigned set of Classes/Subjects —
  // making them click through Stage and Grade first (even though those dropdowns only ever
  // offer the one Stage/Grade their own classes happen to sit in) is pure friction. So for the
  // Teacher role the Class step skips Stage/Grade entirely and lists the Teacher's own classes
  // directly (see getTeacherClassroomsInSection()); Stage/Grade get filled in silently behind
  // the scenes the moment a Class is picked (see selectValue()) so every downstream lookup
  // (roster, subjects-for-stage, etc.) keeps working exactly as before.
  if(currentUser && currentUser.role==='teacher'){
    const classStep = { key:'term', title:'Class', state: st, getLabel:()=> st.term ? st.term : null,
      options: ()=> getTeacherClassroomsInSection(st.section).map(c=>({id:c,label:c})), requires:['termPeriod','section'] };
    return [termPeriodStep, sectionStep, classStep, academicTermStep, subjectStep];
  }

  const stageStep = { key:'stage', title:'Stage', state: st, getLabel:()=> st.stage ? stagesData[st.stage].label : null,
    options: Object.entries(stagesData).filter(([id])=>scopeStageAllowed(id)).map(([id,v])=>({id,label:v.label})), requires:['termPeriod','section'] };
  const gradeStep = { key:'grade', title:'Grade', state: st, getLabel:()=>{
      if(!st.grade) return null;
      const g = stagesData[st.stage].grades.find(g=>g.id===st.grade);
      return g ? g.label : null;
    }, options: ()=> st.stage ? stagesData[st.stage].grades.filter(g=>scopeGradeAllowed(g.id)).map(g=>({id:g.id,label:g.label})) : [], requires:['termPeriod','section','stage'] };
  const termStep = { key:'term', title:'Class', state: st, getLabel:()=> st.term ? st.term : null,
    options: ()=> getClassesInGrade(st).filter(c=>scopeClassroomAllowed(c)).map(c=>({id:c,label:c})), requires:['termPeriod','section','stage','grade'] };

  return [termPeriodStep, sectionStep, stageStep, gradeStep, termStep, academicTermStep, subjectStep];
}

// Returns the leading part of a stepConfig()/makeStepConfig() array up to and including the
// "Class" (term) step — used wherever a tab needs its own reduced stepper (Mark Entry Report,
// the Attendance tab's own Subject+Month steps). Written as "find the Class step" rather than
// a hardcoded slice(0,5) so it stays correct for the Teacher role's shorter config (which skips
// the separate Stage/Grade steps) as well as the normal 7-step config.
function stepConfigThroughClass(cfgArray){
  const idx = cfgArray.findIndex(c=>c.key==='term');
  return idx>-1 ? cfgArray.slice(0, idx+1) : cfgArray;
}

function stepConfig(){
  return makeStepConfig(state, SECTIONS, STAGES);
}

// Absence tab uses its own independent ATT_SECTIONS / ATT_STAGES lists — editing either
// list (Grade Book's or Absence's) never affects the other.
// After Term / Section / Stage / Grade / Class, the Attendance tab has its own "Month" step
// (1st Month / 2nd Month only — no "Total Coursework", attendance has no such concept) which
// picks out one independent attendance table, the same way Mark Entry does for the Grade Book.
function attStepConfig(){
  const base = stepConfigThroughClass(makeStepConfig(attState, ATT_SECTIONS, ATT_STAGES));
  // Absence is recorded per Subject (each subject has its own sessions/schedule), so the
  // Attendance tab picks a Subject right after Class, before the Month step.
  const subjectStep = {
    key:'subject', title:'Subject', state: attState,
    getLabel:()=> attState.subject ? subjectWithIcon(attState.subject) : null,
    options: ()=> attState.stage ? getSubjectsForStageAndSection(attState.stage, attState.section).filter(s=>scopeSubjectAllowed(s)).map(s=>({id:s,label:subjectWithIcon(s)})) : [],
    requires:['termPeriod','section','stage','grade','term']
  };
  const monthStep = {
    key:'academicTerm', title:'Month', state: attState,
    getLabel:()=>{
      const labels = { month1:'1st Month', month2:'2nd Month' };
      return attState.academicTerm ? labels[attState.academicTerm] : null;
    },
    options: [
      { id:'month1', label:'1st Month' },
      { id:'month2', label:'2nd Month' }
    ],
    requires:['termPeriod','section','stage','grade','term','subject']
  };
  return [...base, subjectStep, monthStep];
}

function renderStepper(){
  buildStepperHTML('stepper', stepConfig(), '', 2);
}

// The Absence tab has its own independent Academic Term / Section / Stage / Grade / Class selections
function renderAttendanceStepper(){
  const holder = document.getElementById('attendanceStepper');
  if(!holder) return;
  buildStepperHTML('attendanceStepper', attStepConfig(), 'a-', 1);
}

// Top Performance / At Risk: Section > Stage > Grade > Class only (no Academic Term or
// Mark Entry / Subject steps — the Term is already picked from the "Top & At-Risk" menu,
// and the report always covers every subject at once).
function perfFilterStepConfig(){
  const st = getPerfFilterState();
  return [
    { key:'section', title:'Section', state: st, getLabel:()=> st.section ? SECTIONS[st.section].label : null,
      options: Object.entries(SECTIONS).filter(([id])=>scopeSectionAllowed(id)).map(([id,v])=>({id,label:v.label})) },
    { key:'stage', title:'Stage', state: st, getLabel:()=> st.stage ? STAGES[st.stage].label : null,
      options: Object.entries(STAGES).filter(([id])=>scopeStageAllowed(id)).map(([id,v])=>({id,label:v.label})), requires:['section'] },
    { key:'grade', title:'Grade', state: st, getLabel:()=>{
        if(!st.grade) return null;
        const g = STAGES[st.stage].grades.find(g=>g.id===st.grade);
        return g ? g.label : null;
      }, options: ()=> st.stage ? STAGES[st.stage].grades.map(g=>({id:g.id,label:g.label})) : [], requires:['section','stage'] },
    { key:'term', title:'Class (optional — whole Grade if left blank)', state: st, getLabel:()=> st.term ? st.term : null,
      options: ()=> getClassesInGrade(st).filter(c=>scopeClassroomAllowed(c)).map(c=>({id:c,label:c})), requires:['section','stage','grade'] }
  ];
}
function renderPerfFilterStepper(){
  const holder = document.getElementById('perfFilterStepper');
  if(!holder) return;
  buildStepperHTML('perfFilterStepper', perfFilterStepConfig(), 'pf-');
}

// Renders the selections as a compact breadcrumb trail (Term › Section › Stage › Grade › Class),
// with the last `prominentCount` steps (the ones that change most often within a session,
// e.g. Mark Entry + Subject) shown as larger, clearly interactive controls instead of plain crumbs.
function buildStepperHTML(holderId, cfgs, idPrefix, prominentCount){
  prominentCount = prominentCount || 0;
  const holder = document.getElementById(holderId);
  if(!holder) return;
  holder.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'breadcrumb-row';
  holder.appendChild(row);

  cfgs.forEach((cfg, idx)=>{
    const cst0 = cfg.state || state;
    const ready = cfg.requires ? cfg.requires.every(r=>cst0[r]) : true;
    const val = cfg.getLabel();
    const stepKey = idPrefix + cfg.key;
    const isProminent = idx >= cfgs.length - prominentCount;

    if(idx>0){
      if(idx === cfgs.length - prominentCount && prominentCount>0){
        const divider = document.createElement('span');
        divider.className = 'bc-divider';
        row.appendChild(divider);
      } else {
        const sep = document.createElement('span');
        sep.className = 'bc-sep';
        sep.textContent = '›';
        row.appendChild(sep);
      }
    }

    const div = document.createElement('div');
    div.className = 'stepper-item ' + (isProminent ? 'bc-crumb-prom' : 'bc-crumb')
      + (val ? ' done':'') + (!ready ? ' locked':'') + (openStep===stepKey?' active':'');
    if(isProminent){
      div.innerHTML = `
        <div class="bc-prom-text">
          <span class="bc-prom-label">${cfg.title}</span>
          <span class="bc-prom-value ${val?'':'placeholder'}">${val || 'Select…'}</span>
        </div>
        <span class="bc-caret">▾</span>
        <div class="step-options" id="opts-${stepKey}"></div>
      `;
    } else {
      div.innerHTML = `
        <span class="bc-text ${val?'':'placeholder'}" title="${cfg.title}">${val || cfg.title}</span>
        <div class="step-options" id="opts-${stepKey}"></div>
      `;
    }
    if(ready){
      div.onclick = (e)=>{
        if(e.target.closest('.step-options')) return;
        openStep = (openStep===stepKey) ? null : stepKey;
        renderStepper();
        renderMarkEntryStepper();
        renderAttendanceStepper();
        renderPerfFilterStepper();
        renderClassListsStepper();
        renderCertReportsStepper();
      };
    }
    row.appendChild(div);

    if(openStep===stepKey && ready){
      const cst = cfg.state || state;
      const opts = typeof cfg.options==='function' ? cfg.options() : cfg.options;
      const optHolder = div.querySelector(`#opts-${stepKey}`);
      optHolder.classList.add('open');
      opts.forEach(o=>{
        // Check if this option has a submenu
        if(o.submenu){
          const groupBtn = document.createElement('button');
          groupBtn.className='opt-btn term-group-btn' + (cst[cfg.key]===o.id ? ' selected':'');
          groupBtn.innerHTML = `${o.label} <span class="arrow">▸</span>`;
          groupBtn.onclick=(e)=>{
            e.stopPropagation();
            const subgroup = optHolder.querySelector(`[data-parent="${o.id}"]`);
            if(subgroup){
              subgroup.classList.toggle('open');
              groupBtn.classList.toggle('expanded');
            }
          };
          optHolder.appendChild(groupBtn);
          
          const subgroup = document.createElement('div');
          subgroup.className='term-group';
          subgroup.setAttribute('data-parent', o.id);
          o.submenu.forEach(sub=>{
            const subBtn = document.createElement('button');
            subBtn.className='opt-btn' + (cst[cfg.key]===sub.id ? ' selected':'');
            subBtn.textContent=sub.label;
            subBtn.onclick=(e)=>{
              e.stopPropagation();
              selectValue(cfg.key,sub.id,cst);
            };
            subgroup.appendChild(subBtn);
          });
          optHolder.appendChild(subgroup);
        } else {
          const b = document.createElement('button');
          b.className='opt-btn' + (cst[cfg.key]===o.id ? ' selected':'');
          b.textContent=o.label;
          b.onclick=(e)=>{
            e.stopPropagation();
            selectValue(cfg.key,o.id,cst);
          };
          optHolder.appendChild(b);
        }
      });
    }
  });
}

function selectValue(key, id, targetState){
  const st = targetState || state;
  st[key]=id;
  // Teacher stepper skips the Stage/Grade steps entirely (see makeStepConfig()), so the moment
  // a Teacher picks a Class, silently fill in which Stage/Grade it belongs to — every downstream
  // lookup (roster, subjects-for-stage, etc.) still keys off state.stage/state.grade as before.
  if(key==='term' && currentUser && currentUser.role==='teacher' && (st===state || st===attState)){
    const loc = findTeacherClassroomLocation(st.section, id);
    if(loc){ st.stage = loc.stage; st.grade = loc.grade; }
  }
  // reset downstream selections (only resets keys that exist on the target state object).
  // Grade Book order: ...Class, Mark Entry(academicTerm), Subject. Attendance order: ...Class, Subject, Month(academicTerm).
  const order = (st===attState)
    ? ['termPeriod','section','stage','grade','term','subject','academicTerm']
    : (st===certState)
    ? ['termPeriod','section','stage','grade','reportType','term']
    : ['termPeriod','section','stage','grade','term','academicTerm','subject'];
  const idx = order.indexOf(key);
  if(idx>-1){
    order.slice(idx+1).forEach(k=>{ if(k in st) st[k]=null; });
  }
  if(st===certState){ st.studentId = null; st.generated = false; }
  openStep=null;
  if(st === state) saveLastGradebookSelection();
  renderStepper();
  renderMarkEntryStepper();
  renderAttendanceStepper();
  renderPerfFilterStepper();
  renderCertReportsStepper();
  renderWorkspace();
  renderMarkEntryWorkspace();
  renderAttendanceWorkspace();
  if(st === state){ renderClassListsStepper(); renderClassListsWorkspace(); }
  if(st && st.__isPerfFilter) renderPerfAlerts();
  if(st && st.__isCert) renderCertReportsWorkspace();
}

// Hover-to-open / delayed-fade-out for the top nav dropdowns (Dashboard,
// Exams Analysis, Top & At-Risk, Configuration). Mouse devices get an instant open on
// hover and a smooth fade-out ~350ms after the cursor actually leaves the button+menu
// area, so moving diagonally into the menu doesn't accidentally close it. Click-to-toggle
// (for touch devices) keeps working exactly as before.
// Positions a nav-dropdown-menu as position:fixed to the right of its trigger icon
// (or, if it would run off-screen, to the left / clamped vertically), computed from the
// live button rect. The nav is now a vertical icon rail down the left edge, so menus flow
// out sideways from each icon rather than dropping down beneath it.
function positionFixedNavMenu(wrap, menu){
  if(!wrap || !menu) return;
  const rect = wrap.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.margin = '0';
  const menuWidth = Math.max(menu.offsetWidth, 230);
  let left = rect.right + 8;
  if(left + menuWidth > window.innerWidth - 8){
    left = Math.max(8, rect.left - menuWidth - 8);
  }
  menu.style.left = left + 'px';
  const menuHeight = menu.offsetHeight || 200;
  let top = rect.top;
  if(top + menuHeight > window.innerHeight - 8){
    top = Math.max(8, window.innerHeight - 8 - menuHeight);
  }
  menu.style.top = top + 'px';
}

(function(){
  function setupNavDropdowns(){
    const NAV_DROPDOWNS = [
      ['dashboardDropdownWrap','dashboardMenu'],
      ['examsDropdownWrap','examsMenu'],
      ['perfDropdownWrap','perfMenu'],
      ['examSchedDropdownWrap','examSchedMenu'],
      ['configDropdownWrap','configMenu'],
      ['databaseDropdownWrap','databaseMenu'],
      ['teachersDropdownWrap','teachersMenu']
    ];
    const closeTimers = {};
    NAV_DROPDOWNS.forEach(([wrapId, menuId])=>{
      const wrap = document.getElementById(wrapId);
      const menu = document.getElementById(menuId);
      if(!wrap || !menu) return;
      const openNow = ()=>{
        clearTimeout(closeTimers[wrapId]);
        positionFixedNavMenu(wrap, menu);
        menu.classList.add('open');
      };
      const scheduleClose = ()=>{
        clearTimeout(closeTimers[wrapId]);
        closeTimers[wrapId] = setTimeout(()=>{ menu.classList.remove('open'); }, 650);
      };
      wrap.addEventListener('mouseenter', openNow);
      wrap.addEventListener('mouseleave', scheduleClose);
      menu.addEventListener('mouseenter', openNow);
      menu.addEventListener('mouseleave', scheduleClose);
    });
    // Keep an open menu's position in sync with its button if the page scrolls/resizes
    // while it's open (e.g. the horizontally-scrolling nav row itself).
    const reposition = ()=>{
      NAV_DROPDOWNS.forEach(([wrapId, menuId])=>{
        const wrap = document.getElementById(wrapId);
        const menu = document.getElementById(menuId);
        if(wrap && menu && menu.classList.contains('open')) positionFixedNavMenu(wrap, menu);
      });
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupNavDropdowns);
  } else {
    setupNavDropdowns();
  }
})();

document.addEventListener('click', (e)=>{
  if(!e.target.closest('.stepper-item')){ openStep=null; renderStepper(); renderAttendanceStepper(); renderPerfFilterStepper(); }
  if(!e.target.closest('#dashboardDropdownWrap')){
    const dm = document.getElementById('dashboardMenu');
    if(dm) dm.classList.remove('open');
  }
  if(!e.target.closest('#examsDropdownWrap')){
    const em = document.getElementById('examsMenu');
    if(em) em.classList.remove('open');
    document.querySelectorAll('#examsMenu .term-group').forEach(el=> el.classList.remove('open'));
    document.querySelectorAll('#examsMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
    openExamsTermGroup = null;
  }
  if(!e.target.closest('#examSchedDropdownWrap')){
    const esm = document.getElementById('examSchedMenu');
    if(esm) esm.classList.remove('open');
    document.querySelectorAll('#examSchedMenu .term-group').forEach(el=> el.classList.remove('open'));
    document.querySelectorAll('#examSchedMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
    openExamSchedTermGroup = null;
  }
  if(!e.target.closest('#configDropdownWrap')){
    const cm = document.getElementById('configMenu');
    if(cm) cm.classList.remove('open');
  }
  if(!e.target.closest('#databaseDropdownWrap')){
    const dbm = document.getElementById('databaseMenu');
    if(dbm) dbm.classList.remove('open');
  }
  if(!e.target.closest('#teachersDropdownWrap')){
    const tcm = document.getElementById('teachersMenu');
    if(tcm) tcm.classList.remove('open');
  }
  if(!e.target.closest('.teacher-classes-dd')){
    document.querySelectorAll('.teacher-classes-panel').forEach(p=> p.classList.remove('open'));
  }
  if(!e.target.closest('#visitorsWidget')){
    const dd = document.getElementById('visitorsDropdown');
    if(dd) dd.classList.remove('open');
  }
  if(!e.target.closest('#birthdayWidget')){
    const bd = document.getElementById('birthdayDropdown');
    if(bd) bd.classList.remove('open');
  }
  if(!e.target.closest('#ufClassroomsDD')){
    const cp = document.getElementById('ufClassroomsPanel');
    if(cp) cp.classList.remove('open');
  }
});

function toggleVisitorsDropdown(e){
  e.stopPropagation();
  const dd = document.getElementById('visitorsDropdown');
  if(!dd) return;
  const opening = !dd.classList.contains('open');
  dd.classList.toggle('open');
  if(opening) refreshActiveVisitorsWidget();
}

function toggleBirthdayDropdown(e){
  e.stopPropagation();
  const dd = document.getElementById('birthdayDropdown');
  if(!dd) return;
  const opening = !dd.classList.contains('open');
  dd.classList.toggle('open');
  if(opening) renderBirthdayWidget();
}

function toggleConfigMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('configMenu');
  if(!menu.classList.contains('open')) positionFixedNavMenu(document.getElementById('configDropdownWrap'), menu);
  menu.classList.toggle('open');
}

function toggleDatabaseMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('databaseMenu');
  if(!menu.classList.contains('open')) positionFixedNavMenu(document.getElementById('databaseDropdownWrap'), menu);
  menu.classList.toggle('open');
}
function closeDatabaseMenu(){
  const dm = document.getElementById('databaseMenu');
  if(dm) dm.classList.remove('open');
}

function toggleTeachersMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('teachersMenu');
  if(!menu.classList.contains('open')) positionFixedNavMenu(document.getElementById('teachersDropdownWrap'), menu);
  menu.classList.toggle('open');
}
function closeTeachersMenu(){
  const tm = document.getElementById('teachersMenu');
  if(tm) tm.classList.remove('open');
}

function toggleDashboardMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('dashboardMenu');
  if(!menu.classList.contains('open')) positionFixedNavMenu(document.getElementById('dashboardDropdownWrap'), menu);
  menu.classList.toggle('open');
}

let openDashTermGroup = null;
function toggleDashTermGroup(e, term){
  e.stopPropagation();
  openDashTermGroup = (openDashTermGroup===term) ? null : term;
  document.querySelectorAll('#dashboardMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#dashboardMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  if(openDashTermGroup){
    document.getElementById('dashTermGroup_'+openDashTermGroup).classList.add('open');
    document.getElementById('dashTermGroupBtn_'+openDashTermGroup).classList.add('expanded');
  }
}

function toggleExamsMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('examsMenu');
  if(!menu.classList.contains('open')) positionFixedNavMenu(document.getElementById('examsDropdownWrap'), menu);
  menu.classList.toggle('open');
}

let openExamsTermGroup = null;
function toggleExamsTermGroup(e, term){
  e.stopPropagation();
  openExamsTermGroup = (openExamsTermGroup===term) ? null : term;
  document.querySelectorAll('#examsMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#examsMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  if(openExamsTermGroup){
    document.getElementById('examsTermGroup_'+openExamsTermGroup).classList.add('open');
    document.getElementById('examsTermGroupBtn_'+openExamsTermGroup).classList.add('expanded');
  }
}

function toggleExamSchedMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('examSchedMenu');
  if(!menu.classList.contains('open')) positionFixedNavMenu(document.getElementById('examSchedDropdownWrap'), menu);
  menu.classList.toggle('open');
}

let openExamSchedTermGroup = null;
function toggleExamSchedTermGroup(e, term){
  e.stopPropagation();
  openExamSchedTermGroup = (openExamSchedTermGroup===term) ? null : term;
  document.querySelectorAll('#examSchedMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#examSchedMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  if(openExamSchedTermGroup){
    document.getElementById('examSchedTermGroup_'+openExamSchedTermGroup).classList.add('open');
    document.getElementById('examSchedTermGroupBtn_'+openExamSchedTermGroup).classList.add('expanded');
  }
}

function togglePerfMenu(e){
  e.stopPropagation();
  const menu = document.getElementById('perfMenu');
  if(!menu.classList.contains('open')) positionFixedNavMenu(document.getElementById('perfDropdownWrap'), menu);
  menu.classList.toggle('open');
}

let openPerfTermGroup = null;
let openPerfCycleGroup = null;
function togglePerfTermGroup(e, term){
  e.stopPropagation();
  openPerfTermGroup = (openPerfTermGroup===term) ? null : term;
  openPerfCycleGroup = null;
  document.querySelectorAll('#perfMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#perfMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  if(openPerfTermGroup){
    document.getElementById('perfTermGroup_'+openPerfTermGroup).classList.add('open');
    document.getElementById('perfTermGroupBtn_'+openPerfTermGroup).classList.add('expanded');
  }
}
function togglePerfCycleGroup(e, term, cycle){
  e.stopPropagation();
  const key = term+'_'+cycle;
  openPerfCycleGroup = (openPerfCycleGroup===key) ? null : key;
  // Only reset the cycle sub-groups belonging to the currently open term, so opening one
  // Cycle doesn't collapse the Term itself.
  document.querySelectorAll('#perfTermGroup_'+term+' .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#perfTermGroup_'+term+' .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  if(openPerfCycleGroup){
    document.getElementById('perfCycleGroup_'+key).classList.add('open');
    document.getElementById('perfCycleGroupBtn_'+key).classList.add('expanded');
  }
}
function openPerfAlert(term, cycle, category){
  state.perfTerm = term;
  state.perfCycle = cycle;
  state.perfCategory = category;
  const menu = document.getElementById('perfMenu');
  if(menu) menu.classList.remove('open');
  document.querySelectorAll('#perfMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#perfMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  openPerfTermGroup = null;
  openPerfCycleGroup = null;
  switchView('perfAlerts');
}

/* ---------- Top Performance / At Risk: Cycle max helper ----------
   Grade 1 & 2 Primary record no Cycle scores at all. Grade 7-8 Prep and Grade 10-11
   Secondary use an extended Cycle scale (Max. 15); every other grade uses Max. 5. */
function perfIsJuniorClass(stage, grade){ return stage==='primary' && (grade==='g1' || grade==='g2'); }
function perfCycleMaxFor(stage, grade){
  const g78 = stage==='prep' && (grade==='g7' || grade==='g8');
  const g1011 = stage==='secondary' && (grade==='g10' || grade==='g11');
  return (g78 || g1011) ? 15 : 5;
}

/* Scans every Section/Stage/Grade/Class/Subject for the given Term + Cycle and returns every
   student who qualifies as Top Performance (>=95% of the max) or At Risk (<60% of the max) in
   at least one subject, together with the list of qualifying subjects. An optional `filter`
   (Section/Stage/Grade/Class, from the stepper above the table) narrows the scan to a single
   Grade — or a single Class within that Grade, when a specific Class is picked.
   `cycle` is 'cycle1' / 'cycle2' (Cycle score, Max. 5 or 15 depending on stage/grade — see
   perfCycleMaxFor) OR 'exam' (that Term's Total — Total Coursework + Exam Paper, always out of
   100 — used by the "First Term Exam" / "Second Term Exam" filters). `category` is 'top' / 'risk'
   for Cycle mode, and 'top' / 'risk' / 'critical' for Exam mode: Top >=95%, At Risk <60%,
   Critical <50% of the Term Total. Grade 1 & 2 Primary (junior) record no Cycle scores and no
   numeric Exam Paper, so they're skipped for both modes, same as before. */
function computePerfAlertList(term, cycle, category, filter){
  filter = filter || {};
  const isExam = cycle==='exam';
  const field = cycle==='cycle2' ? 'm2Cycle' : 'm1Cycle';
  const resultMap = {};
  Object.keys(SECTIONS).forEach(section=>{
    if(filter.section && filter.section!==section) return;
    Object.keys(STAGES).forEach(stage=>{
      if(filter.stage && filter.stage!==stage) return;
      STAGES[stage].grades.forEach(g=>{
        const grade = g.id;
        if(filter.grade && filter.grade!==grade) return;
        if(perfIsJuniorClass(stage, grade)) return;
        const ck = `${section}|${stage}|${grade}`;
        let roster = visibleRoster(students[ck]);
        if(filter.term) roster = roster.filter(s=> s.classroom===filter.term);
        if(!roster.length) return;
        const max = isExam ? 100 : perfCycleMaxFor(stage, grade);
        const threshold = isExam
          ? (category==='critical' ? max*0.5 : category==='risk' ? max*0.6 : max*0.95)
          : (category==='risk' ? max*0.6 : max*0.95);
        getSubjectsForStageAndSection(stage, section).forEach(subject=>{
          const sk = `${ck}|${term}|${subject}`;
          const subjScores = scores[sk] || {};
          roster.forEach(s=>{
            const sc = subjScores[s.id];
            if(!sc) return;
            let v;
            if(isExam){
              // Term Total (Max. 100) = Total Coursework (computed from this subject's raw
              // fields, scale depends on stage/grade) + Exam Paper — mirrors the Report Card's
              // own Term Total math exactly (see the isG3G6ReportCardCert / isPrepG78ReportCardCert
              // certificate blocks). computePrimaryTotals() reads state.stage/state.grade, so we
              // briefly point global state at this student's Stage/Grade, same pattern as
              // withCertState() uses for certificates.
              const backup = { stage:state.stage, grade:state.grade };
              state.stage = stage; state.grade = grade;
              const t = computePrimaryTotals(sc);
              Object.assign(state, backup);
              const examVal = (sc.examPaper===null||sc.examPaper===undefined||sc.examPaper==='') ? 0 : (parseFloat(sc.examPaper)||0);
              v = t.totalCoursework + examVal;
            } else {
              v = parseFloat(sc[field]);
            }
            if(isNaN(v)) return;
            const qualifies = category==='top' ? (v >= threshold) : (v < threshold);
            if(!qualifies) return;
            if(!resultMap[s.id]){
              resultMap[s.id] = { id:s.id, displayId:s.displayId||'—', name:s.name, subjects:[], section, stage, grade, classroom:s.classroom||'' };
            }
            resultMap[s.id].subjects.push({ subject, score: v });
          });
        });
      });
    });
  });
  return Object.values(resultMap)
    .map(r=>({ ...r, count:r.subjects.length }))
    .sort((a,b)=> b.count-a.count || a.name.localeCompare(b.name));
}

const PERF_CATEGORY_LABELS = { top:'Top Performance Students', risk:'At Risk Students', critical:'Critical Students' };
const PERF_CYCLE_LABELS = { cycle1:'Cycle 1', cycle2:'Cycle 2' };
// "exam" means different things depending which Term it's under — First Term Exam (Term 1) vs
// Second Term Exam (Term 2) — so its label is resolved per-term rather than a flat lookup.
function perfCycleLabel(term, cycle){
  if(cycle==='exam') return term==='term2' ? 'Second Term Exam' : 'First Term Exam';
  return PERF_CYCLE_LABELS[cycle] || 'Cycle 1';
}

function renderPerfAlerts(){
  const { perfTerm:term, perfCycle:cycle, perfCategory:category } = state;
  const crumbs = document.getElementById('perfCrumbs');
  const termLabel = TERM_LABELS[term] || 'Term 1';
  const cycleLabel = perfCycleLabel(term, cycle);
  const catLabel = PERF_CATEGORY_LABELS[category] || 'Top Performance Students';
  if(crumbs) crumbs.innerHTML = `<span class="crumb subj">${termLabel}</span><span class="crumb subj">${cycleLabel}</span><span class="crumb subj">${catLabel}</span>`;
  const area = document.getElementById('perfTableArea');
  if(!area) return;
  if(!term || !cycle || !category){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">🎯</div><h3>Choose Term, Cycle &amp; Category</h3><p>Use the "Top &amp; At-Risk" menu above to pick a Term, then a Cycle, then Top Performance or At Risk Students.</p></div>`;
    return;
  }
  const filter = getPerfFilterState();
  if(!filter.section || !filter.stage || !filter.grade){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">🎓</div><h3>Choose a Section, Stage &amp; Grade</h3><p>Use the steps above to pick at least a Grade (Class is optional — leave it blank to scan the whole Grade).</p></div>`;
    return;
  }
  const scopeLabel = filter.term
    ? `${STAGES[filter.stage].grades.find(g=>g.id===filter.grade).label} • ${escapeXml(filter.term)}`
    : `${STAGES[filter.stage].grades.find(g=>g.id===filter.grade).label} (whole Grade)`;
  const list = computePerfAlertList(term, cycle, category, filter);
  // Students who ALSO qualify for the same category in the other Cycle of the same Term (within
  // the same filtered scope) get their whole row highlighted red. Only applies to the Cycle 1/2
  // filters — the Exam filter (First/Second Term Exam) has no paired "other Cycle" to compare against.
  const otherCycle = cycle==='cycle1' ? 'cycle2' : cycle==='cycle2' ? 'cycle1' : null;
  const otherIds = otherCycle ? new Set(computePerfAlertList(term, otherCycle, category, filter).map(r=>r.id)) : new Set();
  if(!list.length){
    const icon = category==='risk' ? '⚠' : category==='critical' ? '🚨' : '🌟';
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">${icon}</div><h3>No students found</h3><p>No students in ${scopeLabel} currently meet the ${escapeXml(catLabel)} criteria for ${escapeXml(termLabel)} • ${escapeXml(cycleLabel)}.</p></div>`;
    return;
  }
  const rows = list.map(r=>{
    const dup = otherIds.has(r.id);
    const subjectsHtml = r.subjects.map(su=> `${escapeXml(subjectWithIcon(su.subject))} (${Math.round(su.score*10)/10})`).join(', ');
    return `<tr${dup?' class="perf-dup-row"':''}>
      <td>${escapeXml(r.displayId)}</td>
      <td>${escapeXml(r.name)}</td>
      <td>${escapeXml(r.classroom || '—')}</td>
      <td>${subjectsHtml}</td>
      <td class="perf-count-cell">${r.count}</td>
    </tr>`;
  }).join('');
  area.innerHTML = `
    <div class="classbar" style="box-shadow:none;background:transparent;padding:0 0 10px;">
      <div class="classbar-crumbs"><span class="crumb">${escapeXml(scopeLabel)}</span></div>
      <div class="classbar-count">${list.length} student${list.length===1?'':'s'}</div>
    </div>
    <div class="table-card">
      <table>
        <thead><tr><th>ID</th><th>Student Name</th><th>Class</th><th>Subject(s)</th><th>Count</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${otherCycle ? `<p style="font-size:12px;color:var(--ink-soft);margin-top:8px;">Rows shaded red mark students who also appear in the ${escapeXml(catLabel)} list for the other Cycle in ${escapeXml(termLabel)}, within this same scope.</p>` : ''}`;
}

// Adds a "First Term Exam" item under Term 1 and a "Second Term Exam" item under Term 2 of the
// "Top & At-Risk" nav dropdown, each opening a 3-way Top Performance / At Risk / Critical submenu
// (see computePerfAlertList's 'exam' mode above). Built by cloning the existing Cycle 1
// button+submenu DOM nodes rather than hand-authoring new markup, so it automatically matches
// the dropdown's real styling/behavior without needing to touch the HTML file directly.
function injectPerfExamMenuItems(){
  ['term1','term2'].forEach(term=>{
    const key = term+'_exam';
    if(document.getElementById('perfCycleGroupBtn_'+key)) return; // already injected
    const templateBtn = document.getElementById('perfCycleGroupBtn_'+term+'_cycle1');
    const templateGroup = document.getElementById('perfCycleGroup_'+term+'_cycle1');
    const container = document.getElementById('perfTermGroup_'+term);
    if(!templateBtn || !templateGroup || !container) return; // menu not in the DOM yet

    const label = term==='term2' ? 'Second Term Exam' : 'First Term Exam';

    // Clone the "Cycle 1" group button and repoint it at the new Exam submenu.
    const groupBtn = templateBtn.cloneNode(true);
    groupBtn.id = 'perfCycleGroupBtn_'+key;
    groupBtn.classList.remove('selected','expanded');
    groupBtn.innerHTML = groupBtn.innerHTML.replace(/Cycle\s*1/i, label);
    groupBtn.onclick = (e)=> togglePerfCycleGroup(e, term, 'exam');
    container.appendChild(groupBtn);

    // Clone the Cycle 1 submenu (Top Performance / At Risk buttons), repoint them at 'exam',
    // then add a third "Critical" button (<50%) cloned from the At Risk button for matching style.
    const subgroup = templateGroup.cloneNode(true);
    subgroup.id = 'perfCycleGroup_'+key;
    subgroup.classList.remove('open');
    let riskBtnTemplate = null;
    subgroup.querySelectorAll('button').forEach(btn=>{
      btn.classList.remove('selected');
      const isRisk = /at\s*risk/i.test(btn.textContent);
      if(isRisk) riskBtnTemplate = btn;
      const cat = isRisk ? 'risk' : 'top';
      btn.onclick = (e)=>{ e.stopPropagation(); openPerfAlert(term, 'exam', cat); };
    });
    if(riskBtnTemplate){
      const criticalBtn = riskBtnTemplate.cloneNode(true);
      criticalBtn.textContent = 'Critical';
      criticalBtn.classList.remove('selected');
      criticalBtn.onclick = (e)=>{ e.stopPropagation(); openPerfAlert(term, 'exam', 'critical'); };
      subgroup.appendChild(criticalBtn);
    }
    container.appendChild(subgroup);
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', injectPerfExamMenuItems);
else injectPerfExamMenuItems();

const DASHBOARD_MODE_LABELS = { cycle1:'Cycle 1', cycle1vs2:'Cycle 1 Vs Cycle 2' };

function openDashboard(term, mode){
  state.dashboardTerm = term;
  state.dashboardMode = mode || 'cycle1';
  const menu = document.getElementById('dashboardMenu');
  if(menu) menu.classList.remove('open');
  document.querySelectorAll('#dashboardMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#dashboardMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  openDashTermGroup = null;
  switchView('dashboard');
}

function openExamsAnalysis(term, mode){
  state.examsTerm = term;
  state.examsMode = mode || 'cycle1';
  const menu = document.getElementById('examsMenu');
  if(menu) menu.classList.remove('open');
  document.querySelectorAll('#examsMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#examsMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  openExamsTermGroup = null;
  switchView('examsAnalysis');
}

function renderDashboard(){
  const label = TERM_LABELS[state.dashboardTerm] || 'Term 1';
  const modeLabel = DASHBOARD_MODE_LABELS[state.dashboardMode] || 'Cycle 1';
  const crumbs = document.getElementById('dashboardCrumbs');
  if(crumbs) crumbs.innerHTML = `<span class="crumb subj">${label}</span><span class="crumb subj">${modeLabel}</span>`;
  autoSelectDashboardChildForParent();
  renderDashboardChildSwitch();
  renderDashboardFilters();
  renderDashboardCharts();
}

/* True for a Parent/Student account linked to one or more specific children —
   used to swap the Section/Stage/Grade/Class/Student steppers out for the
   simpler "just show my child" experience across the Dashboard. */
function isLinkedParentViewer(){
  if(!currentUser || currentUser.role!=='parent' || !currentUser.effective) return false;
  const scope = currentUser.effective.studentScope;
  return Array.isArray(scope) && scope.length>0;
}

/* A linked Parent/Student account never needs to walk the Section -> Stage ->
   Grade -> Class -> Student stepper themselves — auto-scope the Dashboard
   straight to their child (the first child, alphabetically, for accounts
   linked to more than one; renderDashboardChildSwitch lets them pick a
   sibling afterwards). Only fires when nothing valid is already selected, so
   it never overrides a sibling the parent has already switched to. */
function autoSelectDashboardChildForParent(){
  if(!isLinkedParentViewer()) return;
  if(state.dashboardStudent && scopeStudentAllowed(state.dashboardStudent)) return;
  const scope = currentUser.effective.studentScope;
  const flat = allStudentsFlatRaw();
  const first = scope.map(id=> flat.find(s=> s.id===id)).filter(Boolean).sort((a,b)=> a.name.localeCompare(b.name))[0];
  if(!first) return;
  state.dashboardSection = first.section || null;
  state.dashboardStage = first.stage || null;
  state.dashboardGrade = first.grade || null;
  state.dashboardClassroom = first.classroom || null;
  state.dashboardStudent = first.id;
}

/* ---------- Cycle Dashboard: linked-children quick switch ----------
   Parents/students linked to more than one child (siblings) get a small
   row of tappable tabs above the stepper so they can jump straight to a
   sibling's dashboard instead of re-walking Section -> Stage -> Grade ->
   Class -> Student every time. Only rendered when the account is scoped
   to 2+ students (currentUser.effective.studentScope). */
function getLinkedDashboardChildren(){
  if(!currentUser || !currentUser.effective) return [];
  const scope = currentUser.effective.studentScope;
  if(!Array.isArray(scope) || scope.length < 2) return [];
  const flat = allStudentsFlatRaw();
  return scope
    .map(id=> flat.find(s=> s.id===id))
    .filter(Boolean)
    .sort((a,b)=> a.name.localeCompare(b.name));
}

function renderDashboardChildSwitch(){
  const wrap = document.getElementById('dashboardChildSwitch');
  if(!wrap) return;
  const children = getLinkedDashboardChildren();
  if(!children.length){ wrap.innerHTML = ''; return; }
  const options = children.map(c=>{
    const gradeObj = STAGES[c.stage] ? STAGES[c.stage].grades.find(g=>g.id===c.grade) : null;
    const gradeLabel = gradeObj ? gradeObj.label : (c.grade||'');
    const sub = [gradeLabel, c.classroom].filter(Boolean).join(' · ');
    return `<option value="${c.id}" ${state.dashboardStudent===c.id?'selected':''}>${escapeHtml(c.name)}${sub?` (${sub})`:''}</option>`;
  }).join('');
  wrap.innerHTML = `<div class="db-children-switch"><span class="dcs-label">My children:</span><select onchange="selectDashboardChild(this.value)">${options}</select></div>`;
}

function selectDashboardChild(studentId){
  const flat = allStudentsFlatRaw();
  const s = flat.find(x=> x.id===studentId);
  if(!s) return;
  state.dashboardSection = s.section || null;
  state.dashboardStage = s.stage || null;
  state.dashboardGrade = s.grade || null;
  state.dashboardClassroom = s.classroom || null;
  state.dashboardStudent = s.id;
  renderDashboard();
}

/* ---------- Certificates: linked-children quick switch (parents w/ multiple kids) ----------
   Same idea as the Dashboard's sibling switcher above: a Parent/Student account linked to
   2+ children gets a row of tappable tabs above the Certificates stepper so they can jump
   straight to a sibling's report card instead of re-walking the Term/Section/Stage/Grade/
   Class stepper every time. Only rendered when the account is scoped to 2+ students. */
function getLinkedCertChildren(){
  if(!currentUser || !currentUser.effective) return [];
  const scope = currentUser.effective.studentScope;
  if(!Array.isArray(scope) || scope.length < 2) return [];
  const flat = allStudentsFlatRaw();
  return scope
    .map(id=> flat.find(s=> s.id===id))
    .filter(Boolean)
    .sort((a,b)=> a.name.localeCompare(b.name));
}

function renderCertChildSwitch(){
  const wrap = document.getElementById('certChildSwitch');
  if(!wrap) return;
  const children = getLinkedCertChildren();
  if(!children.length){ wrap.innerHTML = ''; return; }
  const options = children.map(c=>{
    const gradeObj = STAGES[c.stage] ? STAGES[c.stage].grades.find(g=>g.id===c.grade) : null;
    const gradeLabel = gradeObj ? gradeObj.label : (c.grade||'');
    const sub = [gradeLabel, c.classroom].filter(Boolean).join(' · ');
    return `<option value="${c.id}" ${certState.studentId===c.id?'selected':''}>${escapeHtml(c.name)}${sub?` (${sub})`:''}</option>`;
  }).join('');
  wrap.innerHTML = `<div class="db-children-switch"><span class="dcs-label">My children:</span><select onchange="selectCertChild(this.value)">${options}</select></div>`;
}

function selectCertChild(studentId){
  const flat = allStudentsFlatRaw();
  const s = flat.find(x=> x.id===studentId);
  if(!s) return;
  certParentSelectedStudentId = s.id;
  certState.section = s.section || null;
  certState.stage = s.stage || null;
  certState.grade = s.grade || null;
  certState.term = s.classroom || null;
  certState.studentId = s.id;
  renderCertReportsStepper();
  renderCertReportsWorkspace();
}

/* ---------- Cycle Dashboard: filters ---------- */
function renderDashboardFilters(){
  const wrap = document.getElementById('dashboardFilters');
  if(!wrap) return;
  if(isLinkedParentViewer()){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const sectionOpts = Object.keys(SECTIONS)
    .filter(k=>scopeSectionAllowed(k))
    .map(k=>`<option value="${k}" ${state.dashboardSection===k?'selected':''}>${SECTIONS[k].label}</option>`).join('');
  const stageOpts = Object.keys(STAGES)
    .filter(k=>scopeStageAllowed(k))
    .map(k=>`<option value="${k}" ${state.dashboardStage===k?'selected':''}>${STAGES[k].label}</option>`).join('');
  const gradeOpts = state.dashboardStage ? STAGES[state.dashboardStage].grades.map(g=>`<option value="${g.id}" ${state.dashboardGrade===g.id?'selected':''}>${g.label}</option>`).join('') : '';

  let classOpts = '', studentOpts = '';
  const classReady = state.dashboardSection && state.dashboardStage && state.dashboardGrade;
  if(classReady){
    const ck = `${state.dashboardSection}|${state.dashboardStage}|${state.dashboardGrade}`;
    // A Parent/Student account linked to a specific child is NOT restricted by
    // section/stage/classroom (those scopes are null for linked parents — see
    // getEffectivePermissions), so studentScope is the ONLY thing standing between
    // this list and every other student's grades. Never drop this filter.
    const roster = visibleRoster(students[ck]).filter(s=>scopeStudentAllowed(s.id));
    const classes = getClassesInGrade({ section: state.dashboardSection, stage: state.dashboardStage, grade: state.dashboardGrade })
      .filter(c=>scopeClassroomAllowed(c));
    classOpts = classes.map(c=>`<option value="${String(c).replace(/"/g,'&quot;')}" ${state.dashboardClassroom===c?'selected':''}>${c}</option>`).join('');
    const filtered = roster.filter(s=> !state.dashboardClassroom || (s.classroom||'').trim()===state.dashboardClassroom)
      .slice().sort((a,b)=>a.name.localeCompare(b.name));
    studentOpts = filtered.length
      ? filtered.map(s=>`<option value="${s.id}" ${state.dashboardStudent===s.id?'selected':''}>${s.name}${s.classroom?` (${s.classroom})`:''}</option>`).join('')
      : `<option value="" disabled>No students found for this class</option>`;
  }

  wrap.innerHTML = `
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Section</label>
      <select id="dbfSection" onchange="setDashboardFilter('section',this.value)">
        <option value="">— Select —</option>${sectionOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Stage</label>
      <select id="dbfStage" onchange="setDashboardFilter('stage',this.value)">
        <option value="">— Select —</option>${stageOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Grade</label>
      <select id="dbfGrade" onchange="setDashboardFilter('grade',this.value)" ${state.dashboardStage?'':'disabled'}>
        <option value="">— Select —</option>${gradeOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Class</label>
      <select id="dbfClassroom" onchange="setDashboardFilter('classroom',this.value)" ${classReady?'':'disabled'}>
        <option value="">All</option>${classOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Student</label>
      <select id="dbfStudent" onchange="setDashboardFilter('student',this.value)" ${classReady?'':'disabled'}>
        <option value="">— Select a student —</option>${studentOpts}
      </select>
    </div>`;
}

function setDashboardFilter(kind, value){
  if(kind==='section') state.dashboardSection = value || null;
  if(kind==='stage'){ state.dashboardStage = value || null; state.dashboardGrade = null; state.dashboardClassroom=null; state.dashboardStudent=null; }
  if(kind==='grade'){ state.dashboardGrade = value || null; state.dashboardClassroom=null; state.dashboardStudent=null; }
  if(kind==='classroom'){ state.dashboardClassroom = value || null; state.dashboardStudent=null; }
  if(kind==='student') state.dashboardStudent = value || null;
  renderDashboardChildSwitch();
  renderDashboardFilters();
  renderDashboardCharts();
}

/* ---------- Cycle Dashboard: data ---------- */
function computeCycleStats(section, stage, grade, term, studentId){
  const junior = stage==='primary' && (grade==='g1' || grade==='g2');
  const subjects = getSubjectsForStageAndSection(stage, section);
  const ck = `${section}|${stage}|${grade}`;
  const roster = visibleRoster(students[ck]);
  // Defense in depth: even if a stale/tampered studentId ever reaches this function,
  // never compute or return another student's grades to an account that isn't
  // scoped to see them (e.g. a linked Parent account viewing a classmate).
  const student = (studentId && scopeStudentAllowed(studentId)) ? roster.find(s=>s.id===studentId) : null;
  if(junior || !roster.length || !student){
    return { junior, empty: !roster.length, noStudent: !student, perSubject: [] };
  }
  const perSubject = subjects.map(subject=>{
    const sk = `${ck}|${term}|${subject}`;
    const subjScores = scores[sk] || {};
    const classVals1 = [], classVals2 = [];
    roster.forEach(s=>{
      const sc = subjScores[s.id];
      if(!sc) return;
      const cv1 = parseFloat(sc.m1Cycle), cv2 = parseFloat(sc.m2Cycle);
      if(!isNaN(cv1)) classVals1.push(cv1);
      if(!isNaN(cv2)) classVals2.push(cv2);
    });
    const classAvg1 = classVals1.length ? classVals1.reduce((a,b)=>a+b,0)/classVals1.length : null;
    const classAvg2 = classVals2.length ? classVals2.reduce((a,b)=>a+b,0)/classVals2.length : null;
    const mySc = subjScores[studentId];
    const v1 = mySc ? parseFloat(mySc.m1Cycle) : NaN;
    const v2 = mySc ? parseFloat(mySc.m2Cycle) : NaN;
    // Weekly Q.1–Q.4 breakdown (the four short quizzes that feed into each month's
    // average) — kept alongside the cycle totals so the dashboard can show a
    // mini bar/sparkline per subject instead of only the final rolled-up score.
    const maxima = g3MaximaFor(sk) || {};
    const w1 = (mySc ? [mySc.m1E1, mySc.m1E2, mySc.m1E3, mySc.m1E4] : [null,null,null,null])
      .map(v=>{ const n = parseFloat(v); return isNaN(n) ? null : n; });
    const w2 = (mySc ? [mySc.m2E1, mySc.m2E2, mySc.m2E3, mySc.m2E4] : [null,null,null,null])
      .map(v=>{ const n = parseFloat(v); return isNaN(n) ? null : n; });
    const m1Max = [maxima.m1E1Max, maxima.m1E2Max, maxima.m1E3Max, maxima.m1E4Max]
      .map(m=> isMaxSet(m) ? parseFloat(m) : 5);
    const m2Max = [maxima.m2E1Max, maxima.m2E2Max, maxima.m2E3Max, maxima.m2E4Max]
      .map(m=> isMaxSet(m) ? parseFloat(m) : 5);
    return {
      subject,
      v1: isNaN(v1)?null:v1, v2: isNaN(v2)?null:v2,
      classAvg1, classAvg2,
      hasV1: !isNaN(v1), hasV2: !isNaN(v2),
      m1Weekly: w1, m2Weekly: w2, m1WeeklyMax: m1Max, m2WeeklyMax: m2Max
    };
  });
  return { junior:false, empty:false, noStudent:false, student, perSubject };
}

const CYCLE_MAX = 5;
/* The "Target / Success Line" drawn on charts. Set to match the existing
   Weak (<2) vs Acceptable (2+) band boundary already used for Cycle scores,
   so the visual target line stays consistent with the color-coded bands
   elsewhere in this dashboard. Adjust here if the school's pass mark changes. */
const CYCLE_PASS_MARK = 2;
const CYCLE_PASS_LABEL = 'Pass Mark';
/* Thresholds for the "Strengths & Alerts" narrative card: how large a gap
   (vs. class average, or vs. the previous cycle) counts as notable enough
   to call out by name, rather than just normal variation. */
const STRENGTH_MARGIN = 0.4;
const ALERT_MARGIN = 0.4;
/* Flat, absolute threshold (independent of class average or previous cycle)
   for the top-of-page "Needs immediate attention" banner — any subject whose
   current score falls below this is flagged right away, so a parent isn't
   left to spot it themselves further down in the tables/charts. */
const CYCLE_ATTENTION_THRESHOLD = 2.5;
const CYCLE_BANDS = [
  { key:'excellent', label:'Excellent (4.5–5)', color:'#2F6F4E', test:v=>v>=4.5 },
  { key:'verygood',  label:'Very Good (4–4.49)', color:'#2A5C99', test:v=>v>=4 && v<4.5 },
  { key:'good',      label:'Good (3–3.99)',      color:'#C9A227', test:v=>v>=3 && v<4 },
  { key:'accept',    label:'Acceptable (2–2.99)', color:'#9C7C15', test:v=>v>=2 && v<3 },
  { key:'weak',      label:'Weak (below 2)',     color:'#B23A3A', test:v=>v<2 }
];

/* ================== Parent/Student Dashboard: motivational layer ==================
   Purely presentational, additive, and Parent/Student-only: an admin/teacher looking at
   the same Cycle Dashboard never sees any of this — they get the plain analytics as
   before. None of it touches scores/students storage; the "since last visit" snapshot
   lives in localStorage under the parent's own username, so it stays private per device
   and never needs a backend round-trip. */
function isParentDashboardViewer(){ return !!(currentUser && currentUser.role==='parent'); }

function cycleBandOf(v){ return CYCLE_BANDS.find(b=>b.test(v)) || null; }

function computeSimpleAvg(vals){ return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null; }

/* Badge: 🏆 for a clear, meaningful jump between Cycle 1 and Cycle 2; ⭐ for staying in
   the Excellent band consistently (either across most subjects in a single cycle, or in
   both cycles when comparing). Returns null when neither is earned — no badge is better
   than a hollow one. */
function getMotivationBadge(mode, perSubject){
  if(mode==='cycle1vs2'){
    const both = perSubject.filter(p=>p.hasV1 && p.hasV2);
    if(!both.length) return null;
    const a1 = computeSimpleAvg(both.map(p=>p.v1));
    const a2 = computeSimpleAvg(both.map(p=>p.v2));
    const diff = a2 - a1;
    if(diff >= 0.3) return { icon:'🏆', label:'Most Improved' };
    if(a1>=4.5 && a2>=4.5) return { icon:'⭐', label:'Excellent Consistency' };
    return null;
  }
  const withV1 = perSubject.filter(p=>p.hasV1);
  if(!withV1.length) return null;
  const excellentCount = withV1.filter(p=> cycleBandOf(p.v1) && cycleBandOf(p.v1).key==='excellent').length;
  if(excellentCount === withV1.length && withV1.length>=2) return { icon:'⭐', label:'Excellent Consistency' };
  if(excellentCount >= Math.ceil(withV1.length*0.6) && withV1.length>=2) return { icon:'🏆', label:'Strong Performance' };
  return null;
}

/* Encouragement message: always framed positively, even (especially) for a Weak band —
   the goal is to make the Dashboard feel like a source of motivation for the student, not
   just a monitoring tool for the parent. */
function getEncouragementMessage(band, weakestSubjects){
  const weakest = (weakestSubjects && weakestSubjects.length) ? weakestSubjects[0] : null;
  switch(band && band.key){
    case 'excellent':
      return { icon:'🌟', text:'Outstanding work! This is an excellent, well-rounded performance — keep celebrating the effort behind it.' };
    case 'verygood':
      return { icon:'👏', text:'Great job! This is very strong performance — just a little more consistency to reach the very top.' };
    case 'good':
      return { icon:'💪', text:`Solid, steady progress! A bit more focus${weakest?` on ${weakest}`:''} could push things even higher next cycle.` };
    case 'accept':
      return { icon:'🙂', text:`A comfortable pass — with a steady push${weakest?` in ${weakest}`:''}, the next cycle can look noticeably better.` };
    case 'weak':
      return { icon:'🌱', text:`Every strong result starts with a first step. There's real room to grow${weakest?`, especially in ${weakest}`:''} — a little steady effort now will show up fast. We're here to help along the way.` };
    default:
      return null;
  }
}

/* "Since your last visit" — compares this render's per-subject values against the last
   snapshot this same parent account saved for this exact student/term/mode, then stores
   the new snapshot. First-ever visit has nothing to compare against, so it stays silent. */
function parentDashSnapshotKey(section, stage, grade, studentId, term, mode){
  const who = currentUser ? currentUser.username : 'anon';
  return `parentDashSnap_v1__${who}__${section}|${stage}|${grade}|${studentId}|${term}|${mode}`;
}
function loadParentDashSnapshot(key){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }catch(err){ return null; }
}
function saveParentDashSnapshot(key, perSubject, mode){
  try{
    const data = {};
    perSubject.forEach(p=>{ data[p.subject] = mode==='cycle1vs2' ? p.v2 : p.v1; });
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), values: data }));
  }catch(err){}
}
function renderSinceLastVisit(section, stage, grade, studentId, term, mode, perSubject){
  const key = parentDashSnapshotKey(section, stage, grade, studentId, term, mode);
  const prev = loadParentDashSnapshot(key);
  saveParentDashSnapshot(key, perSubject, mode);
  if(!prev || !prev.values) return '';

  let improved = [], declined = [];
  perSubject.forEach(p=>{
    const cur = mode==='cycle1vs2' ? p.v2 : p.v1;
    if(cur===null || cur===undefined) return;
    const prevVal = prev.values[p.subject];
    if(prevVal===null || prevVal===undefined) return;
    if(cur > prevVal) improved.push(p.subject);
    else if(cur < prevVal) declined.push(p.subject);
  });
  if(!improved.length && !declined.length) return '';

  const parts = [];
  if(improved.length) parts.push(`improved in <b>${improved.length}</b> subject${improved.length>1?'s':''} (${escapeHtml(improved.join(', '))})`);
  if(declined.length) parts.push(`dipped in <b>${declined.length}</b> subject${declined.length>1?'s':''} (${escapeHtml(declined.join(', '))})`);
  return `<div class="db-lastvisit-card"><span class="db-enc-icon">🔄</span><span>Since your last visit, your child's performance ${parts.join(' and ')}.</span></div>`;
}

/* Assembles the full motivational block (badge is returned separately so it can sit
   inline in the name banner; message + since-last-visit render as their own cards). */
function renderParentMotivationCards(mode, perSubject, band, weakestSubjects, section, stage, grade, studentId, term){
  let html = renderSinceLastVisit(section, stage, grade, studentId, term, mode, perSubject);
  const enc = getEncouragementMessage(band, weakestSubjects);
  if(enc) html += `<div class="db-encourage-card"><span class="db-enc-icon">${enc.icon}</span><span class="db-enc-text">${enc.text}</span></div>`;
  return html;
}

function renderDashboardCharts(){
  const area = document.getElementById('dashboardChartsArea');
  if(!area) return;
  const { dashboardSection:section, dashboardStage:stage, dashboardGrade:grade, dashboardTerm:term, dashboardMode:mode, dashboardStudent:studentId } = state;
  if(!section || !stage || !grade){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">📈</div><h3>Choose a class</h3><p>Select the Section, Stage and Grade above to view the Cycle 1 analysis.</p></div>`;
    return;
  }
  const preStats = computeCycleStats(section, stage, grade, term, studentId);
  if(preStats.junior){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">ℹ️</div><h3>Not applicable</h3><p>Cycle scores are not recorded for Grade 1 &amp; Grade 2 Primary.</p></div>`;
    return;
  }
  if(preStats.empty){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">ℹ️</div><h3>No students</h3><p>There are no students registered for this class yet.</p></div>`;
    return;
  }
  if(!studentId){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">🎓</div><h3>Choose a student</h3><p>Select the Classroom (optional) and Student above to view their Cycle analysis across all subjects.</p></div>`;
    return;
  }
  const stats = preStats;
  const withData = stats.perSubject.filter(p=> p.hasV1 || p.hasV2);
  if(!withData.length){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">ℹ️</div><h3>No Cycle marks yet</h3><p>No Cycle scores have been entered for <b>${escapeXml(stats.student.name)}</b> in ${TERM_LABELS[term]||'this term'}.</p></div>`;
    return;
  }

  const isParent = isParentDashboardViewer();
  const badge = isParent ? getMotivationBadge(mode, withData) : null;
  const badgeHtml = badge ? `<span class="db-motivation-badge">${badge.icon} ${badge.label}</span>` : '';
  const nameBanner = `<div class="db-student-banner"><span class="seal-lg" style="width:38px;height:38px;font-size:16px;">🎓</span><div><div class="db-student-name">${escapeXml(stats.student.name)}</div><div class="db-student-meta">${STAGES[stage].grades.find(g=>g.id===grade).label} • ${SECTIONS[section].label}${stats.student.classroom?' • '+escapeXml(stats.student.classroom):''}</div></div>${badgeHtml}</div>`;

  let motivationHtml = '';
  if(isParent){
    const curVals = withData.map(p=> mode==='cycle1vs2' ? (p.hasV2?p.v2:p.v1) : p.v1).filter(v=>v!==null && v!==undefined && !isNaN(v));
    const avg = computeSimpleAvg(curVals);
    const band = avg!==null ? cycleBandOf(avg) : null;
    const minV = curVals.length ? Math.min(...curVals) : null;
    const weakestSubjects = minV===null ? [] : withData.filter(p=>{ const cv = mode==='cycle1vs2' ? (p.hasV2?p.v2:p.v1) : p.v1; return cv===minV; }).map(p=>p.subject);
    motivationHtml = renderParentMotivationCards(mode, withData, band, weakestSubjects, section, stage, grade, studentId, term);
  }

  if(mode==='cycle1vs2'){
    area.innerHTML = renderAttentionBanner(mode, withData) + nameBanner + motivationHtml + renderCycleCompareView(stats.perSubject);
  } else {
    area.innerHTML = renderAttentionBanner(mode, withData) + nameBanner + motivationHtml + renderCycle1View(stats.perSubject, section, stage, grade, term, studentId);
  }
  animateDashboardStatNumbers(area);
}

/* Animated count-up for the "db-stat-num" cards (Student's Average, Subjects Recorded,
   Change, Subjects Compared, etc.). Reads the target value/suffix out of the number
   already written into the cell (so no call sites need to change), then re-runs the
   count from 0 (or from the starting sign for +/- deltas) using requestAnimationFrame.
   Respects prefers-reduced-motion by just leaving the static text in place. */
function animateDashboardStatNumbers(container){
  if(!container) return;
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.querySelectorAll('.db-stat-num').forEach(el=>{
    const smallEl = el.querySelector('small');
    const suffix = smallEl ? smallEl.outerHTML : '';
    const rawText = (el.childNodes[0] && el.childNodes[0].textContent || el.textContent || '').trim();
    const match = rawText.match(/^([+-]?)(\d+(?:\.\d+)?)$/);
    if(!match){ return; } // non-numeric stat (leave as-is)
    const sign = match[1] === '-' ? -1 : 1;
    const target = parseFloat(match[2]) * (match[1]==='-'?-1:1);
    const decimals = (match[2].split('.')[1]||'').length;
    if(prefersReduced){ return; }
    const duration = 650;
    const startTime = performance.now();
    function tick(now){
      const p = Math.min(1, (now-startTime)/duration);
      const eased = 1 - Math.pow(1-p, 3);
      const val = target * eased;
      const shown = (val>=0 && match[1]==='+' ? '+' : '') + val.toFixed(decimals);
      el.innerHTML = shown + suffix;
      if(p<1) requestAnimationFrame(tick);
      else el.innerHTML = rawText + suffix;
    }
    requestAnimationFrame(tick);
  });
}

function renderCycle1View(perSubject, section, stage, grade, term, studentId){
  const withData = perSubject.filter(p=>p.hasV1);
  const bars = withData.map(p=>({ label:p.subject, values:[p.v1, p.classAvg1] }));
  const barSvg = svgGroupedBarChart(bars, CYCLE_MAX, ['Student','Class Average'], ['var(--blue)','var(--gold)']);
  const radarSvg = svgRadarChart(bars, CYCLE_MAX, ['Student','Class Average'], ['var(--blue)','var(--gold)']);

  const bandCounts = CYCLE_BANDS.map(b=>({ ...b, count: withData.filter(p=>b.test(p.v1)).length }));
  const pieSvg = svgPieChart(bandCounts.map(b=>({ label:b.label, value:b.count, color:b.color })));

  const vals = withData.map(p=>p.v1);
  const overallAvg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;

  return `
    <div class="db-summary-row">
      <div class="db-stat-card"><div class="db-stat-num">${overallAvg.toFixed(2)}<small>/5</small></div><div class="db-stat-label">Student's Average</div></div>
      <div class="db-stat-card"><div class="db-stat-num">${vals.length}</div><div class="db-stat-label">Subjects Recorded</div></div>
    </div>
    ${renderStrengthAlertCard('cycle1', perSubject)}
    ${renderSubjectTrendTable(perSubject, 'cycle1', section, stage, grade, term, studentId)}
    <div class="db-charts-grid">
      <div class="db-chart-card">
        <h4>Cycle 1 — Student vs Class Average (Max 5)</h4>
        ${barSvg}
      </div>
      <div class="db-chart-card">
        <h4>Performance Distribution Across Subjects</h4>
        ${pieSvg}
        ${legendHtml(bandCounts)}
      </div>
      <div class="db-chart-card db-chart-full">
        <h4>🕸️ Subject Balance (Radar) — Student vs Class Average</h4>
        ${radarSvg}
      </div>
    </div>`;
}

function renderCycleCompareView(perSubject){
  const withData = perSubject.filter(p=>p.hasV1 || p.hasV2);
  const bars = withData.map(p=>({ label:p.subject, values:[p.v1, p.v2] }));
  const barSvg = svgGroupedBarChart(bars, CYCLE_MAX, ['Cycle 1','Cycle 2'], ['var(--blue)','var(--gold)']);
  const radarSvg = svgRadarChart(bars, CYCLE_MAX, ['Cycle 1','Cycle 2'], ['var(--blue)','var(--gold)']);

  let improved=0, same=0, declined=0;
  withData.forEach(p=>{
    if(p.hasV1 && p.hasV2){
      if(p.v2>p.v1) improved++;
      else if(p.v2<p.v1) declined++;
      else same++;
    }
  });
  const total = improved+same+declined;
  const pieData = [
    { label:'Improved', value:improved, color:'#2F6F4E' },
    { label:'Same', value:same, color:'#C9A227' },
    { label:'Declined', value:declined, color:'#B23A3A' }
  ];
  const pieSvg = svgPieChart(pieData);

  const v1All = withData.filter(p=>p.hasV1).map(p=>p.v1);
  const v2All = withData.filter(p=>p.hasV2).map(p=>p.v2);
  const a1 = v1All.length? v1All.reduce((a,b)=>a+b,0)/v1All.length : 0;
  const a2 = v2All.length? v2All.reduce((a,b)=>a+b,0)/v2All.length : 0;
  const diff = a2 - a1;

  return `
    <div class="db-summary-row">
      <div class="db-stat-card"><div class="db-stat-num">${a1.toFixed(2)}<small>/5</small></div><div class="db-stat-label">Cycle 1 Average</div></div>
      <div class="db-stat-card"><div class="db-stat-num">${a2.toFixed(2)}<small>/5</small></div><div class="db-stat-label">Cycle 2 Average</div></div>
      <div class="db-stat-card" style="color:${diff>=0?'var(--green)':'var(--red)'}"><div class="db-stat-num">${diff>=0?'+':''}${diff.toFixed(2)}</div><div class="db-stat-label">Change</div></div>
      <div class="db-stat-card"><div class="db-stat-num">${total}</div><div class="db-stat-label">Subjects Compared</div></div>
    </div>
    ${renderStrengthAlertCard('cycle1vs2', perSubject)}
    ${renderSubjectTrendTable(perSubject, 'cycle1vs2')}
    <div class="db-charts-grid">
      <div class="db-chart-card">
        <h4>Cycle 1 vs Cycle 2 per Subject (Max 5)</h4>
        ${barSvg}
      </div>
      <div class="db-chart-card">
        <h4>Progress: Cycle 1 → Cycle 2</h4>
        ${pieSvg}
        ${legendHtml(pieData)}
      </div>
      <div class="db-chart-card db-chart-full">
        <h4>🕸️ Subject Balance (Radar) — Cycle 1 vs Cycle 2</h4>
        ${radarSvg}
      </div>
    </div>`;
}

/* ================== Per-subject Trend Indicator ==================
   Shows ▲/▼/– next to each subject comparing the student's CURRENT cycle
   score against the PREVIOUS cycle/period for that same subject — distinct
   from the Class Average column, which stays as a separate, non-competitive
   reference point (no classmate names or rankings are ever shown). */

/* For "Cycle 1" view (single-cycle mode), the "previous period" is the last
   recorded cycle of the prior term (Term 2's Cycle 1 vs Term 1's Cycle 2).
   Term 1's Cycle 1 has no earlier recorded period this school year, so it
   simply has no trend to show yet. */
function getPreviousPeriodCycleValue(section, stage, grade, term, subject, studentId){
  if(term !== 'term2') return null;
  const ck = `${section}|${stage}|${grade}`;
  const sk = `${ck}|term1|${subject}`;
  const subjScores = scores[sk] || {};
  const sc = subjScores[studentId];
  if(!sc) return null;
  const v = parseFloat(sc.m2Cycle);
  return isNaN(v) ? null : v;
}

function trendArrowHtml(current, previous){
  if(current===null || current===undefined || isNaN(current) || previous===null || previous===undefined || isNaN(previous)){
    return `<span class="db-trend db-trend-na">– <small>N/A</small></span>`;
  }
  const diff = current - previous;
  if(Math.abs(diff) < 0.01) return `<span class="db-trend db-trend-flat">– <small>0.00</small></span>`;
  if(diff > 0) return `<span class="db-trend db-trend-up">▲ <small>+${diff.toFixed(2)}</small></span>`;
  return `<span class="db-trend db-trend-down">▼ <small>${diff.toFixed(2)}</small></span>`;
}

/* Mini "Q.1 → Q.4" bar sparkline for a subject's weekly quiz scores, shown inline
   in the trend table instead of only the rolled-up cycle total. Each bar's height
   is scaled to that quiz's own maximum (quizzes can have different maxima), and
   missing quizzes render as a flat, greyed-out placeholder rather than being
   skipped, so the four positions always line up the same way across subjects. */
function renderQuarterMiniBars(values, maxima){
  if(!values || !values.some(v=>v!==null && v!==undefined)) {
    return `<span class="db-qbars-empty">—</span>`;
  }
  const bars = values.map((v,i)=>{
    const max = (maxima && maxima[i] && maxima[i]>0) ? maxima[i] : 5;
    const has = v!==null && v!==undefined && !isNaN(v);
    const ratio = has ? Math.min(1, v/max) : 0;
    const pct = has ? Math.max(6, Math.round(ratio*100)) : 100;
    let color;
    if(!has) color = 'var(--border)';
    else if(ratio>=0.8) color = 'var(--green)';
    else if(ratio>=0.6) color = 'var(--blue)';
    else if(ratio>=0.4) color = 'var(--amber)';
    else color = 'var(--red)';
    const label = has ? `Q${i+1}: ${v}/${max}` : `Q${i+1}: not entered yet`;
    return `<div class="db-qbar" title="${escapeXml(label)}"><div class="db-qbar-fill${has?'':' db-qbar-empty'}" style="height:${pct}%;background:${color}"></div></div>`;
  }).join('');
  return `<div class="db-qbars-wrap" aria-label="Weekly quiz scores, Q1 through Q4">${bars}</div>`;
}

/* mode: 'cycle1' -> current=Cycle1 this term, previous=prior term's last cycle.
   mode: 'cycle1vs2' -> current=Cycle2 (or Cycle1 if Cycle2 missing), previous=Cycle1. */
function renderSubjectTrendTable(perSubject, mode, section, stage, grade, term, studentId){
  const withData = perSubject.filter(p=>p.hasV1 || p.hasV2);
  if(!withData.length) return '';

  const rows = withData.map(p=>{
    let current, previous, classAvgForCurrent, weeklyVals, weeklyMax;
    if(mode==='cycle1vs2'){
      current = p.hasV2 ? p.v2 : (p.hasV1 ? p.v1 : null);
      previous = p.hasV2 ? (p.hasV1 ? p.v1 : null) : null;
      classAvgForCurrent = p.hasV2 ? p.classAvg2 : p.classAvg1;
      weeklyVals = p.hasV2 ? p.m2Weekly : p.m1Weekly;
      weeklyMax = p.hasV2 ? p.m2WeeklyMax : p.m1WeeklyMax;
    } else {
      current = p.hasV1 ? p.v1 : null;
      previous = getPreviousPeriodCycleValue(section, stage, grade, term, p.subject, studentId);
      classAvgForCurrent = p.classAvg1;
      weeklyVals = p.m1Weekly;
      weeklyMax = p.m1WeeklyMax;
    }
    return `
      <tr>
        <td>${escapeXml(p.subject)}</td>
        <td class="db-trend-current">${current!==null && current!==undefined && !isNaN(current) ? current.toFixed(2) : '—'}</td>
        <td>${trendArrowHtml(current, previous)}</td>
        <td class="db-trend-prev">${previous!==null && previous!==undefined && !isNaN(previous) ? previous.toFixed(2) : '—'}</td>
        <td class="db-trend-classavg">${classAvgForCurrent!==null && classAvgForCurrent!==undefined ? classAvgForCurrent.toFixed(2) : '—'}</td>
        <td class="db-trend-weekly">${renderQuarterMiniBars(weeklyVals, weeklyMax)}</td>
      </tr>`;
  }).join('');

  const noteText = mode==='cycle1vs2'
    ? 'Trend compares Cycle 2 to Cycle 1 for the same subject this term.'
    : (term==='term2'
        ? 'Trend compares this Cycle 1 to the last recorded cycle of Term 1.'
        : 'Trend will appear once a prior cycle is recorded for comparison.');

  return `
    <div class="db-chart-card" style="margin-bottom:18px;">
      <h4>📈 Per-Subject Trend</h4>
      <table class="db-trend-table">
        <thead>
          <tr><th>Subject</th><th>Current</th><th>Trend</th><th>Previous</th><th>Class Average</th><th>Weekly (Q1→Q4)</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="db-trend-note">${noteText}</p>
      <p class="db-trend-note">The four small bars per subject show that month's Q.1–Q.4 quiz scores, each scaled to its own maximum — a quick way to see whether a subject's total came from steady performance or one uneven week.</p>
    </div>`;
}

/* ================== Top-of-page "Needs immediate attention" banner ==================
   Unlike the Strengths & Alerts card (which compares against class average or
   the previous cycle), this is a flat, absolute check: any subject whose
   CURRENT score is below CYCLE_ATTENTION_THRESHOLD gets a red badge right at
   the top of the dashboard, so it's impossible to miss. */
function getAttentionSubjects(mode, perSubject){
  const flagged = [];
  perSubject.forEach(p=>{
    let score = null;
    if(mode==='cycle1vs2'){
      if(p.hasV2) score = p.v2; else if(p.hasV1) score = p.v1;
    } else if(p.hasV1){
      score = p.v1;
    }
    if(score!==null && score < CYCLE_ATTENTION_THRESHOLD) flagged.push({ subject:p.subject, score });
  });
  return flagged.sort((a,b)=>a.score-b.score);
}

function renderAttentionBanner(mode, perSubject){
  const flagged = getAttentionSubjects(mode, perSubject);
  if(!flagged.length) return '';
  const badges = flagged.map(f=>`<span class="db-attention-badge">🔴 ${escapeXml(f.subject)} <b>(${f.score.toFixed(1)}/${CYCLE_MAX})</b></span>`).join('');
  return `<div class="db-attention-banner"><span class="db-attention-label">🔴 Needs immediate attention:</span>${badges}</div>`;
}

/* ================== Strengths & Alerts narrative card ==================
   Turns the raw numbers into short, readable bullet lines instead of a bare
   "Best Subject" / "Weakest Subject" number, e.g.:
     ✅ Consistently strong in English (O.L & A.L) (4.6/5)
     ⚠️ Needs attention in Social Studies (2.0/5) — 0.8 pts below class average
   Related subjects that share a family name (e.g. "English O.L." and
   "English A.L.") are combined into a single line when both qualify, so the
   card stays short rather than repeating the same subject name twice. */
function groupSubjectNames(names){
  const groups = {};
  names.forEach(n=>{
    const parts = n.trim().split(' ');
    const first = parts[0];
    const rest = parts.slice(1).join(' ');
    if(!groups[first]) groups[first] = [];
    groups[first].push({ full:n, rest });
  });
  return Object.entries(groups).map(([first, arr])=>{
    const allHaveRest = arr.length>1 && arr.every(a=>a.rest);
    if(!allHaveRest){
      return arr.length===1
        ? { label:arr[0].full, members:arr.map(a=>a.full) }
        : { label: arr.map(a=>a.full).join(', '), members: arr.map(a=>a.full) };
    }
    const restLabels = arr.map(a=> a.rest.replace(/\.$/,'')).join(' & ');
    return { label: `${first} (${restLabels})`, members: arr.map(a=>a.full) };
  });
}

/* mode: 'cycle1' -> compares each subject's score against the class average.
   mode: 'cycle1vs2' -> compares Cycle 2 against Cycle 1 for the same subject
   (subjects need both cycles recorded to be judged, since a single reading
   can't show a trend). Either way, being below the Pass Mark is always
   flagged as an alert, even if the gap vs. the comparison point is small. */
function renderStrengthAlertCard(mode, perSubject){
  const relevant = perSubject.filter(p=> mode==='cycle1vs2' ? (p.hasV1 && p.hasV2) : p.hasV1);
  const candidates = [];
  relevant.forEach(p=>{
    if(mode==='cycle1vs2'){
      candidates.push({ subject:p.subject, score:p.v2, diff:p.v2-p.v1, belowPass:p.v2<CYCLE_PASS_MARK });
    } else {
      if(p.classAvg1===null || p.classAvg1===undefined) return;
      candidates.push({ subject:p.subject, score:p.v1, diff:p.v1-p.classAvg1, belowPass:p.v1<CYCLE_PASS_MARK });
    }
  });
  if(!candidates.length) return '';

  const strengthCandidates = candidates.filter(c=>c.diff>=STRENGTH_MARGIN).sort((a,b)=>b.diff-a.diff);
  const alertCandidates = candidates.filter(c=>c.diff<=-ALERT_MARGIN || c.belowPass)
    .sort((a,b)=> (a.belowPass!==b.belowPass) ? (a.belowPass?-1:1) : (a.diff-b.diff));

  const MAX_LINES = 2;
  function buildGroups(list, sortDesc){
    return groupSubjectNames(list.map(c=>c.subject)).map(g=>{
      const members = list.filter(c=> g.members.includes(c.subject));
      return {
        label: g.label,
        avgScore: members.reduce((a,c)=>a+c.score,0)/members.length,
        avgDiff: members.reduce((a,c)=>a+c.diff,0)/members.length,
        anyBelowPass: members.some(c=>c.belowPass)
      };
    }).sort((a,b)=>{
      if(sortDesc) return b.avgDiff-a.avgDiff;
      if(a.anyBelowPass !== b.anyBelowPass) return a.anyBelowPass ? -1 : 1;
      return a.avgDiff-b.avgDiff;
    });
  }

  const strengthGroups = buildGroups(strengthCandidates, true);
  const alertGroups = buildGroups(alertCandidates, false);

  let lines = '';
  strengthGroups.slice(0, MAX_LINES).forEach(g=>{
    const verb = mode==='cycle1vs2' ? 'Improving consistently' : 'Consistently strong';
    lines += `<div class="db-alert-line db-alert-strength">✅ ${verb} in <b>${escapeXml(g.label)}</b> (${g.avgScore.toFixed(1)}/5)</div>`;
  });
  if(strengthGroups.length > MAX_LINES){
    lines += `<p class="db-alert-more">+${strengthGroups.length-MAX_LINES} more subject(s) performing strongly</p>`;
  }
  alertGroups.slice(0, MAX_LINES).forEach(g=>{
    let reason;
    if(g.anyBelowPass) reason = `below the ${CYCLE_PASS_LABEL} (${CYCLE_PASS_MARK}/${CYCLE_MAX})`;
    else if(mode==='cycle1vs2') reason = `dropped ${Math.abs(g.avgDiff).toFixed(1)} pts since Cycle 1`;
    else reason = `${Math.abs(g.avgDiff).toFixed(1)} pts below class average`;
    lines += `<div class="db-alert-line db-alert-warning">⚠️ Needs attention in <b>${escapeXml(g.label)}</b> (${g.avgScore.toFixed(1)}/5) — ${reason}</div>`;
  });
  if(alertGroups.length > MAX_LINES){
    lines += `<p class="db-alert-more">+${alertGroups.length-MAX_LINES} more subject(s) need attention</p>`;
  }
  if(!lines){
    lines = `<div class="db-alert-line db-alert-neutral">➖ Performance is fairly even across subjects — no major gaps detected this period.</div>`;
  }

  return `
    <div class="db-alert-card">
      <h4>🎯 Strengths &amp; Alerts</h4>
      ${lines}
    </div>`;
}

function legendHtml(items){
  return `<div class="db-legend">${items.map(it=>`
    <div class="db-legend-item"><span class="db-legend-dot" style="background:${it.color}"></span>${it.label} — <b>${it.count!==undefined?it.count:it.value}</b></div>
  `).join('')}</div>`;
}

/* ================== EXAMS ANALYSIS (Score Range) ================== */
const EXAMS_MODE_LABELS = { cycle1:'Cycle 1', cycle2:'Cycle 2', finalexam:'First Term Exam Paper' };
// Term 2's "Final Exam" column is labelled "End-of-Year Exam Paper" instead of "First Term Exam Paper".
function getExamModeLabel(term, mode){
  if(mode==='finalexam') return term==='term2' ? 'End-of-Year Exam Paper' : 'First Term Exam Paper';
  return EXAMS_MODE_LABELS[mode] || mode;
}

// Which raw score field feeds each exam mode and which stages actually record that field.
// Cycle 1 / Cycle 2 only exist for the Primary Stage (non-junior grades). The First Term /
// End-of-Year Exam Paper is recorded once for the whole Grade via the "examPaper" Mark Entry
// screen, for every stage — its maximum grade is 60 for Primary and 30 for Prep/Secondary
// (same as examPaperMax() on the Grade Book screen), so max is resolved per-stage rather than
// being a single fixed number here.
const EXAM_FIELD_INFO = {
  cycle1:    { field:'m1Cycle',   max:5,                      appliesToStage: st => st==='primary' },
  cycle2:    { field:'m2Cycle',   max:5,                      appliesToStage: st => st==='primary' },
  finalexam: { field:'examPaper', max: st => st==='primary' ? 60 : 30, appliesToStage: st => true }
};

// Score-range bands used for the analysis table (percentage of each column's own maximum).
const SCORE_BANDS = [
  { label:'< 50%',  min:-Infinity, max:50,       bg:'#F8E9E9', fg:'#B23A3A' },
  { label:'50–60%', min:50,        max:60,       bg:'#FBF0DC', fg:'#B5791B' },
  { label:'60–70%', min:60,        max:70,       bg:'#E8EFF8', fg:'#2A5C99' },
  { label:'70–80%', min:70,        max:80,       bg:'#E7F1EB', fg:'#2F6F4E' },
  { label:'80–85%', min:80,        max:85,       bg:'#E4F3F3', fg:'#0E7C86' },
  { label:'85–90%', min:85,        max:90,       bg:'#EFE9F7', fg:'#6E4FA8' },
  { label:'90–95%', min:90,        max:95,       bg:'#FBF7D9', fg:'#9C8A12' },
  { label:'≥ 95%',  min:95,        max:Infinity, bg:'#1B2A4A', fg:'#FFFFFF' }
];
function bandIndexForPct(pct){
  for(let i=0;i<SCORE_BANDS.length;i++){
    const b = SCORE_BANDS[i];
    if(i===SCORE_BANDS.length-1){ if(pct>=b.min) return i; }
    else if(pct>=b.min && pct<b.max) return i;
  }
  return 0;
}

function renderExamsAnalysis(){
  const label = TERM_LABELS[state.examsTerm] || 'Term 1';
  const modeLabel = getExamModeLabel(state.examsTerm, state.examsMode) || 'Cycle 1';
  const crumbs = document.getElementById('examsCrumbs');
  if(crumbs) crumbs.innerHTML = `<span class="crumb subj">${label}</span><span class="crumb subj">${modeLabel}</span>`;
  renderExamsFilters();
  renderExamsTable();
}

/* ---------- Exams Analysis: filters ---------- */
function renderExamsFilters(){
  const wrap = document.getElementById('examsFilters');
  if(!wrap) return;
  const sectionOpts = Object.keys(SECTIONS)
    .filter(k=>scopeSectionAllowed(k))
    .map(k=>`<option value="${k}" ${state.examsSection===k?'selected':''}>${SECTIONS[k].label}</option>`).join('');
  const stageOpts = Object.keys(STAGES)
    .filter(k=>scopeStageAllowed(k))
    .map(k=>`<option value="${k}" ${state.examsStage===k?'selected':''}>${STAGES[k].label}</option>`).join('');
  const gradeOpts = state.examsStage ? STAGES[state.examsStage].grades.map(g=>`<option value="${g.id}" ${state.examsGrade===g.id?'selected':''}>${g.label}</option>`).join('') : '';

  let classOpts = '';
  const classReady = state.examsSection && state.examsStage && state.examsGrade;
  if(classReady){
    const classes = getClassesInGrade({ section: state.examsSection, stage: state.examsStage, grade: state.examsGrade })
      .filter(c=>scopeClassroomAllowed(c));
    classOpts = classes.map(c=>`<option value="${String(c).replace(/"/g,'&quot;')}" ${state.examsClassroom===c?'selected':''}>${c}</option>`).join('');
  }

  const subjectOpts = state.examsStage
    ? getSubjectsForStageAndSection(state.examsStage, state.examsSection).filter(s=>scopeSubjectAllowed(s)).map(s=>`<option value="${escapeXml(s)}" ${state.examsSubject===s?'selected':''}>${escapeHtml(s)}</option>`).join('')
    : '';

  wrap.innerHTML = `
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Section</label>
      <select id="exfSection" onchange="setExamsFilter('section',this.value)">
        <option value="">— Select —</option>${sectionOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Stage</label>
      <select id="exfStage" onchange="setExamsFilter('stage',this.value)">
        <option value="">— Select —</option>${stageOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Grade</label>
      <select id="exfGrade" onchange="setExamsFilter('grade',this.value)" ${state.examsStage?'':'disabled'}>
        <option value="">— Select —</option>${gradeOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Class</label>
      <select id="exfClassroom" onchange="setExamsFilter('classroom',this.value)" ${classReady?'':'disabled'}>
        <option value="">All classes</option>${classOpts}
      </select>
    </div>
    <div>
      <label style="display:block;font-size:12px;font-weight:700;color:var(--ink-soft);margin-bottom:4px;">Subject</label>
      <select id="exfSubject" onchange="setExamsFilter('subject',this.value)" ${state.examsStage?'':'disabled'}>
        <option value="">All Subjects</option>${subjectOpts}
      </select>
    </div>`;
}

function setExamsFilter(kind, value){
  if(kind==='section') state.examsSection = value || null;
  if(kind==='stage'){ state.examsStage = value || null; state.examsGrade = null; state.examsClassroom = null; state.examsSubject = null; }
  if(kind==='grade'){ state.examsGrade = value || null; state.examsClassroom = null; }
  if(kind==='classroom') state.examsClassroom = value || null;
  if(kind==='subject') state.examsSubject = value || null;
  renderExamsFilters();
  renderExamsTable();
}

/* ---------- Exams Analysis: data ---------- */
function computeExamsAnalysis(section, stage, grade, classroom, term, mode, subjectFilter){
  const info = EXAM_FIELD_INFO[mode];
  if(!info) return { invalid:true, reason:'Unknown exam type.' };
  if(!info.appliesToStage(stage)){
    return { invalid:true, reason: mode==='finalexam'
      ? 'Exam Paper scores are not recorded for this stage.'
      : 'Cycle scores are only recorded for Primary Stage subjects.' };
  }
  const junior = stage==='primary' && (grade==='g1' || grade==='g2');
  if(junior){
    return { invalid:true, reason:'Cycle scores are not recorded for Grade 1 & Grade 2 Primary.' };
  }
  const max = typeof info.max === 'function' ? info.max(stage) : info.max;
  const ck = `${section}|${stage}|${grade}`;
  let roster = visibleRoster(students[ck]);
  if(classroom) roster = roster.filter(s=> (s.classroom||'').trim() === classroom);
  if(!roster.length){
    return { invalid:true, reason:'There are no students registered for this class yet.' };
  }

  const allSubjects = getSubjectsForStageAndSection(stage, section);
  const subjects = subjectFilter ? allSubjects.filter(s=>s===subjectFilter) : allSubjects;
  const columns = [];
  subjects.forEach(subject=>{
    const sk = `${ck}|${term}|${subject}`;
    const subjScores = scores[sk] || {};
    const vals = [];
    roster.forEach(s=>{
      const sc = subjScores[s.id];
      if(!sc) return;
      const raw = sc[info.field];
      if(raw===null || raw===undefined || raw==='') return;
      const num = parseFloat(raw);
      if(isNaN(num)) return;
      vals.push(num);
    });
    // A subject with no recorded scores for this exam is left out of the analysis entirely.
    if(!vals.length) return;
    const bandCounts = SCORE_BANDS.map(()=>0);
    vals.forEach(v=>{
      const pct = (v/max)*100;
      bandCounts[bandIndexForPct(pct)]++;
    });
    columns.push({ subject, total:vals.length, bandCounts });
  });
  return { invalid:false, columns, max };
}

function renderExamsTable(){
  const area = document.getElementById('examsTableArea');
  if(!area) return;
  const { examsSection:section, examsStage:stage, examsGrade:grade, examsClassroom:classroom, examsTerm:term, examsMode:mode, examsSubject:subject } = state;

  if(!term || !mode){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">🧮</div><h3>Choose an exam</h3><p>Use the "Exams Analysis" menu above to choose a Term, then Cycle 1, Cycle 2, or First Term / End-of-Year Exam Paper.</p></div>`;
    return;
  }
  if(!section || !stage || !grade){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">📊</div><h3>Choose a class</h3><p>Select the Section, Stage and Grade above to view the ${escapeHtml(getExamModeLabel(term, mode))} score-range analysis.</p></div>`;
    return;
  }

  const result = computeExamsAnalysis(section, stage, grade, classroom, term, mode, subject);
  if(result.invalid){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">ℹ️</div><h3>Not applicable</h3><p>${escapeHtml(result.reason)}</p></div>`;
    return;
  }
  if(!result.columns.length){
    area.innerHTML = `<div class="empty-state"><div class="seal-lg">ℹ️</div><h3>No scores recorded yet</h3><p>No subject has ${escapeHtml(getExamModeLabel(term, mode))} scores recorded for this class yet.</p></div>`;
    return;
  }

  const subjHeaderCells = result.columns.map(c=>{
    const staffName = classroom
      ? findSubjectTeacherName(section, c.subject, classroom)
      : findHodName(section, stage, c.subject);
    const staffLine = staffName ? `<div class="exam-staff-name">${escapeHtml(staffName)}</div>` : '';
    return `<th colspan="2">${escapeHtml(c.subject)}${staffLine}</th>`;
  }).join('');
  const subHeaderCells = result.columns.map(()=>`<th>Count</th><th>%</th>`).join('');
  const bodyRows = SCORE_BANDS.map((band,i)=>{
    const cells = result.columns.map(c=>{
      const count = c.bandCounts[i];
      const pct = c.total ? (count/c.total*100) : 0;
      return `<td style="background:${band.bg};color:${band.fg};font-weight:700;">${count}</td><td style="background:${band.bg};color:${band.fg};">${pct.toFixed(1)}%</td>`;
    }).join('');
    return `<tr><td class="range-cell">${band.label}</td>${cells}</tr>`;
  }).join('');
  const totalCells = result.columns.map(c=>`<td>${c.total}</td><td>100.0%</td>`).join('');
  const totalRow = `<tr class="total-row"><td class="range-cell">TOTAL</td>${totalCells}</tr>`;

  area.innerHTML = `
    <div class="table-card">
      <div class="grade-table-scroll">
        <table class="exam-analysis-table">
          <thead>
            <tr><th class="range-cell" rowspan="2">Score Range</th>${subjHeaderCells}</tr>
            <tr>${subHeaderCells}</tr>
          </thead>
          <tbody>${bodyRows}${totalRow}</tbody>
        </table>
      </div>
    </div>
    <p class="foot-note">
      Percentages are calculated against this column's own maximum grade (Max. ${result.max}) as shown in the mark-entry tables.
      Only subjects with at least one recorded ${escapeHtml(getExamModeLabel(term, mode))} score for this class are included.
    </p>`;
}

/* ---------- SVG chart builders (no external libraries) ---------- */
function svgBarChart(items, maxVal, seriesStyle){
  const w = 560, h = 300, padL=36, padB=54, padT=16, padR=16;
  const chartW = w-padL-padR, chartH = h-padT-padB;
  const n = items.length || 1;
  const gap = 14;
  const barW = Math.max(10, (chartW - gap*(n-1))/n * 0.6);
  const slot = (chartW - gap*(n-1))/n;
  const color = (seriesStyle && seriesStyle[0] && seriesStyle[0].color) || 'var(--blue)';
  let bars = '', labels='';
  items.forEach((it,i)=>{
    const val = it.value===null || isNaN(it.value) ? 0 : it.value;
    const bh = (val/maxVal) * chartH;
    const x = padL + i*(slot+gap/n) + (slot-barW)/2;
    const y = padT + chartH - bh;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${color}"></rect>
      <text x="${(x+barW/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${it.value===null?'—':val.toFixed(1)}</text>`;
    labels += `<text x="${(x+barW/2).toFixed(1)}" y="${h-padB+16}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)" transform="rotate(-18 ${(x+barW/2).toFixed(1)} ${h-padB+16})">${escapeXml(it.label)}</text>`;
  });
  const gridLines = [0,1,2,3,4,5].map(g=>{
    const y = padT + chartH - (g/maxVal)*chartH;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"></line>
      <text x="${padL-8}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--ink-soft)">${g}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;">${gridLines}${bars}${labels}</svg>`;
}

function svgGroupedBarChart(items, maxVal, seriesNames, colors, targetVal, targetLabel){
  const w = 560, h = 300, padL=36, padB=54, padT=16, padR=16;
  const chartW = w-padL-padR, chartH = h-padT-padB;
  const n = items.length || 1;
  const gap = 14;
  const slot = (chartW - gap*(n-1))/n;
  const barW = Math.max(6, slot*0.32);
  let bars = '', labels = '';
  items.forEach((it,i)=>{
    const groupX = padL + i*(slot+gap/n);
    it.values.forEach((val,si)=>{
      const v = val===null || isNaN(val) ? 0 : val;
      const bh = (v/maxVal) * chartH;
      const x = groupX + (slot/2 - barW) + si*(barW+4);
      const y = padT + chartH - bh;
      const barDelay = (i*seriesNames.length + si) * 0.03;
      bars += `<rect class="db-anim-bar" style="animation-delay:${barDelay.toFixed(2)}s" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${colors[si]}"></rect>
        <text x="${(x+barW/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--ink)">${val===null?'—':v.toFixed(1)}</text>`;
    });
    labels += `<text x="${(groupX+slot/2).toFixed(1)}" y="${h-padB+16}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)" transform="rotate(-18 ${(groupX+slot/2).toFixed(1)} ${h-padB+16})">${escapeXml(it.label)}</text>`;
  });
  const gridLines = [0,1,2,3,4,5].map(g=>{
    const y = padT + chartH - (g/maxVal)*chartH;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"></line>
      <text x="${padL-8}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--ink-soft)">${g}</text>`;
  }).join('');
  let targetLine = '';
  if(targetVal!==undefined && targetVal!==null && !isNaN(targetVal)){
    const ty = padT + chartH - (targetVal/maxVal)*chartH;
    targetLine = `<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${w-padR}" y2="${ty.toFixed(1)}" stroke="var(--red)" stroke-width="1.6" stroke-dasharray="6 4"></line>
      <text x="${w-padR}" y="${(ty-5).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="var(--red)">${escapeXml(targetLabel||'Target')} (${targetVal})</text>`;
  }
  const legend = seriesNames.map((s,i)=>`<span style="display:inline-flex;align-items:center;gap:5px;margin-inline-end:14px;font-size:11.5px;color:var(--ink-soft);"><span style="width:10px;height:10px;border-radius:3px;background:${colors[i]};display:inline-block;"></span>${s}</span>`).join('')
    + (targetLine ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--red);"><span style="width:14px;height:0;border-top:2px dashed var(--red);display:inline-block;"></span>${escapeXml(targetLabel||'Target')} (${targetVal}/${maxVal})</span>` : '');
  return `<div style="margin-bottom:6px;">${legend}</div><svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;">${gridLines}${bars}${targetLine}${labels}</svg>`;
}

function svgPieChart(data){
  const total = data.reduce((a,d)=>a+d.value,0);
  const cx=110, cy=110, r=100;
  if(!total){
    return `<svg viewBox="0 0 220 220" style="width:100%;max-width:240px;display:block;margin:0 auto;"><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--border)"></circle><text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="13" fill="var(--ink-soft)">No data</text></svg>`;
  }
  let angle = -90, paths='', sliceIdx=0;
  data.forEach(d=>{
    if(d.value<=0) return;
    const slice = (d.value/total)*360;
    const start = angle, end = angle+slice;
    const large = slice>180 ? 1 : 0;
    const x1 = cx + r*Math.cos(start*Math.PI/180), y1 = cy + r*Math.sin(start*Math.PI/180);
    const x2 = cx + r*Math.cos(end*Math.PI/180), y2 = cy + r*Math.sin(end*Math.PI/180);
    const sliceDelay = (sliceIdx++ * 0.08).toFixed(2);
    paths += `<path class="db-anim-slice" style="animation-delay:${sliceDelay}s" d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${d.color}" stroke="var(--paper)" stroke-width="2"></path>`;
    angle = end;
  });
  return `<svg viewBox="0 0 220 220" style="width:100%;max-width:240px;display:block;margin:0 auto;">${paths}</svg>`;
}

function svgRadarChart(items, maxVal, seriesNames, colors, targetVal, targetLabel){
  const w=420, h=420, cx=210, cy=210, radius=140;
  const n = items.length;
  if(!n){
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:340px;display:block;margin:0 auto;"><text x="${cx}" y="${cy}" text-anchor="middle" font-size="13" fill="var(--ink-soft)">No data</text></svg>`;
  }
  const startAngle = -Math.PI/2;
  const angleStep = (2*Math.PI)/n;
  const pointFor = (i,val) => {
    const angle = startAngle + i*angleStep;
    const r = Math.max(0, (val/maxVal)) * radius;
    return [cx + r*Math.cos(angle), cy + r*Math.sin(angle)];
  };
  const polygonPath = pts => 'M' + pts.map(p=>p.map(c=>c.toFixed(1)).join(',')).join('L') + 'Z';

  // Background grid rings (one per integer level up to maxVal) + spokes to each axis.
  let gridRings = '';
  for(let g=1; g<=maxVal; g++){
    const ringPts = items.map((it,i)=>pointFor(i,g));
    gridRings += `<path class="db-anim-radar-ring" d="${polygonPath(ringPts)}" fill="none" stroke="var(--border)" stroke-width="1"></path>`;
  }
  let spokes = '';
  items.forEach((it,i)=>{
    const [x,y] = pointFor(i, maxVal);
    spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"></line>`;
  });

  // Axis (subject) labels placed just outside the outer ring, anchored left/right/center
  // depending on which side of the circle they fall on so text never overlaps the shape.
  let axisLabels = '';
  items.forEach((it,i)=>{
    const angle = startAngle + i*angleStep;
    const lx = cx + (radius+18)*Math.cos(angle);
    const ly = cy + (radius+18)*Math.sin(angle);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const anchor = cos > 0.25 ? 'start' : (cos < -0.25 ? 'end' : 'middle');
    const dy = sin > 0.4 ? 9 : (sin < -0.4 ? -4 : 4);
    axisLabels += `<text x="${lx.toFixed(1)}" y="${(ly+dy).toFixed(1)}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="var(--ink)">${escapeXml(it.label)}</text>`;
  });

  // Target / Pass-mark ring — a distinct dashed polygon so the gap between the
  // student's shape and the minimum expected level is visible at a glance.
  let targetRing = '';
  if(targetVal!==undefined && targetVal!==null && !isNaN(targetVal)){
    const ringPts = items.map((it,i)=>pointFor(i,targetVal));
    targetRing = `<path d="${polygonPath(ringPts)}" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-dasharray="6 4"></path>`;
  }

  // One filled, semi-transparent polygon per data series (e.g. Student vs Class Average,
  // or Cycle 1 vs Cycle 2). Missing values are treated as 0 so gaps are still visible
  // rather than silently skipped.
  let seriesPolys = '';
  const seriesCount = items[0].values.length;
  for(let si=0; si<seriesCount; si++){
    const pts = items.map((it,i)=>{
      const v = it.values[si];
      return pointFor(i, (v===null||v===undefined||isNaN(v)) ? 0 : v);
    });
    seriesPolys += `<path class="db-anim-radar-fill" style="animation-delay:${(si*0.12).toFixed(2)}s" d="${polygonPath(pts)}" fill="${colors[si]}" fill-opacity="0.18" stroke="${colors[si]}" stroke-width="2"></path>`;
    pts.forEach(p=>{ seriesPolys += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${colors[si]}"></circle>`; });
  }

  const legend = seriesNames.map((s,i)=>`<span style="display:inline-flex;align-items:center;gap:5px;margin-inline-end:14px;font-size:11.5px;color:var(--ink-soft);"><span style="width:10px;height:10px;border-radius:3px;background:${colors[i]};display:inline-block;"></span>${s}</span>`).join('')
    + (targetRing ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--red);"><span style="width:14px;height:0;border-top:2px dashed var(--red);display:inline-block;"></span>${escapeXml(targetLabel||'Target')} (${targetVal}/${maxVal})</span>` : '');

  return `<div style="margin-bottom:6px;">${legend}</div><svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:400px;height:auto;display:block;margin:0 auto;">${gridRings}${spokes}${targetRing}${seriesPolys}${axisLabels}</svg>`;
}

function escapeXml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ================== WORKSPACE ================== */
// Updates an empty-state panel's numbered seal and heading to describe whichever step
// the user needs to complete next, instead of a fixed "1".
function updateIntroState(introId, cfgs){
  const intro = document.getElementById(introId);
  if(!intro) return;
  const seal = intro.querySelector('.seal-lg');
  const heading = intro.querySelector('h3');
  if(!seal || !heading) return;
  for(let i=0;i<cfgs.length;i++){
    if(!cfgs[i].getLabel()){
      seal.textContent = i+1;
      heading.textContent = `Next: select the ${cfgs[i].title}`;
      return;
    }
  }
}

function renderWorkspace(){
  const cfgs = stepConfig();
  const ready = state.termPeriod && state.section && state.stage && state.grade && state.term && state.academicTerm && state.subject;
  document.getElementById('workspace').classList.toggle('show', !!ready);
  document.getElementById('introState').classList.toggle('show', !ready);
  if(!ready){ updateIntroState('introState', cfgs); return; }

  const gradeLabel = STAGES[state.stage].grades.find(g=>g.id===state.grade).label;
  document.getElementById('crumbs').innerHTML = `
    <span class="crumb">${TERM_LABELS[state.termPeriod]}</span>
    <span class="crumb">${SECTIONS[state.section].label}</span>
    <span class="crumb stage-${state.stage}">${STAGES[state.stage].label}</span>
    <span class="crumb">${gradeLabel}</span>
    <span class="crumb">${state.term}</span>
    <span class="crumb">${markEntryLabel(state.termPeriod, state.academicTerm)}</span>
    <span class="crumb subj">${subjectWithIcon(state.subject)}</span>
  `;
  toggleAddForm(false);
  renderTable();
}

const TERM_LABELS = { term1:'Term 1', term2:'Term 2' };

/* ================== MARK ENTRY REPORT (own tab, own stepper — Term first) ================== */
// Shares the same `state` object as the Grade Book (Section, Stage, Grade, Class stay in
// sync across tabs) but shows its own stepper with the
// Academic Term as the very first step, instead of picking the Term from a nav dropdown submenu.
function renderMarkEntryStepper(){
  const holder = document.getElementById('markEntryStepper');
  if(!holder) return;
  buildStepperHTML('markEntryStepper', stepConfigThroughClass(stepConfig()), 'me-');
}

function renderMarkEntryWorkspace(){
  const ws = document.getElementById('markEntryWorkspace');
  const intro = document.getElementById('markEntryIntroState');
  if(!ws || !intro) return;
  const cfgs = stepConfigThroughClass(stepConfig());
  const ready = state.termPeriod && state.section && state.stage && state.grade && state.term;
  ws.style.display = ready ? '' : 'none';
  intro.style.display = ready ? 'none' : '';
  if(!ready){ updateIntroState('markEntryIntroState', cfgs); return; }

  const gradeLabel = STAGES[state.stage].grades.find(g=>g.id===state.grade).label;
  document.getElementById('markEntryCrumbs').innerHTML = `
    <span class="crumb">${TERM_LABELS[state.termPeriod]}</span>
    <span class="crumb">${SECTIONS[state.section].label}</span>
    <span class="crumb stage-${state.stage}">${STAGES[state.stage].label}</span>
    <span class="crumb">${gradeLabel}</span>
    <span class="crumb subj">${state.term}</span>
  `;
  renderMarkEntryReport();
}

function reportMetric(sc, type){
  if(isPrimary()){
    const t = computePrimaryTotals(sc);
    if(type==='month1') return t.month1Total;
    if(type==='month2') return t.month2Total;
    return t.totalCoursework; // coursework & reportcard
  }
  if(type==='month1' || type==='month2') return null; // not applicable outside Primary Stage
  return (parseFloat(sc.m1)||0)+(parseFloat(sc.m2)||0)+(parseFloat(sc.mid)||0)+(parseFloat(sc.final)||0);
}

/* ================== REPORT CERTIFICATES (unified certificate template, every Section/Stage/Grade/Class) ================== */
// Independent stepper state — Term, Section, Stage, Grade and Report Type are required; Class is
// optional (leave it blank to generate one certificate per student across EVERY class in that Grade).
// studentId (set from the "Student" dropdown in the workspace, not the stepper) narrows it down
// further to a single certificate instead of the whole scope.
let certState = { termPeriod:null, section:null, stage:null, grade:null, reportType:null, term:null, studentId:null, generated:false, __isCert:true };

const CERT_REPORT_TITLES = {
  month1: 'First Month Report Card',
  month2: 'Second Month Report Card',
  coursework: 'Total Coursework Report Card',
  reportcard: 'First Term Report Card',
  endyear: 'End-of-Year Report Card'
};
function certReportTypeOptions(termPeriod, stage, grade){
  const base = [
    { id:'month1', label:'First Month Report Card' },
    { id:'month2', label:'Second Month Report Card' }
  ];
  const isGrade9 = stage==='prep' && grade==='g9';
  if(!isGrade9) base.push({ id:'coursework', label:'Total Coursework Report Card' });
  base.push(termPeriod==='term2' ? { id:'endyear', label:'End-of-Year Report Card' } : { id:'reportcard', label:'First Term Report Card' });
  return base;
}

/* A linked Parent/Student account never needs to walk the Section -> Stage ->
   Grade -> Class part of the Certificates stepper — auto-scope it straight to
   their child (the first child, alphabetically, for accounts linked to more
   than one; renderCertChildSwitch lets them pick a sibling afterwards). Only
   fills in Section/Stage/Grade/Class/Student — Academic Term and Report Type
   are real choices the parent still makes, so those are left untouched. Only
   fires when nothing valid is already selected, so it never overrides a
   sibling the parent has already switched to. */
// Remembers which child a multi-linked parent last explicitly picked via the "My children"
// dropdown (selectCertChild), across the studentId resets that selectValue() does every time
// the parent picks a Term/Report Type — without this, changing either would silently snap
// certState back to their alphabetically-first child instead of staying on the sibling they
// were actually looking at.
let certParentSelectedStudentId = null;

function autoSelectCertChildForParent(){
  if(!isLinkedParentViewer()) return;
  if(certState.studentId && scopeStudentAllowed(certState.studentId)) return;
  const scope = currentUser.effective.studentScope;
  const flat = allStudentsFlatRaw();
  const candidates = scope.map(id=> flat.find(s=> s.id===id)).filter(Boolean).sort((a,b)=> a.name.localeCompare(b.name));
  const preferred = certParentSelectedStudentId ? candidates.find(c=> c.id===certParentSelectedStudentId) : null;
  const pick = preferred || candidates[0];
  if(!pick) return;
  certState.section = pick.section || null;
  certState.stage = pick.stage || null;
  certState.grade = pick.grade || null;
  certState.term = pick.classroom || null;
  certState.studentId = pick.id;
}

function certStepConfig(){
  const st = certState;
  const linkedParent = isLinkedParentViewer();
  const steps = [
    { key:'termPeriod', title:'Academic Term', state: st, getLabel:()=> st.termPeriod ? TERM_LABELS[st.termPeriod] : null,
      options: [ { id:'term1', label:'Term 1' }, { id:'term2', label:'Term 2' } ] }
  ];
  // A linked Parent/Student account is already scoped to their own child (see
  // autoSelectCertChildForParent), so Section/Stage/Grade/Class would just be
  // read-only restatements of facts the parent already knows — skip them and
  // only ask what's actually a choice: Academic Term and Report Type.
  if(!linkedParent){
    steps.push(
      { key:'section', title:'Section', state: st, getLabel:()=> st.section ? SECTIONS[st.section].label : null,
        options: Object.entries(SECTIONS).filter(([id])=>scopeSectionAllowed(id)).map(([id,v])=>({id,label:v.label})), requires:['termPeriod'] },
      { key:'stage', title:'Stage', state: st, getLabel:()=> st.stage ? STAGES[st.stage].label : null,
        options: Object.entries(STAGES).filter(([id])=>scopeStageAllowed(id)).map(([id,v])=>({id,label:v.label})), requires:['termPeriod','section'] },
      { key:'grade', title:'Grade', state: st, getLabel:()=>{
          if(!st.grade) return null;
          const g = STAGES[st.stage].grades.find(g=>g.id===st.grade);
          return g ? g.label : null;
        }, options: ()=> st.stage ? STAGES[st.stage].grades.map(g=>({id:g.id,label:g.label})) : [], requires:['termPeriod','section','stage'] }
    );
  }
  steps.push(
    { key:'reportType', title:'Report Type', state: st, getLabel:()=> st.reportType ? CERT_REPORT_TITLES[st.reportType] : null,
      options: ()=> certReportTypeOptions(st.termPeriod, st.stage, st.grade), requires: linkedParent ? ['termPeriod'] : ['termPeriod','section','stage','grade'] }
  );
  if(!linkedParent){
    steps.push(
      { key:'term', title:'Class (optional — ALL classes if left blank)', state: st, getLabel:()=> st.term ? st.term : null,
        options: ()=> getClassesInGrade(st).filter(c=>scopeClassroomAllowed(c)).map(c=>({id:c,label:c})), requires:['termPeriod','section','stage','grade','reportType'] }
    );
  }
  return steps;
}
function renderCertReportsStepper(){
  const holder = document.getElementById('certReportsStepper');
  if(!holder) return;
  autoSelectCertChildForParent();
  buildStepperHTML('certReportsStepper', certStepConfig(), 'c-');
  renderCertChildSwitch();
}

// Runs fn() with the shared grade-book `state` temporarily pointed at certState's
// Term/Section/Stage/Grade/Class (and a given subject), so all the existing business logic
// (subjKey(), isPrimary(), isG9(), computePrimaryTotals(), reportMetric()...) can be reused
// unmodified. Restores the real `state` afterwards — read-only, nothing is saved.
// Renders the Initial Exam / Final Exam value (entered on the Grade Book "Term 1 (Total)" /
// "Term 2 (Total)" screen) as a small circle on the Report Certificate — green circle for
// Pass, red circle for Fail, neutral for any other free-typed value.
function examResultBadgeHtml(value){
  const v = (value===null||value===undefined) ? '' : value.toString().trim();
  if(!v) return '—';
  const cls = /^pass$/i.test(v) ? 'exam-pass' : /^fail$/i.test(v) ? 'exam-fail' : 'exam-neutral';
  return `<span class="exam-result-badge ${cls}">${escapeHtml(v)}</span>`;
}

function withCertState(subject, fn){
  const backup = { section:state.section, stage:state.stage, grade:state.grade, term:state.term, termPeriod:state.termPeriod, subject:state.subject };
  state.section = certState.section; state.stage = certState.stage; state.grade = certState.grade;
  state.term = certState.term; state.termPeriod = certState.termPeriod; state.subject = subject;
  try{ return fn(); } finally { Object.assign(state, backup); }
}

// Same as withCertState, but forces a specific termPeriod ('term1'/'term2') instead of the
// certificate's own selected termPeriod — used by the End-of-Year Report Card certificate to
// pull the First Term's scores (stored under their own termPeriod-scoped key) for Year Average.
function withCertStateTermPeriod(subject, termPeriod, fn){
  const backup = { section:state.section, stage:state.stage, grade:state.grade, term:state.term, termPeriod:state.termPeriod, subject:state.subject };
  state.section = certState.section; state.stage = certState.stage; state.grade = certState.grade;
  state.term = certState.term; state.termPeriod = termPeriod; state.subject = subject;
  try{ return fn(); } finally { Object.assign(state, backup); }
}

// Computes one subject's result for the chosen Report Type, reusing the exact same math
// (reportMetric) used elsewhere in the app so figures always match. maxPerSubject mirrors
// the same rule used there:
// Month 1 / Month 2 only apply within the Primary Stage; Total Coursework / First Term /
// End-of-Year apply everywhere.
function certSubjectResult(subject, studentId, type){
  return withCertState(subject, ()=>{
    const primary = isPrimary();
    const junior = isJuniorPrimary();
    const notApplicable = !primary && (type==='month1' || type==='month2');
    if(notApplicable) return { applicable:false };
    const max = (type==='coursework'||type==='reportcard'||type==='endyear') ? (primary?(junior?100:40):100) : (primary?(junior?75:15):null);
    const sc = (scores[subjKey()]||{})[studentId] || emptyScoreObj();
    const val = reportMetric(sc, type);
    const hasVal = val!==null && Object.keys(sc).some(k=> k!=='examPaper' && sc[k]!==null && sc[k]!==undefined && sc[k]!=='');
    return { applicable:true, val: val||0, max, hasVal };
  });
}

// The subjects that actually apply to this particular student (Second Language and
// Religion/Ch-Religion are mutually exclusive per student, so only one of each pair shows).
function certApplicableSubjects(stage, student, section){
  section = section || 'en';
  const subjects = getSubjectsForStageAndSection(stage, section);
  return subjects.filter(sub=>{
    if(isLanguageSubject(sub)){
      const expectedLang = getExpectedLang2ForSubject(sub, section);
      // Only Second-Language subjects (French/German in English Section, English in French
      // Section) resolve to a non-null expectedLang and get filtered by the student's Second
      // Language. The Section's OWN language (English O.L./A.L. in English Section, French
      // O.L./A.L. in French Section) is a core subject taken by every student, so it must not
      // be filtered out just because expectedLang is null (see filterRosterForSubject/
      // subjectFilteredRoster/getAttRoster for the same guard pattern).
      if(expectedLang) return student.lang2 === expectedLang;
      return true;
    }
    if(sub==='Ch-Religion') return student.religion==='Christian';
    if(sub==='Religion') return student.religion!=='Christian';
    return true;
  });
}

function certRosterFor(section, stage, grade, term){
  const ck = `${section}|${stage}|${grade}`;
  const roster = visibleRoster(students[ck]);
  const filtered = term ? roster.filter(s=> (s.classroom||'')===term) : roster;
  return filtered.filter(s=> scopeStudentAllowed(s.id));
}

function renderCertReportsWorkspace(){
  const ws = document.getElementById('certReportsWorkspace');
  const intro = document.getElementById('certReportsIntroState');
  if(!ws || !intro) return;
  const cfgs = isLinkedParentViewer() ? certStepConfig() : certStepConfig().slice(0,5); // Term, Section, Stage, Grade, Report Type are required for the intro state (linked parents only ever see Term + Report Type)
  const ready = !!(certState.termPeriod && certState.section && certState.stage && certState.grade && certState.reportType);
  ws.style.display = ready ? '' : 'none';
  intro.style.display = ready ? 'none' : '';
  if(!ready){ updateIntroState('certReportsIntroState', cfgs); return; }

  const gradeLabel = STAGES[certState.stage].grades.find(g=>g.id===certState.grade).label;
  document.getElementById('certReportsCrumbs').innerHTML = `
    <span class="crumb">${TERM_LABELS[certState.termPeriod]}</span>
    <span class="crumb">${SECTIONS[certState.section].label}</span>
    <span class="crumb stage-${certState.stage}">${STAGES[certState.stage].label}</span>
    <span class="crumb">${gradeLabel}</span>
    <span class="crumb">${certState.term ? certState.term : 'All Classes'}</span>
    <span class="crumb subj">${CERT_REPORT_TITLES[certState.reportType]}</span>
  `;

  // Parent/Student accounts only get this far once the Admin has released this Report Card
  // type via Report Card Release Configuration — checked here, before the Student picker or
  // Generate button ever render, so nothing about the report leaks out ahead of schedule.
  // Admins, staff and teachers are never gated: they always see the certificate immediately.
  if(isParentDashboardViewer() && !isReportCardVisible(certState.section, certState.termPeriod, certState.reportType, certState.grade)){
    document.getElementById('certReportsStudentPicker').innerHTML = '';
    document.getElementById('certReportsHolder').innerHTML = renderReportCardNotReleasedState();
    return;
  }

  renderCertStudentPicker();
  renderCertReportsCards();
}

// Locked state shown to Parent/Student accounts in place of the certificate, before its
// Report Card Release schedule has started. Shows the next upcoming release date/time for
// this exact report type if the Admin has already scheduled one.
function renderReportCardNotReleasedState(){
  const reportName = CERT_REPORT_TITLES[certState.reportType] || 'This Report Card';
  const now = Date.now();
  const upcoming = (reportCardReleases||[])
    .filter(rc=> rc.section===certState.section && rc.termPeriod===certState.termPeriod && rc.reportType===certState.reportType && (!rc.grade || rc.grade===certState.grade))
    .map(rc=> ({ ...rc, _releaseTs: new Date(rc.releaseDate+'T'+rc.releaseTime).getTime() }))
    .filter(rc=> !isNaN(rc._releaseTs) && rc._releaseTs > now)
    .sort((a,b)=> a._releaseTs - b._releaseTs)[0];
  const whenHtml = upcoming
    ? `<p>It will become available on <b>${new Date(upcoming._releaseTs).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})}</b> at <b>${escapeHtml(upcoming.releaseTime)}</b>.</p>`
    : `<p>The school hasn't scheduled a release date for this report yet — please check back later.</p>`;
  return `
    <div class="empty-state">
      <div class="seal-lg">🔒</div>
      <h3>Not available yet</h3>
      <p><b>${escapeHtml(reportName)}</b> hasn't been released yet.</p>
      ${whenHtml}
    </div>`;
}

// "Student" dropdown — sits above the certificate(s), independent of the stepper. Defaults to
// "All Students" (renders one certificate per student in scope); pick a name to print just that
// one student's certificate instead.
function renderCertStudentPicker(){
  const holder = document.getElementById('certReportsStudentPicker');
  if(!holder) return;
  const roster = certRosterFor(certState.section, certState.stage, certState.grade, certState.term);
  if(certState.studentId && !roster.find(s=>s.id===certState.studentId)) certState.studentId = null;
  if(isLinkedParentViewer()){
    holder.innerHTML = '';
    return;
  }
  const optionsHtml = roster.map(s=>
    `<option value="${s.id}" ${s.id===certState.studentId?'selected':''}>${escapeHtml(s.name)}${s.displayId?` (${s.displayId})`:''}</option>`
  ).join('');
  holder.innerHTML = `
    <label>Student:</label>
    <select onchange="certState.studentId=this.value||null; renderCertReportsCards();">
      <option value="">All Students (${roster.length})</option>
      ${optionsHtml}
    </select>`;
}

function renderCertReportsCards(){
  const holder = document.getElementById('certReportsHolder');
  let roster = certRosterFor(certState.section, certState.stage, certState.grade, certState.term);
  if(certState.studentId) roster = roster.filter(s=> s.id===certState.studentId);
  if(roster.length===0){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No students found</h3>
        <p>${certState.term ? 'This class has no students yet.' : 'This Grade has no students yet.'}</p>
      </div>`;
    return;
  }
  const gradeLabel = STAGES[certState.stage].grades.find(g=>g.id===certState.grade).label;
  const type = certState.reportType;
  const cardTitle = (CERT_REPORT_TITLES[type] || 'Report Card').toUpperCase();
  const hosSignatory = findAdminStructureSignatory(certState.section, certState.stage, 'hos');
  const hosName = hosSignatory && hosSignatory.name ? hosSignatory.name : HOS_NAME;
  const principalSignatory = findAdminStructureSignatory(certState.section, certState.stage, 'principal');
  const principalTitle = principalSignatory && principalSignatory.position ? principalSignatory.position : 'School Principal';
  const principalName = principalSignatory && principalSignatory.name ? principalSignatory.name : PRINCIPAL_NAME;
  const dateStr = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});

  holder.innerHTML = roster.map(student=>{
    const subjects = certApplicableSubjects(certState.stage, student, certState.section);
    // Cycle scores are out of 5 for most grades, but Grade 7-8 Prep and Grade 10-11
    // Secondary use an extended Max.15 Cycle scale (see perfCycleMaxFor) — the subject
    // cell's colored band must be computed against the correct max for this grade, not
    // a fixed Max.5 assumption, or every subject in those grades reads as "Excellent".
    const cycMax = perfCycleMaxFor(certState.stage, certState.grade);
    const isJuniorMonthCert = certState.stage==='primary' && ['g1','g2'].includes(certState.grade) && (type==='month1' || type==='month2');
    const isJuniorCourseworkCert = certState.stage==='primary' && ['g1','g2'].includes(certState.grade) && type==='coursework';
    const isJuniorReportCardCert = certState.stage==='primary' && ['g1','g2'].includes(certState.grade) && (type==='reportcard' || type==='endyear');
    // Grade 9 Prep (3rd Prep) First Month / Second Month Report Card certificate — linked to Grade Book Cycle marks
    const isG9MonthCert = certState.stage==='prep' && certState.grade==='g9' && (type==='month1' || type==='month2');
    // Grade 3, 4, 5 & 6 Primary First/Second Month Report certificate — uses its own header:
    // Q.1-Q.4 (Max.5 each), Q. Av. (Max.5), H.W. (Max.5), Beh. & Attend. (Max.5), Total (Max.15), Cycle (Max.5).
    const isG3G6MonthCert = certState.stage==='primary' && !['g1','g2'].includes(certState.grade) && (type==='month1' || type==='month2');
    // Grade 3, 4, 5 & 6 Primary Coursework certificate — uses its own header:
    // Two Months Av. (Max.15), Total Cycles (Max.10), Activity (Max.5), Per. Tasks (Max.10), Total Coursework (Max.40).
    const isG3G6CourseworkCert = certState.stage==='primary' && !['g1','g2'].includes(certState.grade) && type==='coursework';
    // Grade 3, 4, 5 & 6 Primary First/End of Year Term Report Card certificate — uses its own header:
    // Total Coursework (Max.40), First Term Exam Paper (Max.60), Term Total (Max.100), Grade.
    const isG3G6ReportCardCert = certState.stage==='primary' && !['g1','g2'].includes(certState.grade) && (type==='reportcard' || type==='endyear');
    // Grade 7 & 8 Prep (1st & 2nd Prep) First/Second Month Report certificate — uses its own header:
    // Q.1-Q.4 (Max.5 each), Q. Av. (Max.20), H.W. (Max.10), Beh. & Attend. (Max.10), Oral (Max.10),
    // Total (Max.40), Cycle (Max.15). Total is Q.Av + H.W. + Beh. & Attend. (Oral shown for record only).
    const isPrepG78MonthCert = certState.stage==='prep' && ['g7','g8'].includes(certState.grade) && (type==='month1' || type==='month2');
    // Grade 7 & 8 Prep (1st & 2nd Prep) Total Coursework certificate — uses its own header:
    // Two Months Av. (Max.40), Two Cycles (Max.30), Total Coursework (Max.70) — no Activity/Per. Tasks.
    const isPrepG78CourseworkCert = certState.stage==='prep' && ['g7','g8'].includes(certState.grade) && type==='coursework';
    // Grade 7 & 8 Prep (1st & 2nd Prep) First/End of Year Term Report Card certificate — uses its own header:
    // Total Coursework T1 (Max.70), First Term Exam Paper (Max.30), Total T1 (Max.100), Grade.
    // Grade 9 Prep (3rd Prep) First Term / End-of-Year Report Card certificate reuses the
    // exact same Grade 7 & 8 template/computations below, but the visible table is trimmed
    // to start at the Max./Min. column (Total Coursework / Exam Paper / Total columns hidden),
    // and its "Actual Mark (T1)" column is relabeled "Term 1" — see isG9ReportCardCert below.
    const isG9ReportCardCert = certState.stage==='prep' && certState.grade==='g9' && (type==='reportcard' || type==='endyear');
    // Grade 10 & 11 Secondary (1st & 2nd Secondary) First/End of Year Term Report Card certificate —
    // reuses the exact same Grade 7 & 8 Prep template/computations below (full header, with
    // Total Coursework / Exam Paper / Total columns, same as G7/G8 — NOT the trimmed G9 layout),
    // but swaps in the Secondary-specific Max./Min. Actual Mark scale (SEC_ACTUAL_MARK_MAP) and
    // core-subject list (Arabic → Philosophy) instead of the Prep ones.
    const isSecG1011ReportCardCert = certState.stage==='secondary' && ['g10','g11'].includes(certState.grade) && (type==='reportcard' || type==='endyear');
    const isPrepG78ReportCardCert = (certState.stage==='prep' && ['g7','g8'].includes(certState.grade) && (type==='reportcard' || type==='endyear')) || isG9ReportCardCert || isSecG1011ReportCardCert;
    // Grade 10 & 11 Secondary (1st & 2nd Secondary) First/Second Month Report certificate —
    // uses its own header, matching the approved Grade 10/11 header exactly:
    // Q.1-Q.4 (flexible max each), Q. Av. (Max.15), C.W. (Max.15), Beh. & Attend. (Max.10),
    // Total (Max.40), Cycle (Max.15). No H.W./Oral columns for this stage (mirrors the
    // Grade 7 & 8 Prep template/computations, but with the Secondary-specific maxima).
    const isSecG1011MonthCert = certState.stage==='secondary' && ['g10','g11'].includes(certState.grade) && (type==='month1' || type==='month2');
    // Grade 10 & 11 Secondary Total Coursework certificate — uses its own header:
    // Two Months Av. (Max.40), Two Cycles (Max.30), Total Coursework (Max.70) — no Activity/Per. Tasks.
    const isSecG1011CourseworkCert = certState.stage==='secondary' && ['g10','g11'].includes(certState.grade) && type==='coursework';
    let sumVal=0, sumMax=0;
    let tableHeadHtml, tableBodyHtml, showGradingKey = true;

    if(isJuniorMonthCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const mKey = type==='month1' ? 'm1' : 'm2';
      const monthNum = type==='month1' ? 1 : 2;
      const cell = v => (v===null || v===undefined || v==='') ? '' : v;
      // Grade 1 & 2 now use the same flexible, teacher-set Q.1–Q.4 maximums as every
      // other grade — per-subject, so each cell shows "score / that subject's max".
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Q. 1</th>
          <th>Q. 2</th>
          <th>Q. 3</th>
          <th>Q. 4</th>
          <th>Q. Av.<br><small>(Max. 20)</small></th>
          <th>C.W.<br><small>(Max. 20)</small></th>
          <th>H.W.<br><small>(Max. 20)</small></th>
          <th>Oral<br><small>(Max. 10)</small></th>
          <th>Beh. &amp;<br>Attend.<br><small>(Max. 5)</small></th>
          <th>Total ${monthNum}<br><small>(Max. 75)</small></th>
          <th>Cycle ${monthNum}<br><small>(Max. 5)</small></th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, totals, subMaxima } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, totals: computePrimaryTotals(sc), subMaxima: g3MaximaFor() };
        });
        const avg = monthNum===1 ? totals.avg1 : totals.avg2;
        const monthTotal = monthNum===1 ? totals.month1Total : totals.month2Total;
        const qCell = n => {
          const v = cell(sc[mKey+'E'+n]);
          const max = fmtMax(subMaxima[mKey+'E'+n+'Max']);
          return v==='' ? '' : `${v}<small class="qcell-max">/${max}</small>`;
        };
        const cycBand = subjCycleBand(sc, mKey, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td>${qCell(1)}</td>
            <td>${qCell(2)}</td>
            <td>${qCell(3)}</td>
            <td>${qCell(4)}</td>
            <td class="qavg-cell">${Math.round(avg*10)/10}</td>
            <td>${cell(sc[mKey+'CW'])}</td>
            <td>${cell(sc[mKey+'Hw'])}</td>
            <td>${cell(sc[mKey+'Oral'])}</td>
            <td>${cell(sc[mKey+'Beh'])}</td>
            <td class="total-cell">${Math.round(monthTotal*10)/10}</td>
            <td>${cycleCellHtml(sc, mKey)}</td>
          </tr>`;
      }).join('');
    } else if(isG9MonthCert){
      // Grade 9 First Month / Second Month Report Card — linked directly to Grade Book Cycle marks
      // Shows Cycle (Max. 15), Percentage, and Grade automatically from Grade Book
      showGradingKey = true;
      const cycleField = type==='month1' ? 'g9c1' : 'g9c2';
      const cycleNum = type==='month1' ? 1 : 2;
      const cycleMax = 15;
      const cell = v => (v===null || v===undefined || v==='') ? '' : v;
      
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Cycle ${cycleNum}<br><small>(Max. 15)</small></th>
          <th>Percentage</th>
          <th>Grade</th>
        </tr>`;
      
      tableBodyHtml = subjects.map(sub=>{
        const { sc } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc };
        });
        
        const cycleVal = sc[cycleField];
        const hasVal = cycleVal!==null && cycleVal!==undefined && cycleVal!=='';
        const pct = hasVal ? Math.round((parseFloat(cycleVal)/cycleMax*100)*10)/10 : null;
        const g = hasVal ? letterGrade(pct) : null;
        const cycBand = g ? g.c : 'neutral';
        
        if(hasVal) {
          sumVal += parseFloat(cycleVal);
          sumMax += cycleMax;
        }
        
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td class="total-cell">${hasVal ? Math.round(parseFloat(cycleVal)*10)/10 : '—'}</td>
            <td class="pct-cell">${hasVal ? pct + '%' : '—'}</td>
            <td>${g ? `<span class="badge ${g.c}">${g.t}</span>` : '—'}</td>
          </tr>`;
      }).join('');
      
      // Add total row for Grade 9 month certificate
      const totalPct = sumMax > 0 ? Math.round((sumVal/sumMax*100)*10)/10 : 0;
      const totalGrade = sumMax > 0 ? letterGrade(totalPct) : null;
      tableBodyHtml += sumMax > 0 ? `
        <tr class="cert-subtotal-row">
          <td><b>Total</b></td>
          <td class="total-cell"><b>${Math.round(sumVal*10)/10}</b></td>
          <td class="pct-cell"><b>${totalPct}%</b></td>
          <td><span class="badge ${totalGrade.c}">${totalGrade.t}</span></td>
        </tr>` : '';
      
    } else if(isG3G6MonthCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const mKey = type==='month1' ? 'm1' : 'm2';
      const monthNum = type==='month1' ? 1 : 2;
      const cell = v => (v===null || v===undefined || v==='') ? '' : v;
      // Grades 3-6 all use flexible, teacher-set Q.1–Q.4 maximums (Set Quiz Max. Score
      // box in the Grade Book) — and those maximums are set PER SUBJECT, so this
      // table (one row per subject) can't show a single Max. figure in the shared
      // header — Math's Q.1 max and Science's Q.1 max can differ. Instead the header
      // stays generic and each cell shows "score / that subject's max".
      const isG3FlexCert = true;
      const g3P = mKey;
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Q. 1</th>
          <th>Q. 2</th>
          <th>Q. 3</th>
          <th>Q. 4</th>
          <th>Q. Av.<br><small>(Max. 5)</small></th>
          <th>H.W.<br><small>(Max. 5)</small></th>
          <th>Beh. &amp;<br>Attend.<br><small>(Max. 5)</small></th>
          <th>Total ${monthNum}<br><small>(Max. 15)</small></th>
          <th>Cycle ${monthNum}<br><small>(Max. 5)</small></th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, totals, subMaxima } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, totals: computePrimaryTotals(sc), subMaxima: g3MaximaFor() };
        });
        const avg = monthNum===1 ? totals.avg1 : totals.avg2;
        const monthTotal = monthNum===1 ? totals.month1Total : totals.month2Total;
        // score/max per this subject's own Q.n maximum (flexible for every grade now)
        const qCell = n => {
          const v = cell(sc[mKey+'E'+n]);
          const max = fmtMax(subMaxima[g3P+'E'+n+'Max']);
          return v==='' ? '' : `${v}<small class="qcell-max">/${max}</small>`;
        };
        const cycBand = subjCycleBand(sc, mKey, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td>${qCell(1)}</td>
            <td>${qCell(2)}</td>
            <td>${qCell(3)}</td>
            <td>${qCell(4)}</td>
            <td class="qavg-cell">${Math.round(avg*10)/10}</td>
            <td>${cell(sc[mKey+'Hw'])}</td>
            <td>${cell(sc[mKey+'Beh'])}</td>
            <td class="total-cell">${Math.round(monthTotal*10)/10}</td>
            <td>${cycleCellHtml(sc, mKey)}</td>
          </tr>`;
      }).join('');
    } else if(isSecG1011MonthCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const mKey = type==='month1' ? 'm1' : 'm2';
      const monthNum = type==='month1' ? 1 : 2;
      const cell = v => (v===null || v===undefined || v==='') ? '' : v;
      // Grade 10 & 11 Secondary use flexible, teacher-set Q.1–Q.4 maximums (set per
      // subject) — same per-subject "score/max" display as every other grade. Unlike
      // Grade 7 & 8 Prep, this stage has no H.W./Oral fields, so those columns are
      // omitted here and C.W. takes the wider Max.15 (per the approved header image).
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Q. 1</th>
          <th>Q. 2</th>
          <th>Q. 3</th>
          <th>Q. 4</th>
          <th>Q. Av.<br><small>(Max. 15)</small></th>
          <th>C.W.<br><small>(Max. 15)</small></th>
          <th>Beh. &amp;<br>Attend.<br><small>(Max. 10)</small></th>
          <th>Total ${monthNum}<br><small>(Max. 40)</small></th>
          <th>Cycle ${monthNum}<br><small>(Max. 15)</small></th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, totals, subMaxima } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, totals: computePrimaryTotals(sc), subMaxima: g3MaximaFor() };
        });
        const avg = monthNum===1 ? totals.avg1 : totals.avg2;
        const monthTotal = monthNum===1 ? totals.month1Total : totals.month2Total;
        const qCell = n => {
          const v = cell(sc[mKey+'E'+n]);
          const max = fmtMax(subMaxima[mKey+'E'+n+'Max']);
          return v==='' ? '' : `${v}<small class="qcell-max">/${max}</small>`;
        };
        const cycBand = subjCycleBand(sc, mKey, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td>${qCell(1)}</td>
            <td>${qCell(2)}</td>
            <td>${qCell(3)}</td>
            <td>${qCell(4)}</td>
            <td class="qavg-cell">${Math.round(avg*10)/10}</td>
            <td>${cell(sc[mKey+'CW'])}</td>
            <td>${cell(sc[mKey+'Beh'])}</td>
            <td class="total-cell">${Math.round(monthTotal*10)/10}</td>
            <td>${cycleCellHtml(sc, mKey)}</td>
          </tr>`;
      }).join('');
    } else if(isSecG1011CourseworkCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const termSuffix = certState.termPeriod==='term2' ? 'T2' : 'T1';
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Two Months<br>Av.<br><small>(Max. 40)</small></th>
          <th>Two<br>Cycles<br><small>(Max. 30)</small></th>
          <th>Total<br>Coursework ${termSuffix}<br><small>(Max. 70)</small></th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, t } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, t: computePrimaryTotals(sc) };
        });
        const cycBand = subjCycleBand(sc, null, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td class="qavg-cell">${Math.round(t.twoMonthsAvg*10)/10}</td>
            <td>${Math.round(t.totalCycles*10)/10}</td>
            <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
          </tr>`;
      }).join('');
    } else if(isPrepG78MonthCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const mKey = type==='month1' ? 'm1' : 'm2';
      const monthNum = type==='month1' ? 1 : 2;
      const cell = v => (v===null || v===undefined || v==='') ? '' : v;
      // Grade 7 & 8 Prep now use flexible, teacher-set Q.1–Q.4 maximums too (set
      // per subject) — same per-subject "score/max" display as the other grades.
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Q. 1</th>
          <th>Q. 2</th>
          <th>Q. 3</th>
          <th>Q. 4</th>
          <th>Q. Av.<br><small>(Max. 20)</small></th>
          <th>H.W.<br><small>(Max. 10)</small></th>
          <th>Beh. &amp;<br>Attend.<br><small>(Max. 10)</small></th>
          <th>Oral<br><small>(Max. 10)</small></th>
          <th>Total ${monthNum}<br><small>(Max. 40)</small></th>
          <th>Cycle ${monthNum}<br><small>(Max. 15)</small></th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, totals, subMaxima } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, totals: computePrimaryTotals(sc), subMaxima: g3MaximaFor() };
        });
        const avg = monthNum===1 ? totals.avg1 : totals.avg2;
        const monthTotal = monthNum===1 ? totals.month1Total : totals.month2Total;
        const qCell = n => {
          const v = cell(sc[mKey+'E'+n]);
          const max = fmtMax(subMaxima[mKey+'E'+n+'Max']);
          return v==='' ? '' : `${v}<small class="qcell-max">/${max}</small>`;
        };
        const cycBand = subjCycleBand(sc, mKey, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td>${qCell(1)}</td>
            <td>${qCell(2)}</td>
            <td>${qCell(3)}</td>
            <td>${qCell(4)}</td>
            <td class="qavg-cell">${Math.round(avg*10)/10}</td>
            <td>${cell(sc[mKey+'CW'])}</td>
            <td>${cell(sc[mKey+'Beh'])}</td>
            <td>${cell(sc[mKey+'Oral'])}</td>
            <td class="total-cell">${Math.round(monthTotal*10)/10}</td>
            <td>${cycleCellHtml(sc, mKey)}</td>
          </tr>`;
      }).join('');
    } else if(isPrepG78CourseworkCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const termSuffix = certState.termPeriod==='term2' ? 'T2' : 'T1';
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Two Months<br>Av.<br><small>(Max. 40)</small></th>
          <th>Two<br>Cycles<br><small>(Max. 30)</small></th>
          <th>Total<br>Coursework ${termSuffix}<br><small>(Max. 70)</small></th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, t } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, t: computePrimaryTotals(sc) };
        });
        const cycBand = subjCycleBand(sc, null, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td class="qavg-cell">${Math.round(t.twoMonthsAvg*10)/10}</td>
            <td>${Math.round(t.totalCycles*10)/10}</td>
            <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
          </tr>`;
      }).join('');
    } else if(isG3G6CourseworkCert){
      showGradingKey = true; // always show Grading Key on every certificate
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Two Months<br>Av.<br><small>(Max. 15)</small></th>
          <th>Total<br>Cycles<br><small>(Max. 10)</small></th>
          <th>Activity<br><small>(Max. 5)</small></th>
          <th>Per.<br>Tasks<br><small>(Max. 10)</small></th>
          <th>Total<br>Coursework<br><small>(Max. 40)</small></th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, t } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, t: computePrimaryTotals(sc) };
        });
        const cycBand = subjCycleBand(sc, null, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td class="qavg-cell">${Math.round(t.twoMonthsAvg*10)/10}</td>
            <td>${Math.round(t.totalCycles*10)/10}</td>
            <td>${(sc.activity===null||sc.activity===undefined||sc.activity==='') ? '' : sc.activity}</td>
            <td>${(sc.tasks===null||sc.tasks===undefined||sc.tasks==='') ? '' : sc.tasks}</td>
            <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
          </tr>`;
      }).join('');
    } else if(isJuniorCourseworkCert){
      showGradingKey = true; // always show Grading Key on every certificate
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Two Months<br>Av.<br><small>(Max. 75)</small></th>
          <th>Activity<br><small>(Max. 20)</small></th>
          <th>Skills<br><small>(Max. 5)</small></th>
          <th>Term Total<br><small>(Max. 100)</small></th>
          <th>Grade</th>
          <th>Color</th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, t } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, t: computePrimaryTotals(sc) };
        });
        const pct = Math.round((t.totalCoursework / t.maxTotal * 100) * 10) / 10;
        const g = letterGrade(pct);
        const col = courseworkColor(pct);
        const cycBand = subjCycleBand(sc, null, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td class="qavg-cell">${Math.round(t.twoMonthsAvg*10)/10}</td>
            <td>${(sc.activity===null||sc.activity===undefined||sc.activity==='') ? '' : sc.activity}</td>
            <td>${(sc.tasks===null||sc.tasks===undefined||sc.tasks==='') ? '' : sc.tasks}</td>
            <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
            <td><span class="badge ${g.c}">${g.t}</span></td>
            <td><span class="badge ${col.c}">${col.t}</span></td>
          </tr>`;
      }).join('');
    } else if(isJuniorReportCardCert){
      showGradingKey = true; // always show Grading Key on every certificate
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Term Total<br><small>(Max. 100)</small></th>
          <th>Grade</th>
          <th>Color</th>
          <th>Initial Exam</th>
          <th>Final Exam</th>
        </tr>`;
      tableBodyHtml = subjects.map(sub=>{
        const { sc, t } = withCertState(sub, ()=>{
          const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
          return { sc, t: computePrimaryTotals(sc) };
        });
        const pct = Math.round((t.totalCoursework / t.maxTotal * 100) * 10) / 10;
        const g = letterGrade(pct);
        const col = courseworkColor(pct);
        const cycBand = subjCycleBand(sc, null, cycMax);
        return `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
            <td><span class="badge ${g.c}">${g.t}</span></td>
            <td><span class="badge ${col.c}">${col.t}</span></td>
            <td>${examResultBadgeHtml(sc.examInitial)}</td>
            <td>${examResultBadgeHtml(sc.examFinal)}</td>
          </tr>`;
      }).join('');
    } else if(isG3G6ReportCardCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const isEndYear = type==='endyear';
      const examLabel = isEndYear ? 'Second Term Exam Paper' : 'First Term Exam Paper';
      const termTotalLabel = isEndYear ? 'Term 2 (Total)' : 'Term 1 (Total)';
      tableHeadHtml = `
        <tr>
          <th class="subject-th">Subject</th>
          <th>Total<br>Coursework<br><small>(Max. 40)</small></th>
          <th>${examLabel}<br><small>(Max. 60)</small></th>
          <th>${termTotalLabel}<br><small>(Max. 100)</small></th>
          ${isEndYear ? `<th>Year<br>Average<br><small>(Max. 100)</small></th>` : ''}
          <th>Grade</th>
        </tr>`;
      tableBodyHtml = (() => {
        let rowsHtmlArr = [];
        let runningTermTotal = 0;
        let runningYearAvg = 0;
        let subjectCount = 0;
        subjects.forEach(sub=>{
          subjectCount++;
          const { sc, t } = withCertState(sub, ()=>{
            const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
            return { sc, t: computePrimaryTotals(sc) };
          });
          const examVal = (sc.examPaper===null||sc.examPaper===undefined||sc.examPaper==='') ? 0 : (parseFloat(sc.examPaper)||0);
          const termTotal = t.totalCoursework + examVal;
          runningTermTotal += termTotal;
          let yearAvgCellHtml = '';
          let gradeBasis = termTotal;
          if(isEndYear){
            const { sc: sc1, t: t1 } = withCertStateTermPeriod(sub, 'term1', ()=>{
              const sc1 = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
              return { sc: sc1, t: computePrimaryTotals(sc1) };
            });
            const examVal1 = (sc1.examPaper===null||sc1.examPaper===undefined||sc1.examPaper==='') ? 0 : (parseFloat(sc1.examPaper)||0);
            const term1Total = t1.totalCoursework + examVal1;
            const yearAvg = (term1Total + termTotal) / 2;
            runningYearAvg += yearAvg;
            gradeBasis = yearAvg;
            yearAvgCellHtml = `<td class="qavg-cell">${Math.round(yearAvg*10)/10}</td>`;
          }
          const g = isEndYear
            ? yearResultLetterGrade(Math.round(gradeBasis*10)/10, examVal, 60)
            : letterGrade(Math.round(gradeBasis*10)/10);
          const cycBand = subjCycleBand(sc, null, cycMax);
          rowsHtmlArr.push(`
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            <td class="qavg-cell">${Math.round(t.totalCoursework*10)/10}</td>
            <td>${(sc.examPaper===null||sc.examPaper===undefined||sc.examPaper==='') ? '' : sc.examPaper}</td>
            <td class="total-cell">${Math.round(termTotal*10)/10}</td>
            ${yearAvgCellHtml}
            <td><span class="badge ${g.c}">${g.t}</span></td>
          </tr>`);
          // Highlighted subtotal row right after Social Studies — sums the last column
          // (Year Average for the End-of-Year certificate, Term Total otherwise) for every
          // subject listed above it (the core/basic subjects: Arabic through Social Studies).
          if(sub==='Social Studies'){
            const sumVal = isEndYear ? runningYearAvg : runningTermTotal;
            const sumMax = subjectCount * 100;
            const sumPct = Math.round((sumVal / sumMax * 100) * 10) / 10;
            const gTotal = letterGrade(sumPct);
            rowsHtmlArr.push(`
          <tr class="cert-subtotal-row">
            <td><b>Total</b></td>
            <td></td>
            <td></td>
            ${isEndYear
              ? `<td></td><td class="total-cell"><b>${Math.round(runningYearAvg*10)/10}</b></td>`
              : `<td class="total-cell"><b>${Math.round(runningTermTotal*10)/10}</b></td>`}
            <td><span class="badge ${gTotal.c}">${gTotal.t}</span></td>
          </tr>`);
          }
        });
        return rowsHtmlArr.join('');
      })();
    } else if(isPrepG78ReportCardCert){
      showGradingKey = true; // always show Grading Key on every certificate
      const isEndYear = type==='endyear';
      const termSuffix = isEndYear ? 'T2' : 'T1';
      const examLabel = isEndYear ? 'Second Term Exam Paper' : 'First Term Exam Paper';
      tableHeadHtml = isG9ReportCardCert ? `
        <tr>
          <th class="subject-th">Subject</th>
          ${isEndYear ? `
          <th>Max. / Min.<br><small>Actual (T2)</small></th>
          <th>Term 2</th>
          <th>Max. / Min.<br><small>Year Average</small></th>
          <th>Year<br>Average</th>` : `
          <th>Max. / Min.<br><small>Actual</small></th>
          <th>Term 1</th>`}
          <th>Grade</th>
        </tr>` : `
        <tr>
          <th class="subject-th">Subject</th>
          ${isEndYear ? `<th>Actual<br>Mark (T1)</th>` : ''}
          <th>Total<br>Coursework ${termSuffix}<br><small>(Max. 70)</small></th>
          <th>${examLabel}<br><small>(Max. 30)</small></th>
          <th>Total ${termSuffix}<br><small>(Max. 100)</small></th>
          ${isEndYear ? `
          <th>Max. / Min.<br><small>Actual (T2)</small></th>
          <th>Actual<br>Mark (T2)</th>
          <th>Max. / Min.<br><small>Year Average</small></th>
          <th>Year<br>Average</th>` : `
          <th>Max. / Min.<br><small>Actual</small></th>
          <th>Actual<br>Mark (T1)</th>`}
          <th>Grade</th>
        </tr>`;
      tableBodyHtml = (() => {
        let rowsHtmlArr = [];
        let runningTermTotal = 0;
        let runningYearAvg = 0;
        let runningActualMark = 0;
        let runningActualMark1 = 0;
        let runningActualMark2 = 0;
        let subjectCount = 0;
        // Secondary G10/G11 uses its own Max./Min. Actual Mark scale & core-subject list
        // (Arabic → Philosophy) instead of the Prep ones (Arabic → Social Studies).
        const actualMarkMap = isSecG1011ReportCardCert ? SEC_ACTUAL_MARK_MAP : PREP_ACTUAL_MARK_MAP;
        const actualMarkCoreSubjects = isSecG1011ReportCardCert ? SEC_ACTUAL_MARK_CORE_SUBJECTS : PREP_ACTUAL_MARK_CORE_SUBJECTS;
        const lastCoreSubject = actualMarkCoreSubjects[actualMarkCoreSubjects.length-1];
        subjects.forEach(sub=>{
          subjectCount++;
          const { sc, t } = withCertState(sub, ()=>{
            const sc = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
            return { sc, t: computePrimaryTotals(sc) };
          });
          const examVal = (sc.examPaper===null||sc.examPaper===undefined||sc.examPaper==='') ? 0 : (parseFloat(sc.examPaper)||0);
          const termTotal = t.totalCoursework + examVal;
          runningTermTotal += termTotal;
          let gradeBasis = termTotal;
          let term1Total = null;
          if(isEndYear){
            const { sc: sc1, t: t1 } = withCertStateTermPeriod(sub, 'term1', ()=>{
              const sc1 = (scores[subjKey()]||{})[student.id] || emptyScoreObj();
              return { sc: sc1, t: computePrimaryTotals(sc1) };
            });
            const examVal1 = (sc1.examPaper===null||sc1.examPaper===undefined||sc1.examPaper==='') ? 0 : (parseFloat(sc1.examPaper)||0);
            term1Total = t1.totalCoursework + examVal1;
            const yearAvg = (term1Total + termTotal) / 2;
            runningYearAvg += yearAvg;
            gradeBasis = yearAvg;
          }
          const g = isEndYear
            ? yearResultLetterGrade(Math.round(gradeBasis*10)/10, examVal, 30)
            : letterGrade(Math.round(gradeBasis*10)/10);
          // Actual Mark: converts each term's total (always out of 100) into this subject's own Max./Min. scale.
          const actualRange = actualMarkMap[sub] || null;
          let actualMarkCellsHtml = '<td></td><td></td>';
          let yearAvgCellHtml = '';
          let actualMark1CellHtml = '<td></td>';
          if(actualRange){
            if(isEndYear){
              const actualMark1 = (term1Total / 100) * actualRange.max;
              const actualMark2 = (termTotal / 100) * actualRange.max;
              const yearAvgActual = (actualMark1 + actualMark2) / 2;
              if(actualMarkCoreSubjects.includes(sub)){
                runningActualMark1 += actualMark1;
                runningActualMark2 += actualMark2;
              }
              actualMark1CellHtml = `<td class="qavg-cell">${Math.round(actualMark1*10)/10}</td>`;
              actualMarkCellsHtml = `
            <td class="maxmin-cell"><div class="maxmin-max">${actualRange.max}</div><div class="maxmin-sep"></div><div class="maxmin-min">${actualRange.min}</div></td>
            <td class="qavg-cell">${Math.round(actualMark2*10)/10}</td>`;
              yearAvgCellHtml = `
            <td class="maxmin-cell"><div class="maxmin-max">${actualRange.max}</div><div class="maxmin-sep"></div><div class="maxmin-min">${actualRange.min}</div></td>
            <td class="total-cell">${Math.round(yearAvgActual*10)/10}</td>`;
            } else {
              const actualMark = (gradeBasis / 100) * actualRange.max;
              if(actualMarkCoreSubjects.includes(sub)) runningActualMark += actualMark;
              actualMarkCellsHtml = `
            <td class="maxmin-cell"><div class="maxmin-max">${actualRange.max}</div><div class="maxmin-sep"></div><div class="maxmin-min">${actualRange.min}</div></td>
            <td class="qavg-cell">${Math.round(actualMark*10)/10}</td>`;
            }
          } else if(isEndYear){
            actualMarkCellsHtml = '<td></td><td></td>';
            yearAvgCellHtml = '<td></td><td></td>';
          }
          const cycBand = subjCycleBand(sc, null, cycMax);
          rowsHtmlArr.push(isG9ReportCardCert ? `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            ${actualMarkCellsHtml}
            ${yearAvgCellHtml}
            <td><span class="badge ${g.c}">${g.t}</span></td>
          </tr>` : `
          <tr${rowBandAttr(cycBand)}>
            <td>
              ${subjCellHtml(sub, cycBand)}
            </td>
            ${isEndYear ? actualMark1CellHtml : ''}
            <td class="qavg-cell">${Math.round(t.totalCoursework*10)/10}</td>
            <td>${(sc.examPaper===null||sc.examPaper===undefined||sc.examPaper==='') ? '' : sc.examPaper}</td>
            <td class="total-cell">${Math.round(termTotal*10)/10}</td>
            ${actualMarkCellsHtml}
            ${yearAvgCellHtml}
            <td><span class="badge ${g.c}">${g.t}</span></td>
          </tr>`);
          // Highlighted subtotal row right after the last core subject (Social Studies for Prep,
          // Philosophy for Secondary G10/G11) — sums the last column (Year Average for the
          // End-of-Year certificate, Term Total otherwise) for every subject listed above it
          // (the core/basic subjects only: Arabic through Social Studies / Arabic through Philosophy).
          if(sub===lastCoreSubject){
            const sumVal = isEndYear ? runningYearAvg : runningTermTotal;
            const sumMax = subjectCount * 100;
            const sumPct = Math.round((sumVal / sumMax * 100) * 10) / 10;
            const gTotal = letterGrade(sumPct);
            const coreMax = actualMarkCoreSubjects.reduce((s,name)=> s + actualMarkMap[name].max, 0);
            const coreMin = actualMarkCoreSubjects.reduce((s,name)=> s + actualMarkMap[name].min, 0);
            const totalMaxMinCellHtml = `<td class="maxmin-cell"><div class="maxmin-max"><b>${coreMax}</b></div><div class="maxmin-sep"></div><div class="maxmin-min"><b>${coreMin}</b></div></td>`;
            const totalMaxMinYearCellHtml = totalMaxMinCellHtml;
            const runningActualMarkYearAvg = (runningActualMark1 + runningActualMark2) / 2;
            rowsHtmlArr.push(isG9ReportCardCert ? `
          <tr class="cert-subtotal-row">
            <td><b>Total</b></td>
            ${isEndYear ? `
            ${totalMaxMinCellHtml}
            <td class="total-cell"><b>${Math.round(runningActualMark2*10)/10}</b></td>
            ${totalMaxMinYearCellHtml}
            <td class="total-cell"><b>${Math.round(runningActualMarkYearAvg*10)/10}</b></td>` : `
            ${totalMaxMinCellHtml}
            <td class="total-cell"><b>${Math.round(runningActualMark*10)/10}</b></td>`}
            <td><span class="badge ${gTotal.c}">${gTotal.t}</span></td>
          </tr>` : `
          <tr class="cert-subtotal-row">
            <td><b>Total</b></td>
            ${isEndYear ? `<td class="total-cell"><b>${Math.round(runningActualMark1*10)/10}</b></td>` : ''}
            <td></td>
            <td></td>
            ${isEndYear ? `
            <td></td>
            ${totalMaxMinCellHtml}
            <td class="total-cell"><b>${Math.round(runningActualMark2*10)/10}</b></td>
            ${totalMaxMinYearCellHtml}
            <td class="total-cell"><b>${Math.round(runningActualMarkYearAvg*10)/10}</b></td>` : `
            <td class="total-cell"><b>${Math.round(runningTermTotal*10)/10}</b></td>
            ${totalMaxMinCellHtml}
            <td class="total-cell"><b>${Math.round(runningActualMark*10)/10}</b></td>`}
            <td><span class="badge ${gTotal.c}">${gTotal.t}</span></td>
          </tr>`);
          }
        });
        return rowsHtmlArr.join('');
      })();
    } else {
      const rowsHtml = subjects.map(sub=>{
        const r = certSubjectResult(sub, student.id, type);
        if(!r.applicable){
          return `<tr><td>${escapeXml(subjectWithIcon(sub))}</td><td colspan="3" style="color:var(--ink-soft);">Not applicable outside Primary Stage</td></tr>`;
        }
        if(!r.hasVal){
          return `<tr><td>${escapeXml(subjectWithIcon(sub))}</td><td>${r.max}</td><td>—</td><td>—</td></tr>`;
        }
        sumVal += r.val; sumMax += r.max;
        const pct = Math.round((r.val/r.max*100)*10)/10;
        const g = letterGrade(pct);
        return `
          <tr class="cert2-row-${g.c}">
            <td>${escapeXml(subjectWithIcon(sub))}</td>
            <td>${r.max}</td>
            <td>${Math.round(r.val*10)/10}</td>
            <td><span class="badge ${g.c}">${g.t==='Fail'?'Weak':g.t}</span></td>
          </tr>`;
      }).join('');
      const totalPct = sumMax ? Math.round((sumVal/sumMax*100)*10)/10 : 0;
      const totalGrade = sumMax ? letterGrade(totalPct) : null;
      const totalRow = sumMax ? `
        <tr class="cert2-total-row">
          <td>TOTAL</td>
          <td>${sumMax}</td>
          <td>${Math.round(sumVal*10)/10}</td>
          <td>${totalGrade ? `<span class="badge ${totalGrade.c}">${totalGrade.t==='Fail'?'Weak':totalGrade.t}</span>` : '—'}</td>
        </tr>` : '';
      tableHeadHtml = `<tr><th class="subject-th">SUBJECTS</th><th>MAX. MARKS</th><th>MARKS OBTAINED</th><th>GRADE</th></tr>`;
      tableBodyHtml = rowsHtml + totalRow;
    }

    // Long names get a smaller script font-size so they never overflow the card width
    // (Brush Script's swashes/descenders are wide, so this stays conservative).
    const nameLen = (student.name||'').length;
    const nameFontSize = nameLen > 34 ? 26 : nameLen > 28 ? 30 : nameLen > 22 ? 36 : nameLen > 16 ? 42 : 44;
    const CERT_CORNER_SVG = `<svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4 C4 20 4 36 22 40 C30 42 36 40 40 38" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 4 C16 6 22 12 24 24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.55"/><circle cx="4" cy="4" r="2.4" fill="currentColor"/></svg>`;
    const CERT_SEAL_STAR_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5 L14.6 9 L21.5 9.4 L16 13.8 L17.9 20.5 L12 16.6 L6.1 20.5 L8 13.8 L2.5 9.4 L9.4 9 Z" fill="currentColor"/></svg>`;
    const CERT_DIVIDER_ORNAMENT_SVG = `<svg viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="2" cy="7" r="1.6" fill="currentColor"/><path d="M11 1 L17 7 L11 13 L5 7 Z" fill="currentColor"/><circle cx="20" cy="7" r="1.6" fill="currentColor"/></svg>`;

    return `
    <div class="cert2-outer cert2-print-page">
      <div class="cert2-card">
        <div class="cert2-ribbon">
          <div class="star">${CERT_SEAL_STAR_SVG}</div>
          <div class="div"></div>
          <div class="txt">MILS - Innovate to Elevate</div>
        </div>
        <div class="cert2-watermark"><img src="${MILS_LOGO_B64}" alt=""></div>
        <span class="cert2-corner tl">${CERT_CORNER_SVG}</span>
        <span class="cert2-corner tr">${CERT_CORNER_SVG}</span>
        <span class="cert2-corner bl">${CERT_CORNER_SVG}</span>
        <span class="cert2-corner br">${CERT_CORNER_SVG}</span>
        <div class="cert2-inner">
        <div class="cert2-head">
          <img src="${MILS_LOGO_B64}" alt="MILS logo">
          <div class="titles">
            <h1>MADINATY INTEGRATED LANGUAGE SCHOOLS</h1>
            <p class="sub">${escapeHtml(cardTitle)}</p>
          </div>
          <img src="${EEP_LOGO_B64}" alt="Egypt Education Platform logo">
        </div>
        <div class="cert2-divider"><span class="line"></span><span class="ornament">${CERT_DIVIDER_ORNAMENT_SVG}</span><span class="line"></span></div>

        <div class="cert2-name-block">
          <div class="lbl">This certifies the marks obtained by</div>
          <div class="name" style="font-size:${nameFontSize}px;">${escapeXml(student.name)}</div>
        </div>

        <div class="cert2-infobox">
          <div class="cell"><b>ACADEMIC YEAR</b><span>${ACADEMIC_YEAR_LABEL}</span></div>
          <div class="cell"><b>STUDENT ID</b><span>${student.displayId||'—'}</span></div>
          <div class="cell"><b>GRADE &amp; SECTION</b><span>${gradeLabel} / ${escapeXml(student.classroom||'—')}</span></div>
          <div class="cell"><b>DATE</b><span>${dateStr}</span></div>
        </div>

        <div class="cert2-table-wrap${(isJuniorMonthCert || isG3G6MonthCert || isPrepG78MonthCert || isPrepG78CourseworkCert || isG3G6CourseworkCert || isG3G6ReportCardCert || isJuniorCourseworkCert || isJuniorReportCardCert || isPrepG78ReportCardCert) ? ' cert-subjects-wrap' : ''}">
          <table class="${(isJuniorMonthCert || isG3G6MonthCert || isPrepG78MonthCert || isPrepG78CourseworkCert || isG3G6CourseworkCert || isG3G6ReportCardCert || isJuniorCourseworkCert || isJuniorReportCardCert || isPrepG78ReportCardCert) ? 'cert-subjects' : 'cert2-table'}"
            <thead>
              ${tableHeadHtml}
            </thead>
            <tbody>${tableBodyHtml}</tbody>
          </table>
        </div>

        ${showGradingKey ? `
        <div class="cert2-key">
          <span class="lbl">GRADING KEY</span>
          <span class="chips">
            <span class="chip badge excellent"><span class="chip-label">Excellent</span><small>85% - 100%</small></span>
            <span class="chip badge vgood"><span class="chip-label">V.Good</span><small>75% - 84.9%</small></span>
            <span class="chip badge good"><span class="chip-label">Good</span><small>65% - 74.9%</small></span>
            <span class="chip badge pass"><span class="chip-label">Pass</span><small>50% - 64.9%</small></span>
            <span class="chip badge fail"><span class="chip-label">Weak</span><small>0% - 49.9%</small></span>
          </span>
        </div>` : ''}

        <div class="cert2-relnote">The minimum passing grade in Religious Education is 70%.</div>

        <div class="cert2-signrow">
          <div class="box">
            <div class="sig-line">HOS</div>
            <div class="sig-name">${hosName ? escapeHtml(hosName) : '&nbsp;'}</div>
          </div>
          <div class="divider"></div>
          <div class="box date-box">
            <div class="sig-line">Date</div>
            <div class="sig-name">${dateStr}</div>
          </div>
          <div class="divider"></div>
          <div class="box">
            <div class="sig-line">${escapeHtml(principalTitle)}</div>
            <div class="sig-name">${escapeHtml(principalName)}</div>
          </div>
        </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Handles edits to the Initial Exam / Final Exam fields on the Grade 1 & 2 First Term Report
// Card certificate. These are manually entered per subject (free text, with Pass/Fail
// suggested via the datalist) and are stored on the subject's score object so they persist
// like every other mark, keyed by the certificate's own Term/Section/Stage/Grade/Class scope.

/* ================== MARK ENTRY REPORT ================== */
// Roster filtered down to only the students a given subject actually applies to
// (Second Language subjects, and Religion / Ch-Religion), independent of state.subject.
function filterRosterForSubject(roster, subject, section){
  section = section || 'en';
  if(isLanguageSubject(subject)){
    const expectedLang = getExpectedLang2ForSubject(subject, section);
    if(expectedLang) return roster.filter(s=> s.lang2 === expectedLang);
  }
  if(subject === 'Ch-Religion') return roster.filter(s=> s.religion === 'Christian');
  if(subject === 'Religion') return roster.filter(s=> s.religion === 'Muslim');
  return roster;
}

// Every gradable item recorded across a full Term (both Month 1 & Month 2 mark-entry
// screens, plus Cycles / Activity / Skills, or Month1/Month2/Mid-Year/Final Exam outside
// Primary Stage) — this is what the Mark Entry Report tracks completion for.
function markEntryFields(stage, junior){
  if(stage==='primary'){
    if(junior){
      return [
        {key:'m1E1', label:'Month 1 — Q.1'}, {key:'m1E2', label:'Month 1 — Q.2'}, {key:'m1E3', label:'Month 1 — Q.3'}, {key:'m1E4', label:'Month 1 — Q.4'},
        {key:'m1CW', label:'Month 1 — C.W.'}, {key:'m1Hw', label:'Month 1 — H.W.'}, {key:'m1Oral', label:'Month 1 — Oral'}, {key:'m1Beh', label:'Month 1 — Beh. & Attend.'},
        {key:'m2E1', label:'Month 2 — Q.1'}, {key:'m2E2', label:'Month 2 — Q.2'}, {key:'m2E3', label:'Month 2 — Q.3'}, {key:'m2E4', label:'Month 2 — Q.4'},
        {key:'m2CW', label:'Month 2 — C.W.'}, {key:'m2Hw', label:'Month 2 — H.W.'}, {key:'m2Oral', label:'Month 2 — Oral'}, {key:'m2Beh', label:'Month 2 — Beh. & Attend.'},
        {key:'activity', label:'Activity'}, {key:'tasks', label:'Skills'}
      ];
    }
    return [
      {key:'m1E1', label:'Month 1 — Q.1'}, {key:'m1E2', label:'Month 1 — Q.2'}, {key:'m1E3', label:'Month 1 — Q.3'}, {key:'m1E4', label:'Month 1 — Q.4'},
      {key:'m1Hw', label:'Month 1 — H.W.'}, {key:'m1Beh', label:'Month 1 — Beh. & Attend.'}, {key:'m1Cycle', label:'Cycle 1'},
      {key:'m2E1', label:'Month 2 — Q.1'}, {key:'m2E2', label:'Month 2 — Q.2'}, {key:'m2E3', label:'Month 2 — Q.3'}, {key:'m2E4', label:'Month 2 — Q.4'},
      {key:'m2Hw', label:'Month 2 — H.W.'}, {key:'m2Beh', label:'Month 2 — Beh. & Attend.'}, {key:'m2Cycle', label:'Cycle 2'},
      {key:'activity', label:'Activity'}, {key:'tasks', label:'Performance Tasks'}
    ];
  }
  // Prep & Secondary Stage
  return [
    {key:'m1', label:'Month 1'}, {key:'m2', label:'Month 2'}, {key:'mid', label:'Mid-Year'}, {key:'final', label:'Final Exam'}
  ];
}

// Color-codes a completion percentage the same way across the report (green = done,
// blue = good progress, amber = partial, red = largely missing).
function markEntryColor(pct){
  if(pct>=95) return { bg:'var(--green-bg)', fg:'var(--green)' };
  if(pct>=75) return { bg:'var(--blue-bg)',  fg:'var(--blue)'  };
  if(pct>=50) return { bg:'var(--amber-bg)', fg:'var(--amber)' };
  return { bg:'var(--red-bg)', fg:'var(--red)' };
}

function renderMarkEntryReport(){
  const holder = document.getElementById('markEntryTableHolder');
  const roster = getClassRoster();

  if(roster.length===0){
    const msg = emptyRosterMessage();
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>${msg.title}</h3>
        <p>${msg.body}</p>
      </div>`;
    return;
  }

  const stage = state.stage;
  const junior = isJuniorPrimary();
  const fields = markEntryFields(stage, junior);
  const subjects = getSubjectsForStageAndSection(stage, state.section);
  const term = state.termPeriod || 'term1';
  const ck = classKey();

  let grandEntered = 0, grandTotal = 0;
  const subjectBlocks = [];

  subjects.forEach(subject=>{
    const filteredRoster = filterRosterForSubject(roster, subject, state.section);
    // A subject that doesn't apply to any student in this class (e.g. French for an
    // all-German class) is left out of the report entirely.
    if(!filteredRoster.length) return;

    const sk = `${ck}|${term}|${subject}`;
    const subjScores = scores[sk] || {};
    let subjEntered = 0, subjTotal = 0;

    const fieldRows = fields.map(f=>{
      let entered = 0;
      filteredRoster.forEach(s=>{
        const sc = subjScores[s.id];
        const raw = sc ? sc[f.key] : null;
        if(raw!==null && raw!==undefined && raw!==''){ entered++; }
      });
      const total = filteredRoster.length;
      const empty = total - entered;
      subjEntered += entered; subjTotal += total;
      grandEntered += entered; grandTotal += total;
      const pct = total ? Math.round((entered/total*100)*10)/10 : 0;
      return { label:f.label, entered, total, empty, pct };
    });

    const subjPct = subjTotal ? Math.round((subjEntered/subjTotal*100)*10)/10 : 0;
    const teacherName = findSubjectTeacherName(state.section, subject, state.term);
    subjectBlocks.push({ subject, fieldRows, subjEntered, subjTotal, subjEmpty: subjTotal-subjEntered, subjPct, teacherName });
  });

  if(!subjectBlocks.length){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">ℹ️</div>
        <h3>No applicable subjects</h3>
        <p>None of this stage's subjects apply to the students currently in this class.</p>
      </div>`;
    return;
  }

  const overallPct = grandTotal ? Math.round((grandEntered/grandTotal*100)*10)/10 : 0;
  const overallColor = markEntryColor(overallPct);
  const overallEmpty = grandTotal - grandEntered;

  let bodyRows = '';
  subjectBlocks.forEach(block=>{
    const rowspan = block.fieldRows.length + 1;
    const subjColor = markEntryColor(block.subjPct);
    block.fieldRows.forEach((fr, idx)=>{
      const c = markEntryColor(fr.pct);
      bodyRows += `<tr>`;
      if(idx===0){
        const teacherLine = block.teacherName ? `<small>${escapeHtml(block.teacherName)}</small>` : '';
        bodyRows += `<td class="me-subject-cell" rowspan="${rowspan}">${escapeHtml(block.subject)}${teacherLine}<small>${block.subjPct}% complete</small></td>`;
      }
      bodyRows += `
          <td class="me-item-cell">${escapeHtml(fr.label)}</td>
          <td class="me-entry-count"><b>${fr.entered}</b><span>/ ${fr.total}</span></td>
          <td class="me-missing"><span class="me-missing-badge ${fr.empty===0?'is-clear':'is-missing'}">${fr.empty}</span></td>
          <td class="me-progress-cell" style="--me-progress:${fr.pct}%;--me-progress-color:${c.fg};">
            <div class="me-progress-track"><span></span></div><b>${fr.pct}%</b>
          </td>
        </tr>`;
    });
    bodyRows += `
        <tr class="me-subtotal-row">
          <td class="me-item-cell">Subject Total</td>
          <td class="me-entry-count"><b>${block.subjEntered}</b><span>/ ${block.subjTotal}</span></td>
          <td class="me-missing"><span class="me-missing-badge ${block.subjEmpty===0?'is-clear':'is-missing'}">${block.subjEmpty}</span></td>
          <td class="me-progress-cell" style="--me-progress:${block.subjPct}%;--me-progress-color:${subjColor.fg};">
            <div class="me-progress-track"><span></span></div><b>${block.subjPct}%</b>
          </td>
        </tr>`;
  });

  holder.innerHTML = `
    <div class="db-summary-row">
      <div class="db-stat-card"><div class="db-stat-num">${grandEntered}<small>/${grandTotal}</small></div><div class="db-stat-label">Cells Entered</div></div>
      <div class="db-stat-card" style="color:${overallColor.fg}"><div class="db-stat-num">${overallPct}%</div><div class="db-stat-label">Overall Completion</div></div>
      <div class="db-stat-card" style="color:var(--red)"><div class="db-stat-num">${overallEmpty}</div><div class="db-stat-label">Empty Cells</div></div>
      <div class="db-stat-card"><div class="db-stat-num">${subjectBlocks.length}</div><div class="db-stat-label">Subjects Tracked</div></div>
    </div>
    <table class="mark-entry-table">
      <thead>
        <tr>
          <th>Subject</th>
          <th>Item</th>
          <th>Entries</th>
          <th>Missing</th>
          <th>Completion</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="foot-note">
      Tracks how many students have a mark recorded for each item, across every Month 1 / Month 2 / Cycle item (Primary Stage) or Month 1 / Month 2 / Mid-Year / Final Exam column (Prep &amp; Secondary Stage) of the ${escapeHtml(TERM_LABELS[term]||term)} data for this class.
      Subjects that don't apply to any student in this class (e.g. a Second Language nobody takes) are left out.
    </p>`;
}


/* ================== FIRST MONTH REPORT — CERTIFICATE ================== */
/* Grade 3 Primary (any Section), or Grade 4/5/6 Primary — English Section only.
   Each design must match its approved certificate exactly. */
const ACADEMIC_YEAR_LABEL = "2026 - 2027";
const PRINCIPAL_NAME = "Maha El-Khamissy";
const HOS_NAME = "";
let certStudentId = null;

// Looks up the School Admin Structure (Configuration ▸ School Admin Structure) for the best
// matching signatory for a given Section + Stage, so certificates can show the right person's
// name/title instead of always defaulting to the Principal. If roleKeyword is given, only
// members whose Position contains that keyword (case-insensitive, e.g. "hos" matches "HOS" or
// "Head of Section", "principal" matches "School Principal") are considered — this keeps an
// HOS entry from being picked up for the Principal signature box (or vice versa) just because
// it happens to match the Section/Stage more specifically. Priority within that pool: an entry
// scoped to both this exact Section+Stage > this Section only (any Stage) > this Stage only
// (any Section) > a fully general entry (no Section/Stage set). Returns null if the School
// Admin Structure hasn't been set up yet (or has no matching role), so callers can fall back
// to their own default (e.g. PRINCIPAL_NAME).
function findAdminStructureSignatory(section, stage, roleKeyword){
  const members = (typeof adminStructure!=='undefined' && adminStructure && Array.isArray(adminStructure.members)) ? adminStructure.members : [];
  if(!members.length) return null;
  const pool = roleKeyword
    ? members.filter(m=> String(m.position||'').toLowerCase().includes(String(roleKeyword).toLowerCase()))
    : members;
  if(!pool.length) return null;
  return pool.find(m=> m.section===section && m.stage===stage)
    || pool.find(m=> m.section===section && !m.stage)
    || pool.find(m=> !m.section && m.stage===stage)
    || pool.find(m=> !m.section && !m.stage)
    || null;
}

function getRoster(){
  const ck = classKey();
  if(!students[ck]) students[ck]=[];
  return students[ck];
}
function getScoreMap(){
  const sk = subjKey();
  if(!scores[sk]) scores[sk]={};
  return scores[sk];
}
function uid(){ return 's'+Math.random().toString(36).slice(2,10); }
function escapeHtml(text){
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function toggleAddForm(force){
  const el = document.getElementById('addForm');
  const show = force!==undefined ? force : !el.classList.contains('show');
  el.classList.toggle('show', show);
  if(show){ document.getElementById('newName').value=''; document.getElementById('newClassroom').value=''; document.getElementById('newName').focus(); }
}

function addStudentManual(){
  const name = document.getElementById('newName').value.trim();
  const classroom = document.getElementById('newClassroom').value.trim();
  const religion = document.getElementById('newReligion').value;
  const lang2 = document.getElementById('newLang2').value;
  if(!name){ alert('Please enter the student name'); return; }
  getRoster().push({id:uid(), displayId: nextDisplayId(), name, classroom, religion, lang2});
  document.getElementById('newName').value = '';
  document.getElementById('newClassroom').value = '';
  document.getElementById('newReligion').value = '-';
  document.getElementById('newLang2').value = '-';
  toggleAddForm(false);
  renderTable();
  saveState();
  logActivity('add', `Added student "${name}" (${STAGES[state.stage].label}, ${state.term||'—'})`);
}

function deleteStudent(id){
  if(!confirm('Delete this student from the class list?')) return;
  const roster = getRoster();
  const idx = roster.findIndex(s=>s.id===id);
  const removedName = idx>-1 ? roster[idx].name : 'Unknown';
  if(idx>-1) roster.splice(idx,1);
  deleteAttendanceForStudent(id);
  renderTable();
  saveState();
  logActivity('delete', `Deleted student "${removedName}" from ${STAGES[state.stage].label}, ${state.term||'—'}`);
}

function showDeleteOptions(){
  if(!state.section || !state.stage || !state.grade || !state.term){
    alert('Please select a class first');
    return;
  }
  document.getElementById('deleteOptionsOverlay').classList.add('show');
}

function toggleSelectAll(){
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const checkboxes = document.querySelectorAll('input[name="studentCheckbox"]');
  checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
}

function deleteSelectedStudents(){
  const roster = getRoster();
  if(roster.length === 0){
    alert('لا توجد طلاب لحذفهم');
    closeOverlay();
    return;
  }
  
  const checkboxes = document.querySelectorAll('input[name="studentCheckbox"]:checked');
  if(checkboxes.length === 0){
    alert('يرجى تحديد طالب أو أكثر للحذف');
    return;
  }
  
  if(!confirm(`هل تريد حذف ${checkboxes.length} طالب(ة)?`)) return;
  
  const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
  
  idsToDelete.forEach(id => {
    const idx = roster.findIndex(s => s.id === id);
    if(idx > -1) roster.splice(idx, 1);
    
    // حذف الدرجات المرتبطة بهذا الطالب
    Object.keys(scores).forEach(sk => {
      if(sk.startsWith(classKey()+'|')){
        delete scores[sk][id];
      }
    });
    deleteAttendanceForStudent(id);
  });
  
  renderTable();
  saveState();
  closeOverlay();
  alert(`تم حذف ${idsToDelete.length} طالب(ة)`);
  logActivity('delete', `Deleted ${idsToDelete.length} selected student(s) from ${STAGES[state.stage].label}, ${state.term||'—'}`);
}

function deleteAllStudents(){
  const roster = getRoster();
  if(roster.length === 0){
    alert('لا توجد طلاب لحذفهم');
    closeOverlay();
    return;
  }
  
  if(!confirm(`تحذير: هل أنت متأكد من حذف جميع الـ ${roster.length} طالب(ة)؟`)) return;
  
  const classKey_ = classKey();

  // حذف جميع الطلاب
  const idsToRemove = roster.map(s=>s.id);
  roster.splice(0, roster.length);

  // حذف جميع الدرجات المرتبطة بهذا الفصل
  Object.keys(scores).forEach(sk => {
    if(sk.startsWith(classKey_+'|')){
      delete scores[sk];
    }
  });
  idsToRemove.forEach(id => deleteAttendanceForStudent(id));
  
  renderTable();
  saveState();
  closeOverlay();
  alert('تم حذف جميع الطلاب من هذا الفصل');
  logActivity('delete', `Deleted all ${idsToRemove.length} student(s) from ${STAGES[state.stage].label}, ${state.term||'—'}`);
}

// Grade 7 & 8 Prep (1st & 2nd Prep) First/End of Year Term Report Card certificate — per-subject
// conversion of the Term Total / Year Average (which is always out of 100) into that subject's own
// "Actual Mark" scale (Max./Min. below are the subject's real full mark & minimum pass mark).
// "Second lang." (French/German, whichever the student studies) shares the same Max./Min. as French.
const PREP_ACTUAL_MARK_MAP = {
  'Arabic':          { max: 40,  min: 20   },
  'English O.L.':    { max: 30,  min: 15   },
  'Mathematics':     { max: 30,  min: 15   },
  'Science':         { max: 20,  min: 10   },
  'Social Studies':  { max: 20,  min: 10   },
  'English A.L.':    { max: 25,  min: 12.5 },
  'French':          { max: 20,  min: 8    },
  'German':          { max: 20,  min: 8    },
  'Religion':        { max: 20,  min: 14   },
  'Ch-Religion':     { max: 20,  min: 14   },
  'Art':             { max: 20,  min: 10   },
  'ICT':             { max: 20,  min: 10   }
};
// Subjects summed into the "Total" subtotal row (Arabic → Social Studies): Max. 140 / Min. 70.
const PREP_ACTUAL_MARK_CORE_SUBJECTS = ['Arabic','English O.L.','Mathematics','Science','Social Studies'];

function prepActualMarkRange(sub){
  return PREP_ACTUAL_MARK_MAP[sub] || null;
}

// Grade 10 & 11 Secondary (1st & 2nd Secondary) First/End of Year Term Report Card certificate —
// same "Actual Mark" mechanism as Prep (PREP_ACTUAL_MARK_MAP above), but with the Secondary
// stage's own subjects & Max./Min. scale. "Second lang." (French/German, whichever the student
// studies) shares the same Max./Min. as French O.L. / French A.L. respectively.
const SEC_ACTUAL_MARK_MAP = {
  'Arabic':             { max: 100, min: 50 },
  'English O.L.':       { max: 100, min: 50 },
  'Mathematics':        { max: 100, min: 50 },
  'Integrated Sciences':{ max: 100, min: 50 },
  'History':            { max: 100, min: 50 },
  'Philosophy':         { max: 100, min: 50 },
  'English A.L.':       { max: 50,  min: 25 },
  'Religion':           { max: 100, min: 70 },
  'Ch-Religion':        { max: 100, min: 70 },
  'French O.L.':        { max: 40,  min: 20 },
  'German O.L.':        { max: 40,  min: 20 },
  'French A.L.':        { max: 40,  min: 16 },
  'German A.L.':        { max: 40,  min: 16 },
  'ICT':                { max: 100, min: 50 }
};
// Subjects summed into the "Total" subtotal row (Arabic → Philosophy): Max. 600 / Min. 300.
const SEC_ACTUAL_MARK_CORE_SUBJECTS = ['Arabic','English O.L.','Mathematics','Integrated Sciences','History','Philosophy'];

// Grade for a subject's Actual Mark: Fail if below that subject's Min.; otherwise Pass/Good/Very
// Good/Excellent using the normal percentage-of-Max. bands (50/65/75/85%).
function actualMarkLetterGrade(actual, range){
  if(actual < range.min) return {t:'Fail', c:'fail'};
  const pct = (actual/range.max)*100;
  if(pct>=85) return {t:'Excellent', c:'excellent'};
  if(pct>=75) return {t:'Very Good', c:'vgood'};
  if(pct>=65) return {t:'Good', c:'good'};
  return {t:'Pass', c:'pass'};
}

function letterGrade(pct){
  if(pct>=85) return {t:'Excellent', c:'excellent'};
  if(pct>=75) return {t:'Very Good', c:'vgood'};
  if(pct>=65) return {t:'Good', c:'good'};
  if(pct>=50) return {t:'Pass', c:'pass'};
  return {t:'Fail', c:'fail'};
}

// End-of-Year final result rule (Grades 3–11, all subjects, both Sections):
// a student only succeeds a subject's Year result if BOTH (1) their Second Term Exam
// Paper score is more than 30% of that paper's max mark, AND (2) their Year Average is
// at least 50%. Scoring 30% or less on the Second Term Exam Paper is an automatic Fail
// for that subject's Year result, regardless of how high the Year Average is.
// Used only for the End-of-Year (Year Average) grade badge — Term 1 Report Cards and
// every other grade (Coursework/Cycle/Month totals, Term totals, etc.) keep using
// letterGrade() unchanged.
function yearResultLetterGrade(yearAvgPct, examVal, examMax){
  if(examMax > 0){
    const examPct = (examVal/examMax)*100;
    if(examPct <= 30) return {t:'Fail', c:'fail'};
  }
  return letterGrade(yearAvgPct);
}

// Builds the "Subject" cell used on every Report Certificate row, framed in a colored border
// reflecting the level of that subject's own Cycle score — see cycleSubjBand()/cycleAvgForBand()
// below. bandClass is one of 'excellent'/'vgood'/'good'/'pass'/'fail' (or null/'' for no frame,
// e.g. no Cycle score entered yet).
function subjCellHtml(sub, bandClass){
  const band = bandClass ? ` subj-band subj-band-${bandClass}` : '';
  return `<div class="subj-cell${band}"><span>${escapeXml(subjectWithIcon(sub))}</span></div>`;
}

// Builds the class="" attribute for a certificate row's <tr>, giving it the embossed
// left/right edge frame (see .cyc-row-* CSS) matching the same band as subjCellHtml() above.
// Returns '' (no attribute) when bandClass is falsy (no Cycle score entered yet).
function rowBandAttr(bandClass){
  return bandClass ? ` class="cyc-row cyc-row-${bandClass}"` : '';
}

// Reads the subject's Cycle score(s) straight off its raw score object (sc), the same field(s)
// cycleCellHtml() displays. Pass mKeyOnly ('m1'/'m2') on Month 1/Month 2 certificates to use
// just that month's own Cycle; omit it (Coursework/Report Card certificates, which cover the
// whole term) to average Cycle 1 & Cycle 2 — using whichever one(s) are actually filled in, so
// a still-empty Cycle doesn't unfairly drag the average toward "Weak". Returns null if no Cycle
// score has been entered at all, so subjCellHtml() draws no frame rather than a misleading one.
function cycleAvgForBand(sc, mKeyOnly){
  const hasVal = v => v!==null && v!==undefined && v!=='';
  if(mKeyOnly){
    const v = sc[mKeyOnly+'Cycle'];
    return hasVal(v) ? parseFloat(v) : null;
  }
  const v1 = sc.m1Cycle, v2 = sc.m2Cycle;
  const has1 = hasVal(v1), has2 = hasVal(v2);
  if(!has1 && !has2) return null;
  if(has1 && has2) return (parseFloat(v1) + parseFloat(v2)) / 2;
  return parseFloat(has1 ? v1 : v2);
}

// Maps a Cycle score onto the same 5 band-class names used by letterGrade()/the printed
// Grading Key (excellent/vgood/good/pass/fail) — using the SAME 85/75/65/50% cutoffs shown
// in that key, applied to the score's percentage of `max` (default 5, but Grade 7-8 Prep and
// Grade 10-11 Secondary use Max.15 — see perfCycleMaxFor). Previously this reused CYCLE_BANDS'
// fixed raw-score cutoffs (4.5/4/3/2), which (a) don't line up with the 85/75/65/50% cutoffs
// printed on the certificate's own Grading Key — e.g. 4.49/5 (89.8%) showed as "V.Good" even
// though the key defines 85%+ as "Excellent" — and (b) assumed every Cycle is out of 5, so on
// Max.15 grades a score like 6/15 (40%, actually "Weak") cleared the >=4.5 "Excellent" cutoff.
function cycleSubjBand(v, max){
  if(v===null || v===undefined || isNaN(v)) return null;
  max = max || 5;
  const pct = (v/max)*100;
  if(pct>=85) return 'excellent';
  if(pct>=75) return 'vgood';
  if(pct>=65) return 'good';
  if(pct>=50) return 'pass';
  return 'fail';
}

// Convenience: given a raw score object + optional single-month key + the Cycle max that
// applies to this grade (5 or 15 — pass certCycleMax()/perfCycleMaxFor(stage,grade)),
// resolves straight to the band class subjCellHtml() expects.
function subjCycleBand(sc, mKeyOnly, max){
  return cycleSubjBand(cycleAvgForBand(sc, mKeyOnly), max);
}

// Color Code for Grade 1 & Grade 2 Primary Total Coursework (Term Total, Max. 100)
function courseworkColor(pct){
  if(pct>=85) return {t:'Blue', c:'color-blue'};
  if(pct>=65) return {t:'Green', c:'color-green'};
  if(pct>=50) return {t:'Yellow', c:'color-yellow'};
  return {t:'Red', c:'color-red'};
}

function clamp(v,max){
  v = parseFloat(v);
  if(isNaN(v)||v<0) v=0;
  if(v>max) v=max;
  return v;
}

// ===== Flexible Evaluation Maxima (الماكس المرن) — كل الصفوف =====
// هذه الحقول تحفظ النهايات العظمى المرنة للتقييمات الأربعة (Q.1–Q.4) لكل الصفوف
// التي لديها هذا النوع من التقييم (Grade 1-8, 10-11) — ما عدا Grade 9 الذي
// يستخدم نظام الـ Cycles بدلاً من الأسئلة الأربعة. Function/variable names below
// still say "grade3"/"g3" for historical reasons, but the feature they implement
// is no longer Grade-3-specific.
// Kept per SUBJECT (scoped the same way as `scores`, via subjKey() — Section |
// Stage | Grade | Term Period | Subject) so e.g. Math's Q.1–Q.4 maximums are
// completely independent of Science's, Arabic's, etc. Each subject unlocks and
// remembers its own set of four maximums.
let grade3FlexibleMaximaBySubject = {};
// One-time migration support: the OLD single global maxima (pre-per-subject),
// read once from its old storage key. If present, it's used only to SEED the
// very first subject that gets opened after this update — so no data is lost —
// but each subject still needs its own review/save since one shared number is
// now being split across many subjects.
let grade3LegacyMaxima = null;
function loadGrade3LegacyMaxima(){
  try{
    const raw = localStorage.getItem('grade3FlexibleMaxima_v1');
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed==='object' && Object.values(parsed).some(v=>isMaxSet(v))){
      grade3LegacyMaxima = parsed;
    }
  }catch(err){ console.warn('Could not read legacy (pre-per-subject) Grade 3 Quiz Max Scores', err); }
}
function emptyG3Maxima(){
  return {
    m1E1Max: null, m1E2Max: null, m1E3Max: null, m1E4Max: null,  // Month 1
    m2E1Max: null, m2E2Max: null, m2E3Max: null, m2E4Max: null   // Month 2
  };
}
// Returns (creating if needed) the maxima object for a given subject key
// (defaults to the CURRENTLY selected subject via subjKey()). The FIRST time a
// subject is touched, if old (pre-per-subject) maxima exist, they're carried
// over as a starting point (flagged _migrated so the box can nudge the teacher
// to double-check them) instead of leaving the subject blank/locked.
function g3MaximaFor(key){
  key = key || subjKey();
  if(!grade3FlexibleMaximaBySubject[key]){
    if(grade3LegacyMaxima){
      grade3FlexibleMaximaBySubject[key] = Object.assign(emptyG3Maxima(), grade3LegacyMaxima, {_migrated:true});
    } else {
      grade3FlexibleMaximaBySubject[key] = emptyG3Maxima();
    }
  }
  return grade3FlexibleMaximaBySubject[key];
}

// A Q.n maximum counts as "set" only once the teacher has typed a positive number in —
// the box no longer arrives pre-filled with 5, so this also drives the locked/inactive
// state of that Q.n column until a real value is entered.
function isMaxSet(max){
  return max !== null && max !== undefined && max !== '' && !isNaN(parseFloat(max)) && parseFloat(max) > 0;
}
function fmtMax(max){
  return isMaxSet(max) ? max : '—';
}

// Shared renderer for the "Set Quiz Max. Score" box (Month 1 / Month 2), used by
// both renderPrimaryMonth1Table and renderPrimaryMonth2Table so the two stay
// visually identical. `prefix` is 'm1' or 'm2'; `monthLabel` is 'Month 1' / 'Month 2'.
// Maxima are read/written for the CURRENTLY selected subject only (subjKey()) —
// switching subjects switches which set of four maximums is shown, so Math and
// Science (etc.) never share the same Q.1–Q.4 maximums.
function renderG3MaxBoxHtml(prefix, monthLabel){
  const subjectKey = subjKey();
  const maxima = g3MaximaFor(subjectKey);
  const keys = ['E1Max','E2Max','E3Max','E4Max'];
  const vals = keys.map(k => maxima[prefix+k]);
  const setCount = vals.filter(isMaxSet).length;
  const boxState = setCount===4 ? 'complete' : (setCount>0 ? 'partial' : 'incomplete');
  const headerIcon = boxState==='complete' ? '✅' : (boxState==='partial' ? '◐' : '⚠️');
  const migratedNote = maxima._migrated
    ? `<div class="g3-max-box-migrated">↺ These numbers were carried over from the old shared maximums — please check they're right for <b>${escapeHtml(subjectWithIcon(state.subject))}</b>, then Save.</div>`
    : '';
  const status = boxState==='complete' ? 'All Q.1–Q.4 columns are unlocked.'
               : boxState==='partial' ? `${setCount} of 4 set — each column unlocks as soon as its own max is entered.`
               : 'Set a question\'s max score to unlock that column below.';
  const chips = [1,2,3,4].map(n=>{
    const key = prefix + 'E' + n + 'Max';
    const v = maxima[key];
    const set = isMaxSet(v);
    return `
        <div class="g3-q-chip ${set ? 'g3-q-chip-set' : 'g3-q-chip-unset'}">
          <div class="g3-q-chip-top">
            <span class="g3-q-chip-label">Q.${n}</span>
            <span class="g3-q-chip-status">${set ? '✅' : '🔒'}</span>
          </div>
          <input type="number" min="1" max="100" placeholder="Max" value="${v===null?'':v}"
                 onchange="const mx=g3MaximaFor(); mx['${key}']=(this.value===''?null:parseFloat(this.value)); saveGrade3FlexibleMaxima(null, subjKey());">
        </div>`;
  }).join('');
  return `
    <div class="g3-max-box g3-max-box-${boxState}">
      <div class="g3-max-box-top">
        <div class="g3-max-box-header">
          <span class="g3-max-box-icon">${headerIcon}</span>
          <span>${monthLabel} - Set Quiz Max. Score <span class="g3-max-box-subject">· ${escapeHtml(subjectWithIcon(state.subject))}</span></span>
        </div>
      </div>
      ${migratedNote}
      <div class="g3-max-box-fields">${chips}</div>
      <div class="g3-max-box-status">${status}</div>
    </div>`;
}

// ===== Grade 3 Flexible Evaluation: persist Quiz Max Scores so they survive a
// reload and are available whenever a Grade 3 certificate is generated (the
// certificate headers below read directly from this same per-subject store,
// via g3MaximaFor(), so saving here is what "links" the max scores to the
// certificates). Stored as ONE object keyed by subject (subjKey()), so every
// subject keeps its own independent Q.1–Q.4 maximums. =====
const GRADE3_MAXIMA_LS_KEY = 'grade3FlexibleMaxima_v2';
function loadGrade3FlexibleMaxima(){
  loadGrade3LegacyMaxima();
  try{
    const raw = localStorage.getItem(GRADE3_MAXIMA_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed==='object') Object.assign(grade3FlexibleMaximaBySubject, parsed);
    }
  }catch(err){ console.warn('Could not load Grade 3 Quiz Max Scores', err); }
}
function saveGrade3FlexibleMaxima(btnEl, subjectKey){
  try{
    if(subjectKey && grade3FlexibleMaximaBySubject[subjectKey]) delete grade3FlexibleMaximaBySubject[subjectKey]._migrated;
    localStorage.setItem(GRADE3_MAXIMA_LS_KEY, JSON.stringify(grade3FlexibleMaximaBySubject));
    if(typeof flashInlineSaved === 'function' && btnEl) flashInlineSaved(btnEl);
    if(subjectKey) renderTable(true);
    // Quiz Max Scores used to live ONLY in this browser's localStorage, so edits
    // made here never reached Firestore and so never showed up on any other
    // device/browser — unlike every other Grade Book field, which syncs through
    // saveState()/pushMergedToFirestore(). Routing through markGradeBookUnsaved()
    // puts these edits on the same "unsaved changes -> Save button -> Firestore"
    // path as everything else, so pressing Save (or the reminder/auto-sync) now
    // pushes them too.
    if(typeof markGradeBookUnsaved === 'function') markGradeBookUnsaved();
  }catch(err){ console.warn('Could not save Grade 3 Quiz Max Scores', err); }
}

function emptyScoreObj(){
  // Grades/stages that have a "Beh. & Attend." column (Primary, and the extended Grade 7-8
  // Prep / Grade 10-11 Secondary layouts) start it filled in with its own maximum grade
  // (5 for Primary, 10 for the extended Prep/Secondary grades) instead of blank, so a class
  // whose attendance hasn't been recorded yet doesn't get penalized in its running Total.
  // Recording absences in the Absence tab (or editing the cell by hand) overwrites this default.
  if(isPrimary() || isExtendedGradingStage()){
    const behMax = isPrimary() ? 5 : 10;
    // Grade 1 & Grade 2 Primary: Activity (Max. 20) and Skills (Max. 5) start filled in with
    // full marks for every student, the same way Beh. & Attend. defaults to full marks — so a
    // class whose Activity/Skills haven't been recorded yet isn't penalized in its Term Total.
    // Grade 3-6 Primary: Activity (Max. 5) and Per. Tasks (Max. 10) default the same way.
    // Editing the cell by hand (Total Coursework Mark Entry screen) overwrites this default.
    const junior = isJuniorPrimary();
    const g3to6 = isPrimary() && !junior;
    return {
      m1E1:null, m1E2:null, m1E3:null, m1E4:null, m1Hw:null, m1Beh:behMax, m1Cycle:null, m1CycleAtt:'P', m1CW:null, m1Oral:null,
      m2E1:null, m2E2:null, m2E3:null, m2E4:null, m2Hw:null, m2Beh:behMax, m2Cycle:null, m2CycleAtt:'P', m2CW:null, m2Oral:null,
      activity: junior ? 20 : (g3to6 ? 5 : null), tasks: junior ? 5 : (g3to6 ? 10 : null), examPaper:null,
      // examInitial / examFinal: manually-entered Pass/Fail fields shown only on the Grade 1 & 2
      // First Term Report Card certificate (Initial Exam / Final Exam columns).
      examInitial:null, examFinal:null
    };
  }
  return {m1:null,m2:null,mid:null,final:null, examPaper:null, g9c1:null, g9c2:null};
}

// Average of only the entered (non-empty) values, ignoring blanks
function avgEntered(vals){
  const entered = vals.filter(v=> v!==null && v!==undefined && v!=='' && !isNaN(parseFloat(v)));
  if(entered.length===0) return 0;
  const sum = entered.reduce((a,b)=> a+parseFloat(b), 0);
  return sum/entered.length;
}

// ===== Grade 3 Flexible Evaluation: Convert percentage to 5 =====
// لحساب Q. Av من درجات مختلفة النهايات العظمى
// مثال: 4/5 = 80% => 4.0/5, و 8/12 = 66.67% => 3.33/5
function convertScoreTo5(score, maxScore){
  if(!score || score==='' || !maxScore || maxScore===0) return 0;
  const percentage = parseFloat(score) / parseFloat(maxScore);
  return percentage * 5;
}

// حساب Q. Av للـ Grade 3 بناءً على النهايات العظمى المرنة
function calculateGrade3QAv(e1, e2, e3, e4, isMonth2 = false){
  const prefix = isMonth2 ? 'm2' : 'm1';
  const m = g3MaximaFor();
  const e1Max = m[`${prefix}E1Max`];
  const e2Max = m[`${prefix}E2Max`];
  const e3Max = m[`${prefix}E3Max`];
  const e4Max = m[`${prefix}E4Max`];
  
  // تحويل كل درجة إلى نسبة من 5
  const scores = [
    convertScoreTo5(e1, e1Max),
    convertScoreTo5(e2, e2Max),
    convertScoreTo5(e3, e3Max),
    convertScoreTo5(e4, e4Max)
  ].filter(s=> s > 0);
  
  if(scores.length === 0) return 0;
  return scores.reduce((a,b)=> a+b, 0) / scores.length;
}

function computePrimaryTotals(sc){
  const junior = isJuniorPrimary();
  const g78 = isG7G8Prep();
  const g1011 = isG10G11Secondary();
  // Grade 3 (non-junior Primary) uses flexible, teacher-set Q.1–Q.4 maximums (Set Quiz
  // Max. Score box) instead of a fixed Max. 5 per question — so its Q.Av must be computed
  // with calculateGrade3QAv (which normalizes each score against ITS OWN max) rather than
  // a plain average of the raw entered numbers. Using plain avgEntered() here would silently
  // disagree with the Grade Book screen (and therefore with certificates/reports too) any
  // time a question's max isn't 5. This mirrors exactly what renderPrimaryMonth1Table /
  // renderPrimaryMonth2Table already do for the on-screen Q. Av. column.
  // Extended to every grade that has Q.1–Q.4 quiz fields (all Primary grades, Prep 7/8,
  // and Secondary 10/11) — Grade 9 has no Q.1–Q.4 fields at all (it uses Cycle 1/Cycle 2
  // instead) so it never reaches this function in the first place.
  const g3 = true;
  let avg1 = calculateGrade3QAv(sc.m1E1, sc.m1E2, sc.m1E3, sc.m1E4, false);
  let avg2 = calculateGrade3QAv(sc.m2E1, sc.m2E2, sc.m2E3, sc.m2E4, true);
  let month1Total, month2Total;

  if(junior){
    // Q. Av. is averaged out of 5 first (ignoring empty cells), then scaled x4 to become out of 20.
    avg1 = avg1 * 4;
    avg2 = avg2 * 4;
    month1Total = avg1 + (parseFloat(sc.m1CW)||0) + (parseFloat(sc.m1Hw)||0) + (parseFloat(sc.m1Oral)||0) + (parseFloat(sc.m1Beh)||0);
    month2Total = avg2 + (parseFloat(sc.m2CW)||0) + (parseFloat(sc.m2Hw)||0) + (parseFloat(sc.m2Oral)||0) + (parseFloat(sc.m2Beh)||0);
  } else if(g78){
    // Grade 7-8 Prep: Q. Av. is averaged (ignoring empty cells) then x4 to become out of 20.
    // Total 1/2 = Q. Av. (20) + C.W. (10) + Beh. (10) = Max. 40.
    avg1 = avg1 * 4;
    avg2 = avg2 * 4;
    month1Total = avg1 + (parseFloat(sc.m1CW)||0) + (parseFloat(sc.m1Beh)||0);
    month2Total = avg2 + (parseFloat(sc.m2CW)||0) + (parseFloat(sc.m2Beh)||0);
  } else if(g1011){
    // Grade 10-11 Secondary: Q. Av. is averaged (ignoring empty cells) then x3 to become out of 15.
    // Total 1/2 = Q. Av. (15) + C.W. (15) + Beh. (10) = Max. 40.
    avg1 = avg1 * 3;
    avg2 = avg2 * 3;
    month1Total = avg1 + (parseFloat(sc.m1CW)||0) + (parseFloat(sc.m1Beh)||0);
    month2Total = avg2 + (parseFloat(sc.m2CW)||0) + (parseFloat(sc.m2Beh)||0);
  } else {
    month1Total = avg1 + (parseFloat(sc.m1Hw)||0) + (parseFloat(sc.m1Beh)||0);
    month2Total = avg2 + (parseFloat(sc.m2Hw)||0) + (parseFloat(sc.m2Beh)||0);
  }

  const twoMonthsAvg = (month1Total + month2Total) / 2;
  const totalCycles = junior ? 0 : ((parseFloat(sc.m1Cycle)||0) + (parseFloat(sc.m2Cycle)||0));
  // Grade 7-8 Prep / Grade 10-11 Secondary Total Coursework = Two Months Av. (40) + Total Cycles (30) = Max. 70 (no Activity/Per. Tasks).
  const extended = g78 || g1011;
  const totalCoursework = extended
    ? (twoMonthsAvg + totalCycles)
    : (twoMonthsAvg + totalCycles + (parseFloat(sc.activity)||0) + (parseFloat(sc.tasks)||0));
  const maxTotal = junior ? 100 : (extended ? 70 : 40); // junior Term Total: Two Months Av.(75) + Activity(20) + Skills(5) = 100
  return { avg1, month1Total, avg2, month2Total, twoMonthsAvg, totalCycles, totalCoursework, maxTotal, junior, g78, g1011 };
}

function updateScore(studentId, field, value, max){
  if(isCurrentUserGradeEntryLocked()) return;
  const map = getScoreMap();
  if(!map[studentId]) map[studentId]=emptyScoreObj();
  map[studentId][field] = (value===''||value===null||value===undefined) ? null : clamp(value, max);
  renderTable(true);
  saveState();
  const stu = getRoster().find(s=>s.id===studentId);
  logActivity('edit', `Set "${field}" = ${value===''?'—':value} for ${stu?stu.name:'a student'} — ${state.subject||''} (${state.term||'—'})`, { studentId });
}

// ===== Cycle Mark Entry: attendance toggle (P = Present, A = Absent) =====
// A small circle sits next to each Cycle score input. Clicking it cycles
// unset → A (Absent) → P (Present) → unset. Marking a student Absent for a
// Cycle doesn't erase their Cycle score, but every certificate that prints
// that Cycle column will show "Absent" instead of the numeric score — see
// cycleCellHtml() used throughout the certificate renderer.
function cycleAttButtonHtml(studentId, field, value){
  // No value recorded yet defaults to Present (P) — the teacher only needs to click
  // to flip a student to Absent (A) when needed; there is no longer an "unset" state.
  const effective = value==='A' ? 'A' : 'P';
  const readOnly = (currentUser && currentUser.effective && currentUser.effective.edit===false) || isCurrentUserGradeEntryLocked();
  const cls = effective==='A' ? 'cycle-att-btn cycle-att-A' : 'cycle-att-btn cycle-att-P';
  const label = effective;
  const title = effective==='A' ? 'Absent for this Cycle — click to mark Present'
              : 'Present for this Cycle — click to mark Absent';
  if(readOnly){
    return `<span class="${cls}" style="opacity:.6;" title="${escapeHtml(title)}">${label}</span>`;
  }
  return `<button type="button" class="${cls}" onclick="toggleCycleAttendance('${studentId}','${field}')" title="${escapeHtml(title)}">${label}</button>`;
}
function toggleCycleAttendance(studentId, field){
  if(isCurrentUserGradeEntryLocked()){ gradeEntryLockAlert(); return; }
  const map = getScoreMap();
  if(!map[studentId]) map[studentId] = emptyScoreObj();
  const cur = map[studentId][field]==='A' ? 'A' : 'P';
  const next = cur==='A' ? 'P' : 'A';
  map[studentId][field] = next;
  renderTable(true);
  saveState();
  const stu = getRoster().find(s=>s.id===studentId);
  const cycleLabel = field==='m1CycleAtt' ? 'Cycle 1' : 'Cycle 2';
  const stateLabel = next==='A' ? 'Absent' : 'Present';
  logActivity('edit', `Marked ${stu?stu.name:'a student'} as ${stateLabel} for ${cycleLabel} — ${state.subject||''} (${state.term||'—'})`, { studentId });
}
// Used by every certificate table that prints a Cycle score: shows "Absent" instead
// of the numeric score whenever that Cycle's attendance toggle was set to A.
function cycleCellHtml(sc, mKey){
  if(sc[mKey+'CycleAtt']==='A') return '<span class="cert-absent-tag">Absent</span>';
  const v = sc[mKey+'Cycle'];
  return (v===null || v===undefined || v==='') ? '' : v;
}

function scoreInputGroupClass(field){
  if(/E[1-4]$/.test(field)) return 'q-input';
  if(/Hw$/.test(field)) return 'hw-input';
  if(/Beh$/.test(field)) return 'beh-input';
  return '';
}

function scoreInputHtml(studentId, field, value, max, lockedReason){
  const v = (value===null||value===undefined) ? '' : value;
  const groupClass = scoreInputGroupClass(field);
  const readOnly = (currentUser && currentUser.effective && currentUser.effective.edit===false) || isCurrentUserGradeEntryLocked();
  // Grade 3 flexible Q.1–Q.4 cells: locked/inactive until the teacher has set that
  // question's maximum score in the "Set Question Max Scores" box above the table.
  if(!isMaxSet(max)){
    return `<input class="score-input ${groupClass} score-input-locked" type="text" value=""
               readonly onclick="flashMaxRequiredError(this)" onfocus="this.blur(); flashMaxRequiredError(this);"
               title="Set the maximum score for this question first">`;
  }
  // Cycle score cells: automatically locked whenever the attendance circle next to them
  // is set to Absent (A) — a student marked absent for the Cycle can't also have a Cycle
  // score entered, so the input is disabled (its stored value, if any, stays untouched
  // and is shown greyed-out) until the teacher switches attendance back to Present (P).
  if(lockedReason){
    return `<input class="score-input ${groupClass} score-input-locked" type="text" value="${v}"
               readonly title="${escapeHtml(lockedReason)}">`;
  }
  if(readOnly){
    return `<input class="score-input ${groupClass}" type="number" value="${v}" disabled style="opacity:.65;">`;
  }
  return `<input class="score-input ${groupClass}" type="number" min="0" max="${max}" step="0.5" value="${v}"
             onchange="handleScoreChange(this,'${studentId}','${field}',${max})">`;
}

// Fires when a teacher clicks/taps a locked Q.n cell before its maximum score has
// been entered: shows a red "Set Max Score First" badge and nudges attention up to
// the max-score box (which itself pulses red while incomplete).
function flashMaxRequiredError(el){
  if(!el || typeof el.getBoundingClientRect !== 'function') return;
  el.classList.add('input-error');
  setTimeout(()=> el.classList.remove('input-error'), 900);
  const rect = el.getBoundingClientRect();
  const badge = document.createElement('div');
  badge.className = 'inline-error-badge';
  badge.textContent = 'Set Max Score First ⚠️';
  badge.style.left = (rect.left + rect.width/2) + 'px';
  badge.style.top = rect.top + 'px';
  document.body.appendChild(badge);
  requestAnimationFrame(()=> badge.classList.add('show'));
  setTimeout(()=>{
    badge.classList.remove('show');
    setTimeout(()=> badge.remove(), 200);
  }, 1600);
  const maxBox = document.querySelector('.g3-max-box');
  if(maxBox){
    maxBox.scrollIntoView({behavior:'smooth', block:'center'});
    maxBox.classList.add('g3-max-box-attention');
    setTimeout(()=> maxBox.classList.remove('g3-max-box-attention'), 1200);
  }
}

// Remembers where the person was last typing, so the Firebase sync status (which
// resolves ~2.5s later, after the table has already re-rendered) can still surface
// right next to the cell they edited instead of only in the far-away header.
let lastEditRect = null;
let lastEditTime = 0;

function handleScoreChange(el, studentId, field, max){
  if(isCurrentUserGradeEntryLocked()){
    const map = getScoreMap();
    const prev = (map[studentId] && map[studentId][field]!=null) ? map[studentId][field] : '';
    el.value = prev;
    gradeEntryLockAlert();
    return;
  }
  const raw = el.value===''? null : parseFloat(el.value);
  if(raw!==null && !isNaN(raw) && raw>max){
    flashScoreError(el, max);
    const map = getScoreMap();
    const prev = (map[studentId] && map[studentId][field]!=null) ? map[studentId][field] : '';
    el.value = prev;
    return;
  }
  flashInlineSaved(el);
  lastEditRect = el.getBoundingClientRect();
  lastEditTime = Date.now();
  updateScore(studentId, field, el.value, max);
}

function flashScoreError(el, max){
  if(!el || typeof el.getBoundingClientRect !== 'function') return;
  el.classList.add('input-error');
  setTimeout(()=> el.classList.remove('input-error'), 900);
  const rect = el.getBoundingClientRect();
  const badge = document.createElement('div');
  badge.className = 'inline-error-badge';
  badge.textContent = `Max ${max}`;
  badge.style.left = (rect.left + rect.width/2) + 'px';
  badge.style.top = rect.top + 'px';
  document.body.appendChild(badge);
  requestAnimationFrame(()=> badge.classList.add('show'));
  setTimeout(()=>{
    badge.classList.remove('show');
    setTimeout(()=> badge.remove(), 200);
  }, 1400);
}

function isLanguageSubject(subject){ return /french|german|english/i.test(subject||''); }

function getExpectedLang2ForSubject(subject, sectionId){
  if(!subject) return null;
  // In French Section: French O.L./A.L. are regular subjects, English is the "second language"
  // German is no longer offered in French Section
  if(sectionId === 'fr'){
    if(/^english\s*(o\.l\.|a\.l\.)?$/i.test(subject)) return 'English';
    return null;
  }
  // In English Section: French/German are the "second language" subjects
  if(/^french\s*(o\.l\.|a\.l\.)?$/i.test(subject)) return 'French';
  if(/^german\s*(o\.l\.|a\.l\.)?$/i.test(subject)) return 'German';
  return null;
}

function getDisplayLanguageForSubject(subject, sectionId){
  sectionId = sectionId || 'en';
  if(!subject) return null;
  if(sectionId === 'fr'){
    if(/^english/i.test(subject)) return 'English';
    // German is not offered in French Section
    return null;
  }
  if(/^french/i.test(subject)) return 'French';
  if(/^german/i.test(subject)) return 'German';
  return null;
}
function isReligionSubject(subject){ return subject==='Religion' || subject==='Ch-Religion'; }

// Roster scoped to the currently selected Class (state.term). Used for DISPLAY only —
// mutations (add/delete/import) must keep using the full getRoster() array.
function emptyRosterMessage(){
  const isUnlinkedParent = currentUser && currentUser.role==='parent'
    && currentUser.effective && Array.isArray(currentUser.effective.studentScope)
    && currentUser.effective.studentScope.length===0;
  if(isUnlinkedParent){
    return { title:'No student linked to this account yet', body:'Please contact the school administrator to link your child\'s profile to this account.' };
  }
  const hasScopedStudent = currentUser && currentUser.role==='parent'
    && currentUser.effective && Array.isArray(currentUser.effective.studentScope)
    && currentUser.effective.studentScope.length>0;
  if(hasScopedStudent){
    return { title:'No matching student in this class', body:'Your linked child is not enrolled in the class you selected — please check the Section / Stage / Grade / Class selection above.' };
  }
  return { title:'No students in this class yet', body:'Add students from the "Grade Book" tab first.' };
}
function getClassRoster(){
  const roster = visibleRoster(getRoster());
  let filtered = state.term ? roster.filter(s => (s.classroom||'') === state.term) : roster;
  // A Parent/Student account with linked students is restricted to exactly those students —
  // this is what keeps a parent from seeing classmates' grades or report cards.
  filtered = filtered.filter(s => scopeStudentAllowed(s.id));
  return filtered;
}

// Roster for the Absence tab — scoped entirely to attState, independent of the Grade Book tab's selections
function getAttRoster(){
  if(!attState.section || !attState.stage || !attState.grade) return [];
  const ck = `${attState.section}|${attState.stage}|${attState.grade}`;
  const roster = visibleRoster(students[ck]);
  let filtered = attState.term ? roster.filter(s => (s.classroom||'') === attState.term) : roster;
  // Same as the Grade Book's subjectFilteredRoster(): Second-Language and Religion subjects
  // only apply to the students actually taking that language/religion.
  if(isLanguageSubject(attState.subject)){
    const expectedLang = getExpectedLang2ForSubject(attState.subject, attState.section);
    if(expectedLang) filtered = filtered.filter(s=> s.lang2 === expectedLang);
  } else if(attState.subject === 'Ch-Religion'){
    filtered = filtered.filter(s=> s.religion === 'Christian');
  } else if(attState.subject === 'Religion'){
    filtered = filtered.filter(s=> s.religion === 'Muslim');
  }
  filtered = filtered.filter(s => scopeStudentAllowed(s.id));
  return filtered;
}

// Roster for the Approved Leave sub-tab — the WHOLE class (Section/Stage/Grade/Class), with NO
// subject/language/religion filtering, since Approved Leave is recorded once per class and
// applies across every subject, not just the subject currently open in the stepper.
function getAttClassRosterFull(){
  if(!attState.section || !attState.stage || !attState.grade) return [];
  const ck = `${attState.section}|${attState.stage}|${attState.grade}`;
  const roster = visibleRoster(students[ck]);
  let filtered = attState.term ? roster.filter(s => (s.classroom||'') === attState.term) : roster;
  filtered = filtered.filter(s => scopeStudentAllowed(s.id));
  return filtered;
}

function subjectFilteredRoster(){
  const roster = getClassRoster();
  if(isLanguageSubject(state.subject)){
    const expectedLang = getExpectedLang2ForSubject(state.subject, state.section);
    if(expectedLang) return roster.filter(s=> s.lang2 === expectedLang);
  }
  if(state.subject === 'Ch-Religion'){
    return roster.filter(s=> s.religion === 'Christian');
  }
  if(state.subject === 'Religion'){
    return roster.filter(s=> s.religion === 'Muslim');
  }
  return roster;
}

// Same subject-based filtering as subjectFilteredRoster(), but scoped to the WHOLE Grade
// (every Class/Section within it) instead of just the currently-selected Class. Scores are
// already stored per Grade (subjKey() has no Class component), so this simply widens which
// students are shown/edited — used by the First Term / End-of-Year Exam Paper mark-entry
// screen, which is entered once for the entire Grade rather than one Class at a time.
function subjectFilteredGradeRoster(){
  let roster = visibleRoster(getRoster()).filter(s => scopeStudentAllowed(s.id));
  if(isLanguageSubject(state.subject)){
    const expectedLang = getExpectedLang2ForSubject(state.subject, state.section);
    if(expectedLang) return roster.filter(s=> s.lang2 === expectedLang);
  }
  if(state.subject === 'Ch-Religion'){
    return roster.filter(s=> s.religion === 'Christian');
  }
  if(state.subject === 'Religion'){
    return roster.filter(s=> s.religion === 'Muslim');
  }
  return roster;
}

/* ================== ATTENDANCE ================== */
const ATT_DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Draws the "week-end" divider line after the LAST school day of a calendar week — i.e.
// right before the next Sunday — rather than after every 7th array entry. Since Friday/
// Saturday (and any holiday) are already excluded from the dates list, counting a fixed
// number of entries doesn't reliably land on a real week boundary once the range's start
// date isn't itself a Sunday, or a Thursday gets excluded as a holiday. Looking at the
// actual day-of-week of the NEXT date instead guarantees every visual week always begins
// on Sunday, however the dates happen to fall.
function attColWeekEndCls(dates, idx){
  const next = dates[idx+1];
  if(!next) return '';
  const nextDay = new Date(next+'T00:00:00').getDay();
  return nextDay===0 ? ' week-end' : '';
}

// Builds the list of school-day dates (YYYY-MM-DD) between start and end inclusive,
// skipping Friday (5), Saturday (6), and any date present in excludedSet (holidays manually
// added in the Absence tab's form). Returns null if the range itself is invalid.
function generateAttendanceDates(startStr, endStr, excludedSet){
  const start = new Date(startStr+'T00:00:00');
  const end = new Date(endStr+'T00:00:00');
  if(isNaN(start.getTime()) || isNaN(end.getTime()) || start>end) return null;
  const dates = [];
  const d = new Date(start);
  while(d<=end){
    const day = d.getDay();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const ds = `${y}-${m}-${dd}`;
    if(day!==5 && day!==6 && !(excludedSet && excludedSet.has(ds))){
      dates.push(ds);
    }
    d.setDate(d.getDate()+1);
  }
  return dates;
}

// Every {section,stage,grade,term(=classroom)} combination that currently has at least one
// enrolled student, filtered through the current user's Section/Stage/Classroom scope — used
// by "Apply to ALL classes" so one date range (and holiday list) can be pushed to every class
// at once instead of setting it up one class at a time. Only stages that actually teach the
// given subject are included, since Absence is recorded per Subject.
function getAllAttClassTargets(subject){
  const targets = [];
  Object.keys(students).forEach(classKey_=>{
    const roster = visibleRoster(students[classKey_]);
    if(!roster.length) return;
    const [section, stage, grade] = classKey_.split('|');
    if(!ATT_SECTIONS[section] || !ATT_STAGES[stage]) return;
    if(!scopeSectionAllowed(section) || !scopeStageAllowed(stage)) return;
    if(subject && !getSubjectsForStageAndSection(stage, section).includes(subject)) return;
    const classes = [...new Set(roster.map(s=>s.classroom).filter(c=>c && c!==''))];
    classes.filter(c=>scopeClassroomAllowed(c)).forEach(term=>{
      targets.push({ section, stage, grade, term });
    });
  });
  return targets;
}

// Writes the given date range/dates/excluded list into ONE class's attendance table for ONE
// subject (creating or updating it), keeping any existing absence records whose date is still
// within range, and re-syncs the "Beh. & Attend." grade link — for that subject only — for
// every student in that class taking it.
function applyAttendanceDateRangeToClass(section, stage, grade, term, subject, termPeriod, academicTerm, start, end, dates, excludedList){
  const ck = `${section}|${stage}|${grade}|${termPeriod}|${term}|${subject}|${academicTerm}`;
  // Approved Leave lives at the CLASS level (no subject) — one set of records shared by every
  // subject's Absence table for this class/term/month. Multiple subjects each calling this
  // function will redundantly trim it to the same date set; that's harmless (idempotent).
  const classLevelKey = `${section}|${stage}|${grade}|${termPeriod}|${term}|${academicTerm}`;
  const prevRecords = (attendance[ck] && attendance[ck].records) || {};
  const dateSet = new Set(dates);

  // Trim Approved Leave records to the same (possibly new) date range first, so we know which
  // days are "closed" by Approved Leave before rebuilding the Absence records below.
  const prevLeaveRecords = (approvedLeave[classLevelKey] && approvedLeave[classLevelKey].records) || {};
  const newLeaveRecords = {};
  Object.keys(prevLeaveRecords).forEach(studentId=>{
    const kept = {};
    Object.keys(prevLeaveRecords[studentId]).forEach(d=>{ if(dateSet.has(d)) kept[d]=true; });
    if(Object.keys(kept).length) newLeaveRecords[studentId] = kept;
  });
  approvedLeave[classLevelKey] = { records: newLeaveRecords };

  const newRecords = {};
  Object.keys(prevRecords).forEach(studentId=>{
    const kept = {};
    const leaveDays = newLeaveRecords[studentId] || {};
    Object.keys(prevRecords[studentId]).forEach(d=>{
      // A day marked Approved Leave always overrides/cancels an Absence entry for that day,
      // in every subject — not just the subject it happened to be recorded from.
      if(dateSet.has(d) && !leaveDays[d]) kept[d]=true;
    });
    if(Object.keys(kept).length) newRecords[studentId] = kept;
  });
  attendance[ck] = { start, end, dates, excluded: excludedList, records: newRecords };

  const classKey_ = `${section}|${stage}|${grade}`;
  let roster = visibleRoster(students[classKey_]).filter(s=>(s.classroom||'')===term);
  if(isLanguageSubject(subject)){
    const expectedLang = getExpectedLang2ForSubject(subject, section);
    if(expectedLang) roster = roster.filter(s=> s.lang2 === expectedLang);
  } else if(subject === 'Ch-Religion'){
    roster = roster.filter(s=> s.religion === 'Christian');
  } else if(subject === 'Religion'){
    roster = roster.filter(s=> s.religion === 'Muslim');
  }
  roster.forEach(s=>{
    const total = Object.keys(newRecords[s.id] || {}).length;
    applyAttendanceToGrades(section, stage, grade, termPeriod, academicTerm, s.id, total, subject);
  });
}

function renderAttendanceWorkspace(){
  const ws = document.getElementById('attendanceWorkspace');
  const intro = document.getElementById('attendanceIntroState');
  if(!ws || !intro) return;
  const cfgs = attStepConfig();
  const ready = !!(attState.termPeriod && attState.section && attState.stage && attState.grade && attState.term && attState.subject && attState.academicTerm);
  ws.style.display = ready ? '' : 'none';
  intro.style.display = ready ? 'none' : '';
  // The Absence / Approved Leave sub-tab bar sits above BOTH the intro (stepper) state and the
  // workspace, so it's visible right away — the person doesn't have to finish the stepper first
  // to see that "Approved Leave" exists (it only gates on the current user's permission).
  ensureAttSubTabsBar();
  if(!ready){ updateIntroState('attendanceIntroState', cfgs); return; }

  // Dates (Start/End + holidays) for every Absence table come exclusively from the Admin's
  // global "Term & Month Dates" screen in Configuration — there is no manual Start/End/holiday
  // entry point inside the Absence tab itself anymore. The table is created (once) straight
  // from that global range/holiday list the first time this class/subject/month is opened,
  // and stays in sync with it afterwards (see regenerateAttendanceForGlobalMonth).
  const globalRange = termMonthDates && termMonthDates[attState.termPeriod] && termMonthDates[attState.termPeriod][attState.academicTerm];
  const hasGlobalRange = !!(globalRange && globalRange.start && globalRange.end);
  autoCreateAttendanceFromGlobalRange(globalRange, hasGlobalRange);

  const gradeLabel = ATT_STAGES[attState.stage].grades.find(g=>g.id===attState.grade).label;
  const monthLabel = attState.academicTerm==='month1' ? '1st Month' : '2nd Month';
  const monthRange = formatTermMonthRange(attState.termPeriod, attState.academicTerm);
  document.getElementById('attendanceCrumbs').innerHTML = `
    <span class="crumb">${TERM_LABELS[attState.termPeriod]}</span>
    <span class="crumb">${ATT_SECTIONS[attState.section].label}</span>
    <span class="crumb stage-${attState.stage}">${ATT_STAGES[attState.stage].label}</span>
    <span class="crumb">${gradeLabel}</span>
    <span class="crumb">${attState.term}</span>
    <span class="crumb subj">${subjectWithIcon(attState.subject)}</span>
    <span class="crumb">${monthLabel}${monthRange ? ` <small style="opacity:.7;font-weight:600;">(${monthRange})</small>` : ''}</span>
  `;

  ensureAttSubTabsBar();
  updateAttSubTabsActive();
  renderAttendanceTable();
}

// Creates this class/subject/month's attendance table straight from the Admin's globally
// configured Term & Month dates & holidays, the first time it's opened (only if it doesn't
// already exist and the current user has edit rights) — so the table shows up directly with
// no manual Start/End/holiday entry needed. Does nothing if the Admin hasn't set that range yet,
// or the table already exists (holiday updates made later propagate via
// regenerateAttendanceForGlobalMonth when the Admin edits them again).
function autoCreateAttendanceFromGlobalRange(globalRange, hasGlobalRange){
  if(!hasGlobalRange) return false;
  const ck = attClassKey();
  if(attendance[ck]) return false;
  const canEdit = !!(currentUser && currentUser.effective && currentUser.effective.edit);
  if(!canEdit) return false;
  const holidays = globalRange.holidays || [];
  const dates = generateAttendanceDates(globalRange.start, globalRange.end, new Set(holidays));
  if(!dates || !dates.length) return false;
  applyAttendanceDateRangeToClass(attState.section, attState.stage, attState.grade, attState.term, attState.subject, attState.termPeriod, attState.academicTerm, globalRange.start, globalRange.end, dates, holidays);
  pushAttendanceChangeNow();
  return true;
}

// Immediately (not debounced) pushes to Firebase after a critical write like creating/updating
// an attendance table, and tells the user directly if that push fails — so a sync problem is
// visible right away instead of silently relying on the background auto-save debounce.
function pushAttendanceChangeNow(){
  saveStateLocalOnly();
  if(typeof githubReady==='function' && githubReady()){
    if(typeof githubPushTimer!=='undefined') clearTimeout(githubPushTimer);
    pushToGithub().then(ok=>{
      if(!ok){
        alert('This attendance table was saved on this device, but syncing it to Firebase failed. Please check your internet connection, then try again — or use "Push to Firebase" from the Configuration menu.');
      }
    });
  }
}

// ---- Absence / Approved Leave sub-tabs ----
function canUseApprovedLeave(){
  return !!(currentUser && currentUser.effective && currentUser.effective.approvedLeave);
}
// Creates (or refreshes) the "Absence" / "Approved Leave" sub-tab bar, anchored right above the
// intro (stepper) element so it's visible whether or not the stepper has been completed yet —
// it is NOT inside #attendanceWorkspace, which is hidden via display:none until every step is
// picked. Rebuilt on every call (cheap) so a role switch (e.g. re-login as a Teacher) removes
// the "Approved Leave" button immediately rather than leaving a stale one in the DOM.
// Recording Approved Leave is restricted to Admin and HOS/Deputy — Teachers, Heads of
// Department, and Parent/Student accounts only ever see the plain Absence table, no sub-tabs.
function ensureAttSubTabsBar(){
  const intro = document.getElementById('attendanceIntroState');
  if(!intro || !intro.parentNode) return;
  const canLeave = canUseApprovedLeave();
  if(!canLeave && attSubView==='leave') attSubView = 'absence';
  let bar = document.getElementById('attSubTabsBar');
  if(!canLeave){
    if(bar) bar.remove();
    return;
  }
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'attSubTabsBar';
    bar.className = 'att-subtabs';
    intro.parentNode.insertBefore(bar, intro);
  }
  bar.innerHTML = `
    <button type="button" class="att-subtab-btn" data-subview="absence" onclick="switchAttSubView('absence')">Absence</button>
    <button type="button" class="att-subtab-btn" data-subview="leave" onclick="switchAttSubView('leave')">Approved Leave</button>
  `;
  updateAttSubTabsActive();
}
function updateAttSubTabsActive(){
  document.querySelectorAll('#attSubTabsBar .att-subtab-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.subview===attSubView);
  });
}
function switchAttSubView(view){
  if(view==='leave' && !canUseApprovedLeave()) return;
  attSubView = view;
  updateAttSubTabsActive();
  renderAttendanceTable();
}

// Dispatcher — kept under the original name since it's called from many places (workspace
// render, the Grade Entry Lock alert, etc.). Renders whichever sub-tab is currently active,
// falling back to Absence if the current user isn't allowed to see Approved Leave.
function renderAttendanceTable(){
  if(attSubView==='leave' && !canUseApprovedLeave()) attSubView = 'absence';
  updateAttSubTabsActive();
  if(attSubView==='leave') renderApprovedLeaveTable();
  else renderAbsenceTable();
}

function renderAbsenceTable(){
  const holder = document.getElementById('attTableHolder');
  if(!holder) return;
  const ck = attClassKey();
  const month = attendance[ck];

  if(!month){
    const isAdmin = !!(currentUser && currentUser.role==='admin');
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">—</div>
        <h3>No date range set yet</h3>
        <p>${isAdmin
          ? 'Set the Start and End dates for this Term\'s Month via Configuration ▸ Term & Month Dates — the Absence table for every class then appears here automatically.'
          : 'The school administrator hasn\'t set the Start and End dates for this Term\'s Month yet (Configuration ▸ Term & Month Dates). Please check back once they have.'}</p>
      </div>`;
    return;
  }

  const roster = getAttRoster();
  if(roster.length===0){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No students in this class yet</h3>
        <p>Add students from the "Grade Book" tab first.</p>
      </div>`;
    return;
  }

  // Editing Absence is locked by the exact same Grade Entry Lock rules as the Grade Book's
  // Mark Entry screens — ticking/unticking a day here auto-writes into that Month's
  // "Beh. & Attend." grade (see applyAttendanceToGrades below), so once the Admin locks
  // Month 1 / Month 2 for a Teacher (or a whole subject), Absence for that same Month is
  // locked right along with it — there's only one underlying figure being protected.
  const canEdit = !!(currentUser && currentUser.effective && currentUser.effective.edit) && !isCurrentUserGradeEntryLocked(attState.academicTerm);
  if(!month.records) month.records = {};
  const leaveRecords = (approvedLeave[attClassLevelKey()] && approvedLeave[attClassLevelKey()].records) || {};

  const headerCols = month.dates.map((ds,idx)=>{
    const d = new Date(ds+'T00:00:00');
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const weekEndCls = attColWeekEndCls(month.dates, idx);
    return `<th class="att-day-col${weekEndCls}">${ATT_DAY_NAMES[d.getDay()]}<br><small>${dd}/${mm}</small></th>`;
  }).join('');

  const rows = roster.map((s,i)=>{
    const rec = month.records[s.id] || {};
    const leaveRec = leaveRecords[s.id] || {};
    let total = 0;
    const cells = month.dates.map((ds,idx)=>{
      const weekEndCls = attColWeekEndCls(month.dates, idx);
      // A date recorded on the Approved Leave sub-tab is CLOSED here: shown as a locked "L"
      // cell instead of a checkbox, and not counted in the Total column below.
      if(leaveRec[ds]){
        return `<td class="att-day-col${weekEndCls} att-leave-cell" title="Approved Leave">L</td>`;
      }
      const checked = !!rec[ds];
      if(checked) total++;
      return `<td class="att-day-col${weekEndCls}"><input type="checkbox" class="att-check" ${checked?'checked':''} ${canEdit?'':'disabled'}
                onchange="flashInlineSaved(this);toggleAttendance('${s.id}','${ds}',this.checked)"></td>`;
    }).join('');
    const fullName = escapeHtml(s.name);
    return `
      <tr>
        <td>${i+1}</td>
        <td class="name-col att-name-col" title="${fullName}">${fullName}</td>
        ${cells}
        <td class="total-cell att-total-col" id="attTotal-${s.id}">${total}</td>
      </tr>`;
  }).join('');

  holder.innerHTML = `
    <div class="table-container">
      <table class="att-table">
        <thead>
          <tr>
            <th>#</th><th class="name-col att-name-col">Name</th>
            ${headerCols}
            <th class="att-total-col">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Approved Leave table — same class/subject/month table shell and same dates as the Absence
// table above (attendance[ck].dates), but each checkbox here toggles a day as an excused
// ("L") leave day instead of an absence day.
function renderApprovedLeaveTable(){
  const holder = document.getElementById('attTableHolder');
  if(!holder) return;
  if(!canUseApprovedLeave()){ renderAbsenceTable(); return; }
  // The date columns are the same for every subject in a given Term Period + Month (they come
  // from the same global Term & Month Dates range), so we simply reuse whichever subject's
  // Absence table is currently open in the stepper to get that column list — Approved Leave
  // itself is NOT subject-specific, only its calendar happens to be shared with Absence.
  const ck = attClassKey();
  const month = attendance[ck];

  if(!month){
    const isAdmin = !!(currentUser && currentUser.role==='admin');
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">—</div>
        <h3>No date range set yet</h3>
        <p>${isAdmin
          ? 'Set the Start and End dates for this Term\'s Month via Configuration ▸ Term & Month Dates — the Absence table for every class then appears here automatically.'
          : 'The school administrator hasn\'t set the Start and End dates for this Term\'s Month yet (Configuration ▸ Term & Month Dates). Please check back once they have.'}</p>
      </div>`;
    return;
  }

  const roster = getAttClassRosterFull();
  if(roster.length===0){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No students in this class yet</h3>
        <p>Add students from the "Grade Book" tab first.</p>
      </div>`;
    return;
  }

  const canEdit = !!(currentUser && currentUser.effective && currentUser.effective.edit) && !isCurrentUserGradeEntryLocked(attState.academicTerm);
  const leaveKey = attClassLevelKey();
  if(!approvedLeave[leaveKey]) approvedLeave[leaveKey] = { records:{} };
  if(!approvedLeave[leaveKey].records) approvedLeave[leaveKey].records = {};
  const leaveMonth = approvedLeave[leaveKey];

  const headerCols = month.dates.map((ds,idx)=>{
    const d = new Date(ds+'T00:00:00');
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const weekEndCls = attColWeekEndCls(month.dates, idx);
    return `<th class="att-day-col${weekEndCls}">${ATT_DAY_NAMES[d.getDay()]}<br><small>${dd}/${mm}</small></th>`;
  }).join('');

  const rows = roster.map((s,i)=>{
    const rec = leaveMonth.records[s.id] || {};
    let total = 0;
    const cells = month.dates.map((ds,idx)=>{
      const checked = !!rec[ds];
      if(checked) total++;
      const weekEndCls = attColWeekEndCls(month.dates, idx);
      return `<td class="att-day-col${weekEndCls}"><input type="checkbox" class="att-check" ${checked?'checked':''} ${canEdit?'':'disabled'}
                onchange="flashInlineSaved(this);toggleApprovedLeave('${s.id}','${ds}',this.checked)"></td>`;
    }).join('');
    const fullName = escapeHtml(s.name);
    return `
      <tr>
        <td>${i+1}</td>
        <td class="name-col att-name-col" title="${fullName}">${fullName}</td>
        ${cells}
        <td class="total-cell att-total-col" id="attLeaveTotal-${s.id}">${total}</td>
      </tr>`;
  }).join('');

  holder.innerHTML = `
    <div class="table-container">
      <p style="margin:0 0 10px;font-size:12.5px;font-weight:600;color:#667085;">Recorded once per class — applies to this student's Absence table in every subject, not just ${subjectWithIcon(attState.subject)}.</p>
      <table class="att-table">
        <thead>
          <tr>
            <th>#</th><th class="name-col att-name-col">Name</th>
            ${headerCols}
            <th class="att-total-col">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function toggleAttendance(studentId, dateStr, checked){
  if(isCurrentUserGradeEntryLocked(attState.academicTerm)){ gradeEntryLockAlert(attState.academicTerm); renderAttendanceTable(); return; }
  const ck = attClassKey();
  const month = attendance[ck];
  if(!month) return;
  // Defensive: a day already closed by Approved Leave has no checkbox rendered for it, but
  // guard here too in case this is ever called directly for such a day.
  const leaveKey = attClassLevelKey();
  const leaveRec = (approvedLeave[leaveKey] && approvedLeave[leaveKey].records && approvedLeave[leaveKey].records[studentId]) || {};
  if(leaveRec[dateStr]) return;
  if(!month.records) month.records = {};
  if(!month.records[studentId]) month.records[studentId] = {};
  if(checked) month.records[studentId][dateStr] = true;
  else delete month.records[studentId][dateStr];

  const total = Object.keys(month.records[studentId]).length;
  const cell = document.getElementById('attTotal-'+studentId);
  if(cell) cell.textContent = total;

  applyAttendanceToGrades(attState.section, attState.stage, attState.grade, attState.termPeriod, attState.academicTerm, studentId, total, attState.subject);

  saveState();
  const stu = getAttRoster().find(s=>s.id===studentId);
  logActivity('edit', `Marked ${stu?stu.name:'a student'} as ${checked?'absent':'present'} on ${dateStr} — auto-updated Beh. & Attend. (${subjectWithIcon(attState.subject)})`);
}

// Toggles a day as Approved Leave (excused absence) for a student, recorded ONCE for the whole
// class (not per Subject). Checking it here:
//   - writes the day into approvedLeave under the class-level key, which EVERY subject's
//     Absence table then renders as a locked "L" cell for that student (not counted in that
//     subject's absence total), and
//   - if that student already had this exact day recorded as an Absence in ANY subject for
//     this class/term/month, cancels it there too (record removed, Beh. & Attend. grade link
//     recomputed for that subject).
// Unchecking it simply re-opens the day in every subject's Absence table as a normal, empty
// checkbox again.
function toggleApprovedLeave(studentId, dateStr, checked){
  if(!canUseApprovedLeave()){ alert('Only Admin and HOS/Deputy can record Approved Leave.'); renderAttendanceTable(); return; }
  if(isCurrentUserGradeEntryLocked(attState.academicTerm)){ gradeEntryLockAlert(attState.academicTerm); renderAttendanceTable(); return; }
  const leaveKey = attClassLevelKey();
  if(!approvedLeave[leaveKey]) approvedLeave[leaveKey] = { records:{} };
  if(!approvedLeave[leaveKey].records) approvedLeave[leaveKey].records = {};
  const leaveMonth = approvedLeave[leaveKey];
  if(!leaveMonth.records[studentId]) leaveMonth.records[studentId] = {};

  let absenceCancelledSubjects = [];
  if(checked){
    leaveMonth.records[studentId][dateStr] = true;
    // Approved Leave overrides/cancels any Absence already recorded for this exact day, in
    // EVERY subject's Absence table for this same class/term/month — not just the subject
    // that happened to be open in the stepper when this was recorded.
    const prefix = `${attState.section}|${attState.stage}|${attState.grade}|${attState.termPeriod}|${attState.term}|`;
    const suffix = `|${attState.academicTerm}`;
    Object.keys(attendance).forEach(ck2=>{
      if(!ck2.startsWith(prefix) || !ck2.endsWith(suffix)) return;
      const month = attendance[ck2];
      if(month && month.records && month.records[studentId] && month.records[studentId][dateStr]){
        delete month.records[studentId][dateStr];
        const subj = ck2.slice(prefix.length, ck2.length - suffix.length);
        absenceCancelledSubjects.push(subj);
        const absTotal = Object.keys(month.records[studentId] || {}).length;
        applyAttendanceToGrades(attState.section, attState.stage, attState.grade, attState.termPeriod, attState.academicTerm, studentId, absTotal, subj);
      }
    });
  }else{
    delete leaveMonth.records[studentId][dateStr];
  }

  const total = Object.keys(leaveMonth.records[studentId]).length;
  const cell = document.getElementById('attLeaveTotal-'+studentId);
  if(cell) cell.textContent = total;

  saveState();
  const stu = getAttClassRosterFull().find(s=>s.id===studentId);
  logActivity('edit', `Marked ${stu?stu.name:'a student'} as ${checked?'on Approved Leave':'not on Approved Leave'} on ${dateStr} for the whole class${absenceCancelledSubjects.length ? ` — cancelled the recorded absence for that day in ${absenceCancelledSubjects.join(', ')}` : ''}`);
}

// ---- Attendance → Grades linking ----
// Absence is recorded per Subject, so each attendance table (Section/Stage/Grade/Class/Term/
// Month/Subject) automatically writes a computed "Beh. & Attend." grade into THAT one subject
// only, for the matching Term Period + Month. The teacher can still freely overwrite that
// value by hand afterwards in Mark Entry — it's just the starting point, recalculated
// whenever the attendance count for that student/month changes.
//   Primary Stage (incl. the extended Grade 1-6 mark-entry layouts): Max. 5, −0.5 per 3 absence days.
//   Grade 7-8 Prep / Grade 10-11 Secondary: Max. 10, −1 per 3 absence days.
//   Other grades (e.g. Grade 9 Prep, Grade 12 Secondary) have no Beh. & Attend. field — skipped.
function applyAttendanceToGrades(section, stage, grade, termPeriod, monthKey, studentId, absenceDays, subject){
  if(monthKey!=='month1' && monthKey!=='month2') return;
  if(!subject) return;
  const field = monthKey==='month1' ? 'm1Beh' : 'm2Beh';
  const stageData = STAGES[stage];
  if(!stageData) return;
  const primaryStage = stage==='primary';
  const extendedStage = (stage==='prep' && ['g7','g8'].includes(grade)) || (stage==='secondary' && ['g10','g11'].includes(grade));
  if(!primaryStage && !extendedStage) return; // this grade has no Beh. & Attend. field to link

  const max = primaryStage ? 5 : 10;
  const per3 = primaryStage ? 0.5 : 1;
  const deduction = Math.floor((absenceDays||0)/3) * per3;
  const finalScore = Math.max(0, Math.round((max - deduction)*100)/100);

  const classKey_ = `${section}|${stage}|${grade}`;
  const sk = `${classKey_}|${termPeriod}|${subject}`;
  if(!scores[sk]) scores[sk] = {};
  if(!scores[sk][studentId]){
    scores[sk][studentId] = {
      m1E1:null,m1E2:null,m1E3:null,m1E4:null,m1Hw:null,m1Beh:max,m1Cycle:null,m1CW:null,m1Oral:null,
      m2E1:null,m2E2:null,m2E3:null,m2E4:null,m2Hw:null,m2Beh:max,m2Cycle:null,m2CW:null,m2Oral:null,
      activity:null, tasks:null
    };
  }
  scores[sk][studentId][field] = finalScore;
}

// Recomputes the Beh. & Attend. link for every student in the current Attendance selection —
// used after the date range changes, since that can shift every student's absence total at once.
function recomputeAttendanceLinksForCurrentClass(){
  const ck = attClassKey();
  const month = attendance[ck];
  const roster = getAttRoster();
  roster.forEach(s=>{
    const rec = (month && month.records && month.records[s.id]) || {};
    const total = Object.keys(rec).length;
    applyAttendanceToGrades(attState.section, attState.stage, attState.grade, attState.termPeriod, attState.academicTerm, s.id, total, attState.subject);
  });
}

// Removes any attendance records for a student that's being deleted, across every class/term/month.
function deleteAttendanceForStudent(id){
  Object.keys(attendance).forEach(ck=>{
    const month = attendance[ck];
    if(month && month.records && month.records[id]) delete month.records[id];
  });
  Object.keys(approvedLeave).forEach(ck=>{
    const month = approvedLeave[ck];
    if(month && month.records && month.records[id]) delete month.records[id];
  });
}

function renderTable(preserveFocus){
  const scoreMap = getScoreMap();
  const holder = document.getElementById('tableHolder');
  const footNote = document.getElementById('footNote');

  if(state.academicTerm === 'examPaper'){
    const gradeRoster = subjectFilteredGradeRoster();
    document.getElementById('studentCount').textContent = `${gradeRoster.length} students (whole Grade)`;
    renderExamPaperScreen(gradeRoster, scoreMap, holder, footNote);
    return;
  }

  const roster = subjectFilteredRoster();
  document.getElementById('studentCount').textContent = `${roster.length} students`;
  updateGradeBookSaveUI();

  if(footNote){
    const langLine = isLanguageSubject(state.subject) ? `Only students whose Second Language is set to <b>${getDisplayLanguageForSubject(state.subject, state.section)}</b> are shown for this subject.<br>` : '';
    const religionLine = isReligionSubject(state.subject) ? `Only students whose Religion is set to <b>${state.subject==='Ch-Religion'?'Christian':'Muslim'}</b> are shown for this subject.<br>` : '';
    const saveLine = `Grades are saved to this browser automatically as you type — click "💾 Save" above to sync them to Firestore for every other device. You can still use "Full Backup" to save a copy to your device, or "Restore Backup" to load one later.`;
    if(isPrimary() || isExtendedGradingStage()){
      const mode = academicSubMode();
      const junior = isJuniorPrimary();
      let modeLine;
      if(junior){
        if(mode==='month2') modeLine = `This screen is for <b>Month 2</b> marks only: Q.1–Q.4 (5 each) are averaged (ignoring empty cells) then ×4 to give Q. Av. (20). Q. Av. + C.W. (20) + H.W. (20) + Oral (10) + Behaviour &amp; Attendance (5) make up Total 2 (Max. 75).`;
        else if(mode==='coursework') modeLine = `This screen shows the <b>Term Av.</b> summary (Max. 100): Two Months Av. (75, the average of Total 1 and Total 2) + Activity (20) + Skills (5) = Term Total. Grade follows the same percentage bands as other stages; Color follows: 85%+ Blue, 65%+ Green, 50%+ Yellow, below 50% Red.`;
        else modeLine = `This screen is for <b>Month 1</b> marks only: Q.1–Q.4 (5 each) are averaged (ignoring empty cells) then ×4 to give Q. Av. (20). Q. Av. + C.W. (20) + H.W. (20) + Oral (10) + Behaviour &amp; Attendance (5) make up Total 1 (Max. 75).`;
      } else if(isG7G8Prep()){
        if(mode==='month2') modeLine = `This screen is for <b>Month 2</b> marks only: Q.1–Q.4 (5 each) are averaged (ignoring empty cells) then ×4 to give Q. Av. (20). Q. Av. (20) + C.W. (10) + Behaviour &amp; Attendance (10) make up Total 2 (Max. 40), plus Cycle 2 (Max. 15).`;
        else if(mode==='coursework') modeLine = `This screen shows the <b>Total Coursework</b> summary (Max. 70): Two Months Av. (40, the average of Total 1 and Total 2) + Total Cycles (30, Cycle 1 + Cycle 2). Both are calculated automatically from the Month 1 and Month 2 mark-entry screens.`;
        else modeLine = `This screen is for <b>Month 1</b> marks only: Q.1–Q.4 (5 each) are averaged (ignoring empty cells) then ×4 to give Q. Av. (20). Q. Av. (20) + C.W. (10) + Behaviour &amp; Attendance (10) make up Total 1 (Max. 40), plus Cycle 1 (Max. 15).`;
      } else if(isG10G11Secondary()){
        if(mode==='month2') modeLine = `This screen is for <b>Month 2</b> marks only: Q.1–Q.4 (5 each) are averaged (ignoring empty cells) then ×3 to give Q. Av. (15). Q. Av. (15) + C.W. (15) + Behaviour &amp; Attendance (10) make up Total 2 (Max. 40), plus Cycle 2 (Max. 15).`;
        else if(mode==='coursework') modeLine = `This screen shows the <b>Total Coursework</b> summary (Max. 70): Two Months Av. (40, the average of Total 1 and Total 2) + Total Cycles (30, Cycle 1 + Cycle 2). Both are calculated automatically from the Month 1 and Month 2 mark-entry screens.`;
        else modeLine = `This screen is for <b>Month 1</b> marks only: Q.1–Q.4 (5 each) are averaged (ignoring empty cells) then ×3 to give Q. Av. (15). Q. Av. (15) + C.W. (15) + Behaviour &amp; Attendance (10) make up Total 1 (Max. 40), plus Cycle 1 (Max. 15).`;
      } else {
        if(mode==='month2') modeLine = `This screen is for <b>Month 2</b> marks only: Q.1–Q.4 (5 each) are averaged then ×4 to give Q. Av. (20). Q. Av. (20) + C.W. (20) + Behaviour &amp; Attendance (10) make up Total 2 (Max. 40), plus Cycle 2 (Max. 5).`;
        else if(mode==='coursework') modeLine = `This screen shows the <b>Total Coursework</b> summary (Max. 40): Two Months Average (15) + Total Cycles (10) + Activity (5) + Performance Tasks (10). Two Months Average and Total Cycles are calculated automatically from the Month 1 and Month 2 mark-entry screens.`;
        else modeLine = `This screen is for <b>Month 1</b> marks only: Q.1–Q.4 (5 each) are averaged then ×4 to give Q. Av. (20). Q. Av. (20) + C.W. (20) + Behaviour &amp; Attendance (10) make up Total 1 (Max. 40), plus Cycle 1 (Max. 5).`;
      }
      footNote.innerHTML = `${modeLine}<br>${langLine}${religionLine}${saveLine}`;
    } else if(isG9CycleMode()){
      const mode = academicSubMode();
      const cycleLabel = mode==='month2' ? 'Cycle 2' : 'Cycle 1';
      footNote.innerHTML = `This screen records the <b>${cycleLabel}</b> score on its own (Max. 15) — Percentage and Grade are calculated automatically from it.<br>${langLine}${religionLine}${saveLine}`;
    } else {
      footNote.innerHTML = `Subject maximum grade is 100: Month 1 (10) + Month 2 (10) + Mid-Year (20) + Final Exam (60).<br>${langLine}${religionLine}${saveLine}`;
    }
  }

  if(roster.length===0){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No students in this class yet</h3>
        <p>${isLanguageSubject(state.subject)
            ? `No students have their Second Language set to ${getDisplayLanguageForSubject(state.subject, state.section)} yet. Add one, or set a student's Second Language from the Database tab.`
            : isReligionSubject(state.subject)
            ? `No students have their Religion set to ${state.subject==='Ch-Religion'?'Christian':'Muslim'} yet. Add one, or set a student's Religion from the Database tab.`
            : `Add students manually or import a list from an Excel file.`}</p>
      </div>`;
    return;
  }

  if(isPrimary() || isExtendedGradingStage()){ renderPrimaryTable(roster, scoreMap, holder); }
  else if(isG9CycleMode()){ renderG9CycleTable(roster, scoreMap, holder); }
  else { renderStandardTable(roster, scoreMap, holder); }
}

// Standalone "First Term Exam Paper" (Term 1) / "End-of-Year Exam Paper" (Term 2) mark-entry
// screen. It's the same single-column layout for every Stage/Grade — only the maximum grade
// changes (Max. 60 Primary, Max. 30 Prep & Secondary) — and it's saved as its own field
// ("examPaper"), independent of the Month 1 / Month 2 / Total Coursework screens and totals.
function renderExamPaperScreen(roster, scoreMap, holder, footNote){
  hideMonthPill();
  const junior = isPrimary() && isJuniorPrimary();
  const max = examPaperMax();
  const screenLabel = markEntryLabel(state.termPeriod, state.academicTerm);

  if(footNote){
    const langLine = isLanguageSubject(state.subject) ? `Only students whose Second Language is set to <b>${getDisplayLanguageForSubject(state.subject, state.section)}</b> are shown for this subject.<br>` : '';
    const religionLine = isReligionSubject(state.subject) ? `Only students whose Religion is set to <b>${state.subject==='Ch-Religion'?'Christian':'Muslim'}</b> are shown for this subject.<br>` : '';
    const saveLine = `Grades are saved to this browser automatically as you type — click "💾 Save" above to sync them to Firestore for every other device. You can still use "Full Backup" to save a copy to your device, or "Restore Backup" to load one later.`;
    footNote.innerHTML = junior
      ? `This screen shows the <b>Term Total</b> (Max. 100), Grade and Color from the Total Coursework calculation, plus <b>Initial Exam</b> and <b>Final Exam</b> (Pass/Fail, entered by hand) — independent of the Month 1, Month 2 and Total Coursework screens' own totals.<br>${langLine}${religionLine}${saveLine}`
      : `This screen records the <b>${screenLabel}</b> score on its own (Max. ${max}) — it is entered and saved independently of the Month 1, Month 2 and Total Coursework screens and their totals.<br>${langLine}${religionLine}${saveLine}`;
  }

  if(roster.length===0){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No students in this class yet</h3>
        <p>${isLanguageSubject(state.subject)
            ? `No students have their Second Language set to ${/french/i.test(state.subject)?'French':'German'} yet. Add one, or set a student's Second Language from the Database tab.`
            : isReligionSubject(state.subject)
            ? `No students have their Religion set to ${state.subject==='Ch-Religion'?'Christian':'Muslim'} yet. Add one, or set a student's Religion from the Database tab.`
            : `Add students manually or import a list from an Excel file.`}</p>
      </div>`;
    return;
  }

  if(junior){
    let rows = roster.map((s, i)=>{
      const sc = scoreMap[s.id] || emptyScoreObj();
      const t = computePrimaryTotals(sc);
      const pct = Math.round((t.totalCoursework / t.maxTotal * 100) * 10) / 10;
      const g = letterGrade(pct);
      const col = courseworkColor(pct);
      return `
        <tr>
          ${primaryIdCellsHtml(s, i)}
          <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
          <td><span class="badge ${g.c}">${g.t}</span></td>
          <td><span class="badge ${col.c}">${col.t}</span></td>
          <td>${examFieldInputHtml(s.id,'examInitial',sc.examInitial)}</td>
          <td>${examFieldInputHtml(s.id,'examFinal',sc.examFinal)}</td>
          <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    holder.innerHTML = `
      <table>
        <thead>
          <tr>${PRIMARY_ID_HEADERS}
            <th>Term Total<br><small>(Max. 100)</small></th>
            <th>Grade</th>
            <th>Color</th>
            <th>Initial Exam</th>
            <th>Final Exam</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    return;
  }

  let rows = roster.map((s, i)=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    const val = sc.examPaper;
    const hasVal = val!==null && val!==undefined && val!=='';
    const pct = hasVal ? Math.round((parseFloat(val)/max*100)*10)/10 : null;
    const g = hasVal ? letterGrade(pct) : null;
    return `
      <tr>
        ${primaryIdCellsHtml(s, i)}
        <td>${scoreInputHtml(s.id,'examPaper',val,max)}</td>
        <td class="pct-cell">${hasVal ? pct+'%' : '—'}</td>
        <td>${g ? `<span class="badge ${g.c}">${g.t}</span>` : '—'}</td>
        <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
      </tr>`;
  }).join('');

  holder.innerHTML = `
    <table>
      <thead>
        <tr>${PRIMARY_ID_HEADERS}
          <th>${screenLabel}<br><small>(Max. ${max})</small></th>
          <th>Percentage</th>
          <th>Grade</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Handles Initial Exam / Final Exam edits on the Grade 1 & 2 "Term 1 (Total)" / "Term 2
// (Total)" Grade Book screen — free text, with Pass/Fail suggested via a datalist.
function examFieldInputHtml(studentId, field, value){
  const v = (value===null||value===undefined) ? '' : value;
  const readOnly = (currentUser && currentUser.effective && currentUser.effective.edit===false) || isCurrentUserGradeEntryLocked();
  const dlId = `gbExamOpts-${studentId}-${field}`;
  if(readOnly){
    return `<input class="score-input exam-input" type="text" value="${escapeHtml(v)}" disabled style="opacity:.65;">`;
  }
  return `<input class="score-input exam-input" type="text" list="${dlId}" value="${escapeHtml(v)}"
             onchange="updateExamField('${studentId}','${field}',this.value)">
          <datalist id="${dlId}"><option value="Pass"><option value="Fail"></datalist>`;
}

function updateExamField(studentId, field, value){
  if(isCurrentUserGradeEntryLocked()) return;
  const map = getScoreMap();
  if(!map[studentId]) map[studentId] = emptyScoreObj();
  map[studentId][field] = (value===''||value===null||value===undefined) ? null : value;
  renderTable(true);
  saveState();
  const stu = subjectFilteredGradeRoster().find(s=>s.id===studentId);
  logActivity('edit', `Set "${field}" = ${value===''?'—':value} for ${stu?stu.name:'a student'} — ${state.subject||''} (${state.term||'—'})`, { studentId });
}

function renderStandardTable(roster, scoreMap, holder){
  hideMonthPill();
  let rows = roster.map((s, i)=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    const total = (parseFloat(sc.m1)||0)+(parseFloat(sc.m2)||0)+(parseFloat(sc.mid)||0)+(parseFloat(sc.final)||0);
    const pct = Math.round(total*10)/10;
    const g = letterGrade(pct);
    return `
      <tr>
        <td><input type="checkbox" name="studentCheckbox" value="${s.id}" style="cursor:pointer;"></td>
        <td>${i+1}</td>
        <td><span class="seat-badge">${s.displayId||'—'}</span></td>
        <td class="name-col">${s.name}</td>
        <td>${s.classroom ? `<span class="seat-badge">${s.classroom}</span>` : '—'}</td>
        <td>${s.lang2 && s.lang2!=='-' ? s.lang2 : '—'}</td>
        <td>${scoreInputHtml(s.id,'m1',sc.m1,10)}</td>
        <td>${scoreInputHtml(s.id,'m2',sc.m2,10)}</td>
        <td>${scoreInputHtml(s.id,'mid',sc.mid,20)}</td>
        <td>${scoreInputHtml(s.id,'final',sc.final,60)}</td>
        <td class="total-cell">${total}</td>
        <td class="pct-cell">${pct}%</td>
        <td><span class="badge ${g.c}">${g.t}</span></td>
        <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
      </tr>`;
  }).join('');

  holder.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:36px;"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()" style="cursor:pointer;"></th>
          <th style="width:34px;">#</th>
          <th>ID</th>
          <th class="name-col">Student Name</th>
          <th>Class</th>
          <th>2nd Language</th>
          <th>Month 1<br><small>(10)</small></th>
          <th>Month 2<br><small>(10)</small></th>
          <th>Mid-Year<br><small>(20)</small></th>
          <th>Final Exam<br><small>(60)</small></th>
          <th>Total</th>
          <th>Percentage</th>
          <th>Grade</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Grade 9 Prep (both sections) First Month / Second Month Mark Entry screens: a single
// "Cycle 1" / "Cycle 2" score (Max. 15) instead of the standard Month 1/Month 2/Mid-Year/
// Final Exam/Total columns. Percentage and Grade follow the same rules as every other stage.
function renderG9CycleTable(roster, scoreMap, holder){
  hideMonthPill();
  const mode = academicSubMode();
  const field = mode==='month2' ? 'g9c2' : 'g9c1';
  const cycleLabel = mode==='month2' ? 'Cycle 2' : 'Cycle 1';
  const max = 15;

  let rows = roster.map((s, i)=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    const val = sc[field];
    const hasVal = val!==null && val!==undefined && val!=='';
    const pct = hasVal ? Math.round((parseFloat(val)/max*100)*10)/10 : null;
    const g = hasVal ? letterGrade(pct) : null;
    return `
      <tr>
        <td><input type="checkbox" name="studentCheckbox" value="${s.id}" style="cursor:pointer;"></td>
        ${primaryIdCellsHtml(s, i)}
        <td>${scoreInputHtml(s.id,field,val,max)}</td>
        <td class="pct-cell">${hasVal ? pct+'%' : '—'}</td>
        <td>${g ? `<span class="badge ${g.c}">${g.t}</span>` : '—'}</td>
        <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
      </tr>`;
  }).join('');

  holder.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:36px;"><input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()" style="cursor:pointer;"></th>
          ${PRIMARY_ID_HEADERS}
          <th>${cycleLabel}<br><small>(15)</small></th>
          <th>Percentage</th>
          <th>Grade</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Shows the current month/cycle as a small pill above the table instead of eating a
// full header row inside it — keeps the header to one row and saves vertical space.
function setMonthPill(text){
  const el = document.getElementById('monthPill');
  if(!el) return;
  el.textContent = `🗓 ${text}`;
  el.style.display = 'inline-flex';
}
function hideMonthPill(){
  const el = document.getElementById('monthPill');
  if(el) el.style.display = 'none';
}

// Common student-identity columns shown at the start of every primary mark-entry table.
function primaryIdCellsHtml(s, i){
  return `
        <td>${i+1}</td>
        <td><span class="seat-badge">${s.displayId||'—'}</span></td>
        <td class="name-col">${s.name}</td>
        <td>${s.classroom ? `<span class="seat-badge">${s.classroom}</span>` : '—'}</td>
        <td>${s.lang2 && s.lang2!=='-' ? s.lang2 : '—'}</td>`;
}
const PRIMARY_ID_HEADERS = `
          <th style="width:34px;">#</th>
          <th>ID</th>
          <th class="name-col">Student Name</th>
          <th>Class</th>
          <th>2nd Language</th>`;

function isG7G8Prep(){ return !isPrimary() && state.stage === 'prep' && ['g7','g8'].includes(state.grade); }
function isG10G11Secondary(){ return !isPrimary() && state.stage === 'secondary' && ['g10','g11'].includes(state.grade); }
function isExtendedGradingStage(){ return isG7G8Prep() || isG10G11Secondary(); }
// Grade 9 Prep (both English & Arabic sections) uses simplified single-item "Cycle 1" / "Cycle 2"
// mark-entry screens (Max. 15 each) instead of the standard Month 1/Month 2/Mid-Year/Final Exam
// layout — only for the First Month / Second Month Mark Entry screens. Total Coursework Mark
// Entry and Term Total screens for Grade 9 are unaffected and keep the standard layout.
function isG9(){ return !isPrimary() && state.stage === 'prep' && state.grade === 'g9'; }
function isG9CycleMode(){ return isG9() && (state.academicTerm==='month1' || state.academicTerm==='month2'); }
// First Term Exam Paper / End-of-Year Exam Paper mark-entry screen: Max. 60 for Primary Stage,
// Max. 30 for Prep & Secondary Stages (independent of Month 1/2/Coursework and their totals).
function examPaperMax(){ return isPrimary() ? 60 : 30; }

function renderPrimaryTable(roster, scoreMap, holder){
  const mode = academicSubMode();
  if(mode==='month2') return renderPrimaryMonth2Table(roster, scoreMap, holder);
  if(mode==='coursework') return renderPrimaryCourseworkTable(roster, scoreMap, holder);
  return renderPrimaryMonth1Table(roster, scoreMap, holder);
}

/* ---- First Month Mark Entry: Q.1–Q.4, Q. Av., H.W., Beh. & Attend., Total 1, Cycle 1 ---- */
/* Grade 1 & Grade 2 Primary use an extended version: Q. Av., C.W., H.W., Oral (out of 20/20/20/10) + Beh. & Attend. (5) = Total 1 (Max. 75), plus Cycle 1. */
function renderPrimaryMonth1Table(roster, scoreMap, holder){
  const junior = isJuniorPrimary();

  if(junior){
    // Grade 1 & 2 Primary now use the same flexible, teacher-set Q.1–Q.4 maximums
    // as every other grade (Set Quiz Max. Score box), instead of a fixed Max. 5 —
    // computePrimaryTotals() already normalizes t.avg1/month1Total against these
    // per-subject maximums, so only the on-screen inputs/labels need updating here.
    const g3Maxima = g3MaximaFor();
    let rows = roster.map((s, i)=>{
      const sc = scoreMap[s.id] || emptyScoreObj();
      const t = computePrimaryTotals(sc);
      return `
        <tr>
          ${primaryIdCellsHtml(s, i)}
          <td>${scoreInputHtml(s.id,'m1E1',sc.m1E1, g3Maxima.m1E1Max)}</td>
          <td>${scoreInputHtml(s.id,'m1E2',sc.m1E2, g3Maxima.m1E2Max)}</td>
          <td>${scoreInputHtml(s.id,'m1E3',sc.m1E3, g3Maxima.m1E3Max)}</td>
          <td>${scoreInputHtml(s.id,'m1E4',sc.m1E4, g3Maxima.m1E4Max)}</td>
          <td class="pct-cell">${Math.round(t.avg1*10)/10}</td>
          <td>${scoreInputHtml(s.id,'m1CW',sc.m1CW,20)}</td>
          <td>${scoreInputHtml(s.id,'m1Hw',sc.m1Hw,20)}</td>
          <td>${scoreInputHtml(s.id,'m1Oral',sc.m1Oral,10)}</td>
          <td>${scoreInputHtml(s.id,'m1Beh',sc.m1Beh,5)}</td>
          <td class="total-cell">${Math.round(t.month1Total*10)/10}</td>
          <td class="cycle-cell">${scoreInputHtml(s.id,'m1Cycle',sc.m1Cycle,5, sc.m1CycleAtt==='A' ? 'Student marked Absent for Cycle 1' : null)}${cycleAttButtonHtml(s.id,'m1CycleAtt',sc.m1CycleAtt)}</td>
          <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    holder.innerHTML = `${renderG3MaxBoxHtml('m1', 'Month 1')}
      <table>
        <thead>
          <tr>${PRIMARY_ID_HEADERS}
            <th>Q. 1</th>
            <th>Q. 2</th>
            <th>Q. 3</th>
            <th>Q. 4</th>
            <th>Q. Av.<br><small>(Max. 20)</small></th>
            <th>C.W.<br><small>(Max. 20)</small></th>
            <th>H.W.<br><small>(Max. 20)</small></th>
            <th>Oral<br><small>(Max. 10)</small></th>
            <th>Beh. &amp;<br>Attend.<br><small>(Max. 5)</small></th>
            <th>Total 1<br><small>(Max. 75)</small></th>
            <th>Cycle 1<br><small>(Max. 5)</small></th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    setMonthPill('1st Month');
    return;
  }

  // Every non-junior grade (3-6 Primary, 7-8 Prep, 10-11 Secondary) now uses the
  // flexible, teacher-set Q.1–Q.4 maximums (Set Quiz Max. Score box) — Grade 9 never
  // reaches this function (it has no Q.1–Q.4 fields; see renderPrimaryTable/isG9()).
  // Grade 7-8 Prep: Q.Av (20) = flexible-Q.Av(out of 5) × 4; C.W. (10); Beh. (10); Total 1 (Max. 40); Cycle 1 (Max. 15).
  // Grade 10-11 Secondary: Q.Av (15) = flexible-Q.Av(out of 5) × 3; C.W. (15); Beh. (10); Total 1 (Max. 40); Cycle 1 (Max. 15).
  const g78 = isG7G8Prep();
  const g1011 = isG10G11Secondary();
  const g3 = true;
  const g3Maxima = g3MaximaFor();
  const extended = g78 || g1011;
  const qMult = g78 ? 4 : 3;
  const qMax = g78 ? 20 : 15;
  const cwMax = g78 ? 10 : 15;
  const cycleMax = extended ? 15 : 5;
  let rows = roster.map((s, i)=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    const t = computePrimaryTotals(sc);
    // ===== Flexible Q.1–Q.4 maxima: استخدام calculateGrade3QAv للجميع =====
    const qAv = calculateGrade3QAv(sc.m1E1, sc.m1E2, sc.m1E3, sc.m1E4, false) * (extended ? qMult : 1);
    return `
      <tr>
        ${primaryIdCellsHtml(s, i)}
        <td>${scoreInputHtml(s.id,'m1E1',sc.m1E1, g3Maxima.m1E1Max)}</td>
        <td>${scoreInputHtml(s.id,'m1E2',sc.m1E2, g3Maxima.m1E2Max)}</td>
        <td>${scoreInputHtml(s.id,'m1E3',sc.m1E3, g3Maxima.m1E3Max)}</td>
        <td>${scoreInputHtml(s.id,'m1E4',sc.m1E4, g3Maxima.m1E4Max)}</td>
        <td class="pct-cell">${Math.round(qAv*10)/10}</td>
        <td>${scoreInputHtml(s.id,'m1CW',sc.m1CW, extended?cwMax:20)}</td>
        <td>${scoreInputHtml(s.id,'m1Beh',sc.m1Beh,10)}</td>
        <td class="total-cell">${Math.round((qAv + (parseFloat(sc.m1CW)||0) + (parseFloat(sc.m1Beh)||0))*10)/10}</td>
        <td class="cycle-cell">${scoreInputHtml(s.id,'m1Cycle',sc.m1Cycle, cycleMax, sc.m1CycleAtt==='A' ? 'Student marked Absent for Cycle 1' : null)}${cycleAttButtonHtml(s.id,'m1CycleAtt',sc.m1CycleAtt)}</td>
        <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
      </tr>`;
  }).join('');

  // ===== Flexible Evaluation: إضافة حقول إدخال الماكس (كل الصفوف) =====
  // Each question unlocks its own column the moment its max is set — the four
  // fields are independent, not an all-or-nothing gate.
  const grade3MaximaHTML = renderG3MaxBoxHtml('m1', 'Month 1');

  holder.innerHTML = `${grade3MaximaHTML}
    <table>
      <thead>
        <tr>${PRIMARY_ID_HEADERS}
          <th>Q. 1</th>
          <th>Q. 2</th>
          <th>Q. 3</th>
          <th>Q. 4</th>
          <th>Q. Av.<br><small>(Max. ${extended?qMax:5})</small></th>
          <th>C.W.<br><small>(Max. ${extended?cwMax:20})</small></th>
          <th>Beh. &amp;<br>Attend.<br><small>(Max. 10)</small></th>
          <th>Total 1<br><small>(Max. ${extended?40:35})</small></th>
          <th>Cycle 1<br><small>(Max. ${cycleMax})</small></th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  setMonthPill('1st Month');
}

/* ---- Second Month Mark Entry: Q.1–Q.4, Q. Av., H.W., Beh. & Attend., Total 2, Cycle 2 ---- */
/* Grade 1 & Grade 2 Primary use an extended version: Q. Av., C.W., H.W., Oral (out of 20/20/20/10) + Beh. & Attend. (5) = Total 2 (Max. 75), plus Cycle 2. */
function renderPrimaryMonth2Table(roster, scoreMap, holder){
  const junior = isJuniorPrimary();

  if(junior){
    // Grade 1 & 2 Primary now use the same flexible, teacher-set Q.1–Q.4 maximums
    // as every other grade (Set Quiz Max. Score box), instead of a fixed Max. 5 —
    // computePrimaryTotals() already normalizes t.avg2/month2Total against these
    // per-subject maximums, so only the on-screen inputs/labels need updating here.
    const g3Maxima = g3MaximaFor();
    let rows = roster.map((s, i)=>{
      const sc = scoreMap[s.id] || emptyScoreObj();
      const t = computePrimaryTotals(sc);
      return `
        <tr>
          ${primaryIdCellsHtml(s, i)}
          <td>${scoreInputHtml(s.id,'m2E1',sc.m2E1, g3Maxima.m2E1Max)}</td>
          <td>${scoreInputHtml(s.id,'m2E2',sc.m2E2, g3Maxima.m2E2Max)}</td>
          <td>${scoreInputHtml(s.id,'m2E3',sc.m2E3, g3Maxima.m2E3Max)}</td>
          <td>${scoreInputHtml(s.id,'m2E4',sc.m2E4, g3Maxima.m2E4Max)}</td>
          <td class="pct-cell">${Math.round(t.avg2*10)/10}</td>
          <td>${scoreInputHtml(s.id,'m2CW',sc.m2CW,20)}</td>
          <td>${scoreInputHtml(s.id,'m2Hw',sc.m2Hw,20)}</td>
          <td>${scoreInputHtml(s.id,'m2Oral',sc.m2Oral,10)}</td>
          <td>${scoreInputHtml(s.id,'m2Beh',sc.m2Beh,5)}</td>
          <td class="total-cell">${Math.round(t.month2Total*10)/10}</td>
          <td class="cycle-cell">${scoreInputHtml(s.id,'m2Cycle',sc.m2Cycle,5, sc.m2CycleAtt==='A' ? 'Student marked Absent for Cycle 2' : null)}${cycleAttButtonHtml(s.id,'m2CycleAtt',sc.m2CycleAtt)}</td>
          <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    holder.innerHTML = `${renderG3MaxBoxHtml('m2', 'Month 2')}
      <table>
        <thead>
          <tr>${PRIMARY_ID_HEADERS}
            <th>Q. 1</th>
            <th>Q. 2</th>
            <th>Q. 3</th>
            <th>Q. 4</th>
            <th>Q. Av.<br><small>(Max. 20)</small></th>
            <th>C.W.<br><small>(Max. 20)</small></th>
            <th>H.W.<br><small>(Max. 20)</small></th>
            <th>Oral<br><small>(Max. 10)</small></th>
            <th>Beh. &amp;<br>Attend.<br><small>(Max. 5)</small></th>
            <th>Total 2<br><small>(Max. 75)</small></th>
            <th>Cycle 2<br><small>(Max. 5)</small></th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    setMonthPill('2nd Month');
    return;
  }

  // Every non-junior grade (3-6 Primary, 7-8 Prep, 10-11 Secondary) now uses the
  // flexible, teacher-set Q.1–Q.4 maximums (Set Quiz Max. Score box) — Grade 9 never
  // reaches this function (it has no Q.1–Q.4 fields; see renderPrimaryTable/isG9()).
  // Grade 7-8 Prep: Q.Av (20) = flexible-Q.Av(out of 5) × 4; C.W. (10); Beh. (10); Total 2 (Max. 40); Cycle 2 (Max. 15).
  // Grade 10-11 Secondary: Q.Av (15) = flexible-Q.Av(out of 5) × 3; C.W. (15); Beh. (10); Total 2 (Max. 40); Cycle 2 (Max. 15).
  const g78 = isG7G8Prep();
  const g1011 = isG10G11Secondary();
  const g3 = true;
  const g3Maxima = g3MaximaFor();
  const extended = g78 || g1011;
  const qMult = g78 ? 4 : 3;
  const qMax = g78 ? 20 : 15;
  const cwMax = g78 ? 10 : 15;
  const cycleMax = extended ? 15 : 5;
  let rows = roster.map((s, i)=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    const t = computePrimaryTotals(sc);
    // ===== Flexible Q.1–Q.4 maxima: استخدام calculateGrade3QAv للجميع =====
    const qAv = calculateGrade3QAv(sc.m2E1, sc.m2E2, sc.m2E3, sc.m2E4, true) * (extended ? qMult : 1);
    return `
      <tr>
        ${primaryIdCellsHtml(s, i)}
        <td>${scoreInputHtml(s.id,'m2E1',sc.m2E1, g3Maxima.m2E1Max)}</td>
        <td>${scoreInputHtml(s.id,'m2E2',sc.m2E2, g3Maxima.m2E2Max)}</td>
        <td>${scoreInputHtml(s.id,'m2E3',sc.m2E3, g3Maxima.m2E3Max)}</td>
        <td>${scoreInputHtml(s.id,'m2E4',sc.m2E4, g3Maxima.m2E4Max)}</td>
        <td class="pct-cell">${Math.round(qAv*10)/10}</td>
        <td>${scoreInputHtml(s.id,'m2CW',sc.m2CW, extended?cwMax:20)}</td>
        <td>${scoreInputHtml(s.id,'m2Beh',sc.m2Beh,10)}</td>
        <td class="total-cell">${Math.round((qAv + (parseFloat(sc.m2CW)||0) + (parseFloat(sc.m2Beh)||0))*10)/10}</td>
        <td class="cycle-cell">${scoreInputHtml(s.id,'m2Cycle',sc.m2Cycle, cycleMax, sc.m2CycleAtt==='A' ? 'Student marked Absent for Cycle 2' : null)}${cycleAttButtonHtml(s.id,'m2CycleAtt',sc.m2CycleAtt)}</td>
        <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
      </tr>`;
  }).join('');

  // Each question unlocks its own column the moment its max is set — the four
  // fields are independent, not an all-or-nothing gate.
  const grade3MaximaHTML = renderG3MaxBoxHtml('m2', 'Month 2');

  holder.innerHTML = `${grade3MaximaHTML}
    <table>
      <thead>
        <tr>${PRIMARY_ID_HEADERS}
          <th>Q. 1</th>
          <th>Q. 2</th>
          <th>Q. 3</th>
          <th>Q. 4</th>
          <th>Q. Av.<br><small>(Max. ${extended?qMax:5})</small></th>
          <th>C.W.<br><small>(Max. ${extended?cwMax:20})</small></th>
          <th>Beh. &amp;<br>Attend.<br><small>(Max. 10)</small></th>
          <th>Total 2<br><small>(Max. ${extended?40:35})</small></th>
          <th>Cycle 2<br><small>(Max. ${cycleMax})</small></th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  setMonthPill('2nd Month');
}

/* ---- Total Coursework Mark Entry ---- */
/* Standard grades: Two Months Av., Total Cycles, Activity, Per. Tasks, Total Coursework, Percentage, Grade. */
/* Grade 1 & Grade 2 Primary use a "Term Av." structure instead: Two Months Av. (avg of Total 1 & Total 2, Max.75) + Activity (Max.20) + Skills (Max.5) = Term Total (Max.100), plus Grade and Color. */
function renderPrimaryCourseworkTable(roster, scoreMap, holder){
  hideMonthPill();
  const junior = isJuniorPrimary();

  if(junior){
    let rows = roster.map((s, i)=>{
      const sc = scoreMap[s.id] || emptyScoreObj();
      const t = computePrimaryTotals(sc);
      const pct = Math.round((t.totalCoursework / t.maxTotal * 100) * 10) / 10;
      const g = letterGrade(pct);
      const col = courseworkColor(pct);
      return `
        <tr>
          ${primaryIdCellsHtml(s, i)}
          <td class="pct-cell">${Math.round(t.twoMonthsAvg*10)/10}</td>
          <td>${scoreInputHtml(s.id,'activity',sc.activity,20)}</td>
          <td>${scoreInputHtml(s.id,'tasks',sc.tasks,5)}</td>
          <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
          <td><span class="badge ${g.c}">${g.t}</span></td>
          <td><span class="badge ${col.c}">${col.t}</span></td>
          <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    holder.innerHTML = `
      <table>
        <thead>
          <tr>${PRIMARY_ID_HEADERS}
            <th colspan="6">Term Av.</th>
            <th></th>
          </tr>
          <tr>
            <th></th><th></th><th></th><th></th><th></th>
            <th>Two Months<br>Av.<br><small>(Max. 75)</small></th>
            <th>Activity<br><small>(Max. 20)</small></th>
            <th>Skills<br><small>(Max. 5)</small></th>
            <th>Term Total<br><small>(Max. 100)</small></th>
            <th>Grade</th>
            <th>Color</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    return;
  }

  const g78 = isG7G8Prep();
  const g1011 = isG10G11Secondary();

  if(g78 || g1011){
    let rows = roster.map((s, i)=>{
      const sc = scoreMap[s.id] || emptyScoreObj();
      const t = computePrimaryTotals(sc);
      return `
        <tr>
          ${primaryIdCellsHtml(s, i)}
          <td class="pct-cell">${Math.round(t.twoMonthsAvg*10)/10}</td>
          <td class="pct-cell">${Math.round(t.totalCycles*10)/10}</td>
          <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
          <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
        </tr>`;
    }).join('');

    holder.innerHTML = `
      <table>
        <thead>
          <tr>${PRIMARY_ID_HEADERS}
            <th>Two Months<br>Av.<br><small>(Max. 40)</small></th>
            <th>Total<br>Cycles<br><small>(Max. 30)</small></th>
            <th>Total<br>Coursework<br><small>(Max. 70)</small></th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
    return;
  }

  const twoMonthsMax = 15;
  const courseworkMax = 40;
  let rows = roster.map((s, i)=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    const t = computePrimaryTotals(sc);
    const pct = Math.round((t.totalCoursework / t.maxTotal * 100) * 10) / 10;
    const g = letterGrade(pct);
    return `
      <tr>
        ${primaryIdCellsHtml(s, i)}
        <td class="pct-cell">${Math.round(t.twoMonthsAvg*10)/10}</td>
        <td class="pct-cell">${Math.round(t.totalCycles*10)/10}</td>
        <td>${scoreInputHtml(s.id,'activity',sc.activity,5)}</td>
        <td>${scoreInputHtml(s.id,'tasks',sc.tasks,10)}</td>
        <td class="total-cell">${Math.round(t.totalCoursework*10)/10}</td>
        <td class="pct-cell">${pct}%</td>
        <td><span class="badge ${g.c}">${g.t}</span></td>
        <td><button class="del-btn" onclick="deleteStudent('${s.id}')" title="Delete">✕</button></td>
      </tr>`;
  }).join('');

  holder.innerHTML = `
    <table>
      <thead>
        <tr>${PRIMARY_ID_HEADERS}
          <th>Two Months<br>Av.<br><small>(max. ${twoMonthsMax})</small></th>
          <th>Total<br>Cycles<br><small>(Max. 10)</small></th>
          <th>Activity<br><small>(Max. 5)</small></th>
          <th>Per. Tasks<br><small>(Max. 10)</small></th>
          <th>Total<br>Coursework<br><small>(Max. ${courseworkMax})</small></th>
          <th>Percentage</th>
          <th>Grade</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ================== EXCEL IMPORT / EXPORT ================== */
function importExcel(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      let added = 0, skipped = 0;
      const roster = getRoster();
      const scoreMap = getScoreMap();

      rows.forEach(row=>{
        const name = (row['Name']||row['Student Name']||row['name']||'').toString().trim();
        if(!name){ skipped++; return; }
        const classroom = (row['Classroom']||row['classroom']||'').toString().trim();
        let religion = (row['Religion']||row['religion']||'-').toString().trim();
        if(!/^(muslim|christian)$/i.test(religion)) religion = religion || '-';
        let lang2 = (row['Second Language']||row['lang2']||'-').toString().trim();
        if(!/^(french|german|english)$/i.test(lang2)) lang2 = lang2 || '-';
        const providedId = (row['ID']||row['id']||'').toString().trim();
        const id = uid();
        const displayId = providedId ? formatMilsId(providedId) : nextDisplayId();
        roster.push({id, displayId, name, classroom, religion, lang2});

        if(isPrimary()){
          const junior = isJuniorPrimary();
          const sc = emptyScoreObj();
          const map = {
            m1E1:['Month 1 Q. 1','Month 1 Q1'], m1E2:['Month 1 Q. 2','Month 1 Q2'], m1E3:['Month 1 Q. 3','Month 1 Q3'], m1E4:['Month 1 Q. 4','Month 1 Q4'],
            m1Hw:['Month 1 H.W.','Month 1 Homework'], m1Beh:['Month 1 Beh. & Attend.','Month 1 Attendance & Behavior'],
            m2E1:['Month 2 Q. 1','Month 2 Q1'], m2E2:['Month 2 Q. 2','Month 2 Q2'], m2E3:['Month 2 Q. 3','Month 2 Q3'], m2E4:['Month 2 Q. 4','Month 2 Q4'],
            m2Hw:['Month 2 H.W.','Month 2 Homework'], m2Beh:['Month 2 Beh. & Attend.','Month 2 Attendance & Behavior'],
            activity:['Activity']
          };
          if(junior){
            map.m1CW = ['Month 1 C.W.','Month 1 Coursework'];
            map.m1Oral = ['Month 1 Oral'];
            map.m2CW = ['Month 2 C.W.','Month 2 Coursework'];
            map.m2Oral = ['Month 2 Oral'];
            map.tasks = ['Skills'];
          } else {
            map.m1Cycle = ['Cycle 1'];
            map.m2Cycle = ['Cycle 2'];
            map.tasks = ['Per. Tasks','Performance Tasks'];
          }
          const maxes = junior
            ? {m1E1:5,m1E2:5,m1E3:5,m1E4:5,m1CW:20,m1Hw:20,m1Oral:10,m1Beh:5,m2E1:5,m2E2:5,m2E3:5,m2E4:5,m2CW:20,m2Hw:20,m2Oral:10,m2Beh:5,activity:20,tasks:5}
            : {m1E1:5,m1E2:5,m1E3:5,m1E4:5,m1Hw:5,m1Beh:5,m1Cycle:5,m2E1:5,m2E2:5,m2E3:5,m2E4:5,m2Hw:5,m2Beh:5,m2Cycle:5,activity:5,tasks:10};
          let any=false;
          Object.keys(map).forEach(field=>{
            const col = map[field].find(c=> row[c]!==undefined && row[c]!=='');
            if(col!==undefined){ sc[field] = clamp(row[col], maxes[field]); any=true; }
          });
          if(any) scoreMap[id] = sc;
        } else {
          const m1 = row['Month 1']||row['M1']||row['m1']||0;
          const m2 = row['Month 2']||row['M2']||row['m2']||0;
          const mid = row['Mid-Year']||row['Midterm']||row['mid']||0;
          const final = row['Final Exam']||row['Final']||row['final']||0;
          if(m1||m2||mid||final){
            scoreMap[id] = {
              m1: clamp(m1,10), m2: clamp(m2,10), mid: clamp(mid,20), final: clamp(final,60)
            };
          }
        }
        added++;
      });

      renderTable();
      saveState();
      document.getElementById('importTitle').textContent = 'Import Successful';
      document.getElementById('importMsg').textContent = `${added} student(s) added${skipped? ` (${skipped} row(s) without a name were skipped)`:''} to the current class list.`;
      logActivity('import', `Imported ${added} student(s) from Excel into ${STAGES[state.stage].label}, ${state.term||'—'}${skipped?` (${skipped} skipped)`:''}`);
      document.getElementById('importResultOverlay').classList.add('show');
    }catch(err){
      alert('Could not read the file. Make sure it is a valid Excel file and that the first column contains "Student Name".');
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('excelInput').value='';
}

function closeOverlay(){ document.getElementById('importResultOverlay').classList.remove('show'); }

function exportExcel(){
  const roster = visibleRoster(getRoster());
  const scoreMap = getScoreMap();
  const gradeLabel = STAGES[state.stage].grades.find(g=>g.id===state.grade).label;
  const termLabel = state.term;

  const rows = roster.map((s,i)=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    const base = {
      "ID": s.displayId||'',
      "#": i+1,
      "Student Name": s.name,
      "Classroom": s.classroom,
      "Religion": (s.religion && s.religion!=='-') ? s.religion : '',
      "Second Language": (s.lang2 && s.lang2!=='-') ? s.lang2 : '',
      [markEntryLabel(state.termPeriod,'examPaper')]: sc.examPaper??''
    };
    if(isPrimary()){
      const t = computePrimaryTotals(sc);
      const pct = Math.round((t.totalCoursework / t.maxTotal * 100) * 10) / 10;
      const g = letterGrade(pct);
      if(t.junior){
        const col = courseworkColor(pct);
        return {
          ...base,
          "Month 1 Q. 1": sc.m1E1??'', "Month 1 Q. 2": sc.m1E2??'',
          "Month 1 Q. 3": sc.m1E3??'', "Month 1 Q. 4": sc.m1E4??'', "Month 1 Q. Av.": Math.round(t.avg1*10)/10,
          "Month 1 C.W.": sc.m1CW??'', "Month 1 H.W.": sc.m1Hw??'', "Month 1 Oral": sc.m1Oral??'',
          "Month 1 Beh. & Attend.": sc.m1Beh??'', "Month 1 Total": Math.round(t.month1Total*10)/10,
          "Month 2 Q. 1": sc.m2E1??'', "Month 2 Q. 2": sc.m2E2??'',
          "Month 2 Q. 3": sc.m2E3??'', "Month 2 Q. 4": sc.m2E4??'', "Month 2 Q. Av.": Math.round(t.avg2*10)/10,
          "Month 2 C.W.": sc.m2CW??'', "Month 2 H.W.": sc.m2Hw??'', "Month 2 Oral": sc.m2Oral??'',
          "Month 2 Beh. & Attend.": sc.m2Beh??'', "Month 2 Total": Math.round(t.month2Total*10)/10,
          "Two Months Av.": Math.round(t.twoMonthsAvg*10)/10,
          "Activity": sc.activity??'', "Skills": sc.tasks??'',
          "Term Total": Math.round(t.totalCoursework*10)/10, "Grade": g.t, "Color": col.t
        };
      }
      return {
        ...base,
        "Month 1 Q. 1": sc.m1E1??'', "Month 1 Q. 2": sc.m1E2??'',
        "Month 1 Q. 3": sc.m1E3??'', "Month 1 Q. 4": sc.m1E4??'', "Month 1 Q. Av.": Math.round(t.avg1*10)/10,
        "Month 1 H.W.": sc.m1Hw??'', "Month 1 Beh. & Attend.": sc.m1Beh??'', "Month 1 Total": Math.round(t.month1Total*10)/10,
        "Cycle 1": sc.m1Cycle??'',
        "Month 2 Q. 1": sc.m2E1??'', "Month 2 Q. 2": sc.m2E2??'',
        "Month 2 Q. 3": sc.m2E3??'', "Month 2 Q. 4": sc.m2E4??'', "Month 2 Q. Av.": Math.round(t.avg2*10)/10,
        "Month 2 H.W.": sc.m2Hw??'', "Month 2 Beh. & Attend.": sc.m2Beh??'', "Month 2 Total": Math.round(t.month2Total*10)/10,
        "Cycle 2": sc.m2Cycle??'',
        "Two Months Av.": Math.round(t.twoMonthsAvg*10)/10, "Total Cycles": Math.round(t.totalCycles*10)/10,
        "Activity": sc.activity??'', "Per. Tasks": sc.tasks??'',
        "Total Coursework": Math.round(t.totalCoursework*10)/10, "Percentage": `${pct}%`, "Grade": g.t
      };
    }
    if(isG9()){
      const c1 = sc.g9c1, c2 = sc.g9c2;
      const hasC1 = c1!==null && c1!==undefined && c1!=='';
      const hasC2 = c2!==null && c2!==undefined && c2!=='';
      const pct1 = hasC1 ? Math.round((parseFloat(c1)/15*100)*10)/10 : '';
      const pct2 = hasC2 ? Math.round((parseFloat(c2)/15*100)*10)/10 : '';
      const g1 = hasC1 ? letterGrade(pct1).t : '';
      const g2 = hasC2 ? letterGrade(pct2).t : '';
      return {
        ...base,
        "Cycle 1": c1??'', "Cycle 1 Percentage": hasC1?`${pct1}%`:'', "Cycle 1 Grade": g1,
        "Cycle 2": c2??'', "Cycle 2 Percentage": hasC2?`${pct2}%`:'', "Cycle 2 Grade": g2
      };
    }
    const total = (parseFloat(sc.m1)||0)+(parseFloat(sc.m2)||0)+(parseFloat(sc.mid)||0)+(parseFloat(sc.final)||0);
    const g = letterGrade(total);
    return {
      ...base,
      "Month 1": sc.m1??'', "Month 2": sc.m2??'', "Mid-Year": sc.mid??'', "Final Exam": sc.final??'',
      "Total": total, "Grade": g.t
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Grades");
  const fname = `${SECTIONS[state.section].label}_${gradeLabel}_${termLabel}_${state.subject}.xlsx`.replace(/\s+/g,'_');
  XLSX.writeFile(wb, fname);
}

/* ================== UPLOAD GRADES BY ITEM (single-column Excel upload) ================== */
// Returns the list of editable score fields shown on the CURRENT mark-entry screen
// (same set of columns as renderTable would draw as <input> cells), each with a
// human-readable label and its max grade. Used to populate the item dropdown and to
// know which column of an uploaded sheet to read/clamp against.
function editableFieldsForCurrentScreen(){
  const mode = academicSubMode();
  if(mode==='examPaper'){
    if(isPrimary() && isJuniorPrimary()) return [
      {field:'examInitial', label:'Initial Exam', type:'text', options:['Pass','Fail']},
      {field:'examFinal', label:'Final Exam', type:'text', options:['Pass','Fail']}
    ];
    return [{ field:'examPaper', label: markEntryLabel(state.termPeriod,'examPaper'), max: examPaperMax() }];
  }
  if(isPrimary() || isExtendedGradingStage()){
    const junior = isJuniorPrimary();
    const g78 = isG7G8Prep();
    const g1011 = isG10G11Secondary();
    const extended = g78 || g1011;

    if(mode==='month1'){
      if(junior) return [
        {field:'m1E1',label:'Month 1 Q. 1',max:5}, {field:'m1E2',label:'Month 1 Q. 2',max:5},
        {field:'m1E3',label:'Month 1 Q. 3',max:5}, {field:'m1E4',label:'Month 1 Q. 4',max:5},
        {field:'m1CW',label:'Month 1 C.W.',max:20}, {field:'m1Hw',label:'Month 1 H.W.',max:20},
        {field:'m1Oral',label:'Month 1 Oral',max:10}, {field:'m1Beh',label:'Month 1 Beh. & Attend.',max:5},
        {field:'m1Cycle',label:'Cycle 1',max:5}
      ];
      if(extended) return [
        {field:'m1E1',label:'Month 1 Q. 1',max:5}, {field:'m1E2',label:'Month 1 Q. 2',max:5},
        {field:'m1E3',label:'Month 1 Q. 3',max:5}, {field:'m1E4',label:'Month 1 Q. 4',max:5},
        {field:'m1CW',label:'Month 1 C.W.',max:(g78?10:15)}, {field:'m1Beh',label:'Month 1 Beh. & Attend.',max:10},
        {field:'m1Cycle',label:'Cycle 1',max:15}
      ];
      return [
        {field:'m1E1',label:'Month 1 Q. 1',max:5}, {field:'m1E2',label:'Month 1 Q. 2',max:5},
        {field:'m1E3',label:'Month 1 Q. 3',max:5}, {field:'m1E4',label:'Month 1 Q. 4',max:5},
        {field:'m1CW',label:'Month 1 C.W.',max:20}, {field:'m1Beh',label:'Month 1 Beh. & Attend.',max:10},
        {field:'m1Cycle',label:'Cycle 1',max:5}
      ];
    }
    if(mode==='month2'){
      if(junior) return [
        {field:'m2E1',label:'Month 2 Q. 1',max:5}, {field:'m2E2',label:'Month 2 Q. 2',max:5},
        {field:'m2E3',label:'Month 2 Q. 3',max:5}, {field:'m2E4',label:'Month 2 Q. 4',max:5},
        {field:'m2CW',label:'Month 2 C.W.',max:20}, {field:'m2Hw',label:'Month 2 H.W.',max:20},
        {field:'m2Oral',label:'Month 2 Oral',max:10}, {field:'m2Beh',label:'Month 2 Beh. & Attend.',max:5},
        {field:'m2Cycle',label:'Cycle 2',max:5}
      ];
      if(extended) return [
        {field:'m2E1',label:'Month 2 Q. 1',max:5}, {field:'m2E2',label:'Month 2 Q. 2',max:5},
        {field:'m2E3',label:'Month 2 Q. 3',max:5}, {field:'m2E4',label:'Month 2 Q. 4',max:5},
        {field:'m2CW',label:'Month 2 C.W.',max:(g78?10:15)}, {field:'m2Beh',label:'Month 2 Beh. & Attend.',max:10},
        {field:'m2Cycle',label:'Cycle 2',max:15}
      ];
      return [
        {field:'m2E1',label:'Month 2 Q. 1',max:5}, {field:'m2E2',label:'Month 2 Q. 2',max:5},
        {field:'m2E3',label:'Month 2 Q. 3',max:5}, {field:'m2E4',label:'Month 2 Q. 4',max:5},
        {field:'m2CW',label:'Month 2 C.W.',max:20}, {field:'m2Beh',label:'Month 2 Beh. & Attend.',max:10},
        {field:'m2Cycle',label:'Cycle 2',max:5}
      ];
    }
    // coursework screen
    if(junior) return [{field:'activity',label:'Activity',max:20}, {field:'tasks',label:'Skills',max:5}];
    if(extended) return []; // Total Coursework here is fully computed from Month 1/2 — nothing to upload
    return [{field:'activity',label:'Activity',max:5}, {field:'tasks',label:'Per. Tasks',max:10}];
  }
  if(isG9CycleMode()){
    const field = mode==='month2' ? 'g9c2' : 'g9c1';
    const label = mode==='month2' ? 'Cycle 2' : 'Cycle 1';
    return [{field, label, max:15}];
  }
  // Standard (non-Primary, non-extended) subjects: same 4 fields regardless of Mark Entry screen
  return [
    {field:'m1',label:'Month 1',max:10}, {field:'m2',label:'Month 2',max:10},
    {field:'mid',label:'Mid-Year',max:20}, {field:'final',label:'Final Exam',max:60}
  ];
}

function gradeItemUploadReadOnly(){
  return !!(currentUser && currentUser.effective && currentUser.effective.edit===false) || isCurrentUserGradeEntryLocked();
}

function openGradeItemUploadModal(){
  if(gradeItemUploadReadOnly()){
    if(isCurrentUserGradeEntryLocked()) gradeEntryLockAlert();
    else alert('Your account does not have edit access to the Grade Book.');
    return;
  }
  const fields = editableFieldsForCurrentScreen();
  const sel = document.getElementById('gradeItemSelect');
  if(fields.length===0){
    sel.innerHTML = `<option value="">No editable item on this screen</option>`;
  } else {
    sel.innerHTML = fields.map(f=>`<option value="${f.field}">${f.label}${f.type==='text' ? ` (${f.options.join('/')})` : ` (Max. ${f.max})`}</option>`).join('');
  }
  renderGradeItemScopeNote();
  document.getElementById('gradeItemUploadOverlay').classList.add('show');
}
function closeGradeItemUploadModal(){
  document.getElementById('gradeItemUploadOverlay').classList.remove('show');
}
function currentGradeItemFieldDef(){
  const fields = editableFieldsForCurrentScreen();
  const sel = document.getElementById('gradeItemSelect');
  return fields.find(f=> f.field===sel.value) || null;
}
// The Exam Paper item covers the whole Grade at once; every other item is scoped to the
// currently-selected Class. Surfaces that distinction right in the upload modal.
function renderGradeItemScopeNote(){
  const note = document.getElementById('gradeItemScopeNote');
  if(!note) return;
  note.innerHTML = academicSubMode()==='examPaper'
    ? `This item is entered once for the <b>whole Grade</b> — the template and upload cover every student in ${STAGES[state.stage] ? STAGES[state.stage].grades.find(g=>g.id===state.grade).label : 'this grade'}, across all classes, not just "${state.term}".`
    : `This item is scoped to the current Class ("${state.term}") — only students in this class are included.`;
}

// The Exam Paper item (First Term / End-of-Year) is entered once for the whole Grade, so its
// upload/template use every student in the Grade; every other item stays scoped to the
// currently-selected Class, same as the on-screen mark-entry table.
function rosterForGradeItemUpload(){
  return academicSubMode()==='examPaper' ? subjectFilteredGradeRoster() : subjectFilteredRoster();
}

function downloadGradeItemTemplate(){
  const def = currentGradeItemFieldDef();
  if(!def){ alert('There is no editable item to upload on the current Mark Entry screen — the Total Coursework screen for this grade is fully calculated automatically.'); return; }
  const roster = rosterForGradeItemUpload();
  const scoreMap = getScoreMap();
  const rows = roster.map(s=>{
    const sc = scoreMap[s.id] || emptyScoreObj();
    return { "ID": s.displayId||'', "Student Name": s.name, [def.label]: sc[def.field]??'' };
  });
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "ID":'', "Student Name":'', [def.label]:'' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  const gradeLabel = STAGES[state.stage].grades.find(g=>g.id===state.grade).label;
  const scopeLabel = academicSubMode()==='examPaper' ? 'Whole_Grade' : state.term;
  const base = `${def.label}_${gradeLabel}_${scopeLabel}_${state.subject}_Template`.replace(/[\s.]+/g,'_');
  const fname = `${base}.xlsx`;
  XLSX.writeFile(wb, fname);
}

function handleGradeItemExcelFile(file){
  if(!file) return;
  if(gradeItemUploadReadOnly()){ gradeEntryLockAlert(); document.getElementById('gradeItemExcelInput').value=''; return; }
  const def = currentGradeItemFieldDef();
  if(!def){
    alert('There is no editable item to upload on the current Mark Entry screen.');
    document.getElementById('gradeItemExcelInput').value='';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      const roster = rosterForGradeItemUpload();
      const scoreMap = getScoreMap();
      let updated = 0;
      const notFound = [];

      rows.forEach(row=>{
        const idVal = (row['ID']||row['id']||row['Student ID']||'').toString().trim();
        const nameVal = (row['Name']||row['Student Name']||row['name']||'').toString().trim();
        let scoreVal;
        if(row[def.label]!==undefined && row[def.label]!=='') scoreVal = row[def.label];
        else if(row['Score']!==undefined && row['Score']!=='') scoreVal = row['Score'];
        else if(row['score']!==undefined && row['score']!=='') scoreVal = row['score'];
        if(scoreVal===undefined || scoreVal==='') return;

        let stu = null;
        if(idVal) stu = roster.find(s=> (s.displayId||'').toString().trim().toLowerCase()===idVal.toLowerCase());
        if(!stu && nameVal) stu = roster.find(s=> s.name.trim().toLowerCase()===nameVal.toLowerCase());
        if(!stu){ if(idVal||nameVal) notFound.push(idVal||nameVal); return; }

        if(!scoreMap[stu.id]) scoreMap[stu.id] = emptyScoreObj();
        if(def.type==='text'){
          const raw = scoreVal.toString().trim();
          const match = def.options.find(o=> o.toLowerCase()===raw.toLowerCase());
          scoreMap[stu.id][def.field] = match || raw;
        } else {
          scoreMap[stu.id][def.field] = clamp(scoreVal, def.max);
        }
        updated++;
      });

      renderTable();
      saveState();
      closeGradeItemUploadModal();
      document.getElementById('importTitle').textContent = 'Upload Complete';
      document.getElementById('importMsg').textContent =
        `${updated} score(s) updated for "${def.label}".` +
        (notFound.length ? ` ${notFound.length} row(s) could not be matched to a student in the current list: ${notFound.slice(0,10).join(', ')}${notFound.length>10?'…':''}.` : '');
      logActivity('edit', `Bulk-uploaded "${def.label}" via Excel for ${updated} student(s) — ${state.subject||''} (${state.term||'—'})`, { studentIds: Object.keys(scoreMap) });
      document.getElementById('importResultOverlay').classList.add('show');
    }catch(err){
      alert('Could not read the file. Make sure it is a valid Excel file with an ID or Student Name column, and a matching score column.');
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('gradeItemExcelInput').value='';
}

/* ================== FULL BACKUP (JSON) ================== */
const LS_KEY = 'gradesSystemData_v1';
const GRADEBOOK_LAST_KEY = 'gradesSystemLastSelection_v1';
function saveLastGradebookSelection(){
  try{
    const { termPeriod, section, stage, grade, term, academicTerm, subject } = state;
    localStorage.setItem(GRADEBOOK_LAST_KEY, JSON.stringify({ termPeriod, section, stage, grade, term, academicTerm, subject }));
  }catch(err){}
}
function loadLastGradebookSelection(){
  try{
    const raw = localStorage.getItem(GRADEBOOK_LAST_KEY);
    if(!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
  }catch(err){}
}

function saveState(){
  saveStateLocalOnly();
  markGradeBookUnsaved();
}
function saveStateLocalOnly(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify({ students, scores, studentIdCounter, attendance, approvedLeave, teachers, teacherIdCounter, deletedTeacherIds, savedAt: new Date().toISOString() }));
    flashSaveIndicator();
    updateQuickStatsWidget();
  }catch(err){ console.warn('Auto-save failed', err); }
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return;
    const payload = JSON.parse(raw);
    students = payload.students || {};
    scores = payload.scores || {};
    studentIdCounter = payload.studentIdCounter || 1;
    attendance = payload.attendance || {};
    approvedLeave = payload.approvedLeave || {};
    teachers = payload.teachers || [];
    teacherIdCounter = payload.teacherIdCounter || 1;
    deletedTeacherIds = payload.deletedTeacherIds || [];
  }catch(err){ console.warn('Auto-load failed', err); }
}

let saveFlashTimer = null;
function flashSaveIndicator(){
  const el = document.getElementById('saveIndicator');
  if(!el) return;
  el.classList.add('show');
  clearTimeout(saveFlashTimer);
  saveFlashTimer = setTimeout(()=> el.classList.remove('show'), 1200);
}

/* Shows a small floating "✓ Saved" badge right above whichever field the
   user just edited, since the top-of-page indicator is easy to miss while
   scrolled down into a long table. */
function flashInlineSaved(el){
  if(!el || typeof el.getBoundingClientRect !== 'function') return;
  const rect = el.getBoundingClientRect();
  const badge = document.createElement('div');
  badge.className = 'inline-saved-badge';
  badge.textContent = '✓ Saved';
  badge.style.left = (rect.left + rect.width/2) + 'px';
  badge.style.top = rect.top + 'px';
  document.body.appendChild(badge);
  requestAnimationFrame(()=> badge.classList.add('show'));
  setTimeout(()=>{
    badge.classList.remove('show');
    setTimeout(()=> badge.remove(), 200);
  }, 1000);
}

/* ================== GRADE BOOK MANUAL SAVE (FIRESTORE) ==================
   Score entry, Add/Delete Student, Bulk/Excel import, and Attendance-driven
   grade updates all funnel through saveState(), which used to push to
   Firestore automatically (debounced ~2.5s) after every change. That has
   been replaced with a manual "Save" button inside the Grade Book: edits
   still save to this browser instantly, but only sync to Firestore — and
   to every other device — once the person clicks Save. */
let gbUnsavedChanges = false;

function markGradeBookUnsaved(){
  const wasAlreadyUnsaved = gbUnsavedChanges;
  gbUnsavedChanges = true;
  updateGradeBookSaveUI();
  if(!wasAlreadyUnsaved) scheduleGbUnsavedReminder(true);
}

/* ---------- Reminder for unsaved Grade Book changes ----------
   The floating Save button already pulses while gbUnsavedChanges is true,
   but a pulsing button is easy to miss if someone is scrolled deep into a
   long grade sheet or simply not looking at that corner of the screen.
   This adds a periodic toast + a short, gentle chime so it's much harder to
   walk away with edits that never made it to Firestore (and so never
   reached any other device). First reminder fires ~45s after the FIRST
   unsaved edit; if still unsaved, it repeats every ~90s until Save is
   pressed (or the save fails and the person tries again). */
let gbReminderTimer = null;
const GB_REMINDER_FIRST_DELAY_MS = 45000;
const GB_REMINDER_REPEAT_MS = 90000;

function scheduleGbUnsavedReminder(isFirst){
  clearTimeout(gbReminderTimer);
  if(!gbUnsavedChanges) return;
  gbReminderTimer = setTimeout(()=>{
    if(!gbUnsavedChanges) return;
    showGbToast('reminder', '⚠ عندك تعديلات لسه متحفظتش — دوس "حفظ" علشان تظهر على باقي الأجهزة');
    playGbReminderChime();
    scheduleGbUnsavedReminder(false);
  }, isFirst ? GB_REMINDER_FIRST_DELAY_MS : GB_REMINDER_REPEAT_MS);
}
function stopGbUnsavedReminder(){
  clearTimeout(gbReminderTimer);
  gbReminderTimer = null;
}
// Two short, quiet tones (no audio file needed) — just enough to catch
// attention without being jarring. Silently does nothing if the browser
// blocks audio before any user interaction has happened on the page yet.
function playGbReminderChime(){
  try{
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return;
    const ctx = new Ctx();
    [740, 990].forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const startAt = ctx.currentTime + i*0.16;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(0.12, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.24);
    });
    setTimeout(()=>{ try{ ctx.close(); }catch(err){} }, 900);
  }catch(err){ /* audio isn't essential — fail silently */ }
}

function updateGradeBookSaveUI(){
  const btn = document.getElementById('gbSaveBtn');
  const label = document.getElementById('gbSaveBtnLabel');
  const statusEl = document.getElementById('gbSaveStatusText');
  if(btn && !btn.disabled){
    btn.classList.toggle('unsaved', gbUnsavedChanges);
    if(label) label.textContent = gbUnsavedChanges ? '💾 Save (unsaved changes)' : '💾 Save';
  }
  if(statusEl){
    statusEl.classList.toggle('unsaved', gbUnsavedChanges);
    statusEl.textContent = gbUnsavedChanges ? 'You have unsaved changes' : 'All changes saved to Firestore';
  }
}

async function saveGradeBookNow(){
  const btn = document.getElementById('gbSaveBtn');
  const label = document.getElementById('gbSaveBtnLabel');
  if(btn && btn.disabled) return; // a save is already in flight
  if(btn){
    btn.disabled = true;
    btn.classList.remove('unsaved');
    btn.classList.add('saving');
    if(label) label.textContent = 'Saving…';
  }
  showGbToast('saving', 'Saving to Firestore…');
  const ok = await pushGradeBookToFirestore();
  if(ok){
    gbUnsavedChanges = false;
    stopGbUnsavedReminder();
    showGbToast('success', '✓ Saved to Firestore');
  }else{
    gbUnsavedChanges = true;
    showGbToast('error', '✕ Save failed — check your internet connection');
    scheduleGbUnsavedReminder(true); // try to remind again soon since the save didn't go through
  }
  if(btn){ btn.disabled = false; btn.classList.remove('saving'); }
  updateGradeBookSaveUI();
}

/* ---------- Safe merge-write to Firestore ----------
   Both the automatic config sync (pushToGithub) and the manual Grade Book
   Save button (pushGradeBookToFirestore) used to call FB_DOC_REF.set(payload,
   { merge:false }), replacing the ENTIRE shared document with whatever this
   device happened to have in memory. If two devices saved within a short
   window of each other, the second write silently erased anything the first
   write had added that the second device didn't also have locally (e.g. a
   student added on Device A right before Device B pushed its own older
   snapshot) — with no error, no warning, nothing to see on either device
   except data that had "disappeared".
   pushMergedToFirestore() fixes this by reading the CURRENT server copy
   inside a transaction and merging it with local data field-by-field instead
   of blindly overwriting:
     - students / scores / attendance are objects keyed by classKey / subjKey
       / attendance-key -> merged key-by-key (remote keys this device never
       touched are kept, local keys win where both sides have them).
     - teachers / users are arrays -> merged by their unique id / username.
     - activityLog is merged by entry id (same approach already used when
       applying a remote snapshot).
     - Everything else (termMonthDates, bellTimes, adminStructure, etc.) is
       small single-object admin config that's already edited by one person
       at a time through its own dedicated Save action, so local simply wins.
   This does not eliminate every possible conflict (e.g. the same student's
   same score edited on two devices at the exact same moment will still
   resolve to whichever push's *local* value lands in the transaction last),
   but it removes the much more common and much worse case of one whole
   save wiping out another device's unrelated changes. */
function mergeObjectField(remoteObj, localObj){
  return Object.assign({}, remoteObj || {}, localObj || {});
}
function mergeArrayById(remoteArr, localArr, idKey){
  idKey = idKey || 'id';
  const map = {};
  (remoteArr||[]).forEach(item=>{ if(item && item[idKey]!=null) map[item[idKey]] = item; });
  (localArr||[]).forEach(item=>{ if(item && item[idKey]!=null) map[item[idKey]] = item; });
  return Object.values(map);
}
function mergeActivityLogEntries(remoteArr, localArr){
  const map = {};
  (remoteArr||[]).forEach(e=>{ if(e && e.id!=null) map[e.id] = e; });
  (localArr||[]).forEach(e=>{ if(e && e.id!=null) map[e.id] = e; });
  return Object.values(map).sort((a,b)=> b.ts-a.ts).slice(0, ACTIVITY_LOG_MAX);
}

async function pushMergedToFirestore(){
  try{
    let newVersion = 0;
    await fbDb.runTransaction(async (tx)=>{
      const snap = await tx.get(FB_DOC_REF);
      const remote = (snap.exists ? snap.data() : null) || {};
      newVersion = (remote.dataVersion || 0) + 1;
      // Union of every teacher ID either device has deleted, so a deletion made on THIS
      // device isn't silently re-added just because the server's copy of `teachers`
      // (from before the deletion reached it) still contains that row.
      // EXCEPT: if a teacher id currently exists in our own in-memory `teachers` (this
      // device just added/re-added them), that row wins over any stale tombstone —
      // otherwise a teacher re-added under an id/username that was ever deleted in the
      // past (on this device or another) would get silently stripped back out by this
      // very push, the moment the merge below filters it against the tombstone list.
      const currentTeacherIds = new Set(teachers.map(t=>t.id));
      const mergedDeletedTeacherIds = Array.from(new Set([...(remote.deletedTeacherIds||[]), ...deletedTeacherIds]))
        .filter(id => !currentTeacherIds.has(id));
      const mergedTeachers = mergeArrayById(remote.teachers, teachers, 'id')
        .filter(t=> !mergedDeletedTeacherIds.includes(t.id));
      // Union of every username either device has deleted, same reasoning as teachers above —
      // and the same fix: a username currently present in our own `users` array (just
      // added/re-added, e.g. via a fresh Excel import) is excluded from the tombstone list
      // instead of being blindly unioned back in from the server's older copy. Without this,
      // re-importing a username that had EVER been deleted (even long ago, even on another
      // device) would silently vanish again the moment this very push round-trips.
      const currentUsernamesSet = new Set(users.map(u=>u.username));
      const mergedDeletedUsernames = Array.from(new Set([...(remote.deletedUsernames||[]), ...deletedUsernames]))
        .filter(u => !currentUsernamesSet.has(u));
      const mergedUsers = mergeArrayById(remote.users, users, 'username')
        .filter(u=> !mergedDeletedUsernames.includes(u.username));
      const merged = {
        students: mergeObjectField(remote.students, students),
        scores: mergeObjectField(remote.scores, scores),
        attendance: mergeObjectField(remote.attendance, attendance),
        approvedLeave: mergeObjectField(remote.approvedLeave, approvedLeave),
        studentIdCounter: Math.max(remote.studentIdCounter||1, studentIdCounter||1),
        teachers: mergedTeachers,
        deletedTeacherIds: mergedDeletedTeacherIds,
        teacherIdCounter: Math.max(remote.teacherIdCounter||1, teacherIdCounter||1),
        users: mergedUsers,
        deletedUsernames: mergedDeletedUsernames,
        activityLog: mergeActivityLogEntries(remote.activityLog, activityLog),
        termMonthDates: termMonthDates || remote.termMonthDates || null,
        examSchedules: examSchedules || remote.examSchedules || null,
        examSeatAssignments: examSeatAssignments || remote.examSeatAssignments || null,
        bellTimes: bellTimes || remote.bellTimes || null,
        adminStructure: adminStructure || remote.adminStructure || null,
        blockedStudentIds: blockedStudentIds || remote.blockedStudentIds || [],
        // Grade 3 Flexible "Set Quiz Max. Score" values — merged the same key-by-key
        // way as students/scores/attendance above, since it's an object keyed by
        // subject. This used to be missing entirely, which is why these boxes never
        // synced across devices/browsers.
        grade3FlexibleMaxima: mergeObjectField(remote.grade3FlexibleMaxima, grade3FlexibleMaximaBySubject),
        gradeEntryLockRules: normalizeGradeEntryLockRules(gradeEntryLockRules),
        presenceBucket: presenceBucket || remote.presenceBucket || null,
        // Report Card Release / Exams Schedule Release schedules — these gate what Parent/Student
        // accounts can see, so they must reach every device, not just stay on the Admin's own
        // browser localStorage. Whichever device pushed most recently wins (same pattern as
        // termMonthDates/examSchedules/bellTimes above), since these are single-Admin config data.
        reportCardReleases: reportCardReleases || remote.reportCardReleases || [],
        examScheduleReleases: examScheduleReleases || remote.examScheduleReleases || [],
        dataVersion: newVersion,
        savedAt: new Date().toISOString()
      };
      tx.set(FB_DOC_REF, merged);
    });
    knownDataVersion = Math.max(knownDataVersion, newVersion);
    fbLastPushedAt = Date.now();
    return true;
  }catch(err){
    console.warn('Firestore merged push failed', err);
    return false;
  }
}

// pushMergedToFirestore() already retries internally (the Firestore SDK backs off and
// retries a transaction a handful of times on its own when it detects contention on the
// document), but under sustained concurrent load on this single shared document those
// internal retries can still be exhausted, surfacing as a `failed-precondition` error and
// leaving whatever was just added/imported stranded in memory only — never reaching the
// server. Wrap it in a few more attempts with a growing delay so a temporary traffic spike
// doesn't turn into permanent, invisible data loss the way it did before.
async function pushMergedToFirestoreWithRetry(maxAttempts){
  maxAttempts = maxAttempts || 4;
  for(let attempt=1; attempt<=maxAttempts; attempt++){
    const ok = await pushMergedToFirestore();
    if(ok) return true;
    if(attempt<maxAttempts){
      const delayMs = 1000 * attempt; // 1s, 2s, 3s...
      await new Promise(res=> setTimeout(res, delayMs));
    }
  }
  return false;
}

// Pushes the full shared dataset to Firestore, merged with whatever the
// server currently holds (see pushMergedToFirestore above) — but bypasses
// the "auto-sync enabled" toggle, since this manual button IS the sync
// mechanism for the Grade Book now, not an extra pathway running alongside
// the old automatic one.
async function pushGradeBookToFirestore(){
  const ok = await pushMergedToFirestoreWithRetry();
  if(currentUser && currentUser.role==='admin') setSyncStatus(ok ? 'synced' : 'error');
  if(!ok){
    console.warn('Grade Book manual save failed after retries');
    // A silent/easy-to-miss toast previously let people believe their Excel import or
    // manual edits had saved when they hadn't — the very next sync/reload from Firestore
    // would then overwrite the local, never-actually-saved data, looking like deletion.
    // A blocking alert on final failure makes sure that can't happen unnoticed.
    alert('⚠️ لم يتم حفظ التعديلات على Firestore بعد عدة محاولات (ازدحام مؤقت على قاعدة البيانات). تعديلاتك ما زالت موجودة في هذا المتصفح فقط — الرجاء الانتظار قليلاً ثم الضغط على زر "💾 Save" مرة أخرى قبل إغلاق الصفحة أو إعادة تحميلها.');
  }
  return ok;
}

let gbToastTimer = null;
function showGbToast(type, text){
  let el = document.getElementById('gbToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'gbToast';
    document.body.appendChild(el);
  }
  el.className = `gb-toast ${type}`;
  el.textContent = text;
  requestAnimationFrame(()=> el.classList.add('show'));
  clearTimeout(gbToastTimer);
  const holdMs = type==='saving' ? 4000 : (type==='reminder' ? 5000 : 2600);
  gbToastTimer = setTimeout(()=> el.classList.remove('show'), holdMs);
}

// Warn before closing/reloading the tab if there's anything not yet synced to Firestore.
window.addEventListener('beforeunload', function(e){
  if(gbUnsavedChanges){ e.preventDefault(); e.returnValue = ''; }
});

function downloadBackup(){
  const payload = { students, scores, studentIdCounter, attendance, approvedLeave, teachers, teacherIdCounter, deletedTeacherIds, termMonthDates, examSchedules, examSeatAssignments, bellTimes, adminStructure, gradeEntryLockRules: normalizeGradeEntryLockRules(gradeEntryLockRules), reportCardReleases, examScheduleReleases, savedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `grades-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreBackup(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const payload = JSON.parse(e.target.result);
      students = payload.students || {};
      scores = payload.scores || {};
      studentIdCounter = payload.studentIdCounter || studentIdCounter;
      attendance = payload.attendance || {};
      approvedLeave = payload.approvedLeave || {};
      teachers = payload.teachers || [];
      teacherIdCounter = payload.teacherIdCounter || teacherIdCounter;
      deletedTeacherIds = payload.deletedTeacherIds || deletedTeacherIds || [];
      if(payload.termMonthDates && payload.termMonthDates.term1 && payload.termMonthDates.term2){
        termMonthDates = normalizeTermMonthDates(payload.termMonthDates);
        saveTermMonthDatesLocalOnly();
      }
      if(payload.examSchedules && payload.examSchedules.term1 && payload.examSchedules.term2){
        examSchedules = normalizeExamSchedules(payload.examSchedules);
        saveExamSchedulesLocalOnly();
      }
      if(payload.examSeatAssignments && payload.examSeatAssignments.term1 && payload.examSeatAssignments.term2){
        examSeatAssignments = normalizeExamSeatAssignments(payload.examSeatAssignments);
        saveExamSeatAssignmentsLocalOnly();
      }
      if(payload.bellTimes){
        bellTimes = normalizeBellTimes(payload.bellTimes);
        saveBellTimesLocalOnly();
      }
      if(payload.adminStructure){
        adminStructure = normalizeAdminStructure(payload.adminStructure);
        saveAdminStructureLocalOnly();
      }
      if(payload.gradeEntryLockRules || payload.gradeEntryLockConfig){
        gradeEntryLockRules = gradeEntryLockRulesFromPayload(payload) || [];
        saveGradeEntryLockConfigLocalOnly();
      }
      if(Array.isArray(payload.reportCardReleases)){
        reportCardReleases = payload.reportCardReleases;
        saveReportCardReleases();
      }
      if(Array.isArray(payload.examScheduleReleases)){
        examScheduleReleases = payload.examScheduleReleases;
        saveExamScheduleReleasesLocalOnly();
      }
      renderTable();
      renderDatabase();
      renderTeachersDatabase();
      renderAttendanceWorkspace();
      saveState();
      alert('Data restored successfully.');
      logActivity('edit', `Restored a full backup file (dated ${payload.savedAt || 'unknown'})`);
    }catch(err){
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
  document.getElementById('restoreInput').value='';
}

/* ================== STUDENT DATABASE VIEW ================== */
function allStudentsFlat(){
  const list = [];
  Object.keys(students).forEach(ck=>{
    const labels = classKeyLabels(ck);
    (students[ck]||[]).forEach(s=>{
      list.push({...s, classKey:ck, ...labels});
    });
  });
  return list;
}

/* ================== BIRTHDAY WIDGET ==================
   Scans every student's Date of Birth (DD/MM/YY, entered manually or auto-calculated
   from the National ID) and lists anyone whose day+month matches today. */
function getTodaysBirthdays(){
  const today = new Date();
  const td = today.getDate(), tm = today.getMonth()+1;
  const list = [];
  allStudentsFlat().forEach(s=>{
    if(!s.dob) return;
    const parts = s.dob.split('/');
    if(parts.length!==3) return;
    const dd = parseInt(parts[0],10), mm = parseInt(parts[1],10);
    if(!dd || !mm || dd!==td || mm!==tm) return;
    const classLabel = [s.grade, s.classroom].filter(Boolean).join(' - ');
    list.push({ id: s.id, name: s.name || s.displayId || 'Student', classLabel });
  });
  list.sort((a,b)=> a.name.localeCompare(b.name));
  return list;
}

/* Today's birthdays, scoped to what the CURRENT user is allowed to see:
   - Admin: every student, campus-wide.
   - Parent/Student: only their own linked child(ren) — never a classmate's,
     even though getTodaysBirthdays() itself scans every student. This is what
     powers the notification bell's birthday reminder for a parent account. */
function getTodaysBirthdaysForCurrentUser(){
  if(!currentUser) return [];
  const list = getTodaysBirthdays();
  if(currentUser.role==='admin') return list;
  if(currentUser.role==='parent') return list.filter(b=> scopeStudentAllowed(b.id));
  return [];
}

function renderBirthdayWidget(){
  const widget = document.getElementById('birthdayWidget');
  const countEl = document.getElementById('birthdayCount');
  const listEl = document.getElementById('birthdayList');
  if(!widget || !countEl || !listEl) return;
  const list = getTodaysBirthdays();
  countEl.textContent = list.length;
  widget.classList.toggle('has-birthdays', list.length>0);
  if(!list.length){
    listEl.innerHTML = '<span class="birthday-chip-empty">No birthdays today</span>';
    return;
  }
  listEl.innerHTML = list.map(b=>`
    <div class="birthday-chip">
      <span>🎂 ${(b.name||'').replace(/</g,'&lt;')}</span>
      ${b.classLabel ? `<small>${b.classLabel.replace(/</g,'&lt;')}</small>` : ''}
    </div>
  `).join('');
}

/* ---------- Shared "today" key used to remember dismiss/seen state per day ---------- */
function birthdayTodayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

/* ---------- 1) Prominent top bar, shown automatically above the header ---------- */
const BIRTHDAY_TOPBAR_DISMISS_LS_KEY = 'birthdayTopBarDismissedDate_v1';
function dismissBirthdayTopBar(){
  const bar = document.getElementById('birthdayTopBar');
  if(bar) bar.style.display = 'none';
  try{ localStorage.setItem(BIRTHDAY_TOPBAR_DISMISS_LS_KEY, birthdayTodayKey()); }catch(err){}
}
function renderBirthdayTopBar(){
  const bar = document.getElementById('birthdayTopBar');
  const textEl = document.getElementById('birthdayTopBarText');
  if(!bar || !textEl) return;
  const list = getTodaysBirthdays();
  if(!list.length){ bar.style.display = 'none'; return; }
  let dismissed = false;
  try{ dismissed = localStorage.getItem(BIRTHDAY_TOPBAR_DISMISS_LS_KEY) === birthdayTodayKey(); }catch(err){}
  if(dismissed){ bar.style.display = 'none'; return; }

  const MAX_NAMES = 2;
  let msg;
  if(list.length===1){
    msg = `Happy Birthday, <b>${formatBirthdayNameWithClass(list[0])}</b>! 🎉`;
  } else {
    const shown = list.slice(0, MAX_NAMES).map(b=> formatBirthdayNameWithClass(b)).join('، ');
    const remaining = list.length - MAX_NAMES;
    msg = remaining > 0
      ? `<b>${list.length} birthdays today</b> — ${shown} <span class="birthday-topbar-more" onclick="openBirthdayDetailsFromTopBar(event)">+${remaining} more</span>`
      : `Happy Birthday to <b>${shown}</b> today! 🎉`;
  }
  textEl.innerHTML = msg;
  textEl.title = list.map(b=> b.classLabel ? `${b.name} (${b.classLabel})` : b.name).join('، ');
  bar.style.display = 'flex';
}

/* "Student Name (Grade - Class)" — used anywhere we need the class shown
   right next to the name (top bar, toast). Falls back to just the name if
   the student has no class assigned. */
function formatBirthdayNameWithClass(b){
  const esc = s => (s||'').replace(/</g,'&lt;');
  const name = esc(b.name);
  const cls = esc(b.classLabel);
  return cls ? `${name} <span class="birthday-class-tag">(${cls})</span>` : name;
}

/* Opens the full birthday list (from the header widget's dropdown) when the
   person taps "+N more" on the condensed top bar. */
function openBirthdayDetailsFromTopBar(e){
  if(e) e.stopPropagation();
  const infoRow = document.getElementById('mastheadInfo');
  if(infoRow && !infoRow.classList.contains('open')) toggleHeaderInfo();
  const dd = document.getElementById('birthdayDropdown');
  const widget = document.getElementById('birthdayWidget');
  if(dd){ dd.classList.add('open'); renderBirthdayWidget(); }
  if(widget) widget.scrollIntoView({behavior:'smooth', block:'center'});
}

/* ---------- 2) Auto-dismissing toast shown at the moment of login ---------- */
const BIRTHDAY_TOAST_SEEN_LS_KEY = 'birthdayToastSeenDate_v1';
let birthdayToastTimer = null;
function hideBirthdayToast(){
  const toast = document.getElementById('birthdayToast');
  if(toast) toast.classList.remove('show');
  if(birthdayToastTimer){ clearTimeout(birthdayToastTimer); birthdayToastTimer = null; }
}
function showBirthdayToastIfNeeded(){
  let alreadySeenToday = false;
  try{ alreadySeenToday = localStorage.getItem(BIRTHDAY_TOAST_SEEN_LS_KEY) === birthdayTodayKey(); }catch(err){}
  if(alreadySeenToday) return;
  const list = getTodaysBirthdays();
  if(!list.length) return;
  const toast = document.getElementById('birthdayToast');
  const msgEl = document.getElementById('birthdayToastMsg');
  if(!toast || !msgEl) return;
  const MAX_TOAST_NAMES = 3;
  let msg;
  if(list.length===1){
    msg = `It's <b>${formatBirthdayNameWithClass(list[0])}</b>'s birthday today — wish them well! 🎂`;
  } else {
    const shown = list.slice(0, MAX_TOAST_NAMES).map(b=> formatBirthdayNameWithClass(b)).join('، ');
    const remaining = list.length - MAX_TOAST_NAMES;
    msg = remaining > 0
      ? `<b>${list.length} students</b> have a birthday today: ${shown} and ${remaining} more.`
      : `<b>${list.length} students</b> have a birthday today: ${shown}.`;
  }
  msgEl.innerHTML = msg;
  toast.classList.add('show');
  try{ localStorage.setItem(BIRTHDAY_TOAST_SEEN_LS_KEY, birthdayTodayKey()); }catch(err){}
  if(birthdayToastTimer) clearTimeout(birthdayToastTimer);
  birthdayToastTimer = setTimeout(hideBirthdayToast, 8000);
}

/* ---------- 4) 🎂 marker next to a student's name if today is their birthday ---------- */
function isStudentBirthdayToday(dob){
  if(!dob) return false;
  const parts = dob.split('/');
  if(parts.length!==3) return false;
  const dd = parseInt(parts[0],10), mm = parseInt(parts[1],10);
  if(!dd || !mm) return false;
  const today = new Date();
  return dd===today.getDate() && mm===(today.getMonth()+1);
}
function birthdayNameFlag(dob){
  return isStudentBirthdayToday(dob) ? ' <span class="birthday-name-flag" title="Birthday today!">🎂</span>' : '';
}

/* Single entry point — refreshes the top bar, the header widget, and (on
   login) the toast; safe to call often. */
function refreshBirthdayWidgets(){
  renderBirthdayWidget();
  renderBirthdayTopBar();
}

function renderDatabase(){
  const search = (document.getElementById('dbSearch').value||'').trim().toLowerCase();
  const sectionSelect = document.getElementById('dbFilterSection');
  const lockedSection = (currentUser && currentUser.effective) ? currentUser.effective.sectionScope : null;
  if(lockedSection){
    sectionSelect.value = lockedSection;
    sectionSelect.disabled = true;
  } else {
    sectionSelect.disabled = false;
  }
  const fSection = sectionSelect.value;
  const fStage = document.getElementById('dbFilterStage').value;
  const fReligion = document.getElementById('dbFilterReligion').value;
  const fLang = document.getElementById('dbFilterLang').value;

  const allFlat = allStudentsFlat();

  // rebuild grade dropdown options, scoped to the currently selected stage
  const gradeSelect = document.getElementById('dbFilterGrade');
  const prevGrade = gradeSelect.value;
  const gradeOptions = fStage ? STAGES[fStage].grades : [];
  gradeSelect.innerHTML = '<option value="">All</option>' +
    gradeOptions.map(g=>`<option value="${g.id}">${g.label}</option>`).join('');
  gradeSelect.disabled = !fStage;
  if(gradeOptions.some(g=>g.id===prevGrade)) gradeSelect.value = prevGrade;
  const fGrade = gradeSelect.value;

  // rebuild classroom dropdown options, scoped to the currently selected section/stage/grade
  const classroomSelect = document.getElementById('dbFilterClassroom');
  const prevClassroom = classroomSelect.value;
  const scopedForClassrooms = allFlat.filter(s=>
    (!fSection || s.sectionId===fSection) && (!fStage || s.stageId===fStage) && (!fGrade || s.gradeId===fGrade)
  );
  const uniqueClassrooms = [...new Set(scopedForClassrooms.map(s=> (s.classroom||'').trim()).filter(Boolean))]
    .sort((a,b)=> a.localeCompare(b, undefined, {numeric:true}));
  classroomSelect.innerHTML = '<option value="">All</option>' +
    uniqueClassrooms.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(uniqueClassrooms.includes(prevClassroom)) classroomSelect.value = prevClassroom;
  const fClassroom = classroomSelect.value;

  let list = allFlat.filter(s=>{
    if(fSection && s.sectionId!==fSection) return false;
    if(fStage && s.stageId!==fStage) return false;
    if(fGrade && s.gradeId!==fGrade) return false;
    if(fClassroom && (s.classroom||'').trim()!==fClassroom) return false;
    if(fReligion && (s.religion||'-')!==fReligion) return false;
    if(fLang && (s.lang2||'-')!==fLang) return false;
    if(search){
      const hay = `${s.name} ${s.displayId} ${s.nameAr||''} ${s.nationalId||''} ${s.nationality||''} ${s.dob||''}`.toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });

  document.getElementById('dbCount').textContent = `${list.length} students`;
  const holder = document.getElementById('dbTableHolder');

  // English Section before French Section; within each, Grade 1 → Grade 11 ascending.
  list.sort((a,b)=>{
    const secA = SECTION_ORDER[a.sectionId] ?? 99, secB = SECTION_ORDER[b.sectionId] ?? 99;
    if(secA!==secB) return secA-secB;
    const gA = GRADE_ORDER[a.gradeId] ?? 99, gB = GRADE_ORDER[b.gradeId] ?? 99;
    if(gA!==gB) return gA-gB;
    return (a.name||'').localeCompare(b.name||'', undefined, {numeric:true});
  });

  if(list.length===0){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No matching students</h3>
        <p>Add students from the "Grade Book" tab or adjust the search criteria.</p>
      </div>`;
    return;
  }

  let dobAutoUpdated = false;
  const rows = list.map(s=>{
    const availableClasses = classesForKey(s.classKey);
    const classOptions = [`<option value="" ${!s.classroom?'selected':''}>— None —</option>`]
      .concat(availableClasses.map(c=> `<option value="${c.replace(/"/g,'&quot;')}" ${s.classroom===c?'selected':''}>${c}</option>`))
      .concat([`<option value="__new__">+ Add new class…</option>`])
      .join('');
    // Date of Birth is derived automatically from the 14-digit Egyptian National ID whenever possible
    const autoDob = calcDobFromNationalId(s.nationalId);
    if(autoDob && s.dob!==autoDob){ s.dob = autoDob; dobAutoUpdated = true; }
    return `
    <tr>
      <td><input type="checkbox" class="dbStudentCheckbox" value="${s.classKey}::${s.id}"></td>
      <td><span class="seat-badge">${s.displayId||'—'}</span></td>
      <td class="name-col">${s.name}${birthdayNameFlag(s.dob)}</td>
      <td>
        <input type="text" class="db-edit-select" dir="rtl" value="${(s.nameAr||'').replace(/"/g,'&quot;')}" title="${(s.nameAr||'').replace(/"/g,'&quot;')}" placeholder="اسم الطالب" onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','nameAr',this.value)">
      </td>
      <td>${s.section}</td>
      <td>${s.stage}</td>
      <td>${s.grade}</td>
      <td>
        <select class="db-edit-select" onchange="flashInlineSaved(this);handleClassroomSelect(this,'${s.classKey}','${s.id}')">
          ${classOptions}
        </select>
      </td>
      <td>
        <select class="db-edit-select" onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','religion',this.value)">
          <option value="-" ${(!s.religion||s.religion==='-')?'selected':''}>None</option>
          <option value="Muslim" ${s.religion==='Muslim'?'selected':''}>Muslim</option>
          <option value="Christian" ${s.religion==='Christian'?'selected':''}>Christian</option>
        </select>
      </td>
      <td>
        <select class="db-edit-select" onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','lang2',this.value)">
          <option value="-" ${(!s.lang2||s.lang2==='-')?'selected':''}>None</option>
          <option value="French" ${s.lang2==='French'?'selected':''}>🇫🇷 French</option>
          <option value="German" ${s.lang2==='German'?'selected':''}>🇩🇪 German</option>
          <option value="English" ${s.lang2==='English'?'selected':''}>English</option>
        </select>
      </td>
      <td>
        <input type="text" class="db-edit-select" value="${(s.nationalId||'').replace(/"/g,'&quot;')}" placeholder="National ID" onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','nationalId',this.value)">
      </td>
      <td>
        <select class="db-edit-select" onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','gender',this.value)">
          <option value="-" ${(!s.gender||s.gender==='-')?'selected':''}>None</option>
          <option value="Male" ${s.gender==='Male'?'selected':''}>Male</option>
          <option value="Female" ${s.gender==='Female'?'selected':''}>Female</option>
        </select>
      </td>
      <td>
        <span class="nat-flag" style="margin-right:4px;">${nationalityFlag(s.nationality)}</span><input type="text" class="db-edit-select" style="width:calc(100% - 26px);" value="${(s.nationality||'').replace(/"/g,'&quot;')}" placeholder="Nationality" oninput="this.previousElementSibling.textContent=nationalityFlag(this.value)" onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','nationality',this.value)">
      </td>
      <td${autoDob?' data-dob-auto="1"':''}>
        <input type="text" class="db-edit-select" value="${(s.dob||'').replace(/"/g,'&quot;')}" placeholder="DD/MM/YY" maxlength="8" ${autoDob?'readonly title="Calculated automatically from the National ID"':''} onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','dob',this.value)">
      </td>
      <td>
        <input type="text" class="db-edit-select" value="${(s.notes||'').replace(/"/g,'&quot;')}" placeholder="Notes" title="${(s.notes||'').replace(/"/g,'&quot;')}" onchange="flashInlineSaved(this);updateStudentField('${s.classKey}','${s.id}','notes',this.value)">
      </td>
      <td><button class="del-btn" onclick="deleteStudentFromDb('${s.classKey}','${s.id}')" title="Delete">✕</button></td>
    </tr>`;
  }).join('');

  if(dobAutoUpdated) saveState();

  holder.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:30px;"><input type="checkbox" id="dbSelectAllCheckbox" onclick="toggleSelectAllDb()"></th>
          <th>ID</th>
          <th class="name-col">Student Name</th>
          <th dir="rtl">اسم الطالب</th>
          <th>Section</th>
          <th>Stage</th>
          <th>Grade</th>
          <th>Class</th>
          <th>Religion</th>
          <th>2nd Language</th>
          <th>National ID</th>
          <th>Gender</th>
          <th>Nationality</th>
          <th>Date of Birth (DD/MM/YY)</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Maps a free-typed Nationality value to a country flag emoji, using
// tolerant keyword matching (English or Arabic, any casing/word order).
// Returns '' when the text doesn't match anything recognized, so unusual
// or misspelled nationalities just show with no flag rather than a wrong one.
const NATIONALITY_FLAGS = [
  [/egypt|مصر/i, '🇪🇬'],
  [/saudi|سعود/i, '🇸🇦'],
  [/emirat|uae|إمارات|امارات/i, '🇦🇪'],
  [/kuwait|كويت/i, '🇰🇼'],
  [/qatar|قطر/i, '🇶🇦'],
  [/bahrain|بحرين/i, '🇧🇭'],
  [/oman|عُمان|عمان/i, '🇴🇲'],
  [/jordan|أردن|اردن/i, '🇯🇴'],
  [/palestin|فلسطين/i, '🇵🇸'],
  [/syria|سوريا|سوري/i, '🇸🇾'],
  [/lebanon|لبنان/i, '🇱🇧'],
  [/iraq|عراق/i, '🇮🇶'],
  [/yemen|يمن/i, '🇾🇪'],
  [/sudan|سودان/i, '🇸🇩'],
  [/libya|ليبيا/i, '🇱🇾'],
  [/morocc|مغرب/i, '🇲🇦'],
  [/algeria|جزائر/i, '🇩🇿'],
  [/tunisia|تونس/i, '🇹🇳'],
  [/american|usa|united states|أمريك/i, '🇺🇸'],
  [/british|uk|united kingdom|بريطان/i, '🇬🇧'],
  [/french|france|فرنس/i, '🇫🇷'],
  [/german|germany|ألماني|الماني/i, '🇩🇪'],
  [/canad|كندا/i, '🇨🇦'],
  [/italia|إيطال|ايطال/i, '🇮🇹'],
  [/spain|spanish|إسبان|اسبان/i, '🇪🇸'],
  [/chin|صيني/i, '🇨🇳'],
  [/india|هند/i, '🇮🇳'],
  [/turk|تركي/i, '🇹🇷'],
  [/russia|روس/i, '🇷🇺'],
  [/nigeria|نيجير/i, '🇳🇬'],
];
function nationalityFlag(nat){
  const text = (nat||'').toString().trim();
  if(!text) return '';
  const hit = NATIONALITY_FLAGS.find(([re])=> re.test(text));
  return hit ? hit[1] : '';
}


// Digit 1 = century (2 -> 1900s, 3 -> 2000s), digits 2-3 = year, 4-5 = month, 6-7 = day.
// Returns '' if the ID isn't a valid 14-digit number or the embedded date is not valid.
function calcDobFromNationalId(nationalId){
  const digits = (nationalId||'').replace(/\D/g,'');
  if(digits.length!==14) return '';
  const centuryDigit = digits.charAt(0);
  const centuryPrefix = centuryDigit==='2' ? '19' : (centuryDigit==='3' ? '20' : '');
  if(!centuryPrefix) return '';
  const yy = digits.substr(1,2);
  const mm = digits.substr(3,2);
  const dd = digits.substr(5,2);
  const monthNum = parseInt(mm,10);
  const dayNum = parseInt(dd,10);
  if(monthNum<1 || monthNum>12) return '';
  if(dayNum<1 || dayNum>31) return '';
  const fullYear = parseInt(centuryPrefix+yy,10);
  const checkDate = new Date(fullYear, monthNum-1, dayNum);
  if(checkDate.getFullYear()!==fullYear || (checkDate.getMonth()+1)!==monthNum || checkDate.getDate()!==dayNum) return '';
  return `${dd}/${mm}/${yy}`;
}

function updateStudentField(ck, studentId, field, value){
  const roster = students[ck]||[];
  const s = roster.find(s=>s.id===studentId);
  if(!s) return;
  s[field] = value;
  if(field==='nationalId'){
    const autoDob = calcDobFromNationalId(value);
    if(autoDob) s.dob = autoDob;
  }
  saveState();
  renderDatabase();
}

function deleteStudentFromDb(ck, studentId){
  if(!confirm('Permanently delete this student from the database? Their grades in all subjects will be deleted.')) return;
  const roster = students[ck]||[];
  const idx = roster.findIndex(s=>s.id===studentId);
  const removedName = idx>-1 ? roster[idx].name : 'Unknown';
  if(idx>-1) roster.splice(idx,1);
  // remove scores in any subject under this class
  Object.keys(scores).forEach(sk=>{
    if(sk.startsWith(ck+'|') && scores[sk][studentId]){
      delete scores[sk][studentId];
    }
  });
  renderDatabase();
  if(currentView==='grades') renderTable();
  saveState();
  logActivity('delete', `Permanently deleted student "${removedName}" from the Student Database`);
}

// Every distinct classroom value stored anywhere in the Student Database (all sections/stages/grades)
function getAllStoredClasses(){
  const set = new Set();
  Object.values(students).forEach(roster=>{
    (roster||[]).forEach(s=>{
      const c = (s.classroom||'').trim();
      if(c) set.add(c);
    });
  });
  return [...set].sort((a,b)=> a.localeCompare(b, undefined, {numeric:true}));
}

// Classroom values already used by students who share the same section/stage/grade (classKey)
function classesForKey(ck){
  const roster = students[ck]||[];
  return [...new Set(roster.map(s=>(s.classroom||'').trim()).filter(Boolean))]
    .sort((a,b)=> a.localeCompare(b, undefined, {numeric:true}));
}

function handleClassroomSelect(selectEl, ck, studentId){
  let value = selectEl.value;
  if(value === '__new__'){
    const newClass = prompt('Enter the new class name (e.g. 3/A):', '');
    if(newClass === null){ renderDatabase(); return; }
    value = newClass.trim();
    if(!value){ renderDatabase(); return; }
  }
  updateStudentField(ck, studentId, 'classroom', value);
}

function toggleSelectAllDb(){
  const all = document.getElementById('dbSelectAllCheckbox');
  document.querySelectorAll('.dbStudentCheckbox').forEach(cb=> cb.checked = all.checked);
}

function deleteSelectedDbStudents(){
  const checked = Array.from(document.querySelectorAll('.dbStudentCheckbox:checked'));
  if(checked.length===0){ alert('Please select one or more students to delete.'); return; }
  if(!confirm(`Permanently delete ${checked.length} selected student(s)? Their grades in all subjects will be deleted. This cannot be undone.`)) return;

  checked.forEach(cb=>{
    const [ck, id] = cb.value.split('::');
    const roster = students[ck]||[];
    const idx = roster.findIndex(s=>s.id===id);
    if(idx>-1) roster.splice(idx,1);
    Object.keys(scores).forEach(sk=>{
      if(sk.startsWith(ck+'|') && scores[sk][id]){
        delete scores[sk][id];
      }
    });
    deleteAttendanceForStudent(id);
  });

  renderDatabase();
  if(currentView==='grades') renderTable();
  if(currentView==='attendance') renderAttendanceWorkspace();
  saveState();
}

function confirmDeleteAllDb(){
  const total = allStudentsFlat().length;
  if(total===0){ alert('There is no data to delete.'); return; }
  if(!confirm(`⚠ WARNING: This will permanently delete ALL ${total} student(s) and ALL grades across every Section, Stage, Grade and Class in the entire system. This cannot be undone.\n\nAre you sure you want to continue?`)) return;
  if(!confirm('Please confirm one more time: delete absolutely everything?')) return;

  students = {};
  scores = {};
  attendance = {};
  approvedLeave = {};
  studentIdCounter = 1;
  renderDatabase();
  if(currentView==='grades'){ state.term=null; state.subject=null; renderStepper(); renderWorkspace(); }
  if(currentView==='attendance'){ attState.term=null; attState.subject=null; attState.academicTerm=null; renderAttendanceStepper(); renderAttendanceWorkspace(); }
  saveState();
  alert('All data has been deleted.');
}

function exportDatabase(){
  const list = allStudentsFlat();
  if(list.length===0){ alert('There are no students to export yet.'); return; }
  const rows = list.map((s,i)=>({
    "ID": s.displayId||'',
    "#": i+1,
    "Student Name": s.name,
    "اسم الطالب": s.nameAr||'',
    "Section": s.section,
    "Stage": s.stage,
    "Grade": s.grade,
    "Class": s.classroom||'',
    "Religion": (s.religion && s.religion!=='-') ? s.religion : '',
    "Second Language": (s.lang2 && s.lang2!=='-') ? s.lang2 : '',
    "National ID": s.nationalId||'',
    "Gender": (s.gender && s.gender!=='-') ? s.gender : '',
    "Nationality": s.nationality||'',
    "Date of Birth (DD/MM/YY)": s.dob||'',
    "Notes": s.notes||''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Student Database");
  XLSX.writeFile(wb, "Student_Database.xlsx");
}

/* ================== BULK IMPORT (DATABASE-WIDE) ================== */
function findSectionId(label){
  label = (label||'').toString().trim();
  return Object.keys(SECTIONS).find(id => SECTIONS[id].label === label
    || id.toLowerCase() === label.toLowerCase()
    || (/english|انجليز|إنجليز/i.test(label)) && id==='en'
    || (/french|فرنس/i.test(label)) && id==='fr') || null;
}
function findStageId(label){
  label = (label||'').toString().trim();
  return Object.keys(STAGES).find(id => STAGES[id].label === label
    || (/primary|ابتدائ/i.test(label)) && id==='primary'
    || (/prep|اعداد|إعداد/i.test(label)) && id==='prep'
    || (/secondary|ثانو/i.test(label)) && id==='secondary') || null;
}
function findGradeId(stageId, label){
  label = (label||'').toString().trim();
  const stage = STAGES[stageId];
  if(!stage) return null;
  const exact = stage.grades.find(g=> g.label===label);
  if(exact) return exact.id;
  const fuzzy = stage.grades.find(g=> label && (g.label.includes(label) || label.includes(g.label)));
  return fuzzy ? fuzzy.id : null;
}

// Normalizes a header/key string so that stray spaces, invisible Unicode
// marks (e.g. LRM/RLM/BOM often left behind by copy-pasting from Arabic
// documents or exporting from other systems) and letter case don't cause
// an otherwise-matching column to be missed.
function normalizeKey(str){
  return (str||'').toString()
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '') // zero-width / directional marks / BOM
    .trim()
    .toLowerCase();
}
// Looks up a value in a sheet_to_json row by trying several accepted
// header names, matching tolerantly (trimmed, case-insensitive, ignoring
// invisible characters). Tries an exact match first; if nothing matches,
// falls back to a "contains" match (e.g. a header like "Class Name" or
// "Class / Section" will still be picked up when searching for "Class").
function getRowField(row, ...names){
  const wanted = names.map(normalizeKey);
  const keys = Object.keys(row);
  for(const key of keys){
    const nk = normalizeKey(key);
    if(wanted.includes(nk)){
      const val = row[key];
      if(val !== undefined && val !== null && val.toString().trim() !== '') return val.toString().trim();
    }
  }
  for(const key of keys){
    const nk = normalizeKey(key);
    if(wanted.some(w => w && (nk.includes(w) || w.includes(nk)))){
      const val = row[key];
      if(val !== undefined && val !== null && val.toString().trim() !== '') return val.toString().trim();
    }
  }
  return '';
}

// Every ID currently stored anywhere in the Student Database, normalized
// for comparison (trimmed, case-insensitive) -> the student's name, so a
// duplicate-ID error message can say who already has that ID.
function getAllStoredIdMap(){
  const map = new Map();
  Object.values(students).forEach(roster=>{
    (roster||[]).forEach(s=>{
      const id = (s.displayId||'').toString().trim();
      if(id) map.set(id.toLowerCase(), s.name);
    });
  });
  return map;
}

function importDatabaseExcel(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      let added = 0;
      const problems = [];
      const existingIds = getAllStoredIdMap();   // IDs already in the database
      const seenInFile = new Map();               // IDs already used earlier in this same file

      rows.forEach((row, idx)=>{
        const name = getRowField(row, 'Student Name', 'Name');
        const providedId = getRowField(row, 'ID', 'id');
        const sectionLabel = getRowField(row, 'Section');
        const stageLabel = getRowField(row, 'Stage');
        const gradeLabel = getRowField(row, 'Grade');
        const classroom = getRowField(row, 'Class', 'Classroom');
        const nameAr = getRowField(row, 'اسم الطالب', 'Arabic Name', 'Student Name (Arabic)');
        const nationalId = getRowField(row, 'National ID', 'National Id', 'NationalID');
        const nationality = getRowField(row, 'Nationality');
        const dob = getRowField(row, 'Date of Birth (DD/MM/YY)', 'Date of Birth', 'DOB', 'dob');
        let religion = getRowField(row, 'Religion') || '-';
        if(!/^(muslim|christian)$/i.test(religion)) religion = '-';
        else religion = religion.charAt(0).toUpperCase() + religion.slice(1).toLowerCase();
        let lang2 = getRowField(row, 'Second Language') || '-';
        if(!/^(french|german|english)$/i.test(lang2)) lang2 = '-';
        else lang2 = lang2.charAt(0).toUpperCase() + lang2.slice(1).toLowerCase();
        let gender = getRowField(row, 'Gender', 'Sex', 'النوع', 'الجنس') || '-';
        if(!/^(male|female|m|f|ذكر|أنثى|انثى)$/i.test(gender)) gender = '-';
        else if(/^(male|m|ذكر)$/i.test(gender)) gender = 'Male';
        else gender = 'Female';

        if(!name){ problems.push(`Row ${idx+2}: missing student name`); return; }
        const sectionId = findSectionId(sectionLabel);
        if(!sectionId){ problems.push(`${name}: unrecognized "Section" value ("${sectionLabel}")`); return; }
        const stageId = findStageId(stageLabel);
        if(!stageId){ problems.push(`${name}: unrecognized "Stage" value ("${stageLabel}")`); return; }
        const gradeId = findGradeId(stageId, gradeLabel);
        if(!gradeId){ problems.push(`${name}: unrecognized "Grade" value ("${gradeLabel}") for ${STAGES[stageId].label}`); return; }

        // Reject duplicate IDs instead of importing them — both against
        // students already saved in the database and against earlier rows
        // in this same file.
        if(providedId){
          const key = providedId.toLowerCase();
          if(existingIds.has(key)){
            problems.push(`${name}: ID "${providedId}" already belongs to "${existingIds.get(key)}" in the database — row skipped`);
            return;
          }
          if(seenInFile.has(key)){
            problems.push(`${name}: ID "${providedId}" is duplicated in this file (also used by "${seenInFile.get(key)}") — row skipped`);
            return;
          }
          seenInFile.set(key, name);
        }

        const ck = `${sectionId}|${stageId}|${gradeId}`;
        if(!students[ck]) students[ck]=[];
        const displayId = providedId ? formatMilsId(providedId) : nextDisplayId();
        students[ck].push({id:uid(), displayId, name, nameAr, classroom, religion, lang2, gender, nationalId, nationality, dob});
        {
          const autoDob = calcDobFromNationalId(nationalId);
          if(autoDob) students[ck][students[ck].length-1].dob = autoDob;
        }
        if(providedId) existingIds.set(providedId.toLowerCase(), name);
        added++;
      });

      renderDatabase();
      saveState();
      document.getElementById('importTitle').textContent = 'Bulk Import Result';
      let msg = `${added} student(s) added successfully.`;
      // Diagnostic line: shows exactly which column headers were detected
      // in the file, so a missing/misnamed "Class" column is easy to spot.
      if(rows.length){
        const detected = Object.keys(rows[0]).map(k=>`"${k}"`).join(', ');
        msg += `<br><br><span style="color:#888;font-size:12px;">Columns detected in file: ${detected}</span>`;
        const withClass = rows.filter(r=> getRowField(r,'Class','Classroom')).length;
        if(withClass < rows.length){
          msg += `<br><span style="color:#888;font-size:12px;">${rows.length - withClass} of ${rows.length} row(s) had no value recognized for the "Class" column.</span>`;
        }
      }
      if(problems.length){
        msg += `<br><br><b>${problems.length} row(s) could not be added:</b><br>` +
          problems.slice(0,8).map(p=>`• ${p}`).join('<br>') +
          (problems.length>8 ? `<br>... and ${problems.length-8} more` : '');
      }
      document.getElementById('importMsg').innerHTML = msg;
      document.getElementById('importResultOverlay').classList.add('show');
    }catch(err){
      alert('Could not read the file. Make sure the file format and column names match the template.');
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('dbExcelInput').value='';
}

function downloadTemplate(){
  const sample = [
    { "ID":"", "Section":"English Section", "Stage":"Primary Stage", "Grade":"Grade 3", "Student Name":"Ahmed Mohamed Ali", "اسم الطالب":"أحمد محمد علي", "Class":"3/1", "Gender":"Male", "Religion":"Muslim", "Second Language":"French", "National ID":"", "Nationality":"Egyptian" },
    { "ID":"", "Section":"", "Stage":"", "Grade":"", "Student Name":"", "اسم الطالب":"", "Class":"", "Gender":"", "Religion":"", "Second Language":"", "National ID":"", "Nationality":"" }
  ];
  const wsData = XLSX.utils.json_to_sheet(sample);

  const allGrades = [];
  Object.entries(STAGES).forEach(([sid, s])=> s.grades.forEach(g=> allGrades.push(`${s.label} ← ${g.label}`)));
  const guide = [
    { "Field":"ID (optional)", "Allowed Values":"Leave blank to auto-generate, or enter an existing student number/code" },
    { "Field":"Section", "Allowed Values":"English Section / French Section" },
    { "Field":"Stage", "Allowed Values":"Primary Stage / Prep Stage / Secondary Stage" },
    { "Field":"Grade", "Allowed Values": allGrades.join(' | ') },
    { "Field":"اسم الطالب (optional)", "Allowed Values":"Student's name in Arabic — leave blank if not available" },
    { "Field":"Gender (optional)", "Allowed Values":"Male / Female / leave blank" },
    { "Field":"Religion (optional)", "Allowed Values":"Muslim / Christian / leave blank" },
    { "Field":"Second Language (optional)", "Allowed Values":"French / German / English / leave blank" },
    { "Field":"National ID (optional)", "Allowed Values":"14-digit Egyptian national ID — Date of Birth is calculated automatically from it, so there is no separate Date of Birth column to fill in" },
    { "Field":"Nationality (optional)", "Allowed Values":"Free text, e.g. Egyptian" }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guide);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, "Student Data");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Allowed Values");
  XLSX.writeFile(wb, "Student_Import_Template.xlsx");
}

/* ================== TEACHERS DATABASE VIEW ================== */
function nextTeacherDisplayId(){ return 'TCH-' + String(teacherIdCounter++).padStart(4,'0'); }

// Maps the Manage Users section code ('en'/'fr') to the label format used in the
// Teachers Database (English/French/Both), so auto-imported teacher accounts line
// up correctly with the Section filter/column in the Teachers Database.
function sectionLabelFromCode(code){
  if(code==='en') return 'English';
  if(code==='fr') return 'French';
  return code || 'English';
}

// Moves a teacher one position up/down within the Teachers Database, so admins can
// arrange the list manually (e.g. by seniority, department order, etc.).
function moveTeacherInDb(id, direction){
  if(!currentUser || currentUser.role !== 'admin'){
    alert('⛔ Teachers Database is only available to Administrators.');
    return;
  }
  const idx = teachers.findIndex(t=>t.id===id);
  if(idx===-1) return;
  const newIdx = idx + direction;
  if(newIdx<0 || newIdx>=teachers.length) return;
  const tmp = teachers[idx];
  teachers[idx] = teachers[newIdx];
  teachers[newIdx] = tmp;
  renderTeachersDatabase();
  saveState();
}

function toggleAddTeacherForm(force){
  // Teachers Database access restricted to Admin users only
  if(!currentUser || currentUser.role !== 'admin'){ 
    alert('⛔ Teachers Database is only available to Administrators.');
    return; 
  }
  
  const form = document.getElementById('addTeacherForm');
  const willShow = force!==undefined ? force : !form.classList.contains('show');
  form.classList.toggle('show', willShow);
  if(willShow){
    document.getElementById('teacherSubjectList').innerHTML = ALL_SUBJECTS.map(s=>`<option value="${s}"></option>`).join('');
    document.getElementById('newTeacherName').value = '';
    document.getElementById('newTeacherSection').value = 'English';
    document.getElementById('newTeacherSubject').value = '';
    document.getElementById('newTeacherClasses').value = '';
  }
}

function populateTeacherClassesDropdown(){
  const classSelect = document.getElementById('newTeacherClasses');
  if(!classSelect) return;
  const uniqueClasses = getAllStoredClasses();
  classSelect.innerHTML = '<option value="">Select a class...</option>' + uniqueClasses.map(c=>`<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
}

function addTeacherManual(){
  // Teachers Database access restricted to Admin users only
  if(!currentUser || currentUser.role !== 'admin'){
    alert('⛔ Teachers Database is only available to Administrators.');
    return;
  }
  
  const name = document.getElementById('newTeacherName').value.trim();
  if(!name){ alert('Please enter the teacher\'s name.'); return; }
  const section = document.getElementById('newTeacherSection').value;
  const subject = document.getElementById('newTeacherSubject').value.trim();
  const classSelect = document.getElementById('newTeacherClasses');
  const selectedClasses = Array.from(classSelect.selectedOptions).map(opt => opt.value).filter(v => v);
  const classes = selectedClasses.join(', ');
  if(!classes){ alert('Please select at least one class.'); return; }
  teachers.push({ id: uid(), displayId: nextTeacherDisplayId(), name, section, subject, classes });
  toggleAddTeacherForm(false);
  renderTeachersDatabase();
  saveState();
  // Teachers Database changes used to only mark themselves "unsaved" and wait for the
  // separate Grade Book Save button — unlike Manage Users, which auto-pushes via
  // scheduleGithubPush(). If a remote snapshot arrived (another device, or this device's
  // own page reload) before that button was pressed, the newly added teacher would be
  // silently overwritten by the older server copy. Push immediately so it can't be lost.
  scheduleGithubPush();
  logActivity('add', `Added teacher "${name}" to the Teachers Database`);
}

function deleteTeacherFromDb(id){
  // Teachers Database access restricted to Admin users only
  if(!currentUser || currentUser.role !== 'admin'){
    alert('⛔ Teachers Database is only available to Administrators.');
    return;
  }
  
  if(!confirm('Permanently delete this teacher from the database?')) return;
  const idx = teachers.findIndex(t=>t.id===id);
  const removedName = idx>-1 ? teachers[idx].name : 'Unknown';
  if(idx>-1) teachers.splice(idx,1);
  if(!deletedTeacherIds.includes(id)) deletedTeacherIds.push(id);
  renderTeachersDatabase();
  saveState();
  scheduleGithubPush(); // push the deletion tombstone immediately (see addTeacherManual note)
  logActivity('delete', `Permanently deleted teacher "${removedName}" from the Teachers Database`);
}

function updateTeacherField(id, field, value){
  // Teachers Database access restricted to Admin users only
  if(!currentUser || currentUser.role !== 'admin'){
    alert('⛔ Teachers Database is only available to Administrators.');
    return;
  }
  
  const t = teachers.find(t=>t.id===id);
  if(!t) return;
  t[field] = value;
  saveState();
  scheduleGithubPush(); // see addTeacherManual note

  // Name, Section and Subject are the sort keys for the table (Section → Subject → Name),
  // so re-render after editing any of them to reflect the teacher's new position. Other
  // fields (e.g. classes, which has its own dedicated update path) don't affect sort order.
  if(field==='name' || field==='section' || field==='subject') renderTeachersDatabase();
}

// Small "📚 3/A, 4/B" (or "No classes assigned yet") line shown under a teacher's name in
// the Teachers Database, summarizing which classes they currently teach.
function teacherClassesSummaryHtml(classList){
  if(!classList || !classList.length) return `<span class="teacher-classes-summary empty">No classes assigned yet</span>`;
  return `<span class="teacher-classes-summary">📚 ${escapeHtml(classList.join(', '))}</span>`;
}

// The "Classes" column is a compact checklist dropdown (populated from every classroom
// currently stored in the Students Database) instead of a free-text field, so admins pick
// real classes instead of retyping them. Opening one panel closes any other that's open.
function toggleTeacherClassesDropdown(e, id){
  e.stopPropagation();
  document.querySelectorAll('.teacher-classes-panel').forEach(p=>{
    if(p.id !== 'tcPanel_'+id) p.classList.remove('open');
  });
  const panel = document.getElementById('tcPanel_'+id);
  if(panel) panel.classList.toggle('open');
}

// Recomputes a teacher's `classes` string from every checked box in their panel, saves it,
// and refreshes just the toggle button label + the name-column summary line — the panel
// itself is left open so an admin can check off several classes in a row without it closing.
function toggleTeacherClassSelection(id, checkboxEl){
  if(!currentUser || currentUser.role !== 'admin'){
    alert('⛔ Teachers Database is only available to Administrators.');
    checkboxEl.checked = !checkboxEl.checked;
    return;
  }
  const t = teachers.find(t=>t.id===id);
  if(!t) return;
  const panel = document.getElementById('tcPanel_'+id);
  const selected = panel ? Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map(cb=>cb.value) : [];
  t.classes = selected.join(', ');
  saveState();
  scheduleGithubPush(); // see addTeacherManual note

  const dd = document.getElementById('tcDD_'+id);
  const toggleBtn = dd ? dd.querySelector('.teacher-classes-toggle') : null;
  if(toggleBtn){
    toggleBtn.innerHTML = `<span>${selected.length ? escapeHtml(selected.join(', ')) : 'Select classes…'}</span><span class="dd-caret">▾</span>`;
  }

  const summaryEl = document.getElementById('tcSummary_'+id);
  if(summaryEl) summaryEl.innerHTML = teacherClassesSummaryHtml(selected);
}

function toggleSelectAllTeachers(){
  const all = document.getElementById('teacherSelectAllCheckbox');
  document.querySelectorAll('.teacherCheckbox').forEach(cb=> cb.checked = all.checked);
}

function deleteSelectedTeachers(){
  // Teachers Database access restricted to Admin users only
  if(!currentUser || currentUser.role !== 'admin'){
    alert('⛔ Teachers Database is only available to Administrators.');
    return;
  }
  
  const checked = Array.from(document.querySelectorAll('.teacherCheckbox:checked'));
  if(checked.length===0){ alert('Please select one or more teachers to delete.'); return; }
  if(!confirm(`Permanently delete ${checked.length} selected teacher(s)? This cannot be undone.`)) return;
  const ids = checked.map(cb=>cb.value);
  teachers = teachers.filter(t=> !ids.includes(t.id));
  ids.forEach(id=>{ if(!deletedTeacherIds.includes(id)) deletedTeacherIds.push(id); });
  renderTeachersDatabase();
  saveState();
  scheduleGithubPush(); // push the deletion tombstones immediately (see addTeacherManual note)
  logActivity('delete', `Permanently deleted ${ids.length} teacher(s) from the Teachers Database`);
}

// One-click catch-up sync: adds (or refreshes) a Teachers Database row for every Manage
// Users account whose role is Teacher or Head of Department. New accounts are already kept
// in sync automatically the moment they're created/edited/deleted (see saveUserFromForm /
// deleteUserRow), so this button mainly matters for accounts that existed before that
// linking was added, or that were brought in some other way (e.g. a Manage Users bulk
// import) without ever being saved again through the normal form.
function syncTeachersFromUserAccounts(){
  // Teachers Database access restricted to Admin users only
  if(!currentUser || currentUser.role !== 'admin'){
    alert('⛔ Teachers Database is only available to Administrators.');
    return;
  }
  const eligible = (users||[]).filter(u=> u.role==='teacher' || u.role==='hod');
  if(!eligible.length){ alert('No accounts with role Teacher or Head of Department were found in Manage Users.'); return; }

  let added = 0, updated = 0;
  eligible.forEach(u=>{
    let teacher = teachers.find(t=> t.username===u.username);
    if(!teacher) teacher = teachers.find(t=> !t.username && (t.name===u.displayName || t.name===u.username));
    if(!teacher){
      teacher = { id: uid(), displayId: nextTeacherDisplayId(), classes:'' };
      teachers.push(teacher);
      added++;
    } else {
      updated++;
    }
    teacher.username = u.username;
    teacher.name = u.displayName || u.username;
    teacher.section = sectionLabelFromCode(u.section);
    teacher.subject = (u.subjects||[]).join(', ');
    // Classes are left untouched if the row already had some (HOD accounts don't carry
    // classrooms in Manage Users, and existing manual entries shouldn't be wiped out).
    teacher.classes = (u.classrooms && u.classrooms.length) ? u.classrooms.join(', ') : (teacher.classes || '');
  });

  saveState();
  scheduleGithubPush(); // see addTeacherManual note
  renderTeachersDatabase();
  logActivity('edit', `Synced Teachers Database from Teacher/HOD accounts (${added} added, ${updated} refreshed)`);
  alert(`Sync complete: ${added} new row(s) added, ${updated} existing row(s) refreshed from Manage Users.`);
}

function renderTeachersDatabase(){
  // Teachers Database access restricted to Admin users only
  if(!currentUser || currentUser.role !== 'admin'){
    const holder = document.getElementById('teachersTableHolder');
    if(holder) holder.innerHTML = '<p style="color: var(--red); padding: 20px; text-align: center;">⛔ Access Denied - Teachers Database is only available to Administrators.</p>';
    return;
  }
  
  const search = (document.getElementById('teacherSearch').value||'').trim().toLowerCase();
  const fSection = document.getElementById('teacherFilterSection').value;

  const subjectSelect = document.getElementById('teacherFilterSubject');
  const prevSubject = subjectSelect.value;
  const teacherSubjects = teachers.map(t=>(t.subject||'').trim()).filter(Boolean);
  const uniqueSubjects = [...new Set([...ALL_SUBJECTS, ...teacherSubjects])].sort((a,b)=>a.localeCompare(b));
  subjectSelect.innerHTML = '<option value="">All</option>' + uniqueSubjects.map(s=>`<option value="${s}">${s}</option>`).join('');
  if(uniqueSubjects.includes(prevSubject)) subjectSelect.value = prevSubject;
  const fSubject = subjectSelect.value;

  const classSelect = document.getElementById('teacherFilterClass');
  const prevClass = classSelect.value;
  const uniqueClasses = getAllStoredClasses();
  classSelect.innerHTML = '<option value="">All</option>' + uniqueClasses.map(c=>`<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
  if(uniqueClasses.includes(prevClass)) classSelect.value = prevClass;
  const fClass = classSelect.value;

  let list = teachers.filter(t=>{
    if(fSection && t.section!==fSection) return false;
    if(fSubject && (t.subject||'')!==fSubject) return false;
    if(fClass){
      const teacherClasses = (t.classes||'').split(',').map(c=>c.trim()).filter(Boolean);
      if(!teacherClasses.includes(fClass)) return false;
    }
    if(search){
      const hay = `${t.name} ${t.displayId}`.toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });

  // Display order: Section (English Section → French Section → Both), then Subject A-Z,
  // then Teacher Name A-Z within that subject. This is a display-only sort — it does not
  // change the underlying `teachers` array order (used by import/export/merge).
  const TEACHER_SECTION_SORT_ORDER = { 'English': 0, 'French': 1, 'Both': 2 };
  list = list.slice().sort((a, b) => {
    const sa = TEACHER_SECTION_SORT_ORDER.hasOwnProperty(a.section) ? TEACHER_SECTION_SORT_ORDER[a.section] : 99;
    const sb = TEACHER_SECTION_SORT_ORDER.hasOwnProperty(b.section) ? TEACHER_SECTION_SORT_ORDER[b.section] : 99;
    if (sa !== sb) return sa - sb;
    const subjCmp = (a.subject || '').trim().localeCompare((b.subject || '').trim(), undefined, { sensitivity: 'base' });
    if (subjCmp !== 0) return subjCmp;
    return (a.name || '').trim().localeCompare((b.name || '').trim(), undefined, { sensitivity: 'base' });
  });

  document.getElementById('teachersCount').textContent = `${list.length} teachers`;
  const holder = document.getElementById('teachersTableHolder');

  // Manual reordering (▲▼) is disabled: the list is now always auto-sorted by
  // Section → Subject → Name, so a manual position within the underlying array
  // would no longer be reflected visually.
  const reorderEnabled = false;

  if(list.length===0){
    holder.innerHTML = `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No matching teachers</h3>
        <p>Add teachers using the "Add Teacher" button, or import them from an Excel sheet.</p>
      </div>`;
    return;
  }

  const rows = list.map(t=>{
    const fullIdx = teachers.findIndex(x=>x.id===t.id);
    const atTop = fullIdx<=0;
    const atBottom = fullIdx>=teachers.length-1;
    const orderCell = reorderEnabled
      ? `<div class="order-btns">
           <button class="order-btn" ${atTop?'disabled':''} onclick="moveTeacherInDb('${t.id}',-1)" title="Move up">▲</button>
           <button class="order-btn" ${atBottom?'disabled':''} onclick="moveTeacherInDb('${t.id}',1)" title="Move down">▼</button>
         </div>`
      : `<span class="foot-note" title="Sorted automatically by Section, Subject, then Name">—</span>`;
    const teacherClassList = (t.classes||'').split(',').map(c=>c.trim()).filter(Boolean);
    const classesOptionsHtml = uniqueClasses.length
      ? uniqueClasses.map(c=>`
          <label class="tc-opt">
            <input type="checkbox" value="${c.replace(/"/g,'&quot;')}" ${teacherClassList.includes(c)?'checked':''} onchange="toggleTeacherClassSelection('${t.id}', this)">
            <span>${escapeHtml(c)}</span>
          </label>`).join('')
      : `<div class="tc-empty">No classes found in Students Database yet.</div>`;
    return `
    <tr>
      <td><input type="checkbox" class="teacherCheckbox" value="${t.id}"></td>
      <td>${orderCell}</td>
      <td><span class="seat-badge">${t.displayId||'—'}</span></td>
      <td class="name-col">
        <input type="text" class="db-edit-select teacher-name-input" value="${(t.name||'').replace(/"/g,'&quot;')}" onchange="flashInlineSaved(this);updateTeacherField('${t.id}','name',this.value)">
        <div class="teacher-classes-summary-wrap" id="tcSummary_${t.id}">${teacherClassesSummaryHtml(teacherClassList)}</div>
      </td>
      <td>
        <select class="db-edit-select" onchange="flashInlineSaved(this);updateTeacherField('${t.id}','section',this.value)">
          <option value="English" ${t.section==='English'?'selected':''}>English</option>
          <option value="French" ${t.section==='French'?'selected':''}>French</option>
          <option value="Both" ${t.section==='Both'?'selected':''}>Both</option>
        </select>
      </td>
      <td>
        <input type="text" class="db-edit-select" value="${(t.subject||'').replace(/"/g,'&quot;')}" onchange="flashInlineSaved(this);updateTeacherField('${t.id}','subject',this.value)">
      </td>
      <td>
        <div class="teacher-classes-dd" id="tcDD_${t.id}">
          <button type="button" class="teacher-classes-toggle" onclick="toggleTeacherClassesDropdown(event,'${t.id}')">
            <span>${teacherClassList.length ? escapeHtml(teacherClassList.join(', ')) : 'Select classes…'}</span>
            <span class="dd-caret">▾</span>
          </button>
          <div class="teacher-classes-panel" id="tcPanel_${t.id}">${classesOptionsHtml}</div>
        </div>
      </td>
      <td><button class="del-btn" onclick="deleteTeacherFromDb('${t.id}')" title="Delete">✕</button></td>
    </tr>`;
  }).join('');

  holder.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:30px;"><input type="checkbox" id="teacherSelectAllCheckbox" onclick="toggleSelectAllTeachers()"></th>
          <th style="width:56px;">Order</th>
          <th>ID</th>
          <th class="name-col">Teachers Name</th>
          <th>Section</th>
          <th>Subject</th>
          <th>Classes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function exportTeachersDatabase(){
  if(teachers.length===0){ alert('There are no teachers to export yet.'); return; }
  const rows = teachers.map((t,i)=>({
    "ID": t.displayId||'',
    "#": i+1,
    "Teachers Name": t.name,
    "Section": t.section,
    "Subject": t.subject||'',
    "Classes": t.classes||''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Teachers Database");
  XLSX.writeFile(wb, "Teachers_Database.xlsx");
}

function findTeacherSection(label){
  label = (label||'').toString().trim();
  if(/^both$/i.test(label) || /كلا|both/i.test(label)) return 'Both';
  if(/english|انجليز|إنجليز/i.test(label)) return 'English';
  if(/french|فرنس/i.test(label)) return 'French';
  return null;
}

function importTeachersExcel(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      let added = 0;
      let skippedDuplicates = 0;
      const problems = [];

      // Column headers can vary slightly between files (extra spaces, different case,
      // or a different wording like "Subject Name"/"Teacher Subject"). Build a lookup of
      // this row's keys normalized (trimmed + lowercased) so we still find the right
      // column even if it doesn't match the template's exact header text.
      function getField(row, candidates){
        const normalizedMap = {};
        Object.keys(row).forEach(k=>{ normalizedMap[k.trim().toLowerCase()] = row[k]; });
        for(const c of candidates){
          const v = normalizedMap[c.toLowerCase()];
          if(v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      }

      // De-duplication key: same Teacher Name + same Section is treated as the same teacher.
      // Checked both against teachers already in the database AND against rows already
      // processed earlier in this same file, so a file containing the same teacher twice
      // (or a file re-imported by mistake) doesn't create repeated rows.
      const dupKey = (n, s) => `${n.trim().toLowerCase()}|${s}`;
      const existingKeys = new Set(teachers.map(t=> dupKey(t.name||'', t.section||'')));

      rows.forEach((row, idx)=>{
        const name = getField(row, ['Teachers Name','Name','Teacher Name']);
        const providedId = getField(row, ['ID','id']);
        const sectionLabel = getField(row, ['Section']);
        const subject = getField(row, ['Subject','Subject Name','Teacher Subject']);
        const classes = getField(row, ['Classes','Class']);

        if(!name){ problems.push(`Row ${idx+2}: missing teacher name`); return; }
        const section = findTeacherSection(sectionLabel);
        if(!section){ problems.push(`${name}: unrecognized "Section" value ("${sectionLabel}") — must be English, French or Both`); return; }

        const key = dupKey(name, section);
        if(existingKeys.has(key)){
          skippedDuplicates++;
          problems.push(`${name} (${section}): already exists — skipped to avoid a duplicate`);
          return;
        }
        existingKeys.add(key);

        if(!subject){ problems.push(`${name}: no "Subject" value found in this row — added with Subject left blank, please fill it in manually`); }

        teachers.push({ id: uid(), displayId: providedId || nextTeacherDisplayId(), name, section, subject, classes });
        added++;
      });

      renderTeachersDatabase();
      saveState();
      // Push immediately instead of only marking "unsaved". Excel-imported teachers used to
      // sit only in localStorage until the separate Grade Book Save button was pressed; if a
      // remote Firestore snapshot arrived first (another device, a live-sync tick, or simply
      // reloading the page) the older server copy — which never had these rows — would
      // silently replace them, making a successful import look like it got "deleted".
      scheduleGithubPush();
      document.getElementById('importTitle').textContent = 'Bulk Import Result';
      let msg = `${added} teacher(s) added successfully.`;
      if(skippedDuplicates) msg += ` ${skippedDuplicates} duplicate row(s) skipped.`;
      if(problems.length){
        msg += `<br><br><b>${problems.length} row(s) need attention:</b><br>` +
          problems.slice(0,8).map(p=>`• ${p}`).join('<br>') +
          (problems.length>8 ? `<br>... and ${problems.length-8} more` : '');
      }
      document.getElementById('importMsg').innerHTML = msg;
      document.getElementById('importResultOverlay').classList.add('show');
    }catch(err){
      alert('Could not read the file. Make sure the file format and column names match the template.');
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('teachersExcelInput').value='';
}

// One-off cleanup utility for teacher records that already got duplicated (e.g. from an
// earlier import that had no duplicate check). Matches duplicates by Name + Section
// (case-insensitive), keeps one merged row per match (filling in a blank Subject and
// merging Classes from the duplicates before deleting them), and removes the rest.
// Not wired to a button yet — run it from the browser console: cleanupDuplicateTeachers()
function cleanupDuplicateTeachers(){
  if(!currentUser || currentUser.role !== 'admin'){ alert('⛔ Teachers Database is only available to Administrators.'); return; }
  const seen = new Map(); // "name|section" -> kept teacher object
  const toRemove = [];
  teachers.forEach(t=>{
    const key = `${(t.name||'').trim().toLowerCase()}|${t.section||''}`;
    if(!key.trim() || key==='|') return; // skip blank rows, nothing to merge
    if(!seen.has(key)){
      seen.set(key, t);
      return;
    }
    const kept = seen.get(key);
    if(!kept.subject && t.subject) kept.subject = t.subject;
    if(t.classes){
      const mergedClasses = new Set((kept.classes||'').split(',').map(c=>c.trim()).filter(Boolean));
      t.classes.split(',').map(c=>c.trim()).filter(Boolean).forEach(c=>mergedClasses.add(c));
      kept.classes = Array.from(mergedClasses).join(', ');
    }
    toRemove.push(t.id);
  });
  if(!toRemove.length){ alert('No duplicate teachers found (matched by identical Name + Section).'); return; }
  if(!confirm(`Found ${toRemove.length} duplicate teacher row(s) (same Name + Section). Remove them and keep one merged row per teacher? This cannot be undone.`)) return;
  teachers = teachers.filter(t=> !toRemove.includes(t.id));
  renderTeachersDatabase();
  saveState();
  if(typeof logActivity==='function') logActivity('edit', `Removed ${toRemove.length} duplicate teacher row(s)`);
  alert(`Removed ${toRemove.length} duplicate row(s). ${teachers.length} teacher(s) remain.`);
}

function downloadTeachersTemplate(){
  const sample = [
    { "ID":"", "Teachers Name":"Mona Ahmed Saleh", "Section":"English", "Subject":"Mathematics", "Classes":"3/A, 3/B, 4/A" },
    { "ID":"", "Teachers Name":"", "Section":"", "Subject":"", "Classes":"" }
  ];
  const wsData = XLSX.utils.json_to_sheet(sample);

  const guide = [
    { "Field":"ID (optional)", "Allowed Values":"Leave blank to auto-generate, or enter an existing teacher code" },
    { "Field":"Teachers Name", "Allowed Values":"Full name of the teacher" },
    { "Field":"Section", "Allowed Values":"English / French / Both" },
    { "Field":"Subject", "Allowed Values": ALL_SUBJECTS.join(' | ') },
    { "Field":"Classes", "Allowed Values":"Comma-separated list of classes the teacher takes, e.g. 3/A, 3/B, 4/A" }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guide);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, "Teacher Data");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Allowed Values");
  XLSX.writeFile(wb, "Teachers_Import_Template.xlsx");
}

/* ================== TEACHERS STATISTICS (Section > Stage > Subject) ==================
   Teachers Database rows only store Section (English/French/Both), Subject and a free-text
   list of Classes — there is no direct "Stage" field on a teacher. So the Stage is worked out
   by cross-referencing each of a teacher's Classes against the Students Database (the same
   classroom-name -> Section/Stage/Grade lookup the rest of the app uses), the same way
   findSubjectTeacherName() already matches a subject teacher to a classroom. A teacher whose
   listed classes don't (yet) match any classroom in the Students Database is grouped under
   "Unspecified Stage" instead of being dropped from the statistics. */
function buildClassroomStageIndex(){
  // classroomName -> [{sectionId, sectionLabel, stageId, stageLabel}, ...] (de-duplicated)
  const idx = {};
  Object.keys(students).forEach(ck=>{
    const [sectionId, stageId] = ck.split('|');
    const stageObj = STAGES[stageId];
    if(!stageObj) return;
    (students[ck]||[]).forEach(s=>{
      const c = (s.classroom||'').trim();
      if(!c) return;
      if(!idx[c]) idx[c] = [];
      const already = idx[c].some(e=> e.sectionId===sectionId && e.stageId===stageId);
      if(!already) idx[c].push({ sectionId, sectionLabel: SECTIONS[sectionId] ? SECTIONS[sectionId].label : sectionId, stageId, stageLabel: stageObj.label });
    });
  });
  return idx;
}

// A Teachers Database "Section" value (English / French / Both) doesn't line up 1:1 with the
// SECTIONS keys ('en'/'fr') used elsewhere, so match loosely by the section label's first letter.
function teacherSectionMatchesIndexEntry(teacherSection, entry){
  const t = (teacherSection||'').trim().toLowerCase();
  if(!t || t==='both') return true;
  if(t.startsWith('eng')) return entry.sectionId==='en';
  if(t.startsWith('fr')) return entry.sectionId==='fr';
  return true;
}

function buildTeacherStatisticsData(){
  const classroomIdx = buildClassroomStageIndex();
  // stats[sectionLabel][stageLabel][subjectName] = { teacherIds:Set }
  const stats = {};
  const UNSPEC = 'Unspecified Stage';

  teachers.forEach(t=>{
    const sectionLabel = (t.section||'Unspecified').trim() || 'Unspecified';
    const subjects = (t.subject||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!subjects.length) subjects.push('Unspecified Subject');
    const classList = (t.classes||'').split(',').map(c=>c.trim()).filter(Boolean);

    // Work out every Stage this teacher's classes fall under (for this teacher's Section).
    const stageLabels = new Set();
    classList.forEach(cName=>{
      const entries = classroomIdx[cName] || [];
      entries
        .filter(e=> teacherSectionMatchesIndexEntry(t.section, e))
        .forEach(e=> stageLabels.add(e.stageLabel));
    });
    if(!stageLabels.size) stageLabels.add(UNSPEC);

    if(!stats[sectionLabel]) stats[sectionLabel] = {};
    stageLabels.forEach(stageLabel=>{
      if(!stats[sectionLabel][stageLabel]) stats[sectionLabel][stageLabel] = {};
      subjects.forEach(subject=>{
        if(!stats[sectionLabel][stageLabel][subject]) stats[sectionLabel][stageLabel][subject] = { teacherIds: new Set(), names: [] };
        const bucket = stats[sectionLabel][stageLabel][subject];
        if(!bucket.teacherIds.has(t.id)){
          bucket.teacherIds.add(t.id);
          bucket.names.push(t.name || 'Unnamed');
        }
      });
    });
  });

  return stats;
}

// Keeps Primary → Prep → Secondary stage order (matching the rest of the app) with
// "Unspecified Stage" pushed to the end, instead of relying on object insertion order.
function orderedStageLabels(stageMap){
  const order = ['primary','prep','secondary'].map(k=>STAGES[k].label);
  const keys = Object.keys(stageMap);
  return keys.sort((a,b)=>{
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if(ia===-1 && ib===-1) return a.localeCompare(b);
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia-ib;
  });
}

function buildTeacherStatisticsHTML(stats){
  const sectionLabels = Object.keys(stats).sort((a,b)=> a.localeCompare(b));
  if(!sectionLabels.length){
    return `
      <div class="empty-state">
        <div class="seal-lg">?</div>
        <h3>No teachers yet</h3>
        <p>Add teachers in the Teachers Database to see statistics here.</p>
      </div>`;
  }

  let html = '';
  sectionLabels.forEach(sectionLabel=>{
    const stageMap = stats[sectionLabel];
    html += `
    <div style="margin-bottom:32px;">
      <h3 style="margin:0 0 16px; color:var(--ink); font-size:16px; border-bottom:2px solid var(--gold); padding-bottom:8px;">
        📍 ${escapeHtml(sectionLabel)} Section
      </h3>
      <table class="stats-table">
        <thead>
          <tr>
            <th>Stage / Subject</th>
            <th>Teachers</th>
          </tr>
        </thead>
        <tbody>`;

    let sectionTotalTeacherIds = new Set();

    orderedStageLabels(stageMap).forEach(stageLabel=>{
      const subjectMap = stageMap[stageLabel];
      let stageTeacherIds = new Set();
      html += `
          <tr class="stats-grand-total" style="background:var(--gold-light);">
            <td colspan="2"><b>${escapeHtml(stageLabel)}</b></td>
          </tr>`;

      Object.keys(subjectMap).sort((a,b)=> a.localeCompare(b)).forEach(subject=>{
        const bucket = subjectMap[subject];
        bucket.teacherIds.forEach(id=>{ stageTeacherIds.add(id); sectionTotalTeacherIds.add(id); });
        const namesTitle = bucket.names.slice().sort((a,b)=>a.localeCompare(b)).join(', ');
        html += `
          <tr>
            <td>&nbsp;&nbsp;&nbsp;${subjectWithIcon(subject)}</td>
            <td title="${escapeHtml(namesTitle)}">${bucket.teacherIds.size}</td>
          </tr>`;
      });

      html += `
          <tr class="stats-subtotal">
            <td>&nbsp;&nbsp;${escapeHtml(stageLabel)} Total</td>
            <td><b>${stageTeacherIds.size}</b></td>
          </tr>`;
    });

    html += `
          <tr class="stats-grand-total">
            <td><b>${escapeHtml(sectionLabel)} Section Total</b></td>
            <td><b>${sectionTotalTeacherIds.size}</b></td>
          </tr>
        </tbody>
      </table>
    </div>`;
  });

  return html;
}

function renderTeacherStatistics(){
  const view = document.getElementById('teacherStatisticsView');
  if(!view || view.style.display === 'none') return;
  const holder = document.getElementById('teacherStatisticsTableHolder');
  if(!holder) return;

  const statsData = buildTeacherStatisticsData();
  holder.innerHTML = buildTeacherStatisticsHTML(statsData);

  const countEl = document.getElementById('teacherStatsCount');
  if(countEl) countEl.textContent = `${teachers.length} registered teacher(s)`;
}

function downloadTeacherStatisticsExcel(){
  const statsData = buildTeacherStatisticsData();
  const wb = XLSX.utils.book_new();
  const wsData = [['📊 MILS Teachers Statistics Report']];
  wsData.push(['Generated:', new Date().toLocaleString()]);
  wsData.push([]);
  wsData.push(['Section', 'Stage', 'Subject', 'Teachers']);

  Object.keys(statsData).sort((a,b)=>a.localeCompare(b)).forEach(sectionLabel=>{
    const stageMap = statsData[sectionLabel];
    orderedStageLabels(stageMap).forEach(stageLabel=>{
      const subjectMap = stageMap[stageLabel];
      Object.keys(subjectMap).sort((a,b)=>a.localeCompare(b)).forEach(subject=>{
        wsData.push([sectionLabel, stageLabel, subject, subjectMap[subject].teacherIds.size]);
      });
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "Teachers Statistics");
  XLSX.writeFile(wb, "Teachers_Statistics.xlsx");
}

/* ================== AUTH & USER PERMISSIONS ================== */
const USERS_LS_KEY = 'gradesSystemUsers_v1';
const SESSION_LS_KEY = 'gradesSystemSession_v1';
const REMEMBER_LS_KEY = 'gradesSystemRememberedUser_v1';
let users = [];
let currentUser = null;
// Usernames deleted locally, mirroring deletedTeacherIds above for the exact same reason:
// the Firestore sync merges `users` by union-of-both-sides (mergeArrayById keyed by
// username), so without recording deletions explicitly, a deleted account reappears the
// next time this device (or another) syncs, because the server's copy from before the
// deletion still has that row.
let deletedUsernames = [];

/* ================== ACTIVITY & LOGIN LOG ==================
   Records who signed in/out and who changed what, with a timestamp.
   Stored locally and piggybacks on the existing Firebase sync payload,
   so the Admin can review activity from any device. */
const ACTIVITY_LOG_LS_KEY = 'gradesSystemActivityLog_v1';
const ACTIVITY_LOG_MAX = 500;
let activityLog = [];

function loadActivityLog(){
  try{
    const raw = localStorage.getItem(ACTIVITY_LOG_LS_KEY);
    activityLog = raw ? (JSON.parse(raw) || []) : [];
  }catch(err){ activityLog = []; }
}
function saveActivityLogLocalOnly(){
  try{ localStorage.setItem(ACTIVITY_LOG_LS_KEY, JSON.stringify(activityLog)); }
  catch(err){ console.warn('Could not save activity log', err); }
}
// type: 'login' | 'logout' | 'add' | 'edit' | 'delete' | 'import'
function logActivity(type, message, meta){
  const entry = {
    id: uid(),
    username: currentUser ? currentUser.username : 'system',
    displayName: currentUser ? (currentUser.displayName || currentUser.username) : 'System',
    role: currentUser ? currentUser.role : '',
    type, message,
    ts: Date.now(),
    // Optional extra context (e.g. studentId) so notification consumers — like a
    // Parent/Student account's own bell — can filter entries down to just their child
    // without having to re-parse the free-text message.
    ...(meta || {})
  };
  activityLog.unshift(entry);
  if(activityLog.length > ACTIVITY_LOG_MAX) activityLog.length = ACTIVITY_LOG_MAX;
  saveActivityLogLocalOnly();
  scheduleGithubPush();
  const overlay = document.getElementById('activityLogOverlay');
  if(overlay && overlay.classList.contains('show')) renderActivityLogTable();
  updateNotifBadge();
}
function activityLogFormatTs(ts){
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}
const LOG_TYPE_LABELS = { login:'Login', logout:'Logout', add:'Added', edit:'Edited', delete:'Deleted', import:'Imported' };
function visibleActivityLog(){
  // Head of Department: only see their own entries plus Teacher/Parent accounts within their own section.
  if(currentUser && currentUser.role==='hod'){
    const sectionUsernames = new Set(
      users.filter(u=> (u.role==='teacher'||u.role==='parent') && hodSectionMatches(u.section)).map(u=>u.username)
    );
    sectionUsernames.add(currentUser.username);
    return activityLog.filter(e=> sectionUsernames.has(e.username));
  }
  return activityLog;
}
function openActivityLogModal(){
  if(!currentUser || !currentUser.effective || !currentUser.effective.settings){ alert('You do not have permission to view the activity log.'); return; }
  const userSelect = document.getElementById('logFilterUser');
  const usernames = [...new Set(visibleActivityLog().map(e=>e.username))].sort((a,b)=>a.localeCompare(b));
  userSelect.innerHTML = '<option value="">All users</option>' + usernames.map(u=>{
    const entry = activityLog.find(e=>e.username===u);
    const label = entry ? (entry.displayName||u) : u;
    return `<option value="${u}">${escapeHtml(label)}</option>`;
  }).join('');
  document.getElementById('logFilterType').value = '';
  document.getElementById('clearActivityLogBtn').style.display = (currentUser.role==='admin') ? '' : 'none';
  renderActivityLogTable();
  document.getElementById('activityLogOverlay').classList.add('show');
}
function closeActivityLogModal(){
  document.getElementById('activityLogOverlay').classList.remove('show');
}
function renderActivityLogTable(){
  const body = document.getElementById('activityLogTableBody');
  if(!body) return;
  const userFilter = document.getElementById('logFilterUser').value;
  const typeFilter = document.getElementById('logFilterType').value;
  let list = visibleActivityLog();
  if(userFilter) list = list.filter(e=>e.username===userFilter);
  if(typeFilter) list = list.filter(e=>e.type===typeFilter);
  if(list.length===0){
    body.innerHTML = `<tr><td colspan="4"><div class="log-empty">No activity recorded yet.</div></td></tr>`;
    return;
  }
  body.innerHTML = list.map(e=>`
    <tr>
      <td class="log-ts">${activityLogFormatTs(e.ts)}</td>
      <td><div class="log-user">${escapeHtml(e.displayName||e.username)}</div><div class="log-role">${escapeHtml(ROLE_LABELS[e.role]||e.role||'')}</div></td>
      <td><span class="log-type-pill log-type-${e.type}">${LOG_TYPE_LABELS[e.type]||e.type}</span></td>
      <td>${escapeHtml(e.message||'')}</td>
    </tr>`).join('');
}
function clearActivityLog(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can clear the activity log.'); return; }
  if(!confirm('Delete the entire activity log for everyone? This cannot be undone.')) return;
  activityLog = [];
  saveActivityLogLocalOnly();
  scheduleGithubPush();
  renderActivityLogTable();
}

function downloadActivityLogExcel(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can download the activity log.'); return; }
  if(activityLog.length === 0){ alert('No activity log data to export.'); return; }
  
  const data = activityLog.map(e => ({
    "Date & Time": activityLogFormatTs(e.ts),
    "User": e.displayName || e.username || 'System',
    "Role": ROLE_LABELS[e.role] || e.role || '',
    "Action": LOG_TYPE_LABELS[e.type] || e.type || '',
    "Details": e.message || ''
  }));
  
  const ws = XLSX.utils.json_to_sheet(data);
  
  // تنسيق الرؤوس
  const headerStyle = {
    fill: { fgColor: { rgb: "FF1B2A4A" } },
    font: { bold: true, color: { rgb: "FFFFFFFF" }, size: 12 },
    alignment: { horizontal: "center", vertical: "center" }
  };
  
  // تطبيق التنسيق على الرؤوس
  const range = XLSX.utils.decode_range(ws['!ref']);
  for(let C = range.s.c; C <= range.e.c; ++C){
    const address = XLSX.utils.encode_col(C) + "1";
    if(!ws[address]) continue;
    ws[address].s = headerStyle;
  }
  
  // تعديل عرض الأعمدة
  ws['!cols'] = [
    { wch: 20 },  // Date & Time
    { wch: 25 },  // User
    { wch: 20 },  // Role
    { wch: 20 },  // Action
    { wch: 40 }   // Details
  ];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Activity Log");
  XLSX.writeFile(wb, `Activity_Log_${new Date().toISOString().split('T')[0]}.xlsx`);
  
  logActivity('export', 'Downloaded Activity Log as Excel');
}

/* ========== TERM & MONTH DATES ==========
   The Start/End date (and excluded Holiday days) of the 1st and 2nd Month of each Term, set
   once by the Admin (typically at the start of the school year) and shown to every user —
   Teachers, Parents & Students included — wherever a Month is selected in the Grade Book or
   Absence tabs. It never changes on its own; only an Admin editing it again through this modal
   updates it. Holidays are set here ONCE per Term's Month and apply automatically to every
   Section, Stage, Grade, Class & Subject — there's no need to add them again per class in the
   Absence tab. Synced through the same Firebase document as the rest of the app's data so every
   device sees the same dates. */
let termMonthDates = {
  term1: { month1:{start:'',end:'',holidays:[]}, month2:{start:'',end:'',holidays:[]} },
  term2: { month1:{start:'',end:'',holidays:[]}, month2:{start:'',end:'',holidays:[]} }
};
const TERM_MONTH_DATES_LS_KEY = 'termMonthDates_v1';
// Holidays being edited in the modal before Save is pressed — staged separately so Cancel/close
// without saving doesn't touch the live data.
let tmdStagedHolidays = { term1:{month1:[],month2:[]}, term2:{month1:[],month2:[]} };

function normalizeTermMonthDates(data){
  ['term1','term2'].forEach(term=>{
    ['month1','month2'].forEach(m=>{
      if(!data[term][m]) data[term][m] = { start:'', end:'', holidays:[] };
      if(!Array.isArray(data[term][m].holidays)) data[term][m].holidays = [];
    });
  });
  return data;
}

function loadTermMonthDates(){
  try{
    const raw = localStorage.getItem(TERM_MONTH_DATES_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.term1 && parsed.term2) termMonthDates = parsed;
    }
  }catch(err){ console.warn('Could not load Term & Month Dates', err); }
  // Backfill holidays arrays for data saved before this field existed.
  normalizeTermMonthDates(termMonthDates);
}

function saveTermMonthDatesLocalOnly(){
  try{ localStorage.setItem(TERM_MONTH_DATES_LS_KEY, JSON.stringify(termMonthDates)); }
  catch(err){ console.warn('Could not save Term & Month Dates', err); }
}

// Formats a saved {start,end} range as "12 Sep – 20 Oct", or '' if not set yet.
function formatTermMonthRange(termPeriod, monthKey){
  const r = termMonthDates && termMonthDates[termPeriod] && termMonthDates[termPeriod][monthKey];
  if(!r || !r.start || !r.end) return '';
  const fmt = d => {
    const dt = new Date(d + 'T00:00:00');
    if(isNaN(dt)) return d;
    return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
  };
  return `${fmt(r.start)} – ${fmt(r.end)}`;
}

const TMD_HOLIDAY_IDS = {
  term1: { month1:{input:'tmdT1M1ExclInput', chips:'tmdT1M1ExclChips'}, month2:{input:'tmdT1M2ExclInput', chips:'tmdT1M2ExclChips'} },
  term2: { month1:{input:'tmdT2M1ExclInput', chips:'tmdT2M1ExclChips'}, month2:{input:'tmdT2M2ExclInput', chips:'tmdT2M2ExclChips'} }
};

function renderTmdHolidayChips(term, monthKey){
  const ids = TMD_HOLIDAY_IDS[term][monthKey];
  const holder = document.getElementById(ids.chips);
  if(!holder) return;
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  const list = [...tmdStagedHolidays[term][monthKey]].sort();
  if(!list.length){ holder.innerHTML=''; return; }
  holder.innerHTML = list.map(ds=>{
    const d = new Date(ds+'T00:00:00');
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const label = `${dd}/${mm}/${d.getFullYear()}`;
    return `<span class="att-excl-chip">🚫 ${label}${isAdmin ? `<button type="button" class="att-excl-chip-x" title="Remove this holiday" onclick="removeTmdHoliday('${term}','${monthKey}','${ds}')">×</button>` : ''}</span>`;
  }).join('');
}

function addTmdHoliday(term, monthKey){
  if(!currentUser || currentUser.role!=='admin') return;
  const ids = TMD_HOLIDAY_IDS[term][monthKey];
  const input = document.getElementById(ids.input);
  if(!input || !input.value) return;
  if(!tmdStagedHolidays[term][monthKey].includes(input.value)) tmdStagedHolidays[term][monthKey].push(input.value);
  input.value = '';
  renderTmdHolidayChips(term, monthKey);
}

function removeTmdHoliday(term, monthKey, dateStr){
  tmdStagedHolidays[term][monthKey] = tmdStagedHolidays[term][monthKey].filter(d=>d!==dateStr);
  renderTmdHolidayChips(term, monthKey);
}

function openTermMonthDatesModal(){
  loadTermMonthDates();
  const t1m1 = termMonthDates.term1.month1, t1m2 = termMonthDates.term1.month2;
  const t2m1 = termMonthDates.term2.month1, t2m2 = termMonthDates.term2.month2;
  document.getElementById('tmdT1M1Start').value = t1m1.start || '';
  document.getElementById('tmdT1M1End').value   = t1m1.end   || '';
  document.getElementById('tmdT1M2Start').value = t1m2.start || '';
  document.getElementById('tmdT1M2End').value   = t1m2.end   || '';
  document.getElementById('tmdT2M1Start').value = t2m1.start || '';
  document.getElementById('tmdT2M1End').value   = t2m1.end   || '';
  document.getElementById('tmdT2M2Start').value = t2m2.start || '';
  document.getElementById('tmdT2M2End').value   = t2m2.end   || '';
  tmdStagedHolidays = {
    term1: { month1:[...(t1m1.holidays||[])], month2:[...(t1m2.holidays||[])] },
    term2: { month1:[...(t2m1.holidays||[])], month2:[...(t2m2.holidays||[])] }
  };
  ['term1','term2'].forEach(term=> ['month1','month2'].forEach(m=> renderTmdHolidayChips(term,m)));
  const statusEl = document.getElementById('termMonthDatesStatus');
  if(statusEl) statusEl.textContent = (currentUser && currentUser.role==='admin')
    ? ''
    : 'Only the Admin can edit these dates — you can view them here, but the fields are read-only.';
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  ['tmdT1M1Start','tmdT1M1End','tmdT1M2Start','tmdT1M2End','tmdT2M1Start','tmdT2M1End','tmdT2M2Start','tmdT2M2End',
   'tmdT1M1ExclInput','tmdT1M2ExclInput','tmdT2M1ExclInput','tmdT2M2ExclInput'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.disabled = !isAdmin;
  });
  document.querySelectorAll('#termMonthDatesOverlay .att-excl-add-btn').forEach(btn=> btn.style.display = isAdmin ? '' : 'none');
  const saveBtn = document.querySelector('#termMonthDatesOverlay .btn-gold');
  if(saveBtn) saveBtn.style.display = isAdmin ? '' : 'none';
  document.getElementById('termMonthDatesOverlay').classList.add('show');
}

function closeTermMonthDatesModal(){
  document.getElementById('termMonthDatesOverlay').classList.remove('show');
}

// After the dates/holidays for a Term's Month are saved, regenerates every already-existing
// attendance table for that exact Term+Month (across every Section/Stage/Grade/Class/Subject)
// using the (possibly new) Start/End & holiday list — so a holiday added after tables were
// already auto-created still takes effect everywhere immediately, without visiting each class.
function regenerateAttendanceForGlobalMonth(termPeriod, monthKey){
  const range = termMonthDates[termPeriod][monthKey];
  if(!range || !range.start || !range.end) return;
  const dates = generateAttendanceDates(range.start, range.end, new Set(range.holidays||[]));
  if(!dates) return;
  Object.keys(attendance).forEach(ck=>{
    const parts = ck.split('|');
    if(parts.length!==7) return;
    const [section, stage, grade, tp, term, subject, at] = parts;
    if(tp!==termPeriod || at!==monthKey) return;
    applyAttendanceDateRangeToClass(section, stage, grade, term, subject, tp, at, range.start, range.end, dates, range.holidays||[]);
  });
}

function saveTermMonthDates(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can set the Term & Month dates.'); return; }
  const getVal = id => document.getElementById(id).value || '';
  const next = {
    term1: {
      month1: { start:getVal('tmdT1M1Start'), end:getVal('tmdT1M1End'), holidays:[...tmdStagedHolidays.term1.month1] },
      month2: { start:getVal('tmdT1M2Start'), end:getVal('tmdT1M2End'), holidays:[...tmdStagedHolidays.term1.month2] }
    },
    term2: {
      month1: { start:getVal('tmdT2M1Start'), end:getVal('tmdT2M1End'), holidays:[...tmdStagedHolidays.term2.month1] },
      month2: { start:getVal('tmdT2M2Start'), end:getVal('tmdT2M2End'), holidays:[...tmdStagedHolidays.term2.month2] }
    }
  };
  // Validate any range that has both dates filled in
  for(const term of ['term1','term2']){
    for(const m of ['month1','month2']){
      const r = next[term][m];
      if(r.start && r.end && r.end < r.start){
        alert(`${TERM_LABELS[term]} — ${m==='month1'?'1st':'2nd'} Month: the End date must be on or after the Start date.`);
        return;
      }
    }
  }
  termMonthDates = next;
  saveTermMonthDatesLocalOnly();
  ['term1','term2'].forEach(term=> ['month1','month2'].forEach(m=> regenerateAttendanceForGlobalMonth(term, m)));
  saveStateLocalOnly();
  scheduleGithubPush();
  logActivity('edit', 'Updated Term & Month Dates');
  const statusEl = document.getElementById('termMonthDatesStatus');
  if(statusEl) statusEl.textContent = 'Saved — visible to everyone now.';
  if(typeof renderTable==='function') renderTable();
  if(typeof renderAttendanceWorkspace==='function') renderAttendanceWorkspace();
}

/* ========== BELL TIMES ==========
   Set once by the Admin — the Start/End time for each class period (Period 1, Period 2, ...).
   Shown read-only to every user. Synced through the same Firebase document as the rest of the
   app's data so every device sees the same bell times. */
let bellTimes = { periods: [] };
const BELL_TIMES_LS_KEY = 'bellTimes_v1';
let bellTimesStaged = []; // rows being edited before Save; touching Cancel/close doesn't affect live data
let bellTimesRowSeq = 0;

function normalizeBellTimes(data){
  if(!data || !Array.isArray(data.periods)) data = { periods: [] };
  data.periods.forEach(p=>{
    if(!p.label) p.label = '';
    if(!p.start) p.start = '';
    if(!p.end) p.end = '';
  });
  return data;
}

function loadBellTimes(){
  try{
    const raw = localStorage.getItem(BELL_TIMES_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed) bellTimes = parsed;
    }
  }catch(err){ console.warn('Could not load Bell Times', err); }
  normalizeBellTimes(bellTimes);
}

function saveBellTimesLocalOnly(){
  try{ localStorage.setItem(BELL_TIMES_LS_KEY, JSON.stringify(bellTimes)); }
  catch(err){ console.warn('Could not save Bell Times', err); }
}

function renderBellTimesRows(){
  const container = document.getElementById('bellTimesRowsContainer');
  if(!container) return;
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  if(!bellTimesStaged.length){
    container.innerHTML = `<p class="foot-note" style="padding:8px 2px;">${isAdmin ? 'No periods yet — click "＋ Add Period" to start.' : 'Bell times have not been set yet.'}</p>`;
    return;
  }
  container.innerHTML = bellTimesStaged.map((row,idx)=>`
    <div class="exam-sched-row" style="display:flex;gap:10px;align-items:center;padding:4px 2px;">
      <div style="flex:1;">
        <input type="text" value="${(row.label||'').replace(/"/g,'&quot;')}" placeholder="Period ${idx+1}"
          oninput="updateBellTimesRow(${idx},'label',this.value)" ${isAdmin ? '' : 'disabled'}
          style="border:1.5px solid var(--border);border-radius:8px;padding:7px 9px;font-family:'Tajawal';font-size:13.5px;width:100%;">
      </div>
      <div style="flex:1.4;">
        <input type="time" value="${row.start||''}" oninput="updateBellTimesRow(${idx},'start',this.value)" ${isAdmin ? '' : 'disabled'}
          style="border:1.5px solid var(--border);border-radius:8px;padding:7px 9px;font-family:'Tajawal';font-size:13.5px;width:100%;">
      </div>
      <div style="flex:1.4;">
        <input type="time" value="${row.end||''}" oninput="updateBellTimesRow(${idx},'end',this.value)" ${isAdmin ? '' : 'disabled'}
          style="border:1.5px solid var(--border);border-radius:8px;padding:7px 9px;font-family:'Tajawal';font-size:13.5px;width:100%;">
      </div>
      <div style="width:24px;text-align:center;">
        ${isAdmin ? `<span title="Remove this period" style="cursor:pointer;color:var(--red);font-weight:800;" onclick="removeBellTimesRow(${idx})">×</span>` : ''}
      </div>
    </div>
  `).join('');
}

function updateBellTimesRow(idx, field, value){
  if(!currentUser || currentUser.role!=='admin') return;
  if(!bellTimesStaged[idx]) return;
  bellTimesStaged[idx][field] = value;
}

function addBellTimesRow(){
  if(!currentUser || currentUser.role!=='admin') return;
  bellTimesStaged.push({ id:'bt'+(bellTimesRowSeq++), label:'', start:'', end:'' });
  renderBellTimesRows();
}

function removeBellTimesRow(idx){
  if(!currentUser || currentUser.role!=='admin') return;
  bellTimesStaged.splice(idx,1);
  renderBellTimesRows();
}

function openBellTimesModal(){
  loadBellTimes();
  bellTimesStaged = (bellTimes.periods||[]).map(p=> ({ id:'bt'+(bellTimesRowSeq++), label:p.label||'', start:p.start||'', end:p.end||'' }));
  renderBellTimesRows();
  const statusEl = document.getElementById('bellTimesStatus');
  if(statusEl) statusEl.textContent = (currentUser && currentUser.role==='admin')
    ? ''
    : 'Only the Admin can edit Bell Times — you can view them here, but the fields are read-only.';
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  const addBtn = document.getElementById('bellTimesAddRowBtn');
  if(addBtn) addBtn.style.display = isAdmin ? '' : 'none';
  const saveBtn = document.getElementById('bellTimesSaveBtn');
  if(saveBtn) saveBtn.style.display = isAdmin ? '' : 'none';
  document.getElementById('bellTimesOverlay').classList.add('show');
}

function closeBellTimesModal(){
  document.getElementById('bellTimesOverlay').classList.remove('show');
}

function saveBellTimes(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can set Bell Times.'); return; }
  for(const row of bellTimesStaged){
    if(row.start && row.end && row.end <= row.start){
      alert(`${row.label || 'A period'}: the End time must be after the Start time.`);
      return;
    }
  }
  bellTimes = { periods: bellTimesStaged.map(r=> ({ label:r.label||'', start:r.start||'', end:r.end||'' })) };
  saveBellTimesLocalOnly();
  saveStateLocalOnly();
  scheduleGithubPush();
  logActivity('edit', 'Updated Bell Times');
  const statusEl = document.getElementById('bellTimesStatus');
  if(statusEl) statusEl.textContent = 'Saved — visible to everyone now.';
}

/* ---------- Upcoming Class Alert (all accounts except Parent/Student, 5 min before Bell Times period) ----------
   Purely time-based: every period defined in Bell Times fires a banner for any signed-in
   account whose role isn't Parent/Student, starting 5 minutes before its Start time, until
   that Start time passes. Dismissing hides it for that specific period for the rest of the
   day (kept in sessionStorage so it naturally resets on the next calendar day / next browser
   session). */
const CLASS_ALERT_LEAD_MINUTES = 5;
const CLASS_ALERT_DISMISSED_LS_KEY = 'classAlertDismissed_v1';
let classAlertTimer = null;

function classAlertDismissedSet(){
  try{ return new Set(JSON.parse(sessionStorage.getItem(CLASS_ALERT_DISMISSED_LS_KEY) || '[]')); }
  catch(err){ return new Set(); }
}
function classAlertKeyFor(period, dayStr){
  return `${dayStr}|${period.label}|${period.start}`;
}
function dismissClassAlert(){
  const bar = document.getElementById('classAlertBar');
  const key = bar ? bar.dataset.alertKey : null;
  if(key){
    const set = classAlertDismissedSet();
    set.add(key);
    try{ sessionStorage.setItem(CLASS_ALERT_DISMISSED_LS_KEY, JSON.stringify([...set])); }catch(err){}
  }
  if(bar) bar.style.display = 'none';
}
// Finds the single nearest upcoming period (if any) that starts within the next
// CLASS_ALERT_LEAD_MINUTES minutes and hasn't already started or been dismissed today.
function findUpcomingClassAlert(){
  if(!bellTimes || !Array.isArray(bellTimes.periods) || !bellTimes.periods.length) return null;
  const now = new Date();
  const dayStr = now.toISOString().slice(0,10);
  const nowMins = now.getHours()*60 + now.getMinutes();
  const dismissed = classAlertDismissedSet();
  let best = null;
  bellTimes.periods.forEach(period=>{
    if(!period.start) return;
    const [h,m] = period.start.split(':').map(Number);
    if(isNaN(h) || isNaN(m)) return;
    const startMins = h*60 + m;
    const diff = startMins - nowMins;
    if(diff < 0 || diff > CLASS_ALERT_LEAD_MINUTES) return;
    if(dismissed.has(classAlertKeyFor(period, dayStr))) return;
    if(!best || diff < best.diff) best = { period, diff };
  });
  return best;
}
function checkUpcomingClassAlert(){
  const bar = document.getElementById('classAlertBar');
  const textEl = document.getElementById('classAlertText');
  if(!bar || !textEl) return;
  if(!currentUser || currentUser.role==='parent'){ bar.style.display = 'none'; return; }
  const match = findUpcomingClassAlert();
  if(!match){ bar.style.display = 'none'; return; }
  const { period, diff } = match;
  const dayStr = new Date().toISOString().slice(0,10);
  bar.dataset.alertKey = classAlertKeyFor(period, dayStr);
  const label = period.label || 'Your next period';
  textEl.textContent = diff<=0
    ? `${label} is starting now (${period.start}).`
    : `${label} starts in ${diff} minute${diff===1?'':'s'} (at ${period.start}).`;
  bar.style.display = 'flex';
}
function startClassAlertWatcher(){
  loadBellTimes();
  checkUpcomingClassAlert();
  clearInterval(classAlertTimer);
  classAlertTimer = setInterval(checkUpcomingClassAlert, 20*1000);
}
function stopClassAlertWatcher(){
  clearInterval(classAlertTimer);
  const bar = document.getElementById('classAlertBar');
  if(bar) bar.style.display = 'none';
}

/* ========== SCHOOL ADMIN STRUCTURE ==========
   Set once by the Admin — the school's administrative hierarchy (Principal, Vice Principals,
   Coordinators, etc.) with Name / Position / optional Section-Notes. Shown read-only to every
   user. Synced through the same Firebase document as the rest of the app's data. */
let adminStructure = { members: [] };
const ADMIN_STRUCTURE_LS_KEY = 'adminStructure_v1';
let adminStructureStaged = []; // rows being edited before Save; touching Cancel/close doesn't affect live data
let adminStructureRowSeq = 0;

function normalizeAdminStructure(data){
  if(!data || !Array.isArray(data.members)) data = { members: [] };
  data.members.forEach(m=>{
    if(!m.name) m.name = '';
    if(!m.position) m.position = '';
    if(!m.section) m.section = '';
    if(!m.stage) m.stage = '';
  });
  return data;
}

function loadAdminStructure(){
  try{
    const raw = localStorage.getItem(ADMIN_STRUCTURE_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed) adminStructure = parsed;
    }
  }catch(err){ console.warn('Could not load School Admin Structure', err); }
  normalizeAdminStructure(adminStructure);
}

function saveAdminStructureLocalOnly(){
  try{ localStorage.setItem(ADMIN_STRUCTURE_LS_KEY, JSON.stringify(adminStructure)); }
  catch(err){ console.warn('Could not save School Admin Structure', err); }
}

function renderAdminStructureRows(){
  const container = document.getElementById('adminStructureRowsContainer');
  if(!container) return;
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  if(!adminStructureStaged.length){
    container.innerHTML = `<p class="foot-note" style="padding:8px 2px;">${isAdmin ? 'No members yet — click "＋ Add Member" to start.' : 'The admin structure has not been set yet.'}</p>`;
    return;
  }
  container.innerHTML = adminStructureStaged.map((row,idx)=>`
    <div class="exam-sched-row" style="display:flex;gap:10px;align-items:center;padding:4px 2px;">
      <div style="flex:1.3;">
        <input type="text" value="${(row.name||'').replace(/"/g,'&quot;')}" placeholder="e.g. Ahmed Mohamed"
          oninput="updateAdminStructureRow(${idx},'name',this.value)" ${isAdmin ? '' : 'disabled'}
          style="border:1.5px solid var(--border);border-radius:8px;padding:7px 9px;font-family:'Tajawal';font-size:13.5px;width:100%;">
      </div>
      <div style="flex:1.3;">
        <input type="text" value="${(row.position||'').replace(/"/g,'&quot;')}" placeholder="e.g. Principal"
          oninput="updateAdminStructureRow(${idx},'position',this.value)" ${isAdmin ? '' : 'disabled'}
          style="border:1.5px solid var(--border);border-radius:8px;padding:7px 9px;font-family:'Tajawal';font-size:13.5px;width:100%;">
      </div>
      <div style="flex:1;">
        <select onchange="updateAdminStructureRow(${idx},'section',this.value)" ${isAdmin ? '' : 'disabled'}
          style="border:1.5px solid var(--border);border-radius:8px;padding:7px 9px;font-family:'Tajawal';font-size:13.5px;width:100%;">
          <option value="" ${!row.section ? 'selected':''}>All Sections</option>
          ${Object.keys(SECTIONS).map(sid=> `<option value="${sid}" ${row.section===sid?'selected':''}>${SECTIONS[sid].label}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;">
        <select onchange="updateAdminStructureRow(${idx},'stage',this.value)" ${isAdmin ? '' : 'disabled'}
          style="border:1.5px solid var(--border);border-radius:8px;padding:7px 9px;font-family:'Tajawal';font-size:13.5px;width:100%;">
          <option value="" ${!row.stage ? 'selected':''}>All Stages</option>
          ${Object.keys(STAGES).map(sid=> `<option value="${sid}" ${row.stage===sid?'selected':''}>${STAGES[sid].label}</option>`).join('')}
        </select>
      </div>
      <div style="width:56px;text-align:center;display:flex;gap:6px;align-items:center;justify-content:center;">
        ${isAdmin ? `
          <span title="Move up" style="cursor:${idx===0?'default':'pointer'};opacity:${idx===0?0.3:1};font-weight:800;" onclick="moveAdminStructureRow(${idx},-1)">↑</span>
          <span title="Move down" style="cursor:${idx===adminStructureStaged.length-1?'default':'pointer'};opacity:${idx===adminStructureStaged.length-1?0.3:1};font-weight:800;" onclick="moveAdminStructureRow(${idx},1)">↓</span>
          <span title="Remove this member" style="cursor:pointer;color:var(--red);font-weight:800;" onclick="removeAdminStructureRow(${idx})">×</span>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function updateAdminStructureRow(idx, field, value){
  if(!currentUser || currentUser.role!=='admin') return;
  if(!adminStructureStaged[idx]) return;
  adminStructureStaged[idx][field] = value;
}

function addAdminStructureRow(){
  if(!currentUser || currentUser.role!=='admin') return;
  adminStructureStaged.push({ id:'as'+(adminStructureRowSeq++), name:'', position:'', section:'', stage:'' });
  renderAdminStructureRows();
}

function removeAdminStructureRow(idx){
  if(!currentUser || currentUser.role!=='admin') return;
  adminStructureStaged.splice(idx,1);
  renderAdminStructureRows();
}

function moveAdminStructureRow(idx, dir){
  if(!currentUser || currentUser.role!=='admin') return;
  const newIdx = idx + dir;
  if(newIdx<0 || newIdx>=adminStructureStaged.length) return;
  const [row] = adminStructureStaged.splice(idx,1);
  adminStructureStaged.splice(newIdx,0,row);
  renderAdminStructureRows();
}

function openAdminStructureModal(){
  loadAdminStructure();
  adminStructureStaged = (adminStructure.members||[]).map(m=> ({ id:'as'+(adminStructureRowSeq++), name:m.name||'', position:m.position||'', section:m.section||'', stage:m.stage||'' }));
  renderAdminStructureRows();
  const statusEl = document.getElementById('adminStructureStatus');
  if(statusEl) statusEl.textContent = (currentUser && currentUser.role==='admin')
    ? ''
    : 'Only the Admin can edit the School Admin Structure — you can view it here, but the fields are read-only.';
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  const addBtn = document.getElementById('adminStructureAddRowBtn');
  if(addBtn) addBtn.style.display = isAdmin ? '' : 'none';
  const saveBtn = document.getElementById('adminStructureSaveBtn');
  if(saveBtn) saveBtn.style.display = isAdmin ? '' : 'none';
  document.getElementById('adminStructureOverlay').classList.add('show');
}

function closeAdminStructureModal(){
  document.getElementById('adminStructureOverlay').classList.remove('show');
}

function saveAdminStructure(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can set the School Admin Structure.'); return; }
  for(const row of adminStructureStaged){
    if(!row.name.trim()){
      alert('Please enter a name for every member, or remove the empty row.');
      return;
    }
  }
  adminStructure = { members: adminStructureStaged.map(r=> ({ name:r.name||'', position:r.position||'', section:r.section||'', stage:r.stage||'' })) };
  saveAdminStructureLocalOnly();
  saveStateLocalOnly();
  scheduleGithubPush();
  logActivity('edit', 'Updated School Admin Structure');
  const statusEl = document.getElementById('adminStructureStatus');
  if(statusEl) statusEl.textContent = 'Saved — visible to everyone now.';
}

/* ========== EXAM SCHEDULES ==========
   Set once by the Admin for each Term ▸ Cycle/Final-Exam slot (Term 1: Cycle 1, Cycle 2,
   First Term Exam Schedule — Term 2: Cycle 1, Cycle 2, End-of-Year Exam Schedule) and shown
   read-only to every user. Synced through the same Firebase document as the rest of the
   app's data so every device sees the same schedule. */
const MILS_DEFAULT_FINALEXAM_SCHEDULE = [
  { id:'esr_default_1', subject:'Arabic',           date:'2027-01-12', day:'Monday',    timeFrom:'09:00', timeTo:'11:00', duration:'2:00 Hours', room:'' },
  { id:'esr_default_2', subject:'English O.L.',     date:'2027-01-14', day:'Wednesday', timeFrom:'09:00', timeTo:'11:00', duration:'2:00 Hours', room:'' },
  { id:'esr_default_3', subject:'Math.',             date:'2027-01-18', day:'Sunday',    timeFrom:'09:00', timeTo:'11:00', duration:'2:00 Hours', room:'' },
  { id:'esr_default_4', subject:'Science',           date:'2027-01-20', day:'Tuesday',   timeFrom:'09:00', timeTo:'10:30', duration:'1:30 Hours', room:'' },
  { id:'esr_default_5', subject:'Social Studies',    date:'2027-01-22', day:'Thursday',  timeFrom:'09:00', timeTo:'10:30', duration:'1:30 Hours', room:'' },
  { id:'esr_default_6', subject:'English A.L.',      date:'2027-01-26', day:'Monday',    timeFrom:'09:00', timeTo:'10:30', duration:'1:30 Hours', room:'' },
  { id:'esr_default_7', subject:'Second Language',   date:'2027-01-28', day:'Wednesday', timeFrom:'09:00', timeTo:'10:30', duration:'1:30 Hours', room:'' },
  { id:'esr_default_8', subject:'Religion',          date:'2027-01-30', day:'Saturday',  timeFrom:'09:00', timeTo:'10:00', duration:'1:00 Hour',  room:'' },
  { id:'esr_default_9', subject:'ICT',               date:'2027-02-01', day:'Monday',    timeFrom:'09:00', timeTo:'10:00', duration:'1:00 Hour',  room:'' }
];
// Exam Schedules are set per Section AND per Grade (e.g. English Section — Grade 3 has its
// own schedule, separate from French Section — Grade 3), rather than one shared schedule.
// Shape: examSchedules[term][type]["<sectionId>_<gradeId>"] = [rows].
// A Section+Grade with no custom rows yet falls back to MILS_DEFAULT_FINALEXAM_SCHEDULE for
// the "finalexam" type via getExamScheduleRows() below, so nothing appears broken before the
// Admin has entered each Section/Grade's schedule.
let examSchedules = {
  term1: { cycle1:{}, cycle2:{}, finalexam:{} },
  term2: { cycle1:{}, cycle2:{}, finalexam:{} }
};
const EXAM_SCHEDULES_LS_KEY = 'examSchedules_v1';
// Reference design (Mid-Year Examination Card + Examination Schedule) shown as a preview
// when editing the First Term / End-of-Year Exam Schedule (finalexam type).
const EXAM_SCHEDULE_REFERENCE_IMG = 'assets/images/exam-schedule-reference.jpg';
let examScheduleStaged = []; // rows being edited before Save; touching Cancel/close doesn't affect live data
let examScheduleCurrent = { term:'term1', type:'cycle1', section:null, grade:null };
let examScheduleRowSeq = 0;

const EXAM_SCHEDULE_TYPE_LABELS = {
  cycle1: 'Cycle 1',
  cycle2: 'Cycle 2',
  finalexam_term1: 'First Term Exam Schedule',
  finalexam_term2: 'End-of-Year Exam Schedule'
};

function examScheduleLabel(term, type, section, grade){
  const base = (type==='finalexam')
    ? `${TERM_LABELS[term]} — ${EXAM_SCHEDULE_TYPE_LABELS['finalexam_'+term]}`
    : `${TERM_LABELS[term]} — ${EXAM_SCHEDULE_TYPE_LABELS[type]}`;
  const secLabel = (section && SECTIONS[section]) ? SECTIONS[section].label : '';
  const gLabel = grade ? (GRADE_LABEL_BY_ID[grade] || grade) : '';
  const tail = [secLabel, gLabel].filter(Boolean).join(' — ');
  return tail ? `${base} — ${tail}` : base;
}

// Derives the weekday name from a YYYY-MM-DD date string, e.g. "Monday".
function examScheduleDayFromDate(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr+'T00:00:00');
  if(isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday:'long' });
}

// Derives a "H:MM Hour(s)" duration label from HH:MM "from"/"to" times, matching the
// MILS printed exam-card format (e.g. "2:00 Hours", "1:00 Hour").
function examScheduleDurationFromTimes(fromStr, toStr){
  if(!fromStr || !toStr) return '';
  const [fh, fm] = fromStr.split(':').map(Number);
  const [th, tm] = toStr.split(':').map(Number);
  if([fh,fm,th,tm].some(n=> isNaN(n))) return '';
  let mins = (th*60+tm) - (fh*60+fm);
  if(mins <= 0) return '';
  const h = Math.floor(mins/60), m = mins%60;
  return `${h}:${m.toString().padStart(2,'0')} ${(h===1 && m===0) ? 'Hour' : 'Hours'}`;
}

function normalizeExamSchedules(data){
  const sectionIds = Object.keys(SECTIONS);
  ['term1','term2'].forEach(term=>{
    if(!data[term]) data[term] = { cycle1:{}, cycle2:{}, finalexam:{} };
    ['cycle1','cycle2','finalexam'].forEach(type=>{
      const val = data[term][type];
      if(Array.isArray(val)){
        // Oldest format: a single flat schedule shared by the whole school. Copy it into
        // every Section + Grade so nothing the Admin already entered is lost.
        const migrated = {};
        sectionIds.forEach(sec=> ALL_GRADE_IDS.forEach(gid=> migrated[`${sec}_${gid}`] = val.map(r=>({...r}))));
        data[term][type] = migrated;
        return;
      }
      if(!val || typeof val !== 'object'){ data[term][type] = {}; return; }
      // Interim format: per-Grade only, no Section. Copy each Grade's rows into every
      // Section for that Grade so nothing already entered is lost, then drop the old key.
      Object.keys(val).forEach(key=>{
        if(ALL_GRADE_IDS.includes(key) && Array.isArray(val[key])){
          const rows = val[key];
          sectionIds.forEach(sec=>{
            const newKey = `${sec}_${key}`;
            if(!val[newKey]) val[newKey] = rows.map(r=>({...r}));
          });
          delete val[key];
        }
      });
    });
  });
  return data;
}

function examScheduleKey(section, grade){
  return (section && grade) ? `${section}_${grade}` : null;
}

// Returns the staged rows for one Section+Grade's schedule, falling back to the MILS default
// First Term/End-of-Year schedule when that Section+Grade hasn't had its own rows set yet.
function getExamScheduleRows(term, type, section, grade){
  const key = examScheduleKey(section, grade);
  if(!key) return [];
  const forType = examSchedules[term] && examSchedules[term][type];
  const custom = forType && forType[key];
  if(Array.isArray(custom)) return custom.map(r=>({...r}));
  if(type==='finalexam') return MILS_DEFAULT_FINALEXAM_SCHEDULE.map(r=>({...r}));
  return [];
}

function loadExamSchedules(){
  try{
    const raw = localStorage.getItem(EXAM_SCHEDULES_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.term1 && parsed.term2) examSchedules = parsed;
    }
  }catch(err){ console.warn('Could not load Exam Schedules', err); }
  normalizeExamSchedules(examSchedules);
}

function saveExamSchedulesLocalOnly(){
  try{ localStorage.setItem(EXAM_SCHEDULES_LS_KEY, JSON.stringify(examSchedules)); }
  catch(err){ console.warn('Could not save Exam Schedules', err); }
}

/* ---------- Per-student Seat & Committee Assignments (for the Parent/Student
   Examination Card) — same term/type shape as examSchedules, but each row is
   keyed to an internal student id rather than being a generic exam row. ---------- */
let examSeatAssignments = {
  term1: { cycle1: [], cycle2: [], finalexam: [] },
  term2: { cycle1: [], cycle2: [], finalexam: [] }
};
const EXAM_SEAT_ASSIGNMENTS_LS_KEY = 'examSeatAssignments_v1';

function normalizeExamSeatAssignments(data){
  ['term1','term2'].forEach(term=>{
    if(!data[term]) data[term] = { cycle1:[], cycle2:[], finalexam:[] };
    ['cycle1','cycle2','finalexam'].forEach(type=>{
      if(!Array.isArray(data[term][type])) data[term][type] = [];
    });
  });
  return data;
}

function loadExamSeatAssignments(){
  try{
    const raw = localStorage.getItem(EXAM_SEAT_ASSIGNMENTS_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && parsed.term1 && parsed.term2) examSeatAssignments = parsed;
    }
  }catch(err){ console.warn('Could not load Exam Seat Assignments', err); }
  normalizeExamSeatAssignments(examSeatAssignments);
}

function saveExamSeatAssignmentsLocalOnly(){
  try{ localStorage.setItem(EXAM_SEAT_ASSIGNMENTS_LS_KEY, JSON.stringify(examSeatAssignments)); }
  catch(err){ console.warn('Could not save Exam Seat Assignments', err); }
}

// Sections an Admin/HOS/Teacher may pick from in the Exam Schedule modal — filtered by the
// current user's Section scope (unrestricted for Admin).
function examScheduleSectionOptions(){
  return Object.keys(SECTIONS).filter(id=> scopeSectionAllowed(id)).map(id=> ({ id, label: SECTIONS[id].label }));
}

// Grades an Admin/HOS/Teacher may pick from in the Exam Schedule modal — every Grade the
// current user's Stage scope allows (unrestricted for Admin). Parents/Students get a
// different, per-child list built directly in openExamScheduleModal().
function examScheduleGradeOptions(){
  const opts = [];
  ['primary','prep','secondary'].forEach(stageKey=>{
    if(!scopeStageAllowed(stageKey)) return;
    STAGES[stageKey].grades.forEach(g=> opts.push(g));
  });
  return opts;
}

function renderExamScheduleSectionSelect(selectedSection, sections){
  const sel = document.getElementById('examScheduleSectionSelect');
  if(!sel) return;
  sel.innerHTML = sections.map(s=> `<option value="${s.id}" ${s.id===selectedSection?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
}

function renderExamScheduleGradeSelect(selectedGrade, grades){
  const sel = document.getElementById('examScheduleGradeSelect');
  if(!sel) return;
  sel.innerHTML = grades.map(g=> `<option value="${g.id}" ${g.id===selectedGrade?'selected':''}>${escapeHtml(g.label)}</option>`).join('');
}

// True while the Grade <select> is actually showing Parent/Student "Section — Grade" combo
// options (their own children's Sections+Grades) instead of a plain Grade list — set in
// openExamScheduleModal(), read by handleExamScheduleGradeSelectChange() below.
let examScheduleParentComboMode = false;

function reloadExamScheduleStagedAndUI(){
  const { term, type, section, grade } = examScheduleCurrent;
  examScheduleStaged = getExamScheduleRows(term, type, section, grade);
  const titleEl = document.getElementById('examScheduleTitle');
  if(titleEl) titleEl.textContent = `📅 ${examScheduleLabel(term, type, section, grade)}`;
  applyExamScheduleReleaseGateForParent(term, section, grade);
  renderExamScheduleRows();
  renderExamSeatCards();
}

// If the current viewer is a Parent/Student and an Exams Schedule Release rule exists for
// this Section+Term+Grade that hasn't fired yet, hide the schedule content and show a
// "comes back on <date/time>" message instead — Admins/staff always see the real data so
// they can prepare it ahead of the release.
function applyExamScheduleReleaseGateForParent(term, section, grade){
  const isParent = !!(currentUser && currentUser.role==='parent');
  if(!isParent || type_isCycle(examScheduleCurrent.type)) return;
  loadExamScheduleReleases();
  const info = examScheduleReleaseInfo(term, section, grade);
  const statusEl = document.getElementById('examScheduleStatus');
  if(!info.visible){
    examScheduleStaged = [];
    if(statusEl){
      statusEl.textContent = `📅 This exam schedule will be available on ${info.rel.releaseDate} at ${info.rel.releaseTime}.`;
    }
  }
}
// finalexam is the only type Exams Schedules Release applies to (Cycle 1/2 aren't exposed
// via the "Exams Schedules" nav tab this feature was requested for).
function type_isCycle(type){ return type==='cycle1' || type==='cycle2'; }

function switchExamScheduleSection(sectionId){
  examScheduleCurrent.section = sectionId || null;
  reloadExamScheduleStagedAndUI();
}

function switchExamScheduleGrade(gradeId){
  examScheduleCurrent.grade = gradeId || null;
  reloadExamScheduleStagedAndUI();
}

// The Grade <select> doubles as a "Section — Grade" combo picker for Parents/Students with
// children across more than one Section/Grade (examScheduleParentComboMode); otherwise it's
// a plain Grade picker paired with the separate Section <select>.
function handleExamScheduleGradeSelectChange(value){
  if(examScheduleParentComboMode){
    const [sec, gid] = (value||'').split('|');
    examScheduleCurrent.section = sec || null;
    examScheduleCurrent.grade = gid || null;
    reloadExamScheduleStagedAndUI();
  }else{
    switchExamScheduleGrade(value);
  }
}

function renderExamScheduleRows(){
  const holder = document.getElementById('examScheduleRowsContainer');
  if(!holder) return;
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  
  // Update View Schedule and Delete buttons visibility
  const viewBtn = document.getElementById('examScheduleViewBtn');
  const deleteBtn = document.getElementById('examScheduleDeleteBtn');
  if(viewBtn || deleteBtn){
    const hasData = examScheduleStaged && examScheduleStaged.length > 0;
    if(viewBtn) viewBtn.style.display = hasData ? '' : 'none';
    if(deleteBtn) deleteBtn.style.display = hasData && isAdmin ? '' : 'none';
  }
  
  if(!examScheduleStaged.length){
    holder.innerHTML = `<p class="foot-note" style="padding:6px 2px;">${isAdmin ? 'No rows yet — click "＋ Add Row" to start.' : 'No exam schedule has been set yet.'}</p>`;
    return;
  }
  const fieldStyle = "border:1.5px solid var(--border);border-radius:8px;padding:7px 8px;font-family:'Tajawal';font-size:12.5px;min-width:0;";
  holder.innerHTML = examScheduleStaged.map(row => `
    <div class="att-excl-add-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;" data-row-id="${row.id}">
      <input type="date" value="${row.date||''}" style="flex:1;${fieldStyle}" ${isAdmin?'':'disabled'} oninput="updateExamScheduleRow('${row.id}','date',this.value)">
      <input type="text" value="${(row.day||'').replace(/"/g,'&quot;')}" placeholder="Day" style="flex:0.9;${fieldStyle}" ${isAdmin?'':'disabled'} oninput="updateExamScheduleRow('${row.id}','day',this.value)">
      <input type="text" value="${(row.subject||'').replace(/"/g,'&quot;')}" placeholder="Subject" style="flex:1.3;${fieldStyle}" ${isAdmin?'':'disabled'} oninput="updateExamScheduleRow('${row.id}','subject',this.value)">
      <input type="time" value="${row.timeFrom||''}" style="flex:0.7;${fieldStyle}" ${isAdmin?'':'disabled'} oninput="updateExamScheduleRow('${row.id}','timeFrom',this.value)">
      <input type="time" value="${row.timeTo||''}" style="flex:0.7;${fieldStyle}" ${isAdmin?'':'disabled'} oninput="updateExamScheduleRow('${row.id}','timeTo',this.value)">
      <input type="text" value="${(row.duration||'').replace(/"/g,'&quot;')}" placeholder="Duration" style="flex:0.9;${fieldStyle}" ${isAdmin?'':'disabled'} oninput="updateExamScheduleRow('${row.id}','duration',this.value)">
      ${isAdmin ? `<button type="button" class="att-excl-chip-x" title="Remove this row" style="width:24px;height:24px;" onclick="removeExamScheduleRow('${row.id}')">×</button>` : `<span style="width:24px;"></span>`}
    </div>
  `).join('');
}

function updateExamScheduleRow(id, field, value){
  const row = examScheduleStaged.find(r=> r.id===id);
  if(!row) return;
  row[field] = value;
  // Auto-fill Day whenever the Date changes, and Duration whenever both times are set —
  // both stay editable afterwards in case the admin needs to override them.
  if(field === 'date'){
    row.day = examScheduleDayFromDate(value);
    renderExamScheduleRows();
    return;
  }
  if(field === 'timeFrom' || field === 'timeTo'){
    row.duration = examScheduleDurationFromTimes(row.timeFrom, row.timeTo);
    renderExamScheduleRows();
  }
}

function addExamScheduleRow(){
  if(!currentUser || currentUser.role!=='admin') return;
  examScheduleRowSeq++;
  examScheduleStaged.push({ id:'esr_'+Date.now()+'_'+examScheduleRowSeq, subject:'', date:'', day:'', timeFrom:'', timeTo:'', duration:'' });
  renderExamScheduleRows();
}

function removeExamScheduleRow(id){
  if(!currentUser || currentUser.role!=='admin') return;
  examScheduleStaged = examScheduleStaged.filter(r=> r.id!==id);
  renderExamScheduleRows();
}

function openExamScheduleModal(term, type){
  loadExamSchedules();
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  const isParent = !!(currentUser && currentUser.role==='parent');
  const sectionWrap = document.getElementById('examScheduleSectionWrap');
  const gradeWrap = document.getElementById('examScheduleGradeWrap');
  const gradeRow = document.getElementById('examScheduleGradeRow');
  const gradeLabelEl = document.getElementById('examScheduleGradeSelectLabel');
  let defaultSection = null, defaultGrade = null;
  examScheduleParentComboMode = false;

  if(isParent){
    // Parent/Student: only offer the Section+Grade combo(s) their own linked child(ren) are
    // actually in — each account only ever sees its own child's schedule, same as the
    // seat/committee card. The Grade select doubles as this combo picker; the Section
    // select is hidden since it's implied by the chosen combo.
    const eff = currentUser.effective;
    const ids = (eff && Array.isArray(eff.studentScope)) ? eff.studentScope : [];
    const flat = allStudentsFlatRaw();
    const comboMap = new Map();
    ids.forEach(id=>{
      const s = flat.find(x=> x.id===id);
      if(!s || !s.section || !s.grade) return;
      const key = `${s.section}|${s.grade}`;
      if(!comboMap.has(key)){
        const secLabel = SECTIONS[s.section] ? SECTIONS[s.section].label : s.section;
        const gLabel = GRADE_LABEL_BY_ID[s.grade] || s.grade;
        comboMap.set(key, { section:s.section, grade:s.grade, label:`${secLabel} — ${gLabel}` });
      }
    });
    const combos = [...comboMap.values()].sort((a,b)=> (GRADE_ORDER[a.grade]??0)-(GRADE_ORDER[b.grade]??0));
    examScheduleParentComboMode = true;
    if(sectionWrap) sectionWrap.style.display = 'none';
    if(gradeLabelEl) gradeLabelEl.textContent = 'Section & Grade';
    const gsel = document.getElementById('examScheduleGradeSelect');
    if(gsel) gsel.innerHTML = combos.map(c=> `<option value="${c.section}|${c.grade}">${escapeHtml(c.label)}</option>`).join('');
    if(gradeWrap) gradeWrap.style.display = combos.length > 1 ? '' : 'none';
    if(gradeRow) gradeRow.style.display = combos.length ? '' : 'none';
    if(combos.length){ defaultSection = combos[0].section; defaultGrade = combos[0].grade; }
  }else{
    if(sectionWrap) sectionWrap.style.display = '';
    if(gradeWrap) gradeWrap.style.display = '';
    if(gradeRow) gradeRow.style.display = '';
    if(gradeLabelEl) gradeLabelEl.textContent = 'Grade';
    const sections = examScheduleSectionOptions();
    defaultSection = (examScheduleCurrent.section && sections.some(s=> s.id===examScheduleCurrent.section))
      ? examScheduleCurrent.section
      : (sections[0] ? sections[0].id : null);
    renderExamScheduleSectionSelect(defaultSection, sections);
    const grades = examScheduleGradeOptions();
    defaultGrade = (examScheduleCurrent.grade && grades.some(g=> g.id===examScheduleCurrent.grade))
      ? examScheduleCurrent.grade
      : (grades[0] ? grades[0].id : null);
    renderExamScheduleGradeSelect(defaultGrade, grades);
  }

  examScheduleCurrent = { term, type, section: defaultSection, grade: defaultGrade };
  document.getElementById('examScheduleTitle').textContent = `📅 ${examScheduleLabel(term, type, defaultSection, defaultGrade)}`;
  examScheduleStaged = getExamScheduleRows(term, type, defaultSection, defaultGrade);
  const statusEl = document.getElementById('examScheduleStatus');
  if(statusEl){
    if(!defaultGrade || !defaultSection) statusEl.textContent = isParent ? 'No child linked to a Section/Grade was found on this account.' : '';
    else statusEl.textContent = isAdmin ? '' : 'Only the Admin can edit this schedule — you can view it here, but the fields are read-only.';
  }
  applyExamScheduleReleaseGateForParent(term, defaultSection, defaultGrade);
  renderExamScheduleRows();
  document.getElementById('examScheduleAddRowBtn').style.display = isAdmin ? '' : 'none';
  document.getElementById('examScheduleSaveBtn').style.display = isAdmin ? '' : 'none';
  // Show View Schedule and Delete buttons if there's data
  const viewBtn = document.getElementById('examScheduleViewBtn');
  const deleteBtn = document.getElementById('examScheduleDeleteBtn');
  if(viewBtn || deleteBtn){
    const hasData = examScheduleStaged && examScheduleStaged.length > 0;
    if(viewBtn) viewBtn.style.display = hasData ? '' : 'none';
    if(deleteBtn) deleteBtn.style.display = hasData && isAdmin ? '' : 'none';
  }
  const subtitleEl = document.getElementById('examScheduleSubtitle');
  if(subtitleEl){
    subtitleEl.textContent = isAdmin
      ? 'Pick a Grade, then set the Date, Day, Subject, and Time (From/To) for each exam (Admin only) — each Grade has its own schedule. Visible to every user in that Grade until the Admin updates it again.'
      : 'View your exam schedule and examination card below.';
  }
  const excelRow = document.getElementById('examScheduleExcelRow');
  if(excelRow) excelRow.style.display = isAdmin ? '' : 'none';
  const seatAdminBox = document.getElementById('examSeatAssignmentAdminBox');
  if(seatAdminBox) seatAdminBox.style.display = isAdmin ? '' : 'none';
  const seatStatusEl = document.getElementById('seatAssignmentStatus');
  if(seatStatusEl) seatStatusEl.textContent = '';
  renderExamSeatCards();
  const refPreview = document.getElementById('examScheduleRefPreview');
  const refImg = document.getElementById('examScheduleRefImg');
  if(refPreview && refImg){
    // The print reference layout is an Admin-only design aid for filling in the schedule —
    // a Parent/Student viewer never needs it, they just see their own Examination Card below.
    if(type === 'finalexam' && isAdmin){
      refImg.src = EXAM_SCHEDULE_REFERENCE_IMG;
      refPreview.style.display = '';
    }else{
      refPreview.style.display = 'none';
    }
  }
  // Close the nav menu that triggered this
  const esm = document.getElementById('examSchedMenu');
  if(esm) esm.classList.remove('open');
  document.querySelectorAll('#examSchedMenu .term-group').forEach(el=> el.classList.remove('open'));
  document.querySelectorAll('#examSchedMenu .term-group-btn').forEach(el=> el.classList.remove('expanded'));
  openExamSchedTermGroup = null;
  document.getElementById('examScheduleOverlay').classList.add('show');
}

function closeExamScheduleModal(){
  document.getElementById('examScheduleOverlay').classList.remove('show');
}

// Excel columns: Date, Day, Subject, Time From, Time To, Duration, Room / Notes — matches
// the manual-entry row fields exactly, so a template downloaded from this modal can be
// edited and re-uploaded here. Day and Duration are pre-filled when possible but left
// editable in the sheet in case of holidays/exceptions.
function downloadExamScheduleTemplate(){
  const { term, type, section, grade } = examScheduleCurrent;
  const rows = examScheduleStaged.length ? examScheduleStaged : [{subject:'',date:'',day:'',timeFrom:'',timeTo:'',duration:'',room:''}];
  const data = rows.map(r=>({
    'Date (YYYY-MM-DD)': r.date || '',
    'Day': r.day || examScheduleDayFromDate(r.date) || '',
    'Subject': r.subject || '',
    'Time From (HH:MM)': r.timeFrom || '',
    'Time To (HH:MM)': r.timeTo || '',
    'Duration': r.duration || examScheduleDurationFromTimes(r.timeFrom, r.timeTo) || '',
    'Room / Notes': r.room || ''
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Exam Schedule');
  XLSX.writeFile(wb, `exam_schedule_${term}_${type}_${section||'section'}_${grade||'grade'}.xlsx`);
}

function handleExamScheduleExcelFile(file){
  if(!file) return;
  if(!currentUser || currentUser.role!=='admin'){
    alert('Only the Admin can upload an Exam Schedule.');
    document.getElementById('examScheduleExcelInput').value = '';
    return;
  }
  if(!examScheduleCurrent.section || !examScheduleCurrent.grade){
    alert('Please select a Section and a Grade first.');
    document.getElementById('examScheduleExcelInput').value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      if(!rows.length){
        alert('The uploaded file has no rows.');
        document.getElementById('examScheduleExcelInput').value = '';
        return;
      }
      // Converts a cell that may come back as a JS Date (Excel date-formatted columns)
      // or a fraction-of-a-day number (Excel time-formatted columns) into a plain string.
      const cellToDateStr = (v)=> (v instanceof Date) ? v.toISOString().slice(0,10) : v.toString().trim();
      const cellToTimeStr = (v)=>{
        if(v instanceof Date) return v.toTimeString().slice(0,5);
        if(typeof v === 'number'){ // Excel time serial (fraction of a day)
          const totalMins = Math.round(v*24*60);
          return `${String(Math.floor(totalMins/60)).padStart(2,'0')}:${String(totalMins%60).padStart(2,'0')}`;
        }
        return v.toString().trim();
      };
      const parsed = rows.map(row=>{
        const subject = (row['Subject'] || row['subject'] || '').toString().trim();
        const dateVal = cellToDateStr(row['Date (YYYY-MM-DD)'] ?? row['Date'] ?? row['date'] ?? '');
        const timeFromVal = cellToTimeStr(row['Time From (HH:MM)'] ?? row['Time From'] ?? row['From'] ?? row['Time (HH:MM)'] ?? row['Time'] ?? row['time'] ?? '');
        const timeToVal = cellToTimeStr(row['Time To (HH:MM)'] ?? row['Time To'] ?? row['To'] ?? '');
        const dayVal = (row['Day'] || row['day'] || '').toString().trim() || examScheduleDayFromDate(dateVal);
        const durationVal = (row['Duration'] || row['duration'] || '').toString().trim() || examScheduleDurationFromTimes(timeFromVal, timeToVal);
        const room = (row['Room / Notes'] || row['Room'] || row['Notes'] || row['room'] || '').toString().trim();
        return {
          id:'esr_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
          subject, date:dateVal, day:dayVal, timeFrom:timeFromVal, timeTo:timeToVal, duration:durationVal, room
        };
      }).filter(r=> r.subject || r.date || r.timeFrom || r.timeTo || r.room);
      if(!parsed.length){
        alert('Could not find any usable rows. Make sure the file has a "Subject" column.');
        document.getElementById('examScheduleExcelInput').value = '';
        return;
      }
      examScheduleStaged = parsed;
      renderExamScheduleRows();
      const statusEl = document.getElementById('examScheduleStatus');
      if(statusEl) statusEl.textContent = `✓ ${parsed.length} row(s) loaded from Excel. Click "Save Schedule" to publish them.`;
    }catch(err){
      console.error(err);
      alert('Could not read the file. Make sure it is a valid Excel file with Date, Day, Subject, Time From, Time To, Duration and Room / Notes columns.');
    }
    document.getElementById('examScheduleExcelInput').value = '';
  };
  reader.readAsArrayBuffer(file);
}

// Reads an uploaded image (a photo/screenshot of a printed or handwritten exam schedule),
// sends it to Claude's vision API, and asks it to return the table as strict JSON so it can
// be dropped straight into examScheduleStaged — the same staging array the Excel importer
// and the manual "+ Add Row" button both feed into. Admin only, same as the Excel importer.
function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result.split(',')[1]);
    reader.onerror = ()=> reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}

async function handleExamScheduleImageFile(file){
  if(!file) return;
  const inputEl = document.getElementById('examScheduleImageInput');
  const statusEl = document.getElementById('examScheduleImageStatus');
  if(!currentUser || currentUser.role!=='admin'){
    alert('Only the Admin can import an Exam Schedule.');
    if(inputEl) inputEl.value = '';
    return;
  }
  if(!examScheduleCurrent.section || !examScheduleCurrent.grade){
    alert('Please select a Section and a Grade first.');
    if(inputEl) inputEl.value = '';
    return;
  }
  if(!file.type || !file.type.startsWith('image/')){
    alert('Please choose an image file (JPG, PNG, etc.).');
    if(inputEl) inputEl.value = '';
    return;
  }
  const btn = document.getElementById('examScheduleImageBtn');
  const originalLabel = btn ? btn.textContent : '';
  if(btn){ btn.textContent = '⏳ Reading image…'; btn.disabled = true; }
  if(statusEl) statusEl.textContent = 'Reading the exam schedule from the image — this can take a few seconds…';
  try{
    const base64Data = await fileToBase64(file);
    const mediaType = file.type;
    const todayStr = new Date().toISOString().slice(0,10);
    const prompt = `You are reading a photo of a school EXAM SCHEDULE table (columns similar to: Date, Day, Subject, Time From, Time To, Duration, Room/Notes — not every column always appears; some schedules only show Date and Subject, or a combined time range like "9:00 - 11:00").
Extract every exam row you can clearly read and return ONLY a raw JSON array (no markdown fences, no commentary, no extra text) where each item has exactly these keys:
"date" (YYYY-MM-DD if a full date with year is visible, otherwise best-effort YYYY-MM-DD assuming the nearest sensible year to ${todayStr}, or "" if no date is shown at all),
"day" ("" if not shown — it will be auto-derived from the date),
"subject" (required — skip any row where you cannot identify a subject/course name),
"timeFrom" (HH:MM 24-hour, "" if not shown),
"timeTo" (HH:MM 24-hour, "" if not shown),
"duration" ("" if not shown — it will be auto-derived from the times when possible),
"room" (room number, hall name, or any other note in that column; "" if none).
If the image is not an exam schedule or no rows can be read, return [].`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    if(!response.ok) throw new Error('API request failed with status ' + response.status);
    const data = await response.json();
    const textBlock = (data.content || []).map(b=> b.text || '').join('\n').trim();
    const cleaned = textBlock.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    let extracted;
    try{ extracted = JSON.parse(cleaned); }
    catch(parseErr){ throw new Error('Could not understand the response from the image reader.'); }
    if(!Array.isArray(extracted) || !extracted.length){
      if(statusEl) statusEl.textContent = '⚠ No exam rows could be read from that image. Try a clearer photo, or add rows manually.';
      return;
    }
    const parsed = extracted.map(row=>{
      const dateVal = (row.date || '').toString().trim();
      const dayVal = (row.day || '').toString().trim() || examScheduleDayFromDate(dateVal);
      const timeFromVal = (row.timeFrom || '').toString().trim();
      const timeToVal = (row.timeTo || '').toString().trim();
      const durationVal = (row.duration || '').toString().trim() || examScheduleDurationFromTimes(timeFromVal, timeToVal);
      const subject = (row.subject || '').toString().trim();
      const room = (row.room || '').toString().trim();
      return {
        id: 'esr_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        subject, date:dateVal, day:dayVal, timeFrom:timeFromVal, timeTo:timeToVal, duration:durationVal, room
      };
    }).filter(r=> r.subject || r.date || r.timeFrom || r.timeTo || r.room);
    if(!parsed.length){
      if(statusEl) statusEl.textContent = '⚠ No exam rows could be read from that image. Try a clearer photo, or add rows manually.';
      return;
    }
    examScheduleStaged = parsed;
    renderExamScheduleRows();
    if(statusEl) statusEl.textContent = `✓ ${parsed.length} row(s) read from the image. Review them below, then click "Save Schedule" to publish.`;
  }catch(err){
    console.error(err);
    if(statusEl) statusEl.textContent = '';
    alert('Could not read the exam schedule from that image. Please try a clearer photo, or use the Excel upload / manual rows instead.');
  }finally{
    if(btn){ btn.textContent = originalLabel; btn.disabled = false; }
    if(inputEl) inputEl.value = '';
  }
}

// Seat & Committee Assignments: Excel columns are Student ID, Seat Number, Committee No.,
// Floor, Section, Room No. — resolved against the Student Database by "STU-####" ID exactly
// like the Parent linking Excel does, then stored against the exam's term/type just like
// examSchedules. Admin only; each Parent/Student sees just their own linked child's row.
function downloadSeatAssignmentTemplate(){
  const { term, type } = examScheduleCurrent;
  loadExamSeatAssignments();
  const list = (examSeatAssignments[term] && examSeatAssignments[term][type]) || [];
  const flat = allStudentsFlatRaw();
  const rows = list.length ? list.map(r=>{
    const s = flat.find(x=> x.id===r.studentId);
    return {
      'Student ID': (s ? s.displayId : r.displayId) || '',
      'Seat Number': r.seatNumber || '',
      'Committee No.': r.committee || '',
      'Floor': r.floor || '',
      'Section': r.section || '',
      'Room No.': r.room || ''
    };
  }) : [{ 'Student ID':'', 'Seat Number':'', 'Committee No.':'', 'Floor':'', 'Section':'', 'Room No.':'' }];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Seat Assignments');
  XLSX.writeFile(wb, `seat_assignments_${term}_${type}.xlsx`);
}

function handleSeatAssignmentExcelFile(file){
  if(!file) return;
  if(!currentUser || currentUser.role!=='admin'){
    alert('Only the Admin can upload Seat & Committee Assignments.');
    document.getElementById('seatAssignmentExcelInput').value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      if(!rows.length){
        alert('The uploaded file has no rows.');
        document.getElementById('seatAssignmentExcelInput').value = '';
        return;
      }
      const flat = allStudentsFlatRaw();
      const idIndex = buildStudentIdIndex(flat);
      const problems = [];
      const parsed = [];
      let viaFallbackCount = 0;
      rows.forEach(row=>{
        const idVal = (row['Student ID'] || row['ID'] || row['Student ID(s)'] || '').toString().trim();
        if(!idVal) return;
        const { matches, viaFallback } = resolveStudentIdToken(idVal, idIndex);
        if(!matches.length){ problems.push(`${idVal}: student not found`); return; }
        if(matches.length>1){ problems.push(`${idVal}: matches more than one student — fix the duplicate ID in Student Database first`); return; }
        if(viaFallback) viaFallbackCount++;
        parsed.push({
          studentId: matches[0].id,
          displayId: matches[0].displayId,
          seatNumber: (row['Seat Number'] || row['Seat No.'] || row['Seat'] || '').toString().trim(),
          committee: (row['Committee No.'] || row['Committee'] || '').toString().trim(),
          floor: (row['Floor'] || '').toString().trim(),
          section: (row['Section'] || '').toString().trim(),
          room: (row['Room No.'] || row['Room'] || '').toString().trim()
        });
      });
      if(!parsed.length){
        alert('Could not find any usable rows with valid Student IDs. Make sure the file has a "Student ID" column matching a student\'s ID from the Student Database (STU-#### or MILS-#### — the last 4 digits are enough).');
        document.getElementById('seatAssignmentExcelInput').value = '';
        return;
      }
      const { term, type } = examScheduleCurrent;
      loadExamSeatAssignments();
      examSeatAssignments[term][type] = parsed;
      saveExamSeatAssignmentsLocalOnly();
      scheduleGithubPush();
      const statusEl = document.getElementById('seatAssignmentStatus');
      if(statusEl){
        statusEl.textContent = `✓ ${parsed.length} seat assignment(s) saved.` +
          (viaFallbackCount ? ` (${viaFallbackCount} matched by last-4-digits — prefix in the file didn't match exactly.)` : '') +
          (problems.length ? ` ${problems.length} issue(s): ${problems.slice(0,5).join('; ')}${problems.length>5 ? '…' : ''}` : '');
      }
      renderExamSeatCards();
    }catch(err){
      console.error(err);
      alert('Could not read the file. Make sure it is a valid Excel file with Student ID, Seat Number, Committee No., Floor, Section and Room No. columns.');
    }
    document.getElementById('seatAssignmentExcelInput').value = '';
  };
  reader.readAsArrayBuffer(file);
}

// Builds ONE combined "Examination Card" — student info + seat/committee/room AND the
// full exam schedule table all inside a single card, matching the MILS reference layout
// (identity panel alongside the schedule table) rather than showing the schedule as a
// separate disconnected block.
function buildExamCardHtml(student, seat, scheduleRows, term, type){
  const s = student;
  const sectionLabel = SECTIONS[s.section] ? SECTIONS[s.section].label : (s.section||'—');
  const gradeObj = STAGES[s.stage] ? STAGES[s.stage].grades.find(g=>g.id===s.grade) : null;
  const gradeLabel = gradeObj ? gradeObj.label : (s.grade||'—');

  let scheduleHtml;
  if(scheduleRows && scheduleRows.length){
    // Group consecutive rows that share the same Date so the Date/Day cells are
    // only printed once (with a rowspan) instead of being repeated on every subject
    // row for days with more than one exam.
    const groups = [];
    scheduleRows.forEach(exam=>{
      const last = groups[groups.length-1];
      if(last && last.date===(exam.date||'') && last.day===(exam.day||'')){
        last.rows.push(exam);
      }else{
        groups.push({ date:exam.date||'', day:exam.day||'', rows:[exam] });
      }
    });
    scheduleHtml = `
      <table class="schedule-table" style="margin:0;">
        <thead>
          <tr>
            <th>Subject</th><th>Date</th><th>Day</th><th>Time From</th><th>Time To</th><th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${groups.map(group=>group.rows.map((exam,i)=>`
            <tr>
              <td><strong>${escapeHtml(exam.subject||'—')}</strong></td>
              ${i===0 ? `<td rowspan="${group.rows.length}">${escapeHtml(group.date||'—')}</td><td rowspan="${group.rows.length}">${escapeHtml(group.day||'—')}</td>` : ''}
              <td>${escapeHtml(exam.timeFrom||'—')}</td>
              <td>${escapeHtml(exam.timeTo||'—')}</td>
              <td>${escapeHtml(exam.duration||'—')}</td>
            </tr>`).join('')).join('')}
        </tbody>
      </table>`;
  }else{
    scheduleHtml = `<p class="foot-note" style="margin:0;">No exam schedule has been published for this class yet.</p>`;
  }

  const seatBlock = seat ? `
          <div style="flex:0 0 130px;background:var(--cert-maroon);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;">
            <div style="font-size:11px;text-transform:uppercase;opacity:.85;">Seat Number</div>
            <div style="font-size:44px;font-weight:800;font-style:italic;line-height:1.2;">${escapeHtml(seat.seatNumber||'—')}</div>
          </div>` : '';

  const venueBlock = seat ? `
          <div style="flex:1;min-width:200px;padding:14px 16px;border-left:1px solid var(--border);">
            <div style="font-family:'Aref Ruqaa',serif;font-weight:700;font-size:16px;color:var(--ink);margin-bottom:6px;">🏫 Examination Venue</div>
            <div style="font-size:13px;line-height:1.7;color:var(--ink-2);">
              <div><b>Committee No.:</b> ${escapeHtml(seat.committee||'—')}</div>
              <div><b>Floor:</b> ${escapeHtml(seat.floor||'—')}</div>
              <div><b>Section:</b> ${escapeHtml(seat.section||'—')}</div>
              <div><b>Room No.:</b> ${escapeHtml(seat.room||'—')}</div>
            </div>
          </div>` : `
          <div style="flex:1;min-width:200px;padding:14px 16px;border-left:1px solid var(--border);display:flex;align-items:center;">
            <p class="foot-note" style="margin:0;">Seat &amp; committee assignment for this exam has not been published yet.</p>
          </div>`;

  return `
      <div style="border:2px solid var(--gold);border-radius:14px;overflow:hidden;margin-bottom:16px;background:var(--paper);box-shadow:var(--shadow);">
        <div style="background:var(--ink);color:#fff;text-align:center;padding:12px;font-family:'Aref Ruqaa',serif;font-weight:700;font-size:19px;letter-spacing:.4px;">🎓 ${escapeHtml(examScheduleLabel(term,type,s.section,s.grade))} — Examination Card</div>
        <div style="display:flex;flex-wrap:wrap;">
          ${seatBlock}
          <div style="flex:1;min-width:200px;padding:14px 16px;">
            <div style="font-family:'Aref Ruqaa',serif;font-weight:700;font-size:16px;color:var(--ink);margin-bottom:6px;">🧑‍🎓 Student Information</div>
            <div style="font-size:13px;line-height:1.7;color:var(--ink-2);">
              <div><b>Name:</b> ${escapeHtml(s.name)}</div>
              <div><b>Student ID:</b> ${escapeHtml(s.displayId||'—')}</div>
              <div><b>Section:</b> ${escapeHtml(sectionLabel)}</div>
              <div><b>Grade:</b> ${escapeHtml(gradeLabel)}</div>
              <div><b>Class:</b> ${escapeHtml(s.classroom||'—')}</div>
              ${s.lang2 && s.lang2!=='-' ? `<div><b>2nd Language:</b> ${escapeHtml(s.lang2)}</div>` : ''}
            </div>
          </div>
          ${venueBlock}
        </div>
        <div style="padding:14px 16px;border-top:1px solid var(--border);">
          ${scheduleHtml}
        </div>
        <div style="background:var(--paper-2);padding:10px 16px;font-size:11.5px;color:var(--ink-soft);border-top:1px solid var(--border);">
          📌 Bring this card with you every exam day • Arrive at least 15 minutes early • No electronic devices allowed • Follow all exam rules and instructions.
        </div>
      </div>`;
}

// Renders the Parent/Student's own "Examination Card" — student info, seat/committee/room
// AND the full exam schedule table, all together in one card. Admin/HOS/Teacher never see
// this block — they get the admin upload box instead (toggled separately in openExamScheduleModal).
function renderExamSeatCards(){
  const container = document.getElementById('examScheduleSeatCardsContainer');
  if(!container) return;
  if(!currentUser || currentUser.role!=='parent' || !examScheduleCurrent){
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  const eff = currentUser.effective;
  const ids = (eff && Array.isArray(eff.studentScope)) ? eff.studentScope : [];
  if(!ids.length){
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  const { term, type } = examScheduleCurrent;
  loadExamSeatAssignments();
  const seatList = (examSeatAssignments[term] && examSeatAssignments[term][type]) || [];
  const flat = allStudentsFlatRaw();
  const cardsHtml = ids.map(sid=>{
    const s = flat.find(x=> x.id===sid);
    if(!s) return '';
    const seat = seatList.find(r=> r.studentId===sid);
    const scheduleRows = getExamScheduleRows(term, type, s.section, s.grade);
    return buildExamCardHtml(s, seat, scheduleRows, term, type);
  }).join('');
  container.innerHTML = cardsHtml;
  container.style.display = cardsHtml ? '' : 'none';
}

function saveExamSchedule(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can set the Exam Schedule.'); return; }
  const { term, type, section, grade } = examScheduleCurrent;
  const key = examScheduleKey(section, grade);
  if(!key){ alert('Please select a Section and a Grade first.'); return; }
  if(!examSchedules[term]) examSchedules[term] = { cycle1:{}, cycle2:{}, finalexam:{} };
  if(!examSchedules[term][type] || Array.isArray(examSchedules[term][type])) examSchedules[term][type] = {};
  examSchedules[term][type][key] = examScheduleStaged.map(r=> ({
    subject:r.subject||'', date:r.date||'', day:r.day||examScheduleDayFromDate(r.date)||'',
    timeFrom:r.timeFrom||'', timeTo:r.timeTo||'',
    duration:r.duration||examScheduleDurationFromTimes(r.timeFrom,r.timeTo)||'',
    room:r.room||''
  }));
  saveExamSchedulesLocalOnly();
  saveStateLocalOnly();
  scheduleGithubPush();
  logActivity('edit', `Updated Exam Schedule — ${examScheduleLabel(term, type, section, grade)}`);
  const statusEl = document.getElementById('examScheduleStatus');
  if(statusEl) statusEl.textContent = `Saved — visible to everyone in ${SECTIONS[section].label} — ${GRADE_LABEL_BY_ID[grade]||grade} now.`;
  
  // Show the View and Delete Schedule buttons after saving
  const viewBtn = document.getElementById('examScheduleViewBtn');
  if(viewBtn) viewBtn.style.display = 'block';
  const deleteBtn = document.getElementById('examScheduleDeleteBtn');
  if(deleteBtn) deleteBtn.style.display = 'block';
}

function openViewExamScheduleModal(){
  const { term, type, section, grade } = examScheduleCurrent;
  if(!term || !type || !section || !grade){
    alert('Please select a Section, Grade, Term and Exam Type first.');
    return;
  }
  
  const key = examScheduleKey(section, grade);
  const scheduleData = examSchedules[term] && examSchedules[term][type] && examSchedules[term][type][key];
  
  if(!scheduleData || !scheduleData.length){
    alert('No exam schedule found for this selection. Please save the schedule first.');
    return;
  }
  
  renderViewExamScheduleModal(term, type, section, grade, scheduleData);
  document.getElementById('viewExamScheduleOverlay').classList.add('show');
}

function closeViewExamScheduleModal(){
  document.getElementById('viewExamScheduleOverlay').classList.remove('show');
}

function deleteExamSchedule(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can delete the Exam Schedule.'); return; }
  const { term, type, section, grade } = examScheduleCurrent;
  const key = examScheduleKey(section, grade);
  if(!key){ alert('Please select a Section and a Grade first.'); return; }
  
  if(!confirm(`Are you sure you want to delete the Exam Schedule for ${SECTIONS[section].label} — ${GRADE_LABEL_BY_ID[grade]||grade}?\n\nThis action cannot be undone.`)){
    return;
  }
  
  // Delete the schedule
  if(examSchedules[term] && examSchedules[term][type] && examSchedules[term][type][key]){
    delete examSchedules[term][type][key];
    saveExamSchedulesLocalOnly();
    saveStateLocalOnly();
    scheduleGithubPush();
    logActivity('delete', `Deleted Exam Schedule — ${examScheduleLabel(term, type, section, grade)}`);
    
    const statusEl = document.getElementById('examScheduleStatus');
    if(statusEl) statusEl.textContent = `✓ Schedule deleted. Please add a new one or refresh the page.`;
    
    // Hide the View and Delete buttons
    const viewBtn = document.getElementById('examScheduleViewBtn');
    if(viewBtn) viewBtn.style.display = 'none';
    const deleteBtn = document.getElementById('examScheduleDeleteBtn');
    if(deleteBtn) deleteBtn.style.display = 'none';
    
    // Clear the staged rows
    examScheduleStaged = [];
    renderExamScheduleTable();
  }
}

function renderViewExamScheduleModal(term, type, section, grade, scheduleData){
  const container = document.getElementById('viewScheduleContainer');
  const sectionLabel = SECTIONS[section] ? SECTIONS[section].label : section;
  const gradeObj = STAGES[Object.keys(STAGES)[0]] ? STAGES[Object.keys(STAGES)[0]].grades.find(g=>g.id===grade) : null;
  const gradeLabel = gradeObj ? gradeObj.label : grade;
  
  let html = `<div class="schedule-view-container">`;
  
  // Header with schedule info
  html += `
    <div class="schedule-header">
      <div class="schedule-header-info">
        <h3>📅 ${escapeHtml(sectionLabel)} — ${escapeHtml(gradeLabel)}</h3>
        <p>Exam ${type.charAt(0).toUpperCase() + type.slice(1)} • Term ${term}</p>
      </div>
      <div style="text-align:right;color:var(--ink-soft);font-size:12px;">
        Generated: ${new Date().toLocaleDateString()}<br>
        Total Exams: ${scheduleData.length}
      </div>
    </div>`;
  
  // Seat Assignments for this Section+Grade, if any have been uploaded
  loadExamSeatAssignments();
  const seatList = (examSeatAssignments[term] && examSeatAssignments[term][type]) || [];
  const flatStudents = allStudentsFlatRaw();
  const seatAssignments = seatList.filter(r => {
    const st = flatStudents.find(s => s.id === r.studentId);
    return st && st.section === section && st.grade === grade;
  });

  if(seatAssignments.length > 0){
    // Each student gets ONE combined card: their info + seat/committee/room AND the full
    // exam schedule embedded together, matching the reference Examination Card layout —
    // not a separate generic table plus separate seat cards.
    html += `<div class="seat-assignment-section">`;
    seatAssignments.forEach(seat => {
      const student = flatStudents.find(s => s.id === seat.studentId);
      if(student){
        html += buildExamCardHtml(student, seat, scheduleData, term, type);
      }
    });
    html += `</div>`;
  } else if(scheduleData.length > 0){
    // No seat assignments uploaded yet for this class — fall back to the plain class-wide
    // schedule table so the Admin can still confirm what was saved.
    html += `
      <table class="schedule-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Date</th>
            <th>Day</th>
            <th>Time From</th>
            <th>Time To</th>
            <th>Duration</th>
            <th>Room / Notes</th>
          </tr>
        </thead>
        <tbody>`;
    
    scheduleData.forEach((exam, idx) => {
      html += `
        <tr>
          <td><strong>${escapeHtml(exam.subject||'—')}</strong></td>
          <td>${escapeHtml(exam.date||'—')}</td>
          <td>${escapeHtml(exam.day||'—')}</td>
          <td>${escapeHtml(exam.timeFrom||'—')}</td>
          <td>${escapeHtml(exam.timeTo||'—')}</td>
          <td>${escapeHtml(exam.duration||'—')}</td>
          <td>${escapeHtml(exam.room||'—')}</td>
        </tr>`;
    });
    
    html += `</tbody></table>
    <p class="foot-note" style="margin-top:8px;">No seat &amp; committee assignments uploaded yet for this class — showing the schedule only.</p>`;
  } else {
    html += `<div class="schedule-empty">No exam schedule data available.</div>`;
  }
  
  // Print/Export buttons
  html += `
    <div class="schedule-print-btn">
      <button onclick="printViewExamSchedule()">🖨 Print Schedule</button>
      <button onclick="exportViewExamScheduleCSV()">⇩ Export as CSV</button>
    </div>`;
  
  html += `</div>`;
  
  container.innerHTML = html;
}

function printViewExamSchedule(){
  // Printing via a popup window (window.open) is unreliable — many browsers/webviews
  // silently block the popup, so nothing ever appears and print() never fires.
  // Instead, print the modal in place: a body class + matching @media print rules
  // (see .printing-exam-schedule above) hide everything else and show only the
  // schedule content, then we call window.print() directly on the current page.
  document.body.classList.add('printing-exam-schedule');
  const cleanup = () => document.body.classList.remove('printing-exam-schedule');
  window.addEventListener('afterprint', cleanup, { once:true });
  setTimeout(() => {
    window.print();
    // Fallback in case 'afterprint' doesn't fire in some browsers/webviews.
    setTimeout(cleanup, 1000);
  }, 50);
}

function exportViewExamScheduleCSV(){
  const { term, type, section, grade } = examScheduleCurrent;
  const key = examScheduleKey(section, grade);
  const scheduleData = examSchedules[term] && examSchedules[term][type] && examSchedules[term][type][key];
  
  if(!scheduleData || !scheduleData.length) return;
  
  const sectionLabel = SECTIONS[section] ? SECTIONS[section].label : section;
  const gradeObj = STAGES[Object.keys(STAGES)[0]] ? STAGES[Object.keys(STAGES)[0]].grades.find(g=>g.id===grade) : null;
  const gradeLabel = gradeObj ? gradeObj.label : grade;
  
  let csv = `Exam Schedule - ${sectionLabel} - ${gradeLabel}\n`;
  csv += `Term: ${term}, Type: ${type}\n`;
  csv += `Generated: ${new Date().toLocaleString()}\n\n`;
  csv += `Subject,Date,Day,Time From,Time To,Duration,Room/Notes\n`;
  
  scheduleData.forEach(exam => {
    csv += `"${exam.subject||''}","${exam.date||''}","${exam.day||''}","${exam.timeFrom||''}","${exam.timeTo||''}","${exam.duration||''}","${exam.room||''}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Exam_Schedule_${sectionLabel}_${gradeLabel}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
}

/* ========== BLOCKED STUDENTS ========== */
let blockedStudentIds = [];
const BLOCKED_STUDENTS_LS_KEY = 'blockedStudentIds';

function loadBlockedStudentsLocalOnly(){
  try{
    const raw = localStorage.getItem(BLOCKED_STUDENTS_LS_KEY);
    blockedStudentIds = raw ? JSON.parse(raw) : [];
  }catch(err){ console.warn('Could not load Blocked Students', err); blockedStudentIds = []; }
}

function saveBlockedStudentsLocalOnly(){
  try{ localStorage.setItem(BLOCKED_STUDENTS_LS_KEY, JSON.stringify(blockedStudentIds)); }
  catch(err){ console.warn('Could not save Blocked Students', err); }
}

// True when the currently logged-in Parent/Student account is linked to a
// student who has been checked in the Blocked Students list. Admin, HOS, HOD
// and Teacher accounts are never affected by this — only the student's own
// Parent/Student login is gated.
function isViewerAccountBlocked(){
  if(!currentUser || currentUser.role!=='parent') return false;
  const scope = currentUser.effective && currentUser.effective.studentScope;
  if(!Array.isArray(scope) || !scope.length) return false;
  return scope.some(id=> blockedStudentIds.includes(id));
}

function openBlockedStudentsModal(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only Admin can manage Blocked Students.'); return; }
  loadBlockedStudentsLocalOnly();
  const search = document.getElementById('bsSearch');
  if(search) search.value = '';
  renderBlockedStudentsPicker();
  document.getElementById('blockedStudentsOverlay').classList.add('show');
}

function closeBlockedStudentsModal(){
  document.getElementById('blockedStudentsOverlay').classList.remove('show');
}

function renderBlockedStudentsPicker(){
  const wrap = document.getElementById('bsStudentsWrap');
  if(!wrap) return;
  const q = (document.getElementById('bsSearch').value||'').trim().toLowerCase();
  let list = allStudentsFlatRaw();
  if(q) list = list.filter(s=> s.name.toLowerCase().includes(q) || (s.displayId||'').toLowerCase().includes(q));
  list.sort((a,b)=> a.name.localeCompare(b.name));
  wrap.innerHTML = list.map(s=>{
    const sectionLabel = SECTIONS[s.section] ? SECTIONS[s.section].label : s.section;
    const gradeObj = STAGES[s.stage] ? STAGES[s.stage].grades.find(g=>g.id===s.grade) : null;
    const gradeLabel = gradeObj ? gradeObj.label : s.grade;
    const where = [sectionLabel, gradeLabel, s.classroom].filter(Boolean).join(' / ');
    const label = `${s.name}${s.displayId?` (${s.displayId})`:''} — ${where}`;
    const checked = blockedStudentIds.includes(s.id) ? 'checked' : '';
    return `<label class="perm-check"><input type="checkbox" value="${s.id}" onchange="toggleBlockedStudent('${s.id}', this.checked)" ${checked}> ${escapeHtml(label)}</label>`;
  }).join('') || `<p class="foot-note">No matching students found.</p>`;
  updateBlockedStudentsNote();
}

function updateBlockedStudentsNote(){
  const note = document.getElementById('bsSelectedNote');
  if(note){
    note.textContent = blockedStudentIds.length
      ? `${blockedStudentIds.length} student(s) blocked — their Parent/Student account will see "Account is NOT active" and no tab at all.`
      : 'No students blocked yet.';
  }
  renderBlockedStudentsChips();
}

// Small removable-chip summary (same visual pattern as the attendance "excluded
// day" chips) so the Admin can see, at a glance, every student currently
// blocked — even ones filtered out of view by the search box above — and
// unblock them with one click without having to search each one back up.
function renderBlockedStudentsChips(){
  const chipsWrap = document.getElementById('bsBlockedChips');
  const countEl = document.getElementById('bsBlockedCount');
  if(countEl) countEl.textContent = blockedStudentIds.length;
  if(!chipsWrap) return;
  if(!blockedStudentIds.length){
    chipsWrap.innerHTML = `<p class="foot-note" style="margin:0;">No students blocked yet.</p>`;
    return;
  }
  const all = allStudentsFlatRaw();
  const byId = {};
  all.forEach(s=> byId[s.id]=s);
  chipsWrap.innerHTML = blockedStudentIds.map(id=>{
    const s = byId[id];
    const label = s ? `${s.name}${s.displayId?` (${s.displayId})`:''}` : id;
    return `<span class="att-excl-chip">🚫 ${escapeHtml(label)}<button type="button" class="att-excl-chip-x" title="Unblock this student" onclick="toggleBlockedStudent('${id}', false); renderBlockedStudentsPicker();">×</button></span>`;
  }).join('');
}

function toggleBlockedStudent(id, checked){
  if(checked){
    if(!blockedStudentIds.includes(id)) blockedStudentIds.push(id);
  } else {
    blockedStudentIds = blockedStudentIds.filter(x=> x!==id);
  }
  updateBlockedStudentsNote();
}

function saveBlockedStudents(){
  saveBlockedStudentsLocalOnly();
  scheduleGithubPush();
  logActivity('edit', `Updated Blocked Students list (${blockedStudentIds.length} blocked)`);
  closeBlockedStudentsModal();
}

/* ========== GRADE ENTRY CONTROL ========== */
// v2: a list of independent lock "rules" instead of one all-or-nothing switch.
// Each rule can target all accounts / specific accounts / every teacher assigned to
// chosen subject(s); can be scoped to one or more Mark Entry items (First Month,
// Second Month, Total Coursework, Exam Paper) instead of always locking everything;
// and can start immediately or at a scheduled date/time, with an optional automatic
// unlock date/time. v1 ("lock all" / "lock these usernames", always-on, all items)
// is migrated into an equivalent rule the first time this loads.
const GRADE_ENTRY_LOCK_CFG_LS_KEY = 'gradeEntryLockConfig_v2';
const GRADE_ENTRY_LOCK_CFG_LEGACY_KEY = 'gradeEntryLockConfig_v1';

const GE_MARK_ITEMS = [
  { id:'month1',    label:'First Month Mark Entry' },
  { id:'month2',    label:'Second Month Mark Entry' },
  { id:'coursework', label:'Total Coursework Mark Entry' },
  { id:'examPaper', label:'Exam Paper (Term Total)' }
];

let gradeEntryLockRules = [];        // saved rules
let stagedGradeEntryLockRules = [];  // working copy edited inside the modal
let geRuleDraft = null;              // rule currently being built/edited in the sub-form (or null)

function newGeRuleId(){ return 'ge_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function normalizeGradeEntryLockRule(r){
  r = (r && typeof r==='object') ? r : {};
  const target = ['all','users','subjects'].includes(r.target) ? r.target : 'users';
  return {
    id: r.id || newGeRuleId(),
    target,
    usernames: Array.isArray(r.usernames) ? [...new Set(r.usernames.map(u=>(u||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)) : [],
    subjects: Array.isArray(r.subjects) ? [...new Set(r.subjects.map(s=>(s||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)) : [],
    items: Array.isArray(r.items) ? r.items.filter(i=> GE_MARK_ITEMS.some(m=>m.id===i)) : [],
    startAt: r.startAt || '',
    endAt: r.endAt || '',
    note: (r.note||'').trim(),
    createdBy: r.createdBy || (currentUser ? currentUser.username : ''),
    createdAt: r.createdAt || new Date().toISOString()
  };
}
function normalizeGradeEntryLockRules(list){
  return Array.isArray(list) ? list.map(normalizeGradeEntryLockRule) : [];
}

// Turns the old single-switch shape ({enabledForAll, usernames}) into one equivalent
// rule so accounts/schools that already saved a v1 config keep behaving the same way.
function migrateLegacyGradeEntryLockConfig(raw){
  if(!raw || typeof raw!=='object') return [];
  if(raw.enabledForAll){
    return [normalizeGradeEntryLockRule({ target:'all', note:'Migrated from previous version' })];
  }
  if(Array.isArray(raw.usernames) && raw.usernames.length){
    return [normalizeGradeEntryLockRule({ target:'users', usernames:raw.usernames, note:'Migrated from previous version' })];
  }
  return [];
}

function loadGradeEntryLockConfig(){
  try{
    const raw = localStorage.getItem(GRADE_ENTRY_LOCK_CFG_LS_KEY);
    if(raw){
      gradeEntryLockRules = normalizeGradeEntryLockRules(JSON.parse(raw));
      return;
    }
    const legacyRaw = localStorage.getItem(GRADE_ENTRY_LOCK_CFG_LEGACY_KEY);
    gradeEntryLockRules = legacyRaw ? migrateLegacyGradeEntryLockConfig(JSON.parse(legacyRaw)) : [];
  }catch(err){
    console.warn('Could not load Grade Entry Control', err);
    gradeEntryLockRules = [];
  }
}

function saveGradeEntryLockConfigLocalOnly(){
  try{ localStorage.setItem(GRADE_ENTRY_LOCK_CFG_LS_KEY, JSON.stringify(gradeEntryLockRules)); }
  catch(err){ console.warn('Could not save Grade Entry Control', err); }
}

function saveGradeEntryLockConfig(){
  gradeEntryLockRules = normalizeGradeEntryLockRules(gradeEntryLockRules);
  saveGradeEntryLockConfigLocalOnly();
  scheduleGithubPush();
}

// Used when applying a Firebase snapshot or a restored backup file: accepts either the
// current shape (payload.gradeEntryLockRules, an array of rules) or an older payload that
// still only has payload.gradeEntryLockConfig (the pre-rules {enabledForAll, usernames}
// switch), so syncing with / restoring from an older save never throws and never silently
// drops an existing lock.
function gradeEntryLockRulesFromPayload(payload){
  if(!payload) return null;
  if(Array.isArray(payload.gradeEntryLockRules)) return normalizeGradeEntryLockRules(payload.gradeEntryLockRules);
  if(payload.gradeEntryLockConfig) return migrateLegacyGradeEntryLockConfig(payload.gradeEntryLockConfig);
  return null;
}

function usersEligibleForGradeEntryLock(){
  return (users||[]).filter(u=>{
    const eff = getEffectivePermissions(u);
    return !!(eff && eff.grades && eff.edit);
  }).sort((a,b)=> (a.displayName||a.username).localeCompare(b.displayName||b.username));
}

// 'active' = enforced right now | 'scheduled' = will start later | 'expired' = past its auto-unlock time
function geRuleTimingState(rule, now){
  now = now || new Date();
  const start = rule.startAt ? new Date(rule.startAt) : null;
  const end = rule.endAt ? new Date(rule.endAt) : null;
  if(end && !isNaN(end) && now > end) return 'expired';
  if(start && !isNaN(start) && now < start) return 'scheduled';
  return 'active';
}
function isGeRuleEnforcedNow(rule){
  return geRuleTimingState(rule)==='active';
}

function geRuleMatchesUser(rule, user){
  if(!user || !user.username) return false;
  if(rule.target==='all') return true;
  if(rule.target==='users') return rule.usernames.includes(user.username);
  if(rule.target==='subjects'){
    if(!Array.isArray(user.subjects) || !user.subjects.length || !rule.subjects.length) return false;
    const set = rule.subjects.map(s=>s.toLowerCase());
    return user.subjects.some(s=> set.includes(String(s||'').trim().toLowerCase()));
  }
  return false;
}
function geRuleMatchesItem(rule, item){
  if(!rule.items || !rule.items.length) return true; // no items chosen = applies to every Mark Entry screen
  if(!item) return true; // unknown/whole-app context (e.g. bulk tools) — be safe and treat as locked
  return rule.items.includes(item);
}

// Every currently-enforced rule that would lock this user for the given Mark Entry item
// (defaults to whichever item is on-screen right now via academicSubMode()).
function activeGradeEntryLockRulesForUser(user, item){
  const currentItem = item!==undefined ? item : (typeof academicSubMode==='function' ? academicSubMode() : null);
  return (gradeEntryLockRules||[]).filter(rule=> isGeRuleEnforcedNow(rule) && geRuleMatchesUser(rule, user) && geRuleMatchesItem(rule, currentItem));
}

function isGradeEntryLockedForUser(user, item){
  return activeGradeEntryLockRulesForUser(user, item).length > 0;
}

function isCurrentUserGradeEntryLocked(item){
  return isGradeEntryLockedForUser(currentUser, item);
}

function gradeEntryLockAlert(item){
  const hits = activeGradeEntryLockRulesForUser(currentUser, item);
  const itemIds = [...new Set(hits.flatMap(r=> r.items && r.items.length ? r.items : []))];
  if(itemIds.length && !hits.some(r=> !r.items || !r.items.length)){
    const labels = itemIds.map(id=> (GE_MARK_ITEMS.find(m=>m.id===id)||{}).label || id).join(', ');
    alert(`Grade entry is currently locked for your account for: ${labels}. Please contact the system administrator.`);
    return;
  }
  alert('Grade entry is currently locked for your account. Please contact the system administrator.');
}

function openGradeEntryControlModal(){
  if(!currentUser || currentUser.role!=='admin'){
    alert('Only Admin can manage Grade Entry Control.');
    return;
  }
  loadGradeEntryLockConfig();
  stagedGradeEntryLockRules = normalizeGradeEntryLockRules(gradeEntryLockRules);
  closeGeRuleForm();
  renderGradeEntryControlRules();
  document.getElementById('gradeEntryControlOverlay').classList.add('show');
}

function closeGradeEntryControlModal(){
  document.getElementById('gradeEntryControlOverlay').classList.remove('show');
}

function geRuleSummaryText(rule){
  const items = (rule.items && rule.items.length)
    ? rule.items.map(id=> (GE_MARK_ITEMS.find(m=>m.id===id)||{}).label || id).join(', ')
    : 'All Mark Entry items';
  let who;
  if(rule.target==='all') who = 'All grade-entry accounts';
  else if(rule.target==='users') who = `${rule.usernames.length} selected account(s)`;
  else who = rule.subjects.length ? `Teachers of: ${rule.subjects.join(', ')}` : 'Teachers of (no subject picked)';
  return { who, items };
}

function geRuleTimingText(rule){
  const state = geRuleTimingState(rule);
  const startTxt = rule.startAt ? new Date(rule.startAt).toLocaleString() : null;
  const endTxt = rule.endAt ? new Date(rule.endAt).toLocaleString() : null;
  if(state==='scheduled') return { state, text: `Scheduled to start ${startTxt}${endTxt ? ` → auto-unlock ${endTxt}` : ''}` };
  if(state==='expired') return { state, text: `Expired — auto-unlocked ${endTxt}` };
  return { state, text: `Locked now${startTxt ? ` (since ${startTxt})` : ''}${endTxt ? ` → auto-unlock ${endTxt}` : ''}` };
}

// Resolves every currently-enforced rule down to the concrete list of accounts it is
// actually blocking right now (expanding 'all' / 'subjects' targets into real users), so
// the admin can see at a glance who is locked out at this exact moment — not just which
// rules exist. Scheduled and expired rules are ignored here; only 'active' ones count.
function computeActiveGeLockedUsers(){
  const activeRules = (stagedGradeEntryLockRules||[]).filter(isGeRuleEnforcedNow);
  if(!activeRules.length) return [];
  const eligible = usersEligibleForGradeEntryLock();
  const map = new Map(); // username -> { user, items:Set, allItems:boolean }
  eligible.forEach(u=>{
    activeRules.forEach(rule=>{
      if(!geRuleMatchesUser(rule, u)) return;
      const entry = map.get(u.username) || { user:u, items:new Set(), allItems:false };
      if(!rule.items || !rule.items.length) entry.allItems = true;
      else rule.items.forEach(i=> entry.items.add(i));
      map.set(u.username, entry);
    });
  });
  return [...map.values()].sort((a,b)=> (a.user.displayName||a.user.username).localeCompare(b.user.displayName||b.user.username));
}

function renderGeActiveSummary(){
  const wrap = document.getElementById('geActiveSummary');
  if(!wrap) return;
  const locked = computeActiveGeLockedUsers();
  if(!locked.length){
    wrap.innerHTML = `<div class="ge-summary-box ge-summary-empty">✅ No one is locked right now.</div>`;
    return;
  }
  const rows = locked.map(entry=>{
    const scope = entry.allItems
      ? 'All Mark Entry items'
      : [...entry.items].map(id=> (GE_MARK_ITEMS.find(m=>m.id===id)||{}).label || id).join(', ');
    const roleLabel = ROLE_LABELS[entry.user.role] || entry.user.role || 'User';
    return `<div class="ge-summary-row"><span class="ge-summary-name">${escapeHtml(entry.user.displayName||entry.user.username)} <span style="font-weight:500;color:var(--ink-soft);">(${escapeHtml(roleLabel)})</span></span><span class="ge-summary-scope">${escapeHtml(scope)}</span></div>`;
  }).join('');
  wrap.innerHTML = `<div class="ge-summary-box"><div class="ge-summary-head">🔴 Locked right now — ${locked.length} account(s)</div>${rows}</div>`;
}

function renderGradeEntryControlRules(){
  renderGeActiveSummary();
  const wrap = document.getElementById('geRulesList');
  if(!wrap) return;
  if(!stagedGradeEntryLockRules.length){
    wrap.innerHTML = `<p class="ge-empty-note">No lock rules yet. Grade entry is fully open for everyone. Click "➕ Add Lock Rule" to close entry for all accounts, specific accounts, or teachers of a subject.</p>`;
    return;
  }
  wrap.innerHTML = stagedGradeEntryLockRules.map(rule=>{
    const { who, items } = geRuleSummaryText(rule);
    const timing = geRuleTimingText(rule);
    const badgeClass = timing.state==='active' ? 'on' : timing.state;
    const badgeLabel = timing.state==='active' ? 'Locked now' : (timing.state==='scheduled' ? 'Scheduled' : 'Expired');
    return `
      <div class="ge-rule-card">
        <div>
          <div class="ge-rule-title"><span class="ge-rule-badge ${badgeClass}">${badgeLabel}</span>${escapeHtml(who)}</div>
          <div class="ge-rule-meta">
            📋 ${escapeHtml(items)}<br>
            🕒 ${escapeHtml(timing.text)}
            ${rule.note ? `<br>📝 ${escapeHtml(rule.note)}` : ''}
          </div>
        </div>
        <div class="ge-rule-actions">
          <button type="button" title="Edit" onclick="openGeRuleForm('${rule.id}')">✏️</button>
          <button type="button" title="Delete" onclick="deleteGeRule('${rule.id}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function deleteGeRule(id){
  stagedGradeEntryLockRules = stagedGradeEntryLockRules.filter(r=> r.id!==id);
  renderGradeEntryControlRules();
}

/* ---- Rule builder sub-form ---- */
function openGeRuleForm(ruleId){
  const existing = ruleId ? stagedGradeEntryLockRules.find(r=> r.id===ruleId) : null;
  geRuleDraft = existing ? normalizeGradeEntryLockRule(existing) : normalizeGradeEntryLockRule({ target:'users' });

  document.getElementById('geRuleFormTitle').textContent = existing ? 'Edit Lock Rule' : 'New Lock Rule';
  document.getElementById('geRuleUserSearch').value = '';
  document.getElementById('geRuleNote').value = geRuleDraft.note || '';
  document.getElementById('geRuleStartAt').value = geRuleDraft.startAt || '';
  document.getElementById('geRuleEndAt').value = geRuleDraft.endAt || '';
  document.getElementById('geRuleHasEnd').checked = !!geRuleDraft.endAt;
  onGeRuleHasEndToggle(!!geRuleDraft.endAt);
  setGeRuleWhen(geRuleDraft.startAt ? 'scheduled' : 'now', true);

  renderGeRuleSubjectsList();
  renderGeRuleItemsList();
  setGeRuleTarget(geRuleDraft.target);

  document.getElementById('geRuleForm').style.display = 'block';
  document.getElementById('geRuleForm').scrollIntoView({ block:'nearest', behavior:'smooth' });
}

function closeGeRuleForm(){
  geRuleDraft = null;
  const form = document.getElementById('geRuleForm');
  if(form) form.style.display = 'none';
}

function setGeRuleTarget(target){
  if(!geRuleDraft) return;
  geRuleDraft.target = target;
  document.querySelectorAll('.ge-target-btn').forEach(b=> b.classList.toggle('active', b.dataset.target===target));
  document.getElementById('geTargetUsersWrap').style.display = target==='users' ? 'block' : 'none';
  document.getElementById('geTargetSubjectsWrap').style.display = target==='subjects' ? 'block' : 'none';
  if(target==='users') renderGeRuleUsersList();
}

function setGeRuleWhen(when, silent){
  if(!geRuleDraft) return;
  document.querySelectorAll('.ge-when-btn').forEach(b=> b.classList.toggle('active', b.dataset.when===when));
  document.getElementById('geScheduleStartWrap').style.display = when==='scheduled' ? 'block' : 'none';
  if(when==='now' && !silent){
    geRuleDraft.startAt = '';
    document.getElementById('geRuleStartAt').value = '';
  }
}

function onGeRuleHasEndToggle(checked){
  document.getElementById('geScheduleEndWrap').style.display = checked ? 'block' : 'none';
  if(!checked) document.getElementById('geRuleEndAt').value = '';
}

function renderGeRuleUsersList(){
  const wrap = document.getElementById('geRuleUsersList');
  if(!wrap || !geRuleDraft) return;
  const q = (document.getElementById('geRuleUserSearch').value||'').trim().toLowerCase();
  let list = usersEligibleForGradeEntryLock();
  if(q) list = list.filter(u=> (u.username||'').toLowerCase().includes(q) || (u.displayName||'').toLowerCase().includes(q));
  if(!list.length){
    wrap.innerHTML = `<p class="foot-note" style="margin:12px;">No matching grade-entry user found.</p>`;
    return;
  }
  wrap.innerHTML = list.map(u=>{
    const checked = geRuleDraft.usernames.includes(u.username) ? 'checked' : '';
    const roleLabel = ROLE_LABELS[u.role] || u.role || 'User';
    const sectionLabel = u.section && SECTIONS[u.section] ? ` — ${SECTIONS[u.section].label}` : '';
    return `
      <label class="user-item" style="gap:12px;align-items:flex-start;">
        <input type="checkbox" value="${escapeXml(u.username)}" onchange='toggleGeRuleUser(${JSON.stringify(u.username)}, this.checked)' ${checked}>
        <div class="user-info">
          <div class="user-name">${escapeHtml(u.displayName||u.username)}</div>
          <div class="user-role">${escapeHtml(u.username)} — ${escapeHtml(roleLabel + sectionLabel)}</div>
        </div>
      </label>`;
  }).join('');
}
function toggleGeRuleUser(username, checked){
  if(!geRuleDraft) return;
  const set = new Set(geRuleDraft.usernames);
  if(checked) set.add(username); else set.delete(username);
  geRuleDraft.usernames = [...set].sort((a,b)=>a.localeCompare(b));
}

function renderGeRuleSubjectsList(){
  const wrap = document.getElementById('geRuleSubjectsWrap');
  if(!wrap || !geRuleDraft) return;
  const list = (typeof ALL_SUBJECTS!=='undefined' ? ALL_SUBJECTS : []);
  wrap.innerHTML = list.map(s=>{
    const id = 'geSubj_' + s.replace(/[^a-zA-Z0-9]/g,'_');
    const checked = geRuleDraft.subjects.includes(s) ? 'checked' : '';
    return `<label class="perm-check"><input type="checkbox" id="${id}" onchange="toggleGeRuleSubject(${JSON.stringify(s)}, this.checked)" ${checked}> ${escapeHtml(typeof subjectWithIcon==='function' ? subjectWithIcon(s) : s)}</label>`;
  }).join('');
}
function toggleGeRuleSubject(subject, checked){
  if(!geRuleDraft) return;
  const set = new Set(geRuleDraft.subjects);
  if(checked) set.add(subject); else set.delete(subject);
  geRuleDraft.subjects = [...set].sort((a,b)=>a.localeCompare(b));
}

function renderGeRuleItemsList(){
  const wrap = document.getElementById('geRuleItemsWrap');
  if(!wrap || !geRuleDraft) return;
  wrap.innerHTML = GE_MARK_ITEMS.map(m=>{
    const checked = geRuleDraft.items.includes(m.id) ? 'checked' : '';
    return `<label class="perm-check"><input type="checkbox" onchange="toggleGeRuleItem('${m.id}', this.checked)" ${checked}> ${escapeHtml(m.label)}</label>`;
  }).join('');
}
function toggleGeRuleItem(itemId, checked){
  if(!geRuleDraft) return;
  const set = new Set(geRuleDraft.items);
  if(checked) set.add(itemId); else set.delete(itemId);
  geRuleDraft.items = [...set];
}

function commitGeRuleForm(){
  if(!geRuleDraft) return;
  if(geRuleDraft.target==='users' && !geRuleDraft.usernames.length){
    alert('Pick at least one account to lock.');
    return;
  }
  if(geRuleDraft.target==='subjects' && !geRuleDraft.subjects.length){
    alert('Pick at least one subject.');
    return;
  }
  const whenScheduled = document.querySelector('.ge-when-btn[data-when="scheduled"]').classList.contains('active');
  geRuleDraft.startAt = whenScheduled ? (document.getElementById('geRuleStartAt').value || '') : '';
  if(whenScheduled && !geRuleDraft.startAt){
    alert('Pick a start date/time, or switch back to "Lock now".');
    return;
  }
  geRuleDraft.endAt = document.getElementById('geRuleHasEnd').checked ? (document.getElementById('geRuleEndAt').value || '') : '';
  geRuleDraft.note = document.getElementById('geRuleNote').value || '';

  const normalized = normalizeGradeEntryLockRule(geRuleDraft);
  const idx = stagedGradeEntryLockRules.findIndex(r=> r.id===normalized.id);
  if(idx>=0) stagedGradeEntryLockRules[idx] = normalized;
  else stagedGradeEntryLockRules.push(normalized);

  closeGeRuleForm();
  renderGradeEntryControlRules();
}

function saveGradeEntryControl(){
  if(!currentUser || currentUser.role!=='admin'){
    alert('Only Admin can manage Grade Entry Control.');
    return;
  }
  gradeEntryLockRules = normalizeGradeEntryLockRules(stagedGradeEntryLockRules);
  saveGradeEntryLockConfig();
  if(currentUser){
    currentUser.effective = getEffectivePermissions(currentUser);
    applyPermissionsUI();
  }
  if(typeof renderTable==='function') renderTable();
  logActivity('edit', `Updated Grade Entry Control (${gradeEntryLockRules.length} rule(s))`);
  closeGradeEntryControlModal();
}

// Scheduled rules need no page reload to kick in / expire: while the Grade Book is open,
// or the Grade Entry Control modal itself is open, re-check every 30s so a scheduled lock
// disables the score inputs (and an auto-unlock re-enables them) without user action.
setInterval(function(){
  if(typeof currentView!=='undefined' && currentView==='grades' && typeof renderTable==='function') renderTable();
  const modal = document.getElementById('gradeEntryControlOverlay');
  if(modal && modal.classList.contains('show')) renderGradeEntryControlRules();
}, 30000);

/* ========== REPORT CARD RELEASE ========== */
let reportCardReleases = [];
const REPORT_CARD_RELEASES_LS_KEY = 'reportCardReleases';

function loadReportCardReleases(){
  try{
    const raw = localStorage.getItem(REPORT_CARD_RELEASES_LS_KEY);
    if(raw) reportCardReleases = JSON.parse(raw);
  }catch(err){ console.warn('Could not load Report Card Releases', err); }
}

function saveReportCardReleases(){
  try{ localStorage.setItem(REPORT_CARD_RELEASES_LS_KEY, JSON.stringify(reportCardReleases)); }
  catch(err){ console.warn('Could not save Report Card Releases', err); }
  scheduleGithubPush();
}

function openReportCardReleaseModal(){
  if(!currentUser || currentUser.role!=='admin'){ 
    alert('Only Admin can manage Report Card Release schedules.'); 
    return; 
  }
  loadReportCardReleases();
  renderReportCardReleaseTable();
  populateRcGradeOptions();
  document.getElementById('reportCardReleaseOverlay').classList.add('show');
}

function closeReportCardReleaseModal(){
  document.getElementById('reportCardReleaseOverlay').classList.remove('show');
}

// Builds the "Section — Term — Grade — Report Card" label used in the notification bell,
// countdown bar and activity log for a stored release record. Grade is optional — when left
// blank the release applies to every Grade in the Section, so the label shows "All Grades".
function reportCardReleaseLabel(rc){
  const sectionLabel = SECTIONS[rc.section] ? SECTIONS[rc.section].label : (rc.section||'');
  const termLabel = TERM_LABELS[rc.termPeriod] || rc.termPeriod || '';
  const typeLabel = CERT_REPORT_TITLES[rc.reportType] || rc.reportType || '';
  const gradeLabel = rc.grade ? (GRADE_LABEL_BY_ID[rc.grade] || rc.grade) : 'All Grades';
  return `${sectionLabel} — ${termLabel} — ${gradeLabel} — ${typeLabel}`;
}

// Repopulates the Grade select with every Grade across all Stages (flat list — Report Card
// Release isn't scoped to a single Stage). Leaving it on "All Grades" (empty value) makes the
// release apply to every Grade in the chosen Section, same as before this field existed.
function populateRcGradeOptions(){
  const sel = document.getElementById('rcGrade');
  if(!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = `<option value="">All Grades</option>` +
    ALL_GRADE_IDS.map(gid=> `<option value="${gid}">${escapeHtml(GRADE_LABEL_BY_ID[gid])}</option>`).join('');
  if(ALL_GRADE_IDS.includes(prevVal)) sel.value = prevVal;
}

// Repopulates the Report Card Type select with only the types that actually exist for the
// chosen Academic Term (reuses the same certReportTypeOptions() the real Certificates
// stepper uses, so this list can never drift out of sync with it).
function populateRcReportTypeOptions(){
  const sel = document.getElementById('rcReportType');
  if(!sel) return;
  const term = document.getElementById('rcTermPeriod').value;
  const prevVal = sel.value;
  if(!term){
    sel.innerHTML = `<option value="">Select Academic Term first</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const opts = certReportTypeOptions(term);
  sel.innerHTML = `<option value="">Select Report Card</option>` +
    opts.map(o=> `<option value="${o.id}">${escapeHtml(o.label)}</option>`).join('');
  if(opts.some(o=>o.id===prevVal)) sel.value = prevVal;
}

function renderReportCardReleaseTable(){
  const tbody = document.getElementById('reportCardReleaseTableBody');
  if(!tbody) return;
  
  if(reportCardReleases.length === 0){
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--ink-soft);">No Report Card Release schedules yet. Add one above.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = reportCardReleases.map((rc, idx) => {
    const now = new Date();
    const releaseDateTime = new Date(rc.releaseDate + 'T' + rc.releaseTime);
    const endDateTime = rc.endDate ? new Date(rc.endDate + 'T' + rc.endTime) : null;
    
    let status = '⏳ Upcoming';
    let statusColor = 'color:var(--ink-soft)';
    
    if(releaseDateTime <= now){
      if(!endDateTime || endDateTime >= now){
        status = '✅ Active';
        statusColor = 'color:var(--green)';
      } else {
        status = '⏹️ Expired';
        statusColor = 'color:var(--ink-soft)';
      }
    }
    
    return `
      <tr>
        <td>${escapeHtml(SECTIONS[rc.section] ? SECTIONS[rc.section].label : rc.section)}</td>
        <td>${escapeHtml(TERM_LABELS[rc.termPeriod] || rc.termPeriod)}</td>
        <td>${rc.grade ? escapeHtml(GRADE_LABEL_BY_ID[rc.grade] || rc.grade) : 'All Grades'}</td>
        <td><b>${escapeHtml(CERT_REPORT_TITLES[rc.reportType] || rc.reportType)}</b></td>
        <td>${rc.releaseDate} ${rc.releaseTime}</td>
        <td>${rc.endDate ? rc.endDate + ' ' + rc.endTime : 'No end date'}</td>
        <td style="${statusColor};font-weight:700;">${status}</td>
        <td>
          <button class="edit-a" onclick="editReportCardRelease(${idx})">Edit</button>
          <button class="del-a" onclick="deleteReportCardRelease(${idx})">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function addReportCardReleaseRow(){
  resetReportCardForm();
  document.getElementById('rcSection').focus();
}

function saveReportCardRelease(){
  const section = document.getElementById('rcSection').value.trim();
  const termPeriod = document.getElementById('rcTermPeriod').value.trim();
  const gradeSel = document.getElementById('rcGrade');
  const grade = gradeSel ? gradeSel.value.trim() : ''; // optional — blank = applies to All Grades
  const reportTypeSel = document.getElementById('rcReportType');
  const reportType = reportTypeSel.value.trim();
  const releaseDate = document.getElementById('rcReleaseDate').value.trim();
  const releaseTime = document.getElementById('rcReleaseTime').value.trim();
  const endDate = document.getElementById('rcEndDate').value.trim();
  const endTime = document.getElementById('rcEndTime').value.trim();
  const notes = document.getElementById('rcNotes').value.trim();
  
  if(!section){ alert('Please select a Section.'); return; }
  if(!termPeriod){ alert('Please select an Academic Term.'); return; }
  if(!reportType){ alert('Please select a Report Card type.'); return; }
  if(!releaseDate){ alert('Please select a Release Date.'); return; }
  if(!releaseTime){ alert('Please select a Release Time.'); return; }
  
  const releaseDateTime = new Date(releaseDate + 'T' + releaseTime);
  if(endDate){
    const endDateTime = new Date(endDate + 'T' + endTime);
    if(endDateTime <= releaseDateTime){
      alert('End date/time must be after Release date/time.'); 
      return; 
    }
  }
  
  const rc = { section, termPeriod, grade, reportType, releaseDate, releaseTime, endDate, endTime, notes };
  reportCardReleases.push(rc);
  reportCardReleases.sort((a,b) => (a.releaseDate + a.releaseTime).localeCompare(b.releaseDate + b.releaseTime));
  
  saveReportCardReleases();
  renderReportCardReleaseTable();
  resetReportCardForm();
  
  logActivity('add', `Added Report Card Release: ${reportCardReleaseLabel(rc)} on ${releaseDate} at ${releaseTime}`);
  refreshHeaderQuickWidgets();
}

function editReportCardRelease(idx){
  if(idx < 0 || idx >= reportCardReleases.length) return;
  const rc = reportCardReleases[idx];
  
  document.getElementById('rcSection').value = rc.section || '';
  document.getElementById('rcTermPeriod').value = rc.termPeriod || '';
  populateRcGradeOptions();
  const gradeSel = document.getElementById('rcGrade');
  if(gradeSel) gradeSel.value = rc.grade || '';
  populateRcReportTypeOptions();
  document.getElementById('rcReportType').value = rc.reportType || '';
  document.getElementById('rcReleaseDate').value = rc.releaseDate;
  document.getElementById('rcReleaseTime').value = rc.releaseTime;
  document.getElementById('rcEndDate').value = rc.endDate || '';
  document.getElementById('rcEndTime').value = rc.endTime || '23:59';
  document.getElementById('rcNotes').value = rc.notes || '';
  
  // Change button to update
  const btn = document.querySelector('button[onclick="saveReportCardRelease()"]');
  if(btn){
    btn.textContent = '✏️ Update Release Schedule';
    btn.onclick = function(){
      deleteReportCardRelease(idx);
      saveReportCardRelease();
      btn.textContent = '💾 Save Release Schedule';
      btn.onclick = function(){ saveReportCardRelease(); };
    };
  }
}

function deleteReportCardRelease(idx){
  if(idx < 0 || idx >= reportCardReleases.length) return;
  if(!confirm('Delete this Report Card Release schedule?')) return;
  
  const rc = reportCardReleases[idx];
  reportCardReleases.splice(idx, 1);
  saveReportCardReleases();
  renderReportCardReleaseTable();
  resetReportCardForm();
  
  logActivity('delete', `Deleted Report Card Release: ${reportCardReleaseLabel(rc)}`);
  refreshHeaderQuickWidgets();
}

function resetReportCardForm(){
  document.getElementById('rcSection').value = '';
  document.getElementById('rcTermPeriod').value = '';
  populateRcGradeOptions();
  populateRcReportTypeOptions();
  document.getElementById('rcReleaseDate').value = '';
  document.getElementById('rcReleaseTime').value = '00:00';
  document.getElementById('rcEndDate').value = '';
  document.getElementById('rcEndTime').value = '23:59';
  document.getElementById('rcNotes').value = '';
  
  const btn = document.querySelector('button[onclick="saveReportCardRelease()"]');
  if(btn){
    btn.textContent = '💾 Save Release Schedule';
    btn.onclick = function(){ saveReportCardRelease(); };
  }
}

// Matches on Section + Academic Term + Report Card type, plus Grade if the record was scheduled
// for a specific Grade. A release saved with "All Grades" (rc.grade blank) still matches every
// Grade, so existing schedules created before this field was added keep working unchanged.
function isReportCardVisible(section, termPeriod, reportType, grade){
  const now = new Date();
  for(let rc of reportCardReleases){
    if(rc.section===section && rc.termPeriod===termPeriod && rc.reportType===reportType && (!rc.grade || rc.grade===grade)){
      const releaseDateTime = new Date(rc.releaseDate + 'T' + rc.releaseTime);
      const endDateTime = rc.endDate ? new Date(rc.endDate + 'T' + rc.endTime) : null;
      
      if(releaseDateTime <= now && (!endDateTime || endDateTime >= now)){
        return true;
      }
    }
  }
  return false;
}

/* ================== EXAMS SCHEDULES RELEASE ==================
   Lets the Admin schedule, per Section + Stage + Grade + Exam Schedule (First Term /
   End-of-Year), the exact date & time a Parent/Student is first allowed to see that exam
   schedule. Mirrors the Report Card Release feature above, but scoped to Section/Stage/Grade
   instead of Section/Term/ReportType, and with no end date (once released, it stays visible). */
let examScheduleReleases = [];
const EXAM_SCHEDULE_RELEASES_LS_KEY = 'examScheduleReleases';

function loadExamScheduleReleases(){
  try{
    const raw = localStorage.getItem(EXAM_SCHEDULE_RELEASES_LS_KEY);
    if(raw) examScheduleReleases = JSON.parse(raw);
  }catch(err){ console.warn('Could not load Exam Schedule Releases', err); }
}

function saveExamScheduleReleasesLocalOnly(){
  try{ localStorage.setItem(EXAM_SCHEDULE_RELEASES_LS_KEY, JSON.stringify(examScheduleReleases)); }
  catch(err){ console.warn('Could not save Exam Schedule Releases', err); }
  scheduleGithubPush();
}

function openExamScheduleReleaseModal(){
  if(!currentUser || currentUser.role!=='admin'){
    alert('Only Admin can manage Exams Schedules Release settings.');
    return;
  }
  loadExamScheduleReleases();
  renderExamScheduleReleaseTable();
  resetExamScheduleReleaseForm();
  document.getElementById('examScheduleReleaseOverlay').classList.add('show');
}

function closeExamScheduleReleaseModal(){
  document.getElementById('examScheduleReleaseOverlay').classList.remove('show');
}

// Builds the "Section — Exam Schedule — Stage — Grade" label used in the table and Activity Log.
function examScheduleReleaseLabel(rel){
  const sectionLabel = SECTIONS[rel.section] ? SECTIONS[rel.section].label : (rel.section||'');
  const termLabel = EXAM_SCHEDULE_TYPE_LABELS['finalexam_'+rel.term] || rel.term || '';
  const stageLabel = STAGES[rel.stage] ? STAGES[rel.stage].label : (rel.stage||'');
  const gradeLabel = GRADE_LABEL_BY_ID[rel.grade] || rel.grade || '';
  return `${sectionLabel} — ${termLabel} — ${stageLabel} — ${gradeLabel}`;
}

// Repopulates the Grade select with only the grades that belong to the chosen Stage.
function populateEsrGradeOptions(){
  const sel = document.getElementById('esrGrade');
  if(!sel) return;
  const stage = document.getElementById('esrStage').value;
  const prevVal = sel.value;
  if(!stage){
    sel.innerHTML = `<option value="">Select Stage first</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const grades = STAGES[stage] ? STAGES[stage].grades : [];
  sel.innerHTML = `<option value="">Select Grade</option>` +
    grades.map(g=> `<option value="${g.id}">${escapeHtml(g.label)}</option>`).join('');
  if(grades.some(g=>g.id===prevVal)) sel.value = prevVal;
}

function renderExamScheduleReleaseTable(){
  const tbody = document.getElementById('examScheduleReleaseTableBody');
  if(!tbody) return;

  if(examScheduleReleases.length === 0){
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--ink-soft);">No Exams Schedules Release schedules yet. Add one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = examScheduleReleases.map((rel, idx) => {
    const now = new Date();
    const releaseDateTime = new Date(rel.releaseDate + 'T' + rel.releaseTime);
    const status = releaseDateTime <= now
      ? { text:'✅ Released', color:'color:var(--green)' }
      : { text:'⏳ Upcoming', color:'color:var(--ink-soft)' };

    return `
      <tr>
        <td>${escapeHtml(SECTIONS[rel.section] ? SECTIONS[rel.section].label : rel.section)}</td>
        <td><b>${escapeHtml(EXAM_SCHEDULE_TYPE_LABELS['finalexam_'+rel.term] || rel.term)}</b></td>
        <td>${escapeHtml(STAGES[rel.stage] ? STAGES[rel.stage].label : rel.stage)}</td>
        <td>${escapeHtml(GRADE_LABEL_BY_ID[rel.grade] || rel.grade)}</td>
        <td>${rel.releaseDate} ${rel.releaseTime}</td>
        <td style="${status.color};font-weight:700;">${status.text}</td>
        <td>
          <button class="edit-a" onclick="editExamScheduleRelease(${idx})">Edit</button>
          <button class="del-a" onclick="deleteExamScheduleRelease(${idx})">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function addExamScheduleReleaseRow(){
  resetExamScheduleReleaseForm();
  document.getElementById('esrSection').focus();
}

function saveExamScheduleRelease(){
  const section = document.getElementById('esrSection').value.trim();
  const term = document.getElementById('esrTerm').value.trim();
  const stage = document.getElementById('esrStage').value.trim();
  const grade = document.getElementById('esrGrade').value.trim();
  const releaseDate = document.getElementById('esrReleaseDate').value.trim();
  const releaseTime = document.getElementById('esrReleaseTime').value.trim();
  const notes = document.getElementById('esrNotes').value.trim();

  if(!section){ alert('Please select a Section.'); return; }
  if(!term){ alert('Please select an Exam Schedule (First Term / End-of-Year).'); return; }
  if(!stage){ alert('Please select a Stage.'); return; }
  if(!grade){ alert('Please select a Grade.'); return; }
  if(!releaseDate){ alert('Please select a Release Date.'); return; }
  if(!releaseTime){ alert('Please select a Release Time.'); return; }

  const rel = { section, term, stage, grade, releaseDate, releaseTime, notes };
  // Replace any existing schedule for the exact same Section+Term+Grade instead of stacking duplicates.
  examScheduleReleases = examScheduleReleases.filter(r=> !(r.section===section && r.term===term && r.grade===grade));
  examScheduleReleases.push(rel);
  examScheduleReleases.sort((a,b) => (a.releaseDate + a.releaseTime).localeCompare(b.releaseDate + b.releaseTime));

  saveExamScheduleReleasesLocalOnly();
  renderExamScheduleReleaseTable();
  resetExamScheduleReleaseForm();

  logActivity('add', `Set Exams Schedule Release: ${examScheduleReleaseLabel(rel)} on ${releaseDate} at ${releaseTime}`);
}

function editExamScheduleRelease(idx){
  if(idx < 0 || idx >= examScheduleReleases.length) return;
  const rel = examScheduleReleases[idx];

  document.getElementById('esrSection').value = rel.section || '';
  document.getElementById('esrTerm').value = rel.term || '';
  document.getElementById('esrStage').value = rel.stage || '';
  populateEsrGradeOptions();
  document.getElementById('esrGrade').value = rel.grade || '';
  document.getElementById('esrReleaseDate').value = rel.releaseDate;
  document.getElementById('esrReleaseTime').value = rel.releaseTime;
  document.getElementById('esrNotes').value = rel.notes || '';

  const btn = document.querySelector('button[onclick="saveExamScheduleRelease()"]');
  if(btn){
    btn.textContent = '✏️ Update Release Schedule';
    btn.onclick = function(){
      deleteExamScheduleRelease(idx, true);
      saveExamScheduleRelease();
      btn.textContent = '💾 Save Release Schedule';
      btn.onclick = function(){ saveExamScheduleRelease(); };
    };
  }
}

function deleteExamScheduleRelease(idx, skipConfirm){
  if(idx < 0 || idx >= examScheduleReleases.length) return;
  if(!skipConfirm && !confirm('Delete this Exams Schedule Release schedule?')) return;

  const rel = examScheduleReleases[idx];
  examScheduleReleases.splice(idx, 1);
  saveExamScheduleReleasesLocalOnly();
  renderExamScheduleReleaseTable();
  if(!skipConfirm) resetExamScheduleReleaseForm();

  if(!skipConfirm) logActivity('delete', `Deleted Exams Schedule Release: ${examScheduleReleaseLabel(rel)}`);
}

function resetExamScheduleReleaseForm(){
  document.getElementById('esrSection').value = '';
  document.getElementById('esrTerm').value = '';
  document.getElementById('esrStage').value = '';
  populateEsrGradeOptions();
  document.getElementById('esrReleaseDate').value = '';
  document.getElementById('esrReleaseTime').value = '00:00';
  document.getElementById('esrNotes').value = '';

  const btn = document.querySelector('button[onclick="saveExamScheduleRelease()"]');
  if(btn){
    btn.textContent = '💾 Save Release Schedule';
    btn.onclick = function(){ saveExamScheduleRelease(); };
  }
}

// Matches on the exact Section + Exam Schedule (term) + Grade. Returns { visible, releaseDate,
// releaseTime } so callers (the Parent-facing Exam Schedule modal) can both gate the content and
// show the person the exact date/time it'll become available, if it's still upcoming.
function examScheduleReleaseInfo(term, section, grade){
  const rel = examScheduleReleases.find(r=> r.term===term && r.section===section && r.grade===grade);
  if(!rel) return { visible:true, rel:null }; // no release rule set for this combo — default to visible (unrestricted)
  const releaseDateTime = new Date(rel.releaseDate + 'T' + rel.releaseTime);
  return { visible: releaseDateTime <= new Date(), rel };
}

/* ================== HEADER QUICK STATS / NOTIFICATIONS / RELEASE COUNTDOWN ==================
   Fills the previously-empty right side of the masthead with three live pieces of
   information: a students / average grade / pending reports summary, a notification
   bell driven by the existing Activity Log, and a slim countdown bar for the nearest
   upcoming Report Card Release. Nothing here is stored separately — it's all derived
   on the fly from students / scores / activityLog / reportCardReleases, so it never
   goes out of sync with the rest of the app. */

function computeAverageGradePct(){
  let sumPct = 0, cnt = 0;
  Object.keys(scores).forEach(sk=>{
    const stageId = sk.split('|')[1];
    const map = scores[sk] || {};
    Object.values(map).forEach(sc=>{
      if(!sc) return;
      const hasData = Object.values(sc).some(v=> v!==null && v!==undefined && v!=='');
      if(!hasData) return;
      let pct;
      if(stageId === 'primary'){
        const t = computePrimaryTotals(sc);
        if(!t.maxTotal) return;
        pct = (t.totalCoursework / t.maxTotal) * 100;
      } else {
        pct = (parseFloat(sc.m1)||0) + (parseFloat(sc.m2)||0) + (parseFloat(sc.mid)||0) + (parseFloat(sc.final)||0);
      }
      if(!isNaN(pct)){ sumPct += pct; cnt++; }
    });
  });
  return cnt ? Math.round((sumPct/cnt)*10)/10 : null;
}

function getUpcomingReportCardReleases(){
  const now = Date.now();
  return (reportCardReleases||[])
    .map(rc=> ({ ...rc, _releaseTs: new Date(rc.releaseDate+'T'+rc.releaseTime).getTime() }))
    .filter(rc=> !isNaN(rc._releaseTs) && rc._releaseTs > now)
    .sort((a,b)=> a._releaseTs - b._releaseTs);
}

function updateQuickStatsWidget(){
  const wrap = document.getElementById('quickStatsWidget');
  const isAdmin = !!(currentUser && currentUser.role==='admin');
  if(wrap) wrap.style.display = isAdmin ? '' : 'none';
  if(!isAdmin) return;
  const elStudents = document.getElementById('qsStudents');
  const elAvg = document.getElementById('qsAvg');
  const elPending = document.getElementById('qsPending');
  if(!elStudents || !elAvg || !elPending) return;

  elStudents.textContent = allStudentsFlat().length;

  const avgPct = computeAverageGradePct();
  elAvg.textContent = (avgPct===null) ? '—' : `${avgPct}%`;

  elPending.textContent = getUpcomingReportCardReleases().length;
}

/* ---------- Notification bell (built on top of the existing Activity Log) ---------- */
const NOTIF_LAST_SEEN_LS_KEY = 'notifBellLastSeen_v1';
const NOTIF_VISIBLE_TYPES = ['add','edit','delete','import','broadcast'];

function getNotifLastSeen(){
  try{ return parseInt(localStorage.getItem(NOTIF_LAST_SEEN_LS_KEY), 10) || 0; }
  catch(err){ return 0; }
}
function setNotifLastSeen(ts){
  try{ localStorage.setItem(NOTIF_LAST_SEEN_LS_KEY, String(ts)); }
  catch(err){}
}
function notifTimeAgo(ts){
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff/60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins/60);
  if(hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours/24);
  return `${days}d ago`;
}
const NOTIF_TYPE_ICONS = { add:'➕', edit:'✏️', delete:'🗑️', import:'📥', broadcast:'📢' };

/* A Parent/Student account only cares about activity log entries that actually touch
   their own linked child (grade edits tagged with studentId/studentIds — see logActivity
   calls in updateScore() and the Excel bulk-upload flow). Everything else (other classes,
   user management, settings…) is noise they were never meant to see. */
function notifEntryMatchesLinkedStudent(entry, studentIds){
  if(!entry || !studentIds || !studentIds.length) return false;
  if(entry.studentId) return studentIds.includes(entry.studentId);
  if(Array.isArray(entry.studentIds)) return entry.studentIds.some(id=> studentIds.includes(id));
  return false;
}
// A manual Admin broadcast (e.g. "Term 2 report cards are now available") is targeted at
// either everyone, one grade, or one class — never a specific student — so it needs its own
// match against whichever grade/classroom the parent's linked child(ren) belong to.
function notifEntryMatchesParentScope(entry, studentIds){
  const scope = entry.scope || { type:'all' };
  if(scope.type==='all') return true;
  if(!studentIds || !studentIds.length) return false;
  const linked = allStudentsFlat().filter(s=> studentIds.includes(s.id));
  if(scope.type==='grade') return linked.some(s=> s.grade===scope.grade);
  if(scope.type==='class') return linked.some(s=> s.classroom===scope.classroom);
  if(scope.type==='section') return linked.some(s=> s.sectionId===scope.sectionId && s.stageId===scope.stageId);
  return false;
}
function notifRelevantLog(){
  if(currentUser && currentUser.role==='parent'){
    const ids = Array.isArray(currentUser.studentIds) ? currentUser.studentIds : [];
    return visibleActivityLog().filter(e=>{
      if(!NOTIF_VISIBLE_TYPES.includes(e.type)) return false;
      if(e.type==='broadcast') return notifEntryMatchesParentScope(e, ids);
      if(!notifEntryMatchesLinkedStudent(e, ids)) return false;
      return isGradeNotifReleasedForParent(ids);
    });
  }
  return visibleActivityLog().filter(e=> NOTIF_VISIBLE_TYPES.includes(e.type));
}

// A raw grade edit fires the instant "A new Cycle grade was recorded for your child"
// notification the moment a teacher touches ANY score field — with no regard for the
// Report Card Release schedule that's supposed to gate when a parent finds out about new
// results. Hold every grade-edit notification back entirely until at least one Report Card
// Release is actually active (its window has started and hasn't ended) for the Section any
// of this parent's linked child(ren) belong to; once the school starts releasing results,
// notifications resume normally. Broadcasts (openNotifyParentsModal) are unaffected — those
// are always a deliberate Admin action, never an instant grade-entry side-effect.
function isGradeNotifReleasedForParent(studentIds){
  if(!studentIds || !studentIds.length) return false;
  const flat = allStudentsFlat();
  const sections = new Set(flat.filter(s=> studentIds.includes(s.id)).map(s=> s.section).filter(Boolean));
  if(!sections.size) return false;
  const now = Date.now();
  return (reportCardReleases||[]).some(rc=>{
    if(!sections.has(rc.section)) return false;
    const releaseTs = new Date(rc.releaseDate+'T'+rc.releaseTime).getTime();
    if(isNaN(releaseTs) || releaseTs > now) return false;
    if(rc.endDate){
      const endTs = new Date(rc.endDate+'T'+(rc.endTime||'23:59')).getTime();
      if(!isNaN(endTs) && endTs < now) return false;
    }
    return true;
  });
}

/* Birthdays get their own "seen today" flag (they have no timestamp to compare
   against getNotifLastSeen, since the same birthday is still "new" every day). */
const NOTIF_BIRTHDAY_SEEN_LS_KEY = 'notifBirthdaySeenDate_v1';
function isBirthdayNotifSeenToday(){
  try{ return localStorage.getItem(NOTIF_BIRTHDAY_SEEN_LS_KEY) === birthdayTodayKey(); }
  catch(err){ return false; }
}
function markBirthdayNotifSeenToday(){
  try{ localStorage.setItem(NOTIF_BIRTHDAY_SEEN_LS_KEY, birthdayTodayKey()); }
  catch(err){}
}

function updateNotifBadge(){
  const badge = document.getElementById('notifBadge');
  const bellBtn = document.getElementById('notifBellBtn');
  if(!badge) return;
  const canSeeBell = !!(currentUser && (currentUser.role==='admin' || currentUser.role==='parent'));
  if(!canSeeBell){ badge.style.display = 'none'; if(bellBtn) bellBtn.classList.remove('has-unread'); return; }
  const lastSeen = getNotifLastSeen();
  const list = notifRelevantLog();
  let unread = list.filter(e=> e.ts > lastSeen).length;
  // Admin gets the full campus-wide birthday feed; a Parent/Student account only
  // gets reminded about their own linked child(ren)'s birthday, never a classmate's.
  const todaysBirthdays = getTodaysBirthdaysForCurrentUser();
  if(todaysBirthdays.length && !isBirthdayNotifSeenToday()) unread += todaysBirthdays.length;
  if(unread > 0){
    badge.style.display = 'flex';
    badge.textContent = unread > 99 ? '99+' : unread;
    if(bellBtn) bellBtn.classList.add('has-unread');
  } else {
    badge.style.display = 'none';
    if(bellBtn) bellBtn.classList.remove('has-unread');
  }
}

function renderNotifDropdown(){
  const holder = document.getElementById('notifList');
  if(!holder) return;
  const isParentBell = !!(currentUser && currentUser.role==='parent');

  let html = '';
  const todaysBirthdays = getTodaysBirthdaysForCurrentUser();
  if(todaysBirthdays.length){
    const names = todaysBirthdays.map(b=> formatBirthdayNameWithClass(b)).join(', ');
    const msg = isParentBell
      ? (todaysBirthdays.length===1 ? `It's <b>${names}</b>'s birthday today! 🎉` : `It's <b>${names}</b>'s birthdays today! 🎉`)
      : (todaysBirthdays.length===1
          ? `<b>${names}</b> has a birthday today`
          : `<b>${todaysBirthdays.length} students</b> have a birthday today: ${names}`);
    html += `
      <div class="notif-item notif-release">
        <div class="notif-row">
          <span class="notif-icon">🎂</span>
          <span class="notif-msg">${msg}</span>
        </div>
      </div>`;
  }

  const upcoming = getUpcomingReportCardReleases();
  if(upcoming.length){
    const rc = upcoming[0];
    const days = Math.max(0, Math.ceil((rc._releaseTs - Date.now()) / 86400000));
    const dayLabel = days === 0 ? 'today' : (days === 1 ? 'in 1 day' : `in ${days} days`);
    html += `
      <div class="notif-item notif-release">
        <div class="notif-row">
          <span class="notif-icon">📊</span>
          <span class="notif-msg"><b>${escapeHtml(reportCardReleaseLabel(rc))}</b> releases ${dayLabel}</span>
        </div>
      </div>`;
  }

  const activityItems = notifRelevantLog().slice(0, 10);
  if(activityItems.length === 0 && upcoming.length === 0 && todaysBirthdays.length === 0){
    holder.innerHTML = isParentBell
      ? `<span class="notif-empty">No new grades for your child yet — you'll see it here as soon as one is entered.</span>`
      : `<span class="notif-empty">No notifications yet.</span>`;
    return;
  }
  html += activityItems.map(e=> {
    const isBroadcast = e.type==='broadcast';
    const icon = isBroadcast ? '📢' : (isParentBell ? '📝' : (NOTIF_TYPE_ICONS[e.type]||'•'));
    const msg = isBroadcast
      ? escapeHtml(e.message||'')
      : (isParentBell ? 'A new Cycle grade was recorded for your child' : escapeHtml(e.message||''));
    return `
    <div class="notif-item">
      <div class="notif-row">
        <span class="notif-icon">${icon}</span>
        <span class="notif-msg">${msg}</span>
      </div>
      <span class="notif-time">${notifTimeAgo(e.ts)}</span>
    </div>`;
  }).join('');

  holder.innerHTML = html || `<span class="notif-empty">No notifications yet.</span>`;
}

function toggleNotifDropdown(e){
  e.stopPropagation();
  if(!currentUser || (currentUser.role!=='admin' && currentUser.role!=='parent')) return;
  const dd = document.getElementById('notifDropdown');
  if(!dd) return;
  const opening = !dd.classList.contains('open');
  dd.classList.toggle('open');
  if(opening){
    renderNotifDropdown();
    setNotifLastSeen(Date.now());
    markBirthdayNotifSeenToday();
    updateNotifBadge();
  }
}

/* ---------- Notify Parents (Admin-only manual broadcast) ----------
   Reuses the existing Activity Log + Firebase sync pipeline: a broadcast is just
   an activity log entry of type 'broadcast', which already gets pushed to
   Firestore, picked up by every open browser via the live listener, and surfaced
   through the same notification bell parents already use for grade updates. */
function openNotifyParentsModal(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only Admin can send parent notifications.'); return; }
  const flat = allStudentsFlat();
  const sectionStageCombos = [];
  const seenCombo = new Set();
  flat.forEach(s=>{
    if(!s.sectionId || !s.stageId) return;
    const key = s.sectionId+'|'+s.stageId;
    if(seenCombo.has(key)) return;
    seenCombo.add(key);
    sectionStageCombos.push({ value:key, label:`${s.section} - ${s.stage}` });
  });
  sectionStageCombos.sort((a,b)=> a.label.localeCompare(b.label));
  const grades = [...new Set(flat.map(s=> s.grade).filter(Boolean))];
  const classes = [...new Set(flat.map(s=> s.classroom).filter(Boolean))].sort((a,b)=> a.localeCompare(b));
  document.getElementById('notifyParentsSectionSelect').innerHTML =
    sectionStageCombos.map(c=> `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join('') || '<option value="">— No sections found —</option>';
  document.getElementById('notifyParentsGradeSelect').innerHTML =
    grades.map(g=> `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('') || '<option value="">— No grades found —</option>';
  document.getElementById('notifyParentsClassSelect').innerHTML =
    classes.map(c=> `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('') || '<option value="">— No classes found —</option>';
  document.getElementById('notifyParentsMsg').value = '';
  document.getElementById('notifyParentsScope').value = 'all';
  updateNotifyParentsScopeFields();
  document.getElementById('notifyParentsOverlay').classList.add('show');
}
function closeNotifyParentsModal(){
  document.getElementById('notifyParentsOverlay').classList.remove('show');
}
function updateNotifyParentsScopeFields(){
  const scope = document.getElementById('notifyParentsScope').value;
  document.getElementById('notifyParentsSectionField').style.display = scope==='section' ? '' : 'none';
  document.getElementById('notifyParentsGradeField').style.display = scope==='grade' ? '' : 'none';
  document.getElementById('notifyParentsClassField').style.display = scope==='class' ? '' : 'none';
}
function sendParentBroadcast(){
  const msg = (document.getElementById('notifyParentsMsg').value || '').trim();
  if(!msg){ alert('Please enter a message to send.'); return; }
  const scopeType = document.getElementById('notifyParentsScope').value;
  let scope = { type:'all' };
  if(scopeType==='section'){
    const val = document.getElementById('notifyParentsSectionSelect').value;
    if(!val){ alert('Please choose a section.'); return; }
    const [sectionId, stageId] = val.split('|');
    scope = { type:'section', sectionId, stageId };
  } else if(scopeType==='grade'){
    const grade = document.getElementById('notifyParentsGradeSelect').value;
    if(!grade){ alert('Please choose a grade.'); return; }
    scope = { type:'grade', grade };
  } else if(scopeType==='class'){
    const classroom = document.getElementById('notifyParentsClassSelect').value;
    if(!classroom){ alert('Please choose a class.'); return; }
    scope = { type:'class', classroom };
  }
  logActivity('broadcast', msg, { scope });
  closeNotifyParentsModal();
  alert('✓ Notification sent — it will appear in parents\' notification bell (🔔).');
}

/* ---------- Report Card Release countdown bar ---------- */
const RC_COUNTDOWN_WINDOW_DAYS = 14; // the bar visually "fills up" over this many days

function updateReportCardCountdownBar(){
  const bar = document.getElementById('rcCountdownBar');
  const label = document.getElementById('rcCountdownLabel');
  const fill = document.getElementById('rcCountdownFill');
  if(!bar || !label || !fill) return;

  const upcoming = getUpcomingReportCardReleases();
  if(upcoming.length === 0){
    bar.style.display = 'none';
    return;
  }
  const rc = upcoming[0];
  const msLeft = rc._releaseTs - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
  const dayLabel = daysLeft === 0 ? 'today' : (daysLeft === 1 ? '1 day' : `${daysLeft} days`);

  label.innerHTML = `📊 ${escapeHtml(reportCardReleaseLabel(rc))} releases in <b>${dayLabel}</b>`;
  const pct = Math.max(4, Math.min(100, Math.round((1 - (daysLeft / RC_COUNTDOWN_WINDOW_DAYS)) * 100)));
  fill.style.width = `${pct}%`;
  bar.style.display = 'flex';
}

/* Single entry point that refreshes all three header widgets — safe to call
   often (after saves, after activity log writes, after login, and on a timer). */
function refreshHeaderQuickWidgets(){
  updateQuickStatsWidget();
  updateNotifBadge();
  updateReportCardCountdownBar();
  renderBirthdayTopBar();
  const dd = document.getElementById('notifDropdown');
  if(dd && dd.classList.contains('open')) renderNotifDropdown();
}

document.addEventListener('click', (e)=>{
  if(!e.target.closest('#notifBellWrap')){
    const dd = document.getElementById('notifDropdown');
    if(dd) dd.classList.remove('open');
  }
});

setInterval(refreshHeaderQuickWidgets, 60 * 1000);

const ROLE_LABELS = { 
  admin:'Admin', 
  hos:'HOS/Deputy', 
  hod:'Head of Department', 
  teacher:'Teacher', 
  parent:'Parent / Student' 
};

function showWelcomeModal(user){
  const nameEl = document.getElementById('welcomeName');
  const roleEl = document.getElementById('welcomeRole');
  if(nameEl) nameEl.textContent = user.displayName || user.username;
  if(roleEl) roleEl.textContent = ROLE_LABELS[user.role] || user.role;
  document.getElementById('welcomeOverlay').classList.add('show');
}
function closeWelcomeModal(){
  document.getElementById('welcomeOverlay').classList.remove('show');
}

/* ---------- Self-service "Change my Password" ---------- */
function openChangePasswordModal(){
  if(!currentUser) return;
  document.getElementById('cpUsernameLabel').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('cpCurrentPassword').value = '';
  document.getElementById('cpNewPassword').value = '';
  document.getElementById('cpConfirmPassword').value = '';
  const errEl = document.getElementById('cpError');
  errEl.classList.remove('show');
  document.getElementById('changePasswordOverlay').classList.add('show');
  setTimeout(()=>{ const el = document.getElementById('cpCurrentPassword'); if(el) el.focus(); }, 50);
}
function closeChangePasswordModal(){
  document.getElementById('changePasswordOverlay').classList.remove('show');
}
// ========== PASSWORD VALIDATION ==========
const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecialChar: true,
  specialCharList: '!@#$%^&*-_=+',
  forbiddenWords: ['password', 'mils', 'admin', 'school'],
};

function validatePasswordStrength(password, username) {
  const result = {
    valid: true,
    strength: 'weak',
    checks: {
      minLength: password.length >= PASSWORD_RULES.minLength,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      digit: /\d/.test(password),
      specialChar: new RegExp(`[${PASSWORD_RULES.specialCharList.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`).test(password),
      notUsername: !password.toLowerCase().includes((username || '').toLowerCase()),
      noForbiddenWords: !PASSWORD_RULES.forbiddenWords.some(word => 
        password.toLowerCase().includes(word)
      ),
    },
  };

  const allChecksPassed = Object.values(result.checks).every(check => check);
  result.valid = allChecksPassed;

  const checkCount = Object.values(result.checks).filter(v => v).length;
  if (checkCount <= 3) result.strength = 'weak';
  else if (checkCount <= 5) result.strength = 'fair';
  else if (checkCount <= 6) result.strength = 'good';
  else result.strength = 'strong';

  return result;
}

function toggleField(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  if (field.type === 'password') {
    field.type = 'text';
  } else {
    field.type = 'password';
  }
}

function toggleAllPasswordsVisibility() {
  const checkbox = document.getElementById('cpShowAllPasswords');
  const fields = [
    document.getElementById('cpCurrentPassword'),
    document.getElementById('cpNewPassword'),
    document.getElementById('cpConfirmPassword'),
  ];
  fields.forEach(field => {
    if (field) field.type = checkbox.checked ? 'text' : 'password';
  });
}

function validateNewPassword() {
  const newPwField = document.getElementById('cpNewPassword');
  const feedbackEl = document.getElementById('cpValidationFeedback');
  const strengthEl = document.getElementById('cpStrengthIndicator');
  const errorEl = document.getElementById('cpNewPasswordError');
  const password = newPwField.value;
  const currentPassword = document.getElementById('cpCurrentPassword').value;

  if (!password) {
    feedbackEl.style.display = 'none';
    strengthEl.querySelector('.strength-bar').style.width = '0%';
    errorEl.textContent = '';
    return;
  }

  const validation = validatePasswordStrength(password, currentUser?.username || '');

  const strengthBar = strengthEl.querySelector('.strength-fill');
  strengthBar.className = '';
  const strengthLevels = { weak: '25%', fair: '50%', good: '75%', strong: '100%' };
  const strengthColors = { weak: '#e74c3c', fair: '#f39c12', good: '#3498db', strong: '#27ae60' };
  
  strengthBar.style.width = strengthLevels[validation.strength];
  strengthBar.style.backgroundColor = strengthColors[validation.strength];

  const strengthLabels = {
    weak: '❌ Weak - Password does not meet requirements',
    fair: '🟡 Fair - Meets basic requirements',
    good: '🟢 Good - Strong password',
    strong: '✓ Strong - Excellent password strength',
  };
  document.getElementById('cpStrengthLabel').textContent = strengthLabels[validation.strength];

  let feedbackHTML = '';
  const checkSymbol = (passed) => passed ? '✓' : '✗';
  feedbackHTML += `<span style="color:${validation.checks.minLength ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.minLength)} At least 8 characters
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.uppercase ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.uppercase)} Uppercase letter (A–Z)
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.lowercase ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.lowercase)} Lowercase letter (a–z)
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.digit ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.digit)} Number (0–9)
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.specialChar ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.specialChar)} Special character (!@#$%^&*-_=+)
  </span>`;

  if (!validation.checks.notUsername) {
    feedbackHTML += `<br><span style="color:#e74c3c;">
      ✗ Cannot contain your username
    </span>`;
  }
  if (!validation.checks.noForbiddenWords) {
    feedbackHTML += `<br><span style="color:#e74c3c;">
      ✗ Cannot contain forbidden words
    </span>`;
  }

  if (password === currentPassword) {
    feedbackHTML += `<br><span style="color:#e74c3c;">
      ✗ Cannot be the same as current password
    </span>`;
    validation.valid = false;
  }

  feedbackEl.innerHTML = feedbackHTML;
  feedbackEl.style.display = 'block';

  if (!validation.valid && password) {
    errorEl.textContent = 'Password does not meet requirements';
  } else {
    errorEl.textContent = '';
  }

  validatePasswordMatch();
}

function validatePasswordMatch() {
  const newPw = document.getElementById('cpNewPassword').value;
  const confirmPw = document.getElementById('cpConfirmPassword').value;
  const errorEl = document.getElementById('cpConfirmPasswordError');

  if (confirmPw && newPw !== confirmPw) {
    errorEl.textContent = 'Passwords do not match';
  } else {
    errorEl.textContent = '';
  }
}

function submitChangePassword(e){
  e.preventDefault();
  const errEl = document.getElementById('cpError');
  const showError = msg => { errEl.textContent = msg; errEl.classList.add('show'); };
  errEl.classList.remove('show');
  if(!currentUser) return false;

  const user = findUser(currentUser.username);
  if(!user){ showError('Your account could not be found.'); return false; }

  const current = document.getElementById('cpCurrentPassword').value;
  const next = document.getElementById('cpNewPassword').value;
  const confirm = document.getElementById('cpConfirmPassword').value;

  // Verify current password
  if(user.password !== current){ 
    showError('Current password is incorrect.');
    document.getElementById('cpCurrentPasswordError').textContent = 'Current password is incorrect';
    return false; 
  }
  document.getElementById('cpCurrentPasswordError').textContent = '';

  // Validate new password strength
  const validation = validatePasswordStrength(next, user.username);
  if(!validation.valid){ 
    showError('New password does not meet the security requirements.');
    return false; 
  }

  // Ensure passwords match
  if(next !== confirm){ 
    showError('New password and confirmation do not match.');
    return false; 
  }

  // Ensure new password is different from current
  if(next === current){ 
    showError('New password must be different from the current one.'); 
    return false; 
  }

  // Update password
  user.password = next;
  currentUser.password = next;
  if (!user.passwordChangedAt) user.passwordChangedAt = new Date().toISOString();
  saveUsers();
  logActivity('password_change', 'Changed password - strong password security applied');
  closeChangePasswordModal();
  alert('✓ Your password has been updated successfully.\n\nFor your security, all other active sessions have been signed out.');
  return false;
}

const ALL_SUBJECTS = [...new Set(Object.values(STAGES).flatMap(s=>s.subjects))].sort((a,b)=>a.localeCompare(b));

function loadUsers(){
  try{
    const raw = localStorage.getItem(USERS_LS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed)){
        users = parsed; // legacy format from before deletion-tombstones existed
      }else if(parsed && typeof parsed==='object'){
        users = parsed.users || [];
        deletedUsernames = parsed.deletedUsernames || [];
      }
    }
  }catch(err){ console.warn('Could not load users', err); }
  // migrate old "viewer" role (renamed to "parent")
  let migrated = false;
  users.forEach(u=>{ if(u.role==='viewer'){ u.role='parent'; migrated = true; } });
  
  // Fix admin account - ensure admin user has role='admin'
  const adminUser = users.find(u => u.username === 'admin');
  if(adminUser && adminUser.role !== 'admin'){
    adminUser.role = 'admin';
    migrated = true;
  }
  
  if(migrated) saveUsers();
  if(!Array.isArray(users) || users.length===0){
    users = [{
      username:'admin', displayName:'Administrator', password:'admin123', role:'admin'
    }];
    saveUsers();
  }
}
function saveUsers(){
  // Ensure admin always has role='admin'
  const adminUser = users.find(u => u.username === 'admin');
  if(adminUser && adminUser.role !== 'admin'){
    adminUser.role = 'admin';
  }
  const savedOk = saveUsersLocalOnly();
  scheduleGithubPush();
  return savedOk;
}
function saveUsersLocalOnly(){
  try{
    localStorage.setItem(USERS_LS_KEY, JSON.stringify({ users, deletedUsernames }));
    return true;
  }catch(err){
    // This used to fail silently (console.warn only). If this write throws — most
    // commonly a QuotaExceededError once localStorage fills up with years of
    // students/scores/attendance data — the in-memory `users` array (and the table
    // on screen) still look correct, so nothing seems wrong... until the next page
    // refresh reloads `users` from localStorage and the never-actually-saved rows
    // are gone. A single manual "Add User" rarely trips this (one small object), but
    // a bulk Excel import adding many users at once is much more likely to push
    // localStorage over its limit, which matches the "Excel-added users vanish on
    // refresh, manually-added ones don't" pattern. Returning false lets callers
    // (e.g. importUsersExcel) warn the admin immediately instead of the save
    // failing invisibly.
    console.warn('Could not save users', err);
    return false;
  }
}
function findUser(username){
  return users.find(u=> u.username.toLowerCase() === (username||'').trim().toLowerCase());
}

/* ---------- Role -> effective permissions ----------
   sectionScope / stageScope / gradeScope / classroomScope === null  -> unrestricted
   an array (even empty) -> restricted to exactly those values            */

// A Teacher's account only stores their Section, Subjects and a flat list of Classroom names
// (e.g. "Liverpool 1 A German") — it never records which Stage/Grade each classroom belongs to.
// This scans the Student roster once to work that out, so the Grade Book / Attendance steppers
// can offer ONLY the Stages and Grades that actually contain one of the Teacher's own classes,
// instead of every Stage/Grade in the school (which is what let a Teacher wander into an
// unrelated Grade and get stuck with no selectable Class/Mark Entry/Subject there).
function computeTeacherGradeScope(user){
  const stages = new Set();
  const grades = new Set();
  if(!user || !Array.isArray(user.classrooms) || !user.classrooms.length) return { stages:[], grades:[] };
  // Classroom values assigned to a Teacher (via Manage Users) always come from
  // getAllClassroomsInDb(), which trims each student's classroom value before offering it
  // as a checkbox option. Comparing against the RAW (untrimmed) s.classroom below used to
  // silently fail — and drop that classroom out of the Teacher's scope entirely — for any
  // student row whose classroom value has stray leading/trailing whitespace, which is a
  // common side effect of manual entry or Excel import. Trim on both sides so the match is
  // whitespace-insensitive.
  const classroomSet = new Set((user.classrooms||[]).map(c=>(c||'').trim()));
  const section = user.section || null;
  Object.keys(students).forEach(classKey=>{
    const parts = classKey.split('|');
    const sec = parts[0], stage = parts[1], grade = parts[2];
    if(section && sec!==section) return;
    const roster = students[classKey] || [];
    if(roster.some(s=> classroomSet.has((s.classroom||'').trim()))){
      stages.add(stage);
      grades.add(grade);
    }
  });
  return { stages:[...stages], grades:[...grades] };
}

// Lists just the logged-in Teacher's own classrooms within a given Section, in place of the
// normal Stage -> Grade -> Class drill-down (see makeStepConfig()'s Teacher-role branch above).
// A Teacher's classroom names are unique within their Section, so this is all the Class step
// needs to show — no Stage/Grade pick required first.
function getTeacherClassroomsInSection(section){
  if(!currentUser || currentUser.role!=='teacher' || !Array.isArray(currentUser.classrooms) || !section) return [];
  // Same whitespace-insensitive matching as computeTeacherGradeScope() above — the
  // Teacher's assigned classroom names are trimmed, so raw student.classroom values with
  // stray spaces must be trimmed too or they'll never match and the class silently
  // disappears from the Teacher's own class list.
  const classroomSet = new Set(currentUser.classrooms.map(c=>(c||'').trim()));
  const names = new Set();
  Object.keys(students).forEach(classKey=>{
    const parts = classKey.split('|');
    if(parts[0]!==section) return;
    const roster = students[classKey] || [];
    roster.forEach(s=>{ const c=(s.classroom||'').trim(); if(c && classroomSet.has(c)) names.add(s.classroom); });
  });
  return [...names].sort();
}

// Given a Section + Classroom name, finds which Stage/Grade that classroom lives in by scanning
// the Student roster once. Used by selectValue() to silently fill in Stage/Grade for a Teacher
// the moment they pick a Class, since the Teacher stepper never shows those two steps directly.
function findTeacherClassroomLocation(section, classroom){
  if(!section || !classroom) return null;
  for(const classKey of Object.keys(students)){
    const parts = classKey.split('|');
    if(parts[0]!==section) continue;
    const roster = students[classKey] || [];
    if(roster.some(s=> s.classroom===classroom)) return { stage: parts[1], grade: parts[2] };
  }
  return null;
}

function getEffectivePermissions(user){
  const role = user.role || 'parent';
  if(role==='admin'){
    // Admin: Full System Access
    return { database:true, grades:true, attendance:true, approvedLeave:true, reports:true, dashboard:true, examsAnalysis:true, examSchedule:true, perfAlerts:true, classLists:true, settings:true, edit:true,
      sectionScope:null, stageScope:null, gradeScope:null, classroomScope:null };
  }
  if(role==='hos'){
    // HOS/Deputy: Can View their relevant Section and Stage - Can View or edit Grade Book, Can View or Edit Absence, Can View Certificates, Can View Dashboard, Can View Exam Analysis
    // HOS/Deputy is also one of only two roles (with Admin) allowed to record Approved Leave.
    return { database:false, grades:true, attendance:true, approvedLeave:true, reports:true, dashboard:true, examsAnalysis:true, examSchedule:true, perfAlerts:true, classLists:false, settings:false, edit:true,
      sectionScope:user.section||null, stageScope:user.stages||[], gradeScope:null, classroomScope:null };
  }
  if(role==='hod'){
    // Head of Department: Can view OR edit their subject's grade book within their stage (and their section).
    return { database:false, grades:true, attendance:false, approvedLeave:false, reports:true, dashboard:false, examsAnalysis:false, examSchedule:false, perfAlerts:false, classLists:false, settings:false, edit:true,
      sectionScope:user.section||null, stageScope:user.stages||[], gradeScope:null, classroomScope:null, subjectScope:user.subjects||[] };
  }
  if(role==='teacher'){
    // Teacher: Can view/edit the grade form AND the Absence (Attendance) tab, both restricted to
    // their own registered subjects and classes only — the classroomScope/subjectScope below feed
    // straight into the Grade Book's and the Attendance tab's stepper option-lists (via
    // scopeClassroomAllowed / scopeSubjectAllowed), so a Teacher never even sees a class or
    // subject they aren't assigned to, let alone edit one. stageScope/gradeScope are derived from
    // those same classrooms (see computeTeacherGradeScope above) so the Stage and Grade steps only
    // ever offer the Stage(s)/Grade(s) that actually contain one of the Teacher's classes — a
    // Teacher can no longer open the Stage dropdown and pick a Stage they don't teach in at all.
    // Both Grade Book AND Absence edits are further subject to the Admin's Grade Entry Lock rules
    // (Absence writes straight into the Month's grade, so the two are locked/unlocked together) —
    // see isCurrentUserGradeEntryLocked().
    // NOTE: a Teacher can view/edit Absence but NOT Approved Leave — recording an excused/approved
    // absence is restricted to Admin and HOS/Deputy only.
    const scope = computeTeacherGradeScope(user);
    return { database:false, grades:true, attendance:true, approvedLeave:false, reports:false, dashboard:false, examsAnalysis:false, examSchedule:false, perfAlerts:false, classLists:false, settings:false, edit:true,
      sectionScope:user.section||null, stageScope:scope.stages, gradeScope:scope.grades, classroomScope:user.classrooms||[], subjectScope:user.subjects||[] };
  }
  // Parent/Student: Can View ONLY Certificates, Dashboard and the Exams Schedule
  const hasStudentLink = Array.isArray(user.studentIds);
  return { database:false, grades:false, attendance:false, approvedLeave:false, reports:true, dashboard:true, examsAnalysis:false, examSchedule:true, perfAlerts:false, classLists:false, settings:false, edit:false,
    // Once a specific student link exists, section/stage/classroom no longer restrict anything —
    // the exact student-ID scope below is what keeps a parent from seeing classmates' data.
    // Legacy accounts (saved before this feature existed, so `studentIds` is still undefined)
    // keep behaving exactly as before, so nobody's access silently changes underneath them.
    sectionScope: hasStudentLink ? null : (user.section||null),
    stageScope: hasStudentLink ? null : (user.stages||[]),
    gradeScope: null,
    classroomScope: hasStudentLink ? null : (user.classrooms||[]),
    studentScope: hasStudentLink ? user.studentIds : null };
}

function scopeSectionAllowed(id){
  if(!currentUser || !currentUser.effective) return true;
  const sc = currentUser.effective.sectionScope;
  return !sc || sc===id;
}
function scopeStageAllowed(id){
  if(!currentUser || !currentUser.effective) return true;
  const sc = currentUser.effective.stageScope;
  // stageScope === null -> unrestricted. An array (even empty) -> restricted to exactly those stages.
  return !sc || sc.includes(id);
}
// gradeScope === null/undefined -> unrestricted. An array (even empty) -> restricted to exactly
// those Grade ids. Currently only set for the Teacher role (see computeTeacherGradeScope above).
function scopeGradeAllowed(gradeId){
  if(!currentUser || !currentUser.effective) return true;
  const sc = currentUser.effective.gradeScope;
  return !sc || sc.includes(gradeId);
}
function scopeSubjectAllowed(name){
  if(!currentUser || !currentUser.effective) return true;
  const sc = currentUser.effective.subjectScope;
  return !sc || sc.includes(name);
}
function scopeClassroomAllowed(name){
  if(!currentUser || !currentUser.effective) return true;
  const sc = currentUser.effective.classroomScope;
  return !sc || sc.map(c=>(c||'').trim()).includes((name||'').trim());
}
function scopeStudentAllowed(id){
  if(!currentUser || !currentUser.effective) return true;
  const sc = currentUser.effective.studentScope;
  return !sc || sc.includes(id);
}

// Since the app runs in a single browser tab, logging out one user and logging
// in as another (e.g. Admin -> HOS on a shared computer) does NOT reload the
// page, so any Section/Stage/Class/Subject picked by the PREVIOUS user is
// still sitting in memory (and, for the Grade Book stepper, in
// localStorage too). Without this check, a newly logged-in HOS/Teacher/HOD
// could briefly see a class table for a Stage outside their assigned scope
// just because it was the last thing selected before them. Called right
// after `currentUser.effective` is (re)computed, this walks every
// scope-sensitive selection in the app and resets anything the new scope
// doesn't allow, forcing a fresh Section/Stage/Class pick instead.
function sanitizeScopedState(){
  if(!currentUser || !currentUser.effective) return;

  // Grade Book shared stepper state
  if(state.section && !scopeSectionAllowed(state.section)){
    state.section = null; state.stage = null; state.grade = null; state.term = null; state.academicTerm = null; state.subject = null;
  } else if(state.stage && !scopeStageAllowed(state.stage)){
    state.stage = null; state.grade = null; state.term = null; state.academicTerm = null; state.subject = null;
  } else if(state.term && !scopeClassroomAllowed(state.term)){
    state.term = null;
  }
  if(state.subject && !scopeSubjectAllowed(state.subject)) state.subject = null;

  // Attendance tab's own independent stepper state
  if(attState.section && !scopeSectionAllowed(attState.section)){
    attState.section = null; attState.stage = null; attState.grade = null; attState.term = null; attState.subject = null;
  } else if(attState.stage && !scopeStageAllowed(attState.stage)){
    attState.stage = null; attState.grade = null; attState.term = null; attState.subject = null;
  } else if(attState.term && !scopeClassroomAllowed(attState.term)){
    attState.term = null;
  }
  if(attState.subject && !scopeSubjectAllowed(attState.subject)) attState.subject = null;

  // Cycle Dashboard filters
  if(state.dashboardSection && !scopeSectionAllowed(state.dashboardSection)){
    state.dashboardSection = null; state.dashboardStage = null; state.dashboardGrade = null; state.dashboardClassroom = null; state.dashboardStudent = null;
  } else if(state.dashboardStage && !scopeStageAllowed(state.dashboardStage)){
    state.dashboardStage = null; state.dashboardGrade = null; state.dashboardClassroom = null; state.dashboardStudent = null;
  } else if(state.dashboardClassroom && !scopeClassroomAllowed(state.dashboardClassroom)){
    state.dashboardClassroom = null; state.dashboardStudent = null;
  }
  if(state.dashboardStudent && !scopeStudentAllowed(state.dashboardStudent)){
    state.dashboardStudent = null;
  }

  // Exams Analysis filters
  if(state.examsSection && !scopeSectionAllowed(state.examsSection)){
    state.examsSection = null; state.examsStage = null; state.examsGrade = null; state.examsClassroom = null; state.examsSubject = null;
  } else if(state.examsStage && !scopeStageAllowed(state.examsStage)){
    state.examsStage = null; state.examsGrade = null; state.examsClassroom = null; state.examsSubject = null;
  } else if(state.examsClassroom && !scopeClassroomAllowed(state.examsClassroom)){
    state.examsClassroom = null;
  }
  if(state.examsSubject && !scopeSubjectAllowed(state.examsSubject)) state.examsSubject = null;

  // Top Performance / At-Risk filters — one saved selection per Term/Cycle/Category
  if(perfFilterStates && typeof perfFilterStates === 'object'){
    Object.values(perfFilterStates).forEach(st=>{
      if(!st) return;
      if(st.section && !scopeSectionAllowed(st.section)){
        st.section = null; st.stage = null; st.grade = null; st.term = null;
      } else if(st.stage && !scopeStageAllowed(st.stage)){
        st.stage = null; st.grade = null; st.term = null;
      } else if(st.term && !scopeClassroomAllowed(st.term)){
        st.term = null;
      }
    });
  }
}

const LOGIN_LOCKOUT_KEY = 'mils_login_lockout';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 1000; // 1 minute

// ========== FORGOT PASSWORD SYSTEM ==========

// Initialize reset token storage if not exists
if (!window.resetTokensStorage) {
  try {
    window.resetTokensStorage = JSON.parse(localStorage.getItem('mils_reset_tokens') || '[]');
  } catch (err) {
    window.resetTokensStorage = [];
  }
}

function generateResetToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function simpleHashToken(token) {
  // Simple hash for client-side demo (use bcrypt in production)
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

function maskEmail(email) {
  const [localPart, domain] = email.split('@');
  if (!domain) return email;
  if (localPart.length <= 3) {
    return localPart[0] + '***@' + domain;
  }
  return localPart[0] + '***' + localPart[localPart.length - 1] + '@' + domain;
}

function showForgotPasswordHelp(){
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('forgotPasswordStep1').style.display = 'block';
  document.getElementById('forgotUsernameEmail').value = '';
  document.getElementById('forgotStep1Error').textContent = '';
  setTimeout(() => document.getElementById('forgotUsernameEmail').focus(), 100);
}

function backToLogin() {
  document.getElementById('forgotPasswordStep1').style.display = 'none';
  document.getElementById('forgotPasswordStep2').style.display = 'none';
  document.getElementById('resetPasswordContainer').style.display = 'none';
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
}

function handleForgotPasswordStep1(event) {
  event.preventDefault();
  const input = document.getElementById('forgotUsernameEmail');
  const errorEl = document.getElementById('forgotStep1Error');
  const btn = event.target.querySelector('button[type="submit"]');
  const usernameOrEmail = input.value.trim();

  if (!usernameOrEmail) {
    errorEl.textContent = 'Please enter a username or email address.';
    return false;
  }

  // Find user by username or email
  const user = findUser(usernameOrEmail) || 
               users.find(u => u.email && u.email.toLowerCase() === usernameOrEmail.toLowerCase());

  if (!user) {
    errorEl.textContent = 'No account found. Please contact your administrator.';
    return false;
  }

  if (!user.email) {
    errorEl.textContent = 'This account does not have an email on file.';
    return false;
  }

  // Show loading
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    // Generate reset token
    const resetToken = generateResetToken();
    const tokenHash = simpleHashToken(resetToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store reset token
    if (!window.resetTokensStorage) window.resetTokensStorage = [];
    window.resetTokensStorage.push({
      userId: user.username,
      tokenHash: tokenHash,
      expiresAt: expiresAt.toISOString(),
      used: false,
      usedAt: null,
      requestedAt: new Date().toISOString(),
    });

    // Save to localStorage
    try {
      localStorage.setItem('mils_reset_tokens', JSON.stringify(window.resetTokensStorage));
    } catch (err) { console.error('Error saving reset tokens:', err); }

    // Log activity
    logActivity('password_reset_requested', `Password reset requested for email ${user.email}`, user.username);

    // In production, would send email. For now, show the token in console
    console.log('Reset Token (send to user via email in production):', resetToken);
    console.log('Reset Link: ' + window.location.origin + window.location.pathname + '?resetToken=' + resetToken);

    // Show confirmation screen
    document.getElementById('forgotPasswordStep1').style.display = 'none';
    document.getElementById('maskedEmailDisplay').textContent = maskEmail(user.email);
    document.getElementById('forgotPasswordStep2').style.display = 'block';

    // Show token in demo mode
    const demoTokenEl = document.getElementById('resetTokenDemo');
    if (demoTokenEl) {
      document.getElementById('resetTokenValue').textContent = resetToken;
      demoTokenEl.style.display = 'block';
    }

  } catch (error) {
    console.error('Error:', error);
    errorEl.textContent = 'An error occurred. Please try again.';
  }

  btn.classList.remove('loading');
  btn.disabled = false;
  return false;
}

function handleForgotPasswordRetry() {
  document.getElementById('forgotPasswordStep2').style.display = 'none';
  document.getElementById('forgotPasswordStep1').style.display = 'block';
  document.getElementById('forgotUsernameEmail').value = '';
  document.getElementById('forgotStep1Error').textContent = '';
}

function validateResetPassword() {
  const password = document.getElementById('resetPassword').value;
  const feedbackEl = document.getElementById('resetPasswordFeedback');
  const strengthEl = document.getElementById('resetPasswordStrength');
  const errorEl = document.getElementById('resetPasswordError');

  if (!password) {
    feedbackEl.style.display = 'none';
    strengthEl.querySelector('.strength-fill').style.width = '0%';
    errorEl.textContent = '';
    return;
  }

  const username = window.resetContext?.username || '';
  const validation = validatePasswordStrength(password, username);

  const strengthBar = strengthEl.querySelector('.strength-fill');
  const strengthLevels = { weak: '25%', fair: '50%', good: '75%', strong: '100%' };
  const strengthColors = { weak: '#e74c3c', fair: '#f39c12', good: '#3498db', strong: '#27ae60' };
  
  strengthBar.style.width = strengthLevels[validation.strength];
  strengthBar.style.backgroundColor = strengthColors[validation.strength];

  const strengthLabels = {
    weak: '❌ Weak - Password does not meet requirements',
    fair: '🟡 Fair - Meets basic requirements',
    good: '🟢 Good - Strong password',
    strong: '✓ Strong - Excellent password strength',
  };
  document.getElementById('resetStrengthLabel').textContent = strengthLabels[validation.strength];

  let feedbackHTML = '';
  const checkSymbol = (passed) => passed ? '✓' : '✗';
  feedbackHTML += `<span style="color:${validation.checks.minLength ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.minLength)} At least 8 characters
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.uppercase ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.uppercase)} Uppercase letter (A–Z)
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.lowercase ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.lowercase)} Lowercase letter (a–z)
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.digit ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.digit)} Number (0–9)
  </span><br>`;
  feedbackHTML += `<span style="color:${validation.checks.specialChar ? '#27ae60' : '#e74c3c'};">
    ${checkSymbol(validation.checks.specialChar)} Special character (!@#$%^&*-_=+)
  </span>`;

  feedbackEl.innerHTML = feedbackHTML;
  feedbackEl.style.display = 'block';

  if (!validation.valid && password) {
    errorEl.textContent = 'Password does not meet requirements';
  } else {
    errorEl.textContent = '';
  }

  validateResetPasswordMatch();
}

function validateResetPasswordMatch() {
  const pw = document.getElementById('resetPassword').value;
  const confirmPw = document.getElementById('resetConfirmPassword').value;
  const errorEl = document.getElementById('resetConfirmPasswordError');

  if (confirmPw && pw !== confirmPw) {
    errorEl.textContent = 'Passwords do not match';
  } else {
    errorEl.textContent = '';
  }
}

function handlePasswordReset(event) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');
  const resetPassword = document.getElementById('resetPassword').value;
  const confirmPassword = document.getElementById('resetConfirmPassword').value;
  const errorEl = document.getElementById('resetFormError');
  const resetToken = window.resetContext?.token;

  if (!resetToken) {
    errorEl.textContent = 'Invalid or expired reset link. Please request a new one.';
    return false;
  }

  // Validate
  const validation = validatePasswordStrength(resetPassword, window.resetContext.username);
  if (!validation.valid) {
    errorEl.textContent = 'Password does not meet requirements';
    return false;
  }

  if (resetPassword !== confirmPassword) {
    errorEl.textContent = 'Passwords do not match';
    return false;
  }

  btn.classList.add('loading');
  btn.disabled = true;

  try {
    // Find user
    const user = findUser(window.resetContext.username);
    if (!user) throw new Error('User not found');

    // Update password
    user.password = resetPassword;
    user.passwordChangedAt = new Date().toISOString();

    // Mark token as used
    if (window.resetTokensStorage) {
      const tokenRecord = window.resetTokensStorage.find(t => 
        t.userId === user.username && !t.used
      );
      if (tokenRecord) {
        tokenRecord.used = true;
        tokenRecord.usedAt = new Date().toISOString();
      }
    }

    // Save
    saveUsers();
    try {
      localStorage.setItem('mils_reset_tokens', JSON.stringify(window.resetTokensStorage));
    } catch (err) { }

    // Log activity
    logActivity('password_reset_completed', 'Password reset via forgot password', user.username);

    // Show success
    alert('✓ Password reset successful! Redirecting to login...');

    // Clear reset context
    window.resetContext = null;

    // Redirect to login
    setTimeout(() => {
      document.getElementById('resetPasswordContainer').style.display = 'none';
      document.getElementById('loginOverlay').style.display = 'flex';
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
    }, 1500);

  } catch (error) {
    console.error('Password reset error:', error);
    errorEl.textContent = 'An error occurred. Please try again or contact your administrator.';
  }

  btn.classList.remove('loading');
  btn.disabled = false;
  return false;
}

function checkForResetToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('resetToken');

  if (resetToken) {
    const tokenRecord = window.resetTokensStorage?.find(t => 
      simpleHashToken(resetToken) === t.tokenHash
    );

    if (!tokenRecord) {
      alert('Invalid or expired reset link. Please request a new one.');
      return;
    }

    if (new Date(tokenRecord.expiresAt) < new Date()) {
      alert('Reset link expired. Please request a new one.');
      return;
    }

    if (tokenRecord.used) {
      alert('This reset link has already been used.');
      return;
    }

    // Valid token - show password reset form
    window.resetContext = {
      token: resetToken,
      username: tokenRecord.userId,
    };

    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('resetPasswordContainer').style.display = 'block';
    document.getElementById('resetPassword').focus();

    // Remove token from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function getLoginLockoutState(){
  try{
    return JSON.parse(localStorage.getItem(LOGIN_LOCKOUT_KEY) || '{}');
  }catch(err){ return {}; }
}
function setLoginLockoutState(state){
  try{ localStorage.setItem(LOGIN_LOCKOUT_KEY, JSON.stringify(state)); }catch(err){}
}
function updateLockoutUI(){
  const lockEl = document.getElementById('loginLockout');
  const btn = document.getElementById('loginSubmitBtn');
  const state = getLoginLockoutState();
  if(state.until && Date.now() < state.until){
    const secs = Math.ceil((state.until - Date.now())/1000);
    lockEl.textContent = `Too many failed attempts. Please try again in ${secs}s.`;
    lockEl.classList.add('show');
    if(btn) btn.disabled = true;
    return true;
  }
  lockEl.classList.remove('show');
  if(btn) btn.disabled = false;
  return false;
}
function handleLogin(e){
  e.preventDefault();
  if(updateLockoutUI()) return false;
  const btn = document.getElementById('loginSubmitBtn');
  if(btn){ btn.classList.add('loading'); btn.disabled = true; }
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const user = findUser(username);
  const errEl = document.getElementById('loginError');
  if(!user || user.password !== password){
    let state = getLoginLockoutState();
    state.count = (state.count || 0) + 1;
    if(state.count >= LOGIN_MAX_ATTEMPTS){
      state.until = Date.now() + LOGIN_LOCKOUT_MS;
      state.count = 0;
    }
    setLoginLockoutState(state);
    errEl.textContent = !user ? 'No account found with that username.' : 'Incorrect password. Please try again.';
    errEl.classList.add('show');
    if(btn){ btn.classList.remove('loading'); btn.disabled = false; }
    updateLockoutUI();
    return false;
  }
  errEl.classList.remove('show');
  setLoginLockoutState({});
  try{ localStorage.setItem('mils_hint_dismissed', '1'); }catch(err){}
  const hintEl = document.getElementById('loginHint');
  if(hintEl) hintEl.style.display = 'none';
  const remember = document.getElementById('rememberMe').checked;
  loginAs(user, remember, true);
  if(btn){ btn.classList.remove('loading'); btn.disabled = false; }
  return false;
}
function togglePasswordVisibility(){
  const pw = document.getElementById('loginPassword');
  const btn = document.getElementById('pwToggleBtn');
  if(!pw) return;
  if(pw.type === 'password'){ pw.type = 'text'; btn.textContent = '🙈'; }
  else{ pw.type = 'password'; btn.textContent = '👁'; }
}

function toggleResetPasswordsVisibility() {
  const checkbox = document.getElementById('resetShowPasswords');
  const fields = [
    document.getElementById('resetPassword'),
    document.getElementById('resetConfirmPassword'),
  ];
  fields.forEach(field => {
    if (field) field.type = checkbox.checked ? 'text' : 'password';
  });
}
function toggleDarkMode(){
  const isDark = document.body.classList.toggle('dark-mode');
  const btn = document.getElementById('themeToggleBtn');
  if(btn) btn.textContent = isDark ? '☀️ Light' : '🌙 Dark';
  try{ localStorage.setItem('mils_dark_mode', isDark ? '1' : '0'); }catch(err){}
}
(function initLoginUX(){
  try{
    if(localStorage.getItem('mils_dark_mode') === '1'){
      document.body.classList.add('dark-mode');
      document.addEventListener('DOMContentLoaded', ()=>{
        const btn = document.getElementById('themeToggleBtn');
        if(btn) btn.textContent = '☀️ Light';
      });
    }
    if(localStorage.getItem('mils_hint_dismissed') === '1'){
      document.addEventListener('DOMContentLoaded', ()=>{
        const hintEl = document.getElementById('loginHint');
        if(hintEl) hintEl.style.display = 'none';
      });
    }
  }catch(err){}
  document.addEventListener('DOMContentLoaded', ()=>{
    updateLockoutUI();
    const uField = document.getElementById('loginUsername');
    const overlay = document.getElementById('loginOverlay');
    if(uField && overlay && overlay.style.display !== 'none') uField.focus();
    setInterval(updateLockoutUI, 1000);
  });
})();

// Makes the Teachers Database the single source of truth for which Classes/Subjects a
// Teacher (or HOD's Subjects) account sees. Previously a Teacher's classrooms/subjects only
// ever came from whatever was picked in the "Manage Users" form when the account was created —
// if that step was skipped, or the Teachers Database row was edited afterwards, the account's
// Class/Subject steppers stayed empty even though the Teachers Database clearly listed classes
// and a subject for that teacher. Called right after login (and re-login), this looks up the
// matching Teachers Database row (by linked username first, falling back to a name match for
// older rows that pre-date the linking) and — whenever that row actually has data — overwrites
// the account's classrooms/subjects with it, so the database's "Classes"/"Subject" columns are
// always what the Teacher/HOD account actually sees.
function syncTeacherScopeFromDb(user){
  if(!user || (user.role!=='teacher' && user.role!=='hod')) return;
  let t = teachers.find(x=> x.username===user.username);
  if(!t) t = teachers.find(x=> !x.username && (x.name===user.displayName || x.name===user.username));
  if(!t) return;
  const dbSubjects = (t.subject||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(dbSubjects.length) user.subjects = dbSubjects;
  if(user.role==='teacher'){
    const dbClassrooms = (t.classes||'').split(',').map(c=>c.trim()).filter(Boolean);
    if(dbClassrooms.length) user.classrooms = dbClassrooms;
  }
}

function loginAs(user, remember, showWelcome){
  currentUser = user;
  syncTeacherScopeFromDb(currentUser);
  currentUser.effective = getEffectivePermissions(user);
  sanitizeScopedState();
  try{
    sessionStorage.setItem(SESSION_LS_KEY, user.username);
    if(remember){
      localStorage.setItem(REMEMBER_LS_KEY, user.username);
    } else {
      localStorage.removeItem(REMEMBER_LS_KEY);
    }
  }catch(err){}
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appWrap').style.display = '';
  setTimeout(updateStickySpacing, 0);
  const u = document.getElementById('loginUsername'), p = document.getElementById('loginPassword'), r = document.getElementById('rememberMe');
  if(u) u.value=''; if(p) p.value=''; if(r) r.checked=false;
  applyPermissionsUI();
  renderStepper(); renderMarkEntryStepper(); renderAttendanceStepper();
  renderWorkspace(); renderMarkEntryWorkspace(); renderAttendanceWorkspace();
  const allowed = firstAllowedTab();
  if(allowed){
    document.getElementById('noAccessPanel').style.display = 'none';
    document.getElementById('accountBlockedPanel').style.display = 'none';
    document.getElementById('mainNav').style.display = '';
    switchView(allowed);
  } else if(isViewerAccountBlocked()){
    showAccountBlockedScreen();
  } else {
    document.getElementById('gradesView').style.display = 'none';
    document.getElementById('databaseView').style.display = 'none';
    document.getElementById('markEntryReportView').style.display = 'none';
    document.getElementById('attendanceView').style.display = 'none';
    document.getElementById('accountBlockedPanel').style.display = 'none';
    document.getElementById('noAccessPanel').style.display = 'flex';
  }
  if(showWelcome) showWelcomeModal(user);
  startPresenceTracking();
  startClassAlertWatcher();
  logActivity('login', 'Signed in');
  refreshHeaderQuickWidgets();
  refreshBirthdayWidgets();
  showBirthdayToastIfNeeded();
}

function logoutUser(){
  logActivity('logout', 'Signed out');
  stopPresenceTracking();
  stopClassAlertWatcher();
  currentUser = null;
  try{
    sessionStorage.removeItem(SESSION_LS_KEY);
    localStorage.removeItem(REMEMBER_LS_KEY);
  }catch(err){}
  document.getElementById('appWrap').style.display = 'none';
  document.getElementById('loginOverlay').style.display = 'flex';
  closeUsersModal();
}

function tryAutoLogin(){
  loadUsers();
  
  // Check for password reset token in URL
  checkForResetToken();
  
  let savedUsername = null;
  try{
    savedUsername = sessionStorage.getItem(SESSION_LS_KEY) || localStorage.getItem(REMEMBER_LS_KEY);
  }catch(err){}
  const user = savedUsername ? findUser(savedUsername) : null;
  if(user){ loginAs(user, !!(localStorage.getItem(REMEMBER_LS_KEY)), false); }
  else{
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appWrap').style.display = 'none';
  }
}

function canAccessTab(tab){
  if(!currentUser || !currentUser.effective) return false;
  if(isViewerAccountBlocked()) return false; // blocked accounts can't open ANY tab
  if(tab==='teachers') return currentUser.role === 'admin'; // Teachers Database only for Admin
  if(tab==='teacherStatistics') return currentUser.role === 'admin'; // Teachers Statistics only for Admin
  if(tab==='statistics') return currentUser.role === 'admin' || currentUser.role === 'hod'; // Statistics for Admin & HOD
  if(tab==='certReports') return !!currentUser.effective.reports; // Certificates tab shares the Reports permission
  if(tab==='markEntryReport') return currentUser.role!=='parent' && !!currentUser.effective.reports; // Mark Entry Report shares the Reports permission, but is staff-only
  return !!currentUser.effective[tab];
}

function firstAllowedTab(){
  if(!currentUser || !currentUser.effective) return null;
  if(isViewerAccountBlocked()) return null; // blocked accounts get the "Account is NOT active" screen instead of any tab
  if(currentUser.effective.database) return 'database';
  if(currentUser.effective.grades) return 'grades';
  if(currentUser.effective.attendance) return 'attendance';
  if(currentUser.effective.dashboard) return 'dashboard';
  if(currentUser.effective.examsAnalysis) return 'examsAnalysis';
  if(currentUser.effective.perfAlerts) return 'perfAlerts';
  if(currentUser.effective.classLists) return 'classLists';
  if((currentUser.role === 'admin' || currentUser.role === 'hod') && currentUser.effective.database) return 'statistics';
  return null;
}

function applyPermissionsUI(){
  if(!currentUser || !currentUser.effective) return;
  const eff = currentUser.effective;
  document.getElementById('userBadgeName').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('userBadgeRole').textContent = ROLE_LABELS[currentUser.role] || 'User';
  // Student Database is only for Admin
  document.getElementById('navTabDatabase').style.display = (eff.database && currentUser.role==='admin') ? '' : 'none';
  // Teachers Database is only for Admin
  document.getElementById('teachersDropdownWrap').style.display = (eff.settings && currentUser.role==='admin') ? '' : 'none';
  document.getElementById('navTabGrades').style.display = eff.grades ? '' : 'none';
  document.getElementById('navTabAttendance').style.display = eff.attendance ? '' : 'none';
  // Certificates and Mark Entry Report both share the "reports" permission (see
  // canAccessTab()) but were never actually hidden here, so an account with that
  // permission off could still see and click into both tabs.
  const certReportsTab = document.getElementById('navTabCertReports');
  if(certReportsTab) certReportsTab.style.display = eff.reports ? '' : 'none';
  const markEntryReportTab = document.getElementById('navTabMarkEntryReport');
  if(markEntryReportTab) markEntryReportTab.style.display = (eff.reports && currentUser.role!=='parent') ? '' : 'none';
  document.getElementById('dashboardDropdownWrap').style.display = eff.dashboard ? '' : 'none';
  document.getElementById('examsDropdownWrap').style.display = eff.examsAnalysis ? '' : 'none';
  const examSchedWrap = document.getElementById('examSchedDropdownWrap');
  if(examSchedWrap) examSchedWrap.style.display = eff.examSchedule ? '' : 'none';
  const perfWrap = document.getElementById('perfDropdownWrap');
  if(perfWrap) perfWrap.style.display = eff.perfAlerts ? '' : 'none';
  // Class Lists and Statistics should be visible for admin (since it's under Students database)
  const databaseMenu = document.getElementById('databaseMenu');
  if(databaseMenu){
    const classListsBtn = databaseMenu.querySelector('[onclick*="classLists"]');
    if(classListsBtn) classListsBtn.style.display = eff.database ? '' : 'none';
    const statsBtn = databaseMenu.querySelector('[onclick*="statistics"]');
    if(statsBtn) statsBtn.style.display = (eff.database && (currentUser.role==='admin' || currentUser.role==='hod')) ? '' : 'none';
  }
  const configWrap = document.getElementById('configDropdownWrap');
  if(configWrap) configWrap.style.display = eff.settings ? '' : 'none';
  const toolbar = document.getElementById('gradesToolbar');
  if(toolbar) toolbar.style.display = (eff.edit && currentUser.role==='admin') ? '' : 'none';
  const gbSaveWrap = document.getElementById('gbSaveWrap');
  if(gbSaveWrap){ gbSaveWrap.style.display = eff.edit ? 'flex' : 'none'; updateGradeBookSaveUI(); }
  const delAllBtn = document.getElementById('dbDeleteAllBtn');
  if(delAllBtn) delAllBtn.style.display = currentUser.role==='admin' ? '' : 'none';
  const notifWrap = document.getElementById('notifBellWrap');
  if(notifWrap) notifWrap.style.display = (currentUser.role==='admin' || currentUser.role==='parent') ? '' : 'none';
  const notifyBtn = document.getElementById('notifyParentsBtn');
  if(notifyBtn) notifyBtn.style.display = (currentUser.role==='admin') ? '' : 'none';
  const syncEl = document.getElementById('githubSyncStatus');
  if(syncEl && currentUser.role!=='admin') syncEl.style.display = 'none';
  const quickStatsEl = document.getElementById('quickStatsWidget');
  if(quickStatsEl) quickStatsEl.style.display = currentUser.role==='admin' ? '' : 'none';
  setTimeout(updateStickySpacing, 0);
}

/* ---------- Manage Users Modal ---------- */
// Populates the "Section" dropdown in Manage Users with English / French / Both, so Teacher,
// HOD, and HOS accounts can be given access to a single Section or both at once. Selecting
// "Both" stores an empty section value on the user, which getEffectivePermissions() already
// treats as an unrestricted sectionScope (same null-check used for Admin) — so no separate
// scoping logic is needed for the "Both" case.
function populateUfSectionOptions(){
  const sel = document.getElementById('ufSection');
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="en">${SECTIONS.en.label}</option><option value="fr">${SECTIONS.fr.label}</option><option value="">Both (English &amp; French)</option>`;
  sel.value = prev;
}
function openUsersModal(){
  if(!currentUser || !currentUser.effective || !currentUser.effective.settings){ alert('You do not have permission to manage users.'); return; }
  populateUfSectionOptions();
  resetUserForm();
  buildSubjectCheckboxes();
  const isHod = currentUser.role==='hod';
  const hodSectionLabel = currentUser.section ? SECTIONS[currentUser.section].label : 'English & French';
  document.getElementById('usersModalSub').textContent = isHod
    ? `You can manage Teacher and Parent/Student accounts within your own section (${hodSectionLabel}).`
    : 'Add users and control their access to each tab based on their role.';
  const roleSelect = document.getElementById('ufRole');
  document.getElementById('usersExcelRow').style.display = isHod ? 'none' : '';
  if(isHod){
    roleSelect.innerHTML = `<option value="teacher">Teacher</option><option value="parent">Parent / Student</option>`;
    document.getElementById('ufSection').value = currentUser.section;
    document.getElementById('ufSection').disabled = true;
  } else {
    roleSelect.innerHTML = `<option value="admin">Admin</option><option value="hos">HOS/Deputy</option><option value="teacher">Teacher</option>
      <option value="hod">Head of Department</option><option value="parent">Parent / Student</option>`;
    document.getElementById('ufSection').disabled = false;
  }
  onRoleFormChange();
  renderUsersTable();
  document.getElementById('usersOverlay').classList.add('show');
}
function closeUsersModal(){
  document.getElementById('usersOverlay').classList.remove('show');
}
// Flattens the `students` store into one list, tagging each student with
// where they belong (raw section/stage/grade IDs, not labels), so the
// "Linked Student(s)" picker and similar id-based lookups can search across
// every section/stage/grade/class at once.
// NOTE: this used to be named allStudentsFlat(), which duplicated (and,
// due to function-declaration hoisting, silently overwrote) the earlier
// allStudentsFlat() defined above renderDatabase(). That name collision is
// why the Student Database's "Class" column stopped reflecting each
// student's classroom (renderDatabase() ended up working with raw ids
// instead of the {classKey, sectionId, stageId, gradeId, section, stage,
// grade} shape it actually needs) — including right after a bulk Excel
// import. Kept as a distinctly-named function to avoid reintroducing that bug.
function allStudentsFlatRaw(){
  const list = [];
  Object.entries(students).forEach(([ck, roster])=>{
    const [section, stage, grade] = ck.split('|');
    (roster||[]).forEach(s=> list.push(Object.assign({}, s, { section, stage, grade })));
  });
  return list;
}

let ufSelectedStudentIds = [];

function renderUfStudentPicker(){
  const wrap = document.getElementById('ufStudentsWrap');
  const note = document.getElementById('ufStudentsSelectedNote');
  if(!wrap) return;
  const q = (document.getElementById('ufStudentSearch').value||'').trim().toLowerCase();
  let list = allStudentsFlatRaw();
  if(q) list = list.filter(s=> s.name.toLowerCase().includes(q) || (s.displayId||'').toLowerCase().includes(q));
  list.sort((a,b)=> a.name.localeCompare(b.name));
  const shown = list.slice(0,80);
  wrap.innerHTML = shown.map(s=>{
    const sectionLabel = SECTIONS[s.section] ? SECTIONS[s.section].label : s.section;
    const gradeObj = STAGES[s.stage] ? STAGES[s.stage].grades.find(g=>g.id===s.grade) : null;
    const gradeLabel = gradeObj ? gradeObj.label : s.grade;
    const where = [sectionLabel, gradeLabel, s.classroom].filter(Boolean).join(' / ');
    const label = `${s.name}${s.displayId?` (${s.displayId})`:''} — ${where}`;
    const checked = ufSelectedStudentIds.includes(s.id) ? 'checked' : '';
    return `<label class="perm-check"><input type="checkbox" value="${s.id}" onchange="toggleUfStudent('${s.id}', this.checked)" ${checked}> ${escapeHtml(label)}</label>`;
  }).join('') || `<p class="foot-note">No matching students found.</p>`;
  if(list.length > shown.length){
    wrap.innerHTML += `<p class="foot-note">…and ${list.length - shown.length} more — refine your search to find them.</p>`;
  }
  if(note){
    note.textContent = ufSelectedStudentIds.length
      ? `${ufSelectedStudentIds.length} student(s) linked to this account.`
      : 'No students linked yet — this account will not see any report cards until at least one student is checked.';
  }
}

function toggleUfStudent(id, checked){
  if(checked){
    if(!ufSelectedStudentIds.includes(id)) ufSelectedStudentIds.push(id);
  } else {
    ufSelectedStudentIds = ufSelectedStudentIds.filter(x=> x!==id);
  }
  const note = document.getElementById('ufStudentsSelectedNote');
  if(note){
    note.textContent = ufSelectedStudentIds.length
      ? `${ufSelectedStudentIds.length} student(s) linked to this account.`
      : 'No students linked yet — this account will not see any report cards until at least one student is checked.';
  }
}

// Groups ALL_SUBJECTS into logical categories (Languages / Religious Education / Core & Other
// Subjects) so the Assigned Subjects checklist in Manage Users reads clearly instead of one
// long alphabetical list. Any subject not explicitly grouped falls into "Core & Other Subjects"
// automatically, so newly-added subjects never silently disappear from the checklist.
const SUBJECT_GROUPS = [
  { title:'Languages', subjects:['Arabic','English O.L.','English A.L.','French','French O.L.','French A.L.','German','German O.L.','German A.L.'] },
  { title:'Religious Education', subjects:['Religion','Ch-Religion'] },
  { title:'Core & Other Subjects', subjects:['Mathematics','Science','Integrated Sciences','Social Studies','History','Philosophy','Art','ICT'] }
];
function subjectGroupsForChecklist(){
  const grouped = new Set(SUBJECT_GROUPS.flatMap(g=>g.subjects));
  const leftover = ALL_SUBJECTS.filter(s=> !grouped.has(s));
  const groups = SUBJECT_GROUPS.map(g=> ({ title:g.title, subjects:g.subjects.filter(s=> ALL_SUBJECTS.includes(s)) }))
    .filter(g=> g.subjects.length);
  // Any subject added later that isn't in one of the named groups above still shows up,
  // filed under "Core & Other Subjects" so nothing is ever silently hidden.
  if(leftover.length){
    const core = groups.find(g=> g.title==='Core & Other Subjects');
    if(core) core.subjects.push(...leftover);
    else groups.push({ title:'Other Subjects', subjects:leftover });
  }
  return groups;
}
function buildSubjectCheckboxes(selected){
  selected = selected || [];
  const wrap = document.getElementById('ufSubjectsWrap');
  const groups = subjectGroupsForChecklist();
  const groupsHtml = groups.map(g=>{
    const itemsHtml = g.subjects.map(s=>{
      const id = 'ufSubj_' + s.replace(/[^a-zA-Z0-9]/g,'_');
      const checked = selected.includes(s) ? 'checked' : '';
      return `<label class="perm-check"><input type="checkbox" class="uf-subject-cb" id="${id}" value="${s}" ${checked}> ${subjectWithIcon(s)}</label>`;
    }).join('');
    return `<div class="subj-group">${g.title ? `<div class="subj-group-title">${g.title}</div>` : ''}<div class="subj-grid">${itemsHtml}</div></div>`;
  }).join('');
  wrap.innerHTML = `
    <div class="subj-groups-wrap">
      <div class="subj-groups-toolbar">
        <a onclick="setAllUfSubjects(true)">Select all</a>
        <a onclick="setAllUfSubjects(false)">Clear all</a>
      </div>
      ${groupsHtml}
    </div>`;
}
function setAllUfSubjects(checked){
  document.querySelectorAll('.uf-subject-cb').forEach(cb=> cb.checked = checked);
}
// Returns every unique, non-empty Class/Classroom value already entered anywhere in the
// Student Database (across all sections/stages/grades), sorted alphabetically. Used to
// populate the "Assigned Classes" dropdown in Manage Users so admins pick existing classes
// instead of typing them (avoids typos/mismatches with the Grade Book "Class" values).
function getAllClassroomsInDb(){
  const set = new Set();
  Object.values(students).forEach(roster=>{
    (roster||[]).forEach(s=>{
      const c = (s.classroom||'').trim();
      if(c) set.add(c);
    });
  });
  return [...set].sort();
}

let ufSelectedClassrooms = [];

function buildClassroomOptions(selected){
  ufSelectedClassrooms = (selected||[]).slice();
  const panel = document.getElementById('ufClassroomsPanel');
  const all = getAllClassroomsInDb();
  if(!all.length){
    panel.innerHTML = `<p class="foot-note" style="margin:6px;">No classes found yet — add students with a Class value in the Grade Book tab first.</p>`;
  } else {
    panel.innerHTML = all.map(c=>{
      const checked = ufSelectedClassrooms.includes(c) ? 'checked' : '';
      return `<label class="perm-check"><input type="checkbox" class="uf-classroom-cb" value="${escapeXml(c)}" ${checked} onchange="toggleUfClassroom('${c.replace(/'/g,"\\'")}', this.checked)"> ${escapeXml(c)}</label>`;
    }).join('');
  }
  updateUfClassroomsBtnText();
}

function toggleUfClassroom(c, checked){
  if(checked){ if(!ufSelectedClassrooms.includes(c)) ufSelectedClassrooms.push(c); }
  else { ufSelectedClassrooms = ufSelectedClassrooms.filter(x=> x!==c); }
  updateUfClassroomsBtnText();
}

function updateUfClassroomsBtnText(){
  const el = document.getElementById('ufClassroomsBtnText');
  if(!el) return;
  el.textContent = ufSelectedClassrooms.length ? ufSelectedClassrooms.join(', ') : 'Select classes…';
}

function toggleUfClassroomsDD(e){
  if(e) e.stopPropagation();
  document.getElementById('ufClassroomsPanel').classList.toggle('open');
}

function onRoleFormChange(){
  const role = document.getElementById('ufRole').value;
  const needsSection = role==='teacher' || role==='hod' || role==='hos';
  const needsStages = role==='hos' || role==='hod';
  const needsScope = role==='teacher' || role==='hod';
  const needsClassrooms = role==='teacher'; // HOD is scoped by subject+stage, not by classroom
  const needsStudents = role==='parent';
  document.getElementById('ufSectionField').style.display = needsSection ? '' : 'none';
  document.getElementById('ufStagesField').style.display = needsStages ? '' : 'none';
  document.getElementById('ufScopeField').style.display = needsScope ? '' : 'none';
  document.getElementById('ufClassroomsField').style.display = needsClassrooms ? '' : 'none';
  document.getElementById('ufScopeTitle').textContent = role==='hod' ? 'Head of Department access scope' : 'Teacher access scope';
  document.getElementById('ufSubjectsLabel').textContent = role==='hod' ? 'Subject (leave unchecked = no subject yet)' : 'Assigned Subjects (leave all unchecked = no subjects yet)';
  document.getElementById('ufStudentsField').style.display = needsStudents ? '' : 'none';
  if(needsStudents) renderUfStudentPicker();
}
function getUfSelectedStages(){
  return Array.from(document.querySelectorAll('.uf-stage-cb:checked')).map(cb=>cb.value);
}
function setUfSelectedStages(stages){
  stages = stages || [];
  document.querySelectorAll('.uf-stage-cb').forEach(cb=>{ cb.checked = stages.includes(cb.value); });
}
function resetUserForm(){
  document.getElementById('editingUsername').value = '';
  document.getElementById('ufUsername').value = '';
  document.getElementById('ufUsername').disabled = false;
  document.getElementById('ufDisplayName').value = '';
  document.getElementById('ufPassword').value = '';
  document.getElementById('ufRole').value = (currentUser && currentUser.role==='hod') ? 'teacher' : 'admin';
  document.getElementById('ufSection').value = (currentUser && currentUser.role==='hod') ? currentUser.section : 'en';
  buildClassroomOptions([]);
  buildSubjectCheckboxes();
  setUfSelectedStages([]);
  ufSelectedStudentIds = [];
  document.getElementById('ufStudentSearch').value = '';
  onRoleFormChange();
  document.getElementById('ufSubmitBtn').textContent = '＋ Add User';
  document.getElementById('ufCancelBtn').style.display = 'none';
}
// True if `userSection` falls within the current HOD's own section scope. A HOD normally has a
// single fixed section, but one assigned "Both" (empty section value) can manage/view users in
// either section — so an empty currentUser.section always matches. Non-HOD callers always pass.
function hodSectionMatches(userSection){
  if(!currentUser || currentUser.role!=='hod') return true;
  if(!currentUser.section) return true;
  return userSection===currentUser.section;
}
function editUser(username){
  const user = findUser(username);
  if(!user) return;
  if(currentUser.role==='hod' && (user.role==='admin' || user.role==='hod' || user.role==='hos' || !hodSectionMatches(user.section))){
    alert('You can only edit Teacher and Parent/Student accounts within your own section.'); return;
  }
  document.getElementById('editingUsername').value = user.username;
  document.getElementById('ufUsername').value = user.username;
  document.getElementById('ufUsername').disabled = true;
  document.getElementById('ufDisplayName').value = user.displayName || '';
  document.getElementById('ufPassword').value = user.password || '';
  document.getElementById('ufRole').value = user.role;
  document.getElementById('ufSection').value = user.section !== undefined ? user.section : 'en';
  buildClassroomOptions(user.classrooms||[]);
  buildSubjectCheckboxes(user.subjects||[]);
  setUfSelectedStages(user.stages||[]);
  ufSelectedStudentIds = (user.studentIds||[]).slice();
  document.getElementById('ufStudentSearch').value = '';
  onRoleFormChange();
  document.getElementById('ufSubmitBtn').textContent = '💾 Save Changes';
  document.getElementById('ufCancelBtn').style.display = '';
}
function saveUserFromForm(){
  const editing = document.getElementById('editingUsername').value;
  const username = document.getElementById('ufUsername').value.trim();
  const displayName = document.getElementById('ufDisplayName').value.trim();
  const password = document.getElementById('ufPassword').value;
  const role = document.getElementById('ufRole').value;
  const section = document.getElementById('ufSection').value;
  const subjects = Array.from(document.querySelectorAll('.uf-subject-cb:checked')).map(cb=>cb.value);
  const classrooms = ufSelectedClassrooms.slice();
  const stages = getUfSelectedStages();

  if(!username){ alert('Please enter a username.'); return; }
  if(!password){ alert('Please enter a password.'); return; }
  if(currentUser.role==='hod' && (role==='admin' || role==='hod' || role==='hos')){ alert('You can only create Teacher or Parent/Student accounts.'); return; }

  const userObj = { username, displayName, password, role };
  if(role==='teacher' || role==='hod' || role==='hos') userObj.section = section;
  if(role==='hos'){ userObj.stages = stages; }
  if(role==='hod'){ userObj.stages = stages; userObj.subjects = subjects; }
  if(role==='teacher'){ userObj.subjects = subjects; userObj.classrooms = classrooms; }
  if(role==='parent'){ userObj.studentIds = ufSelectedStudentIds.slice(); }

  if(editing){
    const user = findUser(editing);
    if(!user) return;
    const previousRole = user.role;
    Object.assign(user, userObj);
    
    // Auto-sync the Teachers Database whenever this account is (or becomes) a Teacher or a
    // Head of Department. Match primarily by the linked username (reliable even if the name
    // changes later); fall back to matching by name for teacher rows that pre-date this
    // linking, and as a last resort create a fresh Teachers Database row (e.g. role just
    // switched to Teacher/HOD).
    if(role === 'teacher' || role === 'hod'){
      let teacher = teachers.find(t => t.username === editing) || teachers.find(t => t.username === username);
      if(!teacher) teacher = teachers.find(t => !t.username && (t.name === editing || t.name === displayName));
      if(!teacher){
        teacher = { id: uid(), displayId: nextTeacherDisplayId(), classes: '' };
        teachers.push(teacher);
      }
      teacher.username = username;
      teacher.name = displayName || username;
      teacher.section = sectionLabelFromCode(section);
      teacher.subject = subjects.join(', ');
      // Classes stay whatever was picked in Manage Users; admins can also add/adjust
      // them later directly from the Teachers Database "Classes" column. HOD accounts
      // don't collect classrooms in Manage Users, so this simply leaves Classes as-is for them.
      teacher.classes = classrooms.length ? classrooms.join(', ') : (teacher.classes || '');
    } else if(previousRole === 'teacher' || previousRole === 'hod'){
      // Role changed away from Teacher/HOD: drop the linked Teachers Database row.
      // Also tombstone its id in deletedTeacherIds — otherwise the Firestore merge (which
      // only ever adds/updates by id, never removes) will pull the row right back in from
      // an older server copy the next time this device pushes or receives a snapshot.
      const droppedIds = teachers.filter(t => t.username===editing || t.username===username).map(t=>t.id);
      droppedIds.forEach(id=>{ if(!deletedTeacherIds.includes(id)) deletedTeacherIds.push(id); });
      teachers = teachers.filter(t => !(t.username===editing || t.username===username));
    }
    
    if(currentUser && currentUser.username === user.username){
      currentUser = user;
      syncTeacherScopeFromDb(currentUser);
      currentUser.effective = getEffectivePermissions(user);
    }
    saveUsers();
    saveState(); // Save teachers as well
    renderUsersTable();
    renderTeachersDatabase();
    resetUserForm();
    if(currentUser){ currentUser.effective = getEffectivePermissions(currentUser); sanitizeScopedState(); applyPermissionsUI(); }
    logActivity('edit', `Updated user account "${username}" (${ROLE_LABELS[role]||role})${(role==='teacher'||role==='hod') ? ' + updated Teachers Database' : ''}`);
  } else {
    if(findUser(username)){ alert('This username already exists.'); return; }
    // If this exact username was deleted before, its tombstone is still sitting in
    // deletedUsernames — every Firestore push/pull filters users against that list, so
    // without this the newly (re-)created account would get silently stripped back out
    // the moment saveUsers()'s debounced push (or the live sync listener) round-trips it,
    // making it look like the brand-new user was "auto-deleted right after saving".
    deletedUsernames = deletedUsernames.filter(u=> u!==username);
    users.push(userObj);
    
    // Auto-import Teacher/HOD accounts to Teachers Database, filling Section & Subject from
    // what was just entered in Manage Users. Classes can be left blank here and added/edited
    // later directly in the Teachers Database. New rows are appended to the end of the
    // manually orderable list, ready to be moved with the ▲▼ buttons.
    if(role === 'teacher' || role === 'hod'){
      const teacherEntry = {
        id: uid(),
        displayId: nextTeacherDisplayId(),
        name: displayName || username,
        username: username,
        section: sectionLabelFromCode(section),
        subject: subjects.join(', '),
        classes: classrooms.join(', ')
      };
      teachers.push(teacherEntry);
    }
    
    saveUsers();
    saveState(); // Save teachers as well
    renderUsersTable();
    resetUserForm();
    if(currentUser){ currentUser.effective = getEffectivePermissions(currentUser); sanitizeScopedState(); applyPermissionsUI(); }
    logActivity('add', `Created user account "${username}" (${ROLE_LABELS[role]||role})${(role==='teacher'||role==='hod') ? ' + added to Teachers Database' : ''}`);
  }
}
function deleteUserRow(username){
  if(username === 'admin'){ alert('The default administrator account cannot be deleted.'); return; }
  if(currentUser && currentUser.username === username){ alert('You cannot delete the account you are currently logged in with.'); return; }
  const user = findUser(username);
  if(currentUser.role==='hod' && user && (user.role==='admin' || user.role==='hod' || !hodSectionMatches(user.section))){
    alert('You can only delete Teacher and Parent/Student accounts within your own section.'); return;
  }
  if(!confirm(`Delete user "${username}"?`)) return;
  
  // Delete from Teachers Database if user was a Teacher or HOD (match by linked username
  // first, falling back to name-matching for legacy rows created before linking existed)
  if(user && (user.role === 'teacher' || user.role === 'hod')){
    const displayName = user.displayName || username;
    // Tombstone the linked row's id (same reasoning as saveUserFromForm above) so the
    // Firestore merge can't silently resurrect it from an older server copy.
    const droppedIds = teachers.filter(t => t.username ? t.username === username : (t.name === displayName || t.name === username)).map(t=>t.id);
    droppedIds.forEach(id=>{ if(!deletedTeacherIds.includes(id)) deletedTeacherIds.push(id); });
    teachers = teachers.filter(t => t.username ? t.username !== username : (t.name !== displayName && t.name !== username));
  }
  
  users = users.filter(u=> u.username !== username);
  if(!deletedUsernames.includes(username)) deletedUsernames.push(username);
  saveUsers();
  saveState(); // Save teachers as well
  renderUsersTable();
  renderTeachersDatabase();
  logActivity('delete', `Deleted user account "${username}"${user && (user.role === 'teacher' || user.role === 'hod') ? ' + removed from Teachers Database' : ''}`);
}
// Returns the username list this admin/HOD is actually allowed to delete (mirrors the
// same guardrails as the single-row deleteUserRow: never the default admin, never the
// currently logged-in account, and HOD only within their own Teacher/Parent-Student scope).
function deletableUsernamesIn(list){
  return list.filter(u=> u.username!=='admin' && !(currentUser && currentUser.username===u.username))
    .map(u=>u.username);
}
function usersMatchingCurrentFilter(){
  const filterEl = document.getElementById('usersRoleFilter');
  const roleFilter = filterEl ? filterEl.value : 'all';
  let list = users;
  if(currentUser && currentUser.role==='hod'){
    list = users.filter(u=> (u.role==='teacher' || u.role==='parent') && hodSectionMatches(u.section));
  }
  if(roleFilter!=='all') list = list.filter(u=> u.role===roleFilter);
  return list;
}
function renderUsersTable(){
  const body = document.getElementById('usersTableBody');
  const list = usersMatchingCurrentFilter();
  body.innerHTML = list.map(u=>{
    const needsSectionCol = u.role==='teacher' || u.role==='hod' || u.role==='hos';
    const sectionLabel = u.section ? SECTIONS[u.section].label : (needsSectionCol ? 'Both' : '—');
    const scopeInfo = u.role==='parent'
      ? `${Array.isArray(u.studentIds) ? u.studentIds.length : 0} linked student(s)`
      : (u.role==='teacher'
        ? `${(u.subjects||[]).length} subject(s), ${(u.classrooms||[]).length} class(es)`
        : (u.role==='hod' ? 'Entire department' : (u.role==='hos' ? 'Relevant stages' : 'Full system access')));
    const isProtected = u.username==='admin' || (currentUser && currentUser.username===u.username);
    return `
      <tr>
        <td>${isProtected ? '' : `<input type="checkbox" class="user-row-cb" value="${u.username}" onchange="updateUsersBulkCount()">`}</td>
        <td><b>${u.username}</b></td>
        <td>${u.displayName||'—'}</td>
        <td><span class="perm-pill">${ROLE_LABELS[u.role]||u.role}</span></td>
        <td>${sectionLabel}</td>
        <td>${scopeInfo}</td>
        <td class="row-actions">
          <button class="edit-a" onclick="editUser('${u.username}')">Edit</button>
          <button class="del-a" onclick="deleteUserRow('${u.username}')">Delete</button>
        </td>
      </tr>`;
  }).join('');
  const selectAllCb = document.getElementById('usersSelectAllCb');
  if(selectAllCb) selectAllCb.checked = false;
  updateUsersBulkCount();
}
function toggleAllUserRows(checked){
  document.querySelectorAll('.user-row-cb').forEach(cb=> cb.checked = checked);
  updateUsersBulkCount();
}
function updateUsersBulkCount(){
  const countEl = document.getElementById('usersBulkCount');
  if(!countEl) return;
  const n = document.querySelectorAll('.user-row-cb:checked').length;
  countEl.textContent = `${n} selected`;
}
// Deletes every checked row (one or more), reusing deleteUserRow's own safety checks
// (default admin / current account / HOD section scope) for each username, silently
// skipping any that aren't allowed rather than failing the whole batch.
function deleteSelectedUsers(){
  const checked = Array.from(document.querySelectorAll('.user-row-cb:checked')).map(cb=>cb.value);
  if(!checked.length){ alert('Please select at least one user to delete.'); return; }
  if(!confirm(`Delete ${checked.length} selected user(s)? This cannot be undone.`)) return;
  bulkDeleteUsernames(checked);
}
// Deletes every user currently visible under the active role filter (respecting the same
// HOD section scoping as the table itself) — "all" in the filter deletes every deletable
// account in the whole system, so a confirmation naming the exact count is shown first.
function deleteAllUsersInFilter(){
  const list = usersMatchingCurrentFilter();
  const usernames = deletableUsernamesIn(list);
  if(!usernames.length){ alert('There are no deletable users in this filter.'); return; }
  const filterEl = document.getElementById('usersRoleFilter');
  const roleLabel = filterEl && filterEl.value!=='all' ? (ROLE_LABELS[filterEl.value]||filterEl.value) : 'ALL roles';
  if(!confirm(`Delete ALL ${usernames.length} user(s) matching "${roleLabel}"? This cannot be undone.`)) return;
  bulkDeleteUsernames(usernames);
}
function bulkDeleteUsernames(usernames){
  let deleted = 0, skipped = 0;
  usernames.forEach(username=>{
    if(username==='admin' || (currentUser && currentUser.username===username)){ skipped++; return; }
    const user = findUser(username);
    if(currentUser.role==='hod' && user && (user.role==='admin' || user.role==='hod' || !hodSectionMatches(user.section))){ skipped++; return; }
    if(user && (user.role==='teacher' || user.role==='hod')){
      const displayName = user.displayName || username;
      const droppedIds = teachers.filter(t=> t.username ? t.username===username : (t.name===displayName || t.name===username)).map(t=>t.id);
      droppedIds.forEach(id=>{ if(!deletedTeacherIds.includes(id)) deletedTeacherIds.push(id); });
      teachers = teachers.filter(t=> t.username ? t.username!==username : (t.name!==displayName && t.name!==username));
    }
    users = users.filter(u=> u.username!==username);
    if(!deletedUsernames.includes(username)) deletedUsernames.push(username);
    deleted++;
  });
  saveUsers();
  saveState();
  renderUsersTable();
  renderTeachersDatabase();
  logActivity('delete', `Bulk-deleted ${deleted} user account(s)${skipped ? ` (${skipped} skipped — protected or out of scope)` : ''}`);
  alert(`Deleted ${deleted} user(s).${skipped ? ` ${skipped} were skipped (protected accounts or out of your scope).` : ''}`);
}

/* ---------- Bulk import users from Excel ---------- */
function findRoleId(label){
  label = (label||'').toString().trim();
  if(/^admin$/i.test(label) || /مدير/.test(label)) return 'admin';
  if(/hos|deputies|نائب/.test(label)) return 'hos';
  if(/^teacher$/i.test(label) || /معلم|مدرس/.test(label)) return 'teacher';
  if(/head of department/i.test(label) || /رئيس/.test(label)) return 'hod';
  if(/^parent(\s*\/\s*student)?$/i.test(label) || /^student$/i.test(label) || /ولي أمر|والد|أب|أم|طالب/.test(label)) return 'parent';
  return null;
}

function downloadUserTemplate(){
  const sample = [
    { "Username":"mona.teacher", "Display Name":"Mona Adel", "Password":"12345", "Role":"Teacher",
      "Section":"English Section", "Subjects":"Mathematics; Science", "Classes":"3/A; 4/B", "Student ID(s)":"" },
    { "Username":"fatima.hos", "Display Name":"Fatima Deputy", "Password":"12345", "Role":"HOS/Deputy",
      "Section":"French Section", "Subjects":"", "Classes":"", "Student ID(s)":"" },
    { "Username":"ahmed.hod", "Display Name":"Ahmed Samir", "Password":"12345", "Role":"Head of Department",
      "Section":"French Section", "Subjects":"Mathematics", "Classes":"", "Student ID(s)":"" },
    { "Username":"sara.parent", "Display Name":"Sara's Parent", "Password":"12345", "Role":"Parent / Student",
      "Section":"English Section", "Subjects":"", "Classes":"", "Student ID(s)":"MILS-3188" },
    { "Username":"omar.parent", "Display Name":"Omar's Parent", "Password":"12345", "Role":"Parent / Student",
      "Section":"English Section", "Subjects":"", "Classes":"", "Student ID(s)":"MILS-3190; MILS-3191" },
    { "Username":"", "Display Name":"", "Password":"", "Role":"", "Section":"", "Subjects":"", "Classes":"", "Student ID(s)":"" }
  ];
  const wsData = XLSX.utils.json_to_sheet(sample);
  const guide = [
    { "Field":"Username", "Allowed Values":"Unique login name, no spaces recommended" },
    { "Field":"Password", "Allowed Values":"Any text — the user can change it later" },
    { "Field":"Role", "Allowed Values":"Admin / HOS/Deputy / Teacher / Head of Department / Parent / Student" },
    { "Field":"Section", "Allowed Values":"English Section / French Section — required for Teacher, HOS/Deputy, Head of Department and Parent/Student (leave blank for Admin)" },
    { "Field":"Subjects", "Allowed Values":"Semicolon-separated subject names — required for Teacher and Head of Department (a Head of Department normally has just one). Not used for Parent/Student. Available: " + ALL_SUBJECTS.join(', ') },
    { "Field":"Classes", "Allowed Values":"Semicolon-separated class values (must match the 'Class' step used in Grade Book, e.g. 3/A) — only for Teacher, leave blank for Head of Department and Parent/Student" },
    { "Field":"Student ID(s)", "Allowed Values":"Only for Parent/Student rows — one or more Student ID(s) from the Students Database (either the STU-#### or MILS-#### format, whichever that student has), separated by semicolons for a parent with more than one child at the school. You don't need to get the prefix exactly right — the last 4 digits alone are enough to find the right student, as long as they're unique. The account is created AND linked to that child in this same import — no separate 'Link Parent Accounts' step needed. Leave blank for every other role." }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guide);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, "Users");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Allowed Values");
  XLSX.writeFile(wb, "Users_Import_Template.xlsx");
}

/* ---------- Bulk-link Parent/Student accounts to specific students ---------- */
function downloadParentLinkTemplate(){
  const sample = [
    { "Username":"sara.parent", "Student ID(s)":"STU-0012" },
    { "Username":"ahmed.parent", "Student ID(s)":"STU-0034; STU-0035" },
    { "Username":"", "Student ID(s)":"" }
  ];
  const wsData = XLSX.utils.json_to_sheet(sample);
  const guide = [
    { "Field":"Username", "Notes":"Must match an EXISTING Parent/Student account username exactly (create the account first via 'Add Users from Excel' or the form above)." },
    { "Field":"Student ID(s)", "Notes":"The student's ID from the Students Database — either the 'STU-####' or 'MILS-####' format, whichever that student has (visible in the 'ID' column of a Student Database export, or in the Grade Book). The prefix doesn't need to match exactly — the last 4 digits alone are enough to find the right student, as long as they're unique. Separate multiple IDs (for parents with more than one child) with a semicolon, e.g. STU-0034; STU-0035." },
    { "Field":"Note", "Notes":"Re-uploading a username that was already linked REPLACES its previous student list — it does not add to it." }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guide);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, "Parent Links");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Instructions");
  XLSX.writeFile(wb, "Parent_Student_Linking_Template.xlsx");
}

function importParentLinksExcel(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      const flat = allStudentsFlat();
      const idIndex = buildStudentIdIndex(flat);

      let linked = 0;
      let viaFallbackCount = 0;
      const problems = [];
      // Merge multiple rows for the same username into one final ID list, rather than
      // letting a later row silently wipe out IDs collected from an earlier row.
      const pending = new Map();

      rows.forEach(row=>{
        const username = (row['Username']||'').toString().trim();
        const idsRaw = (row['Student ID(s)']||row['Student ID']||row['StudentIDs']||'').toString().trim();
        if(!username && !idsRaw) return; // skip blank helper rows
        if(!username){ problems.push(`(missing username): row skipped`); return; }

        const user = findUser(username);
        if(!user){ problems.push(`${username}: no such user account`); return; }
        if(user.role !== 'parent'){ problems.push(`${username}: is not a Parent/Student account (role: ${ROLE_LABELS[user.role]||user.role})`); return; }

        const tokens = idsRaw.split(/[;,]/).map(t=>t.trim()).filter(Boolean);
        if(!tokens.length){ problems.push(`${username}: no Student ID(s) given`); return; }

        const resolvedIds = pending.has(username) ? pending.get(username) : [];
        tokens.forEach(tok=>{
          const { matches, viaFallback } = resolveStudentIdToken(tok, idIndex);
          if(!matches.length){ problems.push(`${username}: student ID "${tok}" not found — check the exact ID in Student Database, or just the last 4 digits`); return; }
          if(matches.length>1){ problems.push(`${username}: student ID "${tok}" matches more than one student — please fix the duplicate ID in Student Database first`); return; }
          if(viaFallback) viaFallbackCount++;
          if(!resolvedIds.includes(matches[0].id)) resolvedIds.push(matches[0].id);
        });
        pending.set(username, resolvedIds);
      });

      pending.forEach((ids, username)=>{
        const user = findUser(username);
        if(!user) return;
        user.studentIds = ids;
        linked++;
      });

      if(linked>0){ saveUsers(); renderUsersTable(); }

      document.getElementById('importTitle').textContent = 'Parent Linking Result';
      let msg = `${linked} account(s) linked/updated successfully.`;
      if(viaFallbackCount>0){
        msg += `<br><span style="color:var(--green);font-weight:800;">🔗 ${viaFallbackCount} ID(s) matched by their last 4 digits (the prefix typed in the file didn't match exactly, e.g. STU- vs MILS-) — double-check these are the right student(s).</span>`;
      }
      if(problems.length){
        msg += `<br><br><b>${problems.length} issue(s):</b><br>` +
          problems.slice(0,10).map(p=>`• ${p}`).join('<br>') +
          (problems.length>10 ? `<br>... and ${problems.length-10} more` : '');
      }
      document.getElementById('importMsg').innerHTML = msg;
      document.getElementById('importResultOverlay').classList.add('show');
      logActivity('edit', `Bulk-linked ${linked} parent account(s) to students via Excel`);
    }catch(err){
      alert('Could not read the file. Make sure the file format and column names match the template.');
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('parentLinkExcelInput').value='';
}

function importUsersExcel(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      let added = 0;
      let linkedAuto = 0;
      let viaFallbackIdCount = 0;
      const problems = [];

      // Column headers can vary slightly (extra spaces, different case, "Subject" instead
      // of "Subjects", etc.) — look them up case-insensitively instead of requiring an exact
      // match, the same way importTeachersExcel already does.
      function getField(row, candidates){
        const normalizedMap = {};
        Object.keys(row).forEach(k=>{ normalizedMap[k.trim().toLowerCase()] = row[k]; });
        for(const c of candidates){
          const v = normalizedMap[c.toLowerCase()];
          if(v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      }
      // Accept both ";" and "," as the separator between multiple subjects/classes, since
      // the template uses ";" but a hand-edited sheet commonly uses ",".
      const splitMulti = (raw) => raw ? raw.split(/[;,]/).map(s=>s.trim()).filter(Boolean) : [];

      // Same Student ID -> student lookup importParentLinksExcel() uses, built once here so
      // a Parent/Student row's "Student ID(s)" column can be resolved and linked in this same
      // pass — creating the account AND linking it to the child in one upload, instead of
      // needing a separate "Link Parent Accounts" import afterwards.
      const idIndex = buildStudentIdIndex(allStudentsFlat());

      rows.forEach((row, idx)=>{
        // Each row is now isolated in its own try/catch. Previously the entire
        // rows.forEach ran inside ONE try block shared with saveUsers()/saveState()
        // below — if any single row threw an unexpected error, the exception would
        // abort the loop immediately and skip saveUsers() entirely. Any rows already
        // pushed into the in-memory `users`/`teachers` arrays before the throw would
        // still render on screen (looking like a successful import), but since
        // saveUsers() never ran, nothing was actually written to localStorage or
        // Firestore — so the "added" rows would silently disappear the moment the
        // page was refreshed, while a one-at-a-time manual "Add User" (which always
        // reaches its own saveUsers() call for that single user) would not be
        // affected. Wrapping each row individually means one bad/unexpected row is
        // reported as a problem and skipped, instead of quietly discarding every
        // row that came after it — and before it, in memory only.
        try{
          const username = getField(row, ['Username']);
          const displayName = getField(row, ['Display Name','DisplayName','Name']);
          const password = getField(row, ['Password']);
          const roleLabel = getField(row, ['Role']);
          const sectionLabel = getField(row, ['Section']);
          const subjectsRaw = getField(row, ['Subjects','Subject']);
          const classesRaw = getField(row, ['Classes','Class']);
          const studentIdsRaw = getField(row, ['Student ID(s)','Student IDs','Student ID','StudentIDs']);

          if(!username){ return; } // skip fully blank helper rows
          if(!password){ problems.push(`${username}: missing password`); return; }
          if(findUser(username)){ problems.push(`${username}: username already exists`); return; }
          if(currentUser.role==='hod'){ problems.push(`${username}: bulk import is only available to Admin`); return; }

          const role = findRoleId(roleLabel);
          if(!role){ problems.push(`${username}: unrecognized "Role" value ("${roleLabel}")`); return; }

          let sectionId = null;
          if(role!=='admin'){
            sectionId = findSectionId(sectionLabel);
            if(!sectionId){ problems.push(`${username}: unrecognized "Section" value ("${sectionLabel}")`); return; }
          }

          const userObj = { username, displayName, password, role };
          if(sectionId) userObj.section = sectionId;
          if(role==='teacher' || role==='hod'){
            userObj.subjects = splitMulti(subjectsRaw);
            userObj.classrooms = splitMulti(classesRaw);
            if(role==='hod' && !userObj.subjects.length){
              problems.push(`${username}: Head of Department has no "Subjects" value in this row — added with Subject left blank, please fill it in manually`);
            }
          }
          // Parent/Student rows link straight to their child(ren) via the "Student ID(s)"
          // column — resolved against the Students Database the same way importParentLinksExcel()
          // does, so the account is created AND linked in this one upload.
          if(role==='parent'){
            const tokens = splitMulti(studentIdsRaw);
            const resolvedIds = [];
            tokens.forEach(tok=>{
              const { matches, viaFallback } = resolveStudentIdToken(tok, idIndex);
              if(!matches.length){ problems.push(`${username}: student ID "${tok}" not found — check the exact ID in Student Database, or just the last 4 digits`); return; }
              if(matches.length>1){ problems.push(`${username}: student ID "${tok}" matches more than one student — please fix the duplicate ID in Student Database first`); return; }
              if(viaFallback) viaFallbackIdCount++;
              if(!resolvedIds.includes(matches[0].id)) resolvedIds.push(matches[0].id);
            });
            if(!tokens.length){ problems.push(`${username}: no "Student ID(s)" given — account created but not linked to any student yet`); }
            else if(resolvedIds.length){ linkedAuto++; }
            userObj.studentIds = resolvedIds;
          }
          // Clear any leftover deletion-tombstone for this username — see the matching
          // comment in saveUserFromForm() above for why this is required.
          deletedUsernames = deletedUsernames.filter(u=> u!==username);
          users.push(userObj);
          added++;

          // Auto-import Teacher AND Head of Department accounts into the Teachers Database
          // too, filling Section & Subject from the row just imported (Classes can be added
          // later) — matching what the manual "Add User" form already does for both roles.
          // (Previously this only checked role==='teacher', so HOD accounts silently never
          // made it into the Teachers Database on bulk import.)
          if(role === 'teacher' || role === 'hod'){
            const alreadyLinked = teachers.some(t=> t.username === username);
            if(!alreadyLinked){
              teachers.push({
                id: uid(),
                displayId: nextTeacherDisplayId(),
                name: displayName || username,
                username: username,
                section: sectionLabelFromCode(sectionId),
                subject: userObj.subjects.join(', '),
                classes: userObj.classrooms.join(', ')
              });
            }
          }
        }catch(rowErr){
          console.warn('Row import failed', row, rowErr);
          problems.push(`Row ${idx+2}: unexpected error, skipped (${rowErr && rowErr.message ? rowErr.message : rowErr})`);
        }
      });

      const savedOk = saveUsers();
      saveState(); // Save teachers as well

      // Verify the save actually reached localStorage instead of trusting that
      // saveUsers() succeeded just because it didn't throw. This is the check that
      // directly catches the "added successfully" message appearing while the data
      // never actually persisted (e.g. localStorage quota exceeded) — the exact
      // failure mode that makes Excel-imported users vanish after a page refresh
      // while manually-added ones (a much smaller write) don't.
      let persistedOk = savedOk;
      if(persistedOk && added>0){
        try{
          const raw = localStorage.getItem(USERS_LS_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          const persistedUsernames = new Set((parsed && parsed.users || []).map(u=>u.username));
          persistedOk = users.every(u => persistedUsernames.has(u.username));
        }catch(verifyErr){
          persistedOk = false;
        }
      }

      renderUsersTable();
      renderTeachersDatabase();
      document.getElementById('importTitle').textContent = 'Users Import Result';
      let msg;
      if(!persistedOk){
        msg = `⚠️ ${added} user(s) were added on screen, but could NOT be saved to this browser's storage ` +
          `(it may be full). <b>Do not refresh the page</b> — free up space (e.g. Manage Users → remove ` +
          `unused accounts, or clear old browser data) and re-import this file, otherwise these users will ` +
          `disappear on refresh.`;
      }else{
        msg = `${added} user(s) added successfully.`;
      }
      if(linkedAuto>0){
        msg += `<br><span style="color:var(--green);font-weight:800;">🔗 ${linkedAuto} Parent/Student account(s) were linked to their child automatically in this same step — no separate linking upload needed.</span>`;
      }
      if(viaFallbackIdCount>0){
        msg += `<br><span style="color:var(--amber);font-weight:800;">⚠ ${viaFallbackIdCount} Student ID(s) matched by their last 4 digits only (the prefix typed in the file didn't match exactly, e.g. STU- vs MILS-) — double-check these are the right student(s) in the table below.</span>`;
      }
      if(problems.length){
        msg += `<br><br><b>${problems.length} row(s) could not be added:</b><br>` +
          problems.slice(0,8).map(p=>`• ${p}`).join('<br>') +
          (problems.length>8 ? `<br>... and ${problems.length-8} more` : '');
      }
      document.getElementById('importMsg').innerHTML = msg;
      document.getElementById('importResultOverlay').classList.add('show');
    }catch(err){
      alert('Could not read the file. Make sure the file format and column names match the template.');
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('usersExcelInput').value='';
}

/* ================== FIREBASE SYNC ================== */
// TODO: replace with your own Firebase project config (Firebase console →
// Project settings → General → "Your apps" → SDK setup and configuration).
const firebaseConfig = {
  apiKey: "AIzaSyCap0anQk_m2rXfE4Q7vGYmrGIFMhlw1Q8",
  authDomain: "mils-gb.firebaseapp.com",
  databaseURL: "https://mils-gb-default-rtdb.firebaseio.com",
  projectId: "mils-gb",
  storageBucket: "mils-gb.firebasestorage.app",
  messagingSenderId: "341467982167",
  appId: "1:341467982167:web:f9dfd25b8b667d4f38b612",
  measurementId: "G-LVXGGHGQ9G"
};
const fbApp = firebase.initializeApp(firebaseConfig);
const fbDb  = firebase.firestore();
// Everything lives in a single document — simplest possible shape for a
// small dataset like a grade book, and it lets us use one real-time
// listener (onSnapshot) to keep every open browser in sync automatically.
const FB_DOC_REF = fbDb.collection('gradebook').doc('main');

const GITHUB_CFG_KEY = 'gradesSystemFirebaseCfg_v1'; // kept name for minimal disruption to storage; holds { enabled }
let githubConfig = null; // { enabled }
let fbUnsubscribe = null;
let fbApplyingRemote = false; // guard so a remote snapshot doesn't immediately re-trigger a push
let fbLastPushedAt = 0;
// Every push tags the document with a version number one higher than the last version we
// know about (ours or a remote one we've already applied). The live listener only applies an
// incoming snapshot if its version is strictly newer than this. This protects against a slow
// round-trip: if the local push takes a while to echo back (or never lands as an "echo" within
// the old fixed time window) and the person keeps entering grades in the meantime, the stale
// echo/snapshot is recognized as not-newer and is ignored instead of overwriting the freshly
// entered grades still sitting only in memory/localStorage.
let knownDataVersion = 0;

function loadGithubConfig(){
  try{
    const raw = localStorage.getItem(GITHUB_CFG_KEY);
    githubConfig = raw ? JSON.parse(raw) : { enabled: true }; // sync on by default
  }catch(err){ githubConfig = { enabled: true }; }
}
function persistGithubConfig(){
  try{ localStorage.setItem(GITHUB_CFG_KEY, JSON.stringify(githubConfig)); }
  catch(err){ console.warn('Could not save Firebase sync settings', err); }
}

function githubReady(){ return !!(githubConfig && githubConfig.enabled); }
function githubPullReady(){ return true; } // Firestore doc is always reachable, no credentials needed

function setSyncStatus(state){
  const el = document.getElementById('githubSyncStatus');
  if(!el) return;
  if(!currentUser || currentUser.role!=='admin'){ el.style.display = 'none'; return; }
  if(!githubConfig || !githubConfig.enabled){ el.style.display = 'none'; return; }
  const map = {
    idle:    ['☁ Not synced yet', '#B8B2A0'],
    syncing: ['☁ Syncing…', 'var(--gold-deep)'],
    synced:  ['☁ Synced with Firebase', 'var(--green)'],
    error:   ['⚠ Firebase sync error', 'var(--red)']
  };
  const [text,color] = map[state] || map.idle;
  el.textContent = text;
  el.style.color = color;
  el.style.display = 'inline-flex';
  if(state!=='idle') flashSyncBadgeNearEdit(text, color);
}

// Shows a small floating pill at the last-edited cell's position, so whoever is
// entering grades sees the sync outcome right where they're looking instead of
// having to glance up at the header. Skipped if the edit was too long ago (e.g. the
// sync was triggered by something other than a recent grade entry).
function flashSyncBadgeNearEdit(text, color){
  if(!lastEditRect || (Date.now() - lastEditTime) > 15000) return;
  const badge = document.createElement('div');
  badge.className = 'inline-sync-badge';
  badge.textContent = text;
  badge.style.background = color;
  badge.style.left = '12px';
  badge.style.top = (lastEditRect.top + lastEditRect.height/2) + 'px';
  document.body.appendChild(badge);
  requestAnimationFrame(()=> badge.classList.add('show'));
  setTimeout(()=>{
    badge.classList.remove('show');
    setTimeout(()=> badge.remove(), 200);
  }, 1600);
}

function applyRemotePayload(payload){
  if(!payload) return;
  fbApplyingRemote = true;
  // If this device has Grade Book edits sitting locally that haven't been pushed
  // yet (gbUnsavedChanges), blindly replacing students/scores/attendance/teachers
  // with the incoming snapshot would silently wipe them out the moment ANY other
  // device pushes anything — even something unrelated like a Bell Times change.
  // Merge instead (remote as the base, local pending edits win per key) so those
  // unsaved edits survive until the person actually presses Save.
  // Union deleted-teacher tombstones from the incoming snapshot with whatever this device
  // already knows about, then use that to keep any resurrected-by-merge rows out of the
  // final teachers list, however teachers ends up being set below.
  // EXCEPTION: a teacher id currently present in our own in-memory `teachers` (just added
  // or re-added on this device, e.g. via Excel import) is excluded from the tombstone list —
  // otherwise a stale tombstone that reached the server from an earlier, unrelated deletion
  // would keep silently stripping that row back out on every pull/page-refresh forever.
  const currentTeacherIdsAtApply = new Set(teachers.map(t=>t.id));
  deletedTeacherIds = Array.from(new Set([...(payload.deletedTeacherIds||[]), ...deletedTeacherIds]))
    .filter(id => !currentTeacherIdsAtApply.has(id));
  // teachers is ALWAYS merged (never hard-replaced), regardless of gbUnsavedChanges. A pure
  // replace here was the remaining path that could make a just-imported/just-added teacher
  // vanish: if this device's own push hadn't fully round-tripped yet, or a same-document
  // snapshot arrived from a source (this tab's own listener re-attaching, a delayed/duplicate
  // event, etc.) carrying a copy of teachers older than what's in memory, a hard replace would
  // silently drop the new rows. Merging is safe even when there's nothing pending locally —
  // it's a superset by id, and deletedTeacherIds still prunes anything genuinely deleted.
  teachers = mergeArrayById(payload.teachers, teachers, 'id');
  teacherIdCounter = Math.max(payload.teacherIdCounter || 1, teacherIdCounter || 1);
  if(gbUnsavedChanges){
    students = mergeObjectField(payload.students, students);
    scores = mergeObjectField(payload.scores, scores);
    attendance = mergeObjectField(payload.attendance, attendance);
    approvedLeave = mergeObjectField(payload.approvedLeave, approvedLeave);
    studentIdCounter = Math.max(payload.studentIdCounter || 1, studentIdCounter || 1);
    grade3FlexibleMaximaBySubject = mergeObjectField(payload.grade3FlexibleMaxima, grade3FlexibleMaximaBySubject);
  }else{
    students = payload.students || {};
    scores = payload.scores || {};
    studentIdCounter = payload.studentIdCounter || 1;
    attendance = payload.attendance || {};
    approvedLeave = payload.approvedLeave || {};
    grade3FlexibleMaximaBySubject = payload.grade3FlexibleMaxima || grade3FlexibleMaximaBySubject || {};
  }
  teachers = teachers.filter(t=> !deletedTeacherIds.includes(t.id));
  try{ localStorage.setItem(GRADE3_MAXIMA_LS_KEY, JSON.stringify(grade3FlexibleMaximaBySubject)); }catch(err){}
  knownDataVersion = Math.max(knownDataVersion, payload.dataVersion || 0);
  if(Array.isArray(payload.users) && payload.users.length){
    // Same fix as deletedTeacherIds above, and the direct cause of the reported bug:
    // a username currently present in our own in-memory `users` (just added/re-imported
    // on this device) is excluded from the merged tombstone list instead of being unioned
    // in from the server's copy. Previously, if that exact username had EVER been deleted
    // before — even long ago, even by a different admin/device, unrelated to this import —
    // its tombstone would still be sitting in the server's `deletedUsernames`, and the very
    // next pull (e.g. the page refresh right after a bulk Excel import) would silently
    // filter the freshly-added user back out, making it look "auto-deleted".
    const currentUsernamesAtApply = new Set(users.map(u=>u.username));
    deletedUsernames = Array.from(new Set([...(payload.deletedUsernames||[]), ...deletedUsernames]))
      .filter(u => !currentUsernamesAtApply.has(u));
    // This used to hard-replace `users` with whatever the incoming snapshot contained. If an
    // admin had just added/edited a user (e.g. a Teacher) and that edit hadn't reached
    // Firestore yet (saveUsers()'s push is debounced by ~2.5s — see scheduleGithubPush()),
    // any snapshot that arrived in that window — from another device, or a delayed echo of
    // an older write — would silently overwrite the brand-new local edit and then persist
    // that older list back to localStorage, making the user (often a just-added/edited
    // Teacher account) appear to have been "deleted" right after saving. Merge with the
    // current in-memory `users` instead, the same way `teachers` is merged above, so a local
    // edit that hasn't round-tripped to Firestore yet always survives.
    users = mergeArrayById(payload.users, users, 'username').filter(u=> !deletedUsernames.includes(u.username));
    saveUsersLocalOnly();
  }
  if(Array.isArray(payload.activityLog) && payload.activityLog.length){
    const map = {};
    activityLog.forEach(e=> map[e.id]=e);
    payload.activityLog.forEach(e=> map[e.id]=e);
    activityLog = Object.values(map).sort((a,b)=> b.ts-a.ts).slice(0, ACTIVITY_LOG_MAX);
    saveActivityLogLocalOnly();
  }
  if(payload.termMonthDates && payload.termMonthDates.term1 && payload.termMonthDates.term2){
    termMonthDates = normalizeTermMonthDates(payload.termMonthDates);
    saveTermMonthDatesLocalOnly();
  }
  if(payload.examSchedules && payload.examSchedules.term1 && payload.examSchedules.term2){
    examSchedules = normalizeExamSchedules(payload.examSchedules);
    saveExamSchedulesLocalOnly();
  }
  if(payload.examSeatAssignments && payload.examSeatAssignments.term1 && payload.examSeatAssignments.term2){
    examSeatAssignments = normalizeExamSeatAssignments(payload.examSeatAssignments);
    saveExamSeatAssignmentsLocalOnly();
  }
  if(payload.bellTimes){
    bellTimes = normalizeBellTimes(payload.bellTimes);
    saveBellTimesLocalOnly();
  }
  if(payload.adminStructure){
    adminStructure = normalizeAdminStructure(payload.adminStructure);
    saveAdminStructureLocalOnly();
  }
  if(Array.isArray(payload.blockedStudentIds)){
    blockedStudentIds = payload.blockedStudentIds;
    saveBlockedStudentsLocalOnly();
  }
  if(payload.gradeEntryLockRules || payload.gradeEntryLockConfig){
    gradeEntryLockRules = gradeEntryLockRulesFromPayload(payload) || [];
    saveGradeEntryLockConfigLocalOnly();
  }
  if(payload.presenceBucket && !presenceBucket){
    presenceBucket = payload.presenceBucket;
    try{ localStorage.setItem(PRESENCE_BUCKET_LS_KEY, presenceBucket); }catch(err){}
  }
  if(Array.isArray(payload.reportCardReleases)){
    reportCardReleases = payload.reportCardReleases;
    saveReportCardReleases();
  }
  if(Array.isArray(payload.examScheduleReleases)){
    examScheduleReleases = payload.examScheduleReleases;
    saveExamScheduleReleasesLocalOnly();
  }
  // A Teacher/HOD who was already logged in before this snapshot arrived (e.g. right after
  // page load, before the very first Firestore pull completes) had their Class/Subject scope
  // computed with an empty/stale `teachers` list. Now that `teachers` has just been merged
  // in above, re-sync that scope from it and refresh the stepper so the Teacher immediately
  // sees the Classes/Subjects actually assigned to them in the database, instead of only
  // picking them up on next login.
  if(currentUser && (currentUser.role==='teacher' || currentUser.role==='hod')){
    syncTeacherScopeFromDb(currentUser);
    currentUser.effective = getEffectivePermissions(currentUser);
    sanitizeScopedState();
    if(typeof renderStepper==='function') renderStepper();
    if(typeof renderAttendanceStepper==='function') renderAttendanceStepper();
  }
  saveStateLocalOnly();
  renderDatabase();
  if(typeof renderTeachersDatabase==='function') renderTeachersDatabase();
  if(typeof renderTable==='function') renderTable();
  if(typeof renderAttendanceWorkspace==='function') renderAttendanceWorkspace();
  // Re-render the Certificates tab live if a Parent/Student (or Admin) currently has it open,
  // so a newly-released Report Card appears immediately without needing a manual refresh.
  if(currentView==='certReports' && typeof renderCertReportsWorkspace==='function'){
    if(typeof renderCertReportsStepper==='function') renderCertReportsStepper();
    renderCertReportsWorkspace();
  }
  if(document.getElementById('reportCardReleaseOverlay') && document.getElementById('reportCardReleaseOverlay').classList.contains('show')){
    renderReportCardReleaseTable();
  }
  if(document.getElementById('examScheduleReleaseOverlay') && document.getElementById('examScheduleReleaseOverlay').classList.contains('show')){
    renderExamScheduleReleaseTable();
  }
  if(currentUser){
    if(isViewerAccountBlocked()){
      showAccountBlockedScreen();
    } else if(document.getElementById('accountBlockedPanel') && document.getElementById('accountBlockedPanel').style.display==='flex'){
      // was blocked, just got unblocked remotely — restore normal navigation
      document.getElementById('mainNav').style.display = '';
      document.getElementById('accountBlockedPanel').style.display = 'none';
      const allowed = firstAllowedTab();
      if(allowed) switchView(allowed);
      else document.getElementById('noAccessPanel').style.display = 'flex';
    }
  }
  fbApplyingRemote = false;
  // gbUnsavedChanges is deliberately left untouched here: if this device had
  // pending local edits, the merge above kept them in memory and they still
  // need their own Save press; if it didn't, it was already false.
  updateGradeBookSaveUI();
}

/* One-off pull — used for the manual "Pull Latest" button and the initial
   load before the live listener takes over. */
async function pullFromGithub(silent){
  setSyncStatus('syncing');
  try{
    const snap = await FB_DOC_REF.get();
    if(!snap.exists){ setSyncStatus('idle'); return false; }
    applyRemotePayload(snap.data());
    setSyncStatus('synced');
    return true;
  }catch(err){
    console.warn('Firebase pull failed', err);
    setSyncStatus('error');
    if(!silent) alert('Could not fetch data from Firebase. Please check your internet connection and Firestore security rules.');
    return false;
  }
}

/* Live listener: any browser's write shows up here within moments, with no
   manual pull needed. */
function startFirebaseLiveSync(){
  if(fbUnsubscribe) return;
  fbUnsubscribe = FB_DOC_REF.onSnapshot(snap=>{
    if(!snap.exists) return;
    const data = snap.data();
    // Ignore our own push's echo — recognized by version, not just elapsed time, so a slow
    // round-trip can't slip past the guard and stomp on grades entered in the meantime.
    const incomingVersion = data.dataVersion || 0;
    if(incomingVersion>0 && incomingVersion<=knownDataVersion) return;
    if(Date.now() - fbLastPushedAt < 1500) return;
    applyRemotePayload(data);
    setSyncStatus('synced');
  }, err=>{
    console.warn('Firebase live sync error', err);
    setSyncStatus('error');
  });
}
function stopFirebaseLiveSync(){
  if(fbUnsubscribe){ fbUnsubscribe(); fbUnsubscribe = null; }
}

async function pushToGithub(){
  if(!githubReady()) return false;
  setSyncStatus('syncing');
  const ok = await pushMergedToFirestoreWithRetry();
  setSyncStatus(ok ? 'synced' : 'error');
  return ok;
}

let githubPushTimer = null;
function scheduleGithubPush(){
  if(!githubReady() || fbApplyingRemote) return; // don't echo back a change we just received
  clearTimeout(githubPushTimer);
  githubPushTimer = setTimeout(()=> pushToGithub(), 2500);
}

/* ---------- Firebase Sync modal ---------- */
function openGithubModal(){
  if(!currentUser || currentUser.role!=='admin'){ alert('Only the Admin can configure Firebase sync.'); return; }
  loadGithubConfig();
  const cfg = githubConfig || {};
  document.getElementById('fbProjectLabel').textContent = firebaseConfig.projectId || '—';
  document.getElementById('ghEnabled').checked = !!cfg.enabled;
  document.getElementById('ghModalStatus').textContent = cfg.enabled ? 'Automatic live sync is currently ON.' : 'Automatic live sync is currently OFF.';
  document.getElementById('githubOverlay').classList.add('show');
}
function closeGithubModal(){
  document.getElementById('githubOverlay').classList.remove('show');
}
function saveGithubSettings(){
  const enabled = document.getElementById('ghEnabled').checked;
  githubConfig = { enabled };
  persistGithubConfig();
  document.getElementById('ghModalStatus').textContent = enabled ? 'Settings saved. Automatic live sync is ON.' : 'Settings saved. Automatic live sync is OFF.';
  setSyncStatus('idle');
  if(enabled){ pullFromGithub(true); startFirebaseLiveSync(); }
  else stopFirebaseLiveSync();
}
function manualPushToGithub(){
  if(!githubReady()){ alert('Please enable Firebase sync first.'); return; }
  pushToGithub().then(ok=>{
    document.getElementById('ghModalStatus').textContent = ok ? 'Pushed to Firebase successfully.' : 'Push failed — check the console/Firestore rules.';
  });
}
function manualPullFromGithub(){
  pullFromGithub(false).then(ok=>{
    document.getElementById('ghModalStatus').textContent = ok ? 'Latest data pulled from Firebase.' : 'Pull failed or no data saved yet on Firebase.';
    if(ok) applyPermissionsUI();
  });
}
function disableGithubSync(){
  if(!confirm('Disconnect Firebase sync? Auto-sync will be turned off on this device.')) return;
  githubConfig = { enabled:false };
  persistGithubConfig();
  stopFirebaseLiveSync();
  document.getElementById('ghEnabled').checked = false;
  document.getElementById('ghModalStatus').textContent = 'Firebase sync disconnected.';
  setSyncStatus('idle');
}

/* ================== ACTIVE VISITORS (PRESENCE) ==================
   There is no private server for this static site, so "who is online"
   is tracked with kvdb.io — a free, keyless, tiny key/value store used
   ONLY for presence blips (never for grades/student data). Each signed-in
   user's own browser writes its own heartbeat; every browser reads all
   heartbeats to build the "active now" list. The bucket ID itself is
   created once (by the Admin's browser) and then travels to every other
   device automatically through the normal GitHub sync payload. */
const PRESENCE_BUCKET_LS_KEY = 'gradesSystemPresenceBucket_v1';
const PRESENCE_HEARTBEAT_MS  = 25000;   // how often this browser reports itself
const PRESENCE_POLL_MS       = 30000;   // how often the widget refreshes
const PRESENCE_STALE_MS      = 70000;   // ignore heartbeats older than this
let presenceBucket = null;
let presenceHeartbeatTimer = null;
let presenceWidgetTimer = null;
let birthdayWidgetTimer = null;

try{ presenceBucket = localStorage.getItem(PRESENCE_BUCKET_LS_KEY) || null; }catch(err){}

async function ensurePresenceBucket(){
  if(presenceBucket) return presenceBucket;
  // Only the Admin auto-provisions a brand-new bucket the very first time;
  // it then reaches every other device via the existing GitHub sync payload.
  if(!currentUser || currentUser.role!=='admin') return null;
  try{
    const res = await fetch('https://kvdb.io', { method:'POST', body:'email=grade-book-presence@example.com' });
    if(!res.ok) return null;
    const id = (await res.text()).trim();
    if(!id) return null;
    presenceBucket = id;
    try{ localStorage.setItem(PRESENCE_BUCKET_LS_KEY, id); }catch(err){}
    saveState(); // piggybacks on the normal save/sync flow to share the bucket ID
    return presenceBucket;
  }catch(err){ console.warn('Could not create presence bucket', err); return null; }
}

async function sendPresenceHeartbeat(){
  if(!currentUser) return;
  const bucket = await ensurePresenceBucket();
  if(!bucket) return;
  const key = 'presence:' + encodeURIComponent(currentUser.username);
  const value = JSON.stringify({ name: currentUser.displayName || currentUser.username, role: currentUser.role, ts: Date.now() });
  try{ await fetch(`https://kvdb.io/${bucket}/${key}?ttl=90`, { method:'POST', body:value }); }
  catch(err){ /* ignore transient network errors */ }
}

async function removePresenceKey(){
  if(!currentUser || !presenceBucket) return;
  const key = 'presence:' + encodeURIComponent(currentUser.username);
  try{ await fetch(`https://kvdb.io/${presenceBucket}/${key}`, { method:'DELETE' }); }
  catch(err){ /* ignore */ }
}

async function refreshActiveVisitorsWidget(){
  const listEl = document.getElementById('activeVisitorsList');
  const countEl = document.getElementById('activeVisitorsCount');
  if(!listEl || !countEl) return;
  const bucket = presenceBucket || await ensurePresenceBucket();
  if(!bucket){ countEl.textContent = currentUser ? '1' : '0'; listEl.innerHTML = '<span class="visitor-chip-empty">Presence sync not set up yet</span>'; return; }
  try{
    const listRes = await fetch(`https://kvdb.io/${bucket}/?prefix=presence:`);
    if(!listRes.ok) throw new Error('list failed');
    const text = await listRes.text();
    const keys = text.split('\n').map(s=>s.trim()).filter(Boolean);
    const now = Date.now();
    const entries = await Promise.all(keys.map(async k=>{
      try{
        const r = await fetch(`https://kvdb.io/${bucket}/${k}`);
        if(!r.ok) return null;
        const data = JSON.parse(await r.text());
        if(!data || (now - data.ts) > PRESENCE_STALE_MS) return null;
        return data;
      }catch(err){ return null; }
    }));
    const active = entries.filter(Boolean).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    countEl.textContent = active.length;
    listEl.innerHTML = active.length
      ? active.map(u=> `<div class="visitor-chip">${escapeHtml(u.name)} <small>${escapeHtml(ROLE_LABELS[u.role] || u.role || '')}</small></div>`).join('')
      : '<span class="visitor-chip-empty">No one else online</span>';
  }catch(err){
    console.warn('Could not refresh active visitors', err);
  }
}

function startPresenceTracking(){
  sendPresenceHeartbeat();
  refreshActiveVisitorsWidget();
  refreshBirthdayWidgets();
  clearInterval(presenceHeartbeatTimer);
  clearInterval(presenceWidgetTimer);
  clearInterval(birthdayWidgetTimer);
  presenceHeartbeatTimer = setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);
  presenceWidgetTimer = setInterval(refreshActiveVisitorsWidget, PRESENCE_POLL_MS);
  birthdayWidgetTimer = setInterval(refreshBirthdayWidgets, 10*60*1000);
}
function stopPresenceTracking(){
  clearInterval(presenceHeartbeatTimer);
  clearInterval(presenceWidgetTimer);
  removePresenceKey();
  const countEl = document.getElementById('activeVisitorsCount');
  const listEl = document.getElementById('activeVisitorsList');
  if(countEl) countEl.textContent = '0';
  if(listEl) listEl.innerHTML = '<span class="visitor-chip-empty">Sign in to see who\'s online</span>';
}

/* ================== DARK MODE ================== */
const DARK_MODE_LS_KEY = 'gradeBookDarkMode';
function updateDarkToggleIcon(){
  const btn = document.getElementById('darkToggleBtn');
  if(btn) btn.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
}
function toggleDarkMode(){
  document.body.classList.toggle('dark-mode');
  try{ localStorage.setItem(DARK_MODE_LS_KEY, document.body.classList.contains('dark-mode') ? '1' : '0'); }catch(err){}
  updateDarkToggleIcon();
}
function initDarkMode(){
  let saved = null;
  try{ saved = localStorage.getItem(DARK_MODE_LS_KEY); }catch(err){}
  if(saved==='1') document.body.classList.add('dark-mode');
  updateDarkToggleIcon();
}
initDarkMode();

/* ================== HEADER INFO ROW (clock / weather / online users) ================== */
const HEADER_INFO_LS_KEY = 'gradeBookHeaderInfoOpen';
function toggleHeaderInfo(){
  const row = document.getElementById('mastheadInfo');
  const btn = document.getElementById('infoToggleBtn');
  if(!row) return;
  const opening = !row.classList.contains('open');
  row.classList.toggle('open');
  if(btn) btn.classList.toggle('active', opening);
  try{ localStorage.setItem(HEADER_INFO_LS_KEY, opening ? '1' : '0'); }catch(err){}
  if(opening){ refreshActiveVisitorsWidget(); refreshBirthdayWidgets(); }
}
function initHeaderInfo(){
  let saved = null;
  try{ saved = localStorage.getItem(HEADER_INFO_LS_KEY); }catch(err){}
  if(saved==='1'){
    const row = document.getElementById('mastheadInfo');
    const btn = document.getElementById('infoToggleBtn');
    if(row) row.classList.add('open');
    if(btn) btn.classList.add('active');
  }
}
initHeaderInfo();

/* ================== STICKY NAV + BREADCRUMB SPACING ================== */
// The nav is now a fixed vertical rail down the left edge, so it no longer reserves any
// vertical space above the page content — the breadcrumb stepper just sticks near the top
// of the viewport with a small fixed gap, the same way it would on any page without a top bar.
function updateStickySpacing(){
  const STEPPER_TOP_GAP = 12;
  document.querySelectorAll('.stepper').forEach(el=>{ el.style.top = STEPPER_TOP_GAP + 'px'; });
}
window.addEventListener('resize', updateStickySpacing);
window.addEventListener('load', updateStickySpacing);
setTimeout(updateStickySpacing, 0);

/* ================== INIT ================== */
loadState();
loadActivityLog();
loadReportCardReleases();
loadBlockedStudentsLocalOnly();
loadGradeEntryLockConfig();
loadTermMonthDates();
loadExamSchedules();
loadAdminStructure();
loadGrade3FlexibleMaxima();
loadGithubConfig();
loadLastGradebookSelection();
renderStepper();
renderAttendanceStepper();
renderWorkspace();
renderAttendanceWorkspace();
renderDatabase();
renderTeachersDatabase();
renameAttendanceNavTab();
// Renames the "Absence" nav tab button to "Absence & Approved Leave", preserving any leading
// icon element inside the button (only the trailing text node is replaced) since the button's
// exact markup lives in the HTML file, not here.
function renameAttendanceNavTab(){
  const tab = document.getElementById('navTabAttendance');
  if(!tab) return;
  const NEW_LABEL = 'Absence & Approved Leave';
  let textNode = null;
  for(let i=tab.childNodes.length-1; i>=0; i--){
    const n = tab.childNodes[i];
    if(n.nodeType===3 && n.textContent.trim()){ textNode = n; break; }
  }
  if(textNode) textNode.textContent = (textNode.textContent.match(/^\s*/)||[''])[0] + NEW_LABEL;
  else tab.textContent = NEW_LABEL;
  tab.title = NEW_LABEL;
}
/* ================== DATE / TIME / WEATHER WIDGET ================== */
function dtwUpdateClock(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const clockEl = document.getElementById('dtwClock');
  const dateEl = document.getElementById('dtwDate');
  if(clockEl) clockEl.textContent = `${hh}:${mm}:${ss}`;
  if(dateEl){
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
}

const DTW_WEATHER_CODES = {
  0:  ['☀️','Clear sky'],
  1:  ['🌤️','Mostly clear'],
  2:  ['⛅','Partly cloudy'],
  3:  ['☁️','Overcast'],
  45: ['🌫️','Fog'],
  48: ['🌫️','Fog'],
  51: ['🌦️','Light drizzle'],
  53: ['🌦️','Drizzle'],
  55: ['🌦️','Dense drizzle'],
  61: ['🌧️','Light rain'],
  63: ['🌧️','Rain'],
  65: ['🌧️','Heavy rain'],
  71: ['❄️','Light snow'],
  73: ['❄️','Snow'],
  75: ['❄️','Heavy snow'],
  80: ['🌦️','Rain showers'],
  81: ['🌦️','Rain showers'],
  82: ['⛈️','Violent showers'],
  95: ['⛈️','Thunderstorm'],
  96: ['⛈️','Thunderstorm w/ hail'],
  99: ['⛈️','Thunderstorm w/ hail']
};

function dtwRenderWeather(tempC, code, cityLabel){
  const iconEl = document.getElementById('dtwIcon');
  const tempEl = document.getElementById('dtwTemp');
  const condEl = document.getElementById('dtwCond');
  const wrapEl = document.getElementById('dtwCityWrap');
  const info = DTW_WEATHER_CODES[code] || ['🌡️','—'];
  if(iconEl) iconEl.textContent = info[0];
  if(tempEl) tempEl.textContent = `${Math.round(tempC)}°C`;
  if(condEl) condEl.textContent = info[1];
  if(wrapEl) wrapEl.title = cityLabel || '';
}

function dtwFetchWeather(lat, lon, cityLabel){
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
    .then(r=>r.json())
    .then(data=>{
      const cw = data && data.current_weather;
      if(cw){ dtwRenderWeather(cw.temperature, cw.weathercode, cityLabel); }
      else { document.getElementById('dtwCond').textContent = 'Weather unavailable'; }
    })
    .catch(()=>{
      const condEl = document.getElementById('dtwCond');
      if(condEl) condEl.textContent = 'Weather unavailable';
    });
}

function dtwInitWeather(){
  // Default fallback: Madinaty, Cairo, Egypt
  const fallback = { lat:30.078, lon:31.617, label:'Madinaty, Cairo' };
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      pos => dtwFetchWeather(pos.coords.latitude, pos.coords.longitude, 'Your location'),
      () => dtwFetchWeather(fallback.lat, fallback.lon, fallback.label),
      { timeout:5000 }
    );
  } else {
    dtwFetchWeather(fallback.lat, fallback.lon, fallback.label);
  }
}

function initDateTimeWeatherWidget(){
  dtwUpdateClock();
  setInterval(dtwUpdateClock, 1000);
  dtwInitWeather();
  setInterval(dtwInitWeather, 30 * 60 * 1000); // refresh weather every 30 minutes
}

/* ================== LOGIN SCREEN: DAILY QUOTE ================== */
const LOGIN_QUOTES = [
  "Hard work beats talent when talent doesn't work hard.",
  "The expert in anything was once a beginner who never quit.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Discipline is choosing between what you want now and what you want most.",
  "Great things never came from comfort zones.",
  "Dreams don't work unless you do.",
  "Effort is what ignites that ability and turns it into accomplishment.",
  "The only place where success comes before work is in the dictionary.",
  "Push yourself, because no one else is going to do it for you.",
  "A little progress each day adds up to big results.",
  "There is no substitute for hard work.",
  "Well done is better than well said.",
  "It always seems impossible until it's done.",
  "The harder you work for something, the greater you'll feel when you achieve it.",
  "Don't watch the clock; do what it does — keep going.",
  "Excellence is not an act, but a habit.",
  "Opportunities don't happen, you create them.",
  "The future depends on what you do today.",
  "Perseverance is not a long race; it is many short races one after the other.",
  "Nothing worth having comes easy."
];
function initLoginQuote(){
  const el = document.getElementById('loginQuote');
  if(!el) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const quote = LOGIN_QUOTES[dayOfYear % LOGIN_QUOTES.length];
  el.textContent = `${quote}”`;
}
initLoginQuote();

initDateTimeWeatherWidget();
tryAutoLogin();

// Always fetch the latest saved data from Firestore on load, then keep a
// live listener open — this is what makes data appear on every device/
// browser instantly, not just the one that originally saved it.
if(githubReady()){ setSyncStatus('idle'); }
pullFromGithub(true).then(()=>{ if(githubReady()) startFirebaseLiveSync(); refreshHeaderQuickWidgets(); });

/* ================== BULK GRADES IMPORT BY SUBJECT(S) ================== */

let bulkImportState = { mode: null, subjects: [] };

function openBulkGradesImportModal(){
  if(gradeItemUploadReadOnly()){ gradeEntryLockAlert(); return; }
  bulkImportState = { mode: null, subjects: [] };
  document.getElementById('bulkGradesImportOverlay').classList.add('show');
  // Clear all mode displays and inputs
  document.getElementById('bulkImportSingleMode').style.display = 'none';
  document.getElementById('bulkImportMultipleMode').style.display = 'none';
  document.getElementById('bulkImportAllMode').style.display = 'none';
  document.getElementById('bulkImportModeInfo').textContent = '👉 Select an import mode above';
  // Populate subject dropdowns with current term subjects
  populateBulkImportSubjectDropdowns();
}

function closeBulkGradesImportModal(){
  document.getElementById('bulkGradesImportOverlay').classList.remove('show');
  document.getElementById('bulkGradesExcelInput').value = '';
  bulkImportState = { mode: null, subjects: [] };
}

function getAvailableSubjects(){
  // Get all subjects that apply to the current stage (same list used to
  // build the subject stepper/breadcrumb elsewhere in the app).
  if(!state.stage || !STAGES[state.stage]) return [];
  return getSubjectsForStageAndSection(state.stage, state.section).slice().sort();
}

function populateBulkImportSubjectDropdowns(){
  const subjects = getAvailableSubjects();
  
  // Single select
  const singleSel = document.getElementById('bulkImportSubjectSelect');
  singleSel.innerHTML = '';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    singleSel.appendChild(opt);
  });
  
  // Multiple select
  const multiSel = document.getElementById('bulkImportMultipleSelect');
  multiSel.innerHTML = '';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    multiSel.appendChild(opt);
  });
  
  // All mode info
  document.getElementById('bulkImportAllCount').textContent = subjects.length;
}

function setBulkImportMode(mode){
  bulkImportState.mode = mode;
  bulkImportState.subjects = [];
  
  // Hide all mode divs
  document.getElementById('bulkImportSingleMode').style.display = 'none';
  document.getElementById('bulkImportMultipleMode').style.display = 'none';
  document.getElementById('bulkImportAllMode').style.display = 'none';
  
  if(mode === 'single'){
    document.getElementById('bulkImportSingleMode').style.display = 'block';
    bulkImportState.subjects = [document.getElementById('bulkImportSubjectSelect').value];
    document.getElementById('bulkImportModeInfo').textContent = '📌 Select a single subject to import grades for';
    updateBulkImportSingleInfo();
    document.getElementById('bulkImportSubjectSelect').onchange = ()=>{
      bulkImportState.subjects = [document.getElementById('bulkImportSubjectSelect').value];
      updateBulkImportSingleInfo();
    };
  }
  else if(mode === 'multiple'){
    document.getElementById('bulkImportMultipleMode').style.display = 'block';
    document.getElementById('bulkImportModeInfo').textContent = '📋 Select 2+ subjects to import grades for all of them';
    document.getElementById('bulkImportMultipleSelect').onchange = ()=>{
      const selected = Array.from(document.getElementById('bulkImportMultipleSelect').selectedOptions).map(o => o.value);
      if(selected.length >= 2) bulkImportState.subjects = selected;
    };
  }
  else if(mode === 'all'){
    document.getElementById('bulkImportAllMode').style.display = 'block';
    bulkImportState.subjects = getAvailableSubjects();
    document.getElementById('bulkImportModeInfo').textContent = `✓ Import grades for all ${bulkImportState.subjects.length} subjects at once`;
  }
}

function updateBulkImportSingleInfo(){
  const subject = bulkImportState.subjects[0] || '';
  const info = document.getElementById('bulkImportSingleInfo');
  if(subject){
    info.textContent = `Uploading grades for: ${subject}`;
  }
}

function downloadBulkGradesTemplate(){
  const mode = bulkImportState.mode;
  if(!mode){
    alert('Please select an import mode first');
    return;
  }
  
  const subjects = bulkImportState.subjects.length > 0 ? bulkImportState.subjects : getAvailableSubjects();
  
  // Union of each subject's eligible roster (e.g. French vs German 2nd-language students),
  // so the template includes every student who could have a score in at least one column.
  const origSubject = state.subject;
  const rosterById = new Map();
  subjects.forEach(subj => {
    state.subject = subj;
    rosterForGradeItemUpload().forEach(s => rosterById.set(s.id, s));
  });
  state.subject = origSubject;
  const roster = Array.from(rosterById.values());
  
  const data = [];
  roster.forEach(s => {
    const row = {
      'Student ID': s.displayId || '',
      'Student Name': s.name || ''
    };
    subjects.forEach(subj => {
      row[subj] = '';
    });
    data.push(row);
  });
  
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Grades');
  
  const fileName = mode === 'single' 
    ? `grades_${subjects[0]||'template'}_${state.grade}_${state.term}.xlsx`
    : mode === 'multiple'
    ? `grades_multiple_${state.grade}_${state.term}.xlsx`
    : `grades_all_${state.grade}_${state.term}.xlsx`;
  
  XLSX.writeFile(wb, fileName);
}

// The Bulk Import by Subject tool writes one value per student per subject, so it only makes
// sense on a Mark Entry screen that has exactly one editable item (e.g. First Term /
// End-of-Year Exam Paper). Reuses the same field/max definitions as "Upload Grades by Item"
// so the value lands in the exact field the Grade Book table actually reads from.
function bulkImportFieldDef(){
  const fields = editableFieldsForCurrentScreen();
  return fields.length === 1 ? fields[0] : null;
}

function handleBulkGradesExcelFile(file){
  if(!file) return;
  if(gradeItemUploadReadOnly()){ gradeEntryLockAlert(); document.getElementById('bulkGradesExcelInput').value = ''; return; }
  
  const mode = bulkImportState.mode;
  const subjects = bulkImportState.subjects;
  
  if(!mode || (mode !== 'all' && subjects.length === 0)){
    alert('Please select subjects to import first');
    document.getElementById('bulkGradesExcelInput').value = '';
    return;
  }

  const def = bulkImportFieldDef();
  if(!def){
    alert('Bulk Import by Subject only works on a Mark Entry screen with a single score item, such as Term 1 (Total) / Term 2 (Total). Switch to that screen, or use "Upload Grades by Item" instead.');
    document.getElementById('bulkGradesExcelInput').value = '';
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      
      // Each subject can have its own eligible roster (e.g. French vs German 2nd-language
      // students, or Muslim/Christian-only Religion classes), so build one roster per subject
      // instead of reusing whichever subject happened to be active on screen.
      const origSubject = state.subject;
      const subjectRosters = {};
      subjects.forEach(subj => {
        state.subject = subj;
        subjectRosters[subj] = rosterForGradeItemUpload();
      });
      state.subject = origSubject;
      
      let updated = 0;
      const notFound = [];
      const updates = {}; // Track updates per student
      
      rows.forEach(row => {
        const idVal = (row['Student ID'] || row['ID'] || row['id'] || '').toString().trim();
        const nameVal = (row['Student Name'] || row['Name'] || row['name'] || '').toString().trim();
        
        // Process each selected subject
        subjects.forEach(subject => {
          const scoreVal = row[subject];
          if(scoreVal === undefined || scoreVal === '') return;
          
          const roster = subjectRosters[subject] || [];
          let stu = null;
          if(idVal) stu = roster.find(s => (s.displayId||'').toString().trim().toLowerCase() === idVal.toLowerCase());
          if(!stu && nameVal) stu = roster.find(s => s.name.trim().toLowerCase() === nameVal.toLowerCase());
          if(!stu){ if(idVal||nameVal) notFound.push(`${idVal||nameVal} (${subject})`); return; }
          
          // Store in the real per-subject score bucket, same key format the Grade Book
          // table itself reads from (classKey|termPeriod|subject), in the field for the
          // currently-open Mark Entry item.
          const sk = `${classKey()}|${state.termPeriod}|${subject}`;
          if(!scores[sk]) scores[sk] = {};
          if(!scores[sk][stu.id]) scores[sk][stu.id] = emptyScoreObj();
          scores[sk][stu.id][def.field] = clamp(scoreVal, def.max);
          
          if(!updates[stu.id]) updates[stu.id] = 0;
          updates[stu.id]++;
          updated++;
        });
      });
      
      renderTable();
      saveState();
      closeBulkGradesImportModal();
      
      document.getElementById('importTitle').textContent = 'Bulk Import Complete';
      document.getElementById('importMsg').textContent =
        `✓ ${updated} grade(s) updated for "${def.label}" across ${subjects.length} subject(s).` +
        (notFound.length ? ` ⚠️ ${notFound.length} row(s) not matched: ${notFound.slice(0,5).join(', ')}${notFound.length>5?'…':''}` : '');
      logActivity('edit', `Bulk-imported "${def.label}" for subjects: ${subjects.join(', ')} — ${updated} updates for ${state.grade} (${state.term||'—'})`);
      document.getElementById('importResultOverlay').classList.add('show');
      
    }catch(err){
      console.error(err);
      alert('Could not read the file. Make sure it is a valid Excel file with "Student ID" or "Student Name" column and subject columns.');
    }
  };
  reader.readAsArrayBuffer(file);
  document.getElementById('bulkGradesExcelInput').value = '';
}

/* ============ CLASS LISTS ============ */
// Class Lists only needs Section / Stage / Grade / Class (the roster doesn't depend on
// Academic Term, Mark Entry, or Subject), so it gets its own short stepper config —
// same pattern as perfFilterStepConfig() — instead of reusing the full 7-step Grade Book config.
function classListsStepConfig(){
  const st = state;
  return [
    { key:'section', title:'Section', state: st, getLabel:()=> st.section ? SECTIONS[st.section].label : null,
      options: Object.entries(SECTIONS).filter(([id])=>scopeSectionAllowed(id)).map(([id,v])=>({id,label:v.label})) },
    { key:'stage', title:'Stage', state: st, getLabel:()=> st.stage ? STAGES[st.stage].label : null,
      options: Object.entries(STAGES).filter(([id])=>scopeStageAllowed(id)).map(([id,v])=>({id,label:v.label})), requires:['section'] },
    { key:'grade', title:'Grade', state: st, getLabel:()=>{
        if(!st.grade) return null;
        const g = STAGES[st.stage].grades.find(g=>g.id===st.grade);
        return g ? g.label : null;
      }, options: ()=> st.stage ? STAGES[st.stage].grades.map(g=>({id:g.id,label:g.label})) : [], requires:['section','stage'] },
    { key:'term', title:'Class', state: st, getLabel:()=> st.term ? st.term : null,
      options: ()=> getClassesInGrade(st).filter(c=>scopeClassroomAllowed(c)).map(c=>({id:c,label:c})), requires:['section','stage','grade'] }
  ];
}
function renderClassListsStepper(){
  const holder = document.getElementById('classListsStepper');
  if(!holder) return;
  buildStepperHTML('classListsStepper', classListsStepConfig(), 'cl-');
}

function renderClassListsWorkspace(){
  const classListsIntro = document.getElementById('classListsIntroState');
  const classListsWs = document.getElementById('classListsWorkspace');
  
  if(!state.section || !state.stage || !state.grade || !state.term){
    classListsWs.style.display = 'none';
    classListsIntro.style.display = '';
    return;
  }
  
  classListsIntro.style.display = 'none';
  classListsWs.style.display = '';
  
  const classKey_ = `${state.section}|${state.stage}|${state.grade}`;
  const roster = visibleRoster(students[classKey_]);
  const classStudents = roster.filter(s => s.classroom === state.term).sort((a, b) => 
    (a.displayId || '').localeCompare(b.displayId || '')
  );
  
  // Update breadcrumbs
  const crumbs = document.getElementById('classListsCrumbs');
  const gradeObj = STAGES[state.stage].grades.find(g=>g.id===state.grade);
  crumbs.innerHTML = `
    <span class="crumb">${SECTIONS[state.section].label}</span>
    <span class="crumb">${STAGES[state.stage].label}</span>
    <span class="crumb">${gradeObj ? gradeObj.label : state.grade}</span>
    <span class="crumb">${state.term}</span>
  `;
  
  // Academic year: school year runs Sep -> Aug
  const now = new Date();
  const acadStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${acadStartYear} – ${acadStartYear + 1}`;
  // Today's date, always shown next to the signatures (no hand-filled blanks)
  const todayStr = `${String(now.getDate()).padStart(2,'0')} / ${String(now.getMonth()+1).padStart(2,'0')} / ${now.getFullYear()}`;

  // Signatures: pull the HOS / Principal for this Section+Stage from the School Admin
  // Structure (Configuration ▸ School Admin Structure), same lookup certificates use, so the
  // printed roster names the actual people who need to sign instead of a blank line.
  const clistHosSignatory = findAdminStructureSignatory(state.section, state.stage, 'hos');
  const clistHosName = clistHosSignatory && clistHosSignatory.name ? clistHosSignatory.name : '';
  const clistPrincipalSignatory = findAdminStructureSignatory(state.section, state.stage, 'principal');
  const clistPrincipalTitle = (clistPrincipalSignatory && clistPrincipalSignatory.position) ? clistPrincipalSignatory.position : 'School Principal';
  const clistPrincipalName = (clistPrincipalSignatory && clistPrincipalSignatory.name) ? clistPrincipalSignatory.name : PRINCIPAL_NAME;

  // Class summary counts
  let boys = 0, girls = 0, french = 0, german = 0, muslim = 0, christian = 0;
  classStudents.forEach(stu => {
    if(stu.gender === 'Male') boys++;
    else if(stu.gender === 'Female') girls++;
    if(stu.lang2 === 'French') french++;
    else if(stu.lang2 === 'German') german++;
    if(stu.religion === 'Muslim') muslim++;
    else if(stu.religion === 'Christian') christian++;
  });

  // Split the roster across two clear A4 pages (bigger, more legible rows)
  // instead of squeezing everyone onto one shrunk page.
  // Page 1 = first 30 students (it has no summary/signature footer, so it has
  // noticeably more vertical room than the last page), Page 2 = everyone else.
  const PAGE1_COUNT = 30;
  const half = Math.min(PAGE1_COUNT, classStudents.length);
  const pages = [classStudents.slice(0, half), classStudents.slice(half)].filter(p => p.length);
  if(pages.length === 0) pages.push([]);

  const buildHeaderHtml = () => `
      <div class="clist-band">
        <div class="clist-logo-wrap"><img src="${MILS_LOGO_B64}" alt="MILS logo"></div>
        <div class="clist-titles">
          <div class="clist-title-main">Class List</div>
          <div class="clist-year">🎓 Academic Year ${academicYear}</div>
        </div>
        <div class="clist-eep"><span class="globe">🌐</span><span>Innovate to Elevate</span></div>
      </div>
      <div class="clist-info">
        <div class="item"><span class="ic">🏫</span><b>Stage:</b> <span>${STAGES[state.stage].label}</span></div>
        <div class="item"><span class="ic">🎓</span><b>Grade:</b> <span>${gradeObj ? gradeObj.label : state.grade}</span></div>
        <div class="item"><span class="ic">📘</span><b>Section:</b> <span>${SECTIONS[state.section].label}</span></div>
        <div class="item clist-classname-item"><span class="ic">👥</span><b>Class:</b> <span class="clist-classname-value">${state.term}</span></div>
        <div class="item clist-homeroom-item"><span class="ic">🧑‍🏫</span><b>Homeroom Teacher:</b> <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
      </div>`;

  const buildTableHtml = (pageStudents, startIdx) => {
    let t = `
      <div class="clist-table-wrap">
        <table class="clist-table">
          <colgroup>
            <col style="width:6%;">
            <col style="width:13%;">
            <col style="width:36%;">
            <col style="width:12%;">
            <col style="width:12%;">
            <col style="width:10%;">
            <col style="width:11%;">
          </colgroup>
          <thead>
            <tr>
              <th class="center">No.</th>
              <th>Student ID</th>
              <th>Student Name</th>
              <th class="center">Gender</th>
              <th>Second Language</th>
              <th>Religion</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
    `;
    pageStudents.forEach((stu, i) => {
      const idx = startIdx + i;
      const secondLang = (stu.lang2 && stu.lang2 !== '-') ? stu.lang2 : '—';
      const religion = (stu.religion && stu.religion !== '-') ? stu.religion : '—';
      const notes = stu.notes || '';
      let genderCell = '—';
      if(stu.gender === 'Male') genderCell = '<span class="clist-gender male">Male</span>';
      else if(stu.gender === 'Female') genderCell = '<span class="clist-gender female">Female</span>';
      t += `
      <tr>
        <td class="center">${idx + 1}</td>
        <td>${stu.displayId || ''}</td>
        <td style="font-weight:600;color:var(--ink);">${escapeHtml(stu.name)}${birthdayNameFlag(stu.dob)}</td>
        <td class="center">${genderCell}</td>
        <td>${secondLang}</td>
        <td>${religion}</td>
        <td>${notes}</td>
      </tr>
      `;
    });
    t += `
          </tbody>
        </table>
      </div>`;
    return t;
  };

  // Skip any summary category with a count of 0 — no point printing "French: 0" etc.
  // Total always shows, even if the class happens to be empty.
  const clistSummaryRows = [
    ['Boys', boys], ['Girls', girls], ['French', french], ['German', german],
    ['Muslim', muslim], ['Christian', christian]
  ].filter(([,count]) => count > 0);
  clistSummaryRows.push(['Total', classStudents.length]);

  const buildFooterHtml = () => `
      <div class="clist-foot-panels">
        <div class="clist-summary">
          <div class="hd">📊 Class Summary</div>
          <div class="rows">
            ${clistSummaryRows.map(([label,count]) => `<div class="row"><b>${label}</b><span>${count}</span></div>`).join('')}
          </div>
        </div>
        <div class="clist-sign">
          <div class="line"><b>Class Teacher&nbsp;:</b><span class="fill"></span><span class="date">Date: ${todayStr}</span></div>
          <div class="line"><b>HOS&nbsp;:</b><span class="fill">${clistHosName ? escapeHtml(clistHosName) : ''}</span><span class="date">Date: ${todayStr}</span></div>
          <div class="line"><b>${escapeHtml(clistPrincipalTitle)}&nbsp;:</b><span class="fill">${clistPrincipalName ? escapeHtml(clistPrincipalName) : ''}</span><span class="date">Date: ${todayStr}</span></div>
        </div>
      </div>
      <div class="clist-tagline">LEARN &nbsp;•&nbsp; LEAD &nbsp;•&nbsp; ACHIEVE</div>
      <div class="clist-bottom-band">
        <div class="conf">🛡️ Confidential Document<small>For Official Use Only</small></div>
        <div>Madinaty Integrated Language Schools</div>
      </div>`;

  // Build the report — one .clist-doc per printed page
  let html = '';
  let runningIdx = 0;
  pages.forEach((pageStudents, pageNum) => {
    const isLast = pageNum === pages.length - 1;
    const tierClass = pageStudents.length > 40 ? ' clist-ultra' : (pageStudents.length > 26 ? ' clist-tight' : '');
    html += `
    <div class="clist-doc${tierClass}${pages.length > 1 ? ' clist-multipage' : ''}${!isLast ? ' clist-page-break' : ''}">
      ${buildHeaderHtml()}
      ${pages.length > 1 ? `<div class="clist-page-tag">Page ${pageNum + 1} of ${pages.length}</div>` : ''}
      ${buildTableHtml(pageStudents, runningIdx)}
      ${isLast ? buildFooterHtml() : `
      <div class="clist-tagline">LEARN &nbsp;•&nbsp; LEAD &nbsp;•&nbsp; ACHIEVE</div>
      <div class="clist-bottom-band">
        <div class="conf">🛡️ Confidential Document<small>For Official Use Only</small></div>
        <div>Madinaty Integrated Language Schools</div>
      </div>`}
    </div>`;
    runningIdx += pageStudents.length;
  });

  document.getElementById('classListTableHolder').innerHTML = html;
}

function downloadClassListExcel(){
  const classKey_ = `${state.section}|${state.stage}|${state.grade}`;
  const roster = visibleRoster(students[classKey_]);
  const classStudents = roster.filter(s => s.classroom === state.term).sort((a, b) => 
    (a.displayId || '').localeCompare(b.displayId || '')
  );
  
  const wsData = [];
  wsData.push(['No.', 'Student ID', 'Student Name', 'Gender', 'Second Language', 'Religion', 'Notes']);
  
  classStudents.forEach((stu, idx) => {
    wsData.push([
      idx + 1,
      stu.displayId || '',
      stu.name,
      (stu.gender && stu.gender !== '-') ? stu.gender : '',
      (stu.lang2 && stu.lang2 !== '-') ? stu.lang2 : '',
      (stu.religion && stu.religion !== '-') ? stu.religion : '',
      stu.notes || ''
    ]);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    {wch: 6},
    {wch: 15},
    {wch: 25},
    {wch: 10},
    {wch: 18},
    {wch: 12},
    {wch: 25}
  ];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Class List');
  const filename = `ClassList_${SECTIONS[state.section].label}_Grade${state.grade}_${state.term}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
  
  logActivity('export', `Exported class list for ${SECTIONS[state.section].label} Grade ${state.grade} (${state.term})`);
}

function downloadClassListPDF(){
  alert('PDF export is coming soon. For now, you can use the Print function (Ctrl+P or Cmd+P) to save as PDF.');
}

/* ================ STATISTICS TAB ================ */

function renderStatistics(){
  const statsView = document.getElementById('statisticsView');
  if(!statsView || statsView.style.display === 'none') return;
  
  const holder = document.getElementById('statisticsTableHolder');
  if(!holder) return;
  
  // Build statistics data structure
  const statsData = buildStatisticsData();
  const html = buildStatisticsHTML(statsData);
  holder.innerHTML = html;
  
  // Update count
  const totalStudents = Object.values(students).flat().filter(s=>!isTCStudent(s)).length;
  document.getElementById('statsCount').textContent = `${totalStudents} total students`;
}

function buildStatisticsData(){
  // Organize students by: section -> stage -> grade -> class
  const stats = {};
  
  Object.entries(SECTIONS).forEach(([sectionId, sectionObj]) => {
    stats[sectionId] = {
      label: sectionObj.label,
      stages: {}
    };
    
    Object.entries(STAGES).forEach(([stageId, stageObj]) => {
      if(!scopeSectionAllowed(sectionId) || !scopeStageAllowed(stageId)) return;
      
      stats[sectionId].stages[stageId] = {
        label: stageObj.label,
        grades: {},
        totalStudents: 0,
        totalMale: 0,
        totalFemale: 0,
        totalFrench: 0,
        totalGerman: 0,
        totalMuslim: 0,
        totalChristian: 0
      };
      
      stageObj.grades.forEach(gradeObj => {
        const classKey = `${sectionId}|${stageId}|${gradeObj.id}`;
        const roster = visibleRoster(students[classKey]);
        
        stats[sectionId].stages[stageId].grades[gradeObj.id] = {
          label: gradeObj.label,
          classes: {},
          totalStudents: 0,
          totalMale: 0,
          totalFemale: 0,
          totalFrench: 0,
          totalGerman: 0,
          totalMuslim: 0,
          totalChristian: 0
        };
        
        // Group by classroom
        const classesByRoom = {};
        roster.forEach(stu => {
          if(!classesByRoom[stu.classroom]) classesByRoom[stu.classroom] = [];
          classesByRoom[stu.classroom].push(stu);
        });
        
        Object.entries(classesByRoom).forEach(([className, students_in_class]) => {
          let male = 0, female = 0, french = 0, german = 0, muslim = 0, christian = 0;
          students_in_class.forEach(stu => {
            if(stu.gender === 'Male') male++;
            else if(stu.gender === 'Female') female++;
            if(stu.lang2 === 'French') french++;
            else if(stu.lang2 === 'German') german++;
            if(stu.religion === 'Muslim') muslim++;
            else if(stu.religion === 'Christian') christian++;
          });
          
          stats[sectionId].stages[stageId].grades[gradeObj.id].classes[className] = {
            name: className,
            total: students_in_class.length,
            male, female, french, german, muslim, christian
          };
          
          // Update grade totals
          const gradeStats = stats[sectionId].stages[stageId].grades[gradeObj.id];
          gradeStats.totalStudents += students_in_class.length;
          gradeStats.totalMale += male;
          gradeStats.totalFemale += female;
          gradeStats.totalFrench += french;
          gradeStats.totalGerman += german;
          gradeStats.totalMuslim += muslim;
          gradeStats.totalChristian += christian;
        });
        
        // Update stage totals
        const stageStats = stats[sectionId].stages[stageId];
        stageStats.totalStudents += stats[sectionId].stages[stageId].grades[gradeObj.id].totalStudents;
        stageStats.totalMale += stats[sectionId].stages[stageId].grades[gradeObj.id].totalMale;
        stageStats.totalFemale += stats[sectionId].stages[stageId].grades[gradeObj.id].totalFemale;
        stageStats.totalFrench += stats[sectionId].stages[stageId].grades[gradeObj.id].totalFrench;
        stageStats.totalGerman += stats[sectionId].stages[stageId].grades[gradeObj.id].totalGerman;
        stageStats.totalMuslim += stats[sectionId].stages[stageId].grades[gradeObj.id].totalMuslim;
        stageStats.totalChristian += stats[sectionId].stages[stageId].grades[gradeObj.id].totalChristian;
      });
    });
  });
  
  return stats;
}

function buildStatisticsHTML(stats){
  let html = '';
  
  Object.entries(stats).forEach(([sectionId, sectionData]) => {
    html += `
    <div style="margin-bottom:32px;">
      <h3 style="margin:0 0 16px; color:var(--ink); font-size:16px; border-bottom:2px solid var(--gold); padding-bottom:8px;">
        📍 ${sectionData.label} Section
      </h3>
      
      <table class="stats-table">
        <thead>
          <tr>
            <th>Grade / Class</th>
            <th>Total</th>
            <th>Male</th>
            <th>Female</th>
            <th>French</th>
            <th>German</th>
            <th>Muslim</th>
            <th>Christian</th>
          </tr>
        </thead>
        <tbody>`;
    
    Object.entries(sectionData.stages).forEach(([stageId, stageData]) => {
      if(stageData.totalStudents === 0) return; // Skip empty stages
      
      Object.entries(stageData.grades).forEach(([gradeId, gradeData]) => {
        if(gradeData.totalStudents === 0) return; // Skip empty grades
        
        const gradeName = `${stageData.label} - ${gradeData.label}`;
        
        // Add individual classes
        Object.entries(gradeData.classes).sort((a, b) => a[0].localeCompare(b[0])).forEach(([className, classData]) => {
          html += `
          <tr>
            <td>&nbsp;&nbsp;&nbsp;${className}</td>
            <td>${classData.total}</td>
            <td>${classData.male}</td>
            <td>${classData.female}</td>
            <td>${classData.french}</td>
            <td>${classData.german}</td>
            <td>${classData.muslim}</td>
            <td>${classData.christian}</td>
          </tr>`;
        });
        
        // Add grade subtotal
        html += `
        <tr class="stats-subtotal">
          <td>${gradeName} (Subtotal)</td>
          <td>${gradeData.totalStudents}</td>
          <td>${gradeData.totalMale}</td>
          <td>${gradeData.totalFemale}</td>
          <td>${gradeData.totalFrench}</td>
          <td>${gradeData.totalGerman}</td>
          <td>${gradeData.totalMuslim}</td>
          <td>${gradeData.totalChristian}</td>
        </tr>`;
      });
      
      // Add stage subtotal
      html += `
      <tr class="stats-subtotal">
        <td><b>${stageData.label} (Subtotal)</b></td>
        <td><b>${stageData.totalStudents}</b></td>
        <td><b>${stageData.totalMale}</b></td>
        <td><b>${stageData.totalFemale}</b></td>
        <td><b>${stageData.totalFrench}</b></td>
        <td><b>${stageData.totalGerman}</b></td>
        <td><b>${stageData.totalMuslim}</b></td>
        <td><b>${stageData.totalChristian}</b></td>
      </tr>`;
    });
    
    html += `
        </tbody>
      </table>
    </div>`;
  });
  
  return html;
}

function downloadStatisticsExcel(){
  const statsData = buildStatisticsData();
  const wb = XLSX.utils.book_new();
  
  const wsData = [['📊 MILS Statistics Report', '', '', '', '', '', '', '']];
  wsData.push(['Generated:', new Date().toLocaleString(), '', '', '', '', '', '']);
  wsData.push([]);
  wsData.push(['Grade / Class', 'Total', 'Male', 'Female', 'French', 'German', 'Muslim', 'Christian']);
  
  Object.entries(statsData).forEach(([sectionId, sectionData]) => {
    wsData.push([`${sectionData.label} Section`, '', '', '', '', '', '', '']);
    
    Object.entries(sectionData.stages).forEach(([stageId, stageData]) => {
      if(stageData.totalStudents === 0) return;
      
      Object.entries(stageData.grades).forEach(([gradeId, gradeData]) => {
        if(gradeData.totalStudents === 0) return;
        
        const gradeName = `${stageData.label} - ${gradeData.label}`;
        
        Object.entries(gradeData.classes).sort((a, b) => a[0].localeCompare(b[0])).forEach(([className, classData]) => {
          wsData.push([
            `  ${className}`,
            classData.total,
            classData.male,
            classData.female,
            classData.french,
            classData.german,
            classData.muslim,
            classData.christian
          ]);
        });
        
        wsData.push([
          `${gradeName} (Subtotal)`,
          gradeData.totalStudents,
          gradeData.totalMale,
          gradeData.totalFemale,
          gradeData.totalFrench,
          gradeData.totalGerman,
          gradeData.totalMuslim,
          gradeData.totalChristian
        ]);
      });
      
      wsData.push([
        `${stageData.label} (Subtotal)`,
        stageData.totalStudents,
        stageData.totalMale,
        stageData.totalFemale,
        stageData.totalFrench,
        stageData.totalGerman,
        stageData.totalMuslim,
        stageData.totalChristian
      ]);
      wsData.push([]);
    });
  });
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    {wch: 25},
    {wch: 10},
    {wch: 10},
    {wch: 10},
    {wch: 10},
    {wch: 10},
    {wch: 10},
    {wch: 10}
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Statistics');
  
  const filename = `MILS_Statistics_${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}.xlsx`;
  XLSX.writeFile(wb, filename);
  
  logActivity('export', 'Exported statistics report');
}

function downloadStatisticsPDF(){
  alert('PDF export is coming soon. For now, you can use the Print function (Ctrl+P or Cmd+P) to save as PDF.');
}
