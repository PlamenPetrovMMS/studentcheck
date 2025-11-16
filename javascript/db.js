/*
  IndexedDB layer for Student Check System
  - Database: StudentCheckDB (v1)
  - Object stores:
    - teachers (keyPath: 'id')
    - students (keyPath: 'id')
    - classes  (keyPath: 'id')  // id format: `${teacherEmail}::${className}`
    - attendance (keyPath: 'id', autoIncrement)

  Exposes a global `db` API on window with async helpers.
*/
(function(){
  const DB_NAME = 'StudentCheckDB';
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        // Create stores if not present
        if (!db.objectStoreNames.contains('teachers')) {
          db.createObjectStore('teachers', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('students')) {
          db.createObjectStore('students', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('classes')) {
          db.createObjectStore('classes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('attendance')) {
          const store = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
          try {
            store.createIndex('by_synced', 'synced', { unique: false });
            store.createIndex('by_teacher', 'teacherEmail', { unique: false });
            store.createIndex('by_class', 'classId', { unique: false });
            store.createIndex('by_teacher_class', ['teacherEmail', 'classId'], { unique: false });
          } catch(_) { /* index create tolerant */ }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, storeNames, mode='readonly') {
    return db.transaction(storeNames, mode);
  }

  function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Utility: deterministic class id
  function classIdFor(teacherEmail, className) {
    const t = (teacherEmail||'').trim();
    const c = (className||'').trim();
    return `${t}::${c}`;
  }

  async function saveTeacher(teacher) {
    const db = await openDB();
    const txx = tx(db, ['teachers'], 'readwrite');
    const req = txx.objectStore('teachers').put(teacher);
    await promisifyRequest(req);
    await new Promise((res, rej) => { txx.oncomplete = res; txx.onerror = () => rej(txx.error); });
    return teacher;
  }
  async function saveStudent(student) {
    const db = await openDB();
    const txx = tx(db, ['students'], 'readwrite');
    const req = txx.objectStore('students').put(student);
    await promisifyRequest(req);
    await new Promise((res, rej) => { txx.oncomplete = res; txx.onerror = () => rej(txx.error); });
    return student;
  }
  async function saveClass(classObj) {
    const db = await openDB();
    const store = tx(db, ['classes'], 'readwrite').objectStore('classes');
    if (!classObj.id) classObj.id = classIdFor(classObj.teacherEmail, classObj.className);
    return promisifyRequest(store.put(classObj));
  }
  async function saveClasses(classArr) {
    const db = await openDB();
    const txx = tx(db, ['classes'], 'readwrite');
    const store = txx.objectStore('classes');
    for (const c of classArr) {
      if (!c.id) c.id = classIdFor(c.teacherEmail, c.className);
      store.put(c);
    }
    await new Promise((res, rej) => { txx.oncomplete = res; txx.onerror = () => rej(txx.error); });
  }
  async function getClasses(filter={}) {
    const db = await openDB();
    const store = tx(db, ['classes']).objectStore('classes');
    const req = store.getAll();
    const all = await promisifyRequest(req);
    const { teacherEmail } = filter;
    return all.filter(c => !teacherEmail || c.teacherEmail === teacherEmail);
  }
  async function getClassByName(teacherEmail, className) {
    const db = await openDB();
    const store = tx(db, ['classes']).objectStore('classes');
    const id = classIdFor(teacherEmail, className);
    return promisifyRequest(store.get(id));
  }

  async function upsertClassStudents(teacherEmail, className, studentsArray) {
    const cls = (await getClassByName(teacherEmail, className)) || { id: classIdFor(teacherEmail, className), teacherEmail, className, ready: false };
    cls.students = Array.isArray(studentsArray) ? studentsArray : [];
    return saveClass(cls);
  }
  async function getClassStudents(teacherEmail, className) {
    const cls = await getClassByName(teacherEmail, className);
    return Array.isArray(cls?.students) ? cls.students : [];
  }
  async function setClassReadyFlag(teacherEmail, className, ready) {
    const cls = (await getClassByName(teacherEmail, className)) || { id: classIdFor(teacherEmail, className), teacherEmail, className };
    cls.ready = !!ready;
    return saveClass(cls);
  }

  async function saveAttendanceRecord(record) {
    const db = await openDB();
    const store = tx(db, ['attendance'], 'readwrite').objectStore('attendance');
    const payload = {
      // id will autoincrement
      teacherEmail: record.teacherEmail || null,
      classId: record.classId || classIdFor(record.teacherEmail, record.className),
      className: record.className,
      studentId: record.studentId,
      mode: record.mode || 'joining',
      status: record.status || null, // joined/completed/none
      createdAt: Date.now(),
      synced: !!record.synced && record.synced === true ? true : false,
    };
    return promisifyRequest(store.add(payload));
  }
  async function getAttendanceRecords(filter={}) {
    const db = await openDB();
    const store = tx(db, ['attendance']).objectStore('attendance');
    const all = await promisifyRequest(store.getAll());
    let arr = all;
    if (filter.teacherEmail) arr = arr.filter(r => r.teacherEmail === filter.teacherEmail);
    if (filter.classId) arr = arr.filter(r => r.classId === filter.classId);
    if (filter.unsyncedOnly) arr = arr.filter(r => !r.synced);
    return arr;
  }
  async function markAttendanceSynced(ids) {
    if (!ids || ids.length === 0) return;
    const db = await openDB();
    const txx = tx(db, ['attendance'], 'readwrite');
    const store = txx.objectStore('attendance');
    for (const id of ids) {
      const rec = await promisifyRequest(store.get(id));
      if (rec) { rec.synced = true; store.put(rec); }
    }
    await new Promise((res, rej) => { txx.oncomplete = res; txx.onerror = () => rej(txx.error); });
  }

  async function getStudents() {
    const db = await openDB();
    const store = tx(db, ['students']).objectStore('students');
    return promisifyRequest(store.getAll());
  }
  async function getTeachers() {
    const db = await openDB();
    const store = tx(db, ['teachers']).objectStore('teachers');
    return promisifyRequest(store.getAll());
  }

  // Offline → Online sync harness (endpoint to be configured)
  async function syncAttendanceQueue(options={}) {
    const endpoint = options.endpoint || 'https://studentcheck-server.onrender.com/attendance/sync';
    if (!navigator.onLine) return { ok:false, reason:'offline' };
    const unsynced = await getAttendanceRecords({ unsyncedOnly: true });
    if (unsynced.length === 0) return { ok:true, synced: 0 };
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: unsynced })
      });
      if (!res.ok) throw new Error('sync failed: ' + res.status);
      await markAttendanceSynced(unsynced.map(r => r.id));
      return { ok:true, synced: unsynced.length };
    } catch (e) {
      console.warn('[sync] failed, will retry later', e);
      return { ok:false, reason: String(e && e.message || e) };
    }
  }

  // Public API
  window.db = {
    openDB,
    classIdFor,
    saveTeacher,
    saveStudent,
    saveClass,
    saveClasses,
    getClasses,
    getClassByName,
    upsertClassStudents,
    getClassStudents,
    setClassReadyFlag,
    saveAttendanceRecord,
    getAttendanceRecords,
    markAttendanceSynced,
    getStudents,
    getTeachers,
    syncAttendanceQueue,
  };
})();
