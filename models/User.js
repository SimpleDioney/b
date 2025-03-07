const { db } = require('../config/database');
const bcrypt = require('bcrypt');

class User {
  /**
   * Cria um novo usuário
   * @param {Object} userData - Dados do usuário
   * @returns {Promise<Object>} - Usuário criado
   */
  static async create(userData) {
    const { username, email, password } = userData;
    
    return new Promise(async (resolve, reject) => {
      try {
        // Hash da senha
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        db.run(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
          [username, email, passwordHash],
          function(err) {
            if (err) {
              return reject(err);
            }
            
            resolve({
              id: this.lastID,
              username,
              email
            });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Busca um usuário pelo ID
   * @param {number} id - ID do usuário
   * @returns {Promise<Object>} - Usuário encontrado
   */
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT id, username, email, games_played, games_won, best_time_seconds, best_clicks, created_at FROM users WHERE id = ?',
        [id],
        (err, user) => {
          if (err) {
            return reject(err);
          }
          
          resolve(user);
        }
      );
    });
  }
  
  /**
   * Busca um usuário pelo nome de usuário
   * @param {string} username - Nome de usuário
   * @returns {Promise<Object>} - Usuário encontrado
   */
  static findByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        (err, user) => {
          if (err) {
            return reject(err);
          }
          
          resolve(user);
        }
      );
    });
  }
  
  /**
   * Busca um usuário pelo email
   * @param {string} email - Email do usuário
   * @returns {Promise<Object>} - Usuário encontrado
   */
  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE email = ?',
        [email],
        (err, user) => {
          if (err) {
            return reject(err);
          }
          
          resolve(user);
        }
      );
    });
  }
  
  /**
   * Autentica um usuário
   * @param {string} username - Nome de usuário
   * @param {string} password - Senha
   * @returns {Promise<Object>} - Usuário autenticado
   */
  static async authenticate(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        const user = await this.findByUsername(username);
        
        if (!user) {
          return resolve(null);
        }
        
        const match = await bcrypt.compare(password, user.password_hash);
        
        if (!match) {
          return resolve(null);
        }
        
        // Remover dados sensíveis
        delete user.password_hash;
        
        resolve(user);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Atualiza estatísticas do usuário após um jogo
   * @param {number} userId - ID do usuário
   * @param {boolean} gameWon - Se o jogo foi vencido
   * @param {number} clicks - Número de cliques
   * @param {number} timeSeconds - Tempo em segundos
   */
  static updateStats(userId, gameWon, clicks, timeSeconds) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         games_played = games_played + 1,
         games_won = CASE WHEN ? THEN games_won + 1 ELSE games_won END,
         best_clicks = CASE WHEN (? AND (best_clicks IS NULL OR ? < best_clicks)) THEN ? ELSE best_clicks END,
         best_time_seconds = CASE WHEN (? AND (best_time_seconds IS NULL OR ? < best_time_seconds)) THEN ? ELSE best_time_seconds END
         WHERE id = ?`,
        [gameWon, gameWon, clicks, clicks, gameWon, timeSeconds, timeSeconds, userId],
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
   * Obtém o ranking de jogadores
   * @param {number} limit - Limite de registros
   * @returns {Promise<Array>} - Ranking de jogadores
   */
  static getLeaderboard(limit = 20) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          id, username, games_played, games_won,
          (games_won * 100.0 / CASE WHEN games_played = 0 THEN 1 ELSE games_played END) as win_rate,
          best_clicks, best_time_seconds
        FROM users
        WHERE games_played > 0
        ORDER BY win_rate DESC, best_clicks ASC
        LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          
          resolve(rows);
        }
      );
    });
  }
}

module.exports = User;