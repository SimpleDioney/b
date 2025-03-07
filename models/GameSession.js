const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const PathHistory = require('./PathHistory');

class GameSession {
  /**
 * Cria uma nova sessão de jogo
 * @param {Object} sessionData - Dados da sessão
 * @returns {Promise<Object>} - Sessão criada
 */
    static create(sessionData) {
        const { 
        userId, 
        startArticle, 
        targetArticle, 
        challengeId  // Garantir que este parâmetro seja usado
        } = sessionData;
        const sessionToken = sessionData.sessionToken || uuidv4();
        
        return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO game_sessions 
            (user_id, session_token, start_article, target_article, current_article, challenge_id) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, sessionToken, startArticle, targetArticle, startArticle, challengeId],
            async function(err) {
            if (err) {
                return reject(err);
            }
            
            const sessionId = this.lastID;
            
            try {
                // Registrar artigo inicial no histórico
                await PathHistory.create({
                sessionId,
                article: startArticle,
                clickNumber: 0
                });
                
                resolve({
                id: sessionId,
                userId,
                sessionToken,
                startArticle,
                targetArticle,
                currentArticle: startArticle,
                clicks: 0,
                challengeId // Retornar o challengeId
                });
            } catch (error) {
                reject(error);
            }
            }
        );
        });
    }
    
  /**
   * Busca uma sessão pelo token
   * @param {string} sessionToken - Token da sessão
   * @returns {Promise<Object>} - Sessão encontrada
   */
  static findByToken(sessionToken) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM game_sessions WHERE session_token = ?',
        [sessionToken],
        (err, session) => {
          if (err) {
            return reject(err);
          }
          
          resolve(session);
        }
      );
    });
  }
  
  /**
   * Atualiza o artigo atual e incrementa cliques
   * @param {number} sessionId - ID da sessão
   * @param {string} nextArticle - Próximo artigo
   * @returns {Promise<Object>} - Sessão atualizada
   */
  static updateCurrentArticle(sessionId, nextArticle) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE game_sessions 
         SET current_article = ?, clicks = clicks + 1, last_activity = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextArticle, sessionId],
        async function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('Sessão não encontrada'));
          }
          
          try {
            // Buscar sessão atualizada
            db.get(
              'SELECT * FROM game_sessions WHERE id = ?',
              [sessionId],
              async (err, updatedSession) => {
                if (err) {
                  return reject(err);
                }
                
                try {
                  // Registrar no histórico
                  await PathHistory.create({
                    sessionId,
                    article: nextArticle,
                    clickNumber: updatedSession.clicks
                  });
                  
                  resolve(updatedSession);
                } catch (error) {
                  reject(error);
                }
              }
            );
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }
  
  /**
   * Marca uma sessão como completada
   * @param {number} sessionId - ID da sessão
   * @returns {Promise<Object>} - Resultado da operação
   */
  static complete(sessionId) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE game_sessions SET completed = 1 WHERE id = ?',
        [sessionId],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({ changes: this.changes });
        }
      );
    });
  }
  
  /**
   * Calcula estatísticas de uma sessão
   * @param {string} sessionToken - Token da sessão
   * @returns {Promise<Object>} - Estatísticas da sessão
   */
  static getStats(sessionToken) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT gs.*, u.username,
         (
           SELECT json_group_array(json_object(
             'article', ph.article,
             'clickNumber', ph.click_number,
             'timestamp', ph.timestamp
           ))
           FROM path_history ph
           WHERE ph.session_id = gs.id
           ORDER BY ph.click_number
         ) as path_history
         FROM game_sessions gs
         JOIN users u ON gs.user_id = u.id
         WHERE gs.session_token = ?`,
        [sessionToken],
        (err, stats) => {
          if (err) {
            return reject(err);
          }
          
          if (!stats) {
            return resolve(null);
          }
          
          try {
            // Converter string JSON para objeto
            stats.pathHistory = JSON.parse(stats.path_history);
            delete stats.path_history;
            
            resolve(stats);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }
  
  /**
   * Busca sessões de um usuário
   * @param {number} userId - ID do usuário
   * @param {number} limit - Limite de registros
   * @param {number} offset - Deslocamento
   * @returns {Promise<Array>} - Sessões do usuário
   */
  static findByUserId(userId, limit = 10, offset = 0) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          id, session_token, start_article, target_article, current_article, 
          clicks, start_time, last_activity, completed
        FROM game_sessions 
        WHERE user_id = ? 
        ORDER BY last_activity DESC
        LIMIT ? OFFSET ?`,
        [userId, limit, offset],
        (err, sessions) => {
          if (err) {
            return reject(err);
          }
          
          resolve(sessions);
        }
      );
    });
  }

  /**
 * Busca sessões de jogo por ID de desafio
 * @param {number} challengeId - ID do desafio
 * @param {number} userId - ID do usuário (opcional, para filtrar)
 * @returns {Promise<Array>} - Sessões do desafio
 */
static findByChallengeId(challengeId, userId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          id, session_token, user_id, start_article, target_article, current_article, 
          clicks, start_time, last_activity, completed, challenge_id
        FROM game_sessions 
        WHERE challenge_id = ?
      `;
      
      const params = [challengeId];
      
      // Se userId foi fornecido, filtrar por ele
      if (userId) {
        query += ' ORDER BY user_id = ? DESC, last_activity DESC';
        params.push(userId);
      } else {
        query += ' ORDER BY last_activity DESC';
      }
      
      console.log(`Buscando sessões para desafio ${challengeId}, usuário ${userId || 'qualquer'}`);
      
      db.all(
        query,
        params,
        (err, sessions) => {
          if (err) {
            console.error('Erro ao buscar sessões por desafio:', err);
            return reject(err);
          }
          
          console.log(`Encontradas ${sessions.length} sessões para o desafio ${challengeId}`);
          resolve(sessions);
        }
      );
    });
  }
  
  /**
   * Remove sessões inativas antigas
   * @param {number} daysOld - Dias de inatividade
   * @returns {Promise<Object>} - Resultado da operação
   */
  static cleanupInactiveSessions(daysOld = 7) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      db.run(
        'DELETE FROM game_sessions WHERE last_activity < ? AND completed = 0',
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
}



module.exports = GameSession;