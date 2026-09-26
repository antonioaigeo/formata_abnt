/*
 * app.js — UI wiring: auth (Supabase, optional), the reference form, the
 * personal library (cloud-backed when logged in, browser-only otherwise),
 * the citation generator, and import/export.
 */
(function(){
  "use strict";
  var E = window.Engine;

  /* ---------------------------------------------------------------------
   * SUPABASE SETUP (optional — the app works locally without it)
   * ------------------------------------------------------------------- */
  var cfg = window.CATALOGO_CONFIG || {};
  var supabaseEnabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  var sb = supabaseEnabled ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  var session = null;      // current Supabase session, or null
  var localOnly = !supabaseEnabled; // true once the person picks "continuar sem conta", or when Supabase isn't configured

  var authScreen = document.getElementById('authScreen');
  var mainApp = document.getElementById('mainApp');

  function showApp(){ authScreen.hidden = true; mainApp.hidden = false; }
  function showAuth(){ authScreen.hidden = false; mainApp.hidden = true; }

  /* ---------------------------------------------------------------------
   * LIBRARY STORE — local (localStorage) or cloud (Supabase), same shape
   * ------------------------------------------------------------------- */
  var LOCAL_KEY = 'abnt-catalogo:biblioteca:v1';

  var LocalStore = {
    _read: function(){
      try{ return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }catch(e){ return []; }
    },
    _write: function(list){
      try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); }catch(e){}
    },
    list: async function(){ return this._read(); },
    add: async function(item){
      var list = this._read();
      item.id = 'r' + Date.now() + Math.random().toString(36).slice(2,7);
      list.push(item);
      this._write(list);
      return item;
    },
    update: async function(id, patch){
      var list = this._read();
      var i = list.findIndex(function(x){ return x.id === id; });
      if(i !== -1) list[i] = Object.assign({}, list[i], patch);
      this._write(list);
    },
    remove: async function(id){
      this._write(this._read().filter(function(x){ return x.id !== id; }));
    },
    clear: async function(){ this._write([]); }
  };

  var CloudStore = {
    _row(item){
      return {
        user_id: session.user.id,
        type: item.type,
        data: item.data,
        et_al: !!item.etAl,
        ref_html: item.refHtml,
        ref_plain: item.refPlain,
        cite_authors: item.citeAuthors,
        cite_year: item.citeYear
      };
    },
    _item(row){
      return {
        id: row.id, type: row.type, data: row.data, etAl: row.et_al,
        refHtml: row.ref_html, refPlain: row.ref_plain,
        citeAuthors: row.cite_authors || [], citeYear: row.cite_year || '',
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
      };
    },
    list: async function(){
      var res = await sb.from('references').select('*').order('created_at', {ascending:true});
      if(res.error){ toast('Erro ao carregar a biblioteca: ' + res.error.message); return []; }
      return res.data.map(this._item);
    },
    add: async function(item){
      var res = await sb.from('references').insert(this._row(item)).select().single();
      if(res.error){ toast('Erro ao salvar: ' + res.error.message); throw res.error; }
      return this._item(res.data);
    },
    update: async function(id, patch){
      var row = {};
      if('data' in patch) row.data = patch.data;
      if('etAl' in patch) row.et_al = patch.etAl;
      if('refHtml' in patch) row.ref_html = patch.refHtml;
      if('refPlain' in patch) row.ref_plain = patch.refPlain;
      if('citeAuthors' in patch) row.cite_authors = patch.citeAuthors;
      if('citeYear' in patch) row.cite_year = patch.citeYear;
      var res = await sb.from('references').update(row).eq('id', id);
      if(res.error) toast('Erro ao atualizar: ' + res.error.message);
    },
    remove: async function(id){
      var res = await sb.from('references').delete().eq('id', id);
      if(res.error) toast('Erro ao excluir: ' + res.error.message);
    },
    clear: async function(){
      var res = await sb.from('references').delete().eq('user_id', session.user.id);
      if(res.error) toast('Erro ao limpar: ' + res.error.message);
    }
  };

  function store(){ return (supabaseEnabled && session && !localOnly) ? CloudStore : LocalStore; }

  var library = []; // in-memory cache of the current store's contents

  async function refreshLibrary(){
    library = await store().list();
    renderLibrary();
  }

  /* ---------------------------------------------------------------------
   * AUTH UI
   * ------------------------------------------------------------------- */
  var authForm = document.getElementById('authForm');
  var authEmail = document.getElementById('authEmail');
  var authPassword = document.getElementById('authPassword');
  var authError = document.getElementById('authError');
  var authSubmitBtn = document.getElementById('authSubmitBtn');
  var authTabLogin = document.getElementById('authTabLogin');
  var authTabSignup = document.getElementById('authTabSignup');
  var skipLoginBtn = document.getElementById('skipLoginBtn');
  var accountBox = document.getElementById('accountBox');
  var authMode = 'login';

  function setAuthMode(mode){
    authMode = mode;
    authTabLogin.className = mode === 'login' ? 'btn primary' : 'btn ghost';
    authTabSignup.className = mode === 'signup' ? 'btn primary' : 'btn ghost';
    authSubmitBtn.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
    authError.textContent = '';
  }
  if(authTabLogin){
    authTabLogin.addEventListener('click', function(){ setAuthMode('login'); });
    authTabSignup.addEventListener('click', function(){ setAuthMode('signup'); });
    skipLoginBtn.addEventListener('click', function(){
      localOnly = true;
      showApp();
      renderAccountBox();
      refreshLibrary();
    });
    authForm.addEventListener('submit', async function(e){
      e.preventDefault();
      authError.textContent = '';
      authSubmitBtn.disabled = true;
      var email = authEmail.value.trim(), password = authPassword.value;
      try{
        if(authMode === 'login'){
          var r = await sb.auth.signInWithPassword({email: email, password: password});
          if(r.error) throw r.error;
        } else {
          var r2 = await sb.auth.signUp({email: email, password: password});
          if(r2.error) throw r2.error;
          if(r2.data && r2.data.user && !r2.data.session){
            authError.style.color = 'var(--accent-2)';
            authError.textContent = 'Conta criada! Verifique seu e-mail para confirmar antes de entrar.';
            authSubmitBtn.disabled = false;
            return;
          }
        }
        // onAuthStateChange handles the rest
      }catch(err){
        authError.style.color = '';
        authError.textContent = err.message || 'Não foi possível entrar.';
      }finally{
        authSubmitBtn.disabled = false;
      }
    });
  }

  function renderAccountBox(){
    if(!accountBox) return;
    if(session && session.user){
      var email = session.user.email || '';
      var initial = email.charAt(0).toUpperCase() || '?';
      accountBox.innerHTML =
        '<div class="account-pill"><span class="account-avatar">' + initial + '</span>' +
        '<span>' + email + '</span></div>' +
        '<button class="btn ghost small" id="signOutBtn" type="button">Sair</button>';
      var btn = document.getElementById('signOutBtn');
      if(btn) btn.addEventListener('click', async function(){
        await sb.auth.signOut();
      });
    } else if(supabaseEnabled){
      accountBox.innerHTML = '<button class="btn ghost small" id="goLoginBtn" type="button">Entrar / criar conta</button>';
      var b2 = document.getElementById('goLoginBtn');
      if(b2) b2.addEventListener('click', function(){ localOnly = false; showAuth(); setAuthMode('login'); });
    } else {
      accountBox.innerHTML = '<span style="font-size:12px;color:var(--ink-faint)">Modo local · configure o Supabase para sincronizar</span>';
    }
  }

  function updateLibraryGate(){
    var gate = document.getElementById('libGate');
    var content = document.getElementById('libContent');
    var needsLogin = supabaseEnabled && !session && !localOnly;
    gate.hidden = !needsLogin;
    content.hidden = needsLogin;
  }
  var libGateLoginBtn = document.getElementById('libGateLoginBtn');
  if(libGateLoginBtn) libGateLoginBtn.addEventListener('click', function(){ showAuth(); setAuthMode('login'); });

  async function boot(){
    if(!supabaseEnabled){
      showApp();
      renderAccountBox();
      updateLibraryGate();
      await refreshLibrary();
      return;
    }
    var res = await sb.auth.getSession();
    session = res.data ? res.data.session : null;
    sb.auth.onAuthStateChange(async function(event, newSession){
      session = newSession;
      if(session) localOnly = false;
      renderAccountBox();
      updateLibraryGate();
      if(session || localOnly){ showApp(); await refreshLibrary(); }
      else { showAuth(); }
    });
    if(session){ showApp(); }
    else { showAuth(); setAuthMode('login'); }
    renderAccountBox();
    updateLibraryGate();
    await refreshLibrary();
  }

  /* ---------------------------------------------------------------------
   * REFERENCE FORM
   * ------------------------------------------------------------------- */
  var typeSelect = document.getElementById('type');
  var dynamicFields = document.getElementById('dynamicFields');
  var refEtAl = document.getElementById('refEtAl');
  var previewReference = document.getElementById('previewReference');
  var previewCitation = document.getElementById('previewCitation');
  var formData = {};

  Object.keys(E.TYPES).forEach(function(key){
    var opt = document.createElement('option');
    opt.value = key; opt.textContent = E.TYPES[key].label;
    typeSelect.appendChild(opt);
  });

  function renderDynamicFields(){
    dynamicFields.innerHTML = '';
    var def = E.TYPES[typeSelect.value];
    def.fields.forEach(function(key){
      var meta = E.FIELDS[key];
      var wrap = document.createElement('div');
      wrap.className = 'field';
      if(['author','title','ementa','cartographicNotes'].indexOf(key) !== -1) wrap.classList.add('span2');
      var label = document.createElement('label');
      label.setAttribute('for', 'f_' + key);
      label.textContent = meta.label;
      wrap.appendChild(label);
      var input;
      if(meta.type === 'textarea'){ input = document.createElement('textarea'); input.rows = 2; }
      else if(meta.type === 'select'){
        input = document.createElement('select');
        meta.options.forEach(function(o){ var op = document.createElement('option'); op.value = o; op.textContent = o || 'Selecione…'; input.appendChild(op); });
      } else { input = document.createElement('input'); input.type = meta.type || 'text'; }
      input.id = 'f_' + key;
      if(meta.placeholder) input.placeholder = meta.placeholder;
      input.value = formData[key] || '';
      input.addEventListener('input', function(){ formData[key] = input.value; updatePreview(); });
      wrap.appendChild(input);
      dynamicFields.appendChild(wrap);
    });
    updatePreview();
  }

  function currentData(){
    var d = {};
    E.TYPES[typeSelect.value].fields.forEach(function(key){ d[key] = formData[key] || ''; });
    d.__etAl = refEtAl.checked;
    return d;
  }

  function updatePreview(){
    var def = E.TYPES[typeSelect.value];
    var data = currentData();
    var hasAny = def.fields.some(function(k){ return (data[k]||'').toString().trim(); });
    if(!hasAny){ previewReference.innerHTML = 'Preencha os campos para ver a referência.'; previewCitation.innerHTML = '—'; return; }
    var result = def.build(data);
    previewReference.innerHTML = result.ref || '<span style="color:var(--ink-faint)">Preencha mais campos…</span>';
    var authors = (result.citeAuthors || []).filter(Boolean);
    if(authors.length && result.citeYear){
      previewCitation.innerHTML = '(' + E.citeCore(authors, true) + ', ' + result.citeYear + ')  ·  ' + E.citeCore(authors, false) + ' (' + result.citeYear + ')';
    } else if(authors.length){
      previewCitation.innerHTML = '(' + E.citeCore(authors, true) + ')';
    } else { previewCitation.innerHTML = '—'; }
  }

  typeSelect.addEventListener('change', renderDynamicFields);
  refEtAl.addEventListener('change', updatePreview);
  document.getElementById('clearFormBtn').addEventListener('click', function(){
    formData = {}; refEtAl.checked = false; renderDynamicFields();
  });

  document.getElementById('saveRefBtn').addEventListener('click', async function(){
    var def = E.TYPES[typeSelect.value];
    var data = currentData();
    var hasAny = def.fields.some(function(k){ return (data[k]||'').toString().trim(); });
    if(!hasAny){ toast('Preencha ao menos um campo antes de salvar.'); return; }
    var result = def.build(data);
    var item = {
      type: typeSelect.value,
      data: Object.assign({}, data),
      etAl: !!data.__etAl,
      refHtml: result.ref,
      refPlain: result.ref.replace(/<[^>]*>/g,''),
      citeAuthors: (result.citeAuthors || []).filter(Boolean),
      citeYear: result.citeYear || '',
      createdAt: Date.now()
    };
    try{
      await store().add(item);
    }catch(e){ return; }
    await refreshLibrary();
    toast('Referência salva na biblioteca.');
    formData = {}; refEtAl.checked = false; renderDynamicFields();
  });

  /* ---------------------------------------------------------------------
   * LIBRARY LIST
   * ------------------------------------------------------------------- */
  function sortKeyFor(item){
    var d = item.data;
    if(item.type === 'legislation') return (d.jurisdiction || '').toUpperCase();
    if(item.type === 'chapter'){
      var a = E.splitAuthors(d.author)[0] || E.splitAuthors(d.bookAuthor)[0];
      return a ? E.citeSurname(a).toUpperCase() : (d.bookTitle||'').toUpperCase();
    }
    if(item.type.indexOf('event_') === 0){
      var pa = E.splitAuthors(d.author)[0];
      if(item.type === 'event_part_monograph' && pa) return E.citeSurname(pa).toUpperCase();
      return (d.eventName || '').toUpperCase();
    }
    var first = E.splitAuthors(d.author)[0];
    if(first) return E.citeSurname(first).toUpperCase();
    return E.formatTitleEntry(d.title || '').toUpperCase();
  }

  function computeSuffixes(){
    var sorted = library.slice().sort(function(a,b){
      var ka = sortKeyFor(a), kb = sortKeyFor(b);
      if(ka !== kb) return ka < kb ? -1 : 1;
      if((a.citeYear||'') !== (b.citeYear||'')) return (a.citeYear||'') < (b.citeYear||'') ? -1 : 1;
      return (a.data.title||'').localeCompare(b.data.title||'');
    });
    var suffix = {};
    var i = 0;
    while(i < sorted.length){
      var j = i, group = [];
      while(j < sorted.length && sortKeyFor(sorted[j]) === sortKeyFor(sorted[i]) && (sorted[j].citeYear||'') === (sorted[i].citeYear||'') && (sorted[j].citeYear||'')){
        group.push(sorted[j]); j++;
      }
      if(group.length > 1) group.forEach(function(item, idx){ suffix[item.id] = String.fromCharCode(97 + idx); });
      i = j > i ? j : i + 1;
    }
    return {sorted: sorted, suffix: suffix};
  }

  function libDisplayYear(item, suffixMap){ var s = suffixMap[item.id]; return item.citeYear ? (item.citeYear + (s || '')) : ''; }

  var libList = document.getElementById('libList');
  var libEmpty = document.getElementById('libEmpty');
  var libCount = document.getElementById('libCount');
  var libSearch = document.getElementById('libSearch');
  var libSort = document.getElementById('libSort');
  var libFilterType = document.getElementById('libFilterType');

  Object.keys(E.TYPES).forEach(function(key){
    var opt = document.createElement('option');
    opt.value = key; opt.textContent = E.TYPES[key].label;
    libFilterType.appendChild(opt);
  });

  function renderLibrary(){
    var q = (libSearch.value || '').toLowerCase();
    var filterType = libFilterType.value;
    var mode = libSort.value;
    var calc = computeSuffixes();
    var suffixMap = calc.suffix;

    var list = library.filter(function(item){
      if(filterType && item.type !== filterType) return false;
      if(!q) return true;
      var hay = (item.refPlain + ' ' + JSON.stringify(item.data)).toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    if(mode === 'alpha'){
      list = list.slice().sort(function(a,b){ return (sortKeyFor(a)+(a.citeYear||'')).localeCompare(sortKeyFor(b)+(b.citeYear||'')); });
    } else if(mode === 'recent'){
      list = list.slice().sort(function(a,b){ return b.createdAt - a.createdAt; });
    } else if(mode === 'type'){
      list = list.slice().sort(function(a,b){
        if(a.type !== b.type) return E.TYPES[a.type].label.localeCompare(E.TYPES[b.type].label);
        return sortKeyFor(a).localeCompare(sortKeyFor(b));
      });
    }

    libList.innerHTML = '';
    libCount.textContent = library.length;
    libEmpty.hidden = library.length !== 0;

    list.forEach(function(item){
      var li = document.createElement('li');
      li.className = 'lib-item';
      var displayYear = libDisplayYear(item, suffixMap);
      var citeText = item.citeAuthors && item.citeAuthors.length
        ? '(' + E.citeCore(item.citeAuthors, true) + (displayYear ? ', ' + displayYear : '') + ')' : '';
      li.innerHTML =
        '<div class="lib-item-top"><div>' +
          '<span class="lib-tag">' + E.TYPES[item.type].label + '</span>' +
          '<p class="lib-ref">' + item.refPlain + '</p>' +
          (citeText ? '<p class="lib-cite">' + citeText + '</p>' : '') +
        '</div><div class="lib-item-actions">' +
          '<button class="icon-btn" data-action="cite" data-id="' + item.id + '" title="Usar em uma citação">”</button>' +
          '<button class="icon-btn" data-action="edit" data-id="' + item.id + '" title="Editar">✎</button>' +
          '<button class="icon-btn" data-action="delete" data-id="' + item.id + '" title="Excluir">✕</button>' +
        '</div></div>';
      libList.appendChild(li);
    });

    renderCiteSourceOptions();
  }

  libSearch.addEventListener('input', renderLibrary);
  libSort.addEventListener('change', renderLibrary);
  libFilterType.addEventListener('change', renderLibrary);

  libList.addEventListener('click', async function(e){
    var btn = e.target.closest('[data-action]');
    if(!btn) return;
    var id = btn.getAttribute('data-id');
    var item = library.find(function(i){ return i.id === id; });
    if(!item) return;
    if(btn.dataset.action === 'delete'){
      if(!confirm('Excluir esta referência da biblioteca?')) return;
      await store().remove(id);
      await refreshLibrary();
      toast('Referência excluída.');
    } else if(btn.dataset.action === 'edit'){
      typeSelect.value = item.type;
      formData = Object.assign({}, item.data);
      refEtAl.checked = !!item.etAl;
      renderDynamicFields();
      await store().remove(id);
      await refreshLibrary();
      switchTab('novo');
      toast('Carregado no formulário para edição. Salve novamente ao terminar.');
    } else if(btn.dataset.action === 'cite'){
      switchTab('citar');
      citeSource.value = id;
      citeSource.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('clearLibBtn').addEventListener('click', async function(){
    if(!library.length) return;
    if(!confirm('Isso apaga TODAS as referências salvas nesta conta/navegador. Deseja continuar?')) return;
    await store().clear();
    await refreshLibrary();
    toast('Biblioteca limpa.');
  });

  /* -------- export / import -------- */
  function download(filename, content, mime){
    var blob = new Blob([content], {type: mime + ';charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  document.getElementById('exportTxt').addEventListener('click', function(){
    if(!library.length){ toast('Biblioteca vazia.'); return; }
    var calc = computeSuffixes();
    var lines = calc.sorted.map(function(item){
      var y = libDisplayYear(item, calc.suffix);
      var text = item.refPlain;
      if(item.citeYear && y !== item.citeYear) text = text.replace(item.citeYear + '.', y + '.').replace(item.citeYear + ',', y + ',');
      return text;
    });
    download('referencias_abnt.txt', 'REFERÊNCIAS (ABNT NBR 6023:2018)\n\n' + lines.join('\n\n'), 'text/plain');
    toast('Arquivo .txt gerado.');
  });

  document.getElementById('exportJson').addEventListener('click', function(){
    download('biblioteca_abnt_backup.json', JSON.stringify(library, null, 2), 'application/json');
    toast('Backup .json gerado.');
  });

  document.getElementById('importFileBtn').addEventListener('click', function(){ document.getElementById('importFile').click(); });
  document.getElementById('importFile').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = async function(){
      try{
        var data = JSON.parse(reader.result);
        if(!Array.isArray(data)) throw new Error('formato inválido');
        for(var i = 0; i < data.length; i++){
          var it = data[i];
          if(it && it.type && it.data) await store().add({
            type: it.type, data: it.data, etAl: !!it.etAl, refHtml: it.refHtml, refPlain: it.refPlain,
            citeAuthors: it.citeAuthors || [], citeYear: it.citeYear || '', createdAt: it.createdAt || Date.now()
          });
        }
        await refreshLibrary();
        toast('Backup importado.');
      }catch(err){ toast('Não foi possível ler este arquivo .json.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function bibKey(item, idx){ return (E.citeSurname(item.citeAuthors[0]||'ref') + (item.citeYear||'') + idx).replace(/[^a-zA-Z0-9]/g,''); }
  document.getElementById('exportBib').addEventListener('click', function(){
    if(!library.length){ toast('Biblioteca vazia.'); return; }
    var bibTypeMap = {book:'book', article:'article', website:'misc', tcc:'mastersthesis', dissertation:'mastersthesis', thesis:'phdthesis', youtube:'misc', legislation:'misc', chapter:'incollection', image:'misc', map_printed:'misc', map_electronic:'misc', event_monograph:'proceedings', event_electronic:'proceedings', event_part_monograph:'inproceedings'};
    var out = library.map(function(item, idx){
      var d = item.data, t = bibTypeMap[item.type] || 'misc', fields = [];
      fields.push('  author = {' + (item.citeAuthors || []).map(function(a){ var p = E.parseName(a); return p.surname + (p.given ? ', ' + p.given : ''); }).join(' and ') + '}');
      fields.push('  title = {' + (d.title || d.bookTitle || d.eventTitle || '') + '}');
      if(item.citeYear) fields.push('  year = {' + item.citeYear + '}');
      if(d.publisher || d.bookPublisher || d.eventPublisher) fields.push('  publisher = {' + (d.publisher || d.bookPublisher || d.eventPublisher) + '}');
      if(d.place || d.bookPlace || d.eventPlace) fields.push('  address = {' + (d.place || d.bookPlace || d.eventPlace) + '}');
      if(d.periodicalTitle) fields.push('  journal = {' + d.periodicalTitle + '}');
      if(d.volume) fields.push('  volume = {' + d.volume + '}');
      if(d.number) fields.push('  number = {' + d.number + '}');
      if(d.pages) fields.push('  pages = {' + d.pages + '}');
      if(d.doi) fields.push('  doi = {' + d.doi.replace(/^https?:\/\/doi\.org\//i,'') + '}');
      if(d.isbn) fields.push('  isbn = {' + d.isbn + '}');
      if(d.availableAt) fields.push('  url = {' + d.availableAt + '}');
      return '@' + t + '{' + bibKey(item, idx) + ',\n' + fields.join(',\n') + '\n}';
    });
    download('biblioteca_abnt.bib', out.join('\n\n'), 'application/x-bibtex');
    toast('Arquivo .bib gerado.');
  });

  document.getElementById('exportRis').addEventListener('click', function(){
    if(!library.length){ toast('Biblioteca vazia.'); return; }
    var risTypeMap = {book:'BOOK', article:'JOUR', website:'ELEC', tcc:'THES', dissertation:'THES', thesis:'THES', youtube:'VIDEO', legislation:'STAT', chapter:'CHAP', image:'FIGURE', map_printed:'MAP', map_electronic:'MAP', event_monograph:'CONF', event_electronic:'CONF', event_part_monograph:'CPAPER'};
    var out = library.map(function(item){
      var d = item.data, lines = ['TY  - ' + (risTypeMap[item.type] || 'GEN')];
      (item.citeAuthors || []).forEach(function(a){ var p = E.parseName(a); lines.push('AU  - ' + p.surname + (p.given ? ', ' + p.given : '')); });
      lines.push('TI  - ' + (d.title || d.bookTitle || d.eventTitle || ''));
      if(item.citeYear) lines.push('PY  - ' + item.citeYear);
      if(d.publisher || d.bookPublisher) lines.push('PB  - ' + (d.publisher || d.bookPublisher));
      if(d.place || d.bookPlace) lines.push('CY  - ' + (d.place || d.bookPlace));
      if(d.periodicalTitle) lines.push('JO  - ' + d.periodicalTitle);
      if(d.pages) lines.push('SP  - ' + d.pages);
      if(d.availableAt) lines.push('UR  - ' + d.availableAt);
      if(d.doi) lines.push('DO  - ' + d.doi);
      lines.push('ER  - ');
      return lines.join('\n');
    });
    download('biblioteca_abnt.ris', out.join('\n\n'), 'application/x-research-info-systems');
    toast('Arquivo .ris gerado.');
  });

  /* ---------------------------------------------------------------------
   * IN-TEXT CITATION GENERATOR
   * ------------------------------------------------------------------- */
  var citeSource = document.getElementById('citeSource');
  var citeManualAuthor = document.getElementById('citeManualAuthor');
  var citeManualYear = document.getElementById('citeManualYear');
  var citeAuthorManual = document.getElementById('citeAuthorManual');
  var citeYearManual = document.getElementById('citeYearManual');
  var citeKind = document.getElementById('citeKind');
  var citeStyle = document.getElementById('citeStyle');
  var citePage = document.getElementById('citePage');
  var citeQuoteField = document.getElementById('citeQuoteField');
  var citeQuote = document.getElementById('citeQuote');
  var citeGrifo = document.getElementById('citeGrifo');
  var citeTraducao = document.getElementById('citeTraducao');
  var apudFields = document.getElementById('apudFields');
  var apudAuthor = document.getElementById('apudAuthor');
  var apudYear = document.getElementById('apudYear');
  var apudPage = document.getElementById('apudPage');
  var citeOutputBlock = document.getElementById('citeOutputBlock');

  function renderCiteSourceOptions(){
    var current = citeSource.value;
    citeSource.innerHTML = '<option value="__manual">Inserir dados manualmente</option>';
    var calc = computeSuffixes();
    library.forEach(function(item){
      var opt = document.createElement('option');
      opt.value = item.id;
      var y = libDisplayYear(item, calc.suffix);
      var authorLabel = item.citeAuthors.length ? E.citeSurname(item.citeAuthors[0]) + (item.citeAuthors.length > 1 ? ' et al.' : '') : (item.data.title || '');
      opt.textContent = authorLabel + (y ? ' (' + y + ')' : '');
      citeSource.appendChild(opt);
    });
    if([].slice.call(citeSource.options).some(function(o){ return o.value === current; })) citeSource.value = current;
    toggleManualFields();
  }

  function toggleManualFields(){
    var manual = citeSource.value === '__manual';
    citeManualAuthor.hidden = !manual;
    citeManualYear.hidden = !manual;
  }
  citeSource.addEventListener('change', function(){ toggleManualFields(); updateCiteOutput(); });

  function currentCiteSourceData(){
    if(citeSource.value === '__manual') return { authors: E.splitAuthors(citeAuthorManual.value), year: citeYearManual.value.trim() };
    var item = library.find(function(i){ return i.id === citeSource.value; });
    if(!item) return { authors: [], year: '' };
    var calc = computeSuffixes();
    return { authors: item.citeAuthors, year: libDisplayYear(item, calc.suffix) || item.citeYear };
  }

  function toggleKindFields(){
    var kind = citeKind.value;
    citeQuoteField.hidden = (kind === 'indireta');
    apudFields.hidden = (kind !== 'apud');
    citePage.parentElement.querySelector('label').textContent = kind === 'indireta' ? 'Página / localização (opcional)' : 'Página / localização';
  }

  function updateCiteOutput(){
    var src = currentCiteSourceData();
    citeOutputBlock.textContent = E.buildCitation({
      authors: src.authors, year: src.year, kind: citeKind.value, style: citeStyle.value,
      page: citePage.value, quote: citeQuote.value, grifo: citeGrifo.checked, traducao: citeTraducao.checked,
      apudAuthor: apudAuthor.value, apudYear: apudYear.value, apudPage: apudPage.value
    });
  }

  [citeKind, citeStyle, citePage, citeQuote, citeGrifo, citeTraducao, apudAuthor, apudYear, apudPage, citeAuthorManual, citeYearManual].forEach(function(el){
    el.addEventListener('input', function(){ toggleKindFields(); updateCiteOutput(); });
    el.addEventListener('change', function(){ toggleKindFields(); updateCiteOutput(); });
  });

  /* ---------------------------------------------------------------------
   * TABS / COPY / TOAST
   * ------------------------------------------------------------------- */
  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.panel');
  function switchTab(name){
    tabs.forEach(function(t){ t.classList.toggle('active', t.dataset.tab === name); });
    panels.forEach(function(p){ p.classList.toggle('active', p.id === 'panel-' + name); });
  }
  tabs.forEach(function(t){ t.addEventListener('click', function(){ switchTab(t.dataset.tab); }); });

  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg){
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.hidden = true; }, 2400);
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest('[data-copy]');
    if(!btn) return;
    var el = document.getElementById(btn.getAttribute('data-copy'));
    var text = el.innerText || el.textContent || '';
    if(!text || text === '—'){ toast('Nada para copiar ainda.'); return; }
    var done = function(){ toast('Copiado!'); };
    var fail = function(){
      try{
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        toast('Selecionado — use Ctrl/Cmd+C para copiar.');
      }catch(err){ toast('Não foi possível copiar automaticamente.'); }
    };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fail);
    else fail();
  });

  /* ---------------------------------------------------------------------
   * INIT
   * ------------------------------------------------------------------- */
  typeSelect.value = 'book';
  renderDynamicFields();
  toggleKindFields();
  updateCiteOutput();
  boot();
})();
