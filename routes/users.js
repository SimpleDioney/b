const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const Friendship = require('../models/Friendship');
const { authenticateToken } = require('../utils/auth');

/**
 * Obter perfil do usuário
 * GET /api/users/profile
 */
router.get('/profile', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    
    db.get(
      `SELECT 
        id, username, email, games_played, games_won, best_time_seconds, best_clicks, created_at,
        (SELECT COUNT(*) FROM game_sessions WHERE user_id = users.id) as total_games,
        (SELECT COUNT(*) FROM game_sessions WHERE user_id = users.id AND completed = 1) as completed_games
      FROM users WHERE id = ?`,
      [userId],
      (err, user) => {
        if (err) {
          console.error('Erro ao buscar perfil:', err);
          return res.status(500).json({ error: 'Erro ao buscar perfil' });
        }
        
        if (!user) {
          return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Remover dados sensíveis
        delete user.password_hash;
        
        res.json(user);
      }
    );
  } catch (error) {
    console.error('Erro ao obter perfil:', error);
    res.status(500).json({ error: 'Erro interno ao buscar perfil' });
  }
});

/**
 * Busca usuários pelo nome ou email
 * GET /api/users/search
 */
router.get('/search', authenticateToken, (req, res) => {
    try {
      const searchTerm = req.query.term;
      
      if (!searchTerm || searchTerm.length < 3) {
        return res.status(400).json({ error: 'Termo de busca deve ter ao menos 3 caracteres' });
      }
      
      console.log(`Buscando usuários com termo: "${searchTerm}"`);
      
      // Buscar usuários similares ao termo
      db.all(
        `SELECT id, username, email, avatar_url, rank 
         FROM users 
         WHERE username LIKE ? OR email LIKE ? 
         LIMIT 10`,
        [`%${searchTerm}%`, `%${searchTerm}%`],
        (err, users) => {
          if (err) {
            console.error('Erro ao buscar usuários:', err);
            return res.status(500).json({ error: 'Erro ao buscar usuários' });
          }
          
          console.log(`Encontrados ${users.length} usuários para o termo "${searchTerm}"`);
          
          // Não incluir o usuário atual nos resultados
          const filteredUsers = users.filter(user => user.id !== req.user.id);
          
          res.json({ users: filteredUsers });
        }
      );
    } catch (error) {
      console.error('Erro ao realizar busca:', error);
      res.status(500).json({ error: 'Erro interno ao buscar usuários' });
    }
  });

/**
 * Obtém informações de um usuário por ID
 * GET /api/users/:userId
 */
router.get('/:userId', authenticateToken, async (req, res) => {
    try {
      const requestedUserId = parseInt(req.params.userId);
      
      if (isNaN(requestedUserId)) {
        return res.status(400).json({ error: 'ID de usuário inválido' });
      }
      
      // Buscar usuário
      db.get(
        `SELECT id, username, email, avatar_url, rank, games_played, games_won, 
         best_clicks, best_time_seconds, created_at 
         FROM users WHERE id = ?`,
        [requestedUserId],
        async (err, user) => {
          if (err) {
            console.error('Erro ao buscar usuário:', err);
            return res.status(500).json({ error: 'Erro ao buscar usuário' });
          }
          
          if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
          }
          
          // Verificar se são amigos (opcional)
          let friendStatus = 'none';
          try {
            const friendship = await Friendship.getRelationship(req.user.id, requestedUserId);
            const reverseFriendship = await Friendship.getRelationship(requestedUserId, req.user.id);
            
            if (friendship) {
              friendStatus = friendship.status;
            } else if (reverseFriendship) {
              if (reverseFriendship.status === 'pending') {
                friendStatus = 'incoming_request';
              } else {
                friendStatus = reverseFriendship.status;
              }
            }
          } catch (error) {
            console.error('Erro ao verificar amizade:', error);
          }
          
          // Retornar informações do usuário
          res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            avatar_url: user.avatar_url,
            rank: user.rank,
            games_played: user.games_played,
            games_won: user.games_won,
            best_clicks: user.best_clicks,
            best_time_seconds: user.best_time_seconds,
            created_at: user.created_at,
            friendship_status: friendStatus
          });
        }
      );
    } catch (error) {
      console.error('Erro ao obter usuário:', error);
      res.status(500).json({ error: 'Erro ao buscar informações do usuário' });
    }
  });

/**
 * Obter histórico de jogos do usuário
 * GET /api/users/history
 */
router.get('/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    db.all(
      `SELECT 
        id, session_token, start_article, target_article, current_article, 
        clicks, start_time, last_activity, completed
      FROM game_sessions 
      WHERE user_id = ? 
      ORDER BY last_activity DESC
      LIMIT ? OFFSET ?`,
      [userId, limit, offset],
      (err, games) => {
        if (err) {
          console.error('Erro ao buscar histórico:', err);
          return res.status(500).json({ error: 'Erro ao buscar histórico de jogos' });
        }
        
        res.json(games);
      }
    );
  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    res.status(500).json({ error: 'Erro interno ao buscar histórico' });
  }
});

/**
 * Obter ranking dos jogadores
 * GET /api/users/leaderboard
 */
router.get('/leaderboard', (req, res) => {
  try {
    db.all(
      `SELECT 
        id, username, games_played, games_won,
        (games_won * 100.0 / CASE WHEN games_played = 0 THEN 1 ELSE games_played END) as win_rate,
        best_clicks
      FROM users
      WHERE games_played > 0
      ORDER BY win_rate DESC, best_clicks ASC
      LIMIT 20`,
      [],
      (err, leaderboard) => {
        if (err) {
          console.error('Erro ao buscar leaderboard:', err);
          return res.status(500).json({ error: 'Erro ao buscar ranking' });
        }
        
        res.json(leaderboard);
      }
    );
  } catch (error) {
    console.error('Erro ao obter leaderboard:', error);
    res.status(500).json({ error: 'Erro interno ao buscar ranking' });
  }
});

module.exports = router;