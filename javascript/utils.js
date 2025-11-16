(function(){
  function debounce(fn, delay){
    let t = null;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function fetchJSON(url, options){
    const resp = await fetch(url, options);
    if (!resp.ok) {
      const text = await resp.text().catch(()=> '');
      const err = new Error(`HTTP ${resp.status} ${resp.statusText}`);
      err.responseText = text;
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  }

  function textIncludesTokens(text, tokens){
    const hay = (text || '').toLowerCase();
    const toks = Array.isArray(tokens) ? tokens : String(tokens||'').toLowerCase().split(/\s+/).filter(Boolean);
    return toks.every(t => hay.includes(t));
  }

  function normalizeEmail(e){
    return (e || '').trim().toLowerCase();
  }

  window.Utils = { debounce, fetchJSON, textIncludesTokens, normalizeEmail };
})();
