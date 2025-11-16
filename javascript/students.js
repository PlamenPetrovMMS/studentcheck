(function(){
  const API_URL = 'https://studentcheck-server.onrender.com/students';
  let cache = [];
  let index = new Map();

  function splitNames(input){
    const raw = (typeof input === 'string') ? input : (input && input.full_name) || '';
    if (!raw) return { parts: [], firstName: '', middleName: '', lastName: '', fullName: '' };
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    let firstName = '', middleName = '', lastName = '';
    if (parts.length === 1) {
      firstName = parts[0];
    } else if (parts.length === 2) {
      [firstName, lastName] = parts;
    } else {
      firstName = parts[0];
      lastName = parts[parts.length - 1];
      middleName = parts.slice(1, -1).join(' ');
    }
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    return { parts, firstName, middleName, lastName, fullName };
  }

  function idForStudent(s, fallbackPrefix='s', idx=0){
    const parts = splitNames(s);
    return s.faculty_number || parts.fullName || `${fallbackPrefix}_${idx}`;
  }

  function buildIndex(students){
    index = new Map();
    (students || []).forEach((s, i) => {
      const names = splitNames(s);
      const id = s.faculty_number || names.fullName || `s_${i}`;
      index.set(id, { ...s, fullName: names.fullName });
    });
  }

  async function fetchAll(){
    if (Array.isArray(cache) && cache.length > 0) return cache;
    const data = await window.Utils.fetchJSON(API_URL, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const students = Array.isArray(data.students) ? data.students : [];
    cache = students;
    buildIndex(students);
    return cache;
  }

  function getCache(){ return cache; }
  function getIndex(){ return index; }

  window.Students = { fetchAll, splitNames, idForStudent, getCache, getIndex };
})();
