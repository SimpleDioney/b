// routes/friends.js
const express = require('express');
const router = express.Router();
const Friendship = require('../models/Friendship');
const { authenticateToken } = require('../utils/auth');

/**
 * Envia uma solicitação de amizade
 * POST /api/friends/request/:friendId
 */
router.post('/request/:friendId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId);
    
    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'ID de amigo inválido' });
    }
    
    const friendship = await Friendship.sendRequest(userId, friendId);
    
    res.status(201).json({
      message: 'Solicitação de amizade enviada com sucesso',
      friendship
    });
  } catch (error) {
    console.error('Erro ao enviar solicitação de amizade:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Aceita uma solicitação de amizade
 * POST /api/friends/accept/:friendId
 */
router.post('/accept/:friendId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId);
    
    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'ID de amigo inválido' });
    }
    
    const friendship = await Friendship.acceptRequest(userId, friendId);
    
    res.json({
      message: 'Solicitação de amizade aceita com sucesso',
      friendship
    });
  } catch (error) {
    console.error('Erro ao aceitar solicitação de amizade:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Rejeita uma solicitação de amizade
 * POST /api/friends/reject/:friendId
 */
router.post('/reject/:friendId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId);
    
    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'ID de amigo inválido' });
    }
    
    const friendship = await Friendship.rejectRequest(userId, friendId);
    
    res.json({
      message: 'Solicitação de amizade rejeitada com sucesso',
      friendship
    });
  } catch (error) {
    console.error('Erro ao rejeitar solicitação de amizade:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Remove um amigo
 * DELETE /api/friends/:friendId
 */
router.delete('/:friendId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId);
    
    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'ID de amigo inválido' });
    }
    
    await Friendship.removeFriend(userId, friendId);
    
    res.json({
      message: 'Amizade removida com sucesso'
    });
  } catch (error) {
    console.error('Erro ao remover amizade:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Bloqueia um usuário
 * POST /api/friends/block/:userId
 */
router.post('/block/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const blockId = parseInt(req.params.userId);
    
    if (isNaN(blockId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    
    const result = await Friendship.blockUser(userId, blockId);
    
    res.json({
      message: 'Usuário bloqueado com sucesso',
      result
    });
  } catch (error) {
    console.error('Erro ao bloquear usuário:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Desbloqueia um usuário
 * POST /api/friends/unblock/:userId
 */
router.post('/unblock/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const blockId = parseInt(req.params.userId);
    
    if (isNaN(blockId)) {
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }
    
    await Friendship.unblockUser(userId, blockId);
    
    res.json({
      message: 'Usuário desbloqueado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao desbloquear usuário:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Lista os amigos do usuário
 * GET /api/friends
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const friends = await Friendship.getFriends(userId);
    
    res.json({ friends });
  } catch (error) {
    console.error('Erro ao listar amigos:', error);
    res.status(500).json({ error: 'Erro ao buscar lista de amigos' });
  }
});

/**
 * Lista as solicitações de amizade pendentes
 * GET /api/friends/requests
 */
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const requests = await Friendship.getPendingRequests(userId);
    
    res.json({ requests });
  } catch (error) {
    console.error('Erro ao listar solicitações pendentes:', error);
    res.status(500).json({ error: 'Erro ao buscar solicitações pendentes' });
  }
});

/**
 * Verifica status da amizade com outro usuário
 * GET /api/friends/status/:friendId
 */
router.get('/status/:friendId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = parseInt(req.params.friendId);
    
    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'ID de amigo inválido' });
    }
    
    const friendship1 = await Friendship.getRelationship(userId, friendId);
    const friendship2 = await Friendship.getRelationship(friendId, userId);
    
    let status = 'none';
    
    if (friendship1) {
      status = friendship1.status;
    } else if (friendship2) {
      if (friendship2.status === 'pending') {
        status = 'incoming_request';
      } else {
        status = friendship2.status;
      }
    }
    
    res.json({ status });
  } catch (error) {
    console.error('Erro ao verificar status de amizade:', error);
    res.status(500).json({ error: 'Erro ao verificar status de amizade' });
  }
});

module.exports = router;