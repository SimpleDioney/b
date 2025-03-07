const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

// Configuração JWT
const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_jwt';
const TOKEN_EXPIRY = '24h';

/**
 * Registro de usuário
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validar dados de entrada
    if (!username || !email || !password) {
      return res.status(400).json({ 
        error: 'Dados incompletos. Forneça username, email e password.' 
      });
    }
    
    // Verificar se o usuário ou email já existem
    db.get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email],
      async (err, user) => {
        if (err) {
          console.error('Erro ao verificar usuário existente:', err);
          return res.status(500).json({ error: 'Erro ao registrar usuário' });
        }
        
        if (user) {
          return res.status(409).json({ error: 'Usuário ou email já cadastrado' });
        }
        
        // Hash da senha
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Inserir novo usuário
        db.run(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
          [username, email, passwordHash],
          function(err) {
            if (err) {
              console.error('Erro ao criar usuário:', err);
              return res.status(500).json({ error: 'Erro ao registrar usuário' });
            }
            
            // Gerar token JWT
            const token = jwt.sign(
              { id: this.lastID, username },
              JWT_SECRET,
              { expiresIn: TOKEN_EXPIRY }
            );
            
            res.status(201).json({
              message: 'Usuário registrado com sucesso',
              token
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).json({ error: 'Erro interno ao registrar usuário' });
  }
});

/**
 * Login de usuário
 * POST /api/auth/login
 */
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validar dados de entrada
    if (!username || !password) {
      return res.status(400).json({ error: 'Forneça username e password' });
    }
    
    // Buscar usuário
    db.get(
      'SELECT id, username, password_hash FROM users WHERE username = ?',
      [username],
      async (err, user) => {
        if (err) {
          console.error('Erro ao buscar usuário:', err);
          return res.status(500).json({ error: 'Erro ao realizar login' });
        }
        
        if (!user) {
          return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        
        // Verificar senha
        const match = await bcrypt.compare(password, user.password_hash);
        
        if (!match) {
          return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        
        // Gerar token JWT
        const token = jwt.sign(
          { id: user.id, username: user.username },
          JWT_SECRET,
          { expiresIn: TOKEN_EXPIRY }
        );
        
        res.json({
          message: 'Login realizado com sucesso',
          token
        });
      }
    );
  } catch (error) {
    console.error('Erro ao realizar login:', error);
    res.status(500).json({ error: 'Erro interno ao realizar login' });
  }
});

module.exports = router;
