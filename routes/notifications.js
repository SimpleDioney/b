// routes/notifications.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticateToken } = require('../utils/auth');

/**
 * Lista notificações do usuário
 * GET /api/notifications
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const unreadOnly = req.query.unread === 'true';
    
    const notifications = await Notification.getByUserId(userId, limit, offset, unreadOnly);
    
    res.json({ notifications });
  } catch (error) {
    console.error('Erro ao listar notificações:', error);
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

/**
 * Marca uma notificação como lida
 * PUT /api/notifications/:notificationId/read
 */
router.put('/:notificationId/read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.notificationId);
    
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'ID de notificação inválido' });
    }
    
    await Notification.markAsRead(notificationId, userId);
    
    res.json({
      message: 'Notificação marcada como lida'
    });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Marca todas as notificações como lidas
 * PUT /api/notifications/read-all
 */
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await Notification.markAllAsRead(userId);
    
    res.json({
      message: `${result.count} notificações marcadas como lidas`
    });
  } catch (error) {
    console.error('Erro ao marcar todas notificações como lidas:', error);
    res.status(500).json({ error: 'Erro ao marcar notificações como lidas' });
  }
});

/**
 * Exclui uma notificação
 * DELETE /api/notifications/:notificationId
 */
router.delete('/:notificationId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.notificationId);
    
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'ID de notificação inválido' });
    }
    
    await Notification.delete(notificationId, userId);
    
    res.json({
      message: 'Notificação excluída com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir notificação:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Conta notificações não lidas
 * GET /api/notifications/count-unread
 */
router.get('/count-unread', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const count = await Notification.countUnread(userId);
    
    res.json({ count });
  } catch (error) {
    console.error('Erro ao contar notificações não lidas:', error);
    res.status(500).json({ error: 'Erro ao contar notificações não lidas' });
  }
});

module.exports = router;