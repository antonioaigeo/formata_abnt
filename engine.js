/*
 * engine.js — the ABNT reference & citation engine.
 * Pure logic, no DOM, no network. Everything here follows the reading of
 * ABNT NBR 6023:2018 (referências) and NBR 10520:2023 (citações) described
 * in the project README. Exposed as the global `Engine` object.
 */
(function(global){
  "use strict";

  /* ---------------------------------------------------------------------
   * NAME PARSING
   * ------------------------------------------------------------------- */
  // Suffixes that stay attached to the surname (e.g. "Assaf Neto" — ABNT NBR 6023, 8.1.1.3 b).
  var SUFFIXES = ['filho','neto','sobrinho','junior','jr'];
  var ARTICLES = ['a','o','as','os','um','uma','uns','umas'];

  // Note on prepositions ("de", "da", "do", "van", ...): ABNT's own worked
  // examples (8.1.1.3) show these staying attached to the GIVEN name, not
  // moving to the front of the filing surname — e.g. "Lino de Albergaria"
  // is filed as "ALBERGARIA, Lino de.", and "Jef Van den Houte" as
  // "HOUTE, Jef Van den." So, for a plain space-separated name, the surname
  // is simply the last word (or the last two, for a recognized suffix).
  // For anything that doesn't follow that pattern — compound surnames such
  // as "Espírito Santo", hyphenated names, hispanic double surnames, or
  // prefixes that genuinely belong to the surname such as "La Torre" —
  // type the name as "Sobrenome, Nome" and it is used exactly as given.
  function parseName(raw){
    raw = (raw || '').trim();
    if(!raw) return {surname:'', given:''};
    if(raw.indexOf(',') !== -1){
      var parts = raw.split(',');
      return { surname: parts[0].trim(), given: parts.slice(1).join(',').trim() };
    }
    var tokens = raw.split(/\s+/).filter(Boolean);
    if(tokens.length === 1) return {surname: tokens[0], given:''};
    var end = tokens.length - 1;
    var surnameTokens = [tokens[end]];
    var cleanLast = tokens[end].toLowerCase().replace(/\.$/,'');
    if(SUFFIXES.indexOf(cleanLast) !== -1 && end - 1 >= 0){
      surnameTokens = [tokens[end-1], tokens[end]];
      end = end - 1;
    }
    return { surname: surnameTokens.join(' '), given: tokens.slice(0, end).join(' ') };
  }

  function smartCase(token){
    if(!token) return token;
    if(token === token.toUpperCase() && token.length > 1) return token.charAt(0) + token.slice(1).toLowerCase();
    return token;
  }
  function titleCaseName(name){ return (name||'').split(/\s+/).map(smartCase).join(' '); }

  function splitAuthors(str){ return (str || '').split(';').map(function(s){ return s.trim(); }).filter(Boolean); }

  // "SOBRENOME, Nome" — as required for the reference list (NBR 6023 8.1.1.1)
  function refAuthorName(raw){
    var p = parseName(raw);
    var surname = titleCaseName(p.surname).toUpperCase();
    return p.given ? (surname + ', ' + titleCaseName(p.given)) : surname;
  }

  function refAuthors(list, etAl){
    if(!list.length) return '';
    if(etAl && list.length >= 4) return refAuthorName(list[0]) + ' et al.';
    return list.map(refAuthorName).join('; ');
  }

  // just the surname, natural case — for in-text citations (NBR 10520 6.1.1.1)
  function citeSurname(raw){
    var p = parseName(raw);
    return titleCaseName(p.surname);
  }

  function citeCore(list, parenStyle){
    if(!list || !list.length) return '';
    var s = list.map(citeSurname);
    if(s.length >= 4) return s[0] + ' <em>et al.</em>';
    if(parenStyle) return s.join('; ');
    if(s.length === 1) return s[0];
    if(s.length === 2) return s[0] + ' e ' + s[1];
    return s.slice(0, -1).join(', ') + ' e ' + s[s.length - 1];
  }

  function extractYear(str){
    var m = (str||'').match(/(\d{4})(?!.*\d{4})/);
    return m ? m[1] : '';
  }

  function tidy(s){
    return (s || '')
      .replace(/[ \t]+/g,' ')
      .replace(/\s+([.,:;])/g,'$1')
      .replace(/\.{2,}/g,'.')
      .replace(/,\s*\./g,'.')
      .replace(/^\s*[.,]\s*/,'')
      .trim();
  }

  function formatTitleEntry(title){
    var words = (title||'').trim().split(/\s+/);
    if(!words[0]) return '';
    if(ARTICLES.indexOf(words[0].toLowerCase()) !== -1 && words.length > 1){
      return words[0].toUpperCase() + ' ' + words[1].toUpperCase() + (words.length > 2 ? ' ' + words.slice(2).join(' ') : '');
    }
    return words[0].toUpperCase() + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
  }

  // bold + normal case when there are authors; bold + first word(s) capitalized
  // (title as main entry element) when there is none — NBR 6023, 8.2 / 8.2.1
  function titleElement(title, authorsArr){
    if(authorsArr && authorsArr.length) return '<b>' + (title||'') + '</b>';
    return '<b>' + formatTitleEntry(title||'') + '</b>';
  }

  function doiText(doi){
    if(!doi) return '';
    if(/^https?:\/\//i.test(doi)) return doi;
    return 'https://doi.org/' + doi.replace(/^doi:\s*/i,'');
  }

  /* ---------------------------------------------------------------------
   * FIELD REGISTRY
   * ------------------------------------------------------------------- */
  var FIELDS = {
    author: {label:'Autor(es) — separe múltiplos por ";"', placeholder:'Ex: Silva, João; Souza, Maria ou Organização Mundial da Saúde'},
    title: {label:'Título', placeholder:'Título principal da obra'},
    subtitle: {label:'Subtítulo', placeholder:'Se houver'},
    edition: {label:'Edição', placeholder:'Ex: 2'},
    place: {label:'Local', placeholder:'Ex: São Paulo'},
    publisher: {label:'Editora', placeholder:'Ex: Editora XYZ'},
    year: {label:'Ano', placeholder:'Ex: 2023'},
    periodicalTitle: {label:'Título do periódico', placeholder:'Nome da revista'},
    volume: {label:'Volume', placeholder:'Ex: 10'},
    number: {label:'Número', placeholder:'Ex: 2'},
    pages: {label:'Páginas (inicial-final)', placeholder:'Ex: 25-40'},
    institution: {label:'Instituição', placeholder:'Ex: Universidade Federal de Minas Gerais'},
    courseProgram: {label:'Curso/Programa (grau e área)', placeholder:'Ex: Graduação em Marketing'},
    documentType: {label:'Tipo do trabalho', type:'select', options:['','Trabalho de Conclusão de Curso','Dissertação','Tese']},
    pagesOrVolumes: {label:'Nº de folhas ou volumes', placeholder:'Ex: 120 f.'},
    videoDuration: {label:'Duração do vídeo', placeholder:'Ex: 15 min.'},
    platformProducer: {label:'Canal/produtora', placeholder:'Ex: Descomplica'},
    jurisdiction: {label:'Jurisdição', placeholder:'Ex: BRASIL ou SÃO PAULO (Estado)'},
    legislationType: {label:'Tipo de ato', placeholder:'Ex: Lei'},
    legislationNumber: {label:'Número do ato', placeholder:'Ex: nº 10.406'},
    legislationDate: {label:'Data do ato', placeholder:'Ex: 10 de janeiro de 2002'},
    ementa: {label:'Ementa', type:'textarea', placeholder:'Ex: Institui o Código Civil.'},
    publicationVehicle: {label:'Veículo de publicação', placeholder:'Ex: Diário Oficial da União'},
    publicationLocation: {label:'Local de publicação do ato', placeholder:'Ex: Brasília, DF'},
    publicationVolumeNumber: {label:'Volume/número da publicação', placeholder:'Ex: ano 139, n. 8'},
    publicationPages: {label:'Páginas na publicação', placeholder:'Ex: 1-74'},
    publicationDate: {label:'Data da publicação', placeholder:'Ex: 11 jan. 2002'},
    bookAuthor: {label:'Autor(es) do livro (capítulo)', placeholder:'Ex: Silva, Pedro; Santos, Ana'},
    bookOrganizer: {label:'Organizador do livro', placeholder:'Ex: Oliveira, Carlos'},
    bookTitle: {label:'Título do livro', placeholder:'Título da obra'},
    bookSubtitle: {label:'Subtítulo do livro', placeholder:'Se houver'},
    bookEdition: {label:'Edição do livro', placeholder:'Ex: 3'},
    bookPlace: {label:'Local do livro', placeholder:'Ex: Rio de Janeiro'},
    bookPublisher: {label:'Editora do livro', placeholder:'Ex: Editora ABC'},
    bookYear: {label:'Ano do livro', placeholder:'Ex: 2020'},
    chapterPages: {label:'Páginas do capítulo', placeholder:'Ex: 15-24'},
    imageType: {label:'Tipo de imagem', placeholder:'Ex: fotografia'},
    imageDimensions: {label:'Dimensões', placeholder:'Ex: 46x63 cm'},
    imageLocation: {label:'Localização/acervo', placeholder:'Ex: Coleção particular'},
    cartographicType: {label:'Tipo cartográfico', placeholder:'Ex: mapa, atlas'},
    scale: {label:'Escala', placeholder:'Ex: 1:2.000'},
    dimensions: {label:'Dimensões', placeholder:'Ex: 79 x 95 cm'},
    cartographicNotes: {label:'Notas cartográficas', type:'textarea', placeholder:'Ex: Projeção UTM.'},
    eventName: {label:'Nome do evento', placeholder:'Ex: CONGRESSO BRASILEIRO DE BIBLIOTECONOMIA'},
    eventNumber: {label:'Número do evento', placeholder:'Ex: 10'},
    eventYear: {label:'Ano do evento', placeholder:'Ex: 1979'},
    eventPlace: {label:'Local do evento', placeholder:'Ex: Curitiba'},
    eventTitle: {label:'Título dos anais', placeholder:'Ex: Anais [...]'},
    eventPublisher: {label:'Editora dos anais', placeholder:'Ex: Associação Bibliotecária do Paraná'},
    eventPublicationDate: {label:'Data de publicação dos anais', placeholder:'Ex: 1979'},
    isbn: {label:'ISBN', placeholder:'Ex: 978-85-07-07757-2'},
    issn: {label:'ISSN', placeholder:'Ex: 1678-2674'},
    doi: {label:'DOI', placeholder:'Ex: 10.1590/S1519-70772014000100002'},
    availableAt: {label:'Disponível em (URL)', type:'url', placeholder:'https://www.exemplo.com.br'},
    accessDate: {label:'Acesso em', placeholder:'Ex: 10 jan. 2023'}
  };

  /* ---------------------------------------------------------------------
   * REFERENCE TYPES
   * ------------------------------------------------------------------- */
  function buildAcademic(defaultDocType){
    return function(d){
      var authors = splitAuthors(d.author);
      var ref = '';
      if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
      ref += titleElement(d.title, authors) + (d.subtitle ? ': ' + d.subtitle : '') + '. ';
      if(d.year) ref += d.year + '. ';
      if(d.pagesOrVolumes) ref += d.pagesOrVolumes + '. ';
      ref += (defaultDocType) + (d.courseProgram ? ' (' + d.courseProgram + ')' : '') + ' – ';
      if(d.institution) ref += d.institution + ', ';
      if(d.place) ref += d.place + ', ';
      if(d.year) ref += d.year + '.';
      if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
      return {ref: tidy(ref), citeAuthors: authors, citeYear: d.year};
    };
  }

  function buildMap(electronic){
    return function(d){
      var authors = splitAuthors(d.author);
      var ref = '';
      if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
      ref += titleElement(d.title, authors) + (d.subtitle ? ': ' + d.subtitle : '') + '. ';
      if(d.place) ref += d.place + ': ';
      if(d.publisher) ref += d.publisher + ', ';
      if(d.year) ref += d.year + '. ';
      if(d.cartographicType) ref += '1 ' + d.cartographicType + '. ';
      if(d.dimensions) ref += d.dimensions + '. ';
      if(d.scale) ref += 'Escala ' + d.scale + '. ';
      if(d.cartographicNotes) ref += d.cartographicNotes + '.';
      if(electronic){
        if(d.availableAt) ref += ' Disponível em: ' + d.availableAt + '.';
        if(d.accessDate) ref += ' Acesso em: ' + d.accessDate + '.';
        if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
      }
      if(d.isbn) ref += ' ISBN ' + d.isbn + '.';
      return {ref: tidy(ref), citeAuthors: authors.length ? authors : [d.title], citeYear: d.year};
    };
  }

  function buildEvent(kind){
    return function(d){
      var ref = '';
      var authors = kind === 'part' ? splitAuthors(d.author) : [];
      if(kind === 'part'){
        if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
        ref += d.title + (d.subtitle ? ': ' + d.subtitle : '') + '. In: ';
      }
      if(d.eventName) ref += '<b>' + d.eventName.toUpperCase() + '</b>';
      if(d.eventNumber) ref += ', ' + d.eventNumber + '.';
      if(d.eventYear) ref += ', ' + d.eventYear + ',';
      if(d.eventPlace) ref += ' ' + d.eventPlace + '. ';
      if(d.eventTitle) ref += '<b>' + d.eventTitle.toUpperCase() + '</b>. ';
      if(d.eventPlace) ref += d.eventPlace + ': ';
      if(d.eventPublisher) ref += d.eventPublisher + ', ';
      if(d.eventPublicationDate) ref += d.eventPublicationDate + '.';
      if(kind === 'part' && d.chapterPages) ref += ' p. ' + d.chapterPages + '.';
      if(d.availableAt) ref += ' Disponível em: ' + d.availableAt + '.';
      if(d.accessDate) ref += ' Acesso em: ' + d.accessDate + '.';
      if(d.issn) ref += ' ISSN ' + d.issn + '.';
      if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
      var citeAuthors = (kind === 'part' && authors.length) ? authors : [d.eventName || ''];
      return {ref: tidy(ref), citeAuthors: citeAuthors, citeYear: d.eventYear};
    };
  }

  var TYPES = {
    book: { label:'Livro', fields:['author','title','subtitle','edition','place','publisher','year','isbn'],
      build: function(d){
        var authors = splitAuthors(d.author);
        var ref = '';
        if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
        ref += titleElement(d.title, authors) + (d.subtitle ? ': ' + d.subtitle : '') + '. ';
        if(d.edition) ref += d.edition + '. ed. ';
        if(d.place) ref += d.place + ': ';
        if(d.publisher) ref += d.publisher + ', ';
        if(d.year) ref += d.year + '.';
        if(d.isbn) ref += ' ISBN ' + d.isbn + '.';
        return {ref: tidy(ref), citeAuthors: authors, citeYear: d.year};
      }
    },
    article: { label:'Artigo de periódico', fields:['author','title','periodicalTitle','place','volume','number','pages','year','issn','doi'],
      build: function(d){
        var authors = splitAuthors(d.author);
        var ref = '';
        if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
        ref += d.title + '. ';
        if(d.periodicalTitle) ref += '<b>' + d.periodicalTitle + '</b>, ';
        if(d.place) ref += d.place + ', ';
        if(d.volume) ref += 'v. ' + d.volume + ', ';
        if(d.number) ref += 'n. ' + d.number + ', ';
        if(d.pages) ref += 'p. ' + d.pages + ', ';
        if(d.year) ref += d.year + '.';
        if(d.issn) ref += ' ISSN ' + d.issn + '.';
        if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
        return {ref: tidy(ref), citeAuthors: authors, citeYear: d.year};
      }
    },
    website: { label:'Site / documento online', fields:['author','title','year','availableAt','accessDate','doi'],
      build: function(d){
        var authors = splitAuthors(d.author);
        var ref = '';
        if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
        ref += titleElement(d.title, authors) + '. ';
        if(d.year) ref += d.year + '. ';
        if(d.availableAt) ref += 'Disponível em: ' + d.availableAt + '. ';
        if(d.accessDate) ref += 'Acesso em: ' + d.accessDate + '.';
        if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
        return {ref: tidy(ref), citeAuthors: authors.length ? authors : [d.title], citeYear: d.year};
      }
    },
    tcc: { label:'TCC', fields:['author','title','subtitle','year','pagesOrVolumes','institution','courseProgram','place','doi'], build: buildAcademic('Trabalho de Conclusão de Curso') },
    dissertation: { label:'Dissertação', fields:['author','title','subtitle','year','pagesOrVolumes','institution','courseProgram','place','doi'], build: buildAcademic('Dissertação') },
    thesis: { label:'Tese', fields:['author','title','subtitle','year','pagesOrVolumes','institution','courseProgram','place','doi'], build: buildAcademic('Tese') },
    youtube: { label:'Vídeo do YouTube', fields:['author','title','platformProducer','place','year','videoDuration','availableAt','accessDate','doi'],
      build: function(d){
        var authors = splitAuthors(d.author);
        var ref = '';
        if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
        else if(d.platformProducer) ref += d.platformProducer.toUpperCase() + '. ';
        ref += titleElement(d.title, authors) + '. [Vídeo online]. ';
        if(d.place) ref += d.place + ': ';
        if(d.platformProducer && !authors.length) ref += d.platformProducer + ', ';
        if(d.year) ref += d.year + '. ';
        if(d.videoDuration) ref += d.videoDuration + '. ';
        if(d.availableAt) ref += 'Disponível em: ' + d.availableAt + '. ';
        if(d.accessDate) ref += 'Acesso em: ' + d.accessDate + '.';
        if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
        return {ref: tidy(ref), citeAuthors: authors.length ? authors : [d.platformProducer || d.title], citeYear: d.year};
      }
    },
    legislation: { label:'Legislação', fields:['jurisdiction','legislationType','legislationNumber','legislationDate','ementa','publicationVehicle','publicationLocation','publicationVolumeNumber','publicationPages','publicationDate','availableAt','accessDate','doi'],
      build: function(d){
        var ref = '';
        if(d.jurisdiction) ref += d.jurisdiction.toUpperCase() + '. ';
        if(d.legislationType && d.legislationNumber && d.legislationDate) ref += d.legislationType + ' ' + d.legislationNumber + ', de ' + d.legislationDate + '. ';
        else if(d.legislationType && d.legislationNumber) ref += d.legislationType + ' ' + d.legislationNumber + '. ';
        else if(d.legislationType) ref += d.legislationType + '. ';
        if(d.ementa) ref += d.ementa + '. ';
        if(d.publicationVehicle) ref += d.publicationVehicle + ': ';
        if(d.publicationLocation) ref += d.publicationLocation + ', ';
        if(d.publicationVolumeNumber) ref += d.publicationVolumeNumber + ', ';
        if(d.publicationPages) ref += 'p. ' + d.publicationPages + ', ';
        if(d.publicationDate) ref += d.publicationDate + '.';
        if(d.availableAt) ref += ' Disponível em: ' + d.availableAt + '.';
        if(d.accessDate) ref += ' Acesso em: ' + d.accessDate + '.';
        if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
        var year = extractYear(d.legislationDate) || extractYear(d.publicationDate);
        return {ref: tidy(ref), citeAuthors: [d.jurisdiction || ''], citeYear: year};
      }
    },
    chapter: { label:'Capítulo de livro', fields:['author','title','subtitle','bookAuthor','bookOrganizer','bookTitle','bookSubtitle','bookEdition','bookPlace','bookPublisher','bookYear','chapterPages','isbn','doi','availableAt','accessDate'],
      build: function(d){
        var authors = splitAuthors(d.author);
        var ref = '';
        if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
        ref += d.title + (d.subtitle ? ': ' + d.subtitle : '') + '. In: ';
        var bookAuthors = splitAuthors(d.bookAuthor);
        if(bookAuthors.length) ref += refAuthors(bookAuthors, d.__etAl) + '. ';
        else if(d.bookOrganizer) ref += refAuthorName(d.bookOrganizer) + ' (org.). ';
        ref += '<b>' + (d.bookTitle||'').toUpperCase() + '</b>' + (d.bookSubtitle ? ': ' + d.bookSubtitle : '') + '. ';
        if(d.bookEdition) ref += d.bookEdition + '. ed. ';
        if(d.bookPlace) ref += d.bookPlace + ': ';
        if(d.bookPublisher) ref += d.bookPublisher + ', ';
        if(d.bookYear) ref += d.bookYear + '. ';
        if(d.chapterPages) ref += 'p. ' + d.chapterPages + '.';
        if(d.availableAt) ref += ' Disponível em: ' + d.availableAt + '.';
        if(d.accessDate) ref += ' Acesso em: ' + d.accessDate + '.';
        if(d.isbn) ref += ' ISBN ' + d.isbn + '.';
        if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
        var citeAuthors = authors.length ? authors : (bookAuthors.length ? bookAuthors : [d.bookOrganizer || d.bookTitle]);
        return {ref: tidy(ref), citeAuthors: citeAuthors, citeYear: d.bookYear};
      }
    },
    image: { label:'Imagem / foto', fields:['author','title','year','imageType','imageDimensions','imageLocation','availableAt','accessDate','doi'],
      build: function(d){
        var authors = splitAuthors(d.author);
        var ref = '';
        if(authors.length) ref += refAuthors(authors, d.__etAl) + '. ';
        ref += titleElement(d.title, authors) + '. ';
        if(d.year) ref += d.year + '. ';
        if(d.imageType) ref += d.imageType + '. ';
        if(d.imageDimensions) ref += d.imageDimensions + '. ';
        if(d.imageLocation) ref += d.imageLocation + '.';
        if(d.availableAt) ref += ' Disponível em: ' + d.availableAt + '.';
        if(d.accessDate) ref += ' Acesso em: ' + d.accessDate + '.';
        if(d.doi) ref += ' DOI: ' + doiText(d.doi) + '.';
        return {ref: tidy(ref), citeAuthors: authors.length ? authors : [d.title], citeYear: d.year};
      }
    },
    map_printed: { label:'Mapa (impresso)', fields:['author','title','subtitle','place','publisher','year','cartographicType','dimensions','scale','cartographicNotes','isbn'], build: buildMap(false) },
    map_electronic: { label:'Mapa (eletrônico)', fields:['author','title','subtitle','place','publisher','year','cartographicType','dimensions','scale','cartographicNotes','availableAt','accessDate','doi','isbn'], build: buildMap(true) },
    event_monograph: { label:'Evento (anais completos)', fields:['eventName','eventNumber','eventYear','eventPlace','eventTitle','eventPublisher','eventPublicationDate','issn','doi'], build: buildEvent('monograph') },
    event_electronic: { label:'Evento (anais eletrônicos)', fields:['eventName','eventNumber','eventYear','eventPlace','eventTitle','eventPublisher','eventPublicationDate','availableAt','accessDate','issn','doi'], build: buildEvent('electronic') },
    event_part_monograph: { label:'Trabalho publicado em anais', fields:['author','title','subtitle','chapterPages','eventName','eventNumber','eventYear','eventPlace','eventTitle','eventPublisher','eventPublicationDate','availableAt','accessDate','issn','doi'], build: buildEvent('part') }
  };

  /* ---------------------------------------------------------------------
   * IN-TEXT CITATION BUILDER (used by the "Citar no texto" tab)
   * ------------------------------------------------------------------- */
  function buildCitation(opts){
    var authors = opts.authors || [], year = opts.year || '';
    var kind = opts.kind, style = opts.style;
    var page = (opts.page || '').trim();
    var pageExtra = page ? 'p. ' + page : '';
    var grifo = !!opts.grifo, traducao = !!opts.traducao;
    var quote = (opts.quote || '').trim();

    function parenOut(core, y, extra){ return '(' + core + (y ? ', ' + y : '') + (extra ? ', ' + extra : '') + ')'; }
    function narrOut(core, y, extra){ return core + ' (' + y + (extra ? ', ' + extra : '') + ')'; }

    if(!authors.length) return 'Informe ao menos um autor (ou selecione uma fonte da biblioteca).';

    var marks = [];
    if(grifo) marks.push('grifo nosso');
    if(traducao) marks.push('tradução nossa');
    var extraAll = [pageExtra].concat(marks).filter(Boolean).join(', ');

    if(kind === 'indireta'){
      var extra = pageExtra || null;
      return style === 'parentetica' ? parenOut(citeCore(authors, true), year, extra) : narrOut(citeCore(authors, false), year, extra) + '.';
    }
    if(kind === 'direta-curta'){
      var q = quote || '[trecho citado]';
      if(style === 'parentetica') return '"' + q + '" ' + parenOut(citeCore(authors, true), year, extraAll) + '.';
      return 'Segundo ' + citeCore(authors, false) + ' (' + year + (extraAll ? ', ' + extraAll : '') + '), "' + q + '".';
    }
    if(kind === 'direta-longa'){
      var qL = quote || '[trecho citado]';
      var tail = parenOut(citeCore(authors, true), year, extraAll) + '.';
      return '(Recuo de 4 cm, fonte menor, sem aspas, espaço simples — cole assim no seu documento:)\n\n' + qL + ' ' + tail;
    }
    if(kind === 'apud'){
      var origPart = (opts.apudAuthor || '[autor original]') + ', ' + (opts.apudYear || '[ano]') + (opts.apudPage ? ', p. ' + opts.apudPage : '');
      var consultedPart = citeCore(authors, true) + (year ? ', ' + year : '') + (page ? ', p. ' + page : '');
      if(style === 'parentetica'){
        var body = quote ? '"' + quote + '" ' : '';
        return body + '(' + origPart + ' apud ' + consultedPart + ')' + marks.map(function(m){ return ', ' + m; }).join('') + '.';
      }
      var origSurname = citeSurname(opts.apudAuthor || '');
      var narrOrig = (opts.apudYear || '[ano]') + (opts.apudPage ? ', p. ' + opts.apudPage : '');
      return 'Segundo ' + (origSurname || '[autor original]') + ' (' + narrOrig + ' apud ' + consultedPart + ')' + (quote ? ', "' + quote + '"' : '') + '.';
    }
    return '';
  }

  global.Engine = {
    parseName: parseName, titleCaseName: titleCaseName, splitAuthors: splitAuthors,
    refAuthorName: refAuthorName, refAuthors: refAuthors,
    citeSurname: citeSurname, citeCore: citeCore, extractYear: extractYear,
    tidy: tidy, formatTitleEntry: formatTitleEntry, titleElement: titleElement, doiText: doiText,
    FIELDS: FIELDS, TYPES: TYPES, buildCitation: buildCitation
  };
})(window);
