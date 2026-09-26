/*
 * metadata.js — preenchimento automático de referências a partir de um
 * DOI, ISBN ou link, para poupar a pessoa de digitar tudo à mão.
 *
 * Fontes usadas (todas de graça, sem chave de API):
 *   - DOI  → CrossRef REST API (api.crossref.org) — dados de artigos.
 *   - ISBN → Open Library, com Google Books como reserva — dados de livros.
 *   - URL  → uma Netlify Function própria (netlify/functions/fetch-url-meta.js),
 *            porque sites em geral bloqueiam essa leitura feita direto do
 *            navegador (CORS). Só funciona quando o site está publicado no
 *            Netlify (ou rodando com `netlify dev`) — em outro ambiente,
 *            devolve um erro explicando isso.
 *
 * Não depende de engine.js nem de app.js: só devolve `{type, data}` prontos
 * para o app.js aplicar no formulário.
 */
(function (global) {
  "use strict";

  function stripIsbn(raw) {
    return (raw || "").replace(/[^0-9Xx]/g, "");
  }

  function looksLikeIsbn(raw) {
    var s = stripIsbn(raw);
    return /^\d{9}[\dXx]$/.test(s) || /^\d{13}$/.test(s);
  }

  function looksLikeDoi(raw) {
    return /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i.test((raw || "").trim());
  }

  function extractDoi(raw) {
    var m = (raw || "").trim().match(/(10\.\d{4,9}\/\S+)$/i);
    return m ? m[1] : (raw || "").trim();
  }

  function looksLikeUrl(raw) {
    return /^https?:\/\//i.test((raw || "").trim());
  }

  // "26 set. 2026" — no mesmo formato usado nos exemplos da NBR 6023/10520.
  var MONTHS = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  function todayAccessDate() {
    var d = new Date();
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function joinAuthors(list) {
    return list.filter(Boolean).join("; ");
  }

  /* --------------------------- DOI / CrossRef --------------------------- */

  function lookupDoi(rawDoi) {
    var doi = extractDoi(rawDoi);
    return fetch("https://api.crossref.org/works/" + encodeURIComponent(doi))
      .then(function (resp) {
        if (!resp.ok) throw new Error(resp.status === 404 ? "DOI não encontrado." : "CrossRef respondeu com erro (" + resp.status + ").");
        return resp.json();
      })
      .then(function (json) {
        var m = json.message || {};
        var authors = (m.author || [])
          .map(function (a) {
            var given = a.given || "";
            var family = a.family || "";
            if (!family) return (a.name || "").trim();
            return (family + ", " + given).trim().replace(/,\s*$/, "");
          })
          .filter(Boolean);

        var dateParts = (m["published-print"] && m["published-print"]["date-parts"]) ||
          (m["published-online"] && m["published-online"]["date-parts"]) ||
          (m.issued && m.issued["date-parts"]) || [];
        var year = dateParts[0] && dateParts[0][0] ? String(dateParts[0][0]) : "";

        var isChapter = m.type === "book-chapter";
        var data = {
          author: joinAuthors(authors),
          title: (m.title && m.title[0]) || "",
          year: year,
          doi: m.DOI || doi
        };

        if (isChapter) {
          data.bookTitle = (m["container-title"] && m["container-title"][0]) || "";
          data.bookYear = year;
          if (m.page) data.chapterPages = m.page;
          return { type: "chapter", data: data };
        }

        data.periodicalTitle = (m["container-title"] && m["container-title"][0]) || "";
        if (m.volume) data.volume = m.volume;
        if (m.issue) data.number = m.issue;
        if (m.page) data.pages = m.page;
        if (m.ISSN && m.ISSN[0]) data.issn = m.ISSN[0];
        return { type: "article", data: data };
      });
  }

  /* ---------------------------- ISBN / livro ---------------------------- */

  function lookupIsbn(rawIsbn) {
    var isbn = stripIsbn(rawIsbn);
    return fetch("https://openlibrary.org/api/books?bibkeys=ISBN:" + isbn + "&format=json&jscmd=data")
      .then(function (resp) {
        if (!resp.ok) throw new Error("Open Library respondeu com erro (" + resp.status + ").");
        return resp.json();
      })
      .then(function (json) {
        var book = json["ISBN:" + isbn];
        if (book) return fromOpenLibrary(book, isbn);
        return lookupIsbnGoogleBooks(isbn);
      })
      .catch(function () {
        return lookupIsbnGoogleBooks(isbn);
      });
  }

  function fromOpenLibrary(book, isbn) {
    var authors = (book.authors || []).map(function (a) { return a.name; });
    var year = (book.publish_date || "").match(/\d{4}/);
    return {
      type: "book",
      data: {
        author: joinAuthors(authors),
        title: book.title || "",
        subtitle: book.subtitle || "",
        publisher: (book.publishers && book.publishers[0] && book.publishers[0].name) || "",
        place: (book.publish_places && book.publish_places[0] && book.publish_places[0].name) || "",
        year: year ? year[0] : "",
        isbn: isbn
      }
    };
  }

  function lookupIsbnGoogleBooks(isbn) {
    return fetch("https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn)
      .then(function (resp) {
        if (!resp.ok) throw new Error("Google Books respondeu com erro (" + resp.status + ").");
        return resp.json();
      })
      .then(function (json) {
        var item = json.items && json.items[0];
        if (!item) throw new Error("ISBN não encontrado em nenhuma base (Open Library ou Google Books).");
        var info = item.volumeInfo || {};
        var year = (info.publishedDate || "").match(/\d{4}/);
        return {
          type: "book",
          data: {
            author: joinAuthors(info.authors || []),
            title: info.title || "",
            subtitle: info.subtitle || "",
            publisher: info.publisher || "",
            year: year ? year[0] : "",
            isbn: isbn
          }
        };
      });
  }

  /* ------------------------------ URL / site ----------------------------- */

  function lookupUrl(rawUrl) {
    var url = (rawUrl || "").trim();
    return fetch("/.netlify/functions/fetch-url-meta?url=" + encodeURIComponent(url))
      .then(function (resp) {
        return resp.json().then(function (json) {
          if (!resp.ok) throw new Error(json.error || "Não foi possível ler essa página.");
          return json;
        });
      })
      .then(function (meta) {
        return {
          type: "website",
          data: {
            author: meta.author || meta.siteName || "",
            title: meta.title || "",
            year: meta.year || "",
            availableAt: meta.canonicalUrl || url,
            accessDate: todayAccessDate()
          }
        };
      })
      .catch(function (err) {
        // Sem a função do Netlify (ex.: abrindo o index.html direto, sem
        // `netlify dev` nem publicação), o fetch acima cai aqui.
        var msg = err && err.message ? err.message : "";
        if (/Unexpected token|<!doctype|Failed to fetch/i.test(msg) || err instanceof TypeError) {
          throw new Error("A busca por link só funciona no site publicado no Netlify (ou rodando `netlify dev` localmente).");
        }
        throw err;
      });
  }

  /* --------------------------------- geral -------------------------------- */

  function lookupByAnything(raw) {
    var value = (raw || "").trim();
    if (!value) return Promise.reject(new Error("Cole um DOI, ISBN ou link antes de buscar."));
    if (looksLikeDoi(value)) return lookupDoi(value);
    if (looksLikeUrl(value)) return lookupUrl(value);
    if (looksLikeIsbn(value)) return lookupIsbn(value);
    return Promise.reject(new Error("Não reconheci isso como DOI, ISBN ou link (http/https)."));
  }

  global.Metadata = {
    lookupByAnything: lookupByAnything,
    lookupDoi: lookupDoi,
    lookupIsbn: lookupIsbn,
    lookupUrl: lookupUrl,
    todayAccessDate: todayAccessDate
  };
})(window);
