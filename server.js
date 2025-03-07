// server.js (versão atualizada)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { initializeDatabase } = require('./config/database');
const { scheduleMaintenanceTasks } = require('./utils/maintenance');

// Carregar variáveis de ambiente
dotenv.config();

// Inicializar app Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Segurança
app.use(cors({
  origin: '*',  // Permite todas as origens em desenvolvimento
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
})); // Habilitar CORS
app.use(express.json()); // Parsing de JSON

// Inicializar banco de dados e depois iniciar o servidor
async function startServer() {
  try {
    // Aguardar inicialização completa do banco de dados
    await initializeDatabase();
    
    // Importar rotas
    const authRoutes = require('./routes/auth');
    const gamesRoutes = require('./routes/games');
    const usersRoutes = require('./routes/users');
    const friendsRoutes = require('./routes/friends');
    const challengesRoutes = require('./routes/challenges');
    const matchmakingRoutes = require('./routes/matchmaking');
    const notificationsRoutes = require('./routes/notifications');

    // Registrar rotas
    app.use('/api/auth', authRoutes);
    app.use('/api/games', gamesRoutes);
    app.use('/api/users', usersRoutes);
    app.use('/api/friends', friendsRoutes);
    app.use('/api/challenges', challengesRoutes);
    app.use('/api/matchmaking', matchmakingRoutes);
    app.use('/api/notifications', notificationsRoutes);

    // Rota de status
    app.get('/api/status', (req, res) => {
      res.json({ 
        status: 'online', 
        message: 'Wikipedia Game API is running',
        version: '2.0.0',
        features: [
          'Single player mode',
          'Multiplayer challenges',
          'Friend system',
          'Random matchmaking',
          'Custom article selection'
        ]
      });
    });

    // Agendar tarefas de manutenção
    scheduleMaintenanceTasks();

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Iniciar servidor
startServer();