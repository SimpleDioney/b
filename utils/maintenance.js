// utils/maintenance.js
const Challenge = require('../models/Challenge');
const Matchmaking = require('../models/Matchmaking');
const Notification = require('../models/Notification');
const ArticleCache = require('../models/ArticleCache');
const GameSession = require('../models/GameSession');
const PathHistory = require('../models/PathHistory');

/**
 * Agenda as tarefas de manutenção periódicas
 */
function scheduleMaintenanceTasks() {
  console.log('Scheduling maintenance tasks...');
  
  // Limpar desafios expirados (a cada 1 hora)
  setInterval(async () => {
    try {
      const result = await Challenge.cleanupExpired();
      console.log(`Maintenance: ${result.cancelledCount} expired challenges cancelled`);
    } catch (error) {
      console.error('Error cleaning up expired challenges:', error);
    }
  }, 60 * 60 * 1000);
  
  // Limpar fila de matchmaking (a cada 10 minutos)
  setInterval(async () => {
    try {
      const result = await Matchmaking.cleanupQueue(30);
      console.log(`Maintenance: ${result.removedCount} stale queue entries removed`);
    } catch (error) {
      console.error('Error cleaning up matchmaking queue:', error);
    }
  }, 10 * 60 * 1000);
  
  // Limpar notificações antigas (a cada 24 horas)
  setInterval(async () => {
    try {
      const result = await Notification.cleanupOld(30);
      console.log(`Maintenance: ${result.deletedCount} old notifications deleted`);
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }, 24 * 60 * 60 * 1000);
  
  // Limpar cache de artigos (a cada 24 horas)
  setInterval(async () => {
    try {
      const result = await ArticleCache.cleanup(7, 10);
      console.log(`Maintenance: ${result.deletedCount} cached articles cleaned up`);
    } catch (error) {
      console.error('Error cleaning up article cache:', error);
    }
  }, 24 * 60 * 60 * 1000);
  
  // Limpar sessões de jogo inativas (a cada 24 horas)
  setInterval(async () => {
    try {
      const result = await GameSession.cleanupInactiveSessions(7);
      console.log(`Maintenance: ${result.deletedCount} inactive game sessions cleaned up`);
    } catch (error) {
      console.error('Error cleaning up inactive game sessions:', error);
    }
  }, 24 * 60 * 60 * 1000);
  
  // Limpar histórico de caminhos de sessões antigas (a cada 24 horas)
  setInterval(async () => {
    try {
      const result = await PathHistory.cleanupOldPaths(7);
      console.log(`Maintenance: ${result.deletedCount} old path history entries cleaned up`);
    } catch (error) {
      console.error('Error cleaning up old path history:', error);
    }
  }, 24 * 60 * 60 * 1000);
  
  console.log('All maintenance tasks scheduled successfully');
}

module.exports = {
  scheduleMaintenanceTasks
};