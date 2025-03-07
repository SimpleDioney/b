const { db } = require('../config/database');
const wikipediaService = require('../services/wikipediaService');

/**
 * Verifica se um caminho entre artigos é válido
 * @param {Array} path - Caminho de artigos
 * @returns {Promise<boolean>} - Se o caminho é válido
 */
async function validatePath(path) {
  if (!path || path.length < 2) {
    return false;
  }
  
  try {
    for (let i = 0; i < path.length - 1; i++) {
      const currentArticle = await wikipediaService.getArticleWithLinks(path[i]);
      
      // Verificar se o próximo artigo está nos links do atual
      if (!currentArticle.links.includes(path[i + 1])) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao validar caminho:', error);
    return false;
  }
}

/**
 * Agenda limpeza periódica de cache e dados antigos
 */
function scheduleMaintenanceTasks() {
  // Limpar cache de artigos a cada 24 horas
  setInterval(() => {
    wikipediaService.cleanupOldCache()
      .then(() => console.log('Limpeza de cache concluída'))
      .catch(err => console.error('Erro na limpeza de cache:', err));
  }, 24 * 60 * 60 * 1000);
  
  // Remover sessões de jogo inativas (mais de 7 dias)
  setInterval(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    
    db.run(
      'DELETE FROM path_history WHERE session_id IN (SELECT id FROM game_sessions WHERE last_activity < ? AND completed = 0)',
      [cutoffDate.toISOString()],
      err => {
        if (err) console.error('Erro ao limpar histórico de caminhos:', err);
      }
    );
    
    db.run(
      'DELETE FROM game_sessions WHERE last_activity < ? AND completed = 0',
      [cutoffDate.toISOString()],
      err => {
        if (err) console.error('Erro ao limpar sessões inativas:', err);
        else console.log('Limpeza de sessões inativas concluída');
      }
    );
  }, 7 * 24 * 60 * 60 * 1000);
}

module.exports = {
  validatePath,
  scheduleMaintenanceTasks
};