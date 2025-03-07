// config/database.js (versão aprimorada)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Caminho para o banco de dados
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../database/wiki_game.db');

// Garantir que o diretório existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Criar conexão
const db = new sqlite3.Database(dbPath);

// Inicializar banco de dados de forma assíncrona
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    console.log('Initializing database...');
    
    // Habilitar foreign keys
    db.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) {
        console.error('Error enabling foreign keys:', err);
        return reject(err);
      }
      
      // Configurar modo WAL para melhor performance
      db.run('PRAGMA journal_mode = WAL', (err) => {
        if (err) {
          console.error('Error setting WAL mode:', err);
          return reject(err);
        }
        
        // Criar tabelas básicas
        createBasicTables()
          .then(() => createSocialTables())
          .then(() => createGameModeTables())
          .then(() => createIndices())
          .then(() => {
            console.log('Database initialized successfully');
            resolve();
          })
          .catch(err => {
            console.error('Error initializing database:', err);
            reject(err);
          });
      });
    });
  });
}

// Criar tabelas básicas do jogo
function createBasicTables() {
  return new Promise((resolve, reject) => {
    // Tabela de usuários
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        best_time_seconds INTEGER,
        best_clicks INTEGER,
        rank INTEGER DEFAULT 1000,
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) return reject(err);
      
      // Tabela de sessões de jogo
      db.run(`
        CREATE TABLE IF NOT EXISTS game_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          session_token TEXT UNIQUE NOT NULL,
          start_article TEXT NOT NULL,
          target_article TEXT NOT NULL,
          current_article TEXT NOT NULL,
          clicks INTEGER DEFAULT 0,
          start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed BOOLEAN DEFAULT 0,
          challenge_id INTEGER,
          FOREIGN KEY (user_id) REFERENCES users (id),
          FOREIGN KEY (challenge_id) REFERENCES challenges (id)
        )
      `, (err) => {
        if (err) return reject(err);
        
        // Tabela de histórico de caminho
        db.run(`
          CREATE TABLE IF NOT EXISTS path_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            article TEXT NOT NULL,
            click_number INTEGER NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES game_sessions (id)
          )
        `, (err) => {
          if (err) return reject(err);
          
          // Tabela de cache de artigos populares
          db.run(`
            CREATE TABLE IF NOT EXISTS article_cache (
              article_title TEXT PRIMARY KEY,
              content TEXT NOT NULL,
              links TEXT NOT NULL,
              last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              access_count INTEGER DEFAULT 1
            )
          `, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  });
}

// Criar tabelas para funcionalidades sociais
function createSocialTables() {
  return new Promise((resolve, reject) => {
    // Tabela de amizades
    db.run(`
      CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, blocked
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (friend_id) REFERENCES users (id),
        UNIQUE(user_id, friend_id)
      )
    `, (err) => {
      if (err) return reject(err);
      
      // Tabela de notificações
      db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL, -- friend_request, game_invite, game_result, etc.
          content TEXT NOT NULL,
          related_id INTEGER, -- ID relacionado ao tipo (ex: user_id para friend_request)
          read BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `, (err) => {
        if (err) return reject(err);
        
        // Tabela de mensagens
        db.run(`
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users (id),
            FOREIGN KEY (receiver_id) REFERENCES users (id)
          )
        `, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  });
}

// Criar tabelas para modos de jogo
function createGameModeTables() {
  return new Promise((resolve, reject) => {
    // Tabela de desafios (partidas 1x1)
    db.run(`
      CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creator_id INTEGER NOT NULL,
        opponent_id INTEGER,
        start_article TEXT NOT NULL,
        target_article TEXT NOT NULL,
        status TEXT DEFAULT 'pending', -- pending, active, completed, cancelled
        winner_id INTEGER,
        custom_mode BOOLEAN DEFAULT 0, -- Se os artigos foram escolhidos manualmente
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users (id),
        FOREIGN KEY (opponent_id) REFERENCES users (id),
        FOREIGN KEY (winner_id) REFERENCES users (id)
      )
    `, (err) => {
      if (err) return reject(err);
      
      // Tabela de jogadores na fila para matchmaking
      db.run(`
        CREATE TABLE IF NOT EXISTS matchmaking_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          rank INTEGER NOT NULL,
          custom_mode BOOLEAN DEFAULT 0,
          custom_start TEXT,
          custom_target TEXT,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `, (err) => {
        if (err) return reject(err);
        
        // Tabela de conjuntos de artigos populares (para escolha rápida)
        db.run(`
          CREATE TABLE IF NOT EXISTS article_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            difficulty TEXT DEFAULT 'medium', -- easy, medium, hard
            times_played INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_official BOOLEAN DEFAULT 0
          )
        `, (err) => {
          if (err) return reject(err);
          
          // Tabela com os artigos pertencentes a cada conjunto
          db.run(`
            CREATE TABLE IF NOT EXISTS article_set_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              set_id INTEGER NOT NULL,
              start_article TEXT NOT NULL,
              target_article TEXT NOT NULL,
              avg_clicks INTEGER,
              FOREIGN KEY (set_id) REFERENCES article_sets (id)
            )
          `, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  });
}

// Criar índices para otimizar consultas
function createIndices() {
  return new Promise((resolve, reject) => {
    // Índices para tabelas básicas
    db.run('CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions (user_id)', (err) => {
      if (err) return reject(err);
      
      db.run('CREATE INDEX IF NOT EXISTS idx_path_history_session_id ON path_history (session_id)', (err) => {
        if (err) return reject(err);
        
        db.run('CREATE INDEX IF NOT EXISTS idx_article_cache_access_count ON article_cache (access_count DESC)', (err) => {
          if (err) return reject(err);
          
          // Índices para funcionalidades sociais
          db.run('CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships (user_id)', (err) => {
            if (err) return reject(err);
            
            db.run('CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships (friend_id)', (err) => {
              if (err) return reject(err);
              
              db.run('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id)', (err) => {
                if (err) return reject(err);
                
                // Índices para modos de jogo
                db.run('CREATE INDEX IF NOT EXISTS idx_challenges_creator_id ON challenges (creator_id)', (err) => {
                  if (err) return reject(err);
                  
                  db.run('CREATE INDEX IF NOT EXISTS idx_challenges_opponent_id ON challenges (opponent_id)', (err) => {
                    if (err) return reject(err);
                    
                    db.run('CREATE INDEX IF NOT EXISTS idx_matchmaking_rank ON matchmaking_queue (rank)', (err) => {
                      if (err) return reject(err);
                      resolve();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

// Exportar funções e objeto de banco de dados
module.exports = {
  db,
  initializeDatabase
};