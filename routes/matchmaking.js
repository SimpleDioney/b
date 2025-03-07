// routes/matchmaking.js
const express = require('express');
const router = express.Router();
const Matchmaking = require('../models/Matchmaking');
const { authenticateToken } = require('../utils/auth');

/**
 * Entra na fila de matchmaking
 * POST /api/matchmaking/join
 */
router.post('/join', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { customMode, customStart, customTarget } = req.body;
    
    const result = await Matchmaking.addToQueue({
      userId,
      customMode: customMode || false,
      customStart,
      customTarget
    });
    
    if (result.matchFound) {
      res.status(201).json({
        message: 'Partida encontrada imediatamente',
        matchFound: true,
        challenge: result.challenge,
        session: result.session
      });
    } else {
      res.status(201).json({
        message: 'Adicionado à fila de matchmaking',
        matchFound: false,
        queueId: result.queueId
      });
    }
  } catch (error) {
    console.error('Erro ao entrar na fila:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Sai da fila de matchmaking
 * DELETE /api/matchmaking/leave
 */
router.delete('/leave', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await Matchmaking.removeFromQueue(userId);
    
    if (result.removed) {
      res.json({ message: 'Removido da fila de matchmaking' });
    } else {
      res.status(404).json({ message: 'Você não está na fila de matchmaking' });
    }
  } catch (error) {
    console.error('Erro ao sair da fila:', error);
    res.status(500).json({ error: 'Erro ao sair da fila de matchmaking' });
  }
});

/**
 * Verifica o status na fila
 * GET /api/matchmaking/status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const queueStatus = await Matchmaking.getByUserId(userId);
    
    if (queueStatus) {
      const inQueue = true;
      const joinedAt = queueStatus.joined_at;
      const waitTime = new Date() - new Date(joinedAt);
      const waitTimeSeconds = Math.floor(waitTime / 1000);
      
      res.json({
        inQueue,
        joinedAt,
        waitTimeSeconds,
        customMode: queueStatus.custom_mode === 1,
        customStart: queueStatus.custom_start,
        customTarget: queueStatus.custom_target
      });
    } else {
      res.json({ inQueue: false });
    }
  } catch (error) {
    console.error('Erro ao verificar status da fila:', error);
    res.status(500).json({ error: 'Erro ao verificar status da fila' });
  }
});

/**
 * Obtém estatísticas da fila
 * GET /api/matchmaking/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await Matchmaking.getQueueStats();
    
    res.json({ stats });
  } catch (error) {
    console.error('Erro ao buscar estatísticas da fila:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas da fila' });
  }
});

module.exports = router;