// models/Matchmaking.js
const { db } = require('../config/database');
const Challenge = require('./Challenge');
const User = require('./User');
const Notification = require('./Notification');
const wikipediaService = require('../services/wikipediaService');

class Matchmaking {
  /**
   * Adiciona um jogador à fila de matchmaking
   * @param {Object} queueData - Dados do jogador
   * @returns {Promise<Object>} - Resultado da operação
   */
  static async addToQueue(queueData) {
    const { 
      userId, 
      customMode = false, 
      customStart = null, 
      customTarget = null 
    } = queueData;
    
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se o jogador já está na fila
        const existingQueue = await this.getByUserId(userId);
        
        if (existingQueue) {
          throw new Error('Você já está na fila de matchmaking');
        }
        
        // Verificar se quer um jogo personalizado e validar artigos
        if (customMode) {
          if (!customStart || !customTarget) {
            throw new Error('Os artigos inicial e final devem ser especificados para o modo personalizado');
          }
          
          // Verificar se os artigos existem
          try {
            await wikipediaService.getArticleWithLinks(customStart);
            await wikipediaService.getArticleWithLinks(customTarget);
          } catch (error) {
            throw new Error('Um ou mais artigos especificados não existem na Wikipédia');
          }
        }
        
        // Obter rank do usuário
        const user = await User.findById(userId);
        if (!user) {
          throw new Error('Usuário não encontrado');
        }
        
        // Adicionar usuário à fila
        db.run(
          `INSERT INTO matchmaking_queue 
           (user_id, rank, custom_mode, custom_start, custom_target) 
           VALUES (?, ?, ?, ?, ?)`,
          [userId, user.rank, customMode ? 1 : 0, customStart, customTarget],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            const queueId = this.lastID;
            
            // Buscar um oponente para matchmaking
            try {
              const opponent = await Matchmaking.findMatch(userId, user.rank, customMode);
              
              if (opponent) {
                // Se encontrou oponente, remover ambos da fila
                await Matchmaking.removeFromQueue(userId);
                await Matchmaking.removeFromQueue(opponent.user_id);
                
                // Criar o desafio
                let challengeData = {
                  creatorId: userId,
                  opponentId: opponent.user_id,
                  customMode: customMode
                };
                
                if (customMode) {
                  // Se for personalizado, usar os artigos definidos
                  challengeData.startArticle = customStart;
                  challengeData.targetArticle = customTarget;
                } else if (opponent.custom_mode) {
                  // Se o oponente tiver modo personalizado, usar os artigos dele
                  challengeData.startArticle = opponent.custom_start;
                  challengeData.targetArticle = opponent.custom_target;
                  challengeData.customMode = true;
                }
                
                // Criar o desafio
                const challenge = await Challenge.create(challengeData);
                
                // Aceitar automaticamente o desafio
                const acceptedChallenge = await Challenge.acceptChallenge(challenge.id, opponent.user_id);
                
                // Notificar ambos os jogadores
                await Notification.create({
                  userId: userId,
                  type: 'matchmaking_success',
                  content: 'Um oponente foi encontrado! O jogo começou.',
                  relatedId: opponent.user_id
                });
                
                resolve({
                  queueId,
                  matchFound: true,
                  challenge: acceptedChallenge.challenge,
                  session: acceptedChallenge.session
                });
              } else {
                // Se não encontrou oponente, retornar o ID da fila
                resolve({
                  queueId,
                  matchFound: false
                });
              }
            } catch (error) {
              reject(error);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Remove um jogador da fila de matchmaking
   * @param {number} userId - ID do jogador
   * @returns {Promise<Object>} - Resultado da operação
   */
  static removeFromQueue(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM matchmaking_queue WHERE user_id = ?',
        [userId],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({ success: true, removed: this.changes > 0 });
        }
      );
    });
  }
  
  /**
   * Busca um jogador na fila por ID
   * @param {number} userId - ID do jogador
   * @returns {Promise<Object>} - Jogador na fila
   */
  static getByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM matchmaking_queue WHERE user_id = ?',
        [userId],
        (err, queue) => {
          if (err) {
            return reject(err);
          }
          
          resolve(queue);
        }
      );
    });
  }
  
  /**
   * Busca um oponente compatível
   * @param {number} userId - ID do jogador
   * @param {number} userRank - Rank do jogador
   * @param {boolean} customMode - Se é modo personalizado
   * @returns {Promise<Object>} - Oponente encontrado
   */
  static findMatch(userId, userRank, customMode) {
    return new Promise((resolve, reject) => {
      // Definir o limite de diferença de rank
      // Inicialmente busca jogadores próximos, depois amplia a busca
      const rankRange = 200;
      
      let query;
      let params;
      
      if (customMode) {
        // Se for modo personalizado, só pode combinar com alguém que quer jogo aleatório
        query = `
          SELECT * FROM matchmaking_queue 
          WHERE user_id != ? 
            AND custom_mode = 0
            AND ABS(rank - ?) <= ?
          ORDER BY ABS(rank - ?) ASC, joined_at ASC
          LIMIT 1
        `;
        params = [userId, userRank, rankRange, userRank];
      } else {
        // Se for modo aleatório, pode combinar com qualquer um
        query = `
          SELECT * FROM matchmaking_queue 
          WHERE user_id != ? 
            AND ABS(rank - ?) <= ?
          ORDER BY ABS(rank - ?) ASC, joined_at ASC
          LIMIT 1
        `;
        params = [userId, userRank, rankRange, userRank];
      }
      
      db.get(
        query,
        params,
        (err, opponent) => {
          if (err) {
            return reject(err);
          }
          
          resolve(opponent);
        }
      );
    });
  }
  
  /**
   * Limpa jogadores antigos da fila
   * @param {number} minutesOld - Minutos na fila
   * @returns {Promise<Object>} - Resultado da operação
   */
  static cleanupQueue(minutesOld = 30) {
    return new Promise((resolve, reject) => {
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesOld);
      
      db.run(
        'DELETE FROM matchmaking_queue WHERE joined_at < ?',
        [cutoffTime.toISOString()],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({ removedCount: this.changes });
        }
      );
    });
  }
  
  /**
   * Contagem de jogadores na fila
   * @returns {Promise<Object>} - Contagem de jogadores
   */
  static getQueueStats() {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as total, SUM(CASE WHEN custom_mode = 1 THEN 1 ELSE 0 END) as custom_mode FROM matchmaking_queue',
        [],
        (err, stats) => {
          if (err) {
            return reject(err);
          }
          
          resolve({
            totalPlayers: stats?.total || 0,
            customModePlayers: stats?.custom_mode || 0,
            randomModePlayers: (stats?.total || 0) - (stats?.custom_mode || 0)
          });
        }
      );
    });
  }
}

module.exports = Matchmaking;