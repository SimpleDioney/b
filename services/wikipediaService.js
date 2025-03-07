const axios = require('axios');
const { db } = require('../config/database');

// Tempo de validade do cache em millisegundos (1 dia)
const CACHE_VALIDITY = 24 * 60 * 60 * 1000;

/**
 * Busca artigo da Wikipédia e seus links
 * @param {string} articleTitle - Título do artigo
 * @returns {Promise<Object>} - Artigo e seus links internos
 */
async function getArticleWithLinks(articleTitle) {
  try {
    // Verificar se existe no cache
    const cachedArticle = await getCachedArticle(articleTitle);
    if (cachedArticle) {
      return cachedArticle;
    }
    
    // Buscar da API da Wikipédia se não estiver em cache
    const response = await axios.get('https://pt.wikipedia.org/w/api.php', {
      params: {
        action: 'parse',
        page: articleTitle,
        prop: 'text|links',
        format: 'json',
        redirects: 1
      }
    });
    
    // Verificar se o artigo foi encontrado
    if (!response.data.parse) {
      throw new Error('Artigo não encontrado');
    }
    
    // Extrair texto e links
    const content = response.data.parse.text['*'];
    const links = response.data.parse.links
      .filter(link => link.ns === 0) // Apenas links de namespace 0 (artigos principais)
      .map(link => link['*']) // Extrair apenas o título
      .filter((link, index, self) => self.indexOf(link) === index); // Remover duplicatas
    
    // Armazenar no cache
    await cacheArticle(articleTitle, content, links);
    
    return {
      title: articleTitle,
      content,
      links
    };
  } catch (error) {
    console.error(`Erro ao buscar artigo ${articleTitle}:`, error.message);
    throw new Error(`Não foi possível buscar o artigo: ${error.message}`);
  }
}

/**
 * Obtém um artigo do cache
 */
function getCachedArticle(articleTitle) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM article_cache WHERE article_title = ?',
      [articleTitle],
      (err, row) => {
        if (err) {
          console.error('Erro ao buscar cache:', err);
          return resolve(null);
        }
        
        if (!row) return resolve(null);
        
        // Verificar se o cache ainda é válido
        const lastUpdated = new Date(row.last_updated);
        const now = new Date();
        
        if (now - lastUpdated > CACHE_VALIDITY) {
          // Cache expirado
          return resolve(null);
        }
        
        // Incrementar contador de acesso
        db.run(
          'UPDATE article_cache SET access_count = access_count + 1 WHERE article_title = ?',
          [articleTitle]
        );
        
        resolve({
          title: row.article_title,
          content: row.content,
          links: JSON.parse(row.links)
        });
      }
    );
  });
}

/**
 * Armazena um artigo no cache
 */
function cacheArticle(articleTitle, content, links) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO article_cache (article_title, content, links, last_updated) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(article_title) 
       DO UPDATE SET content = ?, links = ?, last_updated = CURRENT_TIMESTAMP, access_count = access_count + 1`,
      [articleTitle, content, JSON.stringify(links), content, JSON.stringify(links)],
      err => {
        if (err) {
          console.error('Erro ao armazenar em cache:', err);
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * Limpa artigos antigos do cache
 */
function cleanupOldCache() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // Manter apenas artigos acessados na última semana
  
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM article_cache WHERE last_updated < ? AND access_count < 10',
      [cutoffDate.toISOString()],
      err => {
        if (err) {
          console.error('Erro ao limpar cache:', err);
          return reject(err);
        }
        resolve();
      }
    );
  });
}

/**
 * Gera artigos aleatórios para iniciar um jogo
 */
async function getRandomArticlePair() {
  try {
    // Obter artigo inicial aleatório
    const startResponse = await axios.get('https://pt.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'random',
        rnnamespace: 0,
        rnlimit: 1,
        format: 'json'
      }
    });
    
    // Obter artigo final aleatório
    const targetResponse = await axios.get('https://pt.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'random',
        rnnamespace: 0,
        rnlimit: 1,
        format: 'json'
      }
    });
    
    const startArticle = startResponse.data.query.random[0].title;
    const targetArticle = targetResponse.data.query.random[0].title;
    
    // Garantir que são artigos diferentes
    if (startArticle === targetArticle) {
      return getRandomArticlePair();
    }
    
    return {
      startArticle,
      targetArticle
    };
  } catch (error) {
    console.error('Erro ao gerar par de artigos:', error);
    throw new Error('Não foi possível gerar artigos para o jogo');
  }
}

module.exports = {
  getArticleWithLinks,
  getRandomArticlePair,
  cleanupOldCache
};
