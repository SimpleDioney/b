// models/Challenge.js
const { db } = require('../config/database');
const User = require('./User');
const Notification = require('./Notification');
const GameSession = require('./GameSession');
const wikipediaService = require('../services/wikipediaService');

class Challenge {
  /**
   * Cria um novo desafio
   * @param {Object} challengeData - Dados do desafio
   * @returns {Promise<Object>} - Desafio criado
   */
  static async create(challengeData) {
    const { 
      creatorId, 
      opponentId, 
      startArticle, 
      targetArticle, 
      customMode = false 
    } = challengeData;
    
    return new Promise(async (resolve, reject) => {
      try {
        // Se for customMode, validar os artigos
        if (customMode) {
          if (!startArticle || !targetArticle) {
            throw new Error('Os artigos inicial e final devem ser especificados');
          }
          
          // Verificar se os artigos existem
          try {
            await wikipediaService.getArticleWithLinks(startArticle);
            await wikipediaService.getArticleWithLinks(targetArticle);
          } catch (error) {
            throw new Error('Um ou mais artigos especificados não existem na Wikipédia');
          }
        }
        
        // Se não for customMode e não foram especificados artigos, gerar aleatórios
        let finalStartArticle = startArticle;
        let finalTargetArticle = targetArticle;
        
        if (!customMode && (!finalStartArticle || !finalTargetArticle)) {
          try {
            const randomPair = await wikipediaService.getRandomArticlePair();
            finalStartArticle = randomPair.startArticle;
            finalTargetArticle = randomPair.targetArticle;
          } catch (error) {
            throw new Error('Não foi possível gerar artigos aleatórios');
          }
        }
        
        // Definir data de expiração (24 horas)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        // Inserir o desafio
        db.run(
          `INSERT INTO challenges 
           (creator_id, opponent_id, start_article, target_article, custom_mode, expires_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [creatorId, opponentId, finalStartArticle, finalTargetArticle, customMode ? 1 : 0, expiresAt.toISOString()],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            const challengeId = this.lastID;
            
            // Se houver um oponente, enviar notificação
            if (opponentId) {
              try {
                const creator = await User.findById(creatorId);
                
                await Notification.create({
                  userId: opponentId,
                  type: 'game_invite',
                  content: `${creator.username} convidou você para um desafio na WikiQuest`,
                  relatedId: creatorId
                });
              } catch (error) {
                console.error('Erro ao enviar notificação de desafio:', error);
              }
            }
            
            resolve({
              id: challengeId,
              creator_id: creatorId,
              opponent_id: opponentId,
              start_article: finalStartArticle,
              target_article: finalTargetArticle,
              status: 'pending',
              custom_mode: customMode,
              created_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString()
            });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Aceita um desafio
   * @param {number} challengeId - ID do desafio
   * @param {number} userId - ID do usuário que está aceitando
   * @returns {Promise<Object>} - Resultado da operação
   */
  static async acceptChallenge(challengeId, userId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se o desafio existe e está pendente
        const challenge = await this.findById(challengeId);
        
        if (!challenge) {
          throw new Error('Desafio não encontrado');
        }
        
        if (challenge.status !== 'pending') {
          throw new Error('Este desafio não está pendente');
        }
        
        if (challenge.opponent_id !== userId) {
          throw new Error('Este desafio não foi enviado para você');
        }
        
        // Atualizar status do desafio
        db.run(
          'UPDATE challenges SET status = ? WHERE id = ?',
          ['active', challengeId],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível atualizar o desafio'));
            }
            
            try {
              // Criar sessão de jogo para o criador do desafio
              await GameSession.create({
                userId: challenge.creator_id,
                startArticle: challenge.start_article,
                targetArticle: challenge.target_article,
                challengeId: challengeId
              });
              
              // Criar sessão de jogo para o oponente
              const opponentSession = await GameSession.create({
                userId: userId,
                startArticle: challenge.start_article,
                targetArticle: challenge.target_article,
                challengeId: challengeId
              });
              
              // Notificar o criador que o desafio foi aceito
              await Notification.create({
                userId: challenge.creator_id,
                type: 'challenge_accepted',
                content: 'Seu desafio foi aceito',
                relatedId: userId
              });
              
              resolve({
                challenge: {
                  ...challenge,
                  status: 'active'
                },
                session: opponentSession
              });
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
   * Rejeita um desafio
   * @param {number} challengeId - ID do desafio
   * @param {number} userId - ID do usuário que está rejeitando
   * @returns {Promise<Object>} - Resultado da operação
   */
  static async rejectChallenge(challengeId, userId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se o desafio existe e está pendente
        const challenge = await this.findById(challengeId);
        
        if (!challenge) {
          throw new Error('Desafio não encontrado');
        }
        
        if (challenge.status !== 'pending') {
          throw new Error('Este desafio não está pendente');
        }
        
        if (challenge.opponent_id !== userId) {
          throw new Error('Este desafio não foi enviado para você');
        }
        
        // Atualizar status do desafio
        db.run(
          'UPDATE challenges SET status = ? WHERE id = ?',
          ['cancelled', challengeId],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível atualizar o desafio'));
            }
            
            try {
              // Notificar o criador que o desafio foi rejeitado
              await Notification.create({
                userId: challenge.creator_id,
                type: 'challenge_rejected',
                content: 'Seu desafio foi rejeitado',
                relatedId: userId
              });
              
              resolve({
                ...challenge,
                status: 'cancelled'
              });
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
   * Cancela um desafio
   * @param {number} challengeId - ID do desafio
   * @param {number} userId - ID do usuário que está cancelando
   * @returns {Promise<Object>} - Resultado da operação
   */
  static async cancelChallenge(challengeId, userId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se o desafio existe
        const challenge = await this.findById(challengeId);
        
        if (!challenge) {
          throw new Error('Desafio não encontrado');
        }
        
        if (challenge.status !== 'pending' && challenge.status !== 'active') {
          throw new Error('Este desafio não pode ser cancelado');
        }
        
        if (challenge.creator_id !== userId) {
          throw new Error('Apenas o criador pode cancelar o desafio');
        }
        
        // Atualizar status do desafio
        db.run(
          'UPDATE challenges SET status = ? WHERE id = ?',
          ['cancelled', challengeId],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível cancelar o desafio'));
            }
            
            try {
              // Notificar o oponente que o desafio foi cancelado
              if (challenge.opponent_id) {
                await Notification.create({
                  userId: challenge.opponent_id,
                  type: 'challenge_cancelled',
                  content: 'Um desafio foi cancelado',
                  relatedId: userId
                });
              }
              
              resolve({
                ...challenge,
                status: 'cancelled'
              });
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
   * Completa um desafio (quando um jogador chega ao final)
   * @param {number} challengeId - ID do desafio
   * @param {number} winnerId - ID do jogador vencedor
   * @returns {Promise<Object>} - Resultado da operação
   */
  static async completeChallenge(challengeId, winnerId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se o desafio existe e está ativo
        const challenge = await this.findById(challengeId);
        
        if (!challenge) {
          throw new Error('Desafio não encontrado');
        }
        
        if (challenge.status !== 'active') {
          throw new Error('Este desafio não está ativo');
        }
        
        if (challenge.creator_id !== winnerId && challenge.opponent_id !== winnerId) {
          throw new Error('Este usuário não faz parte do desafio');
        }
        
        // Atualizar status do desafio
        db.run(
          'UPDATE challenges SET status = ?, winner_id = ? WHERE id = ?',
          ['completed', winnerId, challengeId],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível completar o desafio'));
            }
            
            try {
              // Notificar o perdedor
              const loserId = winnerId === challenge.creator_id 
                ? challenge.opponent_id 
                : challenge.creator_id;
              
              // Obter detalhes do vencedor
              const winner = await User.findById(winnerId);
              
              await Notification.create({
                userId: loserId,
                type: 'challenge_complete',
                content: `${winner.username} completou o desafio antes de você`,
                relatedId: winnerId
              });
              
              resolve({
                ...challenge,
                status: 'completed',
                winner_id: winnerId
              });
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
   * Busca um desafio pelo ID
   * @param {number} challengeId - ID do desafio
   * @returns {Promise<Object>} - Desafio encontrado
   */
  static findById(challengeId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM challenges WHERE id = ?',
        [challengeId],
        (err, challenge) => {
          if (err) {
            return reject(err);
          }
          
          resolve(challenge);
        }
      );
    });
  }
  
  /**
   * Busca desafios enviados por um usuário
   * @param {number} userId - ID do usuário
   * @param {Array} statuses - Array de status para filtrar
   * @returns {Promise<Array>} - Lista de desafios
   */
  static findByCreator(userId, statuses = ['pending', 'active', 'completed']) {
    return new Promise((resolve, reject) => {
      let placeholders = statuses.map(() => '?').join(',');
      
      const query = `
        SELECT c.*, 
          creator.username as creator_username, 
          opponent.username as opponent_username,
          winner.username as winner_username
        FROM challenges c
        JOIN users creator ON c.creator_id = creator.id
        LEFT JOIN users opponent ON c.opponent_id = opponent.id
        LEFT JOIN users winner ON c.winner_id = winner.id
        WHERE c.creator_id = ? AND c.status IN (${placeholders})
        ORDER BY c.created_at DESC
      `;
      
      db.all(
        query,
        [userId, ...statuses],
        (err, challenges) => {
          if (err) {
            return reject(err);
          }
          
          resolve(challenges);
        }
      );
    });
  }
  
  /**
   * Busca desafios recebidos por um usuário
   * @param {number} userId - ID do usuário
   * @param {Array} statuses - Array de status para filtrar
   * @returns {Promise<Array>} - Lista de desafios
   */
  static findByOpponent(userId, statuses = ['pending', 'active', 'completed']) {
    return new Promise((resolve, reject) => {
      let placeholders = statuses.map(() => '?').join(',');
      
      const query = `
        SELECT c.*, 
          creator.username as creator_username, 
          opponent.username as opponent_username,
          winner.username as winner_username
        FROM challenges c
        JOIN users creator ON c.creator_id = creator.id
        LEFT JOIN users opponent ON c.opponent_id = opponent.id
        LEFT JOIN users winner ON c.winner_id = winner.id
        WHERE c.opponent_id = ? AND c.status IN (${placeholders})
        ORDER BY c.created_at DESC
      `;
      
      db.all(
        query,
        [userId, ...statuses],
        (err, challenges) => {
          if (err) {
            return reject(err);
          }
          
          resolve(challenges);
        }
      );
    });
  }
  
  /**
   * Busca desafios dos quais um usuário participa
   * @param {number} userId - ID do usuário
   * @returns {Promise<Array>} - Lista de desafios
   */
  static findByParticipant(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT c.*, 
          creator.username as creator_username, 
          opponent.username as opponent_username,
          winner.username as winner_username
        FROM challenges c
        JOIN users creator ON c.creator_id = creator.id
        LEFT JOIN users opponent ON c.opponent_id = opponent.id
        LEFT JOIN users winner ON c.winner_id = winner.id
        WHERE (c.creator_id = ? OR c.opponent_id = ?)
        ORDER BY 
          CASE WHEN c.status = 'active' THEN 1
               WHEN c.status = 'pending' THEN 2
               WHEN c.status = 'completed' THEN 3
               ELSE 4
          END,
          c.created_at DESC
      `;
      
      db.all(
        query,
        [userId, userId],
        (err, challenges) => {
          if (err) {
            return reject(err);
          }
          
          resolve(challenges);
        }
      );
    });
  }
  
  /**
   * Obtém estatísticas de desafios de um usuário
   * @param {number} userId - ID do usuário
   * @returns {Promise<Object>} - Estatísticas
   */
  static getStats(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          (SELECT COUNT(*) FROM challenges WHERE creator_id = ? OR opponent_id = ?) as total_challenges,
          (SELECT COUNT(*) FROM challenges WHERE creator_id = ? AND status = 'completed') as challenges_created,
          (SELECT COUNT(*) FROM challenges WHERE opponent_id = ? AND status = 'completed') as challenges_received,
          (SELECT COUNT(*) FROM challenges WHERE winner_id = ?) as challenges_won,
          (SELECT COUNT(*) FROM challenges WHERE (creator_id = ? OR opponent_id = ?) AND status = 'completed') as challenges_completed,
          (SELECT COUNT(*) FROM challenges WHERE (creator_id = ? OR opponent_id = ?) AND status = 'active') as challenges_active
      `;
      
      db.get(
        query,
        [userId, userId, userId, userId, userId, userId, userId, userId, userId],
        (err, stats) => {
          if (err) {
            return reject(err);
          }
          
          resolve(stats || {
            total_challenges: 0,
            challenges_created: 0,
            challenges_received: 0,
            challenges_won: 0,
            challenges_completed: 0,
            challenges_active: 0
          });
        }
      );
    });
  }
  
  /**
   * Limpa desafios expirados
   * @returns {Promise<Object>} - Resultado da operação
   */
  static cleanupExpired() {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      db.run(
        "UPDATE challenges SET status = 'cancelled' WHERE status = 'pending' AND expires_at < ?",
        [now],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({ cancelledCount: this.changes });
        }
      );
    });
  }
}

module.exports = Challenge;