// models/ArticleCache.js
const { db } = require('../config/database');

class ArticleCache {
  /**
   * Armazena um artigo no cache
   * @param {Object} cacheData - Dados do cache
   * @returns {Promise<Object>} - Resultado da operação
   */
  static set(cacheData) {
    const { articleTitle, content, links } = cacheData;
    const linksJson = JSON.stringify(links);
    
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO article_cache (article_title, content, links, last_updated) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(article_title) 
         DO UPDATE SET content = ?, links = ?, last_updated = CURRENT_TIMESTAMP, access_count = access_count + 1`,
        [articleTitle, content, linksJson, content, linksJson],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({ success: true });
        }
      );
    });
  }
  
  /**
   * Busca um artigo no cache
   * @param {string} articleTitle - Título do artigo
   * @param {number} validityMs - Validade do cache em ms
   * @returns {Promise<Object>} - Artigo em cache
   */
  static get(articleTitle, validityMs = 24 * 60 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM article_cache WHERE article_title = ?',
        [articleTitle],
        (err, cache) => {
          if (err) {
            return reject(err);
          }
          
          if (!cache) {
            return resolve(null);
          }
          
          // Verificar validade do cache
          const lastUpdated = new Date(cache.last_updated);
          const now = new Date();
          const age = now - lastUpdated;
          
          if (age > validityMs) {
            // Cache expirado
            return resolve(null);
          }
          
          // Incrementar contador de acesso
          db.run(
            'UPDATE article_cache SET access_count = access_count + 1 WHERE article_title = ?',
            [articleTitle]
          );
          
          try {
            // Converter links de volta para array
            const article = {
              title: cache.article_title,
              content: cache.content,
              links: JSON.parse(cache.links)
            };
            
            resolve(article);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }
  
  /**
   * Remove artigos antigos ou pouco acessados do cache
   * @param {number} daysOld - Dias de inatividade
   * @param {number} minAccessCount - Contagem mínima de acesso
   * @returns {Promise<Object>} - Resultado da operação
   */
  static cleanup(daysOld = 7, minAccessCount = 10) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      db.run(
        'DELETE FROM article_cache WHERE last_updated < ? AND access_count < ?',
        [cutoffDate.toISOString(), minAccessCount],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({ deletedCount: this.changes });
        }
      );
    });
  }
  
  /**
   * Obtém os artigos mais acessados
   * @param {number} limit - Limite de registros
   * @returns {Promise<Array>} - Artigos mais acessados
   */
  static getMostAccessed(limit = 20) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT article_title, access_count, last_updated FROM article_cache ORDER BY access_count DESC LIMIT ?',
        [limit],
        (err, articles) => {
          if (err) {
            return reject(err);
          }
          
          resolve(articles);
        }
      );
    });
  }
  
  /**
   * Conta o número total de artigos em cache
   * @returns {Promise<number>} - Contagem de artigos
   */
  static count() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM article_cache',
        [],
        (err, result) => {
          if (err) {
            return reject(err);
          }
          
          resolve(result?.count || 0);
        }
      );
    });
  }
}

module.exports = ArticleCache;