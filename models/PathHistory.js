const { db } = require('../config/database');

class PathHistory {
  /**
   * Cria um novo registro de caminho
   * @param {Object} pathData - Dados do caminho
   * @returns {Promise<Object>} - Caminho criado
   */
  static create(pathData) {
    const { sessionId, article, clickNumber } = pathData;
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO path_history (session_id, article, click_number) VALUES (?, ?, ?)',
        [sessionId, article, clickNumber],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({
            id: this.lastID,
            sessionId,
            article,
            clickNumber
          });
        }
      );
    });
  }
  
  /**
   * Busca o histórico de caminho de uma sessão
   * @param {number} sessionId - ID da sessão
   * @returns {Promise<Array>} - Histórico de caminho
   */
  static findBySessionId(sessionId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, article, click_number, timestamp FROM path_history WHERE session_id = ? ORDER BY click_number ASC',
        [sessionId],
        (err, paths) => {
          if (err) {
            return reject(err);
          }
          
          resolve(paths);
        }
      );
    });
  }
  
  /**
   * Remove o histórico de caminhos de sessões antigas
   * @param {number} daysOld - Dias de inatividade
   * @returns {Promise<Object>} - Resultado da operação
   */
  static cleanupOldPaths(daysOld = 7) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      db.run(
        'DELETE FROM path_history WHERE session_id IN (SELECT id FROM game_sessions WHERE last_activity < ?)',
        [cutoffDate.toISOString()],
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
   * Verifica se um artigo já foi visitado em uma sessão
   * @param {number} sessionId - ID da sessão
   * @param {string} article - Título do artigo
   * @returns {Promise<boolean>} - Se o artigo já foi visitado
   */
  static async hasVisitedArticle(sessionId, article) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT 1 FROM path_history WHERE session_id = ? AND article = ?',
        [sessionId, article],
        (err, result) => {
          if (err) {
            return reject(err);
          }
          
          resolve(!!result);
        }
      );
    });
  }
  
  /**
   * Conta quantas vezes um artigo foi visitado globalmente
   * @param {string} article - Título do artigo
   * @returns {Promise<number>} - Contagem de visitas
   */
  static countArticleVisits(article) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM path_history WHERE article = ?',
        [article],
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

module.exports = PathHistory;