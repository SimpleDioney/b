// models/Notification.js
const { db } = require('../config/database');

class Notification {
  /**
   * Cria uma nova notificação
   * @param {Object} notificationData - Dados da notificação
   * @returns {Promise<Object>} - Notificação criada
   */
  static create(notificationData) {
    const { userId, type, content, relatedId } = notificationData;
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO notifications (user_id, type, content, related_id) VALUES (?, ?, ?, ?)',
        [userId, type, content, relatedId],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({
            id: this.lastID,
            user_id: userId,
            type,
            content,
            related_id: relatedId,
            read: 0,
            created_at: new Date().toISOString()
          });
        }
      );
    });
  }
  
  /**
   * Marca uma notificação como lida
   * @param {number} notificationId - ID da notificação
   * @param {number} userId - ID do usuário (para validação)
   * @returns {Promise<Object>} - Resultado da operação
   */
  static markAsRead(notificationId, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?',
        [notificationId, userId],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('Notificação não encontrada ou não pertence ao usuário'));
          }
          
          resolve({ success: true });
        }
      );
    });
  }
  
  /**
   * Marca todas as notificações de um usuário como lidas
   * @param {number} userId - ID do usuário
   * @returns {Promise<Object>} - Resultado da operação
   */
  static markAllAsRead(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
        [userId],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          resolve({ count: this.changes });
        }
      );
    });
  }
  
  /**
   * Obtém as notificações de um usuário
   * @param {number} userId - ID do usuário
   * @param {number} limit - Limite de registros
   * @param {number} offset - Deslocamento
   * @param {boolean} unreadOnly - Apenas não lidas
   * @returns {Promise<Array>} - Lista de notificações
   */
  static getByUserId(userId, limit = 20, offset = 0, unreadOnly = false) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT n.*, 
          CASE 
            WHEN n.type = 'friend_request' OR n.type = 'friend_accepted' OR n.type = 'game_invite' THEN u.username
            ELSE NULL 
          END as related_username,
          CASE 
            WHEN n.type = 'friend_request' OR n.type = 'friend_accepted' OR n.type = 'game_invite' THEN u.avatar_url
            ELSE NULL 
          END as related_avatar
        FROM notifications n
        LEFT JOIN users u ON n.related_id = u.id
        WHERE n.user_id = ?
      `;
      
      const params = [userId];
      
      if (unreadOnly) {
        query += ' AND n.read = 0';
      }
      
      query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      db.all(
        query,
        params,
        (err, notifications) => {
          if (err) {
            return reject(err);
          }
          
          resolve(notifications);
        }
      );
    });
  }
  
  /**
   * Conta o número de notificações não lidas
   * @param {number} userId - ID do usuário
   * @returns {Promise<number>} - Contagem de notificações não lidas
   */
  static countUnread(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0',
        [userId],
        (err, result) => {
          if (err) {
            return reject(err);
          }
          
          resolve(result ? result.count : 0);
        }
      );
    });
  }
  
  /**
   * Exclui uma notificação
   * @param {number} notificationId - ID da notificação
   * @param {number} userId - ID do usuário (para validação)
   * @returns {Promise<Object>} - Resultado da operação
   */
  static delete(notificationId, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM notifications WHERE id = ? AND user_id = ?',
        [notificationId, userId],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('Notificação não encontrada ou não pertence ao usuário'));
          }
          
          resolve({ success: true });
        }
      );
    });
  }
  
  /**
   * Limpa notificações antigas
   * @param {number} daysOld - Dias de idade das notificações
   * @returns {Promise<Object>} - Resultado da operação
   */
  static cleanupOld(daysOld = 30) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      db.run(
        'DELETE FROM notifications WHERE created_at < ? AND read = 1',
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

module.exports = Notification;