// Netlify Function: busca metadados (título, autor, ano, etc.) de uma
// página qualquer, para o preenchimento automático de referências do tipo
// "site". Existe porque sites em geral bloqueiam esse tipo de leitura
// quando feita direto do navegador da pessoa (CORS) — rodando aqui no
// servidor da função, essa restrição não existe.
//
// Sem dependências externas: usa só o fetch nativo do Node (Netlify roda
// Node 18+, que já tem fetch embutido).

exports.handler = async function handler(event) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: headers, body: '' };
  }

  var url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Parâmetro "url" é obrigatório.' }) };
  }

  try {
    var parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Só links http/https são aceitos.');
    }
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'URL inválida.' }) };
  }

  try {
    var resp = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CatalogoABNTBot/1.0; +https://github.com)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!resp.ok) {
      return {
        statusCode: 502,
        headers: headers,
        body: JSON.stringify({ error: 'A página respondeu com erro (' + resp.status + ').' })
      };
    }

    var contentType = resp.headers.get('content-type') || '';
    if (contentType.indexOf('text/html') === -1 && contentType.indexOf('xhtml') === -1) {
      return {
        statusCode: 415,
        headers: headers,
        body: JSON.stringify({ error: 'Essa página não parece ser HTML (é ' + (contentType || 'desconhecido') + ').' })
      };
    }

    var html = await resp.text();
    var meta = extractMeta(html, resp.url || url);

    return { statusCode: 200, headers: headers, body: JSON.stringify(meta) };
  } catch (e) {
    return {
      statusCode: 502,
      headers: headers,
      body: JSON.stringify({ error: 'Não foi possível acessar essa página: ' + e.message })
    };
  }
};

// --- extração ---------------------------------------------------------

function extractMeta(html, finalUrl) {
  var out = {
    title: pickMetaTag(html, 'og:title') || pickTitleTag(html) || '',
    siteName: pickMetaTag(html, 'og:site_name') || '',
    author: pickMetaTag(html, 'author', 'name') || pickMetaTag(html, 'article:author') || '',
    publishedTime: pickMetaTag(html, 'article:published_time') || pickMetaTag(html, 'og:updated_time') || '',
    canonicalUrl: pickLinkCanonical(html) || finalUrl
  };

  var year = '';
  if (out.publishedTime) {
    var m = out.publishedTime.match(/(\d{4})/);
    if (m) year = m[1];
  }
  out.year = year;

  // limpa e decodifica tudo antes de devolver
  Object.keys(out).forEach(function (k) {
    if (typeof out[k] === 'string') {
      out[k] = decodeEntities(out[k]).replace(/\s+/g, ' ').trim();
    }
  });

  return out;
}

// Busca <meta property="X" content="Y"> ou <meta name="X" content="Y">,
// aceitando os atributos em qualquer ordem e aspas simples ou duplas.
function pickMetaTag(html, key, attr) {
  attr = attr || 'property';
  var attrs = attr === 'property' ? ['property', 'name'] : [attr];
  for (var i = 0; i < attrs.length; i++) {
    var a = attrs[i];
    var reOrder1 = new RegExp(
      '<meta[^>]*\\b' + a + '\\s*=\\s*["\']' + escapeRe(key) + '["\'][^>]*\\bcontent\\s*=\\s*["\']([^"\']*)["\']',
      'i'
    );
    var reOrder2 = new RegExp(
      '<meta[^>]*\\bcontent\\s*=\\s*["\']([^"\']*)["\'][^>]*\\b' + a + '\\s*=\\s*["\']' + escapeRe(key) + '["\']',
      'i'
    );
    var m = html.match(reOrder1) || html.match(reOrder2);
    if (m) return m[1];
  }
  return '';
}

function pickLinkCanonical(html) {
  var reOrder1 = /<link[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']*)["']/i;
  var reOrder2 = /<link[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*\brel\s*=\s*["']canonical["']/i;
  var m = html.match(reOrder1) || html.match(reOrder2);
  return m ? m[1] : '';
}

function pickTitleTag(html) {
  var m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1] : '';
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) { return String.fromCodePoint(parseInt(hex, 16)); })
    .replace(/&#(\d+);/g, function (_, dec) { return String.fromCodePoint(parseInt(dec, 10)); });
}
