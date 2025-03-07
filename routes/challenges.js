// routes/challenges.js
const express = require('express');
const router = express.Router();
const Challenge = require('../models/Challenge');
const Friendship = require('../models/Friendship');
const { authenticateToken } = require('../utils/auth');
const GameSession = require('../models/GameSession');
const { db } = require('../config/database');


/**
 * Cria um novo desafio
 * POST /api/challenges
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { opponentId, startArticle, targetArticle, customMode } = req.body;
    
    // Validar dados
    if (opponentId && isNaN(parseInt(opponentId))) {
      return res.status(400).json({ error: 'ID de oponente inválido' });
    }
    
    // Se houver um oponente, verificar se são amigos
    if (opponentId) {
      const areFriends = await Friendship.areFriends(userId, opponentId);
      
      if (!areFriends) {
        return res.status(403).json({ error: 'Você só pode desafiar seus amigos' });
      }
    }
    
    // Criar desafio
    const challenge = await Challenge.create({
      creatorId: userId,
      opponentId: opponentId || null,
      startArticle,
      targetArticle,
      customMode: customMode || false
    });
    
    res.status(201).json({
      message: 'Desafio criado com sucesso',
      challenge
    });
  } catch (error) {
    console.error('Erro ao criar desafio:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Aceita um desafio
 * POST /api/challenges/:challengeId/accept
 */
router.post('/:challengeId/accept', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = parseInt(req.params.challengeId);
    
    if (isNaN(challengeId)) {
      return res.status(400).json({ error: 'ID de desafio inválido' });
    }
    
    const result = await Challenge.acceptChallenge(challengeId, userId);
    
    res.json({
      message: 'Desafio aceito com sucesso',
      challenge: result.challenge,
      session: result.session
    });
  } catch (error) {
    console.error('Erro ao aceitar desafio:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Rejeita um desafio
 * POST /api/challenges/:challengeId/reject
 */
router.post('/:challengeId/reject', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = parseInt(req.params.challengeId);
    
    if (isNaN(challengeId)) {
      return res.status(400).json({ error: 'ID de desafio inválido' });
    }
    
    const challenge = await Challenge.rejectChallenge(challengeId, userId);
    
    res.json({
      message: 'Desafio rejeitado com sucesso',
      challenge
    });
  } catch (error) {
    console.error('Erro ao rejeitar desafio:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Cancela um desafio
 * POST /api/challenges/:challengeId/cancel
 */
router.post('/:challengeId/cancel', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = parseInt(req.params.challengeId);
    
    if (isNaN(challengeId)) {
      return res.status(400).json({ error: 'ID de desafio inválido' });
    }
    
    const challenge = await Challenge.cancelChallenge(challengeId, userId);
    
    res.json({
      message: 'Desafio cancelado com sucesso',
      challenge
    });
  } catch (error) {
    console.error('Erro ao cancelar desafio:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Obtém detalhes de um desafio
 * GET /api/challenges/:challengeId
 */
router.get('/:challengeId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = parseInt(req.params.challengeId);
    
    if (isNaN(challengeId)) {
      return res.status(400).json({ error: 'ID de desafio inválido' });
    }
    
    const challenge = await Challenge.findById(challengeId);
    
    if (!challenge) {
      return res.status(404).json({ error: 'Desafio não encontrado' });
    }
    
    // Verificar se o usuário faz parte do desafio
    if (challenge.creator_id !== userId && challenge.opponent_id !== userId) {
      return res.status(403).json({ error: 'Você não tem permissão para ver este desafio' });
    }
    
    res.json({ challenge });
  } catch (error) {
    console.error('Erro ao buscar desafio:', error);
    res.status(500).json({ error: 'Erro ao buscar desafio' });
  }
});

/**
 * Lista os desafios do usuário
 * GET /api/challenges
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;
    
    let challenges;
    
    if (status) {
      // Filtrar por status
      challenges = await Challenge.findByParticipant(userId, [status]);
    } else {
      // Todos os desafios
      challenges = await Challenge.findByParticipant(userId);
    }
    
    res.json({ challenges });
  } catch (error) {
    console.error('Erro ao listar desafios:', error);
    res.status(500).json({ error: 'Erro ao buscar desafios' });
  }
});

/**
 * Lista os desafios pendentes enviados para o usuário
 * GET /api/challenges/pending
 */
router.get('/pending/received', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const challenges = await Challenge.findByOpponent(userId, ['pending']);
    
    res.json({ challenges });
  } catch (error) {
    console.error('Erro ao listar desafios pendentes:', error);
    res.status(500).json({ error: 'Erro ao buscar desafios pendentes' });
  }
});

/**
 * Verifica o progresso do oponente em um desafio
 * GET /api/challenges/:challengeId/opponent-progress
 */
router.get('/:challengeId/opponent-progress', authenticateToken, (req, res) => {
    try {
      const userId = req.user.id;
      const challengeId = parseInt(req.params.challengeId);
      
      console.log(`Verificando progresso do oponente no desafio ${challengeId}, usuário ${userId}`);
      
      if (isNaN(challengeId)) {
        return res.status(400).json({ error: 'ID de desafio inválido' });
      }
      
      // Buscar o desafio
      db.get('SELECT * FROM challenges WHERE id = ?', [challengeId], (err, challenge) => {
        if (err) {
          console.error('Erro ao buscar desafio:', err);
          return res.status(500).json({ error: 'Erro ao buscar desafio' });
        }
        
        if (!challenge) {
          return res.status(404).json({ error: 'Desafio não encontrado' });
        }
        
        // Verificar se o usuário participa do desafio
        if (challenge.creator_id !== userId && challenge.opponent_id !== userId) {
          return res.status(403).json({ error: 'Você não tem permissão para ver este desafio' });
        }
        
        // Determinar o ID do oponente
        const opponentId = challenge.creator_id === userId ? challenge.opponent_id : challenge.creator_id;
        
        // Buscar a sessão do oponente
        db.get(
          'SELECT * FROM game_sessions WHERE user_id = ? AND challenge_id = ?',
          [opponentId, challengeId],
          (err, session) => {
            if (err) {
              console.error('Erro ao buscar sessão do oponente:', err);
              return res.status(500).json({ error: 'Erro ao buscar sessão do oponente' });
            }
            
            // Se não encontrou sessão, retornar que o oponente ainda não iniciou
            if (!session) {
              return res.json({
                user_id: opponentId,
                clicks: 0,
                completed: false,
                started: false
              });
            }
            
            // Retornar informações do progresso
            res.json({
              user_id: opponentId,
              clicks: session.clicks || 0,
              completed: session.completed === 1,
              started: true,
              current_article: session.current_article
            });
          }
        );
      });
    } catch (error) {
      console.error('Erro ao verificar progresso do oponente:', error);
      res.status(500).json({ error: 'Erro ao verificar progresso do oponente' });
    }
  });
/**
 * Marca um desafio como completado (quando um jogador chega ao final)
 * POST /api/challenges/:challengeId/complete
 */
router.post('/:challengeId/complete', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const challengeId = parseInt(req.params.challengeId);
      
      if (isNaN(challengeId)) {
        return res.status(400).json({ error: 'ID de desafio inválido' });
      }
      
      // Completar o desafio
      const completedChallenge = await Challenge.completeChallenge(challengeId, userId);
      
      res.json({
        message: 'Desafio completado com sucesso',
        challenge: completedChallenge
      });
      
    } catch (error) {
      console.error('Erro ao completar desafio:', error);
      res.status(400).json({ error: error.message });
    }
  });

/**
 * Obtém estatísticas de desafios do usuário
 * GET /api/challenges/stats
 */
router.get('/stats/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const stats = await Challenge.getStats(userId);
    
    res.json({ stats });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de desafios:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

module.exports = router;