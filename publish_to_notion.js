const fs = require('fs');
const path = require('path');
const https = require('https');

function getNotionToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN;
  try {
    const cfgPath = 'C:\\Users\\rpmar\\.gemini\\config\\mcp_config.json';
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return cfg.mcpServers?.notion?.env?.NOTION_TOKEN || '';
    }
  } catch (e) {}
  return '';
}

const NOTION_TOKEN = getNotionToken();
const PAGE_ID = process.argv[2] || '39c70bb4-c353-81cc-8974-ee6dfe83f301';

// Direct URLs for IronHealth app screenshots
const IMAGE_MAP = {
  'home': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_home.jpg',
  'nutrição': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_nutrition.jpg',
  'nutricao': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_nutrition.jpg',
  'ginásio': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_gym.jpg',
  'ginasio': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_gym.jpg',
  'corpo': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_body.jpg',
  'corrida': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_run.jpg',
  'coach': 'https://raw.githubusercontent.com/rpmariano/ironhealth/master/docs-images/ironhealth_coach.jpg'
};

function notionRequest(endpoint, method, data) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = https.request({
      hostname: 'api.notion.com',
      path: '/v1' + endpoint,
      method: method,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Notion API Error ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseRichText(text) {
  if (!text) return [];
  const cleanText = text.replace(/<[^>]+>/g, '');
  const chunks = [];
  
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\]\(.*?\))/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(cleanText)) !== null) {
    if (match.index > lastIdx) {
      chunks.push({
        type: 'text',
        text: { content: cleanText.substring(lastIdx, match.index).slice(0, 2000) }
      });
    }
    const raw = match[0];
    if (raw.startsWith('**') && raw.endsWith('**')) {
      chunks.push({
        type: 'text',
        text: { content: raw.slice(2, -2).slice(0, 2000) },
        annotations: { bold: true }
      });
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      chunks.push({
        type: 'text',
        text: { content: raw.slice(1, -1).slice(0, 2000) },
        annotations: { italic: true }
      });
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      chunks.push({
        type: 'text',
        text: { content: raw.slice(1, -1).slice(0, 2000) },
        annotations: { code: true }
      });
    } else if (raw.startsWith('[')) {
      const linkMatch = raw.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        chunks.push({
          type: 'text',
          text: { content: linkMatch[1].slice(0, 2000), link: linkMatch[2].startsWith('http') ? { url: linkMatch[2] } : null }
        });
      }
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < cleanText.length) {
    chunks.push({
      type: 'text',
      text: { content: cleanText.substring(lastIdx).slice(0, 2000) }
    });
  }

  return chunks.length ? chunks : [{ type: 'text', text: { content: cleanText.slice(0, 2000) } }];
}

function markdownToNotionBlocks(mdContent) {
  const lines = mdContent.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Code blocks / Mermaid
    if (line.trim().startsWith('```')) {
      const lang = line.trim().replace(/^```/, '').trim() || 'javascript';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const codeText = codeLines.join('\n').slice(0, 2000);
      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          caption: [],
          rich_text: [{ type: 'text', text: { content: codeText } }],
          language: lang === 'mermaid' ? 'mermaid' : 'javascript'
        }
      });
      continue;
    }

    // Callouts / Blockquotes
    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      const fullQuote = quoteLines.join('\n');
      let emoji = '💡';
      if (fullQuote.includes('[!IMPORTANT]')) emoji = '⚠️';
      else if (fullQuote.includes('[!NOTE]')) emoji = 'ℹ️';

      const cleanQuote = fullQuote.replace(/\[!(IMPORTANT|NOTE|TIP|WARNING)\]/g, '').trim();

      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          icon: { type: 'emoji', emoji: emoji },
          rich_text: parseRichText(cleanQuote)
        }
      });
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: parseRichText(line.replace(/^#\s+/, '')) }
      });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: parseRichText(line.replace(/^##\s+/, '')) }
      });
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: parseRichText(line.replace(/^###\s+/, '')) }
      });
      i++;
      continue;
    }

    // Dividers
    if (line.trim() === '---' || line.trim() === '***') {
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      i++;
      continue;
    }

    // Images
    const imgMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
    if (imgMatch) {
      const caption = imgMatch[1];
      let imgUrl = imgMatch[2];

      if (!imgUrl.startsWith('http')) {
        const lowerCap = caption.toLowerCase();
        for (const key of Object.keys(IMAGE_MAP)) {
          if (lowerCap.includes(key)) {
            imgUrl = IMAGE_MAP[key];
            break;
          }
        }
      }

      if (!imgUrl.startsWith('http')) {
        imgUrl = IMAGE_MAP['home'];
      }

      blocks.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: imgUrl },
          caption: parseRichText(caption || 'IronHealth App Dashboard Screen')
        }
      });
      i++;
      continue;
    }

    // Lists
    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: parseRichText(line.trim().replace(/^[\*\-]\s+/, '')) }
      });
      i++;
      continue;
    }

    if (/^\d+\.\s+/.test(line.trim())) {
      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: { rich_text: parseRichText(line.trim().replace(/^\d+\.\s+/, '')) }
      });
      i++;
      continue;
    }

    // Markdown Table
    if (line.trim().startsWith('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowText = lines[i].trim();
        if (!rowText.includes(':---') && !rowText.includes('---:')) {
          const cells = rowText.split('|').slice(1, -1).map(c => c.trim());
          if (cells.length > 0) {
            tableRows.push(cells);
          }
        }
        i++;
      }

      if (tableRows.length > 0) {
        const width = tableRows[0].length;
        const notionRows = tableRows.map(row => ({
          type: 'table_row',
          table_row: {
            cells: row.slice(0, width).map(cell => parseRichText(cell))
          }
        }));

        blocks.push({
          object: 'block',
          type: 'table',
          table: {
            table_width: width,
            has_column_header: true,
            has_row_header: false,
            children: notionRows
          }
        });
      }
      continue;
    }

    // Paragraph
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: parseRichText(line) }
    });
    i++;
  }

  return blocks;
}

async function publish() {
  try {
    console.log(`🚀 A ler ficheiro MANUAL_UTILIZADOR.md...`);
    const mdPath = path.join(__dirname, 'MANUAL_UTILIZADOR.md');
    const mdContent = fs.readFileSync(mdPath, 'utf8');

    console.log(`🔄 A converter Markdown em blocos nativos do Notion com imagens REAIS da app...`);
    const allBlocks = markdownToNotionBlocks(mdContent);
    console.log(`📦 Total de ${allBlocks.length} blocos gerados.`);

    console.log(`🧹 A limpar conteúdo anterior da página ${PAGE_ID}...`);
    const childrenRes = await notionRequest(`/blocks/${PAGE_ID}/children?page_size=100`, 'GET');
    if (childrenRes.results && childrenRes.results.length > 0) {
      for (const block of childrenRes.results) {
        try {
          await notionRequest(`/blocks/${block.id}`, 'DELETE');
        } catch (e) {
          // ignore
        }
      }
    }

    console.log(`📤 A publicar novos blocos na página do Notion...`);
    const chunkSize = 100;
    for (let j = 0; j < allBlocks.length; j += chunkSize) {
      const chunk = allBlocks.slice(j, j + chunkSize);
      await notionRequest(`/blocks/${PAGE_ID}/children`, 'PATCH', { children: chunk });
      console.log(`   - Blocos ${j + 1} a ${Math.min(j + chunkSize, allBlocks.length)} adicionados.`);
    }

    console.log(`✅ Publicação com imagens reais da app concluída com sucesso!`);
    console.log(`🔗 Acede à página no Notion: https://app.notion.com/p/${PAGE_ID.replace(/-/g, '')}`);
  } catch (err) {
    console.error(`❌ Erro durante a publicação:`, err.message);
    process.exit(1);
  }
}

publish();
