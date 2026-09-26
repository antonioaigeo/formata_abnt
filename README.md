# Catálogo ABNT

Gerador de referências e citações no padrão ABNT (NBR 6023:2018 e NBR
10520:2023), com biblioteca pessoal — a ideia é ser um "Zotero mais
simples", com login individual e a biblioteca de cada pessoa salva na
nuvem, sincronizada entre aparelhos.

## Por que Supabase?

Você pediu login individual "de verdade" (com cadastro, não vinculado à
sua conta Claude) rodando em Git + Netlify. O Netlify hospeda só arquivos
estáticos — ele não roda um servidor de autenticação ou banco de dados
sozinho. O [Supabase](https://supabase.com) resolve exatamente essa
lacuna: é um backend hospedado (plano gratuito generoso) que dá login por
e-mail/senha e um banco Postgres, acessados diretamente do navegador via
uma biblioteca JavaScript — sem precisar escrever ou hospedar um servidor
próprio. É a combinação mais comum para "site estático no Netlify + conta
de usuário", por isso foi a escolha aqui.

Sem configurar o Supabase, o site **funciona igual à versão anterior**:
cada pessoa usa sem login, e a biblioteca fica só no navegador dela. É só
preencher `config.js` para ligar as contas na nuvem.

## Estrutura do projeto

```
index.html      — a página (formulário, biblioteca, gerador de citações)
style.css       — todo o visual
engine.js       — só a lógica de formatação ABNT (sem DOM, sem rede) —
                  autores, referências por tipo de fonte, citações
metadata.js     — busca de metadados por DOI/ISBN/link (CrossRef, Open
                  Library, Google Books e a função do Netlify abaixo)
app.js          — liga a página ao engine.js, ao metadata.js e ao Supabase
                  (login, salvar/editar/excluir referências, exportar)
config.js       — suas chaves do Supabase (não são segredas, ver abaixo)
supabase-schema.sql — script para criar a tabela e as regras de acesso
netlify.toml    — configuração de deploy do Netlify
netlify/functions/fetch-url-meta.js — função que lê metadados de um link
                  qualquer (contorna o bloqueio de CORS de sites externos)
```

## Configurando o Supabase (uns 10 minutos)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e um
   novo projeto.
2. No painel do projeto, vá em **SQL Editor** → **New query**, cole o
   conteúdo de `supabase-schema.sql` e clique em **Run**. Isso cria a
   tabela `references` e a regra que garante que cada pessoa só vê e edita
   as próprias referências (Row Level Security).
3. Vá em **Authentication → Providers → Email** e deixe habilitado (é o
   padrão). Decida se quer exigir confirmação por e-mail antes do primeiro
   login (também nessa tela).
4. Vá em **Project Settings → API**. Copie:
   - **Project URL** → cole em `config.js`, em `SUPABASE_URL`.
   - **anon public key** → cole em `config.js`, em `SUPABASE_ANON_KEY`.
   Essas duas informações **não são segredas** — foram feitas para ficar
   no código do site. Quem protege os dados é a Row Level Security do
   passo 2, não o sigilo dessas chaves.
5. Salve `config.js`, teste localmente (basta abrir `index.html` num
   servidor local, ex. `npx serve .`) e depois publique.

## Publicando no Netlify

Como é um site 100% estático, não tem build:

1. Suba esta pasta para o seu repositório Git (o mesmo `formata_abnt` ou
   um novo).
2. No Netlify: **Add new site → Import an existing project**, conecte o
   repositório.
3. **Build command**: deixe em branco. **Publish directory**: `.`
   (a raiz do repositório) — já está assim em `netlify.toml`.
4. Deploy. Pronto — o link do Netlify já serve o site com login
   funcionando (contanto que `config.js` esteja preenchido).

## Preenchimento automático (DOI, ISBN ou link)

Na aba "Nova referência" tem um campo no topo do formulário: cole um DOI,
um ISBN ou o link de uma página e clique em "Buscar". O app identifica
sozinho o que você colou e preenche o formulário:

- **DOI** → busca na [CrossRef](https://www.crossref.org/) (funciona em
  qualquer lugar, inclusive testando localmente — é uma API pública, sem
  chave). Detecta se é um artigo ou um capítulo de livro.
- **ISBN** → busca na [Open Library](https://openlibrary.org/) e, se não
  achar, tenta o [Google Books](https://books.google.com/) (também sem
  chave, funciona em qualquer lugar).
- **Link (URL)** → lê o `<title>` e as tags `og:title`/`author`/data de
  publicação da página. Isso **só funciona no site publicado no Netlify**
  (ou rodando `netlify dev` localmente), porque depende da função incluída
  em `netlify/functions/fetch-url-meta.js` — a maioria dos sites bloqueia
  esse tipo de leitura quando feita direto do navegador da pessoa (CORS), e
  essa função existe justamente para contornar isso, rodando no servidor
  do Netlify em vez do navegador. Abrindo o `index.html` direto (sem
  publicar), a busca por DOI e ISBN continua funcionando normalmente — só
  a busca por link mostra um aviso explicando que precisa do Netlify.

Depois de preenchido, revise os campos — nem toda base tem 100% dos dados
(um ISBN sem editora cadastrada, por exemplo), e a lógica de nomes de
autor da ABNT continua sendo aplicada em cima do que a busca trouxe.

## O que mudou em relação à versão anterior (só localStorage)

- **Login com e-mail e senha**, com cadastro próprio (Supabase Auth) —
  sem depender de conta Google/Claude/etc.
- **Biblioteca na nuvem**: cada pessoa só vê a própria (Row Level
  Security no banco, não só uma checagem na tela).
- Sincroniza entre navegador do computador e do celular, por exemplo.
- Continua funcionando **sem** conta, se você preferir não configurar o
  Supabase agora, ou se a pessoa clicar em "Continuar sem conta" — nesse
  caso volta a salvar só no navegador local, como antes.
- Toda a lógica de formatação ABNT (nomes de autor, tipos de referência,
  citação direta/indireta/apud, sufixos a/b/c) é a mesma da versão
  anterior, só que separada em `engine.js` para ficar mais fácil de
  revisar e testar independente da tela.

## Limitações honestas

- Isso não é uma cópia 1:1 do Zotero: não tem extensão de navegador para
  capturar a página que você está lendo com um clique, e não gera notas de
  rodapé num editor de texto. Já importa metadados automaticamente por
  DOI/ISBN/link (ver seção acima) — é o que mais se aproxima do "clicar e
  já vem tudo preenchido" do Zotero, sem precisar instalar nada. A extensão
  de navegador propriamente dita seria um projeto à parte (um componente
  separado, instalado no Chrome/Firefox, com permissão para ler a aba
  aberta) — se quiser seguir para isso depois, dá pra planejar como uma
  próxima etapa.
- Recuperação de senha usa o fluxo padrão do Supabase (e-mail); configure
  o remetente de e-mail do projeto se quiser algo com a sua marca (painel
  do Supabase → Authentication → Email Templates / SMTP).
- O parser de nome de autor segue os exemplos da própria NBR 6023 (ex.:
  "Lino de Albergaria" vira "ALBERGARIA, Lino de"), mas nomes compostos
  fora do padrão comum (ex. "García Márquez", "La Torre") devem ser
  digitados já como "Sobrenome, Nome" para sair exatamente como você
  quer — está documentado no placeholder do campo.
