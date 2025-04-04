const express = require('express');
const puppeteer = require('puppeteer');
const juice = require('juice');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// Adicionando rota para servir o index.html na raiz "/"
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Apple杆WebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 5000 // Timeout de 5 segundos por recurso
      });
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.error(`Tentativa ${i + 1} falhou para ${url}: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function resourceToDataURL(response) {
  const buffer = await response.buffer();
  const base64 = buffer.toString('base64');
  const mime = response.headers.get('content-type') || 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
}

app.post('/clone', async (req, res) => {
  const url = req.body.url;
  if (!url) {
    return res.status(400).send('URL é obrigatória');
  }

  const startTime = Date.now();
  console.log(`Iniciando clonagem da URL: ${url}`);

  try {
    // Configuração para usar Chrome no Koyeb
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium-browser', // Caminho padrão no Koyeb
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=site-per-process'
      ]
    });
    const page = await browser.newPage();

    // Otimizar carregamento da página
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['font', 'media', 'websocket'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Aumentar o tempo de espera e executar scripts para carregar elementos dinâmicos
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => {
      return new Promise(resolve => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(resolve, 3000); // Aumentei para 3 segundos para garantir carregamento de imagens dinâmicas
      });
    });

    // Capturar todas as imagens (estáticas e dinâmicas)
    const imageUrls = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      const lazyImages = Array.from(document.querySelectorAll('[data-src], [data-lazy-src]'));
      const allImages = [
        ...images.map(img => img.src),
        ...lazyImages.map(img => img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))
      ];
      return allImages.filter(src => src && !src.startsWith('data:'));
    });

    let html = await page.content();

    const styles = await page.evaluate(() => {
      const styleElements = Array.from(document.querySelectorAll('style'));
      const linkElements = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      const fontFaces = Array.from(document.styleSheets)
        .map(sheet => {
          try {
            return Array.from(sheet.cssRules)
              .map(rule => rule.cssText)
              .join('\n');
          } catch (e) {
            return '';
          }
        })
        .join('\n');
      return {
        inlineStyles: styleElements.map(el => el.innerHTML).join('\n'),
        externalStyles: linkElements.map(el => el.href),
        fontFaces
      };
    });

    const stylePromises = styles.externalStyles.map(async styleUrl => {
      try {
        const response = await fetchWithRetry(styleUrl);
        return await response.text();
      } catch (err) {
        console.error(`Erro ao baixar estilo ${styleUrl}: ${err.message}`);
        return '';
      }
    });
    const externalStylesContent = (await Promise.all(stylePromises)).join('\n');

    // Inlinear todos os estilos para preservar o layout 100%
    html = juice(html + `<style>${styles.inlineStyles}\n${externalStylesContent}\n${styles.fontFaces}</style>`, {
      applyStyleTags: true,
      applyLinkTags: true,
      removeStyleTags: false,
      preserveFontFaces: true,
      preserveImportant: true,
      preserveMediaQueries: true,
      preservePseudoElements: true // Preservar pseudo-elementos que podem afetar o layout
    });

    const $ = cheerio.load(html, { decodeEntities: false });

    const images = $('img');
    const elementsWithBg = $('[style]').filter((i, elem) => $(elem).attr('style').includes('background-image'));
    const totalResources = images.length + elementsWithBg.length + styles.externalStyles.length + imageUrls.length;
    const dynamicTimeout = Math.min(Math.max(totalResources * 1000, 10000), 60000);

    const imagePromises = [];
    // Inlinear imagens do HTML
    images.each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src');
      if (src && !src.startsWith('data:')) {
        const imageUrl = new URL(src, url).href;
        imagePromises.push(
          (async () => {
            try {
              const response = await fetchWithRetry(imageUrl);
              const dataUrl = await resourceToDataURL(response);
              $(img).attr('src', dataUrl);
              $(img).removeAttr('data-src');
              $(img).removeAttr('data-lazy-src');
            } catch (err) {
              console.error(`Erro ao inlinear imagem ${imageUrl}: ${err.message}`);
            }
          })()
        );
      }
    });

    // Inlinear imagens dinâmicas capturadas via JavaScript
    imageUrls.forEach(imageUrl => {
      if (!imageUrl.startsWith('data:')) {
        const resolvedImageUrl = new URL(imageUrl, url).href;
        imagePromises.push(
          (async () => {
            try {
              const response = await fetchWithRetry(resolvedImageUrl);
              const dataUrl = await resourceToDataURL(response);
              $(`img[src="${imageUrl}"], img[data-src="${imageUrl}"], img[data-lazy-src="${imageUrl}"]`).attr('src', dataUrl);
            } catch (err) {
              console.error(`Erro ao inlinear imagem dinâmica ${imageUrl}: ${err.message}`);
            }
          })()
        );
      }
    });

    // Inlinear backgrounds
    elementsWithBg.each((i, elem) => {
      const style = $(elem).attr('style');
      const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (match && !match[1].startsWith('data:')) {
        const bgUrl = new URL(match[1], url).href;
        imagePromises.push(
          (async () => {
            try {
              const response = await fetchWithRetry(bgUrl);
              const dataUrl = await resourceToDataURL(response);
              const newStyle = style.replace(match[0], `url(${dataUrl})`);
              $(elem).attr('style', newStyle);
            } catch (err) {
              console.error(`Erro ao inlinear background ${bgUrl}: ${err.message}`);
            }
          })()
        );
      }
    });

    await Promise.all(imagePromises);

    // Remover scripts para evitar interferências no layout
    $('script').remove();

    const finalHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Página Editada</title>
        <style>
          body { margin: 0; padding: 0; }
          h1, h2, h3 { font-family: 'Poppins', sans-serif; }
          img { max-width: 100%; height: auto; display: block; }
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          p { line-height: 1.6; }
          ${styles.inlineStyles}\n${externalStylesContent}\n${styles.fontFaces}
        </style>
      </head>
      <body>
        ${$.html('body')}
      </body>
      </html>
    `;

    await browser.close();
    const endTime = Date.now();
    const timeTaken = (endTime - startTime) / 1000;
    console.log(`Clonagem concluída em ${timeTaken} segundos para ${totalResources} recursos.`);

    res.json({
      html: finalHtml,
      timeTaken: timeTaken.toFixed(2),
      estimatedTimeout: (dynamicTimeout / 1000).toFixed(2),
      totalResources
    });
  } catch (error) {
    console.error('Erro ao clonar:', error);
    res.status(500).send(`Erro ao clonar a página: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
