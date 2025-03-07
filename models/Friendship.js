// models/Friendship.js
const { db } = require('../config/database');
const User = require('./User');
const Notification = require('./Notification');

class Friendship {
  /**
   * Envia uma solicitação de amizade
   * @param {number} userId - ID do usuário que está enviando a solicitação
   * @param {number} friendId - ID do usuário que está recebendo a solicitação
   * @returns {Promise<Object>} - Resultado da operação
   */
  static async sendRequest(userId, friendId) {
    // Validar que o usuário não está tentando adicionar a si mesmo
    if (userId === friendId) {
      throw new Error('Você não pode se adicionar como amigo');
    }
    
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se o amigo existe
        const friend = await User.findById(friendId);
        if (!friend) {
          throw new Error('Usuário não encontrado');
        }
        
        // Verificar se já existe uma relação entre os usuários
        const existingFriendship = await this.getRelationship(userId, friendId);
        
        if (existingFriendship) {
          if (existingFriendship.status === 'pending' && existingFriendship.user_id === userId) {
            throw new Error('Você já enviou uma solicitação de amizade para este usuário');
          } else if (existingFriendship.status === 'pending' && existingFriendship.friend_id === userId) {
            // O outro usuário já enviou uma solicitação, aceitar automaticamente
            return this.acceptRequest(friendId, userId);
          } else if (existingFriendship.status === 'accepted') {
            throw new Error('Vocês já são amigos');
          } else if (existingFriendship.status === 'blocked') {
            throw new Error('Não é possível enviar solicitação para este usuário');
          }
        }
        
        // Inserir nova solicitação de amizade
        db.run(
          'INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)',
          [userId, friendId, 'pending'],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            const friendshipId = this.lastID;
            
            // Criar notificação para o amigo
            try {
              await Notification.create({
                userId: friendId,
                type: 'friend_request',
                content: 'Você recebeu uma solicitação de amizade',
                relatedId: userId
              });
              
              resolve({
                id: friendshipId,
                user_id: userId,
                friend_id: friendId,
                status: 'pending'
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
   * Aceita uma solicitação de amizade
   * @param {number} userId - ID do usuário que está aceitando a solicitação
   * @param {number} friendId - ID do usuário que enviou a solicitação
   * @returns {Promise<Object>} - Resultado da operação
   */
  static acceptRequest(userId, friendId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se existe uma solicitação pendente
        const friendship = await this.getRelationship(friendId, userId);
        
        if (!friendship) {
          throw new Error('Solicitação de amizade não encontrada');
        }
        
        if (friendship.status !== 'pending') {
          throw new Error('Esta solicitação não está pendente');
        }
        
        if (friendship.friend_id !== userId) {
          throw new Error('Esta solicitação não foi enviada para você');
        }
        
        // Atualizar status da amizade
        db.run(
          'UPDATE friendships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['accepted', friendship.id],
          async function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível atualizar a solicitação'));
            }
            
            // Criar notificação para o amigo
            try {
              await Notification.create({
                userId: friendId,
                type: 'friend_accepted',
                content: 'Sua solicitação de amizade foi aceita',
                relatedId: userId
              });
              
              resolve({
                id: friendship.id,
                user_id: friendship.user_id,
                friend_id: friendship.friend_id,
                status: 'accepted'
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
   * Rejeita uma solicitação de amizade
   * @param {number} userId - ID do usuário que está rejeitando a solicitação
   * @param {number} friendId - ID do usuário que enviou a solicitação
   * @returns {Promise<Object>} - Resultado da operação
   */
  static rejectRequest(userId, friendId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se existe uma solicitação pendente
        const friendship = await this.getRelationship(friendId, userId);
        
        if (!friendship) {
          throw new Error('Solicitação de amizade não encontrada');
        }
        
        if (friendship.status !== 'pending') {
          throw new Error('Esta solicitação não está pendente');
        }
        
        if (friendship.friend_id !== userId) {
          throw new Error('Esta solicitação não foi enviada para você');
        }
        
        // Atualizar status da amizade
        db.run(
          'UPDATE friendships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['rejected', friendship.id],
          function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível atualizar a solicitação'));
            }
            
            resolve({
              id: friendship.id,
              user_id: friendship.user_id,
              friend_id: friendship.friend_id,
              status: 'rejected'
            });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Remove uma amizade
   * @param {number} userId - ID do usuário que está removendo a amizade
   * @param {number} friendId - ID do amigo que será removido
   * @returns {Promise<Object>} - Resultado da operação
   */
  static removeFriend(userId, friendId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se existe uma amizade entre os usuários
        const friendship = await this.getRelationship(userId, friendId);
        const reverseFriendship = await this.getRelationship(friendId, userId);
        
        if (!friendship && !reverseFriendship) {
          throw new Error('Vocês não são amigos');
        }
        
        const friendshipToDelete = friendship || reverseFriendship;
        
        if (friendshipToDelete.status !== 'accepted') {
          throw new Error('Vocês não são amigos');
        }
        
        // Deletar a amizade
        db.run(
          'DELETE FROM friendships WHERE id = ?',
          [friendshipToDelete.id],
          function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível remover a amizade'));
            }
            
            resolve({ success: true });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Bloqueia um usuário
   * @param {number} userId - ID do usuário que está bloqueando
   * @param {number} blockId - ID do usuário que será bloqueado
   * @returns {Promise<Object>} - Resultado da operação
   */
  static blockUser(userId, blockId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se já existe um relacionamento entre os usuários
        const existingFriendship = await this.getRelationship(userId, blockId);
        const reverseFriendship = await this.getRelationship(blockId, userId);
        
        // Se existir uma amizade, atualizá-la para bloqueada
        if (existingFriendship) {
          db.run(
            'UPDATE friendships SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['blocked', existingFriendship.id],
            function(err) {
              if (err) {
                return reject(err);
              }
              
              resolve({
                id: existingFriendship.id,
                user_id: userId,
                friend_id: blockId,
                status: 'blocked'
              });
            }
          );
        } else if (reverseFriendship) {
          // Se existir uma amizade no sentido oposto, deletá-la e criar uma nova bloqueada
          db.run(
            'DELETE FROM friendships WHERE id = ?',
            [reverseFriendship.id],
            function(err) {
              if (err) {
                return reject(err);
              }
              
              // Criar nova relação bloqueada
              db.run(
                'INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)',
                [userId, blockId, 'blocked'],
                function(err) {
                  if (err) {
                    return reject(err);
                  }
                  
                  resolve({
                    id: this.lastID,
                    user_id: userId,
                    friend_id: blockId,
                    status: 'blocked'
                  });
                }
              );
            }
          );
        } else {
          // Se não existir nenhum relacionamento, criar um novo bloqueado
          db.run(
            'INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)',
            [userId, blockId, 'blocked'],
            function(err) {
              if (err) {
                return reject(err);
              }
              
              resolve({
                id: this.lastID,
                user_id: userId,
                friend_id: blockId,
                status: 'blocked'
              });
            }
          );
        }
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Desbloqueia um usuário
   * @param {number} userId - ID do usuário que está desbloqueando
   * @param {number} blockId - ID do usuário que será desbloqueado
   * @returns {Promise<Object>} - Resultado da operação
   */
  static unblockUser(userId, blockId) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar se existe um bloqueio
        const friendship = await this.getRelationship(userId, blockId);
        
        if (!friendship || friendship.status !== 'blocked') {
          throw new Error('Este usuário não está bloqueado');
        }
        
        // Deletar o bloqueio
        db.run(
          'DELETE FROM friendships WHERE id = ?',
          [friendship.id],
          function(err) {
            if (err) {
              return reject(err);
            }
            
            if (this.changes === 0) {
              return reject(new Error('Não foi possível desbloquear o usuário'));
            }
            
            resolve({ success: true });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Obtém a relação entre dois usuários
   * @param {number} userId - ID do primeiro usuário
   * @param {number} friendId - ID do segundo usuário
   * @returns {Promise<Object>} - Relação entre os usuários
   */
  static getRelationship(userId, friendId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?',
        [userId, friendId],
        (err, friendship) => {
          if (err) {
            return reject(err);
          }
          
          resolve(friendship);
        }
      );
    });
  }
  
  /**
   * Lista os amigos de um usuário
   * @param {number} userId - ID do usuário
   * @param {string} status - Status da amizade (opcional)
   * @returns {Promise<Array>} - Lista de amigos
   */
  static getFriends(userId, status = 'accepted') {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.id, u.username, u.email, u.avatar_url, u.rank, f.status, f.created_at
        FROM friendships f
        JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ? AND f.status = ?
        
        UNION
        
        SELECT u.id, u.username, u.email, u.avatar_url, u.rank, f.status, f.created_at
        FROM friendships f
        JOIN users u ON u.id = f.user_id
        WHERE f.friend_id = ? AND f.status = ?
        
        ORDER BY username
      `;
      
      db.all(
        query,
        [userId, status, userId, status],
        (err, friends) => {
          if (err) {
            return reject(err);
          }
          
          resolve(friends);
        }
      );
    });
  }
  
  /**
   * Lista as solicitações de amizade pendentes
   * @param {number} userId - ID do usuário
   * @returns {Promise<Array>} - Lista de solicitações pendentes
   */
  static getPendingRequests(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.id, u.username, u.email, u.avatar_url, f.created_at
        FROM friendships f
        JOIN users u ON u.id = f.user_id
        WHERE f.friend_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `;
      
      db.all(
        query,
        [userId],
        (err, requests) => {
          if (err) {
            return reject(err);
          }
          
          resolve(requests);
        }
      );
    });
  }
  
  /**
   * Verifica se dois usuários são amigos
   * @param {number} userId - ID do primeiro usuário
   * @param {number} friendId - ID do segundo usuário
   * @returns {Promise<boolean>} - Se são amigos
   */
  static async areFriends(userId, friendId) {
    try {
      const friendship1 = await this.getRelationship(userId, friendId);
      const friendship2 = await this.getRelationship(friendId, userId);
      
      return (
        (friendship1 && friendship1.status === 'accepted') ||
        (friendship2 && friendship2.status === 'accepted')
      );
    } catch (error) {
      return false;
    }
  }
}

module.exports = Friendship;