const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');
const wikipediaService = require('../services/wikipediaService');
const { authenticateToken } = require('../utils/auth');
const GameSession = require('../models/GameSession');

/**
 * Inicia um novo jogo
 * POST /api/games/start
 */
router.post('/start', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      let { startArticle, targetArticle, challengeId } = req.body;
      
      // Se não foram fornecidos artigos, gerar aleatórios
      if (!startArticle || !targetArticle) {
        const randomPair = await wikipediaService.getRandomArticlePair();
        startArticle = randomPair.startArticle;
        targetArticle = randomPair.targetArticle;
      }
      
      // Verificar se os artigos existem
      try {
        await wikipediaService.getArticleWithLinks(startArticle);
        await wikipediaService.getArticleWithLinks(targetArticle);
      } catch (error) {
        return res.status(400).json({ error: 'Artigo não encontrado na Wikipédia' });
      }
      
      // Gerar token de sessão
      const sessionToken = uuidv4();
      
      // Criar nova sessão de jogo
      db.run(
        `INSERT INTO game_sessions 
         (user_id, session_token, start_article, target_article, current_article, challenge_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, sessionToken, startArticle, targetArticle, startArticle, challengeId || null],
        function(err) {
          if (err) {
            console.error('Erro ao criar sessão de jogo:', err);
            return res.status(500).json({ error: 'Erro ao iniciar jogo' });
          }
          
          const gameSessionId = this.lastID;
          
          // Registrar artigo inicial no histórico
          db.run(
            'INSERT INTO path_history (session_id, article, click_number) VALUES (?, ?, ?)',
            [gameSessionId, startArticle, 0],
            err => {
              if (err) {
                console.error('Erro ao registrar histórico:', err);
              }
            }
          );
          
          // Retornar informações do jogo
          res.status(201).json({
            sessionToken,
            startArticle,
            targetArticle,
            currentArticle: startArticle,
            challengeId
          });
        }
      );
    } catch (error) {
      console.error('Erro ao iniciar jogo:', error);
      res.status(500).json({ error: 'Não foi possível iniciar o jogo' });
    }
  });

/**
 * Obtém artigo atual com links para navegação
 * GET /api/games/:sessionToken/current
 */
router.get('/:sessionToken/current', authenticateToken, async (req, res) => {
    try {
      const { sessionToken } = req.params;
      const userId = req.user.id;
      
      console.log(`Buscando sessão com token: ${sessionToken}, usuário: ${userId}`);
      
      // Buscar sessão
      db.get(
        'SELECT * FROM game_sessions WHERE session_token = ?',
        [sessionToken],
        async (err, session) => {
          if (err) {
            console.error('Erro ao buscar sessão:', err);
            return res.status(500).json({ error: 'Erro ao buscar sessão de jogo' });
          }
          
          if (!session) {
            console.log(`Sessão não encontrada para token: ${sessionToken}`);
            return res.status(404).json({ error: 'Sessão de jogo não encontrada' });
          }
          
          console.log(`Sessão encontrada: user_id=${session.user_id}, challenge_id=${session.challenge_id}`);
          
          try {
            // Se for um desafio, verificar se o usuário é participante
            if (session.challenge_id) {
              const checkChallenge = await new Promise((resolve, reject) => {
                db.get(
                  'SELECT * FROM challenges WHERE id = ?',
                  [session.challenge_id],
                  (err, challenge) => {
                    if (err) return reject(err);
                    resolve(challenge);
                  }
                );
              });
              
              if (checkChallenge && (checkChallenge.creator_id === userId || checkChallenge.opponent_id === userId)) {
                // Usuário é participante do desafio, permitir acesso
                console.log(`Usuário ${userId} é participante do desafio, acesso permitido`);
                proceedWithSession();
                return;
              }
            }
            
            // Verificação padrão por proprietário da sessão
            if (session.user_id !== userId) {
              console.log(`Usuário ${userId} tentou acessar sessão do usuário ${session.user_id}`);
              return res.status(403).json({ error: 'Acesso negado a esta sessão de jogo' });
            }
            
            proceedWithSession();
          } catch (error) {
            console.error('Erro ao verificar acesso:', error);
            return res.status(500).json({ error: 'Erro ao verificar permissões de acesso' });
          }
          
          // Função para continuar com o carregamento da sessão
          function proceedWithSession() {
            // Verificar se o jogo já foi completado
            if (session.completed) {
              return res.status(400).json({ error: 'Este jogo já foi completado' });
            }
            
            // Buscar artigo atual com links
            wikipediaService.getArticleWithLinks(session.current_article)
              .then(article => {
                // Buscar histórico do caminho
                db.all(
                  'SELECT article, click_number FROM path_history WHERE session_id = ? ORDER BY click_number ASC',
                  [session.id],
                  (err, pathHistory) => {
                    if (err) {
                      console.error('Erro ao buscar histórico de caminho:', err);
                      return res.status(500).json({ error: 'Erro ao buscar histórico de caminho' });
                    }
                    
                    res.json({
                      currentArticle: session.current_article,
                      targetArticle: session.target_article,
                      startArticle: session.start_article,
                      content: article.content,
                      links: article.links,
                      clicks: session.clicks,
                      pathHistory: pathHistory || [],
                      challengeId: session.challenge_id
                    });
                  }
                );
              })
              .catch(error => {
                console.error('Erro ao buscar artigo:', error);
                res.status(500).json({ error: 'Erro ao buscar artigo atual' });
              });
          }
        }
      );
    } catch (error) {
      console.error('Erro ao obter artigo atual:', error);
      res.status(500).json({ error: 'Não foi possível obter o artigo atual' });
    }
  });

/**
 * Navega para o próximo artigo
 * POST /api/games/:sessionToken/navigate
 */
router.post('/:sessionToken/navigate', authenticateToken, async (req, res) => {
  try {
    const { sessionToken } = req.params;
    const { nextArticle } = req.body;
    
    if (!nextArticle) {
      return res.status(400).json({ error: 'Próximo artigo não especificado' });
    }
    
    // Buscar sessão
    db.get(
      'SELECT * FROM game_sessions WHERE session_token = ?',
      [sessionToken],
      async (err, session) => {
        if (err || !session) {
          return res.status(404).json({ error: 'Sessão de jogo não encontrada' });
        }
        
        // Verificar se o jogo já foi completado
        if (session.completed) {
          return res.status(400).json({ error: 'Este jogo já foi completado' });
        }
        
        // Verificar se o próximo artigo é válido
        try {
          const currentArticle = await wikipediaService.getArticleWithLinks(session.current_article);
          
          // Verificar se o link está presente no artigo atual
          if (!currentArticle.links.includes(nextArticle)) {
            return res.status(400).json({ 
              error: 'Link inválido. Você só pode navegar para links presentes no artigo atual.' 
            });
          }
          
          // Incrementar clicks e atualizar artigo atual
          const newClickNumber = session.clicks + 1;
          
          db.run(
            `UPDATE game_sessions 
             SET current_article = ?, clicks = ?, last_activity = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [nextArticle, newClickNumber, session.id],
            async function(err) {
              if (err) {
                console.error('Erro ao atualizar sessão:', err);
                return res.status(500).json({ error: 'Erro ao navegar para próximo artigo' });
              }
              
              // Registrar no histórico
              db.run(
                'INSERT INTO path_history (session_id, article, click_number) VALUES (?, ?, ?)',
                [session.id, nextArticle, newClickNumber],
                err => {
                  if (err) {
                    console.error('Erro ao registrar histórico:', err);
                  }
                }
              );
              
              // Verificar se chegou ao destino
              const gameCompleted = nextArticle === session.target_article;
              
              if (gameCompleted) {
                // Marcar jogo como completado
                db.run(
                  'UPDATE game_sessions SET completed = 1 WHERE id = ?',
                  [session.id],
                  err => {
                    if (err) {
                      console.error('Erro ao completar jogo:', err);
                    }
                  }
                );
                
                // Atualizar estatísticas do usuário
                db.run(
                  `UPDATE users SET 
                   games_played = games_played + 1,
                   games_won = games_won + 1,
                   best_clicks = CASE WHEN best_clicks IS NULL OR ? < best_clicks THEN ? ELSE best_clicks END
                   WHERE id = ?`,
                  [newClickNumber, newClickNumber, session.user_id],
                  err => {
                    if (err) {
                      console.error('Erro ao atualizar estatísticas:', err);
                    }
                  }
                );
              }
              
              // Buscar o próximo artigo
              try {
                const nextArticleData = await wikipediaService.getArticleWithLinks(nextArticle);
                
                res.json({
                  currentArticle: nextArticle,
                  targetArticle: session.target_article,
                  content: nextArticleData.content,
                  links: nextArticleData.links,
                  clicks: newClickNumber,
                  completed: gameCompleted
                });
              } catch (error) {
                res.status(500).json({ error: 'Erro ao buscar próximo artigo' });
              }
            }
          );
        } catch (error) {
          res.status(500).json({ error: 'Erro ao validar próximo artigo' });
        }
      }
    );
  } catch (error) {
    console.error('Erro ao navegar para próximo artigo:', error);
    res.status(500).json({ error: 'Não foi possível navegar para o próximo artigo' });
  }
});

/**
 * Obtém estatísticas de um jogo
 * GET /api/games/:sessionToken/stats
 */
router.get('/:sessionToken/stats', authenticateToken, (req, res) => {
  try {
    const { sessionToken } = req.params;
    
    db.get(
      `SELECT gs.*, u.username,
       (SELECT GROUP_CONCAT(article, '|') FROM path_history WHERE session_id = gs.id ORDER BY click_number) as path
       FROM game_sessions gs
       JOIN users u ON gs.user_id = u.id
       WHERE gs.session_token = ?`,
      [sessionToken],
      (err, stats) => {
        if (err || !stats) {
          return res.status(404).json({ error: 'Sessão de jogo não encontrada' });
        }
        
        // Formatar caminho
        const path = stats.path ? stats.path.split('|') : [];
        
        res.json({
          username: stats.username,
          startArticle: stats.start_article,
          targetArticle: stats.target_article,
          completed: Boolean(stats.completed),
          clicks: stats.clicks,
          startTime: stats.start_time,
          lastActivity: stats.last_activity,
          path
        });
      }
    );
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Não foi possível obter estatísticas do jogo' });
  }
});

/**
 * Lista as sessões de jogo por filtros
 * GET /api/games
 * Parâmetros de consulta: challengeId, status
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;
      const { challengeId, status } = req.query;
      
      let sessions = [];
      
      if (challengeId) {
        // Buscar sessões de jogo por ID de desafio
        sessions = await GameSession.findByChallengeId(
          parseInt(challengeId), 
          userId
        );
      } else {
        // Buscar sessões de jogo do usuário (padrão)
        sessions = await GameSession.findByUserId(userId);
      }
      
      // Filtrar por status se fornecido
      if (status && sessions.length) {
        sessions = sessions.filter(session => session.status === status);
      }
      
      res.json({ sessions });
    } catch (error) {
      console.error('Erro ao listar sessões de jogo:', error);
      res.status(500).json({ error: 'Erro ao buscar sessões de jogo' });
    }
  });

module.exports = router;